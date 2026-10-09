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

// ── Apertura / cierre del modal de resultados ──────────────────────────────

function openResultsModal() {
  const modal = document.getElementById('results-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  loadAndRenderResultsTable();
}

function closeResultsModal() {
  const modal = document.getElementById('results-modal');
  if (modal) modal.style.display = 'none';
}

function goToSessionResults() {
  if (typeof closeModal === 'function') closeModal();
  if (typeof stopCamera === 'function') {
    try { stopCamera(); } catch (e) {}
  }
  if (screen.orientation && screen.orientation.unlock) {
    try { screen.orientation.unlock(); } catch (e) {}
  }
  openResultsModal();
}
window.goToSessionResults = goToSessionResults;

function goToScannerFromResults() {
  closeResultsModal();
  if (typeof switchTab === 'function') {
    switchTab('scan');
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
    <div style="padding:40px; text-align:center; color:#94a3b8; font-size:0.85rem;">
      <div style="font-size:1.6rem; margin-bottom:8px;">⏳</div>
      Cargando resultados de la sesión...
    </div>
  `;

  const session = ClassroomData.getActiveSession();
  if (!session || !session.classroomId) {
    if (subtitle) subtitle.textContent = 'No hay ninguna sesión activa en curso.';
    if (kpiTotal) kpiTotal.textContent = '0 / 0';
    if (kpiCorrect) kpiCorrect.textContent = '0 (0%)';
    if (kpiIncorrect) kpiIncorrect.textContent = '0 (0%)';
    container.innerHTML = `
      <div style="padding:40px; text-align:center; color:#94a3b8; font-size:0.85rem; border:1.5px dashed #334155; border-radius:12px;">
        <div style="font-size:1.8rem; margin-bottom:8px;">⚙️</div>
        <strong style="display:block; color:#f8fafc; font-size:0.95rem; margin-bottom:4px;">Sin sesión activa</strong>
        Configurá un salón y una evaluación en el asistente para registrar o consultar resultados.
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
      <div style="display:flex; flex-direction:column; gap:3px; margin-top:3px; font-size:0.75rem;">
        <div><span style="color:#94a3b8;">Salón:</span> <strong style="color:#60a5fa;">${clsName}</strong></div>
        <div><span style="color:#94a3b8;">Evaluación:</span> <strong style="color:#f1f5f9;">${session.title || 'Evaluación del Día'}</strong></div>
        <div><span style="color:#94a3b8;">Tipo:</span> <strong style="color:#38bdf8;">${evalTypeLabel}</strong></div>
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

    let statusBadge = `<span style="background:rgba(100,116,139,0.15); color:#94a3b8; border:1px solid #334155; padding:2px 8px; border-radius:6px; font-size:0.72rem; font-weight:700; white-space:nowrap;">⏳ Pendiente</span>`;
    if (isEvaluated) {
      if (isPendingAI) {
        if (res.ai_raw && res.ai_raw.aiError) {
          const isOffline = res.ai_raw.aiError === 'offline' || (typeof navigator !== 'undefined' && !navigator.onLine);
          const isTimeout = res.ai_raw.aiError === 'timeout' || res.ai_raw.aiError === 'timeout_or_offline';
          let label = '⚠️ Error IA';
          let badgeColor = '#f87171';
          let borderCol = 'rgba(239,68,68,0.3)';
          let bgCol = 'rgba(239,68,68,0.15)';
          if (isOffline) {
            label = '⚠️ Sin conexión';
          } else if (isTimeout) {
            label = '⏳ Tiempo excedido';
            badgeColor = '#facc15';
            borderCol = 'rgba(234,179,8,0.3)';
            bgCol = 'rgba(234,179,8,0.15)';
          }
          statusBadge = `<span style="background:${bgCol}; color:${badgeColor}; border:1px solid ${borderCol}; padding:2px 8px; border-radius:6px; font-size:0.72rem; font-weight:800; white-space:nowrap;" title="${res.ai_raw.errorDetail || ''}">${label}</span>`;
        } else if (isStale) {
          statusBadge = `<span style="background:rgba(234,179,8,0.15); color:#facc15; border:1px solid rgba(234,179,8,0.3); padding:2px 8px; border-radius:6px; font-size:0.72rem; font-weight:800; white-space:nowrap;" title="Tiempo de espera agotado. Puedes reintentar con el botón.">⏳ Expirado</span>`;
        } else {
          statusBadge = `<span style="background:rgba(234,179,8,0.15); color:#facc15; border:1px solid rgba(234,179,8,0.3); padding:2px 8px; border-radius:6px; font-size:0.72rem; font-weight:800; white-space:nowrap;">⏳ Analizando IA</span>`;
        }
      } else {
        statusBadge = `<span style="background:rgba(34,197,94,0.15); color:#4ade80; border:1px solid rgba(34,197,94,0.3); padding:2px 8px; border-radius:6px; font-size:0.72rem; font-weight:800; white-space:nowrap;">✅ Evaluado</span>`;
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
        const gradeColor = grade20 >= 11 ? '#4ade80' : '#f87171';

        answerContent = `
          <div style="font-size:0.95rem; font-weight:800; color:${gradeColor};">Nota: ${grade20} / 20</div>
          <div style="font-size:0.7rem; color:#94a3b8; font-weight:700; margin-top:2px;">${correctQ} / ${totalQ} aciertos</div>
          <div style="font-size:0.67rem; color:#38bdf8; margin-top:2px; cursor:help;" title="${escape(res.ai_answer_read || '')}">🔍 Ver claves marcadas</div>
        `;
      } else {
        answerContent = `<div style="font-size:0.88rem; font-weight:800; color:#60a5fa;">${escape(res.ai_answer_read || 'Registrado')}</div>`;
        if (aiGrading) {
          if (session.type === 'mc') {
            const procOk = aiGrading.procedure_valid;
            answerContent += `<div style="font-size:0.7rem; color:${procOk ? '#c084fc' : '#f59e0b'}; font-weight:700; margin-top:2px;">${procOk ? '🔬 Procedimiento OK' : '⚠️ Sin procedimiento'}</div>`;
          } else {
            answerContent += `<div style="font-size:0.7rem; color:#38bdf8; font-weight:700; margin-top:2px;">Nota: ${aiGrading.score}/4 pts</div>`;
          }
        }
      }
    }

    let expectedText = '—';
    if (isBranch3) {
      const totalQ = session.questionCount || (session.questions ? session.questions.length : 20);
      expectedText = `
        <div style="font-size:0.8rem; font-weight:700; color:#cbd5e1;">${totalQ} Claves</div>
        <div style="font-size:0.67rem; color:#64748b; margin-top:1px; cursor:help;" title="${escape(session.expectedAnswer || '')}">🔍 Ver pauta</div>
      `;
    } else {
      expectedText = escape(session.expectedAnswer || (res ? res.expected_answer : '—') || '—');
    }

    let verdictBadge = `<span style="color:#64748b; font-size:0.8rem;">—</span>`;
    if (isEvaluated) {
      if (isPendingAI) {
        if (res.ai_raw && res.ai_raw.aiError) {
          verdictBadge = `
            <button type="button" onclick="handleRetrySingleAI('${st.id}', this)"
              title="${res.ai_raw.errorDetail || 'Reintentar análisis con IA'}"
              style="background:#1e293b; border:1px solid #f59e0b; color:#fbbf24; border-radius:6px; padding:3px 8px; font-size:0.72rem; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:3px;">
              🔄 Reintentar IA
            </button>
          `;
        } else if (isStale) {
          verdictBadge = `
            <button type="button" onclick="handleRetrySingleAI('${st.id}', this)"
              title="Tiempo de espera agotado. Reintentar análisis."
              style="background:#1e293b; border:1px solid #f59e0b; color:#fbbf24; border-radius:6px; padding:3px 8px; font-size:0.72rem; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:3px;">
              🔄 Reintentar IA
            </button>
          `;
        } else {
          verdictBadge = `<span style="color:#f59e0b; font-size:0.78rem; font-weight:700;">⏳ En proceso</span>`;
        }
      } else if (isBranch3) {
        const grade20 = (res.ai_raw && res.ai_raw.grade20 != null)
          ? res.ai_raw.grade20
          : (res.ai_raw && res.ai_raw.correctCount != null && res.ai_raw.totalQuestions)
            ? Math.round((res.ai_raw.correctCount / res.ai_raw.totalQuestions) * 20)
            : (isOk ? 20 : 0);
        if (grade20 >= 11) {
          verdictBadge = `<span style="color:#22c55e; font-weight:800; font-size:0.82rem;">✓ APROBADO</span>`;
        } else {
          verdictBadge = `<span style="color:#ef4444; font-weight:800; font-size:0.82rem;">✗ DESAPROBADO</span>`;
        }
      } else if (isOk) {
        verdictBadge = `<span style="color:#22c55e; font-weight:800; font-size:0.82rem;" title="${res.ai_teacher_feedback ? res.ai_teacher_feedback.replace(/"/g, '&quot;') : ''}">✓ CORRECTA</span>`;
      } else {
        verdictBadge = `<span style="color:#ef4444; font-weight:800; font-size:0.82rem;" title="${res.ai_teacher_feedback ? res.ai_teacher_feedback.replace(/"/g, '&quot;') : ''}">✗ INCORRECTA</span>`;
      }
    }

    const deleteBtn = isEvaluated
      ? `<button type="button" onclick="handleDeleteSingleResult('${st.id}', this)" title="Borrar este resultado para reevaluar"
             style="background:#1e293b; border:1px solid #7f1d1d; color:#f87171; border-radius:6px; padding:3px 8px; font-size:0.72rem; cursor:pointer;">
             🗑️
           </button>`
      : '';

    const photoUrl = res && (res.grid_image_path || res.ai_raw?.gridImage);
    let photoBadge = '<span style="color:#475569; font-size:0.75rem;">—</span>';
    if (photoUrl) {
      const safeName = escape(st.name || '').replace(/'/g, '&#39;');
      photoBadge = `
        <button type="button" onclick="openPhotoViewer('${st.id}', '${safeName}', '${photoUrl}')"
          title="Ver foto de la resolución del estudiante"
          style="display:inline-flex; align-items:center; gap:4px; background:#1e293b; border:1px solid #3b82f6; color:#60a5fa; border-radius:6px; padding:3px 8px; font-size:0.72rem; font-weight:700; cursor:pointer;">
          📷 Ver
        </button>
      `;
    }

    rowsHtml += `
      <tr style="border-bottom:1px solid #1e293b; background:${isEvaluated ? 'rgba(15,23,42,0.6)' : 'transparent'};">
        <td style="padding:10px 12px; font-size:0.75rem; color:#64748b; font-weight:700;">${idx + 1}</td>
        <td style="padding:10px 12px; font-size:0.85rem; font-weight:700; color:#f8fafc;">${escape(st.name)}</td>
        <td style="padding:10px 12px; text-align:center;">${photoBadge}</td>
        <td style="padding:10px 12px;">${statusBadge}</td>
        <td style="padding:10px 12px;">${answerContent}</td>
        <td style="padding:10px 12px; font-size:0.85rem; font-weight:700; color:#94a3b8;">${expectedText}</td>
        <td style="padding:10px 12px;">${verdictBadge}</td>
        <td style="padding:10px 12px; text-align:center;">${deleteBtn}</td>
      </tr>
    `;
  });

  container.innerHTML = `
    <table style="width:100%; border-collapse:collapse; text-align:left;">
      <thead>
        <tr style="border-bottom:2px solid #334155; background:#0f172a; color:#94a3b8; font-size:0.7rem; text-transform:uppercase; letter-spacing:0.04em;">
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
