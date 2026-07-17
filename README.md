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

- Node.js 18+ y npm
- MySQL 8+ accesible (local o remoto)

## Arranque rápido

Ver la guía completa en `START_HERE.md`. En resumen:

```bash
# Backend
cd server
npm install
cp .env.example .env   # completar credenciales de BD, JWT_SECRET, etc.
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
