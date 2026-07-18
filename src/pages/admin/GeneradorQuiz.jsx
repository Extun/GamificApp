import { useState } from 'react';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import { EditorQuiz } from '../../components/quiz/EditorQuiz';
import { SelectorBanco } from '../../components/juegos/SelectorBanco';
import { PreviewJuegoModal } from '../../components/juegos/PreviewJuegoModal';
import { useHistorialRetos, HistorialActividades } from '../../components/juegos/HistorialActividades';
import { publicarReto } from '../../services/retosService';
import { authFetch } from '../../services/authService';
import { idPorNombre } from '../../services/materiasService';
import bancoService from '../../services/bancoService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Copia profunda simple (los estados de los editores son JSON puro).
const clon = (v) => JSON.parse(JSON.stringify(v));

// SPEC-013: la configuración completa del quiz que se persiste en
// `configuracion_json` — preguntas (el pool completo), los dos flags de mezcla
// (default true) y cuántas preguntas se muestran por intento (0 = todas).
const configuracionDe = (quiz) => ({
    preguntas: quiz.preguntas,
    mezclar_preguntas: quiz.mezclarPreguntas !== false,
    mezclar_respuestas: quiz.mezclarRespuestas !== false,
    preguntas_por_intento: Number(quiz.preguntasPorIntento) || 0
});

// XP del quiz según lo que un estudiante puede responder EN UN INTENTO (si el
// quiz guarda 30 y muestra 5, la recompensa es por 5 — el servidor capa el
// abono con este valor, así que debe reflejar lo realmente jugable).
const xpRecompensaDe = (quiz) => {
    const totalPool = quiz.preguntas.length;
    const porIntento = Number(quiz.preguntasPorIntento) || 0;
    const jugables = porIntento > 0 ? Math.min(porIntento, totalPool) : totalPool;
    return Math.max(jugables, 1) * 100;
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
    // SPEC-010: modal del banco de preguntas (tercera fuente junto a manual e IA).
    const [bancoAbierto, setBancoAbierto] = useState(false);
    // SPEC-012: vista previa del quiz como estudiante (modo prueba).
    const [previewAbierta, setPreviewAbierta] = useState(false);
    // SPEC-011 — historial respaldado en BD: cada generación crea un reto
    // 'borrador' en `retos` y la lista se lee del servidor (los borradores
    // sobreviven a cambios de navegador; localStorage es solo caché offline).
    const { historial, crearBorrador, sincronizar, cancelarSincronizacion, eliminar: eliminarBorrador, abrirDetalle, refrescar } =
        useHistorialRetos('quiz', materia);

    // "Deshacer cambios": foto del quiz tal como se abrió/generó/publicó por
    // última vez. Restaurarla revierte TODAS las ediciones de la sesión actual
    // (también en la BD, re-sincronizando el borrador).
    const [snapshot, setSnapshot] = useState(null);
    const tomarSnapshot = (quiz) => setSnapshot(clon(quiz));
    const hayCambios = Boolean(
        quizEdit && snapshot &&
        JSON.stringify(configuracionDe(quizEdit)) !== JSON.stringify(configuracionDe(snapshot))
    );
    const deshacerCambios = () => {
        if (!hayCambios) return;
        const restaurado = clon(snapshot);
        setQuizEdit(restaurado);
        if (restaurado.retoId && !restaurado.publicadoEnBD) {
            sincronizar(restaurado.retoId, {
                configuracion: configuracionDe(restaurado),
                xp_recompensa: xpRecompensaDe(restaurado)
            });
        }
        setAviso('Cambios deshechos: el quiz volvió a como estaba al abrirlo.');
        setTimeout(() => setAviso(''), 4000);
    };

    // Elimina un quiz del historial (Papelera, recuperable desde la
    // Biblioteca); si está abierto en el editor, lo cierra.
    const eliminarDelHistorial = async (id) => {
        try {
            await eliminarBorrador(id);
            setQuizEdit((actual) => (actual?.retoId === id ? null : actual));
        } catch (err) {
            setError(`No se pudo eliminar: ${err.message}`);
            setTimeout(() => setError(''), 4000);
        }
    };

    // Sincroniza los cambios del editor con el estado local y, si el quiz
    // sigue siendo un borrador en la BD, con el servidor (PATCH con debounce).
    // Si ya estaba publicado, los cambios quedan en memoria y solo llegan a la
    // BD al volver a pulsar "Publicar" (nunca se edita un publicado en caliente).
    const actualizarPreguntas = (nuevasPreguntas) => {
        const actualizado = { ...quizEdit, preguntas: nuevasPreguntas, estado: 'borrador' };
        setQuizEdit(actualizado);
        if (actualizado.retoId && !actualizado.publicadoEnBD) {
            sincronizar(actualizado.retoId, {
                configuracion: configuracionDe(actualizado),
                xp_recompensa: xpRecompensaDe(actualizado)
            });
        }
    };

    // SPEC-013: cambia una opción de configuración del quiz ('mezclarPreguntas',
    // 'mezclarRespuestas' o 'preguntasPorIntento') y la sincroniza igual que una
    // edición de preguntas. El XP acompaña al cambio (depende de por-intento).
    const cambiarMezcla = (campo, valor) => {
        const actualizado = { ...quizEdit, [campo]: valor, estado: 'borrador' };
        setQuizEdit(actualizado);
        if (actualizado.retoId && !actualizado.publicadoEnBD) {
            sincronizar(actualizado.retoId, {
                configuracion: configuracionDe(actualizado),
                xp_recompensa: xpRecompensaDe(actualizado)
            });
        }
    };

    // Guarda en el banco (siempre, sin opción de apagarlo) las preguntas que aún
    // no vienen de él (sin `_banco_id`) y devuelve el array con los `_banco_id`
    // asignados. Los fallos individuales no bloquean el flujo: alimentar el
    // banco es un extra, no un requisito para generar/publicar.
    const guardarLoteEnBanco = async (items, temaTxt) => {
        const materiaId = idPorNombre(materia);
        if (!materiaId) return items;
        return Promise.all(items.map(async (p) => {
            if (p._banco_id) return p;
            try {
                const creada = await bancoService.crearPregunta({
                    materiaId,
                    tipo: 'quiz',
                    contenido: p,
                    tema: temaTxt || undefined
                });
                return { ...p, _banco_id: creada.id };
            } catch {
                return p;
            }
        }));
    };

    // Publica el quiz EN LA BASE DE DATOS (tabla `retos`, tipo 'quiz'): así lo
    // ven los estudiantes desde cualquier navegador/dispositivo. El POST es un
    // upsert por (materia, título), así que actualiza la misma fila del
    // borrador ya sincronizado en vez de duplicarla.
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
            // Un PATCH pendiente del debounce ya no hace falta: el POST que
            // sigue escribe el estado completo (y sobre publicado fallaría).
            cancelarSincronizacion(quizEdit.retoId);
            // Las preguntas manuales (ya completas al publicar) se guardan
            // también en el banco antes de publicar.
            const preguntas = await guardarLoteEnBanco(quizEdit.preguntas, quizEdit.tema);
            const data = await publicarReto({
                materiaId,
                titulo: quizEdit.tema,
                tipo: 'quiz',
                configuracion: configuracionDe({ ...quizEdit, preguntas }),
                xpRecompensa: xpRecompensaDe({ ...quizEdit, preguntas })
            });
            const publicadoQuiz = { ...quizEdit, retoId: data?.id ?? quizEdit.retoId, preguntas, estado: 'publicado', publicadoEnBD: true };
            setQuizEdit(publicadoQuiz);
            // Lo publicado es la nueva base: "Deshacer" ya no revierte más atrás.
            tomarSnapshot(publicadoQuiz);
            refrescar();
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
            let quiz = await pedirPreguntasIA(tema.trim(), cantidad);
            quiz = await guardarLoteEnBanco(quiz, tema.trim());
            // El quiz nace como BORRADOR EN LA BD (SPEC-011): sobrevive a
            // cambios de navegador y aparece también en la Biblioteca. Si el
            // guardado remoto falla, se sigue editando solo en memoria (el
            // botón Publicar lo crea igual, vía el upsert del POST).
            let retoId = null;
            try {
                const creado = await crearBorrador({
                    materiaId: idPorNombre(materia),
                    titulo: tema.trim(),
                    configuracion: { preguntas: quiz, mezclar_preguntas: true, mezclar_respuestas: true, preguntas_por_intento: 0 },
                    xpRecompensa: quiz.length * 100,
                    origen: 'ia'
                });
                retoId = creado?.id ?? null;
            } catch (err) {
                console.warn('El borrador no se pudo guardar en el servidor:', err.message);
            }
            const nuevo = {
                retoId, tema: tema.trim(), preguntas: quiz, estado: 'borrador', publicadoEnBD: false,
                mezclarPreguntas: true, mezclarRespuestas: true, preguntasPorIntento: 0
            };
            setQuizEdit(nuevo);
            tomarSnapshot(nuevo);
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
            let nuevas = await pedirPreguntasIA(quizEdit.tema, n, quizEdit.preguntas);
            nuevas = await guardarLoteEnBanco(nuevas, quizEdit.tema);
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

    // Reabre una entrada del historial: trae del servidor el reto completo
    // (la lista es ligera, sin configuración) y lo monta en el editor.
    const abrirDelHistorial = async (entrada) => {
        setAviso('');
        setError('');
        try {
            const detalle = await abrirDetalle(entrada.id);
            const abierto = {
                retoId: detalle.id,
                tema: detalle.titulo,
                preguntas: detalle.configuracion?.preguntas || [],
                estado: detalle.estado,
                publicadoEnBD: detalle.estado === 'publicado',
                // Flags ausentes en quizzes previos a SPEC-013 = mezclar (default)
                // y mostrar todas las preguntas.
                mezclarPreguntas: detalle.configuracion?.mezclar_preguntas !== false,
                mezclarRespuestas: detalle.configuracion?.mezclar_respuestas !== false,
                preguntasPorIntento: Number(detalle.configuracion?.preguntas_por_intento) || 0
            };
            setQuizEdit(abierto);
            tomarSnapshot(abierto);
        } catch (err) {
            setError(`No se pudo abrir la actividad: ${err.message}`);
            setTimeout(() => setError(''), 4000);
        }
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
            const contenido = { ...pregunta };
            delete contenido._banco_id;
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
                    onVistaPrevia={() => setPreviewAbierta(true)}
                    onCerrar={() => setQuizEdit(null)}
                    onDeshacer={deshacerCambios}
                    hayCambios={hayCambios}
                    mezclarPreguntas={quizEdit.mezclarPreguntas}
                    mezclarRespuestas={quizEdit.mezclarRespuestas}
                    preguntasPorIntento={quizEdit.preguntasPorIntento}
                    onCambiarMezcla={cambiarMezcla}
                />
            )}

            {previewAbierta && quizEdit && (
                <PreviewJuegoModal
                    tipo="quiz"
                    titulo={quizEdit.tema}
                    configuracion={configuracionDe(quizEdit)}
                    onCerrar={() => setPreviewAbierta(false)}
                />
            )}

            {bancoAbierto && quizEdit && (
                <SelectorBanco
                    tipo="quiz"
                    materiaId={idPorNombre(materia)}
                    onInsertar={agregarDelBanco}
                    onCerrar={() => setBancoAbierto(false)}
                />
            )}

            <HistorialActividades
                titulo="Últimos quizzes generados"
                items={historial}
                activoId={quizEdit?.retoId}
                onAbrir={abrirDelHistorial}
                onCerrar={() => setQuizEdit(null)}
                onEliminar={eliminarDelHistorial}
            />
        </section>
    );
}
