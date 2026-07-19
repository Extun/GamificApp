// Tipo de juego: Quiz — registro FRONTEND (SPEC-017, Fase 2).
// Quiz y Misión estaban fuera de `JUEGOS_UI`: tenían caminos privilegiados en
// PreviewJuegoModal, DashboardEstudiante y BibliotecaActividades. Ahora son
// ciudadanos normales del registro, como el resto.
import { QuizInteractivo } from '../../quiz/QuizInteractivo';

export const quiz = {
    tipo: 'quiz',
    etiqueta: 'Quiz',
    emoji: '✨',
    descripcion: 'Preguntas de opción múltiple con una respuesta correcta.',
    capacidades: { ia: true, banco: true, reutilizar: true, automatico: true },

    // Metadatos de edición: el editor genérico y el selector de reutilización
    // los leen de aquí en vez de tener un mapa por tipo (SPEC-017, Fase 3).
    // Tarjeta del selector "Crear actividad" del docente. El copy es el
    // congelado por SPEC-013 §4.1: se mueve aquí sin cambiar una palabra.
    tarjetaCrear: {
        titulo: 'Quiz',
        descripcion: 'Preguntas con opciones, generadas con IA a partir de un tema',
        orden: 1
    },

    edicion: {
        claveItems: 'preguntas',
        nombreItem: { singular: 'pregunta', plural: 'preguntas' },
        // El quiz no clasifica sus preguntas por dificultad; los demás sí.
        clasificaPorDificultad: false,
        tituloReutilizar: 'Añadir del banco de preguntas'
    },

    Player: QuizInteractivo,
    // El quiz tiene su propia pestaña y reproductor en el panel del
    // estudiante; no se lista entre los "juegos" genéricos.
    enPestanaJuegos: false,

    // QuizInteractivo no recibe `reto` como los demás reproductores: espera la
    // lista de preguntas suelta. Declararlo aquí evita que la vista previa
    // necesite un `if (tipo === 'quiz')`.
    propsPlayer: ({ reto, configuracion, comunes }) => ({
        ...comunes,
        preguntas: configuracion?.preguntas || [],
        mostrarPuntaje: true,
        reto
    }),

    resumen: (config) => `${config?.preguntas?.length || 0} preguntas`,
    jugable: (config) => Boolean(config?.preguntas?.length),

    // Vista de solo lectura para la Biblioteca del docente.
    VistaLectura: ({ config }) => (
        <ol className="bib-preview-lista">
            {(config.preguntas || []).map((p, i) => (
                <li key={i}>
                    <strong>{p.pregunta}</strong>
                    <ul>
                        {Object.entries(p.alternativas || {}).map(([letra, txt]) => (
                            <li key={letra} className={letra === p.correcta ? 'is-correcta' : ''}>
                                {letra}) {txt}{letra === p.correcta ? ' ✔' : ''}
                            </li>
                        ))}
                    </ul>
                </li>
            ))}
        </ol>
    )
};

export default quiz;
