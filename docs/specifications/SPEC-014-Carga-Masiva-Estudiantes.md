# SPEC-014 — Carga masiva de estudiantes por Excel + activación por código individual

> Estado: **Aprobada, pendiente de implementación** (2026-07-18).
> Autor: requerimiento nº 3 del revisor de tesis; diseño acordado con Fabrizio.
> Toca áreas restringidas (§10 de CLAUDE.md): añade rutas públicas a `auth.js`
> y modifica la consulta de localización del login de estudiante. Todo lo demás
> del login (verificación bcrypt, emisión de token, mensajes) queda igual.

## 1. Requerimiento del revisor

- Importar estudiantes desde un archivo Excel (.xlsx).
- Al importar, el sistema genera automáticamente un **código único** por estudiante.
- Durante el registro, el estudiante solo **selecciona su nombre de una lista**
  y **escribe el código asignado** para completar su acceso.

## 2. Decisiones congeladas (acordadas con Fabrizio — no rediscutir)

1. Carga masiva mediante **.xlsx** (parseo en el navegador con SheetJS; el
   backend revalida todo).
2. **`fecha_nacimiento` obligatoria** en la plantilla (es el origen del PIN y
   de toda la recuperación existente).
3. **Curso/paralelo se seleccionan en la interfaz**, nunca dentro del Excel.
4. **Vista previa y validación ANTES de importar** (endpoint de análisis que no
   escribe nada).
5. **Importación transaccional**: todo o nada (`beginTransaction` + rollback).
6. El código generado es un **código individual de ACTIVACIÓN de un solo uso**
   (opción B). Tras activar, el estudiante usa el mecanismo normal de GamificApp
   (nombre + PIN; PIN inicial = fecha de nacimiento DDMMAA).
7. Los códigos se almacenan **solo como hash bcrypt**; el valor en claro se
   muestra **una única vez** (resumen de importación / Excel de credenciales).
8. **Regenerar** un código es sencillo (acción en el panel) e **invalida
   inmediatamente** el anterior.
9. Activación del estudiante: **Curso → Nombre → Código**.
10. Validación estricta en backend: el código debe pertenecer **exactamente** al
    estudiante seleccionado (`bcrypt.compare` contra el hash de ESA fila).
11. La lista pública de pendientes expone **solo id + nombre** de estudiantes
    **no activados** del curso pedido. Nada más.
12. La importación se integra en la **gestión de estudiantes existente**
    (admin y docente); no es un módulo aparte.
13. El registro actual **por invitación se conserva** como vía alternativa.
14. **Ningún username técnico ni sufijo interno se muestra jamás al
    estudiante** (resolución de homónimos: "nombre localiza, PIN decide", §6).

## 3. Contexto actual (verificado en código)

- Dos tablas por estudiante: `estudiantes` (ficha: nombres, apellidos, curso,
  `curso_id`, `fecha_nacimiento`, `xp_total`) y `usuarios` (credencial:
  `username` UNIQUE = nombre normalizado, `pin_hash`, `codigo_emergencia`,
  `estudiante_id`).
- Login estudiante: `POST /api/auth/login` con `nombre + pin`; busca
  `WHERE username = normalizarNombre(nombre)` (0 o 1 fila) y compara bcrypt.
  Rate limiting por cuenta: 5 fallos → 15 min (`intentos_fallidos`,
  `bloqueado_hasta`).
- El PIN **es personalizable** (`PUT /api/auth/cambiar-pin`).
- Recuperación: `POST /api/auth/emergencia` (nombre + código de emergencia
  único global, resetea PIN a nacimiento) y reseteo de PIN por docente/admin
  (`resetearPinADefault`).
- Ya existe `generarCodigo(n)` (alfabeto de 31 caracteres sin confundibles,
  `crypto.randomBytes`) y un limitador por IP en memoria sobre `/api/auth`
  (`server/server.js`, 30 peticiones/5 min, instancia única en Render).
- El vínculo docente↔estudiante actual es indirecto (vía
  `invitaciones_estudiante.usuario_id`); existe `docente_curso` (SPEC-009).
- No hay identificación institucional (cédula) en el modelo. No hay librería
  Excel en el proyecto.

## 4. Cambios de base de datos — migración `012` (+ reversa, vía initDb.js)

```sql
-- Código de activación individual (hash; nunca en claro).
ALTER TABLE usuarios
    ADD COLUMN codigo_acceso_hash    VARCHAR(100) NULL,
    ADD COLUMN codigo_acceso_pista   VARCHAR(3)   NULL,  -- 3 primeros chars, solo cotejo visual
    ADD COLUMN codigo_acceso_usado_en DATETIME    NULL;

-- Localización de homónimos en el login (§6). username queda UNIQUE e intacto.
ALTER TABLE usuarios
    ADD COLUMN nombre_norm VARCHAR(120) NULL,
    ADD INDEX idx_usuarios_nombre_norm (nombre_norm);
-- Backfill: UPDATE usuarios SET nombre_norm = username WHERE rol = 'estudiante';

-- Trazabilidad del alta masiva (quién importó) sin depender de invitaciones.
ALTER TABLE estudiantes ADD COLUMN registrado_por INT UNSIGNED NULL;

-- Unicidad dentro del curso: permite homónimos en cursos distintos y los
-- bloquea dentro del mismo curso.
CREATE UNIQUE INDEX uq_est_curso_nombre ON estudiantes (curso_id, nombres, apellidos);
```

Notas:
- NO se crea tabla de historial de importaciones: la auditoría existente
  registra quién/qué/cuándo con `detalle` JSON.
- Ojo con `utf8mb4_spanish_ci`: "José" y "Jose" colisionan en el índice único.
  Es el comportamiento deseado para detectar duplicados.
- Estados derivados (sin columna nueva): **pendiente** = `codigo_acceso_hash
  IS NOT NULL AND codigo_acceso_usado_en IS NULL`; **activado** = lo demás.

## 5. Homónimos — "nombre localiza, PIN decide"

Problema: `usuarios.username` es UNIQUE global; dos "Ana Pérez" eran imposibles.
Prohibido resolverlo con sufijos visibles ("Ana Pérez 3B").

Diseño:
- `username` sigue UNIQUE. Para homónimos el sistema genera internamente
  `ana pérez lópez~2` — **invisible**: nunca se teclea ni aparece en UI.
- `nombre_norm` guarda el nombre normalizado limpio, igual para todos los
  homónimos, con índice no único.
- **Login estudiante (único cambio en la consulta de `auth.js`):**
  - Antes: `WHERE username = ?` → 0..1 fila.
  - Ahora: `WHERE nombre_norm = ? AND rol='estudiante'` → 0..n filas (n≈2–3).
  - Se prueba `bcrypt.compare(pin, fila.pin_hash)` contra cada candidata no
    eliminada; la que coincide, entra. Verificación, token, mensajes y
    auditoría: sin cambios.
  - Seguridad equivalente: adivinar el PIN de una homónima cuesta lo mismo que
    hoy adivinar el de la única portadora del nombre. Mensajes de error
    idénticos; no se revela cuántas homónimas hay.
- **Activación** (Curso → Nombre → Código): los homónimos nunca son ambiguos
  aquí — se selecciona un `estudiante_id` concreto.
- `POST /api/auth/emergencia` no cambia: el código de emergencia es único
  global y desambigua solo.

### Cierre de la ambigüedad de PIN (verificado: el PIN es personalizable)

1. **PIN inicial**: la importación rechaza filas con mismo `nombre_norm` +
   misma `fecha_nacimiento` que un estudiante existente o que otra fila del
   archivo (§8). Homónimos nacen siempre con PINs distintos.
2. **PIN personalizado**: en `PUT /api/auth/cambiar-pin`, si el estudiante
   tiene homónimos (mismo `nombre_norm`), comparar el PIN nuevo contra el
   `pin_hash` de cada homónimo; si coincide, rechazar con mensaje neutro:
   *"Ese PIN no está disponible, elige otro."* (1–2 bcrypt extra; no revela el
   motivo).
3. **PIN reseteado** (emergencia / docente / admin): vuelve a la fecha de
   nacimiento, distinta por (1).

Los tres caminos quedan cerrados: el login nunca puede autenticar
ambiguamente a dos cuentas.

### Rate limiting sin bloqueos cruzados

- **1 candidata** (caso normal): comportamiento actual intacto — contador en
  BD sobre esa cuenta (5 fallos → 15 min).
- **Varias candidatas**: los fallos NO tocan `intentos_fallidos` de ninguna
  cuenta. Limitador **en memoria por `nombre_norm`** (5 fallos → 15 min sobre
  ese nombre), mismo patrón que el limitador IP existente de `server.js`
  (instancia única; poda periódica; el éxito limpia la entrada). Ninguna
  homónima hereda fallos de otra ni queda marcada en BD. El código de
  emergencia sigue disponible como vía de escape (no pasa por este limitador).

## 6. Flujo de importación (admin y docente)

```
Gestión de estudiantes → [Importar desde Excel]
 1. Seleccionar CURSO del catálogo (admin: todos los activos;
    docente: solo los suyos vía docente_curso — igual que invitaciones).
 2. [Descargar plantilla .xlsx] (generada en el navegador; incluye el curso en
    la cabecera y una fila de ejemplo).
 3. Subir el .xlsx → SheetJS lo parsea en el navegador → JSON al backend.
 4. POST /api/estudiantes/importar/analizar  → NO escribe nada.
 5. Vista previa: "Encontrados 30 · Válidos 27 · Con errores 3" + tabla
    Fila | Nombre | Problema.
 6. [Confirmar importación] → solo las filas válidas.
 7. POST /api/estudiantes/importar/confirmar → UNA transacción; cualquier
    fallo hace rollback total. Por cada fila crea:
    - ficha en `estudiantes` (nombres, apellidos como columnas separadas del
      Excel — sin la heurística de partir el nombre; curso, curso_id,
      fecha_nacimiento, registrado_por),
    - cuenta en `usuarios` (username desambiguado si hace falta, nombre_norm,
      pin_hash = bcrypt(DDMMAA), codigo_emergencia = generarCodigo(8),
      codigo_acceso_hash = bcrypt(generarCodigo(6)), codigo_acceso_pista).
 8. Resumen final + [Descargar credenciales .xlsx]:
    nombre | curso | código de activación | PIN inicial | código de emergencia.
    ÚNICA oportunidad de ver los códigos de activación en claro.
 9. Auditoría: acción `importo-estudiantes` con detalle {curso, total,
    creados, omitidos} (sin códigos en claro).
```

Límites: máx. **60 filas** por importación; archivo con columnas
irreconocibles → rechazo completo con mensaje claro (nunca importación
parcial silenciosa).

## 7. Plantilla .xlsx

| nombres   | apellidos    | fecha_nacimiento |
|-----------|--------------|------------------|
| Ana María | Pérez López  | 2017-03-15       |

- Solo 3 columnas; el curso ya se eligió en la interfaz.
- El parser acepta `AAAA-MM-DD`, `DD/MM/AAAA` y fechas nativas de Excel
  (serial). Las celdas de la plantilla se generan como texto.

## 8. Validaciones por fila (análisis y reconfirmadas en confirmar)

| Caso | Resultado |
|------|-----------|
| Nombres/apellidos vacíos o < 2 caracteres | error |
| Caracteres no válidos (números/símbolos en nombres) | error |
| Fecha inválida o edad fuera de 4–15 años | error |
| Duplicado dentro del archivo (mismo nombre normalizado) en el mismo curso | error en la 2ª ocurrencia |
| Ya existe en ese curso (`uq_est_curso_nombre`) | **omitido** con aviso "ya registrado" (no es error) |
| Mismo `nombre_norm` + misma `fecha_nacimiento` que otro estudiante (BD o archivo) | error: "Hay otro estudiante con el mismo nombre y fecha de nacimiento. Agrega el segundo nombre o apellido para diferenciarlos." |
| Homónimo en OTRO curso con fecha distinta | se importa; username interno desambiguado (invisible) |

## 9. Flujo del estudiante (activación)

```
/registro → pestaña/opción "Ya estoy en la lista de mi clase"
 1. Selecciona su CURSO (desplegable del catálogo público; no expone alumnos).
 2. GET /api/auth/curso/:cursoId/estudiantes-pendientes
    → [{ estudiante_id, nombre }] SOLO de no activados de ese curso.
 3. Busca/selecciona su nombre.
 4. Escribe su código de 6 caracteres.
 5. POST /api/auth/activar { estudiante_id, codigo }:
    - localiza la cuenta POR estudiante_id (no por código);
    - bcrypt.compare(codigo, codigo_acceso_hash) de ESA fila;
    - si coincide: marca codigo_acceso_usado_en = NOW(), pone
      codigo_acceso_hash = NULL (un solo uso), emite token y devuelve
      pantalla "Anota tu PIN (tu fecha de nacimiento) y tu código de
      emergencia" — misma pauta que el registro por invitación;
    - si no: error único "Ese código no es correcto" (sin revelar estado).
 6. Desde el día siguiente: login normal nombre + PIN.
```

Protecciones del endpoint público:
- Rate limiting: el limitador IP global existente + contador de fallos por
  cuenta (`intentos_fallidos`/`bloqueado_hasta` de la cuenta seleccionada:
  aquí SÍ hay una cuenta concreta, así que se reutiliza el mecanismo actual).
- Es imposible entrar con el código de otro: María seleccionando a Juan y
  escribiendo su propio código falla porque se compara contra el hash de Juan.
- La lista de pendientes jamás incluye XP, fechas, pista del código ni
  estudiantes ya activados o eliminados.

## 10. Regeneración y pérdida de códigos

- `POST /api/estudiantes/:usuarioId/regenerar-codigo` (admin con permiso
  `estudiantes`; docente solo sobre estudiantes de sus cursos):
  genera código nuevo → sobreescribe `codigo_acceso_hash` y
  `codigo_acceso_pista`, limpia `codigo_acceso_usado_en` → devuelve el código
  en claro UNA vez. El anterior queda invalidado en el acto. Auditado (sin el
  código en claro).
- Regenerar el código de un estudiante YA activado lo devuelve al estado
  "pendiente" **sin tocar su PIN, XP ni progreso** (caso: niño que nunca
  anotó su PIN; el docente le regenera y reactiva).
- Nadie puede "ver" un código existente; solo cotejar la pista de 3
  caracteres o regenerar.

## 11. Pantallas

| Pantalla | Cambio |
|----------|--------|
| `AdminDashboard.jsx` — sección Estudiantes | Botón `[Importar desde Excel]`; columna Estado (pendiente/activado, con pista del código); acción "Regenerar código". |
| Panel docente — estudiantes/invitaciones | Mismo modal de importación, limitado a `docente_curso`. Su lista de estudiantes incluye pendientes de activación. |
| `RegistroEstudiante.jsx` | Segunda vía "Ya estoy en la lista de mi clase" (curso → nombre → código). La vía por invitación se conserva. |
| **Nuevo**: `src/components/ImportarEstudiantes.jsx` | Único componente nuevo (asistente: curso → plantilla/subida → vista previa → resumen). Reutiliza `SectionCard`, `EmptyState`. |

## 12. Endpoints

Nuevos:
- `POST /api/estudiantes/importar/analizar` — `conPermiso('estudiantes')` o
  docente con el curso asignado. No escribe.
- `POST /api/estudiantes/importar/confirmar` — mismos permisos; transaccional.
- `POST /api/estudiantes/:usuarioId/regenerar-codigo` — mismos permisos.
- `GET  /api/auth/curso/:cursoId/estudiantes-pendientes` — público, mínimo.
- `POST /api/auth/activar` — público, con las protecciones de §9.

Modificados (mínimo):
- `POST /api/auth/login` (modo estudiante): localización por `nombre_norm`
  con candidatas (§5). — ÁREA §10, cambio acotado a la consulta.
- `PUT /api/auth/cambiar-pin`: chequeo anti-colisión entre homónimos (§5).
- `POST /api/auth/registro-estudiante`: además de `username`, rellena
  `nombre_norm` (una línea).
- `GET /api/docente/mis-estudiantes`: pasa a filtrar por `docente_curso`
  (el docente ve los estudiantes de SUS cursos, registrados por invitación o
  importación). Sustituye el JOIN indirecto por invitaciones.

Reutilizados sin cambios: `GET /api/cursos`, `GET /api/admin/estudiantes`
(+ campos de estado), `resetearPinADefault`, `registrarAuditoria`,
`generarCodigo`, papelera, limitador IP.

Dependencia nueva: **`xlsx` (SheetJS) solo en frontend** (leer el archivo y
generar plantilla/credenciales). No es librería de estilos.

## 13. Riesgos y casos límite

- Docente pierde el Excel de credenciales → regenerar individual (o repetir
  por estudiante; no hay regeneración masiva en v1 — anotar en backlog si se
  pide).
- Importar dos veces el mismo archivo → omitidos con aviso, no error.
- Fallo a mitad → rollback total; reintentar es seguro.
- Curso con pendientes de activación → bloquear su borrado/desactivación con
  mensaje claro (si no, quedarían inaccesibles por el flujo de curso).
- Estudiante que nunca activa → figura "pendiente" en los paneles; no consume
  nada.
- Redeploy de Render → el limitador en memoria por nombre se reinicia
  (aceptable; igual que el limitador IP actual).
- Sin MySQL local: la verificación end-to-end real (migración 012, importar
  un curso, activar, caso "María usa el código de Juan", homónimos) se hace
  **en producción tras el deploy** y se reporta como tal.

## 14. Fases de implementación (cada una compila y deja la app funcional)

1. **F1 — BD**: migración `012` + reversa; `initDb.js`.
2. **F2 — Backend importación**: `server/lib/importacionEstudiantes.js`
   (validador puro, testeable sin BD) + `server/routes/estudiantesImport.js`.
3. **F3 — UI importación**: `ImportarEstudiantes.jsx`, plantilla y export de
   credenciales; integración en ambos paneles.
4. **F4 — Activación**: endpoints públicos + protecciones + nueva vía en
   `RegistroEstudiante.jsx`.
5. **F5 — Homónimos**: `nombre_norm` en login/registro/cambiar-pin +
   limitador por nombre.
6. **F6 — Estado y regeneración** en paneles admin/docente +
   `mis-estudiantes` por `docente_curso`.
7. **F7 — Verificación en producción** (Aiven/Render) + actualizar
   `CURRENT_STATE.md`.

Verificación por fase: `npm run build` + `node --check` en los archivos de
servidor tocados + prueba en navegador (incluido móvil) de lo visible.
