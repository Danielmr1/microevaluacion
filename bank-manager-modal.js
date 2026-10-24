// =============================================================================
// bank-manager-modal.js — Microevaluación
// MÓDULO: GESTOR DEL BANCO DE PREGUNTAS (MODAL DE 50 PREGUNTAS)
// =============================================================================

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

  // Sincronización en segundo plano con Supabase para reflejar cambios entre dispositivos
  if (typeof SupabaseClient !== 'undefined' && SupabaseClient.loadRecentEvaluations) {
    SupabaseClient.loadRecentEvaluations().then(recent => {
      if (recent && typeof ClassroomData !== 'undefined' && ClassroomData.setRecentEvaluations) {
        ClassroomData.setRecentEvaluations(recent);
        renderBankManagerQuestions();
      }
    }).catch(err => console.warn('[Bank Manager Sync Error]', err));
  }
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
        ? 'background:#00B4D8; color:#ffffff; font-weight:700; box-shadow:0 1px 4px rgba(0,180,216,0.35);'
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
        ? 'background:#00B4D8; color:#ffffff; font-weight:700; border:1.5px solid #00B4D8; box-shadow:0 2px 6px rgba(0,180,216,0.35);'
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
        ? 'background:#e0f7fa; color:#007791; font-weight:700; border:1.5px solid #00B4D8;'
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

  // Actualizar indicador global de capacidad (máximo 50 preguntas en toda la cuenta)
  const totalBankCount = (typeof ClassroomData !== 'undefined' && ClassroomData.getBankQuestionsCount)
    ? ClassroomData.getBankQuestionsCount()
    : allGradeQuestions.length;
  const isFull = totalBankCount >= 50;

  const capBadge = document.getElementById('bm-global-capacity-badge');
  const capText = document.getElementById('bm-global-capacity-text');
  if (capBadge && capText) {
    capBadge.style.background = isFull ? '#fee2e2' : '#f0fdf4';
    capBadge.style.color = isFull ? '#dc2626' : '#15803d';
    capBadge.style.border = isFull ? '1.5px solid #fca5a5' : '1.5px solid #bbf7d0';
    capText.textContent = `${totalBankCount} / 50 en tu banco${isFull ? ' (Lleno)' : ''}`;
  }

  const btnAdd = document.getElementById('btn-toggle-add-question');
  if (btnAdd) {
    if (isFull) {
      btnAdd.style.opacity = '0.65';
      btnAdd.title = 'Límite máximo de 50 preguntas alcanzado. Elimina alguna para agregar una nueva.';
    } else {
      btnAdd.style.opacity = '1';
      btnAdd.title = 'Agregar nueva pregunta a este grado';
    }
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
    card.style.cssText = 'background:#ffffff; border:1.5px solid #dcd8ce; border-radius:12px; padding:14px 16px; display:flex; flex-direction:column; gap:10px; box-shadow:0 2px 8px rgba(43,33,24,0.04);';

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
        btnLink.style.cssText = 'background:#f0fbfd; border:1px solid rgba(0,180,216,0.35); color:#007791; border-radius:7px; padding:4px 10px; font-size:0.72rem; font-weight:700; cursor:pointer; transition:all 0.15s; display:inline-flex; align-items:center; gap:5px;';
        btnLink.addEventListener('mouseenter', () => { btnLink.style.background = '#e0f7fa'; btnLink.style.borderColor = '#00B4D8'; });
        btnLink.addEventListener('mouseleave', () => { btnLink.style.background = '#f0fbfd'; btnLink.style.borderColor = 'rgba(0,180,216,0.35)'; });
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
    promptText.style.cssText = 'font-size:0.92rem; color:#181512; font-weight:700; line-height:1.45;';
    promptText.innerHTML = (typeof formatMathHtml === 'function')
      ? formatMathHtml(escaparHtml(q.prompt || ''))
      : escaparHtml(q.prompt || '');

    // Alternativas en 2 columnas
    const optsGrid = document.createElement('div');
    optsGrid.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:0.75rem;';
    ['A', 'B', 'C', 'D'].forEach(letter => {
      const isCorrect = (q.correct || 'A').toUpperCase() === letter;
      const optVal = q.options ? q.options[letter] : '';
      const optSafe = escaparHtml(optVal || '—');
      const optFormatted = (typeof formatMathHtml === 'function') ? formatMathHtml(optSafe) : optSafe;
      const optDiv = document.createElement('div');
      optDiv.style.cssText = isCorrect
        ? 'color:#181512; font-weight:800; background:#fff8e1; padding:6px 10px; border-radius:6px; border:1.5px solid #FFB703; box-shadow:0 0 0 1.5px rgba(0,180,216,0.3);'
        : 'color:#181512; padding:6px 10px; background:#F8F6F0; border-radius:6px; border:1px solid #dcd8ce;';
      optDiv.innerHTML = isCorrect
        ? `<span>${letter}) ${optFormatted}</span> <span style="color:#00B4D8; font-weight:900;">✓ (Clave)</span>`
        : `${letter}) ${optFormatted}`;
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
      btnRubric.style.cssText = 'background:#F8F6F0; border:1.5px solid #dcd8ce; color:#181512; border-radius:7px; padding:5px 12px; font-size:0.75rem; font-weight:700; cursor:pointer; transition:all 0.15s; display:inline-flex; align-items:center; gap:6px;';
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

  const promptSafe = escaparHtml(q.prompt || '');
  const promptText = (typeof formatMathHtml === 'function') ? formatMathHtml(promptSafe) : promptSafe;
  let optsHtml = '';
  if (q.options) {
    optsHtml = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:8px; font-size:0.75rem;">
        ${['A', 'B', 'C', 'D'].map(l => {
          const isCorrect = (q.correct || 'A').toUpperCase() === l;
          const valSafe = escaparHtml(q.options[l] || '');
          const val = (typeof formatMathHtml === 'function') ? formatMathHtml(valSafe) : valSafe;
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

    // Confianza del modelo: normaliza 0.0-1.0 (decimal), 1-5 (escala Likert), 1-10 o 0-100 (%)
    let confVal = null;
    if (r.confianza != null && r.confianza !== '') {
      const n = Number(r.confianza);
      if (isFinite(n) && n > 0) {
        if (n <= 1) confVal = Math.round(n * 100);
        else if (n <= 5) confVal = Math.round((n / 5) * 100);
        else if (n <= 10) confVal = Math.round((n / 10) * 100);
        else confVal = Math.min(100, Math.round(n));
      }
    }
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

let bmCurrentRubric = null;

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
    if (title && bankManagerActiveGrade) {
      title.textContent = `Redactar Pregunta de Alternativas (${bankManagerActiveGrade.label})`;
    }

    const promptInput = document.getElementById('bm-prompt');
    if (promptInput) promptInput.value = '';
    ['a', 'b', 'c', 'd'].forEach(lettr => {
      const inp = document.getElementById('bm-opt-' + lettr);
      if (inp) inp.value = '';
    });
    const radA = document.getElementById('bm-rad-a');
    if (radA) radA.checked = true;

    bmCurrentRubric = null;
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

  const optA = (document.getElementById('bm-opt-a')?.value || '').trim();
  const optB = (document.getElementById('bm-opt-b')?.value || '').trim();
  const optC = (document.getElementById('bm-opt-c')?.value || '').trim();
  const optD = (document.getElementById('bm-opt-d')?.value || '').trim();
  if (!optA || !optB || !optC || !optD) {
    showToast('⚠️ Completa las 4 alternativas (A, B, C, D).');
    return;
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

  // Comparación y corrección automática de clave
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

  let keyNoticeHtml = '';
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

  // Guardar pregunta en ClassroomData y SupabaseClient
  const expAns = opts[activeCorrectKey] || canon || prompt;
  const newQ = {
    id: 'q_custom_' + Date.now(),
    prompt: prompt,
    options: opts,
    correct: activeCorrectKey,
    expectedAnswer: expAns,
    rubric: bmCurrentRubric,
    hasRubric: true,
    gradeStage: bankManagerActiveGrade.stage,
    gradeLevel: Number(bankManagerActiveGrade.level),
    gradeText: bankManagerActiveGrade.label
  };

  const evalObj = {
    title: 'Pregunta de alternativa con rúbrica IA',
    type: 'mc',
    questionCount: 1,
    prompt: prompt,
    expectedAnswer: expAns,
    options: opts,
    correct: activeCorrectKey,
    questions: [newQ],
    rubric: bmCurrentRubric,
    hasRubric: true,
    gradeStage: bankManagerActiveGrade.stage,
    gradeLevel: Number(bankManagerActiveGrade.level),
    gradeText: bankManagerActiveGrade.label
  };

  ClassroomData.saveCustomEvaluation(evalObj);
  SupabaseClient.saveEvaluation(evalObj).catch(e => console.warn('[Manager Save Cloud]', e));

  // Refrescar lista de preguntas en el gestor
  renderBankManagerQuestions();
  if (typeof renderBankCards === 'function') renderBankCards();

  // Transición a la Vista Consolidada en el modal
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
    optionsEl.innerHTML = ['A', 'B', 'C', 'D'].map(k => {
      const isCorrect = (k === activeCorrectKey);
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
  }

  if (consolidatedCard) consolidatedCard.style.display = 'flex';

  if (typeof showToast === 'function') showToast('✅ Pregunta guardada con éxito en el banco');
}

function editBMDraftQuestion() {
  const formFields = document.getElementById('bm-new-form-fields');
  const consolidatedCard = document.getElementById('bm-new-consolidated-card');
  if (formFields) formFields.style.display = 'flex';
  if (consolidatedCard) consolidatedCard.style.display = 'none';
  bmCurrentRubric = null;
}
window.editBMDraftQuestion = editBMDraftQuestion;

window._viewCurrentBMDraftRubric = () => {
  if (!bmCurrentRubric) return;
  const prompt = (document.getElementById('bm-prompt')?.value || '').trim();
  const opts = {
    A: (document.getElementById('bm-opt-a')?.value || '').trim(),
    B: (document.getElementById('bm-opt-b')?.value || '').trim(),
    C: (document.getElementById('bm-opt-c')?.value || '').trim(),
    D: (document.getElementById('bm-opt-d')?.value || '').trim()
  };
  const correct = document.querySelector('input[name="bm-correct"]:checked')?.value || 'A';
  if (typeof handleViewQuestionRubric === 'function') {
    handleViewQuestionRubric({ prompt, options: opts, correct, rubric: bmCurrentRubric });
  }
};

/**
 * Guarda una pregunta rápida de alternativas directamente en el banco sin consultar a Gemini.
 * Apta para evaluación focalizada de contenido (Rama 2) y cartillas (Rama 3).
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

// Exposición global
if (typeof window !== "undefined") {
  window.openBankManagerModal = openBankManagerModal;
  window.closeBankManagerModal = closeBankManagerModal;
  window.renderBankManagerStageTabs = renderBankManagerStageTabs;
  window.renderBankManagerGradeTabs = renderBankManagerGradeTabs;
  window.renderBankManagerFilterPills = renderBankManagerFilterPills;
  window.renderBankManagerQuestions = renderBankManagerQuestions;
  window.onBankManagerSearchInput = onBankManagerSearchInput;
  window.handleViewQuestionRubric = handleViewQuestionRubric;
  window.toggleBankManagerAddForm = toggleBankManagerAddForm;
  window.editBMDraftQuestion = editBMDraftQuestion;
  window._viewCurrentBMDraftRubric = _viewCurrentBMDraftRubric;
  window.handleSaveQuestionFromManager = handleSaveQuestionFromManager;
  window.handleSaveQuickQuestionFromManager = handleSaveQuickQuestionFromManager;
  window.handleUpgradeQuestionWithRubric = handleUpgradeQuestionWithRubric;
}
