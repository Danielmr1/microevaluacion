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
  return (typeof escaparHtml === 'function')
    ? escaparHtml(t)
    : String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * Renderiza la ficha Focalizada en A6 sin cuadrícula (1 o 2 preguntas)
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

  const activeQuestions = (evaluation.questions && evaluation.questions.length > 0)
    ? evaluation.questions.slice(0, totalQ)
    : [{
        prompt: evaluation.prompt,
        options: evaluation.options || { A: '', B: '', C: '', D: '' }
      }];

  return `
    <div class="card-a6-r3">
      ${FOCALIZADA_FIDUCIALS}
      <div class="a6-card-header">
        <div class="a6-header-left">
          <div class="a6-header-top-title">EVALUACIÓN FOCALIZADA</div>
          <div class="a6-student-block">
            <span class="a6-student-label">Nombre:</span>
            <span class="a6-student-name">${safeStudentName}</span>
            <span class="a6-student-grade">(${safeGradeText})</span>
          </div>
        </div>
        <div class="a6-qr-block">
          <span class="a6-qr-code-text">${orderNumber}</span>
          <div class="a6-qr-box" id="qr-box-${student.id}"></div>
        </div>
      </div>

      <div class="a6-nogrid-body">
        ${activeQuestions.map((q, idx) => `
          <div class="a6-nogrid-q">
            <div class="a6-nogrid-q-prompt">
              <strong>${idx + 1}.</strong> ${escape(q.prompt)}
            </div>
            ${isOMR ? `
              <div class="a6-nogrid-omr">
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
}
