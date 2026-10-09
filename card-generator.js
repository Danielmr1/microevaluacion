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

  // ── CASO RAMA 3: CARTILLA DE RESPUESTAS OMR (HASTA 20 PREGUNTAS EN 2 COLUMNAS) ──
  const isBranch3 = evaluation.branch === 'rama3' || (isOMR && qCount > 3);
  if (isBranch3) {
    const totalQ = qCount;
    const half = Math.ceil(totalQ / 2);

    const qList = [];
    for (let i = 0; i < totalQ; i++) {
      const existing = (evaluation.questions && evaluation.questions[i]);
      qList.push(existing || { id: 'r3_q' + (i + 1), num: i + 1 });
    }

    const col1 = qList.slice(0, half);
    const col2 = qList.slice(half, totalQ);

    const renderColumnHTML = (items, startIdx) => {
      return items.map((q, idx) => {
        const qNum = startIdx + idx + 1;
        return `
          <div class="b3-q-row">
            <span class="b3-q-num">${String(qNum).padStart(2, '0')}</span>
            <div class="b3-bubbles-group">
              <span class="b3-bubble">A</span>
              <span class="b3-bubble">B</span>
              <span class="b3-bubble">C</span>
              <span class="b3-bubble">D</span>
            </div>
          </div>
        `;
      }).join('');
    };

    return `
      <div class="card-a5 mc-card branch3-card">
        ${fiducialsHTML}
        ${headerHTML}

        <div class="b3-body">
          <div class="b3-banner">
            <span class="b3-title">CARTILLA DE RESPUESTAS · ${totalQ} PREGUNTAS</span>
            <span class="b3-hint">Rellena completamente el círculo: <b class="b3-sample-fill">●</b></span>
          </div>

          <div class="b3-columns-wrap">
            <div class="b3-column">
              ${renderColumnHTML(col1, 0)}
            </div>

            <div class="b3-vdivider"></div>

            <div class="b3-column">
              ${renderColumnHTML(col2, half)}
            </div>
          </div>
        </div>
      </div>
    `;
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
    const pageWord = sheetCount === 1 ? 'página A4' : 'páginas A4';
    printBtn.innerHTML = `🖨️ Descargar / Imprimir ${sheetCount} ${pageWord}`;
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
}

