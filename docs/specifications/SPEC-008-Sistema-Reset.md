# SPEC-008 — Sistema RESET ("Restablecer aplicación")

> Estado: **Implementada y montada en el servidor + botón operativo en el
> panel Institución (solo Administrador Principal).** Sigue protegida por la
> variable de entorno `RESET_HABILITADO`: **no se activa sola con el deploy**,
> requiere que la definas explícitamente en Render (ver §5). Sin esa variable
> en `'true'`, el botón de la UI existe pero el servidor responde 403.
> Autor: auditoría integral pre-tesis (2026-07-10). Activada a petición
> explícita de Fabrizio el mismo día, tras confirmar que las migraciones
> 002–009 ya estaban desplegadas en Aiven.

## 1. Objetivo

Dar al **Administrador Principal** una acción para dejar la aplicación
exactamente como una instalación nueva, conservando únicamente la
configuración inicial y su propia cuenta. Pensado para el traspaso del sistema
a la institución después de la sustentación (limpiar los datos de prueba).

## 2. Riesgo aceptado y por qué se activó igual

Es la operación más destructiva del sistema (borra casi toda la BD). No hay
MySQL local en el entorno de desarrollo, así que **no se pudo probar
end-to-end contra una BD de pruebas** — solo verificación estática
(`node --check`, `npm run build`, lectura de código). Fabrizio pidió
explícitamente activarla ya, con las migraciones 002–009 confirmadas en
Aiven, para poder limpiar los datos de prueba antes de la sustentación.

Se entrega con la mayor cantidad de salvaguardas posibles dado ese riesgo:

- Router montado en `server.js`, pero **detrás de `RESET_HABILITADO`**
  (no definida por defecto en `.env.example` → 403 hasta que se active a
  propósito en el entorno real).
- Botón real en el módulo Institución, visible **solo** si
  `authService.esPrincipal()` (la UI oculta; el servidor revalida con
  `soloAdminPrincipal` contra la BD en cada request).
- Doble confirmación en la UI (modal de advertencia → escribir la palabra
  `RESET`) + backup JSON automático antes de borrar + transacción con
  rollback ante cualquier error.

**Recomendación que sigue en pie:** no dejar `RESET_HABILITADO=true`
permanentemente en producción. Definirla solo el rato que se vaya a usar el
botón, y quitarla (o dejarla en `false`) el resto del tiempo — así un login
comprometido de un Administrador Principal no es, por sí solo, un botón para
borrar todo.

## 3. Alcance del restablecimiento

| Se CONSERVA | Se REINICIA (borra) |
|---|---|
| `institucion` (nombre, logo, colores, escala XP) | `estudiantes` |
| `misiones` (catálogo; lo re-siembra `initDb.js`) | `usuarios` docentes y admins **no** principales |
| `usuarios` con `rol='admin' AND es_principal=1` | `cursos`, `materias` |
| | `retos`, `materiales`, `retroalimentaciones` |
| | `progreso_estudiante`, `mision_estudiante` (XP, ranking, racha) |
| | `invitaciones_estudiante`, `docente_materia` |
| | `auditoria` |

Criterio: una **instalación nueva** (lo que crea `initDb.js`) no trae materias,
cursos ni usuarios salvo el Principal; sí trae institución por defecto y el
catálogo de misiones semilla. El reset reproduce ese estado.

> Decisión abierta a revisión: si la institución quiere conservar su catálogo
> de materias/cursos tras el reset, basta sacar `'materias'` y `'cursos'` de
> `TABLAS_A_VACIAR`. Documentado aquí para decidirlo con Fabrizio.

## 4. Salvaguardas (implementadas)

1. **Permiso exclusivo**: middleware `soloAdminPrincipal` (verifica el rol
   contra la BD, no contra el token).
2. **Salvaguarda de entorno**: el router sí está montado en `server.js`, pero
   exige `RESET_HABILITADO === 'true'` en el entorno; sin definirla (el
   default de `.env.example` es `false`), responde 403.
3. **Segunda confirmación textual**: el body debe traer `confirmacion: 'RESET'`
   exactamente. En la UI (`ModuloInstitucion.jsx`) esto es el segundo de dos
   pasos: modal de advertencia → campo de texto con la palabra `RESET`.
4. **Botón oculto para no-Principales**: la "Zona peligrosa" del módulo
   Institución solo se renderiza si `authService.esPrincipal()`.
5. **Backup previo obligatorio**: antes de borrar, se vuelca un JSON completo de
   las 14 tablas a `server/backups/reset-<timestamp>.json`. Si el backup falla,
   se aborta sin tocar datos. (Carpeta en `.gitignore`: nunca al repositorio.)
6. **Transacción**: todo el borrado va en una transacción con `DELETE`
   (no `TRUNCATE`, que auto-commitea) y `FOREIGN_KEY_CHECKS=0/1`; cualquier
   error hace `rollback`.
7. **Auditoría**: el propio reset queda registrado (`restablecio-aplicacion`)
   con el archivo de backup y el conteo por tabla.

## 5. Habilitación (código ya listo — falta solo el paso de entorno)

El router, el botón y las salvaguardas ya están en el repositorio. Lo único
que falta para que el botón funcione en un entorno dado es:

1. En el panel de Render (servicio del backend) → **Environment** → agregar
   `RESET_HABILITADO=true`.
2. Redeploy (Render lo hace solo al guardar la variable).
3. El botón "Restablecer aplicación" (módulo Institución, solo visible para
   el Administrador Principal) queda operativo.

Para desactivarlo de nuevo: borrar la variable o ponerla en `false` +
redeploy. El botón sigue en la UI, pero el servidor vuelve a responder 403.

> Nota de riesgo (sin resolver): esto se activó sin poder probarse contra una
> BD de pruebas por decisión explícita de Fabrizio. Si se quiere reducir el
> riesgo antes del primer uso real, la vía más segura es clonar la BD de
> Aiven a una instancia de prueba y correr el reset ahí primero.

## 6. Riesgos y notas

- `AUTO_INCREMENT` no se reinicia (sería DDL con commit implícito); no afecta la
  funcionalidad. Si se desea, hacerlo fuera de la transacción tras el commit.
- El backup vive en el disco efímero de Render (se pierde en cada deploy):
  para producción, descargar el JSON de respuesta o volcar a almacenamiento
  externo antes de confiar en él.
- Compatibilidad: las migraciones 002–009 deben estar aplicadas (columnas
  `es_principal`, tablas `misiones`/`mision_estudiante`, etc.).
