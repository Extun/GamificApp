// Gestión de tipos de juego (SPEC-017, Fases 4 y 5).
//
//   GET /api/admin/juegos        → tipos instalados, integración, estado y uso
//   PUT /api/admin/juegos/:tipo  → cambia el estado de un tipo
//
// ALCANCE, a propósito: el administrador GESTIONA la disponibilidad de los
// tipos que el desarrollador ya implementó en el registro. NO puede crear una
// mecánica nueva desde aquí, y NO existe eliminación física de un tipo: una
// mecánica se añade y se retira en el código, con su contrato documentado
// (docs/COMO-AGREGAR-UN-JUEGO.md).
import { Router } from 'express';
import pool from '../db.js';
import { conPermiso } from '../middleware/auth.js';
import { registrarAuditoria } from '../lib/auditoria.js';
import { juegosPublicos, obtenerJuego, TIPOS_VALIDOS } from '../lib/juegos/registro.js';
import { ESTADOS, leerEstados, guardarEstado } from '../lib/juegos/estados.js';

const router = Router();

// Cuántas actividades existen de cada tipo, para que el administrador sepa
// qué va a afectar antes de cambiar un estado. Cuenta TODO (borradores,
// publicadas y papelera): nada de esto se borrará nunca por un cambio de
// estado, y el número debe reflejar el contenido real.
const conteoPorTipo = async () => {
    const [filas] = await pool.query(
        `SELECT tipo,
                COUNT(*)                                   AS total,
                SUM(estado = 'publicado' AND eliminado_en IS NULL) AS publicadas
         FROM retos GROUP BY tipo`
    );
    return Object.fromEntries(filas.map((f) => [f.tipo, {
        total: Number(f.total), publicadas: Number(f.publicadas)
    }]));
};

// ---- GET /api/admin/juegos ----
router.get('/', conPermiso('juegos'), async (_req, res, next) => {
    try {
        const [estados, conteo] = await Promise.all([leerEstados(), conteoPorTipo()]);
        res.json({
            estados: ESTADOS,
            juegos: juegosPublicos().map((j) => ({
                ...j,
                estado: estados[j.tipo] || 'activo',
                actividades: conteo[j.tipo]?.total || 0,
                publicadas: conteo[j.tipo]?.publicadas || 0
            }))
        });
    } catch (err) { next(err); }
});

// ---- PUT /api/admin/juegos/:tipo ----
// Body: { estado }. Nunca elimina datos: solo cambia disponibilidad.
router.put('/:tipo', conPermiso('juegos'), async (req, res, next) => {
    const tipo = String(req.params.tipo || '').trim();
    const estado = String(req.body?.estado || '').trim();

    if (!TIPOS_VALIDOS.includes(tipo)) {
        return res.status(404).json({ error: `El tipo de juego "${tipo}" no está instalado en esta versión.` });
    }
    if (!ESTADOS.includes(estado)) {
        return res.status(400).json({ error: `estado debe ser uno de: ${ESTADOS.join(', ')}` });
    }
    try {
        const previo = (await leerEstados())[tipo];
        await guardarEstado({ tipo, estado, usuarioId: req.user?.id });

        const juego = obtenerJuego(tipo);
        const conteo = (await conteoPorTipo())[tipo]?.total || 0;
        registrarAuditoria({
            usuario: req.user,
            accion: 'configuro-juego',
            descripcion: `Cambió el tipo de actividad "${juego?.etiqueta || tipo}" de "${previo}" a "${estado}"`,
            detalle: { tipo, de: previo, a: estado, actividades_afectadas: conteo }
        });

        const [estados, conteos] = await Promise.all([leerEstados(), conteoPorTipo()]);
        res.json({
            estados: ESTADOS,
            juegos: juegosPublicos().map((j) => ({
                ...j,
                estado: estados[j.tipo] || 'activo',
                actividades: conteos[j.tipo]?.total || 0,
                publicadas: conteos[j.tipo]?.publicadas || 0
            }))
        });
    } catch (err) { next(err); }
});

export default router;
