// Metadatos de actividad compartidos por todos los editores (B1): constantes
// y hook, sin JSX. Separado de CamposActividad.jsx para no mezclar exports de
// componentes con exports de utilidades (regla react-refresh).
//
// `dificultad` y `curso_id` NO son decorativos:
//   · dificultad → guía el prompt de la IA (server/lib/actividadesIA.js),
//     persiste en `retos.dificultad` y `banco_preguntas.dificultad`, y filtra
//     la Biblioteca.
//   · curso_id   → persiste en `retos.curso_id` y viaja como contexto de
//     generación para que la IA ajuste el nivel al grado destino.
import { useEffect, useState } from 'react';
import docenteService from '../../services/docenteService';

export const DIFICULTADES_UI = [
    ['facil', '🙂 Fácil'],
    ['media', '💪 Media'],
    ['dificil', '🔥 Difícil']
];

// Cursos del docente para el selector. Lista vacía si la red falla: el campo
// queda en "Todos los cursos", que es el valor por defecto válido.
export const useCursos = () => {
    const [cursos, setCursos] = useState([]);
    useEffect(() => {
        docenteService.listarCursos().then(setCursos).catch(() => setCursos([]));
    }, []);
    return cursos;
};
