// Servicio de autenticación del cliente (JWT).
//
// Gestiona el ciclo de vida del token: login contra la API, almacenamiento,
// inclusión automática en cada petición (authFetch) y cierre de sesión.
// Ningún componente debe tocar el token directamente: siempre a través
// de este servicio.

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const KEY_TOKEN = 'auth_token';
const KEY_USUARIO = 'auth_usuario';

// Caché LOCAL que pertenece a UNA persona (regla §6.11: localStorage es
// caché, nunca fuente de verdad). En los dispositivos compartidos de la
// escuela un estudiante entra justo después de otro, así que estas claves
// se borran al cerrar sesión Y al abrir una nueva: si sobreviven, el primer
// render del siguiente niño pinta el XP/nivel del anterior hasta que
// responde la API.
//   · edu_xpTotal        — XP acumulado (gamificationService), alimenta la
//                          barra de nivel del Home mientras llega el servidor.
//   · edu_estudianteId   — identidad del estudiante para POST /api/progreso.
//   · edu_historialRetos — borradores recientes de los editores del docente
//                          (SPEC-011: solo respaldo offline, la API lo pisa).
// NO se tocan `institucion_cache` ni `materias_cache`: son catálogo público
// e institucional, iguales para todos, y el Login los necesita ANTES de que
// exista sesión.
const CLAVES_DE_USUARIO = ['edu_estudianteId', 'edu_xpTotal', 'edu_historialRetos'];

// Claves de sistemas ya retirados (SPEC-011: logros viejos e historiales
// locales de borradores). Limpieza única al iniciar sesión.
const CLAVES_RETIRADAS = [
    'edu_logrosObtenidos', 'edu_actividades', 'edu_historialQuizzes',
    'edu_historialActividades_mision', 'edu_historialActividades_clasificador',
    'edu_historialActividades_memorama', 'edu_historialActividades_linea-tiempo',
    'edu_historialActividades_completar'
];

const limpiarCacheDeUsuario = () =>
    CLAVES_DE_USUARIO.forEach((clave) => localStorage.removeItem(clave));

// Guarda la sesión que devuelve cualquier ruta de /api/auth y vincula la
// sesión de estudiante con su fila en la BD central para el guardado de
// progreso (gamificationService.getEstudianteId()).
const guardarSesion = (data) => {
    // Primero se descarta la caché de quien usó antes este navegador: si el
    // anterior no cerró sesión (cerrar la pestaña no pasa por logout), su XP
    // seguiría ahí y lo vería el siguiente durante el primer render.
    limpiarCacheDeUsuario();
    CLAVES_RETIRADAS.forEach((clave) => localStorage.removeItem(clave));

    localStorage.setItem(KEY_TOKEN, data.token);
    localStorage.setItem(KEY_USUARIO, JSON.stringify(data.usuario));
    if (data.usuario.rol === 'estudiante' && data.usuario.estudiante_id) {
        localStorage.setItem('edu_estudianteId', String(data.usuario.estudiante_id));
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

const getPublico = async (ruta) => {
    const res = await fetch(`${API_URL}${ruta}`);
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

// ---- SPEC-014: primera entrada de estudiantes importados por Excel ----
// Cursos con estudiantes por activar (público, solo id + etiqueta).
export const cursosPendientes = () => getPublico('/api/auth/cursos-pendientes');

// Estudiantes pendientes de UN curso (público, solo id + nombre).
export const estudiantesPendientes = (cursoId) =>
    getPublico(`/api/auth/curso/${cursoId}/estudiantes-pendientes`);

// Activa la cuenta: el backend valida estudiante seleccionado + SU código.
// Devuelve sesión iniciada + PIN inicial y código de emergencia para anotar.
export const activarEstudiante = async (estudianteId, codigo) => {
    const data = await postPublico('/api/auth/activar', {
        estudiante_id: estudianteId,
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

// `conservarSesionEn401`: en ESTE endpoint un 401 no significa "tu sesión
// murió" sino "el PIN que escribiste no es el correcto" — el servidor ya
// validó el token en `autenticar` para llegar al handler. Sin esta excepción,
// equivocarse al teclear el PIN actual cerraba la sesión del estudiante en
// silencio y la operación siguiente fallaba con "Token requerido".
export const cambiarPin = async (pinActual, pinNuevo) => {
    const res = await authFetch(`${API_URL}/api/auth/cambiar-pin`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin_actual: pinActual, pin_nuevo: pinNuevo }),
        conservarSesionEn401: true
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data;
};

export const logout = () => {
    localStorage.removeItem(KEY_TOKEN);
    localStorage.removeItem(KEY_USUARIO);
    limpiarCacheDeUsuario();
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
//
// `conservarSesionEn401` (opt-in, por llamada) desactiva ESE cierre en los
// pocos endpoints donde un 401 describe la credencial enviada en el cuerpo y
// no el estado de la sesión — hoy solo `cambiar-pin`. La red de seguridad
// sigue intacta en todas las demás peticiones, que es donde importa.
export const authFetch = async (url, options = {}) => {
    const { conservarSesionEn401 = false, ...resto } = options;
    const token = getToken();
    const res = await fetch(url, {
        ...resto,
        headers: {
            ...(resto.headers || {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
    });
    if (res.status === 401 && !conservarSesionEn401) logout();
    return res;
};

const authService = {
    login,
    loginEstudiante,
    registrarEstudiante,
    cursosPendientes,
    estudiantesPendientes,
    activarEstudiante,
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
