import { useState, useId } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import SchoolRoundedIcon from '@mui/icons-material/SchoolRounded';
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded';
import './login.css';
import authService from '../../services/authService';

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
    const [error, setError] = useState("");
    const [aviso, setAviso] = useState("");
    const [mostrarAyudaPin, setMostrarAyudaPin] = useState(false);
    const [cargando, setCargando] = useState(false);
    const outlinedPasswordId = useId();
    const navigate = useNavigate();

    const ejecutar = async (accion) => {
        setError("");
        setAviso("");
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

    const handleEstudiante = (e) => {
        e.preventDefault();
        ejecutar(() => authService.loginEstudiante(nombre.trim(), pin.trim()));
    };

    const handleDocente = (e) => {
        e.preventDefault();
        ejecutar(() => authService.login(username.trim(), password));
    };

    const handleEmergencia = (e) => {
        e.preventDefault();
        ejecutar(async () => {
            const data = await authService.loginEmergencia(nombre.trim(), codigoEmergencia.trim());
            if (data.aviso) window.alert(data.aviso);
        });
    };

    const cambiarModo = (nuevo) => {
        setModo(nuevo);
        setError("");
        setAviso("");
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
                    <span className="login-brand-icon"><SchoolRoundedIcon /></span>
                    <span className="login-brand-nombre">GamificApp</span>
                </div>

                <div className="login-card">
                    <header className="login-bienvenida">
                        <h1>¡Hola! 👋 Qué bueno verte</h1>
                        <p className="login-card-sub">Aquí se aprende jugando: quizzes, misiones e insignias te esperan.</p>
                    </header>

                    {error && <div className="login-error" role="alert">{error}</div>}
                    {aviso && <div className="login-aviso" role="status"><EmojiEventsRoundedIcon /> {aviso}</div>}

                    <div className="login-role">
                        <span className="login-role-label">¿Quién entra hoy?</span>
                        <div className="login-role-options">
                            <button
                                type="button"
                                className={`login-role-card ${modo !== "docente" ? "active" : ""}`}
                                onClick={() => cambiarModo("estudiante")}
                            >
                                <span className="login-role-emoji" aria-hidden="true">🎒</span>
                                <strong>Estudiante</strong>
                                <span className="login-role-desc">Entro con mi nombre y mi PIN</span>
                            </button>
                            <button
                                type="button"
                                className={`login-role-card ${modo === "docente" ? "active" : ""}`}
                                onClick={() => cambiarModo("docente")}
                            >
                                <span className="login-role-emoji" aria-hidden="true">📗</span>
                                <strong>Docente</strong>
                                <span className="login-role-desc">Entro con mi usuario y contraseña</span>
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
                                />
                            </label>
                            <label className="login-field">
                                <span>Tu PIN (6 letras o números)</span>
                                <input
                                    type="password"
                                    value={pin}
                                    onChange={(e)=>setPin(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6))}
                                    placeholder="••••••"
                                />
                            </label>
                            <button type="submit" className="login-submit" disabled={cargando}>
                                {cargando ? 'Un momento…' : '¡Entrar a jugar!'}
                            </button>

                            <div className="login-links">
                                <button type="button" className="login-link" onClick={() => setMostrarAyudaPin((v) => !v)}>
                                    ¿Olvidaste tu PIN?
                                </button>
                                <Link className="login-link" to="/registro">¿Primera vez? Regístrate con tu código</Link>
                            </div>

                            {mostrarAyudaPin && (
                                <div className="login-ayuda-pin">
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
                                />
                            </label>
                            <label className="login-field">
                                <span>Código de emergencia (en tu carné)</span>
                                <input
                                    type="text"
                                    value={codigoEmergencia}
                                    onChange={(e)=>setCodigoEmergencia(e.target.value.toUpperCase().slice(0, 8))}
                                    placeholder="ABC3X9F2"
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
                                {cargando ? 'Verificando…' : 'Iniciar Sesión'}
                            </button>
                        </form>
                    )}
                </div>

                <span className="login-pie">Unidad Educativa Fiscal Clemencia Coronel de Pincay</span>
            </main>
        </div>
    )
}
