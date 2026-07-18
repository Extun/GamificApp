import { useEffect, useRef, useState } from 'react';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import RocketLaunchRoundedIcon from '@mui/icons-material/RocketLaunchRounded';
import EditNoteRoundedIcon from '@mui/icons-material/EditNoteRounded';
import BookmarkAddRoundedIcon from '@mui/icons-material/BookmarkAddRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import UndoRoundedIcon from '@mui/icons-material/UndoRounded';
import { BarraAccionesEditor } from '../juegos/BarraAccionesEditor';
import { ModalConfigActividad } from '../juegos/ModalConfigActividad';
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
// SPEC-010: `onAbrirBanco` abre el selector del banco de preguntas (tercera
// fuente junto a manual e IA) y `onGuardarEnBanco(pregunta)` guarda una
// pregunta del quiz en el banco para reutilizarla después; ambas opcionales.
// `onVistaPrevia` (SPEC-012): abre el quiz en el reproductor real, en modo
// prueba (sin XP ni progreso), para revisarlo antes de publicar.
export function EditorQuiz({ tema, preguntas, onChange, onAgregarIA, onPublicar, publicando, publicado, onAbrirBanco, onGuardarEnBanco, onVistaPrevia, onCerrar, onDeshacer, hayCambios, mezclarPreguntas, mezclarRespuestas, preguntasPorIntento, onCambiarMezcla }) {
    // Ninguna pregunta expandida al abrir el quiz (vista limpia de entrada).
    // Single-open: abrir una contrae automáticamente las demás.
    const [abierta, setAbierta] = useState(-1);
    const [cargandoIA, setCargandoIA] = useState(false);
    // SPEC-013: la configuración vive en un popup (botón ⚙ junto a Vista previa).
    const [configAbierta, setConfigAbierta] = useState(false);
    const abiertaRef = useRef(null);

    const alternar = (i) => setAbierta((prev) => (prev === i ? -1 : i));

    // Al expandir, llevamos la pregunta a la vista para no perder el contexto.
    useEffect(() => {
        if (abierta >= 0 && abiertaRef.current) {
            abiertaRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [abierta]);

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
                {onCerrar && (
                    <button
                        type="button"
                        className="editor-cerrar-btn"
                        onClick={onCerrar}
                        title="Cierra el editor; el quiz queda en «Últimos generados»"
                    >
                        ✕ Cerrar
                    </button>
                )}
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
                                        {onGuardarEnBanco && (
                                            <button
                                                type="button"
                                                className="editor-btn editor-btn-ghost"
                                                title={completa
                                                    ? 'Guardar esta pregunta en tu banco para reutilizarla en otros quizzes'
                                                    : 'Completa la pregunta para poder guardarla en el banco'}
                                                disabled={!completa}
                                                onClick={() => onGuardarEnBanco(p)}
                                            >
                                                <BookmarkAddRoundedIcon sx={{ fontSize: '1.1rem' }} /> Guardar en el banco
                                            </button>
                                        )}
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

            {/* SPEC-013 Fase 2: botón único "Agregar" con menú por acciones. */}
            <BarraAccionesEditor
                agregar={{
                    label: cargandoIA ? 'Generando…' : 'Agregar preguntas',
                    pregunta: '¿Cómo deseas agregarlas?',
                    disabled: cargandoIA,
                    opciones: [
                        {
                            id: 'escribir',
                            emoji: '📝',
                            titulo: 'Escribir preguntas',
                            detalle: 'Redacta tú mismo cada pregunta y sus opciones.',
                            onClick: añadirPregunta
                        },
                        {
                            id: 'generar',
                            emoji: '🤖',
                            titulo: 'Generarlas automáticamente',
                            detalle: 'Dale un tema y la IA las redacta por ti.',
                            disabled: !onAgregarIA,
                            sub: {
                                pregunta: '¿Cuántas preguntas?',
                                opciones: OPCIONES_IA.map((n) => ({
                                    label: `${n} ${n === 1 ? 'pregunta' : 'preguntas'}`,
                                    onClick: () => añadirConIA(n)
                                }))
                            }
                        },
                        {
                            id: 'reutilizar',
                            emoji: '📚',
                            titulo: 'Reutilizar preguntas',
                            detalle: 'Elige entre las preguntas que ya has usado antes.',
                            disabled: !onAbrirBanco,
                            onClick: onAbrirBanco
                        }
                    ]
                }}
                acciones={[
                    {
                        id: 'deshacer',
                        label: 'Deshacer cambios',
                        Icon: UndoRoundedIcon,
                        onClick: onDeshacer,
                        disabled: !onDeshacer || !hayCambios || cargandoIA,
                        title: hayCambios
                            ? 'Vuelve el quiz a como estaba al abrirlo o generarlo'
                            : 'No hay cambios sin guardar que deshacer'
                    },
                    {
                        id: 'config',
                        label: 'Configuración',
                        Icon: SettingsRoundedIcon,
                        onClick: () => setConfigAbierta(true),
                        disabled: !onCambiarMezcla || cargandoIA,
                        title: 'Mezclas y preguntas por intento'
                    },
                    {
                        id: 'preview',
                        label: 'Vista previa',
                        Icon: VisibilityRoundedIcon,
                        onClick: onVistaPrevia,
                        disabled: !onVistaPrevia || !total || cargandoIA,
                        title: total
                            ? 'Juega el quiz como lo verá el estudiante (sin XP ni progreso)'
                            : 'Añade al menos una pregunta para previsualizar'
                    }
                ]}
            />

            {/* SPEC-013: configuración del quiz en popup (botón ⚙ de la barra). */}
            {configAbierta && onCambiarMezcla && (
                <ModalConfigActividad onCerrar={() => setConfigAbierta(false)}>
                    <label className="quiz-config-opcion">
                        <input
                            type="checkbox"
                            checked={mezclarPreguntas !== false}
                            onChange={(e) => onCambiarMezcla('mezclarPreguntas', e.target.checked)}
                        />
                        <span>Mezclar el orden de las preguntas en cada intento</span>
                    </label>
                    <label className="quiz-config-opcion">
                        <input
                            type="checkbox"
                            checked={mezclarRespuestas !== false}
                            onChange={(e) => onCambiarMezcla('mezclarRespuestas', e.target.checked)}
                        />
                        <span>Mezclar el orden de las opciones en cada intento</span>
                    </label>
                    <label className="quiz-config-opcion quiz-config-select">
                        <span>Preguntas por intento</span>
                        <select
                            value={Number(preguntasPorIntento) || 0}
                            onChange={(e) => onCambiarMezcla('preguntasPorIntento', Number(e.target.value))}
                        >
                            <option value={0}>Todas ({total})</option>
                            {[3, 5, 10, 15, 20]
                                .filter((n) => n < total || n === Number(preguntasPorIntento))
                                .map((n) => (
                                    <option key={n} value={n}>{n} al azar de {total}</option>
                                ))}
                        </select>
                    </label>
                    <p className="quiz-config-ayuda">
                        Así cada estudiante ve un Quiz distinto, aunque sea el mismo para todos.
                        Si eliges menos preguntas de las que guardaste, cada intento muestra una
                        selección al azar del total.
                    </p>
                </ModalConfigActividad>
            )}

            <div className="editor-publicar-barra">
                <p className="editor-publicar-hint">
                    {(() => {
                        if (publicado) return 'Este quiz ya está publicado. Si lo editas, podrás publicarlo como un quiz nuevo.';
                        if (!listaParaPublicar) return 'Completa el enunciado y las 4 alternativas de cada pregunta para poder publicar.';
                        const porIntento = Number(preguntasPorIntento) || 0;
                        const jugables = porIntento > 0 ? Math.min(porIntento, total) : total;
                        return jugables < total
                            ? `Todo listo: ${total} preguntas guardadas · cada intento muestra ${jugables} al azar · recompensa de ${jugables * 100} XP.`
                            : `Todo listo: ${total} preguntas · recompensa de ${total * 100} XP. Al publicar, el quiz será visible para los estudiantes.`;
                    })()}
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
