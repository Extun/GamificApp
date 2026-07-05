# VISION

# Objetivo

Definir qué es GamificApp, qué problema resuelve y los principios de producto que gobiernan toda decisión de diseño y desarrollo.

# Estado

🟢 Completo — revisar solo si cambia la dirección del producto.

# Última actualización

2026-07-05 (RFC-005)

# Responsable

Fabrizio Zurita (Extun)

# Índice

1. ¿Qué es GamificApp?
2. ¿Qué problema resuelve?
3. ¿Qué hace diferente a GamificApp?
4. Principios del producto
5. La experiencia que queremos construir
6. Lo que nunca debemos hacer

# Contenido

## 1. ¿Qué es GamificApp?

GamificApp es una plataforma de gamificación educativa para niños de 6 a 9 años de educación básica elemental, creada como proyecto de tesis para una unidad educativa real de Guayaquil, Ecuador. Convierte el repaso escolar en juego: quizzes, clasificadores drag & drop y misiones narrativas donde el niño es el héroe de la historia, con XP, niveles, logros y ranking de aula. El docente crea ese contenido en minutos con ayuda de IA generativa, sin saber nada de tecnología.

## 2. ¿Qué problema resuelve?

- **Para el niño**: el repaso en casa es aburrido y no da retroalimentación inmediata. GamificApp lo convierte en una experiencia de juego donde el error no castiga y el avance siempre es visible.
- **Para el docente**: crear material interactivo de calidad toma horas que no tiene. Con GamificApp genera un quiz o una aventura narrativa completa en minutos, la revisa y la publica a toda su clase.
- **Para la institución**: no existía forma centralizada de ver quién participa y quién se queda atrás. El ranking y el progreso por reto lo hacen visible.

## 3. ¿Qué hace diferente a GamificApp?

1. **Login pensado para niños que no tienen email**: nombre + PIN derivado de su fecha de nacimiento, con código de emergencia impreso en el carné. Nada de contraseñas imposibles de recordar a los 7 años.
2. **La IA integrada al flujo del docente**, no como chatbot aparte: genera preguntas verificadas y aventuras narrativas completas con esquema JSON estructurado, listas para publicar.
3. **Filosofía "siempre se termina ganando"**: equivocarse muestra una pista y permite reintentar; solo el primer intento puntúa, pero ningún niño se queda bloqueado frente a una pantalla de fracaso.
4. **Extensibilidad sin migraciones**: cualquier mecánica nueva de juego entra como configuración JSON — el motor no cambia.
5. **Contexto local real**: en español, con cursos ("2do A"), materias del currículo ecuatoriano y pensado para las condiciones reales de la escuela (dispositivos compartidos, conexión inestable — de ahí la caché local).

## 4. Principios del producto

1. **El niño primero**: cada texto, botón e interacción debe poder entenderlo un niño de 6 años que apenas lee.
2. **El error enseña, no castiga**: pistas en vez de tachas rojas; reintentos ilimitados; celebración al terminar.
3. **Progreso siempre visible**: XP, nivel y ranking en tiempo real — la motivación nace de ver el avance.
4. **El docente es autor, no administrador**: su tiempo va a crear contenido y acompañar, no a configurar sistemas.
5. **Honestidad de datos**: nada de números inventados ni promesas vacías en pantalla; si no hay datos, se dice claramente qué hacer para que los haya.
6. **Simplicidad institucional**: el admin resuelve en segundos (alta, PIN, baja) y se va.

## 5. La experiencia que queremos construir

Un estudiante entra y en un vistazo sabe cuánto ha avanzado y qué jugar a continuación — un clic y está aprendiendo. Un docente entra y retoma exactamente donde dejó su trabajo, publica un reto nuevo antes del recreo y ve quién lo completó por la tarde. Un administrador entra una vez por semana, confirma que todo está sano y sale. Nadie necesita un manual; la pantalla siempre sugiere el siguiente paso.

## 6. Lo que nunca debemos hacer

- **Nunca mostrar datos ficticios o hardcodeados** como si fueran reales.
- **Nunca bloquear a un niño por equivocarse** ni exponerlo a comparaciones humillantes (el ranking celebra a los primeros, no señala a los últimos).
- **Nunca pedir al estudiante datos personales innecesarios** (email, teléfono) ni exponer su información a otros roles sin necesidad.
- **Nunca enviar secretos al navegador** (API keys, credenciales) ni confiar en el cliente para decisiones de permisos o XP.
- **Nunca implementar funcionalidades fuera de un RFC aprobado** ni romper la compatibilidad de los retos ya publicados por docentes.
- **Nunca complicar el login del niño**: el acceso con nombre + PIN de 6 caracteres es intocable como principio.

# Pendientes

- Ninguno. Revisar si el alcance de tesis evoluciona a producto multi-institución.
