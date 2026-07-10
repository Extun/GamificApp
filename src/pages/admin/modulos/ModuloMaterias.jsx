import { useRef, useState } from 'react';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import adminService from '../../../services/adminService';
import { oscurecerColor } from '../../../services/materiasService';
import { SectionCard, EmptyState, ModalPanel } from '../../../components/dashboard/DashboardWidgets';
import './moduloMaterias.css';

const COLORES_SUGERIDOS = ['#e0f2fe', '#fce7f3', '#dcfce7', '#fef3c7', '#ede9fe', '#ffe4e6', '#ccfbf1', '#fef9c3'];
const ICONOS_SUGERIDOS = ['🔢', '📖', '🌱', '🌎', '⚽', '🗣️', '🎨', '🎵', '💻', '🧪', '📐', '✍️', '🤖', '🌍'];

const FORM_VACIO = {
    nombre: '', color: COLORES_SUGERIDOS[0], icono: ICONOS_SUGERIDOS[0], activa: true,
    descripcion: '', competencias: '', nivel: '', banner_data: null, protegida: false
};

const procesarBanner = (file) => new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
        const escala = Math.min(1, 800 / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
});

function BannerMateria({ materia, className }) {
    return (
        <span
            className={className}
            style={materia.banner_data ? undefined : {
                background: `linear-gradient(120deg, ${materia.color}, ${oscurecerColor(materia.color, 0.9)})`
            }}
            aria-hidden="true"
        >
            {materia.banner_data ? <img src={materia.banner_data} alt="" /> : materia.icono}
        </span>
    );
}

export function ModuloMaterias({ materias, docentes = [], ejecutar }) {
    // `editando`: null = cerrado, 'nueva' = crear, objeto = editar existente.
    const [editando, setEditando] = useState(null);
    const [form, setForm] = useState(FORM_VACIO);
    const [asignarModo, setAsignarModo] = useState('ninguno');
    const [asignarIds, setAsignarIds] = useState([]);
    const [asignando, setAsignando] = useState(null);
    const [asignacionIds, setAsignacionIds] = useState([]);
    const bannerRef = useRef(null);

    const abrirNueva = () => {
        setForm(FORM_VACIO);
        setAsignarModo('ninguno');
        setAsignarIds([]);
        setEditando('nueva');
    };

    const abrirEdicion = (m) => {
        if (m.protegida && !window.confirm(
            `"${m.nombre}" es una materia protegida (estructural para la institución).\n¿Seguro que quieres modificarla?`
        )) return;
        setForm({
            nombre: m.nombre, color: m.color, icono: m.icono, activa: Boolean(m.activa),
            descripcion: m.descripcion || '', competencias: m.competencias || '',
            nivel: m.nivel || '', banner_data: m.banner_data || null, protegida: Boolean(m.protegida)
        });
        setEditando(m);
    };

    const guardar = () => {
        const esNueva = editando === 'nueva';
        const payload = { ...form };
        if (esNueva && asignarModo !== 'ninguno') {
            payload.asignar = asignarModo === 'todos' ? 'todos' : asignarIds;
        }
        ejecutar(async () => {
            if (esNueva) await adminService.crearMateria(payload);
            else await adminService.actualizarMateria(editando.id, payload);
            setEditando(null);
        }, esNueva ? `Materia "${form.nombre}" creada.` : `Materia "${form.nombre}" actualizada.`);
    };

    const alternarEstado = (m) => {
        const activar = !m.activa;
        if (m.protegida && !activar && !window.confirm(
            `"${m.nombre}" es una materia protegida. ¿Seguro que quieres ocultarla?\nDejará de verse para docentes y estudiantes, pero conservará todo su contenido.`
        )) return;
        ejecutar(
            () => adminService.actualizarMateria(m.id, {
                nombre: m.nombre, color: m.color, icono: m.icono, activa: activar,
                descripcion: m.descripcion, competencias: m.competencias,
                nivel: m.nivel, banner_data: m.banner_data, protegida: Boolean(m.protegida)
            }),
            `Materia "${m.nombre}" ${activar ? 'activada' : 'oculta (su contenido y su historial se conservan)'}.`
        );
    };

    const eliminar = (m) => {
        if (m.protegida) return;
        if (window.confirm(`¿Enviar la materia "${m.nombre}" a la papelera? Podrás restaurarla desde allí.`)) {
            ejecutar(() => adminService.eliminarMateria(m.id), `Materia "${m.nombre}" enviada a la papelera.`);
        }
    };

    const mover = (indice, delta) => {
        const destino = indice + delta;
        if (destino < 0 || destino >= materias.length) return;
        const ids = materias.map((m) => m.id);
        [ids[indice], ids[destino]] = [ids[destino], ids[indice]];
        ejecutar(() => adminService.reordenarMaterias(ids), 'Orden de materias actualizado.');
    };

    const abrirAsignacion = (m) => {
        setAsignando(m);
        setAsignacionIds(
            docentes.filter((d) => d.materias?.some((dm) => dm.id === m.id)).map((d) => d.id)
        );
    };

    const guardarAsignacion = () => {
        if (!asignando) return;
        const actuales = docentes
            .filter((d) => d.materias?.some((dm) => dm.id === asignando.id))
            .map((d) => d.id);
        const agregar = asignacionIds.filter((id) => !actuales.includes(id));
        const quitar = actuales.filter((id) => !asignacionIds.includes(id));
        ejecutar(async () => {
            if (agregar.length) await adminService.asignarMateria(asignando.id, 'agregar', agregar);
            if (quitar.length) await adminService.asignarMateria(asignando.id, 'quitar', quitar);
            setAsignando(null);
        }, `Docentes de "${asignando.nombre}" actualizados.`);
    };

    const toggleId = (lista, setLista, id) =>
        setLista(lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);

    const subirBanner = async (ev) => {
        const file = ev.target.files?.[0];
        if (bannerRef.current) bannerRef.current.value = '';
        if (!file) return;
        try {
            const banner = await procesarBanner(file);
            setForm((f) => ({ ...f, banner_data: banner }));
        } catch {
        }
    };

    return (
        <>
            <SectionCard
                titulo="Catálogo de materias"
                Icon={MenuBookRoundedIcon}
                tag={materias.length ? `${materias.length}` : undefined}
                accion={{ label: '+ Nueva materia', onClick: abrirNueva }}
            >
                {materias.length ? (
                    <ul className="matcat-lista">
                        {materias.map((m, indice) => (
                            <li key={m.id} className={`matcat-fila ${m.activa ? '' : 'is-oculta'}`}>
                                <div className="matcat-orden">
                                    <button
                                        type="button"
                                        aria-label={`Subir ${m.nombre} en el orden`}
                                        disabled={indice === 0}
                                        onClick={() => mover(indice, -1)}
                                    >
                                        ▲
                                    </button>
                                    <span className="matcat-num">{indice + 1}</span>
                                    <button
                                        type="button"
                                        aria-label={`Bajar ${m.nombre} en el orden`}
                                        disabled={indice === materias.length - 1}
                                        onClick={() => mover(indice, 1)}
                                    >
                                        ▼
                                    </button>
                                </div>

                                <BannerMateria materia={m} className="matcat-banner" />

                                <div className="matcat-info">
                                    <strong>
                                        <span aria-hidden="true">{m.icono}</span> {m.nombre}
                                        <span className="matcat-chips">
                                            <span className={`matcat-estado ${m.activa ? 'is-activa' : 'is-oculta'}`}>
                                                {m.activa ? 'Activa' : 'Oculta'}
                                            </span>
                                            {Boolean(m.protegida) && (
                                                <span className="matcat-protegida" title="Materia protegida: no puede eliminarse">
                                                    🔒 Protegida
                                                </span>
                                            )}
                                        </span>
                                    </strong>
                                    <span className="matcat-desc">
                                        {m.descripcion || (m.nivel ? `Nivel: ${m.nivel}` : 'Sin descripción')}
                                    </span>
                                </div>

                                <div className="matcat-acciones">
                                    <button type="button" className="docente-btn-editar" onClick={() => abrirAsignacion(m)}>
                                        <GroupsRoundedIcon sx={{ fontSize: '1rem' }} />
                                        Docentes
                                    </button>
                                    <button type="button" className="docente-btn-editar" onClick={() => abrirEdicion(m)}>
                                        <EditRoundedIcon sx={{ fontSize: '1rem' }} />
                                        Editar
                                    </button>
                                    <button type="button" className="docente-btn-editar" onClick={() => alternarEstado(m)}>
                                        {m.activa ? 'Ocultar' : 'Activar'}
                                    </button>
                                    <button
                                        type="button"
                                        className="docente-btn-eliminar"
                                        title={m.protegida
                                            ? 'Materia protegida: solo puede ocultarse'
                                            : 'Enviar a la papelera'}
                                        aria-label={`Eliminar la materia ${m.nombre}`}
                                        disabled={Boolean(m.protegida)}
                                        onClick={() => eliminar(m)}
                                    >
                                        {m.protegida
                                            ? <LockRoundedIcon sx={{ fontSize: '1.05rem' }} />
                                            : <DeleteOutlineRoundedIcon sx={{ fontSize: '1.05rem' }} />}
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <EmptyState
                        Icon={MenuBookRoundedIcon}
                        titulo="Sin materias en el catálogo"
                        mensaje="Crea la primera materia: los docentes y estudiantes la verán al instante."
                        accion={{ label: 'Crear materia', onClick: abrirNueva }}
                    />
                )}
            </SectionCard>

            {editando !== null && (
                <ModalPanel
                    className="modal-materias"
                    titulo={editando === 'nueva' ? 'Nueva materia' : 'Editar materia'}
                    subtitulo={editando === 'nueva' ? 'Se mostrará a docentes y estudiantes' : editando.nombre}
                    avatar={
                        <span
                            className="materia-form-preview"
                            style={{ background: form.color, borderColor: oscurecerColor(form.color) }}
                            aria-hidden="true"
                        >
                            {form.icono}
                        </span>
                    }
                    onCerrar={() => setEditando(null)}
                    pie={
                        <>
                            <button type="button" className="preview-action" onClick={() => setEditando(null)}>
                                Cancelar
                            </button>
                            <button type="button" className="preview-action preview-action-primary" onClick={guardar}>
                                <TaskAltRoundedIcon />
                                Guardar
                            </button>
                        </>
                    }
                >
                    <div className="materia-form">
                        <label className="asistente-campo">
                            <span>Nombre de la materia</span>
                            <input
                                value={form.nombre}
                                placeholder="ej: Robótica"
                                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                            />
                        </label>

                        <label className="asistente-campo">
                            <span>Descripción corta (opcional)</span>
                            <input
                                value={form.descripcion}
                                maxLength={200}
                                placeholder="ej: Construimos y programamos robots sencillos"
                                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                            />
                        </label>

                        <div className="asistente-campo">
                            <span>Icono</span>
                            <div className="materia-form-opciones">
                                {ICONOS_SUGERIDOS.map((icono) => (
                                    <button
                                        type="button"
                                        key={icono}
                                        className={`materia-form-icono ${form.icono === icono ? 'is-sel' : ''}`}
                                        aria-pressed={form.icono === icono}
                                        onClick={() => setForm({ ...form, icono })}
                                    >
                                        {icono}
                                    </button>
                                ))}
                                <input
                                    style={{ width: 70 }}
                                    value={form.icono}
                                    maxLength={4}
                                    aria-label="Emoji personalizado"
                                    onChange={(e) => setForm({ ...form, icono: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="asistente-campo">
                            <span>Color</span>
                            <div className="materia-form-opciones">
                                {COLORES_SUGERIDOS.map((color) => (
                                    <button
                                        type="button"
                                        key={color}
                                        className={`materia-form-color ${form.color === color ? 'is-sel' : ''}`}
                                        style={{ background: color }}
                                        aria-label={`Color ${color}`}
                                        aria-pressed={form.color === color}
                                        onClick={() => setForm({ ...form, color })}
                                    />
                                ))}
                                <input
                                    type="color"
                                    value={form.color}
                                    aria-label="Color personalizado"
                                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="asistente-campo">
                            <span>Banner (opcional: sin imagen se genera con el color y el emoji)</span>
                            <BannerMateria
                                materia={{ ...form, banner_data: form.banner_data }}
                                className="matcat-banner-preview"
                            />
                            <div className="perfil-form-acciones" style={{ marginTop: 8 }}>
                                <button type="button" className="upload-mini-btn" onClick={() => bannerRef.current?.click()}>
                                    Subir imagen
                                </button>
                                {form.banner_data && (
                                    <button
                                        type="button"
                                        className="preview-action"
                                        onClick={() => setForm({ ...form, banner_data: null })}
                                    >
                                        Quitar imagen
                                    </button>
                                )}
                                <input ref={bannerRef} type="file" accept="image/*" hidden onChange={subirBanner} />
                            </div>
                        </div>

                        <label className="asistente-campo">
                            <span>Nivel recomendado (opcional)</span>
                            <input
                                value={form.nivel}
                                maxLength={60}
                                placeholder="ej: 2do a 4to de básica"
                                onChange={(e) => setForm({ ...form, nivel: e.target.value })}
                            />
                        </label>

                        <label className="asistente-campo">
                            <span>Competencias (opcional, texto libre)</span>
                            <textarea
                                rows={3}
                                value={form.competencias}
                                maxLength={2000}
                                placeholder="ej: Resolver problemas, pensamiento lógico, trabajo en equipo…"
                                onChange={(e) => setForm({ ...form, competencias: e.target.value })}
                            />
                        </label>

                        {editando !== 'nueva' && (
                            <label className="materia-form-switch">
                                <input
                                    type="checkbox"
                                    checked={form.activa}
                                    onChange={(e) => setForm({ ...form, activa: e.target.checked })}
                                />
                                Materia activa (desmarcada = oculta: invisible para docentes nuevos y
                                estudiantes, pero conserva actividades, ranking y progreso)
                            </label>
                        )}

                        <label className="materia-form-switch">
                            <input
                                type="checkbox"
                                checked={form.protegida}
                                onChange={(e) => setForm({ ...form, protegida: e.target.checked })}
                            />
                            🔒 Materia protegida (estructural: no podrá eliminarse, solo ocultarse)
                        </label>

                        {editando === 'nueva' && (
                            <div className="matcat-asignar">
                                <strong>¿A qué docentes asignarla?</strong>
                                {[
                                    ['ninguno', 'No asignar todavía (lo harás desde "Docentes")'],
                                    ['todos', `Asignar a todos los docentes actuales (${docentes.length})`],
                                    ['algunos', 'Elegir docentes específicos']
                                ].map(([valor, etiqueta]) => (
                                    <label key={valor} className="matcat-radio">
                                        <input
                                            type="radio"
                                            name="asignar-modo"
                                            checked={asignarModo === valor}
                                            onChange={() => setAsignarModo(valor)}
                                        />
                                        {etiqueta}
                                    </label>
                                ))}
                                {asignarModo === 'algunos' && (
                                    <div className="matcat-docentes">
                                        {docentes.length ? docentes.map((d) => (
                                            <button
                                                type="button"
                                                key={d.id}
                                                className={`matcat-docente-check ${asignarIds.includes(d.id) ? 'is-sel' : ''}`}
                                                aria-pressed={asignarIds.includes(d.id)}
                                                onClick={() => toggleId(asignarIds, setAsignarIds, d.id)}
                                            >
                                                {asignarIds.includes(d.id) ? '✓ ' : ''}{d.username}
                                            </button>
                                        )) : (
                                            <span className="matcat-desc">Aún no hay docentes registrados.</span>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </ModalPanel>
            )}

            {asignando && (
                <ModalPanel
                    className="modal-materias"
                    titulo={`Docentes de ${asignando.nombre}`}
                    subtitulo="Marca quiénes enseñan esta materia. Los cambios se aplican al guardar."
                    avatar={<BannerMateria materia={asignando} className="matcat-banner" />}
                    onCerrar={() => setAsignando(null)}
                    pie={
                        <>
                            <button type="button" className="preview-action" onClick={() => setAsignando(null)}>
                                Cancelar
                            </button>
                            <button type="button" className="preview-action preview-action-primary" onClick={guardarAsignacion}>
                                <TaskAltRoundedIcon />
                                Guardar cambios
                            </button>
                        </>
                    }
                >
                    {docentes.length ? (
                        <>
                            <div className="perfil-form-acciones" style={{ marginBottom: 10 }}>
                                <button
                                    type="button"
                                    className="upload-mini-btn"
                                    onClick={() => setAsignacionIds(docentes.map((d) => d.id))}
                                >
                                    Marcar todos
                                </button>
                                <button
                                    type="button"
                                    className="preview-action"
                                    onClick={() => setAsignacionIds([])}
                                >
                                    Desmarcar todos
                                </button>
                            </div>
                            <div className="matcat-docentes" style={{ paddingLeft: 0 }}>
                                {docentes.map((d) => (
                                    <button
                                        type="button"
                                        key={d.id}
                                        className={`matcat-docente-check ${asignacionIds.includes(d.id) ? 'is-sel' : ''}`}
                                        aria-pressed={asignacionIds.includes(d.id)}
                                        onClick={() => toggleId(asignacionIds, setAsignacionIds, d.id)}
                                    >
                                        {asignacionIds.includes(d.id) ? '✓ ' : ''}{d.username}
                                    </button>
                                ))}
                            </div>
                        </>
                    ) : (
                        <EmptyState
                            Icon={GroupsRoundedIcon}
                            titulo="Aún no hay docentes"
                            mensaje="Crea docentes desde el módulo Docentes y vuelve aquí para asignarles la materia."
                        />
                    )}
                </ModalPanel>
            )}
        </>
    );
}

export default ModuloMaterias;
