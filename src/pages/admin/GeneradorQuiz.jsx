import { useState } from 'react';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditNoteRoundedIcon from '@mui/icons-material/EditNoteRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import { EditorQuiz } from '../../components/quiz/EditorQuiz';
import { SelectorBancoQuiz } from '../../components/quiz/SelectorBancoQuiz';
import { publicarReto } from '../../services/retosService';
import { authFetch } from '../../services/authService';
import { idPorNombre } from '../../services/materiasService';
import bancoService from '../../services/bancoService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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

export function GeneradorQuiz({ materia = 'la materia' }) {
    const [tema, setTema] = useState('');
    const [cantidad, setCantidad] = useState(3);
    // Quiz actualmente abierto en el editor (en estado borrador o publicado). Null
    // cuando no se está editando nada.
    const [quizEdit, setQuizEdit] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [publicando, setPublicando] = useState(false);
    const [error, setError] = useState('');
    const [aviso, setAviso] = useState('');
    const [historialTodo, setHistorialTodo] = useState(leerHistorialTodo);
    // SPEC-010: modal del banco de preguntas (tercera fuente junto a manual e IA).
    const [bancoAbierto, setBancoAbierto] = useState(false);
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

    // Sincroniza los cambios del editor con el estado y el historial. Si el
    // quiz ya estaba publicado, editar lo convierte en un borrador nuevo (al
    // publicarlo otra vez se crea otro reto, no se modifica el anterior).
    const actualizarPreguntas = (nuevasPreguntas) => {
        const actualizado = { ...quizEdit, preguntas: nuevasPreguntas, cantidad: nuevasPreguntas.length, estado: 'borrador' };
        setQuizEdit(actualizado);
        actualizarEnHistorial(actualizado);
    };

    // Publica el quiz EN LA BASE DE DATOS (tabla `retos`, tipo 'quiz'): así lo
    // ven los estudiantes desde cualquier navegador/dispositivo. El historial
    // local queda solo como espacio de trabajo/borradores del docente.
    const publicarQuiz = async () => {
        if (publicando || quizEdit?.estado === 'publicado') return;
        const materiaId = idPorNombre(materia);
        if (!materiaId) {
            setError('No se reconoce la materia actual; no se puede publicar.');
            return;
        }
        setPublicando(true);
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
        } finally {
            setPublicando(false);
        }
    };

    // Pide N preguntas a la IA vía el backend (POST /api/ia/quiz): la API key
    // de Gemini vive solo en el servidor. Reutilizado por "Generar con IA" y
    // "Añadir con IA"; lanza si el servidor no pudo generar.
    const pedirPreguntasIA = async (temaTxt, n, existentes = []) => {
        const res = await authFetch(`${API_URL}/api/ia/quiz`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                materia,
                tema: temaTxt,
                cantidad: n,
                existentes: existentes.map((p) => (p?.pregunta || '').trim()).filter(Boolean)
            })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        return data.preguntas;
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
            setError(`No se pudo generar el quiz. Verifica tu conexión.${detalle}`);
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

    // SPEC-010: inserta en el quiz las preguntas elegidas del banco. Llegan
    // como copia con la misma forma que una pregunta escrita a mano (más su
    // `_banco_id` de procedencia, que el juego ignora).
    const agregarDelBanco = (items) => {
        if (!quizEdit || !items.length) return;
        actualizarPreguntas([...quizEdit.preguntas, ...items]);
        setBancoAbierto(false);
        setAviso(`${items.length} ${items.length === 1 ? 'pregunta añadida' : 'preguntas añadidas'} del banco.`);
        setTimeout(() => setAviso(''), 4000);
    };

    // SPEC-010: guarda una pregunta del quiz en el banco para reutilizarla en
    // futuros quizzes. Se guarda sin el metadato `_banco_id` (si viniera del
    // banco, sería crear un duplicado consciente, no re-referenciarla).
    const guardarPreguntaEnBanco = async (pregunta) => {
        const materiaId = idPorNombre(materia);
        if (!materiaId) {
            setError('No se reconoce la materia actual; no se puede guardar en el banco.');
            setTimeout(() => setError(''), 4000);
            return;
        }
        try {
            const { _banco_id, ...contenido } = pregunta;
            await bancoService.crearPregunta({
                materiaId,
                tipo: 'quiz',
                contenido,
                tema: quizEdit?.tema || undefined
            });
            setAviso('Pregunta guardada en tu banco. Podrás reutilizarla con «Añadir del banco».');
            setTimeout(() => setAviso(''), 4000);
        } catch (err) {
            setError(`No se pudo guardar en el banco: ${err.message}`);
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
                    publicando={publicando}
                    publicado={quizEdit.estado === 'publicado'}
                    onAbrirBanco={() => setBancoAbierto(true)}
                    onGuardarEnBanco={guardarPreguntaEnBanco}
                />
            )}

            {bancoAbierto && quizEdit && (
                <SelectorBancoQuiz
                    materiaId={idPorNombre(materia)}
                    onInsertar={agregarDelBanco}
                    onCerrar={() => setBancoAbierto(false)}
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
