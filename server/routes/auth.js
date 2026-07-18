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
import { firmarToken, autenticar, permisosEfectivos } from '../middleware/auth.js';
import { registrarAuditoria } from '../lib/auditoria.js';
import { elegirPorPin, pinColisionaConHomonimos, crearLimitadorNombres } from '../lib/homonimos.js';

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

// Acepta letras y números: el admin puede asignar PINs alfanuméricos.
const PIN_VALIDO = /^[a-zA-Z0-9]{6}$/;

// Alfabeto sin caracteres confundibles (sin 0/O, 1/I/L) para códigos que
// los niños copian a mano desde la pizarra o un carné.
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const generarCodigo = (largo) =>
    Array.from(crypto.randomBytes(largo), (b) => ALFABETO[b % ALFABETO.length]).join('');

// Limitador POR NOMBRE para logins con varias homónimas (SPEC-014 Fase 5):
// los fallos no tocan intentos_fallidos de ninguna cuenta — ninguna niña
// hereda un bloqueo persistente por culpa de su homónima.
const limitadorNombres = crearLimitadorNombres({ maxFallos: 5, minutosBloqueo: 15 });

// Localiza cuentas de estudiante por nombre: nombre_norm (Fase 5) con
// respaldo en username para cuentas previas a la migración 012 (ahí el
// username ES el nombre normalizado). Si la columna aún no existe (deploy a
// medias), cae a la consulta clásica por username.
const buscarEstudiantesPorNombre = async (nombreNorm) => {
    try {
        const [filas] = await pool.query(
            `SELECT * FROM usuarios
             WHERE rol = 'estudiante'
               AND (nombre_norm = ? OR (nombre_norm IS NULL AND username = ?))`,
            [nombreNorm, nombreNorm]
        );
        return filas;
    } catch (err) {
        if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
        const [filas] = await pool.query(
            "SELECT * FROM usuarios WHERE username = ? AND rol = 'estudiante'",
            [nombreNorm]
        );
        return filas;
    }
};

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
            es_principal: Boolean(usuario.es_principal),
            // Permisos efectivos del admin (SPEC-003): la UI solo oculta
            // módulos con esto; el servidor revalida en cada endpoint.
            permisos: usuario.rol === 'admin' ? permisosEfectivos(usuario) : undefined,
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

        const ERROR_429 = { error: `Demasiados intentos. Espera ${MINUTOS_BLOQUEO} minutos e inténtalo de nuevo.` };

        // "Nombre localiza, PIN decide" (SPEC-014 Fase 5). El nombre puede
        // corresponder a VARIAS estudiantes homónimas (nombre_norm no es
        // único); con una sola candidata el comportamiento es el clásico.
        let usuario;
        let esMulti = false;
        let nombreNorm = null;
        if (esEstudiante) {
            nombreNorm = normalizarNombre(nombre);
            // Cuentas en la Papelera (SPEC-003): se tratan como inexistentes.
            // El chequeo es en JS (SELECT *) para tolerar la columna ausente
            // en un deploy a medias.
            const candidatas = (await buscarEstudiantesPorNombre(nombreNorm))
                .filter((f) => !f.eliminado_en);
            esMulti = candidatas.length > 1;
            if (!esMulti) {
                usuario = candidatas[0];
            } else {
                // Varias homónimas: limitador POR NOMBRE (en memoria), sin
                // tocar los contadores persistentes de ninguna cuenta.
                if (limitadorNombres.bloqueado(nombreNorm)) {
                    return res.status(429).json(ERROR_429);
                }
                // El PIN decide: solo una puede coincidir (la colisión de
                // PINs entre homónimas está vetada por construcción).
                usuario = await elegirPorPin(candidatas, pin);
            }
        } else {
            const [filas] = await pool.query(
                "SELECT * FROM usuarios WHERE username = ? AND rol IN ('docente','admin')",
                [String(username).trim().toLowerCase()]
            );
            usuario = filas[0]?.eliminado_en ? undefined : filas[0];
        }

        if (usuario && estaBloqueado(usuario)) {
            return res.status(429).json(ERROR_429);
        }

        // Con homónimas, elegirPorPin ya verificó el PIN; en el resto de
        // casos la verificación bcrypt es la clásica.
        const hash = esEstudiante ? usuario?.pin_hash : usuario?.password_hash;
        const valido = esMulti
            ? Boolean(usuario)
            : Boolean(usuario && hash && await bcrypt.compare(String(esEstudiante ? pin : password), hash));

        if (!valido) {
            // Mismo mensaje exista o no la cuenta: no revelar cuál falló.
            if (esMulti) {
                if (limitadorNombres.fallo(nombreNorm)) {
                    return res.status(429).json(ERROR_429);
                }
            } else if (usuario) {
                const bloqueado = await registrarFallo(usuario.id, usuario.intentos_fallidos);
                if (bloqueado) {
                    return res.status(429).json(ERROR_429);
                }
            }
            return res.status(401).json({
                error: esEstudiante ? 'Nombre o PIN incorrectos' : 'Usuario o contraseña incorrectos'
            });
        }
        if (esMulti) limitadorNombres.exito(nombreNorm);

        // Cuenta desactivada por un Administrador Principal: credenciales
        // correctas pero sin acceso (usuario.activo puede no existir si la
        // migración 003 aún no corrió; en ese caso todos entran).
        if (usuario.activo === 0) {
            return res.status(403).json({ error: 'Tu cuenta está desactivada. Contacta al administrador principal.' });
        }

        // Estudiante importado por Excel (SPEC-014) aún sin activar: debe
        // pasar primero por Curso → Nombre → Código. Estado derivado, sin
        // columna extra: hay código vigente y nunca se ha usado. Las cuentas
        // por invitación tienen codigo_acceso_hash NULL y no se ven afectadas
        // (igual que una BD sin la migración 012: columna ausente = no bloquea).
        if (usuario.codigo_acceso_hash && !usuario.codigo_acceso_usado_en) {
            return res.status(403).json({
                error: 'Tu cuenta aún no está activada. Entra por "Crear mi cuenta" con el código que te dio tu docente.'
            });
        }

        await limpiarFallos(usuario.id);
        // Auditoría (SPEC-003): los inicios de sesión de estudiantes se
        // registran para la tarjeta "Actividad Estudiantes".
        if (usuario.rol === 'estudiante') {
            registrarAuditoria({
                usuario, accion: 'inicio-sesion',
                descripcion: `Inició sesión`
            });
        }
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
            'INSERT INTO estudiantes (nombres, apellidos, curso, curso_id, fecha_nacimiento) VALUES (?, ?, ?, ?, ?)',
            [partes.slice(0, mitad).join(' '), partes.slice(mitad).join(' ') || '-', invitacion.curso, invitacion.curso_id ?? null, fecha_nacimiento]
        );

        const pinInicial = pinDesdeFecha(fecha_nacimiento);
        const codigoEmergencia = generarCodigo(8);
        // nombre_norm (Fase 5): el login localiza por esta columna. Si la
        // migración 012 aún no corrió, se degrada al INSERT clásico.
        let cuenta;
        try {
            [cuenta] = await conn.query(
                `INSERT INTO usuarios (username, nombre_completo, nombre_norm, password_hash, pin_hash, codigo_emergencia, rol, estudiante_id)
                 VALUES (?, ?, ?, '', ?, ?, 'estudiante', ?)`,
                [nombreNorm, nombreVisible, nombreNorm, bcrypt.hashSync(pinInicial, 10), codigoEmergencia, fichaEst.insertId]
            );
        } catch (err) {
            if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
            [cuenta] = await conn.query(
                `INSERT INTO usuarios (username, nombre_completo, password_hash, pin_hash, codigo_emergencia, rol, estudiante_id)
                 VALUES (?, ?, '', ?, ?, 'estudiante', ?)`,
                [nombreNorm, nombreVisible, bcrypt.hashSync(pinInicial, 10), codigoEmergencia, fichaEst.insertId]
            );
        }

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
        registrarAuditoria({
            usuario, accion: 'se-registro',
            descripcion: `Se registró con un código de invitación`,
            detalle: { curso: invitacion.curso, codigo: invitacion.codigo }
        });
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

        // Localiza por nombre_norm (Fase 5): las homónimas con username
        // interno "~2" también escriben su nombre tal cual. El código de
        // emergencia es único global, así que desambigua solo. El respaldo
        // por username cubre cuentas previas a la migración 012 (y una BD
        // sin migrar: la subconsulta se degrada en el catch).
        const nombreNorm = normalizarNombre(nombre);
        const codigoNorm = String(codigo_emergencia).trim().toUpperCase();
        let filas;
        try {
            [filas] = await pool.query(
                `SELECT u.*, e.fecha_nacimiento FROM usuarios u
                 LEFT JOIN estudiantes e ON e.id = u.estudiante_id
                 WHERE (u.nombre_norm = ? OR (u.nombre_norm IS NULL AND u.username = ?))
                   AND u.codigo_emergencia = ? AND u.rol = 'estudiante'`,
                [nombreNorm, nombreNorm, codigoNorm]
            );
        } catch (err) {
            if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
            [filas] = await pool.query(
                `SELECT u.*, e.fecha_nacimiento FROM usuarios u
                 LEFT JOIN estudiantes e ON e.id = u.estudiante_id
                 WHERE u.username = ? AND u.codigo_emergencia = ? AND u.rol = 'estudiante'`,
                [nombreNorm, codigoNorm]
            );
        }
        // Cuentas en la Papelera se tratan como inexistentes (SPEC-003).
        const usuario = filas[0]?.eliminado_en ? undefined : filas[0];
        if (!usuario) {
            return res.status(401).json({ error: 'Nombre o código de emergencia incorrectos' });
        }
        if (estaBloqueado(usuario)) {
            return res.status(429).json({ error: `Demasiados intentos. Espera ${MINUTOS_BLOQUEO} minutos.` });
        }

        // Importado sin activar (SPEC-014): el código de emergencia tampoco
        // salta la activación (viene en el mismo Excel de credenciales).
        if (usuario.codigo_acceso_hash && !usuario.codigo_acceso_usado_en) {
            return res.status(403).json({
                error: 'Tu cuenta aún no está activada. Entra por "Crear mi cuenta" con el código que te dio tu docente.'
            });
        }

        // El PIN vuelve al de nacimiento para que el flujo normal funcione mañana.
        let aviso = 'Acceso de emergencia concedido.';
        if (usuario.fecha_nacimiento) {
            const pinInicial = pinDesdeFecha(usuario.fecha_nacimiento.toISOString?.() || usuario.fecha_nacimiento);
            await pool.query('UPDATE usuarios SET pin_hash = ?, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?',
                [bcrypt.hashSync(pinInicial, 10), usuario.id]);
            aviso = 'Tu PIN volvió a ser tu fecha de nacimiento (día-mes-año).';
        }
        registrarAuditoria({
            usuario, accion: 'acceso-emergencia',
            descripcion: `Entró con su código de emergencia (el PIN volvió al de nacimiento)`
        });
        return respuestaSesion(res, usuario, { aviso });
    } catch (err) {
        next(err);
    }
});

// ---------------------------------------------------------------------------
// SPEC-014 — Activación de estudiantes importados por Excel.
// Flujo público: Curso → Nombre → Código individual. La lista expone lo
// MÍNIMO (id + nombre de pendientes, nunca XP/fechas/pistas) y el código se
// valida SIEMPRE contra la fila del estudiante seleccionado: el código de
// otro niño jamás abre esta cuenta.

// Estado "pendiente" (derivado, sin columna extra): tiene código vigente y
// nunca lo ha usado. Las cuentas por invitación tienen el hash NULL.
const FILTRO_PENDIENTE =
    "u.rol = 'estudiante' AND u.eliminado_en IS NULL AND u.codigo_acceso_hash IS NOT NULL AND u.codigo_acceso_usado_en IS NULL";

// ---- GET /api/auth/cursos-pendientes ----
// Solo los cursos activos que TIENEN estudiantes por activar: el selector
// del niño no muestra cursos donde no hay nada que hacer.
router.get('/cursos-pendientes', async (_req, res, next) => {
    try {
        const [cursos] = await pool.query(
            `SELECT c.id, CONCAT(c.nombre, ' ', c.paralelo) AS etiqueta
             FROM cursos c
             WHERE c.activo = TRUE AND c.eliminado_en IS NULL
               AND EXISTS (SELECT 1 FROM estudiantes e
                           JOIN usuarios u ON u.estudiante_id = e.id
                           WHERE e.curso_id = c.id AND ${FILTRO_PENDIENTE})
             ORDER BY c.nombre, c.paralelo`
        );
        res.json(cursos);
    } catch (err) {
        // BD sin la migración 012: no hay nada pendiente, lista vacía.
        if (err.code === 'ER_BAD_FIELD_ERROR') return res.json([]);
        next(err);
    }
});

// ---- GET /api/auth/curso/:cursoId/estudiantes-pendientes ----
router.get('/curso/:cursoId/estudiantes-pendientes', async (req, res, next) => {
    try {
        const [filas] = await pool.query(
            `SELECT u.estudiante_id, u.nombre_completo AS nombre
             FROM usuarios u
             JOIN estudiantes e ON e.id = u.estudiante_id
             WHERE e.curso_id = ? AND ${FILTRO_PENDIENTE}
             ORDER BY u.nombre_completo`,
            [Number(req.params.cursoId)]
        );
        res.json(filas);
    } catch (err) {
        if (err.code === 'ER_BAD_FIELD_ERROR') return res.json([]);
        next(err);
    }
});

// ---- POST /api/auth/activar ----
// Body: { estudiante_id, codigo }. La cuenta se localiza POR el estudiante
// seleccionado (nunca por el código); bcrypt decide. Un solo uso: al activar,
// el hash se anula y usado_en queda marcado. Mismo rate limiting por cuenta
// que el login (5 fallos → 15 min) + el limitador global por IP de /api/auth.
router.post('/activar', async (req, res, next) => {
    try {
        const estudianteId = Number(req.body?.estudiante_id);
        const codigo = String(req.body?.codigo || '').trim().toUpperCase();
        if (!estudianteId || !codigo) {
            return res.status(400).json({ error: 'Elige tu nombre y escribe tu código' });
        }

        const [[usuario]] = await pool.query(
            `SELECT u.*, e.fecha_nacimiento FROM usuarios u
             JOIN estudiantes e ON e.id = u.estudiante_id
             WHERE u.estudiante_id = ? AND ${FILTRO_PENDIENTE}`,
            [estudianteId]
        );
        // Mensaje idéntico exista o no la cuenta pendiente: no revelar nada.
        const ERROR_GENERICO = 'Ese código no es correcto. Revisa que sea el tuyo y vuelve a intentarlo.';
        if (!usuario) return res.status(401).json({ error: ERROR_GENERICO });

        if (estaBloqueado(usuario)) {
            return res.status(429).json({
                error: `Demasiados intentos. Espera ${MINUTOS_BLOQUEO} minutos e inténtalo de nuevo.`
            });
        }

        if (!await bcrypt.compare(codigo, usuario.codigo_acceso_hash)) {
            const bloqueado = await registrarFallo(usuario.id, usuario.intentos_fallidos);
            if (bloqueado) {
                return res.status(429).json({
                    error: `Demasiados intentos. Espera ${MINUTOS_BLOQUEO} minutos e inténtalo de nuevo.`
                });
            }
            return res.status(401).json({ error: ERROR_GENERICO });
        }

        // Un solo uso, a prueba de doble clic: el WHERE exige que siga
        // pendiente; si otra petición ganó, affectedRows = 0.
        const [consumo] = await pool.query(
            `UPDATE usuarios SET codigo_acceso_hash = NULL, codigo_acceso_usado_en = NOW(),
                intentos_fallidos = 0, bloqueado_hasta = NULL
             WHERE id = ? AND codigo_acceso_usado_en IS NULL AND codigo_acceso_hash IS NOT NULL`,
            [usuario.id]
        );
        if (!consumo.affectedRows) return res.status(401).json({ error: ERROR_GENERICO });

        const pinInicial = usuario.fecha_nacimiento
            ? pinDesdeFecha(usuario.fecha_nacimiento.toISOString?.() || usuario.fecha_nacimiento)
            : null;
        registrarAuditoria({
            usuario, accion: 'activo-cuenta',
            descripcion: 'Entró por primera vez con su código individual'
        });
        return respuestaSesion(res, usuario, {
            pin: pinInicial,
            codigo_emergencia: usuario.codigo_emergencia,
            mensaje: 'Tu PIN es tu fecha de nacimiento (día-mes-año). Anota tu código de emergencia.'
        });
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
            return res.status(400).json({ error: 'El nuevo PIN debe tener exactamente 6 letras o números' });
        }

        const [[usuario]] = await pool.query('SELECT * FROM usuarios WHERE id = ?', [req.user.id]);
        if (!usuario?.pin_hash || !await bcrypt.compare(String(pin_actual || ''), usuario.pin_hash)) {
            return res.status(401).json({ error: 'El PIN actual no es correcto' });
        }

        // SPEC-014 Fase 5: dos homónimas no pueden converger al mismo PIN
        // (el login no podría distinguirlas). Mensaje neutro a propósito: no
        // revela que existe una homónima ni por qué ese PIN no sirve.
        if (usuario.nombre_norm) {
            const [homonimos] = await pool.query(
                `SELECT pin_hash FROM usuarios
                 WHERE nombre_norm = ? AND id <> ? AND rol = 'estudiante' AND eliminado_en IS NULL`,
                [usuario.nombre_norm, usuario.id]
            );
            if (await pinColisionaConHomonimos(String(pin_nuevo), homonimos)) {
                return res.status(400).json({ error: 'Ese PIN no está disponible, elige otro.' });
            }
        }

        await pool.query('UPDATE usuarios SET pin_hash = ? WHERE id = ?',
            [bcrypt.hashSync(String(pin_nuevo), 10), req.user.id]);
        registrarAuditoria({
            usuario: { id: usuario.id, rol: 'estudiante', nombre_completo: usuario.nombre_completo, username: usuario.username },
            accion: 'cambio-pin',
            descripcion: `Cambió su PIN`
        });
        res.json({ ok: true, mensaje: 'PIN actualizado. Úsalo desde tu próximo ingreso.' });
    } catch (err) {
        next(err);
    }
});

export default router;
