// =============================================================================
// sim-card-picker.js — Microevaluación
// MÓDULO: MODAL SELECTOR DE PREGUNTAS DEL SIMULADOR Y POPOVERS KATEX
// =============================================================================

let simBankExpandedRubricQuestionId = null;
let simBankGeneratingOptsQuestionId = null;
let simBankGeneratingOptsState = null;

function toggleSimBankQuestionRubric(qId) {
  if (simBankExpandedRubricQuestionId && String(simBankExpandedRubricQuestionId) === String(qId)) {
    simBankExpandedRubricQuestionId = null;
  } else {
    simBankExpandedRubricQuestionId = qId;
    simBankGeneratingOptsQuestionId = null;
    simBankGeneratingOptsState = null;
  }
  renderSimBankList();
}
window.toggleSimBankQuestionRubric = toggleSimBankQuestionRubric;

function startSimGeneratingOptions(q) {
  if (!q) return;
  const expAns = String(q.expectedAnswer || '').trim().substring(0, 10);
  simBankGeneratingOptsQuestionId = q.id;
  simBankExpandedRubricQuestionId = null;
  simBankGeneratingOptsState = {
    questionId: q.id,
    prompt: q.prompt,
    expectedAnswer: expAns,
    correct: 'A',
    options: {
      A: expAns,
      B: '',
      C: '',
      D: ''
    },
    selectedSwapKey: null
  };
  renderSimBankList();
}
window.startSimGeneratingOptions = startSimGeneratingOptions;

function cancelSimGeneratingOptions() {
  simBankGeneratingOptsQuestionId = null;
  simBankGeneratingOptsState = null;
  renderSimBankList();
}
window.cancelSimGeneratingOptions = cancelSimGeneratingOptions;

function syncSimOptsInputsToState() {
  if (!simBankGeneratingOptsState) return;
  const s = simBankGeneratingOptsState;
  ['A', 'B', 'C', 'D'].forEach(letter => {
    if (letter !== s.correct) {
      const inp = document.querySelector(`.sim-gen-opt-input[data-letter="${letter}"]`);
      if (inp) {
        s.options[letter] = inp.value.trim().substring(0, 10);
      }
    }
  });
}

function executeSimSwap(sourceLetter, targetLetter) {
  if (!simBankGeneratingOptsState) return;
  syncSimOptsInputsToState();
  const s = simBankGeneratingOptsState;
  const valSource = s.options[sourceLetter] || '';
  const valTarget = s.options[targetLetter] || '';
  s.options[sourceLetter] = valTarget;
  s.options[targetLetter] = valSource;

  if (s.correct === sourceLetter) {
    s.correct = targetLetter;
  } else if (s.correct === targetLetter) {
    s.correct = sourceLetter;
  }
  renderSimBankList();
}
window.executeSimSwap = executeSimSwap;

function saveAndAssignSimGeneratedOptions(q) {
  if (!simBankGeneratingOptsState) return;
  syncSimOptsInputsToState();
  const s = simBankGeneratingOptsState;
  const optA = (s.options?.A || '').trim().substring(0, 10);
  const optB = (s.options?.B || '').trim().substring(0, 10);
  const optC = (s.options?.C || '').trim().substring(0, 10);
  const optD = (s.options?.D || '').trim().substring(0, 10);

  if (!optA || !optB || !optC || !optD) {
    if (typeof showToast === 'function') {
      showToast('⚠️ Completa las 4 alternativas (A, B, C, D).');
    }
    return;
  }

  // Actualizar en el banco de evaluaciones
  const baseEvalId = String(q.id).replace(/_q\d+$/, '');
  let ev = (typeof ClassroomData !== 'undefined' && ClassroomData.getEvaluation) ? ClassroomData.getEvaluation(baseEvalId) : null;
  if (!ev && typeof ClassroomData !== 'undefined' && ClassroomData.EVALUATIONS) {
    ev = ClassroomData.EVALUATIONS[baseEvalId] || ClassroomData.EVALUATIONS[q.id];
    if (!ev) {
      const all = Object.values(ClassroomData.EVALUATIONS);
      ev = all.find(item => item && item.prompt === q.prompt);
    }
  }

  const updatedOptions = { A: optA, B: optB, C: optC, D: optD };
  const updatedCorrect = s.correct;
  const expectedAns = updatedOptions[updatedCorrect];

  if (ev) {
    ev.type = 'mc';
    ev.questionCount = 1;
    ev.options = updatedOptions;
    ev.correct = updatedCorrect;
    ev.expectedAnswer = expectedAns;

    ev.options = updatedOptions;
    ev.correct = updatedCorrect;
    ev.type = 'mc';
    ev.expectedAnswer = expectedAns;

    if (Array.isArray(ev.questions) && ev.questions.length > 0) {
      ev.questions[0].options = updatedOptions;
      ev.questions[0].correct = updatedCorrect;
      ev.questions[0].expectedAnswer = expectedAns;
    } else {
      ev.questions = [{
        id: 'q_' + Date.now(),
        prompt: ev.prompt,
        options: updatedOptions,
        correct: updatedCorrect,
        expectedAnswer: expectedAns,
        rubric: ev.rubric || null,
        hasRubric: !!ev.rubric,
        gradeStage: ev.gradeStage,
        gradeLevel: ev.gradeLevel,
        gradeText: ev.gradeText
      }];
    }

    if (typeof ClassroomData !== 'undefined' && ClassroomData.saveCustomEvaluation) {
      ClassroomData.saveCustomEvaluation(ev);
    }
    if (typeof SupabaseClient !== 'undefined' && SupabaseClient.saveEvaluation) {
      SupabaseClient.saveEvaluation(ev).catch(e => console.warn('[Sim Gen Options Cloud]', e));
    }
  }

  const assignedQ = {
    id: q.id,
    prompt: q.prompt,
    options: updatedOptions,
    correct: updatedCorrect,
    expectedAnswer: expectedAns,
    rubric: q.rubric || null,
    hasRubric: !!(q.hasRubric || q.rubric)
  };

  simBankGeneratingOptsQuestionId = null;
  simBankGeneratingOptsState = null;

  if (currentSimSlotScope === 'rama3') {
    if (typeof r3State !== 'undefined') {
      r3State.bankQuestions[currentSimSlot] = assignedQ;
      r3State.keys[currentSimSlot] = updatedCorrect;
    }
    closeSimPicker();
    if (typeof renderRama3Exam === 'function') renderRama3Exam();
    if (typeof renderRama3CartillaPreview === 'function') renderRama3CartillaPreview();
    if (typeof showToast === 'function') {
      showToast(`✓ Pregunta ${currentSimSlot + 1} guardada con alternativas y asignada al examen.`);
    }
    return;
  }

  // Formativa con IA
  const isRama1 = (currentBranchMode === 'rama1' || (typeof simState !== 'undefined' && simState && simState.branch === 'rama1'));
  const isOMRMode = isRama1 && simState && simState.type === 'mc';
  const lacksRubric = !assignedQ.hasRubric && !assignedQ.rubric;

  // REGLA: Si estamos en Formativa con IA + OMR y la pregunta aún NO tiene rúbrica (Paso 1 completado):
  // No se asigna todavía a la ficha; se guarda en el banco y pasa al Paso 2 (Generar Rúbrica con IA).
  if (isRama1 && isOMRMode && lacksRubric) {
    if (typeof renderSimBankList === 'function') renderSimBankList();
    if (typeof showToast === 'function') {
      showToast('✓ Alternativas guardadas (Paso 1). Ahora genera la rúbrica IA con Gemini (Paso 2).');
    }
    return;
  }

  simState.questions[currentSimSlot] = assignedQ;
  closeSimPicker();
  if (typeof renderSimulatedCard === 'function') renderSimulatedCard();
  if (typeof showToast === 'function') {
    showToast(`✓ Pregunta ${currentSimSlot + 1} guardada con alternativas y asignada a la ficha.`);
  }
}
window.saveAndAssignSimGeneratedOptions = saveAndAssignSimGeneratedOptions;

function buildSimInlineOptionsGenerator(q) {
  const container = document.createElement('div');
  container.className = 'sim-inline-opts-gen-container';
  container.style.cssText = 'display:flex; flex-direction:column; gap:10px; margin-top:6px; padding:12px; background:#FAF8F5; border:1.5px dashed #0284C7; border-radius:10px;';

  const state = simBankGeneratingOptsState;
  if (!state) return container;

  // 1. Instrucción
  const hintNotice = document.createElement('div');
  hintNotice.style.cssText = 'font-size:0.72rem; color:#0369A1; background:#E0F2FE; border:1px solid #BAE6FD; border-radius:7px; padding:6px 10px; display:flex; align-items:center; gap:6px;';
  hintNotice.innerHTML = `
    <span style="font-size:0.85rem;">💡</span>
    <span><strong>Respuesta esperada fija en la clave:</strong> Escribe los 3 distractores (máx 10 caracteres). Haz clic en una alternativa y luego en otra para <strong>intercambiar su lugar</strong>.</span>
  `;
  container.appendChild(hintNotice);

  // 2. Grilla 2x2
  const gridEl = document.createElement('div');
  gridEl.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:8px;';

  ['A', 'B', 'C', 'D'].forEach(letter => {
    const isCorrect = (letter === state.correct);
    const isSelected = (state.selectedSwapKey === letter);
    const val = state.options ? (state.options[letter] || '') : '';

    const optCard = document.createElement('div');
    optCard.className = 'sim-gen-opt-card';
    optCard.dataset.letter = letter;
    optCard.style.cssText = [
      'display:flex',
      'align-items:center',
      'justify-content:space-between',
      'padding:7px 10px',
      'border-radius:8px',
      'cursor:pointer',
      'user-select:none',
      'transition:all 0.15s ease',
      'box-sizing:border-box',
      isCorrect
        ? 'background:#F0FDF4; border:1.8px solid #10B981; box-shadow:0 1px 4px rgba(16,185,129,0.18);'
        : 'background:#FFFFFF; border:1.2px solid #CBD5E1;',
      isSelected ? 'outline:2.5px dashed #0284C7; transform:scale(1.02);' : ''
    ].join(';');

    optCard.onclick = (e) => {
      if (e.target.tagName === 'INPUT') return;
      syncSimOptsInputsToState();
      if (!state.selectedSwapKey) {
        state.selectedSwapKey = letter;
        renderSimBankList();
      } else if (state.selectedSwapKey === letter) {
        state.selectedSwapKey = null;
        renderSimBankList();
      } else {
        const src = state.selectedSwapKey;
        state.selectedSwapKey = null;
        executeSimSwap(src, letter);
      }
    };

    const leftCol = document.createElement('div');
    leftCol.style.cssText = 'display:flex; align-items:center; gap:6px; min-width:0; flex:1; margin-right:4px;';

    const badgeLetter = document.createElement('span');
    badgeLetter.style.cssText = `display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; min-width:22px; border-radius:50%; font-weight:900; font-size:0.75rem; background:${isCorrect ? '#10B981' : '#E2E8F0'}; color:${isCorrect ? '#FFFFFF' : '#334155'};`;
    badgeLetter.textContent = letter;
    leftCol.appendChild(badgeLetter);

    if (isCorrect) {
      const correctText = document.createElement('span');
      correctText.style.cssText = 'font-size:0.84rem; font-weight:800; color:#065F46; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1;';
      correctText.textContent = val;
      correctText.title = 'Respuesta Esperada (Valor inmutable)';
      leftCol.appendChild(correctText);

      const keyBadge = document.createElement('span');
      keyBadge.style.cssText = 'font-size:0.65rem; font-weight:900; color:#15803D; background:#DCFCE7; border:1px solid #86EFAC; padding:2px 6px; border-radius:4px; flex-shrink:0; white-space:nowrap;';
      keyBadge.textContent = '✓ Clave';
      optCard.appendChild(leftCol);
      optCard.appendChild(keyBadge);
    } else {
      const inputDistractor = document.createElement('input');
      inputDistractor.type = 'text';
      inputDistractor.className = 'sim-gen-opt-input form-control';
      inputDistractor.dataset.letter = letter;
      inputDistractor.maxLength = 10;
      inputDistractor.value = val;
      inputDistractor.placeholder = `Alternativa ${letter}`;
      inputDistractor.style.cssText = 'font-size:0.80rem; padding:4px 6px; flex:1; min-width:0; background:#FFFFFF; border:1px solid #CBD5E1; border-radius:5px; color:#0f172a; font-weight:600;';
      inputDistractor.oninput = (e) => {
        state.options[letter] = e.target.value.substring(0, 10);
      };
      inputDistractor.onclick = (e) => e.stopPropagation();
      leftCol.appendChild(inputDistractor);

      const swapHintBtn = document.createElement('button');
      swapHintBtn.type = 'button';
      swapHintBtn.title = 'Toca para intercambiar lugar';
      swapHintBtn.style.cssText = 'background:transparent; border:none; color:#94A3B8; font-size:0.85rem; cursor:pointer; padding:2px; flex-shrink:0; line-height:1;';
      swapHintBtn.innerHTML = '⠿';
      optCard.appendChild(leftCol);
      optCard.appendChild(swapHintBtn);
    }

    gridEl.appendChild(optCard);
  });

  container.appendChild(gridEl);

  // 3. Fila de Acciones
  const actionsRow = document.createElement('div');
  actionsRow.style.cssText = 'display:flex; justify-content:flex-end; gap:8px; margin-top:4px;';

  const btnCancel = document.createElement('button');
  btnCancel.type = 'button';
  btnCancel.textContent = 'Cancelar';
  btnCancel.style.cssText = 'background:#FFFFFF; border:1px solid #CBD5E1; color:#475569; border-radius:7px; padding:6px 12px; font-size:0.75rem; font-weight:700; cursor:pointer; transition:all 0.15s;';
  btnCancel.onclick = (e) => {
    e.stopPropagation();
    cancelSimGeneratingOptions();
  };
  actionsRow.appendChild(btnCancel);

  const btnSave = document.createElement('button');
  btnSave.type = 'button';
  btnSave.className = 'sim-btn-save-generated-opts';
  const isRama1 = (currentBranchMode === 'rama1' || (typeof simState !== 'undefined' && simState && simState.branch === 'rama1'));
  const isOMRMode = (isRama1 && simState && simState.type === 'mc') || (currentSimSlotScope === 'rama3' && typeof r3State !== 'undefined' && r3State.mode === 'bank');
  const lacksRubric = isRama1 && !q.hasRubric && !q.rubric;

  if (isRama1 && isOMRMode && lacksRubric) {
    btnSave.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg><span>💾 Guardar alternativas (Paso 1 de 2)</span>';
  } else {
    btnSave.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg><span>💾 Guardar y Asignar a la Ficha</span>';
  }
  btnSave.style.cssText = 'background:#16A34A; color:#FFFFFF; border:none; border-radius:7px; padding:6px 14px; font-size:0.78rem; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:6px; box-shadow:0 2px 6px rgba(22,163,74,0.3); transition:all 0.15s;';
  btnSave.onclick = (e) => {
    e.stopPropagation();
    saveAndAssignSimGeneratedOptions(q);
  };
  actionsRow.appendChild(btnSave);

  container.appendChild(actionsRow);
  return container;
}

// ── CONTROLADOR DEL MODAL DE SELECCIÓN / REDACCIÓN ──
function openSimQuestionPicker(slotIdx) {
  currentSimSlotScope = 'sim';
  currentSimSlot = slotIdx;
  simBankExpandedRubricQuestionId = null;
  simBankGeneratingOptsQuestionId = null;
  simBankGeneratingOptsState = null;
  const modal = document.getElementById('modal-sim-picker');
  const title = document.getElementById('sim-picker-title');
  const gradeTag = document.getElementById('sim-picker-grade-tag');
  if (!modal) return;

  const g = gradoDelSalonSeleccionado();
  if (title) title.textContent = `Configurar Pregunta ${slotIdx + 1}`;
  if (gradeTag) {
    let tagText = g.texto || 'Sin grado asignado';
    if (g?.level && g?.stage) {
      const stageName = (String(g.stage).toLowerCase().includes('sec')) ? 'Secundaria' : 'Primaria';
      tagText = `${g.level}° ${stageName}`;
    }
    gradeTag.textContent = tagText;
  }

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

  const summaryBox = document.getElementById('sim-rubric-summary-box');
  if (summaryBox) {
    summaryBox.style.display = 'none';
    summaryBox.innerHTML = '';
  }

  const formFields = document.getElementById('sim-new-form-fields');
  const consolidatedCard = document.getElementById('sim-new-consolidated-card');
  if (formFields) formFields.style.display = 'flex';
  if (consolidatedCard) consolidatedCard.style.display = 'none';

  const btnSave = document.getElementById('sim-btn-save-custom');
  if (btnSave) {
    if (simState.branch === 'rama1') {
      if (simCurrentRubric) {
        btnSave.disabled = false;
        btnSave.style.background = '#0284C7';
        btnSave.style.cursor = 'pointer';
        btnSave.innerHTML = '✓ Guardar pregunta y Asignar a la Ficha';
      } else {
        btnSave.disabled = true;
        btnSave.style.background = '#94a3b8';
        btnSave.style.cursor = 'not-allowed';
        btnSave.innerHTML = '🔒 Guardar pregunta y Asignar a la Ficha';
      }
    } else {
      btnSave.disabled = false;
      btnSave.style.background = '#0284C7';
      btnSave.style.cursor = 'pointer';
      btnSave.innerHTML = '💾 Guardar pregunta y Asignar a la Ficha';
    }
  }

  setSimPickerTab('bank');
  closeMathPopovers();
  renderSimBankList();
  updateSimPromptCounter();

  // Sincronización en segundo plano con Supabase para reflejar cambios entre dispositivos
  if (typeof SupabaseClient !== 'undefined' && SupabaseClient.loadRecentEvaluations) {
    SupabaseClient.loadRecentEvaluations().then(recent => {
      if (recent && typeof ClassroomData !== 'undefined' && ClassroomData.setRecentEvaluations) {
        ClassroomData.setRecentEvaluations(recent);
        renderSimBankList();
      }
    }).catch(e => console.warn('[Sim Picker Sync Cloud]', e));
  }

  modal.style.display = 'flex';
}

function closeSimPicker() {
  const modal = document.getElementById('modal-sim-picker');
  if (modal) modal.style.display = 'none';
  closeMathPopovers();
  simBankExpandedRubricQuestionId = null;
  simBankGeneratingOptsQuestionId = null;
  simBankGeneratingOptsState = null;
}

function updateSimPromptCounter() {
  const ta = document.getElementById('sim-new-prompt');
  const counter = document.getElementById('sim-prompt-counter');
  const hint = document.getElementById('sim-prompt-hint');
  const livePreview = document.getElementById('sim-prompt-live-preview');
  const liveContent = document.getElementById('sim-prompt-live-preview-content');
  if (!ta) return;

  const hasFracFn = typeof hasFractions === 'function' ? hasFractions : (t => /\\frac\{|\[frac:|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|\b\d+\s*\/\s*\d+\b/.test(t));
  const withFrac = hasFracFn(ta.value || '');
  const maxChars = withFrac ? 105 : 160;
  ta.setAttribute('maxlength', String(maxChars));

  const len = (ta.value || '').length;
  const charsPerLine = 52;
  const lines = Math.max(1, Math.ceil(len / charsPerLine));
  const maxLines = withFrac ? 2 : 3;

  if (counter) {
    counter.textContent = len + ' / ' + maxChars;
    counter.style.color = len >= maxChars ? '#D97706' : '#645547';
  }
  if (hint) {
    if (len > maxChars || lines > maxLines) {
      hint.textContent = '⚠️ ' + lines + ' líneas: no entran en la ficha. Acorta el enunciado.';
      hint.style.color = '#ef4444';
    } else {
      hint.textContent = '';
    }
  }

  // Vista previa visual en vivo del enunciado maquetado
  if (livePreview && liveContent) {
    const rawVal = (ta.value || '').trim();
    if (rawVal) {
      livePreview.style.display = 'block';
      const escapeFn = (typeof escaparHtml === 'function') ? escaparHtml : (t => t);
      const formatFn = (typeof formatMathHtml === 'function') ? formatMathHtml : (t => t);
      liveContent.innerHTML = formatFn(escapeFn(rawVal));
    } else {
      livePreview.style.display = 'none';
      liveContent.innerHTML = '';
    }
  }
}
window.updateSimPromptCounter = updateSimPromptCounter;

// ── ASISTENTE DE ESTRUCTURAS MATEMÁTICAS TIPO WORD (FRAC, SQRT, EXP) ──
function toggleMathPopover(type, scope) {
  const isBM = (scope === 'bm');
  const prefix = isBM ? 'bm-' : 'sim-';
  const popFrac = document.getElementById(prefix + 'math-popover-frac');
  const popSqrt = document.getElementById(prefix + 'math-popover-sqrt');
  const popExp = document.getElementById(prefix + 'math-popover-exp');

  const target = (type === 'frac') ? popFrac : (type === 'sqrt') ? popSqrt : popExp;
  const isCurrentlyOpen = target && target.style.display === 'flex';

  if (popFrac) popFrac.style.display = 'none';
  if (popSqrt) popSqrt.style.display = 'none';
  if (popExp) popExp.style.display = 'none';

  if (!isCurrentlyOpen && target) {
    target.style.display = 'flex';

    // Obtener posible texto seleccionado en el textarea
    const ta = isBM ? document.getElementById('bm-prompt') : document.getElementById('sim-new-prompt');
    let sel = '';
    if (ta && ta.selectionStart != null && ta.selectionEnd != null && ta.selectionStart !== ta.selectionEnd) {
      sel = ta.value.substring(ta.selectionStart, ta.selectionEnd).trim();
    }

    if (type === 'frac') {
      const numInput = document.getElementById(prefix + 'frac-num');
      const denInput = document.getElementById(prefix + 'frac-den');
      if (numInput && denInput) {
        if (sel.includes('/')) {
          const parts = sel.split('/');
          numInput.value = parts[0].trim();
          denInput.value = parts[1].trim();
        } else if (sel) {
          numInput.value = sel;
          denInput.value = '';
          setTimeout(() => denInput.focus(), 60);
          return;
        } else {
          numInput.value = '';
          denInput.value = '';
        }
        setTimeout(() => numInput.focus(), 60);
      }
    } else if (type === 'sqrt') {
      const radInput = document.getElementById(prefix + 'sqrt-rad');
      if (radInput) {
        radInput.value = sel || '';
        setTimeout(() => radInput.focus(), 60);
      }
    } else if (type === 'exp') {
      const baseInput = document.getElementById(prefix + 'exp-base');
      const expInput = document.getElementById(prefix + 'exp-val');
      if (baseInput && expInput) {
        if (/^\d+$/.test(sel)) {
          baseInput.value = '';
          expInput.value = sel;
        } else {
          baseInput.value = sel || '';
          expInput.value = '';
        }
        setTimeout(() => (expInput.value ? expInput.focus() : (baseInput.value ? expInput.focus() : baseInput.focus())), 60);
      }
    }
  }
}
window.toggleMathPopover = toggleMathPopover;

function closeMathPopovers(scope) {
  const prefixes = scope ? [(scope === 'bm' ? 'bm-' : 'sim-')] : ['sim-', 'bm-'];
  prefixes.forEach(prefix => {
    const popFrac = document.getElementById(prefix + 'math-popover-frac');
    const popSqrt = document.getElementById(prefix + 'math-popover-sqrt');
    const popExp = document.getElementById(prefix + 'math-popover-exp');
    if (popFrac) popFrac.style.display = 'none';
    if (popSqrt) popSqrt.style.display = 'none';
    if (popExp) popExp.style.display = 'none';
  });
}
window.closeMathPopovers = closeMathPopovers;

function insertFractionFromPopover(scope) {
  const prefix = (scope === 'bm') ? 'bm-' : 'sim-';
  const num = (document.getElementById(prefix + 'frac-num')?.value || '').trim();
  const den = (document.getElementById(prefix + 'frac-den')?.value || '').trim();
  if (!num || !den) {
    if (typeof showToast === 'function') showToast('⚠️ Ingresa el numerador y el denominador.');
    return;
  }
  const token = `\\frac{${num}}{${den}}`;
  if (typeof insertMathSymbol === 'function') {
    insertMathSymbol(token);
  }
  closeMathPopovers(scope);
}
window.insertFractionFromPopover = insertFractionFromPopover;

function insertSqrtFromPopover(scope) {
  const prefix = (scope === 'bm') ? 'bm-' : 'sim-';
  const rad = (document.getElementById(prefix + 'sqrt-rad')?.value || '').trim();
  if (!rad) {
    if (typeof showToast === 'function') showToast('⚠️ Ingresa el número bajo el radical.');
    return;
  }
  const token = `\\sqrt{${rad}}`;
  if (typeof insertMathSymbol === 'function') {
    insertMathSymbol(token);
  }
  closeMathPopovers(scope);
}
window.insertSqrtFromPopover = insertSqrtFromPopover;

function insertExpFromPopover(scope) {
  const prefix = (scope === 'bm') ? 'bm-' : 'sim-';
  const base = (document.getElementById(prefix + 'exp-base')?.value || '').trim();
  const exp = (document.getElementById(prefix + 'exp-val')?.value || '').trim();
  if (!exp) {
    if (typeof showToast === 'function') showToast('⚠️ Ingresa el exponente.');
    return;
  }
  const supMap = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻','=':'⁼','(':'⁽',')':'⁾','n':'ⁿ' };
  const allSup = exp.split('').every(ch => supMap[ch]);
  let token = '';
  if (allSup) {
    const supChars = exp.split('').map(ch => supMap[ch] || ch).join('');
    token = (base ? base : '') + supChars;
  } else {
    token = (base ? base : '') + `^{${exp}}`;
  }
  if (typeof insertMathSymbol === 'function') {
    insertMathSymbol(token);
  }
  closeMathPopovers(scope);
}
window.insertExpFromPopover = insertExpFromPopover;

function setSimPickerTab(tab) {
  if (tab === 'new') {
    if (typeof ClassroomData !== 'undefined' && ClassroomData.getBankQuestionsCount) {
      if (ClassroomData.getBankQuestionsCount() >= 50) {
        if (typeof showToast === 'function') {
          showToast('⚠️ Has alcanzado el límite máximo de 50 preguntas en tu banco. Elimina alguna pregunta que ya no utilices para poder agregar una nueva.');
        }
        return;
      }
    }
  }

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

  const isRama1 = (currentBranchMode === 'rama1' || (typeof simState !== 'undefined' && simState && simState.branch === 'rama1'));
  const isRama3Bank = (currentSimSlotScope === 'rama3' && typeof r3State !== 'undefined' && r3State.mode === 'bank');
  const isOMRMode = (simState && simState.type === 'mc') || isRama3Bank;
  const isFocusMode = !!simBankExpandedRubricQuestionId || !!simBankGeneratingOptsQuestionId;

  bankList.forEach((q, idx) => {
    const isThisExpandedRubric = (!simBankGeneratingOptsQuestionId && !!simBankExpandedRubricQuestionId && String(simBankExpandedRubricQuestionId) === String(q.id));
    const isThisGeneratingOpts = (!!simBankGeneratingOptsQuestionId && String(simBankGeneratingOptsQuestionId) === String(q.id));

    // Si estamos en modo foco y esta pregunta no es la expandida ni la que genera opciones, se oculta
    if (isFocusMode && !isThisExpandedRubric && !isThisGeneratingOpts) {
      return;
    }

    const item = document.createElement('div');
    item.dataset.questionId = q.id;
    item.style.cssText = 'background:#FFFFFF; border:1.5px solid rgba(43, 33, 24, 0.14); border-radius:12px; padding:12px 14px; display:flex; flex-direction:column; gap:8px; box-shadow:0 2px 6px rgba(43, 33, 24, 0.04);';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:8px;';

    const hasRubric = !!(q.hasRubric || q.rubric);
    const hasOptions = !!(q.options && (q.options.A || q.options.B || q.options.C || q.options.D));
    const needsOptionsGen = isOMRMode && !hasOptions;
    const isBothMissing = isRama1 && isOMRMode && !hasOptions && !hasRubric;

    const titleGroup = document.createElement('div');
    titleGroup.style.cssText = 'display:flex; align-items:center; gap:8px;';

    if (hasRubric) {
      const btnRubric = document.createElement('button');
      btnRubric.type = 'button';
      btnRubric.className = 'sim-btn-toggle-rubric';

      if (isThisExpandedRubric) {
        btnRubric.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><polyline points="18 15 12 9 6 15"></polyline></svg><span>▲ Ocultar Rúbrica</span>';
        btnRubric.style.cssText = 'background:#0284C7; color:#FFFFFF; border:1px solid #0284C7; font-size:0.75rem; font-weight:800; padding:4px 10px; border-radius:7px; cursor:pointer; display:inline-flex; align-items:center; gap:5px; transition:all 0.15s; box-shadow:0 2px 6px rgba(2,132,199,0.3);';
        btnRubric.onclick = (e) => {
          e.stopPropagation();
          toggleSimBankQuestionRubric(q.id);
        };
      } else {
        btnRubric.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg><span>Ver Rúbrica</span>';
        btnRubric.style.cssText = 'background:#F3E8FF; color:#6B21A8; border:1px solid #C084FC; font-size:0.75rem; font-weight:800; padding:4px 10px; border-radius:7px; cursor:pointer; display:inline-flex; align-items:center; gap:5px; transition:all 0.15s;';
        btnRubric.onmouseenter = () => { btnRubric.style.background = '#EDE9FE'; };
        btnRubric.onmouseleave = () => { btnRubric.style.background = '#F3E8FF'; };
        btnRubric.onclick = (e) => {
          e.stopPropagation();
          toggleSimBankQuestionRubric(q.id);
        };
      }
      titleGroup.appendChild(btnRubric);
    }
    // REGLA: Si la pregunta NO tiene rúbrica, no se agrega ningún badge de "⚡ Pregunta Rápida".
    // REGLA: Borrado "Opción 1", "Opción 2", etc.

    header.appendChild(titleGroup);

    const btnAction = document.createElement('button');
    btnAction.type = 'button';

    if (isThisGeneratingOpts) {
      btnAction.style.display = 'none';
    } else if (needsOptionsGen) {
      btnAction.className = 'sim-btn-generate-opts';
      if (isBothMissing) {
        btnAction.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg><span>1. Generar alternativas</span>';
        btnAction.title = 'Paso 1: Generar las 4 alternativas. Luego se generará la rúbrica IA con Gemini.';
      } else {
        btnAction.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg><span>Generar alternativas</span>';
        btnAction.title = 'Crear las 4 alternativas (A, B, C, D) para esta pregunta OMR';
      }
      btnAction.style.cssText = 'background:#0284C7; border:none; color:#FFFFFF; border-radius:8px; padding:6px 12px; font-size:0.76rem; font-weight:800; cursor:pointer; box-shadow:0 2px 6px rgba(2, 132, 199, 0.25); display:inline-flex; align-items:center; gap:5px; transition:all 0.15s; white-space:nowrap;';
      btnAction.onclick = (e) => {
        e.stopPropagation();
        startSimGeneratingOptions(q);
      };
    } else if (!hasRubric && isRama1) {
      // En Formativa con IA sin rúbrica: Generar Rúbrica
      btnAction.textContent = (isOMRMode && hasOptions) ? '2. ✨ Generar Rúbrica' : '✨ Generar Rúbrica';
      btnAction.style.cssText = 'background:linear-gradient(135deg, #7c3aed, #4f46e5); border:none; color:#FFFFFF; border-radius:8px; padding:6px 12px; font-size:0.76rem; font-weight:800; cursor:pointer; box-shadow:0 2px 6px rgba(124, 58, 237, 0.25); display:inline-flex; align-items:center; gap:5px; transition:all 0.15s; white-space:nowrap;';
      btnAction.title = 'Analizar este problema con Gemini para generar su solución y rúbrica';
      btnAction.onclick = () => handleUpgradeSimBankQuestion(q, btnAction, titleGroup);
    } else {
      // Tiene rúbrica O no es Rama 1: Seleccionar directamente
      btnAction.textContent = '✓ Seleccionar';
      btnAction.style.cssText = 'background:#0284C7; border:none; color:#FFFFFF; border-radius:8px; padding:6px 14px; font-size:0.78rem; font-weight:800; cursor:pointer; box-shadow:0 2px 6px rgba(2, 132, 199, 0.25); transition:all 0.15s; white-space:nowrap;';
      btnAction.onclick = () => selectSimBankQuestion(q);
    }
    header.appendChild(btnAction);
    item.appendChild(header);

    const promptText = document.createElement('div');
    promptText.style.cssText = 'font-size:0.85rem; color:#2B2118; font-weight:700; line-height:1.45;';
    promptText.innerHTML = (typeof formatMathHtml === 'function')
      ? formatMathHtml(escaparHtml(q.prompt || ''))
      : escaparHtml(q.prompt || '');
    item.appendChild(promptText);

    if (isThisGeneratingOpts) {
      const genDrawer = buildSimInlineOptionsGenerator(q);
      item.appendChild(genDrawer);
    } else if (hasOptions && isOMRMode) {
      const optsGrid = document.createElement('div');
      optsGrid.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:0.76rem;';
      ['A', 'B', 'C', 'D'].forEach(letter => {
        const isCorrect = (q.correct || 'A').toUpperCase() === letter;
        const optVal = q.options ? q.options[letter] : '';
        const optSafe = escaparHtml(optVal || '—');
        const optFormatted = (typeof formatMathHtml === 'function') ? formatMathHtml(optSafe) : optSafe;
        const optDiv = document.createElement('div');
        optDiv.style.cssText = isCorrect
          ? 'color:#15803D; font-weight:800; background:#DCFCE7; padding:5px 9px; border-radius:7px; border:1.5px solid #86EFAC;'
          : 'color:#4B3A2C; font-weight:600; padding:5px 9px; background:#F8F6F0; border-radius:7px; border:1px solid rgba(43, 33, 24, 0.12);';
        optDiv.innerHTML = `${letter}) ${optFormatted}` + (isCorrect ? ' ✓' : '');
        optsGrid.appendChild(optDiv);
      });
      item.appendChild(optsGrid);
    } else {
      let expAnsVal = q.expectedAnswer || '';
      if (hasOptions && q.correct && q.options) {
        const correctVal = q.options[q.correct] || '';
        if (correctVal) {
          expAnsVal = correctVal;
        }
      } else if (expAnsVal.startsWith('Clave:') && hasOptions && q.correct && q.options) {
        expAnsVal = q.options[q.correct] || expAnsVal;
      }
      if (!expAnsVal) expAnsVal = '—';

      const ansBox = document.createElement('div');
      ansBox.style.cssText = 'background:#F8F6F0; border:1px solid rgba(43,33,24,0.12); border-radius:7px; padding:6px 10px; font-size:0.80rem; color:#1e293b; display:flex; justify-content:space-between; align-items:center;';
      const ansSafe = escaparHtml(expAnsVal);
      const ansFormatted = (typeof formatMathHtml === 'function') ? formatMathHtml(ansSafe) : ansSafe;
      let badgeHtml = '';
      if (isBothMissing) {
        badgeHtml = '<div style="display:inline-flex; align-items:center; gap:6px;">' +
          '<span style="font-size:0.68rem; font-weight:800; color:#b45309; background:#fef3c7; border:1px solid #fde68a; padding:2px 6px; border-radius:4px;">Paso 1 de 2: Requiere alternativas y rúbrica</span>' +
          '<span style="font-size:0.68rem; font-weight:800; color:#0284c7; background:rgba(2,132,199,0.10); padding:2px 6px; border-radius:4px;">✍️ Libre</span>' +
        '</div>';
      } else if (isOMRMode) {
        badgeHtml = '<span style="font-size:0.68rem; font-weight:800; color:#0284c7; background:rgba(2,132,199,0.10); padding:2px 6px; border-radius:4px;">✍️ Libre</span>';
      }
      ansBox.innerHTML = `<span><strong>Rpta esperada:</strong> ${ansFormatted}</span>${badgeHtml}`;
      item.appendChild(ansBox);
    }

    // Si esta tarjeta está expandida, incorporar el cajón in-situ de la rúbrica hacia abajo
    if (isThisExpandedRubric) {
      const rubricDrawer = document.createElement('div');
      rubricDrawer.className = 'sim-card-inline-rubric-drawer';
      rubricDrawer.style.cssText = 'margin-top:6px;';
      if (typeof buildInlineRubricDrawerHtml === 'function') {
        rubricDrawer.innerHTML = buildInlineRubricDrawerHtml(q);
      }
      item.appendChild(rubricDrawer);
    }
    listEl.appendChild(item);
  });
}

async function handleUpgradeSimBankQuestion(q, btnEl, badgeContainer) {
  if (!q || !q.prompt) return;

  const g = (typeof gradoDelSalonSeleccionado === 'function') ? gradoDelSalonSeleccionado() : null;
  const gradoLabel = g ? (g.texto || `${g.level}° de ${g.stage}`) : (q.gradeText || '4° de primaria');

  const origBtnText = btnEl.innerHTML;
  btnEl.disabled = true;
  btnEl.innerHTML = '⏳ Analizando...';
  btnEl.style.opacity = '0.75';
  btnEl.style.cursor = 'wait';

  if (typeof showToast === 'function') {
    showToast('🤖 Consultando a Gemini para generar la rúbrica pedagógica (~20-30 seg)...');
  }

  try {
    const res = await SupabaseClient.generateRubric({
      prompt: q.prompt,
      grado: gradoLabel
    });

    if (res && res.ok && res.rubrica) {
      q.rubric = res.rubrica;
      q.hasRubric = true;

      const evFull = (typeof ClassroomData !== 'undefined' && ClassroomData.getEvaluation)
        ? (ClassroomData.getEvaluation(q.id) || q)
        : q;
      evFull.rubric = res.rubrica;
      evFull.hasRubric = true;
      if (Array.isArray(evFull.questions)) {
        evFull.questions.forEach(subQ => {
          if (subQ.prompt === q.prompt) {
            subQ.rubric = res.rubrica;
            subQ.hasRubric = true;
          }
        });
      }
      if (typeof ClassroomData !== 'undefined' && ClassroomData.saveCustomEvaluation) {
        ClassroomData.saveCustomEvaluation(evFull);
      }
      if (typeof SupabaseClient !== 'undefined' && SupabaseClient.saveEvaluation) {
        SupabaseClient.saveEvaluation(evFull).catch(e => console.warn('[Sim Upgrade Question Cloud]', e));
      }

      if (typeof renderSimBankList === 'function') {
        renderSimBankList();
      }

      if (typeof showToast === 'function') {
        showToast('✅ Rúbrica generada con éxito. Ya puedes seleccionar esta pregunta.');
      }
    } else {
      btnEl.disabled = false;
      btnEl.innerHTML = origBtnText;
      btnEl.style.opacity = '1';
      btnEl.style.cursor = 'pointer';
      const err = (res && res.error) || 'No se pudo generar la rúbrica.';
      if (typeof showToast === 'function') showToast('⚠️ Error: ' + err);
    }
  } catch (err) {
    btnEl.disabled = false;
    btnEl.innerHTML = origBtnText;
    btnEl.style.opacity = '1';
    btnEl.style.cursor = 'pointer';
    if (typeof showToast === 'function') showToast('⚠️ Error de conexión: ' + (err?.message || err));
  }
}

function selectSimBankQuestion(q) {
  if (currentSimSlotScope === 'rama3') {
    const isBank = (typeof r3State !== 'undefined' && r3State.mode === 'bank');
    const hasOptions = !!(q.options && (q.options.A || q.options.B || q.options.C || q.options.D));
    if (isBank && !hasOptions) {
      startSimGeneratingOptions(q);
      return;
    }
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
      showToast('⚠️ Para Formativa con IA debes generar la rúbrica pedagógica primero.');
    }
    return;
  }

  const isFree = (simState.type === 'free');
  const hasOpts = !!(q.options && (q.options.A || q.options.B || q.options.C || q.options.D));
  if (!isFree && !hasOpts) {
    startSimGeneratingOptions(q);
    return;
  }
  let expAns = q.expectedAnswer || '';
  if (!expAns && q.options && q.correct) {
    expAns = q.options[q.correct] || q.correct;
  }
  if (!expAns) expAns = q.correct || 'A';

  simState.questions[currentSimSlot] = {
    id: q.id,
    prompt: q.prompt,
    options: isFree ? null : (q.options ? { ...q.options } : { A: '', B: '', C: '', D: '' }),
    correct: isFree ? null : (q.correct || 'A'),
    expectedAnswer: expAns,
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
    if (typeof showToast === 'function') showToast('⚠️ Escribe el enunciado primero.');
    return;
  }

  const isMC = (simState.type === 'mc');
  const optA = (document.getElementById('sim-opt-a')?.value || '').trim().substring(0, 10);
  const optB = (document.getElementById('sim-opt-b')?.value || '').trim().substring(0, 10);
  const optC = (document.getElementById('sim-opt-c')?.value || '').trim().substring(0, 10);
  const optD = (document.getElementById('sim-opt-d')?.value || '').trim().substring(0, 10);

  if (isMC && (!optA || !optB || !optC || !optD)) {
    if (typeof showToast === 'function') showToast('⚠️ Completa las 4 alternativas (A, B, C, D) antes de generar la rúbrica.');
    return;
  }

  const g = gradoDelSalonSeleccionado();
  const btn = document.getElementById('sim-btn-analyze-ai');
  const statusEl = document.getElementById('sim-ai-status');
  const summaryBox = document.getElementById('sim-rubric-summary-box');

  const origText = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Generando rúbrica con Gemini (~20 seg)...';
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

      // Extraer solución canónica
      let canon = '';
      if (typeof res.rubrica === 'object' && res.rubrica !== null) {
        canon = res.rubrica.solucion_canonica || res.rubrica.respuesta_canonica || res.rubrica.canonico || '';
      }
      canon = String(canon || '').trim();

      // Comparación y corrección automática de la clave en alternativas
      let keyNoticeHtml = '';
      if (isMC) {
        const opts = { A: optA, B: optB, C: optC, D: optD };
        const currentSelected = document.querySelector('input[name="sim-new-correct"]:checked')?.value || 'A';

        const matchesCanonical = (optVal, canonVal) => {
          if (!optVal || !canonVal) return false;
          const clean = s => String(s).toLowerCase().replace(/^(s\/|\$|s\/\.|\s+)/g, '').replace(/[^\w\d\.\,\/]/g, '').trim();
          if (clean(optVal) === clean(canonVal)) return true;
          const m1 = String(optVal).match(/-?\d+(?:[\.,]\d+)?/);
          const m2 = String(canonVal).match(/-?\d+(?:[\.,]\d+)?/);
          return !!(m1 && m2 && m1[0] === m2[0]);
        };

        let matchingKey = null;
        for (const k of ['A', 'B', 'C', 'D']) {
          if (matchesCanonical(opts[k], canon)) {
            matchingKey = k;
            break;
          }
        }

        if (matchingKey) {
          if (matchingKey !== currentSelected) {
            const radTarget = document.getElementById('sim-rad-' + matchingKey.toLowerCase());
            if (radTarget) radTarget.checked = true;
            keyNoticeHtml = `
              <div style="background:#ecfdf5; border:1.5px solid #10b981; border-radius:8px; padding:7px 10px; margin-top:8px; font-size:0.75rem; color:#065f46; font-weight:700;">
                💡 Clave corregida automáticamente a <strong>${matchingKey}) ${escaparHtml(opts[matchingKey])}</strong> (coincidente con la solución canónica de la IA).
              </div>
            `;
            if (typeof showToast === 'function') showToast(`💡 Clave ajustada a ${matchingKey}) ${opts[matchingKey]}`);
          } else {
            keyNoticeHtml = `
              <div style="background:#f0fdf4; border:1px solid #86efac; border-radius:8px; padding:6px 10px; margin-top:8px; font-size:0.74rem; color:#166534; font-weight:700;">
                ✓ Clave correcta confirmada: <strong>${currentSelected}) ${escaparHtml(opts[currentSelected])}</strong> coincide con la solución canónica.
              </div>
            `;
          }
        } else {
          keyNoticeHtml = `
            <div style="background:#fef2f2; border:1.5px solid #ef4444; border-radius:8px; padding:7px 10px; margin-top:8px; font-size:0.75rem; color:#991b1b; font-weight:700;">
              ⚠️ La solución deducida por la IA (<strong>${escaparHtml(canon)}</strong>) no coincide con ninguna de las opciones (A, B, C, D). Revisa tus alternativas o confirma la clave correcta.
            </div>
          `;
          if (typeof showToast === 'function') showToast('⚠️ La solución de la IA no coincide con las opciones.');
        }
      }

      // Guardar automáticamente la pregunta en el Banco
      const activeCorrectKey = document.querySelector('input[name="sim-new-correct"]:checked')?.value || 'A';
      const curOpts = { A: optA, B: optB, C: optC, D: optD };
      const expAns = isMC ? (curOpts[activeCorrectKey] || canon) : (canon || prompt);

      const savedBankQ = {
        id: 'q_custom_' + Date.now(),
        prompt: prompt,
        options: curOpts,
        correct: activeCorrectKey,
        expectedAnswer: expAns,
        rubric: simCurrentRubric,
        hasRubric: true,
        gradeStage: g?.stage || null,
        gradeLevel: g?.level || null,
        gradeText: g?.texto || null
      };

      if (typeof ClassroomData !== 'undefined' && ClassroomData.saveCustomEvaluation) {
        ClassroomData.saveCustomEvaluation({
          title: 'Pregunta con rúbrica IA',
          type: isMC ? 'mc' : 'free',
          questionCount: 1,
          prompt: prompt,
          expectedAnswer: expAns,
          options: savedBankQ.options,
          correct: activeCorrectKey,
          rubric: simCurrentRubric,
          questions: [savedBankQ],
          gradeStage: g?.stage || null,
          gradeLevel: g?.level || null,
          gradeText: g?.texto || null
        });
      }

      if (typeof SupabaseClient !== 'undefined' && SupabaseClient.saveEvaluation) {
        SupabaseClient.saveEvaluation({
          prompt: prompt,
          expectedAnswer: expAns,
          title: 'Pregunta con rúbrica IA',
          rubric: simCurrentRubric,
          gradeStage: g?.stage,
          gradeLevel: g?.level,
          gradeText: g?.texto,
          type: isMC ? 'mc' : 'free',
          questionCount: 1,
          options: savedBankQ.options,
          correct: activeCorrectKey
        }).catch(err => console.warn('[SupabaseClient] Sincronización en segundo plano:', err));
      }

      // Transición al Estado Consolidado (Rama 1: Formativa con IA)
      if (simState.branch === 'rama1') {
        const formFields = document.getElementById('sim-new-form-fields');
        const consolidatedCard = document.getElementById('sim-new-consolidated-card');
        const promptEl = document.getElementById('sim-consolidated-prompt');
        const optionsEl = document.getElementById('sim-consolidated-options');
        const noticeEl = document.getElementById('sim-consolidated-key-notice');

        if (formFields) formFields.style.display = 'none';

        if (promptEl) {
          promptEl.innerHTML = (typeof formatMathHtml === 'function')
            ? formatMathHtml(escaparHtml(prompt))
            : escaparHtml(prompt);
        }

        if (noticeEl) {
          noticeEl.innerHTML = keyNoticeHtml;
        }

        if (optionsEl) {
          if (isMC) {
            const opts = { A: optA, B: optB, C: optC, D: optD };
            const activeKey = document.querySelector('input[name="sim-new-correct"]:checked')?.value || 'A';
            optionsEl.style.display = 'grid';
            optionsEl.style.gridTemplateColumns = '1fr 1fr';
            optionsEl.style.gap = '8px';
            optionsEl.innerHTML = ['A', 'B', 'C', 'D'].map(k => {
              const isCorrect = (k === activeKey);
              const optVal = opts[k] || '';
              const optFormatted = (typeof formatMathHtml === 'function')
                ? formatMathHtml(escaparHtml(optVal))
                : escaparHtml(optVal);
              return `
                <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 10px; border-radius:8px; border:${isCorrect ? '1.5px solid #10b981' : '1px solid rgba(43,33,24,0.15)'}; background:${isCorrect ? '#f0fdf4' : '#ffffff'}; box-sizing:border-box;">
                  <div style="display:flex; align-items:center; gap:6px; min-width:0; overflow:hidden;">
                    <span style="display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; min-width:22px; border-radius:50%; font-weight:800; font-size:0.75rem; background:${isCorrect ? '#10b981' : 'rgba(43,33,24,0.08)'}; color:${isCorrect ? '#ffffff' : '#2B2118'};">${k}</span>
                    <span style="font-size:0.84rem; color:#1e293b; font-weight:${isCorrect ? '700' : '500'}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${optFormatted}</span>
                  </div>
                  ${isCorrect ? '<span style="font-size:0.65rem; font-weight:800; color:#15803d; background:#dcfce7; padding:1px 6px; border-radius:4px; flex-shrink:0;">✓ Clave</span>' : ''}
                </div>
              `;
            }).join('');
          } else {
            optionsEl.style.display = 'none';
          }
        }

        if (consolidatedCard) consolidatedCard.style.display = 'flex';
      } else if (summaryBox) {
        // En ramas no-IA se conserva el summaryBox si correspondiera
        summaryBox.innerHTML = keyNoticeHtml;
        if (keyNoticeHtml) summaryBox.style.display = 'block';
      }

      // Habilitar el botón principal inferior
      const btnSave = document.getElementById('sim-btn-save-custom');
      if (btnSave) {
        btnSave.disabled = false;
        btnSave.style.background = '#0284C7';
        btnSave.style.cursor = 'pointer';
        btnSave.innerHTML = '💾 Guardar pregunta y Asignar a la Ficha';
        setTimeout(() => {
          btnSave.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 80);
      }

      if (typeof showToast === 'function') showToast('✓ Rúbrica generada con éxito');
    } else {
      const err = (res && res.error) || 'No se pudo generar la rúbrica.';
      if (statusEl) {
        statusEl.textContent = '❌ Error al generar rúbrica con IA';
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

window._viewCurrentDraftRubric = () => {
  const rubric = simCurrentRubric || window.simCurrentRubric;
  if (!rubric) return;
  const drawer = document.getElementById('sim-consolidated-rubric-drawer');
  const btn = document.getElementById('sim-btn-toggle-draft-rubric');
  if (!drawer) return;

  const isOpen = (drawer.style.display !== 'none');
  if (isOpen) {
    drawer.style.display = 'none';
    drawer.innerHTML = '';
    if (btn) {
      btn.innerHTML = '👁️ Ver rúbrica';
      btn.style.background = '#f5f3ff';
      btn.style.borderColor = '#c4b5fd';
      btn.style.color = '#6d28d9';
    }
  } else {
    const prompt = (document.getElementById('sim-new-prompt')?.value || '').trim();
    const opts = {
      A: (document.getElementById('sim-opt-a')?.value || '').trim().substring(0, 10),
      B: (document.getElementById('sim-opt-b')?.value || '').trim().substring(0, 10),
      C: (document.getElementById('sim-opt-c')?.value || '').trim().substring(0, 10),
      D: (document.getElementById('sim-opt-d')?.value || '').trim().substring(0, 10)
    };
    const correct = document.querySelector('input[name="sim-new-correct"]:checked')?.value || 'A';
    const draftQ = {
      id: 'sim_draft_' + Date.now(),
      prompt,
      options: opts,
      correct,
      rubric: rubric
    };
    if (typeof buildInlineRubricDrawerHtml === 'function') {
      drawer.innerHTML = buildInlineRubricDrawerHtml(draftQ);
    }
    drawer.style.display = 'block';
    if (btn) {
      btn.innerHTML = '▲ Ocultar Rúbrica';
      btn.style.background = '#0284c7';
      btn.style.borderColor = '#0284c7';
      btn.style.color = '#ffffff';
    }
  }
};

function editSimDraftQuestion() {
  const formFields = document.getElementById('sim-new-form-fields');
  const consolidatedCard = document.getElementById('sim-new-consolidated-card');
  const drawer = document.getElementById('sim-consolidated-rubric-drawer');
  const btnRubric = document.getElementById('sim-btn-toggle-draft-rubric');
  if (drawer) {
    drawer.style.display = 'none';
    drawer.innerHTML = '';
  }
  if (btnRubric) {
    btnRubric.innerHTML = '👁️ Ver rúbrica';
    btnRubric.style.background = '#f5f3ff';
    btnRubric.style.borderColor = '#c4b5fd';
    btnRubric.style.color = '#6d28d9';
  }
  if (formFields) formFields.style.display = 'flex';
  if (consolidatedCard) consolidatedCard.style.display = 'none';

  if (simState.branch === 'rama1') {
    simCurrentRubric = null;
    const btnSave = document.getElementById('sim-btn-save-custom');
    if (btnSave) {
      btnSave.disabled = true;
      btnSave.style.background = '#94a3b8';
      btnSave.style.cursor = 'not-allowed';
      btnSave.innerHTML = '🔒 Guardar pregunta y Asignar a la Ficha';
    }
    const aiStatus = document.getElementById('sim-ai-status');
    if (aiStatus) {
      aiStatus.textContent = '';
    }
  }
}
window.editSimDraftQuestion = editSimDraftQuestion;


// Exposición global
if (typeof window !== "undefined") {
  window.openSimQuestionPicker = openSimQuestionPicker;
  window.closeSimPicker = closeSimPicker;
  window.updateSimPromptCounter = updateSimPromptCounter;
  window.toggleMathPopover = toggleMathPopover;
  window.closeMathPopovers = closeMathPopovers;
  window.insertFractionFromPopover = insertFractionFromPopover;
  window.insertSqrtFromPopover = insertSqrtFromPopover;
  window.insertExpFromPopover = insertExpFromPopover;
  window.setSimPickerTab = setSimPickerTab;
  window.renderSimBankList = renderSimBankList;
  window.handleUpgradeSimBankQuestion = handleUpgradeSimBankQuestion;
  window.selectSimBankQuestion = selectSimBankQuestion;
  window.handleSimAnalyzeAI = handleSimAnalyzeAI;
  window.editSimDraftQuestion = editSimDraftQuestion;
  if (typeof _viewCurrentDraftRubric !== "undefined") {
    window._viewCurrentDraftRubric = _viewCurrentDraftRubric;
  }
}
