// Selector del Banco de Preguntas para el editor de Quiz (SPEC-010).
// Modal que carga TODAS las preguntas aprobadas de tipo quiz del docente
// (todas sus materias) y permite filtrarlas por búsqueda, materia, tema y
// dificultad; el docente marca varias con checkboxes y se insertan de una
// sola vez en el quiz que está construyendo, sin salir del editor. Cada
// pregunta insertada lleva `_banco_id` (metadato aditivo que los juegos
// ignoran) para saber su procedencia.
import { useEffect, useMemo, useState } from 'react';
import LibraryAddRoundedIcon from '@mui/icons-material/LibraryAddRounded';
import bancoService from '../../services/bancoService';
import { ModalPanel, EmptyState } from '../dashboard/DashboardWidgets';

const DIFICULTAD_LABEL = { facil: 'Fácil', media: 'Media', dificil: 'Difícil' };

export function SelectorBancoQuiz({ materiaId, onInsertar, onCerrar }) {
    const [preguntas, setPreguntas] = useState([]);
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

    // Carga todo el repositorio del docente de una vez; los filtros son locales.
    useEffect(() => {
        bancoService.listarPreguntas({ tipo: 'quiz', estado: 'aprobada' })
            .then(setPreguntas)
            .catch((err) => setError(`No se pudo cargar el banco: ${err.message}`))
            .finally(() => setCargado(true));
    }, []);

    // Opciones de los filtros derivadas de las preguntas cargadas (sin fetch extra).
    const materias = useMemo(() => {
        const mapa = new Map();
        preguntas.forEach((p) => mapa.set(String(p.materia_id), p.materia));
        return [...mapa.entries()];
    }, [preguntas]);

    const temas = useMemo(() => {
        const set = new Set(preguntas
            .filter((p) => !filtroMateria || String(p.materia_id) === filtroMateria)
            .map((p) => p.tema)
            .filter(Boolean));
        return [...set].sort((a, b) => a.localeCompare(b, 'es'));
    }, [preguntas, filtroMateria]);

    const visibles = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        return preguntas.filter((p) =>
            (!q || `${p.enunciado || ''} ${p.tema || ''} ${p.etiquetas || ''}`.toLowerCase().includes(q)) &&
            (!filtroMateria || String(p.materia_id) === filtroMateria) &&
            (!filtroTema || p.tema === filtroTema) &&
            (!filtroDificultad || p.dificultad === filtroDificultad)
        );
    }, [preguntas, busqueda, filtroMateria, filtroTema, filtroDificultad]);

    const alternar = (id) => setSeleccion((prev) => {
        const s = new Set(prev);
        if (s.has(id)) s.delete(id); else s.add(id);
        return s;
    });

    // Trae el contenido completo de las seleccionadas y las entrega al editor
    // con la MISMA forma que una pregunta escrita a mano (+ _banco_id).
    const insertar = async () => {
        if (!seleccion.size || insertando) return;
        setInsertando(true);
        try {
            const detalles = await Promise.all(
                [...seleccion].map((id) => bancoService.obtenerPregunta(id))
            );
            onInsertar(detalles
                .filter((d) => d?.contenido)
                .map((d) => ({ ...d.contenido, _banco_id: d.id })));
        } catch (err) {
            setError(`No se pudieron insertar las preguntas: ${err.message}`);
            setInsertando(false);
        }
    };

    return (
        <ModalPanel
            titulo="Añadir del banco de preguntas"
            subtitulo="Tu repositorio de preguntas para reutilizar. Se insertan como copia: puedes editarlas sin afectar el banco."
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
                            : `Insertar ${seleccion.size || ''} ${seleccion.size === 1 ? 'pregunta' : 'preguntas'}`.trim()}
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
            </div>

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
                                        {p.materia} ·
                                        {p.tema ? ` ${p.tema} ·` : ''}
                                        {' '}{DIFICULTAD_LABEL[p.dificultad] || 'Sin dificultad'} ·
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
                    titulo={preguntas.length ? 'Ninguna pregunta coincide' : 'Tu banco todavía está vacío'}
                    mensaje={preguntas.length
                        ? 'Prueba con otra búsqueda u otros filtros.'
                        : 'Crea preguntas en el editor (manual o con IA) con «Guardar también en mi Banco» activado y aparecerán aquí para reutilizarlas.'}
                />
            )}
        </ModalPanel>
    );
}

export default SelectorBancoQuiz;
