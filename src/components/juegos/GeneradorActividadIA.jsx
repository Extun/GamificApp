// Generador con IA para los juegos genéricos (SPEC-006, Fase 1):
// memorama, línea del tiempo y completar espacios. UN solo componente para
// los tres tipos: formulario (tema + cantidad + dificultad + curso opcional)
// → vista previa editable → «Guardar borrador» o «Publicar».
// El contenido SIEMPRE lo genera la IA en el servidor (POST /api/ia/generar),
// que ya conoce materia, curso, dificultad e institución desde la BD.
import { useEffect, useState } from 'react';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import RocketLaunchRoundedIcon from '@mui/icons-material/RocketLaunchRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import { BarraAccionesEditor } from './BarraAccionesEditor';
import { idPorNombre } from '../../services/materiasService';
import { generarActividadIA } from '../../services/iaService';
import { publicarReto } from '../../services/retosService';
import { PUNTOS_POR_ACIERTO } from '../../services/gamificationService';
import docenteService from '../../services/docenteService';
import bancoService from '../../services/bancoService';
import { TIPOS_ACTIVIDAD } from './registroJuegos';
import { SelectorBanco } from './SelectorBanco';
import { PreviewJuegoModal } from './PreviewJuegoModal';
import { useHistorialRetos, HistorialActividades } from './HistorialActividades';

export const DIFICULTADES_UI = [
    ['facil', '🙂 Fácil'],
    ['media', '💪 Media'],
    ['dificil', '🔥 Difícil']
];

// Descripción corta por tipo para la cabecera del formulario.
const AYUDA_TIPO = {
    memorama: 'Escribe el tema y la IA crea las parejas para emparejar (término y definición, operación y resultado…).',
    'linea-tiempo': 'Escribe el tema y la IA crea los eventos o pasos que el estudiante deberá ordenar.',
    completar: 'Escribe el tema y la IA crea frases con un espacio en blanco y sus opciones.'
};

// Cuántos ítems ofrecer por tipo (mismo rango que valida el servidor).
const CANTIDADES = {
    memorama: [4, 6, 8, 10],
    'linea-tiempo': [3, 4, 5, 6, 8],
    completar: [3, 4, 5, 6, 8]
};

// Cuenta de ítems puntuables según el tipo (misma regla de XP que el servidor).
const contarItems = (tipo, config) => {
    if (tipo === 'memorama') return config?.parejas?.length || 0;
    if (tipo === 'linea-tiempo') return config?.eventos?.length || 0;
    return config?.frases?.length || 0;
};

// SPEC-010 — Banco de Preguntas: clave del arreglo de ítems dentro de la
// configuración y máximo de ítems que acepta el validador del servidor
// (validadoresRetos.js); el tope evita insertar del banco más de lo publicable.
const CLAVE_ITEMS = { memorama: 'parejas', 'linea-tiempo': 'eventos', completar: 'frases' };
const MAX_ITEMS = { memorama: 10, 'linea-tiempo': 8, completar: 8 };

// Nombre del ítem en plural para el botón "Agregar…" (SPEC-013, Fase 2).
const NOMBRE_ITEM_PLURAL = { memorama: 'parejas', 'linea-tiempo': 'eventos', completar: 'frases' };

// Firma de un ítem para detectar duplicados al "Añadir con IA" (se compara
// solo el texto visible, sin mayúsculas ni espacios).
const firmaItem = (tipo, item) => {
    const t = (s) => (s || '').trim().toLowerCase();
    if (tipo === 'memorama') return `${t(item.a)}|${t(item.b)}`;
    return t(item.texto);
};

// Plantillas de ítem vacío para "Añadir manual" (SPEC-012, Fase 3): el ítem
// aparece en la lista editable y el docente lo completa ahí mismo.
const ITEM_VACIO = {
    memorama: () => ({ a: '', b: '' }),
    'linea-tiempo': () => ({ texto: '', etiqueta: '' }),
    completar: () => ({ texto: '', opciones: ['', ''], correcta: '' })
};

export function GeneradorActividadIA({ materia, tipo }) {
    const [tema, setTema] = useState('');
    const [cantidad, setCantidad] = useState(CANTIDADES[tipo]?.[1] || 5);
    const [dificultad, setDificultad] = useState('media');
    const [cursoId, setCursoId] = useState('');
    const [cursos, setCursos] = useState([]);
    // Borrador en edición: { titulo, descripcion, configuracion }
    const [actividad, setActividad] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [guardando, setGuardando] = useState(false);
    // "Añadir con IA" incremental (menú Agregar): suma ítems sin borrar nada.
    const [agregandoIA, setAgregandoIA] = useState(false);
    const [publicado, setPublicado] = useState(false);
    const [error, setError] = useState('');
    const [aviso, setAviso] = useState('');
    // SPEC-010: modal del banco para reutilizar ítems ya creados.
    const [bancoAbierto, setBancoAbierto] = useState(false);
    // SPEC-012: vista previa como estudiante (modo prueba).
    const [previewAbierta, setPreviewAbierta] = useState(false);
    // SPEC-011 — historial respaldado en BD: cada generación crea un reto
    // 'borrador' y la lista se lee del servidor (localStorage = caché offline).
    const { historial, crearBorrador, sincronizar, cancelarSincronizacion, eliminar: eliminarBorrador, abrirDetalle, refrescar } =
        useHistorialRetos(tipo, materia);

    // Nota: el dashboard monta este componente con key={tipo}, así que al
    // cambiar de tipo se reinicia todo el estado (sin efectos de limpieza).
    useEffect(() => {
        docenteService.listarCursos().then(setCursos).catch(() => setCursos([]));
    }, []);

    const etiqueta = TIPOS_ACTIVIDAD[tipo]?.etiqueta || tipo;
    const claveItems = CLAVE_ITEMS[tipo];
    const maxItems = MAX_ITEMS[tipo] || 10;
    const items = contarItems(tipo, actividad?.configuracion);
    const xp = Math.max(items, 1) * PUNTOS_POR_ACIERTO;

    // SPEC-010 — guarda en el banco (siempre automático, igual que el quiz)
    // los ítems que aún no vienen de él (sin `_banco_id`) y devuelve el array
    // con los ids asignados. Los fallos individuales no bloquean el flujo.
    const guardarLoteEnBanco = async (lote, temaTxt) => {
        const materiaId = idPorNombre(materia);
        if (!materiaId) return lote;
        return Promise.all(lote.map(async (item) => {
            if (item._banco_id) return item;
            try {
                const creada = await bancoService.crearPregunta({
                    materiaId,
                    tipo,
                    contenido: item,
                    tema: temaTxt || undefined,
                    dificultad
                });
                return { ...item, _banco_id: creada.id };
            } catch {
                return item;
            }
        }));
    };

    const generar = async (e) => {
        e.preventDefault();
        if (!tema.trim() || cargando) return;
        const materiaId = idPorNombre(materia);
        if (!materiaId) {
            setError('No se reconoce la materia actual; recarga la página.');
            return;
        }
        // Generar desde el formulario REEMPLAZA lo abierto en el editor. Se
        // avisa para no perder trabajo por accidente (para sumar ítems está
        // "Añadir con IA" en el menú Agregar).
        if (items > 0 && !window.confirm(
            'Esto crea una actividad NUEVA y cierra la que tienes abierta '
            + `(${actividad?.retoId ? 'queda guardada en «Últimos generados»' : 'sin título no queda guardada'}). `
            + 'Para agregar más ítems a la actual usa el botón «Agregar» de abajo. ¿Continuar?'
        )) return;
        setCargando(true);
        setError('');
        setAviso('');
        try {
            const data = await generarActividadIA({
                tipo,
                materiaId,
                tema: tema.trim(),
                cantidad,
                dificultad,
                cursoId: cursoId ? Number(cursoId) : undefined
            });
            // Los ítems generados alimentan el banco automáticamente (SPEC-010).
            const itemsConBanco = await guardarLoteEnBanco(
                data.configuracion?.[claveItems] || [], tema.trim()
            );
            // La actividad nace como BORRADOR EN LA BD (SPEC-011): sobrevive a
            // cambios de navegador y aparece también en la Biblioteca. Si el
            // guardado remoto falla, se sigue editando en memoria (los botones
            // Guardar/Publicar la crean igual, vía el upsert del POST).
            const configuracion = { ...data.configuracion, [claveItems]: itemsConBanco };
            let retoId = null;
            try {
                const creado = await crearBorrador({
                    materiaId,
                    titulo: data.titulo,
                    descripcion: data.descripcion,
                    configuracion,
                    xpRecompensa: Math.max(itemsConBanco.length, 1) * PUNTOS_POR_ACIERTO,
                    origen: 'ia',
                    dificultad,
                    cursoId: cursoId ? Number(cursoId) : undefined
                });
                retoId = creado?.id ?? null;
            } catch (err) {
                console.warn('El borrador no se pudo guardar en el servidor:', err.message);
            }
            setActividad({
                retoId,
                titulo: data.titulo,
                descripcion: data.descripcion,
                configuracion,
                estado: 'borrador',
                publicadoEnBD: false
            });
            setPublicado(false);
        } catch (err) {
            setError(`No se pudo generar con la IA: ${err.message}`);
        } finally {
            setCargando(false);
        }
    };

    // Cualquier edición desbloquea el botón de publicar (candado anti doble
    // clic). Si la actividad sigue siendo un borrador en la BD, el cambio se
    // sincroniza con PATCH (debounce); si ya está publicada, queda en memoria
    // hasta que el docente vuelva a Guardar/Publicar (nunca se edita en caliente).
    const editar = (cambio) => {
        setPublicado(false);
        setActividad((prev) => {
            const actualizado = { ...prev, ...cambio, estado: 'borrador' };
            if (actualizado.retoId && !actualizado.publicadoEnBD) {
                sincronizar(actualizado.retoId, {
                    titulo: actualizado.titulo,
                    configuracion: actualizado.configuracion,
                    xp_recompensa: Math.max(contarItems(tipo, actualizado.configuracion), 1) * PUNTOS_POR_ACIERTO
                });
            }
            return actualizado;
        });
    };
    const editarConfig = (cambio) =>
        editar({ configuracion: { ...actividad.configuracion, ...cambio } });

    // "Añadir con IA" (SPEC-013): pide una tanda nueva sobre el mismo tema y
    // ANEXA solo los ítems que no estén ya (por texto), respetando el máximo.
    // No borra nada de lo que el docente ya tiene.
    const agregarMasConIA = async (n) => {
        if (agregandoIA || !actividad) return;
        const materiaId = idPorNombre(materia);
        const temaBase = tema.trim() || actividad.titulo || '';
        if (!materiaId || !temaBase) {
            setError('Escribe el tema en el formulario de arriba para pedirle más a la IA.');
            setTimeout(() => setError(''), 5000);
            return;
        }
        setAgregandoIA(true);
        setError('');
        setAviso('');
        try {
            // Se pide una tanda dentro del rango válido del tipo; los repetidos
            // se descartan y se anexan hasta `n` (o hasta llenar el máximo).
            const rango = CANTIDADES[tipo] || [3, 5, 8];
            const pedir = Math.min(Math.max(n + 2, rango[0]), rango[rango.length - 1]);
            const data = await generarActividadIA({
                tipo,
                materiaId,
                tema: temaBase,
                cantidad: pedir,
                dificultad,
                cursoId: cursoId ? Number(cursoId) : undefined
            });
            const actuales = actividad.configuracion?.[claveItems] || [];
            const firmas = new Set(actuales.map((it) => firmaItem(tipo, it)));
            const nuevos = (data.configuracion?.[claveItems] || [])
                .filter((it) => !firmas.has(firmaItem(tipo, it)))
                .slice(0, Math.min(n, maxItems - actuales.length));
            if (!nuevos.length) {
                setAviso('La IA no encontró ítems distintos a los que ya tienes. Prueba afinando el tema.');
                setTimeout(() => setAviso(''), 5000);
                return;
            }
            const conBanco = await guardarLoteEnBanco(nuevos, temaBase);
            editarConfig({ [claveItems]: [...actuales, ...conBanco] });
            setAviso(`${conBanco.length} ${conBanco.length === 1
                ? NOMBRE_ITEM_PLURAL[tipo].replace(/s$/, '')
                : NOMBRE_ITEM_PLURAL[tipo]} más, sin tocar lo que ya tenías.`);
            setTimeout(() => setAviso(''), 5000);
        } catch (err) {
            setError(`No se pudo añadir con la IA: ${err.message}`);
            setTimeout(() => setError(''), 5000);
        } finally {
            setAgregandoIA(false);
        }
    };

    // Cierra el editor sin perder nada: el borrador ya vive en la BD (y en
    // "Últimos generados"); se puede reabrir desde ahí cuando se quiera.
    const cerrarEditor = () => {
        setActividad(null);
        setPublicado(false);
        setAviso('');
        setError('');
    };

    // Reabre una entrada del historial: trae del servidor el reto completo
    // (la lista es ligera, sin configuración) y lo monta en el editor.
    const abrirDelHistorial = async (entrada) => {
        setAviso('');
        setError('');
        try {
            const detalle = await abrirDetalle(entrada.id);
            setActividad({
                retoId: detalle.id,
                titulo: detalle.titulo,
                descripcion: detalle.descripcion,
                configuracion: detalle.configuracion || {},
                estado: detalle.estado,
                publicadoEnBD: detalle.estado === 'publicado'
            });
            setDificultad(detalle.dificultad || 'media');
            setCursoId(detalle.curso_id ? String(detalle.curso_id) : '');
            setPublicado(detalle.estado === 'publicado');
        } catch (err) {
            setError(`No se pudo abrir la actividad: ${err.message}`);
            setTimeout(() => setError(''), 4000);
        }
    };

    // Enviar a la Papelera (recuperable desde la Biblioteca).
    const quitarDelHistorial = async (id) => {
        try {
            await eliminarBorrador(id);
            setActividad((actual) => (actual?.retoId === id ? null : actual));
        } catch (err) {
            setError(`No se pudo eliminar: ${err.message}`);
            setTimeout(() => setError(''), 4000);
        }
    };

    const guardar = async (estado) => {
        if (!actividad || guardando || (estado === 'publicado' && publicado)) return;
        const materiaId = idPorNombre(materia);
        if (!materiaId) {
            setError('No se reconoce la materia actual; recarga la página.');
            return;
        }
        setGuardando(true);
        setError('');
        try {
            // Un PATCH pendiente del debounce ya no hace falta: el POST que
            // sigue escribe el estado completo.
            cancelarSincronizacion(actividad.retoId);
            // Al publicar, los ítems que aún no estén en el banco (p. ej. si el
            // guardado al generar falló) se guardan también (SPEC-010).
            let configuracion = actividad.configuracion;
            if (estado === 'publicado') {
                const itemsConBanco = await guardarLoteEnBanco(
                    configuracion?.[claveItems] || [], tema.trim()
                );
                configuracion = { ...configuracion, [claveItems]: itemsConBanco };
            }
            const data = await publicarReto({
                materiaId,
                titulo: actividad.titulo.trim(),
                tipo,
                descripcion: actividad.descripcion,
                configuracion,
                xpRecompensa: xp,
                estado,
                origen: 'ia',
                dificultad,
                cursoId: cursoId ? Number(cursoId) : undefined
            });
            setActividad({
                ...actividad,
                retoId: data?.id ?? actividad.retoId,
                configuracion,
                estado,
                publicadoEnBD: estado === 'publicado'
            });
            refrescar();
            if (estado === 'publicado') {
                setPublicado(true);
                setAviso('¡Actividad publicada! Ya es visible para tus estudiantes.');
            } else {
                setAviso('Borrador guardado. Lo encontrarás en la Biblioteca para editarlo o publicarlo.');
            }
            setTimeout(() => setAviso(''), 5000);
        } catch (err) {
            setError(`No se pudo guardar: ${err.message}`);
        } finally {
            setGuardando(false);
        }
    };

    // SPEC-010 — inserta ítems elegidos del banco. Llegan como copia con la
    // misma forma que un ítem generado (+ `_banco_id`, que el juego ignora).
    // Se respeta el máximo del validador del servidor: si no caben todos, se
    // insertan los primeros y se avisa cuántos quedaron fuera.
    const agregarDelBanco = (nuevos) => {
        setBancoAbierto(false);
        if (!actividad || !nuevos.length) return;
        const actuales = actividad.configuracion?.[claveItems] || [];
        const espacio = Math.max(maxItems - actuales.length, 0);
        const insertados = nuevos.slice(0, espacio);
        if (insertados.length) {
            editarConfig({ [claveItems]: [...actuales, ...insertados] });
        }
        const fuera = nuevos.length - insertados.length;
        setAviso(fuera > 0
            ? `Se añadieron ${insertados.length} del banco; ${fuera} no ${fuera === 1 ? 'cupo' : 'cupieron'} (máximo ${maxItems} por actividad).`
            : `${insertados.length} ${insertados.length === 1 ? 'ítem añadido' : 'ítems añadidos'} del banco.`);
        setTimeout(() => setAviso(''), 5000);
    };

    // ---- Edición por tipo -------------------------------------------------
    const config = actividad?.configuracion;

    const editarLista = (clave, indice, cambio) => {
        const lista = config[clave].map((item, i) => (i === indice ? { ...item, ...cambio } : item));
        editarConfig({ [clave]: lista });
    };
    const quitarDeLista = (clave, indice) =>
        editarConfig({ [clave]: config[clave].filter((_, i) => i !== indice) });
    const moverEnLista = (clave, indice, delta) => {
        const lista = [...config[clave]];
        const destino = indice + delta;
        if (destino < 0 || destino >= lista.length) return;
        [lista[indice], lista[destino]] = [lista[destino], lista[indice]];
        editarConfig({ [clave]: lista });
    };

    return (
        <section className="card materia-subvista gen-ia">
            <div className="card-head">
                <h3><AutoAwesomeRoundedIcon sx={{ fontSize: '1.15rem', verticalAlign: 'middle' }} /> {etiqueta} con IA</h3>
                <span className="card-tag">{materia}</span>
            </div>
            <p className="clasificador-intro">{AYUDA_TIPO[tipo]}</p>

            <form className="quiz-form gen-ia-form" onSubmit={generar}>
                <label className="quiz-field">
                    <span>Tema</span>
                    <input
                        type="text"
                        value={tema}
                        onChange={(e) => setTema(e.target.value)}
                        placeholder="Ej. Las partes de la planta"
                        maxLength={200}
                    />
                </label>
                <label className="quiz-field">
                    <span>Cantidad</span>
                    <select value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))}>
                        {(CANTIDADES[tipo] || [3, 5, 8]).map((n) => (
                            <option key={n} value={n}>{n} {tipo === 'memorama' ? 'parejas' : tipo === 'linea-tiempo' ? 'eventos' : 'frases'}</option>
                        ))}
                    </select>
                </label>
                <label className="quiz-field">
                    <span>Dificultad</span>
                    <select value={dificultad} onChange={(e) => setDificultad(e.target.value)}>
                        {DIFICULTADES_UI.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                    </select>
                </label>
                <label className="quiz-field">
                    <span>Curso (opcional)</span>
                    <select value={cursoId} onChange={(e) => setCursoId(e.target.value)}>
                        <option value="">Todos los cursos</option>
                        {cursos.map((c) => <option key={c.id} value={c.id}>{c.etiqueta}</option>)}
                    </select>
                </label>
                <button type="submit" className="quiz-generar-btn" disabled={cargando || !tema.trim()}>
                    {cargando
                        ? <span className="quiz-spinner" aria-hidden="true" />
                        : <AutoAwesomeRoundedIcon sx={{ fontSize: '1.1rem' }} />}
                    {cargando ? 'Generando…' : 'Generar con IA'}
                </button>
            </form>

            {error && <p className="quiz-error">{error}</p>}
            {aviso && (
                <p className="quiz-aviso">
                    <CheckCircleRoundedIcon sx={{ fontSize: '1.1rem', verticalAlign: 'middle' }} /> {aviso}
                </p>
            )}

            {actividad && (
                <div className="gen-ia-preview">
                    <div className="editor-abierto-head">
                        <span className="editor-abierto-etiqueta">Editando: {actividad.titulo || 'sin título'}</span>
                        <button
                            type="button"
                            className="editor-cerrar-btn"
                            onClick={cerrarEditor}
                            title="Cierra el editor; la actividad queda en «Últimos generados»"
                        >
                            ✕ Cerrar
                        </button>
                    </div>
                    <label className="quiz-field">
                        <span>Título de la actividad</span>
                        <input
                            value={actividad.titulo}
                            onChange={(e) => editar({ titulo: e.target.value })}
                            maxLength={120}
                        />
                    </label>
                    <label className="quiz-field">
                        <span>Instrucción para el estudiante</span>
                        <input
                            value={config.instruccion || ''}
                            onChange={(e) => editarConfig({ instruccion: e.target.value })}
                            maxLength={200}
                        />
                    </label>

                    {tipo === 'memorama' && (
                        <div className="gen-ia-items">
                            {config.parejas.map((p, i) => (
                                <div key={i} className="gen-ia-item">
                                    <input
                                        value={p.a}
                                        aria-label={`Pareja ${i + 1}, primera carta`}
                                        onChange={(e) => editarLista('parejas', i, { a: e.target.value })}
                                    />
                                    <span className="gen-ia-item-sep" aria-hidden="true">↔</span>
                                    <input
                                        value={p.b}
                                        aria-label={`Pareja ${i + 1}, segunda carta`}
                                        onChange={(e) => editarLista('parejas', i, { b: e.target.value })}
                                    />
                                    <button
                                        type="button"
                                        title="Quitar pareja"
                                        aria-label={`Quitar la pareja ${i + 1}`}
                                        onClick={() => quitarDeLista('parejas', i)}
                                    >
                                        <DeleteOutlineRoundedIcon sx={{ fontSize: '1.1rem' }} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {tipo === 'linea-tiempo' && (
                        <div className="gen-ia-items">
                            <p className="contenido-sub" style={{ margin: 0 }}>
                                Este es el orden CORRECTO: el juego lo desordenará para el estudiante.
                            </p>
                            {config.eventos.map((ev, i) => (
                                <div key={i} className="gen-ia-item">
                                    <span className="gen-ia-item-num">{i + 1}</span>
                                    <input
                                        value={ev.texto}
                                        aria-label={`Evento ${i + 1}`}
                                        onChange={(e) => editarLista('eventos', i, { texto: e.target.value })}
                                    />
                                    <input
                                        className="gen-ia-item-etiqueta"
                                        value={ev.etiqueta || ''}
                                        placeholder="Etiqueta"
                                        aria-label={`Etiqueta del evento ${i + 1}`}
                                        onChange={(e) => editarLista('eventos', i, { etiqueta: e.target.value })}
                                    />
                                    <button type="button" title="Subir" aria-label={`Subir el evento ${i + 1}`} onClick={() => moverEnLista('eventos', i, -1)}>
                                        <ArrowUpwardRoundedIcon sx={{ fontSize: '1.05rem' }} />
                                    </button>
                                    <button type="button" title="Bajar" aria-label={`Bajar el evento ${i + 1}`} onClick={() => moverEnLista('eventos', i, 1)}>
                                        <ArrowDownwardRoundedIcon sx={{ fontSize: '1.05rem' }} />
                                    </button>
                                    <button type="button" title="Quitar evento" aria-label={`Quitar el evento ${i + 1}`} onClick={() => quitarDeLista('eventos', i)}>
                                        <DeleteOutlineRoundedIcon sx={{ fontSize: '1.1rem' }} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {tipo === 'completar' && (
                        <div className="gen-ia-items">
                            {config.frases.map((f, i) => (
                                <div key={i} className="gen-ia-frase">
                                    <div className="gen-ia-item">
                                        <input
                                            value={f.texto}
                                            aria-label={`Frase ${i + 1} (usa ___ para el espacio)`}
                                            onChange={(e) => editarLista('frases', i, { texto: e.target.value })}
                                        />
                                        <button type="button" title="Quitar frase" aria-label={`Quitar la frase ${i + 1}`} onClick={() => quitarDeLista('frases', i)}>
                                            <DeleteOutlineRoundedIcon sx={{ fontSize: '1.1rem' }} />
                                        </button>
                                    </div>
                                    <div className="gen-ia-opciones">
                                        {f.opciones.map((op, j) => (
                                            <label key={j} className={`gen-ia-opcion ${op === f.correcta ? 'is-correcta' : ''}`}>
                                                <input
                                                    type="radio"
                                                    name={`correcta-${i}`}
                                                    checked={op === f.correcta}
                                                    onChange={() => editarLista('frases', i, { correcta: op })}
                                                />
                                                <input
                                                    value={op}
                                                    aria-label={`Opción ${j + 1} de la frase ${i + 1}`}
                                                    onChange={(e) => {
                                                        const opciones = f.opciones.map((o, k) => (k === j ? e.target.value : o));
                                                        editarLista('frases', i, {
                                                            opciones,
                                                            correcta: op === f.correcta ? e.target.value : f.correcta
                                                        });
                                                    }}
                                                />
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* SPEC-013 Fase 2: botón único "Agregar" con menú por acciones. */}
                    <BarraAccionesEditor
                        agregar={{
                            label: agregandoIA ? 'Generando…' : `Agregar ${NOMBRE_ITEM_PLURAL[tipo]}`,
                            pregunta: tipo === 'linea-tiempo' ? '¿Cómo deseas agregarlos?' : '¿Cómo deseas agregarlas?',
                            disabled: guardando || agregandoIA,
                            opciones: [
                                {
                                    id: 'escribir',
                                    emoji: '📝',
                                    titulo: `Escribir ${NOMBRE_ITEM_PLURAL[tipo]}`,
                                    detalle: items >= maxItems
                                        ? `Ya está el máximo de ${maxItems} para esta actividad.`
                                        : 'Añade un ítem vacío y complétalo aquí mismo.',
                                    disabled: items >= maxItems,
                                    onClick: () => editarConfig({
                                        [claveItems]: [...(config?.[claveItems] || []), ITEM_VACIO[tipo]()]
                                    })
                                },
                                {
                                    id: 'generar',
                                    emoji: '🤖',
                                    titulo: 'Añadir con IA',
                                    detalle: items >= maxItems
                                        ? `Ya está el máximo de ${maxItems} para esta actividad.`
                                        : 'La IA suma más sobre el mismo tema, sin borrar lo que tienes.',
                                    disabled: items >= maxItems,
                                    sub: {
                                        pregunta: `¿Cuántas ${NOMBRE_ITEM_PLURAL[tipo]} más?`,
                                        opciones: [1, 2, 3]
                                            .filter((n) => n <= maxItems - items)
                                            .map((n) => ({ label: String(n), onClick: () => agregarMasConIA(n) }))
                                    }
                                },
                                {
                                    id: 'reutilizar',
                                    emoji: '📚',
                                    titulo: `Reutilizar ${NOMBRE_ITEM_PLURAL[tipo]}`,
                                    detalle: items >= maxItems
                                        ? `Ya está el máximo de ${maxItems} para esta actividad.`
                                        : 'Elige entre lo que ya has usado antes.',
                                    disabled: items >= maxItems,
                                    onClick: () => setBancoAbierto(true)
                                }
                            ]
                        }}
                        acciones={[
                            {
                                id: 'preview',
                                label: 'Vista previa',
                                Icon: VisibilityRoundedIcon,
                                onClick: () => setPreviewAbierta(true),
                                disabled: guardando || !items,
                                title: items
                                    ? 'Juega la actividad como la verá el estudiante (sin XP ni progreso)'
                                    : 'Añade al menos un ítem para previsualizar'
                            }
                        ]}
                    />

                    <div className="clasificador-publicar-barra">
                        <p className="clasificador-publicar-hint">
                            {publicado
                                ? 'Esta actividad ya está publicada. Si cambias algo, podrás volver a publicarla.'
                                : `${items} ${items === 1 ? 'ítem' : 'ítems'} · Recompensa: ${xp} XP · Dificultad: ${dificultad}.`}
                        </p>
                        <div className="gen-ia-acciones">
                            <button
                                type="button"
                                className="preview-action"
                                disabled={guardando || !actividad.titulo.trim() || !items}
                                onClick={() => guardar('borrador')}
                            >
                                <SaveRoundedIcon sx={{ fontSize: '1.1rem' }} /> Guardar borrador
                            </button>
                            <button
                                type="button"
                                className="clasificador-btn-publicar"
                                disabled={guardando || publicado || !actividad.titulo.trim() || !items}
                                onClick={() => guardar('publicado')}
                            >
                                {publicado
                                    ? <CheckCircleRoundedIcon sx={{ fontSize: '1.15rem' }} />
                                    : <RocketLaunchRoundedIcon sx={{ fontSize: '1.15rem' }} />}
                                {publicado ? 'Publicada' : guardando ? 'Guardando…' : 'Publicar para estudiantes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {previewAbierta && actividad && (
                <PreviewJuegoModal
                    tipo={tipo}
                    titulo={actividad.titulo}
                    configuracion={actividad.configuracion}
                    onCerrar={() => setPreviewAbierta(false)}
                />
            )}

            {bancoAbierto && actividad && (
                <SelectorBanco
                    tipo={tipo}
                    materiaId={idPorNombre(materia)}
                    onInsertar={agregarDelBanco}
                    onCerrar={() => setBancoAbierto(false)}
                />
            )}

            <HistorialActividades
                items={historial}
                activoId={actividad?.retoId}
                onAbrir={abrirDelHistorial}
                onEliminar={quitarDelHistorial}
            />
        </section>
    );
}

export default GeneradorActividadIA;
