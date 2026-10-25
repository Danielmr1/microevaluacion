// =============================================================================
// card-sheets-print.js — Microevaluación
// MÓDULO: ENSAMBLADO DE HOJAS A4 DE IMPRESIÓN Y DESCARGA PDF
//
// Guardarraíles activos:
//   Regla 4  – Geometría Sagrada de la Ficha A5 y PDF: clearance ArUco 10mm.
//   Regla 13 – Borde perimetral cerrado y margen en blanco exterior.
// =============================================================================

function renderAllPrintPages(classId, evaluation) {
  const container = document.getElementById('pages-container');
  if (!container) return;
  container.style.display = 'flex';
  const classroom = ClassroomData.getClassroom(classId);
  if (!classroom || !classroom.students || classroom.students.length === 0) {
    container.innerHTML = `
      <div style="margin: 40px auto; padding: 24px 32px; background: #ffffff; border: 1.5px dashed #cbd5e1; border-radius: 16px; text-align: center; max-width: 480px; box-shadow: 0 4px 16px rgba(15,23,42,0.04);">
        <div style="font-size: 2.2rem; margin-bottom: 8px;">⚠️</div>
        <h3 style="margin: 0 0 6px; font-size: 1.05rem; font-weight: 800; color: #0f172a;">Este salón no tiene alumnos registrados</h3>
        <p style="margin: 0 0 16px; font-size: 0.82rem; color: #64748b; line-height: 1.5;">
          En Microevaluación cada ficha física se genera de forma nominal con el nombre y código QR del estudiante. Para generar las fichas imprimibles, primero debes cargar la lista de alumnos en el salón.
        </p>
        <button type="button" onclick="openFlow('classrooms')" style="background: #0284c7; color: #fff; border: none; padding: 8px 18px; border-radius: 9999px; font-size: 0.82rem; font-weight: 750; cursor: pointer;">
          🏫 Ir a Salones y Alumnos
        </button>
      </div>
    `;
    console.warn('[Fichas] No se pudieron generar: el salón no existe o no tiene alumnos.', classId);
    return;
  }
  const students = classroom.students;
  container.innerHTML = '';

  const qCount = evaluation?.questionCount || (evaluation?.questions ? evaluation.questions.length : 5);
  const isR3 = evaluation && (
    evaluation.branch === 'rama3' ||
    (evaluation.id && String(evaluation.id).startsWith('eval_r3_')) ||
    (evaluation.branch !== 'rama2' && evaluation.branch !== 'rama1' && evaluation.type === 'mc' && qCount > 2)
  );

  // ── CASO FICHA A4 COMPLETA (1 ALUMNO POR HOJA A4 ENTERA) ──
  if (evaluation && evaluation.cardFormat === 'a4') {
    const isA4V = evaluation.orientation === 'vertical' || evaluation.isPortrait === true;
    const sheetCount = students.length;
    const printBtn = document.getElementById('btn-print-sheets');
    if (printBtn) {
      printBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Imprimir Fichas`;
      printBtn.onclick = () => printEvaluationSheets(classId);
    }

    try {
      document.title = getPdfExportTitle(classroom);
    } catch (e) {}

    for (let i = 0; i < students.length; i++) {
      const st = students[i];
      const sheetEl = document.createElement('div');
      sheetEl.className = isA4V ? 'sheet-a4-v-single' : 'sheet-a4-h-single';
      sheetEl.style.margin = '6mm auto';
      sheetEl.style.display = 'flex';
      sheetEl.style.justifyContent = 'center';
      sheetEl.style.alignItems = 'center';
      sheetEl.innerHTML = isA4V ? createA4VerticalCard(st, classroom, evaluation) : createA4Card(st, classroom, evaluation);
      container.appendChild(sheetEl);

      if (typeof QRCode !== 'undefined' && QRCode.toString) {
        QRCode.toString(getCardQRPayload(st.id, evaluation), { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }, (err, svg) => {
          if (err) return;
          const el = sheetEl.querySelector(`[data-qr-id="${st.id}"]`)
                  || sheetEl.querySelector(`[id="qr-box-${st.id}"]`)
                  || document.getElementById('qr-box-' + st.id);
          if (el) el.innerHTML = svg;
        });
      }
    }
    if (typeof fitSummaryDocumentsToViewport === 'function') fitSummaryDocumentsToViewport();
    return;
  }

  // ── CASO CARTILLA OMR HASTA 10 PREGUNTAS O CUALQUIER FICHA A6 (4 ALUMNOS POR HOJA A4: 2x2) ──
  const isA6Quad = evaluation && (
    evaluation.cardFormat === 'a6' ||
    (evaluation.branch === 'rama2' && evaluation.withGrid === false && qCount <= 2 && evaluation.cardFormat !== 'a5')
  );
  if ((isR3 && qCount <= 10) || isA6Quad) {
    const isA6V = isA6Quad && (
      evaluation.orientation === 'vertical' ||
      evaluation.isPortrait === true ||
      evaluation.cardOrientation === 'vertical'
    );
    const sheetCount = Math.ceil(students.length / 4);
    const printBtn = document.getElementById('btn-print-sheets');
    if (printBtn) {
      if (isR3) {
        printBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Imprimir Cartillas`;
      } else {
        printBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Imprimir Fichas`;
      }
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
      sheetEl.className = isA6V ? 'sheet-a4-quad-v' : 'sheet-a4-quad';
      sheetEl.innerHTML = `
        <div class="quad-row">
          ${sTL ? createA6Card(sTL, classroom, evaluation) : '<div class="card-a6-empty"></div>'}
          <div class="quad-vcut">
            <div class="quad-vcut-line"></div>
            <span class="quad-vcut-text"></span>
            <div class="quad-vcut-line"></div>
          </div>
          ${sTR ? createA6Card(sTR, classroom, evaluation) : '<div class="card-a6-empty"></div>'}
        </div>
        <div class="quad-hcut">
          <span>cortar por aquí</span>
        </div>
        <div class="quad-row">
          ${sBL ? createA6Card(sBL, classroom, evaluation) : '<div class="card-a6-empty"></div>'}
          <div class="quad-vcut">
            <div class="quad-vcut-line"></div>
            <span class="quad-vcut-text"></span>
            <div class="quad-vcut-line"></div>
          </div>
          ${sBR ? createA6Card(sBR, classroom, evaluation) : '<div class="card-a6-empty"></div>'}
        </div>
      `;
      container.appendChild(sheetEl);

      // Generar códigos QR para los alumnos presentes en esta hoja
      if (typeof QRCode !== 'undefined' && QRCode.toString) {
        [sTL, sTR, sBL, sBR].filter(Boolean).forEach(st => {
          QRCode.toString(getCardQRPayload(st.id, evaluation), { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }, (err, svg) => {
            if (err) return;
            const el = sheetEl.querySelector(`[data-qr-id="${st.id}"]`)
                  || sheetEl.querySelector(`[id="qr-box-${st.id}"]`)
                  || document.getElementById('qr-box-' + st.id);
            if (el) el.innerHTML = svg;
          });
        });
      }
    }
    if (typeof fitSummaryDocumentsToViewport === 'function') fitSummaryDocumentsToViewport();
    return;
  }

  // ── CASO CARTILLA OMR MÁS DE 10 PREGUNTAS (11 A 20): 2 ALUMNOS POR HOJA A4 HORIZONTAL (IZQUIERDA Y DERECHA) ──
  if (isR3 && qCount > 10) {
    const sheetCount = Math.ceil(students.length / 2);
    const printBtn = document.getElementById('btn-print-sheets');
    if (printBtn) {
      printBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Imprimir Cartillas`;
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
          <span class="dual-vcut-text">cortar por aquí</span>
          <div class="dual-vcut-line"></div>
        </div>
        ${sRight ? createA5VerticalR3Card(sRight, classroom, evaluation) : '<div class="card-a5-v-empty"></div>'}
      `;
      container.appendChild(sheetEl);

      // Generar códigos QR para los alumnos presentes en esta hoja
      if (typeof QRCode !== 'undefined' && QRCode.toString) {
        [sLeft, sRight].filter(Boolean).forEach(st => {
          QRCode.toString(getCardQRPayload(st.id, evaluation), { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }, (err, svg) => {
            if (err) return;
            const el = sheetEl.querySelector(`[data-qr-id="${st.id}"]`)
                  || sheetEl.querySelector(`[id="qr-box-${st.id}"]`)
                  || document.getElementById('qr-box-' + st.id);
            if (el) el.innerHTML = svg;
          });
        });
      }
    }
    if (typeof fitSummaryDocumentsToViewport === 'function') fitSummaryDocumentsToViewport();
    return;
  }

  // ── CASO RESPUESTA LIBRE / FOCALIZADA VERTICAL (2 FICHAS A5 VERTICALES EN HOJA A4 HORIZONTAL) ──
  const isVerticalFree = evaluation && (evaluation.cardOrientation === 'vertical' || evaluation.isPortrait === true || evaluation.orientation === 'vertical') && !isR3;
  if (isVerticalFree) {
    const sheetCount = Math.ceil(students.length / 2);
    const printBtn = document.getElementById('btn-print-sheets');
    if (printBtn) {
      printBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Imprimir Fichas`;
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
        ${createA5VerticalCard(sLeft, classroom, evaluation)}
        <div class="dual-vcut">
          <div class="dual-vcut-line"></div>
          <span class="dual-vcut-text">cortar por aquí</span>
          <div class="dual-vcut-line"></div>
        </div>
        ${sRight ? createA5VerticalCard(sRight, classroom, evaluation) : '<div class="card-a5-v-empty"></div>'}
      `;
      container.appendChild(sheetEl);

      // Generar códigos QR para los alumnos presentes en esta hoja
      if (typeof QRCode !== 'undefined' && QRCode.toString) {
        [sLeft, sRight].filter(Boolean).forEach(st => {
          QRCode.toString(getCardQRPayload(st.id, evaluation), { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }, (err, svg) => {
            if (err) return;
            const el = sheetEl.querySelector(`[data-qr-id="${st.id}"]`)
                  || sheetEl.querySelector(`[id="qr-box-${st.id}"]`)
                  || document.getElementById('qr-box-' + st.id);
            if (el) el.innerHTML = svg;
          });
        });
      }
    }

    fitProblemText();
    if (typeof fitSummaryDocumentsToViewport === 'function') fitSummaryDocumentsToViewport();
    return;
  }

  // ── CASO GENERAL (2 FICHAS A5 POR HOJA A4 VERTICAL) ──
  const sheetCount = Math.ceil(students.length / 2);
  const printBtn = document.getElementById('btn-print-sheets');
  if (printBtn) {
    const isR3 = evaluation && evaluation.branch === 'rama3';
    const pageWord = sheetCount === 1 ? 'página A4' : 'páginas A4';
    if (isR3) {
      printBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Imprimir Cartillas`;
    } else {
      printBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Imprimir Fichas`;
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
    sheetEl.innerHTML = `
      ${createA5Card(sTop, classroom, evaluation)}
      <div class="cut-line">
        <span>cortar por aquí</span>
      </div>
      ${sBot ? createA5Card(sBot, classroom, evaluation) : '<div class="card-a5-placeholder"></div>'}
    `;
    container.appendChild(sheetEl);

    // Generar el QR de cada alumno que va en esta hoja con identificador de sesión
    if (typeof QRCode !== 'undefined' && QRCode.toString) {
      [sTop, sBot].filter(Boolean).forEach(st => {
        QRCode.toString(getCardQRPayload(st.id, evaluation), { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }, (err, svg) => {
          if (err) return;
          const el = sheetEl.querySelector(`[data-qr-id="${st.id}"]`)
                  || sheetEl.querySelector(`[id="qr-box-${st.id}"]`)
                  || document.getElementById('qr-box-' + st.id);
          if (el) el.innerHTML = svg;
        });
      });
    }
  }

  // Ajustar el tamaño de fuente del enunciado a su ranura fija
  fitProblemText();
  if (typeof fitSummaryDocumentsToViewport === 'function') fitSummaryDocumentsToViewport();
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
    const isLandscape = container && (
      container.querySelector('.sheet-a4-quad:not(.sheet-a4-quad-v)') ||
      container.querySelector('.sheet-a4-split') ||
      container.querySelector('.sheet-a4-h-single')
    );
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

  setTimeout(() => {
    window.print();
  }, 60);
}

// Escuchas reactivas para atajos de teclado (Ctrl+P) y opciones de impresión del navegador
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('beforeprint', () => {
    if (document.body.classList.contains('print-mode-booklet')) {
      const bookletContainer = document.getElementById('booklet-container');
      const hasPortraitSheet = !!(bookletContainer && bookletContainer.querySelector('.sheet-booklet-portrait'));
      setPrintPageOrientation(hasPortraitSheet ? 'portrait' : 'landscape');
      return;
    }

    const container = document.getElementById('pages-container');
    if (container && container.style.display !== 'none' && container.children.length > 0) {
      const isLandscape = container.querySelector('.sheet-a4-quad:not(.sheet-a4-quad-v)') ||
                          container.querySelector('.sheet-a4-split') ||
                          container.querySelector('.sheet-a4-h-single');
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
    document.body.classList.remove('print-mode-booklet');
    setPrintPageOrientation('portrait');
  });
}


/**
 * Limpia y oculta completamente los contenedores de vista previa de PDF
 * (tanto las cartillas de alumnos como el cuadernillo de preguntas de evaluación).
 */
function clearGeneratedPdfContainers() {
  const pages = document.getElementById('pages-container');
  if (pages) {
    pages.innerHTML = '';
    pages.style.display = 'none';
  }
  const booklet = document.getElementById('booklet-container');
  if (booklet) {
    booklet.innerHTML = '';
    booklet.style.display = 'none';
  }
}

/**
 * Auto-escala las hojas de evaluación y cuadernillos para que quepan al 100%
 * en el visor derecho (summary-document-viewport) en cualquier tamaño de pantalla
 * (PC, laptop, tablet), sin recortarse ni generar desbordes horizontales,
 * preservando la geometría física original para cuando se mande a imprimir.
 */
function fitSummaryDocumentsToViewport() {
  const summaryEl = document.getElementById('step-summary');
  if (!summaryEl) return;
  const viewport = summaryEl.querySelector('.summary-document-viewport');
  if (!viewport) return;

  const sheets = viewport.querySelectorAll(
    '.sheet-a4, .sheet-a4-quad, .sheet-a4-quad-v, .sheet-a4-split, ' +
    '.sheet-a4-v-single, .sheet-a4-h-single, .sheet-booklet-landscape, ' +
    '.sheet-booklet-quad, .sheet-booklet-portrait'
  );

  // En modo móvil (<= 900px) o en modo impresión, no forzar zoom ni transformaciones
  // para permitir lectura amplia y desplazamiento horizontal nativo por swipe/scroll
  const isMobile = (typeof window !== 'undefined' && window.innerWidth <= 900);
  const isPrintMode = document.body.classList.contains('print-mode-booklet') || document.body.classList.contains('print-mode-sheets');

  if (isMobile || isPrintMode) {
    sheets.forEach(sheet => {
      sheet.style.zoom = '';
      sheet.style.transform = '';
      sheet.style.marginBottom = '';
    });
    return;
  }

  // En PC/Desktop (> 900px), ajustar zoom para que encaje al 100% sin recortar el margen derecho
  // Se restan 36px de holgura preventiva (18px de padding a cada lado)
  const availWidth = viewport.clientWidth - 36;
  if (availWidth <= 50) return;

  sheets.forEach(sheet => {
    const isLandscapeSheet = sheet.classList.contains('sheet-a4-split') ||
                             sheet.classList.contains('sheet-a4-quad') ||
                             sheet.classList.contains('sheet-booklet-landscape') ||
                             sheet.classList.contains('sheet-a4-h-single');
    const naturalWidth = sheet.offsetWidth || (isLandscapeSheet ? 1039.4 : 710.5);
    if (naturalWidth > 0 && naturalWidth > availWidth) {
      const scale = availWidth / naturalWidth;
      sheet.style.zoom = scale;
      sheet.style.transform = '';
      sheet.style.marginBottom = '';
    } else {
      sheet.style.zoom = '';
      sheet.style.transform = '';
      sheet.style.marginBottom = '';
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
  window.checkIfBookletFitsA5 = checkIfBookletFitsA5;
  window.getBookletPdfExportTitle = getBookletPdfExportTitle;
  window.setPrintPageOrientation = setPrintPageOrientation;
  window.renderBookletQuestionHTML = renderBookletQuestionHTML;
  window.determineBookletLayout = determineBookletLayout;
  window.renderQuestionBooklet = renderQuestionBooklet;
  window.generateBookletWithJsPDF = generateBookletWithJsPDF;
  window.printQuestionBooklet = printQuestionBooklet;
  window.createA5VerticalCard = createA5VerticalCard;
  window.createA4Card = createA4Card;
  window.createA4VerticalCard = createA4VerticalCard;
  window.clearGeneratedPdfContainers = clearGeneratedPdfContainers;
  window.fitSummaryDocumentsToViewport = fitSummaryDocumentsToViewport;

  // Escuchar redimensionamiento de pantalla para mantener las hojas siempre ajustadas
  let summaryResizeDebounce = null;
  const onSummaryResize = () => {
    clearTimeout(summaryResizeDebounce);
    summaryResizeDebounce = setTimeout(fitSummaryDocumentsToViewport, 50);
  };
  window.addEventListener('resize', onSummaryResize);

  if (typeof ResizeObserver !== 'undefined') {
    const summaryRO = new ResizeObserver(() => {
      onSummaryResize();
    });
    const attachObserver = () => {
      const vp = document.querySelector('.summary-document-viewport');
      if (vp) summaryRO.observe(vp);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', attachObserver);
    } else {
      attachObserver();
    }
  }
}




// Exposición global
if (typeof window !== "undefined") {
  window.renderAllPrintPages = renderAllPrintPages;
  window.getPdfExportTitle = getPdfExportTitle;
  window.printEvaluationSheets = printEvaluationSheets;
  window.clearGeneratedPdfContainers = clearGeneratedPdfContainers;
  window.fitSummaryDocumentsToViewport = fitSummaryDocumentsToViewport;
}
