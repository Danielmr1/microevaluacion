// =============================================================================
// card-builder-focalizada.js — Microevaluación A5
// MÓDULO: CONSTRUCTOR DE EVALUACIÓN FOCALIZADA (RAMA 2: 1 A 5 PREGUNTAS)
//
// Responsabilidad única:
//   - Configuración de evaluación focalizada (1-5 preguntas, respuesta u opciones).
//   - Alternancia de cuadrícula de cálculo borrador y opciones múltiples vs libre.
//   - Edición de consignas y selección de preguntas desde el banco.
//   - Confirmación y preparación de la ficha focalizada.
// =============================================================================

// ── CONTROLADOR RAMA 2: EVALUACIÓN FOCALIZADA ──
let r2State = {
  withGrid: true,
  responseType: 'mc', // 'mc' | 'free'
  count: 1, // 1, 2, 3, 4, 5
  questions: [
    { mode: 'new', prompt: '', options: { A: '', B: '', C: '', D: '' }, correct: 'A', expectedAnswer: '' },
    { mode: 'new', prompt: '', options: { A: '', B: '', C: '', D: '' }, correct: 'A', expectedAnswer: '' },
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
  // Guardarraíl: si activa cuadrícula, no pueden ser más de 2 preguntas
  if (r2State.withGrid && r2State.count > 2) {
    r2State.count = 2;
    if (typeof showToast === 'function') {
      showToast('ℹ️ Con cuadrícula de borrador el máximo es 2 preguntas.');
    }
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
  r2State.count = Math.min(Math.max(1, count), 5);
  // Guardarraíl reactivo: si elige 3 o más preguntas, se desactiva la cuadrícula automáticamente
  if (r2State.count > 2 && r2State.withGrid) {
    r2State.withGrid = false;
    if (typeof showToast === 'function') {
      showToast('ℹ️ A partir de 3 preguntas no cabe la cuadrícula de borrador.');
    }
  }
  updateRama2ControlsUI();
  renderRama2Questions();
}

function updateRama2ControlsUI() {
  const btnGridYes = document.getElementById('btn-r2-grid-yes');
  const btnGridNo = document.getElementById('btn-r2-grid-no');
  if (btnGridYes && btnGridNo) {
    if (r2State.count > 2) {
      // Bloquear botón de cuadrícula
      btnGridYes.disabled = true;
      btnGridYes.style.opacity = '0.4';
      btnGridYes.style.cursor = 'not-allowed';
      btnGridYes.style.borderColor = '#334155';
      btnGridYes.style.background = '#1e293b';
      btnGridYes.style.color = '#64748b';

      btnGridNo.disabled = false;
      btnGridNo.style.opacity = '1';
      btnGridNo.style.cursor = 'pointer';
      btnGridNo.style.borderColor = '#10b981';
      btnGridNo.style.background = 'rgba(16,185,129,0.18)';
      btnGridNo.style.color = '#a7f3d0';
    } else {
      btnGridYes.disabled = false;
      btnGridYes.style.opacity = '1';
      btnGridYes.style.cursor = 'pointer';
      btnGridNo.disabled = false;
      btnGridNo.style.opacity = '1';
      btnGridNo.style.cursor = 'pointer';

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

  const buttonsCount = [
    document.getElementById('btn-r2-count-1'),
    document.getElementById('btn-r2-count-2'),
    document.getElementById('btn-r2-count-3'),
    document.getElementById('btn-r2-count-4'),
    document.getElementById('btn-r2-count-5')
  ];

  buttonsCount.forEach((b, idx) => {
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

// ── EXPOSICIÓN GLOBAL DE FUNCIONES DE CONSTRUCTOR RAMA 2 ──
if (typeof window !== 'undefined') {
  window.r2State = r2State;
  window.initRama2Builder = initRama2Builder;
  window.setRama2Grid = setRama2Grid;
  window.setRama2Type = setRama2Type;
  window.setRama2Count = setRama2Count;
  window.updateRama2ControlsUI = updateRama2ControlsUI;
  window.setRama2QMode = setRama2QMode;
  window.onRama2PromptInput = onRama2PromptInput;
  window.onRama2OptionInput = onRama2OptionInput;
  window.onRama2CorrectChange = onRama2CorrectChange;
  window.onRama2ExpectedInput = onRama2ExpectedInput;
  window.onRama2BankSelect = onRama2BankSelect;
  window.renderRama2Questions = renderRama2Questions;
  window.confirmRama2 = confirmRama2;
}
