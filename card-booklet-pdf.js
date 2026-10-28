// =============================================================================
// card-booklet-pdf.js — Microevaluación
// MÓDULO: CUADERNILLO DE PREGUNTAS EN PDF / BOOKLET (RAMA 3 Y CARTILLAS OMR)
// =============================================================================

// // ── CUADERNILLO DE PREGUNTAS (COMPAÑERO DE CARTILLAS OMR) ──────────────────────

/**
 * Estima la altura en milímetros que ocupará una pregunta según el ancho de columna.
 */
function estimateBookletQuestionHeight(q, colWidthMm, isCompact) {
  const prompt = String(q.prompt || '');
  const charsPerLine = Math.max(20, Math.floor(colWidthMm * (isCompact ? 0.95 : 0.85)));
  let promptLines = Math.max(1, Math.ceil(prompt.length / charsPerLine));
  if (promptLines > 3) promptLines = 3; // Auto-shrink a máximo 3 líneas
  const promptH = promptLines * (isCompact ? 3.0 : 3.4);

  const opts = q.options || {};
  const maxOptLen = Math.max(
    String(opts.A || '').length,
    String(opts.B || '').length,
    String(opts.C || '').length,
    String(opts.D || '').length
  );
  const isGrid2x2 = true;
  const optLines = 2;
  const optH = optLines * (isCompact ? 2.8 : 3.2);
  const gap = isCompact ? 1.5 : 2.0;

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

  // ── RAMA 3 (CARTILLA OMR): Adaptativo según directiva de aula ──
  if (evaluation && evaluation.branch === 'rama3') {
    if (questions.length <= 6) {
      // 5 y 6 preguntas: A4 Horizontal en 2 mitades A5 Vertical (2 exámenes por hoja para ahorrar 50% de papel)
      return {
        level: 'half',
        subColumns: 1,
        pages: [{ questions }]
      };
    } else if (questions.length <= 15) {
      // 10 y 15 preguntas: 1 sola página A4 Vertical en 2 columnas (Col 1 llena primero con 8 preguntas, y Col 2 recibe el resto)
      const col1Count = Math.min(questions.length, 8);
      return {
        level: 'portrait',
        pages: [{
          pageNum: 1,
          col1: questions.slice(0, col1Count),
          col2: questions.slice(col1Count)
        }]
      };
    } else {
      // 20 preguntas: 1 sola página A4 Vertical en 2 columnas (Columna 1: 10 preguntas, Columna 2: 10 preguntas)
      const col1Count = Math.min(questions.length, 10);
      return {
        level: 'portrait',
        pages: [{
          pageNum: 1,
          col1: questions.slice(0, col1Count),
          col2: questions.slice(col1Count)
        }]
      };
    }
  }

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

  // ── NIVEL 3: A4 Vertical en 2 columnas (1 o más páginas) ──
  // Si todas las preguntas caben en 1 sola hoja vertical, repartir equitativamente entre las 2 columnas:
  const halfCount = Math.ceil(questions.length / 2);
  let h1 = 0;
  for (let i = 0; i < halfCount; i++) {
    h1 += estimateBookletQuestionHeight(questions[i], 82, false);
  }
  let h2 = 0;
  for (let i = halfCount; i < questions.length; i++) {
    h2 += estimateBookletQuestionHeight(questions[i], 82, false);
  }

  if (Math.max(h1, h2) <= 240) {
    return {
      level: 'portrait',
      pages: [{
        col1: questions.slice(0, halfCount),
        col2: questions.slice(halfCount),
        pageNum: 1
      }]
    };
  }

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
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        return `${day}-${month}_${hours}-${mins}`;
      };

  let cls = classroom;
  if (!cls) {
    const clsId = (typeof wizardClassroomId !== 'undefined' && wizardClassroomId)
      || (typeof document !== 'undefined' && document.getElementById('builder-classroom')?.value);
    if (clsId && typeof ClassroomData !== 'undefined' && ClassroomData.getClassroom) {
      cls = ClassroomData.getClassroom(clsId);
    }
  }

  const qCount = (evaluation && evaluation.questions && evaluation.questions.length)
    ? evaluation.questions.length
    : ((evaluation && evaluation.questionCount)
      ? evaluation.questionCount
      : ((typeof r3State !== 'undefined' && r3State.count) ? r3State.count : ''));

  const cleanClassroom = sanitizeFn(cls ? cls.name : 'Salon');
  const qPart = qCount ? `${qCount}_Preguntas_` : '';
  const timeStamp = timestampFn();
  return `Examen_${qPart}${cleanClassroom}_${timeStamp}`;
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
  const isLandscape = orientation === 'landscape';
  styleEl.textContent = isLandscape
    ? '@page { size: A4 landscape !important; margin: 0 !important; }'
    : '@page { size: A4 portrait !important; margin: 0 !important; }';

  if (document.body) {
    void document.body.offsetHeight;
  }
}

/**
 * Renderiza el HTML de una sola pregunta para el cuadernillo.
 */
function renderBookletQuestionHTML(q, idx, isCompact = false) {
  const escape = (typeof escaparHtml === 'function')
    ? (t => (typeof formatMathHtml === 'function' ? formatMathHtml(escaparHtml(t)) : escaparHtml(t)))
    : (t => {
        const s = String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        return (typeof formatMathHtml === 'function') ? formatMathHtml(s) : s;
      });

  const num = q.num || (idx + 1);
  const prompt = escape(q.prompt || `Pregunta ${num}`);
  const opts = q.options || { A: 'A', B: 'B', C: 'C', D: 'D' };

  const gridClass = 'booklet-options-grid';
  const isPromptLong = String(q.prompt || '').length > 105;
  const promptClass = isPromptLong ? 'booklet-q-prompt booklet-q-prompt-compact' : 'booklet-q-prompt';
  const compactClass = isCompact ? ' booklet-q-compact' : '';

  return `
    <div class="booklet-q-item${compactClass}">
      <div class="${promptClass}">
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
    printBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> Imprimir Examen`;
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
        ${examQuadHTML}
      </div>
      <div class="quad-row">
        ${examQuadHTML}
        ${examQuadHTML}
      </div>
      <div class="booklet-divider"></div>
      <div class="booklet-divider-h"></div>
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
        </div>
        ${examHalfBodyHTML}
      </div>
    `;

    const sheetEl = document.createElement('div');
    sheetEl.className = 'sheet-booklet-landscape';
    sheetEl.innerHTML = `
      ${examHalfHTML}
      ${examHalfHTML}
      <div class="booklet-divider"></div>
    `;
    container.appendChild(sheetEl);

  } else {
    // ── NIVEL 3: A4 VERTICAL EN 2 COLUMNAS CONTINUAS (1 O MÁS PÁGINAS) ──
    const totalPages = layout.pages.length;

    for (const p of layout.pages) {
      const sheetEl = document.createElement('div');
      sheetEl.className = 'sheet-booklet-portrait';
      const is1Col = (layout.level === 'portrait_1col');
      sheetEl.innerHTML = `
        <div class="booklet-header">
          <div class="booklet-title">EVALUACIÓN ESCOLAR ${totalPages > 1 ? ` — Página ${p.pageNum}` : ''}</div>
          <div class="booklet-student-line">
            <span>Estudiante: __________________________________________________</span>
          </div>
        </div>

        ${is1Col ? `
        <div class="booklet-columns" style="display:block;">
          <div class="booklet-col" style="width:100%; display:flex; flex-direction:column; gap:4mm;">
            ${p.col1.map((q) => {
              const globalIdx = questions.indexOf(q);
              return renderBookletQuestionHTML(q, globalIdx >= 0 ? globalIdx : 0, false);
            }).join('')}
          </div>
        </div>
        ` : `
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
        `}
      `;
      container.appendChild(sheetEl);
    }
  }
  if (typeof fitSummaryDocumentsToViewport === 'function') {
    fitSummaryDocumentsToViewport();
  }
}

/**
 * Genera el documento PDF del Cuadernillo de Preguntas con jsPDF.
 * - Nivel 1 (<= 4 preguntas): A4 Landscape con 4 cuadrantes (4 exámenes por pliego).
 * - Nivel 2 (5 a 10 preguntas): A4 Landscape con 2 mitades (2 exámenes por pliego).
 * - Nivel 3 (> 10 preguntas o textos largos): A4 Vertical en 2 columnas (1 o más páginas).
 */
function generateBookletWithJsPDF(evalObj, classroomName, customJsPDF) {
  const jsPDFConstructor = customJsPDF
    || ((typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : null)
    || (typeof jsPDF !== 'undefined' ? jsPDF : null);

  if (!jsPDFConstructor) return null;

  const questions = (evalObj && evalObj.questions) ? evalObj.questions : [];
  if (questions.length === 0) return null;

  const layout = (typeof determineBookletLayout === 'function')
    ? determineBookletLayout(evalObj)
    : { level: questions.length <= 4 ? 'quad' : (questions.length <= 10 ? 'half' : 'portrait') };

  const isLandscape = (layout.level === 'quad' || layout.level === 'half');
  const doc = new jsPDFConstructor({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  // Helper para renderizar una pregunta en (startX, startY, colWidth)
  function renderQuestion(q, idx, startX, startY, colWidth, isCompact) {
    let curY = startY;
    const num = q.num || (idx + 1);
    const promptText = `${num}. ${q.prompt || ''}`;

    doc.setFont('helvetica', 'bold');

    // Auto-shrink dinámico: si con el tamaño estándar se forman más de 3 filas,
    // reducir progresivamente el tamaño de letra hasta que el enunciado tenga como máximo 3 filas.
    let promptFontSize = isCompact ? 8.5 : 9.5;
    doc.setFontSize(promptFontSize);
    let lines = doc.splitTextToSize(promptText, colWidth);
    while (lines.length > 3 && promptFontSize > 6.5) {
      promptFontSize -= 0.5;
      doc.setFontSize(promptFontSize);
      lines = doc.splitTextToSize(promptText, colWidth);
    }

    doc.setTextColor(0, 0, 0);
    doc.text(lines, startX, curY);
    const promptLineH = promptFontSize * 0.38;
    curY += lines.length * promptLineH + 0.8;

    const opts = q.options || { A: 'A', B: 'B', C: 'C', D: 'D' };
    const isGrid2x2 = true; // Siempre 2 columnas para alternativas en Cartilla OMR

    const optFontSize = isCompact ? 7.8 : (colWidth <= 90 ? 8.5 : 9.2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(optFontSize);
    const optLineH = optFontSize * 0.38;

    if (isGrid2x2) {
      const halfW = colWidth / 2;
      // Fila 1: A y B
      doc.setFont('helvetica', 'bold');
      doc.text('A)', startX, curY);
      doc.setFont('helvetica', 'normal');
      doc.text(String(opts.A || '—'), startX + 5, curY);

      doc.setFont('helvetica', 'bold');
      doc.text('B)', startX + halfW, curY);
      doc.setFont('helvetica', 'normal');
      doc.text(String(opts.B || '—'), startX + halfW + 5, curY);
      curY += optLineH;

      // Fila 2: C y D
      doc.setFont('helvetica', 'bold');
      doc.text('C)', startX, curY);
      doc.setFont('helvetica', 'normal');
      doc.text(String(opts.C || '—'), startX + 5, curY);

      doc.setFont('helvetica', 'bold');
      doc.text('D)', startX + halfW, curY);
      doc.setFont('helvetica', 'normal');
      doc.text(String(opts.D || '—'), startX + halfW + 5, curY);
      curY += optLineH;
    } else {
      ['A', 'B', 'C', 'D'].forEach(optKey => {
        doc.setFont('helvetica', 'bold');
        doc.text(`${optKey})`, startX, curY);
        doc.setFont('helvetica', 'normal');
        const optLines = doc.splitTextToSize(String(opts[optKey] || '—'), colWidth - 6);
        doc.text(optLines, startX + 5, curY);
        curY += optLines.length * (isCompact ? 3.0 : 3.6);
      });
    }

    curY += (isCompact ? 1.8 : 2.4);
    return curY - startY;
  }

  // Helper para renderizar cabecera de examen
  function renderHeader(originX, originY, width, isCompact) {
    let curY = originY + 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(isCompact ? 10.5 : 12.5);
    const centerX = originX + (width / 2);
    doc.text('EVALUACIÓN ESCOLAR', centerX, curY, { align: 'center' });
    curY += (isCompact ? 4.5 : 5.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(isCompact ? 8.5 : 10);
    doc.text('Estudiante: __________________________________________________', originX, curY);
    curY += (isCompact ? 3.5 : 4.5);

    doc.setLineWidth(0.4);
    doc.setDrawColor(0, 0, 0);
    doc.line(originX, curY, originX + width, curY);
    curY += (isCompact ? 4 : 5.5);
    return curY;
  }

  if (layout.level === 'quad') {
    // ── NIVEL 1: 4 EXÁMENES POR HOJA A4 HORIZONTAL ──
    const positions = [
      { x: 10, y: 8, w: 128 },
      { x: 158.5, y: 8, w: 128 },
      { x: 10, y: 113, w: 128 },
      { x: 158.5, y: 113, w: 128 }
    ];

    positions.forEach(pos => {
      let qY = renderHeader(pos.x, pos.y, pos.w, true);
      questions.forEach((q, idx) => {
        qY += renderQuestion(q, idx, pos.x, qY, pos.w, true);
      });
    });

    // Líneas divisorias punteadas exactas
    doc.setLineDashPattern([2, 2], 0);
    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.35);
    doc.line(148.5, 0, 148.5, 210);
    doc.line(0, 105, 297, 105);
    doc.setLineDashPattern([], 0);

  } else if (layout.level === 'half') {
    // ── NIVEL 2: 2 EXÁMENES POR HOJA A4 HORIZONTAL (IZQUIERDA Y DERECHA) ──
    const halves = [
      { startX: 10, w: 128 },
      { startX: 158.5, w: 128 }
    ];

    halves.forEach(h => {
      const qStartY = renderHeader(h.startX, 10, h.w, false);
      const isSubCol = layout.subColumns === 2 || (layout.subColumns !== 1 && questions.length > 6);
      if (isSubCol) {
        const mid = Math.ceil(questions.length / 2);
        const subColW = (h.w - 6) / 2;

        let col1Y = qStartY;
        for (let i = 0; i < mid; i++) {
          col1Y += renderQuestion(questions[i], i, h.startX, col1Y, subColW, true);
        }

        let col2Y = qStartY;
        for (let i = mid; i < questions.length; i++) {
          col2Y += renderQuestion(questions[i], i, h.startX + subColW + 6, col2Y, subColW, true);
        }
      } else {
        // Para 5 o 6 preguntas en A5 vertical: estimar alturas para distribuir armónicamente en todo el alto disponible (hasta ~198mm)
        const availableH = 196 - qStartY;
        // Calcular altura total natural de las preguntas
        let naturalTotalH = 0;
        const heights = questions.map((q, idx) => {
          const promptLines = doc.splitTextToSize(`${idx + 1}. ${q.prompt || ''}`, h.w).length;
          const optLines = 2; // 2x2 grid
          const hQ = (promptLines * 4.4) + (optLines * 4.4) + 2;
          naturalTotalH += hQ;
          return hQ;
        });

        const extraGap = questions.length > 1
          ? Math.max(3.5, Math.min(13, (availableH - naturalTotalH) / (questions.length - 1)))
          : 6;

        let qY = qStartY;
        questions.forEach((q, idx) => {
          const usedH = renderQuestion(q, idx, h.startX, qY, h.w, false);
          qY += usedH + extraGap;
        });
      }
    });

    // Línea divisoria central punteada EXACTA al centro (148.5 mm)
    doc.setLineDashPattern([2, 2], 0);
    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.4);
    doc.line(148.5, 0, 148.5, 210);
    doc.setLineDashPattern([], 0);

  } else {
    // ── NIVEL 3: A4 VERTICAL EN 2 COLUMNAS (1 O MÁS PÁGINAS) ──
    const colW = 88;
    const col1X = 12;
    const col2X = 110;

    const pages = layout.pages && layout.pages.length > 0
      ? layout.pages
      : [{ col1: questions.slice(0, Math.ceil(questions.length / 2)), col2: questions.slice(Math.ceil(questions.length / 2)), pageNum: 1 }];

    let accumulatedQCount = 0;
    pages.forEach((p, pIdx) => {
      if (pIdx > 0) {
        doc.addPage('a4', 'portrait');
      }

      let col1StartY = 14;
      let col2StartY = 14;

      const headerEndY = renderHeader(12, 10, 186, false);
      col1StartY = headerEndY;
      col2StartY = headerEndY;

      // Distribución vertical proporcional dinámica para cada columna
      const pageBottomLimit = 282; // Límite inferior seguro para no pisar el pie de página
      const availableH = pageBottomLimit - col1StartY;

      function calcQHeight(q, globalIdx) {
        let fSize = 9.5;
        doc.setFontSize(fSize);
        let pLines = doc.splitTextToSize(`${globalIdx + 1}. ${q.prompt || ''}`, colW);
        while (pLines.length > 3 && fSize > 6.5) {
          fSize -= 0.5;
          doc.setFontSize(fSize);
          pLines = doc.splitTextToSize(`${globalIdx + 1}. ${q.prompt || ''}`, colW);
        }
        const pLineH = fSize * 0.38;
        const optLineH = 8.5 * 0.38;
        return (pLines.length * pLineH) + (2 * optLineH) + 2.4;
      }

      // Calcular altura natural de Columna 1
      let natH1 = 0;
      p.col1.forEach((q, idx) => {
        natH1 += calcQHeight(q, accumulatedQCount + idx);
      });
      const gapCol1 = p.col1.length > 1
        ? Math.max(2.0, Math.min(10, (availableH - natH1) / (p.col1.length - 1)))
        : 4;

      // Calcular altura natural de Columna 2
      let natH2 = 0;
      p.col2.forEach((q, idx) => {
        natH2 += calcQHeight(q, accumulatedQCount + p.col1.length + idx);
      });
      const gapCol2 = p.col2.length > 1
        ? Math.max(2.0, Math.min(10, (availableH - natH2) / (p.col2.length - 1)))
        : 4;

      // Si ambas columnas tienen la misma cantidad de preguntas, usar un gap uniforme simétrico
      const finalGap1 = (p.col1.length === p.col2.length && p.col1.length > 0) ? Math.min(gapCol1, gapCol2) : gapCol1;
      const finalGap2 = (p.col1.length === p.col2.length && p.col1.length > 0) ? Math.min(gapCol1, gapCol2) : gapCol2;

      // Render Col 1 con espaciado dinámico
      let curCol1Y = col1StartY;
      p.col1.forEach((q, idx) => {
        const globalIdx = accumulatedQCount + idx;
        const usedH = renderQuestion(q, globalIdx, col1X, curCol1Y, colW, false);
        curCol1Y += usedH + finalGap1;
      });

      // Render Col 2 con espaciado dinámico
      let curCol2Y = col2StartY;
      p.col2.forEach((q, idx) => {
        const globalIdx = accumulatedQCount + p.col1.length + idx;
        const usedH = renderQuestion(q, globalIdx, col2X, curCol2Y, colW, false);
        curCol2Y += usedH + finalGap2;
      });

      accumulatedQCount += p.col1.length + p.col2.length;
    });
  }

  return doc;
}

/**
 * Dispara la descarga directa en PDF o impresión del Cuadernillo de Preguntas.
 */
function printQuestionBooklet(evalParam) {
  let evalObj = evalParam || (typeof wizardEval !== 'undefined' ? wizardEval : null);
  if (!evalObj && typeof prepareRama3Evaluation === 'function') {
    evalObj = prepareRama3Evaluation();
  }

  const container = document.getElementById('booklet-container');
  if (!container || container.children.length === 0) {
    if (typeof wizardClassroomId !== 'undefined' && evalObj) {
      renderQuestionBooklet(wizardClassroomId, evalObj);
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
  if (!classroom) {
    const clsId = (typeof wizardClassroomId !== 'undefined' && wizardClassroomId)
      || (typeof document !== 'undefined' && document.getElementById('builder-classroom')?.value);
    if (clsId && typeof ClassroomData !== 'undefined' && ClassroomData.getClassroom) {
      classroom = ClassroomData.getClassroom(clsId);
    }
  }

  const pdfTitle = getBookletPdfExportTitle(classroom, evalObj);

  // ── DIÁLOGO NATIVO DE IMPRESIÓN Y VISTA PREVIA (IGUAL A CARTILLAS OMR) ──
  const layout = determineBookletLayout(evalObj);
  const hasPortraitSheet = !!(container && container.querySelector('.sheet-booklet-portrait'));
  const isLandscape = !hasPortraitSheet && (layout.level === 'quad' || layout.level === 'half');

  // Activar modo de impresión de cuadernillo en body
  document.body.classList.remove('print-mode-sheets');
  document.body.classList.add('print-mode-booklet');

  // Ajustar tamaño/orientación de página en el diálogo del navegador
  setPrintPageOrientation(isLandscape ? 'landscape' : 'portrait');

  const originalTitle = document.title;
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

  setTimeout(() => {
    window.print();
  }, 60);
}


// Exposición global
if (typeof window !== "undefined") {
  window.estimateBookletQuestionHeight = estimateBookletQuestionHeight;
  window.determineBookletLayout = determineBookletLayout;
  window.checkIfBookletFitsA5 = checkIfBookletFitsA5;
  window.getBookletPdfExportTitle = getBookletPdfExportTitle;
  window.setPrintPageOrientation = setPrintPageOrientation;
  window.renderBookletQuestionHTML = renderBookletQuestionHTML;
  window.renderQuestionBooklet = renderQuestionBooklet;
  window.generateBookletWithJsPDF = generateBookletWithJsPDF;
  window.printQuestionBooklet = printQuestionBooklet;
}
