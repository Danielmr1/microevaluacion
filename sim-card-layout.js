// =============================================================================
// sim-card-layout.js — Microevaluación
// MÓDULO: ESTADO Y GEOMETRÍA DIMENSIONAL DEL SIMULADOR WYSIWYG
//
// Guardarraíles activos:
//   Regla 14 – Geometría Visual Estricta y Validación Dimensional Real:
//              A6 H: 132x89mm | A6 V: 89x132mm | A5 H: 186x134mm | A5 V: 132x182mm (±1mm)
// =============================================================================

var currentBranchMode = "rama1";
if (typeof window !== "undefined") window.currentBranchMode = currentBranchMode;

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


// Estado reactivo del simulador
var simState = {
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

var currentSimSlot = 0;
var currentSimSlotScope = "sim";
var simCurrentRubric = null;
var simPickerActiveTab = "bank";

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


// Exposición global
if (typeof window !== "undefined") {
  window.currentBranchMode = currentBranchMode;
  window.selectBranchMode = selectBranchMode;
  window.simState = simState;
  window.currentSimSlot = currentSimSlot;
  window.currentSimSlotScope = currentSimSlotScope;
  window.simCurrentRubric = simCurrentRubric;
  window.simPickerActiveTab = simPickerActiveTab;
  window.determineCardLayout = determineCardLayout;
  window.stepSimGridStage = stepSimGridStage;
  window.setSimCount = setSimCount;
  window.setSimType = setSimType;
  window.toggleSimGrid = toggleSimGrid;
  window.setSimGrid = setSimGrid;
  window.fitSimCardToViewport = fitSimCardToViewport;
  window.fitRama3ToViewport = fitRama3ToViewport;
}
