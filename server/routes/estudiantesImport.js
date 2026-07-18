// SPEC-014 — Carga masiva de estudiantes por Excel.
//
//   POST /api/estudiantes/importar/analizar   → valida, NO escribe nada
//   POST /api/estudiantes/importar/confirmar  → crea en UNA transacción
//   POST /api/estudiantes/:usuarioId/regenerar-codigo
//
// Permisos: admin con permiso 'estudiantes'; docente solo sobre SUS cursos
// (docente_curso). El Excel se parsea en el navegador (SheetJS) y aquí llega
// como JSON, pero TODO se revalida en el servidor con el mismo validador
// puro (lib/importacionEstudiantes.js) en analizar y en confirmar.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db.js';
import { conPermiso, permisosEfectivos } from '../middleware/auth.js';
import { generarCodigo } from './auth.js';
import { registrarAuditoria } from '../lib/auditoria.js';
import {
    validarImportacion, claveEstudiante, claveComparable,
    normalizar, pinDesdeFechaISO, usernameDisponible
} from '../lib/importacionEstudiantes.js';

const router = Router();
const permisoEstudiantesAdmin = conPermiso('estudiantes');

// ---- Permiso de importación sobre un curso ----
// Admin: su permiso 'estudiantes' de siempre. Docente: el curso debe estar
// asignado a su cuenta (mismo criterio que las invitaciones, SPEC-009).
// Deja el curso verificado en req.cursoImportacion { id, etiqueta }.
const puedeImportarCurso = async (req, res, next) => {
    const cursoId = Number(req.body?.curso_id);
    if (!cursoId) return res.status(400).json({ error: 'Elige el curso de la lista' });
    try {
        const [[curso]] = await pool.query(
            `SELECT c.id, CONCAT(c.nombre, ' ', c.paralelo) AS etiqueta
             FROM cursos c
             WHERE c.id = ? AND c.activo = TRUE AND c.eliminado_en IS NULL`,
            [cursoId]
        );
        if (!curso) return res.status(404).json({ error: 'Ese curso no existe o no está activo' });
        req.cursoImportacion = curso;

        if (req.user?.rol === 'docente') {
            const [asignado] = await pool.query(
                'SELECT 1 FROM docente_curso WHERE docente_id = ? AND curso_id = ?',
                [req.user.id, cursoId]
            );
            if (!asignado.length) {
                return res.status(403).json({ error: 'Ese curso no está asignado a tu cuenta. Pídele al administrador que te lo asigne.' });
            }
            return next();
        }
        // Cualquier otro rol pasa por el permiso de admin (rechaza estudiantes).
        return permisoEstudiantesAdmin(req, res, next);
    } catch (err) {
        next(err);
    }
};

// ---- Contexto real de BD para el validador puro ----
// existentesEnCurso: estudiantes vivos de ESTE curso (clave nombres|apellidos).
// fechasPorHomonimo: nombre completo comparable → fechas de nacimiento de
// TODOS los estudiantes vivos (choque nombre+fecha = PIN inicial idéntico).
const cargarContexto = async (cursoId) => {
    const [filas] = await pool.query(
        `SELECT e.nombres, e.apellidos, e.curso_id, e.fecha_nacimiento
         FROM estudiantes e
         JOIN usuarios u ON u.estudiante_id = e.id AND u.rol = 'estudiante'
         WHERE u.eliminado_en IS NULL`
    );
    const existentesEnCurso = new Set();
    const fechasPorHomonimo = new Map();
    for (const f of filas) {
        if (f.curso_id === cursoId) {
            existentesEnCurso.add(claveEstudiante(f.nombres, f.apellidos));
        }
        if (f.fecha_nacimiento) {
            const iso = f.fecha_nacimiento instanceof Date
                ? f.fecha_nacimiento.toISOString().slice(0, 10)
                : String(f.fecha_nacimiento).slice(0, 10);
            const nombre = claveComparable(`${f.nombres} ${f.apellidos}`);
            if (!fechasPorHomonimo.has(nombre)) fechasPorHomonimo.set(nombre, new Set());
            fechasPorHomonimo.get(nombre).add(iso);
        }
    }
    return { existentesEnCurso, fechasPorHomonimo };
};

// Filas tal como las manda el frontend: [{ fila, nombres, apellidos,
// fecha_nacimiento }]. Se acota el tamaño del body por si acaso.
const filasDelBody = (req) => (Array.isArray(req.body?.filas) ? req.body.filas.slice(0, 500) : []);

// ---- POST /api/estudiantes/importar/analizar ----
router.post('/importar/analizar', puedeImportarCurso, async (req, res, next) => {
    try {
        const contexto = await cargarContexto(req.cursoImportacion.id);
        const informe = validarImportacion(filasDelBody(req), contexto);
        if (informe.errorGeneral) return res.status(400).json({ error: informe.errorGeneral });
        res.json({
            curso: req.cursoImportacion.etiqueta,
            total: informe.resultados.length,
            validos: informe.validos,
            errores: informe.errores,
            omitidos: informe.omitidos,
            resultados: informe.resultados
        });
    } catch (err) {
        next(err);
    }
});

// ---- POST /api/estudiantes/importar/confirmar ----
// Revalida TODO contra la BD (nunca confía en el análisis del cliente) y crea
// solo las filas válidas en UNA transacción: cualquier fallo = rollback total.
// La respuesta incluye los códigos EN CLARO una única vez.
router.post('/importar/confirmar', puedeImportarCurso, async (req, res, next) => {
    const conn = await pool.getConnection();
    try {
        const contexto = await cargarContexto(req.cursoImportacion.id);
        const informe = validarImportacion(filasDelBody(req), contexto);
        if (informe.errorGeneral) {
            conn.release();
            return res.status(400).json({ error: informe.errorGeneral });
        }
        const filasValidas = informe.resultados.filter((r) => r.estado === 'valido');
        if (!filasValidas.length) {
            conn.release();
            return res.status(400).json({ error: 'Ninguna fila es válida para importar' });
        }

        // Usernames ya ocupados (cualquier rol, incluida la papelera: el
        // UNIQUE físico no distingue), en forma comparable como la BD.
        const [cuentas] = await pool.query('SELECT username FROM usuarios');
        const ocupados = new Set(cuentas.map((c) => claveComparable(c.username)));

        await conn.beginTransaction();
        const creados = [];
        for (const filaOk of filasValidas) {
            const nombreVisible = `${filaOk.nombres} ${filaOk.apellidos}`;
            const nombreNorm = normalizar(nombreVisible);

            // Username interno único; el sufijo ~N es invisible para el niño.
            const username = usernameDisponible(nombreNorm, ocupados);
            ocupados.add(claveComparable(username));

            const [ficha] = await conn.query(
                `INSERT INTO estudiantes (nombres, apellidos, curso, curso_id, fecha_nacimiento, registrado_por)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [filaOk.nombres, filaOk.apellidos, req.cursoImportacion.etiqueta,
                 req.cursoImportacion.id, filaOk.fecha_nacimiento, req.user.id]
            );

            const pinInicial = pinDesdeFechaISO(filaOk.fecha_nacimiento);
            const codigoActivacion = generarCodigo(6);
            const codigoEmergencia = generarCodigo(8);
            const [cuenta] = await conn.query(
                `INSERT INTO usuarios (username, nombre_completo, nombre_norm, password_hash,
                    pin_hash, codigo_emergencia, codigo_acceso_hash, codigo_acceso_pista,
                    rol, estudiante_id)
                 VALUES (?, ?, ?, '', ?, ?, ?, ?, 'estudiante', ?)`,
                [username, nombreVisible, nombreNorm, bcrypt.hashSync(pinInicial, 10),
                 codigoEmergencia, bcrypt.hashSync(codigoActivacion, 10),
                 codigoActivacion.slice(0, 3), ficha.insertId]
            );

            creados.push({
                usuario_id: cuenta.insertId,
                estudiante_id: ficha.insertId,
                fila: filaOk.fila,
                nombre: nombreVisible,
                curso: req.cursoImportacion.etiqueta,
                codigo_activacion: codigoActivacion,   // en claro SOLO aquí
                pin_inicial: pinInicial,
                codigo_emergencia: codigoEmergencia
            });
        }
        await conn.commit();

        registrarAuditoria({
            usuario: req.user, accion: 'importo-estudiantes',
            descripcion: `Importó ${creados.length} estudiante${creados.length === 1 ? '' : 's'} a ${req.cursoImportacion.etiqueta} desde Excel`,
            detalle: {
                curso: req.cursoImportacion.etiqueta,
                total: informe.resultados.length,
                creados: creados.length,
                omitidos: informe.omitidos,
                errores: informe.errores
            }
        });
        res.status(201).json({
            curso: req.cursoImportacion.etiqueta,
            creados,
            omitidos: informe.omitidos,
            errores: informe.errores,
            resultados: informe.resultados,
            aviso: 'Guarda o descarga estos códigos ahora: no se pueden volver a ver, solo regenerar.'
        });
    } catch (err) {
        await conn.rollback().catch(() => {});
        // Choque con el índice único (p. ej. dos importaciones simultáneas
        // del mismo archivo): mensaje claro en vez de error 500 genérico.
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Alguien importó estos estudiantes al mismo tiempo. Refresca y vuelve a intentarlo.' });
        }
        next(err);
    } finally {
        conn.release();
    }
});

// ---- POST /api/estudiantes/:usuarioId/regenerar-codigo ----
// Código nuevo de activación (invalida el anterior en el acto y devuelve el
// estudiante al estado "pendiente" SIN tocar PIN, XP ni progreso). Admin con
// permiso 'estudiantes'; docente solo sobre estudiantes de sus cursos.
router.post('/:usuarioId/regenerar-codigo', async (req, res, next) => {
    try {
        const usuarioId = Number(req.params.usuarioId);
        if (!usuarioId) return res.status(400).json({ error: 'Estudiante inválido' });

        const [[cuenta]] = await pool.query(
            `SELECT u.id, u.nombre_completo, e.curso_id
             FROM usuarios u
             JOIN estudiantes e ON e.id = u.estudiante_id
             WHERE u.id = ? AND u.rol = 'estudiante' AND u.eliminado_en IS NULL`,
            [usuarioId]
        );
        if (!cuenta) return res.status(404).json({ error: 'Estudiante no encontrado' });

        if (req.user?.rol === 'docente') {
            const [asignado] = await pool.query(
                'SELECT 1 FROM docente_curso WHERE docente_id = ? AND curso_id = ?',
                [req.user.id, cuenta.curso_id ?? 0]
            );
            if (!asignado.length) {
                return res.status(403).json({ error: 'Ese estudiante no pertenece a tus cursos' });
            }
        } else {
            // Mismo criterio que conPermiso('estudiantes'), verificado contra
            // la BD (no contra el token) para que quitar el permiso surta
            // efecto inmediato.
            if (req.user?.rol !== 'admin') {
                return res.status(403).json({ error: 'Solo un administrador o docente puede regenerar códigos' });
            }
            const [[admin]] = await pool.query(
                'SELECT es_principal, activo, permisos FROM usuarios WHERE id = ? AND eliminado_en IS NULL',
                [req.user.id]
            );
            if (!admin?.activo || !permisosEfectivos(admin).includes('estudiantes')) {
                return res.status(403).json({ error: 'No tienes permiso para esta sección. Pídeselo al Administrador Principal.' });
            }
        }

        const codigo = generarCodigo(6);
        await pool.query(
            `UPDATE usuarios SET codigo_acceso_hash = ?, codigo_acceso_pista = ?,
                codigo_acceso_usado_en = NULL
             WHERE id = ?`,
            [bcrypt.hashSync(codigo, 10), codigo.slice(0, 3), usuarioId]
        );
        registrarAuditoria({
            usuario: req.user, accion: 'regenero-codigo',
            descripcion: `Regeneró el código de activación de "${cuenta.nombre_completo}"`,
            detalle: { estudiante: cuenta.nombre_completo }
        });
        res.json({
            ok: true,
            codigo,                                    // en claro SOLO aquí
            pista: codigo.slice(0, 3),
            mensaje: 'Código nuevo generado. El anterior quedó invalidado; entrégaselo al estudiante.'
        });
    } catch (err) {
        next(err);
    }
});

export default router;
