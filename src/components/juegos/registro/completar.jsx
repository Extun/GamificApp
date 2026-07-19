// Tipo de juego: Completar espacios — registro FRONTEND (SPEC-017, Fase 2).
import { CompletarEspacios } from '../CompletarEspacios';

export const completar = {
    tipo: 'completar',
    etiqueta: 'Completar espacios',
    emoji: '✏️',
    descripcion: 'Elige la palabra que completa correctamente cada frase.',
    capacidades: { ia: true, banco: true, reutilizar: true, automatico: true },

    // Tarjeta del selector "Crear actividad" del docente. El copy es el
    // congelado por SPEC-013 §4.1: se mueve aquí sin cambiar una palabra.
    tarjetaCrear: {
        titulo: 'Completar espacios',
        descripcion: 'Frases con espacios en blanco y opciones, con IA',
        orden: 6
    },

    edicion: {
        claveItems: 'frases',
        nombreItem: { singular: 'frase', plural: 'frases' },
        clasificaPorDificultad: true,
        tituloReutilizar: 'Añadir frases del banco',
        maxItems: 8,
        cantidades: [3, 4, 5, 6, 8],
        ayudaIA: 'Escribe el tema y la IA crea frases con un espacio en blanco y sus opciones.',
        itemVacio: () => ({ texto: '', opciones: ['', ''], correcta: '' }),
        articuloPlural: 'las',
        itemCompleto: (item) => Boolean(
            item.texto?.trim() &&
            (item.opciones || []).length >= 2 &&
            (item.opciones || []).every((o) => (o || '').trim()) &&
            (item.opciones || []).includes(item.correcta)
        ),
        resumenItem: (item, i) => item.texto?.trim() || `Frase ${i + 1} (sin escribir)`,
        FormularioItem: ({ item, indice, onCambiar }) => (
            <>
                <label className="editor-campo">
                    <span>Frase (usa ___ para el espacio en blanco)</span>
                    <input
                        type="text"
                        className="editor-alt-input"
                        value={item.texto}
                        placeholder="Ej. El sol sale por el ___"
                        onChange={(e) => onCambiar({ texto: e.target.value })}
                    />
                </label>
                <div className="editor-alternativas">
                    <span className="editor-campo-label">
                        Opciones · marca la respuesta correcta
                    </span>
                    {item.opciones.map((op, j) => (
                        <div key={j} className={`editor-alt-row ${op === item.correcta ? 'is-correcta' : ''}`}>
                            <label className="editor-alt-radio" title="Marcar como correcta">
                                <input
                                    type="radio"
                                    name={`correcta-${indice}`}
                                    checked={op === item.correcta}
                                    onChange={() => onCambiar({ correcta: op })}
                                    aria-label={`Marcar la opción ${j + 1} como correcta en la frase ${indice + 1}`}
                                />
                                <span className="editor-alt-letra">{j + 1}</span>
                            </label>
                            <input
                                type="text"
                                className="editor-alt-input"
                                value={op}
                                placeholder={`Opción ${j + 1}`}
                                onChange={(e) => {
                                    const opciones = item.opciones.map((o, k) => (k === j ? e.target.value : o));
                                    onCambiar({
                                        opciones,
                                        correcta: op === item.correcta ? e.target.value : item.correcta
                                    });
                                }}
                            />
                        </div>
                    ))}
                </div>
            </>
        ),
        textoParaIA: (item) => (item.texto || '').trim(),
        firmaItem: (item) => (item?.texto || '').trim().toLowerCase()
    },

    Player: CompletarEspacios,
    enPestanaJuegos: true,

    resumen: (config) => `${config?.frases?.length || 0} frases`,
    jugable: (config) => Boolean(config?.frases?.length),

    VistaLectura: ({ config }) => (
        <ol className="bib-preview-lista">
            {(config.frases || []).map((f, i) => (
                <li key={i}>
                    {f.texto} <br />
                    <span className="contenido-sub">
                        Opciones: {(f.opciones || []).map((o) => (o === f.correcta ? `${o} ✔` : o)).join(' · ')}
                    </span>
                </li>
            ))}
        </ol>
    )
};

export default completar;
