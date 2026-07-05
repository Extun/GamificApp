import { useState } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditNoteRoundedIcon from '@mui/icons-material/EditNoteRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import { EditorQuiz } from '../../components/quiz/EditorQuiz';
import { publicarReto } from '../../services/retosService';
import MATERIAS from '../../constants/materias';

const MAX_INTENTOS = 3;
const ESPERA_MS = 2000;

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Esquema que obliga a Gemini a devolver el quiz como JSON estructurado, para
// poder renderizarlo de forma interactiva en lugar de como texto plano.
const QUIZ_SCHEMA = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            pregunta: { type: Type.STRING },
            alternativas: {
                type: Type.OBJECT,
                properties: {
                    A: { type: Type.STRING },
                    B: { type: Type.STRING },
                    C: { type: Type.STRING },
                    D: { type: Type.STRING }
                },
                required: ['A', 'B', 'C', 'D']
            },
            correcta: { type: Type.STRING, description: 'Letra de la alternativa correcta: A, B, C o D' },
            justificacion: { type: Type.STRING }
        },
        required: ['pregunta', 'alternativas', 'correcta', 'justificacion']
    }
};

// Errores temporales del lado del servidor: saturación (503) o límite de
// peticiones (429). En estos casos conviene reintentar o probar otro modelo.
const esTemporal = (err) =>
    err?.status === 503 || err?.status === 429 ||
    /\b(503|429)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand/i.test(err?.message ?? '');

// Persistencia del historial: guardamos los últimos 3 quizzes POR MATERIA, en
// un objeto { [materia]: Quiz[] }, igual que el dashboard con los archivos.
const HISTORIAL_KEY = 'edu_historialQuizzes';
const HISTORIAL_MAX = 3;

const leerHistorialTodo = () => {
    try {
        const guardado = localStorage.getItem(HISTORIAL_KEY);
        const data = guardado ? JSON.parse(guardado) : {};
        // Si existiera un historial antiguo en formato array (global), lo
        // descartamos para no mezclarlo con el nuevo esquema por materia.
        return Array.isArray(data) ? {} : data;
    } catch {
        return {};
    }
};

// Cache de la lista de candidatos ya resuelta, para no listar en cada generación.
let candidatosCache = null;

// Descubre dinámicamente los modelos "flash" válidos de la cuenta y los devuelve
// ORDENADOS por preferencia, para no depender de un string fijo que Google puede
// no ofrecer en esta región/cuenta. Probaremos uno tras otro si alguno está
// saturado (503) o sin cuota (429).
async function resolverModelos(genAI) {
    if (candidatosCache) return candidatosCache;

    // Variantes que NO sirven para generar texto (imagen, audio, embeddings…).
    const NO_TEXTO = /image|tts|audio|embedding|vision|veo|imagen|lyria|robotics/i;

    const disponibles = [];
    for await (const m of await genAI.models.list()) {
        const metodos = m?.supportedActions || m?.supportedGenerationMethods || [];
        const soportaGenerar = !metodos.length || metodos.includes('generateContent');
        const nombre = m?.name?.replace(/^models\//, '') ?? '';
        if (soportaGenerar && nombre && !NO_TEXTO.test(nombre)) {
            disponibles.push(nombre);
        }
    }

    const flash = disponibles.filter((n) => n.toLowerCase().includes('flash'));

    if (!flash.length) {
        // Depuración: mostramos el array completo para saber qué acepta la cuenta.
        console.error('No se encontró ningún modelo "flash". Modelos disponibles:', disponibles);
        throw new Error('No hay ningún modelo "flash" disponible en esta cuenta.');
    }

    // Priorizamos los modelos "lite" (responden más rápido), luego el flash
    // normal. Preferimos alias estables ("...-latest") y dejamos al final los
    // preview/experimental, que suelen estar más saturados.
    const puntua = (n) => {
        let p = 0;
        if (n.includes('lite')) p -= 6;
        if (n.includes('latest')) p -= 4;
        if (/preview|exp/.test(n)) p += 3;
        return p;
    };
    flash.sort((a, b) => puntua(a) - puntua(b));

    console.log('Modelos "flash" candidatos (en orden de preferencia):', flash);
    candidatosCache = flash;
    return flash;
}

// Normaliza el JSON devuelto por la IA a un array de preguntas válidas.
const parsearQuiz = (texto = '') => {
    const limpio = texto.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const data = JSON.parse(limpio);
    const preguntas = Array.isArray(data) ? data : data?.preguntas;
    if (!Array.isArray(preguntas) || !preguntas.length) {
        throw new Error('La IA no devolvió preguntas en el formato esperado.');
    }
    return preguntas;
};

export function GeneradorQuiz({ materia = 'la materia' }) {
    const [tema, setTema] = useState('');
    const [cantidad, setCantidad] = useState(3);
    // Quiz actualmente abierto en el editor (en estado borrador o publicado). Null
    // cuando no se está editando nada.
    const [quizEdit, setQuizEdit] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState('');
    const [aviso, setAviso] = useState('');
    const [historialTodo, setHistorialTodo] = useState(leerHistorialTodo);
    // Solo los quizzes de la materia actual (últimos 3).
    const historial = historialTodo[materia] || [];

    // Persiste el mapa { materia: Quiz[] } completo en localStorage.
    const persistir = (mapa) => {
        try {
            localStorage.setItem(HISTORIAL_KEY, JSON.stringify(mapa));
        } catch {
            // Ignorar errores de cuota/persistencia de localStorage.
        }
    };

    // Añade un quiz al historial de su materia, conservando solo los últimos 3.
    const guardarEnHistorial = (entrada) => {
        setHistorialTodo((prev) => {
            const previosMateria = prev[entrada.materia] || [];
            const actualizado = {
                ...prev,
                [entrada.materia]: [entrada, ...previosMateria].slice(0, HISTORIAL_MAX)
            };
            persistir(actualizado);
            return actualizado;
        });
    };

    // Reemplaza un quiz existente (por id) en el historial de su materia.
    const actualizarEnHistorial = (entrada) => {
        setHistorialTodo((prev) => {
            const previosMateria = prev[entrada.materia] || [];
            const actualizado = {
                ...prev,
                [entrada.materia]: previosMateria.map((q) => (q.id === entrada.id ? entrada : q))
            };
            persistir(actualizado);
            return actualizado;
        });
    };

    // Elimina un quiz del historial; si está abierto en el editor, lo cierra.
    const eliminarDelHistorial = (id) => {
        setHistorialTodo((prev) => {
            const actualizado = {
                ...prev,
                [materia]: (prev[materia] || []).filter((q) => q.id !== id)
            };
            persistir(actualizado);
            return actualizado;
        });
        setQuizEdit((actual) => (actual?.id === id ? null : actual));
    };

    // Sincroniza los cambios del editor con el estado y el historial.
    const actualizarPreguntas = (nuevasPreguntas) => {
        const actualizado = { ...quizEdit, preguntas: nuevasPreguntas, cantidad: nuevasPreguntas.length };
        setQuizEdit(actualizado);
        actualizarEnHistorial(actualizado);
    };

    // Publica el quiz EN LA BASE DE DATOS (tabla `retos`, tipo 'quiz'): así lo
    // ven los estudiantes desde cualquier navegador/dispositivo. El historial
    // local queda solo como espacio de trabajo/borradores del docente.
    const publicarQuiz = async () => {
        const materiaId = MATERIAS.find((m) => m.nombre === materia)?.id;
        if (!materiaId) {
            setError('No se reconoce la materia actual; no se puede publicar.');
            return;
        }
        try {
            setError('');
            await publicarReto({
                materiaId,
                titulo: quizEdit.tema,
                tipo: 'quiz',
                configuracion: { preguntas: quizEdit.preguntas },
                xpRecompensa: quizEdit.preguntas.length * 100
            });
            const publicado = { ...quizEdit, estado: 'publicado' };
            setQuizEdit(publicado);
            actualizarEnHistorial(publicado);
            setAviso('¡Quiz publicado! Ya es visible para los estudiantes.');
            setTimeout(() => setAviso(''), 4000);
        } catch (err) {
            setError(`No se pudo publicar el quiz: ${err.message}`);
        }
    };

    // Pide N preguntas a la IA sobre un tema y devuelve el array ya parseado.
    // Reutilizado tanto por "Generar con IA" como por "Añadir con IA". Lanza si
    // ningún modelo responde, para que cada caller decida cómo informar el error.
    const pedirPreguntasIA = async (temaTxt, n, existentes = []) => {
        // Reglas estrictas de integridad de datos aplicadas a TODA generación.
        const reglas =
            `REGLAS ESTRICTAS:\n` +
            `1. Regla de Veracidad: Utiliza únicamente información verificada y factual. ` +
            `Si no tienes certeza sobre un dato, no lo inventes.\n` +
            `2. Regla de Unicidad: Antes de generar una nueva pregunta, analiza la lista de ` +
            `preguntas existentes en el quiz actual y asegúrate de que la nueva pregunta no sea ` +
            `duplicada ni conceptualmente idéntica a ninguna de ellas.`;

        // Lista de enunciados ya presentes para que la IA evite repetirlos.
        const yaExisten = existentes
            .map((p) => (p?.pregunta || '').trim())
            .filter(Boolean);
        const bloqueExistentes = yaExisten.length
            ? `\n\nPreguntas que YA existen en el quiz (NO las repitas ni reformules):\n` +
              yaExisten.map((q, idx) => `${idx + 1}. ${q}`).join('\n')
            : '';

        const systemPrompt =
            `Eres un docente experto en ${materia}. Genera un quiz de opción múltiple ` +
            `sobre el tema '${temaTxt}' con EXACTAMENTE ${n} preguntas. Cada pregunta debe tener ` +
            `4 alternativas (A–D), indicar la letra de la respuesta correcta y una justificación. ` +
            `Usa lenguaje pedagógico para educación básica, en español. ` +
            `Devuelve EXACTAMENTE ${n} preguntas, ni más ni menos.\n\n` +
            reglas +
            bloqueExistentes;

        const genAI = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
        const candidatos = await resolverModelos(genAI);
        let ultimoError = null;

        // Recorremos los modelos "flash" disponibles; ante saturación/cuota
        // reintentamos el mismo y, si sigue fallando, pasamos al siguiente.
        for (const modelName of candidatos) {
            for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
                try {
                    const response = await genAI.models.generateContent({
                        model: modelName,
                        contents: systemPrompt,
                        config: { responseMimeType: 'application/json', responseSchema: QUIZ_SCHEMA }
                    });
                    return parsearQuiz(response.text);
                } catch (err) {
                    ultimoError = err;
                    if (esTemporal(err) && intento < MAX_INTENTOS) {
                        await dormir(ESPERA_MS);
                        continue;
                    }
                    break;
                }
            }
        }
        throw ultimoError ?? new Error('No se obtuvo respuesta de ningún modelo.');
    };

    const handleGenerar = async (e) => {
        e.preventDefault();
        if (!tema.trim() || cargando) return;

        setCargando(true);
        setError('');
        setAviso('');
        setQuizEdit(null);

        try {
            const quiz = await pedirPreguntasIA(tema.trim(), cantidad);
            // El quiz nace como BORRADOR: el docente lo edita y solo se publica
            // cuando pulsa "Publicar quiz para estudiantes".
            const entrada = {
                id: Date.now(),
                materia,
                tema: tema.trim(),
                cantidad: quiz.length,
                preguntas: quiz,
                estado: 'borrador',
                fecha: new Date().toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' })
            };
            guardarEnHistorial(entrada);
            setQuizEdit(entrada);
        } catch (err) {
            console.error('Error al generar el quiz:', err);
            const detalle = err?.message ? ` (${err.message})` : '';
            setError(`No se pudo generar el quiz. Verifica tu conexión o la API Key.${detalle}`);
        } finally {
            setCargando(false);
        }
    };

    // "Añadir con IA": genera N preguntas extra sobre el mismo tema y las anexa
    // al quiz que se está editando. Devuelve una promesa para que el editor pueda
    // mostrar su propio estado de carga.
    const agregarConIA = async (n) => {
        if (!quizEdit) return;
        try {
            const nuevas = await pedirPreguntasIA(quizEdit.tema, n, quizEdit.preguntas);
            actualizarPreguntas([...quizEdit.preguntas, ...nuevas]);
        } catch (err) {
            console.error('Error al añadir preguntas con IA:', err);
            setError('No se pudieron generar las preguntas con IA. Inténtalo de nuevo.');
            setTimeout(() => setError(''), 4000);
        }
    };

    return (
        <section className="card materia-subvista">
            <div className="card-head">
                <h3>Generador de Quizzes con IA</h3>
                <span className="card-tag">{materia}</span>
            </div>

            <form className="quiz-form" onSubmit={handleGenerar}>
                <label className="quiz-field">
                    <span>Tema del Quiz</span>
                    <input
                        type="text"
                        value={tema}
                        onChange={(e) => setTema(e.target.value)}
                        placeholder="Ej. Fracciones equivalentes"
                    />
                </label>

                <label className="quiz-field">
                    <span>Cantidad de preguntas</span>
                    <select value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))}>
                        <option value={3}>3 preguntas</option>
                        <option value={5}>5 preguntas</option>
                        <option value={10}>10 preguntas</option>
                    </select>
                </label>

                <button type="submit" className="quiz-generar-btn" disabled={cargando || !tema.trim()}>
                    {cargando
                        ? <span className="quiz-spinner" aria-hidden="true" />
                        : <AutoAwesomeRoundedIcon sx={{ fontSize: '1.1rem' }} />}
                    {cargando ? 'Generando…' : 'Generar con IA'}
                </button>
            </form>

            {error && <p className="quiz-error">{error}</p>}
            {aviso && <p className="quiz-aviso">{aviso}</p>}

            {quizEdit && (
                <EditorQuiz
                    tema={quizEdit.tema}
                    preguntas={quizEdit.preguntas}
                    onChange={actualizarPreguntas}
                    onAgregarIA={agregarConIA}
                    onPublicar={publicarQuiz}
                />
            )}

            {historial.length > 0 && (
                <div className="quiz-historial">
                    <h4>Últimos quizzes generados</h4>
                    <ul className="quiz-historial-lista">
                        {historial.map((q) => {
                            const publicado = q.estado === 'publicado';
                            return (
                                <li key={q.id} className="quiz-historial-fila">
                                    <button
                                        type="button"
                                        className={`quiz-historial-item ${quizEdit?.id === q.id ? 'is-activo' : ''}`}
                                        onClick={() => { setQuizEdit(q); setAviso(''); }}
                                    >
                                        <span className="quiz-historial-tema">
                                            {q.tema}
                                            <span className={`quiz-estado-badge ${publicado ? 'is-publicado' : 'is-borrador'}`}>
                                                {publicado
                                                    ? <><CheckCircleRoundedIcon sx={{ fontSize: '0.85rem' }} /> Publicado</>
                                                    : <><EditNoteRoundedIcon sx={{ fontSize: '0.85rem' }} /> Borrador</>}
                                            </span>
                                        </span>
                                        <span className="quiz-historial-meta">
                                            {q.cantidad} preguntas · {q.fecha}
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        className="quiz-historial-eliminar"
                                        title="Eliminar quiz"
                                        aria-label={`Eliminar quiz ${q.tema}`}
                                        onClick={() => eliminarDelHistorial(q.id)}
                                    >
                                        <DeleteOutlineRoundedIcon sx={{ fontSize: '1.2rem' }} />
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </section>
    );
}
