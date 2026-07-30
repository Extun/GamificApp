# GamificApp

Plataforma web de gamificación educativa para niños de 6–9 años (proyecto de tesis). React 19 + Vite en el frontend, Node/Express + MySQL en el backend.

Para contexto de producto, arquitectura y reglas de trabajo, ver `CONTRIBUTING.md` (raíz). Para arrancar el proyecto en tu máquina, ver `START_HERE.md`.

## Estructura del repositorio

```
src/            frontend (React 19 + Vite)
server/         backend (Node.js + Express)
database/       esquema SQL y migraciones versionadas
docs/           documentación viva (arquitectura, specs, auditorías)
```

## Requisitos

- **Node.js 20.19+ (rama 20) o 22.12+ (rama 22 o superior)** y npm. Lo impone Vite 8 (`engines.node = "^20.19.0 || >=22.12.0"`): Node 18 y 21 no sirven. *En Windows con `Instalar GamificApp.cmd` no hace falta tenerlo instalado: si no está, se descarga una copia portable verificada.*
- **MySQL 8+** accesible (local o remoto). *En Windows con `Instalar GamificApp.cmd` tampoco hace falta instalarlo: la distribución trae su propio MySQL 8 en `runtime/mysql`.*

## Arranque rápido

### En Windows: doble clic

| Archivo (raíz del repo) | Qué hace |
|---|---|
| `Instalar GamificApp.cmd` | Instalación guiada completa: comprueba requisitos, prepara la base de datos, genera la configuración, construye el frontend y lo deja funcionando en <http://localhost:5173> |
| `Iniciar GamificApp.cmd` | Arranque diario (no duplica procesos si ya está en marcha) |
| `Detener GamificApp.cmd` | Cierra solo los procesos de GamificApp |

**No instala nada en el sistema.** Si falta Node.js —o el instalado no sirve— descarga una copia portable verificada por SHA-256 en `runtime/node/`, sin tocar el PATH de Windows, el registro ni pedir permisos de administrador. **La base de datos también la pone GamificApp**: arranca el MySQL 8 de `runtime/mysql` como un proceso de usuario más (sin servicio de Windows, sin Docker y sin permisos de administrador), escuchando solo en `127.0.0.1:3308` —con reserva 3309-3315 si ese puerto está ocupado— y **guardando los datos en `%LOCALAPPDATA%\GamificApp\`, fuera de la carpeta del proyecto**, para que sobrevivan a mover o reemplazar GamificApp. Si esa carpeta `runtime/mysql` no viene incluida, se usa un MySQL 8 ya instalado en el equipo. Es seguro repetirlo — nunca regenera credenciales existentes ni toca los datos.

## Paquete de distribución

Para entregar GamificApp a alguien que solo quiere usarla, hay un empaquetador reproducible:

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File instalador\empaquetar.ps1
```

Deja en `release\GamificApp\` (ignorado por Git) una carpeta que se comprime y se entrega. Quien la recibe **extrae, hace doble clic en `Instalar GamificApp.cmd` y ya está**: no necesita Node, MySQL, npm, Docker, herramientas de desarrollo **ni conexión a internet**, porque el paquete lleva los runtimes portables y las dependencias (`node_modules`) ya instaladas.

| Opción | Para qué |
|---|---|
| `-Salida <ruta>` | generar el paquete en otra ubicación (recomendado si el repositorio vive en una carpeta sincronizada con OneDrive) |
| `-Zip` | comprimir el resultado además de dejar la carpeta (~244 MB desde 750,8 MB, unos 6-7 minutos) |
| `-SaltarBuild` | reutilizar `dist/` tal cual, sin reconstruir |
| `-SinDependencias` | no incluir `node_modules` (paquete más pequeño, pero la instalación necesitará internet) |

El empaquetador **construye el frontend antes de copiar y aborta si el build falla**, poda `runtime\mysql` con reglas demostradas (~925 MB → ~398 MB), incluye el runtime de Visual C++ junto a `mysqld.exe` y **audita el resultado: si detecta un secreto, un dato o un artefacto de la máquina de desarrollo, no entrega el paquete**. Qué contiene, qué se genera al instalar y qué nunca viaja está declarado como datos auditables en la cabecera de `instalador\empaquetar.ps1`.

### Manual (cualquier sistema)

```bash
# Backend
cd server
npm install
cp .env.example .env   # completar credenciales de BD, JWT_SECRET, etc.
# La base debe existir Y tener el esquema base ANTES del primer arranque:
#   mysql -u root -p <DB_NAME> < ../database/produccion_defaultdb.sql
# (initDb.js no puede inicializar una base vacía)
npm run dev

# Frontend (en otra terminal, desde la raíz)
npm install
npm run dev
```

## Documentación

| Pregunta | Dónde |
|---|---|
| ¿Qué es GamificApp y cómo está construido? | `docs/architecture/PROJECT_CONTEXT.md` |
| ¿Qué está implementado hoy? | `docs/architecture/CURRENT_STATE.md` |
| ¿Qué sigue en el roadmap? | `docs/architecture/MASTER_PLAN.md` |
| ¿Cómo corro el proyecto localmente? | `START_HERE.md` |
| ¿Cómo preparo un entorno local con Docker? | `docs/DEV-ENTORNO-LOCAL.md` |
| ¿Cómo añado un tipo de juego nuevo? | `docs/COMO-AGREGAR-UN-JUEGO.md` |
| Reglas de trabajo para cambios | `CONTRIBUTING.md` |
