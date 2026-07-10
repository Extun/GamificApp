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
//                 initDb) y el/los Administrador(es) Principal(es).
//   · REINICIA  → estudiantes, docentes, administradores secundarios, cursos,
//                 materias, actividades, biblioteca/materiales, progreso, XP,
//                 ranking, retroalimentaciones, auditoría, misiones-estudiante
//                 y cualquier dato generado por usuarios.
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
    'retos',
    'estudiantes',
    'cursos',
    'materias',
    'auditoria'
];

// Todas las tablas se incluyen en el backup previo (también las que se
// conservan: así el respaldo es una foto completa del estado anterior).
const TABLAS_BACKUP = [
    ...TABLAS_A_VACIAR, 'usuarios', 'institucion', 'misiones'
];

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

export default router;
