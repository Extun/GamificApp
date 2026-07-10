// Servidor de GamificApp. Arranque: `npm run dev` dentro de /server.
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { verificarConexion } from './db.js';
import { inicializarEsquema } from './initDb.js';
import { autenticar } from './middleware/auth.js';
import authRouter from './routes/auth.js';
import adminRouter from './routes/admin.js';
import docenteRouter from './routes/docente.js';
import materiasRouter from './routes/materias.js';
import materialesRouter from './routes/materiales.js';
import progresoRouter from './routes/progreso.js';
import retosRouter from './routes/retos.js';
import rankingRouter from './routes/ranking.js';
import iaRouter from './routes/ia.js';
import institucionRouter from './routes/institucion.js';
import cursosRouter from './routes/cursos.js';
import misionesRouter from './routes/misiones.js';
import adminMisionesRouter from './routes/adminMisiones.js';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// Render/Vercel ponen un proxy delante: sin esto req.ip sería la IP del
// proxy y el rate limiting por IP castigaría a todos los usuarios juntos.
app.set('trust proxy', 1);
// No anunciar la tecnología del servidor.
app.disable('x-powered-by');

// Cabeceras de seguridad básicas en TODAS las respuestas.
app.use((_req, res, next) => {
    res.set({
        'X-Content-Type-Options': 'nosniff',   // no adivinar tipos MIME
        'X-Frame-Options': 'DENY',             // la API no se incrusta en iframes
        'Referrer-Policy': 'no-referrer',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
    });
    next();
});

// Rate limiting por IP para las rutas públicas de auth (login, registro,
// emergencia): frena fuerza bruta de PINs y de códigos de invitación.
// En memoria: suficiente para una sola instancia como la de Render.
const VENTANA_MS = 5 * 60 * 1000;
const MAX_PETICIONES = 30;
const intentosPorIp = new Map();
const limitarAuth = (req, res, next) => {
    const ahora = Date.now();
    const registro = intentosPorIp.get(req.ip);
    if (!registro || ahora - registro.desde > VENTANA_MS) {
        intentosPorIp.set(req.ip, { desde: ahora, cuenta: 1 });
        return next();
    }
    if (++registro.cuenta > MAX_PETICIONES) {
        return res.status(429).json({ error: 'Demasiadas peticiones. Espera unos minutos.' });
    }
    next();
};
// Poda periódica para que el mapa no crezca sin límite.
setInterval(() => {
    const ahora = Date.now();
    for (const [ip, r] of intentosPorIp) {
        if (ahora - r.desde > VENTANA_MS) intentosPorIp.delete(ip);
    }
}, VENTANA_MS).unref();

// Solo los frontends autorizados pueden consumir la API.
// CORS_ORIGIN acepta varios orígenes separados por coma, sin barra final.
const origenesPermitidos = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);
app.use(cors({ origin: origenesPermitidos }));
// Límite amplio: el material de estudio viaja como dataURL (base64).
app.use(express.json({ limit: '25mb' }));

// ---- Rutas públicas (sin token) ----
// Liviano a propósito: lo consulta un monitor externo cada 14 min para
// evitar el cold start del plan gratuito de Render. Sin tocar la BD.
app.get('/api/health', (_req, res) =>
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() }));
app.use('/api/auth', limitarAuth, authRouter);
// Identidad institucional (nombre, logo, colores): el Login la necesita
// antes de que exista sesión, por eso va antes del muro de autenticación.
app.use('/api/institucion', institucionRouter);

// ---- A partir de aquí, TODA la API exige un JWT válido ----
app.use('/api', autenticar);

// Antes de adminRouter para que esta sub-ruta tenga precedencia.
app.use('/api/admin/misiones', adminMisionesRouter);
app.use('/api/admin', adminRouter);
app.use('/api/docente', docenteRouter);
app.use('/api/materias/:id/material', materialesRouter);
app.use('/api/materias', materiasRouter);
app.use('/api/progreso', progresoRouter);
app.use('/api/retos', retosRouter);
app.use('/api/ranking', rankingRouter);
app.use('/api/cursos', cursosRouter);
app.use('/api/misiones', misionesRouter);
app.use('/api/ia', iaRouter);

// Manejador central de errores: nunca filtra detalles internos al cliente.
app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, async () => {
    console.log(`🚀 API de GamificApp en http://localhost:${PORT}`);
    if (await verificarConexion()) {
        // Crea las tablas y datos semilla si faltan (idempotente). Si falla,
        // se registra pero el servidor sigue vivo para poder diagnosticarlo.
        try {
            await inicializarEsquema();
        } catch (err) {
            console.error('⚠️  No se pudo inicializar el esquema:', err.message);
        }
    }
});
