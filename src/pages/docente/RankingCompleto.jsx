// Ranking completo (SPEC-004): la misma lógica de siempre (XP acumulado con
// RANK() en el servidor), ahora con visibilidad total: posición, estudiante,
// XP, nivel, insignias reales, última actividad y curso, con búsqueda, orden
// y filtro por curso.
import { useEffect, useMemo, useState } from 'react';
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded';
import { rankingCompleto } from '../../services/docenteService';
import { XP_POR_NIVEL } from '../../services/gamificationService';
import { SectionCard, EmptyState, TablaPro, formatearFecha } from '../../components/dashboard/DashboardWidgets';

export function RankingCompleto({ onError }) {
    const [filas, setFilas] = useState([]);
    const [cargado, setCargado] = useState(false);
    const [filtroCurso, setFiltroCurso] = useState('');
    const [orden, setOrden] = useState('posicion');

    useEffect(() => {
        rankingCompleto()
            .then(setFilas)
            .catch((err) => onError?.(`No se pudo cargar el ranking: ${err.message}`))
            .finally(() => setCargado(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
    }, []);

    const cursos = useMemo(() => [...new Set(filas.map((f) => f.curso))].sort(), [filas]);

    const visibles = useMemo(() => {
        const lista = filas.filter((f) => !filtroCurso || f.curso === filtroCurso);
        const ordenadores = {
            posicion: (a, b) => a.posicion - b.posicion,
            nombre: (a, b) => a.nombre.localeCompare(b.nombre, 'es'),
            recientes: (a, b) => new Date(b.ultima_actividad || 0) - new Date(a.ultima_actividad || 0),
            completados: (a, b) => b.completados - a.completados
        };
        return [...lista].sort(ordenadores[orden] || ordenadores.posicion);
    }, [filas, filtroCurso, orden]);

    // Insignias con regla real (mismas 2 que la ficha del estudiante):
    // completó su primer reto / logró un resultado perfecto.
    const insigniasDe = (f) => [
        ...(f.completados > 0 ? ['🥇 Primer Quiz'] : []),
        ...(f.perfectos > 0 ? ['🌟 Maestro de la Materia'] : [])
    ];

    return (
        <SectionCard
            titulo="Ranking completo"
            Icon={EmojiEventsRoundedIcon}
            tag={filas.length ? `${filas.length} estudiantes` : undefined}
        >
            {filas.length > 0 && (
                <div className="bib-filtros">
                    <select value={filtroCurso} onChange={(e) => setFiltroCurso(e.target.value)} aria-label="Filtrar por curso">
                        <option value="">Todos los cursos</option>
                        {cursos.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select value={orden} onChange={(e) => setOrden(e.target.value)} aria-label="Ordenar">
                        <option value="posicion">Por posición</option>
                        <option value="nombre">Por nombre A–Z</option>
                        <option value="recientes">Actividad más reciente</option>
                        <option value="completados">Más retos completados</option>
                    </select>
                </div>
            )}

            {visibles.length ? (
                <TablaPro
                    filas={visibles}
                    buscar={(f) => `${f.nombre} ${f.curso}`}
                    placeholderBusqueda="Buscar estudiante o curso…"
                    cabecera={
                        <tr>
                            <th>#</th><th>Estudiante</th><th>Curso</th><th>XP</th>
                            <th>Nivel</th><th>Insignias</th><th>Retos completados</th><th>Última actividad</th>
                        </tr>
                    }
                    renderFila={(f) => (
                        <tr key={f.id}>
                            <td><strong>{f.posicion}</strong></td>
                            <td>
                                <div className="estudiante-celda">
                                    <span className="estudiante-avatar" aria-hidden="true">
                                        {f.nombre.charAt(0).toUpperCase()}
                                    </span>
                                    <span className="estudiante-nombre">{f.nombre}</span>
                                </div>
                            </td>
                            <td><span className="curso-chip">{f.curso}</span></td>
                            <td><span className="xp-valor">⭐ {f.xp_total}</span></td>
                            <td>Nivel {Math.floor(f.xp_total / XP_POR_NIVEL) + 1}</td>
                            <td>
                                {insigniasDe(f).length
                                    ? insigniasDe(f).map((i) => (
                                        <span key={i} className="bib-tipo-chip" style={{ marginRight: 4 }}>{i}</span>
                                    ))
                                    : '—'}
                            </td>
                            <td>{f.completados}</td>
                            <td>{f.ultima_actividad ? formatearFecha(f.ultima_actividad) : 'Sin actividad'}</td>
                        </tr>
                    )}
                />
            ) : cargado && (
                filas.length ? (
                    <p className="tablapro-vacio">Ningún estudiante en ese curso.</p>
                ) : (
                    <EmptyState
                        Icon={EmojiEventsRoundedIcon}
                        titulo="Todavía no hay estudiantes en el ranking"
                        mensaje="Cuando tus estudiantes se registren y completen actividades, su posición aparecerá aquí."
                    />
                )
            )}
        </SectionCard>
    );
}

export default RankingCompleto;
