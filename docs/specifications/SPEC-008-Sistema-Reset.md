# SPEC-008 — Sistema RESET ("Restablecer aplicación")

> Estado: **Redactada + infraestructura implementada e INACTIVA.** Pendiente de
> aprobación y de verificación end-to-end contra una BD de pruebas antes de
> habilitarse. NO usar en producción hasta entonces.
> Autor: auditoría integral pre-tesis (2026-07-10).

## 1. Objetivo

Dar al **Administrador Principal** una acción para dejar la aplicación
exactamente como una instalación nueva, conservando únicamente la
configuración inicial y su propia cuenta. Pensado para el traspaso del sistema
a la institución después de la sustentación (limpiar los datos de prueba).

## 2. Por qué está INACTIVO

Es la operación más destructiva del sistema (borra casi toda la BD). No hay
MySQL local en el entorno de desarrollo, así que **no se pudo probar
end-to-end**. Activarla sin verificación contra una BD de pruebas es un riesgo
inaceptable justo antes de la defensa. Por eso se entrega:

- El código completo (`server/routes/adminReset.js`), **no montado** en
  `server.js` y protegido además por la variable `RESET_HABILITADO`.
- Esta especificación.
- Sin botón en la UI.

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
2. **Doble salvaguarda de activación**: el router no se monta en `server.js`
   **y** exige `RESET_HABILITADO === 'true'`. Dos decisiones separadas.
3. **Segunda confirmación textual**: el body debe traer `confirmacion: 'RESET'`
   exactamente (la primera confirmación es el modal de la UI, aún por construir).
4. **Backup previo obligatorio**: antes de borrar, se vuelca un JSON completo de
   las 14 tablas a `server/backups/reset-<timestamp>.json`. Si el backup falla,
   se aborta sin tocar datos.
5. **Transacción**: todo el borrado va en una transacción con `DELETE`
   (no `TRUNCATE`, que auto-commitea) y `FOREIGN_KEY_CHECKS=0/1`; cualquier
   error hace `rollback`.
6. **Auditoría**: el propio reset queda registrado (`restablecio-aplicacion`)
   con el archivo de backup y el conteo por tabla.

## 5. Habilitación (pasos, post-tesis)

1. Aprobar esta spec.
2. Sobre una **BD de pruebas** (nunca producción), montar el router en
   `server.js`:
   ```js
   import adminResetRouter from './routes/adminReset.js';
   // antes de adminRouter:
   app.use('/api/admin/reset', adminResetRouter);
   ```
3. Definir `RESET_HABILITADO=true` en el entorno de pruebas.
4. Construir la UI: en el módulo Institución (solo Principal), botón
   "Restablecer aplicación" → modal con advertencia + campo para escribir
   `RESET` → `POST /api/admin/reset { confirmacion: 'RESET' }` → refrescar.
5. Probar: backup generado, borrado correcto, Principal e institución intactos,
   `initDb.js` re-siembra misiones al reiniciar, rollback ante error simulado.
6. Solo tras validar, considerar habilitarlo en producción (con backup de Aiven
   independiente por fuera de la app).

## 6. Riesgos y notas

- `AUTO_INCREMENT` no se reinicia (sería DDL con commit implícito); no afecta la
  funcionalidad. Si se desea, hacerlo fuera de la transacción tras el commit.
- El backup vive en el disco efímero de Render (se pierde en cada deploy):
  para producción, descargar el JSON de respuesta o volcar a almacenamiento
  externo antes de confiar en él.
- Compatibilidad: las migraciones 002–009 deben estar aplicadas (columnas
  `es_principal`, tablas `misiones`/`mision_estudiante`, etc.).
