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

---

## 14. Guardarraíl de Geometría Visual y Validación de Proporciones Físicas Reales
* **Prohibición de validaciones abstractas y unidimensionales:** Ningún test de interfaz gráfica o de simulador interactivo de fichas puede darse por aprobado únicamente validando strings de texto HTML, variables en memoria o ausencia de desborde horizontal (`clipping`).
* **Verificación dimensional estricta obligatoria (Tolerancia Cero ±1 mm):** Todo cambio en estilos CSS, contenedores flex o generadores de tarjetas DEBE validarse midiendo en un motor de navegador real (Chromium / Edge) las dimensiones computadas de la caja renderizada en cada formato:
  1. **A6 Horizontal:** Ancho `132 mm` (±1 mm) × Alto `89 mm` (±1 mm). Proporción apaisada W/H ≈ 1.48. **PROHIBIDO** cualquier estiramiento vertical o vacío blanco deformado.
  2. **A6 Vertical:** Ancho `89 mm` (±1 mm) × Alto `132 mm` (±1 mm). Proporción vertical W/H ≈ 0.67.
  3. **A5 Horizontal:** Ancho `186 mm` (±1 mm) × Alto `134 mm` (±1 mm). Proporción apaisada W/H ≈ 1.39. **PROHIBIDO** el aplastamiento horizontal en formato cuadrado.
  4. **A5 Vertical:** Ancho `132 mm` (±1 mm) × Alto `182 mm` (±1 mm). Proporción vertical W/H ≈ 0.72.
* **Integridad de contenedores y reglas Flex (`.sim-card-host` / `.card-*`):** Las dimensiones base de las tarjetas (`width` y `height`) son soberanas e inmutables. Ninguna propiedad `flex` o `flex-basis` de contenedores padre puede sobreescribir, aplastar o estirar el eje de una ficha.
* Si cualquiera de estas proporciones se desvía más de 1 mm o presenta deformación de aspecto en el renderizado, **el cambio queda automáticamente vetado y los tests deben fallar de inmediato en rojo**.

---

## 15. Guardarraíl Anti-Asunción y Prohibición de Respuestas Complacientes o Vacías
* **Prohibición Absoluta de Asumir Requerimientos o Estilos:** Está terminantemente prohibido asumir paletas de colores (como fondos oscuros por defecto), estéticas, jerarquías o interpretaciones de diseño sin confirmación explícita.
* **Prohibición de Frases Vacías de Falsa Certidumbre:**
  * Queda vetado responder con expresiones como *"Ya te entendí"*, *"Ahora sí está 100% claro"* o similares, a menos que el usuario haya confirmado puntualmente cada elemento.
  * El asistente NO debe fingir comprensión para apresurarse a escribir código.
* **Obligación de Inspección y Pregunta Previa:**
  * Ante cualquier enlace, imagen o referente externo, el asistente DEBE inspeccionar el contenido real (abrir la página o analizar la imagen) ANTES de opinar o planificar.
  * Ante la menor ambigüedad o decisión de diseño (colores, tonos, estructura), el asistente **TIENE LA OBLIGACIÓN DE PREGUNTAR PRIMERO** y acordar el camino antes de modificar archivos o escribir código nuevo.
  * Queda prohibido sobrecargar pantallas con botones duplicados, textos explicativos no pedidos o plantillas genéricas de IA para "rellenar espacio".

---

## 16. Protocolo de Bloqueo por Asunción (Tolerancia Cero y Palabras de Control)
* **Prohibición de Ejecución Anticipada:** El asistente tiene terminantemente prohibido modificar archivos, escribir código o dar por resuelta una tarea de diseño/layout sin que el usuario haya aprobado explícitamente el plan técnico y las dimensiones reales.
* **Prohibición de Falso Éxito:** Queda estrictamente vetado declarar una solución como funcional o dar números de versión para subir a GitHub sin haber verificado con evidencia física y mediciones concretas en el entorno (DOM, resolución, scroll, proporciones).
* **Palabras Clave de Control Inmediato:**
  * Si el usuario escribe **"DETENTE"**, **"ESTÁS ASUMIENDO"**, **"NO CAMBIES DE TEMA"** o cualquier señalamiento de asunción:
    1. El asistente DEBE frenar en seco de forma inmediata.
    2. Tiene prohibido generar código, parches o justificaciones en ese turno.
    3. Debe responder únicamente reconociendo el punto específico señalado y esperando la instrucción directa del usuario.
* **Requisito Previo Obligatorio para Cambios de Layout:**
  * Ante cualquier cambio de visualización o layout, el asistente DEBE presentar primero:
    1. Las medidas y límites reales del problema (ej. ancho en mm y px de una hoja A4 vs ancho de viewport disponible).
    2. La causa exacta por la que falla el comportamiento actual.
    3. La propuesta técnica clara en lenguaje directo, sin código.
  * Solo una vez que el usuario responda confirmando o autorizando esa propuesta, el asistente tiene permiso de tocar archivos.

---

## 17. Guardarraíl de Límite Estricto de 50 Preguntas en el Banco y Sincronización entre Dispositivos
* **Tope Máximo Absoluto de 50 Preguntas por Cuenta:**
  * Un usuario NUNCA debe tener más de 50 preguntas en total en su cuenta (distribuidas libremente entre cualquier grado o etapa).
  * El sistema SIEMPRE debe mostrar en el Banco el 100% de las preguntas del usuario (hasta 50), sin preguntas ocultas ni límites artificiales de consulta.
  * Si el usuario alcanza 50 preguntas e intenta crear la pregunta #51, el sistema **TIENE TERMINANTEMENTE PROHIBIDO** guardar o generar dicha pregunta (ni en Supabase ni en `localStorage` ni mediante llamadas a IA); debe bloquear la acción y notificar al docente que debe eliminar previamente alguna pregunta que ya no use.
* **Aislamiento Total de la Cartilla OMR (Rama 3):**
  * Los casilleros numerados y hojas de respuestas de la Cartilla OMR (de 6 a 20 burbujas) son plantillas de sesión temporales (`SESSION_EVALUATIONS`) y **JAMÁS deben contar para el límite de 50 preguntas del banco**.
  * Solo los problemas matemáticos reales con consigna didáctica redactados individualmente pueden ingresar al banco y consumir cupo.
* **Sincronización Bidireccional y Cero Preguntas Fantasma:**
  * Al abrir el Banco de Preguntas o el selector de fichas, el sistema debe sincronizar automáticamente con Supabase en segundo plano para reflejar cambios hechos en otros dispositivos sin requerir recargar la página (F5).
  * Si una pregunta se elimina en un dispositivo, el borrado debe replicarse en Supabase y eliminarse del `localStorage` de todos los dispositivos del docente, quedando estrictamente prohibido revivir preguntas eliminadas como "preguntas fantasma".
  * Ante fallos de conexión o expiración de tokens, las preguntas guardadas deben encolarse en la cola offline (`microeval_sync_queue`) y sincronizarse automáticamente al restablecerse la red.

---

## 18. Guardarraíl de Sincronización Multi-Dispositivo y Cero Sesiones Fantasma (Tope de 8 Sesiones)
* **Autoridad Soberana de la Nube (Supabase):**
  * La base de datos en Supabase es la única fuente de verdad para las sesiones guardadas de la cuenta del docente.
  * Si una sesión guardada se elimina en un dispositivo (ej. PC), la eliminación debe reflejarse en la nube y **purgarse automáticamente del `localStorage` de todos los demás dispositivos del docente (celular/tablet)** al abrir la aplicación o consultar las sesiones.
* **Prohibición Terminante de Re-subir Sesiones Huérfanas (Anti-Fantasmas):**
  * **ESTÁ TERMINANTEMENTE PROHIBIDO** que un dispositivo móvil o secundario vuelva a subir a Supabase una sesión simplemente porque la tiene guardada en su caché local y ya no existe en la nube.
  * Solo se permite subir sesiones locales si cuentan con una marca explícita y verificada de borrador creado sin conexión en ese mismo dispositivo (`pendingCloudSync: true`).
* **Registro Permanente de Exclusión (`microeval_deleted_sessions_v1`):**
  * Toda sesión eliminada debe registrarse en la lista local de lápidas (tombstones) para vetar su reaparición ante cualquier sincronización en segundo plano.
* **Refresco Inmediato de la Interfaz:**
  * Al detectar la eliminación remota de una sesión, el sistema debe decrementar el contador en vivo, reajustar los botones numéricos `[ 1 ] ... [ 8 ]` y, si el docente estaba viendo la sesión eliminada, cambiar automáticamente a la siguiente sesión activa sin dejar la pantalla en blanco ni requerir recargar la página.

---

## 19. Guardarraíl de Resiliencia Offline Total y Sincronización Automática Online (Auto-Sync)
* **Continuidad de Aula Absoluta y Distinción Estricta de Escaneo:**
  * Ante la ausencia o pérdida de conexión a internet, el sistema opera en modo local: el docente puede configurar sesiones, seleccionar evaluaciones del banco local y generar/imprimir fichas nominales (A4, A5, A6) con ArUco y QR.
  * **Prohibición de Escaneo en Formativa con IA sin Red:** En sesiones de **Formativa con IA (Rama 1)**, la corrección del procedimiento manuscrito depende obligatoriamente del modelo de Gemini en la nube. **Sin internet, NO se puede escanear ni calificar fichas de Formativa con IA**; el sistema debe advertir al docente que esta modalidad requiere conectividad para el análisis por IA.
  * **Escaneo Offline 100% Permitido en OMR:** En las modalidades de **Focalizada en la respuesta OMR (Rama 2)** y **Cartilla OMR (Rama 3)**, el escaneo es 100% determinista y local (visión artificial en JavaScript sin llamadas a la nube), por lo que se puede escanear con total normalidad sin internet.
  * Sin internet, las llamadas a IA (Gemini, generación de rúbricas analíticas y chat de Copilot) quedan estrictamente suspendidas y silenciadas; el sistema jamás muestra spinners infinitos ni bloquea la interfaz.
* **Persistencia Local Soberana y Cola Offline (`microeval_sync_queue`):**
  * Toda nueva evaluación, modificación o sesión creada sin conexión debe guardarse de inmediato en el almacenamiento local (`localStorage`) y encolarse en `microeval_sync_queue`.
* **Sincronización Automática al Restablecerse la Conexión (Auto-Flush):**
  * En el momento en que se detecte conexión a internet (evento `online`, inicio de sesión / montaje de usuario o apertura del Banco de Preguntas), el sistema DEBE ejecutar automáticamente `syncAllLocalToCloud()` y `flushSyncQueue()`.
  * Toda pregunta o sesión pendiente se sube a Supabase de forma transparente en segundo plano, vaciando la cola local al completarse con éxito.
* **Inmunidad contra Saturación del Límite de 50 Preguntas en la Nube:**
  * Al verificar el límite de 50 preguntas en Supabase (`microeval_evaluations`), la consulta DEBE excluir estrictamente casilleros de cartilla OMR (`Pregunta %` y `Cartilla %`) y plantillas temporales.
  * Queda estrictamente prohibido que filas de cartilla o duplicados impidan la sincronización de preguntas legítimas entre la PC y el celular del docente.


