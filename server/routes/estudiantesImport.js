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
import { esDelAulaDocente } from '../lib/estudiantes.js';
import {
    validarImportacion, claveEstudiante, claveComparable,
    normalizar, pinDesdeFechaISO, usernameDisponible, validarNombrePropio,
    parsearFecha, edadEnAnios, EDAD_MINIMA, EDAD_MAXIMA
} from '../lib/importacionEstudiantes.js';

// ---- Alta de UN estudiante pendiente (lógica común) ----
// ÚNICO lugar donde nace un estudiante creado por el docente: lo usan la
// importación Excel (en bucle, dentro de su transacción) y el alta manual
// (una sola vez). Crea ficha + cuenta con username interno desambiguado,
// nombre_norm, PIN inicial = fecha de nacimiento, código de emergencia y
// código de activación (solo su hash; el valor en claro se devuelve para
// mostrarlo UNA vez). No hace commit ni auditoría: eso es de quien llama.
//
// `ocupados` es el Set de usernames ya tomados en forma comparable; el
// helper añade el que asigna, para que el bucle de importación no colisione
// consigo mismo.
const crearEstudiantePendiente = async (conn, datos) => {
    const { nombres, apellidos, fechaISO, curso, cursoId, registradoPor, ocupados } = datos;
    const nombreVisible = `${nombres} ${apellidos}`;
    const nombreNorm = normalizar(nombreVisible);

    const username = usernameDisponible(nombreNorm, ocupados);
    ocupados.add(claveComparable(username));

    const [ficha] = await conn.query(
        `INSERT INTO estudiantes (nombres, apellidos, curso, curso_id, fecha_nacimiento, registrado_por)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [nombres, apellidos, curso, cursoId, fechaISO, registradoPor]
    );

    const pinInicial = pinDesdeFechaISO(fechaISO);
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

    return {
        usuario_id: cuenta.insertId,
        estudiante_id: ficha.insertId,
        nombre: nombreVisible,
        curso,
        codigo_activacion: codigoActivacion,   // en claro SOLO aquí
        pin_inicial: pinInicial,
        codigo_emergencia: codigoEmergencia
    };
};

// Usernames ya tomados (cualquier rol, incluida la papelera: el UNIQUE
// físico no distingue), en forma comparable como la BD.
const cargarUsernamesOcupados = async () => {
    const [cuentas] = await pool.query('SELECT username FROM usuarios');
    return new Set(cuentas.map((c) => claveComparable(c.username)));
};

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

        const ocupados = await cargarUsernamesOcupados();

        await conn.beginTransaction();
        const creados = [];
        for (const filaOk of filasValidas) {
            const creado = await crearEstudiantePendiente(conn, {
                nombres: filaOk.nombres,
                apellidos: filaOk.apellidos,
                fechaISO: filaOk.fecha_nacimiento,
                curso: req.cursoImportacion.etiqueta,
                cursoId: req.cursoImportacion.id,
                registradoPor: req.user.id,
                ocupados
            });
            creados.push({ ...creado, fila: filaOk.fila });
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

// ---- POST /api/estudiantes ----
// Alta MANUAL de un estudiante: es la versión de una sola fila de la
// importación. Mismos permisos (puedeImportarCurso), mismo validador
// (validarImportacion con una fila) y el mismo helper de creación, así que
// termina exactamente en el mismo estado: pendiente + código individual.
router.post('/', puedeImportarCurso, async (req, res, next) => {
    const conn = await pool.getConnection();
    try {
        const contexto = await cargarContexto(req.cursoImportacion.id);
        const informe = validarImportacion([{
            fila: 1,
            nombres: req.body?.nombres,
            apellidos: req.body?.apellidos,
            fecha_nacimiento: req.body?.fecha_nacimiento
        }], contexto);
        const fila = informe.resultados[0];
        if (informe.errorGeneral || !fila) {
            conn.release();
            return res.status(400).json({ error: informe.errorGeneral || 'Faltan datos del estudiante' });
        }
        if (fila.estado === 'omitido') {
            conn.release();
            return res.status(409).json({ error: 'Ya hay un estudiante con ese nombre en este curso.' });
        }
        if (fila.estado !== 'valido') {
            conn.release();
            return res.status(400).json({ error: fila.motivo });
        }

        const ocupados = await cargarUsernamesOcupados();
        await conn.beginTransaction();
        const creado = await crearEstudiantePendiente(conn, {
            nombres: fila.nombres,
            apellidos: fila.apellidos,
            fechaISO: fila.fecha_nacimiento,
            curso: req.cursoImportacion.etiqueta,
            cursoId: req.cursoImportacion.id,
            registradoPor: req.user.id,
            ocupados
        });
        await conn.commit();

        registrarAuditoria({
            usuario: req.user, accion: 'creo-estudiante',
            descripcion: `Registró a "${creado.nombre}" en ${req.cursoImportacion.etiqueta}`,
            detalle: { estudiante: creado.nombre, curso: req.cursoImportacion.etiqueta }
        });
        res.status(201).json({
            ...creado,
            aviso: 'Guarda o entrégale este código ahora: no se puede volver a ver, solo regenerar.'
        });
    } catch (err) {
        await conn.rollback().catch(() => {});
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Ya hay un estudiante con ese nombre en este curso.' });
        }
        next(err);
    } finally {
        conn.release();
    }
});

// ---- Propiedad de UN estudiante (regenerar código, editar ficha) ----
// Admin: permiso 'estudiantes' verificado contra la BD (no contra el token)
// para que quitarlo surta efecto inmediato. Docente: el estudiante es suyo
// si el curso está asignado (docente_curso) O se registró con una invitación
// suya — el mismo criterio doble de GET /api/docente/mis-estudiantes.
// Devuelve { cuenta } o { status, error }.
const puedeGestionarEstudiante = async (req, usuarioId) => {
    if (!usuarioId) return { status: 400, error: 'Estudiante inválido' };

    const [[cuenta]] = await pool.query(
        `SELECT u.id, u.nombre_completo, e.id AS estudiante_id, e.curso_id,
                e.nombres, e.apellidos, e.fecha_nacimiento,
                (u.codigo_acceso_hash IS NOT NULL AND u.codigo_acceso_usado_en IS NULL) AS pendiente
         FROM usuarios u
         JOIN estudiantes e ON e.id = u.estudiante_id
         WHERE u.id = ? AND u.rol = 'estudiante' AND u.eliminado_en IS NULL`,
        [usuarioId]
    );
    if (!cuenta) return { status: 404, error: 'Estudiante no encontrado' };

    if (req.user?.rol === 'docente') {
        if (!(await esDelAulaDocente(req.user.id, cuenta.estudiante_id))) {
            return { status: 403, error: 'Ese estudiante no pertenece a tus cursos' };
        }
        return { cuenta };
    }
    if (req.user?.rol !== 'admin') {
        return { status: 403, error: 'Solo un administrador o docente puede gestionar estudiantes' };
    }
    const [[admin]] = await pool.query(
        'SELECT es_principal, activo, permisos FROM usuarios WHERE id = ? AND eliminado_en IS NULL',
        [req.user.id]
    );
    if (!admin?.activo || !permisosEfectivos(admin).includes('estudiantes')) {
        return { status: 403, error: 'No tienes permiso para esta sección. Pídeselo al Administrador Principal.' };
    }
    return { cuenta };
};

// ---- POST /api/estudiantes/:usuarioId/regenerar-codigo ----
// Código nuevo de activación (invalida el anterior en el acto y devuelve el
// estudiante al estado "pendiente" SIN tocar PIN, XP ni progreso). Admin con
// permiso 'estudiantes'; docente solo sobre SUS estudiantes.
router.post('/:usuarioId/regenerar-codigo', async (req, res, next) => {
    try {
        const usuarioId = Number(req.params.usuarioId);
        const { cuenta, status, error } = await puedeGestionarEstudiante(req, usuarioId);
        if (!cuenta) return res.status(status).json({ error });

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

// ---- PUT /api/estudiantes/:usuarioId ----
// Edita nombres/apellidos y (opcional) la fecha de nacimiento. El login
// localiza por nombre_norm, así que el nombre nuevo funciona al instante con
// el PIN actual y el anterior deja de localizar la cuenta. El username
// interno (único, con posible sufijo ~N invisible) NO se toca; el código de
// activación, XP y progreso tampoco.
//
// Fecha de nacimiento (regla aprobada):
// - PENDIENTE  → se recalcula el PIN inicial con la fecha nueva (nadie lo
//   usó aún); el código de activación sigue siendo el mismo. Se avisa que
//   el PIN de las credenciales descargadas ya no vale.
// - ACTIVADO   → su PIN actual NO cambia; un reseteo futuro usará la fecha
//   corregida (resetearPinADefault lee la fecha de la ficha).
router.put('/:usuarioId', async (req, res, next) => {
    try {
        const usuarioId = Number(req.params.usuarioId);
        const { cuenta, status, error } = await puedeGestionarEstudiante(req, usuarioId);
        if (!cuenta) return res.status(status).json({ error });

        const nom = validarNombrePropio(req.body?.nombres, 'Nombres');
        if (nom.error) return res.status(400).json({ error: nom.error });
        const ape = validarNombrePropio(req.body?.apellidos, 'Apellidos');
        if (ape.error) return res.status(400).json({ error: ape.error });

        const fechaActualISO = cuenta.fecha_nacimiento instanceof Date
            ? cuenta.fecha_nacimiento.toISOString().slice(0, 10)
            : String(cuenta.fecha_nacimiento || '').slice(0, 10);

        // Fecha: opcional (compatibilidad); si viene, mismas reglas que la
        // importación (formato real + edad 4–15).
        let fechaISO = fechaActualISO;
        if (req.body?.fecha_nacimiento !== undefined && req.body.fecha_nacimiento !== '') {
            const parseada = parsearFecha(req.body.fecha_nacimiento);
            if (!parseada) {
                return res.status(400).json({ error: 'Fecha de nacimiento inválida (usa AAAA-MM-DD)' });
            }
            const edad = edadEnAnios(parseada);
            if (edad < EDAD_MINIMA || edad > EDAD_MAXIMA) {
                return res.status(400).json({ error: `La fecha da una edad de ${edad} años (se esperan ${EDAD_MINIMA}–${EDAD_MAXIMA})` });
            }
            fechaISO = parseada;
        }
        const fechaCambia = fechaISO !== fechaActualISO;
        const esPendiente = Boolean(cuenta.pendiente);

        const nombreVisible = `${nom.texto} ${ape.texto}`;
        const nombreNorm = normalizar(nombreVisible);
        const nombreAnterior = cuenta.nombre_completo;
        const nombreCambia = !(nombreVisible === nombreAnterior
            && nom.texto === cuenta.nombres && ape.texto === cuenta.apellidos);
        if (!nombreCambia && !fechaCambia) {
            return res.json({ ok: true, mensaje: 'Sin cambios: los datos son los mismos.' });
        }

        // Regla anti-homónimos de SPEC-014: mismo nombre + misma fecha de
        // nacimiento que OTRO estudiante vivo = PINs iniciales idénticos y
        // login ambiguo. Se comprueba con los datos NUEVOS.
        // (nombre_norm compara case/accent-insensitive por la collation.)
        const [choque] = await pool.query(
            `SELECT u.id FROM usuarios u
             JOIN estudiantes e ON e.id = u.estudiante_id
             WHERE u.rol = 'estudiante' AND u.eliminado_en IS NULL AND u.id != ?
               AND (u.nombre_norm = ? OR (u.nombre_norm IS NULL AND u.username = ?))
               AND DATE(e.fecha_nacimiento) = ?`,
            [usuarioId, nombreNorm, nombreNorm, fechaISO]
        );
        if (choque.length) {
            return res.status(409).json({ error: 'Hay otro estudiante con el mismo nombre y fecha de nacimiento. Agrega el segundo nombre o apellido para diferenciarlos.' });
        }

        // Fecha corregida en un PENDIENTE: el PIN inicial se re-deriva (el
        // que llevaban las credenciales descargadas queda obsoleto).
        const pinNuevo = fechaCambia && esPendiente ? pinDesdeFechaISO(fechaISO) : null;

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query(
                'UPDATE estudiantes SET nombres = ?, apellidos = ?, fecha_nacimiento = ? WHERE id = ?',
                [nom.texto, ape.texto, fechaISO, cuenta.estudiante_id]
            );
            await conn.query(
                `UPDATE usuarios SET nombre_completo = ?, nombre_norm = ?
                    ${pinNuevo ? ', pin_hash = ?' : ''}
                 WHERE id = ?`,
                pinNuevo
                    ? [nombreVisible, nombreNorm, bcrypt.hashSync(pinNuevo, 10), usuarioId]
                    : [nombreVisible, nombreNorm, usuarioId]
            );
            await conn.commit();
        } catch (err) {
            await conn.rollback().catch(() => {});
            // Índice único (curso_id, nombres, apellidos): ya hay un
            // estudiante con ese nombre exacto en el mismo curso.
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ error: 'Ya existe un estudiante con ese nombre en el mismo curso.' });
            }
            // Migración 012 aún no aplicada (columna nombre_norm ausente).
            if (err.code === 'ER_BAD_FIELD_ERROR') {
                return res.status(409).json({ error: 'La base de datos aún no está actualizada para editar estudiantes. Intenta después del próximo despliegue.' });
            }
            throw err;
        } finally {
            conn.release();
        }

        registrarAuditoria({
            usuario: req.user, accion: 'edito-estudiante',
            descripcion: nombreCambia
                ? `Corrigió los datos de "${nombreAnterior}"${nombreVisible !== nombreAnterior ? ` (ahora "${nombreVisible}")` : ''}`
                : `Corrigió la fecha de nacimiento de "${nombreAnterior}"`,
            detalle: {
                antes: nombreAnterior, despues: nombreVisible,
                fecha_corregida: fechaCambia || undefined
            }
        });

        const partes = [];
        if (nombreCambia) partes.push(`Ahora inicia sesión como "${nombreVisible}".`);
        if (fechaCambia && pinNuevo) {
            partes.push(`Su PIN inicial cambió a ${pinNuevo} (fecha nueva). Si descargaste sus credenciales, el PIN de ese archivo ya no vale; su código de activación sigue siendo el mismo.`);
        } else if (fechaCambia) {
            partes.push('Su PIN actual no cambia; si algún día se lo restableces, usará la fecha corregida.');
        } else {
            partes.push('Su PIN de siempre sigue igual.');
        }
        res.json({
            ok: true,
            nombre_completo: nombreVisible,
            pin_inicial: pinNuevo || undefined,
            mensaje: `Datos actualizados. ${partes.join(' ')}`
        });
    } catch (err) {
        next(err);
    }
});

export default router;
