// =============================================================================
// session-saved-manager.js — Microevaluación
// MÓDULO: GESTIÓN DE SESIONES GUARDADAS (CRUD, MODAL Y SINCRONIZACIÓN NUBE)
//
// Guardarraíles activos:
//   Regla 8  – Coherencia Total del Borrado de Resultados (Anti-Desincronización):
//              Sincronización en 3 niveles: Supabase (DB), Scanner (memoria) y UI.
//   Regla 17 – Aislamiento Total de la Cartilla OMR (Rama 3): sesiones temporales.
// =============================================================================

    /**
     * Guarda la sesión actual con un tope estricto de 8 sesiones sincronizadas con Supabase.
     */
    function handleSaveCurrentSession() {
      const btnSave = document.getElementById('btn-save-session');
      try {
        const classId = wizardClassroomId || (document.getElementById('builder-classroom') ? document.getElementById('builder-classroom').value : '');
        if (!classId) {
          showToast('⚠️ No hay un salón seleccionado para guardar la sesión.');
          return;
        }
        const cls = ClassroomData.getClassroom(classId);
        const grade = ClassroomData.getClassroomGrade(classId);
        const activeSession = ClassroomData.getActiveSession();

        if (!wizardEval && !activeSession) {
          showToast('⚠️ No hay una evaluación configurada para guardar.');
          return;
        }

        const branch = (wizardEval && wizardEval.branch) || (activeSession && activeSession.branch) || 'rama1';
        let branchTitle = 'Formativa con IA';
        if (branch === 'rama3') {
          const isBank = (wizardEval && wizardEval.mode === 'bank') || (typeof r3State !== 'undefined' && r3State && r3State.mode === 'bank');
          branchTitle = isBank ? 'Cartilla OMR (Evaluación y Cartillas)' : 'Cartilla OMR (Solo Cartilla)';
        } else if (branch === 'rama2') {
          branchTitle = 'Focalizada en la Respuesta';
        }

        const sessionPayload = {
          id: (activeSession && activeSession.sessionRef) ? 'sess_' + activeSession.sessionRef.replace(/[^a-zA-Z0-9_-]/g, '_') : ('sess_' + Date.now()),
          savedAt: new Date().toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }),
          timestamp: Date.now(),
          classroomId: classId,
          classroomName: cls ? cls.name : classId,
          gradeText: (grade && (typeof grade === 'string' ? grade : grade.texto)) || (wizardEval && wizardEval.gradeText) || '',
          branch: branch,
          branchTitle: branchTitle,
          type: ((wizardEval && wizardEval.type === 'mc') || (activeSession && activeSession.type === 'mc')) ? 'mc' : 'free',
          questionCount: (wizardEval && wizardEval.questionCount) || (activeSession && activeSession.questionCount) || 1,
          questions: (wizardEval && wizardEval.questions) ? JSON.parse(JSON.stringify(wizardEval.questions)) : ((activeSession && activeSession.questions) ? JSON.parse(JSON.stringify(activeSession.questions)) : []),
          title: (wizardEval && wizardEval.title) || (activeSession && activeSession.title) || 'Evaluación del Día',
          prompt: (wizardEval && wizardEval.prompt) || (activeSession && activeSession.prompt) || '',
          expectedAnswer: (wizardEval && wizardEval.expectedAnswer) || (activeSession && activeSession.expectedAnswer) || '',
          cardOrientation: (wizardEval && wizardEval.cardOrientation) || (activeSession && activeSession.cardOrientation) || 'horizontal',
          withGrid: (wizardEval && wizardEval.withGrid !== undefined) ? wizardEval.withGrid : (activeSession && activeSession.withGrid !== undefined ? activeSession.withGrid : true),
          gridSize: (wizardEval && wizardEval.gridSize) || (activeSession && activeSession.gridSize) || 'normal',
          correctionMode: (activeSession && activeSession.correctionMode) || 'quick',
          mode: (wizardEval && wizardEval.mode) || (activeSession && activeSession.mode) || ((typeof r3State !== 'undefined') ? r3State.mode : undefined),
          gridStage: (wizardEval && wizardEval.gridStage !== undefined) ? wizardEval.gridStage : ((activeSession && activeSession.gridStage !== undefined) ? activeSession.gridStage : ((typeof simState !== 'undefined') ? simState.gridStage : 0)),
          r3State: (typeof r3State !== 'undefined' && r3State) ? JSON.parse(JSON.stringify(r3State)) : (activeSession && activeSession.r3State ? JSON.parse(JSON.stringify(activeSession.r3State)) : null),
          wizardEval: wizardEval ? JSON.parse(JSON.stringify(wizardEval)) : (activeSession ? JSON.parse(JSON.stringify(activeSession)) : null)
        };

        const clsCheck = ClassroomData.getClassroom(sessionPayload.classroomId);
        if (!clsCheck || !clsCheck.students || clsCheck.students.length === 0) {
          showToast('⚠️ No se puede guardar una sesión de un salón sin alumnos.');
          return;
        }

        const res = ClassroomData.saveSession(sessionPayload);
        if (!res.success) {
          if (res.reason === 'limit_reached') {
            showToast(`⚠️ Límite de ${res.max || 8} sesiones alcanzado. Ve a "Sesiones Guardadas" en el inicio y elimina una para poder guardar esta.`);
          } else {
            showToast('⚠️ No se pudo guardar: ' + (res.error || 'Error desconocido'));
          }
          return;
        }

        const maxSess = res.max || (typeof ClassroomData !== 'undefined' && ClassroomData.MAX_SAVED_SESSIONS) || 8;
        showToast(`✓ Sesión guardada con éxito (${res.count}/${maxSess})`);
        if (btnSave) {
          btnSave.style.background = '#EFECE3';
          btnSave.style.color = '#0369A1';
          btnSave.style.borderColor = 'rgba(41, 182, 246, 0.35)';
          btnSave.style.boxShadow = 'none';
          btnSave.classList.add('is-saved');
          btnSave.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><polyline points="20 6 9 17 4 12"/></svg> Guardada (${res.count}/${maxSess})`;
        }
        if (typeof updateDiscardOrDeleteButtonState === 'function') {
          updateDiscardOrDeleteButtonState(true, sessionPayload.id);
        }
        if (typeof renderSummarySessionsStrip === 'function') {
          renderSummarySessionsStrip(sessionPayload.id);
        }
        if (typeof updateHubSavedSessionsBadge === 'function') {
          updateHubSavedSessionsBadge();
        }
      } catch (err) {
        console.error('[handleSaveCurrentSession Error]', err);
        showToast('⚠️ Error al guardar sesión: ' + err.message);
      }
    }
    window.handleSaveCurrentSession = handleSaveCurrentSession;


    function handleDiscardOrDeleteSession() {
      const btn = document.getElementById('btn-discard-session');
      const isSaved = btn && btn.dataset.isSaved === 'true';

      if (!isSaved) {
        // Estado: Descartar (borrador no guardado)
        if (typeof resetWizard === 'function') {
          resetWizard();
        }
        if (typeof goHomeHub === 'function') {
          goHomeHub();
        } else if (typeof showView === 'function') {
          showView('hub');
        }
        return;
      }

      // Estado: Eliminar (sesión guardada)
      const sessions = (typeof ClassroomData !== 'undefined' && ClassroomData.getSavedSessions)
        ? ClassroomData.getSavedSessions()
        : [];
      let targetId = btn.dataset.sessionId;
      if (!targetId) {
        const activeSess = ClassroomData.getActiveSession();
        if (activeSess && activeSess.id) targetId = activeSess.id;
        else if (wizardClassroomId) {
          const match = sessions.find(s => s.classroomId === wizardClassroomId);
          if (match) targetId = match.id;
        }
      }

      const targetSess = sessions.find(s => s.id === targetId);
      const title = targetSess ? (targetSess.title || targetSess.classroomName || 'esta sesión') : 'esta sesión';

      const seguro = confirm(`¿Eliminar la sesión guardada "${title}"?\n\nSe liberará 1 cupo para que puedas guardar otra sesión y se desbloqueará el salón y sus preguntas.`);
      if (!seguro) return;

      const res = ClassroomData.deleteSavedSession(targetId);
      if (res && res.success) {
        showToast('🗑️ Sesión eliminada. Cupo liberado.');
        if (typeof updateHubSavedSessionsBadge === 'function') {
          updateHubSavedSessionsBadge();
        }

        const remaining = (typeof ClassroomData !== 'undefined' && ClassroomData.getSavedSessions)
          ? ClassroomData.getSavedSessions()
          : [];
        if (remaining.length > 0) {
          // Cargar la primera sesión restante
          loadAndActivateSavedSession(remaining[0].id);
        } else {
          // No quedan sesiones, regresar limpiamente al inicio
          if (typeof resetWizard === 'function') {
            resetWizard();
          }
          if (typeof goHomeHub === 'function') {
            goHomeHub();
          } else if (typeof showView === 'function') {
            showView('hub');
          }
        }
      } else {
        showToast('⚠️ No se pudo eliminar la sesión.');
      }
    }
    window.handleDiscardOrDeleteSession = handleDiscardOrDeleteSession;


    /**
     * Renderiza las tarjetas del modal de Sesiones Guardadas (hasta 8).
     */
    function renderSavedSessionsModal() {
      const sessions = (typeof ClassroomData !== 'undefined' && ClassroomData.getSavedSessions)
        ? ClassroomData.getSavedSessions()
        : [];
      const listEl = document.getElementById('saved-sessions-list');
      const emptyEl = document.getElementById('saved-sessions-empty');
      const countEl = document.getElementById('saved-sessions-modal-count');

      const max = (typeof ClassroomData !== 'undefined' && ClassroomData.MAX_SAVED_SESSIONS) || 8;
      if (countEl) {
        countEl.textContent = `${sessions.length} de ${max} ocupadas`;
      }

      if (!listEl) return;

      if (sessions.length === 0) {
        listEl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'block';
        return;
      }

      if (emptyEl) emptyEl.style.display = 'none';
      listEl.style.display = 'flex';

      listEl.innerHTML = sessions.map(sess => {
        const isOMR = sess.type === 'mc';
        const isBranch3 = sess.branch === 'rama3';
        const isBranch2 = sess.branch === 'rama2';

        let branchBadgeHtml = '';
        if (isBranch3) {
          branchBadgeHtml = `<span style="background:rgba(2,132,199,0.2); border:1px solid #0284c7; color:#38bdf8; font-size:0.75rem; font-weight:800; padding:3px 9px; border-radius:6px;">📝 ${escaparHtml(sess.branchTitle || 'Cartilla OMR')}</span>`;
        } else if (isBranch2) {
          branchBadgeHtml = `<span style="background:rgba(16,185,129,0.2); border:1px solid #10b981; color:#34d399; font-size:0.75rem; font-weight:800; padding:3px 9px; border-radius:6px;">⚡ ${escaparHtml(sess.branchTitle || 'Focalizada en la Respuesta')}</span>`;
        } else {
          branchBadgeHtml = `<span style="background:rgba(168,85,247,0.2); border:1px solid #a855f7; color:#c084fc; font-size:0.75rem; font-weight:800; padding:3px 9px; border-radius:6px;">🤖 ${escaparHtml(sess.branchTitle || 'Formativa con IA')}</span>`;
        }

        const clsColor = (typeof ClassroomData !== 'undefined' && ClassroomData.getClassroomColor)
          ? ClassroomData.getClassroomColor(sess.classroomId)
          : '#38bdf8';

        // Vista previa de preguntas y claves
        let questionsPreviewHtml = '';
        if (sess.questions && sess.questions.length > 0) {
          questionsPreviewHtml = `
            <div style="background:#090d16; border:1px solid #334155; border-radius:8px; padding:10px; margin-top:10px;">
              <div style="font-size:0.72rem; color:#94a3b8; font-weight:700; margin-bottom:6px;">Preguntas y Pauta de Claves:</div>
              <div style="display:flex; flex-direction:column; gap:6px; max-height:120px; overflow-y:auto;">
                ${sess.questions.slice(0, 5).map((q, idx) => `
                  <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:0.78rem;">
                    <span style="color:#e2e8f0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1;">
                      <strong>P${idx + 1}:</strong> ${escaparHtml((q.prompt || '').substring(0, 70))}${q.prompt && q.prompt.length > 70 ? '...' : ''}
                    </span>
                    <span style="background:#065f46; color:#4ade80; font-weight:800; font-size:0.72rem; padding:2px 8px; border-radius:4px; flex-shrink:0;">
                      ${isOMR ? ('Clave: ' + (q.correct || 'A')) : ('Rpta: ' + (q.expectedAnswer || ''))}
                    </span>
                  </div>
                `).join('')}
                ${sess.questions.length > 5 ? `<div style="font-size:0.72rem; color:#64748b; font-style:italic; text-align:center;">+ ${sess.questions.length - 5} preguntas adicionales</div>` : ''}
              </div>
            </div>
          `;
        } else if (sess.prompt) {
          questionsPreviewHtml = `
            <div style="background:#090d16; border:1px solid #334155; border-radius:8px; padding:10px; margin-top:10px;">
              <div style="font-size:0.78rem; color:#e2e8f0; line-height:1.4;">
                <strong>Consigna:</strong> ${escaparHtml(sess.prompt.substring(0, 100))}${sess.prompt.length > 100 ? '...' : ''}
              </div>
              <div style="margin-top:6px; font-size:0.75rem; color:#4ade80; font-weight:700;">
                Respuesta esperada: ${escaparHtml(sess.expectedAnswer || '')}
              </div>
            </div>
          `;
        }

        return `
          <div style="background:#1e293b; border:1.5px solid #334155; border-radius:12px; padding:16px; transition:border 0.15s; box-shadow:0 4px 12px rgba(0,0,0,0.2);">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px; margin-bottom:8px;">
              <div>
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                  <span style="font-size:1.05rem; font-weight:800; color:${clsColor};">${escaparHtml(sess.classroomName || 'Salón')}</span>
                  ${sess.gradeText ? `<span style="background:#064e3b; border:1px solid #10b981; color:#a7f3d0; font-size:0.72rem; font-weight:800; padding:2px 8px; border-radius:6px;">${escaparHtml(sess.gradeText)}</span>` : ''}
                </div>
                <div style="font-size:0.72rem; color:#64748b; margin-top:3px;">
                  Guardada el: ${escaparHtml(sess.savedAt || '')}
                </div>
              </div>
              <div>
                ${branchBadgeHtml}
              </div>
            </div>

            ${questionsPreviewHtml}

            <div style="display:flex; justify-content:flex-end; align-items:center; gap:10px; margin-top:14px; padding-top:12px; border-top:1px solid #334155; flex-wrap:wrap;">
              <button type="button" onclick="handleDeleteSavedSession('${sess.id}')"
                style="background:#1e293b; border:1px solid #7f1d1d; color:#f87171; border-radius:8px; padding:8px 14px; font-size:0.78rem; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:6px;">
                🗑️ Eliminar
              </button>
              <button type="button" onclick="loadAndActivateSavedSession('${sess.id}')"
                style="background:#2563eb; border:none; color:#fff; border-radius:8px; padding:8px 18px; font-size:0.82rem; font-weight:800; cursor:pointer; display:flex; align-items:center; gap:6px; box-shadow:0 2px 6px rgba(37,99,235,0.4);">
                ▶️ Cargar Sesión
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    function openSavedSessionsModal() {
      renderSavedSessionsModal();
      if (typeof ClassroomData !== 'undefined' && ClassroomData.syncSessionsWithCloud) {
        ClassroomData.syncSessionsWithCloud().then(() => {
          renderSavedSessionsModal();
          updateHubSavedSessionsBadge();
        }).catch(() => {});
      }
    }
    window.openSavedSessionsModal = openSavedSessionsModal;

    function closeSavedSessionsModal() {
      // Función de cierre segura
    }
    window.closeSavedSessionsModal = closeSavedSessionsModal;

    function handleDeleteSavedSession(sessionId) {
      const sessions = (typeof ClassroomData !== 'undefined' && ClassroomData.getSavedSessions) ? ClassroomData.getSavedSessions() : [];
      const sess = sessions.find(s => s.id === sessionId);
      const title = sess ? (sess.title || sess.classroomName || 'esta sesión') : 'esta sesión';

      const seguro = confirm(`¿Eliminar la sesión guardada "${title}"?\n\nSe liberará 1 cupo para que puedas guardar otra sesión y se desbloqueará el salón y sus preguntas.`);
      if (!seguro) return;

      const res = ClassroomData.deleteSavedSession(sessionId);
      if (res && res.success) {
        showToast('🗑️ Sesión eliminada. Cupo liberado.');
        renderSavedSessionsModal();
        updateHubSavedSessionsBadge();
      } else {
        showToast('⚠️ No se pudo eliminar la sesión.');
      }
    }
    window.handleDeleteSavedSession = handleDeleteSavedSession;

    function loadAndActivateSavedSession(sessionId, options) {
      const asDirect = !!(options && options.asDirectModalityView);
      const sessions = (typeof ClassroomData !== 'undefined' && ClassroomData.getSavedSessions) ? ClassroomData.getSavedSessions() : [];
      const sess = sessions.find(s => s.id === sessionId);
      if (!sess) {
        showToast('⚠️ No se encontró la sesión solicitada.');
        return;
      }
      const cls = ClassroomData.getClassroom(sess.classroomId);
      if (!cls || !cls.students || cls.students.length === 0) {
        showToast('⚠️ El salón asignado a esta sesión no tiene alumnos o ya no existe.');
        return;
      }

      // 1. Activar salón y evaluación en memoria
      wizardClassroomId = sess.classroomId;
      if (sess.wizardEval) {
        wizardEval = JSON.parse(JSON.stringify(sess.wizardEval));
        if (!wizardEval.mode && (sess.mode || (sess.data && sess.data.mode) || (sess.r3State && sess.r3State.mode))) {
          wizardEval.mode = sess.mode || (sess.data && sess.data.mode) || (sess.r3State && sess.r3State.mode);
        }
        if (!wizardEval.branchTitle && (sess.branchTitle || sess.branch_title)) {
          wizardEval.branchTitle = sess.branchTitle || sess.branch_title;
        }
        if (!wizardEval.r3State && (sess.r3State || (sess.data && sess.data.r3State))) {
          wizardEval.r3State = sess.r3State || (sess.data && sess.data.r3State);
        }
      } else {
        wizardEval = {
          id: sess.evalId || sess.id,
          branch: sess.branch,
          type: sess.type,
          questionCount: sess.questionCount,
          questions: sess.questions,
          prompt: sess.prompt,
          expectedAnswer: sess.expectedAnswer,
          title: sess.title,
          withGrid: sess.withGrid,
          cardOrientation: sess.cardOrientation,
          gridSize: sess.gridSize,
          mode: sess.mode
        };
      }

      window.selectedBranch = sess.branch || 'rama1';
      if (typeof currentBranchMode !== 'undefined') currentBranchMode = sess.branch || 'rama1';

      // 2. Configurar selectores de UI
      const sel = document.getElementById('builder-classroom');
      if (sel) {
        sel.value = sess.classroomId;
        sel.style.borderColor = ClassroomData.getClassroomColor(sess.classroomId);
        if (typeof updateClassroomSelectDisplay === 'function') updateClassroomSelectDisplay(sel);
      }
      if (typeof renderGradeSelect === 'function') renderGradeSelect(sess.classroomId);

      // 3. Cerrar modal y abrir vista de evaluación
      closeSavedSessionsModal();
      window.isViewingSavedSessionsMode = !asDirect;
      showView('eval');
      if (typeof toggleSummaryViewMode === 'function') {
        toggleSummaryViewMode('pdf');
      }
      if (typeof updateTopbarModeTitle === 'function') {
        if (asDirect) {
          updateTopbarModeTitle(sess.branch || 'rama1');
        } else {
          updateTopbarModeTitle('saved-sessions');
        }
      }

      // Desplazamiento suave al tope para restaurar el espacio visual superior solicitado
      window.scrollTo({ top: 0, behavior: 'smooth' });

      // Capturar clon para fundido cruzado (Crossfade simultáneo) si ya estamos en la vista de resumen
      const summaryEl = document.getElementById('step-summary');
      const isAlreadyVisible = summaryEl && window.getComputedStyle(summaryEl).display !== 'none';
      let ghostClone = null;
      if (isAlreadyVisible && summaryEl && summaryEl.parentNode) {
        const prevGhost = document.getElementById('step-summary-crossfade-ghost');
        if (prevGhost && prevGhost.parentNode) prevGhost.parentNode.removeChild(prevGhost);

        ghostClone = summaryEl.cloneNode(true);
        ghostClone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
        ghostClone.id = 'step-summary-crossfade-ghost';
        ghostClone.classList.remove('active-split');
        ghostClone.classList.add('is-ghost-clone');
        ghostClone.style.position = 'absolute';
        ghostClone.style.top = summaryEl.offsetTop + 'px';
        ghostClone.style.left = summaryEl.offsetLeft + 'px';
        ghostClone.style.width = summaryEl.offsetWidth + 'px';
        ghostClone.style.pointerEvents = 'none';
        ghostClone.style.zIndex = '5';
        ghostClone.style.transition = 'opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1)';
        ghostClone.style.opacity = '1';
        summaryEl.parentNode.insertBefore(ghostClone, summaryEl);
      }

      hideWizardSteps();

      // Restaurar estado completo de los constructores (Rama 3 o Simulador R1/R2)
      if (sess.branch === 'rama3' && typeof r3State !== 'undefined') {
        if (sess.r3State) {
          Object.assign(r3State, JSON.parse(JSON.stringify(sess.r3State)));
        } else {
          const qCount = sess.questionCount || (sess.questions ? sess.questions.length : 10);
          r3State.count = Math.min(Math.max(qCount, 5), 20);

          const explicitMode = sess.mode || (sess.data && sess.data.mode) || (sess.wizardEval && sess.wizardEval.mode) || (sess.r3State && sess.r3State.mode);
          const bTitle = sess.branchTitle || sess.branch_title || (sess.wizardEval && sess.wizardEval.branchTitle);
          const isBankByBranchTitle = !!(bTitle && (bTitle.includes('Evaluación y Cartillas') || bTitle.includes('Evaluacion y Cartillas')));
          const hasExamQuestions = (Array.isArray(sess.questions) && sess.questions.some(q => q && q.prompt && !/^Pregunta\s+\d+$/i.test(q.prompt.trim()) && !q.prompt.startsWith('[Pregunta'))) ||
            (sess.r3State && Array.isArray(sess.r3State.bankQuestions) && sess.r3State.bankQuestions.some(q => q && q.prompt && !/^Pregunta\s+\d+$/i.test(q.prompt.trim())));
          const isBankMode = explicitMode === 'bank' || isBankByBranchTitle || sess.hasQuestionnaire === true || hasExamQuestions;
          r3State.mode = isBankMode ? 'bank' : 'keys';

          if (Array.isArray(sess.questions)) {
            sess.questions.forEach((q, idx) => {
              if (idx < 20) {
                if (q.correct) {
                  r3State.keys[idx] = q.correct.toUpperCase();
                  if (r3State.soloKeys) r3State.soloKeys[idx] = q.correct.toUpperCase();
                }
                if (q.prompt || q.options) {
                  r3State.bankQuestions[idx] = {
                    id: q.id || ('r3_q' + (idx + 1)),
                    prompt: q.prompt || `Pregunta ${idx + 1}`,
                    options: q.options || { A: 'A', B: 'B', C: 'C', D: 'D' },
                    correct: (q.correct || 'A').toUpperCase()
                  };
                }
              }
            });
          } else if (sess.expectedAnswer) {
            const keys = sess.expectedAnswer.trim().split(/\s+/);
            keys.forEach((k, idx) => {
              if (idx < 20 && /^[A-D]$/i.test(k)) {
                r3State.keys[idx] = k.toUpperCase();
                if (r3State.soloKeys) r3State.soloKeys[idx] = k.toUpperCase();
              }
            });
          }
        }
        if (typeof initRama3Builder === 'function') initRama3Builder();
      } else if (typeof simState !== 'undefined') {
        simState.branch = sess.branch || 'rama1';
        const maxQ = (sess.branch === 'rama2') ? 5 : 2;
        const qCount = sess.questionCount || (sess.questions ? sess.questions.length : 1);
        simState.count = Math.min(Math.max(1, qCount), maxQ);

        const isMC = (sess.type === 'mc' || sess.type === 'mc1' || sess.type === 'mc2' || sess.responseType === 'mc' || (sess.wizardEval && (sess.wizardEval.type === 'mc' || sess.wizardEval.type === 'mc1' || sess.wizardEval.type === 'mc2')));
        simState.type = isMC ? 'mc' : 'free';

        simState.withGrid = (sess.withGrid !== undefined) ? !!sess.withGrid : (sess.branch === 'rama1');
        if (typeof sess.gridStage === 'number') simState.gridStage = sess.gridStage;
        if (sess.cardFormat) simState.cardFormat = sess.cardFormat;
        if (sess.cardOrientation) simState.orientation = sess.cardOrientation;
        if (sess.isPortrait !== undefined) simState.isPortrait = sess.isPortrait;

        if (Array.isArray(sess.questions) && sess.questions.length > 0) {
          sess.questions.forEach((q, idx) => {
            if (idx < 5) {
              simState.questions[idx] = {
                prompt: q.prompt || '',
                options: q.options ? { ...q.options } : { A: '', B: '', C: '', D: '' },
                correct: q.correct || 'A',
                expectedAnswer: q.expectedAnswer || '',
                rubric: q.rubric || null,
                hasRubric: !!(q.rubric || q.rubrica)
              };
            }
          });
        } else if (sess.prompt) {
          simState.questions[0] = {
            prompt: sess.prompt || '',
            options: sess.options ? { ...sess.options } : { A: '', B: '', C: '', D: '' },
            correct: sess.correct || (sess.expectedAnswer && /^[A-D]$/i.test(sess.expectedAnswer.trim()) ? sess.expectedAnswer.trim().toUpperCase() : 'A'),
            expectedAnswer: sess.expectedAnswer || '',
            rubric: sess.rubric || null,
            hasRubric: !!(sess.rubric || sess.rubrica)
          };
        }
        if (typeof updateSimToolbar === 'function') updateSimToolbar();
        if (typeof renderSimulatedCard === 'function') renderSimulatedCard();
      }

      // 4. Activar sesión en ClassroomData y Escáner
      const activeObj = {
        sessionRef: sess.sessionRef || (sess.classroomId + '::' + (wizardEval.id || sess.id)),
        id: sess.id,
        classroomId: sess.classroomId,
        evalId: sess.evalId || wizardEval.id || sess.id,
        branch: sess.branch,
        withGrid: wizardEval.withGrid !== undefined ? wizardEval.withGrid : true,
        title: sess.title,
        prompt: sess.prompt,
        expectedAnswer: sess.expectedAnswer,
        unitHint: '',
        type: sess.type,
        questionCount: sess.questionCount,
        questions: sess.questions || [],
        cardOrientation: sess.cardOrientation || 'horizontal',
        correctionMode: sess.correctionMode || 'quick',
        mode: (wizardEval && wizardEval.mode) || sess.mode || ((typeof r3State !== 'undefined') ? r3State.mode : undefined),
        gridStage: (wizardEval && wizardEval.gridStage !== undefined) ? wizardEval.gridStage : (sess.gridStage !== undefined ? sess.gridStage : 0),
        r3State: (typeof r3State !== 'undefined' && r3State) ? JSON.parse(JSON.stringify(r3State)) : (sess.r3State || null),
        timestamp: Date.now()
      };
      ClassroomData.setActiveSession(activeObj);
      if (typeof Scanner !== 'undefined' && Scanner.setSession) {
        Scanner.setSession(sess.classroomId, activeObj.evalId);
      }
      if (typeof updateScannerSessionBar === 'function') {
        updateScannerSessionBar(activeObj);
      }

      // 5. Mostrar la pantalla de resumen confirmada con Crossfade simultáneo
      if (ghostClone && summaryEl) {
        summaryEl.style.opacity = '0';
        summaryEl.style.transition = 'opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1)';
      }

      showSummary();
      updateClassroomActionsVisibility(sess.classroomId);

      if (typeof fitSummaryDocumentsToViewport === 'function') {
        setTimeout(fitSummaryDocumentsToViewport, 40);
      }

      const stripEl = document.getElementById('summary-sessions-strip');
      if (asDirect) {
        if (stripEl) stripEl.style.display = 'none';
      } else {
        if (typeof renderSummarySessionsStrip === 'function') {
          renderSummarySessionsStrip(sess.id);
        }
      }
      if (typeof updateDiscardOrDeleteButtonState === 'function') {
        updateDiscardOrDeleteButtonState(true, sess.id);
      }

      if (ghostClone) {
        setTimeout(() => {
          ghostClone.style.opacity = '0';
          if (summaryEl) summaryEl.style.opacity = '1';
          setTimeout(() => {
            if (ghostClone && ghostClone.parentNode) {
              ghostClone.parentNode.removeChild(ghostClone);
            }
            if (summaryEl) {
              summaryEl.style.transition = '';
              summaryEl.style.opacity = '';
            }
            if (typeof fitSummaryDocumentsToViewport === 'function') {
              fitSummaryDocumentsToViewport();
            }
          }, 240);
        }, 16);
      }

      showToast(`✓ Sesión cargada: ${cls.name} (${sess.branchTitle || 'Evaluación'})`);
    }
    window.loadAndActivateSavedSession = loadAndActivateSavedSession;
    window.openSessionFromBank = function (sessionId) {
      loadAndActivateSavedSession(sessionId, { asDirectModalityView: true });
    };

    function updateHubSavedSessionsBadge() {
      const badge = document.getElementById('hub-saved-sessions-badge');
      if (badge && typeof ClassroomData !== 'undefined' && typeof ClassroomData.getSavedSessions === 'function') {
        const sessions = ClassroomData.getSavedSessions();
        const max = ClassroomData.MAX_SAVED_SESSIONS || 8;
        badge.textContent = `${sessions.length}/${max}`;
        if (sessions.length >= max) {
          badge.style.background = 'rgba(239,68,68,0.2)';
          badge.style.borderColor = '#ef4444';
          badge.style.color = '#f87171';
        } else {
          badge.style.background = 'rgba(217,119,6,0.2)';
          badge.style.borderColor = '#d97706';
          badge.style.color = '#fbbf24';
        }
      }
    }
    window.updateHubSavedSessionsBadge = updateHubSavedSessionsBadge;


    // [card-generator.js] GENERADOR DE FICHAS A5 + MAQUETACIÓN A4 extraído en Tanda 5 (v3.1.31)

        /**
     * Activa (o reactiva) la sesión de escaneo desde el estado del wizard.
     *
     * Se llama AUTOMÁTICAMENTE cuando el docente confirma la evaluación
     * (showSummary). No es una decisión suya: es el apunte interno que hace que
     * el escáner sepa qué salón y qué evaluación está corrigiendo. Por eso ya
     * no existe un botón "Activar Sesión" — era un subconjunto de "Ir al
     * escáner", que también activaba antes de saltar de pestaña.
     *
     * @returns {object|null} la sesión activada, o null si faltan datos
     */

// Exposición global
if (typeof window !== "undefined") {
  window.handleSaveCurrentSession = handleSaveCurrentSession;
  window.handleDiscardOrDeleteSession = handleDiscardOrDeleteSession;
  window.renderSavedSessionsModal = renderSavedSessionsModal;
  window.openSavedSessionsModal = openSavedSessionsModal;
  window.closeSavedSessionsModal = closeSavedSessionsModal;
  window.handleDeleteSavedSession = handleDeleteSavedSession;
  window.loadAndActivateSavedSession = loadAndActivateSavedSession;
  window.updateHubSavedSessionsBadge = updateHubSavedSessionsBadge;
}
