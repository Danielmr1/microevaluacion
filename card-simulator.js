// =============================================================================
// card-simulator.js — Microevaluación A5 v3.8.9
// MÓDULO: SIMULADOR INTERACTIVO WYSIWYG DE FICHAS (RAMA 1 Y RAMA 2)
//
// Responsabilidad única:
//   - Renderizado en vivo de la tarjeta evaluativa (WYSIWYG).
//   - Ajuste y auto-escalado responsive según viewport.
//   - Detección de layout geométrico estricto (A5 / A6) según Regla 14.
//   - Selección interactiva de preguntas desde el banco o creación rápida.
//
// Dependencias globales: ClassroomData, wizardClassroomId, showToast, openFlow,
//                        evaluacionesDelGradoActual, printEvaluationSheets
// =============================================================================
// CONTROLADOR DE MODALIDADES DE EVALUACIÓN (RAMA 1, RAMA 2, RAMA 3) — FASE 2
// =============================================================================

let currentBranchMode = 'rama1';

function selectBranchMode(branch) {
  currentBranchMode = branch || 'rama1';
  if (typeof window !== 'undefined') {
    window.selectedBranch = currentBranchMode;
  }

  const badgeLabel = document.getElementById('branch-badge-label');
  if (badgeLabel) {
    if (branch === 'rama3') {
      badgeLabel.innerHTML = '📋 Cartilla OMR (Hasta 20 Preguntas)';
      badgeLabel.style.background = '#064e3b';
      badgeLabel.style.borderColor = '#10b981';
      badgeLabel.style.color = '#a7f3d0';
    } else if (branch === 'rama2') {
      badgeLabel.innerHTML = '⚡ Focalizada en la Respuesta (1–5 Preguntas)';
      badgeLabel.style.background = '#082f49';
      badgeLabel.style.borderColor = '#38bdf8';
      badgeLabel.style.color = '#bae6fd';
    } else {
      badgeLabel.innerHTML = '🔬 Formativa con IA (Rúbrica Gemini)';
      badgeLabel.style.background = '#1e1b4b';
      badgeLabel.style.borderColor = '#6366f1';
      badgeLabel.style.color = '#c7d2fe';
    }
  }

  const card1 = document.getElementById('card-branch-1');
  const card2 = document.getElementById('card-branch-2');
  const card3 = document.getElementById('card-branch-3');

  const simContainer = document.getElementById('sheet-simulator-container');
  const b3Opts = document.getElementById('branch-3-options');
  const evalHeader = document.getElementById('step-eval-type-header');

  if (simContainer) simContainer.style.display = (branch === 'rama1' || branch === 'rama2') ? 'flex' : 'none';
  if (b3Opts) b3Opts.style.display = branch === 'rama3' ? 'block' : 'none';
  if (evalHeader) evalHeader.style.display = 'none';

  // Asegurar que el formulario modal de preguntas inicie cerrado
  const fNew = document.getElementById('step-new-form');
  if (fNew) fNew.style.display = 'none';

  if (branch === 'rama1') {
    if (typeof updateCorrectionModeUI === 'function') updateCorrectionModeUI('full');
    initSimulator('rama1', wizardClassroomId);
  } else if (branch === 'rama2') {
    if (typeof updateCorrectionModeUI === 'function') updateCorrectionModeUI('quick');
    initSimulator('rama2', wizardClassroomId);
  } else if (branch === 'rama3') {
    if (typeof updateCorrectionModeUI === 'function') updateCorrectionModeUI('quick');
    initRama3Builder();
  }
}

// =============================================================================
// SIMULADOR INTERACTIVO DE FICHAS WYSIWYG (RAMA 1 Y RAMA 2)
// =============================================================================
let simState = {
  branch: 'rama1', // 'rama1' | 'rama2'
  count: 1, // 1..2 en rama1; 1..5 en rama2
  type: 'mc', // 'mc' | 'free'
  withGrid: true, // boolean
  gridStage: 0, // 0: A6 H (defecto), 1: A6 V, 2: A5 H, 3: A5 V (máx)
  gridSize: 'normal',
  orientation: 'horizontal',
  cardFormat: 'a6',
  questions: [
    { prompt: '', options: { A: '', B: '', C: '', D: '' }, correct: 'A', expectedAnswer: '', rubric: null, hasRubric: false },
    { prompt: '', options: { A: '', B: '', C: '', D: '' }, correct: 'A', expectedAnswer: '', rubric: null, hasRubric: false },
    { prompt: '', options: { A: '', B: '', C: '', D: '' }, correct: 'A', expectedAnswer: '', rubric: null, hasRubric: false },
    { prompt: '', options: { A: '', B: '', C: '', D: '' }, correct: 'A', expectedAnswer: '', rubric: null, hasRubric: false },
    { prompt: '', options: { A: '', B: '', C: '', D: '' }, correct: 'A', expectedAnswer: '', rubric: null, hasRubric: false }
  ]
};

let currentSimSlot = 0;
let currentSimSlotScope = 'sim'; // 'sim' | 'rama3'
let simCurrentRubric = null;
let simPickerActiveTab = 'bank';

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

/**
 * Determina el formato y orientación:
 * - Rama 1 (Formativa con IA):
 *    1P: A6 H -> A6 V -> A5 H -> A5 V (con cuadrícula obligatoria)
 *    2P: A5 H -> A5 V (con cuadrícula obligatoria)
 * - Rama 2 (Focalizada en la Respuesta):
 *    1P: A6 Horizontal (sin cuadrícula al inicio; botón inferior activa 5 filas 13x5)
 *    2P: A6 Vertical   (sin cuadrícula al inicio; botón inferior activa cuadrícula)
 */
function determineCardLayout(state) {
  const isRama1 = state.branch === 'rama1';
  const count = state.count || 1;

  if (isRama1) {
    if (count === 1) {
      const stage = (typeof state.gridStage === 'number') ? state.gridStage : 0;
      switch (stage) {
        case 0:
          return {
            format: 'a6',
            orientation: 'horizontal',
            generator: 'createA6Card',
            badge: 'A6 H',
            badgeFull: 'A6 Horizontal',
            stage: 0,
            minStage: 0,
            maxStage: 3
          };
        case 1:
          return {
            format: 'a6',
            orientation: 'vertical',
            generator: 'createA6Card',
            badge: 'A6 V',
            badgeFull: 'A6 Vertical',
            stage: 1,
            minStage: 0,
            maxStage: 3
          };
        case 2:
          return {
            format: 'a5',
            orientation: 'horizontal',
            generator: 'createA5Card',
            badge: 'A5 H',
            badgeFull: 'A5 Horizontal',
            stage: 2,
            minStage: 0,
            maxStage: 3
          };
        case 3:
        default:
          return {
            format: 'a5',
            orientation: 'vertical',
            generator: 'createA5VerticalCard',
            badge: 'A5 V',
            badgeFull: 'A5 Vertical',
            stage: 3,
            minStage: 0,
            maxStage: 3
          };
      }
    } else {
      // 2 preguntas con cuadrícula (Formativa)
      const stage = (state.gridStage >= 1) ? 1 : 0;
      if (stage === 1) {
        return {
          format: 'a5',
          orientation: 'vertical',
          generator: 'createA5VerticalCard',
          badge: 'A5 V',
          badgeFull: 'A5 Vertical',
          stage: 1,
          minStage: 0,
          maxStage: 1
        };
      }
      return {
        format: 'a5',
        orientation: 'horizontal',
        generator: 'createA5Card',
        badge: 'A5 H',
        badgeFull: 'A5 Horizontal',
        stage: 0,
        minStage: 0,
        maxStage: 1
      };
    }
  }

  // ── RAMA 2: FOCALIZADA EN LA RESPUESTA ──
  const stage = (typeof state.gridStage === 'number') ? state.gridStage : 0;
  if (count === 1) {
    switch (stage) {
      case 0:
        return {
          format: 'a6',
          orientation: 'horizontal',
          generator: 'createA6Card',
          badge: 'A6 H',
          badgeFull: 'A6 Horizontal',
          withGrid: false,
          stage: 0,
          minStage: 0,
          maxStage: 4
        };
      case 1:
        return {
          format: 'a6',
          orientation: 'horizontal',
          generator: 'createA6Card',
          badge: 'A6 H',
          badgeFull: 'A6 Horizontal',
          withGrid: true,
          stage: 1,
          minStage: 0,
          maxStage: 4
        };
      case 2:
        return {
          format: 'a6',
          orientation: 'vertical',
          generator: 'createA6Card',
          badge: 'A6 V',
          badgeFull: 'A6 Vertical',
          withGrid: true,
          stage: 2,
          minStage: 0,
          maxStage: 4
        };
      case 3:
        return {
          format: 'a5',
          orientation: 'horizontal',
          generator: 'createA5Card',
          badge: 'A5 H',
          badgeFull: 'A5 Horizontal',
          withGrid: true,
          stage: 3,
          minStage: 0,
          maxStage: 4
        };
      case 4:
      default:
        return {
          format: 'a5',
          orientation: 'vertical',
          generator: 'createA5VerticalCard',
          badge: 'A5 V',
          badgeFull: 'A5 Vertical',
          withGrid: true,
          stage: 4,
          minStage: 0,
          maxStage: 4
        };
    }
  }

  if (count === 2) {
    switch (stage) {
      case 0:
        return {
          format: 'a6',
          orientation: 'horizontal',
          generator: 'createA6Card',
          badge: 'A6 H',
          badgeFull: 'A6 Horizontal',
          withGrid: false,
          stage: 0,
          minStage: 0,
          maxStage: 3
        };
      case 1:
        return {
          format: 'a6',
          orientation: 'vertical',
          generator: 'createA6Card',
          badge: 'A6 V',
          badgeFull: 'A6 Vertical',
          withGrid: true,
          stage: 1,
          minStage: 0,
          maxStage: 3
        };
      case 2:
        return {
          format: 'a5',
          orientation: 'horizontal',
          generator: 'createA5Card',
          badge: 'A5 H',
          badgeFull: 'A5 Horizontal',
          withGrid: true,
          stage: 2,
          minStage: 0,
          maxStage: 3
        };
      case 3:
      default:
        return {
          format: 'a5',
          orientation: 'vertical',
          generator: 'createA5VerticalCard',
          badge: 'A5 V',
          badgeFull: 'A5 Vertical',
          withGrid: true,
          stage: 3,
          minStage: 0,
          maxStage: 3
        };
    }
  }

  if (count === 3) {
    switch (stage) {
      case 0:
        return {
          format: 'a5',
          orientation: 'horizontal',
          generator: 'createA5Card',
          badge: 'A5 H',
          badgeFull: 'A5 Horizontal',
          withGrid: false,
          stage: 0,
          minStage: 0,
          maxStage: 3
        };
      case 1:
        return {
          format: 'a5',
          orientation: 'vertical',
          generator: 'createA5VerticalCard',
          badge: 'A5 V',
          badgeFull: 'A5 Vertical',
          withGrid: false,
          stage: 1,
          minStage: 0,
          maxStage: 3
        };
      case 2:
        return {
          format: 'a4',
          orientation: 'horizontal',
          generator: 'createA4Card',
          badge: 'A4 H',
          badgeFull: 'A4 Horizontal',
          withGrid: true,
          stage: 2,
          minStage: 0,
          maxStage: 3
        };
      case 3:
      default:
        return {
          format: 'a4',
          orientation: 'vertical',
          generator: 'createA4VerticalCard',
          badge: 'A4 V',
          badgeFull: 'A4 Vertical',
          withGrid: true,
          stage: 3,
          minStage: 0,
          maxStage: 3
        };
    }
  }

  if (count === 4) {
    switch (stage) {
      case 0:
        return {
          format: 'a5',
          orientation: 'vertical',
          generator: 'createA5VerticalCard',
          badge: 'A5 V',
          badgeFull: 'A5 Vertical',
          withGrid: false,
          stage: 0,
          minStage: 0,
          maxStage: 2
        };
      case 1:
        return {
          format: 'a4',
          orientation: 'horizontal',
          generator: 'createA4Card',
          badge: 'A4 H',
          badgeFull: 'A4 Horizontal',
          withGrid: false,
          stage: 1,
          minStage: 0,
          maxStage: 2
        };
      case 2:
      default:
        return {
          format: 'a4',
          orientation: 'vertical',
          generator: 'createA4VerticalCard',
          badge: 'A4 V',
          badgeFull: 'A4 Vertical',
          withGrid: true,
          stage: 2,
          minStage: 0,
          maxStage: 2
        };
    }
  }

  if (count === 5) {
    return {
      format: 'a4',
      orientation: 'vertical',
      generator: 'createA4VerticalCard',
      badge: 'A4 V',
      badgeFull: 'A4 Vertical',
      withGrid: false,
      stage: 0,
      minStage: 0,
      maxStage: 0
    };
  }

  return {
    format: 'a5',
    orientation: 'vertical',
    generator: 'createA5VerticalCard',
    badge: 'A5 V',
    badgeFull: 'A5 Vertical',
    stage: 0,
    minStage: 0,
    maxStage: 0
  };
}

function stepSimGridStage(delta) {
  const layout = determineCardLayout(simState);
  const cur = (typeof simState.gridStage === 'number') ? simState.gridStage : 0;
  const next = Math.max(layout.minStage, Math.min(layout.maxStage, cur + delta));
  if (next !== cur) {
    simState.gridStage = next;
    const nextLayout = determineCardLayout(simState);
    simState.withGrid = (simState.branch === 'rama1') ? true : !!nextLayout.withGrid;
    updateSimToolbar();
    renderSimulatedCard();
  }
}

function setSimCount(count) {
  const isRama1 = simState.branch === 'rama1';
  const c = parseInt(count, 10);
  const maxAllowed = isRama1 ? 2 : 5;
  const targetCount = Math.min(Math.max(1, c), maxAllowed);
  if (simState.count !== targetCount) {
    simState.count = targetCount;
    simState.gridStage = 0;
    simState.withGrid = isRama1 ? true : false;
  }

  updateSimToolbar();
  renderSimulatedCard();
}

function setSimType(type) {
  simState.type = (type === 'free') ? 'free' : 'mc';
  updateSimToolbar();
  renderSimulatedCard();
}

function toggleSimGrid() {
  if (simState.branch === 'rama1') return; // En Formativa la cuadrícula es fija y obligatoria
  simState.withGrid = !simState.withGrid;
  updateSimToolbar();
  renderSimulatedCard();
}

function setSimGrid(withGrid) {
  if (simState.branch === 'rama1') {
    simState.withGrid = true;
    return;
  }
  simState.withGrid = !!withGrid;
  updateSimToolbar();
  renderSimulatedCard();
}

function fitSimCardToViewport() {
  const viewport = document.getElementById('sim-card-viewport');
  const host = document.getElementById('sim-card-render-host');
  const card = host ? host.firstElementChild : null;
  if (!viewport || !host || !card) return;

  host.style.transform = 'none';
  host.style.marginBottom = '0px';

  const availWidth = viewport.clientWidth - 28;
  const cardWidth = card.offsetWidth;

  if (cardWidth > 0 && availWidth > 0 && cardWidth > availWidth) {
    const scale = availWidth / cardWidth;
    host.style.transform = `scale(${scale})`;
    host.style.transformOrigin = 'center top';
    const cardHeight = card.offsetHeight;
    const heightDiff = cardHeight * (1 - scale);
    host.style.marginBottom = `-${heightDiff}px`;
  }
}

function fitRama3ToViewport() {
  // 1. Ajuste proporcional de la Hoja de Evaluación Escolar (Rama 3 Modo B)
  const examViewport = document.getElementById('r3-exam-viewport');
  const examHost = document.getElementById('r3-exam-render-host');
  const examSheet = examHost ? examHost.querySelector('.r3-exam-sheet') : null;
  if (examViewport && examHost && examSheet) {
    examHost.style.transform = 'none';
    examHost.style.marginBottom = '0px';

    const availWidth = examViewport.clientWidth - 28;
    const sheetWidth = examSheet.offsetWidth;

    if (sheetWidth > 0 && availWidth > 0 && sheetWidth > availWidth) {
      const scale = availWidth / sheetWidth;
      examHost.style.transform = `scale(${scale})`;
      examHost.style.transformOrigin = 'top center';
      const sheetHeight = examSheet.offsetHeight;
      const heightDiff = sheetHeight * (1 - scale);
      examHost.style.marginBottom = `-${heightDiff}px`;
    }
  }

  // 2. Ajuste proporcional de la Cartilla OMR (Rama 3 Modo B)
  const cartViewport = document.getElementById('r3-cartilla-viewport');
  const cartHost = document.getElementById('r3-cartilla-render-host');
  const cartCard = cartHost ? cartHost.firstElementChild : null;
  if (cartViewport && cartHost && cartCard) {
    cartHost.style.transform = 'none';
    cartHost.style.marginBottom = '0px';

    const availWidth = cartViewport.clientWidth - 28;
    const cardWidth = cartCard.offsetWidth;

    if (cardWidth > 0 && availWidth > 0 && cardWidth > availWidth) {
      const scale = availWidth / cardWidth;
      cartHost.style.transform = `scale(${scale})`;
      cartHost.style.transformOrigin = 'top center';
      const cardHeight = cartCard.offsetHeight;
      const heightDiff = cardHeight * (1 - scale);
      cartHost.style.marginBottom = `-${heightDiff}px`;
    }
  }

  // 3. Ajuste proporcional de la Cartilla OMR Interactiva (Rama 3 Modo A: Solo Cartilla)
  const keysCartViewport = document.getElementById('r3-keys-cartilla-viewport');
  const keysCartHost = document.getElementById('r3-keys-cartilla-render-host');
  const keysCartCard = keysCartHost ? keysCartHost.firstElementChild : null;
  if (keysCartViewport && keysCartHost && keysCartCard) {
    keysCartHost.style.transform = 'none';
    keysCartHost.style.marginBottom = '0px';

    const availWidth = keysCartViewport.clientWidth - 28;
    const cardWidth = keysCartCard.offsetWidth;

    if (cardWidth > 0 && availWidth > 0 && cardWidth > availWidth) {
      const scale = availWidth / cardWidth;
      keysCartHost.style.transform = `scale(${scale})`;
      keysCartHost.style.transformOrigin = 'top center';
      const cardHeight = keysCartCard.offsetHeight;
      const heightDiff = cardHeight * (1 - scale);
      keysCartHost.style.marginBottom = `-${heightDiff}px`;
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    fitSimCardToViewport();
    fitRama3ToViewport();
  });
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

// ── CONTROLADOR DEL MODAL DE SELECCIÓN / REDACCIÓN ──
function openSimQuestionPicker(slotIdx) {
  currentSimSlotScope = 'sim';
  currentSimSlot = slotIdx;
  const modal = document.getElementById('modal-sim-picker');
  const title = document.getElementById('sim-picker-title');
  const gradeTag = document.getElementById('sim-picker-grade-tag');
  if (!modal) return;

  const g = gradoDelSalonSeleccionado();
  if (title) title.textContent = `Configurar Pregunta ${slotIdx + 1}`;
  if (gradeTag) gradeTag.textContent = g.texto || 'Sin grado asignado';

  // Mostrar u ocultar sección IA según la rama
  const aiSection = document.getElementById('sim-new-ai-section');
  if (aiSection) {
    aiSection.style.display = (simState.branch === 'rama1') ? 'block' : 'none';
  }

  // Alternativas vs respuesta escrita
  const optWrap = document.getElementById('sim-new-options-wrap');
  const freeWrap = document.getElementById('sim-new-free-wrap');
  if (optWrap && freeWrap) {
    optWrap.style.display = (simState.type === 'mc') ? 'block' : 'none';
    freeWrap.style.display = (simState.type === 'free') ? 'block' : 'none';
  }

  // Pre-cargar valores si el slot ya tenía contenido
  const curQ = simState.questions[slotIdx];
  const taPrompt = document.getElementById('sim-new-prompt');
  if (taPrompt) taPrompt.value = curQ?.prompt || '';
  ['a', 'b', 'c', 'd'].forEach(lettr => {
    const inp = document.getElementById('sim-opt-' + lettr);
    if (inp) inp.value = (curQ?.options && curQ.options[lettr.toUpperCase()]) || '';
  });
  if (curQ?.correct) {
    const rad = document.getElementById('sim-rad-' + curQ.correct.toLowerCase());
    if (rad) rad.checked = true;
  }
  const inpFree = document.getElementById('sim-new-free-ans');
  if (inpFree) inpFree.value = curQ?.expectedAnswer || '';

  simCurrentRubric = curQ?.rubric || null;
  const aiStatus = document.getElementById('sim-ai-status');
  if (aiStatus) {
    aiStatus.textContent = simCurrentRubric ? '✅ Rúbrica de IA lista' : '';
    aiStatus.style.color = simCurrentRubric ? '#4ade80' : '#a5b4fc';
  }

  setSimPickerTab('bank');
  renderSimBankList();

  modal.style.display = 'flex';
}

function closeSimPicker() {
  const modal = document.getElementById('modal-sim-picker');
  if (modal) modal.style.display = 'none';
}

function setSimPickerTab(tab) {
  simPickerActiveTab = tab;
  const tabBank = document.getElementById('sim-tab-bank');
  const tabNew = document.getElementById('sim-tab-new');
  const paneBank = document.getElementById('sim-pane-bank');
  const paneNew = document.getElementById('sim-pane-new');

  if (tab === 'bank') {
    if (tabBank) {
      tabBank.style.color = '#0284c7';
      tabBank.style.borderBottomColor = '#0284c7';
      tabBank.style.fontWeight = '800';
    }
    if (tabNew) {
      tabNew.style.color = '#645547';
      tabNew.style.borderBottomColor = 'transparent';
      tabNew.style.fontWeight = '700';
    }
    if (paneBank) paneBank.style.display = 'flex';
    if (paneNew) paneNew.style.display = 'none';
  } else {
    if (tabNew) {
      tabNew.style.color = '#0284c7';
      tabNew.style.borderBottomColor = '#0284c7';
      tabNew.style.fontWeight = '800';
    }
    if (tabBank) {
      tabBank.style.color = '#645547';
      tabBank.style.borderBottomColor = 'transparent';
      tabBank.style.fontWeight = '700';
    }
    if (paneBank) paneBank.style.display = 'none';
    if (paneNew) paneNew.style.display = 'flex';
  }
}

function renderSimBankList() {
  const listEl = document.getElementById('sim-bank-list');
  const emptyEl = document.getElementById('sim-bank-empty');
  const countEl = document.getElementById('sim-bank-count');
  if (!listEl) return;
  listEl.innerHTML = '';

  const g = gradoDelSalonSeleccionado();
  const bankList = (typeof ClassroomData !== 'undefined' && ClassroomData.getIndividualMCQuestions && g?.stage && g?.level)
    ? ClassroomData.getIndividualMCQuestions(g.stage, g.level)
    : [];

  if (countEl) countEl.textContent = bankList.length;

  if (bankList.length === 0) {
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  bankList.forEach((q, idx) => {
    const item = document.createElement('div');
    item.style.cssText = 'background:#FFFFFF; border:1.5px solid rgba(43, 33, 24, 0.14); border-radius:12px; padding:12px 14px; display:flex; flex-direction:column; gap:8px; box-shadow:0 2px 6px rgba(43, 33, 24, 0.04);';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:8px;';

    const hasRubric = !!(q.hasRubric || q.rubric);
    const badgeHtml = hasRubric
      ? '<span style="background:#F3E8FF; color:#6B21A8; border:1px solid #C084FC; font-size:0.68rem; font-weight:800; padding:2px 8px; border-radius:6px;">🤖 Con Rúbrica IA</span>'
      : '<span style="background:#DCFCE7; color:#15803D; border:1px solid #86EFAC; font-size:0.68rem; font-weight:800; padding:2px 8px; border-radius:6px;">⚡ Pregunta Rápida</span>';

    header.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        ${badgeHtml}
        <span style="font-size:0.82rem; font-weight:800; color:#2B2118;">Opción ${idx + 1}</span>
      </div>
    `;

    const btnSelect = document.createElement('button');
    btnSelect.type = 'button';
    btnSelect.textContent = '✓ Seleccionar';
    btnSelect.style.cssText = 'background:#0284C7; border:none; color:#FFFFFF; border-radius:8px; padding:6px 14px; font-size:0.78rem; font-weight:800; cursor:pointer; box-shadow:0 2px 6px rgba(2, 132, 199, 0.25); transition:all 0.15s;';
    btnSelect.onclick = () => selectSimBankQuestion(q);
    header.appendChild(btnSelect);

    const promptText = document.createElement('div');
    promptText.style.cssText = 'font-size:0.85rem; color:#2B2118; font-weight:700; line-height:1.45;';
    promptText.textContent = q.prompt;

    const optsGrid = document.createElement('div');
    optsGrid.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:0.76rem;';
    ['A', 'B', 'C', 'D'].forEach(letter => {
      const isCorrect = (q.correct || 'A').toUpperCase() === letter;
      const optVal = q.options ? q.options[letter] : '';
      const optDiv = document.createElement('div');
      optDiv.style.cssText = isCorrect
        ? 'color:#15803D; font-weight:800; background:#DCFCE7; padding:5px 9px; border-radius:7px; border:1.5px solid #86EFAC;'
        : 'color:#4B3A2C; font-weight:600; padding:5px 9px; background:#F8F6F0; border-radius:7px; border:1px solid rgba(43, 33, 24, 0.12);';
      optDiv.textContent = `${letter}) ${optVal || '—'}` + (isCorrect ? ' ✓' : '');
      optsGrid.appendChild(optDiv);
    });

    item.appendChild(header);
    item.appendChild(promptText);
    item.appendChild(optsGrid);
    listEl.appendChild(item);
  });
}

function selectSimBankQuestion(q) {
  if (currentSimSlotScope === 'rama3') {
    r3State.bankQuestions[currentSimSlot] = {
      id: q.id,
      prompt: q.prompt,
      options: q.options ? { ...q.options } : { A: '', B: '', C: '', D: '' },
      correct: q.correct || 'A',
      expectedAnswer: q.expectedAnswer || q.correct || 'A',
      rubric: null,
      hasRubric: false
    };
    r3State.keys[currentSimSlot] = q.correct || 'A';
    closeSimPicker();
    renderRama3Exam();
    renderRama3CartillaPreview();
    if (typeof showToast === 'function') {
      showToast(`✓ Pregunta ${currentSimSlot + 1} asignada al examen.`);
    }
    return;
  }

  if (simState.branch === 'rama1' && !q.hasRubric && !q.rubric) {
    if (typeof showToast === 'function') {
      showToast('⚠️ Para Formativa con IA la pregunta requiere análisis y rúbrica pedagógica.');
    }
  }

  simState.questions[currentSimSlot] = {
    id: q.id,
    prompt: q.prompt,
    options: q.options ? { ...q.options } : { A: '', B: '', C: '', D: '' },
    correct: q.correct || 'A',
    expectedAnswer: q.expectedAnswer || q.correct || 'A',
    rubric: q.rubric || null,
    hasRubric: !!(q.hasRubric || q.rubric)
  };

  closeSimPicker();
  renderSimulatedCard();
  if (typeof showToast === 'function') {
    showToast(`✓ Pregunta ${currentSimSlot + 1} asignada.`);
  }
}

async function handleSimAnalyzeAI() {
  const prompt = (document.getElementById('sim-new-prompt')?.value || '').trim();
  if (!prompt) {
    if (typeof showToast === 'function') showToast('⚠️ Escribe el enunciado primero.');
    return;
  }

  const g = gradoDelSalonSeleccionado();
  const btn = document.getElementById('sim-btn-analyze-ai');
  const statusEl = document.getElementById('sim-ai-status');

  const origText = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Analizando con Gemini (~20 seg)...';
  }
  if (statusEl) {
    statusEl.textContent = 'Calculando solución canónica y rúbrica...';
    statusEl.style.color = '#f59e0b';
  }

  try {
    const res = await SupabaseClient.generateRubric({ prompt: prompt, grado: g.texto || '4° de primaria' });
    if (res && res.ok && res.rubrica) {
      simCurrentRubric = res.rubrica;
      if (statusEl) {
        statusEl.textContent = '✅ Análisis completado con éxito';
        statusEl.style.color = '#4ade80';
      }
      if (typeof showToast === 'function') showToast('✓ Rúbrica pedagógica generada por IA');
    } else {
      const err = (res && res.error) || 'No se pudo generar la rúbrica.';
      if (statusEl) {
        statusEl.textContent = '❌ Error al analizar con IA';
        statusEl.style.color = '#ef4444';
      }
      if (typeof showToast === 'function') showToast('⚠️ Error: ' + err);
    }
  } catch (e) {
    if (statusEl) {
      statusEl.textContent = '❌ Error de conexión';
      statusEl.style.color = '#ef4444';
    }
    if (typeof showToast === 'function') showToast('⚠️ Error: ' + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = origText;
    }
  }
}

function saveSimCustomQuestion() {
  const prompt = (document.getElementById('sim-new-prompt')?.value || '').trim();
  if (!prompt) {
    if (typeof showToast === 'function') showToast('⚠️ Escribe el enunciado de la pregunta.');
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
    expectedAnswer = (document.getElementById('sim-new-free-ans')?.value || '').trim() || optA || prompt;
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
    options: { A: optA, B: optB, C: optC, D: optD },
    correct: correctKey,
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
      title: 'Pregunta de evaluación',
      type: isFree ? 'free' : 'mc',
      questionCount: 1,
      prompt: prompt,
      expectedAnswer: expectedAnswer,
      options: newQ.options,
      correct: correctKey,
      rubric: simCurrentRubric || null,
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
      title: 'Pregunta de evaluación',
      rubric: simCurrentRubric || null,
      gradeStage: g?.stage,
      gradeLevel: g?.level,
      gradeText: g?.texto,
      type: isFree ? 'free' : 'mc',
      questionCount: 1,
      questions: [newQ]
    }).catch(e => console.warn('[Sim] Error al sincronizar pregunta en Supabase:', e && e.message));
  }

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
  window.handleSimAnalyzeAI = handleSimAnalyzeAI;
  window.saveSimCustomQuestion = saveSimCustomQuestion;
  window.buildSimulatorEvaluation = buildSimulatorEvaluation;
  window.confirmSimulator = confirmSimulator;
  window.confirmSimAndPrint = confirmSimAndPrint;
  if (typeof fitRama3ToViewport === 'function') {
    window.fitRama3ToViewport = fitRama3ToViewport;
  }
}
