import { useEffect, useMemo, useState } from 'react';
import './misionesPanel.css';
import { LogroToast } from '../../components/quiz/QuizInteractivo';
import { EmptyState } from '../../components/dashboard/DashboardWidgets';
import {
    obtenerMisiones, categoriaUI, tierUI,
    ORDEN_CATEGORIAS, HORIZONTE_LABEL
} from '../../services/misionesService';

// Tarjeta de una misión: categoría + tier, barra de progreso, recompensa,
// tiempo estimado y estado (bloqueada 🔒 / disponible / completada ✓).
function MisionCard({ mision }) {
    const cat = categoriaUI(mision.categoria);
    const tier = tierUI(mision.tier);
    const bloqueada = mision.estado === 'bloqueada';
    const completada = mision.estado === 'completada';

    return (
        <article
            className={`mision-card mision-${mision.estado}`}
            style={{ '--cat-color': cat.color }}
        >
            <header className="mision-card-top">
                <span className="mision-cat-emoji" aria-hidden="true">{mision.icono || cat.emoji}</span>
                <span className="mision-tier" style={{ '--tier-color': tier.color }}>
                    {tier.emoji} {tier.label}
                </span>
                {completada && <span className="mision-check" aria-label="Completada">✓</span>}
                {bloqueada && <span className="mision-lock" aria-hidden="true">🔒</span>}
            </header>

            <h4 className="mision-titulo">{mision.titulo}</h4>
            <p className="mision-desc">{mision.descripcion}</p>

            <div className="mision-progreso">
                <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${mision.porcentaje}%` }} />
                </div>
                <span className="mision-progreso-txt">
                    {completada ? '¡Completada!' : `${mision.progreso_actual} / ${mision.objetivo_meta}`}
                </span>
            </div>

            <footer className="mision-card-foot">
                <span className="mision-recompensa">
                    <span className="mision-xp">+{mision.recompensa.xp} XP</span>
                    {mision.recompensa.insignia && <span title="Insignia">🎖️</span>}
                    {mision.recompensa.banner && <span title="Banner">🏳️</span>}
                </span>
                {bloqueada && mision.requiere_titulo
                    ? <span className="mision-hint">Completa «{mision.requiere_titulo}»</span>
                    : <span className="mision-horizonte">{HORIZONTE_LABEL[mision.horizonte] || ''}</span>}
            </footer>
        </article>
    );
}

// Panel de Misiones del estudiante (SPEC-007, Fase 1). Todo viene del backend.
export function PanelMisiones() {
    const [data, setData] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [filtro, setFiltro] = useState('todas');
    const [toast, setToast] = useState(null);

    useEffect(() => {
        let vigente = true;
        obtenerMisiones().then((res) => {
            if (!vigente) return;
            setData(res);
            setCargando(false);
            if (res.nuevas?.length) {
                setToast({ titulo: '¡Misión completada!', mensaje: res.nuevas[0].titulo });
            }
        });
        return () => { vigente = false; };
    }, []);

    const misiones = data?.misiones || [];
    const resumen = data?.resumen;

    // Categorías presentes (en el orden oficial) para los chips de filtro.
    const categorias = useMemo(() => {
        const presentes = new Set(misiones.map((m) => m.categoria));
        return ORDEN_CATEGORIAS.filter((c) => presentes.has(c));
    }, [misiones]);

    const visibles = filtro === 'todas'
        ? misiones
        : misiones.filter((m) => m.categoria === filtro);

    return (
        <div className="misiones-panel">
            <h1 style={{ pointerEvents: 'none' }}>🏆 Mis premios</h1>
            <p className="contenido-sub" style={{ pointerEvents: 'none' }}>
                Completa misiones jugando para ganar insignias y subir de nivel.
            </p>

            {resumen && (
                <div className="misiones-resumen">
                    <div className="misiones-stat"><span>Nivel</span><strong>{resumen.nivel}</strong></div>
                    <div className="misiones-stat"><span>XP</span><strong>⭐ {resumen.xp}</strong></div>
                    <div className="misiones-stat"><span>Racha</span><strong>🔥 {resumen.racha_actual} días</strong></div>
                    <div className="misiones-stat"><span>Misiones</span><strong>{resumen.completadas} / {resumen.total}</strong></div>
                </div>
            )}

            {!cargando && categorias.length > 0 && (
                <div className="misiones-filtros">
                    <button
                        className={`mision-chip ${filtro === 'todas' ? 'is-activo' : ''}`}
                        onClick={() => setFiltro('todas')}
                    >
                        Todas
                    </button>
                    {categorias.map((c) => {
                        const cat = categoriaUI(c);
                        return (
                            <button
                                key={c}
                                className={`mision-chip ${filtro === c ? 'is-activo' : ''}`}
                                style={{ '--cat-color': cat.color }}
                                onClick={() => setFiltro(c)}
                            >
                                {cat.emoji} {cat.label}
                            </button>
                        );
                    })}
                </div>
            )}

            {cargando ? (
                <p className="contenido-sub">Cargando tus misiones…</p>
            ) : visibles.length === 0 ? (
                <EmptyState
                    titulo="Aún no hay misiones"
                    mensaje="Juega actividades para empezar a completar misiones y ganar premios."
                />
            ) : (
                <div className="misiones-grid">
                    {visibles.map((m) => <MisionCard key={m.id} mision={m} />)}
                </div>
            )}

            {toast && <LogroToast {...toast} onClose={() => setToast(null)} />}
        </div>
    );
}

export default PanelMisiones;
