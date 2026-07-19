# SPEC-017 — Arquitectura extensible y gestión de tipos de juego

**Estado:** 🟡 **Implementada — pendiente de validación funcional en producción.** Fases 1, 2, 3, 3b, 4, 5, 6 y 7 en código (2026-07-19), incluido el séptimo juego Verdadero o Falso como prueba de extensibilidad. **NO cerrar** hasta validar en el entorno desplegado.
**Fecha:** 2026-07-19
**Origen:** Observación del revisor de tesis — *"Permitir que el administrador pueda agregar e implementar nuevos juegos de gamificación sin afectar los ya existentes."*
**Alcance:** Registro central de tipos de juego (backend + frontend), migración aditiva, módulo nuevo en el panel de administración, documento "Cómo añadir un nuevo tipo de juego". **No toca** XP, calificación, misiones ni ranking (§10).
**Ajustes aprobados por Fabrizio (2026-07-19):** implementación **incremental**, sin refactor masivo de los seis editores/reproductores recién estabilizados; el registro se introduce conservando compatibilidad y migrando los puntos dispersos de forma gradual; la documentación es entregable; el séptimo juego queda contemplado como prueba final, no como parte obligatoria.

---

## 1. Estado actual (auditado sobre el código real)

Ya existen **dos registros parciales y desincronizados**, uno por lado:

- **Backend:** `ACTIVIDADES_IA` (`actividadesIA.js:230`), `VALIDADORES_CONFIG` (`validadoresRetos.js:132`), `DERIVADORES` (`totalEsperado.js:21`), `VALIDADORES_ITEM` (`bancoPreguntas.js:29`).
- **Frontend:** `TIPOS_ACTIVIDAD` y `JUEGOS_UI` (`registroJuegos.jsx`).
- **BD:** `retos.tipo` es `VARCHAR(30)`, **no un ENUM** (`gamificapp.sql:108`). El esquema ya es extensible sin migrar. Decisión previa acertada que esta spec preserva.

### 1.1 Inventario completo de acoplamiento a `tipo`

| # | Punto | Ubicación | Forma |
|---|---|---|---|
| 1 | Registro IA | `server/lib/actividadesIA.js:230` | mapa ✅ |
| 2 | Validadores de configuración | `server/lib/validadoresRetos.js:132` | mapa ✅ |
| 3 | `totalEsperado` (seguridad de XP) | `server/lib/totalEsperado.js:21` | mapa ✅ |
| 4 | Validadores de ítem del banco | `server/routes/bancoPreguntas.js:29` | mapa ✅ |
| 5 | Resumen de ítem del banco | `server/routes/bancoPreguntas.js:78` | mapa ✅ |
| 6 | Etiquetas y emoji | `src/components/juegos/registroJuegos.jsx:11` | mapa ✅ |
| 7 | Reproductores | `registroJuegos.jsx:25` | mapa ⚠️ **incompleto: quiz y misión no están** |
| 8 | `juegoJugable` | `registroJuegos.jsx:51` | **`switch` ❌** |
| 9 | Vista previa | `PreviewJuegoModal.jsx:33-46` | **cadena de `tipo === …` ❌** |
| 10 | Resumen en biblioteca | `BibliotecaActividades.jsx:47-115` | **cadena de 6 `if` ❌** |
| 11 | Textos del selector de banco | `SelectorBanco.jsx:20`, `:41` | mapa + regla especial `tipo !== 'quiz'` ⚠️ |
| 12 | Generador genérico | `GeneradorActividadIA.jsx:42-115` | **6 mapas paralelos** (`CLAVE_ITEMS`, `MAX_ITEMS`, `NOMBRE_ITEM_PLURAL`, cantidades, contadores, factories) ❌ |
| 13 | Editores dedicados | `EditorQuiz.jsx`, `EditorClasificador.jsx`, `GeneradorMision.jsx` | componentes fuera de todo registro ❌ |
| 14 | Dashboard del estudiante | `DashboardEstudiante.jsx` | quiz y misión con pestañas y estado propios ❌ |
| 15 | Misiones | `misionesSeed.js:48`, `:83` | `filtro: { tipo: 'quiz' }`, evaluador `mision_narrativa` — acoplamiento **de contenido**, legítimo |
| 16 | Calificación y XP | `calificacion.js`, `routes/progreso.js` | ✅ **ya genérico** (aciertos/total). Área §10 — **no se toca** |
| 17 | Verbo de auditoría | `routes/progreso.js:332` | mapa **incompleto** con fallback (solo quiz/clasificador/mision) ⚠️ |

### 1.2 `totalEsperado` es un control de SEGURIDAD, no una utilidad

Punto más delicado de toda la spec. `totalEsperado.js` no calcula un dato informativo: `progreso.js:228` lo usa para **rechazar intentos falsificados**, y si devuelve `null` **bloquea el registro de progreso con HTTP 400**.

Un séptimo juego sin entrada en `DERIVADORES` produce esta secuencia:

1. El juego se crea ✅ 2. Se publica ✅ 3. El estudiante lo juega ✅ 4. Al terminar → **400, XP y calificación perdidos**.

Fallo silencioso, tardío y visible solo en producción, sufrido por un niño. **Por eso la guardia de completitud (§4.3) no es un extra: es el requisito central de esta spec.**

Consecuencia de diseño: al mover `totalEsperado` al registro, **el registro pasa a ser código de seguridad** y roza el área protegida §10 (XP). Mitigación: la spec exige que las funciones se muevan **sin alterar una sola fórmula ni denominador**, con pruebas de regresión que comparen la salida vieja y la nueva para los 6 tipos.

**Diagnóstico:** de 16 puntos, 6 ya son mapas limpios, 1 es acoplamiento legítimo de contenido, 1 ya es genérico y **8 requieren trabajo**. La deuda central no es la ausencia de registro, sino que **Quiz y Misión son ciudadanos de primera clase con caminos privilegiados fuera del registro**.

## 2. Problema arquitectónico

1. **Dos registros desincronizados** que deben editarse en paralelo sin nada que lo garantice.
2. **Fallo silencioso:** se puede registrar un juego en 5 sitios, olvidar `totalEsperado`, y el juego se crea, se publica, se juega… y el XP se rechaza en producción sin aviso en desarrollo.
3. **Lógica dispersa** en 8 sitios que obliga a editar código de los seis juegos existentes para añadir el séptimo — exactamente lo que el revisor señala.

## 3. Interpretación del requerimiento del revisor (decisión)

> *"Agregar e implementar nuevos juegos sin afectar los ya existentes"* significa **aislamiento**, no programación desde el navegador.

Dos capas separadas y explícitas:

- **Extensibilidad (desarrollador):** un contrato/plugin interno donde añadir el juego nº 7 consiste en **crear un archivo y registrarlo**, sin editar los seis anteriores. Eso es literalmente "sin afectar los ya existentes".
- **Gestión (administrador):** ver los tipos instalados, activarlos o desactivarlos, controlar su disponibilidad para docentes y estudiantes.

**Por qué no un low-code que permita subir código desde administración:** además de inviable en el plazo de la tesis, sería una **vulnerabilidad de ejecución remota de código** en una plataforma usada por menores de 6 a 9 años. Este argumento se documenta expresamente para la sustentación: la interpretación adoptada no es una limitación, es la decisión correcta de ingeniería.

## 4. Arquitectura propuesta

Un registro único por lado, con contrato completo y **guardia de completitud al arranque**.

### 4.1 Contrato backend

```js
// server/lib/juegos/tipos/memorama.js
{
  tipo: 'memorama',
  etiqueta: 'Memorama',
  emoji: '🃏',
  descripcion: 'Encuentra las parejas que se corresponden.',
  capacidades: { ia: true, banco: true, reutilizar: true, automatico: true },
  validarConfig: (config) => string | null,     // desde validadoresRetos.js
  totalEsperado: (config) => number | null,     // desde totalEsperado.js
  banco: { validarItem, resumenItem, claveItems: 'parejas' },
  ia: { schema, rango, construirPrompt, normalizar }   // desde actividadesIA.js
}
```

### 4.2 Contrato frontend

```js
// src/components/juegos/registro/memorama.jsx
{
  tipo, etiqueta, emoji,
  Player,                            // reproductor
  Editor,                            // ← incorpora #13 al registro
  resumen: (config) => string,       // ← cierra #10
  jugable: (config) => boolean,      // ← cierra #8
  itemVacio, claveItems, maxItems, nombreItem, cantidades   // ← cierra #12
}
```

**Clave del diseño:** incorporar **quiz y misión** al registro con su `Player` y `Editor`. Desaparecen los casos especiales: `PreviewJuegoModal` se reduce a `const { Player } = REGISTRO[tipo]`, y biblioteca y dashboard iteran en vez de ramificar.

### 4.3 Guardia de completitud (REQUISITO CENTRAL)

Dos barreras, no una:

1. **Al arrancar el servidor**, `contrato.js` verifica que todo tipo registrado declara `validarConfig`, `totalEsperado` y `verboAuditoria`. Si falta alguno, **el proceso no arranca** e informa el tipo y el campo. Convierte el fallo silencioso de XP (§1.2) en un error imposible de ignorar.
2. **Al publicar una actividad**, `POST /api/retos` verifica que `totalEsperado(tipo, configuracion)` devuelve un número. Una actividad cuya estructura no permita derivar su evaluación **no se publica**, en vez de fallar cuando el estudiante termina de jugarla.

La barrera 1 protege contra un juego mal implementado; la 2, contra una actividad mal formada de un juego bien implementado.

### 4.3-ter Consistencia entre los dos registros

Al ser dos registros (backend y frontend), el riesgo es que diverjan. Se cubre con una **prueba automática obligatoria** que compara el conjunto de `tipo` de ambos y falla si no coinciden exactamente.

La prueba **no debe introducir dependencias cruzadas entre `server/` y `src/`**: importa cada registro por separado y compara solo listas de identificadores. Nunca un `import` de `src/` dentro de `server/` ni al revés.

### 4.3-quater Relación con SPEC-016 (IA multi-proveedor)

Verificado: `generarJSON({ prompt, schema })` **no conoce el tipo de actividad**. Los adaptadores reciben un esquema genérico y lo traducen.

**Añadir un juego nuevo NO requiere tocar los adaptadores Gemini/OpenAI.** El contrato del registro aporta `ia: { schema, rango, construirPrompt, normalizar }` y los proveedores siguen siendo agnósticos al tipo.

Única condición que el contrato debe documentar: **el esquema declara `required` completo en cada objeto**, porque el modo *strict* de OpenAI lo exige (SPEC-016 §4.3). Los 6 esquemas actuales ya lo cumplen.

### 4.4 Relación con SPEC-013 — revisada tras auditar el código (2026-07-19)

**La auditoría previa a esta spec encontró que SPEC-013 está parcialmente implementada**, al contrario de lo que decía su propio encabezado: F1 y F2 completas, F3 parcial, F4-F7 pendientes (ver `SPEC-013 §7`). Eso **elimina el conflicto** que esta spec anticipaba:

- `BarraAccionesEditor.jsx` ya es el patrón unificado de botonera. **SPEC-017 no lo toca ni lo reemplaza.**
- Las "capacidades por tipo" **ya existen de facto**, en forma de props que cada editor recibe o no (`onAbrirBanco`, `onAgregarIA`). El registro no inventa el concepto: **centraliza dónde se decide**.
- La Fase 3 de esta spec **reduce su alcance**: solo los mapas paralelos de `GeneradorActividadIA.jsx:42-115`.
- La **Fase 8 de SPEC-013** (shell `EditorActividad` vía registro, post-tesis) queda **absorbida** por esta spec.

El objeto `capacidades` del registro **es la implementación de la matriz congelada de SPEC-013 §3, no su renegociación**. Cada fila se traduce literalmente a flags:

| Tipo | 📝 Escribir | 🤖 Generar | 📚 Reutilizar | 🎲 Automático |
|---|---|---|---|---|
| Quiz | ✅ | `ia:true` | `banco:true` | `automatico:true` |
| Memorama / Línea del tiempo / Completar | ✅ | `ia:true` | `banco:true` | `automatico:true` |
| Clasificador | ✅ | `ia:true` | `banco:false` | `automatico:false` |
| Misión Narrativa | ✅ | `ia:true` | `banco:false` | `automatico:false` |

Ningún flujo de UX de SPEC-013 se replantea. **Orden recomendado: SPEC-013 antes o en paralelo con la Fase 3 de esta spec**, para no reescribir los editores dos veces (ver §10).

## 5. Los tres estados de un tipo de juego

| Estado | Crear nuevas | **Iniciar** partidas | Visible al estudiante | Biblioteca docente | XP/notas históricos |
|---|---|---|---|---|---|
| **`activo`** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **`solo_jugar`** | ❌ | ✅ | ✅ | ✅ (marcado) | ✅ |
| **`deshabilitado`** | ❌ | ❌ | ❌ | ✅ (marcado) | **se conservan** |

### 5.0 Qué ve el estudiante ante un tipo deshabilitado (decisión aprobada)

1. **No lo ve.** `GET /api/retos` excluye los tipos deshabilitados. Vía normal, cubre casi todos los casos.
2. **Si llega igualmente** (caché del navegador, pestaña abierta antes del cambio): el reproductor no encuentra entrada en el registro y muestra un `EmptyState` amable — *"Esta actividad no está disponible ahora mismo. Pídele a tu profe otra."* **Nunca un error técnico ni una pantalla rota** (regla §10 de lenguaje infantil).
3. **Si envía progreso de todos modos, `POST /api/progreso` LO ACEPTA.** Es deliberado y es el punto más importante de esta sección: el estado se consulta **solo al crear y al listar**, jamás al calificar. Un niño que estaba jugando cuando el administrador deshabilitó el tipo **no pierde su calificación ni su XP**. Rechazarlo castigaría al estudiante por una acción administrativa que no controla.
4. **Tipo desconocido** (plugin retirado del código): se trata como deshabilitado pero visible para el docente. La actividad y su progreso sobreviven.

### 5.0-bis ⚠️ LIMITACIÓN ARQUITECTÓNICA: no existe el concepto de "intento iniciado"

**Auditado el 2026-07-19. Esta garantía NO está resuelta por diseño y no debe presentarse como tal.**

El backend **no tiene ningún concepto de sesión o intento iniciado**. `POST /api/progreso` es la única escritura y ocurre **al terminar** la actividad; no existe un "inicio de partida" registrado en el servidor. Por tanto **el servidor no puede distinguir** entre:

- un estudiante que empezó a jugar antes de que se deshabilitara el tipo, y
- un estudiante que intenta enviar un resultado después.

**Qué ocurre realmente:** el comportamiento deseado se cumple —quien estaba jugando termina y cobra su nota y su XP— **pero por ausencia de comprobación, no porque el sistema lo distinga**. `POST /api/progreso` acepta el resultado en ambos casos.

**Por qué se acepta:** el riesgo residual es el mismo que ya estaba identificado y aceptado en `MASTER_PLAN.md` §3 ítem 20 (un usuario técnico puede enviar un resultado estructuralmente válido sin haber jugado). Deshabilitar un tipo **no abre una clase de vulnerabilidad nueva**; solo hereda la existente. La alternativa —rechazar el progreso de tipos deshabilitados— **castigaría a un niño** por una acción administrativa, que es justo lo que la spec quiere evitar.

**Solución mínima si algún día se quiere cerrar** (NO implementar ahora): es exactamente la misma que el backlog ítem 20 — que el servidor emita un **token de intento firmado** al abrir la actividad y que `POST /api/progreso` lo exija. Cerraría ambos problemas de una vez. Es un cambio de arquitectura mayor sobre un área protegida (§10, XP) y queda fuera del alcance de la tesis. **No debe abordarse solo por SPEC-017.**

Alternativas más baratas evaluadas y descartadas: una ventana de gracia tras deshabilitar (arbitraria e igualmente falsificable) y deducir el inicio de una fila previa de `progreso_estudiante` (no existe en el primer intento, justo el caso que importa).

### 5.1 Invariantes (no negociables)

1. Desactivar **nunca** elimina ni modifica filas de `retos`, `progreso_estudiante` ni del banco de preguntas.
2. El XP ya otorgado es **inmutable** en cualquier estado (garantía §10 / SPEC-015).
3. "Deshabilitado" **oculta** el reto al estudiante; no lo borra. Calificaciones y XP históricos siguen contando en ranking, misiones y Libro de Calificaciones.
4. El servidor consulta el estado **solo al crear o publicar**, jamás al calificar, al leer progreso ni al calcular ranking. Así el contenido histórico es estructuralmente inmune por diseño, no por cuidado del programador.
5. Un tipo sin fila en la tabla es **Activo** (defaults preservan el comportamiento actual).
6. Un tipo **desconocido o no registrado** se trata como "deshabilitado pero visible": el reto sobrevive aunque su plugin desaparezca del código.

## 6. Cambios de BD

⚠️ **Ver SPEC-016 §11**: `initDb.js` NO ejecuta `database/migraciones/*.sql`; aplica funciones JS escritas a mano. Esta spec sigue el mecanismo vigente y **no lo reescribe** (regla §3).

Numeración: **014** (`014-tipos-juego.sql` + reversa). Decisión de Fabrizio del 2026-07-19 (Opción B): SPEC-016 toma `013`, SPEC-017 toma `014`, y **no** se crea archivo retroactivo para SPEC-015 (su cambio ya vive en `migrarCalificacionAcademica`). Queda un hueco consciente entre `012` y `013`.

```sql
CREATE TABLE IF NOT EXISTS tipos_juego (
  tipo            VARCHAR(30) PRIMARY KEY,
  estado          ENUM('activo','solo_jugar','deshabilitado') NOT NULL DEFAULT 'activo',
  actualizado_en  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  actualizado_por INT UNSIGNED NULL
);
```

**Tabla vacía = comportamiento actual exacto.** `retos` no se toca en absoluto.

## 7. Cambios backend

| Cambio | Archivo |
|---|---|
| Registro central + un archivo por tipo | `server/lib/juegos/registro.js`, `server/lib/juegos/tipos/*.js` (nuevos) |
| Guardia de completitud al arranque | `server/lib/juegos/registro.js` |
| Lectura desde el registro (con re-export de compatibilidad) | `validadoresRetos.js`, `totalEsperado.js`, `actividadesIA.js`, `bancoPreguntas.js` |
| `GET /api/juegos/disponibles` (docente) | `server/routes/retos.js` o nuevo |
| `GET`/`PUT /api/admin/juegos` | `server/routes/adminJuegos.js` (nuevo) |
| Rechazo de creación si el tipo no está activo — **solo en creación/publicación** | `server/routes/retos.js` |
| Permiso `'juegos'` | `server/middleware/auth.js:59` (mismo criterio que SPEC-016 §9: fuera de `PERMISOS_OPERATIVOS`) |
| Migración | `server/initDb.js` |

## 8. Cambios frontend

- `src/components/juegos/registro/` — una entrada por juego (nuevo), y `registroJuegos.jsx` pasa a re-exportar desde ahí para no romper sus consumidores actuales.
- Migración gradual de `PreviewJuegoModal`, `BibliotecaActividades`, `GeneradorActividadIA`, `DashboardEstudiante`.
- `src/pages/admin/modulos/ModuloJuegos.jsx` (nuevo) + entrada en `AdminDashboard.jsx`.
- `src/services/juegosService.js` (nuevo).

## 9. Estrategia incremental (requisito de Fabrizio)

Regla rectora: **el registro se introduce como capa aditiva; los seis juegos existentes se migran uno a uno, y cada paso deja la app funcional y verificable.**

Mecanismo concreto en cada punto migrado:

```js
// El registro es la fuente preferente; el mapa viejo permanece como respaldo
// hasta que TODOS los tipos estén migrados. Ningún juego se rompe a medio camino.
const def = REGISTRO[tipo] ?? MAPA_LEGADO[tipo];
```

Los mapas antiguos (`VALIDADORES_CONFIG`, `DERIVADORES`, `JUEGOS_UI`…) **se conservan exportados** durante toda la transición y solo se retiran en la última fase, cuando el registro esté completo y verificado. Esto respeta la regla §3 (no refactors grandes) pese a que el conjunto del trabajo sí es amplio: ninguna fase individual reescribe un módulo entero.

**Los editores y reproductores no se reescriben.** Se **referencian** desde el registro (`Editor: EditorQuiz`). Su código interno queda intacto en esta spec; cualquier unificación real de editores pertenece a SPEC-013.

## 10. Fases de implementación

| Fase | Alcance | Independiente | Riesgo |
|---|---|---|---|
| **1** | Registro **backend**: mover los 4 mapas existentes a `lib/juegos/tipos/*.js` con re-exports. Guardia de completitud. **Cero cambio de comportamiento** | ✅ Sí | Bajo |
| **2** | Registro **frontend**: crear `registro/`, incorporar quiz y misión, `registroJuegos.jsx` re-exporta. Eliminar #8, #9, #10 | ✅ Sí | Bajo |
| **3** | **Alcance reducido** (auditoría 2026-07-19): centralizar solo los mapas paralelos de `GeneradorActividadIA.jsx:42-115` y referenciar editores desde el registro. **NO se toca `BarraAccionesEditor` ni se rehace SPEC-013** | ✅ Sí | Medio |
| **4** | Migración 015 + `tipos_juego` + endpoints + permiso `'juegos'` + bloqueo **solo en creación** | ✅ Sí (vía API) | Bajo |
| **5** | `ModuloJuegos` en el panel de administración | ❌ Depende de la 4 | Bajo |
| **6** | `docs/COMO-AGREGAR-UN-JUEGO.md` — **entregable de tesis** | ✅ Sí | Nulo |
| **7** | *(Opcional, prueba final)* Séptimo juego sencillo usando solo el contrato | ✅ Sí | Bajo |

### 10.1 Fases independientes — respuesta explícita

- **1, 2, 4, 6 y 7 son implementables y probables de forma independiente.**
- **3 depende de SPEC-013** (o debe hacerse en el mismo bloque de trabajo).
- **5 depende de 4** (necesita los endpoints).
- **1 y 2 son independientes entre sí**: una es backend, otra frontend, y ninguna cambia comportamiento observable.

### 10.2 La Fase 7 como prueba de la arquitectura

Contemplada como **demostración final, no obligatoria**. Un juego sencillo (p. ej. "Verdadero o Falso": `{ afirmaciones: [{ texto, esVerdadera }] }`, reutiliza el patrón de `completar`) implementado **exclusivamente** creando sus dos archivos de registro y su reproductor.

**Criterio de éxito medible:** `git diff --stat` de esa fase no debe mostrar modificaciones en los archivos de los seis juegos existentes. Si las muestra, la arquitectura no cumplió su objetivo y el diff señala exactamente dónde. Esa captura es la evidencia más fuerte que se puede presentar al revisor sobre este requerimiento.

## 11. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | Es el cambio más invasivo de los dos: toca editores y reproductores en producción | Estrategia incremental §9; los editores se referencian, no se reescriben |
| 2 | Colisión con SPEC-013 (congelada) | §4.4 la resuelve; Fase 3 coordinada |
| 3 | Retos huérfanos si se elimina un tipo del registro | Invariante §5.1.6: tipo desconocido = deshabilitado pero visible |
| 4 | Un admin deshabilita un tipo con actividades activas y desconcierta a docentes/estudiantes | El panel muestra el nº de actividades afectadas **antes** de confirmar |
| 5 | Sin MySQL local (§16) | Migración 015 y efecto real del estado solo verificables tras deploy |
| 6 | Regresión silenciosa en un juego migrado | Verificación manual de los 6 juegos al cerrar cada fase (crear, jugar, calificar) |

## 11-bis. Cambios de comportamiento deliberados (Fases 1-2)

La refactorización se hizo con criterio de **cambio cero**: 52 configuraciones por tipo comparadas contra el código anterior devuelven denominadores y mensajes idénticos, y los prompts de IA son iguales byte a byte. Estas son las **únicas** desviaciones, todas conscientes:

### a) Verbos de auditoría propios (MEJORA DELIBERADA, no consecuencia del registro)

Memorama, Línea del tiempo y Completar espacios ahora registran en la bitácora *"Jugó el memorama"*, *"Ordenó la línea del tiempo"* y *"Completó los espacios"*. Antes los tres caían al genérico *"Completó la actividad"*, porque el mapa `VERBO` de `progreso.js:332` solo contemplaba quiz, clasificador y misión.

**Esto es una mejora de trazabilidad decidida a propósito, NO algo que el registro obligue.** El registro habría admitido igual de bien conservar el genérico; se aprovechó que cada tipo ya declara sus metadatos para completar los tres que faltaban. Afecta únicamente al texto de la bitácora de auditoría: ni una nota, ni un XP, ni un progreso cambian.

### b) Orden de `TIPOS_BANCO` — no se restaura, con motivo técnico

El orden histórico (`quiz, completar, memorama, linea-tiempo`) era un artefacto de cómo estaba escrito el objeto `VALIDADORES_ITEM`, sin significado semántico. El registro produce `quiz, memorama, linea-tiempo, completar`.

Se evaluó restaurarlo y **existe una razón técnica para no hacerlo**:

- **Restaurarlo con una lista de orden explícita** reintroduce exactamente el tipo de lista central que esta spec elimina: un séptimo juego con banco tendría que añadirse también ahí, y olvidarlo sería un fallo silencioso.
- **Restaurarlo reordenando el array `TIPOS`** cambiaría además el orden de `ACTIVIDADES_IA`, que **sí es observable de forma consecuente**: `routes/ia.js:176` inyecta esos slugs en el prompt de la actividad sorpresa. Cambiar el orden de una lista dentro de un prompt es un cambio de comportamiento mayor que el que se pretende evitar.

Alcance real de la diferencia: el orden de las palabras en **un único mensaje de error** (`tipo debe ser uno de: …`) devuelto ante una petición inválida a la API del banco. Ninguna interfaz itera `TIPOS_BANCO`; ningún usuario lo ve. Se acepta conscientemente.

### c) Barrera de publicación (aprobada)

Publicar exige ahora que `totalEsperado` sea derivable. Endurecimiento intencional: una actividad histórica malformada que hoy se pudiera republicar será rechazada con un mensaje claro, en vez de fallar cuando el estudiante termine de jugarla.

## 12. Compatibilidad

| Garantía | Cómo se sostiene |
|---|---|
| Actividades históricas intactas | La tabla `retos` no se modifica; ningún borrado |
| XP y calificaciones inmutables | El estado no se consulta al calificar (§5.1.4) |
| Ranking y misiones sin cambios | No se tocan (§10 de CLAUDE.md) |
| Imports existentes válidos | Re-exports durante toda la transición (§9) |
| Sin fila = hoy | Default `activo` |
| `configuracion_json` | Sin cambios de forma (regla §12) |

## 13. Qué configura el administrador / qué requiere desarrollador

**Administrador:** gestiona **exclusivamente juegos ya implementados y registrados por el sistema**. Nunca programa una mecánica desde el navegador — y así debe presentarse, sin ambigüedad, ante el revisor.

El módulo muestra, por tipo:

| Columna | Origen |
|---|---|
| Nombre y descripción | registro |
| Estado (`activo` / `solo jugar` / `deshabilitado`) | BD, editable |
| Nº de actividades existentes | consulta a `retos` |
| Reproductor · Editor · IA · Banco/Reutilizar · Evaluación | derivado del registro (chips ✅/—) |

El **estado de integración** es autodocumentación: si un desarrollador registra un juego sin soporte de IA, el panel lo refleja solo, sin que nadie deba actualizar nada.

**Prohibido el borrado físico desde la UI.** No existe botón de eliminar un tipo de juego. Un tipo solo desaparece si un desarrollador retira su archivo del registro, y aun así las actividades y el progreso sobreviven (§5.0 regla 4).

**Confirmación antes de `deshabilitado`:** el panel indica cuántas actividades usan ese tipo y aclara explícitamente que los datos históricos **no** se eliminarán.

**Desarrollador:** implementar el juego (editor, reproductor, validador, esquema de IA, prompt, `totalEsperado`) y registrarlo mediante el contrato. **Esto es correcto y se defiende explícitamente ante el revisor** (§3), no se disimula.

## 14. Criterio de aceptación

1. Añadir un tipo nuevo no requiere modificar los archivos de los seis existentes (verificable con `git diff --stat`, §10.2).
2. Desactivar un tipo no elimina ninguna actividad, calificación, XP ni progreso.
3. Con `tipos_juego` vacía, el sistema se comporta exactamente como antes de esta spec.
4. Los seis juegos siguen creándose, jugándose y calificándose igual al cerrar **cada** fase.
5. El servidor no arranca si un tipo registrado está incompleto.
6. Existe `docs/COMO-AGREGAR-UN-JUEGO.md`.
7. `npm run build` sin errores; panel verificado en móvil.
