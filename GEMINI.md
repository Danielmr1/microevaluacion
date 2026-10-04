# Reglas Obligatorias y Permanentes del Proyecto Microevaluación

Este documento contiene las reglas de desarrollo y arquitectura inmutables para este proyecto.
Todo asistente de inteligencia artificial o desarrollador que opere en este repositorio DEBE seguir estas reglas de forma obligatoria en cada turno e interacción.

---

## 1. Regla de Oro: Cero Regresión en Respuesta Libre
* El sistema original de **Respuesta Libre** (evaluaciones tradicionales con consigna abierta, cuadrícula de cálculo amplia, franja manuscrita `Rpta: _______`, lectura de QR y corrección por IA con rúbrica) ya está **terminado, probado y funcionando**.
* **ESTÁ TERMINANTEMENTE PROHIBIDO** alterar o deshabilitar cualquier aspecto de la Respuesta Libre para acomodar o facilitar el desarrollo de nuevas funciones (como las opciones múltiples / OMR).
* El camino por defecto (`else` o fallback) de cualquier función general SIEMPRE debe ser el comportamiento probado de Respuesta Libre.

---

## 2. Aislamiento Total de Alternativas (Opción Múltiple / OMR)
* Las preguntas de opción múltiple (OMR) son un módulo secundario que **debe vivir 100% aislado**.
* **Condición de activación estricta:** Una evaluación o sesión SOLO se considera de alternativas si de manera explícita y exclusiva cumple:
  ```javascript
  evaluation.type === 'mc'
  ```
* **Prohibición de inferencias y atajos:**
  * PROHIBIDO usar `!isExplicitFree` (asumir que algo es alternativa solo porque no dice libre).
  * PROHIBIDO usar `|| questionCount` o `|| questions.length` para inferir que es OMR.
  * Si la propiedad `type` es nula, vacía o diferente de `'mc'`, el sistema DEBE tratar la evaluación como Respuesta Libre.

---

## 3. Integridad del Banco de Preguntas
* El banco de preguntas de Respuesta Libre en `index.html` (`evaluacionesDelGradoActual`) **NUNCA** debe ocultar una pregunta basándose en si tiene `questionCount: 1`.
* Para excluir alternativas del banco libre, la única comprobación válida es:
  ```javascript
  if (ev.type === 'mc') return false;
  ```
* Las preguntas de respuesta libre del docente deben permanecer visibles siempre que coincidan con el grado del salón.

---

## 4. Geometría Sagrada de la Ficha A5 y PDF
* **El encabezado NO se achica:** Mantiene siempre una altura fija de **20 mm** en todos los tipos de evaluación (1 pregunta, 2 preguntas o respuesta libre).
* **Zona limpia de marcadores ArUco (Clearance):** Los marcadores ArUco de las 4 esquinas miden 10 mm y se sitúan a 5 mm de los bordes (ocupan hasta 15 mm).
  * La cabecera `.card-header` DEBE tener un espaciado interior (`padding`) horizontal de **al menos 16 mm**.
  * Ningún texto, nombre de alumno ni código QR puede invadir o situarse a menos de 4 mm del borde interno de un marcador ArUco.
* **Ajuste para múltiples preguntas:** Si una ficha contiene 2 preguntas o textos largos de 1 a 3 líneas, **lo único que se achica es la cuadrícula de cálculo (borrador)**. Jamás se achica el encabezado ni los márgenes del QR.

---

## 5. Prohibición de Parches y "Workarounds" Rápidos
* Antes de modificar cualquier función compartida (`createA5Card`, `renderBankCards`, `triggerAutoCapture`, `ROIProcessor`, `ClassroomData`), el agente debe verificar:
  1. ¿Este cambio altera el comportamiento de una ficha de Respuesta Libre?
  2. ¿Este cambio oculta preguntas del banco?
  3. ¿Este cambio rompe la lectura del QR?
* Si la respuesta a cualquiera de esas tres preguntas es afirmativa, **el cambio queda automáticamente vetado** y debe aislarse en una rama de ejecución independiente para `type === 'mc'`.

---

## 6. Integridad Total de Creación de Preguntas (Guardarraíl Obligatorio)
* **Toda pregunta que ingrese al banco de preguntas DEBE contener de forma obligatoria:**
  1. Enunciado claro del problema.
  2. Sus 4 alternativas completas (A, B, C, D) con su clave correcta seleccionada.
  3. Su análisis pedagógico y rúbrica completa generada por IA (Gemini): solución canónica, procedimiento de resolución, criterios de evaluación ponderados y errores previsibles.
* **PROHIBICIÓN ABSOLUTA de guardar preguntas incompletas o sin análisis:**
  * **ESTÁ TERMINANTEMENTE PROHIBIDO** guardar o dar de alta cualquier pregunta sin sus 4 alternativas y su clave.
  * **ESTÁ TERMINANTEMENTE PROHIBIDO** guardar o dar de alta cualquier pregunta sin su rúbrica/análisis de IA.
  * **PROHIBIDO cualquier atajo o bypass:** no debe existir ningún botón de "guardar sin análisis", "omitir rúbrica" o similar, ni siquiera ante caídas de red o timeouts de la IA.
  * Si Gemini falla, da error o la solicitud expira, la pregunta **BAJO NINGUNA CIRCUNSTANCIA SE GUARDA EN EL BANCO**. El sistema únicamente debe permitir al docente:
    - **Reintentar con la IA.**
    - **Editar o corregir el enunciado y las alternativas.**
    - **Cancelar.**
