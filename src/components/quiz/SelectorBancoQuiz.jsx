// Selector del Banco de Preguntas para el editor de Quiz (SPEC-010).
// Modal que lista las preguntas APROBADAS de tipo quiz de la materia actual;
// el docente marca varias y se insertan en el quiz que está construyendo,
// sin salir del editor. Cada pregunta insertada lleva `_banco_id` (metadato
// aditivo que los juegos ignoran) para saber su procedencia.
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
    const [filtroDificultad, setFiltroDificultad] = useState('');
    const [seleccion, setSeleccion] = useState(() => new Set());
    const [insertando, setInsertando] = useState(false);

    useEffect(() => {
        bancoService.listarPreguntas({ tipo: 'quiz', estado: 'aprobada', materiaId })
            .then(setPreguntas)
            .catch((err) => setError(`No se pudo cargar el banco: ${err.message}`))
            .finally(() => setCargado(true));
    }, [materiaId]);

    const visibles = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        return preguntas.filter((p) =>
            (!q || `${p.enunciado || ''} ${p.tema || ''} ${p.etiquetas || ''}`.toLowerCase().includes(q)) &&
            (!filtroDificultad || p.dificultad === filtroDificultad)
        );
    }, [preguntas, busqueda, filtroDificultad]);

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
            subtitulo="Preguntas que guardaste antes, listas para reutilizar. Se insertan como copia: puedes editarlas sin afectar el banco."
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
                                        {p.tema ? `${p.tema} · ` : ''}
                                        {DIFICULTAD_LABEL[p.dificultad] || 'Sin dificultad'} ·
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
                    titulo={preguntas.length ? 'Ninguna pregunta coincide' : 'Tu banco está vacío para esta materia'}
                    mensaje={preguntas.length
                        ? 'Prueba con otra búsqueda u otra dificultad.'
                        : 'Guarda preguntas desde el editor con el botón «Guardar en el banco» y aparecerán aquí para reutilizarlas.'}
                />
            )}
        </ModalPanel>
    );
}

export default SelectorBancoQuiz;
