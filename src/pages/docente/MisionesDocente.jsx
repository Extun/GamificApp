// Progreso de misiones de los estudiantes del docente (SPEC-007, Fase 2).
// SOLO LECTURA: el docente observa estadísticas agregadas reales, nunca
// modifica misiones (eso es del admin). Sin datos → EmptyState.
import { useEffect, useState } from 'react';
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import { misionesResumen } from '../../services/docenteService';
import { categoriaUI, tierUI } from '../../services/misionesService';
import { SectionCard, StatCard, EmptyState } from '../../components/dashboard/DashboardWidgets';

export function MisionesDocente({ onError }) {
    const [data, setData] = useState(null);
    const [cargado, setCargado] = useState(false);

    useEffect(() => {
        misionesResumen()
            .then(setData)
            .catch((err) => onError?.(`No se pudo cargar el progreso de misiones: ${err.message}`))
            .finally(() => setCargado(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
    }, []);

    if (!cargado) return <p className="contenido-sub">Cargando el progreso de misiones…</p>;

    const sinDatos = !data || (data.completadas === 0 && data.estudiantes === 0);
    if (sinDatos) {
        return (
            <EmptyState
                Icon={EmojiEventsRoundedIcon}
                titulo="Aún no hay progreso de misiones"
                mensaje="Cuando tus estudiantes jueguen actividades, aquí verás cuántas misiones completan y en qué categorías avanzan."
            />
        );
    }

    const categorias = [...(data.categorias || [])].sort((a, b) => b.completadas - a.completadas);

    return (
        <div className="dash-secciones">
            <div className="mis-doc-stats">
                <StatCard Icon={GroupsRoundedIcon} valor={data.estudiantes} etiqueta="Estudiantes" tono="primary" />
                <StatCard Icon={TaskAltRoundedIcon} valor={data.completadas} etiqueta="Misiones completadas" tono="accent" />
                <StatCard Icon={EmojiEventsRoundedIcon} valor={data.promedio_por_estudiante} etiqueta="Promedio por estudiante" tono="gold" />
            </div>

            <SectionCard titulo="Avance por categoría" Icon={EmojiEventsRoundedIcon}>
                {categorias.length ? (
                    <div className="mis-doc-categorias">
                        {categorias.map((c) => {
                            const cat = categoriaUI(c.categoria);
                            return (
                                <div key={c.categoria} className="mis-doc-cat">
                                    <div className="mis-doc-cat-top">
                                        <span style={{ fontWeight: 600, color: cat.color }}>{cat.emoji} {cat.label}</span>
                                        <span className="xp-valor">{c.completadas} · {c.avance}%</span>
                                    </div>
                                    <div className="progress-track">
                                        <div className="progress-fill" style={{ width: `${c.avance}%`, background: cat.color }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : <p className="contenido-sub">Sin datos por categoría todavía.</p>}
            </SectionCard>

            {data.top?.length > 0 && (
                <SectionCard titulo="Misiones más completadas" Icon={TaskAltRoundedIcon}>
                    <ul className="mis-doc-top">
                        {data.top.map((t, i) => {
                            const cat = categoriaUI(t.categoria);
                            const tier = tierUI(t.tier);
                            return (
                                <li key={i}>
                                    <span>{cat.emoji} {t.titulo} <em style={{ color: tier.color }}>{tier.emoji} {tier.label}</em></span>
                                    <span className="xp-valor">{t.veces}</span>
                                </li>
                            );
                        })}
                    </ul>
                </SectionCard>
            )}
        </div>
    );
}

export default MisionesDocente;
