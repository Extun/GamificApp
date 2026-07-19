// Tipo de juego: Clasificador — registro FRONTEND (SPEC-017, Fase 2).
import { JuegoDragAndDrop } from '../../clasificador/JuegoDragAndDrop';

export const clasificador = {
    tipo: 'clasificador',
    etiqueta: 'Clasificador',
    emoji: '🧩',
    descripcion: 'Arrastra cada elemento a la categoría que le corresponde.',
    capacidades: { ia: true, banco: false, reutilizar: false, automatico: false },

    // Tarjeta del selector "Crear actividad" del docente. El copy es el
    // congelado por SPEC-013 §4.1: se mueve aquí sin cambiar una palabra.
    tarjetaCrear: {
        titulo: 'Juego Clasificador',
        descripcion: 'Arrastrar y soltar elementos en su categoría correcta',
        orden: 2
    },

    edicion: {
        claveItems: 'categorias',
        nombreItem: { singular: 'categoría', plural: 'categorías' },
        clasificaPorDificultad: true
    },

    Player: JuegoDragAndDrop,
    enPestanaJuegos: true,

    resumen: (config) => `${config?.categorias?.length || 0} categorías`,
    jugable: (config) => Boolean(config?.categorias?.length),

    VistaLectura: ({ config }) => (
        <ul className="bib-preview-lista">
            {(config.categorias || []).map((c, i) => (
                <li key={i}><strong>{c.nombre}:</strong> {(c.elementos || []).join(' · ')}</li>
            ))}
        </ul>
    )
};

export default clasificador;
