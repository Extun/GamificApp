import { useEffect, useRef, useState } from 'react';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
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
import { ModalConfigActividad } from '../../components/juegos/ModalConfigActividad';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import UndoRoundedIcon from '@mui/icons-material/UndoRounded';
import '../../components/mision/misionNarrativa.css';
// Acordeón compartido con el editor del quiz (mismas clases editor-item*).
import '../../components/quiz/editorQuiz.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Copia profunda simple (el estado del editor es JSON puro).
const clon = (v) => JSON.parse(JSON.stringify(v));

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
    // "Añadir con IA" incremental: la IA continúa la historia con desafíos
    // nuevos, sin tocar los capítulos que ya existen.
    const [agregandoIA, setAgregandoIA] = useState(false);
    // SPEC-013 Fase 2: la entrada "Generarla automáticamente" del menú lleva
    // al formulario de IA (hasta que la Fase 7 lo convierta en modal).
    const temaRef = useRef(null);
    const irAlFormularioIA = () => {
        temaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        temaRef.current?.focus({ preventScroll: true });
    };
    // Acordeón de desafíos (mismo patrón que el editor del quiz): todos
    // cerrados al abrir, solo uno expandido a la vez.
    const [desafioAbierto, setDesafioAbierto] = useState(-1);
    // SPEC-012: vista previa como estudiante (modo prueba).
    const [previewAbierta, setPreviewAbierta] = useState(false);
    // SPEC-013: dificultad/curso también ajustables en popup (botón ⚙).
    const [configAbierta, setConfigAbierta] = useState(false);
    const [error, setError] = useState('');
    const [aviso, setAviso] = useState('');

    useEffect(() => {
        docenteService.listarCursos().then(setCursos).catch(() => setCursos([]));
    }, []);

    // "Deshacer cambios": foto de la misión tal como quedó al generarla, abrirla
    // o guardarla. Restaurarla revierte las ediciones de la sesión (y re-sincroniza
    // el borrador en BD).
    const [snapshot, setSnapshot] = useState(null);
    const tomarSnapshot = (m, pub = false) => setSnapshot(m ? { mision: clon(m), publicada: pub } : null);
    const hayCambios = Boolean(
        mision && snapshot &&
        JSON.stringify(mision) !== JSON.stringify(snapshot.mision)
    );
    const deshacerCambios = () => {
        if (!hayCambios) return;
        const s = snapshot;
        const restaurada = clon(s.mision);
        setMision(restaurada);
        setPublicada(s.publicada);
        if (entradaId && !publicadoEnBD) {
            sincronizar(entradaId, {
                titulo: restaurada.titulo,
                configuracion: configuracionActual(restaurada),
                xp_recompensa: Math.max((restaurada.desafios || []).length, 1) * 100
            });
        }
        setAviso('Cambios deshechos: la misión volvió a como estaba al abrirla.');
        setTimeout(() => setAviso(''), 4000);
    };

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

    const agregarDesafio = () => {
        editarMision({ desafios: [...desafios, desafioVacio()] });
        setDesafioAbierto(desafios.length); // abre el recién creado
    };

    const eliminarDesafio = (i) => {
        if (desafios.length <= MIN_DESAFIOS) return;
        editarMision({ desafios: desafios.filter((_, idx) => idx !== i) });
        setDesafioAbierto((prev) => (prev >= i ? -1 : prev));
    };

    // "Añadir con IA": el servidor recibe la misión ACTUAL y devuelve solo los
    // desafíos nuevos que continúan la historia (sin repetir capítulos).
    const continuarConIA = async (n) => {
        if (agregandoIA || !mision) return;
        const temaBase = tema.trim() || mision.titulo || '';
        if (!temaBase) {
            setError('Escribe el tema de la lección (arriba) para pedirle más capítulos a la IA.');
            setTimeout(() => setError(''), 5000);
            return;
        }
        setAgregandoIA(true);
        setError('');
        setAviso('');
        try {
            const res = await authFetch(`${API_URL}/api/ia/mision`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    materia,
                    tema: temaBase,
                    tematica: TEMATICAS.find((t) => t.id === tematica)?.label.replace(/^\S+\s/, '') || tematica,
                    cantidad: n,
                    mision_actual: mision
                })
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
            const nuevos = data?.desafios || [];
            if (!nuevos.length) throw new Error('la IA no devolvió desafíos nuevos');
            editarMision({ desafios: [...desafios, ...nuevos] });
            setAviso(`La historia continúa: ${nuevos.length} ${nuevos.length === 1 ? 'desafío nuevo' : 'desafíos nuevos'}, sin tocar los anteriores.`);
            setTimeout(() => setAviso(''), 5000);
        } catch (err) {
            setError(`No se pudo continuar la aventura: ${err.message}`);
            setTimeout(() => setError(''), 5000);
        } finally {
            setAgregandoIA(false);
        }
    };

    // Cierra la misión abierta; el borrador ya vive en la BD (y en "Últimos
    // generados"), así que no se pierde nada.
    const cerrarEditor = () => {
        cancelarSincronizacion(entradaId);
        tomarSnapshot(null);
        setDesafioAbierto(-1);
        setMision(null);
        setEntradaId(null);
        setPublicada(false);
        setPublicadoEnBD(false);
        setAviso('');
        setError('');
    };

    const handleGenerar = async (e) => {
        e.preventDefault();
        if (!tema.trim() || cargando) return;
        // Generar REEMPLAZA la misión abierta en el editor; se avisa para no
        // perder trabajo por accidente (el borrador queda en "Últimos generados").
        if (mision && !window.confirm(
            'Esto crea una aventura NUEVA y cierra la que tienes abierta '
            + `(${entradaId ? 'queda guardada en «Últimos generados»' : 'no alcanzó a guardarse'}). ¿Continuar?`
        )) return;
        setCargando(true);
        setError('');
        setAviso('');
        setDesafioAbierto(-1);
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
            tomarSnapshot(data.mision, false);
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
            // Lo guardado/publicado es la nueva base de "Deshacer".
            tomarSnapshot(mision, estado === 'publicado');
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
                    <div className="editor-abierto-head">
                        <span className="editor-abierto-etiqueta">Editando: {mision.titulo || 'sin título'}</span>
                        <button
                            type="button"
                            className="editor-cerrar-btn"
                            onClick={cerrarEditor}
                            title="Cierra el editor; la misión queda en «Últimos generados»"
                        >
                            ✕ Cerrar
                        </button>
                    </div>
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

                    {/* Acordeón de desafíos (mismo patrón y clases que el editor
                        del quiz): cada capítulo colapsado en una línea; solo el
                        que se edita está expandido. */}
                    <div className="editor-acordeon">
                        {desafios.map((d, i) => {
                            const expandido = desafioAbierto === i;
                            const completo = desafioCompleto(d);
                            return (
                                <div key={i} className={`editor-item ${expandido ? 'is-abierta' : ''}`}>
                                    <button
                                        type="button"
                                        className="editor-item-head"
                                        aria-expanded={expandido}
                                        onClick={() => setDesafioAbierto(expandido ? -1 : i)}
                                    >
                                        <span className={`editor-item-num ${completo ? 'is-completa' : ''}`}>
                                            {completo ? <CheckCircleRoundedIcon sx={{ fontSize: '1.1rem' }} /> : i + 1}
                                        </span>
                                        <span className="editor-item-titulo">
                                            {d.pregunta?.trim() || d.narrativa?.trim() || `Desafío ${i + 1} (sin escribir)`}
                                        </span>
                                        <ExpandMoreRoundedIcon className="editor-item-chevron" />
                                    </button>
                                    {expandido && (
                                        <div className="editor-item-body">
                                            <label className="editor-campo">
                                                <span>Narrativa (lo que pasa en la historia)</span>
                                                <textarea
                                                    rows={3}
                                                    value={d.narrativa || ''}
                                                    onChange={(e) => editarDesafio(i, { narrativa: e.target.value })}
                                                    placeholder="Cuenta este capítulo de la aventura…"
                                                />
                                            </label>
                                            <label className="editor-campo">
                                                <span>Pregunta</span>
                                                <textarea
                                                    rows={2}
                                                    value={d.pregunta || ''}
                                                    onChange={(e) => editarDesafio(i, { pregunta: e.target.value })}
                                                    placeholder={`Escribe la pregunta del desafío ${i + 1}…`}
                                                />
                                            </label>
                                            <div className="editor-alternativas">
                                                <span className="editor-campo-label">
                                                    Opciones · marca la respuesta correcta
                                                </span>
                                                {LETRAS.map((letra) => (
                                                    <div
                                                        key={letra}
                                                        className={`editor-alt-row ${String(d.correcta || '').trim().toUpperCase() === letra ? 'is-correcta' : ''}`}
                                                    >
                                                        <label className="editor-alt-radio" title="Marcar como correcta">
                                                            <input
                                                                type="radio"
                                                                name={`mision-correcta-${i}`}
                                                                checked={String(d.correcta || '').trim().toUpperCase() === letra}
                                                                onChange={() => editarDesafio(i, { correcta: letra })}
                                                                aria-label={`Marcar ${letra} como correcta en el desafío ${i + 1}`}
                                                            />
                                                            <span className="editor-alt-letra">{letra}</span>
                                                        </label>
                                                        <input
                                                            type="text"
                                                            className="editor-alt-input"
                                                            value={d.alternativas?.[letra] || ''}
                                                            onChange={(e) => editarAlternativa(i, letra, e.target.value)}
                                                            placeholder={`Opción ${letra}`}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                            <label className="editor-campo">
                                                <span>Pista si se equivoca (opcional)</span>
                                                <input
                                                    className="editor-alt-input"
                                                    value={d.pista || ''}
                                                    onChange={(e) => editarDesafio(i, { pista: e.target.value })}
                                                    placeholder="Una ayudita para intentarlo de nuevo…"
                                                />
                                            </label>
                                            <div className="editor-item-acciones">
                                                <button
                                                    type="button"
                                                    className="editor-btn editor-btn-ghost editor-btn-peligro"
                                                    title={desafios.length <= MIN_DESAFIOS
                                                        ? `Una misión necesita al menos ${MIN_DESAFIOS} desafíos`
                                                        : 'Quitar este desafío'}
                                                    disabled={desafios.length <= MIN_DESAFIOS}
                                                    onClick={() => eliminarDesafio(i)}
                                                >
                                                    <DeleteOutlineRoundedIcon sx={{ fontSize: '1.1rem' }} /> Eliminar
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* SPEC-013 Fase 2: botón único "Agregar" con menú por acciones.
                        La misión es una historia con capítulos conectados: no usa el
                        banco (SPEC-013 §3), esas entradas NO aparecen. */}
                    <BarraAccionesEditor
                        agregar={{
                            label: agregandoIA ? 'Generando…' : 'Agregar desafíos',
                            pregunta: '¿Cómo deseas agregarlos?',
                            disabled: guardando || agregandoIA,
                            opciones: [
                                {
                                    id: 'escribir',
                                    emoji: '📝',
                                    titulo: 'Escribir un desafío',
                                    detalle: 'Añade un capítulo vacío y escríbelo aquí mismo.',
                                    onClick: agregarDesafio
                                },
                                {
                                    id: 'continuar',
                                    emoji: '🤖',
                                    titulo: 'Añadir con IA',
                                    detalle: 'La IA continúa ESTA historia con capítulos nuevos, sin borrar los que tienes.',
                                    sub: {
                                        pregunta: '¿Cuántos desafíos más?',
                                        opciones: [1, 2, 3].map((n) => ({ label: String(n), onClick: () => continuarConIA(n) }))
                                    }
                                },
                                {
                                    id: 'generar',
                                    emoji: '✨',
                                    titulo: 'Generar otra aventura',
                                    detalle: 'Dale un tema y la IA crea una historia nueva completa.',
                                    onClick: irAlFormularioIA
                                }
                            ]
                        }}
                        acciones={[
                            {
                                id: 'deshacer',
                                label: 'Deshacer cambios',
                                Icon: UndoRoundedIcon,
                                onClick: deshacerCambios,
                                disabled: guardando || !hayCambios,
                                title: hayCambios
                                    ? 'Vuelve la misión a como estaba al abrirla o generarla'
                                    : 'No hay cambios sin guardar que deshacer'
                            },
                            {
                                id: 'config',
                                label: 'Configuración',
                                Icon: SettingsRoundedIcon,
                                onClick: () => setConfigAbierta(true),
                                disabled: guardando,
                                title: 'Dificultad y curso de esta misión'
                            },
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

                    {/* SPEC-013: dificultad/curso en popup (mismos valores que usa
                        el formulario; se aplican al Guardar/Publicar). */}
                    {configAbierta && (
                        <ModalConfigActividad onCerrar={() => setConfigAbierta(false)} subtitulo="Se aplican al guardar o publicar la misión.">
                            <label className="quiz-config-opcion quiz-config-select">
                                <span>Dificultad</span>
                                <select value={dificultad} onChange={(e) => setDificultad(e.target.value)}>
                                    {DIFICULTADES_UI.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                                </select>
                            </label>
                            <label className="quiz-config-opcion quiz-config-select">
                                <span>Curso</span>
                                <select value={cursoId} onChange={(e) => setCursoId(e.target.value)}>
                                    <option value="">Todos los cursos</option>
                                    {cursos.map((c) => <option key={c.id} value={c.id}>{c.etiqueta}</option>)}
                                </select>
                            </label>
                        </ModalConfigActividad>
                    )}

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
                onCerrar={cerrarEditor}
                onAbrir={async (e) => {
                    setAviso('');
                    setError('');
                    try {
                        const detalle = await abrirDetalle(e.id);
                        cancelarSincronizacion(entradaId);
                        setDesafioAbierto(-1);
                        setMision(detalle.configuracion || null);
                        tomarSnapshot(detalle.configuracion || null, detalle.estado === 'publicado');
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
