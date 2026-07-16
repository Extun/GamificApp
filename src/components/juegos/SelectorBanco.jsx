// Selector del Banco de Preguntas (SPEC-010) — modal compartido por los
// juegos con ítems atómicos: quiz, memorama, línea del tiempo y completar.
// Carga TODOS los ítems aprobados del docente para el `tipo` dado (todas sus
// materias, de la más nueva a la más antigua) y permite filtrarlos por
// búsqueda, materia y tema (y dificultad en los juegos que la usan); el
// docente marca varios con checkboxes (o "Seleccionar todo") y se insertan
// de una sola vez en la actividad que está construyendo. Cada ítem insertado
// lleva `_banco_id` (metadato aditivo que los juegos ignoran) para saber su
// procedencia y no re-guardarlo como duplicado.
import { useEffect, useMemo, useState } from 'react';
import LibraryAddRoundedIcon from '@mui/icons-material/LibraryAddRounded';
import bancoService from '../../services/bancoService';
import { ModalPanel, EmptyState } from '../dashboard/DashboardWidgets';
import './selectorBanco.css';

const DIFICULTAD_LABEL = { facil: 'Fácil', media: 'Media', dificil: 'Difícil' };

// Textos por tipo de juego (singular/plural del ítem que se inserta).
const TEXTOS_TIPO = {
    quiz: { singular: 'pregunta', plural: 'preguntas', titulo: 'Añadir del banco de preguntas' },
    memorama: { singular: 'pareja', plural: 'parejas', titulo: 'Añadir parejas del banco' },
    'linea-tiempo': { singular: 'evento', plural: 'eventos', titulo: 'Añadir eventos del banco' },
    completar: { singular: 'frase', plural: 'frases', titulo: 'Añadir frases del banco' }
};

export function SelectorBanco({ tipo = 'quiz', materiaId, onInsertar, onCerrar }) {
    const [items, setItems] = useState([]);
    const [cargado, setCargado] = useState(false);
    const [error, setError] = useState('');
    const [busqueda, setBusqueda] = useState('');
    // Por defecto se muestra la materia actual, pero el docente puede ampliar
    // a todas sus materias (insertar es copiar, así que cruzar materias es seguro).
    const [filtroMateria, setFiltroMateria] = useState(materiaId ? String(materiaId) : '');
    const [filtroTema, setFiltroTema] = useState('');
    const [filtroDificultad, setFiltroDificultad] = useState('');
    const [seleccion, setSeleccion] = useState(() => new Set());
    const [insertando, setInsertando] = useState(false);

    const textos = TEXTOS_TIPO[tipo] || TEXTOS_TIPO.quiz;
    // El quiz no clasifica sus preguntas por dificultad; los juegos genéricos sí.
    const conDificultad = tipo !== 'quiz';

    // Carga todo el repositorio del docente de una vez (la API ya ordena de
    // más nuevo a más antiguo); los filtros son locales.
    useEffect(() => {
        bancoService.listarPreguntas({ tipo, estado: 'aprobada' })
            .then(setItems)
            .catch((err) => setError(`No se pudo cargar el banco: ${err.message}`))
            .finally(() => setCargado(true));
    }, [tipo]);

    // Opciones de los filtros derivadas de lo cargado (sin fetch extra).
    const materias = useMemo(() => {
        const mapa = new Map();
        items.forEach((p) => mapa.set(String(p.materia_id), p.materia));
        return [...mapa.entries()];
    }, [items]);

    const temas = useMemo(() => {
        const set = new Set(items
            .filter((p) => !filtroMateria || String(p.materia_id) === filtroMateria)
            .map((p) => p.tema)
            .filter(Boolean));
        return [...set].sort((a, b) => a.localeCompare(b, 'es'));
    }, [items, filtroMateria]);

    const visibles = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        return items.filter((p) =>
            (!q || `${p.enunciado || ''} ${p.tema || ''} ${p.etiquetas || ''}`.toLowerCase().includes(q)) &&
            (!filtroMateria || String(p.materia_id) === filtroMateria) &&
            (!filtroTema || p.tema === filtroTema) &&
            (!conDificultad || !filtroDificultad || p.dificultad === filtroDificultad)
        );
    }, [items, busqueda, filtroMateria, filtroTema, filtroDificultad, conDificultad]);

    // ¿Están seleccionados TODOS los visibles bajo los filtros actuales?
    const todoSeleccionado = visibles.length > 0 && visibles.every((p) => seleccion.has(p.id));

    const alternar = (id) => setSeleccion((prev) => {
        const s = new Set(prev);
        if (s.has(id)) s.delete(id); else s.add(id);
        return s;
    });

    // Un clic marca todos los visibles (respetando los filtros activos); si ya
    // estaban todos marcados, los desmarca. No toca selecciones fuera del filtro.
    const alternarTodo = () => setSeleccion((prev) => {
        const s = new Set(prev);
        if (todoSeleccionado) visibles.forEach((p) => s.delete(p.id));
        else visibles.forEach((p) => s.add(p.id));
        return s;
    });

    // Trae el contenido completo de los seleccionados y los entrega al editor
    // con la MISMA forma que un ítem escrito a mano (+ _banco_id). También
    // registra el uso (contador "usada N veces"); si eso falla, no bloquea.
    const insertar = async () => {
        if (!seleccion.size || insertando) return;
        setInsertando(true);
        try {
            const ids = [...seleccion];
            const detalles = await Promise.all(ids.map((id) => bancoService.obtenerPregunta(id)));
            bancoService.registrarUso(ids).catch(() => {});
            onInsertar(detalles
                .filter((d) => d?.contenido)
                .map((d) => ({ ...d.contenido, _banco_id: d.id })));
        } catch (err) {
            setError(`No se pudieron insertar: ${err.message}`);
            setInsertando(false);
        }
    };

    return (
        <ModalPanel
            titulo={textos.titulo}
            subtitulo="Tu repositorio para reutilizar. Se insertan como copia: puedes editarlas sin afectar el banco."
            onCerrar={() => !insertando && onCerrar()}
            pie={
                <>
                    <button type="button" className="preview-action" disabled={insertando} onClick={onCerrar}>
                        Cancelar
                    </button>
                    <button
                        type="button"
                        className="preview-action preview-action-primary"
                        disabled={!seleccion.size || insertando}
                        onClick={insertar}
                    >
                        <LibraryAddRoundedIcon />
                        {insertando
                            ? 'Insertando…'
                            : `Insertar ${seleccion.size || ''} ${seleccion.size === 1 ? textos.singular : textos.plural}`.trim()}
                    </button>
                </>
            }
        >
            {error && <p className="quiz-error">{error}</p>}

            <div className="banco-filtros">
                <input
                    type="search"
                    placeholder="Buscar por enunciado, tema o etiqueta…"
                    aria-label="Buscar en el banco"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                />
                <select
                    value={filtroMateria}
                    onChange={(e) => { setFiltroMateria(e.target.value); setFiltroTema(''); }}
                    aria-label="Filtrar por materia"
                >
                    <option value="">Todas mis materias</option>
                    {materias.map(([id, nombre]) => (
                        <option key={id} value={id}>{nombre}</option>
                    ))}
                </select>
                <select
                    value={filtroTema}
                    onChange={(e) => setFiltroTema(e.target.value)}
                    aria-label="Filtrar por tema"
                    disabled={!temas.length}
                >
                    <option value="">Cualquier tema</option>
                    {temas.map((t) => (
                        <option key={t} value={t}>{t}</option>
                    ))}
                </select>
                {conDificultad && (
                    <select
                        value={filtroDificultad}
                        onChange={(e) => setFiltroDificultad(e.target.value)}
                        aria-label="Filtrar por dificultad"
                    >
                        <option value="">Cualquier dificultad</option>
                        {Object.entries(DIFICULTAD_LABEL).map(([id, label]) => (
                            <option key={id} value={id}>{label}</option>
                        ))}
                    </select>
                )}
            </div>

            {visibles.length > 0 && (
                <label className="banco-seleccionar-todo">
                    <input type="checkbox" checked={todoSeleccionado} onChange={alternarTodo} />
                    Seleccionar todo ({visibles.length})
                </label>
            )}

            {visibles.length ? (
                <ul className="banco-lista">
                    {visibles.map((p) => (
                        <li key={p.id}>
                            <label className="banco-item">
                                <input
                                    type="checkbox"
                                    checked={seleccion.has(p.id)}
                                    onChange={() => alternar(p.id)}
                                />
                                <span className="banco-item-cuerpo">
                                    <span className="banco-item-enunciado">{p.enunciado || '(sin enunciado)'}</span>
                                    <span className="banco-item-meta">
                                        {p.materia}
                                        {p.tema ? ` · ${p.tema}` : ''}
                                        {conDificultad && p.dificultad ? ` · ${DIFICULTAD_LABEL[p.dificultad]}` : ''} ·
                                        {' '}usada {p.veces_utilizada} {p.veces_utilizada === 1 ? 'vez' : 'veces'}
                                        {p.origen === 'ia' ? ' · ✨ IA' : ''}
                                    </span>
                                </span>
                            </label>
                        </li>
                    ))}
                </ul>
            ) : cargado && !error && (
                <EmptyState
                    Icon={LibraryAddRoundedIcon}
                    titulo={items.length ? 'Nada coincide con los filtros' : 'Tu banco todavía está vacío'}
                    mensaje={items.length
                        ? 'Prueba con otra búsqueda u otros filtros.'
                        : `Las ${textos.plural} que crees (manual o con IA) se guardan aquí automáticamente para reutilizarlas.`}
                />
            )}
        </ModalPanel>
    );
}

export default SelectorBanco;
