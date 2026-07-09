import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import SchoolRoundedIcon from '@mui/icons-material/SchoolRounded';
import CelebrationRoundedIcon from '@mui/icons-material/CelebrationRounded';
import '../admin/login.css';
import authService from '../../services/authService';

// Registro de estudiante con código de invitación del docente.
// Al terminar muestra el PIN inicial (su fecha de nacimiento) y el código
// de emergencia para que los anote ANTES de entrar a la plataforma.
// Comparte layout e identidad visual con el Login (login.css).
export function RegistroEstudiante() {
    const [nombre, setNombre] = useState('');
    const [fechaNacimiento, setFechaNacimiento] = useState('');
    const [codigo, setCodigo] = useState('');
    const [error, setError] = useState('');
    const [cargando, setCargando] = useState(false);
    // Tras registrarse: { pin, codigo_emergencia }
    const [credenciales, setCredenciales] = useState(null);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setCargando(true);
        try {
            const data = await authService.registrarEstudiante({
                nombre: nombre.trim(),
                fechaNacimiento,
                codigo: codigo.trim().toUpperCase()
            });
            setCredenciales(data);
        } catch (err) {
            setError(err.message || 'No se pudo completar el registro.');
        } finally {
            setCargando(false);
        }
    };

    return (
        <div className="login-page">
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
                    {!credenciales ? (
                        <>
                            <header className="login-bienvenida">
                                <h1>Crear mi cuenta</h1>
                                <p className="login-card-sub">Necesitas el código de invitación que te dio tu docente.</p>
                            </header>

                            {error && <div className="login-error" role="alert">{error}</div>}

                            <form onSubmit={handleSubmit} noValidate autoComplete="off">
                                <label className="login-field">
                                    <span>Tu nombre completo</span>
                                    <input
                                        type="text"
                                        value={nombre}
                                        onChange={(e) => setNombre(e.target.value)}
                                        placeholder="Ana María Pérez"
                                    />
                                </label>
                                <label className="login-field">
                                    <span>Tu fecha de nacimiento</span>
                                    <input
                                        type="date"
                                        value={fechaNacimiento}
                                        onChange={(e) => setFechaNacimiento(e.target.value)}
                                    />
                                </label>
                                <label className="login-field">
                                    <span>Código de invitación</span>
                                    <input
                                        type="text"
                                        value={codigo}
                                        onChange={(e) => setCodigo(e.target.value.toUpperCase().slice(0, 6))}
                                        placeholder="AB3X9F"
                                    />
                                </label>
                                <button type="submit" className="login-submit" disabled={cargando}>
                                    {cargando ? 'Creando cuenta…' : 'Registrarme'}
                                </button>
                                <div className="login-links">
                                    <Link className="login-link" to="/">← Ya tengo cuenta, quiero entrar</Link>
                                </div>
                            </form>
                        </>
                    ) : (
                        <>
                            <header className="login-bienvenida">
                                <h1><CelebrationRoundedIcon sx={{ verticalAlign: 'middle' }} /> ¡Cuenta creada!</h1>
                                <p className="login-card-sub">Anota estos datos en tu cuaderno o carné. Los necesitarás para entrar.</p>
                            </header>

                            <div className="registro-credenciales">
                                <h3>Mis datos para entrar</h3>
                                <div className="cred-dato">
                                    <span>Mi nombre:</span>
                                    <strong>{credenciales.usuario?.nombre_completo}</strong>
                                </div>
                                <div className="cred-dato">
                                    <span>Mi PIN (mi fecha de nacimiento):</span>
                                    <strong>{credenciales.pin}</strong>
                                </div>
                                <div className="cred-dato">
                                    <span>Código de emergencia:</span>
                                    <strong>{credenciales.codigo_emergencia}</strong>
                                </div>
                            </div>

                            <button className="login-submit" onClick={() => navigate('/dashboard')}>
                                ¡Ya los anoté, quiero empezar!
                            </button>
                        </>
                    )}
                </div>

                <span className="login-pie">Unidad Educativa Fiscal Clemencia Coronel de Pincay</span>
            </main>
        </div>
    );
}
