// =============================================================================
// card-generator.js — Microevaluación A5 v3.1.36
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

  // CASO 1: Opción Múltiple - 1 Pregunta
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

  // CASO 2: Opción Múltiple - 2 Preguntas
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

function renderAllPrintPages(classId, evaluation) {
  const container = document.getElementById('pages-container');
  if (!container) return;
  container.style.display = 'flex';
  const classroom = ClassroomData.getClassroom(classId);
  if (!classroom || !classroom.students || classroom.students.length === 0) {
    // Caso real: sesión restaurada después de que el salón se borró, o
    // salón importado sin alumnos. Antes esto lanzaba una excepción por
    // leer .students de undefined.
    container.innerHTML = '';
    console.warn('[Fichas] No se pudieron generar: el salón no existe o no tiene alumnos.', classId);
    return;
  }
  const students = classroom.students;
  container.innerHTML = '';

  // 2 fichas A5 por hoja A4. La cantidad de hojas la define el salón:
  // 10 alumnos = 5 hojas.
  const sheetCount = Math.ceil(students.length / 2);
  const printBtn = document.getElementById('btn-print-sheets');
  if (printBtn) {
    printBtn.textContent = '🖨️ Imprimir ' + sheetCount +
      (sheetCount === 1 ? ' hoja A4' : ' hojas A4');
  }

  for (let i = 0; i < students.length; i += 2) {
    const sTop = students[i];
    // Con número impar de alumnos la última hoja lleva UNA sola ficha, en
    // vez de repetir la del compañero. Antes se duplicaba (students[i+1]
    // || students[i]) y salían dos fichas con el mismo QR, así que el
    // escáner podía registrar dos veces al mismo alumno.
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

    // Generar el QR (ALUM_01) de cada alumno que va en esta hoja.
    // Con salón impar, sBot es null y solo se genera el de arriba.
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

// ── EXPOSICIÓN GLOBAL PARA RENDERIZADO EN EL ASISTENTE Y VISOR DE IMPRESIÓN ──
if (typeof window !== 'undefined') {
  window.A5_GRID_COLS = A5_GRID_COLS;
  window.A5_GRID_ROWS = A5_GRID_ROWS;
  window.GRID_CELLS_HTML = GRID_CELLS_HTML;
  window.createA5Card = createA5Card;
  window.renderAllPrintPages = renderAllPrintPages;
  window.fitProblemText = fitProblemText;
}

