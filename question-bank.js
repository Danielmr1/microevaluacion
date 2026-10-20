// =============================================================================
// question-bank.js — Microevaluación A5 v3.1.31
// MÓDULO: BANCO DE PREGUNTAS, EVALUACIONES Y RÚBRICAS IA (GEMINI)
//
// Guardarraíles activos:
//   Regla 1  – Cero regresión Respuesta Libre: flujo original con consigna abierta,
//              cuadrícula amplia y rúbrica intacto.
//   Regla 2  – Aislamiento Total de Alternativas: type === 'mc' exclusivo.
//   Regla 3  – Integridad del banco: NUNCA oculta preguntas por questionCount: 1.
//   Regla 6  – Guardarraíl estricto: toda pregunta ingresada al banco debe
//              contener 4 alternativas con clave y rúbrica generada por IA.
//   Regla 9  – Falla silenciosa y fallback de red en llamadas IA.
//
// Dependencias globales: ClassroomData, SupabaseClient, Scanner, showToast,
//                        showSummary, wizardClassroomId, wizardEvalType, wizardEval
// =============================================================================

/* ── TOPE DE CARACTERES DEL ENUNCIADO ──
   La ranura del enunciado en la ficha aloja 3 líneas a 11pt, que a lo
   ancho de la ficha son ~89 caracteres por línea (~267 en total). El
   tope de 240 deja margen para palabras largas y signos, de modo que
   ningún enunciado válido pueda desbordar la ranura y correr la
   cuadrícula o la franja de respuesta. */
const PROMPT_MAX_CHARS = 240;
const PROMPT_CHARS_PER_LINE = 89;

function updatePromptCounter() {
  const ta = document.getElementById('input-eval-prompt');
  const counter = document.getElementById('prompt-counter');
  const hint = document.getElementById('prompt-hint');
  if (!ta) return;

  const len = ta.value.length;
  const lines = Math.max(1, Math.ceil(len / PROMPT_CHARS_PER_LINE));

  if (counter) {
    counter.textContent = len + ' / ' + PROMPT_MAX_CHARS;
    counter.style.color = len >= PROMPT_MAX_CHARS ? '#f59e0b' : '#64748b';
  }
  if (hint) {
    if (lines > 3) {
      hint.textContent = '⚠️ ' + lines + ' líneas: no entran en la ficha. Acortá el enunciado.';
      hint.style.color = '#ef4444';
    } else {
      hint.textContent = '≈ ' + lines + (lines === 1 ? ' línea' : ' líneas') + ' en la ficha · máximo 3';
      hint.style.color = '#64748b';
    }
  }
}

function updatePromptCounterFree() {
  const ta = document.getElementById('input-free-prompt');
  const counter = document.getElementById('prompt-counter-free');
  const hint = document.getElementById('prompt-hint-free');
  if (!ta) return;

  const len = ta.value.length;
  const lines = Math.max(1, Math.ceil(len / PROMPT_CHARS_PER_LINE));

  if (counter) {
    counter.textContent = len + ' / ' + PROMPT_MAX_CHARS;
    counter.style.color = len >= PROMPT_MAX_CHARS ? '#f59e0b' : '#64748b';
  }
  if (hint) {
    if (lines > 3) {
      hint.textContent = '⚠️ ' + lines + ' líneas: no entran en la ficha. Acortá el enunciado.';
      hint.style.color = '#ef4444';
    } else {
      hint.textContent = '≈ ' + lines + (lines === 1 ? ' línea' : ' líneas') + ' en la ficha · máximo 3';
      hint.style.color = '#64748b';
    }
  }
}

/**
 * Preguntas del banco que corresponden al grado del salón elegido y a la
 * modalidad de respuesta libre.
 *
 * @returns {{lista: Array, grado: object}}
 */
function evaluacionesDelGradoActual() {
  const g = (typeof gradoDelSalonSeleccionado === 'function')
    ? gradoDelSalonSeleccionado()
    : { stage: null, level: null, texto: '' };

  if (!g.stage || !g.level) return { lista: [], grado: g };

  const lista = (typeof ClassroomData !== 'undefined' && ClassroomData.getIndividualMCQuestions)
    ? ClassroomData.getIndividualMCQuestions(g.stage, g.level)
    : [];
  return { lista: lista, grado: g };
}

function renderBankCards() {
  const container = document.getElementById('bank-cards');
  if (!container) return;
  container.innerHTML = '';

  const g = (typeof gradoDelSalonSeleccionado === 'function')
    ? gradoDelSalonSeleccionado()
    : { stage: null, level: null, texto: '' };
  const color = wizardClassroomId ? ClassroomData.getClassroomColor(wizardClassroomId) : '#3b82f6';

  const titulo = document.getElementById('bank-title');
  const vacio = document.getElementById('bank-empty');
  const vacioTitulo = document.getElementById('bank-empty-title');
  const vacioAyuda = document.getElementById('bank-empty-hint');

  if (wizardEvalType === 'mc1') {
    if (titulo) {
      titulo.textContent = g.texto
        ? `4 · Selecciona una pregunta de alternativas de ${g.texto}`
        : '4 · Selecciona una pregunta de alternativas';
    }

    const mcQuestions = (typeof ClassroomData !== 'undefined' && ClassroomData.getIndividualMCQuestions)
      ? ClassroomData.getIndividualMCQuestions(g.stage, g.level)
      : [];

    if (mcQuestions.length === 0) {
      container.style.display = 'none';
      if (vacio) vacio.style.display = 'block';
      if (vacioTitulo) {
        vacioTitulo.textContent = g.texto
          ? `Todavía no hay preguntas de alternativas para ${g.texto}`
          : 'Este salón no tiene grado';
      }
      if (vacioAyuda) {
        vacioAyuda.textContent = g.texto
          ? `Crea tu primera pregunta de alternativas con "✏️ Crear nueva".`
          : 'Completa el grado del salón en el paso 1 para poder usar el banco.';
      }
      return;
    }

    container.style.display = 'flex';
    if (vacio) vacio.style.display = 'none';

    mcQuestions.forEach(q => {
      const card = document.createElement('button');
      card.style.cssText = [
        'display:flex', 'flex-direction:column', 'align-items:flex-start',
        'gap:6px', 'width:100%', 'padding:12px 14px',
        'background:#1e293b', 'border:1.5px solid #334155',
        'border-radius:10px', 'cursor:pointer', 'text-align:left',
        'transition:all 0.15s'
      ].join(';');

      const headerRow = document.createElement('div');
      headerRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; width:100%; gap:8px;';

      const title = document.createElement('span');
      title.textContent = (q.title && !q.title.includes('2 Preguntas')) ? q.title : 'Pregunta de alternativa';
      title.style.cssText = 'font-size:0.88rem; font-weight:800; color:#f1f5f9; flex:1;';

      const actionsRow = document.createElement('div');
      actionsRow.style.cssText = 'display:flex; align-items:center; gap:6px;';

      const hasRub = !!(q.hasRubric || q.rubric);
      const rubBadge = document.createElement('span');
      if (hasRub) {
        rubBadge.textContent = '🤖 Rúbrica IA';
        rubBadge.style.cssText = 'background:#4c1d95; color:#c4b5fd; font-size:0.65rem; font-weight:800; padding:2px 7px; border-radius:6px; white-space:nowrap;';
      } else {
        rubBadge.textContent = '⚡ Rápida';
        rubBadge.style.cssText = 'background:#065f46; color:#6ee7b7; font-size:0.65rem; font-weight:800; padding:2px 7px; border-radius:6px; white-space:nowrap;';
      }
      actionsRow.appendChild(rubBadge);

      const badge = document.createElement('span');
      badge.textContent = '🔘 Alternativa (1P)';
      badge.style.cssText = 'background:#1e3a8a; color:#93c5fd; font-size:0.65rem; font-weight:800; padding:2px 7px; border-radius:6px; white-space:nowrap;';
      actionsRow.appendChild(badge);

      const btnDel = document.createElement('button');
      btnDel.type = 'button';
      btnDel.innerHTML = '🗑️';
      btnDel.title = 'Eliminar pregunta del banco';
      btnDel.style.cssText = 'background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.3); color:#ef4444; border-radius:6px; padding:3px 7px; font-size:0.75rem; cursor:pointer; transition:all 0.15s; line-height:1;';
      btnDel.addEventListener('mouseenter', () => { btnDel.style.background = '#ef4444'; btnDel.style.color = '#fff'; });
      btnDel.addEventListener('mouseleave', () => { btnDel.style.background = 'rgba(239,68,68,0.15)'; btnDel.style.color = '#ef4444'; });
      btnDel.addEventListener('click', (e) => {
        e.stopPropagation();
        handleDeleteQuestionFromBank(q.prompt, q.prompt, q.id);
      });
      actionsRow.appendChild(btnDel);

      headerRow.appendChild(title);
      headerRow.appendChild(actionsRow);

      const preview = document.createElement('span');
      preview.textContent = q.prompt;
      preview.style.cssText = 'font-size:0.75rem; color:#94a3b8; line-height:1.35;';

      const optsRow = document.createElement('div');
      optsRow.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:4px; font-size:0.72rem; color:#cbd5e1; width:100%;';
      optsRow.innerHTML = `
        <div>A) ${escaparHtml(q.options?.A || '—')}</div>
        <div>B) ${escaparHtml(q.options?.B || '—')}</div>
        <div>C) ${escaparHtml(q.options?.C || '—')}</div>
        <div>D) ${escaparHtml(q.options?.D || '—')}</div>
      `;

      const answer = document.createElement('span');
      answer.textContent = `Clave correcta: ${q.correct}`;
      answer.style.cssText = 'font-size:0.8rem; font-weight:800; color:#22c55e;';

      const estado = document.createElement('span');
      estado.textContent = '⚡ Corrección automática por burbujas (A, B, C, D)';
      estado.style.cssText = 'font-size:0.68rem; font-weight:700; color:#38bdf8;';

      card.appendChild(headerRow);
      card.appendChild(preview);
      card.appendChild(optsRow);
      card.appendChild(answer);
      card.appendChild(estado);

      card.addEventListener('mouseenter', () => {
        card.style.borderColor = color;
        card.style.background = color + '14';
      });
      card.addEventListener('mouseleave', () => {
        card.style.borderColor = '#334155';
        card.style.background = '#1e293b';
      });

      card.addEventListener('click', () => {
        const evalObj = {
          title: 'Evaluación (1 Pregunta)',
          type: 'mc',
          questionCount: 1,
          prompt: q.prompt,
          expectedAnswer: `Clave: ${q.correct}`,
          questions: [q],
          gradeStage: g.stage,
          gradeLevel: g.level,
          gradeText: g.texto
        };
        const saved = ClassroomData.saveCustomEvaluation(evalObj);
        wizardEval = saved;
        wizardEvalType = 'mc1';
        if (typeof updateCorrectionModeUI === 'function') updateCorrectionModeUI('full');
        showSummary();
      });

      container.appendChild(card);
    });
    return;
  }

  // Modo Respuesta Libre
  const { lista: evals, grado } = evaluacionesDelGradoActual();

  if (titulo) {
    titulo.textContent = grado.texto
      ? `4 · Selecciona una evaluación de respuesta libre de ${grado.texto}`
      : '4 · Selecciona una evaluación de respuesta libre';
  }

  if (evals.length === 0) {
    container.style.display = 'none';
    if (vacio) vacio.style.display = 'block';
    if (vacioTitulo) {
      vacioTitulo.textContent = grado.texto
        ? `Todavía no hay evaluaciones de respuesta libre para ${grado.texto}`
        : 'Este salón no tiene grado';
    }
    if (vacioAyuda) {
      vacioAyuda.textContent = grado.texto
        ? 'Crea tu primera evaluación de respuesta libre con "✏️ Crear nueva".'
        : 'Completa el grado del salón en el paso 1 para poder usar el banco.';
    }
    return;
  }

  container.style.display = 'flex';
  if (vacio) vacio.style.display = 'none';

  evals.forEach(ev => {
    const card = document.createElement('button');
    card.style.cssText = [
      'display:flex', 'flex-direction:column', 'align-items:flex-start',
      'gap:6px', 'width:100%', 'padding:12px 14px',
      'background:#1e293b', 'border:1.5px solid #334155',
      'border-radius:10px', 'cursor:pointer', 'text-align:left',
      'transition:all 0.15s'
    ].join(';');

    const headerRow = document.createElement('div');
    headerRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; width:100%; gap:8px;';

    const title = document.createElement('span');
    title.textContent = (ev.title && !ev.title.includes('2 Preguntas')) ? ev.title : 'Pregunta de evaluación';
    title.style.cssText = 'font-size:0.88rem; font-weight:800; color:#f1f5f9; flex:1;';

    const actionsRow = document.createElement('div');
    actionsRow.style.cssText = 'display:flex; align-items:center; gap:6px;';

    const badge = document.createElement('span');
    badge.textContent = '✍️ Respuesta Libre';
    badge.style.cssText = 'background:#064e3b; color:#6ee7b7; font-size:0.65rem; font-weight:800; padding:2px 7px; border-radius:6px; white-space:nowrap;';
    actionsRow.appendChild(badge);

    const btnDel = document.createElement('button');
    btnDel.type = 'button';
    btnDel.innerHTML = '🗑️';
    btnDel.title = 'Eliminar evaluación del banco';
    btnDel.style.cssText = 'background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.3); color:#ef4444; border-radius:6px; padding:3px 7px; font-size:0.75rem; cursor:pointer; transition:all 0.15s; line-height:1;';
    btnDel.addEventListener('mouseenter', () => { btnDel.style.background = '#ef4444'; btnDel.style.color = '#fff'; });
    btnDel.addEventListener('mouseleave', () => { btnDel.style.background = 'rgba(239,68,68,0.15)'; btnDel.style.color = '#ef4444'; });
    btnDel.addEventListener('click', (e) => {
      e.stopPropagation();
      handleDeleteQuestionFromBank(ev.id || ev.prompt, ev.prompt || ev.title);
    });
    actionsRow.appendChild(btnDel);

    headerRow.appendChild(title);
    headerRow.appendChild(actionsRow);

    const preview = document.createElement('span');
    preview.textContent = (ev.prompt || '').substring(0, 100) + (ev.prompt && ev.prompt.length > 100 ? '…' : '');
    preview.style.cssText = 'font-size:0.75rem; color:#94a3b8; line-height:1.35;';

    const expectedVal = (ev.options && ev.options[ev.correct]) ? ev.options[ev.correct] : (ev.expectedAnswer || ev.correct || '');
    const answer = document.createElement('span');
    answer.textContent = `Resp esperada: ${expectedVal}`;
    answer.style.cssText = `font-size:0.8rem; font-weight:800; color:${color};`;

    card.appendChild(headerRow);
    card.appendChild(preview);
    card.appendChild(answer);

    const estado = document.createElement('span');
    if (ev.hasRubric || ev.rubric) {
      estado.textContent = '✅ Lista para corregir con IA';
      estado.style.cssText = 'font-size:0.68rem; font-weight:700; color:#4ade80;';
    } else {
      estado.textContent = '⚠️ Falta la rúbrica — no sirve para corregir con IA';
      estado.style.cssText = 'font-size:0.68rem; font-weight:700; color:#fbbf24;';
      card.style.borderColor = '#92400e';
    }
    card.appendChild(estado);

    card.addEventListener('mouseenter', () => {
      card.style.borderColor = color;
      card.style.background = color + '14';
    });
    card.addEventListener('mouseleave', () => {
      card.style.borderColor = '#334155';
      card.style.background = '#1e293b';
    });

    card.addEventListener('click', () => {
      const evalObj = {
        id: ev.id,
        title: 'Evaluación del Día',
        type: 'free',
        questionCount: 1,
        prompt: ev.prompt,
        expectedAnswer: expectedVal,
        rubric: ev.rubric || null,
        gradeStage: g.stage,
        gradeLevel: g.level,
        gradeText: g.texto
      };
      const saved = ClassroomData.saveCustomEvaluation(evalObj);
      wizardEval = saved;
      wizardEvalType = 'free';
      showSummary();
    });

    container.appendChild(card);
  });
}

function handleDeleteQuestionFromBank(target, displayText, optionalId) {
  const evalObj = (typeof ClassroomData !== 'undefined' && ClassroomData.getEvaluation)
    ? (ClassroomData.getEvaluation(target) || (optionalId && ClassroomData.getEvaluation(optionalId)) || Object.values(ClassroomData.EVALUATIONS || {}).find(e => e && (e.id === target || e.prompt === target || (optionalId && e.id === optionalId))))
    : null;
  const promptToDelete = evalObj ? evalObj.prompt : target;

  // Guardarraíl: Protección si la pregunta está en una sesión guardada activa
  if (typeof ClassroomData !== 'undefined' && typeof ClassroomData.isQuestionInSavedSession === 'function') {
    const check1 = ClassroomData.isQuestionInSavedSession(target);
    const check2 = optionalId ? ClassroomData.isQuestionInSavedSession(optionalId) : { inUse: false };
    const check3 = promptToDelete ? ClassroomData.isQuestionInSavedSession(promptToDelete) : { inUse: false };
    const inSaved = (check1 && check1.inUse) ? check1 : ((check2 && check2.inUse) ? check2 : ((check3 && check3.inUse) ? check3 : { inUse: false }));
    if (inSaved && inSaved.inUse) {
      showToast(`⚠️ No puedes eliminar esta pregunta porque forma parte de la sesión guardada "${inSaved.sessionTitle}". Elimina primero esa sesión en "Sesiones Guardadas".`);
      return;
    }
  }

  const promptPreview = (displayText || promptToDelete || '').substring(0, 180);

  showAIDialog({
    icon: '🗑️',
    title: '¿Eliminar pregunta del banco?',
    bodyHtml: `
      <p style="color:#1e293b; font-size:0.88rem; margin:0 0 10px 0;">¿Estás seguro de que deseas eliminar esta pregunta del banco de evaluaciones?</p>
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px; font-size:0.8rem; color:#475569; font-style:italic; max-height:100px; overflow-y:auto; word-break:break-word;">
        "${escaparHtml(promptPreview)}"
      </div>
      <p style="color:#dc2626; font-size:0.75rem; margin:10px 0 0 0;">Esta acción borrará la pregunta del banco en esta sesión y en la base de datos.</p>
    `,
    buttons: [
      {
        label: 'Cancelar',
        style: 'padding:8px 14px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; border:1px solid #cbd5e1; background:#ffffff; color:#475569;',
        onClick: () => {}
      },
      {
        label: '🗑️ Sí, eliminar',
        style: 'padding:8px 14px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; border:none; background:#dc2626; color:#ffffff;',
        onClick: async () => {
          try {
            if (typeof ClassroomData !== 'undefined' && ClassroomData.deleteCustomEvaluation) {
              ClassroomData.deleteCustomEvaluation(target);
              if (optionalId) ClassroomData.deleteCustomEvaluation(optionalId);
              if (promptToDelete && promptToDelete !== target) {
                ClassroomData.deleteCustomEvaluation(promptToDelete);
              }
            }
            if (typeof SupabaseClient !== 'undefined' && SupabaseClient.deleteEvaluation) {
              await SupabaseClient.deleteEvaluation(target);
              if (optionalId) await SupabaseClient.deleteEvaluation(optionalId);
              if (promptToDelete && promptToDelete !== target) {
                await SupabaseClient.deleteEvaluation(promptToDelete);
              }
            }
            showToast('🗑️ Pregunta eliminada del banco');
            renderBankCards();
            if (typeof renderBankManagerQuestions === 'function') {
              renderBankManagerQuestions();
            }
          } catch (err) {
            console.error('[handleDeleteQuestionFromBank] Error:', err);
            showToast('⚠️ No se pudo eliminar: ' + (err.message || 'Error desconocido'));
          }
        }
      }
    ]
  });
}

/* ── GESTOR DEL BANCO DE PREGUNTAS POR GRADO (MODAL) ── */
let bankManagerActiveStage = 'primaria';
let bankManagerActiveGrade = null; // { stage: 'primaria', level: 4, label: '4° Pri.', fullLabel: '4° Primaria', value: 'primaria:4' }
let bankManagerFilterType = 'all'; // 'all' | 'rubric' | 'quick'
let bankManagerSearchQuery = '';

function openBankManagerModal() {
  // Determinar grado inicial: el del salón seleccionado o el primer grado habilitado en el catálogo
  let initialGrade = null;
  if (wizardClassroomId) {
    const clsGrade = ClassroomData.getClassroomGrade(wizardClassroomId);
    if (clsGrade && clsGrade.stage && clsGrade.level) {
      const isSec = clsGrade.stage === 'secundaria';
      const shortLabel = isSec ? `${clsGrade.level}° Sec.` : `${clsGrade.level}° Pri.`;
      initialGrade = {
        stage: clsGrade.stage,
        level: Number(clsGrade.level),
        label: shortLabel,
        fullLabel: ClassroomData.formatGrade(clsGrade.stage, clsGrade.level) || `${clsGrade.level}° Primaria`,
        value: `${clsGrade.stage}:${clsGrade.level}`
      };
      bankManagerActiveStage = clsGrade.stage;
    }
  }

  if (!initialGrade) {
    initialGrade = { stage: 'primaria', level: 4, label: '4° Pri.', fullLabel: '4° Primaria', value: 'primaria:4' };
    bankManagerActiveStage = 'primaria';
  }

  bankManagerActiveGrade = initialGrade;
  bankManagerFilterType = 'all';
  bankManagerSearchQuery = '';
  const searchInput = document.getElementById('bm-search-input');
  if (searchInput) searchInput.value = '';

  toggleBankManagerAddForm(false);
  renderBankManagerStageTabs();
  renderBankManagerGradeTabs();
  renderBankManagerFilterPills();
  renderBankManagerQuestions();
}

function closeBankManagerModal() {
  toggleBankManagerAddForm(false);
  if (typeof renderBankCards === 'function') renderBankCards();
}

function renderBankManagerStageTabs() {
  const container = document.getElementById('bank-manager-stage-tabs');
  if (!container) return;
  container.innerHTML = '';

  const stages = [
    { stage: 'primaria', label: 'Primaria' },
    { stage: 'secundaria', label: 'Secundaria' }
  ];

  stages.forEach(s => {
    const isActive = bankManagerActiveStage === s.stage;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = s.label;
    btn.style.cssText = [
      'padding:5px 16px',
      'border-radius:7px',
      'font-size:0.8rem',
      'font-weight:700',
      'cursor:pointer',
      'border:none',
      'transition:all 0.15s',
      isActive
        ? 'background:#0284c7; color:#ffffff; box-shadow:0 1px 4px rgba(2,132,199,0.3);'
        : 'background:transparent; color:#64748b;'
    ].join(';');

    btn.onclick = () => {
      bankManagerActiveStage = s.stage;
      const catalog = (typeof ClassroomData !== 'undefined' && ClassroomData.GRADE_CATALOG) || [];
      const entry = catalog.find(c => c.stage === s.stage);
      const grades = (entry && entry.grades) ? entry.grades : (s.stage === 'secundaria' ? [1,2,3,4,5] : [4,5,6]);
      const firstLevel = grades[0] || (s.stage === 'secundaria' ? 1 : 4);
      const isSec = s.stage === 'secundaria';
      const shortLabel = isSec ? `${firstLevel}° Sec.` : `${firstLevel}° Pri.`;

      bankManagerActiveGrade = {
        stage: s.stage,
        level: firstLevel,
        label: shortLabel,
        fullLabel: `${firstLevel}° ${s.label}`,
        value: `${s.stage}:${firstLevel}`
      };

      renderBankManagerStageTabs();
      renderBankManagerGradeTabs();
      renderBankManagerQuestions();
      toggleBankManagerAddForm(false);
    };

    container.appendChild(btn);
  });
}

function renderBankManagerGradeTabs() {
  const container = document.getElementById('bank-manager-grade-tabs');
  if (!container) return;
  container.innerHTML = '';

  const catalog = (typeof ClassroomData !== 'undefined' && ClassroomData.GRADE_CATALOG) || [];
  const entry = catalog.find(c => c.stage === bankManagerActiveStage) || {
    stage: bankManagerActiveStage,
    label: bankManagerActiveStage === 'secundaria' ? 'Secundaria' : 'Primaria',
    grades: bankManagerActiveStage === 'secundaria' ? [1, 2, 3, 4, 5] : [4, 5, 6]
  };

  entry.grades.forEach(lvl => {
    const isActive = bankManagerActiveGrade && bankManagerActiveGrade.stage === entry.stage && Number(bankManagerActiveGrade.level) === Number(lvl);
    const shortLabel = entry.stage === 'secundaria' ? `${lvl}° Sec.` : `${lvl}° Pri.`;
    const fullLabel = `${lvl}° ${entry.label}`;

    // Obtener conteo de preguntas para este grado
    const qList = (typeof ClassroomData !== 'undefined' && ClassroomData.getIndividualMCQuestions)
      ? ClassroomData.getIndividualMCQuestions(entry.stage, lvl)
      : [];
    const count = qList.length;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = `${shortLabel} (${count})`;
    btn.style.cssText = [
      'padding:6px 14px',
      'border-radius:20px',
      'font-size:0.78rem',
      'font-weight:700',
      'cursor:pointer',
      'transition:all 0.15s',
      isActive
        ? 'background:#0284c7; color:#ffffff; border:1.5px solid #0284c7; box-shadow:0 2px 6px rgba(2,132,199,0.25);'
        : 'background:#f8fafc; color:#475569; border:1.5px solid #e2e8f0;'
    ].join(';');

    if (!isActive) {
      btn.addEventListener('mouseenter', () => { btn.style.background = '#f1f5f9'; btn.style.borderColor = '#cbd5e1'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = '#f8fafc'; btn.style.borderColor = '#e2e8f0'; });
    }

    btn.onclick = () => {
      bankManagerActiveGrade = { stage: entry.stage, level: lvl, label: shortLabel, fullLabel: fullLabel, value: `${entry.stage}:${lvl}` };
      renderBankManagerGradeTabs();
      renderBankManagerQuestions();
      toggleBankManagerAddForm(false);
    };
    container.appendChild(btn);
  });
}

function renderBankManagerFilterPills() {
  const container = document.getElementById('bank-manager-filter-pills');
  if (!container) return;
  container.innerHTML = '';

  const filters = [
    {
      key: 'all',
      label: 'Todas',
      iconSvg: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>'
    },
    {
      key: 'rubric',
      label: 'Con Rúbrica',
      iconSvg: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"></path></svg>'
    },
    {
      key: 'quick',
      label: 'Sin Rúbrica',
      iconSvg: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>'
    }
  ];

  filters.forEach(f => {
    const isActive = bankManagerFilterType === f.key;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML = `${f.iconSvg}<span>${f.label}</span>`;
    btn.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'gap:5px',
      'padding:5px 12px',
      'border-radius:16px',
      'font-size:0.75rem',
      'font-weight:700',
      'cursor:pointer',
      'transition:all 0.15s',
      isActive
        ? 'background:#e0f2fe; color:#0369a1; border:1.5px solid #0284c7;'
        : 'background:#ffffff; color:#64748b; border:1.5px solid #e2e8f0;'
    ].join(';');

    btn.onclick = () => {
      bankManagerFilterType = f.key;
      renderBankManagerFilterPills();
      renderBankManagerQuestions();
    };

    container.appendChild(btn);
  });
}

function onBankManagerSearchInput(val) {
  bankManagerSearchQuery = (val || '').trim().toLowerCase();
  renderBankManagerQuestions();
}
window.onBankManagerSearchInput = onBankManagerSearchInput;

function renderBankManagerQuestions() {
  const container = document.getElementById('bank-manager-questions-container');
  const summaryText = document.getElementById('bank-manager-summary-text');
  if (!container || !bankManagerActiveGrade) return;
  container.innerHTML = '';

  const stage = bankManagerActiveGrade.stage;
  const level = Number(bankManagerActiveGrade.level);

  // Todas las preguntas del banco para este grado
  const allGradeQuestions = (typeof ClassroomData !== 'undefined' && ClassroomData.getIndividualMCQuestions)
    ? ClassroomData.getIndividualMCQuestions(stage, level)
    : [];

  const totalInGrade = allGradeQuestions.length;
  const countWithRubric = allGradeQuestions.filter(q => !!(q.hasRubric || q.rubric)).length;
  const countQuick = totalInGrade - countWithRubric;

  // Filtrado por tipo (todas / rúbrica / rápida)
  let filtered = allGradeQuestions;
  if (bankManagerFilterType === 'rubric') {
    filtered = filtered.filter(q => !!(q.hasRubric || q.rubric));
  } else if (bankManagerFilterType === 'quick') {
    filtered = filtered.filter(q => !(q.hasRubric || q.rubric));
  }

  // Filtrado por buscador
  if (bankManagerSearchQuery) {
    filtered = filtered.filter(q => {
      const p = (q.prompt || '').toLowerCase();
      const opts = q.options ? Object.values(q.options).join(' ').toLowerCase() : '';
      return p.includes(bankManagerSearchQuery) || opts.includes(bankManagerSearchQuery);
    });
  }

  if (summaryText) {
    summaryText.textContent = `${totalInGrade} pregunta${totalInGrade === 1 ? '' : 's'} en ${bankManagerActiveGrade.label} (${countWithRubric} con Rúbrica · ${countQuick} sin Rúbrica)` + (filtered.length !== totalInGrade ? ` — Mostrando ${filtered.length}` : '');
  }

  if (filtered.length === 0) {
    const isSearching = !!bankManagerSearchQuery || bankManagerFilterType !== 'all';
    container.innerHTML = `
      <div style="text-align:center; padding:36px 20px; background:#ffffff; border:1.5px dashed #cbd5e1; border-radius:12px; color:#64748b;">
        <span style="display:inline-flex; align-items:center; justify-content:center; width:44px; height:44px; border-radius:50%; background:#f1f5f9; color:#64748b; margin-bottom:10px;">
          ${isSearching
            ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>'
            : '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>'}
        </span>
        <div style="font-size:0.92rem; font-weight:700; color:#1e293b; margin-bottom:4px;">
          ${isSearching ? 'No se encontraron preguntas con los filtros aplicados' : `No hay preguntas para ${bankManagerActiveGrade.label}`}
        </div>
        <div style="font-size:0.75rem; color:#64748b;">
          ${isSearching ? 'Prueba cambiando el término de búsqueda o seleccionando "Todas".' : 'Haz clic en "Nueva Pregunta para este Grado" para agregar preguntas al banco.'}
        </div>
      </div>
    `;
    return;
  }

  // Renderizar preguntas de forma clara y unificada (sin textos redundantes sobre el enunciado)
  filtered.forEach(q => {
    const card = document.createElement('div');
    card.style.cssText = 'background:#ffffff; border:1.5px solid #e2e8f0; border-radius:12px; padding:14px 16px; display:flex; flex-direction:column; gap:10px; box-shadow:0 2px 6px rgba(15,23,42,0.03);';

    // Cabecera superior: exclusivamente acciones a la derecha
    const header = document.createElement('div');
    header.style.cssText = 'display:flex; justify-content:flex-end; align-items:center; gap:6px;';

    const hasRubric = !!(q.hasRubric || q.rubric);

    // Acciones de la derecha: Borrado vs Enlaces a sesión con iconos SVG profesionales
    const actionsBox = document.createElement('div');
    actionsBox.style.cssText = 'display:flex; align-items:center; gap:6px; flex-wrap:wrap;';

    const inSavedSessions = (typeof ClassroomData !== 'undefined' && typeof ClassroomData.getQuestionSavedSessions === 'function')
      ? ClassroomData.getQuestionSavedSessions(q.id, q.prompt)
      : [];

    if (inSavedSessions && inSavedSessions.length > 0) {
      // Bloqueada por estar en sesiones: solo botones directos a la sesión (sin etiqueta "En uso")
      inSavedSessions.forEach(s => {
        const btnLink = document.createElement('button');
        btnLink.type = 'button';
        btnLink.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg><span>Ir a Sesión ${s.sessionNumber}</span>`;
        btnLink.title = `Abrir la vista de evaluación de la sesión "${s.title}"`;
        btnLink.style.cssText = 'background:#eff6ff; border:1px solid #bfdbfe; color:#1d4ed8; border-radius:7px; padding:4px 10px; font-size:0.72rem; font-weight:700; cursor:pointer; transition:all 0.15s; display:inline-flex; align-items:center; gap:5px;';
        btnLink.addEventListener('mouseenter', () => { btnLink.style.background = '#dbeafe'; btnLink.style.borderColor = '#93c5fd'; });
        btnLink.addEventListener('mouseleave', () => { btnLink.style.background = '#eff6ff'; btnLink.style.borderColor = '#bfdbfe'; });
        btnLink.onclick = () => {
          if (typeof window.openSessionFromBank === 'function') {
            window.openSessionFromBank(s.sessionId);
          } else if (typeof loadAndActivateSavedSession === 'function') {
            loadAndActivateSavedSession(s.sessionId, { asDirectModalityView: true });
          }
        };
        actionsBox.appendChild(btnLink);
      });
    } else {
      // Disponible para eliminar
      const btnDel = document.createElement('button');
      btnDel.type = 'button';
      btnDel.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg><span>Eliminar</span>';
      btnDel.style.cssText = 'background:#fef2f2; border:1px solid #fecaca; color:#dc2626; border-radius:7px; padding:4px 10px; font-size:0.72rem; font-weight:700; cursor:pointer; transition:all 0.15s; display:inline-flex; align-items:center; gap:5px;';
      btnDel.addEventListener('mouseenter', () => { btnDel.style.background = '#dc2626'; btnDel.style.color = '#ffffff'; });
      btnDel.addEventListener('mouseleave', () => { btnDel.style.background = '#fef2f2'; btnDel.style.color = '#dc2626'; });
      btnDel.onclick = () => {
        handleDeleteQuestionFromBank(q.prompt, q.prompt, q.id);
      };
      actionsBox.appendChild(btnDel);
    }

    header.appendChild(actionsBox);

    // Enunciado
    const promptText = document.createElement('div');
    promptText.style.cssText = 'font-size:0.88rem; color:#1e293b; font-weight:600; line-height:1.45;';
    promptText.textContent = q.prompt;

    // Alternativas en 2 columnas
    const optsGrid = document.createElement('div');
    optsGrid.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:0.75rem;';
    ['A', 'B', 'C', 'D'].forEach(letter => {
      const isCorrect = (q.correct || 'A').toUpperCase() === letter;
      const optVal = q.options ? q.options[letter] : '';
      const optDiv = document.createElement('div');
      optDiv.style.cssText = isCorrect
        ? 'color:#15803d; font-weight:800; background:#dcfce7; padding:6px 10px; border-radius:6px; border:1.5px solid #86efac;'
        : 'color:#475569; padding:6px 10px; background:#f8fafc; border-radius:6px; border:1px solid #e2e8f0;';
      optDiv.textContent = `${letter}) ${optVal || '—'}` + (isCorrect ? ' ✓ (Clave)' : '');
      optsGrid.appendChild(optDiv);
    });

    // Pie de la tarjeta: Ver rúbrica o Generar rúbrica con iconos SVG
    const footer = document.createElement('div');
    footer.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-top:2px; flex-wrap:wrap; gap:8px;';

    if (hasRubric) {
      const btnRubric = document.createElement('button');
      btnRubric.type = 'button';
      btnRubric.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg><span>Ver Rúbrica de IA</span>';
      btnRubric.title = 'Ver la solución canónica, criterios y errores frecuentes generados por la IA';
      btnRubric.style.cssText = 'background:#f5f3ff; border:1px solid #ddd6fe; color:#6d28d9; border-radius:7px; padding:5px 12px; font-size:0.75rem; font-weight:700; cursor:pointer; transition:all 0.15s; display:inline-flex; align-items:center; gap:6px;';
      btnRubric.addEventListener('mouseenter', () => { btnRubric.style.background = '#6d28d9'; btnRubric.style.color = '#ffffff'; });
      btnRubric.addEventListener('mouseleave', () => { btnRubric.style.background = '#f5f3ff'; btnRubric.style.color = '#6d28d9'; });
      btnRubric.onclick = () => {
        handleViewQuestionRubric(q);
      };
      footer.appendChild(btnRubric);
    } else {
      const labelNoRubric = document.createElement('span');
      labelNoRubric.style.cssText = 'font-size:0.72rem; color:#64748b; display:inline-flex; align-items:center; gap:5px;';
      labelNoRubric.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg><span>Sin análisis de procedimiento</span>';

      const btnUpgrade = document.createElement('button');
      btnUpgrade.type = 'button';
      btnUpgrade.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"></path></svg><span>Generar Rúbrica IA</span>';
      btnUpgrade.title = 'Analizar este problema con Gemini para habilitarlo en la Rama 1 (evaluación de procedimiento)';
      btnUpgrade.style.cssText = 'background:#eff6ff; border:1px solid #bfdbfe; color:#1d4ed8; border-radius:7px; padding:5px 12px; font-size:0.75rem; font-weight:700; cursor:pointer; transition:all 0.15s; display:inline-flex; align-items:center; gap:6px;';
      btnUpgrade.addEventListener('mouseenter', () => { btnUpgrade.style.background = '#1d4ed8'; btnUpgrade.style.color = '#ffffff'; });
      btnUpgrade.addEventListener('mouseleave', () => { btnUpgrade.style.background = '#eff6ff'; btnUpgrade.style.color = '#1d4ed8'; });
      btnUpgrade.onclick = () => {
        handleUpgradeQuestionWithRubric(q);
      };

      footer.appendChild(labelNoRubric);
      footer.appendChild(btnUpgrade);
    }

    card.appendChild(header);
    card.appendChild(promptText);
    card.appendChild(optsGrid);
    card.appendChild(footer);
    container.appendChild(card);
  });
}

/**
 * Muestra la rúbrica pedagógica completa y análisis de IA para una pregunta del banco.
 */
function handleViewQuestionRubric(q) {
  if (!q) return;

  // Buscar la rúbrica asociada en la pregunta o en ClassroomData
  let r = q.rubric;
  if (!r && typeof ClassroomData !== 'undefined') {
    if (ClassroomData.getEvaluationRubric) {
      r = ClassroomData.getEvaluationRubric(q.id);
    }
    if (!r && ClassroomData.getEvaluation) {
      const ev = ClassroomData.getEvaluation(q.id);
      if (ev) r = ev.rubric;
    }
  }

  if (!r) {
    showAIDialog({
      icon: 'ℹ️',
      title: 'Sin Rúbrica Registrada',
      bodyHtml: `
        <div style="text-align:center; padding:18px 8px;">
          <div style="font-size:2.2rem; margin-bottom:8px;">📝</div>
          <div style="font-size:0.95rem; font-weight:800; color:#1e293b; margin-bottom:6px;">Esta pregunta no tiene rúbrica cargada aún</div>
          <div style="font-size:0.78rem; color:#64748b; line-height:1.45; max-width:400px; margin:0 auto;">
            Las preguntas creadas con el asistente incluyen automáticamente su análisis canónico, criterios de evaluación y errores previsibles de IA.
          </div>
        </div>
      `,
      buttons: [{ label: 'Entendido', style: 'padding:8px 16px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; border:none; background:#0284c7; color:#fff;', onClick: () => {} }]
    });
    return;
  }

  // Si la rúbrica viene serializada como string JSON
  if (typeof r === 'string') {
    try {
      r = JSON.parse(r);
    } catch (e) {
      // Mantener como texto libre si no es JSON
    }
  }

  const promptText = escaparHtml(q.prompt || '');
  let optsHtml = '';
  if (q.options) {
    optsHtml = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:8px; font-size:0.75rem;">
        ${['A', 'B', 'C', 'D'].map(l => {
          const isCorrect = (q.correct || 'A').toUpperCase() === l;
          const val = escaparHtml(q.options[l] || '');
          return `
            <div style="padding:5px 8px; border-radius:6px; ${isCorrect ? 'background:#dcfce7; color:#15803d; font-weight:800; border:1.5px solid #86efac;' : 'background:#ffffff; color:#475569; border:1px solid #e2e8f0;'}">
              ${l}) ${val} ${isCorrect ? '✓ (Clave Correcta)' : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  const questionBlock = `
    <div style="background:#f8fafc; border:1.5px solid #e2e8f0; border-radius:10px; padding:12px; margin-bottom:14px;">
      <div style="font-size:0.68rem; font-weight:800; color:#0284c7; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:4px;">Enunciado del Problema</div>
      <div style="font-size:0.88rem; color:#0f172a; font-weight:600; line-height:1.45;">${promptText}</div>
      ${optsHtml}
    </div>
  `;

  let rubricContentHtml = '';

  if (typeof r === 'object' && r !== null) {
    const canonica = r.respuesta_canonica || r.solucion || r.canonical_answer || (q.options && q.correct ? q.options[q.correct] : '');
    const unidad = r.unidad ? `<div style="text-align:right;"><span style="font-size:0.65rem; color:#64748b; font-weight:800; text-transform:uppercase; display:block;">Unidad</span><strong style="color:#0284c7; font-size:0.85rem;">${escaparHtml(r.unidad)}</strong></div>` : '';

    // Criterios de evaluación
    let criteriosHtml = '';
    if (Array.isArray(r.criterios) && r.criterios.length > 0) {
      criteriosHtml = `
        <div style="margin-top:12px;">
          <div style="font-size:0.68rem; font-weight:800; color:#0284c7; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:6px;">
            Criterios de Evaluación ${r.puntaje_total ? `· Total ${escaparHtml(String(r.puntaje_total))} pt` : ''}
          </div>
          <div style="display:flex; flex-direction:column; gap:6px;">
            ${r.criterios.map(c => `
              <div style="display:flex; gap:8px; align-items:flex-start; padding:8px 10px; background:#ffffff; border:1px solid #e2e8f0; border-radius:6px;">
                <span style="flex:0 0 auto; background:#e0f2fe; color:#0369a1; border-radius:6px; padding:2px 7px; font-size:0.7rem; font-weight:800; white-space:nowrap;">
                  ${escaparHtml(String(c.peso || '1'))} pt
                </span>
                <span style="flex:1; min-width:0;">
                  <div style="font-size:0.78rem; font-weight:700; color:#0f172a;">${escaparHtml(c.nombre || '')}</div>
                  <div style="font-size:0.72rem; color:#475569; line-height:1.4;">${escaparHtml(c.que_se_espera || c.descripcion || '')}</div>
                </span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Pasos de resolución / Procedimiento
    let pasosHtml = '';
    if (Array.isArray(r.solucion_pasos) && r.solucion_pasos.length > 0) {
      pasosHtml = `
        <div style="margin-top:12px;">
          <div style="font-size:0.68rem; font-weight:800; color:#7c3aed; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:6px;">Procedimiento de Resolución</div>
          <div style="display:flex; flex-direction:column; gap:4px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px;">
            ${r.solucion_pasos.map((p, i) => `
              <div style="font-size:0.78rem; color:#334155; line-height:1.45;">
                <span style="color:#7c3aed; font-weight:800;">${i + 1}.</span> ${escaparHtml(p)}
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else if (r.procedimiento_esperado) {
      pasosHtml = `
        <div style="margin-top:12px;">
          <div style="font-size:0.68rem; font-weight:800; color:#7c3aed; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:4px;">Procedimiento Esperado</div>
          <div style="font-size:0.78rem; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px; line-height:1.45;">
            ${escaparHtml(r.procedimiento_esperado)}
          </div>
        </div>
      `;
    }

    // Errores previsibles
    let erroresHtml = '';
    if (Array.isArray(r.errores_previsibles) && r.errores_previsibles.length > 0) {
      erroresHtml = `
        <div style="margin-top:12px;">
          <div style="font-size:0.68rem; font-weight:800; color:#dc2626; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:6px;">Errores Previsibles Detectados por IA</div>
          <div style="display:flex; flex-direction:column; gap:5px;">
            ${r.errores_previsibles.map(e => `
              <div style="font-size:0.75rem; color:#334155; background:#ffffff; border:1px solid #fecaca; border-radius:6px; padding:6px 10px; line-height:1.4;">
                <span style="background:#fee2e2; color:#dc2626; border-radius:4px; padding:1px 6px; font-size:0.65rem; font-weight:800; margin-right:6px;">${escaparHtml(e.tipo || 'Error')}</span>
                ${escaparHtml(e.descripcion || '')}
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Confianza del modelo
    const confVal = r.confianza ? Math.round(Number(r.confianza) <= 1 ? Number(r.confianza) * 100 : Number(r.confianza)) : null;
    const confBadge = confVal != null
      ? `<div style="margin-top:12px; padding-top:8px; border-top:1px solid #e2e8f0; font-size:0.7rem; color:#64748b; display:flex; justify-content:space-between; align-items:center;">
           <span>Análisis pedagógico generado por IA (Gemini)</span>
           <span>Confianza: <strong style="color:${confVal >= 70 ? '#16a34a' : confVal >= 40 ? '#d97706' : '#dc2626'};">${confVal}%</strong></span>
         </div>`
      : '';

    rubricContentHtml = `
      <div style="border:1.5px solid #d8b4fe; border-radius:10px; background:#faf5ff; padding:14px;">
        <div style="font-size:0.72rem; font-weight:800; color:#7c3aed; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:10px; display:flex; align-items:center; gap:6px;">
          <span>📋</span> Rúbrica Pedagógica de Corrección
        </div>

        <div style="display:flex; align-items:center; justify-content:space-between; background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px;">
          <div>
            <span style="font-size:0.65rem; color:#64748b; font-weight:800; text-transform:uppercase;">Respuesta Canónica</span>
            <div style="font-size:1.25rem; font-weight:900; color:#16a34a;">${escaparHtml(canonica || '—')}</div>
          </div>
          ${unidad}
        </div>

        ${criteriosHtml}
        ${pasosHtml}
        ${erroresHtml}
        ${confBadge}
      </div>
    `;
  } else {
    rubricContentHtml = `
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; font-size:0.8rem; color:#334155; white-space:pre-wrap; line-height:1.5;">
        ${escaparHtml(String(r))}
      </div>
    `;
  }

  showAIDialog({
    icon: '📋',
    title: 'Rúbrica y Análisis Pedagógico (IA)',
    bodyHtml: questionBlock + rubricContentHtml,
    maxWidth: '650px',
    buttons: [{ label: 'Cerrar', style: 'padding:8px 18px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; border:none; background:#0284c7; color:#fff;', onClick: () => {} }]
  });
}

function toggleBankManagerAddForm(show) {
  const form = document.getElementById('bank-manager-add-form');
  const btn = document.getElementById('btn-toggle-add-question');
  if (!form) return;
  const isVisible = form.style.display !== 'none';
  const target = (typeof show === 'boolean') ? show : !isVisible;
  form.style.display = target ? 'block' : 'none';
  if (btn) {
    btn.innerHTML = target
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg><span>Ocultar Formulario</span>'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg><span>Nueva Pregunta para este Grado</span>';
  }
  if (target) {
    const title = document.getElementById('bank-manager-form-title');
    if (title && bankManagerActiveGrade) {
      title.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        <span>Redactar Pregunta de Alternativas para ${bankManagerActiveGrade.label}</span>
      `;
    }
    const promptInput = document.getElementById('bm-prompt');
    if (promptInput) promptInput.focus();
    updateBMPromptCounter();
  }
}

function updateBMPromptCounter() {
  const ta = document.getElementById('bm-prompt');
  const counter = document.getElementById('bm-prompt-counter');
  const hint = document.getElementById('bm-prompt-hint');
  if (!ta) return;
  const len = ta.value.length;
  const lines = Math.max(1, Math.ceil(len / PROMPT_CHARS_PER_LINE));
  if (counter) {
    counter.textContent = len + ' / ' + PROMPT_MAX_CHARS;
    counter.style.color = len >= PROMPT_MAX_CHARS ? '#f59e0b' : '#64748b';
  }
  if (hint) {
    if (lines > 3) {
      hint.textContent = '⚠️ ' + lines + ' líneas: no entran en la ficha. Acortá el enunciado.';
      hint.style.color = '#ef4444';
    } else {
      hint.textContent = '≈ ' + lines + (lines === 1 ? ' línea' : ' líneas') + ' en la ficha · máximo 3';
      hint.style.color = '#64748b';
    }
  }
}

async function handleSaveQuestionFromManager() {
  if (!bankManagerActiveGrade) {
    showToast('⚠️ Selecciona un grado primero.');
    return;
  }

  const promptInput = document.getElementById('bm-prompt');
  const prompt = (promptInput?.value || '').trim();
  if (!prompt) {
    promptInput?.focus();
    showToast('⚠️ Escribí el enunciado de la pregunta.');
    return;
  }

  const optA = (document.getElementById('bm-opt-a')?.value || '').trim();
  const optB = (document.getElementById('bm-opt-b')?.value || '').trim();
  const optC = (document.getElementById('bm-opt-c')?.value || '').trim();
  const optD = (document.getElementById('bm-opt-d')?.value || '').trim();
  if (!optA || !optB || !optC || !optD) {
    showToast('⚠️ Completa las 4 alternativas (A, B, C, D).');
    return;
  }

  const rad = document.querySelector('input[name="bm-correct"]:checked');
  const correctKey = (rad ? rad.value : 'A').toUpperCase();

  // REGLA 6: Cero atajos. Análisis obligatorio con Gemini antes de guardar en banco
  const btn = document.getElementById('btn-bm-save');
  const hint = document.getElementById('bm-status-hint');
  const loader = startAILoadingState(btn, 'Analizando con IA', hint, 'Gemini está generando la rúbrica y criterios pedagógicos (~20-30 seg)...');

  let res = null;
  try {
    res = await SupabaseClient.generateRubric({
      prompt: prompt,
      grado: bankManagerActiveGrade.label
    });
  } catch (err) {
    res = { ok: false, error: err.message };
  } finally {
    loader.stop();
  }

  if (!res || !res.ok || !res.rubrica) {
    const errorMsg = (res && res.error) || 'La IA no devolvió una rúbrica estructurada.';
    showAIDialog({
      icon: '❌',
      title: 'No se pudo completar el análisis con IA',
      bodyHtml: `
        <div style="margin-bottom:8px;">La IA de Gemini no pudo responder a tiempo o falló:</div>
        <div style="background:#0f172a; padding:10px; border-radius:8px; border:1px solid #ef444450; color:#fca5a5; font-size:0.8rem; margin-bottom:12px; word-break:break-word;">
          ${escaparHtml(errorMsg)}
        </div>
        <div style="font-size:0.8rem; color:#94a3b8;">
          Por regla estricta del sistema, ninguna pregunta puede guardarse sin su análisis pedagógico. Puedes reintentar con la IA o revisar el enunciado.
        </div>
      `,
      buttons: [
        {
          label: '🔄 Reintentar con IA',
          style: 'padding:8px 14px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; border:none; background:#7c3aed; color:#fff;',
          onClick: () => handleSaveQuestionFromManager()
        },
        {
          label: '✏️ Revisar datos',
          style: 'padding:8px 14px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; border:1px solid #3b82f6; background:#3b82f620; color:#60a5fa;',
          onClick: () => {
            promptInput?.focus();
          }
        },
        {
          label: 'Cancelar',
          style: 'padding:8px 14px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; border:1px solid #475569; background:#1e293b; color:#cbd5e1;',
          onClick: () => {}
        }
      ]
    });
    return;
  }

  // Guardar pregunta completa con alternativas, clave y rúbrica de IA
  const evalObj = {
    title: 'Pregunta de alternativa',
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
      rubric: res.rubrica
    }],
    rubric: res.rubrica,
    gradeStage: bankManagerActiveGrade.stage,
    gradeLevel: Number(bankManagerActiveGrade.level),
    gradeText: bankManagerActiveGrade.label
  };

  ClassroomData.saveCustomEvaluation(evalObj);
  SupabaseClient.saveEvaluation(evalObj).catch(e => console.warn('[Manager Save Cloud]', e));

  showToast('✅ Pregunta guardada con éxito en el banco');

  // Limpiar campos y refrescar
  if (promptInput) promptInput.value = '';
  ['bm-opt-a', 'bm-opt-b', 'bm-opt-c', 'bm-opt-d'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const defaultRad = document.getElementById('bm-rad-a');
  if (defaultRad) defaultRad.checked = true;

  toggleBankManagerAddForm(false);
  renderBankManagerQuestions();
  if (typeof renderBankCards === 'function') renderBankCards();
}

/**
 * Guarda una pregunta rápida de alternativas directamente en el banco sin consultar a Gemini.
 * Apta para evaluación focalizada de contenido (Rama 2) y cartillas (Rama 3).
 */
async function handleSaveQuickQuestionFromManager() {
  if (!bankManagerActiveGrade) {
    showToast('⚠️ Selecciona un grado primero.');
    return;
  }

  const promptInput = document.getElementById('bm-prompt');
  const prompt = (promptInput?.value || '').trim();
  if (!prompt) {
    promptInput?.focus();
    showToast('⚠️ Escribí el enunciado de la pregunta.');
    return;
  }

  const optA = (document.getElementById('bm-opt-a')?.value || '').trim();
  const optB = (document.getElementById('bm-opt-b')?.value || '').trim();
  const optC = (document.getElementById('bm-opt-c')?.value || '').trim();
  const optD = (document.getElementById('bm-opt-d')?.value || '').trim();
  if (!optA || !optB || !optC || !optD) {
    showToast('⚠️ Completa las 4 alternativas (A, B, C, D).');
    return;
  }

  const rad = document.querySelector('input[name="bm-correct"]:checked');
  const correctKey = (rad ? rad.value : 'A').toUpperCase();

  const btnQuick = document.getElementById('btn-bm-save-quick');
  if (btnQuick) btnQuick.disabled = true;

  try {
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

    showToast('⚡ Pregunta rápida guardada con éxito en el banco');

    // Limpiar campos y refrescar
    if (promptInput) promptInput.value = '';
    ['bm-opt-a', 'bm-opt-b', 'bm-opt-c', 'bm-opt-d'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
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


// [results-manager.js] Extraído como módulo externo en la Tanda 2 (v3.1.31)

function selectEvaluation(evalObj) {
  // REGLA 2: Aislamiento total. Solo si es explícitamente 'mc' se activa OMR
  const isOMR = evalObj && evalObj.type === 'mc';
  const qCount = evalObj.questionCount || (evalObj.questions ? evalObj.questions.length : 1);
  wizardEvalType = isOMR ? (qCount === 2 ? 'mc2' : 'mc1') : 'free';
  wizardEval = evalObj;
  const isRama1 = !evalObj.branch || evalObj.branch === 'rama1';
  if (isOMR && isRama1 && typeof updateCorrectionModeUI === 'function') {
    updateCorrectionModeUI('full');
  }
  showSummary();
}

/* ── RÚBRICA DE CORRECCIÓN (IA) ──────────────────────────────────────
   El docente escribe solo el enunciado; la IA propone la solución canónica
   y los criterios de corrección; el docente decide.

   Dos reglas que NO se negocian:
     1. Si el docente ya escribió una respuesta esperada, la IA no la pisa.
        Si no coinciden se avisa: uno de los dos está equivocado, y ese
        contraste es la mejor red de seguridad que tiene el sistema.
     2. La rúbrica se genera UNA vez por evaluación y se guarda con ella,
        para que los 30 alumnos de la ficha se juzguen igual. */

let wizardRubric = null;      // rúbrica aceptada, lista para guardar
let wizardRubricMeta = null;  // de dónde salió, para trazabilidad
// Enunciado con el que se generó la rúbrica actual. Sirve para detectar que
// el docente cambió el problema DESPUÉS de generarla: si eso pasa, la rúbrica
// quedó vieja y corregir con ella sería un error silencioso en los 30 alumnos.
let wizardRubricPrompt = null;

/** Escapa texto antes de meterlo en innerHTML. */
function escaparHtml(t) {
  return String(t == null ? '' : t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Grado de un salón, en sus tres formas: las dos columnas comparables (etapa
 * y número) y el texto legible.
 *
 * Las tres se guardan CON la evaluación, porque la rúbrica se genera usando
 * el grado como contexto: en 4° y en 5° el mismo problema puede tener
 * distinto criterio, así que hay que poder saber con cuál se generó.
 */
function gradoDelSalon(classroomId) {
  if (!classroomId || typeof ClassroomData === 'undefined') {
    return { stage: null, level: null, texto: '' };
  }
  const cls = ClassroomData.getClassroom(classroomId);
  return {
    stage: (cls && cls.gradeStage) || null,
    level: (cls && cls.gradeLevel) || null,
    texto: (cls && ClassroomData.getClassroomGrade(classroomId)) || ''
  };
}

/** Grado del salón que el docente tiene elegido en el asistente. */
function gradoDelSalonSeleccionado() {
  const id = wizardClassroomId
    || (document.getElementById('builder-classroom') || {}).value;
  return gradoDelSalon(id);
}

/**
 * Grado del salón de la SESIÓN activa.
 *
 * Ojo con esto: la rúbrica tiene que generarse con el grado del salón de la
 * sesión, no con el que esté elegido en el asistente. Si el docente cambió de
 * salón en la pestaña 1 y volvió al escáner, el asistente y la sesión pueden
 * apuntar a salones distintos, y generar con el grado equivocado produciría
 * una rúbrica que no corresponde a la clase que está corrigiendo.
 */
function gradoDeLaSesion(session) {
  const s = session || ((typeof ClassroomData !== 'undefined') ? ClassroomData.getActiveSession() : null);
  const id = (s && s.classroomId) || wizardClassroomId;
  return gradoDelSalon(id);
}

/** "primaria:4" — la clave con la que se compara un grado con otro. */
function claveDeGrado(g) {
  return (g && g.stage && g.level) ? (g.stage + ':' + g.level) : null;
}

/**
 * ÚNICO lugar donde se decide si se puede escanear.
 *
 * Está centralizado a propósito: antes el aviso del visor y el control del
 * botón miraban cosas distintas y podían contradecirse (el visor decir
 * "tocá Iniciar Cámara" y el botón negarse, o al revés).
 *
 * @returns {{ok: boolean, motivo: string, detalle: string, puedeGenerar: boolean}}
 */
function estadoParaEscanear() {
  const session = (typeof ClassroomData !== 'undefined') ? ClassroomData.getActiveSession() : null;

  if (!session || !session.prompt || !String(session.prompt).trim()) {
    return { ok: false, motivo: 'sin-sesion', puedeGenerar: false,
      detalle: 'Primero configurá la sesión en la pestaña 1.' };
  }

  const cls = ClassroomData.getClassroom(session.classroomId);
  if (!cls) {
    return { ok: false, motivo: 'sin-salon', puedeGenerar: false,
      detalle: 'El salón de esta sesión ya no existe. Configurá la sesión de nuevo en la pestaña 1.' };
  }

  const ev = (typeof ClassroomData !== 'undefined')
    ? (ClassroomData.getEvaluation(session.evalId) || (session.questions && session.questions.length > 0 ? session : null))
    : null;

  if (!ev) {
    return { ok: false, motivo: 'sin-evaluacion', puedeGenerar: false,
      detalle: 'Esta sesión apunta a una evaluación que ya no está en el banco. Elige otra en la pestaña 1.' };
  }

  // ── MODO OPCIÓN MÚLTIPLE (OMR) vs RESPUESTA LIBRE (IA) ──
  // Las evaluaciones de Opción Múltiple (1P, 2P o Cartillas OMR) NO requieren rúbrica por IA.
  // Su corrección es directa y determinística leyendo las burbujas contra la clave de respuestas.
  const isOMR = (ev && ev.type === 'mc') ||
                (session && session.type === 'mc') ||
                (session && session.branch === 'rama3') ||
                (ev && ev.branch === 'rama3') ||
                (ev && ev.questionCount) ||
                (session && session.questionCount) ||
                (ev && Array.isArray(ev.questions) && ev.questions.length > 0) ||
                (session && Array.isArray(session.questions) && session.questions.length > 0);

  // El grado del salón y el de la pregunta tienen que coincidir en Respuesta Libre (IA)
  const gCls = claveDeGrado({ stage: cls.gradeStage, level: cls.gradeLevel });
  const gEv = claveDeGrado({ stage: ev.gradeStage, level: ev.gradeLevel });
  if (gCls && gEv && gCls !== gEv && !isOMR) {
    return { ok: false, motivo: 'grado-distinto', puedeGenerar: false,
      detalle: 'Esta pregunta es de ' + (ev.gradeText || gEv) + ' y el salón es de ' +
               (ClassroomData.getClassroomGrade(session.classroomId) || gCls) +
               '. Elige una pregunta del grado del salón.' };
  }

  if (!isOMR && !ev.rubric) {
    return { ok: false, motivo: 'sin-rubrica', puedeGenerar: true,
      detalle: 'A esta evaluación le falta la rúbrica: se genera al encender la cámara.' };
  }

  return { ok: true, motivo: 'listo', puedeGenerar: false, detalle: 'Tocá "Iniciar Cámara" para empezar.' };
}

/* ── DIAGNÓSTICO ─────────────────────────────────────────────────────
   Cuando algo falla en el celular no hay forma de mirar la consola: el
   docente no puede contarnos qué pasó y quedamos adivinando. Este botón
   vuelca TODO lo que la app sabe, como texto plano, para pegarlo y poder
   diagnosticar con datos.

   Es de SOLO LECTURA: no cambia nada, no manda nada a ningún lado y no
   incluye nombres de alumnos ni el contenido de las fotos. */

/** Arma el informe. Devuelve texto plano, a propósito. */
function construirDiagnostico() {
  const L = [];
  const sep = () => L.push('-----------------------------------------');
  const fila = (k, v) => L.push(k + ': ' + (v === undefined || v === null || v === '' ? '—' : v));

  L.push('=== DIAGNOSTICO MICROEVALUACION ===');
  fila('Momento', new Date().toLocaleString());

  sep();
  L.push('PANTALLA');
  fila('Ventana', window.innerWidth + 'x' + window.innerHeight);
  fila('Pantalla', (screen && screen.width ? screen.width : '?') + 'x' + (screen && screen.height ? screen.height : '?'));
  fila('Orientacion', (screen && screen.orientation && screen.orientation.type)
    || (window.innerWidth > window.innerHeight ? 'landscape' : 'portrait'));
  fila('Pantalla completa', document.fullscreenElement ? 'si' : 'no');
  fila('Camara', document.body.classList.contains('camera-active') ? 'encendida' : 'apagada');
  fila('Navegador', navigator.userAgent);

  const session = (typeof ClassroomData !== 'undefined') ? ClassroomData.getActiveSession() : null;
  const cls = session ? ClassroomData.getClassroom(session.classroomId) : null;
  const ev = session ? ClassroomData.getEvaluation(session.evalId) : null;

  sep();
  L.push('SESION');
  fila('sessionRef', session && session.sessionRef);
  fila('Salon', cls ? (cls.name + ' (' + cls.id + ')') : (session ? 'BORRADO: ' + session.classroomId : 'sin sesion'));
  fila('Alumnos', cls ? cls.students.length : '—');
  fila('Grado del salon', cls ? ((cls.gradeStage || 'sin etapa') + ':' + (cls.gradeLevel || 'sin numero')) : '—');
  fila('Evaluacion', ev ? (ev.title + ' (' + ev.id + ')') : (session ? 'BORRADA: ' + session.evalId : '—'));
  fila('Grado de la evaluacion', ev ? ((ev.gradeStage || 'sin etapa') + ':' + (ev.gradeLevel || 'sin numero')) : '—');
  fila('Respuesta esperada', session && session.expectedAnswer);
  fila('Rubrica', ev ? (ev.rubric ? 'SI' : 'NO') : '—');
  if (ev && ev.rubric) {
    fila('  - respuesta canonica', ev.rubric.respuesta_canonica);
    fila('  - procedimiento', ev.rubric.procedimiento_esperado);
    fila('  - confianza del modelo', ev.rubric.confianza);
    fila('  - formas aceptables', (ev.rubric.respuestas_aceptables || []).join(' | '));
  }

  sep();
  L.push('PERMISO PARA ESCANEAR');
  const estado = estadoParaEscanear();
  fila('Resultado', estado.ok ? 'LISTO' : 'BLOQUEADO');
  fila('Motivo', estado.motivo);
  fila('Detalle', estado.detalle);

  sep();
  L.push('BANCO');
  const g = gradoDelSalonSeleccionado();
  fila('Salon elegido en el asistente', wizardClassroomId || '—');
  fila('Grado del asistente', g.texto || '—');
  const lista = ClassroomData.getEvaluationList();
  fila('Preguntas en total', lista.length);
  fila('Preguntas de ese grado', (g.stage && g.level)
    ? lista.filter(e => e.gradeStage === g.stage && e.gradeLevel === g.level).length
    : 0);
  fila('Con rubrica / sin rubrica',
    lista.filter(e => e.hasRubric).length + ' / ' + lista.filter(e => !e.hasRubric).length);

  sep();
  L.push('ULTIMA CAPTURA');
  const dc = (typeof Scanner !== 'undefined' && Scanner.diagnostico) ? Scanner.diagnostico() : null;
  if (!dc || !dc.ultimaCaptura) {
    fila('Estado', 'todavia no se tomo ninguna foto');
  } else {
    const c = dc.ultimaCaptura;
    fila('Momento', c.momento);
    fila('Alumno resuelto', c.alumno);
    fila('QR leido', c.qrTexto || 'NO SE LEYO');
    fila('Intento de QR que funciono', c.intentoQr);
    fila('Cobertura / Nitidez', c.cobertura + '% / ' + c.nitidez + '%');
    fila('Brillo de la foto', c.brillo + '%');
    fila('Tiempo de enfoque', c.enfoque + ' s');
  }
  if (dc && dc.errores && dc.errores.length) {
    fila('Errores del escaner', dc.errores.length);
    dc.errores.slice(-5).forEach(e => L.push('  · ' + e));
  }

  sep();
  L.push('ULTIMA LLAMADA A LA IA');
  const ia = (typeof SupabaseClient !== 'undefined' && SupabaseClient.diagnosticoIA)
    ? SupabaseClient.diagnosticoIA() : null;
  if (!ia) {
    fila('Estado', 'todavia no se llamo');
  } else {
    fila('Momento', ia.cuando);
    fila('Resultado', ia.ok ? 'OK' : 'ERROR');
    fila('Funcion', ia.funcion);
    fila('Modelo', ia.modelo);
    fila('Duracion', ia.ms ? (ia.ms / 1000).toFixed(1) + ' s' : '—');
    fila('Reintentos', ia.reintentos);
    if (!ia.ok) fila('Error', ia.error);
  }

  sep();
  L.push('FIN DEL DIAGNOSTICO');
  return L.join('\n');
}

/** Copia el informe al portapapeles. Si el navegador no deja, lo muestra. */
async function copiarDiagnostico() {
  let texto;
  try {
    texto = construirDiagnostico();
  } catch (e) {
    texto = 'No se pudo armar el diagnostico: ' + (e && e.message);
  }

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(texto);
      showToast('✅ Diagnóstico copiado. Pegalo donde lo necesites.');
      return;
    }
  } catch (e) { /* el navegador lo bloqueó: se muestra para copiar a mano */ }

  window.prompt('Copiá el diagnóstico:', texto);
}

/**
 * Normaliza una respuesta para comparar: "85", "85 libros" y "85,00" son la
 * misma respuesta. La unidad no cambia el valor.
 */
function normalizarRespuesta(t) {
  let s = String(t == null ? '' : t).trim().toLowerCase();
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Separador de miles cubriendo el número entero: "1.250" y "1,250" = 1250
  const soloMiles = s.match(/^(-?\d{1,3}(?:[.,]\d{3})+)$/);
  if (soloMiles) return String(parseFloat(soloMiles[1].replace(/[.,]/g, '')));

  // Un único número: comparar el valor, ignorando la unidad y el formato
  const nums = s.match(/-?\d+(?:[.,]\d+)?/g);
  if (nums && nums.length === 1) return String(parseFloat(nums[0].replace(',', '.')));

  // Sin número (o varios): comparar el texto limpio
  return s.replace(/\s+/g, ' ').replace(/[.;]+$/, '');
}

/**
 * Cierra el modal de diálogo de IA y restablece el ancho por defecto.
 */
function closeAIDialogModal() {
  const modal = document.getElementById('ai-dialog-modal');
  if (modal) modal.style.display = 'none';
  const box = document.getElementById('ai-dialog-box');
  if (box) box.style.maxWidth = '520px';
}

/**
 * Muestra un modal interactivo con botones de acción para avisar fallos, timeouts,
 * rúbricas pedagógicas o incoherencias matemáticas de la IA.
 */
function showAIDialog({ icon = '⚠️', title = 'Aviso de IA', bodyHtml = '', buttons = [], maxWidth = null }) {
  const modal = document.getElementById('ai-dialog-modal');
  const box = document.getElementById('ai-dialog-box');
  const iconEl = document.getElementById('ai-dialog-icon');
  const titleEl = document.getElementById('ai-dialog-title');
  const bodyEl = document.getElementById('ai-dialog-body');
  const actionsEl = document.getElementById('ai-dialog-actions');
  if (!modal) return;

  if (box) box.style.maxWidth = maxWidth || '520px';

  iconEl.textContent = icon;
  titleEl.textContent = title;
  bodyEl.innerHTML = bodyHtml;
  actionsEl.innerHTML = '';

  buttons.forEach(btn => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = btn.label;
    b.style.cssText = btn.style || 'padding:8px 14px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; border:none; background:#3b82f6; color:#fff;';
    b.onclick = () => {
      closeAIDialogModal();
      if (typeof btn.onClick === 'function') btn.onClick();
    };
    actionsEl.appendChild(b);
  });

  modal.style.display = 'flex';
}

/**
 * Activa el estado de carga y contador de segundos en vivo sobre el botón de acción.
 */
function startAILoadingState(btn, activeLabel, hintEl, hintMsg) {
  if (!btn) return { stop: () => {} };
  const originalHtml = btn.innerHTML;
  const originalDisabled = btn.disabled;
  const originalOpacity = btn.style.opacity;
  const originalCursor = btn.style.cursor;

  btn.disabled = true;
  btn.style.opacity = '0.75';
  btn.style.cursor = 'wait';

  let seconds = 0;
  btn.innerHTML = `⏳ ${activeLabel} (${seconds}s)...`;

  if (hintEl) {
    hintEl.style.display = 'block';
    hintEl.innerHTML = hintMsg || 'Gemini está calculando la solución canónica y criterios pedagógicos (~20-30 seg)...';
  }

  const interval = setInterval(() => {
    seconds++;
    btn.innerHTML = `⏳ ${activeLabel} (${seconds}s)...`;
  }, 1000);

  return {
    stop: () => {
      clearInterval(interval);
      btn.disabled = originalDisabled;
      btn.style.opacity = originalOpacity;
      btn.style.cursor = originalCursor;
      btn.innerHTML = originalHtml;
      if (hintEl) hintEl.style.display = 'none';
    }
  };
}

/**
 * Coteja si la respuesta canónica calculada por la IA coincide con alguna de las alternativas
 * escritas por el docente y si coincide con la clave marcada.
 */
function verifyOptionConsistency(prompt, options, correctKey, rubric) {
  if (!rubric) return { ok: true };
  const canonica = String(rubric.respuesta_canonica || '').trim();
  if (!canonica) return { ok: true };

  const canonicaNorm = normalizarRespuesta(canonica);
  let matchedKey = null;

  for (const [k, v] of Object.entries(options)) {
    if (v && normalizarRespuesta(v) === canonicaNorm) {
      matchedKey = k;
      break;
    }
  }

  if (!matchedKey) {
    return {
      ok: false,
      type: 'no_match',
      canonica: canonica,
      options: options,
      correctKey: correctKey
    };
  }

  if (matchedKey !== correctKey) {
    return {
      ok: false,
      type: 'key_divergence',
      canonica: canonica,
      matchedKey: matchedKey,
      correctKey: correctKey,
      options: options
    };
  }

  return { ok: true, matchedKey: matchedKey, canonica: canonica };
}

/**
 * Lleva la respuesta canónica al campo de respuesta esperada.
 * Si el docente ya había escrito algo distinto, NO se sobrescribe: se avisa.
 */
function aplicarRespuestaCanonica(r) {
  const input = document.getElementById('input-eval-expected');
  const aviso = document.getElementById('answer-mismatch');
  if (!r) return;

  const canonica = String(r.respuesta_canonica || '').trim();
  if (!canonica) return;

  // Intentar vincular la respuesta canónica con las alternativas A, B, C, D
  const optA = document.getElementById('input-opt-a')?.value || '';
  const optB = document.getElementById('input-opt-b')?.value || '';
  const optC = document.getElementById('input-opt-c')?.value || '';
  const optD = document.getElementById('input-opt-d')?.value || '';
  const map = { A: optA, B: optB, C: optC, D: optD };

  let matchKey = null;
  for (const [k, v] of Object.entries(map)) {
    if (v && normalizarRespuesta(v) === normalizarRespuesta(canonica)) {
      matchKey = k;
      break;
    }
  }

  if (matchKey) {
    const rad = document.getElementById(`unified-rad-${matchKey.toLowerCase()}`);
    if (rad) rad.checked = true;
    syncUnifiedAnswer();
    if (aviso) {
      aviso.style.display = 'block';
      aviso.style.background = 'rgba(34, 197, 94, 0.12)';
      aviso.style.borderColor = '#22c55e';
      aviso.style.color = '#86efac';
      aviso.innerHTML = `✅ <strong>IA alineada:</strong> La respuesta canónica (<strong>${escaparHtml(canonica)}</strong>) coincide con la alternativa <strong>${matchKey}</strong>.`;
    }
    return;
  }

  syncUnifiedAnswer();
  if (aviso) {
    aviso.style.display = 'block';
    aviso.style.background = 'rgba(245, 158, 11, 0.12)';
    aviso.style.borderColor = '#f59e0b';
    aviso.style.color = '#fde68a';
    aviso.innerHTML = `💡 <strong>Respuesta canónica calculada por la IA:</strong> ${escaparHtml(canonica)}.<br>Asegurate de que una de tus alternativas (A, B, C o D) tenga este resultado y márcala con el círculo verde.`;
  }
}

/** Dibuja el panel de revisión de la rúbrica. */
function renderRubricPanel(r, meta) {
  const panel = document.getElementById('rubric-panel');
  if (!panel || !r) return;

  const lista = (titulo, items, color) => {
    if (!items || !items.length) return '';
    return '<div style="margin-top:9px;">' +
      '<div style="font-size:0.65rem; font-weight:800; color:' + color + '; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:4px;">' + titulo + '</div>' +
      items.map(x => '<div style="font-size:0.76rem; color:#cbd5e1; line-height:1.5;">• ' + escaparHtml(x) + '</div>').join('') +
      '</div>';
  };

  const pasos = (r.solucion_pasos || []).length
    ? '<div style="margin-top:9px;">' +
        '<div style="font-size:0.65rem; font-weight:800; color:#a78bfa; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:4px;">Cómo se resuelve</div>' +
        r.solucion_pasos.map((p, i) =>
          '<div style="font-size:0.76rem; color:#cbd5e1; line-height:1.5;">' +
          '<span style="color:#7c3aed; font-weight:800;">' + (i + 1) + '.</span> ' + escaparHtml(p) + '</div>').join('') +
      '</div>'
    : '';

  // Los criterios son lo que se puntúa: es la parte de la rúbrica que decide
  // la nota, así que va arriba y con los puntos a la vista.
  const criterios = (r.criterios || []).length
    ? '<div style="margin-top:10px;">' +
        '<div style="font-size:0.65rem; font-weight:800; color:#38bdf8; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:4px;">' +
        'Cómo se puntúa — total ' + escaparHtml(r.puntaje_total) + ' puntos</div>' +
        r.criterios.map(c =>
          '<div style="display:flex; gap:8px; align-items:flex-start; padding:6px 0; border-bottom:1px solid #1e293b;">' +
            '<span style="flex:0 0 auto; background:#0c4a6e; color:#7dd3fc; border-radius:6px; padding:2px 7px; font-size:0.7rem; font-weight:800; white-space:nowrap;">' +
            escaparHtml(c.peso) + ' pt</span>' +
            '<span style="flex:1; min-width:0;">' +
              '<div style="font-size:0.78rem; font-weight:700; color:#e2e8f0;">' + escaparHtml(c.nombre) + '</div>' +
              '<div style="font-size:0.72rem; color:#94a3b8; line-height:1.45;">' + escaparHtml(c.que_se_espera) + '</div>' +
            '</span>' +
          '</div>').join('') +
      '</div>'
    : '';

  const errores = (r.errores_previsibles || []).length
    ? '<div style="margin-top:9px;">' +
        '<div style="font-size:0.65rem; font-weight:800; color:#f87171; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:4px;">Errores previsibles</div>' +
        r.errores_previsibles.map(e =>
          '<div style="font-size:0.76rem; color:#cbd5e1; line-height:1.5;">' +
          '<span style="display:inline-block; background:#7f1d1d; color:#fca5a5; border-radius:4px; padding:0 5px; font-size:0.62rem; font-weight:800; margin-right:5px;">' +
          escaparHtml(e.tipo) + '</span>' + escaparHtml(e.descripcion) + '</div>').join('') +
      '</div>'
    : '';

  const supuestos = (r.supuestos || []).length
    ? '<div style="margin-top:9px; padding:8px 10px; border-radius:8px; background:rgba(245,158,11,0.08); border:1px solid #92400e;">' +
        '<div style="font-size:0.65rem; font-weight:800; color:#fbbf24; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:4px;">⚠️ Supuestos que tomó — revisalos</div>' +
        r.supuestos.map(x => '<div style="font-size:0.74rem; color:#fcd34d; line-height:1.5;">• ' + escaparHtml(x) + '</div>').join('') +
      '</div>'
    : '';

  const avisos = (r.avisos || []).length
    ? '<div style="margin-top:9px; padding:8px 10px; border-radius:8px; background:rgba(239,68,68,0.10); border:1px solid #991b1b;">' +
        '<div style="font-size:0.65rem; font-weight:800; color:#f87171; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:4px;">Avisos sobre el enunciado</div>' +
        r.avisos.map(x => '<div style="font-size:0.74rem; color:#fca5a5; line-height:1.5;">• ' + escaparHtml(x) + '</div>').join('') +
      '</div>'
    : '';

  const conf = Math.round((r.confianza || 0) * 100);
  const seg = meta && meta.ms ? ' · ' + (meta.ms / 1000).toFixed(1) + ' s' : '';
  const modelo = meta && meta.modelo ? escaparHtml(meta.modelo) + seg : '';

  panel.innerHTML =
    '<div style="border:1.5px solid #4c1d95; border-radius:10px; background:#0f172a; padding:12px;">' +
      '<div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">' +
        '<span style="font-size:0.72rem; font-weight:800; color:#a78bfa; text-transform:uppercase; letter-spacing:0.04em;">✨ Rúbrica de corrección</span>' +
        '<button onclick="descartarRubrica()" style="background:transparent; border:none; color:#64748b; font-size:0.68rem; cursor:pointer; text-decoration:underline;">descartar</button>' +
      '</div>' +

      '<div style="display:flex; align-items:center; justify-content:space-between; background:#1e293b; border-radius:8px; padding:8px 12px; margin-top:9px;">' +
        '<span style="font-size:0.65rem; color:#64748b; font-weight:800; text-transform:uppercase;">Respuesta canónica</span>' +
        '<span style="font-size:1.3rem; font-weight:900; color:#22c55e;">' + escaparHtml(r.respuesta_canonica) + '</span>' +
      '</div>' +
      (r.unidad ? '<div style="font-size:0.68rem; color:#64748b; margin-top:4px;">Unidad: <strong style="color:#94a3b8;">' + escaparHtml(r.unidad) + '</strong></div>' : '') +

      criterios +
      pasos +
      (r.procedimiento_esperado
        ? '<div style="margin-top:9px;"><div style="font-size:0.65rem; font-weight:800; color:#a78bfa; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:3px;">Procedimiento esperado</div>' +
          '<div style="font-size:0.76rem; color:#cbd5e1; line-height:1.5;">' + escaparHtml(r.procedimiento_esperado) + '</div></div>'
        : '') +
      lista('También se acepta', r.variantes_aceptables, '#4ade80') +
      lista('Formas válidas de escribirla', r.respuestas_aceptables, '#4ade80') +
      supuestos +
      errores +
      avisos +

      '<div style="margin-top:10px; padding-top:8px; border-top:1px solid #1e293b; font-size:0.64rem; color:#475569;">' +
        'Confianza del modelo: <strong style="color:' + (conf >= 70 ? '#4ade80' : conf >= 40 ? '#fbbf24' : '#f87171') + ';">' + conf + '%</strong>' +
        (modelo ? ' · ' + modelo : '') +
      '</div>' +
    '</div>';

  panel.style.display = 'block';
}

/** Descarta la rúbrica y su aviso, sin tocar la respuesta esperada. */
function descartarRubrica() {
  wizardRubric = null;
  wizardRubricMeta = null;
  wizardRubricPrompt = null;
  const panel = document.getElementById('rubric-panel');
  if (panel) { panel.style.display = 'none'; panel.innerHTML = ''; }
  const aviso = document.getElementById('answer-mismatch');
  if (aviso) aviso.style.display = 'none';
  const statusEl = document.getElementById('rubric-status');
  if (statusEl) { statusEl.textContent = ''; }
  const btn = document.getElementById('btn-rubric');
  if (btn) btn.style.borderColor = '';
}

/** Limpia todo el estado de la rúbrica (al abrir el formulario o resetear). */
function resetRubrica() {
  wizardRubric = null;
  wizardRubricMeta = null;
  wizardRubricPrompt = null;
  const panel = document.getElementById('rubric-panel');
  if (panel) { panel.style.display = 'none'; panel.innerHTML = ''; }
  const aviso = document.getElementById('answer-mismatch');
  if (aviso) aviso.style.display = 'none';
  const statusEl = document.getElementById('rubric-status');
  if (statusEl) { statusEl.textContent = ''; statusEl.style.color = '#64748b'; }
  const btn = document.getElementById('btn-rubric');
  if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.style.borderColor = ''; }
}

/** Pide la rúbrica a la Edge Function. */
async function handleGenerateRubric() {
  const ta = document.getElementById('input-eval-prompt');
  const statusEl = document.getElementById('rubric-status');
  const btn = document.getElementById('btn-rubric');
  const prompt = ta ? ta.value.trim() : '';

  if (!prompt) {
    if (ta) { ta.style.borderColor = '#ef4444'; ta.focus(); }
    showToast('⚠️ Escribí primero el enunciado del problema.');
    return;
  }

  // GUARDARRAÍL: sin grado no se genera la rúbrica. La rúbrica se construye
  // TOMANDO el grado como contexto (qué procedimiento se considera válido),
  // así que una rúbrica sin grado sale genérica y después juzga mal.
  const g = gradoDelSalonSeleccionado();
  if (!g.stage || !g.level) {
    if (statusEl) {
      statusEl.textContent = '⚠️ Este salón no tiene grado';
      statusEl.style.color = '#f59e0b';
    }
    const gBlock = document.getElementById('grade-block');
    if (gBlock && gBlock.scrollIntoView) gBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast('⚠️ Completa el grado del salón en el paso 1: la rúbrica se genera con ese grado.');
    return;
  }

  const grado = g.texto;
  if (statusEl) {
    statusEl.textContent = '⏳ Pensando la solución y criterios pedagógicos...';
    statusEl.style.color = '#a78bfa';
  }

  const loader = startAILoadingState(btn, 'Analizando con IA', null, null);
  const res = await SupabaseClient.generateRubric({ prompt: prompt, grado: grado });
  loader.stop();

  if (!res || !res.ok || !res.rubrica) {
    const errorMsg = (res && res.error) || 'La función no devolvió una rúbrica estructurada.';
    if (statusEl) { statusEl.textContent = '❌ Falló el análisis'; statusEl.style.color = '#f87171'; }
    showAIDialog({
      icon: '❌',
      title: 'No se pudo generar el análisis pedagógico con IA',
      bodyHtml: `<div style="margin-bottom:8px;">Gemini no pudo responder satisfactoriamente:</div>
        <div style="background:#0f172a; padding:10px; border-radius:8px; border:1px solid #ef444450; color:#fca5a5; font-size:0.8rem; margin-bottom:12px; word-break:break-word;">
          ${escaparHtml(errorMsg)}
        </div>
        <div style="font-size:0.8rem; color:#94a3b8;">
          Puedes intentar de nuevo, o puedes continuar guardando la pregunta sin análisis de procedimiento.
        </div>`,
      buttons: [
        {
          label: '🔄 Reintentar con IA',
          style: 'padding:8px 14px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; border:none; background:#7c3aed; color:#fff;',
          onClick: () => handleGenerateRubric()
        },
        {
          label: 'Cerrar',
          style: 'padding:8px 14px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; border:1px solid #475569; background:#1e293b; color:#94a3b8;'
        }
      ]
    });
    return;
  }

  wizardRubric = res.rubrica;
  wizardRubricMeta = res.meta || null;
  wizardRubricPrompt = prompt;

  const btnRub = document.getElementById('btn-rubric');
  if (btnRub) btnRub.style.borderColor = '';

  if (statusEl) {
    statusEl.textContent = '✅ Rúbrica lista' +
      (res.meta && res.meta.ms ? ' en ' + (res.meta.ms / 1000).toFixed(1) + ' s' : '') +
      ' para ' + grado;
    statusEl.style.color = '#4ade80';
  }

  aplicarRespuestaCanonica(res.rubrica);
  renderRubricPanel(res.rubrica, res.meta);
}

/* ── LA RÚBRICA SE GENERA AL CREAR LA PREGUNTA ───────────────────────
   Regla acordada: TODA pregunta entra al banco con su rúbrica. No se genera
   después ni queda a medias. Así el banco es una lista de evaluaciones listas
   para usar y la corrección con IA siempre tiene lo que necesita.

   Dos controles, entonces:
     1. Acá: no se puede confirmar una evaluación sin rúbrica, ni con una
        rúbrica que quedó vieja porque se cambió el enunciado.
     2. Al encender la cámara: red de seguridad para las preguntas de ejemplo
        que ya estaban en el banco antes de esta regla y no tienen rúbrica. */

/**
 * Genera y guarda la rúbrica de la evaluación activa sin salir del escáner.
 * Solo se usa para las preguntas viejas que no tienen: las nuevas ya nacen
 * con la suya.
 * @returns {Promise<boolean>} true si quedó lista
 */
async function generarRubricaDeLaSesion() {
  const session = (typeof ClassroomData !== 'undefined') ? ClassroomData.getActiveSession() : null;
  if (!session || !session.prompt) {
    showToast('⚠️ No hay una evaluación activa.');
    return false;
  }

  const isOMR = (session.type === 'mc') || (session.questionCount) ||
                (Array.isArray(session.questions) && session.questions.length > 0);
  if (isOMR) {
    return true;
  }

  // El grado sale del salón de la SESIÓN, no del que esté elegido en el
  // asistente: si el docente cambió de salón en la pestaña 1 y volvió al
  // escáner, generar con el grado del asistente produciría una rúbrica que no
  // corresponde a la clase que está corrigiendo.
  const g = gradoDeLaSesion(session);
  if (!g.stage || !g.level) {
    showToast('⚠️ El salón de esta sesión no tiene grado. Completalo en la pestaña 1 antes de corregir.');
    return false;
  }

  showToast('⏳ Generando la rúbrica...');

  const res = await SupabaseClient.generateRubric({ prompt: session.prompt, grado: g.texto });
  if (!res.ok) {
    showToast('❌ ' + res.error);
    return false;
  }

  // Se guarda sobre la MISMA evaluación, con su grado, para que quede lista
  // para las próximas clases y no haya que generarla de nuevo.
  const guardada = ClassroomData.saveCustomEvaluation({
    id: session.evalId,
    title: session.title || 'Evaluación',
    prompt: session.prompt,
    expectedAnswer: session.expectedAnswer || '',
    rubric: res.rubrica,
    gradeStage: g.stage || undefined,
    gradeLevel: g.level || undefined,
    gradeText: g.texto || undefined
  });

  wizardRubric = res.rubrica;
  if (typeof renderBankCards === 'function') renderBankCards();

  SupabaseClient.saveEvaluation({
    prompt: session.prompt,
    expectedAnswer: session.expectedAnswer || '',
    title: guardada.title,
    rubric: res.rubrica,
    gradeStage: g.stage,
    gradeLevel: g.level,
    gradeText: g.texto
  }).catch(e => console.warn('[Rúbrica] No se pudo guardar en Supabase:', e && e.message));

  showToast('✅ Rúbrica lista. Puedes revisarla en la pestaña 1.');
  return true;
}

/**
 * Botón de la cámara.
 *
 * GUARDARRAÍL: antes de ENCENDER se consulta estadoParaEscanear(), que es el
 * único lugar donde se decide si se puede escanear. Apagar la cámara siempre
 * se puede.
 *
 * Qué cubre, en orden:
 *   · sin sesión configurada → no arranca (el aviso ya está en pantalla);
 *   · el salón de la sesión ya no existe → no arranca;
 *   · la evaluación ya no está en el banco → no arranca;
 *   · la pregunta es de otro grado que el salón → no arranca: la rúbrica se
 *     generó con el grado de la PREGUNTA, así que corregir así juzgaría con el
 *     criterio de otro grado;
 *   · falta la rúbrica → ofrece generarla (solo si hay con qué).
 */
/**
 * Detiene la cámara si está encendida y vuelve a la vista de Fichas.
 * Es el único punto de salida del escáner durante el escaneo en vivo.
 */
function salirDelEscaner() {
  if (typeof Scanner !== 'undefined' && Scanner.stopCamera) {
    Scanner.stopCamera();
  }
  switchTab('create');
}
window.salirDelEscaner = salirDelEscaner;

async function intentarIniciarCamara() {
  const encendida = document.body.classList.contains('camera-active');

  if (!encendida) {
    const estado = estadoParaEscanear();

    if (!estado.ok) {
      if (estado.puedeGenerar) {
        const quiere = window.confirm(
          'Esta evaluación todavía no tiene rúbrica.\n\n' +
          'La IA la necesita para corregir: sin ella no puede juzgar a todo el ' +
          'salón con el mismo criterio ni decir qué error cometió el alumno.\n\n' +
          '¿La genero ahora? Tarda unos segundos.'
        );
        if (!quiere) return;
        const lista = await generarRubricaDeLaSesion();
        if (!lista) return;
      } else {
        // Sin sesión configurada, con la evaluación borrada, o con una
        // pregunta de otro grado: NO se enciende. Escanear así no guardaría
        // nada (o guardaría contra una consigna que no es la de la clase), y
        // el docente se enteraría recién al final.
        showToast('⚠️ ' + estado.detalle);
        return;
      }
    }
  }

  if (typeof Scanner !== 'undefined' && Scanner.toggleCamera) Scanner.toggleCamera();
}

async function confirmUnifiedEvaluation() {
  try {
    if (!wizardClassroomId) {
      const sel = document.getElementById('builder-classroom');
      if (sel && sel.value) {
        wizardClassroomId = sel.value;
        onClassroomSelectChanged(sel.value);
      }
    }
    if (!wizardClassroomId) {
      showToast('⚠️ Primero elige un salón de clases en el Paso 1.');
      return;
    }

    const promptInput = document.getElementById('input-eval-prompt');
    const prompt = (promptInput?.value || '').trim();
    if (!prompt) {
      promptInput?.focus();
      showToast('⚠️ Escribí el enunciado de la pregunta.');
      return;
    }

    const optA = (document.getElementById('input-opt-a')?.value || '').trim();
    const optB = (document.getElementById('input-opt-b')?.value || '').trim();
    const optC = (document.getElementById('input-opt-c')?.value || '').trim();
    const optD = (document.getElementById('input-opt-d')?.value || '').trim();

    if (!optA || !optB || !optC || !optD) {
      showToast('⚠️ Completa las 4 alternativas (A, B, C, D).');
      return;
    }

    const rad = document.querySelector('input[name="eval-unified-correct"]:checked');
    const correctKey = (rad ? rad.value : 'A').toUpperCase();
    const optionsMap = { A: optA, B: optB, C: optC, D: optD };
    const correctText = optionsMap[correctKey] || '';

    const g = gradoDelSalonSeleccionado();
    if (!g.stage || !g.level) {
      showToast('⚠️ Completa el grado del salón en el paso 1.');
      return;
    }

    // Si aún no se generó la rúbrica con Gemini, intentar generarla
    if (!wizardRubric) {
      const btn = document.getElementById('btn-confirm-unified');
      const hint = document.getElementById('unified-status-hint');
      const loader = startAILoadingState(btn, 'Analizando con IA', hint, 'Gemini está calculando la solución canónica y criterios pedagógicos (~20-30 seg)...');

      const res = await SupabaseClient.generateRubric({ prompt: prompt, grado: g.texto || '4° de primaria' });
      loader.stop();

      if (!res || !res.ok || !res.rubrica) {
        const errorMsg = (res && res.error) || 'La función no devolvió una rúbrica estructurada.';
        showAIDialog({
          icon: '❌',
          title: 'No se pudo completar el análisis con IA',
          bodyHtml: `<div style="margin-bottom:8px;">La IA de Gemini no pudo responder a tiempo o falló:</div>
            <div style="background:#0f172a; padding:10px; border-radius:8px; border:1px solid #ef444450; color:#fca5a5; font-size:0.8rem; margin-bottom:12px; word-break:break-word;">
              ${escaparHtml(errorMsg)}
            </div>
            <div style="font-size:0.8rem; color:#94a3b8;">
              Por regla del sistema, ninguna pregunta puede guardarse sin su análisis pedagógico. Puedes reintentar con la IA o revisar el enunciado.
            </div>`,
          buttons: [
            {
              label: '🔄 Reintentar con IA',
              style: 'padding:8px 14px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; border:none; background:#7c3aed; color:#fff;',
              onClick: () => confirmUnifiedEvaluation()
            },
            {
              label: '✏️ Revisar enunciado',
              style: 'padding:8px 14px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; border:1px solid #3b82f6; background:#3b82f620; color:#60a5fa;',
              onClick: () => {
                const ta = document.getElementById('input-eval-prompt');
                if (ta) ta.focus();
              }
            },
            {
              label: 'Cerrar',
              style: 'padding:8px 14px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; border:1px solid #475569; background:#1e293b; color:#94a3b8;'
            }
          ]
        });
        return;
      }

      wizardRubric = res.rubrica;
      wizardRubricMeta = res.meta || null;
      wizardRubricPrompt = prompt;
      renderRubricPanel(res.rubrica, res.meta);
    }

    // Cotejar consistencia entre lo calculado por la IA y las opciones escritas por el docente
    const check = verifyOptionConsistency(prompt, optionsMap, correctKey, wizardRubric);
    if (!check.ok) {
      if (check.type === 'no_match') {
        showAIDialog({
          icon: '⚠️',
          title: 'Advertencia de Incoherencia Matemática',
          bodyHtml: `<div style="margin-bottom:8px;">Para el ejercicio <em>"${escaparHtml(prompt)}"</em>:</div>
            <div style="background:#0f172a; padding:10px; border-radius:8px; border:1px solid #f59e0b50; margin-bottom:12px;">
              <div style="font-size:0.82rem; color:#fde68a; margin-bottom:4px;">
                Respuesta calculada por la IA: <strong>${escaparHtml(check.canonica)}</strong>
              </div>
              <div style="font-size:0.75rem; color:#94a3b8;">
                Tus alternativas son: <strong>A)</strong> ${escaparHtml(optionsMap.A)} | <strong>B)</strong> ${escaparHtml(optionsMap.B)} | <strong>C)</strong> ${escaparHtml(optionsMap.C)} | <strong>D)</strong> ${escaparHtml(optionsMap.D)}
              </div>
            </div>
            <div style="font-size:0.8rem; color:#cbd5e1;">
              Ninguna de tus 4 alternativas tiene el valor <strong>${escaparHtml(check.canonica)}</strong>. ¿Deseas corregir las alternativas o confirmar de todos modos?
            </div>`,
          buttons: [
            {
              label: '✏️ Corregir alternativas',
              style: 'padding:8px 14px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; border:1px solid #f59e0b; background:#f59e0b20; color:#fbbf24;',
              onClick: () => {
                const inputA = document.getElementById('input-opt-a');
                if (inputA) inputA.focus();
              }
            },
            {
              label: 'Confirmar de todos modos',
              style: 'padding:8px 14px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; border:none; background:#2563eb; color:#fff;',
              onClick: () => saveAndProceedUnified(prompt, optionsMap, correctKey, g, wizardRubric)
            }
          ]
        });
        return;
      } else if (check.type === 'key_divergence') {
        showAIDialog({
          icon: '💡',
          title: 'Sugerencia de Clave Correcta',
          bodyHtml: `<div style="margin-bottom:8px;">Para el ejercicio <em>"${escaparHtml(prompt)}"</em>:</div>
            <div style="background:#0f172a; padding:10px; border-radius:8px; border:1px solid #3b82f650; margin-bottom:12px;">
              <div style="font-size:0.82rem; color:#93c5fd; margin-bottom:4px;">
                La IA calculó <strong>${escaparHtml(check.canonica)}</strong>, que coincide con la alternativa <strong>${check.matchedKey}</strong>.
              </div>
              <div style="font-size:0.75rem; color:#94a3b8;">
                Sin embargo, marcaste como correcta la alternativa <strong>${check.correctKey}</strong>.
              </div>
            </div>
            <div style="font-size:0.8rem; color:#cbd5e1;">
              ¿Deseas cambiar la clave correcta a <strong>${check.matchedKey}</strong>?
            </div>`,
          buttons: [
            {
              label: `✓ Cambiar a clave ${check.matchedKey} y Continuar`,
              style: 'padding:8px 14px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; border:none; background:#16a34a; color:#fff;',
              onClick: () => {
                const radMatch = document.getElementById(`unified-rad-${check.matchedKey.toLowerCase()}`);
                if (radMatch) radMatch.checked = true;
                saveAndProceedUnified(prompt, optionsMap, check.matchedKey, g, wizardRubric);
              }
            },
            {
              label: `Mantener clave ${check.correctKey} y Continuar`,
              style: 'padding:8px 14px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; border:1px solid #475569; background:#1e293b; color:#94a3b8;',
              onClick: () => saveAndProceedUnified(prompt, optionsMap, check.correctKey, g, wizardRubric)
            }
          ]
        });
        return;
      }
    }

    saveAndProceedUnified(prompt, optionsMap, correctKey, g, wizardRubric);
  } catch (err) {
    console.error('[confirmUnifiedEvaluation Error]', err);
    showToast('⚠️ Error al confirmar: ' + err.message);
  }
}

function saveAndProceedUnified(prompt, optionsMap, correctKey, g, rubric) {
  if (!rubric) {
    showToast('⚠️ GUARDARRAÍL: Toda pregunta debe tener su análisis pedagógico con IA.');
    return;
  }
  const isMC = wizardEvalType === 'mc1';
  const evalType = isMC ? 'mc' : 'free';
  const correctText = optionsMap[correctKey] || '';

  const qSingle = {
    prompt: prompt,
    options: optionsMap,
    correct: correctKey,
    gradeStage: g.stage || null,
    gradeLevel: g.level || null,
    gradeText: g.texto || null,
    title: isMC ? 'Evaluación (1 Pregunta)' : 'Evaluación de Respuesta Libre'
  };

  const evalObj = {
    title: isMC ? 'Evaluación (1 Pregunta)' : 'Evaluación de Respuesta Libre',
    type: evalType,
    questionCount: 1,
    prompt: prompt,
    expectedAnswer: isMC ? `Clave: ${correctKey}` : correctText,
    options: optionsMap,
    correct: correctKey,
    rubric: rubric || null,
    questions: [qSingle],
    gradeStage: g.stage || null,
    gradeLevel: g.level || null,
    gradeText: g.texto || null
  };

  const saved = ClassroomData.saveCustomEvaluation(evalObj);

  // Guardar en Supabase (fire and forget)
  if (typeof SupabaseClient !== 'undefined' && SupabaseClient.saveEvaluation) {
    SupabaseClient.saveEvaluation({
      prompt: prompt,
      expectedAnswer: evalObj.expectedAnswer,
      title: saved.title,
      rubric: evalObj.rubric,
      gradeStage: g.stage,
      gradeLevel: g.level,
      gradeText: g.texto,
      type: evalType,
      questionCount: 1,
      questions: [qSingle]
    }).catch(e => console.warn('[Banco] No se pudo guardar en Supabase:', e && e.message));
  }

  wizardEvalType = isMC ? 'mc1' : 'free';
  wizardEval = saved;
  const isRama1 = !saved.branch || saved.branch === 'rama1';
  if (isMC && isRama1 && typeof updateCorrectionModeUI === 'function') {
    updateCorrectionModeUI('full');
  }
  showSummary();
}


function promptMCCorrectionMode() {
  const modal = document.getElementById('modal-mc-correction-mode');
  if (modal) {
    modal.style.display = 'flex';
  } else {
    showSummary();
  }
}

function selectMCCorrectionModeAndProceed(mode) {
  const modal = document.getElementById('modal-mc-correction-mode');
  if (modal) modal.style.display = 'none';

  const radio = document.querySelector(`input[name="mc-correction-mode"][value="${mode}"]`);
  if (radio) radio.checked = true;
  updateCorrectionModeUI(mode);

  showSummary();
}

// =============================================================================

// ── EXPOSICIÓN GLOBAL DE FUNCIONES DEL BANCO Y RÚBRICAS IA ──
// ── EXPOSICIÓN GLOBAL DE FUNCIONES PARA EVENTOS EN LÍNEA (HTML ONCLICK) ──
if (typeof window !== 'undefined') {
  window.escaparHtml = escaparHtml;
  window.gradoDelSalon = gradoDelSalon;
  window.gradoDelSalonSeleccionado = gradoDelSalonSeleccionado;
  window.gradoDeLaSesion = gradoDeLaSesion;
  window.claveDeGrado = claveDeGrado;
  window.estadoParaEscanear = estadoParaEscanear;
  window.construirDiagnostico = construirDiagnostico;
  window.copiarDiagnostico = copiarDiagnostico;
  window.openBankManagerModal = openBankManagerModal;
  window.closeBankManagerModal = closeBankManagerModal;
  window.renderBankManagerStageTabs = renderBankManagerStageTabs;
  window.renderBankManagerGradeTabs = renderBankManagerGradeTabs;
  window.renderBankManagerFilterPills = renderBankManagerFilterPills;
  window.renderBankManagerQuestions = renderBankManagerQuestions;
  window.onBankManagerSearchInput = onBankManagerSearchInput;
  window.handleViewQuestionRubric = handleViewQuestionRubric;
  window.toggleBankManagerAddForm = toggleBankManagerAddForm;
  window.updateBMPromptCounter = updateBMPromptCounter;
  window.handleSaveQuestionFromManager = handleSaveQuestionFromManager;
  window.handleSaveQuickQuestionFromManager = handleSaveQuickQuestionFromManager;
  window.handleUpgradeQuestionWithRubric = handleUpgradeQuestionWithRubric;
  window.renderBankCards = renderBankCards;
  window.handleDeleteQuestionFromBank = handleDeleteQuestionFromBank;
  window.evaluacionesDelGradoActual = evaluacionesDelGradoActual;
  window.selectEvaluation = selectEvaluation;
  window.showAIDialog = showAIDialog;
  window.closeAIDialogModal = closeAIDialogModal;
  window.handleGenerateRubric = handleGenerateRubric;
  window.generarRubricaDeLaSesion = generarRubricaDeLaSesion;
  window.descartarRubrica = descartarRubrica;
  window.resetRubrica = resetRubrica;
  window.updatePromptCounter = updatePromptCounter;
  window.updatePromptCounterFree = updatePromptCounterFree;
  window.confirmUnifiedEvaluation = confirmUnifiedEvaluation;

  window.promptMCCorrectionMode = promptMCCorrectionMode;
  window.selectMCCorrectionModeAndProceed = selectMCCorrectionModeAndProceed;
  window.salirDelEscaner = salirDelEscaner;
  window.intentarIniciarCamara = intentarIniciarCamara;

}
