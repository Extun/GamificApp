// SPEC-008 — "Restablecer aplicación" (Sistema RESET).
//
// Es la operación más destructiva del sistema: borra casi toda la base de
// datos. Salvaguardas en capas: (1) exige RESET_HABILITADO='true' en el
// entorno — por defecto NO está definida, así que la ruta responde 403 hasta
// que se active a propósito; (2) solo el Administrador Principal
// (verificado contra la BD); (3) segunda confirmación textual ("RESET");
// (4) backup completo antes de borrar; (5) transacción con rollback ante
// cualquier error. Ver docs/specifications/SPEC-008-Sistema-Reset.md.
//
// Deja el sistema como una instalación nueva:
//   · CONSERVA  → institución (config), catálogo de misiones (re-sembrado por
//                 initDb), configuración de IA, estado de los tipos de juego
//                 y el/los Administrador(es) Principal(es).
//   · REINICIA  → estudiantes, docentes, administradores secundarios, cursos,
//                 materias, actividades, biblioteca/materiales, banco de
//                 preguntas, progreso, XP, ranking, retroalimentaciones,
//                 auditoría, misiones-estudiante y cualquier dato de usuario.
//
// El respaldo se puede descargar después con GET /respaldo/:archivo.
//
// Todo ocurre dentro de UNA transacción con backup previo. Se usa DELETE (no
// TRUNCATE: TRUNCATE es DDL y haría commit implícito, rompiendo el rollback).

import { Router } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db.js';
import { soloAdminPrincipal } from '../middleware/auth.js';
import { registrarAuditoria } from '../lib/auditoria.js';

const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR_BACKUPS = path.resolve(__dirname, '..', 'backups');

// Palabra de confirmación que el Principal debe escribir literalmente.
const PALABRA_CONFIRMACION = 'RESET';

// Orden de borrado seguro respecto a claves foráneas: hijos → padres.
// (Con SET FOREIGN_KEY_CHECKS=0 el orden es indiferente, pero lo mantenemos
//  explícito para que el borrado sea legible y auditable.)
const TABLAS_A_VACIAR = [
    'mision_estudiante',
    'progreso_estudiante',
    'retroalimentaciones',
    'materiales',
    'invitaciones_estudiante',
    'docente_materia',
    'docente_curso',
    // Preguntas reutilizables creadas por los docentes (SPEC-010). Es
    // contenido de usuario, no catálogo del sistema: se va con el resto.
    // Va antes que `materias` y `usuarios` porque cuelga de ambas.
    'banco_preguntas',
    'retos',
    'estudiantes',
    'cursos',
    'materias',
    'auditoria'
];

// Tablas que el reset NO toca, por la misma razón que `institucion`: son
// catálogo o configuración del sistema, no datos generados por usuarios.
// Se listan explícitas para que la omisión se lea como decisión y no como
// olvido — que fue justo lo que le pasó a `banco_preguntas`.
const TABLAS_QUE_SE_CONSERVAN = [
    'usuarios',        // solo sobrevive el/los Administrador(es) Principal(es)
    'institucion',     // nombre, logo, colores, escala XP
    'misiones',        // catálogo semilla, lo re-siembra initDb
    'configuracion_ia', // proveedor/modelo elegidos (las claves viven en el entorno)
    'tipos_juego'      // qué tipos de juego están habilitados (SPEC-017)
];

// Todas las tablas se incluyen en el backup previo (también las que se
// conservan: así el respaldo es una foto completa del estado anterior).
const TABLAS_BACKUP = [...TABLAS_A_VACIAR, ...TABLAS_QUE_SE_CONSERVAN];

// Genera un respaldo JSON completo del estado actual y lo guarda en disco.
// Devuelve { archivo, filas } o lanza si no se pudo escribir (aborta el reset).
async function generarBackup(conn) {
    const snapshot = {};
    let totalFilas = 0;
    for (const tabla of TABLAS_BACKUP) {
        const [filas] = await conn.query(`SELECT * FROM \`${tabla}\``);
        snapshot[tabla] = filas;
        totalFilas += filas.length;
    }
    await fs.mkdir(DIR_BACKUPS, { recursive: true });
    const sello = new Date().toISOString().replace(/[:.]/g, '-');
    const archivo = path.join(DIR_BACKUPS, `reset-${sello}.json`);
    await fs.writeFile(archivo, JSON.stringify({ generado_en: new Date().toISOString(), snapshot }, null, 2), 'utf8');
    return { archivo: path.basename(archivo), filas: totalFilas };
}

// POST /api/admin/reset — Restablecer aplicación (solo Administrador Principal).
// Body: { confirmacion: 'RESET' }.
router.post('/', soloAdminPrincipal, async (req, res, next) => {
    // Salvaguarda de entorno: sin esto, la ruta responde 403 aunque exista.
    if (process.env.RESET_HABILITADO !== 'true') {
        return res.status(403).json({
            error: 'La función de restablecimiento está deshabilitada en este entorno.'
        });
    }

    // Confirmación textual (segunda confirmación; la primera es la UI).
    if (String(req.body?.confirmacion || '').trim() !== PALABRA_CONFIRMACION) {
        return res.status(400).json({
            error: `Debes escribir "${PALABRA_CONFIRMACION}" para confirmar.`
        });
    }

    const conn = await pool.getConnection();
    try {
        // 1) Backup ANTES de tocar nada. Si falla, abortamos sin borrar.
        const backup = await generarBackup(conn);

        // 2) Borrado transaccional.
        await conn.beginTransaction();
        await conn.query('SET FOREIGN_KEY_CHECKS = 0');
        const resumen = {};
        for (const tabla of TABLAS_A_VACIAR) {
            const [r] = await conn.query(`DELETE FROM \`${tabla}\``);
            resumen[tabla] = r.affectedRows;
        }
        // Docentes y administradores secundarios: se conservan SOLO los
        // Administradores Principales activos.
        const [rUsuarios] = await conn.query(
            "DELETE FROM usuarios WHERE NOT (rol = 'admin' AND es_principal = 1)"
        );
        resumen.usuarios = rUsuarios.affectedRows;
        await conn.query('SET FOREIGN_KEY_CHECKS = 1');
        await conn.commit();

        // 3) Auditoría del propio reset (fire-and-forget) y respuesta.
        registrarAuditoria({
            usuario: req.user.id,
            rol: 'admin',
            nombre: req.user.username || 'Administrador Principal',
            accion: 'restablecio-aplicacion',
            descripcion: 'Restableció la aplicación a una instalación nueva',
            detalle: { backup: backup.archivo, resumen }
        });
        res.json({ ok: true, backup, resumen });
    } catch (err) {
        await conn.rollback().catch(() => {});
        await conn.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
        next(err);
    } finally {
        conn.release();
    }
});

// GET /api/admin/reset/respaldo/:archivo — descarga el JSON del respaldo.
//
// Sin esto el respaldo era una promesa a medias en producción: se escribe en
// `server/backups/`, que en Render es disco efímero (se borra en el siguiente
// deploy), y la respuesta del reset solo devolvía el NOMBRE del archivo. Es
// decir: había red de seguridad para abortar, pero no para arrepentirse.
//
// NO exige `RESET_HABILITADO`: el archivo solo existe si un reset ya corrió
// (que sí la exigió), y apagar la bandera justo después no debe dejar el
// respaldo inaccesible — que es exactamente cuando más falta hace.
router.get('/respaldo/:archivo', soloAdminPrincipal, async (req, res, next) => {
    // Solo nombres que genera esta misma ruta. Es la defensa contra travesía
    // de directorios: sin barras ni puntos suspensivos no hay forma de salir
    // de DIR_BACKUPS, y aun así se comprueba la ruta resuelta más abajo.
    if (!/^reset-[\w-]+\.json$/.test(req.params.archivo)) {
        return res.status(400).json({ error: 'Nombre de respaldo no válido.' });
    }
    const ruta = path.resolve(DIR_BACKUPS, req.params.archivo);
    if (path.dirname(ruta) !== DIR_BACKUPS) {
        return res.status(400).json({ error: 'Nombre de respaldo no válido.' });
    }
    try {
        const contenido = await fs.readFile(ruta, 'utf8');
        res.type('application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${req.params.archivo}"`);
        res.send(contenido);
    } catch (err) {
        if (err.code === 'ENOENT') {
            return res.status(404).json({
                error: 'Ese respaldo ya no está en el servidor. En Render el disco se borra en cada despliegue.'
            });
        }
        next(err);
    }
});

export default router;
