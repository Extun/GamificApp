// Servicio de autenticación del cliente (JWT).
//
// Gestiona el ciclo de vida del token: login contra la API, almacenamiento,
// inclusión automática en cada petición (authFetch) y cierre de sesión.
// Ningún componente debe tocar el token directamente: siempre a través
// de este servicio.

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const KEY_TOKEN = 'auth_token';
const KEY_USUARIO = 'auth_usuario';

// Guarda la sesión que devuelve cualquier ruta de /api/auth y vincula la
// sesión de estudiante con su fila en la BD central para el guardado de
// progreso (gamificationService.getEstudianteId()).
const guardarSesion = (data) => {
    localStorage.setItem(KEY_TOKEN, data.token);
    localStorage.setItem(KEY_USUARIO, JSON.stringify(data.usuario));
    if (data.usuario.rol === 'estudiante' && data.usuario.estudiante_id) {
        localStorage.setItem('edu_estudianteId', String(data.usuario.estudiante_id));
    } else {
        localStorage.removeItem('edu_estudianteId');
    }
    return data;
};

const postPublico = async (ruta, body) => {
    const res = await fetch(`${API_URL}${ruta}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data;
};

// Login de docente/admin: usuario + contraseña. El rol lo decide el servidor.
export const login = async (username, password) => {
    const data = await postPublico('/api/auth/login', { username, password });
    return guardarSesion(data).usuario;
};

// Login de estudiante: nombre completo + PIN de 6 dígitos.
export const loginEstudiante = async (nombre, pin) => {
    const data = await postPublico('/api/auth/login', { nombre, pin });
    return guardarSesion(data).usuario;
};

// Registro con código de invitación del docente. Devuelve además el PIN
// inicial y el código de emergencia para que el niño los anote.
export const registrarEstudiante = async ({ nombre, fechaNacimiento, codigo }) => {
    const data = await postPublico('/api/auth/registro-estudiante', {
        nombre,
        fecha_nacimiento: fechaNacimiento,
        codigo
    });
    guardarSesion(data);
    return data;
};

// Acceso de emergencia (olvidó el PIN personalizado): el PIN vuelve a ser
// su fecha de nacimiento.
export const loginEmergencia = async (nombre, codigoEmergencia) => {
    const data = await postPublico('/api/auth/emergencia', {
        nombre,
        codigo_emergencia: codigoEmergencia
    });
    guardarSesion(data);
    return data;
};

export const cambiarPin = async (pinActual, pinNuevo) => {
    const res = await authFetch(`${API_URL}/api/auth/cambiar-pin`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin_actual: pinActual, pin_nuevo: pinNuevo })
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data;
};

export const logout = () => {
    localStorage.removeItem(KEY_TOKEN);
    localStorage.removeItem(KEY_USUARIO);
    localStorage.removeItem('edu_estudianteId');
};

export const getToken = () => localStorage.getItem(KEY_TOKEN);

export const getUsuario = () => {
    try {
        return JSON.parse(localStorage.getItem(KEY_USUARIO));
    } catch {
        return null;
    }
};

export const getRol = () => getUsuario()?.rol || null;

// ¿La sesión es de un Administrador Principal? La UI solo oculta módulos
// con esto: el servidor revalida el rol contra la BD en cada petición.
export const esPrincipal = () => Boolean(getUsuario()?.es_principal);

// ¿La sesión de admin tiene este permiso (SPEC-003)? La UI solo oculta
// módulos con esto: el servidor revalida el permiso en cada endpoint.
// Sesiones viejas (sin `permisos` guardados) caen al comportamiento previo:
// operación diaria sí; institución/administradores solo el Principal.
const PERMISOS_LEGADO = ['docentes', 'estudiantes', 'materias', 'cursos', 'invitaciones'];
export const tienePermiso = (clave) => {
    const usuario = getUsuario();
    if (usuario?.rol !== 'admin') return false;
    if (usuario.es_principal) return true;
    const permisos = Array.isArray(usuario.permisos) ? usuario.permisos : PERMISOS_LEGADO;
    return permisos.includes(clave);
};

export const isAuthenticated = () => Boolean(getToken());

// fetch con el token incluido. Si el servidor responde 401 (token expirado
// o inválido), cierra la sesión local: la próxima navegación cae al login.
export const authFetch = async (url, options = {}) => {
    const token = getToken();
    const res = await fetch(url, {
        ...options,
        headers: {
            ...(options.headers || {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
    });
    if (res.status === 401) logout();
    return res;
};

const authService = {
    login,
    loginEstudiante,
    registrarEstudiante,
    loginEmergencia,
    cambiarPin,
    logout,
    getToken,
    getUsuario,
    getRol,
    esPrincipal,
    tienePermiso,
    isAuthenticated,
    authFetch
};
export default authService;
