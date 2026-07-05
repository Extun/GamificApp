# RFC-002: Inventario Funcional Completo de GamificApp

**Fecha:** 2026-07-05
**Versión:** 1.0
**Estado:** Documento de análisis — sin cambios de código, rutas ni componentes
**Propósito:** Servir de base al Arquitecto para diseñar GamificApp v2, sin necesidad de leer el código fuente.

---

## 0. Panorama General del Sistema

GamificApp es una plataforma de gamificación educativa para niños de 6-9 años (educación básica elemental), con tres roles (Administrador, Docente, Estudiante), backend propio en Express + MySQL, IA generativa (Google Gemini) para crear contenido pedagógico, y tres mecánicas de juego: **Quiz** (opción múltiple), **Clasificador** (drag & drop) y **Misión Narrativa** (aventura RPG por capítulos).

**Stack técnico identificado:**
- Frontend: React 19 + React Router + MUI (Material UI)
- Backend: Node.js + Express + MySQL (mysql2) + JWT (jsonwebtoken) + bcryptjs
- IA: `@google/genai` (Gemini), proxy exclusivamente en backend
- Procesamiento de archivos: `pdfjs-dist` (PDF), `mammoth` (Word)
- Persistencia local complementaria: `localStorage` (caché de XP/logros/historial de borradores)

---

## 1. FUNCIONALIDADES POR ROL

### 1.1 Administrador

| # | Funcionalidad | Detalle |
|---|---------------|---------|
| 1 | Crear cuentas de docente | Usuario + contraseña (mín. 8 caracteres) + asignación de materias |
| 2 | Editar docente | Cambiar contraseña y/o reasignar materias (vía API; sin UI de edición visible, solo alta/baja) |
| 3 | Eliminar docente | Borra cuenta; sus invitaciones y asignaciones caen en cascada. Material y retos publicados permanecen |
| 4 | Listar docentes | Con sus materias asignadas |
| 5 | Listar todos los estudiantes | De toda la institución, con curso, XP y código de emergencia |
| 6 | Resetear PIN de cualquier estudiante | Vuelve a su fecha de nacimiento |
| 7 | Eliminar estudiante | Borra cuenta y ficha de progreso (irreversible) |
| 8 | Ver todas las invitaciones | Vista global de códigos emitidos por cualquier docente, con estado |
| 9 | Acceso heredado de docente | El admin puede hacer todo lo que un docente (materias "asignadas" = todas) |

### 1.2 Docente

| # | Funcionalidad | Detalle |
|---|---------------|---------|
| 1 | Ver sus materias asignadas | Solo las que el admin le asignó |
| 2 | Subir material de estudio | Público (visible a estudiantes) o privado (solo él) |
| 3 | Eliminar material | Solo de sus materias asignadas |
| 4 | Previsualizar material | PDF (miniatura + paginado), Word (texto extraído), Excel/PPT (metadatos + descarga) |
| 5 | Descargar material | Cualquier archivo subido |
| 6 | Generar Quiz con IA | Tema + cantidad (3/5/10 preguntas) → Gemini devuelve preguntas de opción múltiple con justificación |
| 7 | Editar Quiz manualmente | Editor tipo acordeón: añadir/eliminar preguntas, editar alternativas, marcar respuesta correcta |
| 8 | Añadir preguntas con IA a un quiz existente | Sin duplicar preguntas ya generadas (se envían como contexto "existentes") |
| 9 | Publicar Quiz | Lo vuelve visible para estudiantes (tabla `retos`, estado `publicado`) |
| 10 | Historial de quizzes por materia | Últimos 3 quizzes (borrador o publicado), persistido en `localStorage` |
| 11 | Crear Juego Clasificador | Editor no-code: título + 2+ categorías con nombre + elementos (texto/emoji) |
| 12 | Publicar Juego Clasificador | XP = elementos totales × 100 |
| 13 | Generar Misión Narrativa con IA | Tema matemático + temática de aventura (6 opciones predefinidas) → Gemini genera historia con 3-5 desafíos |
| 14 | Previsualizar Misión antes de publicar | Introducción, desafíos con alternativas marcadas, final |
| 15 | Publicar Misión Narrativa | XP = desafíos × 100 |
| 16 | Generar códigos de invitación | Para un curso, cantidad configurable (1-40), validez 7 días |
| 17 | Ver estudiantes registrados con sus códigos | Solo los que se registraron con SUS invitaciones |
| 18 | Ver sus códigos emitidos y su estado | pendiente / usado / expirado |
| 19 | Resetear PIN de sus estudiantes | Solo de estudiantes vinculados a sus propias invitaciones |
| 20 | Usar el Asistente IA | Chat libre con Gemini para generar ideas/contenido educativo |
| 21 | Ver ranking del aula (Top 3) | Widget en home |
| 22 | Ver widgets de rendimiento por materia | Top estudiantes, % de progreso, sugerencia de siguiente acción |
| 23 | ⚠️ Libro de Calificaciones | **Incompleto** — la sección existe pero no muestra datos (ver sección 9 y 10) |

### 1.3 Estudiante

| # | Funcionalidad | Detalle |
|---|---------------|---------|
| 1 | Registrarse con código de invitación | Nombre completo + fecha de nacimiento + código (6 caracteres) |
| 2 | Iniciar sesión | Nombre completo + PIN (6 caracteres alfanuméricos) |
| 3 | Recuperar acceso vía código de emergencia | Nombre + código de 8 caracteres (entregado al registrarse); resetea el PIN a la fecha de nacimiento |
| 4 | Cambiar su propio PIN | Requiere el PIN actual |
| 5 | Ver su XP y nivel | 1 nivel = 1000 XP |
| 6 | Ver material de estudio publicado | Solo material público (no privado del docente) |
| 7 | Previsualizar y descargar material | Igual que el docente (sin opción de eliminar) |
| 8 | Resolver Quizzes publicados | Opción múltiple A-D, feedback inmediato + justificación |
| 9 | Jugar Clasificador (drag & drop) | Arrastrar elementos a categorías; también soporta modo táctil (tocar y tocar destino) |
| 10 | Jugar Misión Narrativa | Aventura por capítulos con narrativa, pistas en caso de error, final |
| 11 | Ganar XP | 100 XP por acierto (al primer intento); reintentos no puntúan |
| 12 | Desbloquear logros | 5 tipos (ver sección 7) |
| 13 | Ver Top 3 del ranking (aula/institución) | Con su propia posición resaltada si aplica |
| 14 | Ver galería de logros | Bloqueados (con candado) vs. obtenidos |
| 15 | Ver "Misiones de hoy" | **Nota:** datos hardcodeados en el frontend, no provienen del backend (ver sección 10) |

---

## 2. FLUJO DE NAVEGACIÓN

### 2.1 Punto de entrada único

Toda sesión comienza en `/` (Login). No existe una landing pública ni rutas separadas por rol: el servidor decide qué dashboard renderizar según el `rol` firmado en el JWT.

```
/                → Login (selector Estudiante / Docente; el modo Emergencia es un sub-estado)
/registro        → Registro de estudiante con código de invitación
/dashboard       → Un solo componente que redirige internamente por rol (NO hay sub-rutas)
```

### 2.2 Cómo llega cada rol

| Rol | Cómo entra | Qué credenciales usa |
|-----|-----------|----------------------|
| Estudiante (nuevo) | `/registro` → completa formulario → credenciales generadas → botón "Ya los anoté" → `/dashboard` | Nombre + fecha nacimiento + código de invitación |
| Estudiante (recurrente) | `/` (modo Estudiante, por defecto) → `/dashboard` | Nombre completo + PIN de 6 caracteres |
| Estudiante (PIN olvidado) | `/` → "¿Olvidaste tu PIN?" → explica que el PIN es la fecha de nacimiento, o → modo Emergencia → `/dashboard` | Nombre + código de emergencia (8 car.) |
| Docente | `/` (botón "Docente") → `/dashboard` | Usuario + contraseña |
| Admin | `/` (botón "Docente", MISMO formulario) → `/dashboard` | Usuario + contraseña (el servidor decide que es admin) |

**Observación de flujo:** El login NO distingue Docente de Admin en la UI — ambos usan la pestaña "Docente". El rol real se determina server-side.

### 2.3 Pantallas visitadas por rol (dentro de `/dashboard`)

Todas las pantallas secundarias son **vistas condicionales dentro del mismo componente**, controladas por `useState`, NO por rutas de React Router. Esto significa que la URL nunca cambia dentro del dashboard.

**Docente/Admin — recorrido típico para publicar un quiz:**
```
Dashboard (Home) 
  → clic "Materias" (sidebar)
  → clic en una materia (grid de tarjetas)
  → panel de opciones ("Generar Quiz" / "Juego Clasificador" / "Misión Narrativa" / "Calificaciones")
  → clic "Generar Quiz"
  → llenar tema + cantidad → "Generar con IA"
  → revisar/editar en el acordeón
  → "Publicar quiz para estudiantes"
```

**Estudiante — recorrido típico para jugar un quiz:**
```
Dashboard (Inicio)
  → clic "Mis Materias" (sidebar)
  → clic en una materia
  → pestaña "Quizzes disponibles"
  → clic en un quiz de la lista
  → responder preguntas una a una
  → pantalla de puntaje final + XP otorgado + toast de progreso guardado
```

### 2.4 Acciones por pantalla (resumen)

| Pantalla | Acciones disponibles |
|----------|----------------------|
| Login | Cambiar modo (Estudiante/Docente), mostrar/ocultar contraseña, ver ayuda de PIN, ir a registro, ir a modo emergencia |
| Registro | Completar formulario, ver credenciales generadas, ir al dashboard |
| Admin > Docentes | Crear docente, ver lista, eliminar docente |
| Admin > Estudiantes | Ver lista, resetear PIN, eliminar estudiante |
| Admin > Invitaciones | Ver lista global (solo lectura) |
| Docente > Home | Ver stats (hardcoded), ver misiones (hardcoded), ver ranking real, ver perfil |
| Docente > Materias (grid) | Seleccionar materia |
| Docente > Materia detalle | Ver widgets de rendimiento, subir/eliminar/previsualizar material público y privado, cambiar sub-vista (Quiz/Clasificador/Misión/Calificaciones) |
| Docente > Mis Estudiantes | Generar invitaciones, ver estudiantes registrados, resetear PIN, ver códigos emitidos |
| Docente > Asistente IA | Escribir mensaje, enviar, ver respuesta |
| Estudiante > Inicio | Ver XP/nivel/logros (stats), ver misiones (hardcoded), ver ranking real, ver perfil |
| Estudiante > Materias (grid) | Seleccionar materia |
| Estudiante > Materia detalle | Cambiar pestaña (Material/Quizzes/Juegos/Misiones), consumir contenido |
| Estudiante > Logros | Ver galería (bloqueados/desbloqueados) |
| Estudiante (sidebar) | Cambiar PIN (prompt del navegador), cerrar sesión |

---

## 3. MENÚS

### 3.1 Menú Admin (sidebar)

| Nombre | Destino (estado interno) | Componente renderizado | Propósito |
|--------|---------------------------|--------------------------|-----------|
| Docentes | `pagina = 'docentes'` | Sección inline en `AdminDashboard.jsx` | Alta/baja de docentes y asignación de materias |
| Estudiantes | `pagina = 'estudiantes'` | Sección inline en `AdminDashboard.jsx` | Gestión global de estudiantes (reset PIN, baja) |
| Invitaciones | `pagina = 'invitaciones'` | Sección inline en `AdminDashboard.jsx` | Monitoreo de códigos de toda la institución |
| Cerrar sesión | — | `authService.logout()` + `navigate('/')` | Terminar sesión |

**No existe** una opción de menú "Inicio" para el admin — no hay pantalla de bienvenida.

### 3.2 Menú Docente (sidebar)

| Nombre | Destino (estado interno) | Componente renderizado | Propósito |
|--------|---------------------------|--------------------------|-----------|
| Home | `pagina = ""` | Sección inline (stats + misiones + ranking) | Panel de bienvenida |
| Materias | `pagina = "materias"` | Grid de materias → detalle con sub-vistas | Gestión de contenido por materia |
| Mis Estudiantes | `pagina = "estudiantes"` | Sección inline | Invitaciones + gestión de sus estudiantes |
| Asistente IA | `pagina = "asistente"` | `<AsistenteIA />` | Chat con IA para generar ideas |
| Cerrar sesión | — | `authService.logout()` + `navigate('/')` | Terminar sesión |

**Sub-menú dentro de una Materia** (`subVistaMateria`):

| Nombre | Valor | Componente | Propósito |
|--------|-------|-----------|-----------|
| Generar Quiz | `'quiz'` | `<GeneradorQuiz />` | Crear/editar/publicar quizzes con IA |
| Juego Clasificador | `'clasificador'` | `<EditorClasificador />` | Crear/publicar juego drag & drop |
| Misión Narrativa | `'mision'` | `<GeneradorMision />` | Crear/publicar aventura narrativa con IA |
| Libro de Calificaciones | `'calificaciones'` | Placeholder sin datos | **Incompleto** |

### 3.3 Menú Estudiante (sidebar)

| Nombre | Destino (estado interno) | Componente renderizado | Propósito |
|--------|---------------------------|--------------------------|-----------|
| Inicio | `pagina = ""` | Sección inline (stats + misiones + ranking) | Panel de bienvenida |
| Mis Materias | `pagina = "materias"` | Grid de materias → detalle con sub-vistas | Consumo de contenido educativo |
| Mis Logros | `pagina = "logros"` | Galería de `LogroCard` | Ver insignias |
| Cambiar mi PIN | — | `window.prompt` doble (actual + nuevo) | Seguridad de cuenta |
| Cerrar sesión | — | `authService.logout()` + `navigate('/')` | Terminar sesión |

**Sub-menú dentro de una Materia** (`subVista`):

| Nombre | Valor | Componente | Propósito |
|--------|-------|-----------|-----------|
| Material de estudio | `'material'` | Grid de `FileChip` | Consultar/descargar recursos |
| Quizzes disponibles | `'quizzes'` | Lista → `<QuizInteractivo />` | Responder cuestionarios |
| Juegos | `'juegos'` | Lista → `<JuegoDragAndDrop />` | Jugar clasificador |
| Misiones | `'misiones'` | Lista → `<MisionNarrativa />` | Jugar aventura narrativa |

---

## 4. COMPONENTES

### 4.1 Componentes de Página (contenedores con lógica de datos)

| Nombre | Responsabilidad | Quién lo utiliza | Dependencias clave |
|--------|------------------|-------------------|---------------------|
| `Login` | Autenticación (3 modos) | Ruta pública `/` | `authService` |
| `RegistroEstudiante` | Alta de estudiante con código | Ruta pública `/registro` | `authService` |
| `AdminDashboard` | Todo el panel de administración | Rol `admin` | `adminService` |
| `Dashboard` (docente) | Todo el panel de docente | Rol `docente`/`admin` | `docenteService`, `materialesService`, `retosService`, `gamificationService`, `pdfService` |
| `DashboardEstudiante` | Todo el panel de estudiante | Rol `estudiante` | `gamificationService`, `retosService`, `materialesService`, `authService` |
| `GeneradorQuiz` | Generar/editar/publicar quizzes con IA | Dentro de `Dashboard` (detalle de materia) | `retosService`, `EditorQuiz`, `authFetch` (llamada directa a `/api/ia/quiz`) |
| `GeneradorMision` | Generar/publicar misiones con IA | Dentro de `Dashboard` | `retosService`, `authFetch` (llamada directa a `/api/ia/mision`) |
| `AsistenteIA` | Chat libre con IA | Dentro de `Dashboard` | `RespuestaIA`, `authFetch` (llamada directa a `/api/ia/asistente`) |
| `RespuestaIA` | Mostrar la respuesta del asistente | Dentro de `AsistenteIA` | Ninguna (textarea de solo lectura) |

### 4.2 Componentes Reutilizables (presentación / mecánica de juego)

| Nombre | Responsabilidad | Quién lo utiliza | Dependencias clave |
|--------|------------------|-------------------|---------------------|
| `EditorClasificador` | Editor no-code de categorías + elementos | `Dashboard` (docente) | `retosService`, `gamificationService` (constante de puntos) |
| `EditorQuiz` | Editor tipo acordeón de preguntas de opción múltiple | `GeneradorQuiz` | Ninguna externa (controlado por props) |
| `QuizInteractivo` (+ `PreguntaCard`, `LogroToast`) | Reproductor de quiz para el estudiante; calcula aciertos y dispara recompensas | `DashboardEstudiante` | `gamificationService` |
| `JuegoDragAndDrop` | Reproductor del juego Clasificador (drag & drop + modo táctil) | `DashboardEstudiante` | `gamificationService`, `LogroToast` (de `QuizInteractivo`), `COLORES_CATEGORIA` (de `EditorClasificador`) |
| `MisionNarrativa` | Reproductor de la aventura por capítulos | `DashboardEstudiante` | `gamificationService`, `LogroToast` |
| `FileChip` | Tarjeta compacta de un archivo (icono + nombre + tamaño) | `Dashboard`, `DashboardEstudiante` | `kindMeta` (mismo archivo) |
| `FilePreviewModal` | Modal de previsualización (PDF paginado, Word con texto extraído, Excel/PPT con metadatos) | `Dashboard`, `DashboardEstudiante` | `officeService`, `pdfService` |
| `WidgetsRendimiento` | 3 tarjetas: top estudiantes, progreso circular, siguiente acción sugerida | `Dashboard` (docente, detalle de materia) | Ninguna externa (recibe todo por props) |
| `MaterialContenedor` | Contenedor de material con botón de subida inline | `Dashboard` (docente) | `FileChip` |
| `LogroCard` | Tarjeta de insignia (bloqueada/desbloqueada) | `DashboardEstudiante` (sección Logros) | `CATALOGO_LOGROS` (de `gamificationService`) |

### 4.3 Dependencias transversales (servicios consumidos por múltiples componentes)

| Servicio | Consumido por | Responsabilidad |
|----------|----------------|-------------------|
| `authService` | Todos los componentes de página + todos los demás servicios (vía `authFetch`) | Login, JWT, sesión, `authFetch` (fetch autenticado) |
| `gamificationService` | `QuizInteractivo`, `JuegoDragAndDrop`, `MisionNarrativa`, `DashboardEstudiante`, `Dashboard`, `EditorClasificador` | XP, niveles, logros, ranking, sincronización con backend |
| `retosService` | `GeneradorQuiz`, `GeneradorMision`, `EditorClasificador`, `DashboardEstudiante` | Publicar y obtener retos configurables |
| `materialesService` | `Dashboard`, `DashboardEstudiante` | CRUD de material de estudio |
| `pdfService` | `Dashboard` (al subir), `FilePreviewModal` (al previsualizar) | Procesamiento de PDF en el navegador (pdfjs-dist) |
| `officeService` | `FilePreviewModal` | Extracción de texto de `.docx` (mammoth) |
| `adminService` | `AdminDashboard` | CRUD de docentes/estudiantes/invitaciones (vista admin) |
| `docenteService` | `Dashboard` (docente) | Materias propias, invitaciones, estudiantes propios |

---

## 5. APIs UTILIZADAS

Todas las rutas (excepto `/api/health` y `/api/auth/*`) exigen JWT válido (`Authorization: Bearer <token>`), verificado por el middleware `autenticar` montado globalmente en `/api`.

### 5.1 Autenticación (`/api/auth`) — públicas, con rate limiting por IP (30 peticiones/5min)

| Endpoint | Método | Quién lo consume | Para qué sirve |
|----------|--------|--------------------|-----------------|
| `/api/auth/login` | POST | `authService.login`, `authService.loginEstudiante` | Login docente/admin (usuario+contraseña) o estudiante (nombre+PIN). Bloqueo de 15 min tras 5 fallos |
| `/api/auth/registro-estudiante` | POST | `authService.registrarEstudiante` | Alta con código de invitación; genera PIN inicial y código de emergencia |
| `/api/auth/emergencia` | POST | `authService.loginEmergencia` | Acceso con código de 8 caracteres; resetea el PIN a la fecha de nacimiento |
| `/api/auth/cambiar-pin` | PUT | `authService.cambiarPin` | Estudiante autenticado cambia su propio PIN |

### 5.2 Administración (`/api/admin`) — requiere rol `admin`

| Endpoint | Método | Quién lo consume | Para qué sirve |
|----------|--------|--------------------|-----------------|
| `/api/admin/docentes` | GET | `adminService.listarDocentes` | Lista de docentes con materias asignadas |
| `/api/admin/docentes` | POST | `adminService.crearDocente` | Crea docente + asigna materias |
| `/api/admin/docentes/:id` | PUT | `adminService.actualizarDocente` (no se usa desde la UI actual) | Cambia contraseña y/o materias |
| `/api/admin/docentes/:id` | DELETE | `adminService.eliminarDocente` | Elimina docente |
| `/api/admin/estudiantes` | GET | `adminService.listarEstudiantes` | Lista global de estudiantes |
| `/api/admin/estudiantes/:usuarioId/resetear-pin` | POST | `adminService.resetearPinEstudiante` | Resetea PIN a fecha de nacimiento |
| `/api/admin/estudiantes/:usuarioId` | DELETE | `adminService.eliminarEstudiante` | Elimina cuenta + ficha de progreso |
| `/api/admin/invitaciones` | GET | `adminService.listarInvitaciones` | Vista global de códigos de toda la institución |

### 5.3 Docente (`/api/docente`) — requiere rol `docente` o `admin`

| Endpoint | Método | Quién lo consume | Para qué sirve |
|----------|--------|--------------------|-----------------|
| `/api/docente/mis-materias` | GET | `docenteService.misMaterias` | Materias asignadas (admin ve todas) |
| `/api/docente/invitaciones` | POST | `docenteService.generarInvitaciones` | Genera 1-40 códigos de un curso, vigencia 7 días |
| `/api/docente/invitaciones` | GET | `docenteService.listarInvitaciones` | Sus propios códigos con estado actualizado |
| `/api/docente/mis-estudiantes` | GET | `docenteService.misEstudiantes` | Estudiantes registrados con SUS invitaciones |
| `/api/docente/estudiantes/:usuarioId/resetear-pin` | POST | `docenteService.resetearPinEstudiante` | Resetea PIN (solo de sus propios estudiantes, salvo admin) |

### 5.4 Materias y Material (`/api/materias`)

| Endpoint | Método | Quién lo consume | Para qué sirve |
|----------|--------|--------------------|-----------------|
| `/api/materias` | GET | (no se usa activamente en frontend; existe la constante local `materias.js`) | Lista de las 5 materias oficiales |
| `/api/materias/:id/material` | GET | `materialesService.obtenerMaterial` | Material de una materia (privado solo visible a docentes) |
| `/api/materias/:id/material` | POST | `materialesService.subirMaterial` | Sube archivo (requiere rol docente + materia asignada) |
| `/api/materias/:id/material/:materialId` | DELETE | `materialesService.eliminarMaterial` | Elimina archivo (requiere rol docente + materia asignada) |

### 5.5 Retos (`/api/retos`)

| Endpoint | Método | Quién lo consume | Para qué sirve |
|----------|--------|--------------------|-----------------|
| `/api/retos` | GET | `retosService.obtenerRetosPublicados` | Retos publicados, filtrables por `materia_id` y `tipo` |
| `/api/retos` | POST | `retosService.publicarReto` | Publica/republica un reto (upsert por materia+título); requiere rol docente + materia asignada |

### 5.6 Progreso (`/api/progreso`)

| Endpoint | Método | Quién lo consume | Para qué sirve |
|----------|--------|--------------------|-----------------|
| `/api/progreso/:estudiante_id` | GET | `gamificationService.obtenerProgreso` | Avance completo del estudiante (XP total + detalle por reto) |
| `/api/progreso` | POST | `gamificationService.guardarProgreso` | Registra resultado de un reto completado; transaccional, evita duplicar XP en reintentos |

### 5.7 Ranking (`/api/ranking`)

| Endpoint | Método | Quién lo consume | Para qué sirve |
|----------|--------|--------------------|-----------------|
| `/api/ranking?limite=N` | GET | `gamificationService.obtenerRanking` | Top N estudiantes por XP (usa `RANK() OVER`) |

### 5.8 Inteligencia Artificial (`/api/ia`) — requiere rol `docente` o `admin`

| Endpoint | Método | Quién lo consume | Para qué sirve |
|----------|--------|--------------------|-----------------|
| `/api/ia/quiz` | POST | `GeneradorQuiz` (fetch directo, no hay servicio dedicado) | Genera N preguntas de opción múltiple vía Gemini, en JSON estructurado |
| `/api/ia/mision` | POST | `GeneradorMision` (fetch directo) | Genera una misión narrativa completa (intro + desafíos + final) |
| `/api/ia/asistente` | POST | `AsistenteIA` (fetch directo) | Respuesta libre de texto para el chat del docente |

### 5.9 Salud (`/api/health`) — pública

| Endpoint | Método | Quién lo consume | Para qué sirve |
|----------|--------|--------------------|-----------------|
| `/api/health` | GET | Monitor externo (cada 14 min) | Evita el cold-start del plan gratuito de Render; no toca la BD |

---

## 6. BASE DE DATOS

Motor: MySQL (InnoDB, `utf8mb4_spanish_ci`). Esquema completo en `database/gamificapp.sql` (desarrollo) y `database/produccion_defaultdb.sql` (producción, Aiven).

### 6.1 Tablas y su propósito

| Tabla | Qué guarda | Módulo que la usa |
|-------|------------|---------------------|
| `materias` | 5 materias oficiales fijas (id + nombre) | Todos (referencia constante) |
| `usuarios` | Credenciales (bcrypt), rol, `nombre_completo`, `codigo_emergencia`, rate limiting (`intentos_fallidos`, `bloqueado_hasta`), FK a `estudiante_id` | Auth, Admin, Docente |
| `estudiantes` | Ficha del estudiante: nombres, apellidos, curso, `fecha_nacimiento` (origen del PIN), `xp_total` | Gamificación, Ranking, Progreso |
| `retos` | Contenido configurable: `materia_id`, `titulo`, `tipo` (slug libre: quiz/clasificador/mision/...), `configuracion_json`, `xp_recompensa`, `estado` (borrador/publicado/archivado) | Quiz, Clasificador, Misión |
| `progreso_estudiante` | Avance por (estudiante, reto): `porcentaje`, `xp_obtenido`, `completado` | Gamificación |
| `materiales` | Archivos de estudio: `nombre`, `kind`, `size_label`, `is_private`, `page_count`, `thumbnail`, `data_url` (base64) | Material de estudio |
| `docente_materia` | Relación N:N docente ↔ materias asignadas | Permisos de docente |
| `invitaciones_estudiante` | Códigos de un solo uso: `codigo`, `docente_id`, `curso`, `estado`, `usuario_id`, `expira_en` (7 días) | Registro de estudiantes |

### 6.2 Relaciones clave

```
usuarios.estudiante_id → estudiantes.id       (1 cuenta = 1 ficha, opcional)
docente_materia.docente_id → usuarios.id      (N:N docente-materia)
docente_materia.materia_id → materias.id
retos.materia_id → materias.id                (1 materia → N retos)
progreso_estudiante.estudiante_id → estudiantes.id
progreso_estudiante.reto_id → retos.id        (único por par estudiante+reto)
materiales.materia_id → materias.id
invitaciones_estudiante.docente_id → usuarios.id
invitaciones_estudiante.usuario_id → usuarios.id  (quién la consumió)
```

### 6.3 Particularidades de diseño

- **`configuracion_json` es polimórfico**: el mismo campo JSON almacena la estructura de un Quiz (`{ preguntas: [...] }`), un Clasificador (`{ categorias: [...] }`) o una Misión (`{ titulo, introduccion, desafios, final }`). No hay tablas separadas por tipo de juego.
- **`data_url` (LONGTEXT)**: los archivos se guardan como base64 directamente en la fila de MySQL — no hay almacenamiento de objetos (S3, etc.).
- **XP nunca se duplica**: `POST /api/progreso` usa `FOR UPDATE` + `ON DUPLICATE KEY UPDATE` con `GREATEST()`, de modo que reintentos de un mismo reto solo abonan la mejora (delta), nunca vuelven a sumar el total.
- **PIN recuperable sin BD**: el PIN por defecto se deriva matemáticamente de `fecha_nacimiento` (formato DDMMAA), así que un niño puede "recordarlo" sin ayuda externa.

---

## 7. SISTEMA DE GAMIFICACIÓN

### 7.1 Puntos de experiencia (XP)

- **Constante:** `PUNTOS_POR_ACIERTO = 100` XP por cada respuesta/elemento acertado **al primer intento**.
- **Regla general (las 3 mecánicas la comparten):** solo se otorga XP en el primer intento correcto; reintentos tras fallar no puntúan, pero el estudiante puede seguir jugando (nunca se bloquea la actividad — "siempre se termina ganando").
- **Techo por reto:** el backend nunca abona más XP que `reto.xp_recompensa` (protección server-side contra manipulación del cliente).
- **Persistencia dual:** `localStorage` como caché instantánea (funciona offline) + MySQL como fuente de verdad (`estudiantes.xp_total`), sincronizados en cada `completarReto()`.

### 7.2 Niveles

- **Fórmula:** `nivel = floor(xp_total / 1000) + 1` (cada nivel cuesta 1000 XP, fijo, sin curva de dificultad creciente).
- Se muestra como barra de progreso (`xpActual / 1000`) en el perfil del estudiante y del docente.

### 7.3 Logros (catálogo fijo de 5)

| ID | Título | Condición de desbloqueo |
|----|--------|--------------------------|
| `primer-quiz` | Primer Quiz | Completar el primer quiz (cualquier resultado) |
| `maestro-materia` | Maestro de la Materia | Obtener 100% de aciertos en cualquier mecánica (quiz, clasificador o misión) |
| `racha-7` | Racha de 7 días | **Definido en el catálogo pero SIN lógica de verificación implementada** (ver sección 10) |
| `estrella-aula` | Estrella del aula | **Definido en el catálogo pero SIN lógica de verificación implementada** (Top 3 semanal) |
| `explorador` | Explorador | **Definido en el catálogo pero SIN lógica de verificación implementada** (revisar material de 5 materias) |

**Mecanismo real de verificación (`verificarLogros`):** solo evalúa 2 condiciones genéricas — "primera actividad de este tipo completada" y "resultado perfecto (aciertos === total)". Los otros 3 logros del catálogo nunca se otorgan actualmente porque no existe código que verifique racha de días, posición en ranking semanal, ni conteo de materias exploradas.

### 7.4 Ranking

- **Fuente:** `SELECT ... RANK() OVER (ORDER BY xp_total DESC)` sobre la tabla `estudiantes` — es global de la institución, no filtrado por curso ni por materia.
- **Endpoint:** `GET /api/ranking?limite=N` (por defecto Top 10; usado como Top 3 en las UIs).
- Empates en XP reciben la misma posición (`RANK()`, no `ROW_NUMBER()`).

### 7.5 Retos (mecánicas de juego)

| Tipo (`retos.tipo`) | Mecánica | Recompensa XP | Validación al publicar |
|----------------------|----------|-----------------|---------------------------|
| `quiz` | Opción múltiple A-D, feedback + justificación | `preguntas.length × 100` | Ninguna validación de configuración específica (`VALIDADORES_CONFIG` no incluye `quiz`) |
| `clasificador` | Arrastrar elementos a categorías (drag & drop + modo táctil) | `elementos_totales × 100` | Mínimo 2 categorías, cada una con nombre y ≥1 elemento |
| `mision` | Aventura narrativa por capítulos (3-5 desafíos secuenciales, opción múltiple A-C) | `desafios.length × 100` | Requiere introducción, final, y cada desafío con narrativa/pregunta/alternativas A-B-C/correcta |

**Extensibilidad:** el sistema soporta añadir nuevos tipos de reto sin migrar la BD — `tipo` es un slug libre validado solo por regex (`/^[a-z0-9][a-z0-9-]{1,29}$/`). Un tipo nuevo sin validador registrado se acepta igualmente (queda sin reglas de integridad de configuración).

### 7.6 Progreso individual

- `GET /api/progreso/:estudiante_id` devuelve XP total + detalle de cada reto completado, agrupado por materia.
- Un estudiante solo puede consultar/registrar SU PROPIO progreso (verificado server-side comparando `req.user.estudiante_id`); docente y admin pueden consultar el de cualquiera.

### 7.7 Estadísticas mostradas en UI (⚠️ ver sección 10 sobre datos ficticios)

- Docente Home: "Tareas activas" (12), "Logros otorgados" (48), "Días de racha" (7) — **valores hardcodeados**, no vienen de una consulta real.
- Estudiante/Docente Home: "Misiones de hoy" — lista fija de 3 ítems con progreso hardcodeado, no relacionada con retos reales de la BD.

---

## 8. INTELIGENCIA ARTIFICIAL

### 8.1 Cómo funciona

- **Proveedor:** Google Gemini, vía SDK `@google/genai`.
- **Arquitectura:** proxy 100% server-side. La API key (`GEMINI_API_KEY`) vive solo en variables de entorno del backend; el frontend nunca la recibe (comentario explícito en el código señala que esto corrige una vulnerabilidad previa donde la key viajaba al navegador vía `VITE_GEMINI_API_KEY`).
- **Selección de modelo:** el backend descubre dinámicamente los modelos "flash" disponibles en la cuenta (`models.list()`), filtra los que soportan generación de texto (excluye imagen/audio/video/embeddings), y los ordena por preferencia (penaliza "lite" y "latest", prioriza "preview/exp").
- **Reintentos:** hasta 3 intentos por modelo con espera de 2s ante errores temporales (503/429 — saturación o cuota), probando el siguiente modelo candidato si el actual se agota.
- **Salida estructurada:** Quiz y Misión usan `responseSchema` (JSON Schema) para forzar que Gemini devuelva exactamente la forma esperada, evitando parseo frágil de texto libre.

### 8.2 Endpoints que utiliza

| Endpoint | Entrada | Salida | Reglas inyectadas en el prompt |
|----------|---------|--------|-----------------------------------|
| `POST /api/ia/quiz` | `materia`, `tema`, `cantidad` (1-10), `existentes[]` (preguntas ya usadas) | `{ preguntas: [{pregunta, alternativas:{A,B,C,D}, correcta, justificacion}] }` | Veracidad (no inventar datos), unicidad (no repetir preguntas ya listadas) |
| `POST /api/ia/mision` | `materia`, `tema`, `tematica`, `cantidad` (3-5) | `{ mision: {titulo, introduccion, desafios:[...], final} }` | Continuidad narrativa, integración del problema matemático en la historia, dificultad creciente, veracidad matemática, alternativas plausibles, pistas sin revelar la respuesta |
| `POST /api/ia/asistente` | `mensaje` (máx. 4000 caracteres) | `{ texto }` (respuesta libre) | Ninguna regla estructurada — prompt directo |

### 8.3 En qué pantallas aparece

| Pantalla | Uso de IA |
|----------|-----------|
| `GeneradorQuiz` (Docente > Materia > Generar Quiz) | Botón "Generar con IA" (crea el quiz) y "Añadir con IA" (agrega N preguntas a uno existente) |
| `GeneradorMision` (Docente > Materia > Misión Narrativa) | Botón "Generar Misión con IA" (única forma de crear una misión — no hay editor manual) |
| `AsistenteIA` (Docente > Asistente IA) | Chat de texto libre, sin contexto de conversación previa (cada mensaje es independiente) |

### 8.4 Qué puede hacer

- Generar preguntas de opción múltiple con justificación pedagógica, en español, para educación básica.
- Generar historias interactivas completas (introducción + desafíos + cierre) con matemáticas integradas a la narrativa.
- Responder preguntas libres de un docente (sin restricción de tema).

### 8.5 Limitaciones detectadas

- **Sin memoria de conversación:** el Asistente IA no mantiene contexto entre mensajes — cada envío es una llamada aislada a Gemini.
- **Sin caché de resultados:** cada generación de quiz/misión consume cuota de la API, incluso para temas repetidos.
- **Clasificador NO tiene generación por IA:** el editor de categorías/elementos es 100% manual (a diferencia de Quiz y Misión).
- **Cantidad de preguntas limitada:** máximo 10 preguntas por generación de quiz, máximo 5 desafíos por misión.
- **Dependencia de disponibilidad de Gemini:** si Google no tiene ningún modelo "flash" disponible en la cuenta, la función falla por completo (no hay fallback a otro proveedor).
- **Sin moderación de contenido explícita:** no se observa post-procesamiento que filtre contenido inapropiado más allá de las reglas del prompt.
- **Justificación de "Añadir con IA" enviada como lista plana:** el prompt de unicidad limita a 50 preguntas existentes enviadas como contexto (recorte silencioso si hay más).

---

## 9. MÓDULOS — ESTADO DE COMPLETITUD

| Módulo | Estado | Observación |
|--------|--------|-------------|
| Autenticación (Login/Registro/Emergencia/Cambio PIN) | ✅ Completo | Rate limiting, bcrypt, JWT, bloqueo temporal — todo funcional |
| Gestión de Docentes (Admin) | ✅ Completo | Alta, listado, baja. Edición (`PUT`) existe en backend pero sin UI que la invoque |
| Gestión de Estudiantes (Admin) | ✅ Completo | Listado, reset PIN, baja |
| Invitaciones (Docente/Admin) | ✅ Completo | Generación, listado, expiración automática |
| Material de Estudio (subir/ver/eliminar/descargar) | ✅ Completo | Incluye preview real de PDF y extracción de texto Word |
| Generador de Quiz con IA | ✅ Completo | Generación, edición, historial local, publicación |
| Editor de Clasificador | ✅ Completo | Sin asistencia de IA (100% manual, por diseño) |
| Generador de Misión Narrativa con IA | ✅ Completo | Sin editor manual (100% generado, sin opción de editar antes de publicar) |
| Reproductor de Quiz (estudiante) | ✅ Completo | Feedback, puntaje, persistencia de XP |
| Reproductor de Clasificador (estudiante) | ✅ Completo | Drag & drop + modo táctil, reinicio de partida |
| Reproductor de Misión Narrativa (estudiante) | ✅ Completo | Fases intro/jugando/final, pistas, reinicio |
| Sistema de XP y Niveles | ✅ Completo | Backend transaccional, caché local |
| Logros | 🟡 Parcial | Solo 2 de 5 logros del catálogo tienen lógica de desbloqueo real |
| Ranking | ✅ Completo | Global institucional, Top N configurable |
| Asistente IA (chat libre) | ✅ Completo (básico) | Sin memoria de conversación ni contexto |
| Dashboard Home — Docente | 🟡 Parcial | Stats y misiones son datos hardcodeados, no reales |
| Dashboard Home — Estudiante | 🟡 Parcial | "Misiones de hoy" hardcodeadas; XP/nivel/logros sí son reales |
| Dashboard Home — Admin | 🔴 No implementado | No existe pantalla de inicio; el admin entra directo a "Docentes" |
| Libro de Calificaciones (Docente) | 🔴 No implementado | Placeholder visual sin datos ni lógica |
| Edición de Docente (cambiar password/materias tras creación) | 🟡 Parcial | Endpoint backend existe (`PUT /api/admin/docentes/:id`); sin UI que lo use |
| Progreso detallado del estudiante (vista consolidada) | 🟡 Parcial | El endpoint `GET /api/progreso/:id` existe y trae detalle por reto, pero ninguna pantalla de la UI lo consume ni lo muestra completo |
| Ruta `GET /api/materias` (lista desde BD) | 🟡 Parcial | Existe y funciona, pero el frontend usa la constante local `src/constants/materias.js` en su lugar — nunca la consulta |

---

## 10. PROBLEMAS DETECTADOS

### 10.1 Funcionalidades duplicadas

- **Reset de PIN de estudiante** existe en dos superficies casi idénticas: `AdminDashboard.jsx` (todos los estudiantes) y `Dashboard.jsx` docente (solo los propios) — mismo backend distinto scope, misma UI replicada.
- **Listado de invitaciones** existe por partida doble: `Admin > Invitaciones` (global) y `Docente > Mis Estudiantes > Mis códigos emitidos` (propio) — misma tabla, misma información, renderizada dos veces con columnas ligeramente distintas.
- **Constante de materias duplicada como fuente de verdad:** existe `GET /api/materias` en el backend Y la constante estática `src/constants/materias.js` en el frontend, ambas con los mismos 5 registros — el frontend nunca llama al endpoint, confía únicamente en el archivo local (riesgo de desincronización si se agregan materias en BD).

### 10.2 Módulos incompletos

- **Libro de Calificaciones** (`Dashboard.jsx`, sub-vista `'calificaciones'`): renderiza únicamente un `<h3>` con el nombre de la materia, sin tabla, sin datos, sin lógica.
- **Home del Administrador:** no existe. El admin cae directo en la sección "Docentes" sin pantalla de bienvenida ni resumen.
- **3 de 5 logros del catálogo (`racha-7`, `estrella-aula`, `explorador`) nunca se otorgan:** están declarados en `CATALOGO_LOGROS` pero `verificarLogros()` no contiene ninguna rama de código que evalúe racha de días consecutivos, posición semanal en ranking, ni conteo de materias exploradas.
- **`PUT /api/admin/docentes/:id`** (cambiar contraseña/materias de un docente ya creado) existe en el backend y en `adminService.js`, pero ninguna pantalla del frontend lo invoca — solo se puede crear o eliminar, no editar.
- **`GET /api/progreso/:estudiante_id`** (progreso detallado por reto) existe en el backend y en `gamificationService.obtenerProgreso`, se llama al cargar el dashboard del estudiante, pero el resultado (`data.progreso`, el detalle por reto) nunca se renderiza en ninguna pantalla — solo se usa para refrescar el XP total en caché.

### 10.3 Datos ficticios / hardcodeados presentados como reales

- **Stats del Home del Docente** (`Dashboard.jsx`): "12 tareas activas", "48 logros otorgados", "7 días de racha" son literales fijos en el JSX, no provienen de ninguna consulta.
- **"Misiones de hoy"** (tanto en Home de Docente como de Estudiante): array `misiones` hardcodeado con títulos y porcentajes de progreso fijos ("Revisar entregas de Matemáticas 80%", etc.) — no están vinculadas a la tabla `retos` ni a `progreso_estudiante`.
- **Nivel/XP del perfil del Docente** en su tarjeta de Home ("Nivel 5", "650/1000 XP"): valores fijos, sin sistema de gamificación real para docentes (el sistema de XP/niveles solo aplica a estudiantes en el backend).

### 10.4 Pantallas con uso limitado o de difícil descubrimiento

- **Cambiar PIN** (estudiante): implementado con `window.prompt()` nativo del navegador (dos prompts secuenciales) en vez de un formulario propio — inconsistente con el resto de la UI, y poco descubrible al estar debajo del botón de logout.
- **Modo Emergencia** (login): solo accesible tras abrir "¿Olvidaste tu PIN?" y luego un enlace secundario dentro de ese texto — dos clics ocultos para una función crítica de recuperación de cuenta.

### 10.5 Código muerto / sin invocar desde la UI

- `adminService.actualizarDocente` — función exportada, sin ningún componente que la llame.
- `GET /api/materias` — endpoint activo y correcto, sin ningún consumidor real (frontend usa la constante estática).

### 10.6 TODOs y FIXMEs encontrados en el código

Búsqueda literal de `TODO`, `FIXME`, `XXX`, `HACK` en `src/` y `server/`: **no se encontraron marcadores explícitos de este tipo en comentarios**. Las incompletitudes (Libro de Calificaciones, logros sin lógica, home de admin ausente) no están señalizadas con comentarios `TODO` — se identifican solo por ausencia de implementación funcional, lo que dificulta que un nuevo desarrollador las detecte sin auditoría.

### 10.7 Inconsistencias de validación

- **`retos.tipo = 'quiz'`** no tiene validador de configuración registrado en `VALIDADORES_CONFIG` (solo `clasificador` y `mision` lo tienen) — un quiz publicado con `configuracion` vacía o corrupta no es rechazado por el backend, a diferencia de los otros dos tipos.
- **Límite de 50 "preguntas existentes"** enviado a la IA en `POST /api/ia/quiz` (para evitar duplicados): si un quiz supera las 50 preguntas en su historial de generación, las más antiguas se descartan silenciosamente del contexto anti-duplicado, sin aviso al docente.

---

## 11. Notas de Cierre

Este inventario documenta el estado funcional real de GamificApp al 2026-07-05, basado exclusivamente en lectura de código fuente (frontend `src/`, backend `server/`, esquema `database/*.sql`). No se realizó ningún cambio de código, rutas ni componentes. Toda referencia a "incompleto", "hardcodeado" o "no implementado" es una observación objetiva del comportamiento actual, sin juicio sobre si esa fue una decisión intencional de alcance del MVP.
