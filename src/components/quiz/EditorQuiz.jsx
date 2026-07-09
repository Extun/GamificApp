import { useEffect, useRef, useState } from 'react';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import RocketLaunchRoundedIcon from '@mui/icons-material/RocketLaunchRounded';
import EditNoteRoundedIcon from '@mui/icons-material/EditNoteRounded';
import './editorQuiz.css';

const LETRAS = ['A', 'B', 'C', 'D'];
const OPCIONES_IA = [1, 3, 5];

// Plantilla de una pregunta vacía para el botón "Añadir pregunta manual".
const preguntaVacia = () => ({
    pregunta: '',
    alternativas: { A: '', B: '', C: '', D: '' },
    correcta: 'A',
    justificacion: ''
});

// Editor pedagógico del quiz. Recibe el array de preguntas y notifica cada cambio
// con `onChange(nuevasPreguntas)`. El contenedor decide cuándo publicar.
// Layout de acordeón: todas cerradas al abrir; solo una expandida a la vez.
export function EditorQuiz({ tema, preguntas, onChange, onAgregarIA, onPublicar, publicando, publicado }) {
    // Ninguna pregunta expandida al abrir el quiz (vista limpia de entrada).
    // Single-open: abrir una contrae automáticamente las demás.
    const [abierta, setAbierta] = useState(-1);
    const [menuIA, setMenuIA] = useState(false);
    const [cargandoIA, setCargandoIA] = useState(false);
    const iaRef = useRef(null);
    const abiertaRef = useRef(null);

    const alternar = (i) => setAbierta((prev) => (prev === i ? -1 : i));

    // Al expandir, llevamos la pregunta a la vista para no perder el contexto.
    useEffect(() => {
        if (abierta >= 0 && abiertaRef.current) {
            abiertaRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [abierta]);

    // Cierra el dropdown de IA al hacer clic fuera de él.
    useEffect(() => {
        if (!menuIA) return;
        const fuera = (e) => { if (iaRef.current && !iaRef.current.contains(e.target)) setMenuIA(false); };
        document.addEventListener('mousedown', fuera);
        return () => document.removeEventListener('mousedown', fuera);
    }, [menuIA]);

    const total = preguntas.length;
    // Una pregunta está "completa" si tiene enunciado y sus 4 alternativas con texto.
    const estaCompleta = (p) =>
        p.pregunta.trim() && LETRAS.every((l) => (p.alternativas?.[l] || '').trim());
    const completas = preguntas.filter(estaCompleta).length;
    const listaParaPublicar = total > 0 && completas === total;

    // Reemplaza la pregunta en el índice dado aplicando un cambio parcial.
    const editarPregunta = (i, cambio) => {
        onChange(preguntas.map((p, idx) => (idx === i ? { ...p, ...cambio } : p)));
    };

    const editarAlternativa = (i, letra, valor) => {
        editarPregunta(i, { alternativas: { ...preguntas[i].alternativas, [letra]: valor } });
    };

    const eliminarPregunta = (i) => {
        onChange(preguntas.filter((_, idx) => idx !== i));
        setAbierta((prev) => (prev >= i ? -1 : prev));
    };

    const añadirPregunta = () => {
        onChange([...preguntas, preguntaVacia()]);
        setAbierta(total); // abre la recién creada
    };

    const añadirConIA = async (n) => {
        setMenuIA(false);
        setCargandoIA(true);
        try {
            await onAgregarIA?.(n);
        } finally {
            setCargandoIA(false);
        }
    };

    return (
        <div className="editor-quiz">
            <div className="editor-quiz-head">
                <div>
                    <span className="editor-quiz-eyebrow">
                        <EditNoteRoundedIcon sx={{ fontSize: '1.05rem' }} /> Editor del quiz
                    </span>
                    <h4 className="editor-quiz-titulo">{tema || 'Quiz sin título'}</h4>
                </div>
                <span className="editor-quiz-progreso" data-listo={listaParaPublicar}>
                    {completas}/{total} preguntas listas
                </span>
            </div>

            <div className="editor-acordeon">
                {preguntas.map((p, i) => {
                    const expandida = abierta === i;
                    const completa = estaCompleta(p);
                    return (
                        <div
                            key={i}
                            ref={expandida ? abiertaRef : null}
                            className={`editor-item ${expandida ? 'is-abierta' : ''}`}
                        >
                            {/* Encabezado completo clickeable: alterna expandido/contraído.
                                El input de enunciado detiene la propagación para poder editar. */}
                            <div
                                className={`editor-item-head ${expandida ? 'is-edit' : ''}`}
                                role="button"
                                tabIndex={0}
                                aria-expanded={expandida}
                                onClick={() => alternar(i)}
                                onKeyDown={(e) => {
                                    if (e.target !== e.currentTarget) return; // ignora teclas en inputs internos
                                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar(i); }
                                }}
                            >
                                <span className={`editor-item-num ${completa ? 'is-completa' : ''}`}>
                                    {completa ? <CheckCircleRoundedIcon sx={{ fontSize: '1.1rem' }} /> : i + 1}
                                </span>
                                {expandida ? (
                                    <input
                                        className="editor-item-titulo-input"
                                        value={p.pregunta}
                                        onChange={(e) => editarPregunta(i, { pregunta: e.target.value })}
                                        onClick={(e) => e.stopPropagation()}
                                        placeholder={`Escribe la pregunta ${i + 1}…`}
                                        autoFocus
                                    />
                                ) : (
                                    <span className="editor-item-titulo">
                                        {p.pregunta.trim() || `Pregunta ${i + 1} (sin enunciado)`}
                                    </span>
                                )}
                                <ExpandMoreRoundedIcon className="editor-item-chevron" />
                            </div>

                            {expandida && (
                                <div className="editor-item-body">
                                    <div className="editor-alternativas">
                                        <span className="editor-campo-label">
                                            Alternativas · marca la respuesta correcta
                                        </span>
                                        {LETRAS.map((letra) => (
                                            <div
                                                key={letra}
                                                className={`editor-alt-row ${p.correcta === letra ? 'is-correcta' : ''}`}
                                            >
                                                <label className="editor-alt-radio" title="Marcar como correcta">
                                                    <input
                                                        type="radio"
                                                        name={`correcta-${i}`}
                                                        checked={p.correcta === letra}
                                                        onChange={() => editarPregunta(i, { correcta: letra })}
                                                    />
                                                    <span className="editor-alt-letra">{letra}</span>
                                                </label>
                                                <input
                                                    type="text"
                                                    className="editor-alt-input"
                                                    value={p.alternativas?.[letra] || ''}
                                                    onChange={(e) => editarAlternativa(i, letra, e.target.value)}
                                                    placeholder={`Opción ${letra}`}
                                                />
                                            </div>
                                        ))}
                                    </div>

                                    <label className="editor-campo">
                                        <span>Justificación (se muestra al responder)</span>
                                        <textarea
                                            rows={2}
                                            value={p.justificacion || ''}
                                            onChange={(e) => editarPregunta(i, { justificacion: e.target.value })}
                                            placeholder="Explica por qué esa es la respuesta correcta…"
                                        />
                                    </label>

                                    <div className="editor-item-acciones">
                                        <button
                                            type="button"
                                            className="editor-btn editor-btn-ghost editor-btn-peligro"
                                            onClick={() => eliminarPregunta(i)}
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

            {/* Acciones para agregar preguntas: manual o con IA (con selector de cantidad). */}
            <div className="editor-agregar-barra">
                <button
                    type="button"
                    className="editor-btn editor-btn-ghost editor-btn-añadir"
                    onClick={añadirPregunta}
                    disabled={cargandoIA}
                >
                    <AddRoundedIcon sx={{ fontSize: '1.2rem' }} /> Añadir pregunta manual
                </button>

                <div className="editor-ia-wrap" ref={iaRef}>
                    <button
                        type="button"
                        className="editor-btn editor-btn-ia"
                        onClick={() => setMenuIA((v) => !v)}
                        disabled={cargandoIA}
                    >
                        {cargandoIA
                            ? <span className="editor-ia-spinner" aria-hidden="true" />
                            : <AutoAwesomeRoundedIcon sx={{ fontSize: '1.1rem' }} />}
                        {cargandoIA ? 'Generando…' : 'Añadir con IA'}
                    </button>
                    {menuIA && !cargandoIA && (
                        <div className="editor-ia-menu" role="menu">
                            <span className="editor-ia-menu-titulo">¿Cuántas añadir?</span>
                            {OPCIONES_IA.map((n) => (
                                <button
                                    key={n}
                                    type="button"
                                    className="editor-ia-opcion"
                                    onClick={() => añadirConIA(n)}
                                >
                                    {n} {n === 1 ? 'pregunta' : 'preguntas'}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="editor-publicar-barra">
                <p className="editor-publicar-hint">
                    {publicado
                        ? 'Este quiz ya está publicado. Si lo editas, podrás publicarlo como un quiz nuevo.'
                        : listaParaPublicar
                            ? `Todo listo: ${total} preguntas · recompensa de ${total * 100} XP. Al publicar, el quiz será visible para los estudiantes.`
                            : 'Completa el enunciado y las 4 alternativas de cada pregunta para poder publicar.'}
                </p>
                <button
                    type="button"
                    className="editor-btn editor-btn-publicar"
                    onClick={onPublicar}
                    disabled={!listaParaPublicar || publicando || publicado}
                >
                    {publicado
                        ? <CheckCircleRoundedIcon sx={{ fontSize: '1.15rem' }} />
                        : <RocketLaunchRoundedIcon sx={{ fontSize: '1.15rem' }} />}
                    {publicado ? 'Publicado' : publicando ? 'Publicando…' : 'Publicar quiz para estudiantes'}
                </button>
            </div>
        </div>
    );
}
