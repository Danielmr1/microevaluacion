// =============================================================================
// card-exam-builder.js — Microevaluación A5 v3.2.61
// MÓDULO: CONSTRUCTORES DE EVALUACIÓN MULTIPREGUNTA (RAMA 2 Y RAMA 3)
//
// Responsabilidad única:
//   - Constructor Rama 2: Evaluación focalizada (1-5 preguntas, respuesta u opciones).
//   - Constructor Rama 3: Evaluación de hasta 20 preguntas con Cartilla OMR y Examen.
//   - Matriz interactiva de claves OMR y keypad virtual de burbujas.
//   - Previsualización y paginación de folleto de examen escolar.
//
// Dependencias globales: ClassroomData, wizardClassroomId, showToast, openFlow,
//                        evaluacionesDelGradoActual, printQuestionBooklet
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

// ── CONTROLADOR RAMA 3: CARTILLA DE RESPUESTAS OMR ──
let r3State = {
  count: 10,
  mode: 'bank', // 'bank' | 'keys'
  activePage: 1, // 1 | 2
  soloKeys: Array(20).fill(null), // Modo A: Solo Cartilla (100% independiente, arranca sin nada seleccionado)
  keys: Array(20).fill('A'),     // Modo B: Evaluación y Cartillas
  bankQuestions: Array(20).fill(null)
};

let r3ActiveKeyIdx = 0;

function resetRama3Builder() {
  r3State.count = 10;
  r3State.mode = 'bank';
  r3State.activePage = 1;
  r3State.soloKeys = Array(20).fill(null);
  r3State.keys = Array(20).fill('A');
  r3State.bankQuestions = Array(20).fill(null);
  r3ActiveKeyIdx = 0;
}

function initRama3Builder() {
  updateRama3ControlsUI();
  if (r3State.mode === 'keys') {
    renderRama3Matrix();
  } else {
    renderRama3Exam();
    renderRama3CartillaPreview();
  }
}

function setRama3Count(count) {
  r3State.count = parseInt(count, 10) || 10;
  r3State.activePage = 1;
  if (r3ActiveKeyIdx >= r3State.count) {
    r3ActiveKeyIdx = 0;
  }
  updateRama3ControlsUI();
  if (r3State.mode === 'keys') {
    renderRama3Matrix();
  } else {
    renderRama3Exam();
    renderRama3CartillaPreview();
  }
}

function setRama3Mode(mode) {
  r3State.mode = mode === 'bank' ? 'bank' : 'keys';
  updateRama3ControlsUI();
  if (r3State.mode === 'keys') {
    renderRama3Matrix();
  } else {
    renderRama3Exam();
    renderRama3CartillaPreview();
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(fitRama3ToViewport);
    } else {
      fitRama3ToViewport();
    }
  }
}

function setRama3Page(pageNum) {
  r3State.activePage = parseInt(pageNum, 10) || 1;
  renderRama3Exam();
}

function updateRama3ControlsUI() {
  const countBtns = document.querySelectorAll('.btn-r3-qcount');
  countBtns.forEach(btn => {
    const val = parseInt(btn.textContent.trim(), 10);
    const isActive = (val === r3State.count);
    btn.classList.toggle('active', isActive);
    if (isActive) {
      btn.style.borderColor = '#0284c7';
      btn.style.background = '#e0f2fe';
      btn.style.color = '#0284c7';
    } else {
      btn.style.borderColor = '#cbd5e1';
      btn.style.background = '#ffffff';
      btn.style.color = '#475569';
    }
  });

  // Título dinámico del tamaño de cartilla para ambos modos (A6 hasta 10 preguntas, A5 para 15 y 20)
  const cartillaTitleText = (r3State.count <= 10) ? '📄 Cartilla A6' : '📄 Cartilla A5';
  const keysTitle = document.getElementById('r3-keys-cartilla-title');
  if (keysTitle) {
    keysTitle.textContent = cartillaTitleText;
  }
  const bankTitle = document.getElementById('r3-bank-cartilla-title');
  if (bankTitle) {
    bankTitle.textContent = cartillaTitleText;
  }

  const examFormatBadge = document.getElementById('r3-exam-format-badge');
  if (examFormatBadge) {
    examFormatBadge.textContent = (r3State.count <= 6) ? '📄 Evaluación A5 Vertical' : '📄 Evaluación A4 Vertical';
  }

  const layoutBadge = document.getElementById('r3-layout-badge');
  if (layoutBadge) {
    if (r3State.count <= 6) {
      layoutBadge.innerHTML = '📄 <b>Evaluación A5 Vertical</b> (2 alumnos por A4) + Cartilla A6 (4 alumnos por A4)';
    } else if (r3State.count <= 10) {
      layoutBadge.innerHTML = '📄 <b>Evaluación A4 Vertical</b> + Cartilla A6 (4 alumnos por A4)';
    } else {
      layoutBadge.innerHTML = '📄 <b>Evaluación A4 Vertical</b> + Cartilla A5 (2 alumnos por A4)';
    }
    layoutBadge.style.color = '#0369a1';
    layoutBadge.style.borderColor = '#bae6fd';
    layoutBadge.style.background = '#f0f9ff';
  }

  const btnKeys = document.getElementById('btn-r3-mode-keys');
  const btnBank = document.getElementById('btn-r3-mode-bank');
  const wrapKeys = document.getElementById('rama3-keys-wrap');
  const wrapBank = document.getElementById('rama3-bank-wrap');

  if (btnKeys && btnBank) {
    if (r3State.mode === 'keys') {
      btnKeys.classList.add('active');
      btnBank.classList.remove('active');
      btnKeys.style.borderColor = '#0284c7';
      btnKeys.style.background = '#e0f2fe';
      btnKeys.style.color = '#0284c7';
      btnBank.style.borderColor = '#cbd5e1';
      btnBank.style.background = '#ffffff';
      btnBank.style.color = '#64748b';
      if (wrapKeys) wrapKeys.style.display = 'block';
      if (wrapBank) wrapBank.style.display = 'none';
    } else {
      btnBank.classList.add('active');
      btnKeys.classList.remove('active');
      btnBank.style.borderColor = '#0284c7';
      btnBank.style.background = '#e0f2fe';
      btnBank.style.color = '#0284c7';
      btnKeys.style.borderColor = '#cbd5e1';
      btnKeys.style.background = '#ffffff';
      btnKeys.style.color = '#64748b';
      if (wrapKeys) wrapKeys.style.display = 'none';
      if (wrapBank) wrapBank.style.display = 'block';
    }
  }
}

function onRama3SelectRow(qIdx) {
  if (qIdx >= 0 && qIdx < r3State.count) {
    r3ActiveKeyIdx = qIdx;
    renderRama3KeysCartilla();
  }
}

function onRama3BubbleClick(event, qIdx, letter) {
  if (event) {
    try { event.stopPropagation(); } catch (e) {}
  }
  if (qIdx >= 0 && qIdx < r3State.count) {
    r3State.soloKeys[qIdx] = letter;
    if (qIdx < r3State.count - 1) {
      r3ActiveKeyIdx = qIdx + 1;
    } else {
      r3ActiveKeyIdx = qIdx;
    }
    renderRama3KeysCartilla();
  }
}

function onRama3KeypadClick(letter) {
  if (r3ActiveKeyIdx >= 0 && r3ActiveKeyIdx < r3State.count) {
    r3State.soloKeys[r3ActiveKeyIdx] = letter;
    if (r3ActiveKeyIdx < r3State.count - 1) {
      r3ActiveKeyIdx++;
    }
    renderRama3KeysCartilla();
  }
}

function setRama3Key(qIdx, key) {
  if (qIdx >= 0 && qIdx < 20) {
    if (r3State.mode === 'keys') {
      r3State.soloKeys[qIdx] = key;
      renderRama3KeysCartilla();
    } else {
      r3State.keys[qIdx] = key;
      renderRama3Exam();
      renderRama3CartillaPreview();
    }
  }
}

function renderRama3Matrix() {
  renderRama3KeysCartilla();
}

function renderRama3KeysCartilla() {
  const host = document.getElementById('r3-keys-cartilla-render-host');
  if (!host) return;

  if (r3ActiveKeyIdx >= r3State.count) {
    r3ActiveKeyIdx = Math.max(0, r3State.count - 1);
  }

  const clsId = wizardClassroomId || (document.getElementById('builder-classroom')?.value);
  let classroom = null;
  if (clsId && typeof ClassroomData !== 'undefined' && ClassroomData.getClassroom) {
    classroom = ClassroomData.getClassroom(clsId);
  }
  if (!classroom) {
    classroom = {
      id: 'demo_class',
      name: 'Salón Demostración',
      gradeStage: 'primaria',
      gradeLevel: 4,
      students: []
    };
  }

  const sampleStudent = (classroom.students && classroom.students.length > 0)
    ? classroom.students[0]
    : { id: 'est_01', name: 'MATEO GARCÍA RODRÍGUEZ' };

  const evalMock = {
    id: 'eval_mock_r3_keys',
    branch: 'rama3',
    mode: 'keys',
    type: 'mc',
    withGrid: false,
    questionCount: r3State.count,
    showKeys: true,
    activeRowIdx: r3ActiveKeyIdx,
    questions: Array.from({ length: r3State.count }, (_, i) => ({
      num: i + 1,
      correct: r3State.soloKeys[i] || null
    }))
  };

  let cardHTML = '';
  if (r3State.count <= 10) {
    if (typeof createCartillaA6Card === 'function') {
      cardHTML = createCartillaA6Card(sampleStudent, classroom, evalMock);
    }
  } else {
    if (typeof createCartillaA5VerticalCard === 'function') {
      cardHTML = createCartillaA5VerticalCard(sampleStudent, classroom, evalMock);
    }
  }

  if (cardHTML) {
    host.innerHTML = cardHTML;
    if (typeof QRCode !== 'undefined' && QRCode.toString) {
      const qrPayload = (typeof getCardQRPayload === 'function') ? getCardQRPayload(sampleStudent.id, evalMock) : sampleStudent.id;
      QRCode.toString(qrPayload, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }, (err, svg) => {
        if (!err && svg) {
          const qrBox = host.querySelector('[data-qr-id="' + sampleStudent.id + '"]') || host.querySelector('#qr-box-' + sampleStudent.id);
          if (qrBox) qrBox.innerHTML = svg;
        }
      });
    }
  }

  // Actualizar keypad UI
  const labelEl = document.getElementById('r3-keypad-label');
  if (labelEl) {
    labelEl.innerHTML = `✏️ Marcando Pregunta <b>${String(r3ActiveKeyIdx + 1).padStart(2, '0')}</b> de <b>${r3State.count}</b>:`;
  }
  const currentKey = r3State.soloKeys[r3ActiveKeyIdx] || null;
  ['A', 'B', 'C', 'D'].forEach(letter => {
    const btn = document.getElementById(`btn-keypad-${letter}`);
    if (btn) {
      const isSel = (currentKey !== null && letter === currentKey);
      btn.classList.toggle('active', isSel);
      if (isSel) {
        btn.style.borderColor = '#0284c7';
        btn.style.background = '#0284c7';
        btn.style.color = '#ffffff';
      } else {
        btn.style.borderColor = '#cbd5e1';
        btn.style.background = '#f8fafc';
        btn.style.color = '#0f172a';
      }
    }
  });

  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(fitRama3ToViewport);
  } else {
    fitRama3ToViewport();
  }
}

// ── LAYOUT Y GEOMETRÍA DEL EXAMEN ESCOLAR (MODO B) ──
function determineRama3ExamLayout(count) {
  if (count <= 6) {
    // 5 y 6 preguntas: Examen en A5 Vertical (1 columna, 2 exámenes caben en un pliego A4)
    return {
      sheetClass: 'r3-exam-sheet-a5-v',
      bodyClass: 'r3-exam-body-1col',
      columns: 1,
      totalPages: 1
    };
  } else if (count <= 10) {
    // 10 preguntas (1 página A4 Vertical): 8 preguntas en Columna 1 y 2 en Columna 2
    return {
      sheetClass: 'r3-exam-sheet-a4-v',
      bodyClass: 'r3-exam-body-2col',
      columns: 2,
      totalPages: 1,
      col1Count: Math.min(count, 8),
      col2Count: Math.max(0, count - 8)
    };
  } else if (count <= 15) {
    // 15 preguntas (1 sola página A4 Vertical): 8 preguntas en Columna 1 y 7 en Columna 2
    return {
      sheetClass: 'r3-exam-sheet-a4-v',
      bodyClass: 'r3-exam-body-2col',
      columns: 2,
      totalPages: 1,
      col1Count: 8,
      col2Count: count - 8
    };
  } else {
    // 20 preguntas (1 sola página A4 Vertical): 10 en Columna 1 y 10 en Columna 2
    return {
      sheetClass: 'r3-exam-sheet-a4-v',
      bodyClass: 'r3-exam-body-2col',
      columns: 2,
      totalPages: 1,
      col1Count: 10,
      col2Count: count - 10
    };
  }
}

function openRama3QuestionPicker(slotIdx) {
  currentSimSlotScope = 'rama3';
  currentSimSlot = slotIdx;
  const modal = document.getElementById('modal-sim-picker');
  const title = document.getElementById('sim-picker-title');
  const gradeTag = document.getElementById('sim-picker-grade-tag');
  if (!modal) return;

  const g = gradoDelSalonSeleccionado();
  if (title) title.textContent = `Configurar Pregunta ${slotIdx + 1} (Examen OMR)`;
  if (gradeTag) gradeTag.textContent = g.texto || 'Sin grado asignado';

  // En Rama 3 Modo B: NO hay sección IA, SIEMPRE son alternativas A, B, C, D
  const aiSection = document.getElementById('sim-new-ai-section');
  if (aiSection) aiSection.style.display = 'none';

  const optWrap = document.getElementById('sim-new-options-wrap');
  const freeWrap = document.getElementById('sim-new-free-wrap');
  if (optWrap) optWrap.style.display = 'block';
  if (freeWrap) freeWrap.style.display = 'none';

  // Pre-cargar valores si el slot de rama 3 ya tenía contenido
  const curQ = r3State.bankQuestions[slotIdx];
  const taPrompt = document.getElementById('sim-new-prompt');
  if (taPrompt) taPrompt.value = curQ?.prompt || '';
  ['a', 'b', 'c', 'd'].forEach(lettr => {
    const inp = document.getElementById('sim-opt-' + lettr);
    if (inp) inp.value = (curQ?.options && curQ.options[lettr.toUpperCase()]) || '';
  });
  const curKey = (curQ?.correct || r3State.keys[slotIdx] || 'A').toLowerCase();
  const rad = document.getElementById('sim-rad-' + curKey);
  if (rad) rad.checked = true;

  simCurrentRubric = null;
  const aiStatus = document.getElementById('sim-ai-status');
  if (aiStatus) aiStatus.textContent = '';

  setSimPickerTab('bank');
  renderSimBankList();

  modal.style.display = 'flex';
}

function renderRama3ExamQuestionHTML(idx) {
  const q = r3State.bankQuestions[idx];
  const qNum = idx + 1;
  const isFilled = !!(q && q.prompt && q.prompt.trim() !== '');

  if (!isFilled) {
    return `
      <div class="r3-exam-q-item r3-exam-empty-slot" onclick="openRama3QuestionPicker(${idx})" title="Clic para seleccionar o redactar pregunta">
        <div style="display:flex; align-items:center; width:100%;">
          <span style="font-size:0.78rem; font-weight:800; color:#0284c7; display:flex; align-items:center; gap:5px;">
            ➕ Clic Pregunta ${qNum}
          </span>
        </div>
      </div>
    `;
  }

  const promptText = escaparHtml(q.prompt);
  const opts = q.options || { A: '—', B: '—', C: '—', D: '—' };
  const correctKey = (r3State.keys[idx] || q.correct || 'A').toUpperCase();

  return `
    <div class="r3-exam-q-item" onclick="openRama3QuestionPicker(${idx})" title="Clic para editar o cambiar pregunta">
      <div class="r3-exam-q-prompt">
        <span class="r3-exam-q-num">${qNum}.</span>
        <span class="r3-exam-prompt-text">${promptText}</span>
        <button type="button" onclick="event.stopPropagation(); openRama3QuestionPicker(${idx})"
          style="background:transparent; border:none; cursor:pointer; font-size:0.75rem; padding:0 2px; color:#64748b;" title="Editar">✏️</button>
      </div>
      <div class="r3-exam-opt-grid">
        <div class="r3-exam-opt-item">
          <span class="r3-exam-opt-bubble ${correctKey === 'A' ? 'is-correct' : ''}">A</span>
          <span>${escaparHtml(opts.A || '—')}</span>
        </div>
        <div class="r3-exam-opt-item">
          <span class="r3-exam-opt-bubble ${correctKey === 'B' ? 'is-correct' : ''}">B</span>
          <span>${escaparHtml(opts.B || '—')}</span>
        </div>
        <div class="r3-exam-opt-item">
          <span class="r3-exam-opt-bubble ${correctKey === 'C' ? 'is-correct' : ''}">C</span>
          <span>${escaparHtml(opts.C || '—')}</span>
        </div>
        <div class="r3-exam-opt-item">
          <span class="r3-exam-opt-bubble ${correctKey === 'D' ? 'is-correct' : ''}">D</span>
          <span>${escaparHtml(opts.D || '—')}</span>
        </div>
      </div>
    </div>
  `;
}

function renderRama3Exam() {
  const host = document.getElementById('r3-exam-render-host');
  if (!host) return;

  const layout = determineRama3ExamLayout(r3State.count);
  const totalPages = layout.totalPages;
  const activePage = Math.min(r3State.activePage || 1, totalPages);
  r3State.activePage = activePage;

  // Actualizar selector de páginas (#r3-page-switcher)
  const pageSwitcher = document.getElementById('r3-page-switcher');
  if (pageSwitcher) {
    if (totalPages > 1) {
      pageSwitcher.style.display = 'flex';
      const btnP1 = document.getElementById('btn-r3-page-1');
      const btnP2 = document.getElementById('btn-r3-page-2');
      if (btnP1 && btnP2) {
        if (activePage === 1) {
          btnP1.style.background = '#0284c7';
          btnP1.style.color = '#fff';
          btnP1.style.borderColor = '#0284c7';
          btnP2.style.background = '#1e293b';
          btnP2.style.color = '#94a3b8';
          btnP2.style.borderColor = '#334155';
        } else {
          btnP2.style.background = '#0284c7';
          btnP2.style.color = '#fff';
          btnP2.style.borderColor = '#0284c7';
          btnP1.style.background = '#1e293b';
          btnP1.style.color = '#94a3b8';
          btnP1.style.borderColor = '#334155';
        }
      }
    } else {
      pageSwitcher.style.display = 'none';
    }
  }

  // Identificar preguntas para la página activa
  let bodyHTML = '';
  if (layout.columns === 1) {
    // 4P: A5 Vertical 1 columna
    let qHTML = '';
    for (let i = 0; i < r3State.count; i++) {
      qHTML += renderRama3ExamQuestionHTML(i);
    }
    bodyHTML = `<div class="r3-exam-body-1col">${qHTML}</div>`;
  } else if (totalPages === 1) {
    // 5P, 6P o 10P: 2 columnas en 1 página
    let col1HTML = '';
    let col2HTML = '';
    const col1End = layout.col1Count;
    for (let i = 0; i < col1End; i++) {
      col1HTML += renderRama3ExamQuestionHTML(i);
    }
    for (let i = col1End; i < r3State.count; i++) {
      col2HTML += renderRama3ExamQuestionHTML(i);
    }
    bodyHTML = `
      <div class="r3-exam-body-2col">
        <div class="r3-exam-subcol">${col1HTML}</div>
        <div class="r3-exam-subcol">${col2HTML}</div>
      </div>
    `;
  } else {
    // 15P o 20P: 2 páginas
    let col1HTML = '';
    let col2HTML = '';
    if (activePage === 1) {
      const p1Col1End = layout.p1Col1;
      const p1Col2End = p1Col1End + layout.p1Col2;
      for (let i = 0; i < p1Col1End; i++) {
        col1HTML += renderRama3ExamQuestionHTML(i);
      }
      for (let i = p1Col1End; i < p1Col2End; i++) {
        col2HTML += renderRama3ExamQuestionHTML(i);
      }
    } else {
      const p1Total = layout.p1Col1 + layout.p1Col2;
      const p2Col1End = p1Total + layout.p2Col1;
      for (let i = p1Total; i < p2Col1End; i++) {
        col1HTML += renderRama3ExamQuestionHTML(i);
      }
      for (let i = p2Col1End; i < r3State.count; i++) {
        col2HTML += renderRama3ExamQuestionHTML(i);
      }
    }
    bodyHTML = `
      <div class="r3-exam-body-2col">
        <div class="r3-exam-subcol">${col1HTML}</div>
        <div class="r3-exam-subcol">${col2HTML}</div>
      </div>
    `;
  }

  const examHTML = `
    <div class="r3-exam-sheet ${layout.sheetClass}">
      <div class="r3-exam-header ${activePage > 1 ? 'r3-exam-header-p2' : ''}">
        <div class="r3-exam-header-title">EVALUACIÓN ESCOLAR ${totalPages > 1 ? ` — PÁGINA ${activePage}` : ''}</div>
        <div class="r3-exam-student-line">
          <span>Estudiante: __________________________________________________</span>
        </div>
      </div>
      ${bodyHTML}
    </div>
  `;

  host.innerHTML = examHTML;
  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(fitRama3ToViewport);
  } else {
    fitRama3ToViewport();
  }
}

function renderRama3CartillaPreview() {
  const host = document.getElementById('r3-cartilla-render-host');
  if (!host) return;
  host.innerHTML = '';

  const clsId = wizardClassroomId || (document.getElementById('builder-classroom')?.value);
  let classroom = null;
  if (clsId && typeof ClassroomData !== 'undefined' && ClassroomData.getClassroom) {
    classroom = ClassroomData.getClassroom(clsId);
  }
  if (!classroom) {
    classroom = {
      id: 'demo_class',
      name: 'Salón Demostración',
      gradeStage: 'primary',
      gradeLevel: 4,
      students: []
    };
  }

  const sampleStudent = (classroom.students && classroom.students.length > 0)
    ? classroom.students[0]
    : { id: 'est_01', name: 'ESTUDIANTE EJEMPLO' };

  const evalMock = {
    id: 'eval_mock_r3',
    branch: 'rama3',
    mode: r3State.mode,
    type: 'mc',
    withGrid: false,
    questionCount: r3State.count,
    questions: Array.from({ length: r3State.count }, (_, i) => ({
      num: i + 1,
      correct: r3State.keys[i] || 'A'
    }))
  };

  let cardHTML = '';
  if (r3State.count <= 10) {
    if (typeof createCartillaA6Card === 'function') {
      cardHTML = createCartillaA6Card(sampleStudent, classroom, evalMock);
    }
  } else {
    if (typeof createCartillaA5VerticalCard === 'function') {
      cardHTML = createCartillaA5VerticalCard(sampleStudent, classroom, evalMock);
    }
  }

  if (cardHTML) {
    host.innerHTML = cardHTML;
    // Generar código QR para la muestra
    if (typeof QRCode !== 'undefined' && QRCode.toString) {
      const qrPayload = (typeof getCardQRPayload === 'function') ? getCardQRPayload(sampleStudent.id, evalMock) : sampleStudent.id;
      QRCode.toString(qrPayload, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }, (err, svg) => {
        if (!err && svg) {
          const qrBox = host.querySelector('[data-qr-id="' + sampleStudent.id + '"]') || host.querySelector('#qr-box-' + sampleStudent.id);
          if (qrBox) qrBox.innerHTML = svg;
        }
      });
    }
  }

  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(fitRama3ToViewport);
  } else {
    fitRama3ToViewport();
  }
}

function prepareRama3Evaluation() {
  if (!wizardClassroomId) {
    const sel = document.getElementById('builder-classroom');
    if (sel && sel.value) wizardClassroomId = sel.value;
  }
  if (!wizardClassroomId) {
    if (typeof showToast === 'function') showToast('⚠️ Por favor selecciona un salón primero.');
    return null;
  }

  // Si estamos en Modo A (Solo Cartilla):
  // Validar que TODAS las preguntas desde 1 hasta r3State.count tengan su alternativa seleccionada.
  if (r3State.mode === 'keys') {
    for (let i = 0; i < r3State.count; i++) {
      if (!r3State.soloKeys[i]) {
        if (typeof showToast === 'function') {
          showToast(`⚠️ Falta seleccionar la alternativa de la Pregunta ${i + 1}.`);
        }
        r3ActiveKeyIdx = i;
        renderRama3KeysCartilla();
        const keypadEl = document.getElementById('r3-keypad-panel');
        if (keypadEl) keypadEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return null;
      }
    }
  }

  // Si estamos en Modo B (Evaluación y Cartillas / Banco):
  // Validar que TODAS las preguntas desde 1 hasta r3State.count estén configuradas y seleccionadas del banco.
  if (r3State.mode === 'bank') {
    for (let i = 0; i < r3State.count; i++) {
      const qObj = r3State.bankQuestions[i];
      const isConfigured = !!(
        qObj &&
        qObj.prompt &&
        qObj.prompt.trim() !== '' &&
        !/^Pregunta\s+\d+$/i.test(qObj.prompt.trim()) &&
        !qObj.prompt.startsWith('[Pregunta')
      );
      if (!isConfigured) {
        if (typeof showToast === 'function') {
          showToast(`⚠️ Falta configurar la Pregunta ${i + 1}. Selecciona o redacta la pregunta.`);
        }
        openRama3QuestionPicker(i);
        return null;
      }
    }
  }

  const isBankMode = (r3State.mode === 'bank');
  const questions = [];
  let hasRealQuestions = false;
  for (let i = 0; i < r3State.count; i++) {
    const qObj = r3State.bankQuestions[i];
    const isReal = !!(qObj && (qObj.options || (qObj.prompt && !/^Pregunta\s+\d+$/i.test(qObj.prompt.trim()))));
    if (isReal) hasRealQuestions = true;

    const assignedCorrect = isBankMode
      ? (r3State.keys[i] || qObj?.correct || 'A')
      : (r3State.soloKeys[i] || 'A');

    questions.push({
      id: qObj?.id || ('r3_q' + (i + 1)),
      num: i + 1,
      prompt: qObj?.prompt || `Pregunta ${i + 1}`,
      options: qObj?.options || { A: 'A', B: 'B', C: 'C', D: 'D' },
      correct: assignedCorrect
    });
  }

  const g = (typeof gradoDelSalon === 'function') ? gradoDelSalon(wizardClassroomId) : null;

  wizardEval = {
    id: 'eval_r3_' + Date.now(),
    branch: 'rama3',
    mode: r3State.mode,
    type: 'mc', // Regla 2: Cartilla OMR es type mc
    withGrid: false,
    questionCount: r3State.count,
    questions: questions,
    hasQuestionnaire: isBankMode || hasRealQuestions,
    title: isBankMode
      ? `Evaluación y Cartillas (${r3State.count} Preguntas)`
      : `Solo Cartilla (${r3State.count} Preguntas)`,
    prompt: isBankMode
      ? questions.map((q, idx) => `${idx + 1}. ${q.prompt}`).join(' | ')
      : `Cartilla de respuestas de ${r3State.count} preguntas`,
    expectedAnswer: isBankMode
      ? r3State.keys.slice(0, r3State.count).join(' ')
      : r3State.soloKeys.slice(0, r3State.count).join(' '),
    correctionMode: 'quick',
    gradeStage: g?.stage,
    gradeLevel: g?.level,
    gradeText: g?.texto
  };

  wizardEvalType = 'mc';
  if (typeof ClassroomData !== 'undefined' && ClassroomData.saveCustomEvaluation) {
    wizardEval = ClassroomData.saveCustomEvaluation(wizardEval);
  }
  return wizardEval;
}

function confirmRama3AndPrintExam() {
  const ev = prepareRama3Evaluation();
  if (!ev) return;

  if (typeof renderQuestionBooklet === 'function') {
    renderQuestionBooklet(wizardClassroomId, ev);
  }
  if (typeof printQuestionBooklet === 'function') {
    printQuestionBooklet(ev);
  } else {
    showSummary();
  }
}

function confirmRama3AndPrintCartillas() {
  const ev = prepareRama3Evaluation();
  if (!ev) return;
  const stepType = document.getElementById('step-eval-type');
  if (stepType) stepType.style.display = 'none';
  showSummary();
}

function confirmRama3AndScan() {
  const ev = prepareRama3Evaluation();
  if (!ev) return;
  const stepType = document.getElementById('step-eval-type');
  if (stepType) stepType.style.display = 'none';
  showSummary();
  const startBtn = document.getElementById('btn-start-evaluation');
  if (startBtn) {
    startBtn.click();
  }
}

function confirmRama3() {
  if (typeof window !== 'undefined' && window.EvaluationHologram) {
    window.EvaluationHologram.stop();
  }
  const ev = prepareRama3Evaluation();
  if (!ev) return;
  const stepType = document.getElementById('step-eval-type');
  if (stepType) stepType.style.display = 'none';
  showSummary();
}

function confirmRama3Bank() {
  if (typeof window !== 'undefined' && window.EvaluationHologram) {
    window.EvaluationHologram.stop();
  }
  const ev = prepareRama3Evaluation();
  if (!ev) return;
  const stepType = document.getElementById('step-eval-type');
  if (stepType) stepType.style.display = 'none';
  showSummary();
}

/**
 * Dispara directamente la visualización/impresión del Cuadernillo de Preguntas desde Rama 3 (Modo B).
 */
function rama3PrintBookletDirect() {
  const ev = prepareRama3Evaluation();
  if (!ev) return;

  if (typeof renderQuestionBooklet === 'function') {
    renderQuestionBooklet(wizardClassroomId, ev);
  }
  if (typeof printQuestionBooklet === 'function') {
    printQuestionBooklet(ev);
  }
}


// ── EXPOSICIÓN GLOBAL DE FUNCIONES DE CONSTRUCTORES RAMA 2 Y RAMA 3 ──
if (typeof window !== 'undefined') {
  // Rama 2 (Focalizada)
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

  // Rama 3 (Cartilla OMR + Examen)
  window.r3State = r3State;
  window.r3ActiveKeyIdx = (typeof r3ActiveKeyIdx !== 'undefined') ? r3ActiveKeyIdx : 0;
  window.resetRama3Builder = resetRama3Builder;
  window.initRama3Builder = initRama3Builder;
  window.setRama3Count = setRama3Count;
  window.setRama3Mode = setRama3Mode;
  window.setRama3Page = setRama3Page;
  window.updateRama3ControlsUI = updateRama3ControlsUI;
  window.onRama3SelectRow = onRama3SelectRow;
  window.onRama3BubbleClick = onRama3BubbleClick;
  window.onRama3KeypadClick = onRama3KeypadClick;
  window.setRama3Key = setRama3Key;
  window.renderRama3Matrix = renderRama3Matrix;
  window.renderRama3KeysCartilla = renderRama3KeysCartilla;
  window.determineRama3ExamLayout = determineRama3ExamLayout;
  window.openRama3QuestionPicker = openRama3QuestionPicker;
  window.renderRama3ExamQuestionHTML = renderRama3ExamQuestionHTML;
  window.renderRama3Exam = renderRama3Exam;
  window.renderRama3CartillaPreview = renderRama3CartillaPreview;
  window.prepareRama3Evaluation = prepareRama3Evaluation;
  window.confirmRama3AndPrintExam = confirmRama3AndPrintExam;
  window.confirmRama3AndPrintCartillas = confirmRama3AndPrintCartillas;
  window.confirmRama3AndScan = confirmRama3AndScan;
  window.confirmRama3 = confirmRama3;
  window.confirmRama3Bank = confirmRama3Bank;
  window.rama3PrintBookletDirect = rama3PrintBookletDirect;
  if (typeof fitRama3ToViewport === 'function') {
    window.fitRama3ToViewport = fitRama3ToViewport;
  }
}
