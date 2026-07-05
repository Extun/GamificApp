// Migración one-shot del contenido guardado bajo los nombres de materias
// antiguos (lista de 7) hacia las 5 materias oficiales de la BD.
//
// - Con equivalencia clara: el contenido se fusiona bajo el nombre nuevo.
// - Sin equivalencia: el contenido se conserva intacto en localStorage (no se
//   borra nada) y se reporta para que la UI avise al docente.
// Es idempotente: tras migrar, las claves antiguas ya no existen y las
// siguientes ejecuciones no hacen nada.
import { NOMBRES_MATERIAS } from '../constants/materias';

const EQUIVALENCIAS = {
    'Lengua y Literatura': 'Lenguaje',
    'Ciencias Naturales y Sociales': 'Ciencias Naturales'
};

// Claves de localStorage cuyo valor es un objeto { [nombreMateria]: [...] }.
const CLAVES_POR_MATERIA = ['edu_archivosMateria', 'edu_historialQuizzes'];

export const migrarMateriasAntiguas = () => {
    const sinEquivalente = new Set();

    for (const clave of CLAVES_POR_MATERIA) {
        try {
            const raw = localStorage.getItem(clave);
            if (!raw) continue;

            const data = JSON.parse(raw);
            if (!data || typeof data !== 'object' || Array.isArray(data)) continue;

            let cambio = false;
            for (const nombre of Object.keys(data)) {
                if (NOMBRES_MATERIAS.includes(nombre)) continue;

                const destino = EQUIVALENCIAS[nombre];
                if (destino) {
                    const origen = Array.isArray(data[nombre]) ? data[nombre] : [];
                    data[destino] = [...(data[destino] || []), ...origen];
                    delete data[nombre];
                    cambio = true;
                } else {
                    sinEquivalente.add(nombre);
                }
            }

            if (cambio) localStorage.setItem(clave, JSON.stringify(data));
        } catch {
            // Datos corruptos: no tocar; el lector de cada dashboard ya
            // maneja este caso con su propio fallback.
        }
    }

    return { sinEquivalente: [...sinEquivalente] };
};

export default migrarMateriasAntiguas;
