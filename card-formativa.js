// =============================================================================
// card-formativa.js — Submódulo 1: Formativa con IA (Rama 1)
// Microevaluación v3.1.85
//
// MÓDULO BLINDADO:
//   * Evaluaciones de 1 a 2 preguntas (Alternativas OMR o Respuesta Libre).
//   * Cuadrícula de cálculo (borrador) obligatoria con celdas cuadradas 1:1.
//   * Altura de franja de respuesta (Rpta: [   ]) calibrada a nivel con ArUco BL.
//   * Formatos soportados: A5 Horizontal, A5 Vertical, A6 Horizontal, A6 Vertical.
// =============================================================================

const FORMATIVA_FIDUCIALS_A5 = `
  <div class="fiducial fiducial-tl" title="ArUco 0"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9"><rect x="0" y="0" width="9" height="9" fill="white"/><rect x="1" y="1" width="7" height="7" fill="black"/><rect x="2" y="2" width="1" height="1" fill="white"/><rect x="2" y="3" width="1" height="1" fill="white"/><rect x="2" y="4" width="1" height="1" fill="white"/><rect x="2" y="5" width="1" height="1" fill="white"/><rect x="2" y="6" width="1" height="1" fill="white"/></svg></div>
  <div class="fiducial fiducial-tr" title="ArUco 1"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9"><rect x="0" y="0" width="9" height="9" fill="white"/><rect x="1" y="1" width="7" height="7" fill="black"/><rect x="2" y="2" width="1" height="1" fill="white"/><rect x="2" y="3" width="1" height="1" fill="white"/><rect x="2" y="4" width="1" height="1" fill="white"/><rect x="2" y="5" width="1" height="1" fill="white"/><rect x="2" y="6" width="1" height="1" fill="white"/><rect x="4" y="6" width="1" height="1" fill="white"/><rect x="5" y="6" width="1" height="1" fill="white"/><rect x="6" y="6" width="1" height="1" fill="white"/></svg></div>
  <div class="fiducial fiducial-br" title="ArUco 2"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9"><rect x="0" y="0" width="9" height="9" fill="white"/><rect x="1" y="1" width="7" height="7" fill="black"/><rect x="2" y="2" width="1" height="1" fill="white"/><rect x="2" y="3" width="1" height="1" fill="white"/><rect x="2" y="4" width="1" height="1" fill="white"/><rect x="2" y="5" width="1" height="1" fill="white"/><rect x="2" y="6" width="1" height="1" fill="white"/><rect x="3" y="6" width="1" height="1" fill="white"/><rect x="6" y="6" width="1" height="1" fill="white"/></svg></div>
  <div class="fiducial fiducial-bl" title="ArUco 3"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9"><rect x="0" y="0" width="9" height="9" fill="white"/><rect x="1" y="1" width="7" height="7" fill="black"/><rect x="2" y="2" width="1" height="1" fill="white"/><rect x="2" y="3" width="1" height="1" fill="white"/><rect x="2" y="4" width="1" height="1" fill="white"/><rect x="2" y="5" width="1" height="1" fill="white"/><rect x="2" y="6" width="1" height="1" fill="white"/><rect x="3" y="6" width="1" height="1" fill="white"/><rect x="4" y="6" width="1" height="1" fill="white"/><rect x="5" y="6" width="1" height="1" fill="white"/></svg></div>
`;

function formativaEscape(t) {
  const s = (typeof escaparHtml === 'function')
    ? escaparHtml(t)
    : String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return (typeof formatMathHtml === 'function') ? formatMathHtml(s) : s;
}

/**
 * Renderiza la ficha Formativa con IA en A5 Horizontal (1 o 2 preguntas con borrador)
 */
function createFormativaA5Card(student, classroom, evaluation) {
  const gradeText = ClassroomData.formatGrade(classroom.gradeStage, classroom.gradeLevel) || classroom.name;
  const isOMR = evaluation.type === 'mc';
  const qCount = evaluation.questionCount || (evaluation.questions ? evaluation.questions.length : 1);
  const escape = formativaEscape;

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

  // 1 Pregunta - OMR
  if (isOMR && qCount === 1) {
    const q1 = (evaluation.questions && evaluation.questions[0]) || {
      prompt: evaluation.prompt,
      options: evaluation.options || { A: '', B: '', C: '', D: '' }
    };
    return `
      <div class="card-a5 mc-card mc-1q">
        ${FORMATIVA_FIDUCIALS_A5}
        ${headerHTML}

        <div class="problem-wide mc-problem">
          <div class="problem-text">${escape(q1.prompt)}</div>
        </div>

        <div class="grid-wrapper mc-grid-1q ${evaluation.gridSize === 'expanded' ? 'grid-wrapper-expanded' : ''}">
          <div class="notebook-grid">${new Array(16 * 7).fill('<i></i>').join('')}</div>
        </div>

        <div class="omr-row omr-row-1">
          <div class="omr-option"><span class="omr-bubble">A</span> <span class="omr-text">${escape(q1.options?.A || '')}</span></div>
          <div class="omr-option"><span class="omr-bubble">B</span> <span class="omr-text">${escape(q1.options?.B || '')}</span></div>
          <div class="omr-option"><span class="omr-bubble">C</span> <span class="omr-text">${escape(q1.options?.C || '')}</span></div>
          <div class="omr-option"><span class="omr-bubble">D</span> <span class="omr-text">${escape(q1.options?.D || '')}</span></div>
        </div>
      </div>
    `;
  }

  // 2 Preguntas - OMR
  if (isOMR && qCount === 2) {
    const q1 = (evaluation.questions && evaluation.questions[0]) || { prompt: '', options: {} };
    const q2 = (evaluation.questions && evaluation.questions[1]) || { prompt: '', options: {} };
    const GRID_CELLS_2Q = new Array(26 * 4).fill('<i></i>').join('');
    return `
      <div class="card-a5 mc-card mc-2q">
        ${FORMATIVA_FIDUCIALS_A5}
        ${headerHTML}

        <!-- Pregunta 1 -->
        <div class="mc-q-block">
          <div class="problem-wide mc-problem-2q">
            <div class="problem-text"><strong>1.</strong> ${escape(q1.prompt)}</div>
          </div>
          <div class="grid-wrapper mc-grid-2q">
            <div class="notebook-grid notebook-grid-2q">${GRID_CELLS_2Q}</div>
          </div>
          <div class="omr-row omr-row-2q-1">
            <div class="omr-option"><span class="omr-bubble">A</span> <span class="omr-text">${escape(q1.options?.A || '')}</span></div>
            <div class="omr-option"><span class="omr-bubble">B</span> <span class="omr-text">${escape(q1.options?.B || '')}</span></div>
            <div class="omr-option"><span class="omr-bubble">C</span> <span class="omr-text">${escape(q1.options?.C || '')}</span></div>
            <div class="omr-option"><span class="omr-bubble">D</span> <span class="omr-text">${escape(q1.options?.D || '')}</span></div>
          </div>
        </div>

        <div class="mc-divider"></div>

        <!-- Pregunta 2 -->
        <div class="mc-q-block">
          <div class="problem-wide mc-problem-2q">
            <div class="problem-text"><strong>2.</strong> ${escape(q2.prompt)}</div>
          </div>
          <div class="grid-wrapper mc-grid-2q">
            <div class="notebook-grid notebook-grid-2q">${GRID_CELLS_2Q}</div>
          </div>
          <div class="omr-row omr-row-2q-2">
            <div class="omr-option"><span class="omr-bubble">A</span> <span class="omr-text">${escape(q2.options?.A || '')}</span></div>
            <div class="omr-option"><span class="omr-bubble">B</span> <span class="omr-text">${escape(q2.options?.B || '')}</span></div>
            <div class="omr-option"><span class="omr-bubble">C</span> <span class="omr-text">${escape(q2.options?.C || '')}</span></div>
            <div class="omr-option"><span class="omr-bubble">D</span> <span class="omr-text">${escape(q2.options?.D || '')}</span></div>
          </div>
        </div>
      </div>
    `;
  }

  // 2 Preguntas - Respuesta Libre (Escrita)
  if (!isOMR && qCount === 2) {
    const q1 = (evaluation.questions && evaluation.questions[0]) || { prompt: '' };
    const q2 = (evaluation.questions && evaluation.questions[1]) || { prompt: '' };
    const GRID_CELLS_2Q = new Array(26 * 4).fill('<i></i>').join('');
    return `
      <div class="card-a5 free-card-2q">
        ${FORMATIVA_FIDUCIALS_A5}
        ${headerHTML}

        <!-- Pregunta 1 -->
        <div class="mc-q-block">
          <div class="problem-wide mc-problem-2q">
            <div class="problem-text"><strong>1.</strong> ${escape(q1.prompt)}</div>
          </div>
          <div class="grid-wrapper mc-grid-2q">
            <div class="notebook-grid notebook-grid-2q">${GRID_CELLS_2Q}</div>
          </div>
          <div class="answer-strip" style="margin-top:4px;">
            <span class="answer-tag">Rpta:</span>
            <div class="answer-box-open"></div>
          </div>
        </div>

        <div class="mc-divider"></div>

        <!-- Pregunta 2 -->
        <div class="mc-q-block">
          <div class="problem-wide mc-problem-2q">
            <div class="problem-text"><strong>2.</strong> ${escape(q2.prompt)}</div>
          </div>
          <div class="grid-wrapper mc-grid-2q">
            <div class="notebook-grid notebook-grid-2q">${GRID_CELLS_2Q}</div>
          </div>
          <div class="answer-strip" style="margin-top:4px;">
            <span class="answer-tag">Rpta:</span>
            <div class="answer-box-open"></div>
          </div>
        </div>
      </div>
    `;
  }

  // 1 Pregunta - Respuesta Libre Tradicional
  return `
    <div class="card-a5">
      ${FORMATIVA_FIDUCIALS_A5}
      ${headerHTML}

      <div class="problem-wide">
        <div class="problem-text">
          ${escape(evaluation.prompt)}
        </div>
      </div>

      <div class="grid-wrapper ${evaluation.gridSize === 'expanded' ? 'grid-wrapper-expanded' : ''}">
        <div class="notebook-grid">${new Array(16 * 7).fill('<i></i>').join('')}</div>
      </div>

      <div class="answer-strip">
        <span class="answer-tag">Rpta:</span>
        <div class="answer-box-open"></div>
        <div class="answer-line">
          <span class="answer-line-hint">${escape(evaluation.unitHint || '(unidades)')}</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Renderiza la ficha Formativa con IA en A5 Vertical (1 o 2 preguntas con borrador)
 */
function createFormativaA5VerticalCard(student, classroom, evaluation) {
  const gradeText = ClassroomData.formatGrade(classroom.gradeStage, classroom.gradeLevel) || classroom.name;
  const escape = formativaEscape;
  const safeStudentName = escape(student.name.toUpperCase());
  const safeGradeText = escape(gradeText);
  const orderMatch = String(student.id || '').match(/\d+/);
  const orderNumber = orderMatch ? '#' + String(orderMatch[0]).padStart(2, '0') : escape(student.id || '');
  const qCount = evaluation.questionCount || (evaluation.questions ? evaluation.questions.length : 1);
  const isOMR = (evaluation.type === 'mc');

  const fiducialsHTML = FORMATIVA_FIDUCIALS_A5;

  if (qCount === 2) {
    const q1 = (evaluation.questions && evaluation.questions[0]) || { prompt: '', options: {} };
    const q2 = (evaluation.questions && evaluation.questions[1]) || { prompt: '', options: {} };
    const GRID_CELLS_V_2Q = new Array(13 * 5).fill('<i></i>').join('');

    return `
      <div class="card-a5-v-free">
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

        <!-- Pregunta 1 -->
        <div class="v-free-2q-block">
          <div class="v-free-problem-2q">
            <div class="problem-text"><strong>1.</strong> ${escape(q1.prompt)}</div>
          </div>
          <div class="v-free-grid-2q">
            <div class="notebook-grid notebook-grid-v2q">${GRID_CELLS_V_2Q}</div>
          </div>
          ${isOMR ? `
            <div class="v-omr-row v-omr-row-2q">
              <div class="v-omr-option"><span class="v-omr-bubble">A</span> <span class="v-omr-text">${escape(q1.options?.A || '')}</span></div>
              <div class="v-omr-option"><span class="v-omr-bubble">B</span> <span class="v-omr-text">${escape(q1.options?.B || '')}</span></div>
              <div class="v-omr-option"><span class="v-omr-bubble">C</span> <span class="v-omr-text">${escape(q1.options?.C || '')}</span></div>
              <div class="v-omr-option"><span class="v-omr-bubble">D</span> <span class="v-omr-text">${escape(q1.options?.D || '')}</span></div>
            </div>
          ` : `
            <div class="v-free-answer-strip-2q">
              <span class="answer-tag">Rpta:</span>
              <div class="answer-box-open"></div>
            </div>
          `}
        </div>

        <div class="v-free-divider"></div>

        <!-- Pregunta 2 -->
        <div class="v-free-2q-block">
          <div class="v-free-problem-2q">
            <div class="problem-text"><strong>2.</strong> ${escape(q2.prompt)}</div>
          </div>
          <div class="v-free-grid-2q">
            <div class="notebook-grid notebook-grid-v2q">${GRID_CELLS_V_2Q}</div>
          </div>
          ${isOMR ? `
            <div class="v-omr-row v-omr-row-2q">
              <div class="v-omr-option"><span class="v-omr-bubble">A</span> <span class="v-omr-text">${escape(q2.options?.A || '')}</span></div>
              <div class="v-omr-option"><span class="v-omr-bubble">B</span> <span class="v-omr-text">${escape(q2.options?.B || '')}</span></div>
              <div class="v-omr-option"><span class="v-omr-bubble">C</span> <span class="v-omr-text">${escape(q2.options?.C || '')}</span></div>
              <div class="v-omr-option"><span class="v-omr-bubble">D</span> <span class="v-omr-text">${escape(q2.options?.D || '')}</span></div>
            </div>
          ` : `
            <div class="v-free-answer-strip-2q">
              <span class="answer-tag">Rpta:</span>
              <div class="answer-box-open"></div>
            </div>
          `}
        </div>
      </div>
    `;
  }

  // 1 Pregunta Formativa en A5 Vertical
  const q1 = (evaluation.questions && evaluation.questions[0]) || {
    prompt: evaluation.prompt,
    options: evaluation.options || { A: '', B: '', C: '', D: '' }
  };
  const isGridExpanded = evaluation.gridSize === 'expanded';
  const GRID_CELLS_V_FREE = new Array(13 * 13).fill('<i></i>').join('');

  return `
    <div class="card-a5-v-free">
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

      <div class="v-free-problem">
        <div class="problem-text">${escape(q1.prompt || evaluation.prompt)}</div>
      </div>

      <div class="v-free-grid ${isGridExpanded ? 'v-free-grid-expanded' : ''}">
        <div class="notebook-grid notebook-grid-v">${GRID_CELLS_V_FREE}</div>
      </div>

      ${isOMR ? `
        <div class="v-omr-row">
          <div class="v-omr-option"><span class="v-omr-bubble">A</span> <span class="v-omr-text">${escape(q1.options?.A || '')}</span></div>
          <div class="v-omr-option"><span class="v-omr-bubble">B</span> <span class="v-omr-text">${escape(q1.options?.B || '')}</span></div>
          <div class="v-omr-option"><span class="v-omr-bubble">C</span> <span class="v-omr-text">${escape(q1.options?.C || '')}</span></div>
          <div class="v-omr-option"><span class="v-omr-bubble">D</span> <span class="v-omr-text">${escape(q1.options?.D || '')}</span></div>
        </div>
      ` : `
        <div class="v-free-answer-strip">
          <span class="answer-tag">Rpta:</span>
          <div class="answer-box-open"></div>
          <div class="answer-line">
            <span class="answer-line-hint">${escape(evaluation.unitHint || '(unidades)')}</span>
          </div>
        </div>
      `}
    </div>
  `;
}

/**
 * Renderiza la ficha Formativa con IA en A6 (Horizontal o Vertical, 1 pregunta con borrador)
 */
function createFormativaA6Card(student, classroom, evaluation) {
  const gradeText = ClassroomData.formatGrade(classroom.gradeStage, classroom.gradeLevel) || classroom.name;
  const isOMR = (evaluation.type === 'mc');
  const escape = formativaEscape;
  const safeStudentName = escape(student.name.toUpperCase());
  const safeGradeText = escape(gradeText);
  const orderMatch = String(student.id || '').match(/\d+/);
  const orderNumber = orderMatch ? '#' + String(orderMatch[0]).padStart(2, '0') : escape(student.id || '');

  const fiducialsHTML = FORMATIVA_FIDUCIALS_A5;
  const isA6Vertical = evaluation.isPortrait === true || evaluation.orientation === 'vertical' || evaluation.cardOrientation === 'vertical';

  const q1 = (evaluation.questions && evaluation.questions[0]) || {
    prompt: evaluation.prompt,
    options: evaluation.options || { A: '', B: '', C: '', D: '' }
  };

  if (isA6Vertical) {
    const GRID_CELLS_A6_V = new Array(9 * 9).fill('<i></i>').join('');
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

        <div class="a6-v-problem">
          <div class="problem-text">${escape(q1.prompt)}</div>
        </div>

        <div class="grid-wrapper a6-v-grid-wrapper">
          <div class="notebook-grid notebook-grid-a6-v">${GRID_CELLS_A6_V}</div>
        </div>

        ${isOMR ? `
          <div class="a6-omr-row">
            <div class="v-omr-option"><span class="v-omr-bubble">A</span> <span class="v-omr-text">${escape(q1.options?.A || '')}</span></div>
            <div class="v-omr-option"><span class="v-omr-bubble">B</span> <span class="v-omr-text">${escape(q1.options?.B || '')}</span></div>
            <div class="v-omr-option"><span class="v-omr-bubble">C</span> <span class="v-omr-text">${escape(q1.options?.C || '')}</span></div>
            <div class="v-omr-option"><span class="v-omr-bubble">D</span> <span class="v-omr-text">${escape(q1.options?.D || '')}</span></div>
          </div>
        ` : `
          <div class="a6-free-answer-strip">
            <span class="v-nogrid-free-tag">Rpta:</span>
            <div class="a6-nogrid-free-box"></div>
          </div>
        `}
      </div>
    `;
  }

  // A6 Horizontal con Cuadrícula
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

      <div class="grid-wrapper a6-grid-wrapper" style="position:relative; margin:1mm auto 0 auto; height:34mm; flex:0 0 34mm;">
        <div class="notebook-grid notebook-grid-a6" style="height:34mm; grid-template-rows:repeat(4, 1fr);">${new Array(13 * 4).fill('<i></i>').join('')}</div>
      </div>

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

if (typeof window !== 'undefined') {
  window.createFormativaA5Card = createFormativaA5Card;
  window.createFormativaA5VerticalCard = createFormativaA5VerticalCard;
  window.createFormativaA6Card = createFormativaA6Card;
}
