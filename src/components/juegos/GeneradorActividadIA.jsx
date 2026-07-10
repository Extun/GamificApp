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
import { idPorNombre } from '../../services/materiasService';
import { generarActividadIA } from '../../services/iaService';
import { publicarReto } from '../../services/retosService';
import { PUNTOS_POR_ACIERTO } from '../../services/gamificationService';
import docenteService from '../../services/docenteService';
import { TIPOS_ACTIVIDAD } from './registroJuegos';
import { useHistorialActividades, nuevaEntradaHistorial, HistorialActividades } from './HistorialActividades';

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
    const [publicado, setPublicado] = useState(false);
    const [error, setError] = useState('');
    const [aviso, setAviso] = useState('');
    // Historial "Últimas actividades generadas" (mismo patrón que el quiz):
    // últimas 3 por materia, en localStorage bajo una clave propia del tipo.
    const { historial, guardar: guardarHistorial, actualizar: actualizarHistorial, eliminar: eliminarHistorial } =
        useHistorialActividades(`edu_historialActividades_${tipo}`, materia);

    // Nota: el dashboard monta este componente con key={tipo}, así que al
    // cambiar de tipo se reinicia todo el estado (sin efectos de limpieza).
    useEffect(() => {
        docenteService.listarCursos().then(setCursos).catch(() => setCursos([]));
    }, []);

    const etiqueta = TIPOS_ACTIVIDAD[tipo]?.etiqueta || tipo;
    const items = contarItems(tipo, actividad?.configuracion);
    const xp = Math.max(items, 1) * PUNTOS_POR_ACIERTO;

    const generar = async (e) => {
        e.preventDefault();
        if (!tema.trim() || cargando) return;
        const materiaId = idPorNombre(materia);
        if (!materiaId) {
            setError('No se reconoce la materia actual; recarga la página.');
            return;
        }
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
            // La actividad nace como BORRADOR y se guarda en el historial para
            // poder retomarla/editarla aunque el docente cambie de vista.
            const entrada = nuevaEntradaHistorial({
                materia,
                tema: tema.trim(),
                dificultad,
                cursoId,
                titulo: data.titulo,
                descripcion: data.descripcion,
                configuracion: data.configuracion
            });
            guardarHistorial(entrada);
            setActividad(entrada);
            setPublicado(false);
        } catch (err) {
            setError(`No se pudo generar con la IA: ${err.message}`);
        } finally {
            setCargando(false);
        }
    };

    // Cualquier edición desbloquea el botón de publicar (candado anti doble
    // clic) y sincroniza la entrada del historial, que vuelve a ser borrador.
    const editar = (cambio) => {
        setPublicado(false);
        setActividad((prev) => {
            const actualizado = { ...prev, ...cambio, estado: 'borrador' };
            actualizarHistorial(actualizado);
            return actualizado;
        });
    };
    const editarConfig = (cambio) =>
        editar({ configuracion: { ...actividad.configuracion, ...cambio } });

    // Reabre una entrada del historial en el editor, con sus parámetros.
    const abrirDelHistorial = (entrada) => {
        setActividad(entrada);
        setTema(entrada.tema || '');
        setDificultad(entrada.dificultad || 'media');
        setCursoId(entrada.cursoId || '');
        setPublicado(entrada.estado === 'publicado');
        setAviso('');
        setError('');
    };

    const quitarDelHistorial = (id) => {
        eliminarHistorial(id);
        setActividad((actual) => (actual?.id === id ? null : actual));
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
            await publicarReto({
                materiaId,
                titulo: actividad.titulo.trim(),
                tipo,
                descripcion: actividad.descripcion,
                configuracion: actividad.configuracion,
                xpRecompensa: xp,
                estado,
                origen: 'ia',
                dificultad,
                cursoId: cursoId ? Number(cursoId) : undefined
            });
            const actualizado = { ...actividad, estado };
            setActividad(actualizado);
            actualizarHistorial(actualizado);
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

            <HistorialActividades
                items={historial}
                activoId={actividad?.id}
                onAbrir={abrirDelHistorial}
                onEliminar={quitarDelHistorial}
                meta={(e) => {
                    const n = contarItems(tipo, e.configuracion);
                    return `${n} ${n === 1 ? 'ítem' : 'ítems'}`;
                }}
            />
        </section>
    );
}

export default GeneradorActividadIA;
