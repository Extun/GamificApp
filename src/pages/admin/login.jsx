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
    const [showPassword, setShowPassword] = useState(false);
    const outlinedPasswordId = useId();
    const navigate = useNavigate();
    const handleSubmit = (e)=>{
        e.preventDefault();
        console.log("Iniciando sesión...");
        console.log("Usuario:", username);
        console.log("contraseña:", password);
        if(username === "admin" && password === "admin123"){
            console.log("Inicio de sesión exitoso.");
            navigate("/dashboard");
        } else {
            console.log("Nombre de usuario o contraseña incorrectos.");
        }
    }
    const handleClickShowPassword = () => setShowPassword((show) => !show);

    return(
        <div className="login-page">
            <aside className="login-aside">
                <div className="login-brand">
                    <SchoolRoundedIcon className="login-brand-icon" />
                    <span>EduGamifica</span>
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
