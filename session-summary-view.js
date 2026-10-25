// =============================================================================
// session-summary-view.js — Microevaluación
// MÓDULO: PANTALLA DE RESUMEN, VISTA PREVIA DE HOJAS Y RESULTADOS EN VIVO
// =============================================================================

    function editarEvaluacion() {
      // GUARDRAIL: Si ya hay capturas/alumnos calificados en esta sesión, prohibir editar
      let evaluatedCount = 0;
      if (typeof Scanner !== 'undefined' && Scanner.getEvaluatedCount) {
        evaluatedCount = Scanner.getEvaluatedCount();
      }
      if (evaluatedCount > 0) {
        showToast(`⚠️ Esta sesión ya tiene ${evaluatedCount} alumno(s) calificado(s). No se puede editar.`);
        if (typeof openResultsModal === 'function') openResultsModal();
        return;
      }

      // 1. Ocultar la pantalla de resumen
      const summaryEl = document.getElementById('step-summary');
      const teacherPanelEl = summaryEl ? summaryEl.closest('.teacher-panel') : null;
      const viewCreateEl = document.getElementById('view-create');
      if (teacherPanelEl) teacherPanelEl.classList.remove('has-active-split');
      if (viewCreateEl) viewCreateEl.classList.remove('has-active-split');
      document.body.classList.remove('has-active-split');
      if (summaryEl) {
        summaryEl.classList.remove('active-split');
        summaryEl.style.display = 'none';
      }

      // 1b. Salir del modo de sesiones guardadas y ocultar los números flotantes
      window.isViewingSavedSessionsMode = false;
      const stripEl = document.getElementById('summary-sessions-strip');
      if (stripEl) {
        stripEl.style.display = 'none';
        const listEl = document.getElementById('summary-sessions-numbers-list');
        if (listEl) listEl.innerHTML = '';
      }

      // 2. Limpiar y ocultar los visores inferiores de PDF
      if (typeof clearGeneratedPdfContainers === 'function') {
        clearGeneratedPdfContainers();
      } else {
        const pagesContainer = document.getElementById('pages-container');
        if (pagesContainer) {
          pagesContainer.innerHTML = '';
          pagesContainer.style.display = 'none';
        }
        const bookletContainer = document.getElementById('booklet-container');
        if (bookletContainer) {
          bookletContainer.innerHTML = '';
          bookletContainer.style.display = 'none';
        }
      }

      // 3. Volver a mostrar el Paso 1 (Salón) y el Paso 2 (Editor de Preguntas)
      const stepClass = document.getElementById('step-classroom');
      if (stepClass) stepClass.style.display = 'block';

      const stepType = document.getElementById('step-eval-type');
      if (stepType) stepType.style.display = 'block';

      // 4. Determinar la rama activa y refrescar su vista interactiva con los datos intactos
      const activeSess = (typeof ClassroomData !== 'undefined' && ClassroomData.getActiveSession) ? ClassroomData.getActiveSession() : null;
      const ev = wizardEval || activeSess;
      const curBranch = (ev && ev.branch) || window.selectedBranch || (typeof currentBranchMode !== 'undefined' ? currentBranchMode : 'rama1');
      window.selectedBranch = curBranch;
      if (typeof updateTopbarModeTitle === 'function') {
        updateTopbarModeTitle(curBranch);
      }

      if (curBranch === 'rama3') {
        const simContainer = document.getElementById('sheet-simulator-container');
        if (simContainer) simContainer.style.display = 'none';
        const b3Opts = document.getElementById('branch-3-options');
        if (b3Opts) b3Opts.style.display = 'block';

        if (typeof r3State !== 'undefined' && ev) {
          const sessList = (typeof ClassroomData !== 'undefined' && ClassroomData.getSavedSessions) ? ClassroomData.getSavedSessions() : [];
          const parentSess = sessList.find(s => (s.id && (s.id === ev.id || s.id === ev.evalId || (activeSess && (s.id === activeSess.id || s.id === activeSess.evalId)))) ||
            (s.evalId && (s.evalId === ev.id || s.evalId === ev.evalId || (activeSess && (s.evalId === activeSess.id || s.evalId === activeSess.evalId)))));

          const r3Source = (ev && ev.r3State) || (activeSess && activeSess.r3State) || (parentSess && (parentSess.r3State || (parentSess.data && parentSess.data.r3State))) || null;
          if (r3Source) {
            Object.assign(r3State, JSON.parse(JSON.stringify(r3Source)));
          }
          const qCount = ev.questionCount || (parentSess && (parentSess.questionCount || (parentSess.data && parentSess.data.questionCount))) || (ev.questions ? ev.questions.length : 10);
          r3State.count = Math.min(Math.max(qCount, 5), 20);

          const rawExplicitMode = ev.mode || (wizardEval && wizardEval.mode) || (activeSess && activeSess.mode) || (parentSess && (parentSess.mode || (parentSess.data && parentSess.data.mode))) || (r3Source && r3Source.mode);

          const bTitle = (ev && ev.branchTitle) || (wizardEval && wizardEval.branchTitle) || (activeSess && activeSess.branchTitle) || (parentSess && (parentSess.branchTitle || parentSess.branch_title)) || '';
          const fullTitle = (ev && ev.title) || (wizardEval && wizardEval.title) || (activeSess && activeSess.title) || (parentSess && parentSess.title) || '';

          const isExplicitSoloCartilla = (rawExplicitMode === 'keys') || bTitle.includes('Solo Cartilla') || fullTitle.includes('Solo Cartilla');
          const isExplicitBank = (rawExplicitMode === 'bank') || bTitle.includes('Evaluación y Cartillas') || bTitle.includes('Evaluacion y Cartillas');

          const hasExamQuestions = (Array.isArray(ev.questions) && ev.questions.some(q => q && q.prompt && !/^Pregunta\s+\d+$/i.test(q.prompt.trim()) && !q.prompt.startsWith('[Pregunta'))) ||
            (r3Source && Array.isArray(r3Source.bankQuestions) && r3Source.bankQuestions.some(q => q && q.prompt && !/^Pregunta\s+\d+$/i.test(q.prompt.trim())));

          let isBankMode = false;
          if (isExplicitSoloCartilla && !isExplicitBank) {
            isBankMode = false;
          } else if (isExplicitBank) {
            isBankMode = true;
          } else {
            isBankMode = ev.hasQuestionnaire === true || (activeSess && activeSess.hasQuestionnaire === true) || hasExamQuestions;
          }
          r3State.mode = isBankMode ? 'bank' : 'keys';

          if (Array.isArray(ev.questions) && ev.questions.length > 0) {
            ev.questions.forEach((q, idx) => {
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
          } else if (ev.expectedAnswer) {
            const keys = ev.expectedAnswer.trim().split(/\s+/);
            keys.forEach((k, idx) => {
              if (idx < 20 && /^[A-D]$/i.test(k)) {
                r3State.keys[idx] = k.toUpperCase();
                if (r3State.soloKeys) r3State.soloKeys[idx] = k.toUpperCase();
              }
            });
          }
        }

        if (typeof initRama3Builder === 'function') {
          initRama3Builder();
        }
      } else {
        const simContainer = document.getElementById('sheet-simulator-container');
        if (simContainer) simContainer.style.display = 'flex';
        const b3Opts = document.getElementById('branch-3-options');
        if (b3Opts) b3Opts.style.display = 'none';

        if (typeof simState !== 'undefined' && ev) {
          simState.branch = curBranch;
          const maxCount = (curBranch === 'rama2') ? 5 : 2;
          const qCount = ev.questionCount || (ev.questions ? ev.questions.length : 1);
          simState.count = Math.min(Math.max(1, qCount), maxCount);

          const isMC = (ev.type === 'mc' || ev.type === 'mc1' || ev.type === 'mc2' || ev.responseType === 'mc' || (ev.wizardEval && (ev.wizardEval.type === 'mc' || ev.wizardEval.type === 'mc1' || ev.wizardEval.type === 'mc2')));
          simState.type = isMC ? 'mc' : 'free';

          simState.withGrid = (ev.withGrid !== undefined) ? !!ev.withGrid : (curBranch === 'rama1');
          if (typeof ev.gridStage === 'number') simState.gridStage = ev.gridStage;
          if (ev.cardFormat) simState.cardFormat = ev.cardFormat;
          if (ev.orientation) simState.orientation = ev.orientation;
          if (ev.isPortrait !== undefined) simState.isPortrait = ev.isPortrait;

          if (Array.isArray(ev.questions) && ev.questions.length > 0) {
            ev.questions.forEach((q, idx) => {
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
          } else if (ev.prompt) {
            simState.questions[0] = {
              prompt: ev.prompt || '',
              options: ev.options ? { ...ev.options } : { A: '', B: '', C: '', D: '' },
              correct: ev.correct || (ev.expectedAnswer && /^[A-D]$/i.test(ev.expectedAnswer.trim()) ? ev.expectedAnswer.trim().toUpperCase() : 'A'),
              expectedAnswer: ev.expectedAnswer || '',
              rubric: ev.rubric || null,
              hasRubric: !!(ev.rubric || ev.rubrica)
            };
          }
        }

        if (typeof updateSimToolbar === 'function') {
          updateSimToolbar();
        }
        if (typeof renderSimulatedCard === 'function') {
          renderSimulatedCard();
        }
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.editarEvaluacion = editarEvaluacion;
    window.cambiarSalon = editarEvaluacion;
    window.cambiarSalonOEvaluacion = editarEvaluacion;

    function showSummary() {
      try {
        if (!wizardClassroomId) {
          const sel = document.getElementById('builder-classroom');
          if (sel && sel.value) wizardClassroomId = sel.value;
        }
        if (!wizardClassroomId || !wizardEval) {
          console.warn('[showSummary] Falta salón o evaluación:', { wizardClassroomId, wizardEval });
          showToast('⚠️ Por favor selecciona un salón primero.');
          return;
        }

        const cls = ClassroomData.getClassroom(wizardClassroomId);
        if (!cls) {
          showToast('⚠️ Ese salón ya no existe. Elige otro.');
          resetWizard();
          return;
        }
        const color = ClassroomData.getClassroomColor(wizardClassroomId);

        // Ocultar paso 1 (salón), paso 2 (tipo) y todos los pasos anteriores
        const stepClass = document.getElementById('step-classroom');
        if (stepClass) stepClass.style.display = 'none';
        const stepType = document.getElementById('step-eval-type');
        if (stepType) stepType.style.display = 'none';
        const fNew = document.getElementById('step-new-form');
        if (fNew) fNew.style.display = 'none';

        // Mostrar solo paso 5 (resumen)
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

        // Salón seleccionado
        const clsInfo = document.getElementById('summary-classroom-info');
        if (clsInfo) {
          clsInfo.textContent = `${cls.name} (${cls.students.length} alumnos)`;
          clsInfo.style.color = '#131722';
        }
        const gradeText = ClassroomData.getClassroomGrade(wizardClassroomId);
        const gradeBadge = document.getElementById('summary-grade-badge');
        if (gradeBadge) {
          if (gradeText) {
            gradeBadge.textContent = gradeText;
            gradeBadge.style.display = 'inline-block';
            gradeBadge.style.color = '#0284C7';
            gradeBadge.style.background = 'rgba(41, 182, 246, 0.15)';
            gradeBadge.style.border = '1px solid rgba(41, 182, 246, 0.35)';
            gradeBadge.style.borderRadius = '6px';
            gradeBadge.style.padding = '3px 10px';
          } else {
            gradeBadge.style.display = 'none';
          }
        }

        // Tipos y conteos para resumen - REGLA 2: Aislamiento estricto de alternativas
        const isOMR = wizardEval && wizardEval.type === 'mc';
        const isBranch3 = wizardEval && wizardEval.branch === 'rama3';
        const isBranch2 = wizardEval && wizardEval.branch === 'rama2';
        const qCount = wizardEval.questionCount || (wizardEval.questions ? wizardEval.questions.length : 1);

        // Poblar contenedor dinámico de preguntas
        const qContainer = document.getElementById('summary-questions-container');
        if (qContainer) {
          if (isBranch3) {
            // RAMA 3: Visualización de Cartilla OMR
            qContainer.innerHTML = `
              <div style="background:#F9F8F3; border:1px solid #e5e3dc; border-radius:10px; padding:10px 12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                  <strong style="color:#181512; font-size:0.75rem; font-weight:800; letter-spacing:0.03em; text-transform:uppercase;">📝 Claves de la Cartilla (${qCount} Preguntas)</strong>
                  ${(wizardEval && (wizardEval.mode === 'bank' || (typeof r3State !== 'undefined' && r3State.mode === 'bank'))) ? '' : `
                    <span style="background:#e0f7fa; color:#007791; font-size:0.7rem; font-weight:800; padding:2px 8px; border-radius:6px; border:1px solid #b2ebf2;">OMR Puro</span>
                  `}
                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(64px, 1fr)); gap:5px; max-height:160px; overflow-y:auto; padding:1px;">
                  ${(wizardEval.questions || []).map((q, idx) => `
                    <div style="background:#ffffff; border:1px solid #e5e3dc; border-radius:6px; padding:3px 6px; display:flex; align-items:center; justify-content:space-between; box-shadow:0 1px 2px rgba(24,21,18,0.03);">
                      <span style="font-size:0.7rem; color:#57534e; font-weight:700;">P${(idx + 1).toString().padStart(2, '0')}</span>
                      <span style="background:#00B4D8; color:#fff; font-size:0.72rem; font-weight:800; width:18px; height:18px; border-radius:50%; display:flex; align-items:center; justify-content:center;">${q.correct}</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            `;
          } else if (isBranch2) {
            // RAMA 2: Visualización de Focalizada (1 a 3 preguntas)
            qContainer.innerHTML = (wizardEval.questions || []).map((q, idx) => `
              <div style="background:#FAF8F2; border:1.5px solid rgba(220, 214, 202, 0.8); border-radius:10px; padding:10px 12px; margin-bottom:6px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                  <strong style="color:#0284C7; font-size:0.78rem; font-weight:800; text-transform:uppercase;">📌 Pregunta ${idx + 1}</strong>
                  ${isOMR ? `
                    <span style="background:rgba(41, 182, 246, 0.14); color:#0284C7; font-size:0.72rem; font-weight:800; padding:2px 8px; border-radius:5px; border:1px solid rgba(41, 182, 246, 0.35);">Clave: ${q.correct}</span>
                  ` : `
                    <span style="background:rgba(41, 182, 246, 0.14); color:#0284C7; font-size:0.72rem; font-weight:800; padding:2px 8px; border-radius:5px; border:1px solid rgba(41, 182, 246, 0.35);">Rpta: ${escaparHtml(q.expectedAnswer || '')}</span>
                  `}
                </div>
                <div style="font-size:0.86rem; font-weight:600; color:#181512; margin-bottom:6px; line-height:1.35;">${escaparHtml(q.prompt)}</div>
                ${isOMR && q.options ? `
                  <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; font-size:0.74rem; color:#57534E;">
                    <div style="${q.correct === 'A' ? 'color:#0284C7; font-weight:800;' : ''}"><strong>A)</strong> ${escaparHtml(q.options.A || '—')}</div>
                    <div style="${q.correct === 'B' ? 'color:#0284C7; font-weight:800;' : ''}"><strong>B)</strong> ${escaparHtml(q.options.B || '—')}</div>
                    <div style="${q.correct === 'C' ? 'color:#0284C7; font-weight:800;' : ''}"><strong>C)</strong> ${escaparHtml(q.options.C || '—')}</div>
                    <div style="${q.correct === 'D' ? 'color:#0284C7; font-weight:800;' : ''}"><strong>D)</strong> ${escaparHtml(q.options.D || '—')}</div>
                  </div>
                ` : ''}
              </div>
            `).join('');
          } else if (isOMR && wizardEval.questionCount === 2 && wizardEval.questions && wizardEval.questions.length === 2) {
            const q1 = wizardEval.questions[0];
            const q2 = wizardEval.questions[1];
            qContainer.innerHTML = `
              <div style="background:#FAF8F2; border:1.5px solid rgba(220, 214, 202, 0.8); border-radius:10px; padding:10px 12px; margin-bottom:6px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                  <strong style="color:#0284C7; font-size:0.78rem; font-weight:800; text-transform:uppercase;">📌 Pregunta 1</strong>
                  <span style="background:rgba(41, 182, 246, 0.14); color:#0284C7; font-size:0.72rem; font-weight:800; padding:2px 8px; border-radius:5px; border:1px solid rgba(41, 182, 246, 0.35);">Clave: ${q1.correct}</span>
                </div>
                <div style="font-size:0.86rem; font-weight:600; color:#181512; margin-bottom:6px; line-height:1.35;">${escaparHtml(q1.prompt)}</div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; font-size:0.74rem; color:#57534E;">
                  <div style="${q1.correct === 'A' ? 'color:#0284C7; font-weight:800;' : ''}"><strong>A)</strong> ${escaparHtml(q1.options?.A || '—')}</div>
                  <div style="${q1.correct === 'B' ? 'color:#0284C7; font-weight:800;' : ''}"><strong>B)</strong> ${escaparHtml(q1.options?.B || '—')}</div>
                  <div style="${q1.correct === 'C' ? 'color:#0284C7; font-weight:800;' : ''}"><strong>C)</strong> ${escaparHtml(q1.options?.C || '—')}</div>
                  <div style="${q1.correct === 'D' ? 'color:#0284C7; font-weight:800;' : ''}"><strong>D)</strong> ${escaparHtml(q1.options?.D || '—')}</div>
                </div>
              </div>

              <div style="background:#FAF8F2; border:1.5px solid rgba(220, 214, 202, 0.8); border-radius:10px; padding:10px 12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                  <strong style="color:#0284C7; font-size:0.78rem; font-weight:800; text-transform:uppercase;">📌 Pregunta 2</strong>
                  <span style="background:rgba(41, 182, 246, 0.14); color:#0284C7; font-size:0.72rem; font-weight:800; padding:2px 8px; border-radius:5px; border:1px solid rgba(41, 182, 246, 0.35);">Clave: ${q2.correct}</span>
                </div>
                <div style="font-size:0.86rem; font-weight:600; color:#181512; margin-bottom:6px; line-height:1.35;">${escaparHtml(q2.prompt)}</div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; font-size:0.74rem; color:#57534E;">
                  <div style="${q2.correct === 'A' ? 'color:#0284C7; font-weight:800;' : ''}"><strong>A)</strong> ${escaparHtml(q2.options?.A || '—')}</div>
                  <div style="${q2.correct === 'B' ? 'color:#0284C7; font-weight:800;' : ''}"><strong>B)</strong> ${escaparHtml(q2.options?.B || '—')}</div>
                  <div style="${q2.correct === 'C' ? 'color:#0284C7; font-weight:800;' : ''}"><strong>C)</strong> ${escaparHtml(q2.options?.C || '—')}</div>
                  <div style="${q2.correct === 'D' ? 'color:#0284C7; font-weight:800;' : ''}"><strong>D)</strong> ${escaparHtml(q2.options?.D || '—')}</div>
                </div>
              </div>
            `;
          } else if (isOMR) {
            const q = (wizardEval.questions && wizardEval.questions[0]) || wizardEval;
            const correctKey = q.correct || (wizardEval.expectedAnswer ? wizardEval.expectedAnswer.replace(/[^ABCD]/g, '') : 'A');
            const opts = q.options || wizardEval.options || {};
            qContainer.innerHTML = `
              <div style="background:#FAF8F2; border:1.5px solid rgba(220, 214, 202, 0.8); border-radius:10px; padding:10px 12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                  <strong style="color:#0284C7; font-size:0.78rem; font-weight:800; text-transform:uppercase;">📌 Pregunta</strong>
                  <span style="background:rgba(41, 182, 246, 0.14); color:#0284C7; font-size:0.72rem; font-weight:800; padding:2px 8px; border-radius:5px; border:1px solid rgba(41, 182, 246, 0.35);">Clave: ${correctKey}</span>
                </div>
                <div style="font-size:0.86rem; font-weight:600; color:#181512; margin-bottom:6px; line-height:1.35;">${escaparHtml(wizardEval.prompt)}</div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; font-size:0.74rem; color:#57534E;">
                  <div style="${correctKey === 'A' ? 'color:#0284C7; font-weight:800;' : ''}"><strong>A)</strong> ${escaparHtml(opts.A || '—')}</div>
                  <div style="${correctKey === 'B' ? 'color:#0284C7; font-weight:800;' : ''}"><strong>B)</strong> ${escaparHtml(opts.B || '—')}</div>
                  <div style="${correctKey === 'C' ? 'color:#0284C7; font-weight:800;' : ''}"><strong>C)</strong> ${escaparHtml(opts.C || '—')}</div>
                  <div style="${correctKey === 'D' ? 'color:#0284C7; font-weight:800;' : ''}"><strong>D)</strong> ${escaparHtml(opts.D || '—')}</div>
                </div>
              </div>
            `;
          } else {
            // REGLA 1: Cero regresión en Respuesta Libre
            const tiene = !!(wizardEval.rubric);
            qContainer.innerHTML = `
              <div style="margin-bottom:6px;">
                <span style="font-size:0.65rem; font-weight:700; color:#786C5E; text-transform:uppercase; letter-spacing:0.05em; display:block; margin-bottom:2px;">Consigna</span>
                <div style="font-size:0.86rem; font-weight:600; color:#181512; line-height:1.35;">${escaparHtml(wizardEval.prompt)}</div>
              </div>
              <div style="margin-bottom:6px;">
                <span style="font-size:0.65rem; font-weight:700; color:#786C5E; text-transform:uppercase; letter-spacing:0.05em; display:block; margin-bottom:2px;">Respuesta esperada</span>
                <div style="font-size:0.86rem; font-weight:800; color:#0284C7;">${escaparHtml(wizardEval.expectedAnswer)}</div>
              </div>
              <div style="padding:6px 10px; border-radius:8px; font-size:0.75rem; font-weight:700; ${tiene ? 'color:#0284C7; background:rgba(41, 182, 246, 0.14); border:1px solid rgba(41, 182, 246, 0.35);' : 'color:#92400E; background:rgba(245, 184, 46, 0.16); border:1px solid rgba(245, 184, 46, 0.40);'}">
                ${tiene ? '✅ Rúbrica lista con IA' : '⚠️ Sin rúbrica'}
              </div>
            `;
          }
        }

        // Sincronizar campos hidden de forma segura
        const elTitle = document.getElementById('input-eval-title');
        if (elTitle) elTitle.value = wizardEval.title || 'Evaluación del Día';
        const elPrompt = document.getElementById('input-eval-prompt');
        if (elPrompt) elPrompt.value = wizardEval.prompt;
        const elExpected = document.getElementById('input-eval-expected');
        if (elExpected) elExpected.value = wizardEval.expectedAnswer;
        const elUnit = document.getElementById('input-eval-unit');
        if (elUnit) elUnit.value = wizardEval.unitHint || '';
        updatePromptCounter();

        // ── ACTIVAR LA SESIÓN ──
        const session = generateAndActivateSession();
        if (session) {
          const grade = ClassroomData.getClassroomGrade(wizardClassroomId);
          if (!grade && !isOMR) {
            showToast('✅ Sesión lista. Sin grado cargado, la IA no evaluará el método.');
          }
        }

        // Configuración de corrección seleccionada (ahora mostrada arriba en el encabezado)
        const modeContainer = document.getElementById('summary-header-mode-container');
        const modeIcon = document.getElementById('summary-header-mode-icon');
        const modeTitle = document.getElementById('summary-header-mode-title');
        const modeSubtitle = document.getElementById('summary-header-mode-subtitle');
        const configBadge = document.getElementById('summary-config-badge');
        if (configBadge) configBadge.style.display = 'none';

        if (modeContainer) {
          modeContainer.style.background = 'rgba(245, 184, 46, 0.16)';
          modeContainer.style.color = '#92400E';
          modeContainer.style.border = '1px solid rgba(245, 184, 46, 0.40)';
        }

        if (isBranch3) {
          if (modeIcon) {
            modeIcon.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>';
            modeIcon.style.color = '#B45309';
          }
          if (modeTitle) {
            modeTitle.textContent = 'OMR';
            modeTitle.style.color = '#92400E';
            modeTitle.title = 'Escaneo rápido de alternativas marcadas.';
          }
          if (modeSubtitle) modeSubtitle.style.display = 'none';
        } else if (isBranch2) {
          if (modeIcon) {
            modeIcon.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
            modeIcon.style.color = '#B45309';
          }
          if (modeTitle) {
            modeTitle.textContent = 'Directa';
            modeTitle.style.color = '#92400E';
            modeTitle.title = 'Corrección directa de respuesta sin evaluar procedimiento.';
          }
          if (modeSubtitle) modeSubtitle.style.display = 'none';
        } else if (isOMR) {
          const currentMode = (session && session.correctionMode) || 'quick';
          if (currentMode === 'quick') {
            if (modeIcon) {
              modeIcon.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
              modeIcon.style.color = '#B45309';
            }
            if (modeTitle) {
              modeTitle.textContent = 'OMR Rápido';
              modeTitle.style.color = '#92400E';
              modeTitle.title = 'Rápido determinista (OMR). El procedimiento manuscrito queda fotografiado.';
            }
          } else {
            if (modeIcon) {
              modeIcon.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/><line x1="9" y1="21" x2="15" y2="21"/></svg>';
              modeIcon.style.color = '#B45309';
            }
            if (modeTitle) {
              modeTitle.textContent = 'Formativa IA';
              modeTitle.style.color = '#92400E';
              modeTitle.title = 'Evalúa las alternativas y analiza pedagógicamente el desarrollo en cuadrícula con IA.';
            }
          }
          if (modeSubtitle) modeSubtitle.style.display = 'none';
        } else {
          // Respuesta Libre tradicional
          if (modeIcon) {
            modeIcon.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>';
            modeIcon.style.color = '#B45309';
          }
          if (modeTitle) {
            modeTitle.textContent = 'Respuesta Libre';
            modeTitle.style.color = '#92400E';
            modeTitle.title = 'Lectura de cuadrícula y respuesta manuscrita evaluadas mediante IA y rúbrica formativa.';
          }
          if (modeSubtitle) modeSubtitle.style.display = 'none';
        }

        // ── Renderizar cuadernillo de preguntas si corresponde ──
        // EXCLUSIVO: Solo en Cartilla OMR (Rama 3) en Modo B (Preguntas del Banco)
        const btnBooklet = document.getElementById('btn-print-booklet');
        const bookletContainer = document.getElementById('booklet-container');
        const printRow = document.getElementById('summary-print-buttons-row');
        const hasBookletQuestions = wizardEval && (
          wizardEval.branch === 'rama3' && (wizardEval.mode === 'bank' || (typeof r3State !== 'undefined' && r3State.mode === 'bank'))
        );
        if (btnBooklet) {
          if (hasBookletQuestions && typeof renderQuestionBooklet === 'function') {
            btnBooklet.style.display = 'flex';
            if (printRow) printRow.style.gridTemplateColumns = '1fr 1fr';
            renderQuestionBooklet(wizardClassroomId, wizardEval);
            if (bookletContainer) bookletContainer.style.display = 'flex';
          } else {
            btnBooklet.style.display = 'none';
            if (printRow) printRow.style.gridTemplateColumns = '1fr';
            if (bookletContainer) bookletContainer.style.display = 'none';
          }
        }

        // ── Generar fichas / cartillas automáticamente ──
        const pagesContainer = document.getElementById('pages-container');
        if (pagesContainer) pagesContainer.style.display = 'flex';
        renderAllPrintPages(wizardClassroomId, wizardEval);
        if (typeof fitSummaryDocumentsToViewport === 'function') {
          setTimeout(fitSummaryDocumentsToViewport, 50);
        }

        // ── Estado del botón Guardar Sesión y barra de sesiones ──
        if (window.isViewingSavedSessionsMode && typeof renderSummarySessionsStrip === 'function') {
          renderSummarySessionsStrip();
        } else {
          const stripEl = document.getElementById('summary-sessions-strip');
          if (stripEl) stripEl.style.display = 'none';
          const curBranch = (wizardEval && wizardEval.branch) || window.selectedBranch || (typeof currentBranchMode !== 'undefined' ? currentBranchMode : 'rama1');
          if (typeof updateTopbarModeTitle === 'function') {
            updateTopbarModeTitle(curBranch);
          }
          const sessions = (typeof ClassroomData !== 'undefined' && ClassroomData.getSavedSessions)
            ? ClassroomData.getSavedSessions()
            : [];
          const activeSess = (typeof ClassroomData !== 'undefined') ? ClassroomData.getActiveSession() : null;
          const curId = activeSess ? activeSess.id : null;
          const curRef = (session && session.sessionRef) || (activeSess && activeSess.sessionRef) || null;
          const evalId = (wizardEval && wizardEval.id) || (session && session.evalId) || null;
          const isSaved = sessions.some(s => s.id === curId || (curRef && s.sessionRef === curRef) || (evalId && s.evalId === evalId && s.classroomId === wizardClassroomId));
          if (typeof updateDiscardOrDeleteButtonState === 'function') {
            updateDiscardOrDeleteButtonState(isSaved, curId);
          }
        }

        // ── Repoblar lo ya escaneado ──
        if (session && session.sessionRef) refreshEvaluatedFromResults(session.sessionRef);
      } catch (err) {
        console.error('[showSummary Error]', err);
        showToast('⚠️ Error al generar resumen: ' + err.message);
      }
    }

    /**
     * Alterna la visualización del panel derecho entre PDF/Cartillas y Resultados de la Sesión.
     */
    function toggleSummaryViewMode(targetMode) {
      const inlineContainer = document.getElementById('summary-inline-results-container');
      const pagesContainer = document.getElementById('pages-container');
      const bookletContainer = document.getElementById('booklet-container');
      const btnBottom = document.getElementById('btn-summary-results');

      const currentMode = window.currentSummaryViewMode || 'pdf';
      const newMode = targetMode || (currentMode === 'pdf' ? 'results' : 'pdf');
      window.currentSummaryViewMode = newMode;

      const activeSess = (typeof ClassroomData !== 'undefined') ? ClassroomData.getActiveSession() : null;
      const viewport = document.querySelector('.summary-document-viewport');

      if (newMode === 'results') {
        if (viewport) viewport.classList.add('viewing-results-mode');
        if (pagesContainer) pagesContainer.style.setProperty('display', 'none', 'important');
        if (bookletContainer) bookletContainer.style.setProperty('display', 'none', 'important');
        if (inlineContainer) {
          inlineContainer.style.display = 'flex';
          inlineContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        window.currentSummaryBottomState = 'pdf';
        if (btnBottom) {
          btnBottom.className = 'btn-summary-blue';
          btnBottom.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            <span>Mostrar PDF</span>
          `;
        }
        if (typeof loadAndRenderResultsTable === 'function') {
          loadAndRenderResultsTable();
        }
      } else {
        // Modo PDF
        if (viewport) viewport.classList.remove('viewing-results-mode');
        if (inlineContainer) inlineContainer.style.display = 'none';
        if (pagesContainer) pagesContainer.style.display = 'flex';
        if (bookletContainer && activeSess && activeSess.mode === 'bank') {
          bookletContainer.style.display = 'flex';
        }
        const count = (window.lastEvaluatedResultsCount !== undefined) ? window.lastEvaluatedResultsCount : 0;
        const total = (window.lastEvaluatedTotalStudents !== undefined) ? window.lastEvaluatedTotalStudents : 0;
        if (count > 0) {
          window.currentSummaryBottomState = 'results';
          if (btnBottom) {
            btnBottom.className = 'btn-summary-teal';
            btnBottom.innerHTML = `
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              <span>Resultados de la Sesión (${count}${total ? '/' + total : ''} evaluados)</span>
            `;
          }
        } else {
          window.currentSummaryBottomState = 'edit';
          if (btnBottom) {
            btnBottom.className = 'btn-summary-neutral';
            btnBottom.innerHTML = `
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              <span>Editar</span>
            `;
          }
        }
      }
    }
    window.toggleSummaryViewMode = toggleSummaryViewMode;

    /**
     * Manejador del botón inferior dinámico (Editar / Mostrar Resultados / Mostrar PDF)
     */
    function handleSummaryBottomAction() {
      const mode = window.currentSummaryBottomState || 'edit';
      if (mode === 'locked') {
        showToast('🔒 Esta evaluación fue compartida. Solo está habilitada para impresión y escaneo.');
        return;
      }
      if (mode === 'edit') {
        if (typeof editarEvaluacion === 'function') {
          editarEvaluacion();
        }
      } else if (mode === 'results') {
        toggleSummaryViewMode('results');
      } else if (mode === 'pdf') {
        toggleSummaryViewMode('pdf');
      }
    }
    window.handleSummaryBottomAction = handleSummaryBottomAction;

    /**
     * Sincroniza el estado del botón inferior dinámico según la cantidad de alumnos evaluados.
     */
    async function refreshEvaluatedFromResults(sessionRef) {
      const btnBottom = document.getElementById('btn-summary-results');

      if (!sessionRef) {
        if (btnBottom) {
          window.currentSummaryBottomState = 'edit';
          btnBottom.className = 'btn-summary-neutral';
          btnBottom.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            <span>Editar</span>
          `;
        }
        return;
      }

      try {
        let rows = [];
        if (typeof SupabaseClient !== 'undefined' && SupabaseClient.loadSessionResults) {
          rows = (await SupabaseClient.loadSessionResults(sessionRef)) || [];
        }
        if (typeof Scanner !== 'undefined' && Scanner.setEvaluatedStudents) {
          Scanner.setEvaluatedStudents(rows.map(r => r.student_code));
        }

        const count = rows ? rows.length : 0;
        const activeSess = (typeof ClassroomData !== 'undefined') ? ClassroomData.getActiveSession() : null;
        const classId = (activeSess && activeSess.classroomId) || wizardClassroomId;
        const cls = (typeof ClassroomData !== 'undefined' && classId) ? ClassroomData.getClassroom(classId) : null;
        const totalStudents = cls && cls.students ? cls.students.length : 0;

        window.lastEvaluatedResultsCount = count;
        window.lastEvaluatedTotalStudents = totalStudents;

        if (count > 0) {
          if (btnBottom) {
            btnBottom.disabled = false;
            btnBottom.style.opacity = '1';
            btnBottom.style.cursor = 'pointer';
            if (window.currentSummaryViewMode === 'results') {
              window.currentSummaryBottomState = 'pdf';
              btnBottom.className = 'btn-summary-blue';
              btnBottom.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                <span>Mostrar PDF</span>
              `;
            } else {
              window.currentSummaryBottomState = 'results';
              btnBottom.className = 'btn-summary-teal';
              btnBottom.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                <span>Resultados de la Sesión (${count}${totalStudents ? '/' + totalStudents : ''} evaluados)</span>
              `;
            }
          }
          console.log(`[Sesión] ${count} resultado(s) guardados. Edición bloqueada.`);
        } else {
          // 0 evaluados: si es importada se bloquea para solo escaneo; si es propia permite Editar
          if (btnBottom) {
            window.currentSummaryBottomState = 'edit';
            btnBottom.className = 'btn-summary-neutral';
            btnBottom.style.opacity = '1';
            btnBottom.innerHTML = `
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              <span>Editar</span>
            `;
          }
          if (window.currentSummaryViewMode === 'results') {
            toggleSummaryViewMode('pdf');
          }
        }
      } catch (e) {
        console.warn('[Sesión] No se pudieron leer los resultados guardados:', e && e.message);
      }
    }
    window.refreshEvaluatedFromResults = refreshEvaluatedFromResults;

    /**
     * Oculta los pasos 2, 3, 4 y 5, limpia las fichas y resetea los botones.
     */

    /**
     * Renderiza la franja superior de sesiones guardadas ([ 1 ] [ 2 ] [ 3 ] ...)
     */
    function renderSummarySessionsStrip(activeSessionId) {
      const stripEl = document.getElementById('summary-sessions-strip');
      const listEl = document.getElementById('summary-sessions-numbers-list');
      if (!stripEl || !listEl) return;

      const sessions = (typeof ClassroomData !== 'undefined' && ClassroomData.getSavedSessions)
        ? ClassroomData.getSavedSessions()
        : [];

      const activeSess = (typeof ClassroomData !== 'undefined') ? ClassroomData.getActiveSession() : null;
      const curRef = (activeSess && activeSess.sessionRef) || null;
      const evalId = (typeof wizardEval !== 'undefined' && wizardEval && wizardEval.id) || (activeSess && activeSess.evalId) || null;

      if (sessions.length === 0 || !window.isViewingSavedSessionsMode) {
        stripEl.style.display = 'none';
        listEl.innerHTML = '';
        const isCurrentSaved = sessions.some(s => s.id === activeSessionId || (curRef && s.sessionRef === curRef) || (evalId && s.evalId === evalId && s.classroomId === wizardClassroomId));
        updateDiscardOrDeleteButtonState(isCurrentSaved, activeSessionId);
        return;
      }

      stripEl.style.display = 'flex';
      listEl.innerHTML = '';

      if (window.isViewingSavedSessionsMode && typeof updateTopbarModeTitle === 'function') {
        updateTopbarModeTitle('saved-sessions');
      }

      // Determinar cuál es la sesión activa
      let currentActiveId = activeSessionId;
      if (!currentActiveId) {
        if (activeSess && activeSess.id) {
          currentActiveId = activeSess.id;
        } else if (curRef) {
          const match = sessions.find(s => s.sessionRef === curRef);
          if (match) currentActiveId = match.id;
        } else if (evalId) {
          const match = sessions.find(s => s.evalId === evalId);
          if (match) currentActiveId = match.id;
        }
      }

      sessions.forEach((s, idx) => {
        const num = idx + 1;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'session-num-btn' + (s.id === currentActiveId ? ' active' : '');
        btn.textContent = String(num);
        btn.title = `Sesión ${num}: ${s.classroomName || 'Salón'} (${s.branchTitle || 'Evaluación'})`;
        btn.onclick = () => {
          loadAndActivateSavedSession(s.id);
        };
        listEl.appendChild(btn);
      });

      const isCurrentSaved = sessions.some(s => s.id === currentActiveId || (curRef && s.sessionRef === curRef) || (evalId && s.evalId === evalId && s.classroomId === wizardClassroomId));
      updateDiscardOrDeleteButtonState(isCurrentSaved, currentActiveId);
    }
    window.renderSummarySessionsStrip = renderSummarySessionsStrip;

    /**
     * Actualiza el botón de Descartar / Eliminar según si la sesión actual está guardada o es borrador
     */
    function updateDiscardOrDeleteButtonState(isSaved, sessionId) {
      const btn = document.getElementById('btn-discard-session');
      const btnSave = document.getElementById('btn-save-session');
      if (!btn) return;

      if (isSaved) {
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg><span>Eliminar</span>`;
        btn.className = 'btn-summary-sub btn-summary-sub-delete';
        btn.title = 'Eliminar esta sesión guardada y liberar cupo';
        btn.dataset.isSaved = 'true';
        if (sessionId) btn.dataset.sessionId = sessionId;

        if (btnSave) {
          btnSave.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><polyline points="20 6 9 17 4 12"/></svg><span>Guardada</span>`;
          btnSave.style.background = '#EFECE3';
          btnSave.style.color = '#0369A1';
          btnSave.style.borderColor = 'rgba(41, 182, 246, 0.35)';
          btnSave.style.boxShadow = 'none';
          btnSave.classList.add('is-saved');
        }
      } else {
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg><span>Descartar</span>`;
        btn.className = 'btn-summary-sub btn-summary-sub-discard';
        btn.title = 'Descartar esta evaluación y volver al Inicio';
        btn.dataset.isSaved = 'false';
        delete btn.dataset.sessionId;

        if (btnSave) {
          btnSave.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg><span>Guardar</span>`;
          btnSave.style.background = '#FFFBEB';
          btnSave.style.color = '#92400E';
          btnSave.style.borderColor = '#F5B82E';
          btnSave.style.boxShadow = '0 1px 3px rgba(245, 184, 46, 0.20)';
          btnSave.classList.remove('is-saved');
        }
      }
    }
    window.updateDiscardOrDeleteButtonState = updateDiscardOrDeleteButtonState;

    /**
     * Maneja el clic en Descartar (si no está guardada) o Eliminar (si está guardada)
     */

    /**
     * Crear una nueva sesión directamente desde la barra superior de resumen
     */
    function handleCreateNewSessionFromSummary() {
      const sessions = (typeof ClassroomData !== 'undefined' && ClassroomData.getSavedSessions) ? ClassroomData.getSavedSessions() : [];
      const maxSess = (typeof ClassroomData !== 'undefined' && ClassroomData.MAX_SAVED_SESSIONS) || 8;
      if (sessions.length >= maxSess) {
        showToast(`⚠️ Ya tienes las ${maxSess} sesiones ocupadas. Elimina una para poder crear otra.`);
        return;
      }
      if (typeof openBranchFlow === 'function') {
        openBranchFlow('rama3');
      } else if (typeof openFlow === 'function') {
        openFlow('eval');
      }
    }
    window.handleCreateNewSessionFromSummary = handleCreateNewSessionFromSummary;


// Exposición global
if (typeof window !== "undefined") {
  window.editarEvaluacion = editarEvaluacion;
  window.cambiarSalon = editarEvaluacion;
  window.cambiarSalonOEvaluacion = editarEvaluacion;
  window.showSummary = showSummary;
  window.toggleSummaryViewMode = toggleSummaryViewMode;
  window.handleSummaryBottomAction = handleSummaryBottomAction;
  window.refreshEvaluatedFromResults = refreshEvaluatedFromResults;
  window.renderSummarySessionsStrip = renderSummarySessionsStrip;
  window.updateDiscardOrDeleteButtonState = updateDiscardOrDeleteButtonState;
  window.handleCreateNewSessionFromSummary = handleCreateNewSessionFromSummary;
}
