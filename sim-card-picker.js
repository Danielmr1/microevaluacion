// =============================================================================
// sim-card-picker.js — Microevaluación
// MÓDULO: MODAL SELECTOR DE PREGUNTAS DEL SIMULADOR Y POPOVERS KATEX
// =============================================================================

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
        btnSave.innerHTML = '✓ Asignar a la Ficha';
      } else {
        btnSave.disabled = true;
        btnSave.style.background = '#94a3b8';
        btnSave.style.cursor = 'not-allowed';
        btnSave.innerHTML = '🔒 Asignar a la Ficha (Genera la rúbrica primero)';
      }
    } else {
      btnSave.disabled = false;
      btnSave.style.background = '#0284C7';
      btnSave.style.cursor = 'pointer';
      btnSave.innerHTML = '💾 Asignar a la Ficha';
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
    } else if (withFrac) {
      hint.textContent = '≈ ' + lines + ' línea(s) con fracciones (máx 2 en A6, 105 car.)';
      hint.style.color = '#0284c7';
    } else {
      hint.textContent = '≈ ' + lines + ' línea(s) · máx 3 (compatible A6, A5 y A4)';
      hint.style.color = '#645547';
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

  bankList.forEach((q, idx) => {
    const item = document.createElement('div');
    item.style.cssText = 'background:#FFFFFF; border:1.5px solid rgba(43, 33, 24, 0.14); border-radius:12px; padding:12px 14px; display:flex; flex-direction:column; gap:8px; box-shadow:0 2px 6px rgba(43, 33, 24, 0.04);';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:8px;';

    const hasRubric = !!(q.hasRubric || q.rubric);

    const titleGroup = document.createElement('div');
    titleGroup.style.cssText = 'display:flex; align-items:center; gap:8px;';

    const badgeContainer = document.createElement('div');
    badgeContainer.style.display = 'inline-flex';
    badgeContainer.style.alignItems = 'center';

    if (hasRubric) {
      const badgeBtn = document.createElement('button');
      badgeBtn.type = 'button';
      badgeBtn.className = 'sim-badge-rubric-clickable';
      badgeBtn.style.cssText = 'background:#F3E8FF; color:#6B21A8; border:1px solid #C084FC; font-size:0.68rem; font-weight:800; padding:2px 8px; border-radius:6px; cursor:pointer; display:inline-flex; align-items:center; gap:4px; transition:all 0.15s;';
      badgeBtn.title = 'Clic para ver la rúbrica y análisis pedagógico de IA';
      badgeBtn.innerHTML = '🤖 Con Rúbrica IA <span style="font-size:0.75rem;">👁️</span>';
      badgeBtn.onclick = (e) => {
        e.stopPropagation();
        if (typeof handleViewQuestionRubric === 'function') handleViewQuestionRubric(q);
      };
      badgeContainer.appendChild(badgeBtn);
    } else {
      const badgeSpan = document.createElement('span');
      badgeSpan.style.cssText = 'background:#DCFCE7; color:#15803D; border:1px solid #86EFAC; font-size:0.68rem; font-weight:800; padding:2px 8px; border-radius:6px;';
      badgeSpan.textContent = '⚡ Pregunta Rápida';
      badgeContainer.appendChild(badgeSpan);
    }
    titleGroup.appendChild(badgeContainer);

    const optLabel = document.createElement('span');
    optLabel.style.cssText = 'font-size:0.82rem; font-weight:800; color:#2B2118;';
    optLabel.textContent = `Opción ${idx + 1}`;
    titleGroup.appendChild(optLabel);

    header.appendChild(titleGroup);

    const btnAction = document.createElement('button');
    btnAction.type = 'button';

    if (!hasRubric && isRama1) {
      // En Formativa con IA sin rúbrica: Generar Rúbrica
      btnAction.textContent = '✨ Generar Rúbrica';
      btnAction.style.cssText = 'background:linear-gradient(135deg, #7c3aed, #4f46e5); border:none; color:#FFFFFF; border-radius:8px; padding:6px 12px; font-size:0.76rem; font-weight:800; cursor:pointer; box-shadow:0 2px 6px rgba(124, 58, 237, 0.25); display:inline-flex; align-items:center; gap:5px; transition:all 0.15s; white-space:nowrap;';
      btnAction.title = 'Analizar este problema con Gemini para generar su solución y rúbrica';
      btnAction.onclick = () => handleUpgradeSimBankQuestion(q, btnAction, badgeContainer);
    } else {
      // Tiene rúbrica O no es Rama 1: Seleccionar directamente
      btnAction.textContent = '✓ Seleccionar';
      btnAction.style.cssText = 'background:#0284C7; border:none; color:#FFFFFF; border-radius:8px; padding:6px 14px; font-size:0.78rem; font-weight:800; cursor:pointer; box-shadow:0 2px 6px rgba(2, 132, 199, 0.25); transition:all 0.15s; white-space:nowrap;';
      btnAction.onclick = () => selectSimBankQuestion(q);
    }
    header.appendChild(btnAction);

    const promptText = document.createElement('div');
    promptText.style.cssText = 'font-size:0.85rem; color:#2B2118; font-weight:700; line-height:1.45;';
    promptText.innerHTML = (typeof formatMathHtml === 'function')
      ? formatMathHtml(escaparHtml(q.prompt || ''))
      : escaparHtml(q.prompt || '');

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

    item.appendChild(header);
    item.appendChild(promptText);
    item.appendChild(optsGrid);
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

      if (badgeContainer) {
        badgeContainer.innerHTML = '';
        const badgeBtn = document.createElement('button');
        badgeBtn.type = 'button';
        badgeBtn.className = 'sim-badge-rubric-clickable';
        badgeBtn.style.cssText = 'background:#F3E8FF; color:#6B21A8; border:1px solid #C084FC; font-size:0.68rem; font-weight:800; padding:2px 8px; border-radius:6px; cursor:pointer; display:inline-flex; align-items:center; gap:4px; transition:all 0.15s;';
        badgeBtn.title = 'Clic para ver la rúbrica y análisis pedagógico de IA';
        badgeBtn.innerHTML = '🤖 Con Rúbrica IA <span style="font-size:0.75rem;">👁️</span>';
        badgeBtn.onclick = (e) => {
          e.stopPropagation();
          if (typeof handleViewQuestionRubric === 'function') handleViewQuestionRubric(q);
        };
        badgeContainer.appendChild(badgeBtn);
      }

      btnEl.disabled = false;
      btnEl.style.opacity = '1';
      btnEl.style.cursor = 'pointer';
      btnEl.style.background = '#0284C7';
      btnEl.style.boxShadow = '0 2px 6px rgba(2, 132, 199, 0.25)';
      btnEl.textContent = '✓ Seleccionar';
      btnEl.title = 'Seleccionar esta pregunta';
      btnEl.onclick = () => selectSimBankQuestion(q);

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
  const optA = (document.getElementById('sim-opt-a')?.value || '').trim();
  const optB = (document.getElementById('sim-opt-b')?.value || '').trim();
  const optC = (document.getElementById('sim-opt-c')?.value || '').trim();
  const optD = (document.getElementById('sim-opt-d')?.value || '').trim();

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
            optionsEl.innerHTML = ['A', 'B', 'C', 'D'].map(k => {
              const isCorrect = (k === activeKey);
              const optVal = opts[k] || '';
              const optFormatted = (typeof formatMathHtml === 'function')
                ? formatMathHtml(escaparHtml(optVal))
                : escaparHtml(optVal);
              return `
                <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; border-radius:8px; border:${isCorrect ? '1.5px solid #10b981' : '1px solid rgba(43,33,24,0.15)'}; background:${isCorrect ? '#f0fdf4' : '#ffffff'};">
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span style="display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:50%; font-weight:800; font-size:0.75rem; background:${isCorrect ? '#10b981' : 'rgba(43,33,24,0.08)'}; color:${isCorrect ? '#ffffff' : '#2B2118'};">${k}</span>
                    <span style="font-size:0.84rem; color:#1e293b; font-weight:${isCorrect ? '700' : '500'};">${optFormatted}</span>
                  </div>
                  ${isCorrect ? '<span style="font-size:0.7rem; font-weight:800; color:#15803d; background:#dcfce7; padding:2px 8px; border-radius:6px;">✓ Clave Correcta</span>' : ''}
                </div>
              `;
            }).join('');
            optionsEl.style.display = 'flex';
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
        btnSave.innerHTML = '✓ Asignar a la Ficha';
        setTimeout(() => {
          btnSave.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 80);
      }

      if (typeof showToast === 'function') showToast('✓ Rúbrica generada y pregunta guardada en el Banco');
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
  if (!simCurrentRubric) return;

  const prompt = (document.getElementById('sim-new-prompt')?.value || '').trim();
  const opts = {
    A: (document.getElementById('sim-opt-a')?.value || '').trim(),
    B: (document.getElementById('sim-opt-b')?.value || '').trim(),
    C: (document.getElementById('sim-opt-c')?.value || '').trim(),
    D: (document.getElementById('sim-opt-d')?.value || '').trim()
  };
  const correct = document.querySelector('input[name="sim-new-correct"]:checked')?.value || 'A';
  if (typeof handleViewQuestionRubric === 'function') {
    handleViewQuestionRubric({ prompt, options: opts, correct, rubric: simCurrentRubric });
  }
};

function editSimDraftQuestion() {
  const formFields = document.getElementById('sim-new-form-fields');
  const consolidatedCard = document.getElementById('sim-new-consolidated-card');
  if (formFields) formFields.style.display = 'flex';
  if (consolidatedCard) consolidatedCard.style.display = 'none';

  if (simState.branch === 'rama1') {
    simCurrentRubric = null;
    const btnSave = document.getElementById('sim-btn-save-custom');
    if (btnSave) {
      btnSave.disabled = true;
      btnSave.style.background = '#94a3b8';
      btnSave.style.cursor = 'not-allowed';
      btnSave.innerHTML = '🔒 Asignar a la Ficha (Genera la rúbrica primero)';
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
