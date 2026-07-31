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
import adminResetRouter from './routes/adminReset.js';
import adminIARouter from './routes/adminIA.js';
import adminJuegosRouter from './routes/adminJuegos.js';
import bancoPreguntasRouter from './routes/bancoPreguntas.js';
import estudiantesImportRouter from './routes/estudiantesImport.js';

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

// Rate limiting por IP para las rutas públicas de auth (SPEC-022 §1).
//
// Cuenta CREDENCIALES RECHAZADAS, no peticiones. La versión anterior contaba
// toda petición —éxitos incluidos— con un techo de 30 cada 5 minutos, y como
// una escuela entera sale a internet por una sola IP pública (NAT), el niño
// nº 31 de la jornada recibía un 429 indistinguible de "la app está caída".
// Un inicio de sesión correcto ahora no consume nada.
//
// Esta capa NO es la defensa principal contra fuerza bruta: esa es el bloqueo
// POR CUENTA de routes/auth.js (5 fallos → 15 min) y el limitador por nombre,
// ambos intactos. Aquí solo se frena el ROCIADO (un intento en muchas
// cuentas), que es lo único que el bloqueo por cuenta no ve.
//
// En memoria: suficiente para una sola instancia como la de Render.
const VENTANA_MS = 5 * 60 * 1000;
// 400 = colegio completo (600 alumnos) llegando a la vez con 2 de cada 3
// tecleando mal el PIN. El uso normal no se acerca; el rociado sí topa.
const MAX_FALLOS = 400;
const fallosPorIp = new Map();

// Rutas de /api/auth que no consumen cupo. `req.path` llega ya sin el prefijo
// del montaje, así que son sub-rutas ("/login", "/cursos-pendientes"…).
//  · Los dos GET del alta por Excel (SPEC-014) son catálogo público y no
//    llevan credencial: solo listan cursos y nombres para poder elegir.
//    Consumían cupo por estar bajo el mismo router, y son justo las que más
//    se piden el primer día de clase.
//  · cambiar-pin ya pasa por `autenticar` con un JWT válido: limitarla por IP
//    no añade defensa, solo castiga a un aula que comparte salida.
const RUTAS_SIN_LIMITE = new Set(['/cursos-pendientes', '/cambiar-pin']);
const sinLimite = (ruta) =>
    RUTAS_SIN_LIMITE.has(ruta) || /^\/curso\/\d+\/estudiantes-pendientes$/.test(ruta);

const limitarAuth = (req, res, next) => {
    if (sinLimite(req.path)) return next();

    const registro = fallosPorIp.get(req.ip);
    const vigente = registro && Date.now() - registro.desde <= VENTANA_MS;
    if (vigente && registro.cuenta >= MAX_FALLOS) {
        return res.status(429).json({
            error: 'Demasiados intentos fallidos desde esta red. Espera unos minutos.'
        });
    }

    // El conteo ocurre AL TERMINAR la respuesta, porque solo entonces se sabe
    // si la credencial se rechazó. Se cuenta 401 y NADA MÁS:
    //  · 403 describe el ESTADO de la cuenta con la credencial correcta
    //    (desactivada, o importada por Excel y aún sin activar). Contarlo
    //    gastaría cupo con el error más previsible del día de estreno.
    //  · 429 es el bloqueo por cuenta ya actuando; contarlo alargaría solo.
    //  · 400/409 son datos mal formados, no intentos de adivinar.
    res.on('finish', () => {
        if (res.statusCode !== 401) return;
        const ahora = Date.now();
        const actual = fallosPorIp.get(req.ip);
        if (!actual || ahora - actual.desde > VENTANA_MS) {
            fallosPorIp.set(req.ip, { desde: ahora, cuenta: 1 });
        } else {
            actual.cuenta += 1;
        }
    });
    next();
};
// Poda periódica para que el mapa no crezca sin límite.
setInterval(() => {
    const ahora = Date.now();
    for (const [ip, r] of fallosPorIp) {
        if (ahora - r.desde > VENTANA_MS) fallosPorIp.delete(ip);
    }
}, VENTANA_MS).unref();

// Solo los frontends autorizados pueden consumir la API.
// CORS_ORIGIN acepta varios orígenes separados por coma, sin barra final.
const origenesPermitidos = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);
// maxAge: sin él el navegador solo reutiliza el preflight unos 5 s, así que
// casi cada URL distinta paga un OPTIONS extra antes de su GET. Con 24 h
// (el techo que respeta Chrome) el preflight se pide una vez por sesión.
// No cambia qué orígenes se aceptan: solo cuánto dura la respuesta cacheada.
app.use(cors({ origin: origenesPermitidos, maxAge: 86400 }));
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

// Antes de adminRouter para que estas sub-rutas tengan precedencia.
app.use('/api/admin/misiones', adminMisionesRouter);
app.use('/api/admin/reset', adminResetRouter);
app.use('/api/admin/ia', adminIARouter);
app.use('/api/admin/juegos', adminJuegosRouter);
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
app.use('/api/banco', bancoPreguntasRouter);
// Carga masiva de estudiantes (SPEC-014): importación Excel y regeneración
// de códigos de activación. Admin o docente (validado dentro por curso).
app.use('/api/estudiantes', estudiantesImportRouter);

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
