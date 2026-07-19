// Configuración administrativa de IA (SPEC-016, Fases 3 y 4).
//
//   GET  /api/admin/ia/configuracion       → proveedor/modelo activos + estado
//   GET  /api/admin/ia/modelos?proveedor=  → catálogo dinámico del proveedor
//   PUT  /api/admin/ia/configuracion       → cambia proveedor/modelo
//   POST /api/admin/ia/probar              → prueba real extremo a extremo
//
// ⚠️ SEGURIDAD (SPEC-016 §5.1): ninguna respuesta de este router contiene una
// API key, ni completa ni parcial ni enmascarada. Del secreto solo se expone
// un booleano `configurado`. Las keys viven exclusivamente en variables de
// entorno del backend y jamás se escriben en la base de datos.
import { Router } from 'express';
import { conPermiso } from '../middleware/auth.js';
import { registrarAuditoria } from '../lib/auditoria.js';
import { PROVEEDORES, obtenerProveedor, proveedoresPublicos } from '../lib/ia/registro.js';
import { leerConfiguracion, guardarConfiguracion } from '../lib/ia/config.js';
import { probarConexion } from '../lib/ia/probar.js';
import { registrarErrorIA } from '../lib/ia/errores.js';

const router = Router();

// Catálogo de modelos por proveedor, cacheado: se consulta al proveedor real,
// nunca es una lista hardcodeada que envejezca (SPEC-016 §4.5).
const TTL_MODELOS_MS = 5 * 60_000;
const cacheModelos = new Map();

const listarModelos = async (proveedor) => {
    const guardado = cacheModelos.get(proveedor.id);
    if (guardado && Date.now() - guardado.en < TTL_MODELOS_MS) return guardado.valor;
    const modelos = await proveedor.listarModelos();
    cacheModelos.set(proveedor.id, { valor: modelos, en: Date.now() });
    return modelos;
};

// ---- GET /api/admin/ia/configuracion ----
router.get('/configuracion', conPermiso('ia'), async (_req, res, next) => {
    try {
        const config = await leerConfiguracion();
        res.json({
            proveedor: config.proveedor,
            modelo: config.modelo,
            origen: config.origen,          // 'bd' | 'entorno' | ...
            proveedores: proveedoresPublicos()
        });
    } catch (err) { next(err); }
});

// ---- GET /api/admin/ia/modelos?proveedor=gemini ----
// Falla de forma suave: si el proveedor no responde, la UI sigue pudiendo
// dejar el modelo en "automático".
router.get('/modelos', conPermiso('ia'), async (req, res) => {
    const proveedor = obtenerProveedor(String(req.query?.proveedor || '').trim());
    if (!proveedor) {
        return res.status(400).json({ error: `proveedor debe ser uno de: ${Object.keys(PROVEEDORES).join(', ')}` });
    }
    if (!proveedor.disponible()) {
        return res.json({
            modelos: [],
            disponible: false,
            aviso: `Falta ${proveedor.variableEntorno} en el servidor.`
        });
    }
    try {
        res.json({ modelos: await listarModelos(proveedor), disponible: true });
    } catch (err) {
        registrarErrorIA({ operacion: 'listar-modelos', proveedor: proveedor.id, error: err });
        res.json({
            modelos: [],
            disponible: true,
            aviso: 'No se pudo obtener la lista de modelos del proveedor. Puedes dejarlo en automático.'
        });
    }
});

// ---- PUT /api/admin/ia/configuracion ----
// Body: { proveedor, modelo? }. `modelo` vacío/null = automático.
router.put('/configuracion', conPermiso('ia'), async (req, res, next) => {
    const idProveedor = String(req.body?.proveedor || '').trim();
    const modelo = String(req.body?.modelo || '').trim() || null;

    const proveedor = obtenerProveedor(idProveedor);
    if (!proveedor) {
        return res.status(400).json({ error: `proveedor debe ser uno de: ${Object.keys(PROVEEDORES).join(', ')}` });
    }
    if (!proveedor.disponible()) {
        return res.status(400).json({
            error: `No se puede activar ${proveedor.etiqueta}: falta ${proveedor.variableEntorno} en el servidor.`
        });
    }
    try {
        // El modelo debe pertenecer al catálogo del proveedor: así un admin no
        // puede fijar un identificador incompatible que rompa la salida
        // estructurada. Si el catálogo no se puede consultar, solo se admite
        // "automático" (null).
        if (modelo) {
            let catalogo = [];
            try { catalogo = await listarModelos(proveedor); } catch { catalogo = []; }
            if (!catalogo.includes(modelo)) {
                return res.status(400).json({
                    error: catalogo.length
                        ? 'Ese modelo no está disponible para el proveedor elegido. Actualiza la lista y vuelve a seleccionarlo.'
                        : 'No se pudo verificar la lista de modelos del proveedor. Guarda en "Automático" e inténtalo más tarde.'
                });
            }
        }

        // Validación REAL antes de persistir: se prueba la combinación
        // proveedor+modelo candidata contra el proveedor. Si falla, la
        // configuración ACTIVA se mantiene intacta (SPEC-016 §4.6). Esto
        // contiene el caso de un modelo que pasa el filtro de familia pero no
        // soporta de verdad la salida estructurada que necesitamos.
        const prueba = await probarConexion({ proveedor: proveedor.id, modelo });
        if (!prueba.ok) {
            return res.status(400).json({
                error: `No se guardó: la prueba con ${proveedor.etiqueta} falló. ${prueba.error}`,
                prueba
            });
        }

        await guardarConfiguracion({ proveedor: proveedor.id, modelo, usuarioId: req.user?.id });
        registrarAuditoria({
            usuario: req.user,
            accion: 'configuro-ia',
            descripcion: `Cambió el proveedor de IA a ${proveedor.etiqueta} (modelo: ${modelo || 'automático'})`,
            detalle: { proveedor: proveedor.id, modelo: modelo || null }
        });
        const config = await leerConfiguracion();
        res.json({
            proveedor: config.proveedor,
            modelo: config.modelo,
            origen: config.origen,
            proveedores: proveedoresPublicos(),
            prueba
        });
    } catch (err) { next(err); }
});

// ---- POST /api/admin/ia/probar ----
// Prueba REAL de la cadena completa (ver lib/ia/probar.js). Limitada para que
// no sea un grifo de consumo de cuota: 1 cada 10 s por administrador.
const ESPERA_PRUEBA_MS = 10_000;
const ultimaPrueba = new Map();

router.post('/probar', conPermiso('ia'), async (req, res, next) => {
    const ahora = Date.now();
    const previa = ultimaPrueba.get(req.user.id) ?? 0;
    if (ahora - previa < ESPERA_PRUEBA_MS) {
        const faltan = Math.ceil((ESPERA_PRUEBA_MS - (ahora - previa)) / 1000);
        return res.status(429).json({ error: `Espera ${faltan} s antes de volver a probar la conexión.` });
    }
    ultimaPrueba.set(req.user.id, ahora);

    try {
        res.json(await probarConexion());
    } catch (err) { next(err); }
});

export default router;
