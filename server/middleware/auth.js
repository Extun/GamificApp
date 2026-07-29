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
            es_principal: Boolean(usuario.es_principal),
            estudiante_id: usuario.estudiante_id ?? null
        },
        JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

// SPEC-019 — Mensaje único para las dos formas de perder el acceso (cuenta
// desactivada o en la Papelera): al cliente no se le dice cuál de las dos es,
// misma política de mensajes indistinguibles que ya usa el login.
const SIN_ACCESO = 'Tu cuenta ya no tiene acceso. Vuelve a iniciar sesión.';

// SPEC-019 — ÚNICA incompatibilidad de esquema tolerada: falta alguna de las
// columnas `activo` (migración 003) o `eliminado_en` (migración 004), que NO
// están en el esquema base. La ventana existe de verdad: `inicializarEsquema()`
// corre dentro del callback de `app.listen`, así que puede llegar tráfico antes
// de que termine, y si falla el servidor sigue vivo a propósito para poder
// diagnosticarlo. Es la misma tolerancia que ya tienen `conPermiso` y
// `soloAdminPrincipal`. Cualquier OTRO fallo (MySQL caído, timeout, conexión
// perdida, error SQL inesperado) NO se tolera: sin poder comprobar el acceso,
// la petición no continúa.
const esEsquemaSinMigrar = (err) => err?.code === 'ER_BAD_FIELD_ERROR';

// El paso degradado nunca es silencioso, pero tampoco puede inundar el log:
// se avisa como mucho una vez por minuto.
let ultimoAvisoEsquema = 0;
const avisarEsquemaSinMigrar = () => {
    const ahora = Date.now();
    if (ahora - ultimoAvisoEsquema < 60000) return;
    ultimoAvisoEsquema = ahora;
    console.warn(
        '⚠️  [SPEC-019] `usuarios` no tiene activo/eliminado_en: no se puede ' +
        'revocar el acceso de cuentas desactivadas. Faltan las migraciones ' +
        '003/004; se sigue con el comportamiento anterior hasta que se apliquen.'
    );
};

export const autenticar = async (req, res, next) => {
    const header = req.headers.authorization || '';
    const [esquema, token] = header.split(' ');

    if (esquema !== 'Bearer' || !token) {
        return res.status(401).json({ error: 'Token requerido' });
    }

    let carga;
    try {
        carga = jwt.verify(token, JWT_SECRET);
    } catch {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }

    // SPEC-019 — La firma solo dice quién eras al INICIAR SESIÓN. Aquí se le
    // pregunta a la BD si esa persona sigue teniendo acceso HOY, que es lo que
    // ya hacían `conPermiso` y `soloAdminPrincipal` para los administradores:
    // sin esto, desactivar a un docente o a un estudiante no surtía efecto
    // hasta que caducaba su token (≤8h).
    try {
        const [[fila]] = await pool.query(
            'SELECT rol, activo, eliminado_en FROM usuarios WHERE id = ?',
            [carga.id]
        );
        // Cuenta borrada, en la Papelera o desactivada → fuera. 401 (y no 403)
        // porque es el código que `authFetch` ya traduce a cerrar sesión.
        if (!fila || fila.eliminado_en !== null || !fila.activo) {
            return res.status(401).json({ error: SIN_ACCESO });
        }
        // La BD manda también sobre el rol: a quien degraden, su token viejo
        // no le conserva el rol viejo.
        req.user = { ...carga, rol: fila.rol };
        return next();
    } catch (err) {
        if (esEsquemaSinMigrar(err)) {
            avisarEsquemaSinMigrar();
            req.user = carga;
            return next();
        }
        // Fail-closed: si no se puede comprobar el acceso, no se atiende.
        // 503 y no 500 para distinguir "ahora mismo no puedo verificarte" de
        // un fallo de la lógica; y no 401, porque una caída de la base de
        // datos no debe cerrarle la sesión a nadie.
        console.error('[SPEC-019] No se pudo verificar el acceso:', err?.code || err?.message);
        return res.status(503).json({
            error: 'No se puede verificar tu acceso en este momento. Inténtalo de nuevo en unos segundos.'
        });
    }
};

export const soloAdmin = (req, res, next) => {
    if (req.user?.rol !== 'admin') {
        return res.status(403).json({ error: 'Solo el administrador puede realizar esta acción' });
    }
    next();
};

// ---- Permisos entre administradores (SPEC-003) ----
// Claves simples por módulo del panel. El Administrador Principal SIEMPRE
// tiene todas; los demás solo las guardadas en usuarios.permisos (JSON).
// permisos = NULL significa "conjunto operativo por defecto": así los admins
// creados antes de la migración conservan exactamente lo que podían hacer.
export const PERMISOS_VALIDOS = [
    'docentes', 'estudiantes', 'materias', 'cursos',       // Gestión Académica
    'institucion', 'invitaciones',                         // Gestión Institucional
    'administradores', 'auditoria', 'papelera',            // Seguridad
    'ia', 'juegos'                                         // Sistema (SPEC-016, SPEC-017)
];
export const PERMISOS_OPERATIVOS = ['docentes', 'estudiantes', 'materias', 'cursos', 'invitaciones'];

// mysql2 devuelve las columnas JSON ya parseadas, pero se normaliza igual.
const parsearPermisos = (valor) => {
    if (Array.isArray(valor)) return valor;
    if (typeof valor === 'string') {
        try { return JSON.parse(valor); } catch { return null; }
    }
    return null;
};

// Permisos efectivos de una fila de `usuarios` (rol admin).
export const permisosEfectivos = (fila) => {
    if (fila?.es_principal) return [...PERMISOS_VALIDOS];
    const propios = parsearPermisos(fila?.permisos);
    return Array.isArray(propios)
        ? propios.filter((p) => PERMISOS_VALIDOS.includes(p))
        : [...PERMISOS_OPERATIVOS];
};

// Middleware por clave: verifica contra la BD (no contra el token) para que
// quitar un permiso surta efecto inmediato aunque la sesión siga abierta.
export const conPermiso = (clave) => async (req, res, next) => {
    if (req.user?.rol !== 'admin') {
        return res.status(403).json({ error: 'Solo un administrador puede realizar esta acción' });
    }
    try {
        const [[fila]] = await pool.query(
            'SELECT es_principal, activo, permisos FROM usuarios WHERE id = ? AND eliminado_en IS NULL',
            [req.user.id]
        );
        if (!fila || !fila.activo) {
            return res.status(403).json({ error: 'Tu cuenta de administrador no está activa' });
        }
        if (!permisosEfectivos(fila).includes(clave)) {
            return res.status(403).json({ error: 'No tienes permiso para esta sección. Pídeselo al Administrador Principal.' });
        }
        next();
    } catch (err) {
        // Deploy a medias (columnas aún sin migrar): comportamiento previo —
        // todo admin tiene lo operativo; institución/administradores exigen
        // Principal (lo resuelve soloAdminPrincipal en esas rutas).
        if (err.code === 'ER_BAD_FIELD_ERROR') {
            if (PERMISOS_OPERATIVOS.includes(clave)) return next();
            return soloAdminPrincipal(req, res, next);
        }
        next(err);
    }
};

// ¿La sesión corresponde a un Administrador Principal activo (según BD)?
export const esPrincipalEnBD = async (userId) => {
    try {
        const [[fila]] = await pool.query(
            'SELECT es_principal, activo FROM usuarios WHERE id = ?', [userId]
        );
        return Boolean(fila?.es_principal && fila.activo);
    } catch (err) {
        if (err.code === 'ER_BAD_FIELD_ERROR') return true; // pre-migración 003
        throw err;
    }
};

// Solo el Administrador Principal (institución y gestión de administradores).
// Se verifica contra la BD (no contra el token) para que promover/degradar
// o desactivar surta efecto inmediato aunque la sesión siga abierta.
export const soloAdminPrincipal = async (req, res, next) => {
    if (req.user?.rol !== 'admin') {
        return res.status(403).json({ error: 'Solo el administrador principal puede realizar esta acción' });
    }
    try {
        const [[fila]] = await pool.query(
            'SELECT es_principal, activo FROM usuarios WHERE id = ?', [req.user.id]
        );
        if (!fila?.es_principal || !fila.activo) {
            return res.status(403).json({ error: 'Solo el administrador principal puede realizar esta acción' });
        }
        next();
    } catch (err) {
        // Deploy a medias (columnas aún sin migrar): comportamiento previo,
        // todo admin tiene permisos completos.
        if (err.code === 'ER_BAD_FIELD_ERROR') return next();
        next(err);
    }
};

// Docente o admin (el admin hereda todo lo que puede hacer un docente).
export const soloDocente = (req, res, next) => {
    if (req.user?.rol !== 'docente' && req.user?.rol !== 'admin') {
        return res.status(403).json({ error: 'Solo el docente puede realizar esta acción' });
    }
    next();
};

// ¿Puede este usuario crear/editar contenido de esta materia?
// El admin siempre que la materia exista y no esté en la Papelera; el
// docente además solo si el admin se la asignó (docente_materia). Nadie
// publica contenido en una materia eliminada.
export const puedeGestionarMateria = async (user, materiaId) => {
    if (user?.rol !== 'admin' && user?.rol !== 'docente') return false;
    const [filas] = user.rol === 'admin'
        ? await pool.query(
            'SELECT 1 FROM materias WHERE id = ? AND eliminado_en IS NULL',
            [materiaId]
        )
        : await pool.query(
            `SELECT 1 FROM docente_materia dm
             JOIN materias m ON m.id = dm.materia_id AND m.eliminado_en IS NULL
             WHERE dm.docente_id = ? AND dm.materia_id = ?`,
            [user.id, materiaId]
        );
    return filas.length > 0;
};
