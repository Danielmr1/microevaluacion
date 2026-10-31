// =============================================================================
// results-manager.js — Microevaluación A5 v3.1.38
// MÓDULO: RESULTADOS DE LA SESIÓN ACTIVA (CONSULTA, EXCEL Y BORRADO)
//
// Guardarraíles activos:
//   Regla 1  – Cero regresión Respuesta Libre: este módulo es de solo lectura
//              sobre resultados; no toca el flujo de corrección IA.
//   Regla 8  – Borrado sincronizado en 3 niveles: Supabase + Scanner + UI.
//   Regla 9  – Falla silenciosa: try/catch/finally en todas las operaciones de red.
//   Regla 10 – Sanitización UTF-8 en exportación Excel (SheetJS).
//
// Dependencias globales: ClassroomData, SupabaseClient, Scanner, XLSX, JSZip,
//                        showToast, sanitizeExportFileName, getExportTimestamp
// =============================================================================

// ── Estado interno del módulo ──────────────────────────────────────────────
let currentResultsCache = { session: null, results: [], classroom: null };
let currentPhotoViewerData = null;

// ── Apertura / cierre del panel de resultados ──────────────────────────────

function openResultsModal() {
  if (typeof showView === 'function') showView('eval');
  if (typeof toggleSummaryViewMode === 'function') {
    toggleSummaryViewMode('results');
    return;
  }
  const modal = document.getElementById('results-modal');
  if (modal) {
    modal.style.display = 'flex';
    loadAndRenderResultsTable();
  }
}
window.openResultsModal = openResultsModal;

function closeResultsModal() {
  if (typeof toggleSummaryViewMode === 'function') {
    toggleSummaryViewMode('pdf');
  }
  const modal = document.getElementById('results-modal');
  if (modal) modal.style.display = 'none';
}
window.closeResultsModal = closeResultsModal;

function goToSessionResults() {
  if (typeof closeModal === 'function') closeModal();
  if (typeof stopCamera === 'function') {
    try { stopCamera(); } catch (e) {}
  }
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    const exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
    if (exit) {
      try { exit.call(document).catch(() => {}); } catch (e) {}
    }
  }
  if (screen.orientation && screen.orientation.unlock) {
    try { screen.orientation.unlock(); } catch (e) {}
  }
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';

  // Salir formalmente del modo Sesiones Guardadas para volver a la modalidad normal
  window.isViewingSavedSessionsMode = false;
  const stripEl = document.getElementById('summary-sessions-strip');
  if (stripEl) stripEl.style.display = 'none';

  if (typeof switchTab === 'function') {
    switchTab('create');
  } else if (typeof showView === 'function') {
    showView('eval');
  }

  // Asegurar que step-summary y el layout de dos columnas/apilado estén activos
  const summaryEl = document.getElementById('step-summary');
  const teacherPanelEl = summaryEl ? summaryEl.closest('.teacher-panel') : null;
  const viewCreateEl = document.getElementById('view-create');
  if (teacherPanelEl) teacherPanelEl.classList.add('has-active-split');
  if (viewCreateEl) viewCreateEl.classList.add('has-active-split');
  document.body.classList.add('has-active-split');
  if (summaryEl) {
    summaryEl.classList.add('active-split');
    summaryEl.style.display = '';
  }

  // Actualizar topbar al nombre de la modalidad de la sesión activa (no 'Sesiones')
  if (typeof updateTopbarModeTitle === 'function') {
    const activeSess = (typeof ClassroomData !== 'undefined') ? ClassroomData.getActiveSession() : null;
    updateTopbarModeTitle(activeSess?.branch || window.selectedBranch || 'rama1');
  }

  if (typeof toggleSummaryViewMode === 'function') {
    toggleSummaryViewMode('results');
  }
}
window.goToSessionResults = goToSessionResults;

function goToScannerFromResults() {
  closeResultsModal();
  if (typeof switchTab === 'function') {
    switchTab('scan');
  } else if (typeof goToScannerWithSession === 'function') {
    goToScannerWithSession();
  }
}
window.goToScannerFromResults = goToScannerFromResults;

// ── Carga y renderizado de la tabla de resultados ──────────────────────────

async function loadAndRenderResultsTable() {
  const container = document.getElementById('results-table-container');
  const subtitle = document.getElementById('results-modal-subtitle');
  const kpiTotal = document.getElementById('res-kpi-total');
  const kpiCorrect = document.getElementById('res-kpi-correct');
  const kpiIncorrect = document.getElementById('res-kpi-incorrect');
  if (!container) return;

  container.innerHTML = `
    <div style="padding:40px; text-align:center; color:#A8A29E; font-size:0.85rem;">
      <div style="margin-bottom:10px; display:inline-flex; align-items:center; justify-content:center; color:#00B4D8;">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1.5s linear infinite;"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
      </div>
      <div>Cargando resultados de la sesión...</div>
    </div>
  `;

  const session = ClassroomData.getActiveSession();
  if (!session || !session.classroomId) {
    if (subtitle) subtitle.textContent = 'No hay ninguna sesión activa en curso.';
    if (kpiTotal) kpiTotal.textContent = '0 / 0';
    if (kpiCorrect) kpiCorrect.textContent = '0 (0%)';
    if (kpiIncorrect) kpiIncorrect.textContent = '0 (0%)';
    container.innerHTML = `
      <div style="padding:40px; text-align:center; color:#A8A29E; font-size:0.85rem; border:1.5px dashed #3D352E; border-radius:12px; background:#211D19;">
        <div style="margin-bottom:10px; display:inline-flex; color:#FFB703;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </div>
        <strong style="display:block; color:#F9F8F3; font-size:0.95rem; margin-bottom:4px;">Sin sesión activa</strong>
        Configura un salón y una evaluación para registrar o consultar resultados.
      </div>
    `;
    return;
  }

  const cls = ClassroomData.getClassroom(session.classroomId);
  const clsName = cls ? cls.name : session.classroomId;

  const isBranch3 = session.branch === 'rama3' || (session.type === 'mc' && (session.questionCount > 3 || (session.questions && session.questions.length > 3)));
  const isBranch2 = session.branch === 'rama2';
  let evalTypeLabel = 'Respuesta Libre (con rúbrica IA)';
  if (isBranch3) {
    const qCount = session.questionCount || (session.questions ? session.questions.length : 20);
    evalTypeLabel = `Cartilla OMR (${qCount} preguntas)`;
  } else if (isBranch2) {
    const qCount = session.questionCount || (session.questions ? session.questions.length : 1);
    evalTypeLabel = `Focalizada Contenido (${qCount} preg. ${session.withGrid ? 'con borrador' : 'sin borrador'})`;
  } else if (session.type === 'mc') {
    evalTypeLabel = 'Opción Múltiple (OMR + IA)';
  }

  if (subtitle) {
    subtitle.innerHTML = `
      <div style="display:flex; flex-direction:row; gap:16px; margin-top:4px; font-size:0.78rem; flex-wrap:wrap;">
        <div><span style="color:#A8A29E;">Salón:</span> <strong style="color:#00B4D8;">${clsName}</strong></div>
        <div><span style="color:#A8A29E;">Evaluación:</span> <strong style="color:#F9F8F3;">${session.title || 'Evaluación del Día'}</strong></div>
      </div>
    `;
  }

  // Cargar resultados de Supabase (Regla 9 – falla silenciosa)
  let results = [];
  try {
    if (typeof SupabaseClient !== 'undefined' && SupabaseClient.loadSessionResults) {
      results = await SupabaseClient.loadSessionResults(session.sessionRef);
    }
  } catch (err) {
    console.warn('[Results] Error cargando de Supabase:', err);
  }

  // Mapear por código de estudiante
  const resultMap = new Map();
  (results || []).forEach(r => {
    if (r && r.student_code) resultMap.set(r.student_code, r);
  });

  // Guardar en caché para exportación
  currentResultsCache = { session, results, classroom: cls, resultMap };

  // Sincronizar el escáner si está en memoria (Regla 8 – anti-desincronización)
  if (typeof Scanner !== 'undefined' && Scanner.setEvaluatedStudents) {
    Scanner.setEvaluatedStudents(Array.from(resultMap.keys()));
  }

  const students = cls ? (cls.students || []) : [];
  const totalStudents = students.length;
  const evaluatedCount = resultMap.size;

  let correctCount = 0;
  let incorrectCount = 0;
  let approvedCount = 0;
  let sumGrade20 = 0;

  resultMap.forEach(r => {
    const isOk = (r.teacher_verdict === 'CORRECTA') || (r.ai_expected_match === true) || (r.deterministic_match === true);
    if (isOk) correctCount++;
    else incorrectCount++;

    if (isBranch3) {
      const g20 = (r.ai_raw && r.ai_raw.grade20 != null)
        ? r.ai_raw.grade20
        : (r.ai_raw && r.ai_raw.correctCount != null && r.ai_raw.totalQuestions)
          ? Math.round((r.ai_raw.correctCount / r.ai_raw.totalQuestions) * 20)
          : (isOk ? 20 : 0);
      sumGrade20 += g20;
      if (g20 >= 11) approvedCount++;
    }
  });

  const pctCorrect = evaluatedCount > 0 ? Math.round((correctCount / evaluatedCount) * 100) : 0;
  const pctIncorrect = evaluatedCount > 0 ? Math.round((incorrectCount / evaluatedCount) * 100) : 0;

  if (kpiTotal) kpiTotal.textContent = `${evaluatedCount} / ${totalStudents}`;

  if (isBranch3) {
    const avgGrade = evaluatedCount > 0 ? (sumGrade20 / evaluatedCount).toFixed(1) : '0';
    const pctApproved = evaluatedCount > 0 ? Math.round((approvedCount / evaluatedCount) * 100) : 0;
    if (kpiCorrect) {
      const lbl = kpiCorrect.previousElementSibling;
      if (lbl) lbl.textContent = 'Promedio Salón';
      kpiCorrect.textContent = `${avgGrade} / 20`;
      kpiCorrect.style.color = Number(avgGrade) >= 11 ? '#4ade80' : '#f87171';
    }
    if (kpiIncorrect) {
      const lbl = kpiIncorrect.previousElementSibling;
      if (lbl) lbl.textContent = 'Aprobados (≥11)';
      kpiIncorrect.textContent = `${approvedCount} (${pctApproved}%)`;
    }
  } else {
    if (kpiCorrect) {
      const lbl = kpiCorrect.previousElementSibling;
      if (lbl) lbl.textContent = 'Aciertos';
      kpiCorrect.textContent = `${correctCount} (${pctCorrect}%)`;
      kpiCorrect.style.color = '#22c55e';
    }
    if (kpiIncorrect) {
      const lbl = kpiIncorrect.previousElementSibling;
      if (lbl) lbl.textContent = 'Errores';
      kpiIncorrect.textContent = `${incorrectCount} (${pctIncorrect}%)`;
    }
  }

  if (students.length === 0) {
    container.innerHTML = `
      <div style="padding:30px; text-align:center; color:#94a3b8; font-size:0.85rem;">
        No hay alumnos registrados en este salón.
      </div>
    `;
    return;
  }

  // Renderizar tabla
  let rowsHtml = '';
  students.forEach((st, idx) => {
    const res = resultMap.get(st.id);
    const isEvaluated = !!res;
    const isOk = res && ((res.teacher_verdict === 'CORRECTA') || (res.teacher_verdict === 'CORRECTO') || (res.ai_expected_match === true) || (res.deterministic_match === true));
    const isPendingAI = res && res.ai_raw && res.ai_raw.pendingAI;
    const aiGrading = res && res.ai_raw && (res.ai_raw.aiGrading?.data || res.ai_raw.aiGrading);
    const capturedTime = res && res.captured_at ? new Date(res.captured_at).getTime() : 0;
    const isStale = isPendingAI && capturedTime && (Date.now() - capturedTime > 40000);

    let statusBadge = `<span style="background:rgba(168,162,158,0.1); color:#A8A29E; border:1px solid rgba(168,162,158,0.25); padding:2px 8px; border-radius:6px; font-size:0.72rem; font-weight:700; white-space:nowrap; display:inline-flex; align-items:center; gap:4px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Pendiente</span>`;
    if (isEvaluated) {
      if (isPendingAI) {
        if (res.ai_raw && res.ai_raw.aiError) {
          const isOffline = res.ai_raw.aiError === 'offline' || (typeof navigator !== 'undefined' && !navigator.onLine);
          const isTimeout = res.ai_raw.aiError === 'timeout' || res.ai_raw.aiError === 'timeout_or_offline';
          let label = 'Error IA';
          let badgeColor = '#F87171';
          let borderCol = 'rgba(239,68,68,0.35)';
          let bgCol = 'rgba(239,68,68,0.15)';
          if (isOffline) {
            label = 'Sin conexión';
          } else if (isTimeout) {
            label = 'Tiempo excedido';
            badgeColor = '#FFB703';
            borderCol = 'rgba(255,183,3,0.35)';
            bgCol = 'rgba(255,183,3,0.15)';
          }
          statusBadge = `<span style="background:${bgCol}; color:${badgeColor}; border:1px solid ${borderCol}; padding:2px 8px; border-radius:6px; font-size:0.72rem; font-weight:800; white-space:nowrap; display:inline-flex; align-items:center; gap:4px;" title="${res.ai_raw.errorDetail || ''}"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> ${label}</span>`;
        } else if (isStale) {
          statusBadge = `<span style="background:rgba(255,183,3,0.15); color:#FFB703; border:1px solid rgba(255,183,3,0.35); padding:2px 8px; border-radius:6px; font-size:0.72rem; font-weight:800; white-space:nowrap; display:inline-flex; align-items:center; gap:4px;" title="Tiempo de espera agotado. Puedes reintentar con el botón."><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Expirado</span>`;
        } else {
          statusBadge = `<span style="background:rgba(255,183,3,0.15); color:#FFB703; border:1px solid rgba(255,183,3,0.35); padding:2px 8px; border-radius:6px; font-size:0.72rem; font-weight:800; white-space:nowrap; display:inline-flex; align-items:center; gap:4px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Analizando IA</span>`;
        }
      } else {
        statusBadge = `<span style="background:rgba(52,211,153,0.12); color:#34D399; border:1px solid rgba(52,211,153,0.35); padding:2px 8px; border-radius:6px; font-size:0.72rem; font-weight:800; white-space:nowrap; display:inline-flex; align-items:center; gap:4px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Evaluado</span>`;
      }
    }

    const escape = (typeof escaparHtml === 'function')
      ? escaparHtml
      : (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    let answerContent = '—';
    if (isEvaluated) {
      if (isBranch3) {
        const grade20 = (res.ai_raw && res.ai_raw.grade20 != null)
          ? res.ai_raw.grade20
          : (res.ai_raw && res.ai_raw.correctCount != null && res.ai_raw.totalQuestions)
            ? Math.round((res.ai_raw.correctCount / res.ai_raw.totalQuestions) * 20)
            : (isOk ? 20 : 0);
        const correctQ = (res.ai_raw && res.ai_raw.correctCount != null)
          ? res.ai_raw.correctCount
          : (isOk ? (res.ai_raw?.totalQuestions || 20) : 0);
        const totalQ = res.ai_raw?.totalQuestions || session.questionCount || 20;
        const gradeColor = grade20 >= 11 ? '#34D399' : '#F87171';

        answerContent = `
          <div style="font-size:0.95rem; font-weight:800; color:${gradeColor};">Nota: ${grade20} / 20</div>
          <div style="font-size:0.7rem; color:#A8A29E; font-weight:700; margin-top:2px;">${correctQ} / ${totalQ} aciertos</div>
          <div style="font-size:0.67rem; color:#00B4D8; margin-top:2px; cursor:help;" title="${escape(res.ai_answer_read || '')}">Ver claves marcadas</div>
        `;
      } else {
        answerContent = `<div style="font-size:0.9rem; font-weight:800; color:#38BDF8;">${escape(res.ai_answer_read || 'Registrado')}</div>`;
        if (aiGrading) {
          if (session.type === 'mc') {
            const procOk = aiGrading.procedure_valid;
            answerContent += `<div style="font-size:0.7rem; color:${procOk ? '#C7D2FE' : '#FFB703'}; font-weight:700; margin-top:2px;">${procOk ? 'Procedimiento OK' : 'Sin procedimiento'}</div>`;
          } else {
            answerContent += `<div style="font-size:0.7rem; color:#00B4D8; font-weight:700; margin-top:2px;">Nota: ${aiGrading.score}/4 pts</div>`;
          }
        }
      }
    }

    let expectedText = '—';
    if (isBranch3) {
      const totalQ = session.questionCount || (session.questions ? session.questions.length : 20);
      expectedText = `
        <div style="font-size:0.8rem; font-weight:700; color:#E5E3DC;">${totalQ} Claves</div>
        <div style="font-size:0.67rem; color:#78716C; margin-top:1px; cursor:help;" title="${escape(session.expectedAnswer || '')}">Ver pauta</div>
      `;
    } else {
      expectedText = escape(session.expectedAnswer || (res ? res.expected_answer : '—') || '—');
    }

    let verdictBadge = `<span style="color:#78716C; font-size:0.8rem;">—</span>`;
    if (isEvaluated) {
      if (isPendingAI) {
        if (res.ai_raw && res.ai_raw.aiError) {
          verdictBadge = `
            <button type="button" onclick="handleRetrySingleAI('${st.id}', this)"
              title="${res.ai_raw.errorDetail || 'Reintentar análisis con IA'}"
              style="background:#211D19; border:1px solid #FFB703; color:#FFB703; border-radius:6px; padding:3px 8px; font-size:0.72rem; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px;">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Reintentar IA
            </button>
          `;
        } else if (isStale) {
          verdictBadge = `
            <button type="button" onclick="handleRetrySingleAI('${st.id}', this)"
              title="Tiempo de espera agotado. Reintentar análisis."
              style="background:#211D19; border:1px solid #FFB703; color:#FFB703; border-radius:6px; padding:3px 8px; font-size:0.72rem; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px;">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Reintentar IA
            </button>
          `;
        } else {
          verdictBadge = `<span style="color:#FFB703; font-size:0.78rem; font-weight:700; display:inline-flex; align-items:center; gap:4px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> En proceso</span>`;
        }
      } else if (isBranch3) {
        const grade20 = (res.ai_raw && res.ai_raw.grade20 != null)
          ? res.ai_raw.grade20
          : (res.ai_raw && res.ai_raw.correctCount != null && res.ai_raw.totalQuestions)
            ? Math.round((res.ai_raw.correctCount / res.ai_raw.totalQuestions) * 20)
            : (isOk ? 20 : 0);
        if (grade20 >= 11) {
          verdictBadge = `<span style="color:#34D399; font-weight:800; font-size:0.82rem; display:inline-flex; align-items:center; gap:4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> APROBADO</span>`;
        } else {
          verdictBadge = `<span style="color:#F87171; font-weight:800; font-size:0.82rem; display:inline-flex; align-items:center; gap:4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> DESAPROBADO</span>`;
        }
      } else if (isOk) {
        verdictBadge = `<span style="color:#34D399; font-weight:800; font-size:0.82rem; display:inline-flex; align-items:center; gap:4px;" title="${res.ai_teacher_feedback ? res.ai_teacher_feedback.replace(/"/g, '&quot;') : ''}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> CORRECTA</span>`;
      } else {
        verdictBadge = `<span style="color:#F87171; font-weight:800; font-size:0.82rem; display:inline-flex; align-items:center; gap:4px;" title="${res.ai_teacher_feedback ? res.ai_teacher_feedback.replace(/"/g, '&quot;') : ''}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> INCORRECTA</span>`;
      }
    }

    const deleteBtn = isEvaluated
      ? `<button type="button" onclick="handleDeleteSingleResult('${st.id}', this)" title="Borrar este resultado para reevaluar"
             style="background:#211D19; border:1px solid rgba(239,68,68,0.35); color:#F87171; border-radius:6px; padding:4px 8px; font-size:0.72rem; cursor:pointer; display:inline-flex; align-items:center; justify-content:center;">
             <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
           </button>`
      : '';

    const photoUrl = res && (res.grid_image_path || res.ai_raw?.gridImage);
    let photoBadge = '<span style="color:#57534E; font-size:0.75rem;">—</span>';
    if (photoUrl) {
      const safeName = escape(st.name || '').replace(/'/g, '&#39;');
      photoBadge = `
        <button type="button" onclick="openPhotoViewer('${st.id}', '${safeName}', '${photoUrl}')"
          title="Ver foto de la resolución del estudiante"
          style="display:inline-flex; align-items:center; gap:4px; background:#211D19; border:1px solid rgba(0,180,216,0.45); color:#38BDF8; border-radius:6px; padding:3px 8px; font-size:0.72rem; font-weight:700; cursor:pointer;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> Ver
        </button>
      `;
    }

    rowsHtml += `
      <tr style="border-bottom:1px solid #2D2620; background:${isEvaluated ? 'rgba(33,29,25,0.75)' : 'transparent'}; transition:background 0.15s ease;">
        <td style="padding:10px 12px; font-size:0.75rem; color:#78716C; font-weight:700;">${idx + 1}</td>
        <td style="padding:10px 12px; font-size:0.85rem; font-weight:700; color:#F9F8F3;">${escape(st.name)}</td>
        <td style="padding:10px 12px; text-align:center;">${photoBadge}</td>
        <td style="padding:10px 12px;">${statusBadge}</td>
        <td style="padding:10px 12px;">${answerContent}</td>
        <td style="padding:10px 12px; font-size:0.85rem; font-weight:700; color:#A8A29E;">${expectedText}</td>
        <td style="padding:10px 12px;">${verdictBadge}</td>
        <td style="padding:10px 12px; text-align:center;">${deleteBtn}</td>
      </tr>
    `;
  });

  container.innerHTML = `
    <table style="width:100%; border-collapse:collapse; text-align:left;">
      <thead>
        <tr style="border-bottom:2px solid #3D352E; background:#1A1613; color:#A8A29E; font-size:0.7rem; text-transform:uppercase; letter-spacing:0.04em;">
          <th style="padding:8px 12px; font-weight:800;">#</th>
          <th style="padding:8px 12px; font-weight:800;">Estudiante</th>
          <th style="padding:8px 12px; font-weight:800; text-align:center;">Foto</th>
          <th style="padding:8px 12px; font-weight:800;">Estado</th>
          <th style="padding:8px 12px; font-weight:800;">${isBranch3 ? 'Calificación / Aciertos' : 'Marcó'}</th>
          <th style="padding:8px 12px; font-weight:800;">${isBranch3 ? 'Pauta Claves' : 'Clave'}</th>
          <th style="padding:8px 12px; font-weight:800;">Veredicto</th>
          <th style="padding:8px 12px; font-weight:800; text-align:center;">Acción</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  `;
}

// ── Visor de fotos (lightbox) ──────────────────────────────────────────────

function openPhotoViewer(studentCode, studentName, photoUrl) {
  const modal = document.getElementById('photo-viewer-modal');
  const img = document.getElementById('photo-viewer-img');
  const title = document.getElementById('photo-viewer-title');
  const subtitle = document.getElementById('photo-viewer-subtitle');
  const dlBtn = document.getElementById('photo-viewer-download-btn');
  if (!modal || !img) return;

  currentPhotoViewerData = { studentCode, studentName, photoUrl };
  img.src = photoUrl;
  title.textContent = studentName || 'Estudiante';
  subtitle.textContent = `Código: ${studentCode || '—'}`;

  if (dlBtn) {
    dlBtn.onclick = () => downloadSinglePhoto(studentCode, studentName, photoUrl);
  }
  modal.style.display = 'flex';
}

function closePhotoViewerModal() {
  const modal = document.getElementById('photo-viewer-modal');
  if (modal) modal.style.display = 'none';
  currentPhotoViewerData = null;
}

function downloadSinglePhoto(studentCode, studentName, dataUrl) {
  if (!dataUrl) return;
  const cleanName = (studentName || 'Alumno').replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]/g, '_');
  const filename = `${studentCode || 'ALUM'}_${cleanName}.jpg`;
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast(`📥 Foto descargada: ${filename}`);
}

// ── Descarga masiva de fotos en ZIP ───────────────────────────────────────
// Regla 9 – Falla silenciosa; Regla 10 – UTF-8 en nombres de archivo

async function downloadAllSessionPhotosZip() {
  const btn = document.getElementById('btn-export-photos');
  const session = ClassroomData.getActiveSession();
  if (!session || !session.sessionRef) {
    showToast('⚠️ No hay sesión activa.');
    return;
  }
  if (typeof JSZip === 'undefined') {
    showToast('⚠️ Librería de compresión no disponible. Recarga la página.');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '⏳ Comprimiendo ZIP...';
  }
  showToast('📦 Preparando fotos de la sesión...');
  try {
    let rows = [];
    if (typeof SupabaseClient !== 'undefined' && SupabaseClient.loadSessionResults) {
      rows = await SupabaseClient.loadSessionResults(session.sessionRef);
    }

    const photos = rows.filter(r => r.grid_image_path || r.ai_raw?.gridImage);
    if (photos.length === 0) {
      showToast('⚠️ No hay fotos registradas para descargar en esta sesión.');
      return;
    }

    const zip = new JSZip();
    const clsSession = (session && session.classroomId) ? ClassroomData.getClassroom(session.classroomId) : null;
    const classroomName = clsSession ? clsSession.name : 'Salon';
    const cleanClassroom = sanitizeExportFileName(classroomName);
    const timeStamp = getExportTimestamp();
    const zipFileName = `Fotos_${cleanClassroom}_${timeStamp}.zip`;
    const folder = zip.folder(`Fotos_${cleanClassroom}`);

    photos.forEach(r => {
      const rawData = r.grid_image_path || r.ai_raw?.gridImage;
      if (!rawData) return;
      const base64Data = rawData.replace(/^data:image\/\w+;base64,/, '');
      const cleanStudent = (r.student_name || 'Alumno').replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]/g, '_');
      const filename = `${r.student_code || 'ALUM'}_${cleanStudent}.jpg`;
      folder.file(filename, base64Data, { base64: true });
    });

    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = zipFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    showToast(`✅ Se descargaron ${photos.length} fotos en el archivo ZIP.`);
  } catch (zipErr) {
    console.error('[ZIP Error]', zipErr);
    showToast('⚠️ Error al generar el archivo ZIP: ' + (zipErr.message || 'error desconocido'));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '📦 Descargar Fotos (.zip)';
    }
  }
}

// ── Borrado individual de resultado ───────────────────────────────────────
// Regla 8 – Sincroniza Supabase + Scanner + UI en tiempo real

async function handleDeleteSingleResult(studentId, triggerBtn = null) {
  const session = ClassroomData.getActiveSession();
  if (!session || !session.sessionRef || !studentId) return;

  if (!confirm(`¿Deseas eliminar el resultado del estudiante ${studentId} para poder volver a escanearlo?`)) {
    return;
  }

  try {
    if (triggerBtn) {
      triggerBtn.disabled = true;
      triggerBtn.innerHTML = '⏳';
    }
    showToast('⏳ Eliminando resultado...');
    if (typeof SupabaseClient !== 'undefined' && SupabaseClient.deleteResult) {
      await SupabaseClient.deleteResult(session.sessionRef, studentId);
    }
    if (typeof Scanner !== 'undefined' && Scanner.removeEvaluatedStudent) {
      Scanner.removeEvaluatedStudent(studentId);
    }
    showToast('🗑️ Resultado eliminado. Alumno listo para volver a escanear.');
    loadAndRenderResultsTable();
    if (typeof refreshEvaluatedFromResults === 'function' && session.sessionRef) {
      refreshEvaluatedFromResults(session.sessionRef);
    }
  } catch (err) {
    console.error('[Delete Result Error]', err);
    showToast('⚠️ No se pudo eliminar el resultado: ' + (err.message || 'error de red'));
  } finally {
    if (triggerBtn) {
      triggerBtn.disabled = false;
      triggerBtn.innerHTML = '🗑️';
    }
  }
}

// ── Reintento individual de análisis IA ────────────────────────────────────
// Permite al docente reevaluar con Gemini directamente desde la tabla de resultados
// usando la imagen ya capturada y almacenada, sin tener que volver a escanear.

async function handleRetrySingleAI(studentId, triggerBtn = null) {
  const { session, classroom, resultMap } = currentResultsCache;
  if (!session || !session.sessionRef || !studentId) {
    showToast('⚠️ No hay sesión activa.');
    return;
  }
  const res = resultMap ? resultMap.get(studentId) : null;
  if (!res) {
    showToast('⚠️ No se encontró el registro del estudiante.');
    return;
  }

  const imgGrid = res.grid_image_path || res.ai_raw?.gridImage;
  const imgAnswer = res.answer_image_path;

  if (!imgGrid && !imgAnswer) {
    showToast('⚠️ No hay fotos guardadas de este estudiante para reanalizar.');
    return;
  }

  const isMC = session.type === 'mc' || (res.evaluation_ref && res.evaluation_ref.startsWith('mc_')) || (res.prompt && res.expected_answer && res.expected_answer.startsWith('Clave:'));

  const payload = {
    type: isMC ? 'mc' : 'free',
    prompt: res.prompt || session.prompt || '',
    expectedAnswer: res.expected_answer || session.expectedAnswer || '',
    rubric: session.rubric || res.ai_raw?.rubric || null,
    answerImage: imgAnswer || null,
    gridImage: imgGrid || null,
    strokeAnalysis: res.ai_raw?.strokeAnalysis || null,
    omrSelected: res.ai_answer_read || null,
    omrMatch: (res.teacher_verdict === 'CORRECTA' || res.ai_expected_match === true)
  };

  try {
    if (triggerBtn) {
      triggerBtn.disabled = true;
      triggerBtn.innerHTML = '⏳ Analizando...';
    }
    showToast('🤖 Enviando ficha a Gemini para análisis...');

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout de 60s excedido en reintento IA')), 60000)
    );

    const aiRes = await Promise.race([
      SupabaseClient.gradeSheet(payload),
      timeoutPromise
    ]);

    if (!aiRes || !aiRes.ok || !aiRes.data) {
      throw new Error(aiRes?.error || 'No se obtuvo respuesta de la IA');
    }

    const evalData = (aiRes.data && aiRes.data.data) ? aiRes.data.data : aiRes.data;

    const isMatchAI = isMC
      ? (res.teacher_verdict === 'CORRECTA' || res.ai_expected_match === true)
      : (evalData.score >= 3.5 || evalData.verdict === 'CORRECTO');

    const updatedVerdict = isMC
      ? (res.teacher_verdict || (isMatchAI ? 'CORRECTA' : 'INCORRECTA'))
      : (evalData.verdict || (isMatchAI ? 'CORRECTA' : 'INCORRECTA'));

    const updatedRaw = Object.assign({}, res.ai_raw || {}, {
      aiGrading: evalData,
      gridImage: imgGrid,
      pendingAI: false,
      aiError: null,
      errorDetail: null,
      gradedAt: new Date().toISOString()
    });

    await SupabaseClient.saveResult({
      session_ref: session.sessionRef,
      classroom_id: res.classroom_id || (classroom ? classroom.id : null),
      student_code: studentId,
      student_name: res.student_name,
      grade_stage: res.grade_stage,
      grade_level: res.grade_level,
      evaluation_ref: res.evaluation_ref,
      evaluation_title: res.evaluation_title,
      prompt: res.prompt,
      expected_answer: res.expected_answer,
      grid_image_path: imgGrid,
      answer_image_path: imgAnswer,
      ai_answer_read: res.ai_answer_read,
      ai_expected_match: isMatchAI,
      deterministic_match: res.deterministic_match ?? isMatchAI,
      ai_procedure: evalData.procedure_valid ? 'correcto' : 'incorrecto',
      ai_error_type: evalData.error_detectado || 'ninguno',
      ai_teacher_feedback: evalData.feedback || null,
      teacher_verdict: updatedVerdict,
      ai_raw: updatedRaw,
      captured_at: res.captured_at || new Date().toISOString()
    });

    showToast('✅ ¡Análisis de IA completado con éxito!');
    loadAndRenderResultsTable();
  } catch (err) {
    console.error('[Retry AI Error]', err);
    showToast('⚠️ No se pudo completar el análisis IA: ' + (err.message || 'Error de conexión'));
    if (triggerBtn) {
      triggerBtn.disabled = false;
      triggerBtn.innerHTML = '🔄 Reintentar IA';
    }
  }
}

// ── Borrado total de resultados de la sesión ──────────────────────────────
// Regla 8 – Sincroniza Supabase + Scanner + UI en tiempo real

async function handleDeleteAllSessionResults(triggerBtn = null) {
  const session = ClassroomData.getActiveSession();
  if (!session || !session.sessionRef) return;

  if (!confirm('⚠️ ¿Estás seguro de que deseas BORRAR TODOS los resultados de esta sesión?\n\nEsta acción reiniciará el conteo a 0 y deberás escanear todas las fichas de nuevo.')) {
    return;
  }

  const btn = triggerBtn || document.getElementById('btn-delete-all-results');
  try {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '⏳ Reiniciando...';
    }
    showToast('⏳ Reiniciando sesión...');
    if (typeof SupabaseClient !== 'undefined' && SupabaseClient.deleteSessionResults) {
      await SupabaseClient.deleteSessionResults(session.sessionRef);
    }
    if (typeof Scanner !== 'undefined' && Scanner.setEvaluatedStudents) {
      Scanner.setEvaluatedStudents([]);
    }
    showToast('🗑️ Sesión reiniciada. Se borraron todos los resultados.');
    loadAndRenderResultsTable();
    if (typeof refreshEvaluatedFromResults === 'function' && session.sessionRef) {
      refreshEvaluatedFromResults(session.sessionRef);
    }
  } catch (err) {
    console.error('[Delete All Results Error]', err);
    showToast('⚠️ No se pudieron borrar los resultados: ' + (err.message || 'error de red'));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '🗑️ Reiniciar Sesión';
    }
  }
}

// ── Exportación a Excel (SheetJS) ─────────────────────────────────────────
// Regla 10 – Sanitización UTF-8 estricta; try/catch sin excepciones no capturadas

function exportResultsToExcel() {
  const { session, classroom, resultMap } = currentResultsCache;
  if (!session || !classroom) {
    showToast('⚠️ No hay sesión activa para exportar.');
    return;
  }

  if (typeof XLSX === 'undefined') {
    showToast('⚠️ La biblioteca SheetJS (Excel) no está cargada.');
    return;
  }

  const students = classroom.students || [];
  if (students.length === 0) {
    showToast('⚠️ El salón no tiene estudiantes registrados.');
    return;
  }

  const sanitizeCell = (val) => {
    if (val == null) return '—';
    if (typeof val === 'number') return val;
    const str = String(val).trim();
    if (str === '') return '—';
    // Blindaje anti-inyección de fórmulas (DDE / CSV Injection): neutralizar =, +, -, @
    if (/^[=+\-@\t\r]/.test(str)) {
      return "'" + str;
    }
    return str;
  };

  const isBranch3 = session.branch === 'rama3' || (session.type === 'mc' && (session.questionCount > 3 || (session.questions && session.questions.length > 3)));
  const totalQ = session.questionCount || (session.questions ? session.questions.length : 20);

  let rows;
  let statsRows = null;

  if (isBranch3) {
    // ── EXPORTACIÓN PARA RAMA 3: CARTILLA DE RESPUESTAS (HASTA 20 PREGUNTAS) ──
    const evaluatedList = students.map(s => resultMap ? resultMap.get(s.id) : null).filter(Boolean);
    const evaluatedTotal = evaluatedList.length;

    rows = students.map((s, idx) => {
      const res = resultMap ? resultMap.get(s.id) : null;
      const isOk = res && ((res.teacher_verdict === 'CORRECTA') || (res.teacher_verdict === 'CORRECTO') || (res.ai_expected_match === true) || (res.deterministic_match === true));

      const grade20 = res ? (
        (res.ai_raw && res.ai_raw.grade20 != null)
          ? res.ai_raw.grade20
          : (res.ai_raw && res.ai_raw.correctCount != null && res.ai_raw.totalQuestions)
            ? Math.round((res.ai_raw.correctCount / res.ai_raw.totalQuestions) * 20)
            : (isOk ? 20 : 0)
      ) : '—';

      const correctCount = res ? (
        (res.ai_raw && res.ai_raw.correctCount != null)
          ? res.ai_raw.correctCount
          : (isOk ? totalQ : 0)
      ) : '—';

      const rowObj = {
        'N°': idx + 1,
        'Código': s.id,
        'Estudiante': sanitizeCell(s.name),
        'Salón': sanitizeCell(classroom.name),
        'Estado': res ? (res.ai_raw?.pendingAI ? 'ANALIZANDO_IA' : 'EVALUADO') : 'PENDIENTE',
        'Nota (0-20)': grade20,
        'Aciertos': correctCount,
        'Total Preguntas': totalQ,
        '% Aciertos': (typeof grade20 === 'number') ? `${Math.round((grade20 / 20) * 100)}%` : '—',
        'Veredicto': res ? (grade20 >= 11 ? 'APROBADO' : 'DESAPROBADO') : 'PENDIENTE'
      };

      // Mapear respuestas por pregunta P01..PN
      const omrMap = new Map();
      if (res && res.ai_raw && Array.isArray(res.ai_raw.omrResults)) {
        res.ai_raw.omrResults.forEach(r => {
          omrMap.set(r.qIndex, r.marked);
        });
      } else if (res && res.ai_answer_read) {
        const parts = res.ai_answer_read.split(/\s*\|\s*/);
        parts.forEach(p => {
          const m = p.match(/P(\d+):\s*([A-D]|BLANK|MULTIPLE)/i);
          if (m) omrMap.set(parseInt(m[1], 10), m[2]);
        });
      }

      for (let q = 1; q <= totalQ; q++) {
        const qKey = `P${String(q).padStart(2, '0')}`;
        const val = omrMap.get(q);
        rowObj[qKey] = sanitizeCell(val || (res ? '—' : '—'));
      }

      rowObj['Fecha y Hora'] = res && res.captured_at ? new Date(res.captured_at).toLocaleString() : '—';
      return rowObj;
    });

    // Hoja 2: Estadísticas de acierto por pregunta
    statsRows = [];
    const expectedTokens = String(session.expectedAnswer || '').split(/[\s,;|]+/);
    for (let q = 1; q <= totalQ; q++) {
      const qKey = `P${String(q).padStart(2, '0')}`;
      let expKey = '—';
      if (session.questions && session.questions[q - 1]) {
        expKey = session.questions[q - 1].correct || session.questions[q - 1].expectedAnswer || 'A';
      } else {
        expKey = (expectedTokens[q - 1] || 'A').toUpperCase();
      }

      let qHits = 0;
      students.forEach(s => {
        const res = resultMap ? resultMap.get(s.id) : null;
        if (res) {
          let marked = null;
          if (res.ai_raw && Array.isArray(res.ai_raw.omrResults)) {
            const item = res.ai_raw.omrResults.find(it => it.qIndex === q);
            if (item) marked = item.marked;
          }
          if (!marked && res.ai_answer_read) {
            const m = res.ai_answer_read.match(new RegExp(`P0?${q}:\\s*([A-D])`, 'i'));
            if (m) marked = m[1];
          }
          if (marked && marked.toUpperCase() === expKey.toUpperCase()) {
            qHits++;
          }
        }
      });

      const pctHit = evaluatedTotal > 0 ? `${Math.round((qHits / evaluatedTotal) * 100)}%` : '0%';
      statsRows.push({
        'Pregunta': qKey,
        'Clave Correcta': expKey,
        'Total Aciertos': qHits,
        'Total Evaluados': evaluatedTotal,
        '% de Acierto': pctHit
      });
    }

  } else {
    // ── EXPORTACIÓN PARA RAMA 1 Y RAMA 2 (RESPUESTA LIBRE / MC CORTO) ──
    // Regla 1: Cero Regresión en Respuesta Libre
    rows = students.map((s, idx) => {
      const res = resultMap ? resultMap.get(s.id) : null;
      const isOk = res && ((res.teacher_verdict === 'CORRECTA') || (res.teacher_verdict === 'CORRECTO') || (res.ai_expected_match === true) || (res.deterministic_match === true));
      const aiGrading = res && res.ai_raw && (res.ai_raw.aiGrading?.data || res.ai_raw.aiGrading);
      return {
        'N°': idx + 1,
        'Código': s.id,
        'Estudiante': sanitizeCell(s.name),
        'Salón': sanitizeCell(classroom.name),
        'Estado': res ? (res.ai_raw?.pendingAI ? 'ANALIZANDO_IA' : 'EVALUADO') : 'PENDIENTE',
        'Marcó / Respuesta': sanitizeCell(res ? (res.ai_answer_read || '—') : '—'),
        'Clave Esperada': sanitizeCell(session.expectedAnswer || '—'),
        'Veredicto': res ? (isOk ? 'CORRECTA' : 'INCORRECTA') : 'PENDIENTE',
        'Puntaje (0-4)': (aiGrading && aiGrading.score != null) ? aiGrading.score : '—',
        'Procedimiento Válido': (aiGrading && aiGrading.procedure_valid != null) ? (aiGrading.procedure_valid ? 'SÍ' : 'NO') : '—',
        'Error Pedagógico': sanitizeCell((res && res.ai_error_type && res.ai_error_type !== 'ninguno') ? res.ai_error_type : '—'),
        'Retroalimentación IA': sanitizeCell((res && res.ai_teacher_feedback) ? res.ai_teacher_feedback : '—'),
        'Fecha y Hora': res && res.captured_at ? new Date(res.captured_at).toLocaleString() : '—'
      };
    });
  }

  try {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Resultados');

    if (statsRows && statsRows.length > 0) {
      const wsStats = XLSX.utils.json_to_sheet(statsRows);
      XLSX.utils.book_append_sheet(wb, wsStats, 'Estadísticas por Pregunta');
    }

    const cleanClassroom = sanitizeExportFileName(classroom.name);
    const timeStamp = getExportTimestamp();
    const fileName = `Resultados_${cleanClassroom}_${timeStamp}.xlsx`;

    XLSX.writeFile(wb, fileName);
    showToast('📥 Archivo Excel descargado con éxito.');
  } catch (err) {
    console.error('[Excel Export Error]', err);
    showToast('⚠️ Error al generar el archivo Excel: ' + err.message);
  }
}
