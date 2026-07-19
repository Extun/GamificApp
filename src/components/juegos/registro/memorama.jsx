// Tipo de juego: Memorama — registro FRONTEND (SPEC-017, Fase 2).
import { Memorama } from '../Memorama';

export const memorama = {
    tipo: 'memorama',
    etiqueta: 'Memorama',
    emoji: '🃏',
    descripcion: 'Encuentra las parejas que se corresponden entre sí.',
    capacidades: { ia: true, banco: true, reutilizar: true, automatico: true },

    // Tarjeta del selector "Crear actividad" del docente. El copy es el
    // congelado por SPEC-013 §4.1: se mueve aquí sin cambiar una palabra.
    tarjetaCrear: {
        titulo: 'Memorama',
        descripcion: 'Parejas para emparejar, generadas con IA desde un tema',
        orden: 4
    },

    edicion: {
        claveItems: 'parejas',
        nombreItem: { singular: 'pareja', plural: 'parejas' },
        clasificaPorDificultad: true,
        tituloReutilizar: 'Añadir parejas del banco',
        maxItems: 10,
        cantidades: [4, 6, 8, 10],
        ayudaIA: 'Escribe el tema y la IA crea las parejas para emparejar (término y definición, operación y resultado…).',
        itemVacio: () => ({ a: '', b: '' }),
        // Firma para detectar duplicados al anexar (solo texto visible).
        articuloPlural: 'las',
        // ¿El ítem tiene todo lo necesario? (misma regla que valida el servidor)
        itemCompleto: (item) => Boolean(item.a?.trim() && item.b?.trim()),
        // Texto que resume el ítem en su fila colapsada del acordeón.
        resumenItem: (item, i) => ((item.a?.trim() || item.b?.trim())
            ? `${item.a?.trim() || '…'} ↔ ${item.b?.trim() || '…'}`
            : `Pareja ${i + 1} (sin escribir)`),
        // Campos del ítem. `onCambiar(parcial)` fusiona en el ítem; el editor
        // genérico no necesita saber qué campos existen.
        FormularioItem: ({ item, onCambiar }) => (
            <>
                <label className="editor-campo">
                    <span>Primera carta</span>
                    <input
                        type="text"
                        className="editor-alt-input"
                        value={item.a}
                        placeholder="Ej. 5 + 3"
                        onChange={(e) => onCambiar({ a: e.target.value })}
                    />
                </label>
                <label className="editor-campo">
                    <span>Segunda carta (su pareja)</span>
                    <input
                        type="text"
                        className="editor-alt-input"
                        value={item.b}
                        placeholder="Ej. 8"
                        onChange={(e) => onCambiar({ b: e.target.value })}
                    />
                </label>
            </>
        ),
        // Texto del ítem que viaja a la IA como contexto al ampliar la actividad.
        textoParaIA: (item) => {
            const a = (item.a || '').trim();
            const b = (item.b || '').trim();
            return (a || b) ? `${a} ↔ ${b}` : '';
        },
        firmaItem: (item) => {
            const t = (s) => (s || '').trim().toLowerCase();
            return `${t(item?.a)}|${t(item?.b)}`;
        }
    },

    Player: Memorama,
    enPestanaJuegos: true,

    resumen: (config) => `${config?.parejas?.length || 0} parejas`,
    jugable: (config) => Boolean(config?.parejas?.length),

    VistaLectura: ({ config }) => (
        <ul className="bib-preview-lista">
            {(config.parejas || []).map((p, i) => (
                <li key={i}>{p.a} <span aria-hidden="true">↔</span> {p.b}</li>
            ))}
        </ul>
    )
};

export default memorama;
