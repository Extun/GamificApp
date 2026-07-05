import { useState } from 'react';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import RocketLaunchRoundedIcon from '@mui/icons-material/RocketLaunchRounded';
import CategoryRoundedIcon from '@mui/icons-material/CategoryRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import MATERIAS from '../../constants/materias';
import { publicarReto } from '../../services/retosService';
import { PUNTOS_POR_ACIERTO } from '../../services/gamificationService';
import './editorClasificador.css';

// Editor no-code del juego 'Clasificador de Objetos'. El docente define el
// título, las categorías y sus elementos con inputs simples; al publicar, el
// backend convierte esta estructura al campo `configuracion_json` de `retos`.
// Los elementos aceptan emoji + texto (ej. "🐬 Delfín"): el emoji hace de
// "imagen" en la vista del estudiante sin necesidad de subir archivos.

const idUnico = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

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
    const [publicando, setPublicando] = useState(false);
    const [aviso, setAviso] = useState('');
    const [error, setError] = useState('');

    const materiaId = MATERIAS.find((m) => m.nombre === materia)?.id;
    const totalElementos = categorias.reduce((n, c) => n + c.elementos.length, 0);

    // Regla mínima de publicación: título, 2+ categorías con nombre y al
    // menos un elemento en cada una (misma validación que aplica el backend).
    const listoParaPublicar =
        titulo.trim() &&
        categorias.length >= 2 &&
        categorias.every((c) => c.nombre.trim() && c.elementos.length >= 1);

    const editarCategoria = (id, cambio) => {
        setCategorias((prev) => prev.map((c) => (c.id === id ? { ...c, ...cambio } : c)));
    };

    const agregarCategoria = () => setCategorias((prev) => [...prev, categoriaVacia()]);

    const eliminarCategoria = (id) => {
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

    const publicar = async () => {
        if (!listoParaPublicar || publicando) return;
        if (!materiaId) {
            setError('No se reconoce la materia actual; recarga la página.');
            return;
        }
        setPublicando(true);
        setError('');
        setAviso('');
        try {
            await publicarReto({
                materiaId,
                titulo: titulo.trim(),
                tipo: 'clasificador',
                descripcion: `Juego de clasificación: ${categorias.map((c) => c.nombre.trim()).join(' vs ')}`,
                // La recompensa se alinea con el resto de la app: cada elemento
                // bien clasificado al primer intento vale PUNTOS_POR_ACIERTO XP.
                xpRecompensa: totalElementos * PUNTOS_POR_ACIERTO,
                configuracion: {
                    categorias: categorias.map((c) => ({
                        nombre: c.nombre.trim(),
                        elementos: c.elementos
                    }))
                }
            });
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

            <label className="quiz-field clasificador-titulo-field">
                <span>Título del reto</span>
                <input
                    type="text"
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
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

            <button type="button" className="clasificador-btn-cat" onClick={agregarCategoria}>
                <AddRoundedIcon sx={{ fontSize: '1.15rem' }} /> Añadir categoría
            </button>

            {error && <p className="quiz-error">{error}</p>}
            {aviso && (
                <p className="quiz-aviso clasificador-aviso">
                    <CheckCircleRoundedIcon sx={{ fontSize: '1.1rem' }} /> {aviso}
                </p>
            )}

            <div className="clasificador-publicar-barra">
                <p className="clasificador-publicar-hint">
                    {listoParaPublicar
                        ? `Todo listo: ${categorias.length} categorías y ${totalElementos} elementos. Recompensa: ${totalElementos * PUNTOS_POR_ACIERTO} XP.`
                        : 'Escribe el título, nombra al menos 2 categorías y añade un elemento o más a cada una.'}
                </p>
                <button
                    type="button"
                    className="clasificador-btn-publicar"
                    onClick={publicar}
                    disabled={!listoParaPublicar || publicando}
                >
                    <RocketLaunchRoundedIcon sx={{ fontSize: '1.15rem' }} />
                    {publicando ? 'Publicando…' : 'Publicar juego para estudiantes'}
                </button>
            </div>
        </section>
    );
}
