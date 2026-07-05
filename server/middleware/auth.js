// Middleware de autenticación y autorización (JWT + roles).
//
// Roles: 'admin' (gestiona cuentas), 'docente' (solo SUS materias),
// 'estudiante' (consume contenido). El token lo emite /api/auth y lleva
// { id, username, rol, estudiante_id }; aquí se verifica la firma y se
// expone como `req.user` para que las rutas apliquen reglas por rol.
import jwt from 'jsonwebtoken';
import pool from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    // Sin secreto no hay tokens verificables: mejor fallar al arrancar que
    // dejar la API abierta o emitir tokens con un secreto por defecto.
    throw new Error('Falta JWT_SECRET en server/.env');
}

export const firmarToken = (usuario) =>
    jwt.sign(
        {
            id: usuario.id,
            username: usuario.username,
            rol: usuario.rol,
            estudiante_id: usuario.estudiante_id ?? null
        },
        JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

export const autenticar = (req, res, next) => {
    const header = req.headers.authorization || '';
    const [esquema, token] = header.split(' ');

    if (esquema !== 'Bearer' || !token) {
        return res.status(401).json({ error: 'Token requerido' });
    }

    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }
};

export const soloAdmin = (req, res, next) => {
    if (req.user?.rol !== 'admin') {
        return res.status(403).json({ error: 'Solo el administrador puede realizar esta acción' });
    }
    next();
};

// Docente o admin (el admin hereda todo lo que puede hacer un docente).
export const soloDocente = (req, res, next) => {
    if (req.user?.rol !== 'docente' && req.user?.rol !== 'admin') {
        return res.status(403).json({ error: 'Solo el docente puede realizar esta acción' });
    }
    next();
};

// ¿Puede este usuario crear/editar contenido de esta materia?
// El admin siempre; el docente solo si el admin se la asignó (docente_materia).
export const puedeGestionarMateria = async (user, materiaId) => {
    if (user?.rol === 'admin') return true;
    if (user?.rol !== 'docente') return false;
    const [filas] = await pool.query(
        'SELECT 1 FROM docente_materia WHERE docente_id = ? AND materia_id = ?',
        [user.id, materiaId]
    );
    return filas.length > 0;
};
