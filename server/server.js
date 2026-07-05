// Servidor de GamificApp. Arranque: `npm run dev` dentro de /server.
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { verificarConexion } from './db.js';
import materiasRouter from './routes/materias.js';
import progresoRouter from './routes/progreso.js';
import retosRouter from './routes/retos.js';
import rankingRouter from './routes/ranking.js';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// Solo el frontend autorizado puede consumir la API.
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
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
