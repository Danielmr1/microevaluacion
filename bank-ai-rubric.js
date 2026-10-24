// =============================================================================
// bank-ai-rubric.js — Microevaluación
// MÓDULO: GENERACIÓN Y VALIDACIÓN DE RÚBRICAS PEDAGÓGICAS CON IA (GEMINI)
// =============================================================================

/* ── ESTADO Y TRAZABILIDAD DE RÚBRICA ── */
let wizardRubric = null;      // rúbrica aceptada, lista para guardar
let wizardRubricMeta = null;  // de dónde salió, para trazabilidad
let wizardRubricPrompt = null; // enunciado original

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

  let conf = 100;
  if (r.confianza != null && r.confianza !== '') {
    const n = Number(r.confianza);
    if (isFinite(n) && n > 0) {
      if (n <= 1) conf = Math.round(n * 100);
      else if (n <= 5) conf = Math.round((n / 5) * 100);
      else if (n <= 10) conf = Math.round((n / 10) * 100);
      else conf = Math.min(100, Math.round(n));
    }
  }
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

  // GUARDARRAÍL NIVEL 2: Límite diario de 6 rúbricas con IA
  if (typeof DailyQuota !== 'undefined' && !DailyQuota.canConsume('rubrics')) {
    if (statusEl) {
      statusEl.textContent = '⚠️ Límite diario de 6 rúbricas alcanzado';
      statusEl.style.color = '#f59e0b';
    }
    showToast('⚠️ Has alcanzado el límite de 6 rúbricas diarias con IA.');
    alert('⚠️ Límite Diario de Rúbricas Alcanzado:\n\nHas generado tus 6 rúbricas completas de IA el día de hoy.\n\nPuedes seguir utilizando todas las preguntas con rúbrica ya guardadas en tu Banco de Preguntas, o generar nuevas rúbricas mañana a partir de las 00:00.');
    return;
  }

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


// Exposición global
if (typeof window !== "undefined") {
  window.showAIDialog = showAIDialog;
  window.closeAIDialogModal = closeAIDialogModal;
  window.startAILoadingState = startAILoadingState;
  window.verifyOptionConsistency = verifyOptionConsistency;
  window.aplicarRespuestaCanonica = aplicarRespuestaCanonica;
  window.renderRubricPanel = renderRubricPanel;
  window.descartarRubrica = descartarRubrica;
  window.resetRubrica = resetRubrica;
  window.handleGenerateRubric = handleGenerateRubric;
  window.generarRubricaDeLaSesion = generarRubricaDeLaSesion;
  window.confirmUnifiedEvaluation = confirmUnifiedEvaluation;
  window.saveAndProceedUnified = saveAndProceedUnified;
  window.promptMCCorrectionMode = promptMCCorrectionMode;
  window.selectMCCorrectionModeAndProceed = selectMCCorrectionModeAndProceed;
}
