// Tipo de juego: Misión Narrativa — registro FRONTEND (SPEC-017, Fase 2).
import { MisionNarrativa } from '../../mision/MisionNarrativa';

export const mision = {
    tipo: 'mision',
    etiqueta: 'Misión',
    emoji: '🗺️',
    descripcion: 'Una mini-aventura por capítulos donde el estudiante es el héroe.',
    capacidades: { ia: true, banco: false, reutilizar: false, automatico: false },

    // Tarjeta del selector "Crear actividad" del docente. El copy es el
    // congelado por SPEC-013 §4.1: se mueve aquí sin cambiar una palabra.
    tarjetaCrear: {
        titulo: 'Misión Narrativa',
        descripcion: 'Una historia por capítulos con desafíos para avanzar',
        orden: 3
    },

    edicion: {
        claveItems: 'desafios',
        nombreItem: { singular: 'desafío', plural: 'desafíos' },
        clasificaPorDificultad: true
    },

    Player: MisionNarrativa,
    // Igual que el quiz: pestaña y reproductor propios en el estudiante.
    enPestanaJuegos: false,

    resumen: (config) => `${config?.desafios?.length || 0} desafíos`,
    jugable: (config) => Boolean(config?.desafios?.length),

    VistaLectura: ({ config }) => (
        <div className="bib-preview-texto">
            {config.introduccion && <p><em>{config.introduccion}</em></p>}
            <ol className="bib-preview-lista">
                {(config.desafios || []).map((d, i) => (
                    <li key={i}>
                        <p>{d.narrativa}</p>
                        <strong>{d.pregunta}</strong>
                        <ul>
                            {Object.entries(d.alternativas || {}).map(([letra, txt]) => (
                                <li key={letra} className={letra === d.correcta ? 'is-correcta' : ''}>
                                    {letra}) {txt}{letra === d.correcta ? ' ✔' : ''}
                                </li>
                            ))}
                        </ul>
                    </li>
                ))}
            </ol>
            {config.final && <p><em>{config.final}</em></p>}
        </div>
    )
};

export default mision;
