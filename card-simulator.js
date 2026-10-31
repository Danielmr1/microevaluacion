// =============================================================================
// card-simulator.js — Microevaluación v3.10.27
// MÓDULO PRINCIPAL: SIMULADOR INTERACTIVO DE FICHAS (ORQUESTADOR)
//
// Submódulos auxiliares vinculados:
//   - sim-card-layout.js : Geometría dimensional estricta y viewport fit
//   - sim-card-picker.js : Modal selector de preguntas y popovers KaTeX
//
// Guardarraíles activos:
//   Regla 1  – Cero regresión Respuesta Libre: flujo original intacto.
//   Regla 2  – Aislamiento Total de Alternativas: type === "mc" exclusivo.
//   Regla 14 – Geometría Visual Estricta: Proporciones físicas de ficha intactas.
//   Regla 17 – Límite estricto de 50 preguntas y sincronización nube.
// =============================================================================

function initSimulator(branch, classId) {
  simState.branch = branch || 'rama1';

  // Si es Rama 1, cuadrícula es obligatoria y arranca por defecto en A6 Horizontal (Escalón 0)
  if (simState.branch === 'rama1') {
    simState.withGrid = true;
    if (simState.count > 2) simState.count = 2;
    if (typeof simState.gridStage !== 'number') simState.gridStage = 0;
  } else {
    // Rama 2 (Focalizada): Inicia sin cuadrícula por defecto
    simState.withGrid = false;
    simState.gridStage = 0;
    if (simState.count > 5) simState.count = 1;
  }

  // Todas las ranuras de preguntas arrancan limpias y vacías para que el docente elija cada una conscientemente
  simState.questions = [
    { prompt: '', options: { A: '', B: '', C: '', D: '' }, correct: 'A', expectedAnswer: '', rubric: null, hasRubric: false },
    { prompt: '', options: { A: '', B: '', C: '', D: '' }, correct: 'A', expectedAnswer: '', rubric: null, hasRubric: false },
    { prompt: '', options: { A: '', B: '', C: '', D: '' }, correct: 'A', expectedAnswer: '', rubric: null, hasRubric: false },
    { prompt: '', options: { A: '', B: '', C: '', D: '' }, correct: 'A', expectedAnswer: '', rubric: null, hasRubric: false },
    { prompt: '', options: { A: '', B: '', C: '', D: '' }, correct: 'A', expectedAnswer: '', rubric: null, hasRubric: false }
  ];

  updateSimToolbar();
  renderSimulatedCard();
}

function updateSimToolbar() {
  const isRama1 = simState.branch === 'rama1';

  // 1. Selector de Cantidad de Preguntas (1P..2P para Rama 1, 1P..5P para Rama 2)
  const countContainer = document.getElementById('sim-qcount-group');
  if (countContainer) {
    const maxQ = (simState.branch === 'rama2') ? 5 : 2;
    let html = '';
    for (let i = 1; i <= maxQ; i++) {
      const activeCls = (simState.count === i) ? (isRama1 ? 'active' : 'active-emerald') : '';
      html += `<button type="button" onclick="setSimCount(${i})" class="sim-pill-btn ${activeCls}">${i}</button>`;
    }
    countContainer.innerHTML = html;
  }

  // 2. Indicador Informativo de Tamaño y Orientación (De solo lectura)
  const layout = determineCardLayout(simState);
  const tagEl = document.getElementById('sim-card-format-tag');
  if (tagEl) {
    tagEl.textContent = `📄 Ficha ${layout.badgeFull || layout.badge}`;
  }

  // 3. Selector de Tipo de Respuesta (Alternativas OMR vs Escribir respuesta)
  const btnTypeMC = document.getElementById('sim-btn-type-mc');
  const btnTypeFree = document.getElementById('sim-btn-type-free');
  if (btnTypeMC && btnTypeFree) {
    btnTypeMC.className = 'sim-pill-btn' + (simState.type === 'mc' ? (isRama1 ? ' active' : ' active-emerald') : '');
    btnTypeFree.className = 'sim-pill-btn' + (simState.type === 'free' ? (isRama1 ? ' active' : ' active-emerald') : '');
  }

  // 4. Selector de cuadrícula en el toolbar: Oculto en ambos modos (se maneja en la ficha)
  const gridGroup = document.getElementById('sim-grid-group');
  if (gridGroup) gridGroup.style.display = 'none';
}

function renderSimulatedCard() {
  const host = document.getElementById('sim-card-render-host');
  if (!host) return;

  const classroom = (typeof ClassroomData !== 'undefined' && wizardClassroomId)
    ? ClassroomData.getClassroom(wizardClassroomId)
    : null;

  const defaultCls = classroom || {
    id: 'cls_sim',
    name: '4to Grado Primaria',
    gradeStage: 'primaria',
    gradeLevel: 4,
    students: [{ id: '1', name: 'ESTUDIANTE EJEMPLO' }]
  };

  const sampleStudent = (defaultCls.students && defaultCls.students.length > 0)
    ? defaultCls.students[0]
    : { id: '1', name: 'ESTUDIANTE EJEMPLO' };

  const isOMR = simState.type === 'mc';
  const layout = determineCardLayout(simState);
  simState.cardFormat = layout.format;
  simState.orientation = layout.orientation;

  // Actualizar etiqueta del formato
  const formatTag = document.getElementById('sim-card-format-tag');
  if (formatTag) {
    formatTag.textContent = `📄 Ficha ${layout.badgeFull || layout.badge}`;
  }

  // Ventana dinámica según la orientación
  const viewport = document.getElementById('sim-card-viewport');
  if (viewport) {
    if (layout.orientation === 'horizontal') {
      viewport.classList.add('is-horizontal');
      viewport.classList.remove('is-vertical');
    } else {
      viewport.classList.add('is-vertical');
      viewport.classList.remove('is-horizontal');
    }
  }

  const previewQuestions = [];
  for (let i = 0; i < simState.count; i++) {
    const q = simState.questions[i];
    const hasPrompt = !!(q && q.prompt && q.prompt.trim().length > 0);
    previewQuestions.push({
      prompt: hasPrompt ? q.prompt : `[Pregunta ${i + 1}: Haz clic aquí para elegirla o redactarla]`,
      options: (q && q.options) || { A: 'A', B: 'B', C: 'C', D: 'D' },
      correct: (q && q.correct) || 'A',
      expectedAnswer: (q && q.expectedAnswer) || (q && q.correct) || 'A',
      isEmptySlot: !hasPrompt
    });
  }

  const simEval = {
    id: 'sim_eval_preview',
    branch: simState.branch,
    type: isOMR ? 'mc' : 'free',
    withGrid: (simState.branch === 'rama1') ? true : (layout.withGrid !== undefined ? layout.withGrid : !!simState.withGrid),
    questionCount: simState.count,
    questions: previewQuestions,
    cardFormat: layout.format,
    cardOrientation: layout.orientation,
    isPortrait: layout.orientation === 'vertical',
    orientation: layout.orientation,
    gridStage: simState.gridStage,
    prompt: previewQuestions.map((q, idx) => `${idx + 1}. ${q.prompt}`).join(' | '),
    expectedAnswer: isOMR
      ? previewQuestions.map(q => q.correct).join(' ')
      : previewQuestions.map(q => q.expectedAnswer).join(' ; ')
  };

  let cardHTML = '';
  if (layout.generator === 'createA6Card') {
    cardHTML = (typeof createA6Card === 'function')
      ? createA6Card(sampleStudent, defaultCls, simEval)
      : '<div style="padding:20px; color:#000;">A6 Preview</div>';
  } else if (layout.generator === 'createA5VerticalCard') {
    cardHTML = (typeof createA5VerticalCard === 'function')
      ? createA5VerticalCard(sampleStudent, defaultCls, simEval)
      : '<div style="padding:20px; color:#000;">A5 Vertical Preview</div>';
  } else if (layout.generator === 'createA4Card') {
    cardHTML = (typeof createA4Card === 'function')
      ? createA4Card(sampleStudent, defaultCls, simEval)
      : '<div style="padding:20px; color:#000;">A4 Horizontal Preview</div>';
  } else if (layout.generator === 'createA4VerticalCard') {
    cardHTML = (typeof createA4VerticalCard === 'function')
      ? createA4VerticalCard(sampleStudent, defaultCls, simEval)
      : '<div style="padding:20px; color:#000;">A4 Vertical Preview</div>';
  } else {
    cardHTML = (typeof createA5Card === 'function')
      ? createA5Card(sampleStudent, defaultCls, simEval)
      : '<div style="padding:20px; color:#000;">A5 Horizontal Preview</div>';
  }

  host.innerHTML = cardHTML;

  // Generar QR para el estudiante de muestra en la vista previa
  const qrBox = host.querySelector('[id^="qr-box-"]');
  if (qrBox && typeof QRCode !== 'undefined') {
    qrBox.id = 'sim-qr-box-' + sampleStudent.id;
    const qrData = JSON.stringify({ s: sampleStudent.id, c: defaultCls.id });
    QRCode.toString(qrData, { type: 'svg', margin: 0 }, (err, svg) => {
      if (!err && svg) qrBox.innerHTML = svg;
    });
  }

  // Hacer interactivos los bloques de preguntas y añadir control de cuadrícula sobre el borrador
  attachSimSlotInteractivity(host, previewQuestions);

  // Auto-fit proporcional para pantallas pequeñas / móviles
  fitSimCardToViewport();
}

function attachSimSlotInteractivity(host, previewQuestions) {
  if (!host) return;

  // 1. Caso Ficha Horizontal 1P (A5 o A6)
  const prob1P = host.querySelector('.a6-problem, .problem-wide, .problem-text');
  if (prob1P && simState.count === 1 && simState.orientation !== 'vertical') {
    prob1P.classList.add('sim-interactive-slot');
    prob1P.title = 'Haz clic para elegir o redactar la Pregunta 1';
    prob1P.onclick = () => openSimQuestionPicker(0);
    if (previewQuestions[0]?.isEmptySlot) {
      prob1P.innerHTML = `<div class="sim-slot-empty">➕ Clic Pregunta 1</div>`;
    }
  }

  // 2. Caso Ficha Horizontal 2P (columnas mc o libres)
  const cols2P = host.querySelectorAll('.problem-col, .mc-problem-2q, .p2-prompt-row');
  if (cols2P && cols2P.length >= 2 && simState.orientation !== 'vertical') {
    cols2P.forEach((col, idx) => {
      col.classList.add('sim-interactive-slot');
      col.title = `Haz clic para elegir o redactar la Pregunta ${idx + 1}`;
      col.onclick = () => openSimQuestionPicker(idx);
      if (previewQuestions[idx]?.isEmptySlot) {
        const textEl = col.querySelector('.problem-text, .p2-prompt-text') || col;
        textEl.innerHTML = `<div class="sim-slot-empty">➕ Clic Pregunta ${idx + 1}</div>`;
      }
    });
  }

  // 3. Caso Ficha Vertical (A6 Vertical o A5 Vertical)
  const vItems = host.querySelectorAll('.a6-v-problem, .v-nogrid-q, .v-nogrid-item, .v-free-2q-block, .v-free-problem');
  if (vItems && vItems.length > 0) {
    vItems.forEach((item, idx) => {
      if (idx < simState.count) {
        item.classList.add('sim-interactive-slot');
        item.title = `Haz clic para elegir o redactar la Pregunta ${idx + 1}`;
        item.onclick = () => openSimQuestionPicker(idx);
        if (previewQuestions[idx]?.isEmptySlot) {
          const pEl = item.querySelector('.v-nogrid-q-prompt, .v-nogrid-prompt, .problem-text') || item;
          pEl.innerHTML = `<div class="sim-slot-empty">➕ Clic Pregunta ${idx + 1}</div>`;
        }
      }
    });
  }

  // 4. Caso Ficha A6 o Sin Borrador o Ficha A4 (a6-nogrid-q, b2-q-item, a6-nogrid-item, a4-q-item, a6-h-2q-item)
  const a6Items = host.querySelectorAll('.a6-nogrid-q, .b2-q-item, .a6-nogrid-item, .a4-q-item, .a6-h-2q-item');
  if (a6Items && a6Items.length > 0) {
    a6Items.forEach((item, idx) => {
      if (idx < simState.count) {
        item.classList.add('sim-interactive-slot');
        item.title = `Haz clic para elegir o redactar la Pregunta ${idx + 1}`;
        item.onclick = () => openSimQuestionPicker(idx);
        if (previewQuestions[idx]?.isEmptySlot) {
          const pEl = item.querySelector('.a6-nogrid-q-prompt, .b2-q-prompt, .a6-nogrid-prompt, .a4-q-prompt, .a6-h-2q-prompt') || item;
          pEl.innerHTML = `<div class="sim-slot-empty">➕ Clic Pregunta ${idx + 1}</div>`;
        }
      }
    });
  }

  // 5. Control Interactivo sobre la Cuadrícula de Cálculo (Borrador):
  if (simState.branch === 'rama1') {
    // Formativa con IA: Stepper de redimensionamiento de cuadrícula
    const allGrids = host.querySelectorAll('.a6-grid-wrapper, .a6-v-grid-wrapper, .grid-wrapper, .v-free-grid, .v-free-grid-2q, .mc-grid-2q');
    const gridWrap = allGrids.length > 0 ? allGrids[allGrids.length - 1] : null;
    if (gridWrap) {
      gridWrap.style.position = 'relative';
      const existingStepper = gridWrap.querySelector('.sim-grid-stepper, .sim-grid-toggle-btn');
      if (existingStepper) existingStepper.remove();

      const layout = determineCardLayout(simState);
      const isMin = layout.stage <= layout.minStage;
      const isMax = layout.stage >= layout.maxStage;

      const stepper = document.createElement('div');
      stepper.className = 'sim-grid-stepper';
      stepper.innerHTML = `
        <span class="sim-stepper-label">📐 Cuadrícula</span>
        <button type="button" class="sim-stepper-btn" onclick="event.stopPropagation(); stepSimGridStage(-1)" ${isMin ? 'disabled' : ''} title="Reducir cuadrícula">▼</button>
        <button type="button" class="sim-stepper-btn" onclick="event.stopPropagation(); stepSimGridStage(1)" ${isMax ? 'disabled' : ''} title="Agrandar cuadrícula">▲</button>
      `;
      gridWrap.appendChild(stepper);
    }
  } else if (simState.branch === 'rama2') {
    if (simState.count === 5) return; // 5P no requiere stepper de cuadrícula (solo 1 nivel fijo A4 V sin cuadrícula)
    const layout = determineCardLayout(simState);
    const isMin = layout.stage <= layout.minStage;
    const isMax = layout.stage >= layout.maxStage;

    const stepper = document.createElement('div');
    stepper.className = 'sim-grid-stepper';
    stepper.innerHTML = `
      <span class="sim-stepper-label">📐 Cuadrícula</span>
      <button type="button" class="sim-stepper-btn" onclick="event.stopPropagation(); stepSimGridStage(-1)" ${isMin ? 'disabled' : ''} title="Reducir cuadrícula">▼</button>
      <button type="button" class="sim-stepper-btn" onclick="event.stopPropagation(); stepSimGridStage(1)" ${isMax ? 'disabled' : ''} title="Agrandar cuadrícula">▲</button>
    `;

    if (layout.stage === 0) {
      if (simState.count === 1) {
        const slot = host.querySelector('.focalizada-grid-slot-1p');
        if (slot) {
          const oldBtn = slot.querySelector('.sim-grid-stepper');
          if (oldBtn) oldBtn.remove();
          slot.appendChild(stepper);
        }
      } else if (simState.count === 2) {
        const slot = host.querySelector('.focalizada-grid-slot-2p');
        if (slot) {
          const oldBtn = slot.querySelector('.sim-grid-stepper');
          if (oldBtn) oldBtn.remove();
          slot.appendChild(stepper);
        }
      } else if (simState.count === 3) {
        const slot = host.querySelector('.focalizada-grid-slot-3p');
        if (slot) {
          const oldBtn = slot.querySelector('.sim-grid-stepper');
          if (oldBtn) oldBtn.remove();
          slot.appendChild(stepper);
        }
      } else if (simState.count === 4) {
        const slot = host.querySelector('.focalizada-grid-slot-4p');
        if (slot) {
          const oldBtn = slot.querySelector('.sim-grid-stepper');
          if (oldBtn) oldBtn.remove();
          slot.appendChild(stepper);
        }
      }
    } else {
      if ((simState.count === 3 && layout.stage === 1) || (simState.count === 4 && layout.stage === 1)) {
        // En 3P/4P cuando no hay cuadrícula en stage 1, el stepper va en el slot de la última pregunta
        const slot = host.querySelector(`.focalizada-grid-slot-${simState.count}p`);
        if (slot) {
          const oldBtn = slot.querySelector('.sim-grid-stepper');
          if (oldBtn) oldBtn.remove();
          slot.appendChild(stepper);
        }
      } else {
        const allGrids = host.querySelectorAll('.a6-grid-wrapper, .a6-v-grid-wrapper, .grid-wrapper, .v-free-grid, .v-free-grid-2q, .mc-grid-2q, .focalizada-grid-area, .focalizada-grid-2q-1, .a4-grid-wrapper, .focalizada-grid-3q-2, .focalizada-grid-4q-3');
        const gridWrap = allGrids.length > 0 ? allGrids[allGrids.length - 1] : null;
        if (gridWrap) {
          gridWrap.style.position = 'relative';
          const oldBtn = gridWrap.querySelector('.sim-grid-stepper');
          if (oldBtn) oldBtn.remove();
          gridWrap.appendChild(stepper);
        }
      }
    }
  }
}


function saveSimCustomQuestion() {
  if (typeof ClassroomData !== 'undefined' && ClassroomData.getBankQuestionsCount) {
    if (ClassroomData.getBankQuestionsCount() >= 50) {
      if (typeof showToast === 'function') {
        showToast('⚠️ Has alcanzado el límite máximo de 50 preguntas en tu banco. Elimina alguna pregunta que ya no utilices para poder agregar una nueva.');
      }
      return;
    }
  }

  const prompt = (document.getElementById('sim-new-prompt')?.value || '').trim();
  if (!prompt) {
    if (typeof showToast === 'function') showToast('⚠️ Escribe el enunciado de la pregunta.');
    return;
  }

  const hasFracFn = typeof hasFractions === 'function' ? hasFractions : (t => /\\frac\{|\[frac:|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|\b\d+\s*\/\s*\d+\b/.test(t));
  const withFrac = hasFracFn(prompt);
  const maxAllowed = withFrac ? 105 : 160;
  if (prompt.length > maxAllowed) {
    if (typeof showToast === 'function') showToast(`⚠️ El enunciado excede el límite de ${maxAllowed} caracteres (${withFrac ? 'con fracciones máx 105' : 'máx 160'}).`);
    return;
  }

  // ── MODO B (RAMA 3: CARTILLA OMR CON PREGUNTAS) ──
  if (currentSimSlotScope === 'rama3') {
    const optA = (document.getElementById('sim-opt-a')?.value || '').trim();
    const optB = (document.getElementById('sim-opt-b')?.value || '').trim();
    const optC = (document.getElementById('sim-opt-c')?.value || '').trim();
    const optD = (document.getElementById('sim-opt-d')?.value || '').trim();

    if (!optA || !optB || !optC || !optD) {
      if (typeof showToast === 'function') showToast('⚠️ Completa las 4 alternativas (A, B, C, D).');
      return;
    }

    let correctKey = 'A';
    const rad = document.querySelector('input[name="sim-new-correct"]:checked');
    if (rad) correctKey = rad.value.toUpperCase();

    const map = { A: optA, B: optB, C: optC, D: optD };
    const expectedAnswer = map[correctKey] || '';
    const g = gradoDelSalonSeleccionado();

    const newQ = {
      id: 'q_custom_' + Date.now(),
      prompt: prompt,
      options: { A: optA, B: optB, C: optC, D: optD },
      correct: correctKey,
      expectedAnswer: expectedAnswer,
      rubric: null,
      hasRubric: false,
      gradeStage: g?.stage || null,
      gradeLevel: g?.level || null,
      gradeText: g?.texto || null
    };

    if (typeof ClassroomData !== 'undefined' && ClassroomData.saveCustomEvaluation) {
      ClassroomData.saveCustomEvaluation({
        title: 'Pregunta de alternativa',
        type: 'mc',
        questionCount: 1,
        prompt: prompt,
        expectedAnswer: expectedAnswer,
        options: newQ.options,
        correct: correctKey,
        rubric: null,
        questions: [newQ],
        gradeStage: g?.stage || null,
        gradeLevel: g?.level || null,
        gradeText: g?.texto || null
      });
    }

    if (typeof SupabaseClient !== 'undefined' && SupabaseClient.saveEvaluation) {
      SupabaseClient.saveEvaluation({
        prompt: prompt,
        expectedAnswer: expectedAnswer,
        title: 'Pregunta de alternativa',
        type: 'mc',
        questionCount: 1,
        options: newQ.options,
        correct: correctKey,
        rubric: null,
        gradeStage: g?.stage,
        gradeLevel: g?.level,
        gradeText: g?.texto,
        questions: [newQ]
      }).catch(e => console.warn('[R3 Cloud Save]', e));
    }

    r3State.bankQuestions[currentSimSlot] = newQ;
    r3State.keys[currentSimSlot] = correctKey;
    closeSimPicker();
    renderRama3Exam();
    renderRama3CartillaPreview();
    if (typeof showToast === 'function') {
      showToast(`✓ Pregunta ${currentSimSlot + 1} guardada y asignada al examen.`);
    }
    return;
  }

  const isFree = simState.type === 'free';
  const optA = (document.getElementById('sim-opt-a')?.value || '').trim();
  const optB = (document.getElementById('sim-opt-b')?.value || '').trim();
  const optC = (document.getElementById('sim-opt-c')?.value || '').trim();
  const optD = (document.getElementById('sim-opt-d')?.value || '').trim();

  let correctKey = 'A';
  const rad = document.querySelector('input[name="sim-new-correct"]:checked');
  if (rad) correctKey = rad.value.toUpperCase();

  let expectedAnswer = '';
  if (isFree) {
    expectedAnswer = (document.getElementById('sim-new-free-ans')?.value || '').trim().substring(0, 15);
    if (!expectedAnswer) {
      document.getElementById('sim-new-free-ans')?.focus();
      if (typeof showToast === 'function') showToast('⚠️ Escribe la respuesta esperada.');
      return;
    }
  } else {
    if (!optA || !optB || !optC || !optD) {
      if (typeof showToast === 'function') showToast('⚠️ Completa las 4 alternativas (A, B, C, D).');
      return;
    }
    const map = { A: optA, B: optB, C: optC, D: optD };
    expectedAnswer = map[correctKey] || '';
  }

  // Guardarraíl Regla 6: En Rama 1 es obligatorio tener rúbrica
  if (simState.branch === 'rama1' && !simCurrentRubric) {
    if (typeof showToast === 'function') {
      showToast('⚠️ GUARDARRAÍL: En Formativa con IA la pregunta debe ser analizada con Gemini antes de guardar.');
    }
    return;
  }

  const g = gradoDelSalonSeleccionado();

  const newQ = {
    id: 'q_custom_' + Date.now(),
    prompt: prompt,
    options: isFree ? null : { A: optA, B: optB, C: optC, D: optD },
    correct: isFree ? null : correctKey,
    expectedAnswer: expectedAnswer,
    rubric: simCurrentRubric || null,
    hasRubric: !!simCurrentRubric,
    gradeStage: g?.stage || null,
    gradeLevel: g?.level || null,
    gradeText: g?.texto || null
  };

  // Guardar en el banco general para que perdure
  if (typeof ClassroomData !== 'undefined' && ClassroomData.saveCustomEvaluation) {
    ClassroomData.saveCustomEvaluation({
      title: isFree ? 'Pregunta de respuesta libre' : 'Pregunta de alternativa',
      type: isFree ? 'free' : 'mc',
      questionCount: 1,
      prompt: prompt,
      expectedAnswer: expectedAnswer,
      options: isFree ? null : newQ.options,
      correct: isFree ? null : correctKey,
      rubric: simCurrentRubric || null,
      questions: isFree ? null : [newQ],
      gradeStage: g?.stage || null,
      gradeLevel: g?.level || null,
      gradeText: g?.texto || null
    });
  }

  if (typeof SupabaseClient !== 'undefined' && SupabaseClient.saveEvaluation) {
    SupabaseClient.saveEvaluation({
      prompt: prompt,
      expectedAnswer: expectedAnswer,
      title: isFree ? 'Pregunta de respuesta libre' : 'Pregunta de alternativa',
      rubric: simCurrentRubric || null,
      gradeStage: g?.stage,
      gradeLevel: g?.level,
      gradeText: g?.texto,
      type: isFree ? 'free' : 'mc',
      questionCount: 1,
      options: isFree ? null : newQ.options,
      correct: isFree ? null : correctKey,
      questions: isFree ? null : [newQ]
    }).catch(e => console.warn('[Sim] Error al sincronizar pregunta en Supabase:', e && e.message));
  }

  if (typeof renderBankCards === 'function') renderBankCards();
  if (typeof renderBankManagerQuestions === 'function') renderBankManagerQuestions();
  if (typeof renderSimBankList === 'function') renderSimBankList();

  simState.questions[currentSimSlot] = newQ;
  closeSimPicker();
  renderSimulatedCard();
  if (typeof showToast === 'function') {
    showToast(`✓ Pregunta ${currentSimSlot + 1} guardada y asignada a la ficha.`);
  }
}

// ── ACCIONES PRINCIPALES DEL SIMULADOR (IMPRIMIR Y ESCANEAR) ──
function buildSimulatorEvaluation() {
  if (!wizardClassroomId) {
    if (typeof showToast === 'function') showToast('⚠️ Selecciona un salón de clases primero.');
    return null;
  }

  // Validar que todas las preguntas activas tengan enunciado
  for (let i = 0; i < simState.count; i++) {
    const q = simState.questions[i];
    if (!q || !q.prompt || q.prompt.trim() === '' || q.prompt.startsWith('[Pregunta')) {
      if (typeof showToast === 'function') {
        showToast(`⚠️ Falta configurar la Pregunta ${i + 1}. Haz clic sobre ella en la ficha.`);
      }
      openSimQuestionPicker(i);
      return null;
    }
    // Guardarraíl Regla 6 en Rama 1
    if (simState.branch === 'rama1' && !q.rubric) {
      if (typeof showToast === 'function') {
        showToast(`⚠️ GUARDARRAÍL: La Pregunta ${i + 1} requiere análisis pedagógico de IA.`);
      }
      openSimQuestionPicker(i);
      return null;
    }
  }

  const g = gradoDelSalonSeleccionado();
  const isOMR = simState.type === 'mc';
  const layout = determineCardLayout(simState);
  const activeQuestions = simState.questions.slice(0, simState.count);

  const evalObj = {
    id: 'eval_sim_' + Date.now(),
    branch: simState.branch,
    type: isOMR ? 'mc' : 'free',
    withGrid: (simState.branch === 'rama1') ? true : !!simState.withGrid,
    questionCount: simState.count,
    questions: activeQuestions,
    cardFormat: layout.format,
    cardOrientation: layout.orientation,
    isPortrait: layout.orientation === 'vertical',
    orientation: layout.orientation,
    gridStage: simState.gridStage,
    title: simState.branch === 'rama1'
      ? (isOMR ? `Formativa con IA (${simState.count}P)` : 'Formativa Respuesta Libre')
      : `Focalizada en la Respuesta (${simState.count}P)`,
    prompt: activeQuestions.map((q, idx) => `${idx + 1}. ${q.prompt}`).join(' | '),
    expectedAnswer: isOMR
      ? activeQuestions.map(q => q.correct).join(' ')
      : activeQuestions.map(q => q.expectedAnswer || q.correct).join(' ; '),
    options: (activeQuestions.length === 1 && activeQuestions[0].options) ? activeQuestions[0].options : null,
    correct: (activeQuestions.length === 1 && activeQuestions[0].correct) ? activeQuestions[0].correct : null,
    rubric: (activeQuestions.length === 1 && activeQuestions[0].rubric) ? activeQuestions[0].rubric : null,
    correctionMode: simState.branch === 'rama1' ? 'full' : 'quick',
    gradeStage: g?.stage,
    gradeLevel: g?.level,
    gradeText: g?.texto
  };

  wizardEvalType = isOMR ? (simState.count === 1 ? 'mc1' : 'mc2') : 'free';
  wizardEval = ClassroomData.saveCustomEvaluation(evalObj);

  // Registrar sesión activa
  const session = ClassroomData.setActiveSession(wizardClassroomId, wizardEval.id, wizardEval.expectedAnswer);
  if (session) {
    session.branch = simState.branch;
    session.withGrid = simState.withGrid;
    session.cardFormat = wizardEval.cardFormat;
    session.isPortrait = wizardEval.isPortrait;
    session.questionCount = simState.count;
    session.correctionMode = wizardEval.correctionMode;
    session.type = wizardEval.type;
    ClassroomData.saveActiveSession(session);
  }

  return wizardEval;
}

/**
 * Confirma las preguntas seleccionadas en el simulador (Rama 1 y Rama 2),
 * oculta la vista de edición interactiva del Paso 2 y abre la pantalla de resumen
 * mostrando los botones de acción (Guardar o Imprimir, Ir al Escáner, Editar) y las hojas A4.
 */
function confirmSimulator() {
  if (typeof window !== 'undefined' && window.EvaluationHologram) {
    window.EvaluationHologram.stop();
  }
  const ev = buildSimulatorEvaluation();
  if (!ev) return;

  const stepType = document.getElementById('step-eval-type');
  if (stepType) stepType.style.display = 'none';

  if (typeof showSummary === 'function') {
    showSummary();
  }
}

function confirmSimAndPrint() {
  const ev = buildSimulatorEvaluation();
  if (!ev) return;

  const pagesContainer = document.getElementById('pages-container');
  if (pagesContainer && typeof renderAllPrintPages === 'function') {
    pagesContainer.style.display = 'flex';
    renderAllPrintPages(wizardClassroomId, ev);

    // Scroll suave hacia las hojas de impresión
    pagesContainer.scrollIntoView({ behavior: 'smooth' });
    if (typeof showToast === 'function') {
      showToast('🖨️ Fichas listas para imprimir / guardar como PDF.');
    }
  }

  // Disparar inmediatamente el diálogo de impresión / descarga en PDF
  if (typeof printEvaluationSheets === 'function') {
    printEvaluationSheets(wizardClassroomId);
  } else {
    window.print();
  }
}

// ── EXPOSICIÓN GLOBAL DE FUNCIONES DEL SIMULADOR WYSIWYG ──
if (typeof window !== 'undefined') {
  window.currentBranchMode = currentBranchMode;
  window.selectBranchMode = selectBranchMode;
  window.simState = simState;
  window.initSimulator = initSimulator;
  window.updateSimToolbar = updateSimToolbar;
  window.determineCardLayout = determineCardLayout;
  window.stepSimGridStage = stepSimGridStage;
  window.setSimCount = setSimCount;
  window.setSimType = setSimType;
  window.toggleSimGrid = toggleSimGrid;
  window.setSimGrid = setSimGrid;
  window.fitSimCardToViewport = fitSimCardToViewport;
  window.renderSimulatedCard = renderSimulatedCard;
  window.attachSimSlotInteractivity = attachSimSlotInteractivity;
  window.openSimQuestionPicker = openSimQuestionPicker;
  window.closeSimPicker = closeSimPicker;
  window.setSimPickerTab = setSimPickerTab;
  window.renderSimBankList = renderSimBankList;
  window.selectSimBankQuestion = selectSimBankQuestion;
  window.handleUpgradeSimBankQuestion = handleUpgradeSimBankQuestion;
  window.handleSimAnalyzeAI = handleSimAnalyzeAI;
  window.saveSimCustomQuestion = saveSimCustomQuestion;
  window.buildSimulatorEvaluation = buildSimulatorEvaluation;
  window.confirmSimulator = confirmSimulator;
  window.confirmSimAndPrint = confirmSimAndPrint;
  if (typeof fitRama3ToViewport === 'function') {
    window.fitRama3ToViewport = fitRama3ToViewport;
  }
}
