import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import SchoolRoundedIcon from '@mui/icons-material/SchoolRounded';
import CelebrationRoundedIcon from '@mui/icons-material/CelebrationRounded';
import '../admin/login.css';
import authService from '../../services/authService';
import { getInstitucionCache } from '../../services/institucionService';

// Primera entrada del estudiante (SPEC-014): su docente lo importó por Excel
// o lo dio de alta a mano. Curso → tocar su nombre → escribir su código
// individual → dentro.
//
// Aquí hubo un segundo camino, "Tengo un código de invitación", que se
// conservaba por la decisión nº 13 de SPEC-014. Se retiró: esa misma spec
// quitó de la interfaz la generación de códigos de invitación, así que ya no
// había forma de conseguir uno y la pestaña llevaba a un formulario que nadie
// podía completar. El backend (`POST /api/auth/registro-estudiante`) y los
// datos siguen intactos.
//
// Al terminar se muestran el PIN inicial (fecha de nacimiento) y el código de
// emergencia para que los anote ANTES de entrar a la plataforma.
// Comparte layout e identidad visual con el Login (login.css).
export function RegistroEstudiante() {
    const [cursos, setCursos] = useState([]);
    const [cursoId, setCursoId] = useState('');
    const [pendientes, setPendientes] = useState([]);
    const [filtro, setFiltro] = useState('');
    const [seleccionado, setSeleccionado] = useState(null); // { estudiante_id, nombre }
    const [codigoActivacion, setCodigoActivacion] = useState('');

    const [error, setError] = useState('');
    const [cargando, setCargando] = useState(false);
    // Tras entrar: { pin, codigo_emergencia, usuario }.
    const [credenciales, setCredenciales] = useState(null);
    const navigate = useNavigate();

    // Estado de las dos cargas públicas de esta pantalla (SPEC-021 P1-1 y
    // P1-1-bis): 'cargando' | 'listo' | 'error'. Es la primerísima pantalla
    // del producto y el día de más concurrencia; antes el `.catch()` vaciaba
    // la lista, así que un fallo de red y "todavía no hay nadie" se veían
    // exactamente igual: un desplegable muerto, sin explicación, y un mensaje
    // que mandaba al niño a molestar al docente cuando no pasaba nada.
    const [estadoCursos, setEstadoCursos] = useState('cargando');
    const [estadoPendientes, setEstadoPendientes] = useState('listo');
    const [intento, setIntento] = useState(0);
    const reintentar = () => {
        setEstadoCursos('cargando');
        if (cursoId) setEstadoPendientes('cargando');
        setIntento((n) => n + 1);
    };

    // Cursos con estudiantes por activar (público, mínimo: id + etiqueta).
    useEffect(() => {
        let vigente = true;
        authService.cursosPendientes()
            .then((lista) => {
                if (!vigente) return;
                setCursos(lista);
                setEstadoCursos('listo');
            })
            .catch(() => { if (vigente) setEstadoCursos('error'); });
        return () => { vigente = false; };
    }, [intento]);

    // Nombres pendientes del curso elegido (público, mínimo: id + nombre).
    useEffect(() => {
        if (!cursoId) return undefined;
        let vigente = true;
        authService.estudiantesPendientes(cursoId)
            .then((lista) => {
                if (!vigente) return;
                setPendientes(lista);
                setEstadoPendientes('listo');
            })
            .catch(() => { if (vigente) setEstadoPendientes('error'); });
        return () => { vigente = false; };
    }, [cursoId, intento]);

    // Cambiar de curso reinicia la selección (los resets van en el evento,
    // no en el efecto, para no encadenar renders).
    const elegirCurso = (id) => {
        setCursoId(id);
        setPendientes([]);
        setEstadoPendientes(id ? 'cargando' : 'listo');
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
            setCredenciales(data);
        } catch (err) {
            setError(err.message || 'No se pudo entrar. Inténtalo de nuevo.');
        } finally {
            setCargando(false);
        }
    };

    // --- Conservar las credenciales (SPEC-021 P1-2, parte de bajo riesgo) ---
    const [copiado, setCopiado] = useState(false);

    // navigator.clipboard NO existe fuera de un contexto seguro, y la
    // instalación offline se sirve por http://<IP-del-aula>: en cualquier
    // tablet que no sea el propio equipo servidor la API moderna es undefined y
    // este botón no funcionaría jamás. execCommand está obsoleto, pero es
    // exactamente el que sigue vivo ahí, así que se intenta antes de rendirse.
    // Se llama desde un manejador de clic, que es lo que exige el navegador.
    const copiarTexto = async (texto) => {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(texto);
            return;
        }
        const area = document.createElement('textarea');
        area.value = texto;
        area.setAttribute('readonly', '');   // sin teclado emergente en tablet
        area.style.position = 'fixed';
        area.style.top = '-1000px';          // fuera de la vista, pero en el DOM
        document.body.appendChild(area);
        try {
            area.select();
            if (!document.execCommand('copy')) throw new Error('El navegador no permitio copiar.');
        } finally {
            document.body.removeChild(area);
        }
    };

    const copiarCredenciales = async () => {
        if (!credenciales) return;
        const lineas = [
            'Mis datos para entrar a GamificApp',
            `Mi nombre: ${credenciales.usuario?.nombre_completo || ''}`,
            credenciales.pin ? `Mi PIN: ${credenciales.pin}` : null,
            credenciales.codigo_emergencia ? `Código de emergencia: ${credenciales.codigo_emergencia}` : null
        ].filter(Boolean).join('\n');
        try {
            await copiarTexto(lineas);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 3000);
        } catch {
            // Sin permiso de portapapeles (o navegador antiguo): no se finge
            // que funcionó. Los datos siguen en pantalla para copiarlos a mano.
            setError('No pudimos copiarlos. Anótalos de tu pantalla, por favor.');
        }
    };

    // Aviso al cerrar o recargar mientras las credenciales están a la vista:
    // el código de activación YA se consumió, así que esta pantalla no se
    // puede volver a pedir.
    useEffect(() => {
        if (!credenciales) return undefined;
        const alSalir = (e) => {
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', alSalir);
        return () => window.removeEventListener('beforeunload', alSalir);
    }, [credenciales]);

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
                                <h1><CelebrationRoundedIcon sx={{ verticalAlign: 'middle' }} /> ¡Ya puedes entrar!</h1>
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

                            {/* Copiar e imprimir (SPEC-021 P1-2, parte de bajo
                                riesgo). Estos dos datos se muestran UNA sola vez y
                                se le pide a un niño de 6-9 años que los transcriba a
                                mano bajo presión; si cierra la pestaña aquí, su
                                cuenta ya está activa pero el camino por el que entró
                                ya no existe. No se toca autenticación: solo se le dan
                                dos formas más de conservarlos. */}
                            <div className="cred-acciones">
                                <button type="button" className="login-link" onClick={copiarCredenciales}>
                                    {copiado ? '✅ ¡Copiado!' : '📋 Copiar mis datos'}
                                </button>
                                <button type="button" className="login-link" onClick={() => window.print()}>
                                    🖨️ Imprimir
                                </button>
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
                                    Si tu profe ya te apuntó, búscate en tu clase.
                                </p>
                            </header>

                            {error && <div className="login-error" role="alert">{error}</div>}

                            <form onSubmit={handleActivar} noValidate autoComplete="off">
                                <label className="login-field">
                                    <span>¿En qué curso estás?</span>
                                    {/* El desplegable se deshabilita mientras no haya nada
                                        que elegir, y debajo se dice POR QUÉ. Antes quedaba
                                        vacío y activo, indistinguible de un fallo de red. */}
                                    <select
                                        value={cursoId}
                                        onChange={(e) => elegirCurso(e.target.value)}
                                        disabled={estadoCursos !== 'listo' || cursos.length === 0}
                                    >
                                        <option value="">
                                            {estadoCursos === 'cargando'
                                                ? 'Buscando los cursos…'
                                                : estadoCursos === 'error'
                                                    ? 'No pudimos cargar los cursos'
                                                    : cursos.length === 0
                                                        ? 'Todavía no hay cursos preparados'
                                                        : 'Toca para elegir tu curso…'}
                                        </option>
                                        {cursos.map((c) => (
                                            <option key={c.id} value={c.id}>{c.etiqueta}</option>
                                        ))}
                                    </select>
                                </label>
                                {estadoCursos === 'error' && (
                                    <p className="registro-aviso" role="alert">
                                        No pudimos conectarnos. Revisa el internet y toca{' '}
                                        <button type="button" className="login-link" onClick={reintentar}>
                                            Intentar de nuevo
                                        </button>.
                                    </p>
                                )}
                                {/* Ya no se ofrece "usa la otra opción": el camino por
                                    código de invitación se retiró y mandaba al niño a un
                                    formulario que no podía completar. */}
                                {estadoCursos === 'listo' && cursos.length === 0 && (
                                    <p className="registro-aviso" role="status">
                                        Tu profe aún no ha preparado la lista de tu clase.
                                        Pídele que te apunte y vuelve a intentarlo.
                                    </p>
                                )}
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
                                        {/* Sin `role="listbox"`: sus hijos son <button>, no
                                            `role="option"`, así que un lector de pantalla
                                            anunciaba un cuadro de lista SIN opciones y el
                                            niño con lector no encontraba su nombre
                                            (SPEC-021 P2-9). Un grupo de botones con nombre
                                            accesible describe exactamente lo que es. */}
                                        <div className="act-nombres" role="group" aria-label="Estudiantes de tu curso">
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
                                            {/* Cuatro situaciones distintas que antes se
                                                contaban como una sola (P1-1). */}
                                            {!nombresVisibles.length && (
                                                estadoPendientes === 'cargando' ? (
                                                    <p className="act-vacio" role="status">Buscando los nombres de tu clase…</p>
                                                ) : estadoPendientes === 'error' ? (
                                                    <p className="act-vacio" role="alert">
                                                        No pudimos traer la lista. Revisa el internet y toca{' '}
                                                        <button type="button" className="login-link" onClick={reintentar}>
                                                            Intentar de nuevo
                                                        </button>.
                                                    </p>
                                                ) : pendientes.length ? (
                                                    <p className="act-vacio">No encontramos ese nombre. Revisa cómo lo escribiste.</p>
                                                ) : (
                                                    <p className="act-vacio">No hay nadie por entrar en este curso. Pregúntale a tu profe.</p>
                                                )
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
                        </>
                    )}
                </div>

                <span className="login-pie">{getInstitucionCache()?.nombre || 'GamificApp'}</span>
            </main>
        </div>
    );
}
