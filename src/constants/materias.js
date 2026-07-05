// Fuente única de verdad de las materias oficiales.
// Los `id` coinciden con la tabla `materias` de MySQL (database/gamificapp.sql):
// nunca cambiarlos sin actualizar también el script SQL.

export const MATERIAS = [
    { id: 1, nombre: 'Matemáticas' },
    { id: 2, nombre: 'Lenguaje' },
    { id: 3, nombre: 'Ciencias Naturales' },
    { id: 4, nombre: 'Ciencias Sociales' },
    { id: 5, nombre: 'Educación Física' }
];

export const NOMBRES_MATERIAS = MATERIAS.map((m) => m.nombre);

export default MATERIAS;
