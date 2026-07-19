import { useEffect, useRef, useState } from 'react';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import RocketLaunchRoundedIcon from '@mui/icons-material/RocketLaunchRounded';
import UndoRoundedIcon from '@mui/icons-material/UndoRounded';
import CategoryRoundedIcon from '@mui/icons-material/CategoryRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import { idPorNombre } from '../../services/materiasService';
import { generarActividadIA } from '../../services/iaService';
import { publicarReto } from '../../services/retosService';
import { PUNTOS_POR_ACIERTO } from '../../services/gamificationService';
import { useHistorialRetos, HistorialActividades } from '../juegos/HistorialActividades';
import { PreviewJuegoModal } from '../juegos/PreviewJuegoModal';
import { BarraAccionesEditor } from '../juegos/BarraAccionesEditor';
import { CampoTema } from '../juegos/CampoTema';
import { CamposDificultadCurso } from '../juegos/CamposActividad';
import { useCursos } from '../juegos/metadatosActividad';
import './editorClasificador.css';

// Editor no-code del juego 'Clasificador de Objetos'. El docente define el
// título, las categorías y sus elementos con inputs simples; al publicar, el
// backend convierte esta estructura al campo `configuracion_json` de `retos`.
// Los elementos aceptan emoji + texto (ej. "🐬 Delfín"): el emoji hace de
// "imagen" en la vista del estudiante sin necesidad de subir archivos.

const idUnico = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

// Copia profunda simple (el estado del editor es JSON puro).
const clon = (v) => JSON.parse(JSON.stringify(v));

const categoriaVacia = (nombre = '') => ({ id: idUnico(), nombre, elementos: [] });

// Paleta rotativa para diferenciar visualmente cada categoría en el editor
// (el juego del estudiante usa la misma rotación).
export const COLORES_CATEGORIA = ['teal', 'amber', 'violet', 'rose'];

export function EditorClasificador({ materia }) {
    const [titulo, setTitulo] = useState('');
    const [categorias, setCategorias] = useState([
        categoriaVacia(), categoriaVacia()
    ]);
    // Texto en el input "nuevo elemento" de cada categoría, por id.
    const [nuevoElemento, setNuevoElemento] = useState({});
    // «Generar con IA» (SPEC-006): el docente escribe el tema y la IA llena
    // título, categorías y elementos en ESTE mismo editor (misma ruta genérica
    // que memorama/línea del tiempo/completar).
    const [temaIA, setTemaIA] = useState('');
    // B1 — mismos metadatos que el resto de editores: guian la generacion IA
    // y persisten en `retos.dificultad` / `retos.curso_id`.
    const [dificultad, setDificultad] = useState('media');
    const [cursoId, setCursoId] = useState('');
    const cursos = useCursos();
    const [generandoIA, setGenerandoIA] = useState(false);
    // "Añadir con IA" incremental (menú Agregar): fusiona sin borrar nada.
    const [agregandoIA, setAgregandoIA] = useState(false);
    // SPEC-013 Fase 2: la entrada "Generarlas automáticamente" del menú lleva
    // al formulario de IA (hasta que la Fase 7 lo convierta en modal).
    const temaIARef = useRef(null);
    const irAlFormularioIA = () => {
        temaIARef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        temaIARef.current?.focus({ preventScroll: true });
    };
    const [publicando, setPublicando] = useState(false);
    // Tras publicar, el botón queda bloqueado hasta que el docente edite algo:
    // así un doble clic no crea el mismo juego dos veces.
    const [publicado, setPublicado] = useState(false);
    // SPEC-012: vista previa como estudiante (modo prueba).
    const [previewAbierta, setPreviewAbierta] = useState(false);
    const [aviso, setAviso] = useState('');
    const [error, setError] = useState('');
    // SPEC-011 — historial respaldado en BD: el borrador vive en `retos` y la
    // lista se lee del servidor (localStorage = caché offline).
    const [entradaId, setEntradaId] = useState(null);
    // ¿La fila en BD está publicada? (los publicados no se editan en caliente).
    const [publicadoEnBD, setPublicadoEnBD] = useState(false);
    const creandoRef = useRef(false);
    const { historial, crearBorrador, sincronizar, cancelarSincronizacion, eliminar: eliminarBorrador, abrirDetalle, refrescar } =
        useHistorialRetos('clasificador', materia);

    const materiaId = idPorNombre(materia);
    const totalElementos = categorias.reduce((n, c) => n + c.elementos.length, 0);

    // "Deshacer cambios": foto de {titulo, categorias} tal como quedó al abrir,
    // generar o publicar. Restaurarla revierte las ediciones de la sesión (el
    // efecto de sincronización re-escribe también el borrador en BD).
    // `null` = la base es el editor en blanco (sin efecto de montaje: se
    // compara semánticamente contra "todo vacío").
    const [snapshot, setSnapshot] = useState(null);
    const tomarSnapshot = (foto = { titulo, categorias }) => setSnapshot(clon(foto));
    const hayCambios = snapshot
        ? JSON.stringify({ titulo, categorias }) !== JSON.stringify(snapshot)
        : Boolean(
            titulo.trim() || categorias.length !== 2 ||
            categorias.some((c) => c.nombre.trim() || c.elementos.length)
        );
    const deshacerCambios = () => {
        if (!hayCambios) return;
        const s = snapshot ? clon(snapshot) : { titulo: '', categorias: [categoriaVacia(), categoriaVacia()] };
        setTitulo(s.titulo);
        setCategorias(s.categorias);
        setPublicado(false);
        setAviso('Cambios deshechos: el juego volvió a como estaba al abrirlo.');
        setTimeout(() => setAviso(''), 4000);
    };

    // Forma publicable de la configuración (la misma del POST publicar); como
    // borrador puede ir incompleta — el servidor solo la valida al publicar.
    const configuracionActual = () => ({
        categorias: categorias.map((c) => ({ nombre: c.nombre.trim(), elementos: c.elementos }))
    });

    // El borrador en BD se crea recién cuando hay TÍTULO (el upsert por
    // (materia, título) exige uno y así no se acumulan filas sin nombre);
    // desde entonces cada edición se sincroniza con PATCH (debounce). Si el
    // reto ya está publicado, los cambios quedan en memoria hasta republicar.
    useEffect(() => {
        const tituloTrim = titulo.trim();
        if (!tituloTrim || !materiaId) return;
        if (!entradaId) {
            if (creandoRef.current) return;
            creandoRef.current = true;
            crearBorrador({
                materiaId,
                titulo: tituloTrim,
                configuracion: configuracionActual(),
                xpRecompensa: Math.max(totalElementos, 1) * PUNTOS_POR_ACIERTO,
                dificultad,
                cursoId: cursoId ? Number(cursoId) : undefined
            })
                .then((creado) => setEntradaId(creado?.id ?? null))
                .catch((err) => console.warn('El borrador no se pudo guardar en el servidor:', err.message))
                .finally(() => { creandoRef.current = false; });
            return;
        }
        if (publicadoEnBD) return;
        sincronizar(entradaId, {
            titulo: tituloTrim,
            configuracion: configuracionActual(),
            xp_recompensa: Math.max(totalElementos, 1) * PUNTOS_POR_ACIERTO
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [titulo, categorias]);

    // Regla mínima de publicación: título, 2+ categorías con nombre y al
    // menos un elemento en cada una (misma validación que aplica el backend).
    const listoParaPublicar =
        titulo.trim() &&
        categorias.length >= 2 &&
        categorias.every((c) => c.nombre.trim() && c.elementos.length >= 1);

    const editarCategoria = (id, cambio) => {
        setPublicado(false);
        setCategorias((prev) => prev.map((c) => (c.id === id ? { ...c, ...cambio } : c)));
    };

    const agregarCategoria = () => {
        setPublicado(false);
        setCategorias((prev) => [...prev, categoriaVacia()]);
    };

    const eliminarCategoria = (id) => {
        setPublicado(false);
        setCategorias((prev) => (prev.length > 2 ? prev.filter((c) => c.id !== id) : prev));
    };

    const agregarElemento = (cat) => {
        const texto = (nuevoElemento[cat.id] || '').trim();
        if (!texto) return;
        editarCategoria(cat.id, { elementos: [...cat.elementos, texto] });
        setNuevoElemento((prev) => ({ ...prev, [cat.id]: '' }));
    };

    const eliminarElemento = (cat, indice) => {
        editarCategoria(cat.id, { elementos: cat.elementos.filter((_, i) => i !== indice) });
    };

    const generarConIA = async (e) => {
        e.preventDefault();
        if (!temaIA.trim() || generandoIA) return;
        if (!materiaId) {
            setError('No se reconoce la materia actual; recarga la página.');
            return;
        }
        // Generar desde el formulario REEMPLAZA el juego abierto. Se avisa para
        // no perder trabajo por accidente (para sumar contenido está "Añadir
        // con IA" en el menú Agregar).
        if (totalElementos > 0 && !window.confirm(
            'Esto crea un juego NUEVO y cierra el que tienes abierto '
            + `(${entradaId ? 'queda guardado en «Últimos generados»' : 'sin título no queda guardado'}). `
            + 'Para sumar categorías o elementos al actual usa el botón «Agregar» de abajo. ¿Continuar?'
        )) return;
        setGenerandoIA(true);
        setError('');
        setAviso('');
        try {
            const data = await generarActividadIA({
                tipo: 'clasificador',
                materiaId,
                tema: temaIA.trim(),
                dificultad,
                cursoId: cursoId ? Number(cursoId) : undefined
            });
            const nuevasCategorias = (data.configuracion?.categorias || []).map((c) => ({
                id: idUnico(),
                nombre: c.nombre,
                elementos: c.elementos
            }));
            // Cada generación con IA crea una entrada NUEVA (el efecto de
            // sincronización la registra en BD al detectar el título nuevo
            // sin entradaId), sin pisar el juego anterior.
            cancelarSincronizacion(entradaId);
            setEntradaId(null);
            setPublicadoEnBD(false);
            setTitulo(data.titulo);
            setCategorias(nuevasCategorias);
            setPublicado(false);
            tomarSnapshot({ titulo: data.titulo, categorias: nuevasCategorias });
        } catch (err) {
            setError(`No se pudo generar con la IA: ${err.message}`);
        } finally {
            setGenerandoIA(false);
        }
    };

    // "Añadir con IA" (SPEC-013): genera sobre el mismo tema y FUSIONA con lo
    // actual — a las categorías con el mismo nombre les suma elementos nuevos,
    // y las categorías desconocidas se agregan enteras. No borra nada.
    const agregarConIA = async () => {
        if (agregandoIA || generandoIA) return;
        const temaBase = temaIA.trim() || titulo.trim();
        if (!materiaId || !temaBase) {
            setError('Escribe el tema (arriba) o el título del reto para pedirle ideas a la IA.');
            setTimeout(() => setError(''), 5000);
            irAlFormularioIA();
            return;
        }
        setAgregandoIA(true);
        setError('');
        setAviso('');
        try {
            // Las categorías/elementos actuales viajan como contexto: la IA
            // complementa el juego en vez de crear otro desde cero.
            const existentes = categorias
                .filter((c) => c.nombre.trim() || c.elementos.length)
                .map((c) => `Categoría "${c.nombre.trim() || 'sin nombre'}": ${c.elementos.join(', ') || '(vacía)'}`);
            const data = await generarActividadIA({
                tipo: 'clasificador', materiaId, tema: temaBase, existentes,
                dificultad, cursoId: cursoId ? Number(cursoId) : undefined
            });
            const generadas = data.configuracion?.categorias || [];
            const norm = (s) => (s || '').trim().toLowerCase();
            const fusion = categorias.map((c) => ({ ...c, elementos: [...c.elementos] }));
            let sumados = 0;
            for (const gen of generadas) {
                const existente = fusion.find((c) => norm(c.nombre) === norm(gen.nombre));
                if (existente) {
                    for (const el of gen.elementos || []) {
                        if (!existente.elementos.some((e) => norm(e) === norm(el))) {
                            existente.elementos.push(el);
                            sumados++;
                        }
                    }
                } else if (gen.nombre?.trim()) {
                    fusion.push({ id: idUnico(), nombre: gen.nombre, elementos: gen.elementos || [] });
                    sumados += (gen.elementos || []).length || 1;
                }
            }
            if (!sumados) {
                setAviso('La IA no encontró contenido distinto al que ya tienes. Prueba afinando el tema.');
                setTimeout(() => setAviso(''), 5000);
                return;
            }
            setPublicado(false);
            setCategorias(fusion);
            setAviso(`La IA sumó ${sumados} ${sumados === 1 ? 'elemento' : 'elementos'} sin tocar lo que ya tenías.`);
            setTimeout(() => setAviso(''), 5000);
        } catch (err) {
            setError(`No se pudo añadir con la IA: ${err.message}`);
            setTimeout(() => setError(''), 5000);
        } finally {
            setAgregandoIA(false);
        }
    };

    // Cierra el juego abierto y deja el editor en blanco. Si tiene título, el
    // borrador ya vive en la BD y se reabre desde "Últimos generados".
    const cerrarEditor = () => {
        if (!entradaId && totalElementos > 0 && !window.confirm(
            'Este juego no tiene título, así que no quedó guardado. ¿Cerrarlo de todos modos?'
        )) return;
        cancelarSincronizacion(entradaId);
        setEntradaId(null);
        setPublicadoEnBD(false);
        setTitulo('');
        const vacias = [categoriaVacia(), categoriaVacia()];
        setCategorias(vacias);
        tomarSnapshot({ titulo: '', categorias: vacias });
        setTemaIA('');
        setNuevoElemento({});
        setPublicado(false);
        setAviso('');
        setError('');
    };

    const publicar = async () => {
        if (!listoParaPublicar || publicando || publicado) return;
        if (!materiaId) {
            setError('No se reconoce la materia actual; recarga la página.');
            return;
        }
        setPublicando(true);
        setError('');
        setAviso('');
        try {
            // Un PATCH pendiente del debounce ya no hace falta: el POST que
            // sigue escribe el estado completo.
            cancelarSincronizacion(entradaId);
            const data = await publicarReto({
                materiaId,
                titulo: titulo.trim(),
                tipo: 'clasificador',
                descripcion: `Juego de clasificación: ${categorias.map((c) => c.nombre.trim()).join(' vs ')}`,
                // La recompensa se alinea con el resto de la app: cada elemento
                // bien clasificado al primer intento vale PUNTOS_POR_ACIERTO XP.
                xpRecompensa: totalElementos * PUNTOS_POR_ACIERTO,
                configuracion: configuracionActual(),
                dificultad,
                cursoId: cursoId ? Number(cursoId) : undefined
            });
            setEntradaId(data?.id ?? entradaId);
            setPublicadoEnBD(true);
            refrescar();
            setPublicado(true);
            // Lo publicado es la nueva base de "Deshacer".
            tomarSnapshot();
            setAviso('¡Juego publicado! Ya es visible para los estudiantes.');
            setTimeout(() => setAviso(''), 4000);
        } catch (err) {
            console.error('Error al publicar el clasificador:', err);
            setError(`No se pudo publicar el juego. ${err.message || 'Verifica que el servidor esté encendido.'}`);
        } finally {
            setPublicando(false);
        }
    };

    return (
        <section className="card materia-subvista editor-clasificador">
            <div className="card-head">
                <h3>Juego: Clasificador de Objetos</h3>
                <span className="card-tag">{materia}</span>
            </div>
            <p className="clasificador-intro">
                Crea categorías (canastas) y añade los elementos que el estudiante deberá
                arrastrar a la canasta correcta. Consejo: empieza cada elemento con un emoji
                (ej. <em>🐬 Delfín</em>) para que sea más visual para los niños.
            </p>

            <form className="quiz-form" onSubmit={generarConIA}>
                <CampoTema
                    etiqueta="Tema (para generar con IA)"
                    inputRef={temaIARef}
                    value={temaIA}
                    onChange={(e) => setTemaIA(e.target.value)}
                    materia={materia}
                />
                <CamposDificultadCurso
                    dificultad={dificultad}
                    onDificultad={setDificultad}
                    cursoId={cursoId}
                    onCursoId={setCursoId}
                    cursos={cursos}
                />
                <button type="submit" className="quiz-generar-btn" disabled={generandoIA || !temaIA.trim()}>
                    {generandoIA
                        ? <span className="quiz-spinner" aria-hidden="true" />
                        : <AutoAwesomeRoundedIcon sx={{ fontSize: '1.1rem' }} />}
                    {generandoIA ? 'Generando…' : 'Generar con IA'}
                </button>
            </form>

            {(titulo.trim() || totalElementos > 0) && (
                <div className="editor-abierto-head">
                    <span className="editor-abierto-etiqueta">Editando: {titulo.trim() || 'sin título'}</span>
                    <button
                        type="button"
                        className="editor-cerrar-btn"
                        onClick={cerrarEditor}
                        title="Cierra este juego y deja el editor en blanco; con título queda en «Últimos generados»"
                    >
                        ✕ Cerrar
                    </button>
                </div>
            )}

            <label className="quiz-field clasificador-titulo-field">
                <span>Título del reto</span>
                <input
                    type="text"
                    value={titulo}
                    onChange={(e) => { setPublicado(false); setTitulo(e.target.value); }}
                    placeholder="Ej. Animales acuáticos vs terrestres"
                />
            </label>

            <div className="clasificador-categorias">
                {categorias.map((cat, i) => (
                    <div key={cat.id} className={`clasificador-cat clasificador-cat-${COLORES_CATEGORIA[i % COLORES_CATEGORIA.length]}`}>
                        <div className="clasificador-cat-head">
                            <span className="clasificador-cat-icon"><CategoryRoundedIcon /></span>
                            <input
                                type="text"
                                className="clasificador-cat-nombre"
                                value={cat.nombre}
                                onChange={(e) => editarCategoria(cat.id, { nombre: e.target.value })}
                                placeholder={`Nombre de la categoría ${i + 1}`}
                            />
                            {categorias.length > 2 && (
                                <button
                                    type="button"
                                    className="clasificador-cat-eliminar"
                                    title="Eliminar categoría"
                                    onClick={() => eliminarCategoria(cat.id)}
                                >
                                    <DeleteOutlineRoundedIcon sx={{ fontSize: '1.1rem' }} />
                                </button>
                            )}
                        </div>

                        <div className="clasificador-elementos">
                            {cat.elementos.map((el, j) => (
                                <span key={j} className="clasificador-elemento-chip">
                                    {el}
                                    <button
                                        type="button"
                                        aria-label={`Quitar ${el}`}
                                        onClick={() => eliminarElemento(cat, j)}
                                    >
                                        <CloseRoundedIcon sx={{ fontSize: '0.9rem' }} />
                                    </button>
                                </span>
                            ))}
                            {cat.elementos.length === 0 && (
                                <span className="clasificador-elementos-vacio">Aún sin elementos</span>
                            )}
                        </div>

                        <div className="clasificador-agregar-elemento">
                            <input
                                type="text"
                                value={nuevoElemento[cat.id] || ''}
                                onChange={(e) => setNuevoElemento((prev) => ({ ...prev, [cat.id]: e.target.value }))}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') { e.preventDefault(); agregarElemento(cat); }
                                }}
                                placeholder="Ej. 🐬 Delfín  (Enter para añadir)"
                            />
                            <button type="button" onClick={() => agregarElemento(cat)}>
                                <AddRoundedIcon sx={{ fontSize: '1.1rem' }} /> Añadir
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* SPEC-013 Fase 2: botón único "Agregar" con menú por acciones.
                El clasificador no usa el banco (decisión de diseño, SPEC-013 §3):
                esas entradas NO aparecen, en vez de mostrarse deshabilitadas. */}
            <BarraAccionesEditor
                agregar={{
                    label: agregandoIA ? 'Generando…' : 'Agregar categorías',
                    pregunta: '¿Cómo deseas agregarlas?',
                    disabled: publicando || agregandoIA,
                    opciones: [
                        {
                            id: 'escribir',
                            emoji: '📝',
                            titulo: 'Escribir categorías',
                            detalle: 'Añade una canasta y escribe sus elementos dentro.',
                            onClick: agregarCategoria
                        },
                        {
                            id: 'generar',
                            emoji: '🤖',
                            titulo: 'Añadir con IA',
                            detalle: 'La IA suma canastas y elementos sobre el tema, sin borrar lo que tienes.',
                            onClick: agregarConIA
                        }
                    ]
                }}
                acciones={[
                    {
                        id: 'deshacer',
                        label: 'Deshacer cambios',
                        Icon: UndoRoundedIcon,
                        onClick: deshacerCambios,
                        disabled: publicando || agregandoIA || !hayCambios,
                        title: hayCambios
                            ? 'Vuelve el juego a como estaba al abrirlo o generarlo'
                            : 'No hay cambios sin guardar que deshacer'
                    },
                    {
                        id: 'preview',
                        label: 'Vista previa',
                        Icon: VisibilityRoundedIcon,
                        onClick: () => setPreviewAbierta(true),
                        disabled: publicando || !totalElementos,
                        title: totalElementos
                            ? 'Juega el clasificador como lo verá el estudiante (sin XP ni progreso)'
                            : 'Añade al menos un elemento para previsualizar'
                    }
                ]}
            />

            {error && <p className="quiz-error">{error}</p>}
            {aviso && (
                <p className="quiz-aviso clasificador-aviso">
                    <CheckCircleRoundedIcon sx={{ fontSize: '1.1rem' }} /> {aviso}
                </p>
            )}

            <div className="clasificador-publicar-barra">
                <p className="clasificador-publicar-hint">
                    {publicado
                        ? 'Este juego ya está publicado. Si cambias algo, podrás publicarlo como un juego nuevo.'
                        : listoParaPublicar
                        ? `Todo listo: ${categorias.length} categorías y ${totalElementos} elementos. Recompensa: ${totalElementos * PUNTOS_POR_ACIERTO} XP.`
                        : 'Escribe el título, nombra al menos 2 categorías y añade un elemento o más a cada una.'}
                </p>
                <button
                    type="button"
                    className="clasificador-btn-publicar"
                    onClick={publicar}
                    disabled={!listoParaPublicar || publicando || publicado}
                >
                    {publicado
                        ? <CheckCircleRoundedIcon sx={{ fontSize: '1.15rem' }} />
                        : <RocketLaunchRoundedIcon sx={{ fontSize: '1.15rem' }} />}
                    {publicado ? 'Publicado' : publicando ? 'Publicando…' : 'Publicar juego para estudiantes'}
                </button>
            </div>

            {previewAbierta && (
                <PreviewJuegoModal
                    tipo="clasificador"
                    titulo={titulo}
                    configuracion={configuracionActual()}
                    onCerrar={() => setPreviewAbierta(false)}
                />
            )}

            <HistorialActividades
                titulo="Últimos juegos generados"
                items={historial}
                activoId={entradaId}
                onCerrar={cerrarEditor}
                onAbrir={async (e) => {
                    setAviso('');
                    setError('');
                    try {
                        const detalle = await abrirDetalle(e.id);
                        cancelarSincronizacion(entradaId);
                        const abiertas = (detalle.configuracion?.categorias || []).map((c) => ({
                            id: idUnico(), nombre: c.nombre || '', elementos: c.elementos || []
                        }));
                        while (abiertas.length < 2) abiertas.push(categoriaVacia());
                        setEntradaId(detalle.id);
                        setPublicadoEnBD(detalle.estado === 'publicado');
                        setTitulo(detalle.titulo || '');
                        // B1: los metadatos guardados vuelven al formulario.
                        setDificultad(detalle.dificultad || 'media');
                        setCursoId(detalle.curso_id ? String(detalle.curso_id) : '');
                        setCategorias(abiertas);
                        setPublicado(detalle.estado === 'publicado');
                        tomarSnapshot({ titulo: detalle.titulo || '', categorias: abiertas });
                    } catch (err) {
                        setError(`No se pudo abrir el juego: ${err.message}`);
                    }
                }}
                onEliminar={async (id) => {
                    try {
                        await eliminarBorrador(id);
                        if (entradaId === id) {
                            setTitulo('');
                            setCategorias([categoriaVacia(), categoriaVacia()]);
                            setEntradaId(null);
                            setPublicadoEnBD(false);
                            setPublicado(false);
                        }
                    } catch (err) {
                        setError(`No se pudo eliminar: ${err.message}`);
                    }
                }}
            />
        </section>
    );
}
