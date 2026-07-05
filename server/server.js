// Servidor de GamificApp. Arranque: `npm run dev` dentro de /server.
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { verificarConexion } from './db.js';
import { autenticar } from './middleware/auth.js';
import authRouter from './routes/auth.js';
import adminRouter from './routes/admin.js';
import docenteRouter from './routes/docente.js';
import materiasRouter from './routes/materias.js';
import materialesRouter from './routes/materiales.js';
import progresoRouter from './routes/progreso.js';
import retosRouter from './routes/retos.js';
import rankingRouter from './routes/ranking.js';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

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
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);

// ---- A partir de aquí, TODA la API exige un JWT válido ----
app.use('/api', autenticar);

app.use('/api/admin', adminRouter);
app.use('/api/docente', docenteRouter);
app.use('/api/materias/:id/material', materialesRouter);
app.use('/api/materias', materiasRouter);
app.use('/api/progreso', progresoRouter);
app.use('/api/retos', retosRouter);
app.use('/api/ranking', rankingRouter);

// Manejador central de errores: nunca filtra detalles internos al cliente.
app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, async () => {
    console.log(`🚀 API de GamificApp en http://localhost:${PORT}`);
    await verificarConexion();
});
