import { useEffect, useRef, useState } from 'react';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import RocketLaunchRoundedIcon from '@mui/icons-material/RocketLaunchRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { publicarReto } from '../../services/retosService';
import { authFetch } from '../../services/authService';
import { idPorNombre } from '../../services/materiasService';
import docenteService from '../../services/docenteService';
import { DIFICULTADES_UI } from '../../components/juegos/GeneradorActividadIA';
import { useHistorialRetos, HistorialActividades } from '../../components/juegos/HistorialActividades';
import { PreviewJuegoModal } from '../../components/juegos/PreviewJuegoModal';
import { BarraAccionesEditor } from '../../components/juegos/BarraAccionesEditor';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import '../../components/mision/misionNarrativa.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const LETRAS = ['A', 'B', 'C'];
// Mínimo de desafíos que exige el validador del servidor (validadoresRetos.js).
const MIN_DESAFIOS = 3;

// Temáticas de aventura predefinidas: el docente elige una y la IA ambienta
// toda la historia en ese mundo.
const TEMATICAS = [
    { id: 'espacio', label: '🚀 Viaje espacial' },
    { id: 'piratas', label: '🏴‍☠️ Piratas y tesoros' },
    { id: 'cocina', label: '🍰 Cocina mágica' },
    { id: 'selva', label: '🦜 Expedición en la selva' },
    { id: 'castillo', label: '🏰 Castillo encantado' },
    { id: 'oceano', label: '🐠 Fondo del océano' }
];

// Plantilla de un desafío vacío para "Añadir desafío".
const desafioVacio = () => ({
    narrativa: '',
    pregunta: '',
    alternativas: { A: '', B: '', C: '' },
    correcta: 'A',
    pista: '',
    exito: ''
});

// ¿El desafío está completo según la misma regla del servidor?
const desafioCompleto = (d) =>
    d?.narrativa?.trim() && d?.pregunta?.trim() &&
    LETRAS.every((l) => (d?.alternativas?.[l] || '').trim()) &&
    LETRAS.includes(String(d?.correcta || '').trim().toUpperCase());

// Panel del docente para crear Misiones Narrativas con IA: elige el tema y la
// ambientación, EDITA la historia generada (SPEC-012 Fase 1: textos,
// alternativas, añadir/quitar desafíos, dificultad y curso) y la publica como
// reto tipo 'mision' (tabla `retos`, misma vía que quiz/clasificador).
export function GeneradorMision({ materia = 'la materia' }) {
    const [tema, setTema] = useState('');
    const [tematica, setTematica] = useState(TEMATICAS[0].id);
    const [mision, setMision] = useState(null);       // borrador en edición
    const [entradaId, setEntradaId] = useState(null); // id del reto en la BD
    const [publicada, setPublicada] = useState(false);
    // ¿La fila en BD está publicada? (los publicados no se editan en caliente).
    const [publicadoEnBD, setPublicadoEnBD] = useState(false);
    const [dificultad, setDificultad] = useState('media');
    const [cursoId, setCursoId] = useState('');
    const [cursos, setCursos] = useState([]);
    // SPEC-011 — historial respaldado en BD: cada misión generada nace como
    // reto 'borrador' (localStorage = caché offline); las ediciones de
    // borradores se sincronizan con PATCH (debounce).
    const { historial, crearBorrador, sincronizar, cancelarSincronizacion, eliminar: eliminarBorrador, abrirDetalle, refrescar } =
        useHistorialRetos('mision', materia);
    const [cargando, setCargando] = useState(false);
    const [guardando, setGuardando] = useState(false);
    // SPEC-013 Fase 2: la entrada "Generarla automáticamente" del menú lleva
    // al formulario de IA (hasta que la Fase 7 lo convierta en modal).
    const temaRef = useRef(null);
    const irAlFormularioIA = () => {
        temaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        temaRef.current?.focus({ preventScroll: true });
    };
    // SPEC-012: vista previa como estudiante (modo prueba).
    const [previewAbierta, setPreviewAbierta] = useState(false);
    const [error, setError] = useState('');
    const [aviso, setAviso] = useState('');

    useEffect(() => {
        docenteService.listarCursos().then(setCursos).catch(() => setCursos([]));
    }, []);

    const desafios = mision?.desafios || [];
    const xp = Math.max(desafios.length, 1) * 100;
    const listaParaPublicar = Boolean(
        mision?.titulo?.trim() && mision?.introduccion?.trim() && mision?.final?.trim() &&
        desafios.length >= MIN_DESAFIOS && desafios.every(desafioCompleto)
    );

    // Configuración publicable: la misión + metadatos aditivos para reabrirla
    // con sus parámetros (el reproductor los ignora).
    const configuracionActual = (m = mision) => ({ ...m, _tema: tema.trim(), _tematica: tematica });

    // Toda edición pasa por aquí: actualiza el estado, desbloquea Publicar y,
    // si la misión sigue siendo borrador en BD, sincroniza con PATCH (debounce).
    // Si ya está publicada, los cambios quedan en memoria hasta re-publicar.
    const editarMision = (cambio) => {
        setPublicada(false);
        setMision((prev) => {
            const actualizada = { ...prev, ...cambio };
            if (entradaId && !publicadoEnBD) {
                sincronizar(entradaId, {
                    titulo: actualizada.titulo,
                    configuracion: configuracionActual(actualizada),
                    xp_recompensa: Math.max((actualizada.desafios || []).length, 1) * 100
                });
            }
            return actualizada;
        });
    };

    const editarDesafio = (i, cambio) =>
        editarMision({ desafios: desafios.map((d, idx) => (idx === i ? { ...d, ...cambio } : d)) });

    const editarAlternativa = (i, letra, valor) =>
        editarDesafio(i, { alternativas: { ...desafios[i].alternativas, [letra]: valor } });

    const agregarDesafio = () => editarMision({ desafios: [...desafios, desafioVacio()] });

    const eliminarDesafio = (i) => {
        if (desafios.length <= MIN_DESAFIOS) return;
        editarMision({ desafios: desafios.filter((_, idx) => idx !== i) });
    };

    const handleGenerar = async (e) => {
        e.preventDefault();
        if (!tema.trim() || cargando) return;
        setCargando(true);
        setError('');
        setAviso('');
        setMision(null);
        setPublicada(false);
        try {
            const res = await authFetch(`${API_URL}/api/ia/mision`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    materia,
                    tema: tema.trim(),
                    tematica: TEMATICAS.find((t) => t.id === tematica)?.label.replace(/^\S+\s/, '') || tematica
                })
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
            // La misión nace como BORRADOR EN LA BD (SPEC-011); `_tema` y
            // `_tematica` viajan dentro de la configuración como metadatos
            // aditivos para poder reabrirla con sus parámetros. Si el guardado
            // remoto falla, se puede publicar igual (upsert del POST).
            let retoId = null;
            try {
                const creado = await crearBorrador({
                    materiaId: idPorNombre(materia),
                    titulo: data.mision?.titulo,
                    descripcion: `Aventura de ${tema.trim()}`,
                    configuracion: { ...data.mision, _tema: tema.trim(), _tematica: tematica },
                    xpRecompensa: (data.mision?.desafios?.length || 1) * 100,
                    origen: 'ia',
                    dificultad,
                    cursoId: cursoId ? Number(cursoId) : undefined
                });
                retoId = creado?.id ?? null;
            } catch (err) {
                console.warn('El borrador no se pudo guardar en el servidor:', err.message);
            }
            setEntradaId(retoId);
            setPublicadoEnBD(false);
            setMision(data.mision);
        } catch (err) {
            console.error('Error al generar la misión:', err);
            setError(`No se pudo generar la misión. ${err.message || 'Verifica tu conexión.'}`);
        } finally {
            setCargando(false);
        }
    };

    // Guarda en la BD como borrador o publicada (upsert por materia+título).
    const guardar = async (estado) => {
        if (!mision || guardando || (estado === 'publicado' && publicada)) return;
        const materiaId = idPorNombre(materia);
        if (!materiaId) {
            setError('No se reconoce la materia actual; recarga la página.');
            return;
        }
        setGuardando(true);
        setError('');
        try {
            // Un PATCH pendiente del debounce ya no hace falta: el POST que
            // sigue escribe el estado completo.
            cancelarSincronizacion(entradaId);
            const data = await publicarReto({
                materiaId,
                titulo: mision.titulo?.trim(),
                tipo: 'mision',
                configuracion: configuracionActual(),
                xpRecompensa: xp,
                descripcion: tema.trim() ? `Aventura de ${tema.trim()}` : undefined,
                estado,
                origen: 'ia',
                dificultad,
                cursoId: cursoId ? Number(cursoId) : undefined
            });
            setEntradaId(data?.id ?? entradaId);
            refrescar();
            if (estado === 'publicado') {
                setPublicada(true);
                setPublicadoEnBD(true);
                setAviso('¡Misión publicada! Ya es visible para los estudiantes.');
            } else {
                setAviso('Borrador guardado. Lo encontrarás en el historial y en la Biblioteca.');
            }
            setTimeout(() => setAviso(''), 4000);
        } catch (err) {
            setError(`No se pudo guardar la misión: ${err.message}`);
        } finally {
            setGuardando(false);
        }
    };

    return (
        <section className="card materia-subvista">
            <div className="card-head">
                <h3>Misiones Narrativas con IA</h3>
                <span className="card-tag">{materia}</span>
            </div>

            <form className="quiz-form" onSubmit={handleGenerar}>
                <label className="quiz-field">
                    <span>Tema de la lección</span>
                    <input
                        type="text"
                        ref={temaRef}
                        value={tema}
                        onChange={(e) => setTema(e.target.value)}
                        placeholder="Ej. Sumas hasta 100, los animales vertebrados…"
                    />
                </label>

                <label className="quiz-field">
                    <span>Temática de la aventura</span>
                    <select value={tematica} onChange={(e) => setTematica(e.target.value)}>
                        {TEMATICAS.map((t) => (
                            <option key={t.id} value={t.id}>{t.label}</option>
                        ))}
                    </select>
                </label>

                <label className="quiz-field">
                    <span>Dificultad</span>
                    <select value={dificultad} onChange={(e) => setDificultad(e.target.value)}>
                        {DIFICULTADES_UI.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                    </select>
                </label>

                <label className="quiz-field">
                    <span>Curso (opcional)</span>
                    <select value={cursoId} onChange={(e) => setCursoId(e.target.value)}>
                        <option value="">Todos los cursos</option>
                        {cursos.map((c) => <option key={c.id} value={c.id}>{c.etiqueta}</option>)}
                    </select>
                </label>

                <button type="submit" className="quiz-generar-btn" disabled={cargando || !tema.trim()}>
                    {cargando
                        ? <span className="quiz-spinner" aria-hidden="true" />
                        : <AutoAwesomeRoundedIcon sx={{ fontSize: '1.1rem' }} />}
                    {cargando ? 'Creando aventura…' : 'Generar Misión con IA'}
                </button>
            </form>

            {error && <p className="quiz-error">{error}</p>}
            {aviso && <p className="quiz-aviso">{aviso}</p>}

            {mision && (
                <div className="mision-preview mision-editor">
                    <label className="quiz-field">
                        <span>Título de la misión</span>
                        <input
                            value={mision.titulo || ''}
                            maxLength={120}
                            onChange={(e) => editarMision({ titulo: e.target.value })}
                        />
                    </label>

                    <label className="quiz-field">
                        <span>Introducción (cómo arranca la aventura)</span>
                        <textarea
                            rows={2}
                            value={mision.introduccion || ''}
                            onChange={(e) => editarMision({ introduccion: e.target.value })}
                        />
                    </label>

                    <div className="mision-editor-desafios">
                        {desafios.map((d, i) => (
                            <div key={i} className="mision-editor-desafio">
                                <div className="mision-editor-desafio-head">
                                    <strong>Desafío {i + 1} {desafioCompleto(d) ? '✅' : ''}</strong>
                                    <button
                                        type="button"
                                        className="quiz-historial-eliminar"
                                        title={desafios.length <= MIN_DESAFIOS
                                            ? `Una misión necesita al menos ${MIN_DESAFIOS} desafíos`
                                            : 'Quitar este desafío'}
                                        aria-label={`Quitar el desafío ${i + 1}`}
                                        disabled={desafios.length <= MIN_DESAFIOS}
                                        onClick={() => eliminarDesafio(i)}
                                    >
                                        <DeleteOutlineRoundedIcon sx={{ fontSize: '1.1rem' }} />
                                    </button>
                                </div>
                                <label className="quiz-field">
                                    <span>Narrativa (lo que pasa en la historia)</span>
                                    <textarea
                                        rows={2}
                                        value={d.narrativa || ''}
                                        onChange={(e) => editarDesafio(i, { narrativa: e.target.value })}
                                    />
                                </label>
                                <label className="quiz-field">
                                    <span>Pregunta</span>
                                    <input
                                        value={d.pregunta || ''}
                                        onChange={(e) => editarDesafio(i, { pregunta: e.target.value })}
                                    />
                                </label>
                                {LETRAS.map((letra) => (
                                    <label key={letra} className="quiz-field mision-editor-alt">
                                        <span>
                                            <input
                                                type="radio"
                                                name={`mision-correcta-${i}`}
                                                checked={String(d.correcta || '').trim().toUpperCase() === letra}
                                                onChange={() => editarDesafio(i, { correcta: letra })}
                                                aria-label={`Marcar ${letra} como correcta en el desafío ${i + 1}`}
                                            />{' '}
                                            Opción {letra} {String(d.correcta || '').trim().toUpperCase() === letra ? '✔' : ''}
                                        </span>
                                        <input
                                            value={d.alternativas?.[letra] || ''}
                                            onChange={(e) => editarAlternativa(i, letra, e.target.value)}
                                            placeholder={`Alternativa ${letra}`}
                                        />
                                    </label>
                                ))}
                                <label className="quiz-field">
                                    <span>Pista si se equivoca (opcional)</span>
                                    <input
                                        value={d.pista || ''}
                                        onChange={(e) => editarDesafio(i, { pista: e.target.value })}
                                    />
                                </label>
                            </div>
                        ))}
                    </div>

                    {/* SPEC-013 Fase 2: botón único "Agregar" con menú por acciones.
                        La misión es una historia con capítulos conectados: no usa el
                        banco (SPEC-013 §3), esas entradas NO aparecen. */}
                    <BarraAccionesEditor
                        agregar={{
                            label: 'Agregar desafíos',
                            pregunta: '¿Cómo deseas agregarlos?',
                            disabled: guardando,
                            opciones: [
                                {
                                    id: 'escribir',
                                    emoji: '📝',
                                    titulo: 'Escribir un desafío',
                                    detalle: 'Añade un capítulo vacío y escríbelo aquí mismo.',
                                    onClick: agregarDesafio
                                },
                                {
                                    id: 'generar',
                                    emoji: '🤖',
                                    titulo: 'Generar otra aventura',
                                    detalle: 'Dale un tema y la IA crea una historia nueva completa.',
                                    onClick: irAlFormularioIA
                                }
                            ]
                        }}
                        acciones={[
                            {
                                id: 'preview',
                                label: 'Vista previa',
                                Icon: VisibilityRoundedIcon,
                                onClick: () => setPreviewAbierta(true),
                                disabled: guardando || !desafios.length,
                                title: desafios.length
                                    ? 'Juega la misión como la verá el estudiante (sin XP ni progreso)'
                                    : 'Añade al menos un desafío para previsualizar'
                            }
                        ]}
                    />

                    <label className="quiz-field">
                        <span>Final (cómo se celebra el triunfo)</span>
                        <textarea
                            rows={2}
                            value={mision.final || ''}
                            onChange={(e) => editarMision({ final: e.target.value })}
                        />
                    </label>

                    <div className="clasificador-publicar-barra">
                        <p className="clasificador-publicar-hint">
                            {publicada
                                ? 'Esta misión ya está publicada. Si cambias algo, podrás volver a publicarla.'
                                : listaParaPublicar
                                    ? `Todo listo: ${desafios.length} desafíos · ${xp} XP · Dificultad: ${dificultad}.`
                                    : `Completa título, introducción, final y al menos ${MIN_DESAFIOS} desafíos (narrativa, pregunta y alternativas A, B y C).`}
                        </p>
                        <div className="gen-ia-acciones">
                            <button
                                type="button"
                                className="preview-action"
                                disabled={guardando || !mision.titulo?.trim()}
                                onClick={() => guardar('borrador')}
                            >
                                <SaveRoundedIcon sx={{ fontSize: '1.1rem' }} /> Guardar borrador
                            </button>
                            <button
                                type="button"
                                className="clasificador-btn-publicar"
                                onClick={() => guardar('publicado')}
                                disabled={!listaParaPublicar || guardando || publicada}
                            >
                                {publicada
                                    ? <CheckCircleRoundedIcon sx={{ fontSize: '1.15rem' }} />
                                    : <RocketLaunchRoundedIcon sx={{ fontSize: '1.15rem' }} />}
                                {publicada ? 'Publicada' : guardando ? 'Guardando…' : 'Publicar misión para estudiantes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {previewAbierta && mision && (
                <PreviewJuegoModal
                    tipo="mision"
                    titulo={mision.titulo}
                    configuracion={mision}
                    onCerrar={() => setPreviewAbierta(false)}
                />
            )}

            <HistorialActividades
                titulo="Últimas misiones generadas"
                items={historial}
                activoId={entradaId}
                onAbrir={async (e) => {
                    setAviso('');
                    setError('');
                    try {
                        const detalle = await abrirDetalle(e.id);
                        cancelarSincronizacion(entradaId);
                        setMision(detalle.configuracion || null);
                        setTema(detalle.configuracion?._tema || '');
                        setTematica(detalle.configuracion?._tematica || TEMATICAS[0].id);
                        setDificultad(detalle.dificultad || 'media');
                        setCursoId(detalle.curso_id ? String(detalle.curso_id) : '');
                        setEntradaId(detalle.id);
                        setPublicada(detalle.estado === 'publicado');
                        setPublicadoEnBD(detalle.estado === 'publicado');
                    } catch (err) {
                        setError(`No se pudo abrir la misión: ${err.message}`);
                    }
                }}
                onEliminar={async (id) => {
                    try {
                        await eliminarBorrador(id);
                        if (entradaId === id) {
                            setMision(null);
                            setEntradaId(null);
                            setPublicada(false);
                            setPublicadoEnBD(false);
                        }
                    } catch (err) {
                        setError(`No se pudo eliminar: ${err.message}`);
                    }
                }}
            />
        </section>
    );
}
