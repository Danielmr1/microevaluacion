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

---

## 7. Integridad del Modo de Corrección (Aislamiento de IA en Modo Rápido)
* Si una sesión de alternativas está configurada en modo rápido (`session.correctionMode === 'quick'`), el sistema **TIENE TERMINANTEMENTE PROHIBIDO** disparar llamadas de red a modelos de IA.
* La corrección en este modo es 100% determinista, instantánea y local mediante el algoritmo OMR.
* La foto de la cuadrícula de cálculo se preserva siempre como respaldo visual, pero sin consumir cuota ni bloquear la experiencia con llamadas innecesarias a la nube.

---

## 8. Coherencia Total del Borrado de Resultados (Anti-Desincronización)
* Toda acción de borrado de resultados (sea individual por alumno o reinicio total de sesión) **DEBE sincronizar en tiempo real los 3 niveles del sistema**:
  1. **Base de Datos (Supabase):** Eliminar el registro en `microeval_results` con `deleteResult` o `deleteSessionResults`.
  2. **Memoria del Escáner (`scanner.js`):** Actualizar el conjunto `evaluatedStudentIds` (`removeEvaluatedStudent` o `setEvaluatedStudents([])`).
  3. **Interfaz de Usuario (UI):** Decrementar el contador en vivo y cambiar el estado del alumno en la nómina (de verde a gris) inmediatamente, para que el docente pueda volver a escanear a ese alumno de inmediato sin falsos avisos de duplicado.

---

## 9. Resiliencia de Aula: Falla Silenciosa y Fallback de IA (Cero Bloqueo)
* El ritmo del docente en el aula escaneando fichas **NUNCA debe ser detenido ni bloqueado por la IA**.
* Si la llamada a Gemini excede el tiempo límite (timeout de 4 segundos), hay intermitencia de red o falla el servidor:
  * El escáner **JAMÁS congela la pantalla** ni impide pasar al siguiente alumno.
  * La imagen y el OMR se almacenan con estado `Pendiente de análisis IA`.
  * La cámara se desbloquea de inmediato para continuar con el siguiente estudiante.

---

## 10. Sanitización y Resiliencia en la Exportación a Excel
* El generador de planillas de cálculo (SheetJS) **NUNCA debe arrojar excepciones no capturadas ni romper la aplicación**.
* Todo campo nulo o indefinido debe sanitizarse con guion (`—`).
* Los nombres de estudiantes con caracteres especiales (`Ñ`, tildes, símbolos) deben exportarse con codificación UTF-8 estricta para garantizar compatibilidad con cualquier versión de Microsoft Excel en Windows y Mac.

---

## 11. No-Invasión del Clasificador Neuronal Local (Gatekeeper INT8)
* La red neuronal ligera local (simulador INT8) actúa **únicamente como filtro de eficiencia** (detección de cuadrícula vacía / pre-lectura de dígitos aislados) y **NUNCA califica ni reemplaza el criterio pedagógico de Gemini**.
* Si la red local presenta baja certeza, ambigüedad o duda, **TIENE TERMINANTEMENTE PROHIBIDO descartar o penalizar el procedimiento del estudiante**: delega la imagen íntegra a Gemini para su evaluación integral.
* El tiempo de inferencia local no debe superar los **50 ms** por captura para preservar la fluidez ininterrumpida del escaneo en el aula.

---

## 12. Preservación de Versión Funcional Estable (Checkpoints y Cero Pérdida)
* **Siempre debe existir una versión funcional y verificada del sistema.**
* Antes de iniciar cualquier refactorización o integración mayor (como módulos de IA o redes neuronales), el estado funcional anterior debe estar documentado, respaldado y con su número de versión claramente etiquetado (ej. `v3.1.6`).
* Si una actualización o experimento introduce inestabilidad en módulos previamente probados, **se debe priorizar la restauración inmediata del estado estable verificado**.

---

## 13. Guardarraíl de Borde y Margen Perimetral en PDF (ArUco y QR)
* Toda ficha, tarjeta o cartilla imprimible que contenga marcadores ArUco y código QR **DEBE contar obligatoriamente con un marco perimetral negro cerrado (`border: 1mm solid #000000`)**.
* Entre el límite físico exterior de la hoja A4 y el marco negro de la ficha **SIEMPRE debe existir un espacio libre en blanco (margen/padding)**, garantizando que el borde nunca quede pegado al filo del papel ni sea mutilado por los márgenes de impresión de la impresora física.


