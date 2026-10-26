// =============================================================================
// bank-manager-form.js — Microevaluación
// MÓDULO: ASISTENTE DE REDACCIÓN Y GENERACIÓN DE RÚBRICA IA (MODAL BANK ADD)
//
// Responsabilidad única:
//   - Formulario de alta modal (#modal-bank-add).
//   - Validación de 4 alternativas completas (Regla 6).
//   - Generación de solución canónica y rúbrica ponderada con Gemini.
//   - Alineación automática de clave canónica y vista consolidada KaTeX.
// =============================================================================

let bmCurrentRubric = null;
let bmActiveResponseType = 'mc';

function setBMResponseType(type) {
  bmActiveResponseType = (type === 'free') ? 'free' : 'mc';
  const btnMC = document.getElementById('bm-btn-type-mc');
  const btnFree = document.getElementById('bm-btn-type-free');
  const blockMC = document.getElementById('bm-block-mc');
  const blockFree = document.getElementById('bm-block-free');
  const statusHint = document.getElementById('bm-status-hint');

  if (bmActiveResponseType === 'mc') {
    if (btnMC) {
      btnMC.style.background = '#0284C7';
      btnMC.style.color = '#FFFFFF';
      btnMC.style.fontWeight = '800';
      btnMC.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
    }
    if (btnFree) {
      btnFree.style.background = 'transparent';
      btnFree.style.color = '#57534E';
      btnFree.style.fontWeight = '700';
      btnFree.style.boxShadow = 'none';
    }
    if (blockMC) blockMC.style.display = 'block';
    if (blockFree) blockFree.style.display = 'none';

    if (statusHint) {
      statusHint.innerHTML = `
        <div style="display:flex; align-items:flex-start; gap:6px;">
          <span style="color:#D97706; font-weight:bold; line-height:1.2;">•</span>
          <span><strong>Guardar sin rúbrica</strong> permite usar la pregunta solo en las modalidades Focalizada en la Respuesta y Cartilla OMR.</span>
        </div>
        <div style="display:flex; align-items:flex-start; gap:6px;">
          <span style="color:#0284C7; font-weight:bold; line-height:1.2;">•</span>
          <span><strong>Generar Rúbrica</strong> analiza el problema pedagógicamente con IA y muestra la vista previa antes de guardar.</span>
        </div>
      `;
    }
  } else {
    if (btnMC) {
      btnMC.style.background = 'transparent';
      btnMC.style.color = '#57534E';
      btnMC.style.fontWeight = '700';
      btnMC.style.boxShadow = 'none';
    }
    if (btnFree) {
      btnFree.style.background = '#0284C7';
      btnFree.style.color = '#FFFFFF';
      btnFree.style.fontWeight = '800';
      btnFree.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
    }
    if (blockMC) blockMC.style.display = 'none';
    if (blockFree) blockFree.style.display = 'block';

    if (statusHint) {
      statusHint.innerHTML = `
        <div style="display:flex; align-items:flex-start; gap:6px;">
          <span style="color:#D97706; font-weight:bold; line-height:1.2;">•</span>
          <span><strong>Guardar sin rúbrica</strong> guarda la pregunta de desarrollo libre directamente en el banco.</span>
        </div>
        <div style="display:flex; align-items:flex-start; gap:6px;">
          <span style="color:#0284C7; font-weight:bold; line-height:1.2;">•</span>
          <span><strong>Generar Rúbrica</strong> analiza el problema pedagógicamente con IA y muestra la vista previa antes de guardar.</span>
        </div>
      `;
    }

    const expInput = document.getElementById('bm-expected-answer');
    if (expInput) setTimeout(() => expInput.focus(), 50);
  }
}
window.setBMResponseType = setBMResponseType;

function toggleBankManagerAddForm(show) {
  const modal = document.getElementById('modal-bank-add');
  if (!modal) return;
  const isVisible = modal.style.display === 'flex';
  const target = (typeof show === 'boolean') ? show : !isVisible;

  if (target) {
    // Guardarraíl: Máximo 50 preguntas en toda la cuenta
    if (typeof ClassroomData !== 'undefined' && ClassroomData.getBankQuestionsCount) {
      if (ClassroomData.getBankQuestionsCount() >= 50) {
        if (typeof showToast === 'function') {
          showToast('⚠️ Has alcanzado el límite máximo de 50 preguntas en tu banco. Elimina alguna pregunta que ya no utilices para poder agregar una nueva.');
        }
        return;
      }
    }

    // Resetear formulario a Estado 1 (Ingreso)
    const formFields = document.getElementById('bm-new-form-fields');
    const consolidated = document.getElementById('bm-new-consolidated-card');
    if (formFields) formFields.style.display = 'flex';
    if (consolidated) consolidated.style.display = 'none';

    const gradeTag = document.getElementById('bank-manager-form-grade-tag');
    if (gradeTag && bankManagerActiveGrade) {
      gradeTag.textContent = bankManagerActiveGrade.label;
    }

    const title = document.getElementById('bank-manager-form-title');
    if (title) {
      title.textContent = 'Redactar Pregunta';
    }

    // Restablecer selector a Alternativas por defecto
    setBMResponseType('mc');

    const promptInput = document.getElementById('bm-prompt');
    if (promptInput) promptInput.value = '';
    ['a', 'b', 'c', 'd'].forEach(lettr => {
      const inp = document.getElementById('bm-opt-' + lettr);
      if (inp) inp.value = '';
    });
    const expInput = document.getElementById('bm-expected-answer');
    if (expInput) expInput.value = '';
    const radA = document.getElementById('bm-rad-a');
    if (radA) radA.checked = true;

    bmCurrentRubric = null;
    window.bmDraftQuestion = null;
    const drawer = document.getElementById('bm-consolidated-rubric-drawer');
    const btnRubric = document.getElementById('bm-btn-toggle-draft-rubric');
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
    updateBMPromptCounter();
    closeMathPopovers('bm');
    modal.style.display = 'flex';
    if (promptInput) setTimeout(() => promptInput.focus(), 60);
  } else {
    modal.style.display = 'none';
    closeMathPopovers('bm');
  }
}
window.toggleBankManagerAddForm = toggleBankManagerAddForm;


async function handleSaveQuestionFromManager() {
  if (typeof ClassroomData !== 'undefined' && ClassroomData.getBankQuestionsCount) {
    if (ClassroomData.getBankQuestionsCount() >= 50) {
      if (typeof showToast === 'function') {
        showToast('⚠️ Has alcanzado el límite máximo de 50 preguntas en tu banco. Elimina alguna pregunta que ya no utilices para poder agregar una nueva.');
      }
      return;
    }
  }

  if (!bankManagerActiveGrade) {
    showToast('⚠️ Selecciona un grado primero.');
    return;
  }

  const promptInput = document.getElementById('bm-prompt');
  const prompt = (promptInput?.value || '').trim();
  if (!prompt) {
    promptInput?.focus();
    showToast('⚠️ Escribe el enunciado de la pregunta.');
    return;
  }

  let optA = '', optB = '', optC = '', optD = '';
  let freeExpectedAnswer = '';

  if (bmActiveResponseType === 'free') {
    freeExpectedAnswer = (document.getElementById('bm-expected-answer')?.value || '').trim();
    if (!freeExpectedAnswer) {
      document.getElementById('bm-expected-answer')?.focus();
      showToast('⚠️ Escribe la respuesta esperada.');
      return;
    }
  } else {
    optA = (document.getElementById('bm-opt-a')?.value || '').trim().substring(0, 10);
    optB = (document.getElementById('bm-opt-b')?.value || '').trim().substring(0, 10);
    optC = (document.getElementById('bm-opt-c')?.value || '').trim().substring(0, 10);
    optD = (document.getElementById('bm-opt-d')?.value || '').trim().substring(0, 10);
    if (!optA || !optB || !optC || !optD) {
      showToast('⚠️ Completa las 4 alternativas (A, B, C, D).');
      return;
    }
  }

  const btn = document.getElementById('btn-bm-save');
  const hint = document.getElementById('bm-status-hint');
  const origBtnText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '⏳ Generando rúbrica con Gemini (~20 seg)...';
  }
  if (hint) {
    hint.textContent = 'Calculando solución canónica y rúbrica pedagógica...';
    hint.style.color = '#f59e0b';
  }

  let res = null;
  try {
    res = await SupabaseClient.generateRubric({
      prompt: prompt,
      grado: bankManagerActiveGrade.label
    });
  } catch (err) {
    res = { ok: false, error: err.message };
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origBtnText;
    }
  }

  if (!res || !res.ok || !res.rubrica) {
    const errorMsg = (res && res.error) || 'La IA no devolvió una rúbrica estructurada.';
    if (hint) {
      hint.textContent = '❌ Error al generar rúbrica con IA';
      hint.style.color = '#ef4444';
    }
    showToast('⚠️ Error: ' + errorMsg);
    return;
  }

  bmCurrentRubric = res.rubrica;

  // Extraer solución canónica
  let canon = '';
  if (typeof res.rubrica === 'object' && res.rubrica !== null) {
    canon = res.rubrica.solucion_canonica || res.rubrica.respuesta_canonica || res.rubrica.canonico || '';
  }
  canon = String(canon || '').trim();

  let keyNoticeHtml = '';

  if (bmActiveResponseType === 'free') {
    if (canon && freeExpectedAnswer && canon.toLowerCase() !== freeExpectedAnswer.toLowerCase()) {
      keyNoticeHtml = `
        <div style="background:#f0fdf4; border:1px solid #86efac; border-radius:8px; padding:6px 10px; margin-top:8px; font-size:0.74rem; color:#166534; font-weight:700;">
          ✓ Rúbrica generada con éxito. Solución analizada por la IA: <strong>${escaparHtml(canon)}</strong>.
        </div>
      `;
    }

    window.bmDraftQuestion = {
      type: 'free',
      prompt: prompt,
      options: null,
      correct: null,
      expectedAnswer: freeExpectedAnswer,
      rubric: bmCurrentRubric,
      canon: canon
    };
  } else {
    // Comparación y corrección automática de clave para Alternativas
    const opts = { A: optA, B: optB, C: optC, D: optD };
    let currentSelected = document.querySelector('input[name="bm-correct"]:checked')?.value || 'A';

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

    let activeCorrectKey = currentSelected;

    if (matchingKey) {
      activeCorrectKey = matchingKey;
      if (matchingKey !== currentSelected) {
        const radTarget = document.getElementById('bm-rad-' + matchingKey.toLowerCase());
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

    // Preparar borrador en memoria (Aún NO guardado en el Banco)
    const expAns = opts[activeCorrectKey] || canon || prompt;
    window.bmDraftQuestion = {
      type: 'mc',
      prompt: prompt,
      options: opts,
      correct: activeCorrectKey,
      expectedAnswer: expAns,
      rubric: bmCurrentRubric,
      canon: canon
    };
  }

  // Transición a la Vista Consolidada en el modal (Estado 2: Vista Previa)
  const formFields = document.getElementById('bm-new-form-fields');
  const consolidatedCard = document.getElementById('bm-new-consolidated-card');
  const promptEl = document.getElementById('bm-consolidated-prompt');
  const optionsEl = document.getElementById('bm-consolidated-options');
  const noticeEl = document.getElementById('bm-consolidated-key-notice');

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
    if (window.bmDraftQuestion.type === 'free') {
      optionsEl.style.display = 'block';
      const expAns = window.bmDraftQuestion.expectedAnswer;
      const expFormatted = (typeof formatMathHtml === 'function') ? formatMathHtml(escaparHtml(expAns)) : escaparHtml(expAns);
      optionsEl.innerHTML = `
        <div style="background:#FAF8F5; border:1px solid #DCD8CE; border-radius:8px; padding:10px 14px; display:flex; align-items:center; justify-content:space-between;">
          <div style="display:flex; flex-direction:column; gap:2px;">
            <span style="font-size:0.65rem; color:#64748B; font-weight:800; text-transform:uppercase; letter-spacing:0.04em;">Respuesta esperada</span>
            <div style="font-size:1.15rem; font-weight:900; color:#0F172A; line-height:1.2;">${expFormatted}</div>
          </div>
          <span style="font-size:0.72rem; font-weight:800; color:#0284C7; background:rgba(2,132,199,0.10); border:1px solid rgba(2,132,199,0.25); border-radius:6px; padding:3px 8px;">✍️ Respuesta Libre</span>
        </div>
      `;
    } else {
      const opts = window.bmDraftQuestion.options;
      const activeCorrectKey = window.bmDraftQuestion.correct;
      optionsEl.style.display = 'grid';
      optionsEl.style.gridTemplateColumns = '1fr 1fr';
      optionsEl.style.gap = '8px';
      optionsEl.innerHTML = ['A', 'B', 'C', 'D'].map(k => {
        const isCorrect = (k === activeCorrectKey);
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
    }
  }

  if (consolidatedCard) consolidatedCard.style.display = 'flex';

  if (typeof showToast === 'function') showToast('✓ Rúbrica generada. Elige cómo guardar la pregunta.');
}

/**
 * Guarda efectivamente la pregunta borrador en el Banco (ClassroomData + Supabase).
 * Se invoca recién cuando el usuario pulsa "Guardar con Rúbrica" o "Guardar sin Rúbrica".
 */
async function saveBMDraftQuestion(withRubric = true) {
  if (typeof ClassroomData !== 'undefined' && ClassroomData.getBankQuestionsCount) {
    if (ClassroomData.getBankQuestionsCount() >= 50) {
      if (typeof showToast === 'function') {
        showToast('⚠️ Has alcanzado el límite máximo de 50 preguntas en tu banco. Elimina alguna pregunta que ya no utilices para poder agregar una nueva.');
      }
      return;
    }
  }

  const draft = window.bmDraftQuestion;
  if (!draft || !draft.prompt) {
    if (typeof showToast === 'function') showToast('⚠️ No hay pregunta pendiente de guardar.');
    return;
  }

  if (!bankManagerActiveGrade) {
    if (typeof showToast === 'function') showToast('⚠️ Selecciona un grado primero.');
    return;
  }

  const prompt = draft.prompt;
  const rubricToSave = withRubric ? (draft.rubric || bmCurrentRubric) : null;

  if (draft.type === 'free') {
    const expAns = draft.expectedAnswer || draft.canon || '';
    const evalObj = {
      title: withRubric ? 'Pregunta de desarrollo con rúbrica IA' : 'Pregunta de respuesta libre',
      type: 'free',
      questionCount: 1,
      prompt: prompt,
      expectedAnswer: expAns,
      options: null,
      correct: null,
      questions: null,
      rubric: rubricToSave,
      hasRubric: !!withRubric,
      gradeStage: bankManagerActiveGrade.stage,
      gradeLevel: Number(bankManagerActiveGrade.level),
      gradeText: bankManagerActiveGrade.label
    };

    ClassroomData.saveCustomEvaluation(evalObj);
    SupabaseClient.saveEvaluation(evalObj).catch(e => console.warn('[Manager Save Cloud Free]', e));
  } else {
    const opts = draft.options;
    const activeCorrectKey = draft.correct;
    const canon = draft.canon;
    const expAns = draft.expectedAnswer || opts[activeCorrectKey] || canon || prompt;

    const newQ = {
      id: 'q_custom_' + Date.now(),
      prompt: prompt,
      options: opts,
      correct: activeCorrectKey,
      expectedAnswer: expAns,
      rubric: rubricToSave,
      hasRubric: !!withRubric,
      gradeStage: bankManagerActiveGrade.stage,
      gradeLevel: Number(bankManagerActiveGrade.level),
      gradeText: bankManagerActiveGrade.label
    };

    const evalObj = {
      title: withRubric ? 'Pregunta de alternativa con rúbrica IA' : 'Pregunta de alternativas (rápida)',
      type: 'mc',
      questionCount: 1,
      prompt: prompt,
      expectedAnswer: expAns,
      options: opts,
      correct: activeCorrectKey,
      questions: [newQ],
      rubric: rubricToSave,
      hasRubric: !!withRubric,
      gradeStage: bankManagerActiveGrade.stage,
      gradeLevel: Number(bankManagerActiveGrade.level),
      gradeText: bankManagerActiveGrade.label
    };

    ClassroomData.saveCustomEvaluation(evalObj);
    SupabaseClient.saveEvaluation(evalObj).catch(e => console.warn('[Manager Save Cloud]', e));
  }

  // Refrescar lista de preguntas en el gestor y banco
  renderBankManagerQuestions();
  if (typeof renderBankCards === 'function') renderBankCards();

  if (typeof showToast === 'function') {
    showToast(withRubric ? '✅ Pregunta guardada con rúbrica en el banco' : '✅ Pregunta guardada sin rúbrica en el banco');
  }

  // Limpiar estado y cerrar modal
  window.bmDraftQuestion = null;
  bmCurrentRubric = null;
  toggleBankManagerAddForm(false);
}

function editBMDraftQuestion() {
  const formFields = document.getElementById('bm-new-form-fields');
  const consolidatedCard = document.getElementById('bm-new-consolidated-card');
  const drawer = document.getElementById('bm-consolidated-rubric-drawer');
  const btnRubric = document.getElementById('bm-btn-toggle-draft-rubric');
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

  if (window.bmDraftQuestion) {
    if (window.bmDraftQuestion.type === 'free') {
      setBMResponseType('free');
      const expInput = document.getElementById('bm-expected-answer');
      if (expInput) expInput.value = window.bmDraftQuestion.expectedAnswer || '';
    } else {
      setBMResponseType('mc');
    }
  }
  bmCurrentRubric = null;
}
window.editBMDraftQuestion = editBMDraftQuestion;

window._viewCurrentBMDraftRubric = () => {
  const rubric = bmCurrentRubric || window.bmCurrentRubric;
  if (!rubric) return;
  const drawer = document.getElementById('bm-consolidated-rubric-drawer');
  const btn = document.getElementById('bm-btn-toggle-draft-rubric');
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
    const draft = window.bmDraftQuestion || {};
    const prompt = (document.getElementById('bm-prompt')?.value || '').trim() || draft.prompt || '';
    let draftQ;
    if (draft.type === 'free' || bmActiveResponseType === 'free') {
      draftQ = {
        id: 'bm_draft_' + Date.now(),
        prompt,
        options: null,
        correct: null,
        expectedAnswer: draft.expectedAnswer || (document.getElementById('bm-expected-answer')?.value || '').trim(),
        rubric: rubric
      };
    } else {
      const opts = draft.options || {
        A: (document.getElementById('bm-opt-a')?.value || '').trim().substring(0, 10),
        B: (document.getElementById('bm-opt-b')?.value || '').trim().substring(0, 10),
        C: (document.getElementById('bm-opt-c')?.value || '').trim().substring(0, 10),
        D: (document.getElementById('bm-opt-d')?.value || '').trim().substring(0, 10)
      };
      const correct = draft.correct || document.querySelector('input[name="bm-correct"]:checked')?.value || 'A';
      draftQ = {
        id: 'bm_draft_' + Date.now(),
        prompt,
        options: opts,
        correct,
        rubric: rubric
      };
    }
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

/**
 * Guarda una pregunta rápida de alternativas o respuesta libre directamente en el banco sin consultar a Gemini.
 */
async function handleSaveQuickQuestionFromManager() {
  if (typeof ClassroomData !== 'undefined' && ClassroomData.getBankQuestionsCount) {
    if (ClassroomData.getBankQuestionsCount() >= 50) {
      if (typeof showToast === 'function') {
        showToast('⚠️ Has alcanzado el límite máximo de 50 preguntas en tu banco. Elimina alguna pregunta que ya no utilices para poder agregar una nueva.');
      }
      return;
    }
  }

  if (!bankManagerActiveGrade) {
    showToast('⚠️ Selecciona un grado primero.');
    return;
  }

  const promptInput = document.getElementById('bm-prompt');
  const prompt = (promptInput?.value || '').trim();
  if (!prompt) {
    promptInput?.focus();
    showToast('⚠️ Escribe el enunciado de la pregunta.');
    return;
  }

  const btnQuick = document.getElementById('btn-bm-save-quick');
  if (btnQuick) btnQuick.disabled = true;

  try {
    if (bmActiveResponseType === 'free') {
      const expAns = (document.getElementById('bm-expected-answer')?.value || '').trim();
      if (!expAns) {
        document.getElementById('bm-expected-answer')?.focus();
        showToast('⚠️ Escribe la respuesta esperada.');
        return;
      }

      const evalObj = {
        title: 'Pregunta de respuesta libre',
        type: 'free',
        questionCount: 1,
        prompt: prompt,
        expectedAnswer: expAns,
        options: null,
        correct: null,
        questions: null,
        rubric: null,
        hasRubric: false,
        gradeStage: bankManagerActiveGrade.stage,
        gradeLevel: Number(bankManagerActiveGrade.level),
        gradeText: bankManagerActiveGrade.label
      };

      ClassroomData.saveCustomEvaluation(evalObj);
      SupabaseClient.saveEvaluation(evalObj).catch(e => console.warn('[Manager Save Cloud Quick Free]', e));

      showToast('⚡ Pregunta de Respuesta Libre guardada con éxito en el banco');
    } else {
      const optA = (document.getElementById('bm-opt-a')?.value || '').trim().substring(0, 10);
      const optB = (document.getElementById('bm-opt-b')?.value || '').trim().substring(0, 10);
      const optC = (document.getElementById('bm-opt-c')?.value || '').trim().substring(0, 10);
      const optD = (document.getElementById('bm-opt-d')?.value || '').trim().substring(0, 10);
      if (!optA || !optB || !optC || !optD) {
        showToast('⚠️ Completa las 4 alternativas (A, B, C, D).');
        return;
      }

      const rad = document.querySelector('input[name="bm-correct"]:checked');
      const correctKey = (rad ? rad.value : 'A').toUpperCase();

      const evalObj = {
        title: 'Pregunta rápida de alternativa',
        type: 'mc',
        questionCount: 1,
        prompt: prompt,
        expectedAnswer: `Clave: ${correctKey}`,
        options: { A: optA, B: optB, C: optC, D: optD },
        correct: correctKey,
        questions: [{
          prompt: prompt,
          options: { A: optA, B: optB, C: optC, D: optD },
          correct: correctKey,
          gradeStage: bankManagerActiveGrade.stage,
          gradeLevel: Number(bankManagerActiveGrade.level),
          gradeText: bankManagerActiveGrade.label,
          rubric: null,
          hasRubric: false
        }],
        rubric: null,
        hasRubric: false,
        gradeStage: bankManagerActiveGrade.stage,
        gradeLevel: Number(bankManagerActiveGrade.level),
        gradeText: bankManagerActiveGrade.label
      };

      ClassroomData.saveCustomEvaluation(evalObj);
      SupabaseClient.saveEvaluation(evalObj).catch(e => console.warn('[Manager Save Cloud Quick]', e));

      showToast('⚡ Pregunta guardada sin rúbrica con éxito en el banco');
    }

    // Limpiar campos y refrescar
    if (promptInput) promptInput.value = '';
    ['bm-opt-a', 'bm-opt-b', 'bm-opt-c', 'bm-opt-d'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const expInput = document.getElementById('bm-expected-answer');
    if (expInput) expInput.value = '';
    const defaultRad = document.getElementById('bm-rad-a');
    if (defaultRad) defaultRad.checked = true;

    toggleBankManagerAddForm(false);
    renderBankManagerQuestions();
    if (typeof renderBankCards === 'function') renderBankCards();
  } finally {
    if (btnQuick) btnQuick.disabled = false;
  }
}

/**
 * Permite agregarle rúbrica pedagógica de IA a una pregunta rápida que no la tenía.
 * Al generarse, la pregunta queda inmediatamente habilitada para evaluar procedimiento en la Rama 1.
 */
async function handleUpgradeQuestionWithRubric(q) {
  if (!q || !q.prompt) return;

  const gradoLabel = q.gradeText || (bankManagerActiveGrade ? bankManagerActiveGrade.label : 'Primaria');

  showAIDialog({
    icon: '✨',
    title: 'Generar Rúbrica Pedagógica con IA',
    bodyHtml: `
      <div style="font-size:0.85rem; color:#cbd5e1; line-height:1.5; margin-bottom:12px;">
        Esta acción consultará a Gemini para analizar el problema, generar la solución canónica y crear la rúbrica para evaluar el procedimiento manuscrito del alumno.
      </div>
      <div style="background:#0f172a; padding:10px 12px; border-radius:8px; border:1px solid #334155; font-size:0.8rem; color:#93c5fd; margin-bottom:12px;">
        <strong>Enunciado:</strong> ${escaparHtml(q.prompt)}
      </div>
      <div style="font-size:0.75rem; color:#94a3b8;">
        Al completar el análisis, esta pregunta quedará habilitada para la <strong>Rama 1 (Evaluación Formativa con Procedimiento)</strong>.
      </div>
    `,
    buttons: [
      {
        label: '🚀 Iniciar Análisis IA ahora',
        style: 'padding:8px 16px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; border:none; background:linear-gradient(135deg, #2563eb, #7c3aed); color:#fff;',
        onClick: async () => {
          closeAIDialogModal();
          showToast('🤖 Consultando a Gemini... (~20-30 seg)');
          try {
            const res = await SupabaseClient.generateRubric({
              prompt: q.prompt,
              grado: gradoLabel
            });
            if (res && res.ok && res.rubrica) {
              const evFull = ClassroomData.getEvaluation(q.id) || q;
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
              ClassroomData.saveCustomEvaluation(evFull);
              SupabaseClient.saveEvaluation(evFull).catch(e => console.warn('[Upgrade Question Cloud]', e));
              renderBankManagerQuestions();
              showToast('✅ Rúbrica de IA asignada exitosamente a la pregunta.');
            } else {
              showToast('⚠️ No se pudo generar la rúbrica: ' + (res?.error || 'Error desconocido'));
            }
          } catch (err) {
            showToast('⚠️ Error al generar rúbrica: ' + (err?.message || err));
          }
        }
      },
      {
        label: 'Cancelar',
        style: 'padding:8px 14px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; border:1px solid #475569; background:#1e293b; color:#cbd5e1;',
        onClick: () => {}
      }
    ]
  });
}


// ── EXPOSICIÓN GLOBAL DEL FORMULARIO Y ASISTENTE IA ──
if (typeof window !== "undefined") {
  window.toggleBankManagerAddForm = toggleBankManagerAddForm;
  window.editBMDraftQuestion = editBMDraftQuestion;
  window._viewCurrentBMDraftRubric = _viewCurrentBMDraftRubric;
  window.handleGenerateRubricFromManager = handleSaveQuestionFromManager;
  window.handleSaveQuestionFromManager = handleSaveQuestionFromManager;
  window.saveBMDraftQuestion = saveBMDraftQuestion;
  window.handleSaveQuickQuestionFromManager = handleSaveQuickQuestionFromManager;
  window.handleUpgradeQuestionWithRubric = handleUpgradeQuestionWithRubric;
}
