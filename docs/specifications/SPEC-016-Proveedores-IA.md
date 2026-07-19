# SPEC-016 — Arquitectura de proveedores de IA

**Estado:** 🟡 **Implementada y desplegada (2026-07-19). Gemini validado en producción; OpenAI implementado y verificado estructuralmente, pendiente de validación funcional por falta de credenciales.** Ver §16.
**Fecha:** 2026-07-19
**Origen:** Observación del revisor de tesis — *"Analizar la viabilidad de reemplazar la API de Gemini por la API de ChatGPT u otro modelo de inteligencia artificial para la generación de actividades y contenido educativo."*
**Alcance:** Backend (`server/lib/ia/*`, endpoints admin), migración de BD aditiva, un módulo nuevo en el panel de administración. **No toca** áreas protegidas §10 (login, XP, misiones, ranking, permisos) salvo el alta de un permiso nuevo, que sí es §10 y se detalla en §9.
**Ajustes aprobados por Fabrizio (2026-07-19):** sin fallback automático en esta spec (contrato preparado); API Keys exclusivamente en variables de entorno; sin `_generacion` en `configuracion_json`; "Probar conexión" incluido.

---

## 1. Estado actual (auditado sobre el código real)

La dependencia de Gemini está contenida en **tres archivos**:

| Archivo | Acoplamiento real |
|---|---|
| `server/lib/iaCliente.js` | `GoogleGenAI`, `process.env.GEMINI_API_KEY`, descubrimiento de modelos "flash" vía `models.list()`, reintentos, clasificación de errores de Google |
| `server/lib/actividadesIA.js:9` | únicamente `import { Type } from '@google/genai'` |
| `server/routes/ia.js:13` | únicamente `import { Type } from '@google/genai'` |

Lo que **ya está bien** y no se toca:

- `generarJSON({ prompt, schema })` es de facto la interfaz común buscada.
- `ACTIVIDADES_IA` (`server/lib/actividadesIA.js:230`) es un registro por tipo sin prompts duplicados: `/generar`, `/sorpresa`, `/adaptar`, `/quiz` y `/mision` lo consumen todos.
- La validación de salida ya existe: `generarActividad()` valida contra `VALIDADORES_CONFIG` antes de devolver (`actividadesIA.js:421-425`).
- Configuración actual: una sola variable, `GEMINI_API_KEY` (`server/.env.example:22`).

**No existe lógica de IA duplicada.** La consolidación de SPEC-006 ya la eliminó.

## 2. Problema arquitectónico

Cuatro puntos concretos, no un rediseño:

1. `cliente()` instancia `GoogleGenAI` directamente y lo cachea en el módulo (`genAI ??=`).
2. `resolverModelos()` es **específico de Google**: `models.list()`, heurística de nombres "flash", puntuación por `lite`/`latest`/`preview`. Ningún otro proveedor tiene esa forma.
3. `Type.*` de `@google/genai` contamina el registro de actividades. **Corrección de la auditoría final (2026-07-19):** los valores son **mayúsculas** (`Type.STRING === 'STRING'`, `Type.OBJECT === 'OBJECT'`, …), *no* los tipos JSON Schema en minúscula. Una versión anterior de esta spec afirmaba lo contrario; era incorrecto. Consecuencia práctica: sustituirlos por constantes propias con **idénticos valores en mayúscula** es un cambio literalmente sin efecto para Gemini, y la traducción a JSON Schema en minúscula pasa a ser responsabilidad del adaptador de OpenAI (§4.3). Valores usados en el código: `STRING`, `OBJECT`, `ARRAY`, `INTEGER`.
4. `esTemporal()` mapea códigos de error de Google (`RESOURCE_EXHAUSTED`, `UNAVAILABLE`).

## 3. Interpretación del requerimiento del revisor (decisión)

El revisor pidió **analizar la viabilidad de reemplazar**, no reemplazar. La respuesta técnicamente superior es demostrar independencia del proveedor:

> Se analizó la viabilidad del reemplazo directo y se concluyó que resolvía el síntoma (usar otro proveedor) pero no la causa (acoplamiento a un proveedor único). GamificApp implementó una arquitectura de adaptadores agnóstica al proveedor: Gemini y OpenAI son proveedores reales e intercambiables desde el panel de administración, y añadir Anthropic u otro no requiere modificar los generadores de actividades.

**Se implementa OpenAI de verdad, no solo "preparado".** Una demostración con dos proveedores reales y conmutables en vivo es la evidencia que cierra la observación; un adaptador teórico no lo haría.

## 4. Arquitectura propuesta

```
server/lib/ia/
  index.js            → generarJSON({prompt, schema}) — MISMA firma de hoy
  esquema.js          → Tipo.STRING/OBJECT/ARRAY/NUMBER/BOOLEAN (reemplaza Type)
  registro.js         → PROVEEDORES = { gemini, openai }
  proveedorGemini.js  → lógica actual de iaCliente.js, intacta
  proveedorOpenAI.js
  config.js           → lee proveedor/modelo activo de BD; keys desde env
```

`server/lib/iaCliente.js` **se conserva** como re-export de compatibilidad (`export { generarJSON } from './ia/index.js'`) para no romper imports existentes.

### 4.1 Contrato del adaptador (congelado)

```js
{
  id: 'openai',
  etiqueta: 'OpenAI',
  variableEntorno: 'OPENAI_API_KEY',
  modelosSugeridos: ['gpt-4o-mini', 'gpt-4o'],
  disponible: () => Boolean(process.env.OPENAI_API_KEY),
  generarJSON: async ({ prompt, schema, modelo }) => objetoParseado,
  clasificarError: (err) => 'temporal' | 'credencial' | 'cuota' | 'formato' | 'permanente'
}
```

`clasificarError` se define **desde ahora** aunque el fallback no se implemente: es el punto de extensión que permitirá añadirlo después sin tocar los adaptadores (§4.4).

### 4.2 Consecuencia clave

Como `generarJSON` conserva su firma, **`actividadesIA.js` solo cambia su línea de import**. Cero cambios en prompts, esquemas, normalizadores, rangos y endpoints de IA.

### 4.2-bis Segunda interfaz pública: `generarTexto`

**Hallazgo de la auditoría final (2026-07-19):** `generarJSON` no es la única superficie. `POST /api/ia/asistente` (`routes/ia.js:394`) llama a `generarConReintentos({ contents: mensaje })` y lee `respuesta.text` — una llamada de **texto libre con forma Gemini cruda**, sin esquema.

Por tanto el contrato del adaptador declara **dos** operaciones:

```js
generarJSON:  async ({ prompt, schema, modelo }) => objetoParseado
generarTexto: async ({ prompt, modelo })         => string
```

`/api/ia/asistente` pasa a usar `generarTexto` y deja de depender de la forma de respuesta de Google. `generarConReintentos` se conserva exportado desde `iaCliente.js` por compatibilidad, pero ya no lo consume ninguna ruta.

### 4.3 Traducción de esquemas

Gemini usa `responseSchema` con `Type.*`. OpenAI usa `response_format: { type: 'json_schema' }` con JSON Schema estándar, que en *strict mode* exige `additionalProperties: false` y todas las propiedades en `required`. Los seis esquemas actuales ya declaran `required` completo, por lo que la conversión es mecánica y vive **dentro de `proveedorOpenAI.js`**; los esquemas del registro no se modifican.

**Riesgo verificable en Fase 2:** `QUIZ_SCHEMA` es un `ARRAY` en la raíz; OpenAI exige objeto raíz. Se resuelve envolviendo en `{ preguntas: [...] }` dentro del adaptador — el normalizador del quiz ya acepta ambas formas (`actividadesIA.js:242`: `Array.isArray(data) ? data : data?.preguntas`), así que no hay cambio aguas arriba.

### 4.3-bis Estrategia de catálogo de modelos (decidida en Fase 3/4)

**Problema:** una lista fija de modelos en el panel envejece — en meses mostraría identificadores obsoletos y ocultaría los nuevos.

**Alternativas evaluadas:**

| Estrategia | Problema |
|---|---|
| Lista hardcodeada en el frontend | Envejece; exige recompilar el frontend por cada modelo nuevo |
| Lista hardcodeada en backend | Envejece igual; solo mueve el problema |
| Campo de texto libre | El admin puede fijar un modelo incompatible y **romper la salida estructurada** de todos los generadores |
| **Descubrimiento dinámico + filtro por adaptador** | ✅ **Adoptada** |

**Decisión:** cada adaptador expone `listarModelos()`, que consulta al proveedor real y filtra con reglas **propias de ese adaptador**:

- **Gemini:** reutiliza el descubrimiento que ya existía (`models.list()` filtrado a familias "flash"). Cero lista fija.
- **OpenAI:** `models.list()` devuelve todo (embeddings, audio, imagen…) y **no expone qué modelo soporta `json_schema`**, así que la compatibilidad la aporta el adaptador mediante patrón de familia (`gpt-4o`, `gpt-4.1`, `gpt-5`, `o1`+) excluyendo modelos no textuales.

Garantías que aporta:

1. **No envejece:** los modelos nuevos de una familia compatible aparecen solos.
2. **No se puede romper la generación:** `PUT /configuracion` valida que el modelo pertenezca al catálogo del proveedor. Si el catálogo no se puede consultar, solo se admite "Automático".
3. **Degradación suave:** si el proveedor no responde, la UI muestra un aviso y "Automático" sigue disponible.
4. El catálogo se cachea 5 minutos en el backend para no golpear al proveedor en cada visita.

### 4.4 Manejo de fallos (sin fallback automático)

| Clase | Comportamiento en esta spec |
|---|---|
| `temporal` (429/503) | Reintento con espera y recorrido de modelos candidatos — **igual que hoy** |
| `credencial` (401/403) | Sin reintento. Mensaje al docente: *"El generador automático no está disponible ahora mismo. Avisa a tu administrador."* Detalle técnico solo en logs del servidor |
| `cuota` | Sin reintento. Mensaje: *"Se alcanzó el límite de generaciones por hoy. Intenta más tarde."* |
| `formato` (JSON inválido o validación fallida) | **1 reintento** antes de rendirse (mejora sobre hoy, donde un JSON malformado gasta el intento del docente) |

**Fallback automático entre proveedores: fuera de alcance por decisión de Fabrizio.** El contrato (`clasificarError` + `proveedor_respaldo` en BD) queda preparado; la columna se crea pero **no se lee** en esta spec. Anotado en `MASTER_PLAN.md`.

### 4.5-bis Guardar valida antes de aplicar (decidido en la auditoría final)

`PUT /api/admin/ia/configuracion` **prueba la combinación proveedor+modelo candidata contra el proveedor real ANTES de persistirla**. Si la prueba falla, responde 400 y **la configuración activa no se toca**.

Motivo: el filtro de familia del catálogo (§4.3-bis) es una heurística sobre nombres. Un modelo nuevo puede pasar el patrón y aun así no soportar `json_schema` como lo usamos. Sin esta validación, un administrador podría guardar esa combinación y **romper la generación para todos los docentes** sin enterarse hasta que alguien intentara crear una actividad.

Coste: una generación estructurada mínima por guardado (la misma de "Probar conexión"). Se paga solo al cambiar la configuración, que es una acción rara.

### 4.6 Sanitización de logs (obligatoria)

Los SDK incluyen fragmentos de la API key en sus mensajes de error — OpenAI responde literalmente `Incorrect API key provided: sk-abcd1234****WXYZ`. Volcar `err.message` en consola dejaba ese fragmento en los logs de Render.

`lib/ia/errores.js` centraliza la defensa para todos los proveedores, presentes y futuros:

- **Nunca** se registra el objeto de error crudo ni su mensaje sin filtrar.
- Se registra una línea con campos controlados: `op`, `proveedor`, `modelo`, `categoria`, `status`, `tipo`.
- El mensaje pasa por `sanitizarMensaje()`, que elimina claves completas, **claves parcialmente enmascaradas**, cabeceras `Bearer`/`Basic`, pares `api_key=…`, credenciales en query string, y —la garantía más fuerte— **el valor real de las variables de entorno y sus prefijos de 6+ caracteres**.
- Cubre `GEMINI_API_KEY`, `OPENAI_API_KEY`, `JWT_SECRET` y `DB_PASSWORD`.

### 4.5 Trazabilidad

**Decisión: NO se guarda `_generacion` en `configuracion_json`.** Motivos: (a) mezclaría metadatos internos con la configuración del juego, que debe permanecer limpia y estable (regla §12); (b) el valor real para la tesis es demostrar que el proveedor es conmutable, no auditar cada actividad; (c) `configuracion_json` lo consumen los reproductores, que ignorarían el campo pero lo arrastrarían en cada guardado.

La trazabilidad necesaria se cubre con lo que **ya existe**: el evento de auditoría de generación (`server/lib/auditoria.js`) se amplía para incluir `proveedor` y `modelo` en su descripción. Nunca la API key, nunca el prompt completo.

## 5. Seguridad — comparación de alternativas y decisión

| | Superficie de riesgo | Rotación | Esfuerzo | Veredicto |
|---|---|---|---|---|
| 1. Solo variables de entorno | Mínima: la key nunca toca BD ni endpoints | Requiere redeploy en Render | Nulo | Seguro pero rígido |
| 2. Keys en BD cifradas | Alta: exige clave maestra que vuelve a vivir en env (el problema se mueve, no se resuelve). Un dump de BD + código expuesto compromete las keys. Añade endpoints que manipulan secretos | Desde el panel | Alto | ❌ Descartada |
| 3. **Híbrido** | Mínima (igual que 1) | Redeploy solo al cambiar una key; cambiar proveedor/modelo es instantáneo | Bajo | ✅ **ADOPTADA** |

**Decisión (aprobada por Fabrizio):** alternativa 3. Las API Keys permanecen **exclusivamente** como variables de entorno del backend.

Razones específicas de GamificApp: Render ya ofrece gestión de secretos como servicio de plataforma — reimplementar cifrado sobre MySQL sería peor que lo que ya existe gratis. Las keys se rotan quizá una vez al año, así que la alternativa 2 añade superficie de ataque y trabajo a cambio de una conveniencia marginal, en un proyecto con fecha límite.

### 5.1 Reglas duras (no negociables)

1. La BD guarda **únicamente** `proveedor`, `modelo` y `proveedor_respaldo`. **Jamás un secreto.**
2. Ningún endpoint devuelve una API key, ni completa ni enmascarada ni truncada.
3. El panel muestra **estado booleano**: `✅ Clave configurada` / `⚠️ Falta OPENAI_API_KEY en el servidor`.
4. No existe ningún campo de entrada de API key en el frontend.
5. `POST /api/admin/ia/probar` devuelve `{ ok, proveedor, modelo, latenciaMs, error? }` con `error` **saneado** (categoría de `clasificarError`, nunca el mensaje crudo del SDK, que puede contener fragmentos de la key o de la petición).
6. "Probar conexión" está limitado a **1 llamada cada 10 segundos por administrador** para que no sea un grifo de consumo de cuota.

## 6. Cambios de BD

⚠️ **Ver §11 sobre el mecanismo real de migraciones antes de implementar.** Numeración asignada: **013** (Opción B, decidida por Fabrizio el 2026-07-19).

Tabla nueva, aditiva, de una sola fila:

```sql
CREATE TABLE IF NOT EXISTS configuracion_ia (
  id                 TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
  proveedor          VARCHAR(30) NOT NULL DEFAULT 'gemini',
  modelo             VARCHAR(60) NULL,        -- NULL = autodetección (comportamiento actual)
  proveedor_respaldo VARCHAR(30) NULL,        -- reservado, NO se lee en esta spec
  actualizado_en     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  actualizado_por    INT UNSIGNED NULL
);
```

**Sin fila → `gemini` + autodetección = comportamiento idéntico al actual.** Ninguna tabla existente se modifica.

## 7. Cambios backend

| Cambio | Archivo |
|---|---|
| Constantes de tipo propias | `server/lib/ia/esquema.js` (nuevo) |
| Adaptador Gemini (lógica actual movida sin alterar) | `server/lib/ia/proveedorGemini.js` (nuevo) |
| Adaptador OpenAI | `server/lib/ia/proveedorOpenAI.js` (nuevo) |
| Registro + `generarJSON` público | `server/lib/ia/registro.js`, `index.js` (nuevos) |
| Re-export de compatibilidad | `server/lib/iaCliente.js` (reducido) |
| Import de `Type` → `Tipo` | `server/lib/actividadesIA.js:9`, `server/routes/ia.js:13` |
| `GET`/`PUT /api/admin/ia/configuracion`, `POST /api/admin/ia/probar` | `server/routes/admin.js` o `server/routes/adminIA.js` (nuevo) |
| Permiso `'ia'` | `server/middleware/auth.js:59` |
| Migración | `server/initDb.js` (función nueva) |
| Dependencia `openai` | `server/package.json` |

## 8. Cambios frontend

- `src/pages/admin/modulos/ModuloIA.jsx` (nuevo)
- Entrada de navegación en `src/pages/admin/AdminDashboard.jsx`
- `src/services/iaConfigService.js` (nuevo)

**Docente y estudiante: cero cambios.** La generación de actividades funciona exactamente igual.

## 9. Relación con las áreas protegidas (§10 de CLAUDE.md)

El permiso `'ia'` se añade a `PERMISOS_VALIDOS` pero **NO** a `PERMISOS_OPERATIVOS` (`server/middleware/auth.js:59-64`). Consecuencias:

- No se concede por defecto a administradores no principales: es opt-in explícito.
- El Administrador Principal lo obtiene automáticamente (`fila?.es_principal` devuelve todos los permisos, `auth.js:77`).
- Ningún permiso existente cambia de semántica.

Esta spec aprobada es la autorización requerida por §10 para ese cambio concreto y acotado.

## 10. Compatibilidad

| Garantía | Cómo se sostiene |
|---|---|
| Actividades existentes intactas | `configuracion_json` no cambia de forma; sin `_generacion` |
| Sin cambios en generación | `generarJSON` conserva firma; `ACTIVIDADES_IA` solo cambia un import |
| Sin fila de configuración = hoy | Defaults `gemini` + modelo `NULL` (autodetección) |
| Imports antiguos siguen válidos | `iaCliente.js` re-exporta |
| XP / misiones / ranking | No se tocan |

## 11. ⚠️ Hallazgo de auditoría: el mecanismo de migraciones no es el documentado

`server/initDb.js` **NO lee `database/migraciones/*.sql`.** No existe ninguna lectura de ese directorio en el código. Lo que hace realmente:

1. Ejecuta `database/produccion_defaultdb.sql` completo (idempotente).
2. Ejecuta **funciones JavaScript escritas a mano** (`migrarColumnasMaterias`, `migrarCentroDocente`, …, `migrarCalificacionAcademica`), encadenadas en `inicializarEsquema()` (`initDb.js:36-52`), cada una guardada por `faltaColumna()` contra `information_schema`.

Consecuencias:

- Los archivos de `database/migraciones/` son **documentación versionada, no artefactos ejecutables**. `START_HERE.md:28` y `CURRENT_STATE.md:198` afirman lo contrario: **la documentación está equivocada**.
- **No existe tabla de registro de migraciones aplicadas.** La idempotencia se deriva del estado del esquema, no de una bitácora.
- SPEC-015 (`migrarCalificacionAcademica`, `initDb.js:595`) está implementada en JS **sin archivo `.sql` correspondiente**: los archivos se detienen en `012-carga-masiva-estudiantes`.

### Numeración disponible — confirmada

| | Valor |
|---|---|
| Último `.sql` en `database/migraciones/` | `012-carga-masiva-estudiantes.sql` |
| Última función en `initDb.js` | `migrarCalificacionAcademica` (SPEC-015, **sin `.sql`**) |
| Siguiente número libre de archivo | **013** |

**La nota de memoria "SPEC-015 → migración 010 pendiente" es incorrecta**: `010` pertenece a `010-docente-curso`. SPEC-015 no tiene número de archivo asignado.

**Decisión de Fabrizio (2026-07-19) — Opción B, adoptada:**

- **SPEC-016 usa 013** (`013-configuracion-ia.sql` + reversa).
- SPEC-017 usa **014** (ver SPEC-017 §6).
- **NO se crea archivo `.sql` retroactivo para SPEC-015.** Su cambio funcional ya está implementado y operativo mediante `migrarCalificacionAcademica` en `initDb.js`; generar ahora una migración documental retroactiva solo para completar la secuencia no aporta valor. La secuencia de archivos queda con un hueco consciente entre `012` y `013`.
- El cambio real sigue implementándose como función idempotente en `initDb.js`, coherente con el mecanismo vigente. **No se reescribe el sistema de migraciones**: sería un refactor grande no pedido (regla §3). La evaluación de un sistema formal de migraciones versionadas con registro de aplicadas queda anotada en `MASTER_PLAN.md` §3 ítem 27, sin implementar.
- Corregir la afirmación errónea en `START_HERE.md` y documentar el mecanismo real en la documentación viva.

## 12. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | *Strict mode* de OpenAI rechaza esquemas que Gemini acepta (en especial `QUIZ_SCHEMA`, array en raíz) | Validar los 6 tipos contra OpenAI en Fase 2 **antes** de exponer el proveedor en la UI |
| 2 | OpenAI no tiene capa gratuita como Gemini | La tesis se demuestra con Gemini activo; OpenAI se verifica puntualmente. Documentar el costo |
| 3 | Sin MySQL local (§16) | Migración y "Probar conexión" con datos reales solo verificables tras deploy. Declararlo al reportar |
| 4 | Diferencias de calidad de salida entre proveedores | Los validadores existentes (`VALIDADORES_CONFIG`) actúan igual para ambos: una salida mala se rechaza con el mismo mensaje |
| 5 | Un admin selecciona un proveedor sin key configurada | La UI lo muestra no disponible; el `PUT` lo rechaza con 400 |

## 13. Fases de implementación

| Fase | Alcance | Verificación independiente |
|---|---|---|
| **1** | `esquema.js` con `Tipo.*`; eliminar `@google/genai` de `actividadesIA.js` y `routes/ia.js` | ✅ Sí. `npm run build` + generar una actividad de cada tipo con Gemini. **Cero cambio funcional esperado** |
| **2** | `lib/ia/` con adaptador Gemini (idéntico) y adaptador OpenAI. Selección por variable de entorno temporal | ✅ Sí. Generar los 6 tipos con cada proveedor y comparar |
| **3** | Migración 013 + `configuracion_ia` + endpoints admin + permiso `'ia'` | ✅ Sí, vía API. Requiere deploy (§16) |
| **4** | `ModuloIA` en el panel + "Probar conexión" | ✅ Sí, visual + responsive |
| **5** | Reintento ante `formato` + auditoría con proveedor/modelo | ✅ Sí |

**Fases independientes:** la 1 y la 2 no dependen de BD ni de deploy y pueden probarse en local. La 3 requiere BD real. La 4 depende de la 3. La 5 es opcional y desacoplada.

**Punto de corte seguro:** terminadas las Fases 1-2, la arquitectura agnóstica ya existe y es demostrable ante el revisor aunque no haya UI de administración.

## 14. Qué configura el administrador / qué requiere desarrollador

**Administrador:** proveedor activo, modelo, ver qué proveedores tienen su clave configurada (booleano), probar la conexión.

**Desarrollador:** añadir un proveedor nuevo (un archivo adaptador + una entrada en el registro), cargar las API Keys en las variables de entorno de Render, ajustar prompts y esquemas.

## 15. Criterio de aceptación

1. Ningún endpoint devuelve una API key en ninguna forma.
2. No existe campo de entrada de API key en el frontend.
3. Los 6 tipos de actividad se generan correctamente con Gemini **y** con OpenAI.
4. Cambiar de proveedor desde el panel surte efecto sin redeploy.
5. Con la tabla vacía, el sistema se comporta exactamente como antes de esta spec.
6. `npm run build` sin errores; panel verificado en móvil.

## 16. Estado de validación (cierre parcial, 2026-07-19)

### Validado en producción

- ✅ **Gemini es el proveedor validado y en uso.** Sigue generando actividades con normalidad tras el despliegue de SPEC-016; la arquitectura de adaptadores no introdujo regresiones.
- ✅ Migración 013 aplicada; con la tabla vacía el sistema usa Gemini, exactamente como antes de esta spec.
- ✅ Módulo de administración, permisos y estado de proveedores.

### Implementado y verificado estructuralmente, NO validado contra la API real

- ⚠️ **Adaptador de OpenAI.** Está implementado y verificado **estructuralmente**: contrato completo, traducción de los 6 esquemas a JSON Schema *strict* válido, envoltura del array raíz del quiz, campos opcionales como nullable, clasificación de errores (confirmada con claves inválidas: el proveedor responde 401 y el adaptador lo clasifica como `credencial`).
- ⚠️ **La generación real con OpenAI NO se ha probado**, por no disponer de `OPENAI_API_KEY` en el momento del cierre.

**No debe presentarse OpenAI como probado con éxito contra su API real.** La afirmación defendible es: *GamificApp posee una arquitectura agnóstica al proveedor, con Gemini validado en producción y un segundo adaptador (OpenAI) implementado y verificado estructuralmente, pendiente de validación funcional cuando se disponga de credenciales.*

### Pendiente para cuando exista `OPENAI_API_KEY`

- [ ] "Probar conexión" con OpenAI.
- [ ] Generación real de los 6 tipos con OpenAI — **empezar por el quiz**, único esquema con array en raíz.
- [ ] Cambiar Gemini → OpenAI → Gemini y confirmar que los generadores siguen funcionando sin tocar su código.

Riesgo principal a vigilar en esa ronda futura: el *strict mode* de OpenAI sobre `QUIZ_SCHEMA` y los campos opcionales declarados nullable. Mitigación ya activa: `PUT /configuracion` valida la combinación contra el proveedor **antes** de aplicarla (§4.5-bis), así que una configuración que no funcione no puede llegar a activarse.
