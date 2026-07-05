import { useState, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import SchoolRoundedIcon from '@mui/icons-material/SchoolRounded';
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded';
import './login.css';

export function Login(){
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [rol, setRol] = useState("estudiante");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const outlinedPasswordId = useId();
    const navigate = useNavigate();
    const handleSubmit = (e)=>{
        e.preventDefault();
        if(username === "admin" && password === "admin123"){
            setError("");
            localStorage.setItem("isAuthenticated", "true");
            localStorage.setItem("userRole", rol);
            // Vincula la sesión de estudiante con su fila en la BD central
            // (estudiante demo id 1 mientras no exista login por alumno).
            if (rol === "estudiante") {
                localStorage.setItem("edu_estudianteId", "1");
            } else {
                localStorage.removeItem("edu_estudianteId");
            }
            navigate("/dashboard");
        } else {
            setError("Usuario o contraseña incorrectos.");
        }
    }
    const handleClickShowPassword = () => setShowPassword((show) => !show);

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
                <form className="login-card" onSubmit={handleSubmit} noValidate autoComplete="off">
                    <h1>Inicio de Sesión</h1>
                    <p className="login-card-sub">Ingresa tus credenciales para continuar.</p>

                    {error && (
                        <div className="login-error" role="alert">{error}</div>
                    )}

                    <div className="login-role">
                        <span className="login-role-label">Ingresar como</span>
                        <div className="login-role-options">
                            <button
                                type="button"
                                className={`login-role-btn ${rol === "estudiante" ? "active" : ""}`}
                                onClick={() => setRol("estudiante")}
                            >
                                Estudiante
                            </button>
                            <button
                                type="button"
                                className={`login-role-btn ${rol === "docente" ? "active" : ""}`}
                                onClick={() => setRol("docente")}
                            >
                                Docente
                            </button>
                        </div>
                    </div>

                    <label className="login-field">
                        <span>Usuario</span>
                        <input
                            type="text"
                            value={username}
                            onChange={(e)=>{setUsername(e.target.value)}}
                            placeholder="admin"
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
                                onClick={handleClickShowPassword}
                            >
                                {showPassword ? <VisibilityOff /> : <Visibility />}
                            </button>
                        </div>
                    </label>

                    <button type="submit" className="login-submit">
                        Iniciar Sesión
                    </button>
                </form>
            </section>
        </div>
    )
}
