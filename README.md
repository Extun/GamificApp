# GamificApp

Plataforma web de gamificación educativa para niños de 6–9 años (proyecto de tesis). React 19 + Vite en el frontend, Node/Express + MySQL en el backend.

Para contexto de producto, arquitectura y reglas de trabajo, ver `CLAUDE.md` (raíz). Para arrancar el proyecto en tu máquina, ver `START_HERE.md`.

## Estructura del repositorio

```
src/            frontend (React 19 + Vite)
server/         backend (Node.js + Express)
database/       esquema SQL y migraciones versionadas
docs/           documentación viva (arquitectura, specs, auditorías)
```

## Requisitos

- **Node.js 20.19+ (rama 20) o 22.12+ (rama 22 o superior)** y npm. Lo impone Vite 8 (`engines.node = "^20.19.0 || >=22.12.0"`): Node 18 y 21 no sirven. *En Windows con `Instalar GamificApp.cmd` no hace falta tenerlo instalado: si no está, se descarga una copia portable verificada.*
- **MySQL 8+** accesible (local o remoto).

## Arranque rápido

### En Windows: doble clic

| Archivo (raíz del repo) | Qué hace |
|---|---|
| `Instalar GamificApp.cmd` | Instalación guiada completa: comprueba requisitos, prepara la base de datos, genera la configuración, construye el frontend y lo deja funcionando en <http://localhost:5173> |
| `Iniciar GamificApp.cmd` | Arranque diario (no duplica procesos si ya está en marcha) |
| `Detener GamificApp.cmd` | Cierra solo los procesos de GamificApp |

**No instala nada en el sistema.** Si falta Node.js —o el instalado no sirve— descarga una copia portable verificada por SHA-256 en `runtime/node/`, sin tocar el PATH de Windows, el registro ni pedir permisos de administrador. **MySQL 8 sí debe estar disponible**: si falta, se detiene y explica cómo obtenerlo. Es seguro repetirlo — nunca regenera credenciales existentes ni toca los datos. Detalle en `START_HERE.md`.

### Manual (cualquier sistema)

```bash
# Backend
cd server
npm install
cp .env.example .env   # completar credenciales de BD, JWT_SECRET, etc.
# La base debe existir Y tener el esquema base ANTES del primer arranque:
#   mysql -u root -p <DB_NAME> < ../database/produccion_defaultdb.sql
# (initDb.js no puede inicializar una base vacía; ver START_HERE.md)
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
| Reglas de trabajo para cambios | `CLAUDE.md` |
