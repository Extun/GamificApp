# Política de eliminación y consistencia de entidades

> Última actualización: 2026-07-09
> Complementa SPEC-003 (Papelera). El código manda: `server/routes/admin.js` y `server/initDb.js` (migración 007).

## Principios (aplican a TODA entidad, presente y futura)

1. **Eliminar = enviar a la Papelera (soft-delete).** La fila se marca con `eliminado_en`/`eliminado_por`; nunca se hace `DELETE` directo desde los paneles. El borrado físico solo existe en la Papelera (purga definitiva) y ahí SÍ se validan dependencias (409 amigable si dejaría huérfanos).
2. **Una fila en la Papelera es invisible en TODO el sistema** (listados, selectores, JOINs, rankings, historiales). Regla de código: **todo JOIN o subquery contra una tabla con soft-delete debe filtrar `eliminado_en IS NULL`** (en la condición del JOIN si es LEFT JOIN).
3. **Una fila en la Papelera no reserva su nombre.** La unicidad (materias.nombre, cursos nombre+paralelo) se garantiza con índices únicos funcionales que solo cuentan filas vivas (migración 007). Excepción: `usuarios.username` sigue reservado mientras la cuenta exista (evita suplantar una cuenta restaurable).
4. **Restaurar devuelve todo tal cual**: las relaciones nunca se tocaron. Si mientras tanto se creó un homónimo activo, la restauración responde 409 con instrucción clara.
5. **Toda operación multi-tabla corre en transacción** (`beginTransaction`/`commit`/`rollback`): o se aplica todo o nada. Ejemplos ya cubiertos: crear/editar docente + asignaciones, editar curso + VARCHAR denormalizados, XP (`FOR UPDATE`), purga de estudiante (cuenta + ficha).
6. **La UI nunca es fuente de verdad**: `localStorage` es caché de primer pintado y cada listado se pisa con la respuesta de la API tras escribir. El servidor valida permisos y estados; la UI solo oculta.
7. **Preferir desactivar antes que eliminar** cuando la entidad tiene historial: `materias.activa = FALSE` y `cursos.activo = FALSE` la ocultan a docentes/estudiantes sin tocar relaciones. La Papelera es para retirarla también del panel admin.

## Política por entidad

| Entidad | Eliminar | Desactivar | Purga definitiva (Papelera) |
|---|---|---|---|
| Materia | Papelera. Desaparece de docentes, editores, retos, biblioteca, progreso e historiales; su nombre queda libre. Protegidas: no se eliminan. | `activa = FALSE` (recomendado si tiene contenido) | Solo si no tiene retos, materiales ni docentes asignados |
| Curso | Papelera. Nombre+paralelo quedan libres. | `activo = FALSE` | Solo sin estudiantes vinculados |
| Docente | Papelera (no inicia sesión, no aparece). Sus asignaciones/retos/material quedan intactos para restaurar. | — | Borra la cuenta; contenido con `docente_id` pasa a NULL (FK) |
| Estudiante | Papelera (sale del ranking y listados; su ficha/XP queda intacta). | — | Transacción: cuenta + ficha + progreso (cascada) |
| Administrador | Papelera. Invariante: siempre queda ≥1 Principal activo; no puedes eliminarte a ti mismo. | `activo = FALSE` (mismo invariante) | Borra la cuenta |
| Invitación | DELETE directo solo si no fue usada; las usadas son historial intocable. | expiran solas (7 días) | — |
| Material | DELETE directo (es un archivo, sin dependientes). | `is_private` lo oculta a estudiantes | — |
| Reto/Actividad | No se elimina: se **archiva** (`estado = 'archivado'`); conserva el progreso de los estudiantes. | borrador/archivado | — |
| Institución | Fila única (id=1), solo se edita. | — | — |
| Auditoría | Solo-inserción (append-only). Nunca se edita ni borra. | — | — |

## Al agregar una entidad o consulta nueva

- Si la entidad puede eliminarse: agregarle `eliminado_en`/`eliminado_por`, listarla en `TIPOS_PAPELERA` (admin.js) y validar dependencias en su purga.
- Si tiene restricción de unicidad por nombre: usar índice único funcional sobre `IF(eliminado_en IS NULL, …, NULL)` (ver migración 007), nunca UNIQUE físico directo.
- Toda consulta nueva que una `materias`, `cursos` o `usuarios` debe filtrar `eliminado_en IS NULL` salvo que sea explícitamente la vista de Papelera o auditoría.
