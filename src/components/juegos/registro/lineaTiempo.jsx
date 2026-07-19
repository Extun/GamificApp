// Tipo de juego: Línea del tiempo — registro FRONTEND (SPEC-017, Fase 2).
import { LineaTiempo } from '../LineaTiempo';

// `etiqueta` es contenido libre del docente (puede ser un año: "1492"), así que
// NO se deriva de la posición. Pero cuando la IA (o el banco) devuelve
// etiquetas ORDINALES ("Paso 1", "Etapa 2"…) al anexar, la numeración vuelve a
// empezar y se duplica con la que ya existe. Aquí solo esas etiquetas se
// renumeran para continuar la secuencia; las demás (fechas, nombres, vacías)
// se respetan tal cual.
const ORDINAL = /^(paso|etapa|fase|momento|evento)\s*#?\s*(\d+)\s*:?$/i;

const renumerarOrdinales = (actuales, nuevos) => {
    // Mayor ordinal ya usado por prefijo (en minúsculas), para continuar desde ahí.
    const tope = new Map();
    actuales.forEach((it) => {
        const m = ORDINAL.exec(String(it?.etiqueta || '').trim());
        if (!m) return;
        const clave = m[1].toLowerCase();
        tope.set(clave, Math.max(tope.get(clave) || 0, Number(m[2])));
    });
    if (!tope.size) return nuevos;
    return nuevos.map((it) => {
        const original = String(it?.etiqueta || '').trim();
        const m = ORDINAL.exec(original);
        if (!m) return it;
        const clave = m[1].toLowerCase();
        const siguiente = (tope.get(clave) || 0) + 1;
        tope.set(clave, siguiente);
        // Conserva la capitalización que traía la etiqueta original.
        return { ...it, etiqueta: `${m[1]} ${siguiente}` };
    });
};

export const lineaTiempo = {
    tipo: 'linea-tiempo',
    etiqueta: 'Línea del tiempo',
    emoji: '⏳',
    descripcion: 'Ordena los eventos o pasos en su secuencia correcta.',
    capacidades: { ia: true, banco: true, reutilizar: true, automatico: true },

    // Tarjeta del selector "Crear actividad" del docente. El copy es el
    // congelado por SPEC-013 §4.1: se mueve aquí sin cambiar una palabra.
    tarjetaCrear: {
        titulo: 'Línea del tiempo',
        descripcion: 'Eventos o pasos para ordenar, generados con IA',
        orden: 5
    },

    edicion: {
        claveItems: 'eventos',
        nombreItem: { singular: 'evento', plural: 'eventos' },
        clasificaPorDificultad: true,
        tituloReutilizar: 'Añadir eventos del banco',
        maxItems: 8,
        cantidades: [3, 4, 5, 6, 8],
        ayudaIA: 'Escribe el tema y la IA crea los eventos o pasos que el estudiante deberá ordenar.',
        itemVacio: () => ({ texto: '', etiqueta: '' }),
        articuloPlural: 'los',
        // El orden guardado ES el correcto; el reproductor lo desordena.
        reordenable: true,
        notaLista: 'Este es el orden CORRECTO: el juego lo desordenará para el estudiante.',
        itemCompleto: (item) => Boolean(item.texto?.trim()),
        resumenItem: (item, i) => item.texto?.trim() || `Evento ${i + 1} (sin escribir)`,
        FormularioItem: ({ item, onCambiar }) => (
            <>
                <label className="editor-campo">
                    <span>Evento o paso</span>
                    <input
                        type="text"
                        className="editor-alt-input"
                        value={item.texto}
                        placeholder="Ej. La semilla germina"
                        onChange={(e) => onCambiar({ texto: e.target.value })}
                    />
                </label>
                <label className="editor-campo">
                    <span>Etiqueta (opcional, ej. fecha o número)</span>
                    <input
                        type="text"
                        className="editor-alt-input"
                        value={item.etiqueta || ''}
                        placeholder="Ej. Paso 1, 1492…"
                        onChange={(e) => onCambiar({ etiqueta: e.target.value })}
                    />
                </label>
            </>
        ),
        textoParaIA: (item) => (item.texto || '').trim(),
        firmaItem: (item) => (item?.texto || '').trim().toLowerCase(),
        // Hook opcional al anexar ítems nuevos a los ya existentes. Solo este
        // tipo lo necesita; el resto no lo declara y el editor no hace nada.
        alAnexar: renumerarOrdinales
    },

    Player: LineaTiempo,
    enPestanaJuegos: true,

    resumen: (config) => `${config?.eventos?.length || 0} eventos para ordenar`,
    jugable: (config) => Boolean(config?.eventos?.length),

    VistaLectura: ({ config }) => (
        <ol className="bib-preview-lista">
            {(config.eventos || []).map((ev, i) => (
                <li key={i}>{ev.etiqueta ? <strong>{ev.etiqueta}: </strong> : null}{ev.texto}</li>
            ))}
        </ol>
    )
};

export default lineaTiempo;
