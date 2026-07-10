// Módulo Misiones del panel admin (SPEC-007, Fase 2): activar/desactivar,
// editar recompensas y crear misiones. Todo viene y va al backend (nada
// hardcodeado). El catálogo es contenido académico: se protege con el permiso
// 'materias' en el servidor (la UI solo oculta).
import { useMemo, useState } from 'react';
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import adminService from '../../../services/adminService';
import { SectionCard, EmptyState, ModalPanel, TablaPro } from '../../../components/dashboard/DashboardWidgets';
import { categoriaUI, tierUI } from '../../../services/misionesService';

const FORM_VACIO = {
    clave: '', titulo: '', descripcion: '', categoria: 'aprendizaje', tier: 'bronce',
    tipo_objetivo: 'actividades_completadas', objetivo_meta: 1, objetivo_filtro: '',
    horizonte: 'corto', recompensa_xp: 0, recompensa_insignia: '', recompensa_banner: '',
    requiere_mision_id: '', orden: 0, activa: true
};

export function ModuloMisiones({ data, ejecutar }) {
    const misiones = data?.misiones || [];
    const categorias = data?.categorias || [];
    const tiers = data?.tiers || [];
    const tiposObjetivo = data?.tipos_objetivo || [];
    const horizontes = data?.horizontes || [];

    // null = cerrado, 'nueva' = crear, objeto = editar.
    const [editando, setEditando] = useState(null);
    const [form, setForm] = useState(FORM_VACIO);

    const activas = useMemo(() => misiones.filter((m) => m.activa).length, [misiones]);

    const abrirNueva = () => { setForm(FORM_VACIO); setEditando('nueva'); };

    const abrirEdicion = (m) => {
        setForm({
            clave: m.clave, titulo: m.titulo, descripcion: m.descripcion,
            categoria: m.categoria, tier: m.tier, tipo_objetivo: m.tipo_objetivo,
            objetivo_meta: m.objetivo_meta,
            objetivo_filtro: m.objetivo_filtro
                ? (typeof m.objetivo_filtro === 'string' ? m.objetivo_filtro : JSON.stringify(m.objetivo_filtro))
                : '',
            horizonte: m.horizonte, recompensa_xp: m.recompensa_xp,
            recompensa_insignia: m.recompensa_insignia || '',
            recompensa_banner: m.recompensa_banner || '',
            requiere_mision_id: m.requiere_mision_id || '',
            orden: m.orden, activa: Boolean(m.activa)
        });
        setEditando(m);
    };

    const guardar = () => {
        const esNueva = editando === 'nueva';
        const payload = {
            ...form,
            objetivo_meta: Number(form.objetivo_meta),
            recompensa_xp: Number(form.recompensa_xp),
            orden: Number(form.orden),
            requiere_mision_id: form.requiere_mision_id ? Number(form.requiere_mision_id) : null,
            recompensa_insignia: form.recompensa_insignia.trim() || null,
            recompensa_banner: form.recompensa_banner.trim() || null,
            objetivo_filtro: form.objetivo_filtro.trim() || null
        };
        ejecutar(async () => {
            if (esNueva) await adminService.crearMision(payload);
            else await adminService.actualizarMision(editando.id, payload);
            setEditando(null);
        }, esNueva ? `Misión "${form.titulo}" creada.` : `Misión "${form.titulo}" actualizada.`);
    };

    const alternar = (m) => ejecutar(
        () => adminService.activarMision(m.id, !m.activa),
        `Misión "${m.titulo}" ${m.activa ? 'desactivada' : 'activada'}.`
    );

    // Opciones de "requiere" para la cadena de desbloqueo (excluye a sí misma).
    const opcionesRequiere = misiones.filter((m) => editando === 'nueva' || m.id !== editando?.id);

    const claveValida = editando !== 'nueva' || /^[a-z0-9-]{3,60}$/.test(form.clave.trim());
    const puedeGuardar = form.titulo.trim() && form.descripcion.trim() && Number(form.objetivo_meta) >= 1 && claveValida;

    return (
        <>
            <SectionCard
                titulo="Misiones y progresión"
                Icon={EmojiEventsRoundedIcon}
                tag={misiones.length ? `${activas}/${misiones.length} activas` : undefined}
                accion={{ label: '+ Nueva misión', onClick: abrirNueva }}
            >
                {misiones.length ? (
                    <TablaPro
                        filas={misiones}
                        buscar={(m) => `${m.titulo} ${m.categoria} ${m.tier} ${m.clave}`}
                        placeholderBusqueda="Buscar por título, categoría o tier…"
                        cabecera={<tr><th>Misión</th><th>Categoría · Tier</th><th>Objetivo</th><th>Recompensa</th><th>Completada por</th><th>Estado</th><th>Acciones</th></tr>}
                        renderFila={(m) => {
                            const cat = categoriaUI(m.categoria);
                            const tier = tierUI(m.tier);
                            return (
                                <tr key={m.id} style={m.activa ? undefined : { opacity: 0.6 }}>
                                    <td>
                                        <strong>{m.icono || cat.emoji} {m.titulo}</strong>
                                        <div className="mision-clave-txt">{m.descripcion}</div>
                                    </td>
                                    <td>
                                        <span style={{ color: cat.color, fontWeight: 600 }}>{cat.emoji} {cat.label}</span>
                                        <div style={{ color: tier.color, fontSize: '0.8rem' }}>{tier.emoji} {tier.label}</div>
                                    </td>
                                    <td>{m.tipo_objetivo}<div className="xp-valor">× {m.objetivo_meta}</div></td>
                                    <td>
                                        <span className="xp-valor">+{m.recompensa_xp} XP</span>
                                        {m.recompensa_insignia && <span title="Insignia"> 🎖️</span>}
                                        {m.recompensa_banner && <span title="Banner"> 🏳️</span>}
                                    </td>
                                    <td className="xp-valor">{m.completada_por}</td>
                                    <td>
                                        <span className={`curso-estado ${m.activa ? 'is-activo' : ''}`}>
                                            {m.activa ? 'Activa' : 'Inactiva'}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="admin-acciones">
                                            <button type="button" title="Editar misión" onClick={() => abrirEdicion(m)}>
                                                <EditRoundedIcon sx={{ fontSize: '1.05rem' }} />
                                            </button>
                                            <button type="button" onClick={() => alternar(m)}>
                                                {m.activa ? 'Desactivar' : 'Activar'}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        }}
                    />
                ) : (
                    <EmptyState
                        Icon={EmojiEventsRoundedIcon}
                        titulo="Sin misiones en el catálogo"
                        mensaje="El catálogo inicial se crea solo al desplegar. También puedes crear misiones nuevas aquí."
                        accion={{ label: 'Crear misión', onClick: abrirNueva }}
                    />
                )}
            </SectionCard>

            {editando !== null && (
                <ModalPanel
                    className="modal-materias"
                    titulo={editando === 'nueva' ? 'Nueva misión' : 'Editar misión'}
                    subtitulo={editando === 'nueva' ? 'Se añade al catálogo del backend' : editando.clave}
                    onCerrar={() => setEditando(null)}
                    pie={
                        <>
                            <button type="button" className="preview-action" onClick={() => setEditando(null)}>Cancelar</button>
                            <button
                                type="button"
                                className="preview-action preview-action-primary"
                                disabled={!puedeGuardar}
                                onClick={guardar}
                            >
                                <TaskAltRoundedIcon /> Guardar
                            </button>
                        </>
                    }
                >
                    <div className="materia-form">
                        {editando === 'nueva' && (
                            <label className="asistente-campo">
                                <span>Clave (slug único, no se puede cambiar luego)</span>
                                <input
                                    value={form.clave}
                                    placeholder="ej: aprendizaje-7"
                                    maxLength={60}
                                    onChange={(e) => setForm({ ...form, clave: e.target.value.toLowerCase() })}
                                />
                            </label>
                        )}
                        <label className="asistente-campo">
                            <span>Título</span>
                            <input value={form.titulo} maxLength={120} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
                        </label>
                        <label className="asistente-campo">
                            <span>Descripción (para niños)</span>
                            <input value={form.descripcion} maxLength={255} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
                        </label>
                        <div className="curso-form-campos">
                            <label className="asistente-campo">
                                <span>Categoría</span>
                                <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
                                    {categorias.map((c) => <option key={c} value={c}>{categoriaUI(c).emoji} {categoriaUI(c).label}</option>)}
                                </select>
                            </label>
                            <label className="asistente-campo">
                                <span>Tier</span>
                                <select value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })}>
                                    {tiers.map((t) => <option key={t} value={t}>{tierUI(t).emoji} {tierUI(t).label}</option>)}
                                </select>
                            </label>
                        </div>
                        <div className="curso-form-campos">
                            <label className="asistente-campo">
                                <span>Tipo de objetivo</span>
                                <select value={form.tipo_objetivo} onChange={(e) => setForm({ ...form, tipo_objetivo: e.target.value })}>
                                    {tiposObjetivo.map((t) => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </label>
                            <label className="asistente-campo">
                                <span>Meta (número a alcanzar)</span>
                                <input type="number" min={1} value={form.objetivo_meta} onChange={(e) => setForm({ ...form, objetivo_meta: e.target.value })} />
                            </label>
                        </div>
                        <label className="asistente-campo">
                            <span>Filtro del objetivo (JSON opcional, ej: {'{"tipo":"quiz"}'})</span>
                            <input value={form.objetivo_filtro} placeholder='vacío = sin filtro' onChange={(e) => setForm({ ...form, objetivo_filtro: e.target.value })} />
                        </label>
                        <div className="curso-form-campos">
                            <label className="asistente-campo">
                                <span>Horizonte (tiempo estimado)</span>
                                <select value={form.horizonte} onChange={(e) => setForm({ ...form, horizonte: e.target.value })}>
                                    {horizontes.map((h) => <option key={h} value={h}>{h}</option>)}
                                </select>
                            </label>
                            <label className="asistente-campo">
                                <span>XP de recompensa</span>
                                <input type="number" min={0} value={form.recompensa_xp} onChange={(e) => setForm({ ...form, recompensa_xp: e.target.value })} />
                            </label>
                        </div>
                        <div className="curso-form-campos">
                            <label className="asistente-campo">
                                <span>Insignia (clave, opcional)</span>
                                <input value={form.recompensa_insignia} maxLength={60} onChange={(e) => setForm({ ...form, recompensa_insignia: e.target.value })} />
                            </label>
                            <label className="asistente-campo">
                                <span>Banner (clave, opcional)</span>
                                <input value={form.recompensa_banner} maxLength={60} onChange={(e) => setForm({ ...form, recompensa_banner: e.target.value })} />
                            </label>
                        </div>
                        <div className="curso-form-campos">
                            <label className="asistente-campo">
                                <span>Se desbloquea al completar (opcional)</span>
                                <select value={form.requiere_mision_id} onChange={(e) => setForm({ ...form, requiere_mision_id: e.target.value })}>
                                    <option value="">— Disponible desde el inicio —</option>
                                    {opcionesRequiere.map((m) => <option key={m.id} value={m.id}>{m.titulo}</option>)}
                                </select>
                            </label>
                            <label className="asistente-campo">
                                <span>Orden</span>
                                <input type="number" value={form.orden} onChange={(e) => setForm({ ...form, orden: e.target.value })} />
                            </label>
                        </div>
                        <label className="materia-form-switch">
                            <input type="checkbox" checked={form.activa} onChange={(e) => setForm({ ...form, activa: e.target.checked })} />
                            Misión activa (visible para los estudiantes)
                        </label>
                    </div>
                </ModalPanel>
            )}
        </>
    );
}

export default ModuloMisiones;
