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
  const promptPreview = (displayText || promptToDelete || '').substring(0, 180);

  showAIDialog({
    icon: '🗑️',
    title: '¿Eliminar pregunta del banco?',
    bodyHtml: `
      <p style="color:#e2e8f0; font-size:0.88rem; margin:0 0 10px 0;">¿Estás seguro de que deseas eliminar esta pregunta del banco de evaluaciones?</p>
      <div style="background:#0f172a; border:1px solid #334155; border-radius:8px; padding:10px; font-size:0.8rem; color:#94a3b8; font-style:italic; max-height:100px; overflow-y:auto; word-break:break-word;">
        "${escaparHtml(promptPreview)}"
      </div>
      <p style="color:#f87171; font-size:0.75rem; margin:10px 0 0 0;">Esta acción borrará la pregunta del banco en esta sesión y en la base de datos.</p>
    `,
    buttons: [
      {
        label: 'Cancelar',
        style: 'padding:8px 14px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; border:1px solid #475569; background:#1e293b; color:#cbd5e1;',
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
let bankManagerActiveGrade = null; // { stage: 'primaria', level: 4, label: '4° Primaria' }

function openBankManagerModal() {
  const modal = document.getElementById('bank-manager-modal');
  if (!modal) return;

  // Determinar grado inicial: el del salón seleccionado o el primer grado habilitado en el catálogo
  let initialGrade = null;
  if (wizardClassroomId) {
    const clsGrade = ClassroomData.getClassroomGrade(wizardClassroomId);
    if (clsGrade && clsGrade.stage && clsGrade.level) {
      initialGrade = {
        stage: clsGrade.stage,
        level: clsGrade.level,
        label: ClassroomData.formatGrade(clsGrade.stage, clsGrade.level) || `${clsGrade.level}° Primaria`,
        value: `${clsGrade.stage}:${clsGrade.level}`
      };
    }
  }

  if (!initialGrade) {
    const gradeOptions = ClassroomData.getGradeOptions();
    if (gradeOptions && gradeOptions.length > 0) {
      initialGrade = {
        stage: gradeOptions[0].stage,
        level: gradeOptions[0].level,
        label: gradeOptions[0].label,
        value: gradeOptions[0].value
      };
    } else {
      initialGrade = { stage: 'primaria', level: 4, label: '4° Primaria', value: 'primaria:4' };
    }
  }

  bankManagerActiveGrade = initialGrade;
  toggleBankManagerAddForm(false);
  renderBankManagerGradeTabs();
  renderBankManagerQuestions();

  modal.style.display = 'flex';
}

function closeBankManagerModal() {
  const modal = document.getElementById('bank-manager-modal');
  if (modal) modal.style.display = 'none';
  toggleBankManagerAddForm(false);
  if (typeof renderBankCards === 'function') renderBankCards();
  if (currentFlow === 'bank' || currentFlow === 'hub') {
    showView('hub');
  }
}

function renderBankManagerGradeTabs() {
  const container = document.getElementById('bank-manager-grade-tabs');
  if (!container) return;
  container.innerHTML = '';

  const gradeOptions = ClassroomData.getGradeOptions();
  gradeOptions.forEach(g => {
    const isActive = bankManagerActiveGrade && bankManagerActiveGrade.stage === g.stage && Number(bankManagerActiveGrade.level) === Number(g.level);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = g.label;
    btn.style.cssText = [
      'padding:6px 14px',
      'border-radius:20px',
      'font-size:0.78rem',
      'font-weight:700',
      'cursor:pointer',
      'transition:all 0.15s',
      isActive ? 'background:#2563eb; color:#ffffff; border:1.5px solid #3b82f6;' : 'background:#1e293b; color:#94a3b8; border:1.5px solid #334155;'
    ].join(';');

    btn.onclick = () => {
      bankManagerActiveGrade = { stage: g.stage, level: g.level, label: g.label, value: g.value };
      renderBankManagerGradeTabs();
      renderBankManagerQuestions();
      toggleBankManagerAddForm(false);
    };
    container.appendChild(btn);
  });
}

function renderBankManagerQuestions() {
  const container = document.getElementById('bank-manager-questions-container');
  const summaryText = document.getElementById('bank-manager-summary-text');
  if (!container || !bankManagerActiveGrade) return;
  container.innerHTML = '';

  const stage = bankManagerActiveGrade.stage;
  const level = Number(bankManagerActiveGrade.level);

  // Todas las preguntas del banco tienen 4 alternativas y rúbrica de IA
  const questions = (typeof ClassroomData !== 'undefined' && ClassroomData.getIndividualMCQuestions)
    ? ClassroomData.getIndividualMCQuestions(stage, level)
    : [];

  const countWithRubric = questions.filter(q => !!(q.hasRubric || q.rubric)).length;
  const countQuick = questions.length - countWithRubric;

  if (summaryText) {
    summaryText.textContent = `${questions.length} pregunta${questions.length === 1 ? '' : 's'} en ${bankManagerActiveGrade.label} (${countWithRubric} con Rúbrica IA · ${countQuick} rápidas)`;
  }

  if (questions.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:36px 20px; background:#1e293b50; border:1px dashed #334155; border-radius:12px; color:#94a3b8;">
        <span style="font-size:2rem; display:block; margin-bottom:8px;">📭</span>
        <div style="font-size:0.92rem; font-weight:700; color:#cbd5e1; margin-bottom:4px;">No hay preguntas para ${bankManagerActiveGrade.label}</div>
        <div style="font-size:0.75rem; color:#64748b;">Haz clic en "➕ Nueva Pregunta para este Grado" para agregar preguntas con o sin rúbrica de IA.</div>
      </div>
    `;
    return;
  }

  // Renderizar preguntas de forma unificada (con sus 4 alternativas y distintivo de rúbrica)
  questions.forEach(q => {
    const card = document.createElement('div');
    card.style.cssText = 'background:#1e293b; border:1.5px solid #334155; border-radius:10px; padding:12px 14px; display:flex; flex-direction:column; gap:8px;';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:8px;';

    const hasRubric = !!(q.hasRubric || q.rubric);

    const titleBox = document.createElement('div');
    titleBox.style.cssText = 'display:flex; align-items:center; gap:8px; flex:1; min-width:0;';
    if (hasRubric) {
      titleBox.innerHTML = `
        <span style="background:#4c1d95; color:#c4b5fd; font-size:0.65rem; font-weight:800; padding:2px 7px; border-radius:6px; white-space:nowrap;">🤖 Con Rúbrica IA</span>
        <span style="font-size:0.82rem; font-weight:700; color:#e2e8f0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Procedimiento y Clave (Ramas 1, 2 y 3)</span>
      `;
    } else {
      titleBox.innerHTML = `
        <span style="background:#065f46; color:#6ee7b7; font-size:0.65rem; font-weight:800; padding:2px 7px; border-radius:6px; white-space:nowrap;">⚡ Pregunta Rápida</span>
        <span style="font-size:0.82rem; font-weight:700; color:#94a3b8; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Solo Clave (Ramas 2 y 3)</span>
      `;
    }

    const btnDel = document.createElement('button');
    btnDel.type = 'button';
    btnDel.innerHTML = '🗑️ Eliminar';
    btnDel.style.cssText = 'background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.3); color:#ef4444; border-radius:6px; padding:4px 9px; font-size:0.72rem; font-weight:700; cursor:pointer; transition:all 0.15s; flex:0 0 auto;';
    btnDel.addEventListener('mouseenter', () => { btnDel.style.background = '#ef4444'; btnDel.style.color = '#fff'; });
    btnDel.addEventListener('mouseleave', () => { btnDel.style.background = 'rgba(239,68,68,0.15)'; btnDel.style.color = '#ef4444'; });
    btnDel.onclick = () => {
      handleDeleteQuestionFromBank(q.prompt, q.prompt, q.id);
    };

    header.appendChild(titleBox);
    header.appendChild(btnDel);

    const promptText = document.createElement('div');
    promptText.style.cssText = 'font-size:0.82rem; color:#cbd5e1; line-height:1.4;';
    promptText.textContent = q.prompt;

    const optsGrid = document.createElement('div');
    optsGrid.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:0.75rem;';
    ['A', 'B', 'C', 'D'].forEach(letter => {
      const isCorrect = (q.correct || 'A').toUpperCase() === letter;
      const optVal = q.options ? q.options[letter] : '';
      const optDiv = document.createElement('div');
      optDiv.style.cssText = isCorrect
        ? 'color:#4ade80; font-weight:800; background:rgba(34,197,94,0.1); padding:4px 8px; border-radius:6px; border:1px solid rgba(34,197,94,0.25);'
        : 'color:#94a3b8; padding:4px 8px; background:#0f172a; border-radius:6px; border:1px solid #1e293b;';
      optDiv.textContent = `${letter}) ${optVal || '—'}` + (isCorrect ? ' ✓ (Clave)' : '');
      optsGrid.appendChild(optDiv);
    });

    const footer = document.createElement('div');
    footer.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-top:4px; flex-wrap:wrap; gap:8px;';

    if (hasRubric) {
      const btnRubric = document.createElement('button');
      btnRubric.type = 'button';
      btnRubric.innerHTML = '📋 Ver Rúbrica de IA';
      btnRubric.title = 'Ver la solución canónica, criterios y errores frecuentes generados por la IA';
      btnRubric.style.cssText = 'background:rgba(124,58,237,0.15); border:1px solid rgba(124,58,237,0.4); color:#c4b5fd; border-radius:6px; padding:5px 12px; font-size:0.75rem; font-weight:700; cursor:pointer; transition:all 0.15s; display:inline-flex; align-items:center; gap:6px;';
      btnRubric.addEventListener('mouseenter', () => { btnRubric.style.background = '#7c3aed'; btnRubric.style.color = '#fff'; });
      btnRubric.addEventListener('mouseleave', () => { btnRubric.style.background = 'rgba(124,58,237,0.15)'; btnRubric.style.color = '#c4b5fd'; });
      btnRubric.onclick = () => {
        handleViewQuestionRubric(q);
      };
      footer.appendChild(btnRubric);
    } else {
      const labelNoRubric = document.createElement('span');
      labelNoRubric.style.cssText = 'font-size:0.72rem; color:#94a3b8; display:inline-flex; align-items:center; gap:4px;';
      labelNoRubric.innerHTML = '⚡ <em>Sin análisis de procedimiento</em>';

      const btnUpgrade = document.createElement('button');
      btnUpgrade.type = 'button';
      btnUpgrade.innerHTML = '✨ Generar Rúbrica IA';
      btnUpgrade.title = 'Analizar este problema con Gemini para habilitarlo en la Rama 1 (evaluación de procedimiento)';
      btnUpgrade.style.cssText = 'background:rgba(59,130,246,0.15); border:1px solid rgba(59,130,246,0.35); color:#60a5fa; border-radius:6px; padding:5px 12px; font-size:0.75rem; font-weight:700; cursor:pointer; transition:all 0.15s; display:inline-flex; align-items:center; gap:6px;';
      btnUpgrade.addEventListener('mouseenter', () => { btnUpgrade.style.background = '#2563eb'; btnUpgrade.style.color = '#fff'; });
      btnUpgrade.addEventListener('mouseleave', () => { btnUpgrade.style.background = 'rgba(59,130,246,0.15)'; btnUpgrade.style.color = '#60a5fa'; });
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
          <div style="font-size:0.95rem; font-weight:800; color:#f1f5f9; margin-bottom:6px;">Esta pregunta no tiene rúbrica cargada aún</div>
          <div style="font-size:0.78rem; color:#94a3b8; line-height:1.45; max-width:400px; margin:0 auto;">
            Las preguntas creadas con el asistente incluyen automáticamente su análisis canónico, criterios de evaluación y errores previsibles de IA.
          </div>
        </div>
      `,
      buttons: [{ label: 'Entendido', onClick: () => {} }]
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
            <div style="padding:4px 8px; border-radius:6px; ${isCorrect ? 'background:rgba(34,197,94,0.15); color:#4ade80; font-weight:800; border:1px solid rgba(34,197,94,0.3);' : 'background:#0f172a; color:#94a3b8; border:1px solid #1e293b;'}">
              ${l}) ${val} ${isCorrect ? '✓ (Clave Correcta)' : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  const questionBlock = `
    <div style="background:#0f172a; border:1px solid #334155; border-radius:10px; padding:12px; margin-bottom:14px;">
      <div style="font-size:0.65rem; font-weight:800; color:#38bdf8; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:4px;">Enunciado del Problema</div>
      <div style="font-size:0.86rem; color:#f8fafc; font-weight:600; line-height:1.45;">${promptText}</div>
      ${optsHtml}
    </div>
  `;

  let rubricContentHtml = '';

  if (typeof r === 'object' && r !== null) {
    const canonica = r.respuesta_canonica || r.solucion || r.canonical_answer || (q.options && q.correct ? q.options[q.correct] : '');
    const unidad = r.unidad ? `<div style="text-align:right;"><span style="font-size:0.65rem; color:#64748b; font-weight:800; text-transform:uppercase; display:block;">Unidad</span><strong style="color:#93c5fd; font-size:0.85rem;">${escaparHtml(r.unidad)}</strong></div>` : '';

    // Criterios de evaluación
    let criteriosHtml = '';
    if (Array.isArray(r.criterios) && r.criterios.length > 0) {
      criteriosHtml = `
        <div style="margin-top:12px;">
          <div style="font-size:0.68rem; font-weight:800; color:#38bdf8; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:6px;">
            Criterios de Evaluación ${r.puntaje_total ? `· Total ${escaparHtml(String(r.puntaje_total))} pt` : ''}
          </div>
          <div style="display:flex; flex-direction:column; gap:6px;">
            ${r.criterios.map(c => `
              <div style="display:flex; gap:8px; align-items:flex-start; padding:6px 8px; background:#0f172a; border:1px solid #1e293b; border-radius:6px;">
                <span style="flex:0 0 auto; background:#0c4a6e; color:#7dd3fc; border-radius:6px; padding:2px 7px; font-size:0.7rem; font-weight:800; white-space:nowrap;">
                  ${escaparHtml(String(c.peso || '1'))} pt
                </span>
                <span style="flex:1; min-width:0;">
                  <div style="font-size:0.78rem; font-weight:700; color:#e2e8f0;">${escaparHtml(c.nombre || '')}</div>
                  <div style="font-size:0.72rem; color:#94a3b8; line-height:1.4;">${escaparHtml(c.que_se_espera || c.descripcion || '')}</div>
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
          <div style="font-size:0.68rem; font-weight:800; color:#a78bfa; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:6px;">Procedimiento de Resolución</div>
          <div style="display:flex; flex-direction:column; gap:4px; background:#0f172a; border:1px solid #1e293b; border-radius:8px; padding:10px;">
            ${r.solucion_pasos.map((p, i) => `
              <div style="font-size:0.78rem; color:#cbd5e1; line-height:1.45;">
                <span style="color:#a78bfa; font-weight:800;">${i + 1}.</span> ${escaparHtml(p)}
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else if (r.procedimiento_esperado) {
      pasosHtml = `
        <div style="margin-top:12px;">
          <div style="font-size:0.68rem; font-weight:800; color:#a78bfa; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:4px;">Procedimiento Esperado</div>
          <div style="font-size:0.78rem; color:#cbd5e1; background:#0f172a; border:1px solid #1e293b; border-radius:8px; padding:10px; line-height:1.45;">
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
          <div style="font-size:0.68rem; font-weight:800; color:#f87171; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:6px;">Errores Previsibles Detectados por IA</div>
          <div style="display:flex; flex-direction:column; gap:5px;">
            ${r.errores_previsibles.map(e => `
              <div style="font-size:0.75rem; color:#cbd5e1; background:#0f172a; border:1px solid #1e293b; border-radius:6px; padding:6px 10px; line-height:1.4;">
                <span style="background:#7f1d1d; color:#fca5a5; border-radius:4px; padding:1px 6px; font-size:0.65rem; font-weight:800; margin-right:6px;">${escaparHtml(e.tipo || 'Error')}</span>
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
      ? `<div style="margin-top:12px; padding-top:8px; border-top:1px solid #334155; font-size:0.7rem; color:#64748b; display:flex; justify-content:space-between; align-items:center;">
           <span>Análisis pedagógico generado por IA (Gemini)</span>
           <span>Confianza: <strong style="color:${confVal >= 70 ? '#4ade80' : confVal >= 40 ? '#fbbf24' : '#f87171'};">${confVal}%</strong></span>
         </div>`
      : '';

    rubricContentHtml = `
      <div style="border:1.5px solid #4c1d95; border-radius:10px; background:#131d33; padding:14px;">
        <div style="font-size:0.72rem; font-weight:800; color:#a78bfa; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:10px; display:flex; align-items:center; gap:6px;">
          <span>📋</span> Rúbrica Pedagógica de Corrección
        </div>

        <div style="display:flex; align-items:center; justify-content:space-between; background:#1e293b; border:1px solid #334155; border-radius:8px; padding:10px 14px;">
          <div>
            <span style="font-size:0.65rem; color:#94a3b8; font-weight:800; text-transform:uppercase;">Respuesta Canónica</span>
            <div style="font-size:1.25rem; font-weight:900; color:#22c55e;">${escaparHtml(canonica || '—')}</div>
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
      <div style="background:#0f172a; border:1px solid #334155; border-radius:8px; padding:12px; font-size:0.8rem; color:#cbd5e1; white-space:pre-wrap; line-height:1.5;">
        ${escaparHtml(String(r))}
      </div>
    `;
  }

  showAIDialog({
    icon: '📋',
    title: 'Rúbrica y Análisis Pedagógico (IA)',
    bodyHtml: questionBlock + rubricContentHtml,
    maxWidth: '650px',
    buttons: [{ label: 'Cerrar', style: 'padding:8px 18px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; border:none; background:#3b82f6; color:#fff;', onClick: () => {} }]
  });
}

function toggleBankManagerAddForm(show) {
  const form = document.getElementById('bank-manager-add-form');
  const btn = document.getElementById('btn-toggle-add-question');
  if (!form) return;
  const isVisible = form.style.display !== 'none';
  const target = (typeof show === 'boolean') ? show : !isVisible;
  form.style.display = target ? 'block' : 'none';
  if (btn) btn.textContent = target ? '✕ Ocultar Formulario' : '➕ Nueva Pregunta para este Grado';
  if (target) {
    const title = document.getElementById('bank-manager-form-title');
    if (title && bankManagerActiveGrade) {
      title.textContent = `✏️ Redactar Pregunta de Alternativas para ${bankManagerActiveGrade.label}`;
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

  const ev = ClassroomData.getEvaluation(session.evalId);
  if (!ev) {
    return { ok: false, motivo: 'sin-evaluacion', puedeGenerar: false,
      detalle: 'Esta sesión apunta a una evaluación que ya no está en el banco. Elige otra en la pestaña 1.' };
  }

  // El grado del salón y el de la pregunta tienen que coincidir: la rúbrica
  // se generó con el grado de la pregunta, así que corregir con otra
  // combinación sería juzgar con el criterio de otro grado.
  const gCls = claveDeGrado({ stage: cls.gradeStage, level: cls.gradeLevel });
  const gEv = claveDeGrado({ stage: ev.gradeStage, level: ev.gradeLevel });
  if (gCls && gEv && gCls !== gEv) {
    return { ok: false, motivo: 'grado-distinto', puedeGenerar: false,
      detalle: 'Esta pregunta es de ' + (ev.gradeText || gEv) + ' y el salón es de ' +
               (ClassroomData.getClassroomGrade(session.classroomId) || gCls) +
               '. Elige una pregunta del grado del salón.' };
  }

  // ── MODO OPCIÓN MÚLTIPLE (OMR) vs RESPUESTA LIBRE (IA) ──
  // Las evaluaciones de Opción Múltiple (1P o 2P con burbujas OMR) NO requieren rúbrica por IA.
  // Su corrección es directa y determinística leyendo las burbujas contra la clave de respuestas.
  const isOMR = (ev && ev.type === 'mc') ||
                (session && session.type === 'mc') ||
                (ev && ev.questionCount) ||
                (session && session.questionCount) ||
                (ev && Array.isArray(ev.questions) && ev.questions.length > 0) ||
                (session && Array.isArray(session.questions) && session.questions.length > 0);

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

function confirmNewEvalMC1() {
  return confirmUnifiedEvaluation();
}

// ── GESTIÓN DE EVALUACIÓN DE 2 PREGUNTAS (MC2) ──
let mc2State = {
  p1Mode: 'bank',
  p2Mode: 'new',
  questions: []
};

function mc2Init() {
  if (!wizardClassroomId) {
    const sel = document.getElementById('builder-classroom');
    if (sel && sel.value) wizardClassroomId = sel.value;
  }
  const g = gradoDelSalonSeleccionado();
  mc2State.questions = (typeof ClassroomData !== 'undefined' && ClassroomData.getIndividualMCQuestions)
    ? ClassroomData.getIndividualMCQuestions(g.stage, g.level)
    : [];

  const empty1 = document.getElementById('mc2-p1-bank-empty');
  const empty2 = document.getElementById('mc2-p2-bank-empty');

  if (mc2State.questions.length === 0) {
    mc2SetP1Mode('new');
    mc2SetP2Mode('new');
    if (empty1) empty1.style.display = 'block';
    if (empty2) empty2.style.display = 'block';
  } else {
    if (empty1) empty1.style.display = 'none';
    if (empty2) empty2.style.display = 'none';
    mc2SetP1Mode('bank');
    mc2SetP2Mode('bank');
  }

  mc2PopulateSelects();
  mc2InitInputListeners();
  mc2CheckCanConfirm();
}

function mc2PopulateSelects() {
  const s1 = document.getElementById('mc2-p1-select');
  const s2 = document.getElementById('mc2-p2-select');
  if (!s1 || !s2) return;

  const buildOptions = () => {
    let html = '<option value="">— Elige una pregunta del banco —</option>';
    mc2State.questions.forEach((q, idx) => {
      const short = q.prompt.length > 55 ? (q.prompt.slice(0, 52) + '…') : q.prompt;
      html += `<option value="${idx}">[Clave: ${q.correct}] ${escaparHtml(short)}</option>`;
    });
    return html;
  };

  s1.innerHTML = buildOptions();
  s2.innerHTML = buildOptions();
  s1.value = '';
  s2.value = '';

  mc2OnBankSelect(1, '');
  mc2OnBankSelect(2, '');
  mc2CheckCanConfirm();
}

function mc2CheckCanConfirm() {
  const btn = document.getElementById('btn-confirm-mc2');
  if (!btn) return false;

  // Evaluar Pregunta 1
  let q1Ready = false;
  if (mc2State.p1Mode === 'bank') {
    const s1 = document.getElementById('mc2-p1-select');
    q1Ready = !!(s1 && s1.value !== '' && !isNaN(Number(s1.value)) && mc2State.questions[Number(s1.value)]);
  } else {
    const p1 = (document.getElementById('mc2-q1-prompt')?.value || '').trim();
    const o1a = (document.getElementById('mc2-q1-opt-a')?.value || '').trim();
    const o1b = (document.getElementById('mc2-q1-opt-b')?.value || '').trim();
    const o1c = (document.getElementById('mc2-q1-opt-c')?.value || '').trim();
    const o1d = (document.getElementById('mc2-q1-opt-d')?.value || '').trim();
    q1Ready = (p1.length > 0 && o1a.length > 0 && o1b.length > 0 && o1c.length > 0 && o1d.length > 0);
  }

  // Evaluar Pregunta 2
  let q2Ready = false;
  if (mc2State.p2Mode === 'bank') {
    const s2 = document.getElementById('mc2-p2-select');
    q2Ready = !!(s2 && s2.value !== '' && !isNaN(Number(s2.value)) && mc2State.questions[Number(s2.value)]);
  } else {
    const p2 = (document.getElementById('mc2-q2-prompt')?.value || '').trim();
    const o2a = (document.getElementById('mc2-q2-opt-a')?.value || '').trim();
    const o2b = (document.getElementById('mc2-q2-opt-b')?.value || '').trim();
    const o2c = (document.getElementById('mc2-q2-opt-c')?.value || '').trim();
    const o2d = (document.getElementById('mc2-q2-opt-d')?.value || '').trim();
    q2Ready = (p2.length > 0 && o2a.length > 0 && o2b.length > 0 && o2c.length > 0 && o2d.length > 0);
  }

  const canConfirm = q1Ready && q2Ready;
  btn.disabled = !canConfirm;
  if (canConfirm) {
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
    btn.style.background = '#2563eb';
    btn.style.boxShadow = '0 2px 8px #2563eb40';
  } else {
    btn.style.opacity = '0.45';
    btn.style.cursor = 'not-allowed';
    btn.style.background = '#334155';
    btn.style.boxShadow = 'none';
  }
  return canConfirm;
}

function mc2InitInputListeners() {
  const ids = [
    'mc2-q1-prompt', 'mc2-q1-opt-a', 'mc2-q1-opt-b', 'mc2-q1-opt-c', 'mc2-q1-opt-d',
    'mc2-q2-prompt', 'mc2-q2-opt-a', 'mc2-q2-opt-b', 'mc2-q2-opt-c', 'mc2-q2-opt-d'
  ];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.dataset.listenerAttached) {
      el.addEventListener('input', mc2CheckCanConfirm);
      el.dataset.listenerAttached = 'true';
    }
  });
}

function mc2SetP1Mode(mode) {
  mc2State.p1Mode = mode;
  const btnBank = document.getElementById('btn-mc2-p1-bank');
  const btnNew = document.getElementById('btn-mc2-p1-new');
  const wrapBank = document.getElementById('mc2-p1-bank-wrap');
  const wrapNew = document.getElementById('mc2-p1-new-wrap');
  if (btnBank) {
    btnBank.style.borderColor = mode === 'bank' ? '#3b82f6' : '#334155';
    btnBank.style.background = mode === 'bank' ? '#3b82f620' : '#1e293b';
    btnBank.style.color = mode === 'bank' ? '#60a5fa' : '#94a3b8';
  }
  if (btnNew) {
    btnNew.style.borderColor = mode === 'new' ? '#3b82f6' : '#334155';
    btnNew.style.background = mode === 'new' ? '#3b82f620' : '#1e293b';
    btnNew.style.color = mode === 'new' ? '#60a5fa' : '#94a3b8';
  }
  if (wrapBank) wrapBank.style.display = mode === 'bank' ? 'block' : 'none';
  if (wrapNew) wrapNew.style.display = mode === 'new' ? 'block' : 'none';
  mc2CheckCanConfirm();
}

function mc2SetP2Mode(mode) {
  mc2State.p2Mode = mode;
  const btnBank = document.getElementById('btn-mc2-p2-bank');
  const btnNew = document.getElementById('btn-mc2-p2-new');
  const wrapBank = document.getElementById('mc2-p2-bank-wrap');
  const wrapNew = document.getElementById('mc2-p2-new-wrap');
  if (btnBank) {
    btnBank.style.borderColor = mode === 'bank' ? '#3b82f6' : '#334155';
    btnBank.style.background = mode === 'bank' ? '#3b82f620' : '#1e293b';
    btnBank.style.color = mode === 'bank' ? '#60a5fa' : '#94a3b8';
  }
  if (btnNew) {
    btnNew.style.borderColor = mode === 'new' ? '#3b82f6' : '#334155';
    btnNew.style.background = mode === 'new' ? '#3b82f620' : '#1e293b';
    btnNew.style.color = mode === 'new' ? '#60a5fa' : '#94a3b8';
  }
  if (wrapBank) wrapBank.style.display = mode === 'bank' ? 'block' : 'none';
  if (wrapNew) wrapNew.style.display = mode === 'new' ? 'block' : 'none';
  mc2CheckCanConfirm();
}

function mc2OnBankSelect(pNum, val) {
  const previewEl = document.getElementById(`mc2-p${pNum}-preview`);
  if (previewEl) {
    if (val === '' || isNaN(Number(val))) {
      previewEl.style.display = 'none';
      previewEl.innerHTML = '';
    } else {
      const q = mc2State.questions[Number(val)];
      if (q) {
        previewEl.style.display = 'block';
        previewEl.innerHTML = `
          <div style="font-weight:700; color:#f1f5f9; margin-bottom:6px; line-height:1.4;">${escaparHtml(q.prompt)}</div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; font-size:0.75rem; color:#94a3b8; margin-bottom:6px;">
            <div><strong>A)</strong> ${escaparHtml(q.options?.A || '—')}</div>
            <div><strong>B)</strong> ${escaparHtml(q.options?.B || '—')}</div>
            <div><strong>C)</strong> ${escaparHtml(q.options?.C || '—')}</div>
            <div><strong>D)</strong> ${escaparHtml(q.options?.D || '—')}</div>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:0.7rem; color:#64748b; font-weight:700;">CLAVE CORRECTA:</span>
            <span style="background:#166534; color:#4ade80; font-weight:900; font-size:0.78rem; padding:1px 8px; border-radius:4px;">${q.correct}</span>
          </div>
        `;
      } else {
        previewEl.style.display = 'none';
      }
    }
  }
  mc2CheckCanConfirm();
}

async function confirmMC2() {
  try {
    if (!wizardClassroomId) {
      const sel = document.getElementById('builder-classroom');
      if (sel && sel.value) wizardClassroomId = sel.value;
    }
    if (!wizardClassroomId) {
      showToast('⚠️ Primero elige un salón de clases en el Paso 1.');
      return;
    }
    const g = gradoDelSalonSeleccionado();

    const btnMC2 = document.getElementById('btn-confirm-mc2');
    const mc2Hint = document.getElementById('mc2-status-hint');

    // ── Validar Pregunta 1 ──
    let q1 = null;
    if (mc2State.p1Mode === 'bank') {
      const val1 = document.getElementById('mc2-p1-select')?.value;
      if (val1 === '' || isNaN(Number(val1))) {
        showToast('⚠️ Selecciona la Pregunta 1 del banco o cámbiala a "Redactar nueva".');
        return;
      }
      q1 = mc2State.questions[Number(val1)];
    } else {
      const prompt1 = (document.getElementById('mc2-q1-prompt')?.value || '').trim();
      if (!prompt1) {
        document.getElementById('mc2-q1-prompt')?.focus();
        showToast('⚠️ Escribí el enunciado de la Pregunta 1.');
        return;
      }
      const optA = (document.getElementById('mc2-q1-opt-a')?.value || '').trim();
      const optB = (document.getElementById('mc2-q1-opt-b')?.value || '').trim();
      const optC = (document.getElementById('mc2-q1-opt-c')?.value || '').trim();
      const optD = (document.getElementById('mc2-q1-opt-d')?.value || '').trim();
      if (!optA || !optB || !optC || !optD) {
        showToast('⚠️ Completa las 4 alternativas (A, B, C, D) de la Pregunta 1.');
        return;
      }
      const rad = document.querySelector('input[name="mc2-q1-correct"]:checked');
      const correct = rad ? rad.value : 'A';
      q1 = { prompt: prompt1, options: { A: optA, B: optB, C: optC, D: optD }, correct: correct, isNew: true };
    }

    // ── Validar Pregunta 2 ──
    let q2 = null;
    if (mc2State.p2Mode === 'bank') {
      const val2 = document.getElementById('mc2-p2-select')?.value;
      if (val2 === '' || isNaN(Number(val2))) {
        showToast('⚠️ Selecciona la Pregunta 2 del banco o cámbiala a "Redactar nueva".');
        return;
      }
      q2 = mc2State.questions[Number(val2)];
    } else {
      const prompt2 = (document.getElementById('mc2-q2-prompt')?.value || '').trim();
      if (!prompt2) {
        document.getElementById('mc2-q2-prompt')?.focus();
        showToast('⚠️ Escribí el enunciado de la Pregunta 2.');
        return;
      }
      const optA = (document.getElementById('mc2-q2-opt-a')?.value || '').trim();
      const optB = (document.getElementById('mc2-q2-opt-b')?.value || '').trim();
      const optC = (document.getElementById('mc2-q2-opt-c')?.value || '').trim();
      const optD = (document.getElementById('mc2-q2-opt-d')?.value || '').trim();
      if (!optA || !optB || !optC || !optD) {
        showToast('⚠️ Completa las 4 alternativas (A, B, C, D) de la Pregunta 2.');
        return;
      }
      const rad = document.querySelector('input[name="mc2-q2-correct"]:checked');
      const correct = rad ? rad.value : 'A';
      q2 = { prompt: prompt2, options: { A: optA, B: optB, C: optC, D: optD }, correct: correct, isNew: true };
    }

    if (q1.prompt === q2.prompt) {
      showToast('⚠️ La Pregunta 1 y la Pregunta 2 no pueden ser idénticas.');
      return;
    }

    // ── Generar IA para Pregunta 1 si es nueva y no tiene rúbrica ──
    if (q1.isNew && !q1.rubric) {
      const loader1 = startAILoadingState(btnMC2, 'Analizando Pregunta 1 con IA', mc2Hint, 'Gemini está calculando la solución canónica y criterios para la Pregunta 1 (~20-30 seg)...');
      const res1 = await SupabaseClient.generateRubric({ prompt: q1.prompt, grado: g.texto || '4° de primaria' });
      loader1.stop();

      if (!res1 || !res1.ok || !res1.rubrica) {
        const errorMsg = (res1 && res1.error) || 'La función no devolvió una rúbrica estructurada.';
        showAIDialog({
          icon: '❌',
          title: 'Error en análisis de Pregunta 1',
          bodyHtml: `<div style="margin-bottom:8px;">La IA de Gemini no pudo analizar la <strong>Pregunta 1</strong>:</div>
            <div style="background:#0f172a; padding:10px; border-radius:8px; border:1px solid #ef444450; color:#fca5a5; font-size:0.8rem; margin-bottom:12px; word-break:break-word;">
              ${escaparHtml(errorMsg)}
            </div>
            <div style="font-size:0.8rem; color:#94a3b8;">
              Por regla del sistema, ninguna pregunta puede guardarse sin su análisis pedagógico. Puedes reintentar con la IA o revisar la Pregunta 1.
            </div>`,
          buttons: [
            {
              label: '🔄 Reintentar con IA',
              style: 'padding:8px 14px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; border:none; background:#7c3aed; color:#fff;',
              onClick: () => confirmMC2()
            },
            {
              label: '✏️ Revisar Pregunta 1',
              style: 'padding:8px 14px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; border:1px solid #3b82f6; background:#3b82f620; color:#60a5fa;',
              onClick: () => {
                const el = document.getElementById('mc2-q1-prompt');
                if (el) el.focus();
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

      q1.rubric = res1.rubrica;

      // Cotejar consistencia matemática de P1
      const check1 = verifyOptionConsistency(q1.prompt, q1.options, q1.correct, q1.rubric);
      if (!check1.ok) {
        if (check1.type === 'no_match') {
          showAIDialog({
            icon: '⚠️',
            title: 'Pregunta 1: Advertencia Matemática',
            bodyHtml: `<div style="margin-bottom:8px;">Para la Pregunta 1 (<em>"${escaparHtml(q1.prompt)}"</em>):</div>
              <div style="background:#0f172a; padding:10px; border-radius:8px; border:1px solid #f59e0b50; margin-bottom:12px;">
                <div style="font-size:0.82rem; color:#fde68a; margin-bottom:4px;">
                  Respuesta calculada por la IA: <strong>${escaparHtml(check1.canonica)}</strong>
                </div>
                <div style="font-size:0.75rem; color:#94a3b8;">
                  Tus alternativas son: <strong>A)</strong> ${escaparHtml(q1.options.A)} | <strong>B)</strong> ${escaparHtml(q1.options.B)} | <strong>C)</strong> ${escaparHtml(q1.options.C)} | <strong>D)</strong> ${escaparHtml(q1.options.D)}
                </div>
              </div>
              <div style="font-size:0.8rem; color:#cbd5e1;">
                Ninguna de tus 4 alternativas tiene el valor <strong>${escaparHtml(check1.canonica)}</strong>. ¿Deseas corregir las alternativas o confirmar de todos modos?
              </div>`,
            buttons: [
              {
                label: '✏️ Corregir Pregunta 1',
                style: 'padding:8px 14px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; border:1px solid #f59e0b; background:#f59e0b20; color:#fbbf24;',
                onClick: () => {
                  const inputA = document.getElementById('mc2-q1-opt-a');
                  if (inputA) inputA.focus();
                }
              },
              {
                label: 'Confirmar de todos modos',
                style: 'padding:8px 14px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; border:none; background:#2563eb; color:#fff;',
                onClick: () => proceedMC2AfterP1(q1, q2, g)
              }
            ]
          });
          return;
        } else if (check1.type === 'key_divergence') {
          showAIDialog({
            icon: '💡',
            title: 'Pregunta 1: Sugerencia de Clave',
            bodyHtml: `<div style="margin-bottom:8px;">Para la Pregunta 1 (<em>"${escaparHtml(q1.prompt)}"</em>):</div>
              <div style="background:#0f172a; padding:10px; border-radius:8px; border:1px solid #3b82f650; margin-bottom:12px;">
                <div style="font-size:0.82rem; color:#93c5fd; margin-bottom:4px;">
                  La IA calculó <strong>${escaparHtml(check1.canonica)}</strong>, que coincide con la alternativa <strong>${check1.matchedKey}</strong>.
                </div>
                <div style="font-size:0.75rem; color:#94a3b8;">
                  Marcaste como clave la alternativa <strong>${check1.correctKey}</strong>.
                </div>
              </div>
              <div style="font-size:0.8rem; color:#cbd5e1;">
                ¿Deseas cambiar la clave de la Pregunta 1 a <strong>${check1.matchedKey}</strong>?
              </div>`,
            buttons: [
              {
                label: `✓ Cambiar a clave ${check1.matchedKey}`,
                style: 'padding:8px 14px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; border:none; background:#16a34a; color:#fff;',
                onClick: () => {
                  q1.correct = check1.matchedKey;
                  const rad = document.getElementById(`mc2-q1-rad-${check1.matchedKey.toLowerCase()}`);
                  if (rad) rad.checked = true;
                  proceedMC2AfterP1(q1, q2, g);
                }
              },
              {
                label: `Mantener clave ${check1.correctKey}`,
                style: 'padding:8px 14px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; border:1px solid #475569; background:#1e293b; color:#94a3b8;',
                onClick: () => proceedMC2AfterP1(q1, q2, g)
              }
            ]
          });
          return;
        }
      }
    }

    proceedMC2AfterP1(q1, q2, g);
  } catch (err) {
    console.error('[confirmMC2 Error]', err);
    showToast('⚠️ Error al confirmar: ' + err.message);
  }
}

async function proceedMC2AfterP1(q1, q2, g) {
  const btnMC2 = document.getElementById('btn-confirm-mc2');
  const mc2Hint = document.getElementById('mc2-status-hint');

  // ── Generar IA para Pregunta 2 si es nueva y no tiene rúbrica ──
  if (q2.isNew && !q2.rubric) {
    const loader2 = startAILoadingState(btnMC2, 'Analizando Pregunta 2 con IA', mc2Hint, 'Gemini está calculando la solución canónica y criterios para la Pregunta 2 (~20-30 seg)...');
    const res2 = await SupabaseClient.generateRubric({ prompt: q2.prompt, grado: g.texto || '4° de primaria' });
    loader2.stop();

    if (!res2 || !res2.ok || !res2.rubrica) {
      const errorMsg = (res2 && res2.error) || 'La función no devolvió una rúbrica estructurada.';
      showAIDialog({
        icon: '❌',
        title: 'Error en análisis de Pregunta 2',
        bodyHtml: `<div style="margin-bottom:8px;">La IA de Gemini no pudo analizar la <strong>Pregunta 2</strong>:</div>
          <div style="background:#0f172a; padding:10px; border-radius:8px; border:1px solid #ef444450; color:#fca5a5; font-size:0.8rem; margin-bottom:12px; word-break:break-word;">
            ${escaparHtml(errorMsg)}
          </div>
          <div style="font-size:0.8rem; color:#94a3b8;">
            Por regla del sistema, ninguna pregunta puede guardarse sin su análisis pedagógico. Puedes reintentar con la IA o revisar la Pregunta 2.
          </div>`,
        buttons: [
          {
            label: '🔄 Reintentar con IA',
            style: 'padding:8px 14px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; border:none; background:#7c3aed; color:#fff;',
            onClick: () => proceedMC2AfterP1(q1, q2, g)
          },
          {
            label: '✏️ Revisar Pregunta 2',
            style: 'padding:8px 14px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; border:1px solid #3b82f6; background:#3b82f620; color:#60a5fa;',
            onClick: () => {
              const el = document.getElementById('mc2-q2-prompt');
              if (el) el.focus();
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

    q2.rubric = res2.rubrica;

    // Cotejar consistencia matemática de P2
    const check2 = verifyOptionConsistency(q2.prompt, q2.options, q2.correct, q2.rubric);
    if (!check2.ok) {
      if (check2.type === 'no_match') {
        showAIDialog({
          icon: '⚠️',
          title: 'Pregunta 2: Advertencia Matemática',
          bodyHtml: `<div style="margin-bottom:8px;">Para la Pregunta 2 (<em>"${escaparHtml(q2.prompt)}"</em>):</div>
            <div style="background:#0f172a; padding:10px; border-radius:8px; border:1px solid #f59e0b50; margin-bottom:12px;">
              <div style="font-size:0.82rem; color:#fde68a; margin-bottom:4px;">
                Respuesta calculada por la IA: <strong>${escaparHtml(check2.canonica)}</strong>
              </div>
              <div style="font-size:0.75rem; color:#94a3b8;">
                Tus alternativas son: <strong>A)</strong> ${escaparHtml(q2.options.A)} | <strong>B)</strong> ${escaparHtml(q2.options.B)} | <strong>C)</strong> ${escaparHtml(q2.options.C)} | <strong>D)</strong> ${escaparHtml(q2.options.D)}
              </div>
            </div>
            <div style="font-size:0.8rem; color:#cbd5e1;">
              Ninguna de tus 4 alternativas tiene el valor <strong>${escaparHtml(check2.canonica)}</strong>. ¿Deseas corregir las alternativas o confirmar de todos modos?
            </div>`,
          buttons: [
            {
              label: '✏️ Corregir Pregunta 2',
              style: 'padding:8px 14px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; border:1px solid #f59e0b; background:#f59e0b20; color:#fbbf24;',
              onClick: () => {
                const inputA = document.getElementById('mc2-q2-opt-a');
                if (inputA) inputA.focus();
              }
            },
            {
              label: 'Confirmar de todos modos',
              style: 'padding:8px 14px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; border:none; background:#2563eb; color:#fff;',
              onClick: () => finalizeMC2(q1, q2, g)
            }
          ]
        });
        return;
      } else if (check2.type === 'key_divergence') {
        showAIDialog({
          icon: '💡',
          title: 'Pregunta 2: Sugerencia de Clave',
          bodyHtml: `<div style="margin-bottom:8px;">Para la Pregunta 2 (<em>"${escaparHtml(q2.prompt)}"</em>):</div>
            <div style="background:#0f172a; padding:10px; border-radius:8px; border:1px solid #3b82f650; margin-bottom:12px;">
              <div style="font-size:0.82rem; color:#93c5fd; margin-bottom:4px;">
                La IA calculó <strong>${escaparHtml(check2.canonica)}</strong>, que coincide con la alternativa <strong>${check2.matchedKey}</strong>.
              </div>
              <div style="font-size:0.75rem; color:#94a3b8;">
                Marcaste como clave la alternativa <strong>${check2.correctKey}</strong>.
              </div>
            </div>
            <div style="font-size:0.8rem; color:#cbd5e1;">
              ¿Deseas cambiar la clave de la Pregunta 2 a <strong>${check2.matchedKey}</strong>?
            </div>`,
          buttons: [
            {
              label: `✓ Cambiar a clave ${check2.matchedKey}`,
              style: 'padding:8px 14px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; border:none; background:#16a34a; color:#fff;',
              onClick: () => {
                q2.correct = check2.matchedKey;
                const rad = document.getElementById(`mc2-q2-rad-${check2.matchedKey.toLowerCase()}`);
                if (rad) rad.checked = true;
                finalizeMC2(q1, q2, g);
              }
            },
            {
              label: `Mantener clave ${check2.correctKey}`,
              style: 'padding:8px 14px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; border:1px solid #475569; background:#1e293b; color:#94a3b8;',
              onClick: () => finalizeMC2(q1, q2, g)
            }
          ]
        });
        return;
      }
    }
  }

  finalizeMC2(q1, q2, g);
}

function finalizeMC2(q1, q2, g) {
  if (q1.isNew && !q1.rubric) {
    showToast('⚠️ GUARDARRAÍL: La Pregunta 1 debe tener su análisis pedagógico con IA.');
    return;
  }
  if (q2.isNew && !q2.rubric) {
    showToast('⚠️ GUARDARRAÍL: La Pregunta 2 debe tener su análisis pedagógico con IA.');
    return;
  }
  // Guardar P1 en el banco si era nueva
  if (q1.isNew) {
    ClassroomData.saveCustomEvaluation({
      title: 'Pregunta de alternativa',
      type: 'mc',
      questionCount: 1,
      prompt: q1.prompt,
      expectedAnswer: `Clave: ${q1.correct}`,
      rubric: q1.rubric || null,
      questions: [q1],
      gradeStage: g.stage || null,
      gradeLevel: g.level || null,
      gradeText: g.texto || null
    });
    if (typeof SupabaseClient !== 'undefined' && SupabaseClient.saveEvaluation) {
      SupabaseClient.saveEvaluation({
        prompt: q1.prompt,
        expectedAnswer: `Clave: ${q1.correct}`,
        title: 'Pregunta de alternativa',
        rubric: q1.rubric || null,
        gradeStage: g.stage,
        gradeLevel: g.level,
        gradeText: g.texto,
        type: 'mc',
        questionCount: 1,
        questions: [q1]
      }).catch(e => console.warn('[Banco] No se pudo guardar P1 en Supabase:', e && e.message));
    }
  }

  // Guardar P2 en el banco si era nueva
  if (q2.isNew) {
    ClassroomData.saveCustomEvaluation({
      title: 'Pregunta de alternativa',
      type: 'mc',
      questionCount: 1,
      prompt: q2.prompt,
      expectedAnswer: `Clave: ${q2.correct}`,
      rubric: q2.rubric || null,
      questions: [q2],
      gradeStage: g.stage || null,
      gradeLevel: g.level || null,
      gradeText: g.texto || null
    });
    if (typeof SupabaseClient !== 'undefined' && SupabaseClient.saveEvaluation) {
      SupabaseClient.saveEvaluation({
        prompt: q2.prompt,
        expectedAnswer: `Clave: ${q2.correct}`,
        title: 'Pregunta de alternativa',
        rubric: q2.rubric || null,
        gradeStage: g.stage,
        gradeLevel: g.level,
        gradeText: g.texto,
        type: 'mc',
        questionCount: 1,
        questions: [q2]
      }).catch(e => console.warn('[Banco] No se pudo guardar P2 en Supabase:', e && e.message));
    }
  }

  const evalPrompt = `1. ${q1.prompt}  |  2. ${q2.prompt}`;
  const evalExpected = `P1: ${q1.correct} | P2: ${q2.correct}`;

  const saved = ClassroomData.saveCustomEvaluation({
    title: 'Evaluación (2 Preguntas)',
    type: 'mc',
    questionCount: 2,
    prompt: evalPrompt,
    expectedAnswer: evalExpected,
    questions: [q1, q2],
    gradeStage: g.stage || null,
    gradeLevel: g.level || null,
    gradeText: g.texto || null
  });

  // Guardar en Supabase (fire and forget)
  if (typeof SupabaseClient !== 'undefined' && SupabaseClient.saveEvaluation) {
    SupabaseClient.saveEvaluation({
      prompt: evalPrompt,
      expectedAnswer: evalExpected,
      title: saved.title,
      gradeStage: g.stage,
      gradeLevel: g.level,
      gradeText: g.texto,
      type: 'mc',
      questionCount: 2,
      questions: [q1, q2]
    }).catch(e => console.warn('[Banco] No se pudo guardar en Supabase:', e && e.message));
  }

  wizardEvalType = 'mc2';
  wizardEval = saved;
  if (typeof updateCorrectionModeUI === 'function') updateCorrectionModeUI('full');
  showSummary();
}

function confirmNewEvalFree() {
  return confirmUnifiedEvaluation();
}

function confirmNewEval() {
  return confirmUnifiedEvaluation();
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
      badgeLabel.innerHTML = '⚡ Focalizada en la Respuesta (1–3 Preguntas)';
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

  const b1Opts = document.getElementById('branch-1-options');
  const b2Opts = document.getElementById('branch-2-options');
  const b3Opts = document.getElementById('branch-3-options');

  // Reset visual cards si estuvieran presentes
  if (card1) {
    card1.style.borderColor = branch === 'rama1' ? '#7c3aed' : '#334155';
    card1.style.background = branch === 'rama1' ? 'rgba(124,58,237,0.12)' : '#1e293b';
  }
  if (card2) {
    card2.style.borderColor = branch === 'rama2' ? '#10b981' : '#334155';
    card2.style.background = branch === 'rama2' ? 'rgba(16,185,129,0.12)' : '#1e293b';
  }
  if (card3) {
    card3.style.borderColor = branch === 'rama3' ? '#0284c7' : '#334155';
    card3.style.background = branch === 'rama3' ? 'rgba(2,132,199,0.12)' : '#1e293b';
  }

  // Toggle subpanels
  if (b1Opts) b1Opts.style.display = branch === 'rama1' ? 'block' : 'none';
  if (b2Opts) b2Opts.style.display = branch === 'rama2' ? 'block' : 'none';
  if (b3Opts) b3Opts.style.display = branch === 'rama3' ? 'block' : 'none';

  // Si se cambia de rama, ocultar formularios secundarios de Rama 1
  if (branch !== 'rama1') {
    const stepSrc = document.getElementById('step-source');
    const stepBank = document.getElementById('step-bank-list');
    const fNew = document.getElementById('step-new-form');
    const fMC2 = document.getElementById('step-mc2-builder');
    if (stepSrc) stepSrc.style.display = 'none';
    if (stepBank) stepBank.style.display = 'none';
    if (fNew) fNew.style.display = 'none';
    if (fMC2) fMC2.style.display = 'none';
  }

  if (branch === 'rama1') {
    if (typeof updateCorrectionModeUI === 'function') updateCorrectionModeUI('full');
  } else if (branch === 'rama2') {
    if (typeof updateCorrectionModeUI === 'function') updateCorrectionModeUI('quick');
    initRama2Builder();
  } else if (branch === 'rama3') {
    if (typeof updateCorrectionModeUI === 'function') updateCorrectionModeUI('quick');
    initRama3Builder();
  }
}

// ── CONTROLADOR RAMA 2: EVALUACIÓN FOCALIZADA ──
let r2State = {
  withGrid: true,
  responseType: 'mc', // 'mc' | 'free'
  count: 1, // 1, 2, 3
  questions: [
    { mode: 'new', prompt: '', options: { A: '', B: '', C: '', D: '' }, correct: 'A', expectedAnswer: '' },
    { mode: 'new', prompt: '', options: { A: '', B: '', C: '', D: '' }, correct: 'A', expectedAnswer: '' },
    { mode: 'new', prompt: '', options: { A: '', B: '', C: '', D: '' }, correct: 'A', expectedAnswer: '' }
  ]
};

function initRama2Builder() {
  updateRama2ControlsUI();
  renderRama2Questions();
}

function setRama2Grid(withGrid) {
  r2State.withGrid = !!withGrid;
  if (r2State.withGrid && r2State.count > 2) {
    r2State.count = 2;
  }
  updateRama2ControlsUI();
  renderRama2Questions();
}

function setRama2Type(type) {
  r2State.responseType = (type === 'free') ? 'free' : 'mc';
  updateRama2ControlsUI();
  renderRama2Questions();
}

function setRama2Count(count) {
  const max = r2State.withGrid ? 2 : 3;
  r2State.count = Math.min(Math.max(1, count), max);
  updateRama2ControlsUI();
  renderRama2Questions();
}

function updateRama2ControlsUI() {
  const btnGridYes = document.getElementById('btn-r2-grid-yes');
  const btnGridNo = document.getElementById('btn-r2-grid-no');
  if (btnGridYes && btnGridNo) {
    if (r2State.withGrid) {
      btnGridYes.style.borderColor = '#10b981';
      btnGridYes.style.background = 'rgba(16,185,129,0.18)';
      btnGridYes.style.color = '#a7f3d0';
      btnGridNo.style.borderColor = '#334155';
      btnGridNo.style.background = '#1e293b';
      btnGridNo.style.color = '#94a3b8';
    } else {
      btnGridNo.style.borderColor = '#10b981';
      btnGridNo.style.background = 'rgba(16,185,129,0.18)';
      btnGridNo.style.color = '#a7f3d0';
      btnGridYes.style.borderColor = '#334155';
      btnGridYes.style.background = '#1e293b';
      btnGridYes.style.color = '#94a3b8';
    }
  }

  const btnTypeMC = document.getElementById('btn-r2-type-mc');
  const btnTypeFree = document.getElementById('btn-r2-type-free');
  if (btnTypeMC && btnTypeFree) {
    if (r2State.responseType === 'mc') {
      btnTypeMC.style.borderColor = '#10b981';
      btnTypeMC.style.background = 'rgba(16,185,129,0.18)';
      btnTypeMC.style.color = '#a7f3d0';
      btnTypeFree.style.borderColor = '#334155';
      btnTypeFree.style.background = '#1e293b';
      btnTypeFree.style.color = '#94a3b8';
    } else {
      btnTypeFree.style.borderColor = '#10b981';
      btnTypeFree.style.background = 'rgba(16,185,129,0.18)';
      btnTypeFree.style.color = '#a7f3d0';
      btnTypeMC.style.borderColor = '#334155';
      btnTypeMC.style.background = '#1e293b';
      btnTypeMC.style.color = '#94a3b8';
    }
  }

  const btnC1 = document.getElementById('btn-r2-count-1');
  const btnC2 = document.getElementById('btn-r2-count-2');
  const btnC3 = document.getElementById('btn-r2-count-3');
  [btnC1, btnC2, btnC3].forEach((b, idx) => {
    if (!b) return;
    const qNum = idx + 1;
    if (r2State.count === qNum) {
      b.style.borderColor = '#10b981';
      b.style.background = 'rgba(16,185,129,0.18)';
      b.style.color = '#a7f3d0';
    } else {
      b.style.borderColor = '#334155';
      b.style.background = '#1e293b';
      b.style.color = '#94a3b8';
    }
  });

  if (btnC3) {
    btnC3.style.display = r2State.withGrid ? 'none' : 'inline-block';
  }
}

function setRama2QMode(qIdx, mode) {
  if (!r2State.questions[qIdx]) return;
  r2State.questions[qIdx].mode = mode;
  renderRama2Questions();
}

function onRama2PromptInput(qIdx, val) {
  if (r2State.questions[qIdx]) r2State.questions[qIdx].prompt = val;
}

function onRama2OptionInput(qIdx, optKey, val) {
  if (r2State.questions[qIdx] && r2State.questions[qIdx].options) {
    r2State.questions[qIdx].options[optKey] = val;
  }
}

function onRama2CorrectChange(qIdx, val) {
  if (r2State.questions[qIdx]) r2State.questions[qIdx].correct = val;
}

function onRama2ExpectedInput(qIdx, val) {
  if (r2State.questions[qIdx]) r2State.questions[qIdx].expectedAnswer = val;
}

function onRama2BankSelect(qIdx, qId) {
  const g = (typeof evaluacionesDelGradoActual === 'function')
    ? evaluacionesDelGradoActual()
    : { lista: [] };
  const found = g.lista.find(q => q.id === qId);
  if (!found || !r2State.questions[qIdx]) return;

  r2State.questions[qIdx].id = found.id;
  r2State.questions[qIdx].prompt = found.prompt || '';
  if (found.options) {
    r2State.questions[qIdx].options = { ...found.options };
  }
  r2State.questions[qIdx].correct = found.correct || 'A';
  r2State.questions[qIdx].expectedAnswer = found.expectedAnswer || found.correct || '';
  renderRama2Questions();
}

function renderRama2Questions() {
  const container = document.getElementById('rama2-questions-container');
  if (!container) return;

  const g = (typeof evaluacionesDelGradoActual === 'function')
    ? evaluacionesDelGradoActual()
    : { lista: [] };
  const bankList = g.lista || [];

  let html = '';
  for (let i = 0; i < r2State.count; i++) {
    const q = r2State.questions[i] || {
      mode: 'new', prompt: '', options: { A: '', B: '', C: '', D: '' }, correct: 'A', expectedAnswer: ''
    };
    const isBank = q.mode === 'bank';

    html += `
      <div style="background:#090d16; border:1px solid #334155; border-radius:10px; padding:12px; margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:6px;">
          <span style="font-size:0.78rem; font-weight:800; color:#6ee7b7; text-transform:uppercase;">
            📌 Pregunta ${i + 1}
          </span>
          <div style="display:flex; gap:6px;">
            <button type="button" onclick="setRama2QMode(${i}, 'bank')"
              style="padding:4px 8px; border-radius:6px; font-size:0.7rem; font-weight:700; cursor:pointer; border:1px solid ${isBank ? '#10b981' : '#334155'}; background:${isBank ? 'rgba(16,185,129,0.2)' : '#1e293b'}; color:${isBank ? '#a7f3d0' : '#94a3b8'};">
              📚 Cargar del banco
            </button>
            <button type="button" onclick="setRama2QMode(${i}, 'new')"
              style="padding:4px 8px; border-radius:6px; font-size:0.7rem; font-weight:700; cursor:pointer; border:1px solid ${!isBank ? '#10b981' : '#334155'}; background:${!isBank ? 'rgba(16,185,129,0.2)' : '#1e293b'}; color:${!isBank ? '#a7f3d0' : '#94a3b8'};">
              ✏️ Redactar nueva
            </button>
          </div>
        </div>
    `;

    if (isBank) {
      if (bankList.length === 0) {
        html += `
          <div style="padding:8px 10px; background:#1e293b; border-radius:6px; font-size:0.75rem; color:#f59e0b;">
            ⚠️ No hay preguntas guardadas en el banco para este grado. Puedes redactarla haciendo clic en "✏️ Redactar nueva".
          </div>
        `;
      } else {
        html += `
          <select class="form-control" onchange="onRama2BankSelect(${i}, this.value)" style="padding:6px 10px; font-size:0.8rem; margin-bottom:8px;">
            <option value="">— Selecciona una pregunta del banco —</option>
            ${bankList.map(item => `
              <option value="${item.id}" ${q.id === item.id ? 'selected' : ''}>
                ${escaparHtml((item.prompt || '').substring(0, 60))}${item.prompt && item.prompt.length > 60 ? '...' : ''} ${item.hasRubric ? '🤖' : '⚡'}
              </option>
            `).join('')}
          </select>
        `;
        if (q.prompt) {
          html += `
            <div style="background:#1e293b; border:1px solid #334155; border-radius:6px; padding:8px; font-size:0.78rem;">
              <div style="color:#f1f5f9; font-weight:600; margin-bottom:4px;">${escaparHtml(q.prompt)}</div>
              ${r2State.responseType === 'mc' ? `
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; font-size:0.74rem; color:#94a3b8;">
                  <span style="${q.correct === 'A' ? 'color:#4ade80; font-weight:700;' : ''}">A) ${escaparHtml(q.options?.A || '')}</span>
                  <span style="${q.correct === 'B' ? 'color:#4ade80; font-weight:700;' : ''}">B) ${escaparHtml(q.options?.B || '')}</span>
                  <span style="${q.correct === 'C' ? 'color:#4ade80; font-weight:700;' : ''}">C) ${escaparHtml(q.options?.C || '')}</span>
                  <span style="${q.correct === 'D' ? 'color:#4ade80; font-weight:700;' : ''}">D) ${escaparHtml(q.options?.D || '')}</span>
                </div>
              ` : `
                <div style="color:#4ade80; font-weight:700; font-size:0.75rem;">Rpta esperada: ${escaparHtml(q.expectedAnswer || q.correct || '')}</div>
              `}
            </div>
          `;
        }
      }
    } else {
      // Modo New
      html += `
        <label style="font-size:0.68rem; color:#94a3b8; display:block; margin-bottom:4px;">Enunciado</label>
        <textarea class="form-control" rows="2" maxlength="200"
          placeholder="Escribe el enunciado de la pregunta ${i + 1}..."
          oninput="onRama2PromptInput(${i}, this.value)"
          style="resize:vertical; font-size:0.8rem; margin-bottom:8px;">${escaparHtml(q.prompt || '')}</textarea>
      `;
      html += `
        <label style="font-size:0.68rem; color:#94a3b8; display:block; margin-bottom:4px;">
          Alternativas (marca el círculo verde de la <strong>clave correcta</strong>):
        </label>
        ${r2State.responseType === 'free' ? `
          <div style="font-size:0.7rem; color:#6ee7b7; background:#064e3b25; border:1px solid #10b98140; border-radius:6px; padding:6px 8px; margin-bottom:8px; line-height:1.4;">
            💡 En la ficha escrita el estudiante verá el recuadro <strong>Rpta: _______</strong>. El texto de la alternativa correcta que marques será la respuesta esperada para calificarla.
          </div>
        ` : ''}
        <div style="display:flex; flex-direction:column; gap:4px;">
          ${['A', 'B', 'C', 'D'].map(opt => `
            <div style="display:flex; align-items:center; gap:8px;">
              <input type="radio" name="r2_rad_${i}" id="r2_rad_${i}_${opt}" value="${opt}" ${q.correct === opt ? 'checked' : ''}
                onchange="onRama2CorrectChange(${i}, '${opt}')" style="accent-color:#10b981; width:16px; height:16px; cursor:pointer;">
              <label for="r2_rad_${i}_${opt}" style="font-weight:700; color:#f1f5f9; width:18px; cursor:pointer;">${opt})</label>
              <input type="text" class="form-control" placeholder="Alternativa ${opt}" value="${escaparHtml(q.options?.[opt] || '')}"
                oninput="onRama2OptionInput(${i}, '${opt}', this.value)" style="padding:4px 8px; font-size:0.78rem;">
            </div>
          `).join('')}
        </div>
      `;
    }

    html += `</div>`;
  }

  container.innerHTML = html;
}

function confirmRama2() {
  if (!wizardClassroomId) {
    showToast('⚠️ Por favor selecciona un salón primero.');
    return;
  }

  const activeQuestions = [];
  for (let i = 0; i < r2State.count; i++) {
    const q = r2State.questions[i];
    if (!q || !q.prompt || !q.prompt.trim()) {
      showToast(`⚠️ Falta el enunciado para la Pregunta ${i + 1}.`);
      return;
    }
    if (!q.options || !q.options.A || !q.options.B || !q.options.C || !q.options.D ||
        !q.options.A.trim() || !q.options.B.trim() || !q.options.C.trim() || !q.options.D.trim()) {
      showToast(`⚠️ Completa las 4 alternativas (A, B, C, D) para la Pregunta ${i + 1}.`);
      return;
    }

    const correctKey = q.correct || 'A';
    const optObj = {
      A: q.options.A.trim(),
      B: q.options.B.trim(),
      C: q.options.C.trim(),
      D: q.options.D.trim()
    };
    const answerText = optObj[correctKey] || '';

    activeQuestions.push({
      id: q.id || ('r2_q' + (i + 1)),
      prompt: q.prompt.trim(),
      options: optObj,
      correct: correctKey,
      expectedAnswer: answerText,
      mode: q.mode
    });
  }

  const g = (typeof gradoDelSalon === 'function') ? gradoDelSalon(wizardClassroomId) : null;
  const isOMR = r2State.responseType === 'mc';

  // Guardar en el banco de preguntas del grado las que hayan sido redactadas nuevas (sin IA)
  if (typeof ClassroomData !== 'undefined' && ClassroomData.saveCustomEvaluation) {
    activeQuestions.forEach(aq => {
      if (aq.mode === 'new') {
        ClassroomData.saveCustomEvaluation({
          title: 'Pregunta de alternativa',
          prompt: aq.prompt,
          options: aq.options,
          correct: aq.correct,
          expectedAnswer: aq.expectedAnswer,
          gradeStage: g?.stage,
          gradeLevel: g?.level,
          gradeText: g?.texto,
          type: 'mc',
          questionCount: 1,
          questions: [{
            prompt: aq.prompt,
            options: aq.options,
            correct: aq.correct,
            expectedAnswer: aq.expectedAnswer
          }],
          hasRubric: false
        });
      }
    });
  }

  wizardEval = {
    id: 'eval_r2_' + Date.now(),
    branch: 'rama2',
    type: isOMR ? 'mc' : 'free',
    withGrid: r2State.withGrid,
    questionCount: r2State.count,
    questions: activeQuestions,
    title: `Focalizada en la Respuesta (${r2State.count}P)`,
    prompt: activeQuestions.map((q, idx) => `${idx + 1}. ${q.prompt}`).join(' | '),
    expectedAnswer: isOMR ? activeQuestions.map(q => q.correct).join(' ') : activeQuestions.map(q => q.expectedAnswer).join(' ; '),
    correctionMode: 'quick',
    gradeStage: g?.stage,
    gradeLevel: g?.level,
    gradeText: g?.texto
  };

  wizardEvalType = isOMR ? (r2State.count === 1 ? 'mc1' : 'mc2') : 'free';
  showSummary();
}

// ── CONTROLADOR RAMA 3: CARTILLA DE RESPUESTAS OMR ──
let r3State = {
  count: 10,
  mode: 'keys', // 'keys' | 'bank'
  keys: Array(20).fill('A'),
  bankQuestions: Array(20).fill(null)
};

function initRama3Builder() {
  updateRama3ControlsUI();
  if (r3State.mode === 'keys') {
    renderRama3Matrix();
  } else {
    renderRama3BankList();
  }
}

function setRama3Count(count) {
  r3State.count = parseInt(count, 10) || 10;
  updateRama3ControlsUI();
  if (r3State.mode === 'keys') {
    renderRama3Matrix();
  } else {
    renderRama3BankList();
  }
}

function setRama3Mode(mode) {
  r3State.mode = mode === 'bank' ? 'bank' : 'keys';
  updateRama3ControlsUI();
  if (r3State.mode === 'keys') {
    renderRama3Matrix();
  } else {
    renderRama3BankList();
  }
}

function updateRama3ControlsUI() {
  const countBtns = document.querySelectorAll('.btn-r3-qcount');
  countBtns.forEach(btn => {
    const val = parseInt(btn.textContent.trim(), 10);
    if (val === r3State.count) {
      btn.style.borderColor = '#0284c7';
      btn.style.background = 'rgba(2,132,199,0.25)';
      btn.style.color = '#38bdf8';
    } else {
      btn.style.borderColor = '#334155';
      btn.style.background = '#1e293b';
      btn.style.color = '#94a3b8';
    }
  });

  const btnKeys = document.getElementById('btn-r3-mode-keys');
  const btnBank = document.getElementById('btn-r3-mode-bank');
  const wrapKeys = document.getElementById('rama3-keys-wrap');
  const wrapBank = document.getElementById('rama3-bank-wrap');

  if (btnKeys && btnBank) {
    if (r3State.mode === 'keys') {
      btnKeys.style.borderColor = '#0284c7';
      btnKeys.style.background = 'rgba(2,132,199,0.2)';
      btnKeys.style.color = '#38bdf8';
      btnBank.style.borderColor = '#334155';
      btnBank.style.background = '#1e293b';
      btnBank.style.color = '#94a3b8';
      if (wrapKeys) wrapKeys.style.display = 'block';
      if (wrapBank) wrapBank.style.display = 'none';
    } else {
      btnBank.style.borderColor = '#0284c7';
      btnBank.style.background = 'rgba(2,132,199,0.2)';
      btnBank.style.color = '#38bdf8';
      btnKeys.style.borderColor = '#334155';
      btnKeys.style.background = '#1e293b';
      btnKeys.style.color = '#94a3b8';
      if (wrapKeys) wrapKeys.style.display = 'none';
      if (wrapBank) wrapBank.style.display = 'block';
    }
  }
}

function setRama3Key(qIdx, key) {
  if (qIdx >= 0 && qIdx < 20) {
    r3State.keys[qIdx] = key;
    renderRama3Matrix();
  }
}

function renderRama3Matrix() {
  const container = document.getElementById('rama3-keys-matrix');
  if (!container) return;

  let html = '';
  for (let i = 0; i < r3State.count; i++) {
    const selectedKey = r3State.keys[i] || 'A';
    html += `
      <div style="background:#090d16; border:1px solid #334155; border-radius:8px; padding:6px 8px; display:flex; align-items:center; justify-content:space-between; gap:4px;">
        <span style="font-size:0.75rem; font-weight:800; color:#cbd5e1; width:28px;">P${(i + 1).toString().padStart(2, '0')}</span>
        <div style="display:flex; gap:3px;">
          ${['A', 'B', 'C', 'D'].map(k => {
            const isSel = selectedKey === k;
            return `
              <button type="button" onclick="setRama3Key(${i}, '${k}')"
                style="width:24px; height:24px; border-radius:50%; border:1px solid ${isSel ? '#0284c7' : '#334155'}; background:${isSel ? '#0284c7' : '#1e293b'}; color:${isSel ? '#fff' : '#94a3b8'}; font-size:0.72rem; font-weight:${isSel ? '800' : '600'}; cursor:pointer; padding:0; display:flex; align-items:center; justify-content:center; transition:all 0.1s;">
                ${k}
              </button>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }
  container.innerHTML = html;
}

function renderRama3BankList() {
  const container = document.getElementById('rama3-bank-list');
  if (!container) return;

  const g = (typeof evaluacionesDelGradoActual === 'function')
    ? evaluacionesDelGradoActual()
    : { lista: [] };
  const bankList = g.lista || [];

  if (bankList.length === 0) {
    container.innerHTML = `
      <div style="padding:12px; background:#1e293b; border-radius:8px; font-size:0.78rem; color:#f59e0b; text-align:center;">
        ⚠️ No hay preguntas guardadas para este grado. Puedes usar el <strong>Modo A (Solo Claves)</strong> para definir la pauta de corrección rápidamente.
      </div>
    `;
    return;
  }

  let html = '';
  for (let i = 0; i < r3State.count; i++) {
    const selQ = r3State.bankQuestions[i];
    html += `
      <div style="background:#090d16; border:1px solid #334155; border-radius:8px; padding:6px 10px; display:flex; align-items:center; gap:8px;">
        <span style="font-size:0.75rem; font-weight:800; color:#38bdf8; width:30px;">P${(i + 1).toString().padStart(2, '0')}</span>
        <select class="form-control" onchange="onRama3BankSelect(${i}, this.value)" style="flex:1; padding:5px 8px; font-size:0.75rem;">
          <option value="">— Seleccionar pregunta —</option>
          ${bankList.map(item => `
            <option value="${item.id}" ${selQ && selQ.id === item.id ? 'selected' : ''}>
              ${escaparHtml((item.prompt || '').substring(0, 50))}${item.prompt && item.prompt.length > 50 ? '...' : ''} (Clave: ${item.correct || 'A'})
            </option>
          `).join('')}
        </select>
        <span style="font-size:0.75rem; font-weight:800; color:#4ade80; background:#064e3b; padding:2px 8px; border-radius:4px; border:1px solid #10b981;">
          ${r3State.keys[i] || 'A'}
        </span>
      </div>
    `;
  }
  container.innerHTML = html;
}

function onRama3BankSelect(qIdx, qId) {
  const g = (typeof evaluacionesDelGradoActual === 'function')
    ? evaluacionesDelGradoActual()
    : { lista: [] };
  const found = g.lista.find(q => q.id === qId);
  if (found) {
    r3State.bankQuestions[qIdx] = found;
    r3State.keys[qIdx] = found.correct || 'A';
  } else {
    r3State.bankQuestions[qIdx] = null;
  }
  renderRama3BankList();
}

function rama3AutofillFromBank() {
  const g = (typeof evaluacionesDelGradoActual === 'function')
    ? evaluacionesDelGradoActual()
    : { lista: [] };
  const bankList = g.lista || [];

  if (bankList.length === 0) {
    showToast('⚠️ No hay preguntas en el banco para este grado.');
    return;
  }

  for (let i = 0; i < r3State.count; i++) {
    if (i < bankList.length) {
      r3State.bankQuestions[i] = bankList[i];
      r3State.keys[i] = bankList[i].correct || 'A';
    }
  }
  renderRama3BankList();
  showToast(`⚡ Se autocompletaron las preguntas disponibles.`);
}

function confirmRama3() {
  if (!wizardClassroomId) {
    showToast('⚠️ Por favor selecciona un salón primero.');
    return;
  }

  const questions = [];
  for (let i = 0; i < r3State.count; i++) {
    const qObj = r3State.bankQuestions[i];
    questions.push({
      id: qObj?.id || ('r3_q' + (i + 1)),
      num: i + 1,
      prompt: qObj?.prompt || `Pregunta ${i + 1}`,
      options: qObj?.options || { A: 'A', B: 'B', C: 'C', D: 'D' },
      correct: r3State.keys[i] || 'A'
    });
  }

  const g = (typeof gradoDelSalon === 'function') ? gradoDelSalon(wizardClassroomId) : null;

  wizardEval = {
    id: 'eval_r3_' + Date.now(),
    branch: 'rama3',
    type: 'mc', // Regla 2: Cartilla OMR es type mc
    withGrid: false,
    questionCount: r3State.count,
    questions: questions,
    title: `Cartilla de Respuestas (${r3State.count} Preguntas)`,
    prompt: `Cartilla de respuestas de ${r3State.count} preguntas`,
    expectedAnswer: r3State.keys.slice(0, r3State.count).join(' '),
    correctionMode: 'quick',
    gradeStage: g?.stage,
    gradeLevel: g?.level,
    gradeText: g?.texto
  };

  wizardEvalType = 'mc';
  showSummary();
}

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
  window.renderBankManagerGradeTabs = renderBankManagerGradeTabs;
  window.renderBankManagerQuestions = renderBankManagerQuestions;
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
  window.confirmNewEvalMC1 = confirmNewEvalMC1;
  window.confirmNewEvalFree = confirmNewEvalFree;
  window.confirmNewEval = confirmNewEval;
  window.mc2Init = mc2Init;
  window.mc2SetP1Mode = mc2SetP1Mode;
  window.mc2SetP2Mode = mc2SetP2Mode;
  window.mc2OnBankSelect = mc2OnBankSelect;
  window.confirmMC2 = confirmMC2;
  window.promptMCCorrectionMode = promptMCCorrectionMode;
  window.selectMCCorrectionModeAndProceed = selectMCCorrectionModeAndProceed;
  window.salirDelEscaner = salirDelEscaner;
  window.intentarIniciarCamara = intentarIniciarCamara;

  // Nuevas funciones de Ramas 1, 2 y 3 (Fase 2)
  window.selectBranchMode = selectBranchMode;
  window.setRama2Grid = setRama2Grid;
  window.setRama2Type = setRama2Type;
  window.setRama2Count = setRama2Count;
  window.setRama2QMode = setRama2QMode;
  window.onRama2PromptInput = onRama2PromptInput;
  window.onRama2OptionInput = onRama2OptionInput;
  window.onRama2CorrectChange = onRama2CorrectChange;
  window.onRama2ExpectedInput = onRama2ExpectedInput;
  window.onRama2BankSelect = onRama2BankSelect;
  window.renderRama2Questions = renderRama2Questions;
  window.confirmRama2 = confirmRama2;

  window.setRama3Count = setRama3Count;
  window.setRama3Mode = setRama3Mode;
  window.setRama3Key = setRama3Key;
  window.renderRama3Matrix = renderRama3Matrix;
  window.renderRama3BankList = renderRama3BankList;
  window.onRama3BankSelect = onRama3BankSelect;
  window.rama3AutofillFromBank = rama3AutofillFromBank;
  window.confirmRama3 = confirmRama3;
  window.r2State = r2State;
  window.r3State = r3State;
}


