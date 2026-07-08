# RFC — Formato oficial

# Objetivo

Definir el formato único de los RFC (Request for Comments) de GamificApp. Ningún cambio de funcionalidad, arquitectura, API o base de datos se implementa sin un RFC que lo autorice.

# Estado

🟢 Completo

# Última actualización

2026-07-05 (RFC-005)

# Responsable

Fabrizio Zurita (Extun)

# Índice

1. Qué es un RFC en este proyecto
2. Nombre del archivo
3. Formato obligatorio
4. Ciclo de vida
5. Reglas

# Contenido

## 1. Qué es un RFC en este proyecto

Un RFC es el documento que **autoriza y delimita** un bloque de trabajo. Define qué se hace, qué NO se hace y cómo se sabrá que quedó bien. Es la única fuente de autorización para modificar el sistema.

## 2. Nombre del archivo

```
docs/rfc/RFC-XXX-titulo-corto-en-kebab-case.md
```

Ejemplo: `RFC-006-navegacion-v2.md`. La numeración es secuencial y nunca se reutiliza.

## 3. Formato obligatorio

```markdown
# RFC-XXX — <Título>

# Objetivo
<Qué se quiere lograr y por qué, en pocas frases.>

# Estado
⚪ Borrador | 🟡 Activo | ✅ Completado | ❌ Rechazado

# Última actualización
AAAA-MM-DD

# Responsable
<Quién lo propone / quién lo ejecuta.>

# Índice
1. Contexto
2. Alcance
3. Fuera de alcance
4. Especificación
5. Criterios de aceptación
6. Riesgos

# Contenido

## 1. Contexto
<Qué documentos previos lo sustentan (auditorías, blueprint, decisiones).>

## 2. Alcance
<Lista concreta de lo que SÍ se hace.>

## 3. Fuera de alcance
<Lista explícita de lo que NO se toca (backend, BD, APIs, etc.).>

## 4. Especificación
<El detalle: estructuras, órdenes, comportamientos esperados.>

## 5. Criterios de aceptación
<Checklist verificable: "✓ ..." — condiciones objetivas de cierre.>

## 6. Riesgos
<Qué puede salir mal y cómo se mitiga.>

# Pendientes
<Decisiones abiertas antes de poder ejecutarlo, o "Ninguno".>
```

## 4. Ciclo de vida

1. **Borrador** → se redacta y discute.
2. **Activo** → aprobado; es el único trabajo autorizado en curso.
3. **Completado** → criterios de aceptación cumplidos + changelog creado (`docs/changelog/`).
4. **Rechazado** → se conserva el archivo con la razón, para memoria del proyecto.

## 5. Reglas

1. Un RFC activo a la vez por área; los cambios fuera de su alcance se anotan como backlog, no se cuelan.
2. Todo RFC que toque backend, APIs o BD debe declararlo explícitamente en su alcance; si no lo declara, está prohibido tocarlos.
3. Al completarse: changelog + actualización de `PROJECT_CONTEXT.md` y `MASTER_PLAN.md`.
4. Los RFC históricos (001-005) nacieron como mensajes de chat; sus entregables están en `docs/`. A partir de RFC-006, todo RFC vive en esta carpeta con este formato.

# Pendientes

- Redactar `RFC-006-navegacion-v2.md` como primer RFC con el formato oficial.
