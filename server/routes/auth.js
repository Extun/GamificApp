// Autenticación de GamificApp — rutas públicas de acceso.
//
//   POST /api/auth/login               → docente/admin (username + password)
//                                        o estudiante (nombre + pin)
//   POST /api/auth/registro-estudiante → alta con código de invitación
//   POST /api/auth/emergencia          → acceso con código de emergencia
//                                        (resetea el PIN al de nacimiento)
//   PUT  /api/auth/cambiar-pin         → estudiante autenticado
//
// Defensas: PINs y contraseñas siempre hasheados (bcrypt), mensajes de
// error idénticos exista o no la cuenta, y bloqueo temporal de 15 minutos
// tras 5 intentos fallidos (rate limiting por cuenta).
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import pool from '../db.js';
import { firmarToken, autenticar } from '../middleware/auth.js';

const router = Router();

const MAX_INTENTOS = 5;
const MINUTOS_BLOQUEO = 15;

// "  Ana  MARÍA Pérez " → "ana maría pérez": así se compara el nombre sin
// depender de mayúsculas o espacios de más.
export const normalizarNombre = (nombre) =>
    String(nombre || '').trim().toLowerCase().replace(/\s+/g, ' ');

// PIN por defecto = fecha de nacimiento en DDMMAA ("2017-03-15" → "150317").
// Recuperable sin base de datos: el niño solo necesita saber su cumpleaños.
const pinDesdeFecha = (fechaISO) => {
    const [anio, mes, dia] = String(fechaISO).slice(0, 10).split('-');
    return `${dia}${mes}${anio.slice(2)}`;
};

const PIN_VALIDO = /^\d{6}$/;

// Alfabeto sin caracteres confundibles (sin 0/O, 1/I/L) para códigos que
// los niños copian a mano desde la pizarra o un carné.
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const generarCodigo = (largo) =>
    Array.from(crypto.randomBytes(largo), (b) => ALFABETO[b % ALFABETO.length]).join('');

// ---- Rate limiting por cuenta ----
const estaBloqueado = (usuario) =>
    usuario.bloqueado_hasta && new Date(usuario.bloqueado_hasta) > new Date();

const registrarFallo = async (usuarioId, intentosPrevios) => {
    const intentos = intentosPrevios + 1;
    await pool.query(
        `UPDATE usuarios SET intentos_fallidos = ?,
            bloqueado_hasta = ${intentos >= MAX_INTENTOS ? `DATE_ADD(NOW(), INTERVAL ${MINUTOS_BLOQUEO} MINUTE)` : 'NULL'}
         WHERE id = ?`,
        [intentos, usuarioId]
    );
    return intentos >= MAX_INTENTOS;
};

const limpiarFallos = (usuarioId) =>
    pool.query('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?', [usuarioId]);

const respuestaSesion = (res, usuario, extra = {}) =>
    res.json({
        token: firmarToken(usuario),
        usuario: {
            id: usuario.id,
            username: usuario.username,
            nombre_completo: usuario.nombre_completo,
            rol: usuario.rol,
            estudiante_id: usuario.estudiante_id
        },
        ...extra
    });

// ---- POST /api/auth/login ----
router.post('/login', async (req, res, next) => {
    try {
        const { username, password, nombre, pin } = req.body || {};

        // Modo estudiante: nombre completo + PIN. Modo docente/admin:
        // username + password. Ambos comparten el mismo rate limiting.
        const esEstudiante = Boolean(nombre && pin);
        if (!esEstudiante && !(username && password)) {
            return res.status(400).json({ error: 'Faltan credenciales' });
        }

        const [filas] = esEstudiante
            ? await pool.query(
                "SELECT * FROM usuarios WHERE username = ? AND rol = 'estudiante'",
                [normalizarNombre(nombre)]
            )
            : await pool.query(
                "SELECT * FROM usuarios WHERE username = ? AND rol IN ('docente','admin')",
                [String(username).trim().toLowerCase()]
            );
        const usuario = filas[0];

        if (usuario && estaBloqueado(usuario)) {
            return res.status(429).json({
                error: `Demasiados intentos. Espera ${MINUTOS_BLOQUEO} minutos e inténtalo de nuevo.`
            });
        }

        const hash = esEstudiante ? usuario?.pin_hash : usuario?.password_hash;
        const valido = usuario && hash && await bcrypt.compare(String(esEstudiante ? pin : password), hash);

        if (!valido) {
            // Mismo mensaje exista o no la cuenta: no revelar cuál falló.
            if (usuario) {
                const bloqueado = await registrarFallo(usuario.id, usuario.intentos_fallidos);
                if (bloqueado) {
                    return res.status(429).json({
                        error: `Demasiados intentos. Espera ${MINUTOS_BLOQUEO} minutos e inténtalo de nuevo.`
                    });
                }
            }
            return res.status(401).json({
                error: esEstudiante ? 'Nombre o PIN incorrectos' : 'Usuario o contraseña incorrectos'
            });
        }

        await limpiarFallos(usuario.id);
        return respuestaSesion(res, usuario);
    } catch (err) {
        next(err);
    }
});

// ---- POST /api/auth/registro-estudiante ----
// Body: { nombre, fecha_nacimiento: 'YYYY-MM-DD', codigo, curso? }
// El código lo genera el docente (un solo uso, expira). Devuelve el token,
// el PIN inicial (fecha de nacimiento) y el código de emergencia para carné.
router.post('/registro-estudiante', async (req, res, next) => {
    const { nombre, fecha_nacimiento, codigo } = req.body || {};
    const nombreVisible = String(nombre || '').trim().replace(/\s+/g, ' ');
    const nombreNorm = normalizarNombre(nombreVisible);

    if (nombreNorm.split(' ').length < 2) {
        return res.status(400).json({ error: 'Escribe tu nombre completo (nombre y apellido)' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha_nacimiento || ''))) {
        return res.status(400).json({ error: 'La fecha de nacimiento es obligatoria (AAAA-MM-DD)' });
    }
    if (!codigo) {
        return res.status(400).json({ error: 'El código de invitación es obligatorio' });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // Bloquea la invitación: dos registros simultáneos con el mismo
        // código se serializan y solo el primero la consume.
        const [[invitacion]] = await conn.query(
            "SELECT * FROM invitaciones_estudiante WHERE codigo = ? FOR UPDATE",
            [String(codigo).trim().toUpperCase()]
        );
        if (!invitacion || invitacion.estado !== 'pendiente' || new Date(invitacion.expira_en) < new Date()) {
            await conn.rollback();
            return res.status(400).json({ error: 'Código de invitación inválido, usado o expirado. Pide uno nuevo a tu docente.' });
        }

        const [[duplicado]] = await conn.query(
            'SELECT id FROM usuarios WHERE username = ?', [nombreNorm]
        );
        if (duplicado) {
            await conn.rollback();
            return res.status(409).json({
                error: 'Ya existe un estudiante con ese nombre. Agrega tu segundo nombre o apellido para diferenciarte.'
            });
        }

        // Ficha del estudiante (progreso/XP) + cuenta de acceso.
        const partes = nombreVisible.split(' ');
        const mitad = Math.ceil(partes.length / 2);
        const [fichaEst] = await conn.query(
            'INSERT INTO estudiantes (nombres, apellidos, curso, fecha_nacimiento) VALUES (?, ?, ?, ?)',
            [partes.slice(0, mitad).join(' '), partes.slice(mitad).join(' ') || '-', invitacion.curso, fecha_nacimiento]
        );

        const pinInicial = pinDesdeFecha(fecha_nacimiento);
        const codigoEmergencia = generarCodigo(8);
        const [cuenta] = await conn.query(
            `INSERT INTO usuarios (username, nombre_completo, password_hash, pin_hash, codigo_emergencia, rol, estudiante_id)
             VALUES (?, ?, '', ?, ?, 'estudiante', ?)`,
            [nombreNorm, nombreVisible, bcrypt.hashSync(pinInicial, 10), codigoEmergencia, fichaEst.insertId]
        );

        await conn.query(
            "UPDATE invitaciones_estudiante SET estado = 'usado', usuario_id = ? WHERE id = ?",
            [cuenta.insertId, invitacion.id]
        );
        await conn.commit();

        const usuario = {
            id: cuenta.insertId,
            username: nombreNorm,
            nombre_completo: nombreVisible,
            rol: 'estudiante',
            estudiante_id: fichaEst.insertId
        };
        res.status(201).json({
            token: firmarToken(usuario),
            usuario,
            pin: pinInicial,
            codigo_emergencia: codigoEmergencia,
            mensaje: 'Tu PIN es tu fecha de nacimiento (día-mes-año). Anota tu código de emergencia.'
        });
    } catch (err) {
        await conn.rollback().catch(() => {});
        next(err);
    } finally {
        conn.release();
    }
});

// ---- POST /api/auth/emergencia ----
// Nombre + código de emergencia del carné. Da acceso inmediato y resetea el
// PIN al de nacimiento (por si el niño personalizó el PIN y lo olvidó).
router.post('/emergencia', async (req, res, next) => {
    try {
        const { nombre, codigo_emergencia } = req.body || {};
        if (!nombre || !codigo_emergencia) {
            return res.status(400).json({ error: 'Se requieren nombre y código de emergencia' });
        }

        const [filas] = await pool.query(
            `SELECT u.*, e.fecha_nacimiento FROM usuarios u
             LEFT JOIN estudiantes e ON e.id = u.estudiante_id
             WHERE u.username = ? AND u.codigo_emergencia = ? AND u.rol = 'estudiante'`,
            [normalizarNombre(nombre), String(codigo_emergencia).trim().toUpperCase()]
        );
        const usuario = filas[0];
        if (!usuario) {
            return res.status(401).json({ error: 'Nombre o código de emergencia incorrectos' });
        }
        if (estaBloqueado(usuario)) {
            return res.status(429).json({ error: `Demasiados intentos. Espera ${MINUTOS_BLOQUEO} minutos.` });
        }

        // El PIN vuelve al de nacimiento para que el flujo normal funcione mañana.
        let aviso = 'Acceso de emergencia concedido.';
        if (usuario.fecha_nacimiento) {
            const pinInicial = pinDesdeFecha(usuario.fecha_nacimiento.toISOString?.() || usuario.fecha_nacimiento);
            await pool.query('UPDATE usuarios SET pin_hash = ?, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?',
                [bcrypt.hashSync(pinInicial, 10), usuario.id]);
            aviso = 'Tu PIN volvió a ser tu fecha de nacimiento (día-mes-año).';
        }
        return respuestaSesion(res, usuario, { aviso });
    } catch (err) {
        next(err);
    }
});

// ---- PUT /api/auth/cambiar-pin (estudiante autenticado) ----
router.put('/cambiar-pin', autenticar, async (req, res, next) => {
    try {
        const { pin_actual, pin_nuevo } = req.body || {};
        if (req.user.rol !== 'estudiante') {
            return res.status(403).json({ error: 'Solo los estudiantes usan PIN' });
        }
        if (!PIN_VALIDO.test(String(pin_nuevo || ''))) {
            return res.status(400).json({ error: 'El nuevo PIN debe tener exactamente 6 dígitos' });
        }

        const [[usuario]] = await pool.query('SELECT * FROM usuarios WHERE id = ?', [req.user.id]);
        if (!usuario?.pin_hash || !await bcrypt.compare(String(pin_actual || ''), usuario.pin_hash)) {
            return res.status(401).json({ error: 'El PIN actual no es correcto' });
        }

        await pool.query('UPDATE usuarios SET pin_hash = ? WHERE id = ?',
            [bcrypt.hashSync(String(pin_nuevo), 10), req.user.id]);
        res.json({ ok: true, mensaje: 'PIN actualizado. Úsalo desde tu próximo ingreso.' });
    } catch (err) {
        next(err);
    }
});

export default router;
