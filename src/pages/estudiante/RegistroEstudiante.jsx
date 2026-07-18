import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import SchoolRoundedIcon from '@mui/icons-material/SchoolRounded';
import CelebrationRoundedIcon from '@mui/icons-material/CelebrationRounded';
import '../admin/login.css';
import authService from '../../services/authService';
import { getInstitucionCache } from '../../services/institucionService';

// Primera entrada del estudiante. Dos caminos (SPEC-014):
//   · "Estoy en la lista de mi clase": su docente lo importó por Excel.
//     Curso → tocar su nombre → escribir su código → dentro.
//   · "Tengo un código de invitación": el registro clásico (se conserva).
// Al terminar, ambos muestran el PIN inicial (fecha de nacimiento) y el
// código de emergencia para que los anote ANTES de entrar a la plataforma.
// Comparte layout e identidad visual con el Login (login.css).
export function RegistroEstudiante() {
    const [modo, setModo] = useState('lista');            // lista | invitacion

    // Camino "lista de mi clase".
    const [cursos, setCursos] = useState([]);
    const [cursoId, setCursoId] = useState('');
    const [pendientes, setPendientes] = useState([]);
    const [filtro, setFiltro] = useState('');
    const [seleccionado, setSeleccionado] = useState(null); // { estudiante_id, nombre }
    const [codigoActivacion, setCodigoActivacion] = useState('');

    // Camino "código de invitación" (flujo clásico).
    const [nombre, setNombre] = useState('');
    const [fechaNacimiento, setFechaNacimiento] = useState('');
    const [codigo, setCodigo] = useState('');

    const [error, setError] = useState('');
    const [cargando, setCargando] = useState(false);
    // Tras entrar: { pin, codigo_emergencia, usuario } (+ título según camino).
    const [credenciales, setCredenciales] = useState(null);
    const navigate = useNavigate();

    // Cursos con estudiantes por activar (público, mínimo: id + etiqueta).
    useEffect(() => {
        if (modo !== 'lista') return;
        authService.cursosPendientes().then(setCursos).catch(() => setCursos([]));
    }, [modo]);

    // Nombres pendientes del curso elegido (público, mínimo: id + nombre).
    useEffect(() => {
        if (!cursoId) return;
        authService.estudiantesPendientes(cursoId).then(setPendientes).catch(() => setPendientes([]));
    }, [cursoId]);

    // Cambiar de curso reinicia la selección (los resets van en el evento,
    // no en el efecto, para no encadenar renders).
    const elegirCurso = (id) => {
        setCursoId(id);
        setPendientes([]);
        setSeleccionado(null);
        setFiltro('');
    };

    const handleActivar = async (e) => {
        e.preventDefault();
        setError('');
        setCargando(true);
        try {
            const data = await authService.activarEstudiante(
                seleccionado.estudiante_id,
                codigoActivacion.trim().toUpperCase()
            );
            setCredenciales({ ...data, titulo: '¡Ya puedes entrar!' });
        } catch (err) {
            setError(err.message || 'No se pudo entrar. Inténtalo de nuevo.');
        } finally {
            setCargando(false);
        }
    };

    const handleRegistro = async (e) => {
        e.preventDefault();
        setError('');
        setCargando(true);
        try {
            const data = await authService.registrarEstudiante({
                nombre: nombre.trim(),
                fechaNacimiento,
                codigo: codigo.trim().toUpperCase()
            });
            setCredenciales({ ...data, titulo: '¡Cuenta creada!' });
        } catch (err) {
            setError(err.message || 'No se pudo completar el registro.');
        } finally {
            setCargando(false);
        }
    };

    const cambiarModo = (nuevo) => {
        setModo(nuevo);
        setError('');
    };

    const nombresVisibles = pendientes.filter((p) =>
        p.nombre.toLowerCase().includes(filtro.trim().toLowerCase()));

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
                    {credenciales ? (
                        <>
                            <header className="login-bienvenida">
                                <h1><CelebrationRoundedIcon sx={{ verticalAlign: 'middle' }} /> {credenciales.titulo}</h1>
                                <p className="login-card-sub">Anota estos datos en tu cuaderno o carné. Los necesitarás para entrar.</p>
                            </header>

                            <div className="registro-credenciales">
                                <h3>Mis datos para entrar</h3>
                                <div className="cred-dato">
                                    <span>Mi nombre:</span>
                                    <strong>{credenciales.usuario?.nombre_completo}</strong>
                                </div>
                                {credenciales.pin && (
                                    <div className="cred-dato">
                                        <span>Mi PIN (mi fecha de nacimiento):</span>
                                        <strong>{credenciales.pin}</strong>
                                    </div>
                                )}
                                {credenciales.codigo_emergencia && (
                                    <div className="cred-dato">
                                        <span>Código de emergencia:</span>
                                        <strong>{credenciales.codigo_emergencia}</strong>
                                    </div>
                                )}
                            </div>

                            <button className="login-submit" onClick={() => navigate('/dashboard')}>
                                ¡Ya los anoté, quiero empezar!
                            </button>
                        </>
                    ) : (
                        <>
                            <header className="login-bienvenida">
                                <h1>Entrar por primera vez</h1>
                                <p className="login-card-sub">
                                    {modo === 'lista'
                                        ? 'Si tu profe ya te apuntó, búscate en tu clase.'
                                        : 'Necesitas el código de invitación que te dio tu docente.'}
                                </p>
                            </header>

                            <div className="registro-modos" role="tablist" aria-label="Cómo quieres entrar">
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={modo === 'lista'}
                                    className={`registro-modo ${modo === 'lista' ? 'is-activo' : ''}`}
                                    onClick={() => cambiarModo('lista')}
                                >
                                    📋 Estoy en la lista de mi clase
                                </button>
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={modo === 'invitacion'}
                                    className={`registro-modo ${modo === 'invitacion' ? 'is-activo' : ''}`}
                                    onClick={() => cambiarModo('invitacion')}
                                >
                                    ✉️ Tengo un código de invitación
                                </button>
                            </div>

                            {error && <div className="login-error" role="alert">{error}</div>}

                            {modo === 'lista' && (
                                <form onSubmit={handleActivar} noValidate autoComplete="off">
                                    <label className="login-field">
                                        <span>¿En qué curso estás?</span>
                                        <select value={cursoId} onChange={(e) => elegirCurso(e.target.value)}>
                                            <option value="">Toca para elegir tu curso…</option>
                                            {cursos.map((c) => (
                                                <option key={c.id} value={c.id}>{c.etiqueta}</option>
                                            ))}
                                        </select>
                                    </label>
                                    {cursoId && !seleccionado && (
                                        <div className="login-field">
                                            <span>Busca tu nombre y tócalo</span>
                                            {pendientes.length > 8 && (
                                                <input
                                                    type="search"
                                                    className="act-buscador"
                                                    placeholder="Escribe tu nombre…"
                                                    value={filtro}
                                                    onChange={(e) => setFiltro(e.target.value)}
                                                />
                                            )}
                                            <div className="act-nombres" role="listbox" aria-label="Estudiantes de tu curso">
                                                {nombresVisibles.map((p) => (
                                                    <button
                                                        key={p.estudiante_id}
                                                        type="button"
                                                        className="act-nombre"
                                                        onClick={() => { setSeleccionado(p); setError(''); }}
                                                    >
                                                        {p.nombre}
                                                    </button>
                                                ))}
                                                {!nombresVisibles.length && (
                                                    <p className="act-vacio">
                                                        {pendientes.length
                                                            ? 'No encontramos ese nombre. Revisa cómo lo escribiste.'
                                                            : 'No hay nadie por entrar en este curso. Pregúntale a tu profe.'}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    {seleccionado && (
                                        <>
                                            <div className="act-elegido">
                                                <span>Hola, <strong>{seleccionado.nombre}</strong> 👋</span>
                                                <button type="button" className="login-link" onClick={() => { setSeleccionado(null); setCodigoActivacion(''); }}>
                                                    No soy yo
                                                </button>
                                            </div>
                                            <label className="login-field">
                                                <span>Escribe tu código secreto (te lo dio tu profe)</span>
                                                <input
                                                    type="text"
                                                    value={codigoActivacion}
                                                    onChange={(e) => setCodigoActivacion(e.target.value.toUpperCase().slice(0, 6))}
                                                    placeholder="AB3X9F"
                                                    autoFocus
                                                />
                                            </label>
                                            <button type="submit" className="login-submit" disabled={cargando || codigoActivacion.length < 6}>
                                                {cargando ? 'Un momento…' : '¡Entrar por primera vez!'}
                                            </button>
                                        </>
                                    )}
                                    <div className="login-links">
                                        <Link className="login-link" to="/">← Ya tengo cuenta, quiero entrar</Link>
                                    </div>
                                </form>
                            )}

                            {modo === 'invitacion' && (
                                <form onSubmit={handleRegistro} noValidate autoComplete="off">
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
                            )}
                        </>
                    )}
                </div>

                <span className="login-pie">{getInstitucionCache()?.nombre || 'GamificApp'}</span>
            </main>
        </div>
    );
}
