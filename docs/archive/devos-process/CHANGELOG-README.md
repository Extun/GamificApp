# Changelog — Cómo documentar cada RFC terminado

# Objetivo

Definir el procedimiento obligatorio para registrar los cambios de cada RFC completado, de modo que el historial del proyecto viva en el repositorio y no en ningún chat.

# Estado

🟢 Completo

# Última actualización

2026-07-05 (RFC-005)

# Responsable

Fabrizio Zurita (Extun)

# Índice

1. Cuándo se escribe un changelog
2. Nombre del archivo
3. Formato obligatorio
4. Reglas

# Contenido

## 1. Cuándo se escribe un changelog

Al cerrar **cada RFC**, sin excepción — incluso si el RFC solo produjo documentación. Ningún RFC se considera terminado sin su changelog.

## 2. Nombre del archivo

```
docs/changelog/CHANGELOG-RFC-XXX.md
```

Donde `XXX` es el número del RFC con tres dígitos (ej. `CHANGELOG-RFC-004.md`).

## 3. Formato obligatorio

```markdown
# CHANGELOG — RFC-XXX: <Título del RFC>

# Objetivo
<Qué buscaba el RFC, en 1-2 frases.>

# Estado
✅ Completado

# Última actualización
AAAA-MM-DD

# Responsable
<Quién lo ejecutó.>

# Índice
1. Archivos creados
2. Archivos modificados
3. Archivos eliminados
4. Cambios funcionales
5. Verificación realizada
6. Deuda/mejoras detectadas (NO implementadas)

# Contenido

## 1. Archivos creados
- `ruta/archivo` — para qué sirve.

## 2. Archivos modificados
- `ruta/archivo` — qué cambió y por qué.

## 3. Archivos eliminados
- (o "Ninguno")

## 4. Cambios funcionales
- Qué ve/hace distinto cada rol después de este RFC. Si no hubo cambios de comportamiento, decirlo.

## 5. Verificación realizada
- Comandos ejecutados (build/lint) y pruebas en navegador, con su resultado real.

## 6. Deuda/mejoras detectadas (NO implementadas)
- Ítems que se anotaron al backlog de MASTER_PLAN.md durante el trabajo.

# Pendientes
- (o "Ninguno")
```

## 4. Reglas

1. El changelog describe **lo que realmente se hizo**, no lo que el RFC pedía — si algo quedó fuera, se dice.
2. La sección "Verificación realizada" nunca se deja vacía ni se exagera: se registra solo lo efectivamente probado.
3. Tras crear el changelog, actualizar `PROJECT_CONTEXT.md` (tabla de RFC) y `MASTER_PLAN.md` (fases/backlog).
4. Los cambios detectados pero no autorizados van a la sección 6, jamás al código.

# Pendientes

- Crear retroactivamente los changelogs de RFC-001 a RFC-004 (opcional, propuesto como tarea del backlog).
