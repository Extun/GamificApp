// Gestión de misiones para el administrador (SPEC-007, Fase 2).
// El catálogo de misiones es contenido académico: se protege con el mismo
// permiso que las materias (`conPermiso('materias')`), sin migrar el modelo de
// permisos. Todo cambio queda en Auditoría.
import { Router } from 'express';
import pool from '../db.js';
import { conPermiso } from '../middleware/auth.js';
import { registrarAuditoria } from '../lib/auditoria.js';
import { TIPOS_OBJETIVO } from '../lib/misiones.js';

const router = Router();

const CATEGORIAS = ['aprendizaje', 'competencia', 'constancia', 'colaboracion', 'precision', 'exploracion', 'especiales', 'ia'];
const TIERS = ['bronce', 'plata', 'oro', 'platino', 'diamante'];
const HORIZONTES = ['corto', 'mediano', 'largo'];

const esIdValido = (n) => Number.isInteger(n) && n > 0;
const texto = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const auditar = (req, accion, descripcion, detalle) =>
    registrarAuditoria({ usuario: req.user, accion, descripcion, detalle });

// GET /api/admin/misiones — catálogo completo con cuántos estudiantes la han
// completado (para el módulo de gestión).
router.get('/', conPermiso('materias'), async (_req, res, next) => {
    try {
        const [misiones] = await pool.query(
            `SELECT m.id, m.clave, m.categoria, m.tier, m.titulo, m.descripcion, m.icono,
                    m.tipo_objetivo, m.objetivo_meta, m.objetivo_filtro, m.requiere_mision_id,
                    m.recompensa_xp, m.recompensa_insignia, m.recompensa_banner,
                    m.horizonte, m.orden, m.activa,
                    req.titulo AS requiere_titulo,
                    (SELECT COUNT(*) FROM mision_estudiante me
                     WHERE me.mision_id = m.id AND me.completada = TRUE) AS completada_por
             FROM misiones m
             LEFT JOIN misiones req ON req.id = m.requiere_mision_id
             ORDER BY m.categoria, m.orden`
        );
        res.json({ misiones, tipos_objetivo: TIPOS_OBJETIVO, categorias: CATEGORIAS, tiers: TIERS, horizontes: HORIZONTES });
    } catch (err) {
        if (err.code === 'ER_NO_SUCH_TABLE') return res.json({ misiones: [], tipos_objetivo: TIPOS_OBJETIVO, categorias: CATEGORIAS, tiers: TIERS, horizontes: HORIZONTES });
        next(err);
    }
});

// Valida y normaliza el cuerpo de una misión. Devuelve { error } o { datos }.
const validar = (body, { requiereClave = true } = {}) => {
    const clave = texto(body?.clave, 60);
    const titulo = texto(body?.titulo, 120);
    const descripcion = texto(body?.descripcion, 255);
    const categoria = texto(body?.categoria, 20);
    const tier = texto(body?.tier, 10);
    const tipo = texto(body?.tipo_objetivo, 40);
    const horizonte = texto(body?.horizonte, 10) || 'corto';
    const meta = Number(body?.objetivo_meta);

    if (requiereClave && !/^[a-z0-9-]{3,60}$/.test(clave)) {
        return { error: 'La clave debe ser un slug (minúsculas, números y guiones), 3–60 caracteres' };
    }
    if (!titulo) return { error: 'El título es obligatorio' };
    if (!descripcion) return { error: 'La descripción es obligatoria' };
    if (!CATEGORIAS.includes(categoria)) return { error: 'Categoría inválida' };
    if (!TIERS.includes(tier)) return { error: 'Tier inválido' };
    if (!TIPOS_OBJETIVO.includes(tipo)) return { error: `Tipo de objetivo inválido. Válidos: ${TIPOS_OBJETIVO.join(', ')}` };
    if (!HORIZONTES.includes(horizonte)) return { error: 'Horizonte inválido' };
    if (!Number.isInteger(meta) || meta < 1) return { error: 'La meta debe ser un entero ≥ 1' };

    let filtro = null;
    if (body?.objetivo_filtro !== undefined && body.objetivo_filtro !== null && body.objetivo_filtro !== '') {
        try {
            filtro = typeof body.objetivo_filtro === 'string' ? JSON.parse(body.objetivo_filtro) : body.objetivo_filtro;
            if (typeof filtro !== 'object' || Array.isArray(filtro)) throw new Error();
        } catch {
            return { error: 'El filtro debe ser un objeto JSON válido (o vacío)' };
        }
    }

    return {
        datos: {
            clave, titulo, descripcion, categoria, tier, tipo_objetivo: tipo, horizonte,
            objetivo_meta: meta,
            objetivo_filtro: filtro ? JSON.stringify(filtro) : null,
            icono: texto(body?.icono, 16) || null,
            recompensa_xp: Math.max(0, Number(body?.recompensa_xp) || 0),
            recompensa_insignia: texto(body?.recompensa_insignia, 60) || null,
            recompensa_banner: texto(body?.recompensa_banner, 60) || null,
            requiere_mision_id: esIdValido(Number(body?.requiere_mision_id)) ? Number(body.requiere_mision_id) : null,
            orden: Number.isInteger(Number(body?.orden)) ? Number(body.orden) : 0,
            activa: body?.activa === undefined ? true : Boolean(body.activa)
        }
    };
};

// POST /api/admin/misiones — crear una misión (la arquitectura ya lo permite:
// es un INSERT validado contra el registro de tipos de objetivo).
router.post('/', conPermiso('materias'), async (req, res, next) => {
    const { error, datos } = validar(req.body);
    if (error) return res.status(400).json({ error });
    try {
        const [r] = await pool.query(
            `INSERT INTO misiones
                (clave, categoria, tier, titulo, descripcion, icono, tipo_objetivo,
                 objetivo_meta, objetivo_filtro, requiere_mision_id, recompensa_xp,
                 recompensa_insignia, recompensa_banner, horizonte, orden, activa)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [datos.clave, datos.categoria, datos.tier, datos.titulo, datos.descripcion,
             datos.icono, datos.tipo_objetivo, datos.objetivo_meta, datos.objetivo_filtro,
             datos.requiere_mision_id, datos.recompensa_xp, datos.recompensa_insignia,
             datos.recompensa_banner, datos.horizonte, datos.orden, datos.activa]
        );
        auditar(req, 'creo-mision', `Creó la misión "${datos.titulo}"`, { clave: datos.clave });
        res.status(201).json({ id: r.insertId });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ya existe una misión con esa clave' });
        next(err);
    }
});

// PUT /api/admin/misiones/:id — editar recompensas, umbral, textos, etc.
router.put('/:id', conPermiso('materias'), async (req, res, next) => {
    const id = Number(req.params.id);
    if (!esIdValido(id)) return res.status(400).json({ error: 'id inválido' });
    // La clave no se edita (es la identidad estable del seed): se conserva.
    const { error, datos } = validar(req.body, { requiereClave: false });
    if (error) return res.status(400).json({ error });
    try {
        // Evita ciclos triviales de desbloqueo (una misión no se requiere a sí misma).
        if (datos.requiere_mision_id === id) datos.requiere_mision_id = null;
        const [r] = await pool.query(
            `UPDATE misiones SET
                categoria = ?, tier = ?, titulo = ?, descripcion = ?, icono = ?,
                tipo_objetivo = ?, objetivo_meta = ?, objetivo_filtro = ?,
                requiere_mision_id = ?, recompensa_xp = ?, recompensa_insignia = ?,
                recompensa_banner = ?, horizonte = ?, orden = ?, activa = ?
             WHERE id = ?`,
            [datos.categoria, datos.tier, datos.titulo, datos.descripcion, datos.icono,
             datos.tipo_objetivo, datos.objetivo_meta, datos.objetivo_filtro,
             datos.requiere_mision_id, datos.recompensa_xp, datos.recompensa_insignia,
             datos.recompensa_banner, datos.horizonte, datos.orden, datos.activa, id]
        );
        if (!r.affectedRows) return res.status(404).json({ error: 'Misión no encontrada' });
        auditar(req, 'edito-mision', `Editó la misión "${datos.titulo}"`, { id });
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// PATCH /api/admin/misiones/:id/activa — activar/desactivar (no borra progreso).
router.patch('/:id/activa', conPermiso('materias'), async (req, res, next) => {
    const id = Number(req.params.id);
    if (!esIdValido(id)) return res.status(400).json({ error: 'id inválido' });
    const activa = Boolean(req.body?.activa);
    try {
        const [r] = await pool.query('UPDATE misiones SET activa = ? WHERE id = ?', [activa, id]);
        if (!r.affectedRows) return res.status(404).json({ error: 'Misión no encontrada' });
        const [[m]] = await pool.query('SELECT titulo FROM misiones WHERE id = ?', [id]);
        auditar(req, activa ? 'activo-mision' : 'desactivo-mision',
            `${activa ? 'Activó' : 'Desactivó'} la misión "${m?.titulo || id}"`, { id });
        res.json({ ok: true, activa });
    } catch (err) {
        next(err);
    }
});

export default router;
