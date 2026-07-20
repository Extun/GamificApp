# Entorno local de desarrollo/QA sin MySQL de producción

> **Naturaleza:** infraestructura de desarrollo, **no** una SPEC. No toca
> ninguna área protegida (`CLAUDE.md §10`), no cambia el comportamiento de
> producción, no añade migraciones productivas ni altera contratos de API.

## 1. Qué es y qué resuelve

GamificApp exige MySQL para autenticarse y cargar los paneles (Admin, Docente,
Estudiante). Sin BD local no se pueden inspeccionar los paneles autenticados ni
probar los 7 juegos de punta a punta.

**MODO A (el que implementamos):** una instancia **MySQL local aislada** (Docker)
sobre la que corre el **backend real** con el **mismo `initDb.js` y el mismo SQL
de producción**. Cero mocks, **divergencia cero**: lo que se ejecuta en local es
el código de producción, solo cambia a qué base apunta.

**MODO B (fixtures MSW):** diferido a propósito. No se construye salvo que
aparezca un estado de UI concreto imposible de sembrar. Si algún día se añade,
se etiqueta explícitamente como *UI-only, nunca cuenta como lógica validada*.

## 2. Regla de aislamiento de producción (absoluta)

- **No existe ningún código mock en el camino de la API.** Es imposible que
  Render/Aiven "entren en modo mock": no hay tal modo que activar.
- El único artefacto dev futuro (`server/scripts/seedDev.js`, Fase L3) llevará
  **triple barrera**: se niega a correr si `NODE_ENV=production`, si
  `DEV_SEED≠true`, o si `DB_HOST` no es local (rechaza sembrar Aiven).
- La BD dev se llama **`gamificapp_dev`** (distinta de `defaultdb` de Aiven) y
  vive en un contenedor efímero y borrable.
- `docker-compose.dev.yml` y `server/.env` **no** forman parte del deploy.
- `server/.env` está en `.gitignore` (patrón `.env`): las credenciales locales
  nunca se suben.

## 3. Requisito previo

Instalar **Docker Desktop** para Windows (una sola vez):
<https://www.docker.com/products/docker-desktop/>. Tras instalarlo, ábrelo y
espera a que el motor quede "running".

## 4. Arranque (Fase L1 — MySQL local vacío)

Desde la raíz del proyecto:

```bash
# 1) Levantar MySQL 8 local aislado (puerto host 3307, base gamificapp_dev)
docker compose -f docker-compose.dev.yml up -d

# 2) Ver que arrancó sano
docker compose -f docker-compose.dev.yml logs -f   # Ctrl+C para salir

# 3) Configurar el backend para apuntar a esa base
cp server/.env.development.example server/.env      # (Windows: copy)

# 4) Arrancar backend (crea el esquema real vía initDb.js en la primera vez)
cd server && npm run dev
```

Señal de éxito en la consola del backend:

```
✅ MySQL conectado (gamificapp_dev)
✅ Esquema verificado/creado en la base de datos.
🚀 API de GamificApp en http://localhost:3001
```

Frontend (otra terminal, desde la raíz): `npm run dev` → <http://localhost:5173>.

### Comandos útiles

| Acción | Comando |
|---|---|
| Detener (conserva datos) | `docker compose -f docker-compose.dev.yml down` |
| Detener y **borrar** datos | `docker compose -f docker-compose.dev.yml down -v` |
| Reiniciar limpio | `down -v` y luego `up -d` |

## 5. Estado por fases

| Fase | Alcance | Estado |
|---|---|---|
| **L1** | `docker-compose.dev.yml` + `.env.development.example` + esta doc | ✅ Hecho y levantado (Docker Desktop) |
| **L2** | Esquema real creado por `initDb.js` en la BD local | ✅ Hecho (18 tablas, migraciones 013/014/015 OK) |
| **L3** | `server/scripts/seedDev.js` con triple-guarda + usuarios de 3 roles | ✅ Hecho y verificado (barreras probadas) |
| **L4** | Seed con cobertura (§6): estados, XP variado, nombres largos, tipos_juego | ✅ Hecho |
| **L5** | Recorrido e2e de los 3 paneles (login real) + progreso/XP/Libro | ✅ Verificado 2026-07-20 (ver §9) |
| **L6** | (Opcional) MODO B fixtures MSW | ⚪ Diferido |

## 8-bis. Bootstrap desde CERO (hallazgo importante)

`initDb.js` ejecuta `migrarColumnasMaterias` (un `ALTER TABLE materias`) **antes**
de `conn.query(sql)` que crea la tabla. Sobre una base **totalmente vacía** eso
falla con `Table 'materias' doesn't exist`: **`initDb.js` no puede inicializar
una BD desde cero por sí solo**; asume que el esquema base ya existe. En
producción funciona porque el esquema se cargó primero con el comando documentado
(`mysql < database/produccion_defaultdb.sql`).

Por eso el arranque local **carga primero el SQL base** y luego deja que `initDb`
aplique las migraciones (idempotentes). Comando de bootstrap local usado:

```bash
# Una sola vez, sobre la BD dev vacía (replica el bootstrap real de producción):
node -e "import('node:fs/promises').then(async f=>{const m=(await import('mysql2/promise')).default;const sql=await f.readFile('database/produccion_defaultdb.sql','utf8');const c=await m.createConnection({host:'localhost',port:3307,user:'gamificapp_dev',password:'dev_local_pass',database:'gamificapp_dev',multipleStatements:true});await c.query(sql);await c.end();console.log('SQL base cargado')})"
# Luego: cd server && npm run dev   (initDb aplica migraciones)
```

Implicación para la tesis / recuperación ante desastres: una BD nueva (nuevo
deploy, restauración) requiere cargar `produccion_defaultdb.sql` antes de que el
servidor arranque. No se modificó `initDb.js` (pieza crítica de producción, fuera
del alcance de este trabajo).

## 9. Resultado de la validación e2e local (2026-07-20)

Contra `gamificapp_dev` (MySQL 8 real en 127.0.0.1:3307):

- **Auth**: login OK de admin, admin.limitado, docente.demo y estudiante; PIN
  incorrecto → 401.
- **Permisos** (server-side, por request): `admin.limitado` (permisos
  `materias`,`estudiantes`) → 200 en materias, **403** en docentes/auditoría/juegos;
  Principal → 200 en todos. Migración 014/SPEC-017 ejercitada vía `/api/admin/juegos`.
- **Progreso/XP** (`POST /api/progreso`): 1/2 → +100 XP (nota 50); 2/2 → +100 XP
  incremental (nota 100); repetir 2/2 → **+0 XP (idempotente)**; payload
  falsificado `total=3` en quiz de 2 → **400 rechazado**.
- **Misiones**: al cargar el panel, `evaluarMisiones` reconcilia retroactivamente
  y acredita bonus de las misiones alcanzadas (correcto e idempotente). **Nota:**
  el `xp_total` sembrado se ve superado por ese bonus en el primer acceso — no es
  un bug, es el motor poniéndose al día.
- **Libro/agregados docente**: `mis-estudiantes`, `detalle` (calificaciones),
  `resumen` (XP generado, promedio 83%) correctos.
- **UI**: los tres paneles renderizan con datos reales (Home estudiante con
  nivel/XP/mundos; Home docente con Centro de actividad y auditoría; Centro de
  administración con sidebar completo por permisos de Principal).

**No validado localmente** (sigue exigiendo producción/proveedores): concurrencia
real de `FOR UPDATE`, IA (sin API keys), Aiven/Render.

## 10. Validación de los 7 juegos (2026-07-20)

Seed ampliado (`seedDev.js`) con una actividad publicada de cada tipo, config
válida contra el contrato real. **Los 7 reproductores jugados a partida completa
en el navegador local** (no solo build/estático):

| Juego | Jugado en navegador | Nota (backend) | XP | Overlay 1 bloque |
|-------|--------------------|----------------|-----|------------------|
| Quiz | ✅ (corrección diferida + guardia) | 100 | 200 | ✅ |
| Verdadero/Falso | ✅ (selección no revela) | 67 (2/3) | 200 | ✅ |
| Clasificador | ✅ (tap-to-place) | 100 | 400 | ✅ |
| Memorama | ✅ (+ «Jugar otra vez» resetea) | 100 | 300 | ✅ |
| Completar | ✅ (corrección diferida) | 100 | 200 | ✅ |
| Misión Narrativa | ✅ (3 capítulos + final) | 100 | 300 | ✅ |
| Línea del tiempo | ✅ (Subir/Bajar + «Comprobar orden») | 100 | 400 | ✅ |

Verificado además: reintentos (peor no baja la mejor ni resta XP; mejor otorga
solo el XP restante; repetir el mejor no farmea), guardia de salida, Kendall
(perfecto=100, swap adyacente=83), tolerancia de Memorama (f≤n → 100), Gestión de
Juegos (activo/solo_jugar/deshabilitado sin borrar datos), y el Libro con los 7.

**Artefacto del entorno (no es bug):** el contador animado de la nota usa
`requestAnimationFrame`, que el navegador pausa en pestañas ocultas; en el preview
headless (`document.hidden=true`) el número queda en 0. La nota real se confirma
por el backend y la clase `.es-perfecto`/retroalimentación. Con pestaña visible
anima normal.

## 6. Datos de desarrollo (previstos para L3–L4, aún no implementados)

El `seedDev.js` sembrará datos **claramente ficticios** que cubran:

- Usuarios: Admin Principal, Admin restringido (permisos parciales), Docente,
  Estudiante — login **real** vía `/api/auth`.
- Listas vacías / con pocos registros / extensas (paginación de `TablaPro`).
- Nombres y textos largos (truncado y responsive).
- Actividades de los 7 tipos en estados borrador / publicada / archivada.
- Tipos de juego en estado activo / solo_jugar / deshabilitado (SPEC-017).
- Estudiantes con XP alto / medio / cero / sin progreso; calificaciones
  baja/media/alta; ranking; misiones en varios estados; auditoría; config IA.

## 7. Matriz: qué se puede validar localmente y qué no

| Prueba | ¿Local (MODO A)? | Notas |
|---|---|---|
| UI/UX de los 3 paneles autenticados | ✅ | El bloqueo que resolvemos |
| Navegación, modales, confirmaciones, formularios | ✅ | |
| Estados vacío / carga / error | ✅ | |
| Los 7 juegos: partida, vista previa, overlay, reintento, guardia | ✅ | |
| CRUD real (actividades, materias, cursos, estudiantes) | ✅ | |
| Permisos por-request y revocación en vivo | ✅ | `conPermiso` lee la BD real |
| XP idempotente / nota persistida (una instancia) | ✅ (indicativo) | |
| **Concurrencia real `FOR UPDATE` / locks multi-instancia** | ❌ | Solo producción. **No** reportar "validado" |
| **IA (Gemini/OpenAI)** | ❌ | Sin API keys dev. **No** validado por mocks |
| **Comportamiento de Aiven / cold start de Render** | ❌ | Solo producción |
| **Migraciones sobre datos productivos reales** | ❌ | Se valida en el deploy |

**Convención de reporte:** "validado localmente (instancia MySQL dev)" **≠**
"validado en producción". Nunca marcar como validado lo que solo se probó contra
una única instancia local o sin proveedores reales.

## 8. Riesgos y mantenimiento

- Deriva seed↔esquema: el seed corre después de `initDb.js` y usa las mismas
  tablas; un desajuste falla ruidosamente en local.
- Superficie aditiva y aislada: **cero** cambios en `db.js`, `auth.js`, rutas o
  migraciones. No añade deuda al camino crítico de producción.
