/**
 * Módulo de Banco de Preguntas, Rúbricas y Nube
 * Microevaluación Formativa de Clase A5
 *
 * Funcionalidad:
 * 1. Almacén de evaluaciones en memoria y sincronización con localStorage y Supabase.
 * 2. Guardarraíl estricto de límite de 50 preguntas (Regla 17) y cálculo de cupo.
 * 3. Enriquecimiento de alternativas, rúbricas de IA y cola de sincronización offline.
 */

(function (global) {
  'use strict';

  const ClassroomData = global.ClassroomData = global.ClassroomData || {};

  const EVALUATIONS = ClassroomData.EVALUATIONS = ClassroomData.EVALUATIONS || {};
  const SESSION_EVALUATIONS = ClassroomData.SESSION_EVALUATIONS = ClassroomData.SESSION_EVALUATIONS || {};

  const STORAGE_KEY_BANK = 'microeval_teacher_bank_v2';
  const STORAGE_KEY_BANK_VIEJO = 'microeval_teacher_bank_v1';
  const STORAGE_KEY_SYNC_QUEUE = 'microeval_sync_queue';
  const STORAGE_KEY_SYNC_QUEUE_LEGACY = 'microeval_pending_sync_v1';
  const STORAGE_KEY_DELETED_PROMPTS = 'microeval_deleted_prompts_v1';
  const MAX_BANK_QUESTIONS = 50;

  // Acceso referencial a utilidades y sesiones compartidas
  function formatGrade(stage, level) {
    return ClassroomData.formatGrade ? ClassroomData.formatGrade(stage, level) : (stage ? `${stage} ${level || ''}`.trim() : null);
  }
  function getActiveSession() {
    return ClassroomData.getActiveSession ? ClassroomData.getActiveSession() : null;
  }
  function getSavedSessions() {
    return ClassroomData.getSavedSessions ? ClassroomData.getSavedSessions() : [];
  }

  function getDeletedPrompts() {
    if (typeof window === 'undefined' || !window.localStorage) return new Set();
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY_DELETED_PROMPTS);
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr : []);
    } catch (e) {
      return new Set();
    }
  }

  function markPromptAsDeleted(promptOrId) {
    if (!promptOrId || typeof window === 'undefined' || !window.localStorage) return;
    try {
      const set = getDeletedPrompts();
      set.add(String(promptOrId).trim());
      const arr = Array.from(set).slice(-200);
      window.localStorage.setItem(STORAGE_KEY_DELETED_PROMPTS, JSON.stringify(arr));
    } catch (e) {}
  }

  function unmarkPromptAsDeleted(prompt) {
    if (!prompt || typeof window === 'undefined' || !window.localStorage) return;
    try {
      const set = getDeletedPrompts();
      const p = String(prompt).trim();
      if (set.has(p)) {
        set.delete(p);
        window.localStorage.setItem(STORAGE_KEY_DELETED_PROMPTS, JSON.stringify(Array.from(set)));
      }
    } catch (e) {}
  }

  /**
   * Cuenta el total de preguntas legítimas registradas en el banco (todos los grados),
   * excluyendo casilleros ficticios de cartilla OMR (Rama 3).
   */
  function countTotalBankQuestions() {
    const seen = new Set();
    let count = 0;
    Object.values(EVALUATIONS).forEach(ev => {
      if (!ev || !ev.prompt) return;
      if (ev.branch === 'rama3' || (ev.id && String(ev.id).startsWith('eval_r3_'))) return;
      const rootPrompt = String(ev.prompt || '').trim();
      if (/^Pregunta\s+\d+$/i.test(rootPrompt) || rootPrompt.startsWith('Cartilla de respuestas')) return;

      if (Array.isArray(ev.questions) && ev.questions.length > 0) {
        ev.questions.forEach(q => {
          if (!q || !q.prompt) return;
          const p = String(q.prompt).trim();
          if (/^Pregunta\s+\d+$/i.test(p) || p.startsWith('Cartilla de respuestas')) return;
          if (!seen.has(p)) {
            seen.add(p);
            count++;
          }
        });
      } else {
        if (!seen.has(rootPrompt)) {
          seen.add(rootPrompt);
          count++;
        }
      }
    });
    return count;
  }

  function queueForSync(item) {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY_SYNC_QUEUE) || window.localStorage.getItem(STORAGE_KEY_SYNC_QUEUE_LEGACY);
      const queue = raw ? JSON.parse(raw) : [];
      if (!queue.some(q => q.prompt === item.prompt)) {
        queue.push(item);
        window.localStorage.setItem(STORAGE_KEY_SYNC_QUEUE, JSON.stringify(queue));
      }
    } catch (e) {}
  }

  function flushSyncQueue() {
    if (typeof window === 'undefined' || !window.SupabaseClient || typeof window.SupabaseClient.saveEvaluation !== 'function') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY_SYNC_QUEUE) || window.localStorage.getItem(STORAGE_KEY_SYNC_QUEUE_LEGACY);
      if (!raw) return;
      const queue = JSON.parse(raw);
      if (!Array.isArray(queue) || queue.length === 0) return;

      const remaining = [];
      const promises = queue.map(item => {
        return window.SupabaseClient.saveEvaluation(item)
          .then(res => {
            if (!res) {
              remaining.push(item);
            }
          })
          .catch(err => {
            console.warn('[Guardrail Sync] Reintento fallido para:', item.prompt, err && err.message);
            remaining.push(item);
          });
      });

      Promise.allSettled(promises).then(() => {
        if (remaining.length > 0) {
          window.localStorage.setItem(STORAGE_KEY_SYNC_QUEUE, JSON.stringify(remaining));
        } else {
          window.localStorage.removeItem(STORAGE_KEY_SYNC_QUEUE);
          try { window.localStorage.removeItem(STORAGE_KEY_SYNC_QUEUE_LEGACY); } catch (e) {}
          console.log('[Guardrail Sync] Todas las preguntas pendientes se sincronizaron con Supabase.');
        }
      });
    } catch (e) {}
  }

  function syncAllLocalToCloud() {
    if (typeof window === 'undefined' || !window.SupabaseClient || typeof window.SupabaseClient.saveEvaluation !== 'function') return;
    flushSyncQueue();
    const deleted = getDeletedPrompts();
    Object.values(EVALUATIONS).forEach(ev => {
      if (!ev || !ev.prompt) return;
      const p = String(ev.prompt).trim();
      if (deleted.has(p) || (ev.id && deleted.has(ev.id))) return;
      if (ev.branch === 'rama3' || (ev.id && String(ev.id).startsWith('eval_r3_')) ||
          /^Pregunta\s+\d+$/i.test(p) || p.startsWith('Cartilla de respuestas')) {
        return;
      }
      syncToCloudGuardrail(ev);
    });
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      flushSyncQueue();
      syncAllLocalToCloud();
    });
  }

  function syncToCloudGuardrail(evalObj) {
    if (!evalObj || !evalObj.prompt) return;
    const promptLimpio = String(evalObj.prompt || '').trim();
    // REGLA FUNDAMENTAL: Cartillas OMR o casilleros ficticios jamás entran al banco de la nube
    if (evalObj.branch === 'rama3' || (evalObj.id && String(evalObj.id).startsWith('eval_r3_')) ||
        /^Pregunta\s+\d+$/i.test(promptLimpio) || promptLimpio.startsWith('Cartilla de respuestas')) {
      return;
    }

    const resolvedQuestions = evalObj.type === 'mc'
      ? (evalObj.questions || (evalObj.options ? [{ prompt: evalObj.prompt, options: evalObj.options, correct: evalObj.correct || 'A' }] : null))
      : null;

    const payload = {
      prompt: evalObj.prompt,
      expectedAnswer: evalObj.expectedAnswer || (evalObj.correct ? ('Clave: ' + evalObj.correct) : ''),
      title: evalObj.title || 'Evaluación',
      rubric: evalObj.rubric || null,
      gradeStage: evalObj.gradeStage || null,
      gradeLevel: evalObj.gradeLevel || null,
      gradeText: evalObj.gradeText || null,
      type: evalObj.type === 'mc' ? 'mc' : 'free',
      questionCount: evalObj.type === 'mc' ? (evalObj.questionCount || (resolvedQuestions ? resolvedQuestions.length : 1)) : 1,
      questions: resolvedQuestions
    };

    if (typeof window !== 'undefined' && window.SupabaseClient && typeof window.SupabaseClient.saveEvaluation === 'function') {
      window.SupabaseClient.saveEvaluation(payload).then(res => {
        if (!res) queueForSync(payload);
      }).catch(err => {
        console.warn('[Guardrail] Error al sincronizar con Supabase, encolando:', err && err.message);
        queueForSync(payload);
      });
    } else {
      queueForSync(payload);
    }

    // Si es una evaluación compuesta de opción múltiple (2 o 3 preguntas legítimas del docente),
    // sincronizar cada pregunta individual al banco de la nube
    if (payload.type === 'mc' && Array.isArray(payload.questions) && payload.questions.length > 1 && evalObj.branch !== 'rama3') {
      payload.questions.forEach((q, idx) => {
        if (!q || !q.prompt) return;
        const qPrompt = String(q.prompt).trim();
        if (/^Pregunta\s+\d+$/i.test(qPrompt) || qPrompt.startsWith('Cartilla de respuestas')) return;
        const singlePayload = {
          prompt: qPrompt,
          expectedAnswer: `Clave: ${q.correct || 'A'}`,
          title: `Pregunta de alternativa`,
          gradeStage: payload.gradeStage,
          gradeLevel: payload.gradeLevel,
          gradeText: payload.gradeText,
          type: 'mc',
          questionCount: 1,
          questions: [q]
        };
        if (typeof window !== 'undefined' && window.SupabaseClient && typeof window.SupabaseClient.saveEvaluation === 'function') {
          window.SupabaseClient.saveEvaluation(singlePayload).then(res => {
            if (!res) queueForSync(singlePayload);
          }).catch(() => queueForSync(singlePayload));
        } else {
          queueForSync(singlePayload);
        }
      });
    }
  }

  function enrichQuestionOptions(evalObj) {
    if (!evalObj) return evalObj;
    // REGLA 2: Solo si evalObj.type === 'mc' se trata como opción múltiple. Cero alteración a Respuesta Libre.
    if (evalObj.type !== 'mc') return evalObj;
    const promptStr = String(evalObj.prompt || '').toLowerCase();
    const hasOptions = (evalObj.options && (evalObj.options.A || evalObj.options.B)) ||
      (Array.isArray(evalObj.questions) && evalObj.questions[0] && evalObj.questions[0].options);

    if (!hasOptions) {
      if (promptStr.includes('panader') || promptStr.includes('panes') || promptStr.includes('pepe')) {
        evalObj.options = { A: '48', B: '38', C: '32', D: '42' };
        evalObj.correct = 'B';
      } else if (promptStr.includes('soles') || promptStr.includes('20 soles')) {
        evalObj.options = { A: '15', B: '25', C: '10', D: '12' };
        evalObj.correct = 'A';
      } else {
        const exp = String(evalObj.expectedAnswer || '').replace(/[^\d]/g, '') || '10';
        const n = parseInt(exp, 10) || 10;
        evalObj.options = {
          A: String(n),
          B: String(n + 5),
          C: String(Math.max(1, n - 3)),
          D: String(n + 10)
        };
        evalObj.correct = 'A';
      }
    }

    if (!Array.isArray(evalObj.questions) || evalObj.questions.length === 0) {
      evalObj.questions = [{
        prompt: evalObj.prompt,
        options: evalObj.options,
        correct: evalObj.correct || 'A',
        gradeStage: evalObj.gradeStage,
        gradeLevel: evalObj.gradeLevel,
        gradeText: evalObj.gradeText
      }];
    } else if (evalObj.questions[0] && !evalObj.questions[0].options && evalObj.options) {
      evalObj.questions[0].options = evalObj.options;
      evalObj.questions[0].correct = evalObj.correct || 'A';
    } else if (evalObj.questions[0] && evalObj.questions[0].options && !evalObj.options) {
      evalObj.options = evalObj.questions[0].options;
      evalObj.correct = evalObj.correct || evalObj.questions[0].correct || 'A';
    }
    return evalObj;
  }

  function loadSavedBank() {
    if (typeof window !== 'undefined' && window.localStorage) {
      try { window.localStorage.removeItem(STORAGE_KEY_BANK_VIEJO); } catch (e) {}

      try {
        const raw = window.localStorage.getItem(STORAGE_KEY_BANK);
        if (raw) {
          const bank = JSON.parse(raw);
          Object.keys(bank).forEach(k => {
            bank[k] = enrichQuestionOptions(bank[k]);
          });
          Object.assign(EVALUATIONS, bank);
          // Depurar evaluaciones compuestas obsoletas, cartillas OMR y placeholders ficticios
          let modified = false;
          Object.keys(bank).forEach(k => {
            const ev = bank[k];
            if (!ev) return;
            const promptStr = String(ev.prompt || '').trim();
            if (
              ev.branch === 'rama3' ||
              k.startsWith('eval_r3_') ||
              /^Pregunta\s+\d+$/i.test(promptStr) ||
              promptStr.startsWith('Cartilla de respuestas') ||
              promptStr.includes('30 + 25') || promptStr.includes('30-15') || promptStr.includes('80+20')
            ) {
              delete bank[k];
              delete EVALUATIONS[k];
              modified = true;
            }
          });
          if (modified) {
            window.localStorage.setItem(STORAGE_KEY_BANK, JSON.stringify(bank));
          }
        }
      } catch (e) {
        console.warn('[ClassroomData] Error al cargar banco de localStorage:', e);
      }
    }
  }
  loadSavedBank();

  // --- FUNCIONES AUXILIARES DE BÚSQUEDA Y GESTIÓN ---

  function getEvaluationList() {
    return Object.values(EVALUATIONS).map(e => ({
      id: e.id,
      title: e.title,
      expectedAnswer: e.expectedAnswer,
      prompt: e.prompt,
      // El grado y la rúbrica viajan con la evaluación: el banco solo muestra
      // preguntas completas, y las que no lo están se marcan "sin rúbrica".
      gradeStage: e.gradeStage || null,
      gradeLevel: e.gradeLevel || null,
      gradeText: e.gradeText || formatGrade(e.gradeStage, e.gradeLevel),
      hasRubric: !!e.rubric,
      type: e.type || undefined,
      questionCount: e.questionCount || undefined,
      questions: e.questions || undefined
    }));
  }

  /**
   * Devuelve las preguntas individuales de opción múltiple disponibles para un grado.
   * Extrae preguntas de evaluaciones de 1 y 2 preguntas, deduplicando por enunciado.
   * @param {string|null} stage 'primaria' | 'secundaria'
   * @param {number|null} level 4, 5, 6...
   * @returns {Array<{id: string, prompt: string, options: object, correct: string, gradeStage: string, gradeLevel: number, gradeText: string, title: string}>}
   */
  function getIndividualMCQuestions(stage, level) {
    const list = [];
    const seen = new Set();
    Object.values(EVALUATIONS).forEach(ev => {
      if (!ev) return;
      if (ev.branch === 'rama3' || (ev.id && String(ev.id).startsWith('eval_r3_'))) return;
      const rootPrompt = String(ev.prompt || '').trim();
      if (/^Pregunta\s+\d+$/i.test(rootPrompt) || rootPrompt.startsWith('Cartilla de respuestas')) return;

      if (stage && ev.gradeStage && ev.gradeStage !== stage) return;
      if (level && ev.gradeLevel && Number(ev.gradeLevel) !== Number(level)) return;

      ev = enrichQuestionOptions(ev);

      if (Array.isArray(ev.questions) && ev.questions.length > 0) {
        ev.questions.forEach((q, idx) => {
          const prompt = String(q.prompt || '').trim();
          if (!prompt || seen.has(prompt)) return;
          if (/^Pregunta\s+\d+$/i.test(prompt)) return; // Ignorar casilleros OMR numéricos
          const hasOptions = q.options && (q.options.A || q.options.B || q.options.C || q.options.D);
          if (!hasOptions) {
            seen.add(prompt);
            list.push({
              id: ev.id + (ev.questions.length > 1 ? '_q' + idx : ''),
              prompt: prompt,
              options: null,
              isFreeResponse: true,
              correct: null,
              gradeStage: ev.gradeStage || stage,
              gradeLevel: ev.gradeLevel || level,
              gradeText: ev.gradeText || formatGrade(stage, level),
              title: (q.title && !q.title.includes('2 Preguntas') ? q.title : 'Pregunta de respuesta libre'),
              rubric: q.rubric || ev.rubric || null,
              hasRubric: !!(q.rubric || ev.rubric),
              expectedAnswer: q.expectedAnswer || ev.expectedAnswer || '',
              createdAt: ev.createdAt || ev.created_at || null,
              updatedAt: ev.updatedAt || ev.last_used_at || ev.createdAt || ev.created_at || null
            });
            return;
          }
          seen.add(prompt);
          const correctKey = (q.correct || 'A').toUpperCase();
          list.push({
            id: ev.id + (ev.questions.length > 1 ? '_q' + idx : ''),
            prompt: prompt,
            options: {
              A: q.options?.A || '',
              B: q.options?.B || '',
              C: q.options?.C || '',
              D: q.options?.D || ''
            },
            correct: correctKey,
            gradeStage: ev.gradeStage || stage,
            gradeLevel: ev.gradeLevel || level,
            gradeText: ev.gradeText || formatGrade(stage, level),
            title: (q.title && !q.title.includes('2 Preguntas') ? q.title : 'Pregunta de evaluación'),
            rubric: q.rubric || ev.rubric || null,
            hasRubric: !!(q.rubric || ev.rubric),
            expectedAnswer: (q.options ? q.options[correctKey] : '') || ev.expectedAnswer || '',
            createdAt: ev.createdAt || ev.created_at || null,
            updatedAt: ev.updatedAt || ev.last_used_at || ev.createdAt || ev.created_at || null
          });
        });
      } else if (ev.options && (ev.options.A || ev.options.B || ev.options.C || ev.options.D)) {
        const prompt = String(ev.prompt || '').trim();
        if (!prompt || seen.has(prompt)) return;
        if (/^Pregunta\s+\d+$/i.test(prompt)) return; // Ignorar casilleros OMR numéricos
        seen.add(prompt);
        let correct = 'A';
        if (ev.correct) {
          correct = String(ev.correct).toUpperCase();
        } else if (ev.expectedAnswer) {
          const m = ev.expectedAnswer.match(/[A-D]/i);
          if (m) correct = m[0].toUpperCase();
        }
        list.push({
          id: ev.id,
          prompt: prompt,
          options: {
            A: ev.options.A || '',
            B: ev.options.B || '',
            C: ev.options.C || '',
            D: ev.options.D || ''
          },
          correct: correct,
          gradeStage: ev.gradeStage || stage,
          gradeLevel: ev.gradeLevel || level,
          gradeText: ev.gradeText || formatGrade(stage, level),
          title: (ev.title && !ev.title.includes('2 Preguntas') ? ev.title : 'Pregunta de evaluación'),
          rubric: ev.rubric || null,
          hasRubric: !!ev.rubric,
          expectedAnswer: (ev.options ? ev.options[correct] : '') || ev.expectedAnswer || '',
          createdAt: ev.createdAt || ev.created_at || null,
          updatedAt: ev.updatedAt || ev.last_used_at || ev.createdAt || ev.created_at || null
        });
      } else if (ev.prompt) {
        // Pregunta de Respuesta Libre (sin alternativas, solo respuesta esperada)
        const prompt = String(ev.prompt || '').trim();
        if (!prompt || seen.has(prompt)) return;
        if (/^Pregunta\s+\d+$/i.test(prompt) || prompt.startsWith('Cartilla de respuestas')) return;
        seen.add(prompt);
        list.push({
          id: ev.id,
          prompt: prompt,
          options: null,
          isFreeResponse: true,
          correct: null,
          gradeStage: ev.gradeStage || stage,
          gradeLevel: ev.gradeLevel || level,
          gradeText: ev.gradeText || formatGrade(stage, level),
          title: (ev.title && !ev.title.includes('2 Preguntas') ? ev.title : 'Pregunta de respuesta libre'),
          rubric: ev.rubric || null,
          hasRubric: !!ev.rubric,
          expectedAnswer: ev.expectedAnswer || '',
          createdAt: ev.createdAt || ev.created_at || null,
          updatedAt: ev.updatedAt || ev.last_used_at || ev.createdAt || ev.created_at || null
        });
      }
    });

    list.sort((a, b) => {
      const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return timeB - timeA;
    });

    return list;
  }

  /**
   * Obtiene la pregunta más recientemente creada o editada en todo el banco.
   * @returns {object|null}
   */
  function getLatestActiveQuestion() {
    const all = getIndividualMCQuestions(null, null);
    return (Array.isArray(all) && all.length > 0) ? all[0] : null;
  }

  /**
   * Rúbrica guardada de una evaluación, o null si todavía no tiene.
   * Es lo que exige la corrección con IA: sin rúbrica no se puede corregir.
   */
  function getEvaluationRubric(evalId) {
    const ev = EVALUATIONS[evalId];
    return (ev && ev.rubric) ? ev.rubric : null;
  }

  /**
   * Devuelve el salón o null si no existe.
   * Antes caía al salón '3A' del catálogo de demo, lo que hacía que un id
   * inexistente (por ejemplo una sesión restaurada de un salón ya borrado)
   * devolviera silenciosamente datos de otro salón. Devolver null obliga a
   * quien llama a decidir, y los llamadores ya lo verifican.

  /**
   * Devuelve la evaluación o null si no existe.
   *
   * Antes caía a 'EVA_01' del catálogo de ejemplo, lo que hacía que un id
   * inexistente (por ejemplo una sesión restaurada de una evaluación borrada)
   * devolviera silenciosamente OTRO problema, con otra respuesta esperada: el
   * docente habría corregido contra una consigna que no era la suya.
   * Devolver null obliga a quien llama a decidir, y todos los llamadores ya lo
   * verifican.
   */
  function getEvaluation(evalId) {
    if (!evalId) return null;
    if (EVALUATIONS[evalId]) return EVALUATIONS[evalId];
    if (SESSION_EVALUATIONS[evalId]) return SESSION_EVALUATIONS[evalId];

    // Fallback con la sesión activa actual en memoria o almacenamiento
    const active = getActiveSession();
    if (active && (active.evalId === evalId || active.id === evalId || active.sessionRef === evalId)) {
      return {
        id: evalId,
        title: active.title || 'Evaluación de Sesión',
        prompt: active.prompt || '',
        expectedAnswer: active.expectedAnswer || '',
        type: active.type || 'mc',
        branch: active.branch || 'rama3',
        questionCount: active.questionCount || (active.questions ? active.questions.length : 1),
        questions: active.questions || [],
        gradeStage: active.gradeStage,
        gradeLevel: active.gradeLevel,
        gradeText: active.gradeText,
        correctionMode: active.correctionMode || 'quick'
      };
    }

    // Fallback con sesiones guardadas
    const saved = getSavedSessions();
    const foundSess = saved.find(s => s && (s.evalId === evalId || s.id === evalId || (s.wizardEval && s.wizardEval.id === evalId)));
    if (foundSess) {
      const w = foundSess.wizardEval || foundSess;
      return {
        id: evalId,
        title: w.title || foundSess.title,
        prompt: w.prompt || foundSess.prompt,
        expectedAnswer: w.expectedAnswer || foundSess.expectedAnswer,
        type: w.type || foundSess.type || 'mc',
        branch: w.branch || foundSess.branch || 'rama3',
        questionCount: w.questionCount || foundSess.questionCount,
        questions: w.questions || foundSess.questions || [],
        gradeStage: w.gradeStage || foundSess.gradeStage,
        gradeLevel: w.gradeLevel || foundSess.gradeLevel,
        gradeText: w.gradeText || foundSess.gradeText,
        correctionMode: foundSess.correctionMode || 'quick'
      };
    }

    return null;
  }

  /**
   * Registra o actualiza una evaluación personalizada redactada por el docente
   * y la añade al banco disponible.
   *
   * IMPORTANTE — por qué conserva lo que el llamador no manda:
   * esta función REEMPLAZA la entrada entera del banco. Varios lugares del
   * portal guardan acá una evaluación sin saber nada de rúbricas (al generar las
   * fichas, al restaurar una sesión). Con el reemplazo seco, esos lugares
   * borraban la rúbrica recién generada: el docente la creaba, imprimía las
   * fichas, y al volver al banco la pregunta aparecía como "falta la rúbrica".
   *
   * Por eso la rúbrica y el grado se conservan de la versión anterior cuando el
   * llamador no los pasa. La identidad de una evaluación es su ENUNCIADO (igual
   * que en Supabase y en setRecentEvaluations), así que la versión anterior se
   * busca por id y, si no aparece, por enunciado.
   */
  function saveCustomEvaluation(evalData, options) {
    const opts = options || {};
    const promptLimpio = String(evalData.prompt || '').trim();

    // La identidad de una evaluación es su ENUNCIADO, igual que en Supabase y en
    // setRecentEvaluations. Si ya existe una con el mismo enunciado, se
    // ACTUALIZA esa en vez de crear otra: dos llamadas sin id (o con un id
    // distinto) dejaban la misma pregunta dos veces en el banco, una de ellas
    // sin rúbrica.
    const idPorEnunciado = promptLimpio
      ? Object.keys(EVALUATIONS).find(k => EVALUATIONS[k] && EVALUATIONS[k].prompt === promptLimpio)
      : null;

    // Id único de verdad. Antes era 'EVA_DOC_' + los ÚLTIMOS 4 dígitos del
    // reloj, que se repiten cada 10 segundos: dos preguntas creadas con esa
    // diferencia recibían el MISMO id y la segunda PISABA a la primera, con su
    // rúbrica y su grado incluidos.
    const id = evalData.id || idPorEnunciado
      || ('EVA_DOC_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));

    const previa = EVALUATIONS[id] || null;

    const nowIso = new Date().toISOString();
    const newEval = {
      id: id,
      title: evalData.title || (previa && previa.title) || 'Evaluación del Día',
      prompt: promptLimpio,
      expectedAnswer: String(evalData.expectedAnswer || '').trim(),
      unitHint: evalData.unitHint ? evalData.unitHint.trim() : '',
      createdAt: evalData.createdAt || (previa && previa.createdAt) || nowIso,
      updatedAt: nowIso
    };

    // La rúbrica y el grado viajan CON la evaluación: se generan una sola vez y
    // las 30 correcciones de esa ficha tienen que usar el mismo criterio.
    // Van en localStorage además de en Supabase para que la sesión siga
    // funcionando sin conexión.
    const rubrica = evalData.rubric || (previa ? previa.rubric : null);
    const gStage = evalData.gradeStage || (previa ? previa.gradeStage : null);
    const gLevel = evalData.gradeLevel || (previa ? previa.gradeLevel : null);
    const gText = evalData.gradeText || (previa ? previa.gradeText : null);

    if (rubrica) {
      newEval.rubric = rubrica;
      newEval.hasRubric = true;
    } else {
      newEval.hasRubric = false;
    }
    if (gStage) newEval.gradeStage = gStage;
    if (gLevel) newEval.gradeLevel = gLevel;
    if (gText) newEval.gradeText = gText;

    // Propiedades de formato Opción Múltiple (OMR) y Ramas de Evaluación
    if (evalData.type) newEval.type = evalData.type;
    if (evalData.questionCount) newEval.questionCount = evalData.questionCount;
    const resolvedOpts = evalData.options || (Array.isArray(evalData.questions) && evalData.questions[0] && evalData.questions[0].options) || null;
    const resolvedCorr = evalData.correct || (Array.isArray(evalData.questions) && evalData.questions[0] && evalData.questions[0].correct) || null;
    newEval.options = (evalData.type === 'mc' && resolvedOpts) ? resolvedOpts : null;
    newEval.correct = (evalData.type === 'mc' && resolvedCorr) ? resolvedCorr : null;
    if (evalData.questions) newEval.questions = evalData.questions;
    if (evalData.branch) newEval.branch = evalData.branch;
    if (evalData.withGrid !== undefined) newEval.withGrid = evalData.withGrid;
    if (evalData.cardFormat) newEval.cardFormat = evalData.cardFormat;
    if (evalData.isPortrait !== undefined) newEval.isPortrait = evalData.isPortrait;
    if (evalData.orientation) newEval.orientation = evalData.orientation;
    if (evalData.cardOrientation) newEval.cardOrientation = evalData.cardOrientation;
    if (evalData.gridStage !== undefined) newEval.gridStage = evalData.gridStage;

    // REGLA: Las Cartillas OMR (Rama 3) son plantillas de sesión para escanear burbujas,
    // NO son preguntas de banco. Se devuelven en memoria para la sesión pero NUNCA se guardan en el banco.
    if (evalData.branch === 'rama3' || String(id).startsWith('eval_r3_') || String(promptLimpio).startsWith('Cartilla de respuestas')) {
      SESSION_EVALUATIONS[id] = newEval;
      return newEval;
    }

    // GUARDARRAÍL LÍMITE DE 50 PREGUNTAS:
    // Si es una pregunta NUEVA (no existe previa ni por id ni por enunciado) y ya se llegó al máximo de 50:
    if (!previa && !idPorEnunciado) {
      const totalActual = countTotalBankQuestions();
      if (totalActual >= MAX_BANK_QUESTIONS) {
        if (typeof showToast === 'function') {
          showToast('⚠️ Has alcanzado el límite máximo de 50 preguntas en tu banco. Elimina alguna pregunta que ya no utilices para poder agregar una nueva.');
        }
        return null;
      }
    }

    EVALUATIONS[id] = newEval;
    unmarkPromptAsDeleted(promptLimpio);

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY_BANK);
        const bank = raw ? JSON.parse(raw) : {};
        bank[id] = newEval;
        window.localStorage.setItem(STORAGE_KEY_BANK, JSON.stringify(bank));
      } catch (e) {
        console.warn('[ClassroomData] Error al guardar en localStorage:', e);
      }
    }

    // GUARDRAIL NUBE (Supabase):
    // Toda evaluación que ingresa al banco se sincroniza de inmediato con Supabase
    // (a menos que se indique skipCloudSync, como al restaurar desde caché).
    if (!opts.skipCloudSync) {
      syncToCloudGuardrail(newEval);
    }

    return newEval;
  }

  /**
   * Elimina una evaluación del banco en runtime y en localStorage.
   * @param {string} evalIdOrPrompt ID o enunciado de la evaluación
   * @returns {boolean} true si se eliminó
   */
  function deleteCustomEvaluation(evalIdOrPrompt) {
    if (!evalIdOrPrompt) return false;
    const target = String(evalIdOrPrompt).trim();
    markPromptAsDeleted(target);
    let deletedCount = 0;

    // 1. Si es ID directo de una evaluación
    if (EVALUATIONS[target]) {
      delete EVALUATIONS[target];
      deletedCount++;
    }

    // 2. Si el ID tiene sufijo de subpregunta (_q0, _q1, etc.)
    if (target.includes('_q')) {
      const rootId = target.replace(/_q\d+$/, '');
      if (EVALUATIONS[rootId]) {
        delete EVALUATIONS[rootId];
        deletedCount++;
      }
    }

    // 3. Buscar en todas las evaluaciones por ID, prompt exacto, prompt compuesto o dentro de questions[]
    Object.keys(EVALUATIONS).forEach(k => {
      const ev = EVALUATIONS[k];
      if (!ev) return;

      if (ev.id === target || ev.prompt === target) {
        markPromptAsDeleted(ev.prompt);
        delete EVALUATIONS[k];
        deletedCount++;
        return;
      }

      // Si el prompt raíz contiene el enunciado buscado (ej: "1. ¿Cuanto es 30 + 25? | 2. ...")
      if (ev.prompt && typeof ev.prompt === 'string' && ev.prompt.includes(target)) {
        markPromptAsDeleted(ev.prompt);
        delete EVALUATIONS[k];
        deletedCount++;
        return;
      }

      // Si la pregunta está dentro del array questions
      if (Array.isArray(ev.questions) && ev.questions.length > 0) {
        const initialLen = ev.questions.length;
        ev.questions = ev.questions.filter(q => {
          if (!q) return false;
          if (q.id === target) return false;
          if (q.prompt && q.prompt.trim() === target) {
            markPromptAsDeleted(q.prompt);
            return false;
          }
          return true;
        });

        if (ev.questions.length < initialLen) {
          deletedCount++;
          // Si ya no le quedan preguntas, borrar la evaluación padre completa
          if (ev.questions.length === 0) {
            delete EVALUATIONS[k];
          }
        }
      }
    });

    if (deletedCount > 0 && typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(STORAGE_KEY_BANK, JSON.stringify(EVALUATIONS));
      } catch (e) {
        console.warn('[ClassroomData] Error al sincronizar eliminación con localStorage:', e);
      }
    }

    return deletedCount > 0;
  }

    /**
     * Carga el historial de evaluaciones recientes del docente (desde Supabase)
     * al banco local, para que renderBankCards() las muestre.
     * Recibe filas de microeval_evaluations.
     *
     * Una evaluación se identifica por su ENUNCIADO, no por su id: el id local
     * (EVA_DOC_1234) y el de la base (un uuid) son distintos para la MISMA
     * pregunta.
     *
     * Regla Fundamental: NUNCA se borran preguntas creadas localmente solo porque
     * la nube no las devuelva en la lista reciente. La copia local es soberana.
     */
  function setRecentEvaluations(list) {
      if (!Array.isArray(list)) return;

      const deletedPrompts = getDeletedPrompts();

      list.forEach(ev => {
        if (!ev || !ev.prompt) return;
        const promptLimpio = String(ev.prompt || '').trim();
        if (ev.branch === 'rama3' || /^Pregunta\s+\d+$/i.test(promptLimpio) || promptLimpio.startsWith('Cartilla de respuestas')) {
          return;
        }

        // Si la nube nos devuelve una pregunta activa y legítima, cualquier lápida local vieja queda sin efecto.
        // REGLA: setRecentEvaluations NUNCA debe borrar filas en Supabase.
        unmarkPromptAsDeleted(promptLimpio);
        if (ev.id) unmarkPromptAsDeleted(ev.id);

        const idLocal = Object.keys(EVALUATIONS)
          .find(k => EVALUATIONS[k] && EVALUATIONS[k].prompt === ev.prompt);
        const id = idLocal || ev.id || `EVA_REC_${Date.now()}`;
        const previa = EVALUATIONS[id] || null;

        const resolvedOpts = ev.options || (Array.isArray(ev.questions) && ev.questions[0] && ev.questions[0].options) || (previa && previa.options) || null;
        const resolvedCorr = ev.correct || (Array.isArray(ev.questions) && ev.questions[0] && ev.questions[0].correct) || (previa && previa.correct) || null;

        const updatedTime = ev.last_used_at || ev.updated_at || ev.created_at || (previa && (previa.updatedAt || previa.createdAt)) || new Date().toISOString();
        const createdTime = ev.created_at || (previa && previa.createdAt) || updatedTime;

        EVALUATIONS[id] = enrichQuestionOptions({
          id: id,
          title: ev.title || (previa && previa.title) || 'Evaluación',
          prompt: ev.prompt,
          expectedAnswer: ev.expected_answer || (previa && previa.expectedAnswer) || '',
          unitHint: '',
          rubric: ev.rubric || (previa ? previa.rubric : null) || undefined,
          gradeStage: ev.grade_stage || (previa ? previa.gradeStage : null) || null,
          gradeLevel: ev.grade_level || (previa ? previa.gradeLevel : null) || null,
          gradeText: ev.grade_text || (previa ? previa.gradeText : null) || null,
          type: ev.type || (previa ? previa.type : null) || undefined,
          questionCount: ev.question_count || ev.questionCount || (previa ? previa.questionCount : null) || undefined,
          options: resolvedOpts,
          correct: resolvedCorr,
          questions: ev.questions || (previa ? previa.questions : null) || undefined,
          createdAt: createdTime,
          updatedAt: updatedTime
        });
      });

      // Purgar localmente solo preguntas que permanecen explícitamente eliminadas
      const activeDeleted = getDeletedPrompts();
      if (activeDeleted.size > 0) {
        Object.keys(EVALUATIONS).forEach(k => {
          const ev = EVALUATIONS[k];
          if (!ev) return;
          const p = String(ev.prompt || '').trim();
          if (activeDeleted.has(p) || (ev.id && activeDeleted.has(ev.id))) {
            delete EVALUATIONS[k];
          }
        });
      }

      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          window.localStorage.setItem(STORAGE_KEY_BANK, JSON.stringify(EVALUATIONS));
        } catch (e) {}
      }
    }

  // Asignar al objeto universal
  Object.assign(ClassroomData, {
    EVALUATIONS,
    SESSION_EVALUATIONS,
    MAX_BANK_QUESTIONS,
    getBankQuestionsCount: countTotalBankQuestions,
    getLatestActiveQuestion,
    flushSyncQueue,
    getEvaluationList,
    getIndividualMCQuestions,
    getEvaluationRubric,
    getEvaluation,
    saveCustomEvaluation,
    deleteCustomEvaluation,
    setRecentEvaluations,
    syncAllLocalToCloud
  });

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
