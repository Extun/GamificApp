# Decisions — Cómo registrar decisiones arquitectónicas (ADR)

# Objetivo

Definir cómo se registran las decisiones arquitectónicas (Architecture Decision Records) para que el "por qué" de cada elección técnica sobreviva al chat y a la memoria de las personas.

# Estado

🟢 Completo

# Última actualización

2026-07-05 (RFC-005)

# Responsable

Fabrizio Zurita (Extun)

# Índice

1. Qué merece un ADR
2. Nombre del archivo
3. Formato obligatorio
4. Reglas

# Contenido

## 1. Qué merece un ADR

Toda decisión técnica **no trivial y difícil de revertir**, por ejemplo: elegir dónde se almacenan los archivos, cómo se estructura la navegación, qué proveedor de IA se usa, cómo se calcula el XP. No merecen ADR las decisiones triviales (nombres de variables, un estilo CSS puntual).

Ejemplos de decisiones ya tomadas que merecerían ADR retroactivo: PIN derivado de la fecha de nacimiento, retos polimórficos en `configuracion_json`, archivos como base64 en MySQL, proxy de IA server-side.

## 2. Nombre del archivo

```
docs/decisions/ADR-XXX-titulo-corto-en-kebab-case.md
```

Numeración secuencial de tres dígitos, nunca reutilizada. Ejemplo: `ADR-001-archivos-base64-en-mysql.md`.

## 3. Formato obligatorio

```markdown
# ADR-XXX — <Título de la decisión>

# Objetivo
<Qué problema obligaba a decidir.>

# Estado
🟡 Propuesta | ✅ Aceptada | ❌ Rechazada | ♻️ Reemplazada por ADR-YYY

# Última actualización
AAAA-MM-DD

# Responsable
<Quién decidió.>

# Índice
1. Contexto
2. Opciones consideradas
3. Decisión
4. Consecuencias

# Contenido

## 1. Contexto
<Situación y restricciones en el momento de decidir.>

## 2. Opciones consideradas
<Cada alternativa con sus pros y contras, honestamente.>

## 3. Decisión
<Qué se eligió y el porqué principal.>

## 4. Consecuencias
<Lo bueno, lo malo y la deuda que esta decisión crea. Qué la haría revisitarse.>

# Pendientes
<Seguimientos, o "Ninguno".>
```

## 4. Reglas

1. Un ADR **nunca se edita para cambiar la decisión**: si la decisión cambia, se crea un ADR nuevo y el viejo se marca "♻️ Reemplazada por ADR-YYY". El historial de decisiones es inmutable.
2. Los ADR se escriben en el momento de decidir (durante un RFC), no semanas después.
3. Todo RFC que tome una decisión arquitectónica debe referenciar su ADR, y viceversa.
4. Un ADR rechazado también se conserva: saber qué se descartó y por qué evita repetir debates.

# Pendientes

- Crear ADRs retroactivos para las 4 decisiones históricas listadas en §1 (propuesto como backlog).
