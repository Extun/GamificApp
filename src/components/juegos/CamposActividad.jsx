// Bloque de campos Dificultad + Curso compartido por TODOS los editores (B1).
// Antes solo los exponían GeneradorActividadIA (memorama, línea del tiempo,
// completar) y GeneradorMision; Quiz y Clasificador quedaban fuera por tener
// editores propios. Este componente unifica el patrón sin duplicar markup.
// Las constantes y el hook viven en metadatosActividad.js.
import { DIFICULTADES_UI } from './metadatosActividad';

// Opciones del selector de curso, compartidas por los cinco sitios donde se
// elige el destino de una actividad (este bloque, los dos generadores con IA y
// sus modales de configuración): el texto tiene que decir lo mismo en todos.
//
// SPEC-026 — El curso dejó de ser decorativo: decide QUIÉN ve la actividad. Sin
// elegir ninguno, llega a los estudiantes de TODOS los cursos del docente, y el
// selector solo lista los suyos; de ahí «Todos mis cursos». Si el admin todavía
// no le asignó ninguno, el contenido sí es institucional y la etiqueta lo dice
// tal cual, sin prometer un recorte que no existe.
export function OpcionesCurso({ cursos }) {
    return (
        <>
            <option value="">{cursos.length ? 'Todos mis cursos' : 'Todos los cursos'}</option>
            {cursos.map((c) => <option key={c.id} value={c.id}>{c.etiqueta}</option>)}
        </>
    );
}

export function CamposDificultadCurso({ dificultad, onDificultad, cursoId, onCursoId, cursos }) {
    return (
        <>
            <label className="quiz-field">
                <span>Dificultad</span>
                <select value={dificultad} onChange={(e) => onDificultad(e.target.value)}>
                    {DIFICULTADES_UI.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
            </label>
            <label className="quiz-field">
                <span>Curso (opcional)</span>
                <select value={cursoId} onChange={(e) => onCursoId(e.target.value)}>
                    <OpcionesCurso cursos={cursos} />
                </select>
            </label>
        </>
    );
}

export default CamposDificultadCurso;
