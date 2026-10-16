// =============================================================================
// card-cartilla.js — Submódulo 3: Cartilla OMR y Cuadernillo de Preguntas (Rama 3)
// Microevaluación v3.1.85
//
// MÓDULO AISLADO:
//   * Generación de Cartilla OMR en A5 Vertical (9 a 20 preguntas) y A6 (hasta 8 preguntas).
//   * Dos modalidades: Modo A (Solo claves) y Modo B (Claves + Cuadernillo de preguntas).
//   * Generador de Cuadernillo de Examen para los estudiantes (HTML y jsPDF).
// =============================================================================

const CARTILLA_FIDUCIALS = `
  <div class="fiducial fiducial-tl" title="ArUco 0"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9"><rect x="0" y="0" width="9" height="9" fill="white"/><rect x="1" y="1" width="7" height="7" fill="black"/><rect x="2" y="2" width="1" height="1" fill="white"/><rect x="2" y="3" width="1" height="1" fill="white"/><rect x="2" y="4" width="1" height="1" fill="white"/><rect x="2" y="5" width="1" height="1" fill="white"/><rect x="2" y="6" width="1" height="1" fill="white"/></svg></div>
  <div class="fiducial fiducial-tr" title="ArUco 1"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9"><rect x="0" y="0" width="9" height="9" fill="white"/><rect x="1" y="1" width="7" height="7" fill="black"/><rect x="2" y="2" width="1" height="1" fill="white"/><rect x="2" y="3" width="1" height="1" fill="white"/><rect x="2" y="4" width="1" height="1" fill="white"/><rect x="2" y="5" width="1" height="1" fill="white"/><rect x="2" y="6" width="1" height="1" fill="white"/><rect x="4" y="6" width="1" height="1" fill="white"/><rect x="5" y="6" width="1" height="1" fill="white"/><rect x="6" y="6" width="1" height="1" fill="white"/></svg></div>
  <div class="fiducial fiducial-br" title="ArUco 2"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9"><rect x="0" y="0" width="9" height="9" fill="white"/><rect x="1" y="1" width="7" height="7" fill="black"/><rect x="2" y="2" width="1" height="1" fill="white"/><rect x="2" y="3" width="1" height="1" fill="white"/><rect x="2" y="4" width="1" height="1" fill="white"/><rect x="2" y="5" width="1" height="1" fill="white"/><rect x="2" y="6" width="1" height="1" fill="white"/><rect x="3" y="6" width="1" height="1" fill="white"/><rect x="6" y="6" width="1" height="1" fill="white"/></svg></div>
  <div class="fiducial fiducial-bl" title="ArUco 3"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9"><rect x="0" y="0" width="9" height="9" fill="white"/><rect x="1" y="1" width="7" height="7" fill="black"/><rect x="2" y="2" width="1" height="1" fill="white"/><rect x="2" y="3" width="1" height="1" fill="white"/><rect x="2" y="4" width="1" height="1" fill="white"/><rect x="2" y="5" width="1" height="1" fill="white"/><rect x="2" y="6" width="1" height="1" fill="white"/><rect x="3" y="6" width="1" height="1" fill="white"/><rect x="4" y="6" width="1" height="1" fill="white"/><rect x="5" y="6" width="1" height="1" fill="white"/></svg></div>
`;

function cartillaEscape(t) {
  return (typeof escaparHtml === 'function')
    ? escaparHtml(t)
    : String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Genera la Cartilla A5 Vertical individual (136 x 188 mm) para Rama 3 (9 a 20 preguntas).
 */
function createCartillaA5VerticalCard(student, classroom, evaluation) {
  const gradeText = ClassroomData.formatGrade(classroom.gradeStage, classroom.gradeLevel) || classroom.name;
  const escape = cartillaEscape;

  const safeStudentName = escape(student.name.toUpperCase());
  const safeGradeText = escape(gradeText);
  const orderMatch = String(student.id || '').match(/\d+/);
  const orderNumber = orderMatch ? '#' + String(orderMatch[0]).padStart(2, '0') : escape(student.id || '');
  const totalQ = evaluation.questionCount || (evaluation.questions ? evaluation.questions.length : 10);
  const isInteractive = !!evaluation.showKeys;
  const activeIdx = typeof evaluation.activeRowIdx === 'number' ? evaluation.activeRowIdx : -1;

  let bodyHTML = '';
  if (totalQ === 20) {
    const col1Rows = [];
    const col2Rows = [];
    for (let i = 0; i < 10; i++) {
      const qNum = String(i + 1).padStart(2, '0');
      const selectedKey = (evaluation.questions && evaluation.questions[i] && evaluation.questions[i].correct) || '';
      const rowActiveClass = (isInteractive && activeIdx === i) ? ' active-row' : '';
      const rowClickAttr = isInteractive ? ` onclick="onRama3SelectRow(${i})"` : '';
      col1Rows.push(`
        <div class="v-q-row${rowActiveClass}"${rowClickAttr} data-q-idx="${i}">
          <span class="v-q-num">${qNum}</span>
          <div class="v-bubbles-group">
            ${['A', 'B', 'C', 'D'].map(k => {
              const isFilled = (isInteractive && selectedKey === k) ? ' filled' : '';
              const bubbleClickAttr = isInteractive ? ` onclick="onRama3BubbleClick(event, ${i}, '${k}')"` : '';
              return `<span class="v-bubble${isFilled}"${bubbleClickAttr}>${k}</span>`;
            }).join('')}
          </div>
        </div>
      `);
    }
    for (let i = 10; i < 20; i++) {
      const qNum = String(i + 1).padStart(2, '0');
      const selectedKey = (evaluation.questions && evaluation.questions[i] && evaluation.questions[i].correct) || '';
      const rowActiveClass = (isInteractive && activeIdx === i) ? ' active-row' : '';
      const rowClickAttr = isInteractive ? ` onclick="onRama3SelectRow(${i})"` : '';
      col2Rows.push(`
        <div class="v-q-row${rowActiveClass}"${rowClickAttr} data-q-idx="${i}">
          <span class="v-q-num">${qNum}</span>
          <div class="v-bubbles-group">
            ${['A', 'B', 'C', 'D'].map(k => {
              const isFilled = (isInteractive && selectedKey === k) ? ' filled' : '';
              const bubbleClickAttr = isInteractive ? ` onclick="onRama3BubbleClick(event, ${i}, '${k}')"` : '';
              return `<span class="v-bubble${isFilled}"${bubbleClickAttr}>${k}</span>`;
            }).join('')}
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
      const selectedKey = (evaluation.questions && evaluation.questions[i] && evaluation.questions[i].correct) || '';
      const rowActiveClass = (isInteractive && activeIdx === i) ? ' active-row' : '';
      const rowClickAttr = isInteractive ? ` onclick="onRama3SelectRow(${i})"` : '';
      qRows.push(`
        <div class="v-q-row${rowActiveClass}"${rowClickAttr} data-q-idx="${i}">
          <span class="v-q-num">${qNum}</span>
          <div class="v-bubbles-group">
            ${['A', 'B', 'C', 'D'].map(k => {
              const isFilled = (isInteractive && selectedKey === k) ? ' filled' : '';
              const bubbleClickAttr = isInteractive ? ` onclick="onRama3BubbleClick(event, ${i}, '${k}')"` : '';
              return `<span class="v-bubble${isFilled}"${bubbleClickAttr}>${k}</span>`;
            }).join('')}
          </div>
        </div>
      `);
    }
    bodyHTML = qRows.join('');
  }

  return `
    <div class="card-a5-v-r3">
      ${CARTILLA_FIDUCIALS}
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

      <span class="v-fill-hint-side">Rellena: <b>●</b></span>
      <div class="v-b3-body">
        ${bodyHTML}
      </div>
    </div>
  `;
}

/**
 * Genera la Cartilla A6 individual (132 x 89 mm) para Rama 3 (hasta 8 preguntas).
 */
function createCartillaA6Card(student, classroom, evaluation) {
  const gradeText = ClassroomData.formatGrade(classroom.gradeStage, classroom.gradeLevel) || classroom.name;
  const escape = cartillaEscape;
  const safeStudentName = escape(student.name.toUpperCase());
  const safeGradeText = escape(gradeText);
  const orderMatch = String(student.id || '').match(/\d+/);
  const orderNumber = orderMatch ? '#' + String(orderMatch[0]).padStart(2, '0') : escape(student.id || '');
  const totalQ = evaluation.questionCount || (evaluation.questions ? evaluation.questions.length : 5);
  const isInteractive = !!evaluation.showKeys;
  const activeIdx = typeof evaluation.activeRowIdx === 'number' ? evaluation.activeRowIdx : -1;

  let bodyHTML = '';
  if (totalQ === 8 || totalQ === 10) {
    const half = totalQ / 2;
    const col1Rows = [];
    const col2Rows = [];
    for (let i = 0; i < half; i++) {
      const qNum = String(i + 1).padStart(2, '0');
      const selectedKey = (evaluation.questions && evaluation.questions[i] && evaluation.questions[i].correct) || '';
      const rowActiveClass = (isInteractive && activeIdx === i) ? ' active-row' : '';
      const rowClickAttr = isInteractive ? ` onclick="onRama3SelectRow(${i})"` : '';
      col1Rows.push(`
        <div class="a6-q-row${rowActiveClass}"${rowClickAttr} data-q-idx="${i}">
          <span class="a6-q-num">${qNum}</span>
          <div class="a6-bubbles-group">
            ${['A', 'B', 'C', 'D'].map(k => {
              const isFilled = (isInteractive && selectedKey === k) ? ' filled' : '';
              const bubbleClickAttr = isInteractive ? ` onclick="onRama3BubbleClick(event, ${i}, '${k}')"` : '';
              return `<span class="a6-bubble${isFilled}"${bubbleClickAttr}>${k}</span>`;
            }).join('')}
          </div>
        </div>
      `);
    }
    for (let i = half; i < totalQ; i++) {
      const qNum = String(i + 1).padStart(2, '0');
      const selectedKey = (evaluation.questions && evaluation.questions[i] && evaluation.questions[i].correct) || '';
      const rowActiveClass = (isInteractive && activeIdx === i) ? ' active-row' : '';
      const rowClickAttr = isInteractive ? ` onclick="onRama3SelectRow(${i})"` : '';
      col2Rows.push(`
        <div class="a6-q-row${rowActiveClass}"${rowClickAttr} data-q-idx="${i}">
          <span class="a6-q-num">${qNum}</span>
          <div class="a6-bubbles-group">
            ${['A', 'B', 'C', 'D'].map(k => {
              const isFilled = (isInteractive && selectedKey === k) ? ' filled' : '';
              const bubbleClickAttr = isInteractive ? ` onclick="onRama3BubbleClick(event, ${i}, '${k}')"` : '';
              return `<span class="a6-bubble${isFilled}"${bubbleClickAttr}>${k}</span>`;
            }).join('')}
          </div>
        </div>
      `);
    }
    bodyHTML = `
      <div class="a6-2col-wrap">
        <div class="a6-2col-col">${col1Rows.join('')}</div>
        <div class="a6-2col-divider"></div>
        <div class="a6-2col-col">${col2Rows.join('')}</div>
      </div>
    `;
  } else {
    const qRows = [];
    for (let i = 0; i < totalQ; i++) {
      const qNum = String(i + 1).padStart(2, '0');
      const selectedKey = (evaluation.questions && evaluation.questions[i] && evaluation.questions[i].correct) || '';
      const rowActiveClass = (isInteractive && activeIdx === i) ? ' active-row' : '';
      const rowClickAttr = isInteractive ? ` onclick="onRama3SelectRow(${i})"` : '';
      qRows.push(`
        <div class="a6-q-row${rowActiveClass}"${rowClickAttr} data-q-idx="${i}">
          <span class="a6-q-num">${qNum}</span>
          <div class="a6-bubbles-group">
            ${['A', 'B', 'C', 'D'].map(k => {
              const isFilled = (isInteractive && selectedKey === k) ? ' filled' : '';
              const bubbleClickAttr = isInteractive ? ` onclick="onRama3BubbleClick(event, ${i}, '${k}')"` : '';
              return `<span class="a6-bubble${isFilled}"${bubbleClickAttr}>${k}</span>`;
            }).join('')}
          </div>
        </div>
      `);
    }
    bodyHTML = qRows.join('');
  }

  return `
    <div class="card-a6-r3">
      ${CARTILLA_FIDUCIALS}
      <div class="a6-card-header">
        <div class="a6-student-block">
          <div class="a6-student-name-row">
            <span class="a6-student-label">Nombre:</span>
            <span class="a6-student-name">${safeStudentName}</span>
          </div>
          <div class="a6-student-grade-row">
            <span class="a6-student-grade">(${safeGradeText})</span>
          </div>
        </div>
        <div class="a6-qr-block">
          <div class="a6-qr-box" id="qr-box-${student.id}" data-qr-id="${student.id}"></div>
        </div>
      </div>
      <div class="aruco-tr-number">${orderNumber}</div>

      <span class="a6-fill-hint-side">Rellena: <b>●</b></span>
      <div class="a6-b3-body">
        ${bodyHTML}
      </div>
    </div>
  `;
}

if (typeof window !== 'undefined') {
  window.createCartillaA5VerticalCard = createCartillaA5VerticalCard;
  window.createCartillaA6Card = createCartillaA6Card;
}
