// =============================================================================
// card-focalizada.js — Submódulo 2: Focalizada en la Respuesta (Rama 2)
// Microevaluación v3.1.85
//
// MÓDULO AUTÓNOMO:
//   * Diseñado para evaluaciones directas de 1 a 5 preguntas (sin cuadrícula o con borrador opcional).
//   * Optimizado para aprovechar la altura de la página de forma dinámica.
//   * Corrección determinista, instantánea y local.
// =============================================================================

const FOCALIZADA_FIDUCIALS = `
  <div class="fiducial fiducial-tl" title="ArUco 0"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9"><rect x="0" y="0" width="9" height="9" fill="white"/><rect x="1" y="1" width="7" height="7" fill="black"/><rect x="2" y="2" width="1" height="1" fill="white"/><rect x="2" y="3" width="1" height="1" fill="white"/><rect x="2" y="4" width="1" height="1" fill="white"/><rect x="2" y="5" width="1" height="1" fill="white"/><rect x="2" y="6" width="1" height="1" fill="white"/></svg></div>
  <div class="fiducial fiducial-tr" title="ArUco 1"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9"><rect x="0" y="0" width="9" height="9" fill="white"/><rect x="1" y="1" width="7" height="7" fill="black"/><rect x="2" y="2" width="1" height="1" fill="white"/><rect x="2" y="3" width="1" height="1" fill="white"/><rect x="2" y="4" width="1" height="1" fill="white"/><rect x="2" y="5" width="1" height="1" fill="white"/><rect x="2" y="6" width="1" height="1" fill="white"/><rect x="4" y="6" width="1" height="1" fill="white"/><rect x="5" y="6" width="1" height="1" fill="white"/><rect x="6" y="6" width="1" height="1" fill="white"/></svg></div>
  <div class="fiducial fiducial-br" title="ArUco 2"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9"><rect x="0" y="0" width="9" height="9" fill="white"/><rect x="1" y="1" width="7" height="7" fill="black"/><rect x="2" y="2" width="1" height="1" fill="white"/><rect x="2" y="3" width="1" height="1" fill="white"/><rect x="2" y="4" width="1" height="1" fill="white"/><rect x="2" y="5" width="1" height="1" fill="white"/><rect x="2" y="6" width="1" height="1" fill="white"/><rect x="3" y="6" width="1" height="1" fill="white"/><rect x="6" y="6" width="1" height="1" fill="white"/></svg></div>
  <div class="fiducial fiducial-bl" title="ArUco 3"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9"><rect x="0" y="0" width="9" height="9" fill="white"/><rect x="1" y="1" width="7" height="7" fill="black"/><rect x="2" y="2" width="1" height="1" fill="white"/><rect x="2" y="3" width="1" height="1" fill="white"/><rect x="2" y="4" width="1" height="1" fill="white"/><rect x="2" y="5" width="1" height="1" fill="white"/><rect x="2" y="6" width="1" height="1" fill="white"/><rect x="3" y="6" width="1" height="1" fill="white"/><rect x="4" y="6" width="1" height="1" fill="white"/><rect x="5" y="6" width="1" height="1" fill="white"/></svg></div>
`;

function focalizadaEscape(t) {
  const s = (typeof escaparHtml === 'function')
    ? escaparHtml(t)
    : String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return (typeof formatMathHtml === 'function') ? formatMathHtml(s) : s;
}

/**
 * Renderiza la ficha Focalizada en A5 Horizontal sin cuadrícula (1 a 5 preguntas)
 */
function createFocalizadaA5Card(student, classroom, evaluation) {
  const gradeText = ClassroomData.formatGrade(classroom.gradeStage, classroom.gradeLevel) || classroom.name;
  const isOMR = evaluation.type === 'mc';
  const escape = focalizadaEscape;

  const safeStudentName = escape(student.name.toUpperCase());
  const safeGradeText = escape(gradeText);
  const orderMatch = String(student.id || '').match(/\d+/);
  const orderNumber = orderMatch ? '#' + String(orderMatch[0]).padStart(2, '0') : escape(student.id || '');

  const headerHTML = `
    <div class="card-header">
      <div class="student-block">
        <div class="student-main-row">
          <span class="student-label">Nombre:</span>
          <span class="student-name">${safeStudentName}</span>
        </div>
        <div class="student-sub-row">
          <span class="student-grade">(${safeGradeText})</span>
        </div>
      </div>
      <div class="qr-block">
        <div class="qr-box" id="qr-box-${student.id}" data-qr-id="${student.id}"></div>
      </div>
    </div>
    <div class="aruco-tr-number">${orderNumber}</div>`;

  const activeQuestions = (evaluation.questions && evaluation.questions.length > 0)
    ? evaluation.questions
    : [{
        prompt: evaluation.prompt,
        options: evaluation.options || { A: '', B: '', C: '', D: '' },
        expectedAnswer: evaluation.expectedAnswer || ''
      }];

  return `
    <div class="card-a5 branch2-nogrid-card">
      ${FOCALIZADA_FIDUCIALS}
      ${headerHTML}

      <div class="b2-body">
        ${activeQuestions.map((q, idx) => `
          <div class="b2-q-item">
            <div class="b2-q-header">
              <strong class="b2-q-num">${idx + 1}.</strong>
              <span class="b2-q-prompt">${escape(q.prompt)}</span>
            </div>
            ${isOMR ? `
              <div class="b2-omr-row">
                <div class="b2-omr-opt"><span class="omr-bubble">A</span> <span class="omr-text">${escape(q.options?.A || '')}</span></div>
                <div class="b2-omr-opt"><span class="omr-bubble">B</span> <span class="omr-text">${escape(q.options?.B || '')}</span></div>
                <div class="b2-omr-opt"><span class="omr-bubble">C</span> <span class="omr-text">${escape(q.options?.C || '')}</span></div>
                <div class="b2-omr-opt"><span class="omr-bubble">D</span> <span class="omr-text">${escape(q.options?.D || '')}</span></div>
              </div>
            ` : `
              <div class="b2-free-row">
                <span class="b2-free-tag">Rpta:</span>
                <div class="b2-free-box"></div>
              </div>
            `}
            ${(!evaluation.withGrid && idx === activeQuestions.length - 1 && activeQuestions.length === 3) ? `
              <div class="focalizada-grid-slot-3p" style="position:relative; width:100%; height:24px; margin-top:2mm;"></div>
            ` : ''}
          </div>
          ${idx < activeQuestions.length - 1 ? '<div class="b2-divider"></div>' : ''}
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * Renderiza la ficha Focalizada en A5 Vertical sin cuadrícula (1 a 5 preguntas)
 */
function createFocalizadaA5VerticalCard(student, classroom, evaluation) {
  const gradeText = ClassroomData.formatGrade(classroom.gradeStage, classroom.gradeLevel) || classroom.name;
  const isOMR = (evaluation.type === 'mc');
  const escape = focalizadaEscape;

  const safeStudentName = escape(student.name.toUpperCase());
  const safeGradeText = escape(gradeText);
  const orderMatch = String(student.id || '').match(/\d+/);
  const orderNumber = orderMatch ? '#' + String(orderMatch[0]).padStart(2, '0') : escape(student.id || '');

  const activeQuestions = (evaluation.questions && evaluation.questions.length > 0)
    ? evaluation.questions
    : [{
        prompt: evaluation.prompt,
        options: evaluation.options || { A: '', B: '', C: '', D: '' },
        expectedAnswer: evaluation.expectedAnswer || ''
      }];

  return `
    <div class="card-a5-v-free">
      ${FOCALIZADA_FIDUCIALS}
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

      <div class="v-nogrid-body">
        ${activeQuestions.map((q, idx) => `
          <div class="v-nogrid-q">
            <div class="v-nogrid-q-header">
              <strong class="v-nogrid-q-num">${idx + 1}.</strong>
              <span class="v-nogrid-q-prompt">${escape(q.prompt)}</span>
            </div>
            ${isOMR ? `
              <div class="v-omr-row v-omr-row-2q" style="margin-top:2px;">
                <div class="v-omr-option"><span class="v-omr-bubble">A</span> <span class="v-omr-text">${escape(q.options?.A || '')}</span></div>
                <div class="v-omr-option"><span class="v-omr-bubble">B</span> <span class="v-omr-text">${escape(q.options?.B || '')}</span></div>
                <div class="v-omr-option"><span class="v-omr-bubble">C</span> <span class="v-omr-text">${escape(q.options?.C || '')}</span></div>
                <div class="v-omr-option"><span class="v-omr-bubble">D</span> <span class="v-omr-text">${escape(q.options?.D || '')}</span></div>
              </div>
            ` : `
              <div class="v-nogrid-free-row">
                <span class="v-nogrid-free-tag">Rpta:</span>
                <div class="v-nogrid-free-box"></div>
              </div>
            `}
            ${(!evaluation.withGrid && idx === activeQuestions.length - 1 && (activeQuestions.length === 3 || activeQuestions.length === 4)) ? `
              <div class="focalizada-grid-slot-${activeQuestions.length}p" style="position:relative; width:100%; height:24px; margin-top:2mm;"></div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * Renderiza la ficha Focalizada en A6:
 * - 1 Pregunta: A6 Horizontal (132 x 89 mm) — Al inicio sin cuadrícula; al activar muestra 5 filas (13x5 celdas).
 * - 2 Preguntas: A6 Vertical (89 x 132 mm) — Al inicio sin cuadrícula.
 */
function createFocalizadaA6Card(student, classroom, evaluation) {
  const gradeText = ClassroomData.formatGrade(classroom.gradeStage, classroom.gradeLevel) || classroom.name;
  const isOMR = (evaluation.type === 'mc');
  const escape = focalizadaEscape;

  const safeStudentName = escape(student.name.toUpperCase());
  const safeGradeText = escape(gradeText);
  const orderMatch = String(student.id || '').match(/\d+/);
  const orderNumber = orderMatch ? '#' + String(orderMatch[0]).padStart(2, '0') : escape(student.id || '');
  const totalQ = evaluation.questionCount || (evaluation.questions ? evaluation.questions.length : 1);
  const isA6Vertical = evaluation.isPortrait === true || evaluation.orientation === 'vertical' || evaluation.cardOrientation === 'vertical';

  // Si es 1 pregunta en A6 Vertical con cuadrícula (Stage 2), delegar a createFormativaA6Card
  if (totalQ === 1 && isA6Vertical && evaluation.withGrid !== false) {
    if (typeof createFormativaA6Card === 'function') {
      return createFormativaA6Card(student, classroom, evaluation);
    }
  }

  const fiducialsHTML = FOCALIZADA_FIDUCIALS;

  // ── CASO 2 PREGUNTAS: A6 HORIZONTAL (132 x 89 mm) ──
  if (totalQ === 2 && !isA6Vertical) {
    const activeQuestions = (evaluation.questions && evaluation.questions.length > 0)
      ? evaluation.questions.slice(0, 2)
      : [
          { prompt: evaluation.prompt || 'Pregunta 1', options: evaluation.options || { A: '', B: '', C: '', D: '' }, expectedAnswer: '' },
          { prompt: 'Pregunta 2', options: { A: '', B: '', C: '', D: '' }, expectedAnswer: '' }
        ];

    return `
      <div class="card-a6-r3">
        ${fiducialsHTML}
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

        <div class="a6-h-2q-body">
          ${activeQuestions.map((q, idx) => `
            <div class="a6-h-2q-item">
              <div class="a6-h-2q-header">
                <strong class="a6-h-2q-num">${idx + 1}.</strong>
                <span class="a6-h-2q-prompt">${escape(q.prompt)}</span>
              </div>
              ${isOMR ? `
                <div class="a6-h-2q-omr">
                  <div class="v-omr-option"><span class="v-omr-bubble">A</span> <span class="v-omr-text">${escape(q.options?.A || '')}</span></div>
                  <div class="v-omr-option"><span class="v-omr-bubble">B</span> <span class="v-omr-text">${escape(q.options?.B || '')}</span></div>
                  <div class="v-omr-option"><span class="v-omr-bubble">C</span> <span class="v-omr-text">${escape(q.options?.C || '')}</span></div>
                  <div class="v-omr-option"><span class="v-omr-bubble">D</span> <span class="v-omr-text">${escape(q.options?.D || '')}</span></div>
                </div>
              ` : `
                <div class="a6-h-2q-free">
                  <span class="v-nogrid-free-tag">Rpta:</span>
                  <div class="a6-nogrid-free-box"></div>
                </div>
              `}
              ${(!evaluation.withGrid && idx === 1) ? `
                <div class="focalizada-grid-slot-2p" style="position:relative; width:100%; height:20px; margin-top:1mm;"></div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // ── CASO 2 PREGUNTAS: A6 VERTICAL (89 x 132 mm) ──
  if (isA6Vertical) {
    const activeQuestions = (evaluation.questions && evaluation.questions.length > 0)
      ? evaluation.questions.slice(0, 2)
      : [
          { prompt: evaluation.prompt || 'Pregunta 1', options: evaluation.options || { A: '', B: '', C: '', D: '' } },
          { prompt: 'Pregunta 2', options: { A: '', B: '', C: '', D: '' } }
        ];

    const withGrid = !!evaluation.withGrid;
    const GRID_CELLS_2Q = new Array(9 * 4).fill('<i></i>').join('');

    return `
      <div class="card-a6-v">
        ${fiducialsHTML}
        <div class="a6-v-card-header">
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

        <div class="a6-nogrid-body ${withGrid ? 'a6-v-with-grid-body' : ''}">
          ${activeQuestions.map((q, idx) => `
            <div class="a6-nogrid-q ${withGrid ? 'a6-v-with-grid-q' : ''}">
              <div class="a6-nogrid-q-prompt">
                <strong>${idx + 1}.</strong> ${escape(q.prompt)}
              </div>
              ${withGrid ? `
                <div class="a6-v-grid-wrapper focalizada-grid-2q-${idx}" style="height:27mm; flex:0 0 27mm; margin:0.5mm auto; width:70mm; position:relative;">
                  <div class="notebook-grid notebook-grid-a6-v" style="height:27mm; width:70mm; grid-template-rows:repeat(4, 1fr);">
                    ${GRID_CELLS_2Q}
                  </div>
                </div>
              ` : ''}
              ${isOMR ? `
                <div class="a6-nogrid-omr ${withGrid ? 'a6-v-with-grid-omr' : ''}">
                  <div class="v-omr-option"><span class="v-omr-bubble">A</span> <span class="v-omr-text">${escape(q.options?.A || '')}</span></div>
                  <div class="v-omr-option"><span class="v-omr-bubble">B</span> <span class="v-omr-text">${escape(q.options?.B || '')}</span></div>
                  <div class="v-omr-option"><span class="v-omr-bubble">C</span> <span class="v-omr-text">${escape(q.options?.C || '')}</span></div>
                  <div class="v-omr-option"><span class="v-omr-bubble">D</span> <span class="v-omr-text">${escape(q.options?.D || '')}</span></div>
                </div>
              ` : `
                <div class="a6-nogrid-free">
                  <span class="v-nogrid-free-tag">Rpta:</span>
                  <div class="a6-nogrid-free-box"></div>
                </div>
              `}
              ${(!withGrid && idx === activeQuestions.length - 1) ? `
                <div class="focalizada-grid-slot-2p" style="position:relative; width:100%; height:24px; margin-top:2.5mm;"></div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // ── CASO 1 PREGUNTA: A6 HORIZONTAL (132 x 89 mm) ──
  const q1 = (evaluation.questions && evaluation.questions[0]) || {
    prompt: evaluation.prompt,
    options: evaluation.options || { A: '', B: '', C: '', D: '' }
  };

  const withGrid = !!evaluation.withGrid;
  const GRID_CELLS_A6 = new Array(13 * 5).fill('<i></i>').join('');

  return `
    <div class="card-a6-r3">
      ${fiducialsHTML}
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

      <div class="a6-problem">
        <div class="problem-text">${escape(q1.prompt)}</div>
      </div>

      ${withGrid ? `
        <div class="grid-wrapper a6-grid-wrapper focalizada-grid-area" style="position:relative; margin:1mm auto 0 auto; height:34mm; flex:0 0 34mm;">
          <div class="notebook-grid notebook-grid-a6" style="height:34mm; grid-template-rows:repeat(4, 1fr);">${new Array(13 * 4).fill('<i></i>').join('')}</div>
        </div>
      ` : `
        <div class="focalizada-grid-slot-1p" style="position:relative; width:104mm; margin:1mm auto 0 auto; height:34mm; flex:0 0 34mm;"></div>
      `}

      ${isOMR ? `
        <div class="a6-omr-row" style="margin-top:2.2mm; padding:0 12mm;">
          <div class="v-omr-option"><span class="v-omr-bubble">A</span> <span class="v-omr-text">${escape(q1.options?.A || '')}</span></div>
          <div class="v-omr-option"><span class="v-omr-bubble">B</span> <span class="v-omr-text">${escape(q1.options?.B || '')}</span></div>
          <div class="v-omr-option"><span class="v-omr-bubble">C</span> <span class="v-omr-text">${escape(q1.options?.C || '')}</span></div>
          <div class="v-omr-option"><span class="v-omr-bubble">D</span> <span class="v-omr-text">${escape(q1.options?.D || '')}</span></div>
        </div>
      ` : `
        <div class="a6-free-answer-strip" style="margin-top:2mm;">
          <span class="v-nogrid-free-tag">Rpta:</span>
          <div class="a6-nogrid-free-box"></div>
        </div>
      `}
    </div>
  `;
}

/**
 * Renderiza la ficha Focalizada en A4 Horizontal (1 alumno por hoja)
 * - 3 o 4 preguntas con cuadrícula o sin cuadrícula.
 */
function createFocalizadaA4Card(student, classroom, evaluation) {
  const gradeText = ClassroomData.formatGrade(classroom.gradeStage, classroom.gradeLevel) || classroom.name;
  const isOMR = (evaluation.type === 'mc');
  const escape = focalizadaEscape;

  const safeStudentName = escape(student.name.toUpperCase());
  const safeGradeText = escape(gradeText);
  const orderMatch = String(student.id || '').match(/\d+/);
  const orderNumber = orderMatch ? '#' + String(orderMatch[0]).padStart(2, '0') : escape(student.id || '');
  const count = evaluation.questionCount || (evaluation.questions ? evaluation.questions.length : 3);
  const withGrid = evaluation.withGrid !== false;

  const activeQuestions = (evaluation.questions && evaluation.questions.length > 0)
    ? evaluation.questions.slice(0, count)
    : Array.from({ length: count }, (_, i) => ({
        prompt: `Pregunta ${i + 1}`,
        options: { A: '', B: '', C: '', D: '' },
        expectedAnswer: ''
      }));

  const GRID_CELLS_A4_H = new Array(26 * 4).fill('<i></i>').join('');

  return `
    <div class="card-a4-h ${count === 4 ? 'card-a4-h-4q' : ''}">
      ${FOCALIZADA_FIDUCIALS}
      <div class="card-header">
        <div class="student-block">
          <div class="student-main-row">
            <span class="student-label">Nombre:</span>
            <span class="student-name">${safeStudentName}</span>
          </div>
          <div class="student-sub-row">
            <span class="student-grade">(${safeGradeText})</span>
          </div>
        </div>
        <div class="qr-block">
          <div class="qr-box" id="qr-box-${student.id}" data-qr-id="${student.id}"></div>
        </div>
      </div>
      <div class="aruco-tr-number">${orderNumber}</div>

      <div class="a4-h-body">
        ${activeQuestions.map((q, idx) => `
          <div class="a4-q-item">
            <div class="a4-q-header">
              <strong class="a4-q-num">${idx + 1}.</strong>
              <span class="a4-q-prompt">${escape(q.prompt)}</span>
            </div>

            ${withGrid ? `
              <div class="a4-grid-wrapper focalizada-grid-${count}q-${idx}">
                <div class="notebook-grid notebook-grid-a4-h">
                  ${GRID_CELLS_A4_H}
                </div>
              </div>
            ` : ''}

            ${isOMR ? `
              <div class="a4-footer-row" style="${withGrid ? '' : 'margin-top:2.5mm;'}">
                <div class="b2-omr-row" style="margin:0; width:100%;">
                  <div class="b2-omr-opt"><span class="omr-bubble">A</span> <span class="omr-text">${escape(q.options?.A || '')}</span></div>
                  <div class="b2-omr-opt"><span class="omr-bubble">B</span> <span class="omr-text">${escape(q.options?.B || '')}</span></div>
                  <div class="b2-omr-opt"><span class="omr-bubble">C</span> <span class="omr-text">${escape(q.options?.C || '')}</span></div>
                  <div class="b2-omr-opt"><span class="omr-bubble">D</span> <span class="omr-text">${escape(q.options?.D || '')}</span></div>
                </div>
              </div>
            ` : `
              <div class="a4-footer-row" style="${withGrid ? '' : 'margin-top:2.5mm;'}">
                <div class="b2-free-row" style="margin:0;">
                  <span class="b2-free-tag">Rpta:</span>
                  <div class="b2-free-box"></div>
                </div>
              </div>
            `}

            ${(!withGrid && idx === activeQuestions.length - 1) ? `
              <div class="focalizada-grid-slot-${count}p" style="position:relative; width:100%; height:24px; margin-top:2mm;"></div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * Renderiza la ficha Focalizada en A4 Vertical (1 alumno por hoja)
 * - 3 o 4 preguntas con o sin cuadrícula.
 */
function createFocalizadaA4VerticalCard(student, classroom, evaluation) {
  const gradeText = ClassroomData.formatGrade(classroom.gradeStage, classroom.gradeLevel) || classroom.name;
  const isOMR = (evaluation.type === 'mc');
  const escape = focalizadaEscape;

  const safeStudentName = escape(student.name.toUpperCase());
  const safeGradeText = escape(gradeText);
  const orderMatch = String(student.id || '').match(/\d+/);
  const orderNumber = orderMatch ? '#' + String(orderMatch[0]).padStart(2, '0') : escape(student.id || '');
  const count = evaluation.questionCount || (evaluation.questions ? evaluation.questions.length : 3);
  const withGrid = evaluation.withGrid !== false;

  const activeQuestions = (evaluation.questions && evaluation.questions.length > 0)
    ? evaluation.questions.slice(0, count)
    : Array.from({ length: count }, (_, i) => ({
        prompt: `Pregunta ${i + 1}`,
        options: { A: '', B: '', C: '', D: '' },
        expectedAnswer: ''
      }));

  const GRID_CELLS_A4_V = (count === 4)
    ? new Array(20 * 4).fill('<i></i>').join('')
    : new Array(20 * 5).fill('<i></i>').join('');

  return `
    <div class="card-a4-v ${count === 4 ? 'card-a4-v-4q' : (count === 5 ? 'card-a4-v-5q' : '')}">
      ${FOCALIZADA_FIDUCIALS}
      <div class="card-header">
        <div class="student-block">
          <div class="student-main-row">
            <span class="student-label">Nombre:</span>
            <span class="student-name">${safeStudentName}</span>
          </div>
          <div class="student-sub-row">
            <span class="student-grade">(${safeGradeText})</span>
          </div>
        </div>
        <div class="qr-block">
          <div class="qr-box" id="qr-box-${student.id}" data-qr-id="${student.id}"></div>
        </div>
      </div>
      <div class="aruco-tr-number">${orderNumber}</div>

      <div class="a4-v-body">
        ${activeQuestions.map((q, idx) => `
          <div class="a4-q-item">
            <div class="a4-q-header">
              <strong class="a4-q-num">${idx + 1}.</strong>
              <span class="a4-q-prompt">${escape(q.prompt)}</span>
            </div>

            ${withGrid ? `
              <div class="a4-grid-wrapper focalizada-grid-${count}q-${idx}">
                <div class="notebook-grid notebook-grid-a4-v">
                  ${GRID_CELLS_A4_V}
                </div>
              </div>
            ` : ''}

            ${isOMR ? `
              <div class="a4-footer-row" style="${withGrid ? '' : 'margin-top:2.5mm;'}">
                <div class="b2-omr-row" style="margin:0; width:100%;">
                  <div class="b2-omr-opt"><span class="omr-bubble">A</span> <span class="omr-text">${escape(q.options?.A || '')}</span></div>
                  <div class="b2-omr-opt"><span class="omr-bubble">B</span> <span class="omr-text">${escape(q.options?.B || '')}</span></div>
                  <div class="b2-omr-opt"><span class="omr-bubble">C</span> <span class="omr-text">${escape(q.options?.C || '')}</span></div>
                  <div class="b2-omr-opt"><span class="omr-bubble">D</span> <span class="omr-text">${escape(q.options?.D || '')}</span></div>
                </div>
              </div>
            ` : `
              <div class="a4-footer-row" style="${withGrid ? '' : 'margin-top:2.5mm;'}">
                <div class="b2-free-row" style="margin:0;">
                  <span class="b2-free-tag">Rpta:</span>
                  <div class="b2-free-box"></div>
                </div>
              </div>
            `}

            ${(!withGrid && idx === activeQuestions.length - 1 && count !== 5) ? `
              <div class="focalizada-grid-slot-${count}p" style="position:relative; width:100%; height:24px; margin-top:2mm;"></div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

if (typeof window !== 'undefined') {
  window.createFocalizadaA5Card = createFocalizadaA5Card;
  window.createFocalizadaA5VerticalCard = createFocalizadaA5VerticalCard;
  window.createFocalizadaA6Card = createFocalizadaA6Card;
  window.createFocalizadaA4Card = createFocalizadaA4Card;
  window.createFocalizadaA4VerticalCard = createFocalizadaA4VerticalCard;
}

