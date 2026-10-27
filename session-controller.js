// =============================================================================
// session-controller.js — Microevaluación v3.10.28
// MÓDULO PRINCIPAL: CONTROLADOR DE SESIÓN ACTIVA Y ENLACE AL ESCÁNER
//
// Submódulos auxiliares vinculados:
//   - session-saved-manager.js : Guardado, modal y borrado en 3 niveles (Regla 8)
//   - session-summary-view.js  : Pantalla de resumen, hojas imprimibles y nómina
//
// Guardarraíles activos:
//   Regla 1  – Cero regresión Respuesta Libre: flujo original intacto.
//   Regla 2  – Aislamiento Total de Alternativas: type === "mc" exclusivo.
//   Regla 7  – Modo de Corrección: quick (OMR local) vs full (IA).
//   Regla 8  – Coherencia Total del Borrado de Resultados (Anti-Desincronización).
// =============================================================================

    function updateClassroomSelectDisplay(sel) {
      if (!sel) sel = document.getElementById('builder-classroom');
      if (!sel) return;
      const idx = sel.selectedIndex;
      if (idx > 0 && sel.options[idx]) {
        const opt = sel.options[idx];
        if (opt.dataset && opt.dataset.name) {
          opt.textContent = opt.dataset.name;
        }
      }
    }
    if (typeof window !== 'undefined') window.updateClassroomSelectDisplay = updateClassroomSelectDisplay;

    function restoreClassroomSelectOptions(sel) {
      if (!sel) sel = document.getElementById('builder-classroom');
      if (!sel) return;
      for (let i = 0; i < sel.options.length; i++) {
        const opt = sel.options[i];
        if (opt.dataset && opt.dataset.fullLabel) {
          opt.textContent = opt.dataset.fullLabel;
        }
      }
    }
    if (typeof window !== 'undefined') window.restoreClassroomSelectOptions = restoreClassroomSelectOptions;

    function renderClassroomSelect() {
      const sel = document.getElementById('builder-classroom');
      if (!sel) return;
      sel.innerHTML = '<option value="">— Elige un salón —</option>';
      ClassroomData.getClassroomList().forEach(cls => {
        const fullCls = (typeof ClassroomData !== 'undefined' && ClassroomData.getClassroom)
          ? ClassroomData.getClassroom(cls.id)
          : null;
        const stage = fullCls?.gradeStage || cls.gradeStage;
        const level = fullCls?.gradeLevel || cls.gradeLevel;
        let metaPart = `${cls.count} alum`;
        if (level) {
          const numMatch = String(level).match(/\d+/);
          const num = numMatch ? numMatch[0] : level;
          const stageShort = (stage && String(stage).toLowerCase().includes('sec')) ? 'sec' : 'pri';
          metaPart += ` | ${num}° ${stageShort}`;
        }
        const fullLabel = `${cls.name}  [${metaPart}]`;
        const opt = document.createElement('option');
        opt.value = cls.id;
        opt.textContent = fullLabel;
        opt.dataset.name = cls.name;
        opt.dataset.fullLabel = fullLabel;
        sel.appendChild(opt);
      });
      // Restaurar selección si hay sesión activa
      const session = ClassroomData.getActiveSession();
      if (session && session.classroomId) {
        sel.value = session.classroomId;
        updateClassroomSelectDisplay(sel);
      }

      // El selector de grado depende del salón elegido
      renderGradeSelect(sel.value || null);
      updateClassroomActionsVisibility(sel.value || null);
    }

    function onClassroomSelectChanged(classId) {
      const bSel = document.getElementById('builder-classroom');
      if (bSel && bSel.disabled && classId) return;
      if (typeof window !== 'undefined' && window.EvaluationHologram) {
        window.EvaluationHologram.onClassroomChanged();
      }
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
        if (typeof restoreClassroomSelectOptions === 'function') restoreClassroomSelectOptions(bSel);
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

      // Contraer visualmente la opción seleccionada a solo el nombre del salón
      if (typeof updateClassroomSelectDisplay === 'function') updateClassroomSelectDisplay(bSel);
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

      // Con grado: muestra cantidad de alumnos y grado debajo del selector, sin textos explicativos redundantes.
      sel.value = cls.gradeStage + ':' + cls.gradeLevel;
      sel.style.display = 'none';
      if (readonly) readonly.style.display = 'flex';
      const studentCount = (cls && cls.students) ? cls.students.length : (cls && cls.count ? cls.count : 0);
      const countLabel = studentCount === 1 ? '1 alumno' : `${studentCount} alumnos`;
      if (readValue) readValue.textContent = grade ? `${countLabel} • ${grade}` : countLabel;
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
      if (sel) {
        sel.value = session.classroomId;
        if (typeof updateClassroomSelectDisplay === 'function') updateClassroomSelectDisplay(sel);
      }
      renderGradeSelect(session.classroomId);

      const badge = document.getElementById('nav-students-badge');
      if (badge) badge.textContent = cls.students.length + ' Alumnos';

      showSummary();
      updateClassroomActionsVisibility(session.classroomId);
      console.log('[Sesión] Restaurada:', session.sessionRef || session.evalId);
    }


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
      let session = null;
      try {
        const currentActive = (typeof ClassroomData !== 'undefined' && ClassroomData.getActiveSession) ? ClassroomData.getActiveSession() : null;
        const branch = (currentActive && currentActive.branch) || window.selectedBranch || (wizardEval && wizardEval.branch) || 'rama1';
        const isFormativa = (branch === 'rama1') || (currentActive && currentActive.branchTitle && currentActive.branchTitle.toLowerCase().includes('formativa')) || (currentActive && currentActive.correctionMode === 'ai');
        const sessId = (currentActive && (currentActive.id || currentActive.sessionId || currentActive.sessionRef)) || 'formativa_pending';

        if (isFormativa && typeof DailyQuota !== 'undefined' && !DailyQuota.canConsume('formativeSessions', sessId)) {
          showToast('⚠️ Límite de 2 sesiones formativas con IA alcanzado por hoy.');
          alert('⚠️ Límite Diario de Formativa con IA Alcanzado:\n\nHas utilizado tus 2 sesiones formativas completas de IA el día de hoy.\n\nPara continuar evaluando, te recomendamos utilizar la modalidad Cartilla OMR o Focalizada en la Respuesta, las cuales son 100% locales, ultrarrápidas y no consumen cuota de IA.');
          return;
        }

        // Al ir al escáner, se abandona el modo de exploración de sesiones guardadas
        window.isViewingSavedSessionsMode = false;
        const stripEl = document.getElementById('summary-sessions-strip');
        if (stripEl) stripEl.style.display = 'none';

        // 1. Asegurar que la sesión esté generada y activada
        session = currentActive || generateAndActivateSession();
        if (!session) return;

        // Sincronizar en el escáner inmediatamente
        if (typeof Scanner !== 'undefined' && Scanner.setSession && session.classroomId && session.evalId) {
          Scanner.setSession(session.classroomId, session.evalId);
        }
        if (typeof updateScannerSessionBar === 'function') {
          updateScannerSessionBar(session);
        }

        // Actualizar barra superior a la modalidad de la evaluación (no 'saved-sessions')
        if (typeof updateTopbarModeTitle === 'function') {
          updateTopbarModeTitle(session.branch || window.selectedBranch || 'rama1');
        }

        // 2. Auto-guardar la sesión automáticamente
        if (typeof ClassroomData !== 'undefined' && ClassroomData.saveSession) {
          const classId = session.classroomId;
          const cls = ClassroomData.getClassroom(classId);
          const grade = ClassroomData.getClassroomGrade(classId);
          const branch = session.branch || (wizardEval && wizardEval.branch) || 'rama1';
          let branchTitle = session.branchTitle || 'Formativa con IA';
          if (branch === 'rama3') {
            const isBank = (wizardEval && wizardEval.mode === 'bank') || (typeof r3State !== 'undefined' && r3State && r3State.mode === 'bank');
            branchTitle = isBank ? 'Cartilla OMR (Evaluación y Cartillas)' : 'Cartilla OMR (Solo Cartilla)';
          } else if (branch === 'rama2') {
            branchTitle = 'Focalizada en la Respuesta';
          }

          const sessionPayload = {
            id: session.id || (session.sessionRef ? 'sess_' + session.sessionRef.replace(/[^a-zA-Z0-9_-]/g, '_') : ('sess_' + Date.now())),
            evalId: session.evalId || (wizardEval && wizardEval.id) || '',
            sessionRef: session.sessionRef || '',
            savedAt: session.savedAt || new Date().toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }),
            timestamp: session.timestamp || Date.now(),
            classroomId: classId,
            classroomName: cls ? cls.name : classId,
            gradeText: (grade && (typeof grade === 'string' ? grade : grade.texto)) || (wizardEval && wizardEval.gradeText) || session.gradeText || '',
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
            r3State: (typeof r3State !== 'undefined' && r3State) ? JSON.parse(JSON.stringify(r3State)) : (session.r3State ? JSON.parse(JSON.stringify(session.r3State)) : null),
            wizardEval: wizardEval ? JSON.parse(JSON.stringify(wizardEval)) : JSON.parse(JSON.stringify(session))
          };

          const clsCheck = ClassroomData.getClassroom(sessionPayload.classroomId);
          if (clsCheck && clsCheck.students && clsCheck.students.length > 0) {
            const res = ClassroomData.saveSession(sessionPayload);
            if (res && res.success) {
              const btnSave = document.getElementById('btn-save-session');
              if (btnSave) {
                btnSave.style.background = '#EFECE3';
                btnSave.style.color = '#0369A1';
                btnSave.style.borderColor = 'rgba(41, 182, 246, 0.35)';
                btnSave.style.boxShadow = 'none';
                btnSave.classList.add('is-saved');
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
        }
      } catch (err) {
        console.warn('[goToScannerWithSession] Error en auto-guardado:', err);
      }

      // Registrar sesión formativa si aplica
      if (session) {
        const isFormativaSess = (session.branch === 'rama1') || (session.branchTitle && session.branchTitle.toLowerCase().includes('formativa')) || (session.correctionMode === 'ai' || (!session.branch && session.rubric && session.type !== 'mc'));
        if (isFormativaSess && typeof DailyQuota !== 'undefined') {
          DailyQuota.consume('formativeSessions', session.id || session.sessionId || session.sessionRef || 'formativa_active');
        }
      }

      // 3. Cambiar a la pestaña de escáner
      switchTab('scan');
    }
    window.goToScannerWithSession = goToScannerWithSession;

    // ── Helpers de auth UI & Menú de Usuario ──

// Exposición global
if (typeof window !== "undefined") {
  window.updateClassroomSelectDisplay = updateClassroomSelectDisplay;
  window.restoreClassroomSelectOptions = restoreClassroomSelectOptions;
  window.renderClassroomSelect = renderClassroomSelect;
  window.onClassroomSelectChanged = onClassroomSelectChanged;
  window.llenarSelectorDeGrado = llenarSelectorDeGrado;
  window.renderGradeSelect = renderGradeSelect;
  window.mostrarSelectorDeGrado = mostrarSelectorDeGrado;
  window.onGradeChanged = onGradeChanged;
  window.syncUnifiedAnswer = syncUnifiedAnswer;
  window.hideWizardSteps = hideWizardSteps;
  window.resetWizard = resetWizard;
  window.restoreActiveSession = restoreActiveSession;
  window.generateAndActivateSession = generateAndActivateSession;
  window.updateScannerSessionBar = updateScannerSessionBar;
  window.updateCorrectionModeUI = updateCorrectionModeUI;
  window.goToScannerWithSession = goToScannerWithSession;
}
