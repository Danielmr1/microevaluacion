# SPEC-06: Asistente EVA y Guardarraíles Copilot

* **Versión:** 1.0.0
* **Estado:** Aprobada
* **Módulos de Código:** `copilot-command.js`, `daily-quota.js`, `index.html`
* **Fuente Canónica:** `MANUAL_SISTEMA.md` (Sección 1 y 3), `MASTER.md` (Sección 5)

---

## 1. Propósito Pedagógico y Técnico

**EVA** es la copiloto de inteligencia artificial integrada en Microevaluación. Asiste al docente en lenguaje natural para la creación de preguntas contextualizadas, generación de rúbricas pedagógicas, configuración rápida de sesiones y resolución de dudas sobre la plataforma.

---

## 2. Reglas Inmutables y Guardarraíles

1. **Delimitación Temática Estricta (Guardarraíl Antidistorsión):**
   * EVA está programada para responder **exclusivamente sobre dos dominios**:
     1. Didáctica de la matemática escolar (Primaria y Secundaria).
     2. Uso operativo de la plataforma Microevaluación (salones, escáner, cartillas, banco, sesiones).
   * **Sistema de 3 Strikes (24 horas de bloqueo):**
     * Si el docente realiza consultas fuera de estos dominios (temas no escolares, política, entretenimiento, código ajeno), el sistema emite hasta 2 advertencias pedagógicas.
     * Al tercer strike, el chat de IA se bloquea durante **24 horas**.
     * El bloqueo afecta únicamente al chat de IA: todas las funciones operativas de la plataforma (escáner, banco, salones, impresión de cartillas) continúan operando con total normalidad.
2. **Cumplimiento de la Regla «No existe salón sin alumnos»:**
   * Si el docente pide a EVA crear un salón pero no proporciona la lista de estudiantes, EVA **tiene prohibido crear el salón vacío**: debe responder solicitando la nómina de nombres antes de emitir cualquier acción a la base de datos.
3. **Guardarraíl de Rúbricas Completas (Regla 6):**
   * Toda pregunta matemática generada por EVA a través del chat debe nacer con sus 4 alternativas (A, B, C, D) y su análisis de rúbrica completo antes de ingresar al banco.

---

## 3. Criterios de Aceptación (Verificables)

* `CRIT-EVA-01`: **Bloqueo de Consultas Fuera de Tema**
  * *Dado* un mensaje del usuario que consulta sobre cocina, fútbol o redacción de novelas
  * *Cuando* EVA procesa el mensaje
  * *Entonces* EVA debe declinar amablemente la respuesta, recordar su propósito de aula e incrementar el contador de strikes en LocalStorage.

* `CRIT-EVA-02`: **Activación del Bloqueo por 24 Horas tras 3 Strikes**
  * *Dado* un usuario que acumula 3 advertencias temáticas
  * *Cuando* intente enviar un nuevo mensaje en el chat
  * *Entonces* el sistema debe mostrar el mensaje de bloqueo temporal con el tiempo restante, impidiendo llamadas a la API de Gemini durante 24 horas.

* `CRIT-EVA-03`: **Exigencia de Alumnos en Creación de Salones**
  * *Dado* el comando *"Crea el salón de 5to B Secundaria"* sin nombres
  * *Cuando* EVA recibe la instrucción
  * *Entonces* debe pausar la creación y pedir la nómina de estudiantes explícitamente antes de renderizar la tarjeta de confirmación.
