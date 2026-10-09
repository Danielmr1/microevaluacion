// =============================================================================
// card-generator.js — Microevaluación A5 v3.1.37
// MÓDULO: GENERADOR DE FICHAS A5, HOJAS DE IMPRESIÓN A4 Y AJUSTE TIPOGRÁFICO
//
// Guardarraíles activos:
//   Regla 1  – Cero regresión Respuesta Libre: la ficha tradicional conserva su
//              cuadrícula completa de 16x7 y su franja manuscrita "Rpta: _______".
//   Regla 2  – Aislamiento Total de Alternativas: evaluación.type === 'mc' es la
//              única condición para generar fichas con burbujas OMR.
//   Regla 4  – Geometría Sagrada de la Ficha A5:
//              * Cabecera fija de 20 mm.
//              * Zona limpia de marcadores ArUco de 16 mm.
//              * Ante preguntas múltiples, lo ÚNICO que se achica es la cuadrícula
//                de cálculo (borrador). Jamás la cabecera ni los márgenes del QR.
//
// Dependencias globales: ClassroomData, QRCode
// =============================================================================

/* ── GEOMETRÍA DE LA CUADRÍCULA DE CÁLCULO ──
   16 columnas x 7 filas. DEBE coincidir con .notebook-grid del CSS y con
   ROI_CONFIG.RESOLUTION en roi-processor.js. Si se cambia el número de
   filas o columnas, hay que recalcular esa ROI. */
const A5_GRID_COLS = 16;
const A5_GRID_ROWS = 7;
const GRID_CELLS_HTML = new Array(A5_GRID_COLS * A5_GRID_ROWS).fill('<i></i>').join('');

function createA5Card(student, classroom, evaluation) {
  const gradeText = ClassroomData.formatGrade(classroom.gradeStage, classroom.gradeLevel)
    || classroom.name;

  const fiducialsHTML = `
    <div class="fiducial fiducial-tl" title="ArUco 0"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9"><rect x="0" y="0" width="9" height="9" fill="white"/><rect x="1" y="1" width="7" height="7" fill="black"/><rect x="2" y="2" width="1" height="1" fill="white"/><rect x="2" y="3" width="1" height="1" fill="white"/><rect x="2" y="4" width="1" height="1" fill="white"/><rect x="2" y="5" width="1" height="1" fill="white"/><rect x="2" y="6" width="1" height="1" fill="white"/></svg></div>
    <div class="fiducial fiducial-tr" title="ArUco 1"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9"><rect x="0" y="0" width="9" height="9" fill="white"/><rect x="1" y="1" width="7" height="7" fill="black"/><rect x="2" y="2" width="1" height="1" fill="white"/><rect x="2" y="3" width="1" height="1" fill="white"/><rect x="2" y="4" width="1" height="1" fill="white"/><rect x="2" y="5" width="1" height="1" fill="white"/><rect x="2" y="6" width="1" height="1" fill="white"/><rect x="4" y="6" width="1" height="1" fill="white"/><rect x="5" y="6" width="1" height="1" fill="white"/><rect x="6" y="6" width="1" height="1" fill="white"/></svg></div>
    <div class="fiducial fiducial-br" title="ArUco 2"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9"><rect x="0" y="0" width="9" height="9" fill="white"/><rect x="1" y="1" width="7" height="7" fill="black"/><rect x="2" y="2" width="1" height="1" fill="white"/><rect x="2" y="3" width="1" height="1" fill="white"/><rect x="2" y="4" width="1" height="1" fill="white"/><rect x="2" y="5" width="1" height="1" fill="white"/><rect x="2" y="6" width="1" height="1" fill="white"/><rect x="3" y="6" width="1" height="1" fill="white"/><rect x="6" y="6" width="1" height="1" fill="white"/></svg></div>
    <div class="fiducial fiducial-bl" title="ArUco 3"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9"><rect x="0" y="0" width="9" height="9" fill="white"/><rect x="1" y="1" width="7" height="7" fill="black"/><rect x="2" y="2" width="1" height="1" fill="white"/><rect x="2" y="3" width="1" height="1" fill="white"/><rect x="2" y="4" width="1" height="1" fill="white"/><rect x="2" y="5" width="1" height="1" fill="white"/><rect x="2" y="6" width="1" height="1" fill="white"/><rect x="3" y="6" width="1" height="1" fill="white"/><rect x="4" y="6" width="1" height="1" fill="white"/><rect x="5" y="6" width="1" height="1" fill="white"/></svg></div>
  `;

  const isOMR = evaluation.type === 'mc';
  const qCount = evaluation.questionCount || (evaluation.questions ? evaluation.questions.length : 1);

  const escape = (typeof escaparHtml === 'function')
    ? escaparHtml
    : (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const safeStudentName = escape(student.name.toUpperCase());
  const safeGradeText = escape(gradeText);
  const orderMatch = String(student.id || '').match(/\d+/);
  const orderNumber = orderMatch ? '#' + orderMatch[0] : escape(student.id || '');

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
            <span class="qr-code-text">${orderNumber}</span>
            <div class="qr-box" id="qr-box-${student.id}"></div>
          </div>
        </div>`;

  // ── CASO RAMA 3: CARTILLA DE RESPUESTAS OMR (HASTA 20 PREGUNTAS) ──
  const isBranch3 = evaluation.branch === 'rama3' ||
    (evaluation.id && String(evaluation.id).startsWith('eval_r3_')) ||
    (isOMR && qCount > 2);
  if (isBranch3) {
    return qCount <= 8
      ? createA6Card(student, classroom, evaluation)
      : createA5VerticalR3Card(student, classroom, evaluation);
  }

  // ── CASO RAMA 2: EVALUACIÓN FOCALIZADA SIN BORRADOR (1 A 3 PREGUNTAS) ──
  const isBranch2NoGrid = (evaluation.branch === 'rama2' || evaluation.withGrid === false) && evaluation.withGrid === false;
  if (isBranch2NoGrid) {
    const activeQuestions = (evaluation.questions && evaluation.questions.length > 0)
      ? evaluation.questions
      : [{
          prompt: evaluation.prompt,
          options: evaluation.options || { A: '', B: '', C: '', D: '' },
          expectedAnswer: evaluation.expectedAnswer || ''
        }];

    return `
      <div class="card-a5 branch2-nogrid-card">
        ${fiducialsHTML}
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

  // CASO 1: Opción Múltiple - 1 Pregunta (con cuadrícula)
  if (isOMR && qCount === 1) {
    const q1 = (evaluation.questions && evaluation.questions[0]) || {
      prompt: evaluation.prompt,
      options: evaluation.options || { A: '', B: '', C: '', D: '' }
    };
    return `
      <div class="card-a5 mc-card mc-1q">
        ${fiducialsHTML}
        ${headerHTML}

        <div class="problem-wide mc-problem">
          <div class="problem-text">${escape(q1.prompt)}</div>
        </div>

        <div class="grid-wrapper mc-grid-1q">
          <div class="notebook-grid">${GRID_CELLS_HTML}</div>
        </div>

        <div class="omr-row omr-row-1">
          <div class="omr-option"><span class="omr-bubble">A</span> <span class="omr-text">${escape(q1.options.A || '')}</span></div>
          <div class="omr-option"><span class="omr-bubble">B</span> <span class="omr-text">${escape(q1.options.B || '')}</span></div>
          <div class="omr-option"><span class="omr-bubble">C</span> <span class="omr-text">${escape(q1.options.C || '')}</span></div>
          <div class="omr-option"><span class="omr-bubble">D</span> <span class="omr-text">${escape(q1.options.D || '')}</span></div>
        </div>
      </div>
    `;
  }

  // CASO 2: Opción Múltiple - 2 Preguntas (con cuadrícula)
  if (isOMR && qCount === 2) {
    const q1 = (evaluation.questions && evaluation.questions[0]) || { prompt: '', options: {} };
    const q2 = (evaluation.questions && evaluation.questions[1]) || { prompt: '', options: {} };
    const GRID_CELLS_2Q = new Array(16 * 4).fill('<i></i>').join('');
    return `
      <div class="card-a5 mc-card mc-2q">
        ${fiducialsHTML}
        ${headerHTML}

        <!-- Pregunta 1 -->
        <div class="mc-q-block">
          <div class="problem-wide mc-problem-2q">
            <div class="problem-text"><strong>1.</strong> ${escape(q1.prompt)}</div>
          </div>
          <div class="grid-wrapper mc-grid-2q">
            <div class="notebook-grid">${GRID_CELLS_2Q}</div>
          </div>
          <div class="omr-row omr-row-2q-1">
            <div class="omr-option"><span class="omr-bubble">A</span> <span class="omr-text">${escape(q1.options.A || '')}</span></div>
            <div class="omr-option"><span class="omr-bubble">B</span> <span class="omr-text">${escape(q1.options.B || '')}</span></div>
            <div class="omr-option"><span class="omr-bubble">C</span> <span class="omr-text">${escape(q1.options.C || '')}</span></div>
            <div class="omr-option"><span class="omr-bubble">D</span> <span class="omr-text">${escape(q1.options.D || '')}</span></div>
          </div>
        </div>

        <div class="mc-divider"></div>

        <!-- Pregunta 2 -->
        <div class="mc-q-block">
          <div class="problem-wide mc-problem-2q">
            <div class="problem-text"><strong>2.</strong> ${escape(q2.prompt)}</div>
          </div>
          <div class="grid-wrapper mc-grid-2q">
            <div class="notebook-grid">${GRID_CELLS_2Q}</div>
          </div>
          <div class="omr-row omr-row-2q-2">
            <div class="omr-option"><span class="omr-bubble">A</span> <span class="omr-text">${escape(q2.options.A || '')}</span></div>
            <div class="omr-option"><span class="omr-bubble">B</span> <span class="omr-text">${escape(q2.options.B || '')}</span></div>
            <div class="omr-option"><span class="omr-bubble">C</span> <span class="omr-text">${escape(q2.options.C || '')}</span></div>
            <div class="omr-option"><span class="omr-bubble">D</span> <span class="omr-text">${escape(q2.options.D || '')}</span></div>
          </div>
        </div>
      </div>
    `;
  }

  // CASO RAMA 2: 2 Preguntas Escritas con Borrador (Cuadrícula)
  if (!isOMR && qCount === 2 && evaluation.branch === 'rama2') {
    const q1 = (evaluation.questions && evaluation.questions[0]) || { prompt: '' };
    const q2 = (evaluation.questions && evaluation.questions[1]) || { prompt: '' };
    const GRID_CELLS_2Q = new Array(16 * 4).fill('<i></i>').join('');
    return `
      <div class="card-a5 free-card-2q">
        ${fiducialsHTML}
        ${headerHTML}

        <!-- Pregunta 1 -->
        <div class="mc-q-block">
          <div class="problem-wide mc-problem-2q">
            <div class="problem-text"><strong>1.</strong> ${escape(q1.prompt)}</div>
          </div>
          <div class="grid-wrapper mc-grid-2q">
            <div class="notebook-grid">${GRID_CELLS_2Q}</div>
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
            <div class="notebook-grid">${GRID_CELLS_2Q}</div>
          </div>
          <div class="answer-strip" style="margin-top:4px;">
            <span class="answer-tag">Rpta:</span>
            <div class="answer-box-open"></div>
          </div>
        </div>
      </div>
    `;
  }

  // CASO 3: Escritura manual tradicional (Fallback)
  return `
    <div class="card-a5">
      ${fiducialsHTML}
      ${headerHTML}

      <div class="problem-wide">
        <div class="problem-text">
          ${escape(evaluation.prompt)}
        </div>
      </div>

      <div class="grid-wrapper">
        <div class="notebook-grid">${GRID_CELLS_HTML}</div>
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
 * Genera la Cartilla A6 individual (136 x 92 mm) para el modo de 4 alumnos por hoja A4 (Rama 3 <= 8 preguntas).
 * Cumple con la regla inmutable: ESTRICTAMENTE 1 SOLA COLUMNA VERTICAL de burbujas (01 al 0N hacia abajo).
 */
function createA6Card(student, classroom, evaluation) {
  const gradeText = ClassroomData.formatGrade(classroom.gradeStage, classroom.gradeLevel)
    || classroom.name;

  const fiducialsHTML = `
    <div class="fiducial fiducial-tl" title="ArUco 0"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9"><rect x="0" y="0" width="9" height="9" fill="white"/><rect x="1" y="1" width="7" height="7" fill="black"/><rect x="2" y="2" width="1" height="1" fill="white"/><rect x="2" y="3" width="1" height="1" fill="white"/><rect x="2" y="4" width="1" height="1" fill="white"/><rect x="2" y="5" width="1" height="1" fill="white"/><rect x="2" y="6" width="1" height="1" fill="white"/></svg></div>
    <div class="fiducial fiducial-tr" title="ArUco 1"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9"><rect x="0" y="0" width="9" height="9" fill="white"/><rect x="1" y="1" width="7" height="7" fill="black"/><rect x="2" y="2" width="1" height="1" fill="white"/><rect x="2" y="3" width="1" height="1" fill="white"/><rect x="2" y="4" width="1" height="1" fill="white"/><rect x="2" y="5" width="1" height="1" fill="white"/><rect x="2" y="6" width="1" height="1" fill="white"/><rect x="4" y="6" width="1" height="1" fill="white"/><rect x="5" y="6" width="1" height="1" fill="white"/><rect x="6" y="6" width="1" height="1" fill="white"/></svg></div>
    <div class="fiducial fiducial-br" title="ArUco 2"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9"><rect x="0" y="0" width="9" height="9" fill="white"/><rect x="1" y="1" width="7" height="7" fill="black"/><rect x="2" y="2" width="1" height="1" fill="white"/><rect x="2" y="3" width="1" height="1" fill="white"/><rect x="2" y="4" width="1" height="1" fill="white"/><rect x="2" y="5" width="1" height="1" fill="white"/><rect x="2" y="6" width="1" height="1" fill="white"/><rect x="3" y="6" width="1" height="1" fill="white"/><rect x="6" y="6" width="1" height="1" fill="white"/></svg></div>
    <div class="fiducial fiducial-bl" title="ArUco 3"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9"><rect x="0" y="0" width="9" height="9" fill="white"/><rect x="1" y="1" width="7" height="7" fill="black"/><rect x="2" y="2" width="1" height="1" fill="white"/><rect x="2" y="3" width="1" height="1" fill="white"/><rect x="2" y="4" width="1" height="1" fill="white"/><rect x="2" y="5" width="1" height="1" fill="white"/><rect x="2" y="6" width="1" height="1" fill="white"/><rect x="3" y="6" width="1" height="1" fill="white"/><rect x="4" y="6" width="1" height="1" fill="white"/><rect x="5" y="6" width="1" height="1" fill="white"/></svg></div>
  `;

  const totalQ = evaluation.questionCount || (evaluation.questions ? evaluation.questions.length : 5);

  const escape = (typeof escaparHtml === 'function')
    ? escaparHtml
    : (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const safeStudentName = escape(student.name.toUpperCase());
  const safeGradeText = escape(gradeText);
  const orderMatch = String(student.id || '').match(/\d+/);
  const orderNumber = orderMatch ? '#' + orderMatch[0] : escape(student.id || '');

  let bodyHTML = '';
  if (totalQ === 8) {
    const col1Rows = [];
    const col2Rows = [];
    for (let i = 0; i < 4; i++) {
      const qNum = String(i + 1).padStart(2, '0');
      col1Rows.push(`
        <div class="a6-q-row">
          <span class="a6-q-num">${qNum}</span>
          <div class="a6-bubbles-group">
            <span class="a6-bubble">A</span>
            <span class="a6-bubble">B</span>
            <span class="a6-bubble">C</span>
            <span class="a6-bubble">D</span>
          </div>
        </div>
      `);
    }
    for (let i = 4; i < 8; i++) {
      const qNum = String(i + 1).padStart(2, '0');
      col2Rows.push(`
        <div class="a6-q-row">
          <span class="a6-q-num">${qNum}</span>
          <div class="a6-bubbles-group">
            <span class="a6-bubble">A</span>
            <span class="a6-bubble">B</span>
            <span class="a6-bubble">C</span>
            <span class="a6-bubble">D</span>
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
      qRows.push(`
        <div class="a6-q-row">
          <span class="a6-q-num">${qNum}</span>
          <div class="a6-bubbles-group">
            <span class="a6-bubble">A</span>
            <span class="a6-bubble">B</span>
            <span class="a6-bubble">C</span>
            <span class="a6-bubble">D</span>
          </div>
        </div>
      `);
    }
    bodyHTML = qRows.join('');
  }

  return `
    <div class="card-a6-r3">
      ${fiducialsHTML}
      <div class="a6-card-header">
        <div class="a6-header-left">
          <div class="a6-header-top-title">CARTILLA DE RESPUESTAS</div>
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

      <span class="a6-fill-hint-side">Rellena: <b>●</b></span>
      <div class="a6-b3-body">
        ${bodyHTML}
      </div>
    </div>
  `;
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
  const orderNumber = orderMatch ? '#' + orderMatch[0] : escape(student.id || '');

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
        <div class="v-header-left">
          <div class="v-header-top-title">CARTILLA DE RESPUESTAS</div>
          <div class="v-student-block">
            <span class="v-student-label">Nombre:</span>
            <span class="v-student-name">${safeStudentName}</span>
            <span class="v-student-grade">(${safeGradeText})</span>
          </div>
        </div>
        <div class="v-qr-block">
          <span class="v-qr-code-text">${orderNumber}</span>
          <div class="v-qr-box" id="qr-box-${student.id}"></div>
        </div>
      </div>

      <span class="v-fill-hint-side">Rellena: <b>●</b></span>
      <div class="v-b3-body">
        ${bodyHTML}
      </div>
    </div>
  `;
}

function renderAllPrintPages(classId, evaluation) {
  const container = document.getElementById('pages-container');
  if (!container) return;
  container.style.display = 'flex';
  const classroom = ClassroomData.getClassroom(classId);
  if (!classroom || !classroom.students || classroom.students.length === 0) {
    container.innerHTML = '';
    console.warn('[Fichas] No se pudieron generar: el salón no existe o no tiene alumnos.', classId);
    return;
  }
  const students = classroom.students;
  container.innerHTML = '';

  const qCount = evaluation?.questionCount || (evaluation?.questions ? evaluation.questions.length : 5);
  const isR3 = evaluation && (
    evaluation.branch === 'rama3' ||
    (evaluation.id && String(evaluation.id).startsWith('eval_r3_')) ||
    (evaluation.type === 'mc' && qCount > 2)
  );

  // ── CASO CARTILLA OMR HASTA 8 PREGUNTAS: 4 ALUMNOS POR HOJA A4 (HORIZONTAL 2x2) ──
  if (isR3 && qCount <= 8) {
    const sheetCount = Math.ceil(students.length / 4);
    const printBtn = document.getElementById('btn-print-sheets');
    if (printBtn) {
      const pageWord = sheetCount === 1 ? 'página A4' : 'páginas A4';
      printBtn.innerHTML = `🖨️ Descargar Cartillas OMR (${sheetCount} ${pageWord}) [4 por hoja]`;
      printBtn.onclick = () => printEvaluationSheets(classId);
    }

    try {
      document.title = getPdfExportTitle(classroom);
    } catch (e) {}

    for (let i = 0; i < students.length; i += 4) {
      const sTL = students[i];
      const sTR = students[i + 1] || null;
      const sBL = students[i + 2] || null;
      const sBR = students[i + 3] || null;

      const sheetEl = document.createElement('div');
      sheetEl.className = 'sheet-a4-quad';
      sheetEl.innerHTML = `
        <div class="quad-row">
          ${sTL ? createA6Card(sTL, classroom, evaluation) : '<div class="card-a6-empty"></div>'}
          <div class="quad-vcut">
            <div class="quad-vcut-line"></div>
            <span class="quad-vcut-text">✂️</span>
            <div class="quad-vcut-line"></div>
          </div>
          ${sTR ? createA6Card(sTR, classroom, evaluation) : '<div class="card-a6-empty"></div>'}
        </div>
        <div class="quad-hcut">
          <span>✂️ cortar por aquí ✂️</span>
        </div>
        <div class="quad-row">
          ${sBL ? createA6Card(sBL, classroom, evaluation) : '<div class="card-a6-empty"></div>'}
          <div class="quad-vcut">
            <div class="quad-vcut-line"></div>
            <span class="quad-vcut-text">✂️</span>
            <div class="quad-vcut-line"></div>
          </div>
          ${sBR ? createA6Card(sBR, classroom, evaluation) : '<div class="card-a6-empty"></div>'}
        </div>
      `;
      container.appendChild(sheetEl);

      // Generar códigos QR para los alumnos presentes en esta hoja
      if (typeof QRCode !== 'undefined' && QRCode.toString) {
        [sTL, sTR, sBL, sBR].filter(Boolean).forEach(st => {
          QRCode.toString(st.id, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }, (err, svg) => {
            if (err) return;
            const el = document.getElementById('qr-box-' + st.id);
            if (el) el.innerHTML = svg;
          });
        });
      }
    }
    return;
  }

  // ── CASO CARTILLA OMR 9 A 20 PREGUNTAS: 2 ALUMNOS POR HOJA A4 HORIZONTAL (IZQUIERDA Y DERECHA) ──
  if (isR3 && qCount > 8) {
    const sheetCount = Math.ceil(students.length / 2);
    const printBtn = document.getElementById('btn-print-sheets');
    if (printBtn) {
      const pageWord = sheetCount === 1 ? 'página A4' : 'páginas A4';
      printBtn.innerHTML = `🖨️ Descargar Cartillas OMR (${sheetCount} ${pageWord}) [2 por hoja · Horizontal]`;
      printBtn.onclick = () => printEvaluationSheets(classId);
    }

    try {
      document.title = getPdfExportTitle(classroom);
    } catch (e) {}

    for (let i = 0; i < students.length; i += 2) {
      const sLeft = students[i];
      const sRight = students[i + 1] || null;

      const sheetEl = document.createElement('div');
      sheetEl.className = 'sheet-a4-split';
      sheetEl.innerHTML = `
        ${createA5VerticalR3Card(sLeft, classroom, evaluation)}
        <div class="dual-vcut">
          <div class="dual-vcut-line"></div>
          <span class="dual-vcut-text">✂️ cortar por aquí</span>
          <div class="dual-vcut-line"></div>
        </div>
        ${sRight ? createA5VerticalR3Card(sRight, classroom, evaluation) : '<div class="card-a5-v-empty"></div>'}
      `;
      container.appendChild(sheetEl);

      // Generar códigos QR para los alumnos presentes en esta hoja
      if (typeof QRCode !== 'undefined' && QRCode.toString) {
        [sLeft, sRight].filter(Boolean).forEach(st => {
          QRCode.toString(st.id, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }, (err, svg) => {
            if (err) return;
            const el = document.getElementById('qr-box-' + st.id);
            if (el) el.innerHTML = svg;
          });
        });
      }
    }
    return;
  }

  // ── CASO GENERAL (2 FICHAS A5 POR HOJA A4 VERTICAL) ──
  const sheetCount = Math.ceil(students.length / 2);
  const printBtn = document.getElementById('btn-print-sheets');
  if (printBtn) {
    const isR3 = evaluation && evaluation.branch === 'rama3';
    const pageWord = sheetCount === 1 ? 'página A4' : 'páginas A4';
    if (isR3) {
      printBtn.innerHTML = `🖨️ Descargar Cartillas OMR (${sheetCount} ${pageWord})`;
    } else {
      printBtn.innerHTML = `🖨️ Descargar / Imprimir ${sheetCount} ${pageWord}`;
    }
    printBtn.onclick = () => printEvaluationSheets(classId);
  }

  // Actualizar también el título del documento preventivamente por si se usa Ctrl+P o menú del navegador
  try {
    document.title = getPdfExportTitle(classroom);
  } catch (e) {
    // Silencioso en entornos headless o restringidos
  }

  for (let i = 0; i < students.length; i += 2) {
    const sTop = students[i];
    const sBot = students[i + 1] || null;

    const sheetEl = document.createElement('div');
    sheetEl.className = 'sheet-a4';
    sheetEl.innerHTML = sBot
      ? `
      ${createA5Card(sTop, classroom, evaluation)}
      <div class="cut-line">
        <span>✂️ cortar por aquí ✂️</span>
      </div>
      ${createA5Card(sBot, classroom, evaluation)}
    `
      : createA5Card(sTop, classroom, evaluation);
    container.appendChild(sheetEl);

    // Generar el QR (ALUM_01) de cada alumno que va en esta hoja
    if (typeof QRCode !== 'undefined' && QRCode.toString) {
      [sTop, sBot].filter(Boolean).forEach(st => {
        QRCode.toString(st.id, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }, (err, svg) => {
          if (err) return;
          const el = document.getElementById('qr-box-' + st.id);
          if (el) el.innerHTML = svg;
        });
      });
    }
  }

  // Ajustar el tamaño de fuente del enunciado a su ranura fija
  fitProblemText();
}

/**
 * Genera el nombre dinámico del archivo para exportar a PDF (document.title),
 * asegurando el formato: [nombre_del_salon]_[fecha_hora]
 * Compatible con la convención de Excel y fotos ZIP del sistema.
 */
function getPdfExportTitle(classroom) {
  const sanitizeFn = (typeof sanitizeExportFileName === 'function')
    ? sanitizeExportFileName
    : (name) => (name || 'Salon')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9_\-]/g, '');

  const timestampFn = (typeof getExportTimestamp === 'function')
    ? getExportTimestamp
    : () => {
        const d = new Date();
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        return `${day}-${month}_${hours}-${mins}`;
      };

  const cleanClassroom = sanitizeFn(classroom ? classroom.name : 'Salon');
  const timeStamp = timestampFn();
  return `${cleanClassroom}_${timeStamp}`;
}

/**
 * Dispara el diálogo de impresión / descarga a PDF del navegador configurando
 * de manera reactiva el título del documento para que el archivo descargado
 * tenga el nombre dinámico: "[salon]_[fecha].pdf".
 */
function printEvaluationSheets(classId) {
  let classroom = null;
  if (classId && typeof ClassroomData !== 'undefined' && ClassroomData.getClassroom) {
    classroom = ClassroomData.getClassroom(classId);
  }
  if (!classroom && typeof ClassroomData !== 'undefined' && ClassroomData.getActiveSession) {
    const session = ClassroomData.getActiveSession();
    if (session && session.classroomId) {
      classroom = ClassroomData.getClassroom(session.classroomId);
    }
  }

  // Configurar orientación según si es pliego de 4 alumnos (landscape) o estándar (portrait)
  if (typeof document !== 'undefined') {
    document.body.classList.remove('print-mode-booklet');
    document.body.classList.add('print-mode-sheets');
    const container = document.getElementById('pages-container');
    const isLandscape = container && (container.querySelector('.sheet-a4-quad') || container.querySelector('.sheet-a4-split'));
    setPrintPageOrientation(isLandscape ? 'landscape' : 'portrait');
  }

  const originalTitle = document.title;
  const pdfTitle = getPdfExportTitle(classroom);

  document.title = pdfTitle;

  const restoreTitle = () => {
    document.title = originalTitle;
    window.removeEventListener('afterprint', restoreTitle);
  };
  window.addEventListener('afterprint', restoreTitle, { once: true });

  setTimeout(() => {
    if (document.title === pdfTitle) {
      document.title = originalTitle;
    }
  }, 10000);

  window.print();
}

// Escuchas reactivas para atajos de teclado (Ctrl+P) y opciones de impresión del navegador
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('beforeprint', () => {
    const container = document.getElementById('pages-container');
    if (container && container.style.display !== 'none' && container.children.length > 0) {
      const isLandscape = container.querySelector('.sheet-a4-quad') || container.querySelector('.sheet-a4-split');
      setPrintPageOrientation(isLandscape ? 'landscape' : 'portrait');

      let classroom = null;
      if (typeof ClassroomData !== 'undefined' && ClassroomData.getActiveSession) {
        const session = ClassroomData.getActiveSession();
        if (session && session.classroomId) {
          classroom = ClassroomData.getClassroom(session.classroomId);
        }
      }
      if (classroom) {
        document.title = getPdfExportTitle(classroom);
      }
    }
  });

  window.addEventListener('afterprint', () => {
    document.title = 'Microevaluación';
  });
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

// // ── CUADERNILLO DE PREGUNTAS (COMPAÑERO DE CARTILLAS OMR) ──────────────────────

/**
 * Estima la altura en milímetros que ocupará una pregunta según el ancho de columna.
 */
function estimateBookletQuestionHeight(q, colWidthMm, isCompact) {
  const prompt = String(q.prompt || '');
  const charsPerLine = Math.max(20, Math.floor(colWidthMm * (isCompact ? 0.95 : 0.85)));
  const promptLines = Math.max(1, Math.ceil(prompt.length / charsPerLine));
  const promptH = promptLines * (isCompact ? 3.0 : 3.6);

  const opts = q.options || {};
  const maxOptLen = Math.max(
    String(opts.A || '').length,
    String(opts.B || '').length,
    String(opts.C || '').length,
    String(opts.D || '').length
  );
  const isGrid2x2 = maxOptLen <= (colWidthMm > 90 ? 28 : 16);
  const optLines = isGrid2x2 ? 2 : 4;
  const optH = optLines * (isCompact ? 3.0 : 3.6);
  const gap = isCompact ? 1.5 : 2.5;

  return promptH + optH + gap;
}

/**
 * Cascada adaptativa de distribución del cuadernillo:
 * - 'quad': A4 Horizontal en 4 cuadrantes iguales (4 exámenes por hoja).
 * - 'half': A4 Horizontal en 2 mitades iguales (2 exámenes por hoja).
 * - 'portrait': A4 Vertical en 2 columnas continuas (1 o más páginas).
 */
function determineBookletLayout(evaluation) {
  const questions = (evaluation && evaluation.questions) ? evaluation.questions : [];
  if (questions.length === 0) return { level: 'quad', pages: [] };

  // ── NIVEL 1: ¿Cabe en 1 cuadrante (A4 Horizontal en 4 partes)? ──
  // Ancho útil ~124mm, alto disponible para preguntas = 68mm.
  if (questions.length <= 4) {
    let quadH = 0;
    for (const q of questions) {
      quadH += estimateBookletQuestionHeight(q, 124, true);
    }
    if (quadH <= 68) {
      return { level: 'quad', pages: [{ questions }] };
    }
  }

  // ── NIVEL 2: ¿Cabe en media hoja (A4 Horizontal en 2 mitades)? ──
  // En media hoja: ancho útil ~124mm, alto disponible para preguntas = 158mm.
  // Para 5 o más preguntas, disponer preferentemente en 2 sub-columnas (equilibrio visual)
  if (questions.length >= 5 && questions.length <= 10) {
    const mid = Math.ceil(questions.length / 2);
    let col1H = 0;
    for (let i = 0; i < mid; i++) {
      col1H += estimateBookletQuestionHeight(questions[i], 58, true);
    }
    let col2H = 0;
    for (let i = mid; i < questions.length; i++) {
      col2H += estimateBookletQuestionHeight(questions[i], 58, true);
    }
    if (Math.max(col1H, col2H) <= 158) {
      return {
        level: 'half',
        subColumns: 2,
        pages: [{ col1: questions.slice(0, mid), col2: questions.slice(mid) }]
      };
    }
  }

  // Si son menos de 5 preguntas (o 2 sub-columnas no cupieron), probar 1 columna completa
  let half1ColH = 0;
  for (const q of questions) {
    half1ColH += estimateBookletQuestionHeight(q, 124, false);
  }
  if (half1ColH <= 158) {
    return { level: 'half', subColumns: 1, pages: [{ questions }] };
  }

  // ── NIVEL 3: A4 Vertical en 2 columnas continuas (1 o más páginas) ──
  // Ancho por columna en vertical: ~82mm.
  // Alto disponible en Pág 1: ~234mm. En Pág 2+: ~248mm.
  const pages = [];
  let currentQIdx = 0;
  let pageNum = 1;

  while (currentQIdx < questions.length) {
    const maxColH = pageNum === 1 ? 234 : 248;
    const col1 = [];
    const col2 = [];
    let currentH1 = 0;
    let currentH2 = 0;

    // Llenar columna 1 completamente primero
    while (currentQIdx < questions.length) {
      const q = questions[currentQIdx];
      const qH = estimateBookletQuestionHeight(q, 82, false);
      if (col1.length > 0 && (currentH1 + qH > maxColH)) {
        break;
      }
      col1.push(q);
      currentH1 += qH;
      currentQIdx++;
    }

    // Llenar columna 2 a continuación
    while (currentQIdx < questions.length) {
      const q = questions[currentQIdx];
      const qH = estimateBookletQuestionHeight(q, 82, false);
      if (col2.length > 0 && (currentH2 + qH > maxColH)) {
        break;
      }
      col2.push(q);
      currentH2 += qH;
      currentQIdx++;
    }

    pages.push({ col1, col2, pageNum });
    pageNum++;
  }

  return { level: 'portrait', pages };
}

/**
 * Función de compatibilidad
 */
function checkIfBookletFitsA5(evaluation) {
  const layout = determineBookletLayout(evaluation);
  return layout.level === 'half' || layout.level === 'quad';
}

/**
 * Genera el título para la descarga del PDF del Cuadernillo de Preguntas.
 */
function getBookletPdfExportTitle(classroom, evaluation) {
  const sanitizeFn = (typeof sanitizeExportFileName === 'function')
    ? sanitizeExportFileName
    : (name) => (name || 'Salon')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9_\-]/g, '');

  const timestampFn = (typeof getExportTimestamp === 'function')
    ? getExportTimestamp
    : () => {
        const d = new Date();
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        return `${day}-${month}`;
      };

  const cleanClassroom = sanitizeFn(classroom ? classroom.name : 'Salon');
  const cleanTitle = sanitizeFn(evaluation ? evaluation.title : 'Cuadernillo');
  const timeStamp = timestampFn();
  return `Cuadernillo_${cleanTitle}_${cleanClassroom}_${timeStamp}`;
}

/**
 * Configura la regla @page dinámica en el DOM antes de imprimir.
 */
function setPrintPageOrientation(orientation) {
  if (typeof document === 'undefined') return;
  let styleEl = document.getElementById('dynamic-print-page-style');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'dynamic-print-page-style';
    document.head.appendChild(styleEl);
  }
  if (orientation === 'landscape') {
    styleEl.textContent = '@page { size: A4 landscape; margin: 3mm; }';
  } else {
    styleEl.textContent = '@page { size: A4 portrait; margin: 5mm; }';
  }
}

/**
 * Renderiza el HTML de una sola pregunta para el cuadernillo.
 */
function renderBookletQuestionHTML(q, idx, isCompact = false) {
  const escape = (typeof escaparHtml === 'function')
    ? escaparHtml
    : (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const num = q.num || (idx + 1);
  const prompt = escape(q.prompt || `Pregunta ${num}`);
  const opts = q.options || { A: 'A', B: 'B', C: 'C', D: 'D' };

  const maxOptLen = Math.max(
    String(opts.A || '').length,
    String(opts.B || '').length,
    String(opts.C || '').length,
    String(opts.D || '').length
  );
  const gridClass = maxOptLen > 28 ? 'booklet-options-list' : 'booklet-options-grid';
  const compactClass = isCompact ? ' booklet-q-compact' : '';

  return `
    <div class="booklet-q-item${compactClass}">
      <div class="booklet-q-prompt">
        <span class="booklet-q-num">${num}.</span> ${prompt}
      </div>
      <div class="${gridClass}">
        <div class="booklet-opt-item"><strong>A)</strong> <span>${escape(opts.A || '—')}</span></div>
        <div class="booklet-opt-item"><strong>B)</strong> <span>${escape(opts.B || '—')}</span></div>
        <div class="booklet-opt-item"><strong>C)</strong> <span>${escape(opts.C || '—')}</span></div>
        <div class="booklet-opt-item"><strong>D)</strong> <span>${escape(opts.D || '—')}</span></div>
      </div>
    </div>
  `;
}

/**
 * Construye y renderiza el Cuadernillo de Preguntas en el contenedor #booklet-container.
 * Cascada Adaptativa:
 * - Nivel 1: Cuadrantes A6 en A4 Horizontal (4 exámenes por hoja).
 * - Nivel 2: Mitades A5 en A4 Horizontal (2 exámenes por hoja).
 * - Nivel 3: A4 Vertical en 2 columnas continuas (1 o más páginas).
 */
function renderQuestionBooklet(classId, evaluation) {
  if (typeof document === 'undefined') return;
  const container = document.getElementById('booklet-container');
  if (!container) return;

  if (!evaluation || !evaluation.questions || evaluation.questions.length === 0) {
    container.innerHTML = '';
    return;
  }

  const questions = evaluation.questions;
  const layout = determineBookletLayout(evaluation);
  container.innerHTML = '';

  // Actualizar texto del botón de descarga si existe
  const printBtn = document.getElementById('btn-print-booklet');
  if (printBtn) {
    if (layout.level === 'quad') {
      printBtn.innerHTML = `📄 Descargar Cuadernillo (PDF) [A4 Horizontal · 4 por hoja]`;
    } else if (layout.level === 'half') {
      printBtn.innerHTML = `📄 Descargar Cuadernillo (PDF) [A4 Horizontal · 2 por hoja]`;
    } else {
      const pCount = layout.pages.length;
      printBtn.innerHTML = `📄 Descargar Cuadernillo (PDF) [A4 Vertical · ${pCount} ${pCount === 1 ? 'página' : 'páginas'}]`;
    }
  }

  if (layout.level === 'quad') {
    // ── NIVEL 1: A4 HORIZONTAL EN 4 CUADRANTES IGUALES (4 EXÁMENES POR HOJA) ──
    const examQuadHTML = `
      <div class="booklet-quad-item">
        <div class="booklet-header booklet-header-quad">
          <div class="booklet-title-compact">EVALUACIÓN ESCOLAR</div>
          <div class="booklet-student-line-compact">
            <span>Estudiante: __________________________________________________</span>
          </div>
          <div class="booklet-instructions-compact">
            * Lee con atención cada pregunta y registra tus respuestas en tu Cartilla de Respuestas asignada.
          </div>
        </div>
        <div class="booklet-body-quad">
          ${questions.map((q, idx) => renderBookletQuestionHTML(q, idx, true)).join('')}
        </div>
      </div>
    `;

    const sheetEl = document.createElement('div');
    sheetEl.className = 'sheet-booklet-quad';
    sheetEl.innerHTML = `
      <div class="quad-row">
        ${examQuadHTML}
        <div class="quad-vcut">
          <div class="quad-vcut-line"></div>
          <span class="quad-vcut-text">✂️</span>
          <div class="quad-vcut-line"></div>
        </div>
        ${examQuadHTML}
      </div>
      <div class="quad-hcut">
        <span>✂️ cortar por aquí ✂️</span>
      </div>
      <div class="quad-row">
        ${examQuadHTML}
        <div class="quad-vcut">
          <div class="quad-vcut-line"></div>
          <span class="quad-vcut-text">✂️</span>
          <div class="quad-vcut-line"></div>
        </div>
        ${examQuadHTML}
      </div>
    `;
    container.appendChild(sheetEl);

  } else if (layout.level === 'half') {
    // ── NIVEL 2: A4 HORIZONTAL EN 2 MITADES IGUALES (2 EXÁMENES POR HOJA) ──
    let examHalfBodyHTML = '';
    if (layout.subColumns === 2) {
      examHalfBodyHTML = `
        <div class="booklet-2subcol-wrap">
          <div class="booklet-subcol">
            ${layout.pages[0].col1.map((q, idx) => renderBookletQuestionHTML(q, idx, true)).join('')}
          </div>
          <div class="booklet-subcol-divider"></div>
          <div class="booklet-subcol">
            ${layout.pages[0].col2.map((q, idx) => renderBookletQuestionHTML(q, layout.pages[0].col1.length + idx, true)).join('')}
          </div>
        </div>
      `;
    } else {
      examHalfBodyHTML = `
        <div class="booklet-body-a5">
          ${questions.map((q, idx) => renderBookletQuestionHTML(q, idx, false)).join('')}
        </div>
      `;
    }

    const examHalfHTML = `
      <div class="booklet-half">
        <div class="booklet-header">
          <div class="booklet-title">EVALUACIÓN ESCOLAR</div>
          <div class="booklet-student-line">
            <span>Estudiante: __________________________________________________</span>
          </div>
          <div class="booklet-instructions">
            * Lee atentamente cada pregunta y registra tus respuestas en tu Cartilla de Respuestas asignada.
          </div>
        </div>
        ${examHalfBodyHTML}
      </div>
    `;

    const sheetEl = document.createElement('div');
    sheetEl.className = 'sheet-booklet-landscape';
    sheetEl.innerHTML = `
      ${examHalfHTML}
      <div class="booklet-divider">
        <div class="booklet-divider-line"></div>
        <span class="booklet-divider-scissors">✂️ cortar aquí</span>
        <div class="booklet-divider-line"></div>
      </div>
      ${examHalfHTML}
    `;
    container.appendChild(sheetEl);

  } else {
    // ── NIVEL 3: A4 VERTICAL EN 2 COLUMNAS CONTINUAS (1 O MÁS PÁGINAS) ──
    const totalPages = layout.pages.length;

    for (const p of layout.pages) {
      const sheetEl = document.createElement('div');
      sheetEl.className = 'sheet-booklet-portrait';
      sheetEl.innerHTML = `
        <div class="booklet-header ${p.pageNum > 1 ? 'booklet-header-p2' : ''}">
          <div class="booklet-title">EVALUACIÓN ESCOLAR ${totalPages > 1 ? ` — Página ${p.pageNum}` : ''}</div>
          ${p.pageNum === 1 ? `
          <div class="booklet-student-line">
            <span>Estudiante: __________________________________________________</span>
          </div>
          <div class="booklet-instructions">
            * Lee atentamente cada pregunta y registra tus respuestas en tu Cartilla de Respuestas asignada.
          </div>
          ` : ''}
        </div>

        <div class="booklet-columns">
          <div class="booklet-col">
            ${p.col1.map((q) => {
              const globalIdx = questions.indexOf(q);
              return renderBookletQuestionHTML(q, globalIdx >= 0 ? globalIdx : 0, false);
            }).join('')}
          </div>
          <div class="booklet-col-divider"></div>
          <div class="booklet-col">
            ${p.col2.map((q) => {
              const globalIdx = questions.indexOf(q);
              return renderBookletQuestionHTML(q, globalIdx >= 0 ? globalIdx : 0, false);
            }).join('')}
          </div>
        </div>

        <div class="booklet-footer">
          <span>Cuadernillo de Preguntas</span>
          <span>Página ${p.pageNum} de ${totalPages}</span>
        </div>
      `;
      container.appendChild(sheetEl);
    }
  }
}

/**
 * Dispara la impresión del Cuadernillo de Preguntas (PDF para los estudiantes).
 */
function printQuestionBooklet() {
  const container = document.getElementById('booklet-container');
  if (!container || container.children.length === 0) {
    if (typeof wizardClassroomId !== 'undefined' && typeof wizardEval !== 'undefined') {
      renderQuestionBooklet(wizardClassroomId, wizardEval);
    }
  }

  if (!container || container.children.length === 0) {
    if (typeof showToast === 'function') {
      showToast('⚠️ No hay preguntas cargadas en esta evaluación para armar el cuadernillo.');
    }
    return;
  }

  let classroom = null;
  if (typeof ClassroomData !== 'undefined' && ClassroomData.getClassroom) {
    if (typeof wizardClassroomId !== 'undefined' && wizardClassroomId) {
      classroom = ClassroomData.getClassroom(wizardClassroomId);
    } else if (ClassroomData.getActiveSession) {
      const session = ClassroomData.getActiveSession();
      if (session && session.classroomId) classroom = ClassroomData.getClassroom(session.classroomId);
    }
  }

  const evalObj = (typeof wizardEval !== 'undefined') ? wizardEval : null;
  const layout = determineBookletLayout(evalObj);
  const isLandscape = (layout.level === 'quad' || layout.level === 'half');

  // Activar modo de impresión de cuadernillo en body
  document.body.classList.remove('print-mode-sheets');
  document.body.classList.add('print-mode-booklet');

  // Ajustar tamaño/orientación de página en el diálogo del navegador
  setPrintPageOrientation(isLandscape ? 'landscape' : 'portrait');

  const originalTitle = document.title;
  const pdfTitle = getBookletPdfExportTitle(classroom, evalObj);
  document.title = pdfTitle;

  const restore = () => {
    document.title = originalTitle;
    document.body.classList.remove('print-mode-booklet');
    setPrintPageOrientation('portrait');
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore, { once: true });

  setTimeout(() => {
    if (document.title === pdfTitle) {
      document.title = originalTitle;
      document.body.classList.remove('print-mode-booklet');
      setPrintPageOrientation('portrait');
    }
  }, 10000);

  window.print();
}

// ── EXPOSICIÓN GLOBAL PARA RENDERIZADO EN EL ASISTENTE Y VISOR DE IMPRESIÓN ──
if (typeof window !== 'undefined') {
  window.A5_GRID_COLS = A5_GRID_COLS;
  window.A5_GRID_ROWS = A5_GRID_ROWS;
  window.GRID_CELLS_HTML = GRID_CELLS_HTML;
  window.createA5Card = createA5Card;
  window.renderAllPrintPages = renderAllPrintPages;
  window.fitProblemText = fitProblemText;
  window.getPdfExportTitle = getPdfExportTitle;
  window.printEvaluationSheets = printEvaluationSheets;
  window.checkIfBookletFitsA5 = checkIfBookletFitsA5;
  window.getBookletPdfExportTitle = getBookletPdfExportTitle;
  window.setPrintPageOrientation = setPrintPageOrientation;
  window.renderBookletQuestionHTML = renderBookletQuestionHTML;
  window.determineBookletLayout = determineBookletLayout;
  window.renderQuestionBooklet = renderQuestionBooklet;
  window.printQuestionBooklet = printQuestionBooklet;
}

