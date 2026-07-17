// Mi Banco de Preguntas (SPEC-010, Fase 3): gestión del repositorio de
// preguntas reutilizables del docente. Aquí se cura el banco: ver, editar,
// duplicar, archivar/reactivar y eliminar. Las actividades ya creadas nunca
// se ven afectadas (guardan su propio snapshot en configuracion_json); editar
// una pregunta del banco solo cambia lo que se insertará de ahora en adelante.
// Tras cada escritura la lista se relee de la API (regla §6.11).
import { useEffect, useMemo, useState } from 'react';
import LibraryBooksRoundedIcon from '@mui/icons-material/LibraryBooksRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded';
import UnarchiveRoundedIcon from '@mui/icons-material/UnarchiveRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import bancoService from '../../services/bancoService';
import { etiquetaTipo } from '../../components/juegos/registroJuegos';
import {
    SectionCard, EmptyState, ModalPanel, TablaPro, StatCard
} from '../../components/dashboard/DashboardWidgets';
import '../../components/juegos/selectorBanco.css';

const DIFICULTAD_LABEL = { facil: 'Fácil', media: 'Media', dificil: 'Difícil' };
const LETRAS = ['A', 'B', 'C', 'D'];

const PESTANAS = [
    ['aprobada', 'Activas'],
    ['archivada', 'Archivadas'],
    ['todas', 'Todas']
];

// Validación mínima por tipo ANTES de guardar (espejo de VALIDADORES_ITEM del
// servidor), para dar mensajes claros sin ida y vuelta.
const validarContenido = (tipo, c) => {
    if (tipo === 'quiz') {
        if (!c?.pregunta?.trim()) return 'La pregunta necesita un enunciado.';
        if (!c?.alternativas?.A?.trim() || !c?.alternativas?.B?.trim()) {
            return 'La pregunta necesita al menos las alternativas A y B.';
        }
        if (!c?.alternativas?.[c?.correcta]?.trim()) {
            return 'La respuesta correcta debe ser una alternativa con texto.';
        }
    }
    if (tipo === 'memorama' && (!c?.a?.trim() || !c?.b?.trim())) {
        return 'La pareja necesita sus dos caras con texto.';
    }
    if (tipo === 'linea-tiempo' && !c?.texto?.trim()) {
        return 'El evento necesita un texto.';
    }
    if (tipo === 'completar') {
        if (!c?.texto?.includes('___')) return 'La frase necesita el espacio marcado con ___.';
        if ((c?.opciones || []).some((o) => !o?.trim())) return 'Todas las opciones necesitan texto.';
        if (!c?.opciones?.includes(c?.correcta)) return 'La opción correcta debe ser una de las opciones.';
    }
    return null;
};

// Campos de edición del CONTENIDO según el tipo de ítem.
function EditorContenido({ tipo, contenido, onCambiar }) {
    if (tipo === 'quiz') {
        return (
            <>
                <label className="quiz-field">
                    <span>Enunciado</span>
                    <input
                        value={contenido.pregunta || ''}
                        onChange={(e) => onCambiar({ ...contenido, pregunta: e.target.value })}
                    />
                </label>
                {LETRAS.map((letra) => (
                    <label key={letra} className="quiz-field banco-alt-row">
                        <span>
                            <input
                                type="radio"
                                name="banco-correcta"
                                checked={contenido.correcta === letra}
                                onChange={() => onCambiar({ ...contenido, correcta: letra })}
                                aria-label={`Marcar ${letra} como correcta`}
                            />{' '}
                            Opción {letra} {contenido.correcta === letra ? '✔' : ''}
                        </span>
                        <input
                            value={contenido.alternativas?.[letra] || ''}
                            onChange={(e) => onCambiar({
                                ...contenido,
                                alternativas: { ...contenido.alternativas, [letra]: e.target.value }
                            })}
                        />
                    </label>
                ))}
                <label className="quiz-field">
                    <span>Justificación (opcional)</span>
                    <input
                        value={contenido.justificacion || ''}
                        onChange={(e) => onCambiar({ ...contenido, justificacion: e.target.value })}
                    />
                </label>
            </>
        );
    }
    if (tipo === 'memorama') {
        return (
            <>
                <label className="quiz-field">
                    <span>Primera carta</span>
                    <input value={contenido.a || ''} onChange={(e) => onCambiar({ ...contenido, a: e.target.value })} />
                </label>
                <label className="quiz-field">
                    <span>Segunda carta</span>
                    <input value={contenido.b || ''} onChange={(e) => onCambiar({ ...contenido, b: e.target.value })} />
                </label>
            </>
        );
    }
    if (tipo === 'linea-tiempo') {
        return (
            <>
                <label className="quiz-field">
                    <span>Texto del evento</span>
                    <input value={contenido.texto || ''} onChange={(e) => onCambiar({ ...contenido, texto: e.target.value })} />
                </label>
                <label className="quiz-field">
                    <span>Etiqueta (opcional, p. ej. una fecha)</span>
                    <input value={contenido.etiqueta || ''} onChange={(e) => onCambiar({ ...contenido, etiqueta: e.target.value })} />
                </label>
            </>
        );
    }
    if (tipo === 'completar') {
        return (
            <>
                <label className="quiz-field">
                    <span>Frase (marca el espacio con ___)</span>
                    <input value={contenido.texto || ''} onChange={(e) => onCambiar({ ...contenido, texto: e.target.value })} />
                </label>
                {(contenido.opciones || []).map((op, i) => (
                    <label key={i} className="quiz-field banco-alt-row">
                        <span>
                            <input
                                type="radio"
                                name="banco-correcta"
                                checked={op === contenido.correcta}
                                onChange={() => onCambiar({ ...contenido, correcta: op })}
                                aria-label={`Marcar la opción ${i + 1} como correcta`}
                            />{' '}
                            Opción {i + 1} {op === contenido.correcta ? '✔' : ''}
                        </span>
                        <input
                            value={op}
                            onChange={(e) => {
                                const opciones = contenido.opciones.map((o, j) => (j === i ? e.target.value : o));
                                onCambiar({
                                    ...contenido,
                                    opciones,
                                    correcta: op === contenido.correcta ? e.target.value : contenido.correcta
                                });
                            }}
                        />
                    </label>
                ))}
            </>
        );
    }
    return null;
}

export function BancoPreguntas({ onAviso, onError }) {
    const [preguntas, setPreguntas] = useState([]);
    const [cargado, setCargado] = useState(false);
    const [pestana, setPestana] = useState('aprobada');
    const [filtroMateria, setFiltroMateria] = useState('');
    const [filtroTipo, setFiltroTipo] = useState('');
    // Edición: { fila, contenido, tema, dificultad, etiquetas } | null
    const [editando, setEditando] = useState(null);
    const [guardando, setGuardando] = useState(false);
    const [errorModal, setErrorModal] = useState('');
    const [ocupadaId, setOcupadaId] = useState(null);

    const cargar = async () => {
        try {
            setPreguntas(await bancoService.listarPreguntas());
        } catch (err) {
            onError?.(`No se pudo cargar el banco: ${err.message}`);
        } finally {
            setCargado(true);
        }
    };

    useEffect(() => { cargar(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, []);

    const materias = useMemo(() => {
        const mapa = new Map();
        preguntas.forEach((p) => mapa.set(String(p.materia_id), p.materia));
        return [...mapa.entries()];
    }, [preguntas]);

    const tipos = useMemo(() => [...new Set(preguntas.map((p) => p.tipo))], [preguntas]);

    const visibles = useMemo(() => preguntas.filter((p) =>
        (pestana === 'todas' || p.estado === pestana) &&
        (!filtroMateria || String(p.materia_id) === filtroMateria) &&
        (!filtroTipo || p.tipo === filtroTipo)
    ), [preguntas, pestana, filtroMateria, filtroTipo]);

    const stats = useMemo(() => ({
        total: preguntas.length,
        activas: preguntas.filter((p) => p.estado === 'aprobada').length,
        archivadas: preguntas.filter((p) => p.estado === 'archivada').length,
        ia: preguntas.filter((p) => p.origen === 'ia').length
    }), [preguntas]);

    // Ejecuta una acción de fila con candado por id y recarga desde la API.
    const accionFila = async (id, fn, exito) => {
        if (ocupadaId) return;
        setOcupadaId(id);
        try {
            const res = await fn();
            await cargar();
            onAviso?.(typeof exito === 'function' ? exito(res) : exito);
        } catch (err) {
            onError?.(err.message);
        } finally {
            setOcupadaId(null);
        }
    };

    const abrirEdicion = async (fila) => {
        try {
            const detalle = await bancoService.obtenerPregunta(fila.id);
            setErrorModal('');
            setEditando({
                fila,
                contenido: detalle.contenido || {},
                tema: detalle.tema || '',
                dificultad: detalle.dificultad || '',
                etiquetas: detalle.etiquetas || ''
            });
        } catch (err) {
            onError?.(`No se pudo abrir la pregunta: ${err.message}`);
        }
    };

    const guardarEdicion = async () => {
        if (guardando || !editando) return;
        const { fila, contenido, tema, dificultad, etiquetas } = editando;
        const invalido = validarContenido(fila.tipo, contenido);
        if (invalido) {
            setErrorModal(invalido);
            return;
        }
        setGuardando(true);
        try {
            await bancoService.editarPregunta(fila.id, {
                materiaId: fila.materia_id,
                contenido,
                tema: tema || undefined,
                dificultad: dificultad || undefined,
                etiquetas: etiquetas || undefined
            });
            setEditando(null);
            await cargar();
            onAviso?.('Pregunta actualizada. Las actividades ya creadas no cambian; las próximas inserciones usarán esta versión.');
        } catch (err) {
            setErrorModal(`No se pudo guardar: ${err.message}`);
        } finally {
            setGuardando(false);
        }
    };

    return (
        <SectionCard titulo="Mi Banco de Preguntas" Icon={LibraryBooksRoundedIcon}>
            <div className="stats-grid bib-stats-grid">
                <StatCard Icon={LibraryBooksRoundedIcon} valor={stats.total} etiqueta="Preguntas en total" />
                <StatCard Icon={UnarchiveRoundedIcon} valor={stats.activas} etiqueta="Activas (se pueden insertar)" tono="success" />
                <StatCard Icon={Inventory2RoundedIcon} valor={stats.archivadas} etiqueta="Archivadas" tono="warning" />
                <StatCard Icon={AutoAwesomeRoundedIcon} valor={stats.ia} etiqueta="Generadas con IA" />
            </div>

            <div className="banco-filtros" style={{ marginTop: '1rem' }}>
                <select value={pestana} onChange={(e) => setPestana(e.target.value)} aria-label="Filtrar por estado">
                    {PESTANAS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
                <select value={filtroMateria} onChange={(e) => setFiltroMateria(e.target.value)} aria-label="Filtrar por materia">
                    <option value="">Todas mis materias</option>
                    {materias.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
                </select>
                <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} aria-label="Filtrar por tipo de juego">
                    <option value="">Todos los tipos</option>
                    {tipos.map((t) => <option key={t} value={t}>{etiquetaTipo(t)}</option>)}
                </select>
            </div>

            {visibles.length ? (
                <TablaPro
                    placeholderBusqueda="Buscar por enunciado, tema o etiqueta…"
                    buscar={(p) => `${p.enunciado || ''} ${p.tema || ''} ${p.etiquetas || ''}`}
                    filas={visibles}
                    cabecera={
                        <tr>
                            <th>Pregunta</th>
                            <th>Materia</th>
                            <th>Tipo</th>
                            <th>Uso</th>
                            <th>Estado</th>
                            <th>Acciones</th>
                        </tr>
                    }
                    renderFila={(p) => (
                        <tr key={p.id}>
                            <td>
                                <strong>{p.enunciado || '(sin enunciado)'}</strong>
                                <div className="banco-item-meta">
                                    {p.tema ? `${p.tema} · ` : ''}
                                    {DIFICULTAD_LABEL[p.dificultad] || 'Sin dificultad'}
                                    {p.origen === 'ia' ? ' · ✨ IA' : ''}
                                </div>
                            </td>
                            <td>{p.materia}</td>
                            <td>{etiquetaTipo(p.tipo)}</td>
                            <td>{p.veces_utilizada} {p.veces_utilizada === 1 ? 'vez' : 'veces'}</td>
                            <td>{p.estado === 'aprobada' ? '✅ Activa' : '📦 Archivada'}</td>
                            <td>
                                <div className="admin-acciones">
                                <button type="button" title="Editar" disabled={!!ocupadaId} onClick={() => abrirEdicion(p)}>
                                    <EditRoundedIcon sx={{ fontSize: '1.1rem' }} />
                                </button>
                                <button
                                    type="button"
                                    title="Duplicar (copia activa con contadores en cero)"
                                    disabled={!!ocupadaId}
                                    onClick={() => accionFila(p.id, () => bancoService.duplicarPregunta(p.id), 'Copia creada en el banco.')}
                                >
                                    <ContentCopyRoundedIcon sx={{ fontSize: '1.1rem' }} />
                                </button>
                                {p.estado === 'aprobada' ? (
                                    <button
                                        type="button"
                                        title="Archivar (deja de aparecer en «Añadir del banco»)"
                                        disabled={!!ocupadaId}
                                        onClick={() => accionFila(p.id, () => bancoService.cambiarEstadoPregunta(p.id, 'archivada'), 'Pregunta archivada.')}
                                    >
                                        <Inventory2RoundedIcon sx={{ fontSize: '1.1rem' }} />
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        title="Reactivar (vuelve a estar disponible para insertar)"
                                        disabled={!!ocupadaId}
                                        onClick={() => accionFila(p.id, () => bancoService.cambiarEstadoPregunta(p.id, 'aprobada'), 'Pregunta reactivada.')}
                                    >
                                        <UnarchiveRoundedIcon sx={{ fontSize: '1.1rem' }} />
                                    </button>
                                )}
                                <button
                                    type="button"
                                    title="Eliminar (si ya se usó, se archiva; las actividades creadas no se tocan)"
                                    disabled={!!ocupadaId}
                                    onClick={() => accionFila(
                                        p.id,
                                        () => bancoService.eliminarPregunta(p.id),
                                        (res) => (res?.archivada
                                            ? 'La pregunta ya se había usado: quedó archivada (las actividades creadas no cambian).'
                                            : 'Pregunta eliminada del banco.')
                                    )}
                                >
                                    <DeleteOutlineRoundedIcon sx={{ fontSize: '1.1rem' }} />
                                </button>
                                </div>
                            </td>
                        </tr>
                    )}
                />
            ) : cargado && (
                <EmptyState
                    Icon={LibraryBooksRoundedIcon}
                    titulo={preguntas.length ? 'Nada coincide con los filtros' : 'Tu banco todavía está vacío'}
                    mensaje={preguntas.length
                        ? 'Prueba con otra pestaña u otros filtros.'
                        : 'Crea preguntas en los editores de juegos (manual o con IA): se guardan aquí automáticamente para reutilizarlas.'}
                />
            )}

            {editando && (
                <ModalPanel
                    titulo="Editar pregunta del banco"
                    subtitulo="Los cambios aplican a futuras inserciones; las actividades ya creadas conservan su propia copia."
                    onCerrar={() => !guardando && setEditando(null)}
                    pie={
                        <>
                            <button type="button" className="preview-action" disabled={guardando} onClick={() => setEditando(null)}>
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className="preview-action preview-action-primary"
                                disabled={guardando}
                                onClick={guardarEdicion}
                            >
                                {guardando ? 'Guardando…' : 'Guardar cambios'}
                            </button>
                        </>
                    }
                >
                    {errorModal && <p className="quiz-error">{errorModal}</p>}
                    <EditorContenido
                        tipo={editando.fila.tipo}
                        contenido={editando.contenido}
                        onCambiar={(contenido) => setEditando((prev) => ({ ...prev, contenido }))}
                    />
                    <div className="banco-filtros" style={{ marginTop: '0.75rem' }}>
                        <input
                            type="text"
                            placeholder="Tema (p. ej. Fracciones)"
                            aria-label="Tema"
                            value={editando.tema}
                            onChange={(e) => setEditando((prev) => ({ ...prev, tema: e.target.value }))}
                        />
                        <select
                            value={editando.dificultad}
                            aria-label="Dificultad"
                            onChange={(e) => setEditando((prev) => ({ ...prev, dificultad: e.target.value }))}
                        >
                            <option value="">Sin dificultad</option>
                            {Object.entries(DIFICULTAD_LABEL).map(([id, label]) => (
                                <option key={id} value={id}>{label}</option>
                            ))}
                        </select>
                        <input
                            type="text"
                            placeholder="Etiquetas (separadas por coma)"
                            aria-label="Etiquetas"
                            value={editando.etiquetas}
                            onChange={(e) => setEditando((prev) => ({ ...prev, etiquetas: e.target.value }))}
                        />
                    </div>
                </ModalPanel>
            )}
        </SectionCard>
    );
}

export default BancoPreguntas;
