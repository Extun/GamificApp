// Campo "Tema" compartido por los seis editores (B2 + B3).
//
// B2 — el docente a veces escribe instrucciones largas, no dos palabras: es un
// <textarea> que arranca con la altura de un <input> normal y crece solo hasta
// un máximo, luego hace scroll interno. Enter NO salta de línea: envía el
// formulario, igual que hacía el <input> que reemplaza.
//
// B3 — el placeholder se deriva de la MATERIA seleccionada. Las materias son un
// catálogo dinámico en BD, así que no hay un mapa rígido: se busca una palabra
// clave en el nombre normalizado y, si ninguna coincide (materia personalizada),
// se usa un ejemplo genérico. Nunca se muestra un ejemplo de otra asignatura.
import { useEffect, useRef } from 'react';

// Altura máxima antes de hacer scroll interno (~5 líneas).
const ALTO_MAXIMO = 132;

const PLACEHOLDER_GENERICO = 'Ej. Escribe el tema que quieres trabajar';

// Palabra clave (ya normalizada) → ejemplo. El orden importa: se toma la
// primera que aparezca en el nombre de la materia.
const EJEMPLOS = [
    [['matematica', 'calculo', 'aritmetica', 'algebra'], 'Ej. Sumas y restas hasta el 100'],
    [['lengua', 'literatura', 'lectura', 'escritura'], 'Ej. Los sustantivos propios y comunes'],
    [['natural', 'ciencia', 'biolog'], 'Ej. Las partes de la planta'],
    [['social', 'historia', 'civica', 'geograf'], 'Ej. Las regiones del Ecuador'],
    [['ingles', 'english'], 'Ej. Los colores y los números en inglés'],
    [['computa', 'informat', 'tecnolog', 'digital'], 'Ej. Las partes de la computadora'],
    [['educacion fisica', 'deporte'], 'Ej. Las partes del cuerpo que usamos al correr'],
    [['arte', 'cultura', 'musica', 'plastica'], 'Ej. Los colores primarios y secundarios']
];

// Quita acentos y pasa a minúsculas para comparar nombres escritos libremente.
const normalizar = (texto) =>
    String(texto || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');

// Interno a propósito: el placeholder se pide siempre a través de <CampoTema>,
// así no hay dos formas de derivarlo (y la regla de fast-refresh se respeta).
const placeholderTema = (materia) => {
    const nombre = normalizar(materia);
    if (!nombre) return PLACEHOLDER_GENERICO;
    const encontrado = EJEMPLOS.find(([claves]) => claves.some((c) => nombre.includes(c)));
    return encontrado ? encontrado[1] : PLACEHOLDER_GENERICO;
};

export function CampoTema({
    value,
    onChange,
    materia,
    etiqueta = 'Tema',
    placeholder,
    maxLength = 200,
    inputRef,
    ...resto
}) {
    const propio = useRef(null);
    const ref = inputRef || propio;

    // Ajusta la altura al contenido en cada cambio (y al montar, para los
    // temas que llegan ya escritos al reabrir un borrador).
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, ALTO_MAXIMO)}px`;
        el.style.overflowY = el.scrollHeight > ALTO_MAXIMO ? 'auto' : 'hidden';
    }, [value, ref]);

    return (
        <label className="quiz-field">
            <span>{etiqueta}</span>
            <textarea
                ref={ref}
                className="campo-tema"
                rows={1}
                value={value}
                onChange={onChange}
                placeholder={placeholder || placeholderTema(materia)}
                maxLength={maxLength}
                // Mantiene el comportamiento del <input> anterior: Enter envía
                // el formulario en vez de meter un salto de línea.
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        e.currentTarget.form?.requestSubmit();
                    }
                }}
                {...resto}
            />
        </label>
    );
}

export default CampoTema;
