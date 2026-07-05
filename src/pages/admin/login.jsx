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
//   · Estudiante → nombre completo + PIN de 6 dígitos
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
            <aside className="login-aside">
                <div className="login-brand">
                    <SchoolRoundedIcon className="login-brand-icon" />
                    <span>GamificApp</span>
                </div>
                <div className="login-aside-body">
                    <h2>Aprender también<br/>se siente como ganar.</h2>
                    <p>Plataforma de gamificación educativa para la Unidad Educativa Benemérita Sociedad Filantrópica del Guayas.</p>
                    <div className="login-badge">
                        <EmojiEventsRoundedIcon />
                        <span>Logros, misiones y rankings para motivar a cada estudiante.</span>
                    </div>
                </div>
                <span className="login-aside-foot">Unidad Educativa · Plataforma docente</span>
            </aside>

            <section className="login-form-wrap">
                <div className="login-card">
                    <h1>Inicio de Sesión</h1>
                    <p className="login-card-sub">Ingresa tus credenciales para continuar.</p>

                    {error && <div className="login-error" role="alert">{error}</div>}
                    {aviso && <div className="login-badge" role="status">{aviso}</div>}

                    <div className="login-role">
                        <span className="login-role-label">Soy</span>
                        <div className="login-role-options">
                            <button
                                type="button"
                                className={`login-role-btn ${modo !== "docente" ? "active" : ""}`}
                                onClick={() => cambiarModo("estudiante")}
                            >
                                Estudiante
                            </button>
                            <button
                                type="button"
                                className={`login-role-btn ${modo === "docente" ? "active" : ""}`}
                                onClick={() => cambiarModo("docente")}
                            >
                                Docente
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
                                <span>Tu PIN (6 números)</span>
                                <input
                                    type="password"
                                    inputMode="numeric"
                                    value={pin}
                                    onChange={(e)=>setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="••••••"
                                />
                            </label>
                            <button type="submit" className="login-submit" disabled={cargando}>
                                {cargando ? 'Verificando…' : 'Entrar'}
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
            </section>
        </div>
    )
}
