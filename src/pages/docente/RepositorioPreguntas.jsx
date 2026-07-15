// Repositorio de Preguntas (SPEC-010, Fase 1): biblioteca de preguntas
// reutilizables por materia/tema/tipo. Crear, editar, duplicar, archivar,
// buscar y filtrar. Módulo aditivo: no toca actividades, juegos ni IA.
// Tipos de la Fase 1: quiz, completar, memorama y línea del tiempo.
import { useEffect, useMemo, useState } from 'react';
import QuizRoundedIcon from '@mui/icons-material/QuizRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded';
import UnarchiveRoundedIcon from '@mui/icons-material/UnarchiveRounded';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import bancoService from '../../services/bancoService';
import docenteService from '../../services/docenteService';
import { etiquetaTipo, TIPOS_ACTIVIDAD } from '../../components/juegos/registroJuegos';
import {
    SectionCard, EmptyState, ModalPanel, TablaPro, StatCard, formatearFecha
} from '../../components/dashboard/DashboardWidgets';

const DIFICULTAD_LABEL = { facil: 'Fácil', media: 'Media', dificil: 'Difícil' };
const ESTADO_LABEL = { pendiente: 'Pendiente', aprobada: 'Aprobada', archivada: 'Archivada' };

// Tipos soportados por el repositorio en la Fase 1 (los compuestos —misión y
// clasificador— llegan en la Fase 2).
const TIPOS_BANCO = ['quiz', 'completar', 'memorama', 'linea-tiempo'];

const PESTANAS = [
    ['todas', 'Todas'],
    ['pendiente', 'Pendientes'],
    ['aprobada', 'Aprobadas'],
    ['archivada', 'Archivadas']
];

// Contenido vacío inicial por tipo (misma forma que el ítem del juego).
const CONTENIDO_VACIO = {
    quiz: { pregunta: '', alternativas: { A: '', B: '', C: '', D: '' }, correcta: 'A', justificacion: '' },
    completar: { texto: '', opciones: ['', '', ''], correcta: '' },
    memorama: { a: '', b: '' },
    'linea-tiempo': { texto: '', etiqueta: '' }
};

// ---- Formularios por tipo (controlados por el modal de crear/editar) -------
function CamposQuiz({ contenido, onChange }) {
    const setAlt = (letra, valor) =>
        onChange({ ...contenido, alternativas: { ...contenido.alternativas, [letra]: valor } });
    return (
        <>
            <label>
                Pregunta
                <input
                    value={contenido.pregunta}
                    onChange={(e) => onChange({ ...contenido, pregunta: e.target.value })}
                    placeholder="Ej: ¿Cuánto es 2 + 2?"
                    maxLength={255}
                />
            </label>
            {['A', 'B', 'C', 'D'].map((letra) => (
                <label key={letra} className="repo-alternativa">
                    Alternativa {letra}{letra === 'C' || letra === 'D' ? ' (opcional)' : ''}
                    <span className="repo-alt-fila">
                        <input
                            value={contenido.alternativas[letra] || ''}
                            onChange={(e) => setAlt(letra, e.target.value)}
                            placeholder={`Texto de la alternativa ${letra}`}
                            maxLength={255}
                        />
                        <span className="repo-alt-correcta">
                            <input
                                type="radio"
                                name="alt-correcta"
                                checked={contenido.correcta === letra}
                                onChange={() => onChange({ ...contenido, correcta: letra })}
                                aria-label={`Marcar ${letra} como correcta`}
                            />
                            correcta
                        </span>
                    </span>
                </label>
            ))}
            <label>
                Justificación (opcional, el estudiante la ve al responder)
                <input
                    value={contenido.justificacion || ''}
                    onChange={(e) => onChange({ ...contenido, justificacion: e.target.value })}
                    placeholder="Ej: Porque 2 + 2 = 4"
                    maxLength={255}
                />
            </label>
        </>
    );
}

function CamposCompletar({ contenido, onChange }) {
    const setOpcion = (i, valor) => {
        const opciones = contenido.opciones.map((o, j) => (j === i ? valor : o));
        // Si la opción editada era la correcta, la referencia se actualiza.
        const correcta = contenido.correcta === contenido.opciones[i] ? valor : contenido.correcta;
        onChange({ ...contenido, opciones, correcta });
    };
    return (
        <>
            <label>
                Frase (marca el espacio a completar con ___)
                <input
                    value={contenido.texto}
                    onChange={(e) => onChange({ ...contenido, texto: e.target.value })}
                    placeholder="Ej: El agua hierve a ___ grados."
                    maxLength={255}
                />
            </label>
            {contenido.opciones.map((op, i) => (
                <label key={i} className="repo-alternativa">
                    Opción {i + 1}{i > 1 ? ' (opcional)' : ''}
                    <span className="repo-alt-fila">
                        <input
                            value={op}
                            onChange={(e) => setOpcion(i, e.target.value)}
                            placeholder={`Texto de la opción ${i + 1}`}
                            maxLength={120}
                        />
                        <span className="repo-alt-correcta">
                            <input
                                type="radio"
                                name="opcion-correcta"
                                checked={op !== '' && contenido.correcta === op}
                                onChange={() => onChange({ ...contenido, correcta: op })}
                                aria-label={`Marcar la opción ${i + 1} como correcta`}
                            />
                            correcta
                        </span>
                    </span>
                </label>
            ))}
        </>
    );
}

function CamposMemorama({ contenido, onChange }) {
    return (
        <>
            <label>
                Primera cara de la pareja
                <input
                    value={contenido.a}
                    onChange={(e) => onChange({ ...contenido, a: e.target.value })}
                    placeholder="Ej: 🐬 Delfín"
                    maxLength={120}
                />
            </label>
            <label>
                Segunda cara (la que le corresponde)
                <input
                    value={contenido.b}
                    onChange={(e) => onChange({ ...contenido, b: e.target.value })}
                    placeholder="Ej: Mamífero marino"
                    maxLength={120}
                />
            </label>
        </>
    );
}

function CamposLineaTiempo({ contenido, onChange }) {
    return (
        <>
            <label>
                Evento o paso (una frase corta)
                <input
                    value={contenido.texto}
                    onChange={(e) => onChange({ ...contenido, texto: e.target.value })}
                    placeholder="Ej: La semilla germina"
                    maxLength={255}
                />
            </label>
            <label>
                Etiqueta (opcional: fecha o número de paso)
                <input
                    value={contenido.etiqueta || ''}
                    onChange={(e) => onChange({ ...contenido, etiqueta: e.target.value })}
                    placeholder="Ej: Paso 1"
                    maxLength={60}
                />
            </label>
        </>
    );
}

const CAMPOS_POR_TIPO = {
    quiz: CamposQuiz,
    completar: CamposCompletar,
    memorama: CamposMemorama,
    'linea-tiempo': CamposLineaTiempo
};

export function RepositorioPreguntas({ onAviso, onError }) {
    const [preguntas, setPreguntas] = useState([]);
    const [cargado, setCargado] = useState(false);
    const [pestana, setPestana] = useState('todas');
    const [busqueda, setBusqueda] = useState('');
    const [filtroTipo, setFiltroTipo] = useState('');
    const [filtroMateria, setFiltroMateria] = useState('');
    const [filtroDificultad, setFiltroDificultad] = useState('');
    const [misMaterias, setMisMaterias] = useState([]);

    // Modal de crear/editar: null | { id?, materiaId, tipo, tema, dificultad,
    // etiquetas, explicacion, contenido }
    const [editor, setEditor] = useState(null);
    const [guardando, setGuardando] = useState(false);

    const cargar = () => bancoService.listarPreguntas()
        .then(setPreguntas)
        .catch((err) => onError?.(`No se pudo cargar el repositorio: ${err.message}`))
        .finally(() => setCargado(true));

    useEffect(() => {
        cargar();
        docenteService.misMaterias().then(setMisMaterias).catch(() => setMisMaterias([]));
        // eslint-disable-next-line react-hooks/exhaustive-deps -- carga inicial
    }, []);

    const materiasPresentes = useMemo(
        () => [...new Set(preguntas.map((p) => p.materia))],
        [preguntas]
    );

    const visibles = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        return preguntas.filter((p) =>
            (pestana === 'todas' || p.estado === pestana) &&
            (!q || `${p.enunciado || ''} ${p.tema || ''} ${p.etiquetas || ''} ${p.materia}`.toLowerCase().includes(q)) &&
            (!filtroTipo || p.tipo === filtroTipo) &&
            (!filtroMateria || p.materia === filtroMateria) &&
            (!filtroDificultad || p.dificultad === filtroDificultad)
        );
    }, [preguntas, pestana, busqueda, filtroTipo, filtroMateria, filtroDificultad]);

    const totales = useMemo(() => ({
        total: preguntas.length,
        pendientes: preguntas.filter((p) => p.estado === 'pendiente').length,
        aprobadas: preguntas.filter((p) => p.estado === 'aprobada').length,
        archivadas: preguntas.filter((p) => p.estado === 'archivada').length
    }), [preguntas]);

    const ejecutar = async (accion, mensajeOk) => {
        try {
            await accion();
            if (mensajeOk) onAviso?.(mensajeOk);
            await cargar();
        } catch (err) {
            onError?.(err.message);
        }
    };

    const abrirNueva = () => setEditor({
        materiaId: misMaterias[0]?.id || '',
        tipo: 'quiz',
        tema: '',
        dificultad: '',
        etiquetas: '',
        explicacion: '',
        contenido: { ...CONTENIDO_VACIO.quiz }
    });

    const abrirEdicion = async (pregunta) => {
        try {
            const detalle = await bancoService.obtenerPregunta(pregunta.id);
            setEditor({
                id: detalle.id,
                materiaId: detalle.materia_id,
                tipo: detalle.tipo,
                tema: detalle.tema || '',
                dificultad: detalle.dificultad || '',
                etiquetas: detalle.etiquetas || '',
                explicacion: detalle.explicacion || '',
                contenido: detalle.contenido || { ...CONTENIDO_VACIO[detalle.tipo] }
            });
        } catch (err) {
            onError?.(`No se pudo abrir la pregunta: ${err.message}`);
        }
    };

    const cambiarTipoEditor = (tipo) =>
        setEditor((e) => ({ ...e, tipo, contenido: { ...CONTENIDO_VACIO[tipo] } }));

    const guardar = async () => {
        if (!editor) return;
        setGuardando(true);
        try {
            const datos = {
                materiaId: Number(editor.materiaId),
                tipo: editor.tipo,
                contenido: editor.contenido,
                tema: editor.tema || undefined,
                dificultad: editor.dificultad || undefined,
                explicacion: editor.explicacion || undefined,
                etiquetas: editor.etiquetas || undefined
            };
            if (editor.id) {
                await bancoService.editarPregunta(editor.id, datos);
                onAviso?.('Pregunta actualizada en el repositorio.');
            } else {
                await bancoService.crearPregunta(datos);
                onAviso?.('Pregunta guardada en el repositorio.');
            }
            setEditor(null);
            await cargar();
        } catch (err) {
            onError?.(err.message);
        } finally {
            setGuardando(false);
        }
    };

    const CamposTipo = editor ? CAMPOS_POR_TIPO[editor.tipo] : null;

    return (
        <SectionCard
            titulo="Repositorio de Preguntas"
            Icon={QuizRoundedIcon}
            tag={visibles.length ? `${visibles.length}` : undefined}
            accion={{ label: 'Nueva pregunta', Icon: AddRoundedIcon, onClick: abrirNueva }}
        >
            {preguntas.length > 0 && (
                <div className="stats-grid bib-stats-grid">
                    <StatCard valor={totales.total} etiqueta="Preguntas en total" />
                    <StatCard valor={totales.aprobadas} etiqueta="Aprobadas" tono="accent" />
                    <StatCard valor={totales.pendientes} etiqueta="Pendientes de revisar" tono="gold" />
                    <StatCard valor={totales.archivadas} etiqueta="Archivadas" />
                </div>
            )}

            <nav className="doc-tabs bib-tabs" aria-label="Estado de las preguntas">
                {PESTANAS.map(([id, label]) => (
                    <button
                        key={id}
                        type="button"
                        className={`doc-tab doc-tab-mini ${pestana === id ? 'doc-tab-activa' : ''}`}
                        onClick={() => setPestana(id)}
                    >
                        {label}
                    </button>
                ))}
            </nav>

            <div className="bib-filtros">
                <input
                    type="search"
                    placeholder="Buscar por enunciado, tema o etiqueta…"
                    aria-label="Buscar preguntas"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                />
                <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} aria-label="Filtrar por tipo">
                    <option value="">Todos los tipos</option>
                    {TIPOS_BANCO.map((t) => <option key={t} value={t}>{etiquetaTipo(t)}</option>)}
                </select>
                <select value={filtroMateria} onChange={(e) => setFiltroMateria(e.target.value)} aria-label="Filtrar por materia">
                    <option value="">Todas las materias</option>
                    {materiasPresentes.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <select value={filtroDificultad} onChange={(e) => setFiltroDificultad(e.target.value)} aria-label="Filtrar por dificultad">
                    <option value="">Cualquier dificultad</option>
                    {Object.entries(DIFICULTAD_LABEL).map(([id, label]) => (
                        <option key={id} value={id}>{label}</option>
                    ))}
                </select>
            </div>

            {visibles.length ? (
                <TablaPro
                    filas={visibles}
                    cabecera={
                        <tr>
                            <th>Pregunta</th><th>Tipo</th><th>Materia</th><th>Tema</th>
                            <th>Dificultad</th><th>Estado</th><th>Usos</th><th>Creada</th><th>Acciones</th>
                        </tr>
                    }
                    renderFila={(p) => (
                        <tr key={p.id}>
                            <td>
                                <strong>{p.enunciado || '(sin enunciado)'}</strong>
                                {p.origen === 'ia' && <span className="bib-origen-ia" title="Generada con IA"> ✨</span>}
                            </td>
                            <td>
                                <span className="bib-tipo-chip">
                                    <span aria-hidden="true">{TIPOS_ACTIVIDAD[p.tipo]?.emoji || '🎯'}</span>
                                    {etiquetaTipo(p.tipo)}
                                </span>
                            </td>
                            <td>
                                <span className="docente-chip" style={{ background: p.color || '#e0f2fe' }}>
                                    <span aria-hidden="true">{p.icono || '📚'}</span> {p.materia}
                                </span>
                            </td>
                            <td>{p.tema || '—'}</td>
                            <td>{DIFICULTAD_LABEL[p.dificultad] || '—'}</td>
                            <td><span className={`bib-estado bib-estado-${p.estado === 'aprobada' ? 'publicado' : p.estado === 'archivada' ? 'archivado' : 'borrador'}`}>{ESTADO_LABEL[p.estado]}</span></td>
                            <td>{p.veces_utilizada}</td>
                            <td>{formatearFecha(p.creado_en)}</td>
                            <td>
                                <div className="admin-acciones">
                                    <button
                                        title="Editar la pregunta"
                                        aria-label={`Editar "${p.enunciado}"`}
                                        onClick={() => abrirEdicion(p)}
                                    >
                                        <EditRoundedIcon sx={{ fontSize: '1.05rem' }} />
                                    </button>
                                    <button
                                        title="Duplicar (crea una copia aprobada)"
                                        aria-label={`Duplicar "${p.enunciado}"`}
                                        onClick={() => ejecutar(() => bancoService.duplicarPregunta(p.id), 'Copia creada en el repositorio.')}
                                    >
                                        <ContentCopyRoundedIcon sx={{ fontSize: '1.05rem' }} />
                                    </button>
                                    {p.estado === 'pendiente' && (
                                        <button
                                            title="Aprobar (queda disponible para usar)"
                                            aria-label={`Aprobar "${p.enunciado}"`}
                                            onClick={() => ejecutar(() => bancoService.cambiarEstadoPregunta(p.id, 'aprobada'), 'Pregunta aprobada.')}
                                        >
                                            <TaskAltRoundedIcon sx={{ fontSize: '1.05rem' }} />
                                        </button>
                                    )}
                                    {p.estado === 'archivada' ? (
                                        <button
                                            title="Reactivar (vuelve a estar disponible)"
                                            aria-label={`Reactivar "${p.enunciado}"`}
                                            onClick={() => ejecutar(() => bancoService.cambiarEstadoPregunta(p.id, 'aprobada'), 'Pregunta reactivada.')}
                                        >
                                            <UnarchiveRoundedIcon sx={{ fontSize: '1.05rem' }} />
                                        </button>
                                    ) : (
                                        <button
                                            title="Archivar (deja de ofrecerse, no se borra)"
                                            aria-label={`Archivar "${p.enunciado}"`}
                                            onClick={() => ejecutar(() => bancoService.cambiarEstadoPregunta(p.id, 'archivada'), 'Pregunta archivada.')}
                                        >
                                            <Inventory2RoundedIcon sx={{ fontSize: '1.05rem' }} />
                                        </button>
                                    )}
                                    <button
                                        title={p.veces_utilizada > 0
                                            ? 'Ya fue usada: se archivará en lugar de borrarse'
                                            : 'Eliminar del repositorio'}
                                        aria-label={`Eliminar "${p.enunciado}"`}
                                        className="accion-peligro"
                                        onClick={() => {
                                            const msg = p.veces_utilizada > 0
                                                ? `"${p.enunciado}" ya se usó en actividades: se archivará (no se borra). ¿Continuar?`
                                                : `¿Eliminar "${p.enunciado}" del repositorio? Esta acción no se puede deshacer.`;
                                            if (window.confirm(msg)) {
                                                ejecutar(() => bancoService.eliminarPregunta(p.id),
                                                    p.veces_utilizada > 0 ? 'Pregunta archivada.' : 'Pregunta eliminada.');
                                            }
                                        }}
                                    >
                                        <DeleteOutlineRoundedIcon sx={{ fontSize: '1.05rem' }} />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    )}
                />
            ) : cargado && (
                preguntas.length ? (
                    <p className="tablapro-vacio">Ninguna pregunta coincide con los filtros.</p>
                ) : (
                    <EmptyState
                        Icon={QuizRoundedIcon}
                        titulo="Tu repositorio está vacío"
                        mensaje="Guarda aquí tus preguntas para reutilizarlas en futuras actividades. Crea la primera con el botón «Nueva pregunta»."
                        accion={{ label: 'Nueva pregunta', onClick: abrirNueva }}
                    />
                )
            )}

            {editor && CamposTipo && (
                <ModalPanel
                    titulo={editor.id ? 'Editar pregunta' : 'Nueva pregunta'}
                    subtitulo={editor.id
                        ? 'Las actividades que ya la usaron no cambian.'
                        : 'Quedará guardada para reutilizarla en futuras actividades.'}
                    onCerrar={() => !guardando && setEditor(null)}
                    pie={
                        <>
                            <button type="button" className="preview-action" disabled={guardando} onClick={() => setEditor(null)}>
                                Cancelar
                            </button>
                            <button type="button" className="preview-action preview-action-primary" disabled={guardando} onClick={guardar}>
                                <TaskAltRoundedIcon />
                                {guardando ? 'Guardando…' : (editor.id ? 'Guardar cambios' : 'Guardar pregunta')}
                            </button>
                        </>
                    }
                >
                    <div className="perfil-form">
                        <label>
                            Materia
                            <select
                                value={editor.materiaId}
                                onChange={(e) => setEditor((ed) => ({ ...ed, materiaId: e.target.value }))}
                            >
                                {!misMaterias.length && <option value="">Sin materias asignadas</option>}
                                {misMaterias.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                            </select>
                        </label>
                        <label>
                            Tipo de juego {editor.id && '(no se puede cambiar al editar)'}
                            <select
                                value={editor.tipo}
                                disabled={Boolean(editor.id)}
                                onChange={(e) => cambiarTipoEditor(e.target.value)}
                            >
                                {TIPOS_BANCO.map((t) => (
                                    <option key={t} value={t}>
                                        {TIPOS_ACTIVIDAD[t]?.emoji || '🎯'} {etiquetaTipo(t)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            Tema (opcional)
                            <input
                                value={editor.tema}
                                onChange={(e) => setEditor((ed) => ({ ...ed, tema: e.target.value }))}
                                placeholder="Ej: Sumas hasta 100"
                                maxLength={120}
                            />
                        </label>
                        <label>
                            Dificultad (opcional)
                            <select
                                value={editor.dificultad}
                                onChange={(e) => setEditor((ed) => ({ ...ed, dificultad: e.target.value }))}
                            >
                                <option value="">Sin definir</option>
                                {Object.entries(DIFICULTAD_LABEL).map(([id, label]) => (
                                    <option key={id} value={id}>{label}</option>
                                ))}
                            </select>
                        </label>

                        <CamposTipo
                            contenido={editor.contenido}
                            onChange={(contenido) => setEditor((ed) => ({ ...ed, contenido }))}
                        />

                        <label>
                            Etiquetas (opcional, separadas por coma)
                            <input
                                value={editor.etiquetas}
                                onChange={(e) => setEditor((ed) => ({ ...ed, etiquetas: e.target.value }))}
                                placeholder="Ej: suma, básico, repaso"
                                maxLength={255}
                            />
                        </label>
                    </div>
                </ModalPanel>
            )}
        </SectionCard>
    );
}

export default RepositorioPreguntas;
