import { useState, useEffect, useId } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import SchoolRoundedIcon from '@mui/icons-material/SchoolRounded';
import './login.css';
import authService from '../../services/authService';
import { toast } from '../../components/dashboard/toastBus';
import { getInstitucionCache, obtenerInstitucion, NOMBRE_INSTITUCION_DEFECTO } from '../../services/institucionService';

// ¿Esta copia ES ya la instalación local? El paquete offline se sirve desde
// localhost en el equipo que hace de servidor, y desde su IP privada en el
// resto del aula cuando se activa el acceso por red (instalador/opciones.ps1).
// En los DOS casos sobra el enlace de descarga: quien lo ve ya la tiene
// delante, y seguirlo exigiría justo lo que no tiene, internet.
//
// Los rangos son los de la RFC 1918, los mismos que reconoce Test-IPPrivada en
// el instalador. Un despliegue de verdad (Vercel) tiene nombre de dominio y no
// entra por aquí, así que ahí el enlace se sigue ofreciendo.
const esHostDeInstalacionLocal = (host) =>
    ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host)
    || /^10\./.test(host)
    || /^192\.168\./.test(host)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host);

const ES_INSTALACION_LOCAL = typeof window !== 'undefined'
    && esHostDeInstalacionLocal(window.location.hostname);

// El rol NUNCA se elige aquí: lo determina el servidor según la cuenta y
// viaja firmado dentro del JWT. Las pestañas solo cambian el formulario:
//   · Estudiante → nombre completo + PIN de 6 caracteres (letras o números)
//   · Docente / Admin → usuario + contraseña
export function Login(){
    const [modo, setModo] = useState("estudiante");     // estudiante | docente | emergencia
    const [nombre, setNombre] = useState("");
    const [pin, setPin] = useState("");
    const [codigoEmergencia, setCodigoEmergencia] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showPin, setShowPin] = useState(false);
    const [error, setError] = useState("");
    const [mostrarAyudaPin, setMostrarAyudaPin] = useState(false);
    const [cargando, setCargando] = useState(false);
    const outlinedPasswordId = useId();
    const navigate = useNavigate();

    // Identidad institucional (SPEC-002): logo y nombre en la cabecera y el
    // pie. La caché pinta al instante; la API la refresca.
    const [institucion, setInstitucion] = useState(getInstitucionCache());
    useEffect(() => {
        let vigente = true;
        obtenerInstitucion()
            .then((inst) => { if (vigente) setInstitucion(inst); })
            .catch(() => { /* sin red: caché o valores por defecto */ });
        return () => { vigente = false; };
    }, []);

    const ejecutar = async (accion) => {
        setError("");
        setCargando(true);
        try {
            await accion();
            navigate("/dashboard");
        } catch (err) {
            setError(err.message || "No se pudo iniciar sesión.");
        } finally {
            setCargando(false);
        }
    };

    // Comprobación en el navegador ANTES de llamar a la API (SPEC-021 P3-12).
    // Antes, enviar el formulario vacío gastaba un viaje completo al servidor
    // para volver con "Faltan credenciales", y el niño esperaba a la red para
    // enterarse de algo que ya se sabía aquí.
    //
    // Se conserva `noValidate` a propósito: la validación nativa del navegador
    // dibuja burbujas del sistema operativo, con su propio idioma y su propia
    // estética, dentro de una app pensada para niños de 6-9 años. El aviso se
    // pinta en el mismo `.login-error` (con `role="alert"`) que ya usa el
    // resto de la pantalla, así que se anuncia y se ve igual que los demás.
    // Los campos llevan `required` para que un lector de pantalla los anuncie
    // como obligatorios; `noValidate` impide que además salga la burbuja.
    const faltan = (mensaje) => {
        setError(mensaje);
        return true;
    };

    const handleEstudiante = (e) => {
        e.preventDefault();
        if (!nombre.trim()) return faltan('Escribe tu nombre completo para entrar.');
        // El PIN siempre tiene 6 caracteres (el campo ya no deja escribir más),
        // así que uno más corto es un error seguro: no hace falta preguntarlo.
        if (pin.trim().length !== 6) return faltan('Tu PIN son 6 letras o números. Escríbelo completo.');
        ejecutar(() => authService.loginEstudiante(nombre.trim(), pin.trim()));
    };

    const handleDocente = (e) => {
        e.preventDefault();
        if (!username.trim()) return faltan('Escribe tu usuario.');
        if (!password) return faltan('Escribe tu contraseña.');
        ejecutar(() => authService.login(username.trim(), password));
    };

    const handleEmergencia = (e) => {
        e.preventDefault();
        if (!nombre.trim()) return faltan('Escribe tu nombre completo.');
        if (!codigoEmergencia.trim()) return faltan('Escribe el código de emergencia de tu carné.');
        ejecutar(async () => {
            const data = await authService.loginEmergencia(nombre.trim(), codigoEmergencia.trim());
            // El aviso importa (p. ej. cambiar el PIN tras la emergencia):
            // dura más de lo normal y también puede cerrarse a mano.
            if (data.aviso) toast.aviso(data.aviso, { duracion: 12000 });
        });
    };

    const cambiarModo = (nuevo) => {
        setModo(nuevo);
        setError("");
        setMostrarAyudaPin(false);
    };

    return(
        <div className="login-page">
            {/* Formas suaves de fondo: dan identidad sin distraer del formulario */}
            <div className="login-fondo" aria-hidden="true">
                <span className="login-burbuja login-burbuja-1" />
                <span className="login-burbuja login-burbuja-2" />
                <span className="login-burbuja login-burbuja-3" />
            </div>

            <main className="login-centro">
                <div className="login-brand">
                    {institucion?.logo_data
                        ? <img className="login-brand-logo" src={institucion.logo_data} alt="" />
                        : <span className="login-brand-icon"><SchoolRoundedIcon /></span>}
                    <span className="login-brand-nombre">GamificApp</span>
                </div>

                <div className="login-card">
                    <header className="login-bienvenida">
                        <h1>Bienvenido a GamificApp</h1>
                        <p className="login-card-sub">Aprende con retos, misiones y actividades interactivas.</p>
                    </header>

                    {error && <div className="login-error" role="alert">{error}</div>}

                    <div className="login-role">
                        <span className="login-role-label">Selecciona tu perfil para continuar</span>
                        {/* aria-pressed: el perfil elegido se distinguía SOLO por color, así
                            que era invisible para lectores de pantalla. Es el mismo arreglo
                            que SPEC-018 aplicó a las pestañas `.opcion` del estudiante. */}
                        <div className="login-role-options">
                            <button
                                type="button"
                                className={`login-role-card ${modo === "estudiante" || modo === "emergencia" ? "active" : ""}`}
                                aria-pressed={modo === "estudiante" || modo === "emergencia"}
                                onClick={() => cambiarModo("estudiante")}
                            >
                                <span className="login-role-emoji" aria-hidden="true">🎒</span>
                                <strong>Estudiante</strong>
                                <span className="login-role-desc">Ingresa con tu nombre y tu PIN</span>
                            </button>
                            <button
                                type="button"
                                className={`login-role-card ${modo === "docente" ? "active" : ""}`}
                                aria-pressed={modo === "docente"}
                                onClick={() => cambiarModo("docente")}
                            >
                                <span className="login-role-emoji" aria-hidden="true">📗</span>
                                <strong>Docente</strong>
                                <span className="login-role-desc">Ingresa con tu usuario y contraseña</span>
                            </button>
                        </div>
                    </div>

                    {modo === "estudiante" && (
                        <form onSubmit={handleEstudiante} noValidate autoComplete="off">
                            <label className="login-field">
                                <span>Tu nombre completo</span>
                                <input
                                    type="text"
                                    value={nombre}
                                    onChange={(e)=>setNombre(e.target.value)}
                                    placeholder="Ana María Pérez"
                                    required
                                />
                            </label>
                            <label className="login-field">
                                <span>Tu PIN (6 letras o números)</span>
                                {/* Mostrar/ocultar como en la contraseña del docente: un niño
                                    de 6-9 años necesita poder comprobar lo que teclea, y su
                                    error más probable es justo escribir mal el PIN. Reutiliza
                                    .login-password/.login-eye; no cambia qué se envía. */}
                                <div className="login-password">
                                    <input
                                        type={showPin ? 'text' : 'password'}
                                        value={pin}
                                        onChange={(e)=>setPin(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6))}
                                        placeholder="••••••"
                                        required
                                    />
                                    <button
                                        type="button"
                                        className="login-eye"
                                        aria-label={showPin ? 'Ocultar mi PIN' : 'Ver mi PIN'}
                                        onClick={() => setShowPin((v) => !v)}
                                    >
                                        {showPin ? <VisibilityOff /> : <Visibility />}
                                    </button>
                                </div>
                            </label>
                            <button type="submit" className="login-submit" disabled={cargando}>
                                {cargando ? 'Un momento…' : 'Ingresar'}
                            </button>

                            <div className="login-links">
                                {/* Disclosure (RC 1.0 · P2-3): el estado abierto/cerrado se
                                    comunicaba solo por la aparición del bloque de ayuda, que un
                                    lector de pantalla no relaciona con este botón. `aria-controls`
                                    solo viaja cuando la región existe, para no dejar una
                                    referencia colgada mientras está cerrada. */}
                                <button
                                    type="button"
                                    className="login-link"
                                    onClick={() => setMostrarAyudaPin((v) => !v)}
                                    aria-expanded={mostrarAyudaPin}
                                    aria-controls={mostrarAyudaPin ? 'login-ayuda-pin' : undefined}
                                >
                                    ¿Olvidaste tu PIN?
                                </button>
                                <Link className="login-link" to="/registro">¿Primera vez? Regístrate con tu código</Link>
                            </div>

                            {mostrarAyudaPin && (
                                <div className="login-ayuda-pin" id="login-ayuda-pin">
                                    <p>
                                        Tu PIN es tu <strong>fecha de nacimiento</strong>: día, mes y año,
                                        con dos números cada uno. Si naciste el 15 de marzo de 2017,
                                        tu PIN es <strong>150317</strong>.
                                    </p>
                                    <p>
                                        ¿Lo cambiaste y no lo recuerdas? Usa el
                                        {' '}<button type="button" className="login-link" onClick={() => cambiarModo("emergencia")}>
                                            código de emergencia
                                        </button>{' '}
                                        de tu carné, o pídele a tu docente que lo restablezca.
                                    </p>
                                </div>
                            )}
                        </form>
                    )}

                    {modo === "emergencia" && (
                        <form onSubmit={handleEmergencia} noValidate autoComplete="off">
                            <p className="login-emergencia-titulo">🛟 Entrada de emergencia: usa el código que está en tu carné.</p>
                            <label className="login-field">
                                <span>Tu nombre completo</span>
                                <input
                                    type="text"
                                    value={nombre}
                                    onChange={(e)=>setNombre(e.target.value)}
                                    placeholder="Ana María Pérez"
                                    required
                                />
                            </label>
                            <label className="login-field">
                                <span>Código de emergencia (en tu carné)</span>
                                <input
                                    type="text"
                                    value={codigoEmergencia}
                                    onChange={(e)=>setCodigoEmergencia(e.target.value.toUpperCase().slice(0, 8))}
                                    placeholder="ABC3X9F2"
                                    required
                                />
                            </label>
                            <button type="submit" className="login-submit" disabled={cargando}>
                                {cargando ? 'Verificando…' : 'Entrar con emergencia'}
                            </button>
                            <div className="login-links">
                                <button type="button" className="login-link" onClick={() => cambiarModo("estudiante")}>
                                    ← Volver al ingreso normal
                                </button>
                            </div>
                        </form>
                    )}

                    {modo === "docente" && (
                        <form onSubmit={handleDocente} noValidate autoComplete="off">
                            <label className="login-field">
                                <span>Usuario</span>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e)=>setUsername(e.target.value)}
                                    placeholder="usuario"
                                    required
                                />
                            </label>
                            <label className="login-field">
                                <span>Contraseña</span>
                                <div className="login-password">
                                    <input
                                        id={`${outlinedPasswordId}-input`}
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        required
                                    />
                                    <button
                                        type="button"
                                        className="login-eye"
                                        aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                        onClick={() => setShowPassword((show) => !show)}
                                    >
                                        {showPassword ? <VisibilityOff /> : <Visibility />}
                                    </button>
                                </div>
                            </label>
                            <button type="submit" className="login-submit" disabled={cargando}>
                                {cargando ? 'Verificando…' : 'Iniciar sesión'}
                            </button>
                            <p className="login-nota-docente">
                                Si olvidaste tu contraseña, contacta al administrador de la institución.
                            </p>
                        </form>
                    )}
                </div>

                {/* Puerta a la versión sin internet. Va en el pie y no en la
                    tarjeta a propósito: el camino principal de esta pantalla es
                    entrar, y quien descarga (el docente, el revisor) lo hace una
                    sola vez.
                    No se muestra si la aplicación YA se está ejecutando en local:
                    ofrecerle la descarga a quien ya la instaló sería ofrecerle lo
                    que tiene delante, y encima requeriría internet. */}
                {!ES_INSTALACION_LOCAL && (
                    <Link className="login-link login-descargar" to="/descargar">
                        gamificapp.com/descargar
                    </Link>
                )}

                <span className="login-pie">{institucion?.nombre || NOMBRE_INSTITUCION_DEFECTO}</span>
            </main>
        </div>
    )
}
