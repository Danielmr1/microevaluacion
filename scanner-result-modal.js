/**
 * scanner-result-modal.js
 * Módulo periférico: Gestión del modal de resultado post-captura,
 * cola asíncrona de IA en segundo plano y persistencia en Supabase.
 *
 * Guardarraíles aplicados:
 * - Regla 1: Cero Regresión en Respuesta Libre.
 * - Regla 7: Aislamiento total de alternativas (OMR) en Modo Rápido (cero llamadas de IA).
 * - Regla 8: Coherencia en actualización de nómina y persistencia.
 * - Regla 9: Cero bloqueo de cámara y fallback silencioso si falla la red o timeout de IA.
 */
(function (global) {
  'use strict';

  function setLastOMRInfo(val) {
    lastOMRInfo = val;
  }

  function getLastOMRInfo() {
    return lastOMRInfo;
  }

  function getCurrentClassroomId() {
    if (typeof Scanner !== 'undefined' && Scanner.getCurrentClassroomId) {
      return Scanner.getCurrentClassroomId();
    }
    return '3A';
  }

  function getCurrentEvaluationId() {
    if (typeof Scanner !== 'undefined' && Scanner.getCurrentEvaluationId) {
      return Scanner.getCurrentEvaluationId();
    }
    return 'EVA_01';
  }

  // Se guarda la captura AUNQUE todavía no exista corrección con IA: el
  // veredicto se agrega después con un upsert sobre la MISMA fila (la clave es
  // session_ref + student_code). Así, si la IA falla, no hay red o el docente
  // cierra la app, la clase igual quedó registrada y se puede recompletar.
  //
  // No se guardan imágenes: solo el resultado. Las rutas (answer_image_path /
  // grid_image_path) quedan en NULL; activarlas es subir los recortes a
  // Supabase Storage y completar esos dos campos, sin cambiar el esquema.
  //
  let lastOMRInfo = null;

  function updateModalWithAIResult(studentId, evalData, isMC) {
    const idEl = document.getElementById('res-student-id');
    if (!idEl || !idEl.textContent.includes(studentId)) return;
    const cleanData = (evalData && evalData.data) ? evalData.data : evalData;
    if (!cleanData) return;

    if (!isMC) {
      const hwStatus = document.getElementById('hw-ai-status');
      if (hwStatus) {
        hwStatus.style.display = 'block';
        const isOk = cleanData.verdict === 'CORRECTO' || cleanData.score >= 3.5;
        const color = isOk ? '#4ade80' : (cleanData.score > 0 ? '#f59e0b' : '#f87171');
        const badge = isOk ? '✅ CORRECTO' : (cleanData.score > 0 ? '⚠️ PARCIAL' : '❌ INCORRECTO');
        hwStatus.innerHTML = `
          <div style="background:#0f172a; border:1px solid ${color}; border-radius:6px; padding:6px 10px; margin-top:6px;">
            <div style="display:flex; justify-content:space-between; align-items:center; font-weight:800; font-size:0.75rem; color:${color};">
              <span>🤖 IA leyó: "${cleanData.answer_read || '—'}"</span>
              <span>${badge} (${cleanData.score || 0}/4 pts)</span>
            </div>
            ${cleanData.feedback ? `<div style="font-size:0.7rem; color:#cbd5e1; margin-top:3px; line-height:1.3;">${cleanData.feedback}</div>` : ''}
          </div>
        `;
      }
    } else {
      const omrStatus = document.getElementById('omr-proc-status');
      if (omrStatus) {
        omrStatus.style.display = 'block';
        const valid = cleanData.procedure_valid;
        const color = valid ? '#a855f7' : '#f59e0b';
        omrStatus.innerHTML = `
          <div style="background:#1e1035; border:1px solid ${color}; border-radius:6px; padding:6px 10px; margin-top:6px; font-size:0.74rem;">
            <strong style="color:${color};">🔬 Análisis de Procedimiento IA:</strong>
            <span style="color:#e9d5ff; margin-left:4px;">${valid ? '✅ Procedimiento en cuadrícula respalda la respuesta.' : '⚠️ No se identificó procedimiento que respalde el resultado.'}</span>
            ${cleanData.feedback ? `<div style="font-size:0.69rem; color:#d8b4fe; margin-top:3px;">${cleanData.feedback}</div>` : ''}
          </div>
        `;
      }
    }
  }

  // Cola secuencial en segundo plano para evitar saturar el ancho de banda del celular
  const aiGradingQueue = [];
  let isProcessingAIQueue = false;

  function enqueueAIGrading(context) {
    aiGradingQueue.push(context);
    processAIGradingQueue();
  }

  async function processAIGradingQueue() {
    if (isProcessingAIQueue || aiGradingQueue.length === 0) return;
    isProcessingAIQueue = true;

    while (aiGradingQueue.length > 0) {
      const item = aiGradingQueue.shift();
      try {
        await executeGradeSheetCall(item);
      } catch (err) {
        console.warn('[AI Queue] Error procesando evaluación en cola:', err);
      }
    }

    isProcessingAIQueue = false;
  }

  async function executeGradeSheetCall(context) {
    const currentClassroomId = context.currentClassroomId || getCurrentClassroomId();
    const currentEvaluationId = context.currentEvaluationId || getCurrentEvaluationId();
    const { studentId, studentName, session, cls, activeEval, isUuid, isMC, info, images, aiRawBase, answerRead, isMatch, verdict } = context;

    const imgAnswer = images?.answerImage || null;
    const imgGrid = images?.gridImage || null;

    if (!imgAnswer && !imgGrid) {
      console.warn('[GradeSheet] No hay imágenes de la ficha para evaluar.');
      try {
        await SupabaseClient.saveResult({
          session_ref: session.sessionRef,
          classroom_id: isUuid ? currentClassroomId : null,
          student_code: studentId,
          student_name: studentName,
          grade_stage: cls ? cls.gradeStage : null,
          grade_level: cls ? cls.gradeLevel : null,
          evaluation_ref: currentEvaluationId,
          evaluation_title: session.title || null,
          prompt: session.prompt || (activeEval ? activeEval.prompt : null),
          expected_answer: session.expectedAnswer || (activeEval ? activeEval.expectedAnswer : null),
          ai_answer_read: answerRead,
          ai_expected_match: isMatch,
          deterministic_match: isMatch,
          teacher_verdict: verdict,
          ai_raw: Object.assign({}, aiRawBase || {}, {
            pendingAI: false,
            aiError: 'no_image',
            errorDetail: 'No se obtuvo imagen de la cuadrícula'
          }),
          captured_at: new Date().toISOString()
        });
      } catch (e) {}
      return;
    }

    const payload = {
      type: isMC ? 'mc' : 'free',
      prompt: session.prompt || (activeEval ? activeEval.prompt : ''),
      expectedAnswer: session.expectedAnswer || (activeEval ? activeEval.expectedAnswer : ''),
      rubric: activeEval?.rubric || session?.rubric || null,
      answerImage: imgAnswer,
      gridImage: imgGrid,
      strokeAnalysis: images?.strokeInfo || null,
      omrSelected: info?.results ? info.results.map(r => `P${r.qIndex}: ${r.marked}`).join(', ') : null,
      omrMatch: info ? info.allCorrect : null
    };

    // Margen holgado de 60 segundos en segundo plano (Regla 9: Cero Bloqueo de Cámara)
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout de 60s excedido en llamada IA')), 60000)
    );

    try {
      const res = await Promise.race([
        SupabaseClient.gradeSheet(payload),
        timeoutPromise
      ]);

      if (!res || !res.ok || !res.data) {
        throw new Error(res?.error || 'Respuesta no válida del servicio de IA');
      }

      // Desempaquetar datos en caso de envoltura { ok: true, data: { ... } }
      const evalData = (res.data && res.data.data) ? res.data.data : res.data;
      console.log('[GradeSheet] Resultado IA recibido para', studentId, evalData);

      const isMatchAI = isMC
        ? (info ? info.allCorrect : false)
        : (evalData.score >= 3.5 || evalData.verdict === 'CORRECTO');

      const updatedVerdict = isMC
        ? (info && info.allCorrect ? 'CORRECTA' : 'INCORRECTA')
        : (evalData.verdict || (isMatchAI ? 'CORRECTA' : 'INCORRECTA'));

      const updatedRaw = Object.assign({}, aiRawBase || {}, {
        aiGrading: evalData,
        gridImage: imgGrid,
        pendingAI: false,
        aiError: null,
        gradedAt: new Date().toISOString()
      });

      // Actualizar registro en Supabase con los datos analizados
      await SupabaseClient.saveResult({
        session_ref: session.sessionRef,
        classroom_id: isUuid ? currentClassroomId : null,
        student_code: studentId,
        student_name: studentName,
        grade_stage: cls ? cls.gradeStage : null,
        grade_level: cls ? cls.gradeLevel : null,
        evaluation_ref: currentEvaluationId,
        evaluation_title: session.title || null,
        prompt: session.prompt || (activeEval ? activeEval.prompt : null),
        expected_answer: session.expectedAnswer || (activeEval ? activeEval.expectedAnswer : null),
        grid_image_path: imgGrid,
        answer_image_path: imgAnswer,
        ai_answer_read: isMC ? answerRead : (evalData.answer_read || 'Leído por IA'),
        ai_expected_match: isMatchAI,
        deterministic_match: isMC ? (info ? info.allCorrect : false) : isMatchAI,
        ai_procedure: evalData.procedure_valid ? 'correcto' : 'incorrecto',
        ai_error_type: evalData.error_detectado || 'ninguno',
        ai_teacher_feedback: evalData.feedback || null,
        teacher_verdict: updatedVerdict,
        ai_raw: updatedRaw,
        captured_at: new Date().toISOString()
      });

      // Refrescar modal de resultados si está abierto
      if (typeof loadAndRenderResultsTable === 'function') {
        const resultsModal = document.getElementById('results-modal');
        if (resultsModal && resultsModal.style.display !== 'none') {
          loadAndRenderResultsTable();
        }
      }
      // Actualizar distintivo visual en el modal de captura si el docente sigue ahí
      updateModalWithAIResult(studentId, evalData, isMC);

    } catch (err) {
      console.warn('[GradeSheet] Error en llamada IA:', err?.message || err);

      const isOffline = (typeof navigator !== 'undefined' && !navigator.onLine);
      const isTimeout = err?.message && err.message.includes('Timeout');
      const errType = isOffline ? 'offline' : (isTimeout ? 'timeout' : 'ai_error');

      const updatedRaw = Object.assign({}, aiRawBase || {}, {
        pendingAI: true,
        gridImage: imgGrid,
        aiError: errType,
        errorDetail: err?.message || 'Error en análisis IA'
      });

      try {
        await SupabaseClient.saveResult({
          session_ref: session.sessionRef,
          classroom_id: isUuid ? currentClassroomId : null,
          student_code: studentId,
          student_name: studentName,
          grade_stage: cls ? cls.gradeStage : null,
          grade_level: cls ? cls.gradeLevel : null,
          evaluation_ref: currentEvaluationId,
          evaluation_title: session.title || null,
          prompt: session.prompt || (activeEval ? activeEval.prompt : null),
          expected_answer: session.expectedAnswer || (activeEval ? activeEval.expectedAnswer : null),
          grid_image_path: imgGrid,
          answer_image_path: imgAnswer,
          ai_answer_read: answerRead,
          ai_expected_match: isMatch,
          deterministic_match: isMatch,
          teacher_verdict: verdict,
          ai_raw: updatedRaw,
          captured_at: new Date().toISOString()
        });

        if (typeof loadAndRenderResultsTable === 'function') {
          const resultsModal = document.getElementById('results-modal');
          if (resultsModal && resultsModal.style.display !== 'none') {
            loadAndRenderResultsTable();
          }
        }
      } catch (saveErr) {}
    }
  }

  function persistCapture(studentId, studentName, omrInfo = null, images = null) {
    const currentClassroomId = getCurrentClassroomId();
    const currentEvaluationId = getCurrentEvaluationId();
    if (typeof SupabaseClient === 'undefined' || !SupabaseClient.saveResult) return;
    if (typeof ClassroomData === 'undefined') return;

    if (!studentId || studentId === 'MANUAL') return;

    let session = ClassroomData.getActiveSession();
    if (!session || !session.sessionRef) {
      const classId = currentClassroomId || '3A';
      const evalId = currentEvaluationId || 'EVA_01';
      session = {
        sessionRef: `${classId}::${evalId}`,
        classroomId: classId,
        evalId: evalId,
        title: 'Evaluación del Día'
      };
    }

    const cls = ClassroomData.getClassroom(currentClassroomId);
    const activeEval = ClassroomData.getEvaluation(currentEvaluationId) || session;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(currentClassroomId);

    let answerRead = null;
    let isMatch = null;
    let verdict = null;
    let aiRaw = null;

    const info = omrInfo || lastOMRInfo;
    const correctionMode = session.correctionMode || (session.type === 'mc' ? 'quick' : 'rubric');
    const isMC = (session.type === 'mc' || (activeEval && activeEval.type === 'mc'));

    if (info && info.results && info.results.length > 0) {
      const correctCount = info.results.filter(r => r.correct).length;
      const totalQ = info.results.length;
      const grade20 = Math.round((correctCount / totalQ) * 20);

      answerRead = info.results.map(r => `P${r.qIndex}: ${r.marked}`).join(' | ');
      isMatch = info.allCorrect;
      verdict = info.allCorrect ? 'CORRECTA' : 'INCORRECTA';
      aiRaw = {
        omrResults: info.results,
        correctionMode: correctionMode,
        correctCount: correctCount,
        totalQuestions: totalQ,
        grade20: grade20,
        branch: session.branch || (activeEval && activeEval.branch) || (totalQ > 3 ? 'rama3' : 'rama2'),
        pendingAI: (correctionMode === 'full')
      };
    } else {
      answerRead = 'Pendiente de análisis IA';
      verdict = 'PENDIENTE';
      aiRaw = {
        pendingAI: true,
        correctionMode: 'rubric'
      };
    }

    const imgAnswer = images?.answerImage || null;
    const imgGrid = images?.gridImage || null;
    if (aiRaw && imgGrid) {
      aiRaw.gridImage = imgGrid;
    }
    if (aiRaw && images?.strokeInfo) {
      aiRaw.strokeAnalysis = images.strokeInfo;
    }

    // 1. Guardado determinista inmediato en Supabase (cero latencia)
    SupabaseClient.saveResult({
      session_ref: session.sessionRef,
      classroom_id: isUuid ? currentClassroomId : null,
      student_code: studentId,
      student_name: studentName,
      grade_stage: cls ? cls.gradeStage : null,
      grade_level: cls ? cls.gradeLevel : null,
      evaluation_ref: currentEvaluationId,
      evaluation_title: session.title || null,
      prompt: session.prompt || (activeEval ? activeEval.prompt : null),
      expected_answer: session.expectedAnswer || (activeEval ? activeEval.expectedAnswer : null),
      grid_image_path: imgGrid,
      answer_image_path: imgAnswer,
      ai_answer_read: answerRead,
      ai_expected_match: isMatch,
      deterministic_match: isMatch,
      teacher_verdict: verdict,
      ai_raw: aiRaw,
      captured_at: new Date().toISOString()
    }).then(row => {
      if (row) console.log('[Resultados] Captura guardada en Supabase con imagen:', studentId, verdict);
      if (typeof refreshEvaluatedFromResults === 'function' && session.sessionRef) {
        refreshEvaluatedFromResults(session.sessionRef);
      }
    }).catch(e => {
      console.warn('[Resultados] No se pudo guardar la captura:', e && e.message);
    });

    // 2. Comprobar si requiere análisis de IA en segundo plano
    // Regla 7: Si es MC y quick -> TERMINANTEMENTE PROHIBIDO llamar a IA
    if (isMC && correctionMode === 'quick') {
      return;
    }

    // Regla 9: Análisis en cola de segundo plano sin congelar la cámara
    enqueueAIGrading({
      studentId,
      studentName,
      session,
      cls,
      activeEval,
      isUuid,
      isMC,
      info,
      images,
      aiRawBase: aiRaw,
      answerRead,
      isMatch,
      verdict
    });
  }


  // Exportar al ámbito global y namespace dedicado
  global.ScannerResultModal = {
    updateModalWithAIResult,
    enqueueAIGrading,
    processAIGradingQueue,
    executeGradeSheetCall,
    persistCapture,
    setLastOMRInfo,
    getLastOMRInfo
  };

  global.updateModalWithAIResult = updateModalWithAIResult;
  global.enqueueAIGrading = enqueueAIGrading;
  global.persistCapture = persistCapture;

})(typeof window !== 'undefined' ? window : this);
