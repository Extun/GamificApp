// Bloque de campos Dificultad + Curso compartido por TODOS los editores (B1).
// Antes solo los exponían GeneradorActividadIA (memorama, línea del tiempo,
// completar) y GeneradorMision; Quiz y Clasificador quedaban fuera por tener
// editores propios. Este componente unifica el patrón sin duplicar markup.
// Las constantes y el hook viven en metadatosActividad.js.
import { DIFICULTADES_UI } from './metadatosActividad';

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
                    <option value="">Todos los cursos</option>
                    {cursos.map((c) => <option key={c.id} value={c.id}>{c.etiqueta}</option>)}
                </select>
            </label>
        </>
    );
}

export default CamposDificultadCurso;
