// =============================================================================
// session-controller.js — Microevaluación A5 v3.2.61
// MÓDULO: GESTIÓN DE SESIONES, SALONES, GRADOS Y RESUMEN EVALUATIVO
// =============================================================================
    function renderClassroomSelect() {
      const sel = document.getElementById('builder-classroom');
      if (!sel) return;
      sel.innerHTML = '<option value="">— Elige un salón —</option>';
      ClassroomData.getClassroomList().forEach(cls => {
        const opt = document.createElement('option');
        opt.value = cls.id;
        opt.textContent = `${cls.name}  (${cls.count} alumnos)`;
        sel.appendChild(opt);
      });
      // Restaurar selección si hay sesión activa
      const session = ClassroomData.getActiveSession();
      if (session && session.classroomId) sel.value = session.classroomId;

      // El selector de grado depende del salón elegido
      renderGradeSelect(sel.value || null);
      updateClassroomActionsVisibility(sel.value || null);
    }

    function onClassroomSelectChanged(classId) {
      if (!classId) {
        wizardClassroomId = null;
        wizardEval = null;
        wizardEvalType = null;
        const pages = document.getElementById('pages-container');
        if (pages) {
          pages.innerHTML = '';
          pages.style.display = 'none';
        }

        const badge = document.getElementById('nav-students-badge');
        if (badge) badge.textContent = '0 Alumnos';

        const sel = document.getElementById('builder-classroom');
        if (sel) {
          sel.style.borderColor = '';
          sel.style.color = '';
        }

        hideWizardSteps();
        renderGradeSelect(null);
        updateClassroomActionsVisibility(null);
        return;
      }
      wizardClassroomId = classId;
      wizardEval = null;
      wizardEvalType = null;
      const pages = document.getElementById('pages-container');
      if (pages) {
        pages.innerHTML = '';
        pages.style.display = 'none';
      }

      // Actualizar badge de alumnos en la tab bar
      const cls = ClassroomData.getClassroom(classId);
      if (cls) {
        const badge = document.getElementById('nav-students-badge');
        badge.textContent = `${cls.students.length} Alumnos`;
      }

      // Colorear el selector con el color del salón
      const color = ClassroomData.getClassroomColor(classId);
      const sel = document.getElementById('builder-classroom');
      if (sel) {
        sel.style.borderColor = color;
        sel.style.color = color;
      }

      // Mostrar paso 2 (preguntas según la modalidad elegida)
      const stepType = document.getElementById('step-eval-type');
      if (stepType) stepType.style.display = 'block';
      const branchToActivate = window.selectedBranch || (typeof currentBranchMode !== 'undefined' ? currentBranchMode : 'rama1');
      if (typeof selectBranchMode === 'function') selectBranchMode(branchToActivate);

      const stepSumm = document.getElementById('step-summary');
      if (stepSumm) stepSumm.style.display = 'none';

      // Reflejar el grado del salón elegido
      renderGradeSelect(classId);

      // Ocultar acciones de salón (importar / crear a mano / plantilla) al seleccionar un salón
      updateClassroomActionsVisibility(classId);
    }

    /* ── GRADO DEL SALÓN ──────────────────────────────────────────────
       El grado se elige al CREAR el salón (formulario de alta, que es el único
       camino de creación) y NO se puede cambiar después. El motivo es que cada
       rúbrica se genera tomando el grado como contexto: si el grado cambiara,
       todas las rúbricas ya hechas para ese salón quedarían apuntando a otro
       criterio, y la corrección juzgaría con una regla que ya no es la del
       grado que se muestra.
       Acá abajo, entonces, el grado solo se MUESTRA. El selector aparece en un
       único caso: un salón al que le falta el grado porque se creó antes de que
       fuera obligatorio.

       Las opciones se arman desde ClassroomData.getGradeStages(), así que
       habilitar secundaria más adelante es agregar números al catálogo de
       classroom-data.js. Acá no se toca nada.
       Hoy el catálogo habilita 4°, 5° y 6° de primaria. */

    /** Arma las opciones del selector de grado una sola vez. */
    function llenarSelectorDeGrado() {
      const sel = document.getElementById('builder-grade');
      if (!sel || sel.dataset.lleno === '1') return;

      sel.innerHTML = '<option value="">Sin especificar</option>';
      ClassroomData.getGradeStages().forEach(stage => {
        const group = document.createElement('optgroup');
        group.label = stage.label;
        stage.grades.forEach(level => {
          const opt = document.createElement('option');
          opt.value = stage.stage + ':' + level;
          opt.textContent = level + '° de ' + stage.label.toLowerCase();
          group.appendChild(opt);
        });
        sel.appendChild(group);
      });
      sel.dataset.lleno = '1';
    }

    /**
     * Muestra el grado del salón elegido. Como texto si ya lo tiene —y en ese
     * caso NO hay forma de cambiarlo—, o con el selector desplegado si le falta,
     * que es el único caso en que se puede elegir desde acá.
     */
    function renderGradeSelect(classroomId) {
      const sel = document.getElementById('builder-grade');
      const block = document.getElementById('grade-block');
      const readonly = document.getElementById('grade-readonly');
      const readValue = document.getElementById('grade-value');
      const hint = document.getElementById('grade-hint');
      if (!sel || !block) return;

      if (!classroomId) {
        block.style.display = 'none';
        if (readonly) readonly.style.display = 'none';
        if (readValue) readValue.textContent = '';
        if (hint) { hint.textContent = ''; hint.style.display = 'none'; }
        return;
      }

      llenarSelectorDeGrado();
      const cls = ClassroomData.getClassroom(classroomId);
      const grade = ClassroomData.getClassroomGrade(classroomId);
      block.style.display = 'block';

      if (!grade) {
        // Único caso en que se elige acá: salón creado antes de que el grado
        // fuera obligatorio.
        sel.value = '';
        mostrarSelectorDeGrado('⚠️ A este salón le falta el grado. Completalo: define qué procedimiento de resolución se considera correcto.');
        return;
      }

      // Con grado: solo se muestra el grado debajo del selector, sin textos explicativos ni etiquetas redundantes.
      sel.value = cls.gradeStage + ':' + cls.gradeLevel;
      sel.style.display = 'none';
      if (readonly) readonly.style.display = 'flex';
      if (readValue) readValue.textContent = grade;
      if (hint) {
        hint.textContent = '';
        hint.style.display = 'none';
      }
    }

    /** Despliega el selector SOLO para completar un salón al que le falta el grado. */
    function mostrarSelectorDeGrado(motivo) {
      const sel = document.getElementById('builder-grade');
      const readonly = document.getElementById('grade-readonly');
      const hint = document.getElementById('grade-hint');
      if (sel) { sel.style.display = 'block'; sel.disabled = false; }
      if (readonly) readonly.style.display = 'none';
      if (hint) {
        hint.textContent = motivo || 'Completa el grado: define qué procedimiento de resolución se considera correcto.';
        hint.style.display = 'block';
        hint.style.color = '#f59e0b';
      }
    }

    /* Guarda el grado: primero en memoria (respuesta instantánea) y después en
       Supabase. Si la migración de grade_stage todavía no se aplicó, el guardado
       en la base avisa por consola y el grado sigue vivo durante la sesión: el
       asistente nunca se bloquea por esto. */
    async function onGradeChanged(value) {
      const classroomId = wizardClassroomId
        || (document.getElementById('builder-classroom') || {}).value;
      if (!classroomId) return;

      let stage = null, level = null;
      if (value) {
        const parts = value.split(':');
        stage = parts[0];
        level = parseInt(parts[1], 10) || null;
      }

      ClassroomData.setClassroomGrade(classroomId, stage, level);
      // Al guardar se vuelve a la vista de solo lectura, con el grado nuevo a
      // la vista: así el selector no queda desplegado después de elegir.
      renderGradeSelect(classroomId);

      const saved = await SupabaseClient.updateClassroomGrade(classroomId, stage, level);
      if (saved) {
        showToast(stage ? '✅ Grado guardado: ' + ClassroomData.formatGrade(stage, level) : 'Grado borrado');
      } else if (stage) {
        showToast('⚠️ Grado solo en esta sesión (falta aplicar la migración SQL)');
      }
    }

    function syncUnifiedAnswer() {
      const rad = document.querySelector('input[name="eval-unified-correct"]:checked');
      const val = rad ? rad.value : 'A';
      const optA = document.getElementById('input-opt-a')?.value || '';
      const optB = document.getElementById('input-opt-b')?.value || '';
      const optC = document.getElementById('input-opt-c')?.value || '';
      const optD = document.getElementById('input-opt-d')?.value || '';
      const map = { A: optA, B: optB, C: optC, D: optD };
      const selectedText = (map[val] || '').trim();

      const elExpected = document.getElementById('input-eval-expected');
      if (elExpected) {
        elExpected.value = wizardEvalType === 'mc1' ? `Clave: ${val}` : selectedText;
      }
    }

    // [question-bank.js] BANCO DE PREGUNTAS + RÚBRICA IA + EVALUACIONES extraído en Tanda 4 (v3.1.31)

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
          clsInfo.style.color = color;
        }
        const gradeText = ClassroomData.getClassroomGrade(wizardClassroomId);
        const gradeBadge = document.getElementById('summary-grade-badge');
        if (gradeBadge) {
          if (gradeText) {
            gradeBadge.textContent = gradeText;
            gradeBadge.style.display = 'inline-block';
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
              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                  <strong style="color:#0f172a; font-size:0.75rem; font-weight:800; letter-spacing:0.03em; text-transform:uppercase;">📝 Claves de la Cartilla (${qCount} Preguntas)</strong>
                  ${(wizardEval && (wizardEval.mode === 'bank' || (typeof r3State !== 'undefined' && r3State.mode === 'bank'))) ? '' : `
                    <span style="background:#e0f2fe; color:#0284c7; font-size:0.7rem; font-weight:800; padding:2px 8px; border-radius:6px; border:1px solid #bae6fd;">OMR Puro</span>
                  `}
                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(64px, 1fr)); gap:5px; max-height:160px; overflow-y:auto; padding:1px;">
                  ${(wizardEval.questions || []).map((q, idx) => `
                    <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; padding:3px 6px; display:flex; align-items:center; justify-content:space-between; box-shadow:0 1px 2px rgba(0,0,0,0.03);">
                      <span style="font-size:0.7rem; color:#64748b; font-weight:700;">P${(idx + 1).toString().padStart(2, '0')}</span>
                      <span style="background:#2563eb; color:#fff; font-size:0.72rem; font-weight:800; width:18px; height:18px; border-radius:50%; display:flex; align-items:center; justify-content:center;">${q.correct}</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            `;
          } else if (isBranch2) {
            // RAMA 2: Visualización de Focalizada (1 a 3 preguntas)
            qContainer.innerHTML = (wizardEval.questions || []).map((q, idx) => `
              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px; margin-bottom:6px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                  <strong style="color:#047857; font-size:0.78rem; text-transform:uppercase;">📌 Pregunta ${idx + 1}</strong>
                  ${isOMR ? `
                    <span style="background:#dcfce7; color:#15803d; font-size:0.72rem; font-weight:800; padding:2px 8px; border-radius:4px; border:1px solid #86efac;">Clave: ${q.correct}</span>
                  ` : `
                    <span style="background:#dcfce7; color:#15803d; font-size:0.72rem; font-weight:800; padding:2px 8px; border-radius:4px; border:1px solid #86efac;">Rpta: ${escaparHtml(q.expectedAnswer || '')}</span>
                  `}
                </div>
                <div style="font-size:0.86rem; font-weight:600; color:#1e293b; margin-bottom:6px; line-height:1.35;">${escaparHtml(q.prompt)}</div>
                ${isOMR && q.options ? `
                  <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; font-size:0.74rem; color:#475569;">
                    <div style="${q.correct === 'A' ? 'color:#15803d; font-weight:800;' : ''}"><strong>A)</strong> ${escaparHtml(q.options.A || '—')}</div>
                    <div style="${q.correct === 'B' ? 'color:#15803d; font-weight:800;' : ''}"><strong>B)</strong> ${escaparHtml(q.options.B || '—')}</div>
                    <div style="${q.correct === 'C' ? 'color:#15803d; font-weight:800;' : ''}"><strong>C)</strong> ${escaparHtml(q.options.C || '—')}</div>
                    <div style="${q.correct === 'D' ? 'color:#15803d; font-weight:800;' : ''}"><strong>D)</strong> ${escaparHtml(q.options.D || '—')}</div>
                  </div>
                ` : ''}
              </div>
            `).join('');
          } else if (isOMR && wizardEval.questionCount === 2 && wizardEval.questions && wizardEval.questions.length === 2) {
            const q1 = wizardEval.questions[0];
            const q2 = wizardEval.questions[1];
            qContainer.innerHTML = `
              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px; margin-bottom:6px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                  <strong style="color:#0284c7; font-size:0.78rem; text-transform:uppercase;">📌 Pregunta 1</strong>
                  <span style="background:#dcfce7; color:#15803d; font-size:0.72rem; font-weight:800; padding:2px 8px; border-radius:4px; border:1px solid #86efac;">Clave: ${q1.correct}</span>
                </div>
                <div style="font-size:0.86rem; font-weight:600; color:#1e293b; margin-bottom:6px; line-height:1.35;">${escaparHtml(q1.prompt)}</div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; font-size:0.74rem; color:#475569;">
                  <div style="${q1.correct === 'A' ? 'color:#15803d; font-weight:800;' : ''}"><strong>A)</strong> ${escaparHtml(q1.options?.A || '—')}</div>
                  <div style="${q1.correct === 'B' ? 'color:#15803d; font-weight:800;' : ''}"><strong>B)</strong> ${escaparHtml(q1.options?.B || '—')}</div>
                  <div style="${q1.correct === 'C' ? 'color:#15803d; font-weight:800;' : ''}"><strong>C)</strong> ${escaparHtml(q1.options?.C || '—')}</div>
                  <div style="${q1.correct === 'D' ? 'color:#15803d; font-weight:800;' : ''}"><strong>D)</strong> ${escaparHtml(q1.options?.D || '—')}</div>
                </div>
              </div>

              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                  <strong style="color:#6366f1; font-size:0.78rem; text-transform:uppercase;">📌 Pregunta 2</strong>
                  <span style="background:#dcfce7; color:#15803d; font-size:0.72rem; font-weight:800; padding:2px 8px; border-radius:4px; border:1px solid #86efac;">Clave: ${q2.correct}</span>
                </div>
                <div style="font-size:0.86rem; font-weight:600; color:#1e293b; margin-bottom:6px; line-height:1.35;">${escaparHtml(q2.prompt)}</div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; font-size:0.74rem; color:#475569;">
                  <div style="${q2.correct === 'A' ? 'color:#15803d; font-weight:800;' : ''}"><strong>A)</strong> ${escaparHtml(q2.options?.A || '—')}</div>
                  <div style="${q2.correct === 'B' ? 'color:#15803d; font-weight:800;' : ''}"><strong>B)</strong> ${escaparHtml(q2.options?.B || '—')}</div>
                  <div style="${q2.correct === 'C' ? 'color:#15803d; font-weight:800;' : ''}"><strong>C)</strong> ${escaparHtml(q2.options?.C || '—')}</div>
                  <div style="${q2.correct === 'D' ? 'color:#15803d; font-weight:800;' : ''}"><strong>D)</strong> ${escaparHtml(q2.options?.D || '—')}</div>
                </div>
              </div>
            `;
          } else if (isOMR) {
            const q = (wizardEval.questions && wizardEval.questions[0]) || wizardEval;
            const correctKey = q.correct || (wizardEval.expectedAnswer ? wizardEval.expectedAnswer.replace(/[^ABCD]/g, '') : 'A');
            const opts = q.options || wizardEval.options || {};
            qContainer.innerHTML = `
              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                  <strong style="color:#0284c7; font-size:0.78rem; text-transform:uppercase;">📌 Pregunta</strong>
                  <span style="background:#dcfce7; color:#15803d; font-size:0.72rem; font-weight:800; padding:2px 8px; border-radius:4px; border:1px solid #86efac;">Clave: ${correctKey}</span>
                </div>
                <div style="font-size:0.86rem; font-weight:600; color:#1e293b; margin-bottom:6px; line-height:1.35;">${escaparHtml(wizardEval.prompt)}</div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; font-size:0.74rem; color:#475569;">
                  <div style="${correctKey === 'A' ? 'color:#15803d; font-weight:800;' : ''}"><strong>A)</strong> ${escaparHtml(opts.A || '—')}</div>
                  <div style="${correctKey === 'B' ? 'color:#15803d; font-weight:800;' : ''}"><strong>B)</strong> ${escaparHtml(opts.B || '—')}</div>
                  <div style="${correctKey === 'C' ? 'color:#15803d; font-weight:800;' : ''}"><strong>C)</strong> ${escaparHtml(opts.C || '—')}</div>
                  <div style="${correctKey === 'D' ? 'color:#15803d; font-weight:800;' : ''}"><strong>D)</strong> ${escaparHtml(opts.D || '—')}</div>
                </div>
              </div>
            `;
          } else {
            // REGLA 1: Cero regresión en Respuesta Libre
            const tiene = !!(wizardEval.rubric);
            qContainer.innerHTML = `
              <div style="margin-bottom:6px;">
                <span style="font-size:0.65rem; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.05em; display:block; margin-bottom:2px;">Consigna</span>
                <div style="font-size:0.86rem; font-weight:600; color:#1e293b; line-height:1.35;">${escaparHtml(wizardEval.prompt)}</div>
              </div>
              <div style="margin-bottom:6px;">
                <span style="font-size:0.65rem; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.05em; display:block; margin-bottom:2px;">Respuesta esperada</span>
                <div style="font-size:0.86rem; font-weight:800; color:#15803d;">${escaparHtml(wizardEval.expectedAnswer)}</div>
              </div>
              <div style="padding:6px 10px; border-radius:8px; font-size:0.75rem; font-weight:700; ${tiene ? 'color:#15803d; background:#dcfce7; border:1px solid #86efac;' : 'color:#b45309; background:#fef3c7; border:1px solid #fcd34d;'}">
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
        const modeIcon = document.getElementById('summary-header-mode-icon');
        const modeTitle = document.getElementById('summary-header-mode-title');
        const modeSubtitle = document.getElementById('summary-header-mode-subtitle');
        const configBadge = document.getElementById('summary-config-badge');
        if (configBadge) configBadge.style.display = 'none';

        if (isBranch3) {
          if (modeIcon) modeIcon.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>';
          if (modeTitle) {
            modeTitle.textContent = 'OMR';
            modeTitle.style.color = '#0284c7';
            modeTitle.title = 'Escaneo rápido de alternativas marcadas.';
          }
          if (modeSubtitle) modeSubtitle.style.display = 'none';
        } else if (isBranch2) {
          if (modeIcon) modeIcon.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
          if (modeTitle) {
            modeTitle.textContent = 'Directa';
            modeTitle.style.color = '#059669';
            modeTitle.title = 'Corrección directa de respuesta sin evaluar procedimiento.';
          }
          if (modeSubtitle) modeSubtitle.style.display = 'none';
        } else if (isOMR) {
          const currentMode = (session && session.correctionMode) || 'quick';
          if (currentMode === 'quick') {
            if (modeIcon) modeIcon.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
            if (modeTitle) {
              modeTitle.textContent = 'OMR Rápido';
              modeTitle.style.color = '#0284c7';
              modeTitle.title = 'Rápido determinista (OMR). El procedimiento manuscrito queda fotografiado.';
            }
          } else {
            if (modeIcon) modeIcon.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/><line x1="9" y1="21" x2="15" y2="21"/></svg>';
            if (modeTitle) {
              modeTitle.textContent = 'Formativa IA';
              modeTitle.style.color = '#4f46e5';
              modeTitle.title = 'Evalúa las alternativas y analiza pedagógicamente el desarrollo en cuadrícula con IA.';
            }
          }
          if (modeSubtitle) modeSubtitle.style.display = 'none';
        } else {
          // Respuesta Libre tradicional
          if (modeIcon) modeIcon.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>';
          if (modeTitle) {
            modeTitle.textContent = 'Respuesta Libre';
            modeTitle.style.color = '#059669';
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

      if (newMode === 'results') {
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
          // 0 evaluados: se mantiene en Editar
          if (btnBottom) {
            window.currentSummaryBottomState = 'edit';
            btnBottom.className = 'btn-summary-neutral';
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
    function hideWizardSteps() {
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
      const stepClass = document.getElementById('step-classroom');
      if (stepClass) stepClass.style.display = 'block';
      const stepType = document.getElementById('step-eval-type');
      if (stepType) stepType.style.display = wizardClassroomId ? 'block' : 'none';
      const fNew = document.getElementById('step-new-form');
      if (fNew) fNew.style.display = 'none';
      const stepSummary = document.getElementById('step-summary');
      const teacherPanelEl = stepSummary ? stepSummary.closest('.teacher-panel') : null;
      const viewCreateEl = document.getElementById('view-create');
      if (teacherPanelEl) teacherPanelEl.classList.remove('has-active-split');
      if (viewCreateEl) viewCreateEl.classList.remove('has-active-split');
      document.body.classList.remove('has-active-split');
      if (stepSummary) {
        stepSummary.classList.remove('active-split');
        stepSummary.style.display = 'none';
      }
      const branchToKeep = window.selectedBranch || (typeof currentBranchMode !== 'undefined' ? currentBranchMode : 'rama1');
      if (typeof selectBranchMode === 'function') selectBranchMode(branchToKeep);
    }

    /**
     * Vuelve al paso 2 y descarta la sesión activa.
     */
    function resetWizard() {
      window.isViewingSavedSessionsMode = false;
      wizardEval = null;
      wizardEvalType = null;
      resetRubrica();
      ClassroomData.setActiveSession(null);
      const stepClass = document.getElementById('step-classroom');
      if (stepClass) stepClass.style.display = 'block';
      hideWizardSteps();
      const sel = document.getElementById('builder-classroom');
      updateClassroomActionsVisibility(sel ? sel.value : null);
      if (typeof updateHubSessionBadge === 'function') updateHubSessionBadge();

      const btnResults = document.getElementById('btn-summary-results');
      if (btnResults) {
        window.currentSummaryBottomState = 'edit';
        btnResults.className = 'btn-summary-neutral';
        btnResults.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          <span>Editar</span>
        `;
      }
    }

    /**
     * Reconstruye el asistente a partir de la sesión guardada.
     */
    function restoreActiveSession(session) {
      if (!session || !session.classroomId) return;

      const cls = ClassroomData.getClassroom(session.classroomId);
      if (!cls) {
        console.warn('[Sesión] Apunta a un salón inexistente, se descarta:', session.classroomId);
        ClassroomData.setActiveSession(null);
        return;
      }

      const isOMR = session.type === 'mc';
      const qCount = session.questionCount || (session.questions ? session.questions.length : 1);
      wizardEvalType = isOMR ? (qCount === 2 ? 'mc2' : 'mc1') : 'free';

      const evalObj = ClassroomData.saveCustomEvaluation({
        id: session.evalId,
        branch: session.branch || (session.type === 'mc' ? (qCount > 2 ? 'rama3' : 'rama1') : 'rama1'),
        withGrid: session.withGrid !== undefined ? session.withGrid : true,
        title: session.title || (isOMR ? 'Evaluación (Alternativas)' : 'Evaluación del Día'),
        prompt: session.prompt || '',
        expectedAnswer: session.expectedAnswer || '',
        unitHint: session.unitHint || '',
        type: isOMR ? 'mc' : 'free',
        questionCount: session.questionCount || 1,
        questions: session.questions || []
      }, { skipCloudSync: true });

      wizardClassroomId = session.classroomId;
      wizardEval = evalObj;

      window.selectedBranch = evalObj.branch || 'rama1';
      if (typeof currentBranchMode !== 'undefined') currentBranchMode = evalObj.branch || 'rama1';

      if (evalObj.branch === 'rama3' && typeof r3State !== 'undefined') {
        if (session.r3State) {
          Object.assign(r3State, JSON.parse(JSON.stringify(session.r3State)));
        } else {
          r3State.count = Math.min(Math.max(qCount, 5), 20);
          const hasExamQuestions = (Array.isArray(session.questions) && session.questions.some(q => q && q.prompt && !/^Pregunta\s+\d+$/i.test(q.prompt.trim()) && !q.prompt.startsWith('[Pregunta'))) ||
            (session.r3State && Array.isArray(session.r3State.bankQuestions) && session.r3State.bankQuestions.some(q => q && q.prompt && !/^Pregunta\s+\d+$/i.test(q.prompt.trim())));
          const isBankMode = session.mode === 'bank' || (session.r3State && session.r3State.mode === 'bank') || evalObj.hasQuestionnaire === true || hasExamQuestions;
          r3State.mode = isBankMode ? 'bank' : 'keys';

          if (Array.isArray(session.questions)) {
            session.questions.forEach((q, idx) => {
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
          }
        }
      } else if (typeof simState !== 'undefined') {
        simState.branch = evalObj.branch || 'rama1';
        const maxQ = (evalObj.branch === 'rama2') ? 5 : 2;
        simState.count = Math.min(Math.max(1, qCount), maxQ);
        simState.type = isOMR ? 'mc' : 'free';
        simState.withGrid = (session.withGrid !== undefined) ? !!session.withGrid : (evalObj.branch === 'rama1');
        if (typeof session.gridStage === 'number') simState.gridStage = session.gridStage;
        if (session.cardFormat) simState.cardFormat = session.cardFormat;
        if (session.cardOrientation) simState.orientation = session.cardOrientation;
        if (Array.isArray(session.questions)) {
          session.questions.forEach((q, idx) => {
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
        }
      }

      const sel = document.getElementById('builder-classroom');
      if (sel) sel.value = session.classroomId;
      renderGradeSelect(session.classroomId);

      const badge = document.getElementById('nav-students-badge');
      if (badge) badge.textContent = cls.students.length + ' Alumnos';

      showSummary();
      updateClassroomActionsVisibility(session.classroomId);
      console.log('[Sesión] Restaurada:', session.sessionRef || session.evalId);
    }

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
          btnSave.style.background = '#059669';
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
          btnSave.style.background = '#059669';
          btnSave.style.color = '#ffffff';
          btnSave.style.borderColor = '#047857';
        }
      } else {
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg><span>Descartar</span>`;
        btn.className = 'btn-summary-sub btn-summary-sub-discard';
        btn.title = 'Descartar esta evaluación y volver al Inicio';
        btn.dataset.isSaved = 'false';
        delete btn.dataset.sessionId;

        if (btnSave) {
          btnSave.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg><span>Guardar</span>`;
          btnSave.style.background = '';
          btnSave.style.color = '';
          btnSave.style.borderColor = '';
        }
      }
    }
    window.updateDiscardOrDeleteButtonState = updateDiscardOrDeleteButtonState;

    /**
     * Maneja el clic en Descartar (si no está guardada) o Eliminar (si está guardada)
     */
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
    function generateAndActivateSession() {
      // Lee del estado del wizard (campos hidden sincronizados por showSummary o wizardEval directo)
      const classId = wizardClassroomId || (document.getElementById('builder-classroom') ? document.getElementById('builder-classroom').value : '');
      const prompt = (wizardEval && wizardEval.prompt) || (document.getElementById('input-eval-prompt') ? document.getElementById('input-eval-prompt').value : '').trim();
      const expectedAnswer = (wizardEval && wizardEval.expectedAnswer) || (document.getElementById('input-eval-expected') ? document.getElementById('input-eval-expected').value : '').trim();
      const title = (wizardEval && wizardEval.title) || (document.getElementById('input-eval-title') ? document.getElementById('input-eval-title').value : '').trim() || 'Evaluación del Día';

      if (!classId || !prompt || !expectedAnswer) {
        showToast('⚠️ Completa el salón, el enunciado y la respuesta esperada primero.');
        return null;
      }

      const clsCheck = ClassroomData.getClassroom(classId);
      if (!clsCheck || !clsCheck.students || clsCheck.students.length === 0) {
        showToast('⚠️ No se puede activar una sesión para un salón sin alumnos.');
        return null;
      }

      // 1. Guardar en el banco local del docente. Se REUTILIZA el id de la
      //    evaluación en curso cuando existe
      const g = gradoDelSalon(classId);
      const isBranchR2orR3 = wizardEval && (wizardEval.branch === 'rama2' || wizardEval.branch === 'rama3');
      const qCount = (wizardEval && wizardEval.questionCount) || undefined;
      const cardFormat = (wizardEval && wizardEval.cardFormat) || (wizardEval && wizardEval.branch === 'rama3' && (qCount || 10) <= 10 ? 'a6' : (wizardEval && wizardEval.cardOrientation === 'vertical' ? 'a5_vertical' : 'a5'));
      const cardOrientation = (wizardEval && wizardEval.cardOrientation) || (wizardEval && wizardEval.branch === 'rama3' && qCount > 10 ? 'vertical' : 'horizontal');

      const savedEval = ClassroomData.saveCustomEvaluation({
        id: (wizardEval && wizardEval.id) || undefined,
        branch: (wizardEval && wizardEval.branch) || 'rama1',
        withGrid: (wizardEval && wizardEval.withGrid !== undefined) ? wizardEval.withGrid : true,
        title: title,
        prompt: prompt,
        expectedAnswer: expectedAnswer,
        unitHint: '',
        type: (wizardEval && wizardEval.type) || undefined,
        questionCount: qCount,
        questions: (wizardEval && wizardEval.questions) || undefined,
        cardFormat: cardFormat,
        cardOrientation: cardOrientation,
        gradeStage: (wizardEval && wizardEval.gradeStage) || (g && g.stage) || undefined,
        gradeLevel: (wizardEval && wizardEval.gradeLevel) || (g && g.level) || undefined,
        gradeText: (wizardEval && wizardEval.gradeText) || (g && g.texto) || undefined
      });

      // Modo de corrección para opciones múltiples (rápido vs completo)
      const mcRadio = document.querySelector('input[name="mc-correction-mode"]:checked');
      const correctionMode = isBranchR2orR3
        ? 'quick'
        : ((savedEval.type === 'mc')
            ? (mcRadio ? mcRadio.value : 'quick')
            : 'rubric');

      // 2. Sesión activa
      const session = {
        sessionRef: classId + '::' + savedEval.id,
        classroomId: classId,
        evalId: savedEval.id,
        branch: savedEval.branch || 'rama1',
        withGrid: savedEval.withGrid !== undefined ? savedEval.withGrid : true,
        title: title,
        prompt: prompt,
        expectedAnswer: expectedAnswer,
        unitHint: '',
        type: (savedEval.type === 'mc') ? 'mc' : 'free',
        questionCount: savedEval.questionCount || 1,
        questions: savedEval.questions || [],
        cardFormat: cardFormat,
        cardOrientation: cardOrientation,
        correctionMode: correctionMode,
        mode: (wizardEval && wizardEval.mode) || ((typeof r3State !== 'undefined') ? r3State.mode : undefined),
        gridStage: (wizardEval && wizardEval.gridStage !== undefined) ? wizardEval.gridStage : ((typeof simState !== 'undefined') ? simState.gridStage : 0),
        r3State: (typeof r3State !== 'undefined' && r3State) ? JSON.parse(JSON.stringify(r3State)) : null,
        timestamp: Date.now()
      };
      ClassroomData.setActiveSession(session);

      // 4. Sincronizar el escáner (las fichas ya las renderizó showSummary)
      if (typeof Scanner !== 'undefined' && Scanner.setSession) Scanner.setSession(classId, savedEval.id);
      updateScannerSessionBar(session);

      return session;
    }

    function updateScannerSessionBar(session) {
      const color = ClassroomData.getClassroomColor(session.classroomId);
      const clsEl = document.getElementById('scan-active-classroom');
      if (clsEl) {
        const cls = ClassroomData.getClassroom(session.classroomId);
        clsEl.textContent = cls ? cls.name : session.classroomId;
        clsEl.style.color = color;
        clsEl.style.borderColor = color;
        clsEl.style.background = color + '18';
      }
      const barEl = document.querySelector('.session-bar');
      if (barEl) barEl.style.borderLeft = `4px solid ${color}`;
      const targetEl = document.getElementById('scan-active-target');
      if (targetEl) targetEl.textContent = session.expectedAnswer;
    }

    function updateCorrectionModeUI(mode) {
      const rad = document.querySelector(`input[name="mc-correction-mode"][value="${mode}"]`);
      if (rad) rad.checked = true;

      const lblQuick = document.getElementById('lbl-mode-quick');
      const lblFull = document.getElementById('lbl-mode-full');
      if (lblQuick && lblFull) {
        if (mode === 'quick') {
          lblQuick.style.border = '2px solid #38bdf8';
          lblFull.style.border = '1px solid #475569';
        } else {
          lblQuick.style.border = '1px solid #475569';
          lblFull.style.border = '2px solid #a855f7';
        }
      }
      const session = ClassroomData.getActiveSession();
      if (session && session.type === 'mc') {
        session.correctionMode = mode;
        ClassroomData.setActiveSession(session);
      }
    }


    function goToScannerWithSession() {
      try {
        // 1. Asegurar que la sesión esté generada y activada
        const session = generateAndActivateSession();
        if (!session) return;

        // 2. Auto-guardar la sesión automáticamente
        if (typeof ClassroomData !== 'undefined' && ClassroomData.saveSession) {
          const classId = session.classroomId;
          const cls = ClassroomData.getClassroom(classId);
          const grade = ClassroomData.getClassroomGrade(classId);
          const branch = session.branch || (wizardEval && wizardEval.branch) || 'rama1';
          let branchTitle = 'Formativa con IA';
          if (branch === 'rama3') {
            const isBank = (wizardEval && wizardEval.mode === 'bank') || (typeof r3State !== 'undefined' && r3State && r3State.mode === 'bank');
            branchTitle = isBank ? 'Cartilla OMR (Evaluación y Cartillas)' : 'Cartilla OMR (Solo Cartilla)';
          } else if (branch === 'rama2') {
            branchTitle = 'Focalizada en la Respuesta';
          }

          const sessionPayload = {
            id: session.sessionRef ? 'sess_' + session.sessionRef.replace(/[^a-zA-Z0-9_-]/g, '_') : ('sess_' + Date.now()),
            evalId: session.evalId || (wizardEval && wizardEval.id) || '',
            sessionRef: session.sessionRef || '',
            savedAt: new Date().toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }),
            timestamp: Date.now(),
            classroomId: classId,
            classroomName: cls ? cls.name : classId,
            gradeText: (grade && (typeof grade === 'string' ? grade : grade.texto)) || (wizardEval && wizardEval.gradeText) || '',
            branch: branch,
            branchTitle: branchTitle,
            type: session.type || 'free',
            questionCount: session.questionCount || 1,
            questions: session.questions ? JSON.parse(JSON.stringify(session.questions)) : [],
            title: session.title || 'Evaluación del Día',
            prompt: session.prompt || '',
            expectedAnswer: session.expectedAnswer || '',
            cardFormat: session.cardFormat || (branch === 'rama3' && session.questionCount <= 10 ? 'a6' : 'a5'),
            cardOrientation: session.cardOrientation || 'horizontal',
            withGrid: session.withGrid !== undefined ? session.withGrid : true,
            gridSize: session.gridSize || 'normal',
            correctionMode: session.correctionMode || 'quick',
            mode: (wizardEval && wizardEval.mode) || session.mode || ((typeof r3State !== 'undefined') ? r3State.mode : undefined),
            r3State: (typeof r3State !== 'undefined' && r3State) ? JSON.parse(JSON.stringify(r3State)) : null,
            wizardEval: wizardEval ? JSON.parse(JSON.stringify(wizardEval)) : JSON.parse(JSON.stringify(session))
          };

          const clsCheck = ClassroomData.getClassroom(sessionPayload.classroomId);
        if (!clsCheck || !clsCheck.students || clsCheck.students.length === 0) {
          showToast('⚠️ No se puede guardar una sesión de un salón sin alumnos.');
          return;
        }

        const res = ClassroomData.saveSession(sessionPayload);
          if (res && res.success) {
            const btnSave = document.getElementById('btn-save-session');
            if (btnSave) {
              btnSave.style.background = '#059669';
              const maxSess = res.max || (typeof ClassroomData !== 'undefined' && ClassroomData.MAX_SAVED_SESSIONS) || 8;
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
          }
        }
      } catch (err) {
        console.warn('[goToScannerWithSession] Error en auto-guardado:', err);
      }

      // 3. Cambiar a la pestaña de escáner
      switchTab('scan');
    }
    window.goToScannerWithSession = goToScannerWithSession;

    // ── Helpers de auth UI & Menú de Usuario ──