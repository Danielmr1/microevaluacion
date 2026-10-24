// =============================================================================
// question-bank.js — Microevaluación v3.10.26
// MÓDULO PRINCIPAL: BANCO DE PREGUNTAS Y SELECTOR DE EVALUACIONES
//
// Submódulos auxiliares vinculados:
//   - bank-tools-math.js     : Formateo KaTeX, fracciones y símbolos
//   - bank-manager-modal.js  : Modal del Gestor de Banco y límite de 50 preguntas
//   - bank-ai-rubric.js      : Generador y validador de rúbricas IA (Gemini)
//
// Guardarraíles activos:
//   Regla 1  – Cero regresión Respuesta Libre: flujo original intacto.
//   Regla 2  – Aislamiento Total de Alternativas: type === "mc" exclusivo.
//   Regla 3  – Integridad del banco: NUNCA oculta preguntas por questionCount: 1.
//   Regla 6  – Guardarraíl estricto: 4 alternativas con clave y rúbrica IA.
//   Regla 17 – Límite estricto de 50 preguntas y sincronización en tiempo real.
// =============================================================================

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
