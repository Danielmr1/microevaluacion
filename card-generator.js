// =============================================================================
// card-generator.js — Microevaluación v3.10.31
// MÓDULO PRINCIPAL: CONSTRUCTORES DE FICHAS FÍSICAS (A4, A5, A6) Y ARUCO
//
// Submódulos auxiliares vinculados:
//   - card-sheets-print.js: Ensamblado de hojas A4 de impresión y visor resumen
//   - card-booklet-pdf.js : Cuadernillos de preguntas imprimibles y motor jsPDF
//
// Guardarraíles activos:
//   Regla 1  – Cero regresión Respuesta Libre: formato original intacto.
//   Regla 2  – Aislamiento Total de Alternativas: type === "mc" exclusivo.
//   Regla 4  – Geometría Sagrada: cabecera fija 20mm, marcadores ArUco 10mm.
//   Regla 13 – Borde perimetral negro cerrado (1mm) y margen blanco de seguridad.
//   Regla 14 – Geometría Visual Estricta: dimensiones reales A6 (132x89) y A5 (186x134).
// =============================================================================

/* ── GEOMETRÍA DE LA CUADRÍCULA DE CÁLCULO ──
   16 columnas x 7 filas. DEBE coincidir con .notebook-grid del CSS y con
   ROI_CONFIG.RESOLUTION en roi-processor.js. Si se cambia el número de
   filas o columnas, hay que recalcular esa ROI. */
var A5_GRID_COLS = 16;
var A5_GRID_ROWS = 7;
var GRID_CELLS_HTML = new Array(A5_GRID_COLS * A5_GRID_ROWS).fill("<i></i>").join("");

var A6_GRID_COLS = 13;
var A6_GRID_ROWS = 5;
var GRID_CELLS_A6 = new Array(A6_GRID_COLS * A6_GRID_ROWS).fill("<i></i>").join("");

var A6_V_GRID_COLS = 9;
var A6_V_GRID_ROWS = 9;
var GRID_CELLS_A6_V = new Array(A6_V_GRID_COLS * A6_V_GRID_ROWS).fill("<i></i>").join("");

if (typeof window !== "undefined") {
  window.A5_GRID_COLS = A5_GRID_COLS;
  window.A5_GRID_ROWS = A5_GRID_ROWS;
  window.GRID_CELLS_HTML = GRID_CELLS_HTML;
  window.A6_GRID_COLS = A6_GRID_COLS;
  window.A6_GRID_ROWS = A6_GRID_ROWS;
  window.GRID_CELLS_A6 = GRID_CELLS_A6;
  window.A6_V_GRID_COLS = A6_V_GRID_COLS;
  window.A6_V_GRID_ROWS = A6_V_GRID_ROWS;
  window.GRID_CELLS_A6_V = GRID_CELLS_A6_V;
}

/**
 * TANDA 1: Genera el payload estructurado del código QR para una ficha física.
 * Formato compacto: ALUM_XX|SES:sessionRef
 * - Conserva total compatibilidad con lectores y tests que buscan ALUM_\d{2}.
 * - Integra la huella digital de la sesión para validación de autoría y prevención de errores en aula.
 */
function getCardQRPayload(studentId, evaluation) {
  const std = (studentId || '').toUpperCase().trim();
  const activeSess = (typeof ClassroomData !== 'undefined') ? ClassroomData.getActiveSession() : null;
  const sessRef = (evaluation && (evaluation.sessionRef || evaluation.id))
               || (activeSess && (activeSess.sessionRef || activeSess.id))
               || '';

  if (!sessRef) {
    return std;
  }
  const cleanRef = String(sessRef).replace(/[^a-zA-Z0-9_:-]/g, '_');
  return `${std}|SES:${cleanRef}`;
}
window.getCardQRPayload = getCardQRPayload;

function createA5Card(student, classroom, evaluation) {
  const isOMR = evaluation.type === 'mc';
  const qCount = evaluation.questionCount || (evaluation.questions ? evaluation.questions.length : 1);

  // ── SUBMÓDULO 3: CARTILLA DE RESPUESTAS OMR (HASTA 20 PREGUNTAS) ──
  const isBranch3 = (evaluation.branch === 'rama3' || (evaluation.id && String(evaluation.id).startsWith('eval_r3_'))) ||
    (evaluation.branch !== 'rama2' && evaluation.branch !== 'rama1' && isOMR && qCount > 2);
  if (isBranch3) {
    if (typeof createCartillaA5VerticalCard === 'function' && qCount > 10) {
      return createCartillaA5VerticalCard(student, classroom, evaluation);
    }
    return qCount <= 10
      ? createA6Card(student, classroom, evaluation)
      : createA5VerticalR3Card(student, classroom, evaluation);
  }

  // ── SUBMÓDULO 2: EVALUACIÓN FOCALIZADA SIN BORRADOR (1 A 5 PREGUNTAS) ──
  const isBranch2NoGrid = (evaluation.branch === 'rama2' || evaluation.withGrid === false) && evaluation.withGrid === false;
  if (isBranch2NoGrid) {
    if (typeof createFocalizadaA5Card === 'function') {
      return createFocalizadaA5Card(student, classroom, evaluation);
    }
  }

  // ── SUBMÓDULO 1: FORMATIVA CON IA (RAMA 1 O FALLBACK CON BORRADOR) ──
  return createFormativaA5Card(student, classroom, evaluation);
}

/**
 * Genera la Ficha A4 Horizontal (282 x 196 mm, 1 alumno por hoja entera).
 */
function createA4Card(student, classroom, evaluation) {
  if (typeof createFocalizadaA4Card === 'function') {
    return createFocalizadaA4Card(student, classroom, evaluation);
  }
  return createA5Card(student, classroom, evaluation);
}

/**
 * Genera la Ficha A4 Vertical (196 x 282 mm, 1 alumno por hoja entera).
 */
function createA4VerticalCard(student, classroom, evaluation) {
  if (typeof createFocalizadaA4VerticalCard === 'function') {
    return createFocalizadaA4VerticalCard(student, classroom, evaluation);
  }
  return createA5VerticalCard(student, classroom, evaluation);
}

/**
 * Genera la Cartilla A6 individual (136 x 92 mm) para el modo de 4 alumnos por hoja A4 (Rama 3 <= 8 preguntas).
 * Cumple con la regla inmutable: ESTRICTAMENTE 1 SOLA COLUMNA VERTICAL de burbujas (01 al 0N hacia abajo).
 */
function createA6Card(student, classroom, evaluation) {
  const totalQ = evaluation.questionCount || (evaluation.questions ? evaluation.questions.length : 5);
  const isOMR = (evaluation.type === 'mc');

  // ── SUBMÓDULO 3: CARTILLA DE RESPUESTAS OMR (RAMA 3 HASTA 10 PREGUNTAS) ──
  const isBranch3 = (evaluation.branch === 'rama3' || (evaluation.id && String(evaluation.id).startsWith('eval_r3_'))) ||
    (evaluation.branch !== 'rama2' && evaluation.branch !== 'rama1' && isOMR && totalQ > 2);
  if (isBranch3) {
    if (typeof createCartillaA6Card === 'function') {
      return createCartillaA6Card(student, classroom, evaluation);
    }
  }

  // ── SUBMÓDULO 2: FOCALIZADA EN LA RESPUESTA EN A6 (1 O 2 PREGUNTAS) ──
  const isBranch2A6 = evaluation.branch === 'rama2' && totalQ <= 2;
  if (isBranch2A6) {
    if (typeof createFocalizadaA6Card === 'function') {
      return createFocalizadaA6Card(student, classroom, evaluation);
    }
  }

  // ── SUBMÓDULO 1: FORMATIVA CON IA EN A6 (CON CUADRÍCULA O FALLBACK) ──
  if (typeof createFormativaA6Card === 'function') {
    return createFormativaA6Card(student, classroom, evaluation);
  }
}

/**
 * Genera la Cartilla A5 Vertical individual (136 x 188 mm) para Rama 3 (9 a 20 preguntas).
 * Cumple con la regla inmutable: ESTRICTAMENTE 1 SOLA COLUMNA VERTICAL de burbujas (01 al 20 hacia abajo).
 * Dos alumnos por hoja A4 en orientación HORIZONTAL (Alumno 1 Izquierda | Alumno 2 Derecha).
 */
function createA5VerticalR3Card(student, classroom, evaluation) {
  const gradeText = ClassroomData.formatGrade(classroom.gradeStage, classroom.gradeLevel)
    || classroom.name;

  const fiducialsHTML = `
    <div class="fiducial fiducial-tl" title="ArUco 0"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9"><rect x="0" y="0" width="9" height="9" fill="white"/><rect x="1" y="1" width="7" height="7" fill="black"/><rect x="2" y="2" width="1" height="1" fill="white"/><rect x="2" y="3" width="1" height="1" fill="white"/><rect x="2" y="4" width="1" height="1" fill="white"/><rect x="2" y="5" width="1" height="1" fill="white"/><rect x="2" y="6" width="1" height="1" fill="white"/></svg></div>
    <div class="fiducial fiducial-tr" title="ArUco 1"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9"><rect x="0" y="0" width="9" height="9" fill="white"/><rect x="1" y="1" width="7" height="7" fill="black"/><rect x="2" y="2" width="1" height="1" fill="white"/><rect x="2" y="3" width="1" height="1" fill="white"/><rect x="2" y="4" width="1" height="1" fill="white"/><rect x="2" y="5" width="1" height="1" fill="white"/><rect x="2" y="6" width="1" height="1" fill="white"/><rect x="4" y="6" width="1" height="1" fill="white"/><rect x="5" y="6" width="1" height="1" fill="white"/><rect x="6" y="6" width="1" height="1" fill="white"/></svg></div>
    <div class="fiducial fiducial-br" title="ArUco 2"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9"><rect x="0" y="0" width="9" height="9" fill="white"/><rect x="1" y="1" width="7" height="7" fill="black"/><rect x="2" y="2" width="1" height="1" fill="white"/><rect x="2" y="3" width="1" height="1" fill="white"/><rect x="2" y="4" width="1" height="1" fill="white"/><rect x="2" y="5" width="1" height="1" fill="white"/><rect x="2" y="6" width="1" height="1" fill="white"/><rect x="3" y="6" width="1" height="1" fill="white"/><rect x="6" y="6" width="1" height="1" fill="white"/></svg></div>
    <div class="fiducial fiducial-bl" title="ArUco 3"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9"><rect x="0" y="0" width="9" height="9" fill="white"/><rect x="1" y="1" width="7" height="7" fill="black"/><rect x="2" y="2" width="1" height="1" fill="white"/><rect x="2" y="3" width="1" height="1" fill="white"/><rect x="2" y="4" width="1" height="1" fill="white"/><rect x="2" y="5" width="1" height="1" fill="white"/><rect x="2" y="6" width="1" height="1" fill="white"/><rect x="3" y="6" width="1" height="1" fill="white"/><rect x="4" y="6" width="1" height="1" fill="white"/><rect x="5" y="6" width="1" height="1" fill="white"/></svg></div>
  `;

  const totalQ = evaluation.questionCount || (evaluation.questions ? evaluation.questions.length : 10);

  const escape = (typeof escaparHtml === 'function')
    ? escaparHtml
    : (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const safeStudentName = escape(student.name.toUpperCase());
  const safeGradeText = escape(gradeText);
  const orderMatch = String(student.id || '').match(/\d+/);
  const orderNumber = orderMatch ? '#' + String(orderMatch[0]).padStart(2, '0') : escape(student.id || '');

  let bodyHTML = '';
  if (totalQ === 20) {
    const col1Rows = [];
    const col2Rows = [];
    for (let i = 0; i < 10; i++) {
      const qNum = String(i + 1).padStart(2, '0');
      col1Rows.push(`
        <div class="v-q-row">
          <span class="v-q-num">${qNum}</span>
          <div class="v-bubbles-group">
            <span class="v-bubble">A</span>
            <span class="v-bubble">B</span>
            <span class="v-bubble">C</span>
            <span class="v-bubble">D</span>
          </div>
        </div>
      `);
    }
    for (let i = 10; i < 20; i++) {
      const qNum = String(i + 1).padStart(2, '0');
      col2Rows.push(`
        <div class="v-q-row">
          <span class="v-q-num">${qNum}</span>
          <div class="v-bubbles-group">
            <span class="v-bubble">A</span>
            <span class="v-bubble">B</span>
            <span class="v-bubble">C</span>
            <span class="v-bubble">D</span>
          </div>
        </div>
      `);
    }
    bodyHTML = `
      <div class="v-2col-wrap">
        <div class="v-2col-col">${col1Rows.join('')}</div>
        <div class="v-2col-divider"></div>
        <div class="v-2col-col">${col2Rows.join('')}</div>
      </div>
    `;
  } else {
    const qRows = [];
    for (let i = 0; i < totalQ; i++) {
      const qNum = String(i + 1).padStart(2, '0');
      qRows.push(`
        <div class="v-q-row">
          <span class="v-q-num">${qNum}</span>
          <div class="v-bubbles-group">
            <span class="v-bubble">A</span>
            <span class="v-bubble">B</span>
            <span class="v-bubble">C</span>
            <span class="v-bubble">D</span>
          </div>
        </div>
      `);
    }
    bodyHTML = qRows.join('');
  }

  return `
    <div class="card-a5-v-r3">
      ${fiducialsHTML}
      <div class="v-card-header">
        <div class="v-student-block">
          <div class="v-student-name-row">
            <span class="v-student-label">Nombre:</span>
            <span class="v-student-name">${safeStudentName}</span>
          </div>
          <div class="v-student-grade-row">
            <span class="v-student-grade">(${safeGradeText})</span>
          </div>
        </div>
        <div class="v-qr-block">
          <div class="v-qr-box" id="qr-box-${student.id}" data-qr-id="${student.id}"></div>
        </div>
      </div>
      <div class="aruco-tr-number">${orderNumber}</div>

      ${typeof OMR_INSTRUCTIONS_BOX_HTML !== 'undefined' ? OMR_INSTRUCTIONS_BOX_HTML : (window.OMR_INSTRUCTIONS_BOX_HTML || '')}
      <div class="v-b3-body">
        ${bodyHTML}
      </div>
    </div>
  `;
}

/**
 * Genera la Ficha A5 Vertical (132 x 182 mm) de Respuesta Libre (Formativa con IA / Focalizada).
 * Dos alumnos por pliego A4 en orientación HORIZONTAL (Alumno 1 Izquierda | Alumno 2 Derecha).
 * Al escanearla en el celular vertical, el cuadrilátero calza directamente sin necesidad de girar el teléfono.
 */
function createA5VerticalCard(student, classroom, evaluation) {
  const qCount = evaluation?.questionCount || (evaluation?.questions ? evaluation.questions.length : 1);
  const isOMR = (evaluation.type === 'mc');

  // ── SUBMÓDULO 3: CARTILLA OMR EN A5 VERTICAL (RAMA 3) ──
  const isBranch3 = (evaluation.branch === 'rama3' || (evaluation.id && String(evaluation.id).startsWith('eval_r3_'))) ||
    (evaluation.branch !== 'rama2' && evaluation.branch !== 'rama1' && isOMR && qCount > 2);
  if (isBranch3) {
    if (typeof createCartillaA5VerticalCard === 'function') {
      return createCartillaA5VerticalCard(student, classroom, evaluation);
    }
    return createA5VerticalR3Card(student, classroom, evaluation);
  }

  // ── SUBMÓDULO 2: FOCALIZADA EN LA RESPUESTA EN A5 VERTICAL (SIN BORRADOR) ──
  const isVerticalNoGrid = evaluation.withGrid === false;
  if (isVerticalNoGrid) {
    if (typeof createFocalizadaA5VerticalCard === 'function') {
      return createFocalizadaA5VerticalCard(student, classroom, evaluation);
    }
  }

  // ── SUBMÓDULO 1: FORMATIVA CON IA EN A5 VERTICAL (CON CUADRÍCULA / BORRADOR O FALLBACK) ──
  if (typeof createFormativaA5VerticalCard === 'function') {
    return createFormativaA5VerticalCard(student, classroom, evaluation);
  }
}


/* ── AUTO-AJUSTE DEL ENUNCIADO A LA RANURA DE 20mm ──
   La ficha debe verse idéntica con 1, 2 o 3 líneas. La ranura tiene alto
   fijo, así que si un texto excepcionalmente largo no cabe, se reduce el
   tamaño de fuente dentro de un rango seguro (11pt -> 8.5pt) antes que
   permitir que el enunciado se desborde. Con el tope de 240 caracteres
   del formulario, 3 líneas a 11pt ya caben: esto es la red de seguridad
   para enunciados que llegan del banco de evaluaciones sin pasar por el
   tope. */
function fitProblemText() {
  const slots = document.querySelectorAll('.problem-text');
  slots.forEach(el => {
    const slot = el.parentElement;          // .problem-wide (alto fijo 20mm)
    if (!slot) return;
    // clientHeight es la caja de padding: hay que descontar el padding
    // vertical para quedarnos con el alto REALMENTE disponible para el
    // texto. Si no, el ajuste dejaría pasar texto que overflow:hidden
    // recortaría igual.
    const cs = window.getComputedStyle(slot);
    const available = slot.clientHeight
      - (parseFloat(cs.paddingTop) || 0)
      - (parseFloat(cs.paddingBottom) || 0);

    let size = 11;
    el.style.fontSize = size + 'pt';
    // scrollHeight del texto >= alto disponible significa que desborda.
    while (el.scrollHeight > available && size > 8.5) {
      size -= 0.5;
      el.style.fontSize = size + 'pt';
    }
  });
}


// Exposición global
if (typeof window !== "undefined") {
  window.getCardQRPayload = getCardQRPayload;
  window.A5_GRID_COLS = A5_GRID_COLS;
  window.A5_GRID_ROWS = A5_GRID_ROWS;
  window.GRID_CELLS_HTML = GRID_CELLS_HTML;
  window.A6_GRID_COLS = A6_GRID_COLS;
  window.A6_GRID_ROWS = A6_GRID_ROWS;
  window.GRID_CELLS_A6 = GRID_CELLS_A6;
  window.A6_V_GRID_COLS = A6_V_GRID_COLS;
  window.A6_V_GRID_ROWS = A6_V_GRID_ROWS;
  window.GRID_CELLS_A6_V = GRID_CELLS_A6_V;
  window.createA5Card = createA5Card;
  window.createA4Card = createA4Card;
  window.createA4VerticalCard = createA4VerticalCard;
  window.createA6Card = createA6Card;
  window.createA5VerticalCard = createA5VerticalCard;
  window.createA5VerticalR3Card = createA5VerticalR3Card;
  window.fitProblemText = fitProblemText;
  // Re-exportaciones delegadas
  window.renderAllPrintPages = (...args) => (window.renderAllPrintPages ? window.renderAllPrintPages(...args) : null);
  window.printEvaluationSheets = (...args) => (window.printEvaluationSheets ? window.printEvaluationSheets(...args) : null);
  window.clearGeneratedPdfContainers = (...args) => (window.clearGeneratedPdfContainers ? window.clearGeneratedPdfContainers(...args) : null);
  window.fitSummaryDocumentsToViewport = (...args) => (window.fitSummaryDocumentsToViewport ? window.fitSummaryDocumentsToViewport(...args) : null);
}
