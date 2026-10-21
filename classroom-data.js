/**
 * Módulo de Datos del Aula: Salones, Nóminas de Estudiantes y Catálogo de Evaluaciones
 * Microevaluación Formativa de Clase A5
 * 
 * Funcionalidad:
 * 1. Nóminas escalables de estudiantes por salón (3° A y 3° B con 20 alumnos cada uno).
 * 2. Catálogo de problemas matemáticos (Enunciados y Respuestas esperadas).
 * 3. Funciones auxiliares para emparejamiento instantáneo con el código QR simplificado.
 */

(function (global) {
  'use strict';

  // --- PALETA DE COLORES PARA SALONES (escalable: se asigna por orden si el salón no tiene color explícito) ---
  const CLASSROOM_COLOR_PALETTE = [
    '#3b82f6', // azul     — 3° A
    '#22c55e', // verde    — 3° B
    '#a855f7', // violeta  — 3° C (futuro)
    '#f59e0b', // ámbar    — 3° D (futuro)
    '#ec4899', // rosa     — 3° E (futuro)
    '#14b8a6', // teal     — 3° F (futuro)
    '#f97316', // naranja  — 3° G (futuro)
    '#06b6d4', // cian     — 3° H (futuro)
  ];

  // ── CATÁLOGO DE GRADOS ────────────────────────────────────────────────
  // El grado se guarda en DOS campos y no en uno solo:
  //   grade_stage  → 'primaria' | 'secundaria'
  //   grade_level  → el número (4, 5, 6, ...)
  // Van separados a propósito: el número 5 por sí solo es ambiguo entre
  // "5° de primaria" y "5° de secundaria", y una vez que hay datos con esa
  // ambigüedad ya no se puede deshacer. Con la etapa explícita, habilitar
  // secundaria más adelante es agregar números a `grades` y nada más.
  //
  // Hoy solo se usan 4°, 5° y 6° de primaria. `grades: []` significa
  // "etapa todavía no habilitada": la etapa no aparece en el selector.
  const GRADE_CATALOG = [
    { stage: 'primaria',   label: 'Primaria',   grades: [4, 5, 6] },
    { stage: 'secundaria', label: 'Secundaria', grades: [1, 2, 3, 4, 5] }
  ];

  // Etapa por defecto cuando el salón no tiene grado cargado.
  const DEFAULT_GRADE_STAGE = 'primaria';

  /**
   * Texto del grado, listo para mostrar en pantalla, imprimir en la ficha o
   * mandar como contexto al prompt de la IA.
   * @param {string} stage 'primaria' | 'secundaria'
   * @param {number} level número de grado
   * @returns {string|null} ej. "4° de primaria", o null si no está definido
   */
  function formatGrade(stage, level) {
    if (!stage || !level) return null;
    const entry = GRADE_CATALOG.find(g => g.stage === stage);
    if (!entry) return null;
    return level + '° de ' + entry.label.toLowerCase();
  }

  /**
   * Opciones de grado para poblar un <select>, en orden.
   * Solo incluye etapas con grados habilitados.
   * @returns {Array<{stage, level, label, value}>}
   */
  function getGradeOptions() {
    const options = [];
    GRADE_CATALOG.forEach(entry => {
      entry.grades.forEach(level => {
        options.push({
          stage: entry.stage,
          level: level,
          label: level + '° ' + entry.label,
          value: entry.stage + ':' + level
        });
      });
    });
    return options;
  }

  /** Separadores entre etapas, para armar <optgroup> en el selector. */
  function getGradeStages() {
    return GRADE_CATALOG
      .filter(entry => entry.grades.length > 0)
      .map(entry => ({ stage: entry.stage, label: entry.label, grades: entry.grades.slice() }));
  }

  // --- CATÁLOGO DE SALONES ---
  // VACÍO A PROPÓSITO.
  //
  // Los salones y las nóminas viven en Supabase y llegan por setClassrooms()
  // cuando el docente inicia sesión. Antes había acá dos salones de ejemplo
  // con 20 nombres inventados, y se quitaron por dos razones:
  //
  //   1. Este repositorio se publica en GitHub Pages. Un listado de alumnos
  //      —aunque sea ficticio— no puede estar en un repositorio público:
  //      nadie que lo abra puede distinguir una nómina real de una inventada.
  //   2. Era peso muerto. setClassrooms() borraba este catálogo apenas había
  //      sesión, así que solo se veía detrás de la pantalla de login.
  //
  // Sin catálogo, antes del login no hay ningún salón, que es lo correcto:
  // sin sesión no hay datos. getClassroom() devuelve null y todos los
  // llamadores ya lo verifican.
  const CLASSROOMS = {};

  // --- CATÁLOGO DE MICROEVALUACIONES ---
  // VACÍO A PROPÓSITO.
  //
  // Acá había tres problemas de ejemplo ("Biblioteca", "Panadería", "Cajas de
  // Manzanas") que venían con la plantilla original. Se borraron junto con todo
  // el banco por una razón de fondo: bajo la regla actual TODA pregunta entra al
  // banco con su rúbrica y su grado, y esas tres no tenían ninguna de las dos
  // cosas. Dejarlas era dejar preguntas rotas dentro de una lista que se supone
  // lista para corregir.
  //
  // El banco se llena solo, con las preguntas que el docente va creando.
  const EVALUATIONS = {};
  const SESSION_EVALUATIONS = {};

  // Cargar evaluaciones guardadas previamente en localStorage.
  //
  // La clave subió a v2 para que el banco viejo de cada navegador quede
  // ignorado: si no, las preguntas guardadas antes de esta regla (sin rúbrica ni
  // grado) volverían a aparecer aunque se hubieran borrado de la base.
  const STORAGE_KEY_BANK = 'microeval_teacher_bank_v2';
  const STORAGE_KEY_BANK_VIEJO = 'microeval_teacher_bank_v1';
  const STORAGE_KEY_SESSION = 'microeval_active_session_v1';
  const STORAGE_KEY_SAVED_SESSIONS = 'microeval_saved_sessions_v1';
  const MAX_SAVED_SESSIONS = 8;
  const STORAGE_KEY_SYNC_QUEUE = 'microeval_pending_sync_v1';

  function queueForSync(item) {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY_SYNC_QUEUE);
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
      const raw = window.localStorage.getItem(STORAGE_KEY_SYNC_QUEUE);
      if (!raw) return;
      const queue = JSON.parse(raw);
      if (!Array.isArray(queue) || queue.length === 0) return;

      const remaining = [];
      const promises = queue.map(item => {
        return window.SupabaseClient.saveEvaluation(item)
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
          console.log('[Guardrail Sync] Todas las preguntas pendientes se sincronizaron con Supabase.');
        }
      });
    } catch (e) {}
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      flushSyncQueue();
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

    const payload = {
      prompt: evalObj.prompt,
      expectedAnswer: evalObj.expectedAnswer || '',
      title: evalObj.title || 'Evaluación',
      rubric: evalObj.rubric || null,
      gradeStage: evalObj.gradeStage || null,
      gradeLevel: evalObj.gradeLevel || null,
      gradeText: evalObj.gradeText || null,
      type: evalObj.type === 'mc' ? 'mc' : 'free',
      questionCount: evalObj.type === 'mc' ? (evalObj.questionCount || (evalObj.questions ? evalObj.questions.length : 1)) : 1,
      questions: evalObj.type === 'mc' ? (evalObj.questions || null) : null
    };

    if (typeof window !== 'undefined' && window.SupabaseClient && typeof window.SupabaseClient.saveEvaluation === 'function') {
      window.SupabaseClient.saveEvaluation(payload).catch(err => {
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
          window.SupabaseClient.saveEvaluation(singlePayload).catch(() => queueForSync(singlePayload));
        } else {
          queueForSync(singlePayload);
        }
      });
    }
  }

  function enrichQuestionOptions(evalObj) {
    if (!evalObj) return evalObj;
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
  function getClassroomList() {
    return Object.values(CLASSROOMS).map(c => ({ id: c.id, name: c.name, count: c.students.length }));
  }

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
          if (!hasOptions) return;
          seen.add(prompt);
          const correctKey = (q.correct || 'A').toUpperCase();
          list.push({
            id: ev.id + '_q' + idx,
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
            expectedAnswer: (q.options ? q.options[correctKey] : '') || ev.expectedAnswer || ''
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
          expectedAnswer: (ev.options ? ev.options[correct] : '') || ev.expectedAnswer || ''
        });
      }
    });
    return list;
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
   */
  function getClassroom(classroomId) {
    return CLASSROOMS[classroomId] || null;
  }

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

  function getStudent(classroomId, studentId) {
    const classroom = getClassroom(classroomId);
    if (!classroom || !classroom.students) return null;
    return classroom.students.find(s => s.id === studentId) || null;
  }

  /**
   * Grado del salón ya formateado, o null si no está definido.
   * Es lo que se imprime en la ficha y lo que se manda al prompt de la IA.
   */
  function getClassroomGrade(classroomId) {
    const cls = getClassroom(classroomId);
    if (!cls) return null;
    return formatGrade(cls.gradeStage, cls.gradeLevel);
  }

  /**
   * Devuelve el color asociado a un salón.
   * - Si el salón tiene propiedad `color` explícita, la usa.
   * - Si no (salón dinámico o futuro), elige de la paleta por índice de registro.
   * Nunca retorna undefined: el último color de la paleta actúa como fallback.
   */
  function getClassroomColor(classroomId) {
    const cls = CLASSROOMS[classroomId];
    if (cls && cls.color) return cls.color;
    // Fallback por posición en el catálogo
    const keys = Object.keys(CLASSROOMS);
    const idx = keys.indexOf(classroomId);
    const paletteIdx = idx >= 0 ? idx : keys.length;
    return CLASSROOM_COLOR_PALETTE[paletteIdx % CLASSROOM_COLOR_PALETTE.length];
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

    const newEval = {
      id: id,
      title: evalData.title || (previa && previa.title) || 'Evaluación del Día',
      prompt: promptLimpio,
      expectedAnswer: String(evalData.expectedAnswer || '').trim(),
      unitHint: evalData.unitHint ? evalData.unitHint.trim() : ''
    };

    // La rúbrica y el grado viajan CON la evaluación: se generan una sola vez y
    // las 30 correcciones de esa ficha tienen que usar el mismo criterio.
    // Van en localStorage además de en Supabase para que la sesión siga
    // funcionando sin conexión.
    const rubrica = evalData.rubric || (previa ? previa.rubric : null);
    const gStage = evalData.gradeStage || (previa ? previa.gradeStage : null);
    const gLevel = evalData.gradeLevel || (previa ? previa.gradeLevel : null);
    const gText = evalData.gradeText || (previa ? previa.gradeText : null);

    if (rubrica) newEval.rubric = rubrica;
    if (gStage) newEval.gradeStage = gStage;
    if (gLevel) newEval.gradeLevel = gLevel;
    if (gText) newEval.gradeText = gText;

    // Propiedades de formato Opción Múltiple (OMR) y Ramas de Evaluación
    if (evalData.type) newEval.type = evalData.type;
    if (evalData.questionCount) newEval.questionCount = evalData.questionCount;
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

    EVALUATIONS[id] = newEval;

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
        delete EVALUATIONS[k];
        deletedCount++;
        return;
      }

      // Si el prompt raíz contiene el enunciado buscado (ej: "1. ¿Cuanto es 30 + 25? | 2. ...")
      if (ev.prompt && typeof ev.prompt === 'string' && ev.prompt.includes(target)) {
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
          if (q.prompt && q.prompt.trim() === target) return false;
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
   * Fija el grado de un salón SOLO en el runtime (memoria).
   * La persistencia en Supabase la hace SupabaseClient.updateClassroomGrade(),
   * que se llama por separado: así el selector responde al instante aunque la
   * red falle o la migración todavía no se haya aplicado.
   * @param {string} classroomId
   * @param {string|null} stage 'primaria' | 'secundaria' | null
   * @param {number|null} level
   * @returns {boolean} true si el salón existe y quedó actualizado
   */
  function setClassroomGrade(classroomId, stage, level) {
    const cls = CLASSROOMS[classroomId];
    if (!cls) return false;
    cls.gradeStage = stage || null;
    cls.gradeLevel = (stage && level) ? level : null;
    return true;
  }

  /**
   * Guarda la sesión activa completa (Salón + Evaluación lista para escanear)
   */
  function setActiveSession(session) {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        if (!session) {
          window.localStorage.removeItem(STORAGE_KEY_SESSION);
        } else {
          window.localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));
        }
      } catch (e) {}
    }
  }

  /**
   * Obtiene la sesión activa
   */
  function getActiveSession() {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY_SESSION);
        if (raw) return JSON.parse(raw);
      } catch (e) {}
    }
    return null;
  }

  /**
   * Obtiene la lista de sesiones guardadas por el docente (máximo 8)
   * @returns {Array} Lista de hasta 8 sesiones completas
   */
  function getSavedSessions() {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY_SAVED_SESSIONS);
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) {
            // Guardarraíl estricto: solo sesiones con salón que tenga al menos 1 alumno
            return arr.filter(s => {
              if (!s || !s.classroomId) return false;
              const cls = getClassroom(s.classroomId);
              if (cls && (!cls.students || cls.students.length === 0)) return false;
              return true;
            }).slice(0, MAX_SAVED_SESSIONS);
          }
        }
      } catch (e) {
        console.error('[getSavedSessions Error]', e);
      }
    }
    return [];
  }

  /**
   * Sincroniza las sesiones guardadas entre la memoria local y Supabase.
   * - Conserva las sesiones locales prioritarias si aún no están en la nube.
   * - Si hay sesiones en la nube, combina inteligentemente respetando el tope de 8.
   * - Actualiza el localStorage como respaldo offline.
   * @returns {Promise<Array>} Lista sincronizada de sesiones
   */
  async function syncSessionsWithCloud() {
    if (typeof window === 'undefined' || !window.SupabaseClient || typeof window.SupabaseClient.loadSavedSessions !== 'function') {
      return getSavedSessions();
    }
    try {
      const user = await window.SupabaseClient.getCurrentUser();
      if (!user) return getSavedSessions();

      const cloudSessions = (await window.SupabaseClient.loadSavedSessions()) || [];
      const localSessions = getSavedSessions();

      const combined = [...cloudSessions];

      // Verificar si hay sesiones locales que no existen en la nube para subirlas
      for (const loc of localSessions) {
        const existsInCloud = combined.some(c => c.id === loc.id || (c.sessionRef && loc.sessionRef && c.sessionRef === loc.sessionRef));
        if (!existsInCloud && combined.length < MAX_SAVED_SESSIONS) {
          combined.push(loc);
          // Guardar en la nube en segundo plano
          window.SupabaseClient.saveSessionToCloud(loc).catch(e => console.warn('[Cloud Upload Sync]', e));
        }
      }

      // Guardar en localStorage para respaldo offline
      if (typeof window.localStorage !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY_SAVED_SESSIONS, JSON.stringify(combined.slice(0, MAX_SAVED_SESSIONS)));
      }
      return combined.slice(0, MAX_SAVED_SESSIONS);
    } catch (e) {
      console.warn('[syncSessionsWithCloud Error]', e);
      return getSavedSessions();
    }
  }

  /**
   * Guarda o actualiza una sesión en el almacenamiento local y en la nube con tope estricto de 8
   * @param {Object} sessionData Datos completos de la sesión
   * @returns {Object} Resultado de la operación
   */
  function saveSession(sessionData) {
    if (!sessionData || !sessionData.classroomId) {
      return { success: false, reason: 'invalid_data', error: 'Faltan datos del salón o la evaluación' };
    }
    const list = getSavedSessions();
    const existingIndex = sessionData.id ? list.findIndex(s => s.id === sessionData.id) : -1;

    let targetSession;
    if (existingIndex >= 0) {
      targetSession = {
        ...list[existingIndex],
        ...sessionData,
        updatedAt: new Date().toISOString()
      };
      list[existingIndex] = targetSession;
    } else {
      if (list.length >= MAX_SAVED_SESSIONS) {
        return {
          success: false,
          reason: 'limit_reached',
          max: MAX_SAVED_SESSIONS,
          count: list.length,
          error: `Has alcanzado el límite máximo de ${MAX_SAVED_SESSIONS} sesiones guardadas.`
        };
      }
      targetSession = {
        ...sessionData,
        id: sessionData.id || ('sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4)),
        createdAt: sessionData.createdAt || new Date().toISOString(),
        timestamp: sessionData.timestamp || Date.now()
      };
      list.unshift(targetSession);
    }

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(STORAGE_KEY_SAVED_SESSIONS, JSON.stringify(list.slice(0, MAX_SAVED_SESSIONS)));
      } catch (e) {
        return { success: false, reason: 'storage_error', error: e.message };
      }
    }

    // Sincronizar en la nube en segundo plano (Supabase)
    if (typeof window !== 'undefined' && window.SupabaseClient && typeof window.SupabaseClient.saveSessionToCloud === 'function') {
      window.SupabaseClient.saveSessionToCloud(targetSession).catch(err => {
        console.warn('[Cloud Save Session]', err && err.message);
      });
    }

    return {
      success: true,
      count: list.length,
      max: MAX_SAVED_SESSIONS,
      session: targetSession
    };
  }

  /**
   * Elimina una sesión guardada por ID tanto localmente como en la nube
   * @param {string} sessionId ID de la sesión a eliminar
   * @returns {Object} Resultado
   */
  function deleteSavedSession(sessionId) {
    if (!sessionId) return { success: false };
    const list = getSavedSessions().filter(s => s.id !== sessionId);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(STORAGE_KEY_SAVED_SESSIONS, JSON.stringify(list));
      } catch (e) {
        return { success: false, error: e.message };
      }
    }

    // Eliminar de Supabase en segundo plano
    if (typeof window !== 'undefined' && window.SupabaseClient && typeof window.SupabaseClient.deleteSessionFromCloud === 'function') {
      window.SupabaseClient.deleteSessionFromCloud(sessionId).catch(err => {
        console.warn('[Cloud Delete Session]', err && err.message);
      });
    }

    return { success: true, count: list.length, max: MAX_SAVED_SESSIONS };
  }

  /**
   * Verifica si un salón está siendo utilizado en alguna sesión guardada
   * @param {string} classroomId
   * @returns {{inUse: boolean, sessionTitle?: string, sessionId?: string}}
   */
  function isClassroomInSavedSession(classroomId) {
    if (!classroomId) return { inUse: false };
    const target = String(classroomId).trim().toLowerCase();
    const cls = getClassroom(classroomId);
    const clsName = cls?.name ? String(cls.name).trim().toLowerCase() : null;
    const list = getSavedSessions();
    for (const sess of list) {
      const matchId = sess.classroomId && String(sess.classroomId).trim().toLowerCase() === target;
      const matchName = clsName && sess.classroomName && String(sess.classroomName).trim().toLowerCase() === clsName;
      if (matchId || matchName) {
        const title = sess.title || (sess.branchTitle ? `${sess.branchTitle} (${sess.classroomName || 'Salón'})` : (sess.classroomName || 'Sesión guardada'));
        return { inUse: true, sessionTitle: title, sessionId: sess.id, isSaved: true };
      }
    }
    return { inUse: false };
  }

  /**
   * Verifica si un salón está en uso (en evaluación activa o en sesiones guardadas)
   * @param {string} classroomId
   * @returns {{inUse: boolean, sessionTitle?: string, sessionId?: string, isActive?: boolean, isSaved?: boolean}}
   */
  function isClassroomInUse(classroomId) {
    if (!classroomId) return { inUse: false };
    const target = String(classroomId).trim().toLowerCase();
    const cls = getClassroom(classroomId);
    const clsName = cls?.name ? String(cls.name).trim().toLowerCase() : null;

    // 1. Verificar si es la sesión activa en el escáner
    const active = getActiveSession();
    if (active && (
      (active.classroomId && String(active.classroomId).trim().toLowerCase() === target) ||
      (clsName && active.classroomName && String(active.classroomName).trim().toLowerCase() === clsName)
    )) {
      const title = active.title || (active.classroomName ? `Evaluación activa (${active.classroomName})` : 'Evaluación en curso');
      return { inUse: true, sessionTitle: title, isActive: true };
    }

    // 2. Verificar sesiones guardadas
    const savedCheck = isClassroomInSavedSession(classroomId);
    if (savedCheck && savedCheck.inUse) {
      return { inUse: true, sessionTitle: savedCheck.sessionTitle, sessionId: savedCheck.sessionId, isSaved: true };
    }

    return { inUse: false };
  }

  /**
   * Verifica si una pregunta (por ID o prompt) está presente en alguna sesión guardada
   * @param {string} identifier
   * @param {string} [optionalPrompt]
   * @returns {{inUse: boolean, sessionTitle?: string, sessionId?: string}}
   */
  function isQuestionInSavedSession(identifier, optionalPrompt) {
    if (!identifier && !optionalPrompt) return { inUse: false };
    const targets = [];
    if (identifier) {
      const t1 = String(identifier).trim().toLowerCase();
      if (t1.length >= 2) {
        targets.push(t1);
        const baseId = t1.replace(/_q\d+$/, '');
        if (baseId !== t1 && baseId.length >= 2) targets.push(baseId);
      }
    }
    if (optionalPrompt) {
      const t2 = String(optionalPrompt).trim().toLowerCase();
      if (t2.length >= 2 && !targets.includes(t2)) targets.push(t2);
    }
    if (targets.length === 0) return { inUse: false };

    const list = getSavedSessions();

    for (const sess of list) {
      const sessTitle = sess.title || (sess.branchTitle ? `${sess.branchTitle} (${sess.classroomName || 'Salón'})` : (sess.classroomName || 'Sesión guardada'));
      const sEvalId = sess.evalId ? String(sess.evalId).trim().toLowerCase() : '';
      const sPrompt = sess.prompt ? String(sess.prompt).trim().toLowerCase() : '';

      for (const target of targets) {
        if (sEvalId && sEvalId === target) return { inUse: true, sessionTitle: sessTitle, sessionId: sess.id };
        if (sPrompt && (sPrompt === target || (target.length > 15 && (sPrompt.includes(target) || target.includes(sPrompt))))) {
          return { inUse: true, sessionTitle: sessTitle, sessionId: sess.id };
        }
      }

      if (Array.isArray(sess.questions)) {
        for (const q of sess.questions) {
          if (!q) continue;
          const qId = q.id ? String(q.id).trim().toLowerCase() : '';
          const qPrompt = q.prompt ? String(q.prompt).trim().toLowerCase() : '';
          for (const target of targets) {
            if (qId && (qId === target || qId.replace(/_q\d+$/, '') === target)) {
              return { inUse: true, sessionTitle: sessTitle, sessionId: sess.id };
            }
            if (qPrompt && (qPrompt === target || (target.length > 15 && (qPrompt.includes(target) || target.includes(qPrompt))))) {
              return { inUse: true, sessionTitle: sessTitle, sessionId: sess.id };
            }
          }
        }
      }

      if (sess.wizardEval && Array.isArray(sess.wizardEval.questions)) {
        for (const q of sess.wizardEval.questions) {
          if (!q) continue;
          const qId = q.id ? String(q.id).trim().toLowerCase() : '';
          const qPrompt = q.prompt ? String(q.prompt).trim().toLowerCase() : '';
          for (const target of targets) {
            if (qId && (qId === target || qId.replace(/_q\d+$/, '') === target)) {
              return { inUse: true, sessionTitle: sessTitle, sessionId: sess.id };
            }
            if (qPrompt && (qPrompt === target || (target.length > 15 && (qPrompt.includes(target) || target.includes(qPrompt))))) {
              return { inUse: true, sessionTitle: sessTitle, sessionId: sess.id };
            }
          }
        }
      }
    }
    return { inUse: false };
  }

  /**
   * Devuelve todas las sesiones guardadas donde se esté utilizando una pregunta.
   * @param {string} identifier ID o enunciado de la pregunta
   * @param {string} [optionalPrompt] Enunciado adicional de la pregunta
   * @returns {Array<{sessionId: string, sessionNumber: number, title: string, classroomName: string, branch: string}>}
   */
  function getQuestionSavedSessions(identifier, optionalPrompt) {
    if (!identifier && !optionalPrompt) return [];
    const targets = [];
    if (identifier) {
      const t1 = String(identifier).trim().toLowerCase();
      if (t1.length >= 2) {
        targets.push(t1);
        const baseId = t1.replace(/_q\d+$/, '');
        if (baseId !== t1 && baseId.length >= 2) targets.push(baseId);
      }
    }
    if (optionalPrompt) {
      const t2 = String(optionalPrompt).trim().toLowerCase();
      if (t2.length >= 2 && !targets.includes(t2)) targets.push(t2);
    }
    if (targets.length === 0) return [];

    const list = getSavedSessions();
    const matched = [];

    list.forEach((sess, idx) => {
      let inUse = false;
      const sessNum = idx + 1;
      const sessTitle = sess.title || (sess.branchTitle ? `${sess.branchTitle} (${sess.classroomName || 'Salón'})` : (sess.classroomName || `Sesión ${sessNum}`));
      const sEvalId = sess.evalId ? String(sess.evalId).trim().toLowerCase() : '';
      const sPrompt = sess.prompt ? String(sess.prompt).trim().toLowerCase() : '';

      for (const target of targets) {
        if (sEvalId && sEvalId === target) inUse = true;
        else if (sPrompt && (sPrompt === target || (target.length > 15 && (sPrompt.includes(target) || target.includes(sPrompt))))) inUse = true;
        if (inUse) break;
      }

      if (!inUse && Array.isArray(sess.questions)) {
        for (const q of sess.questions) {
          if (!q) continue;
          const qId = q.id ? String(q.id).trim().toLowerCase() : '';
          const qPrompt = q.prompt ? String(q.prompt).trim().toLowerCase() : '';
          for (const target of targets) {
            if (qId && (qId === target || qId.replace(/_q\d+$/, '') === target)) { inUse = true; break; }
            if (qPrompt && (qPrompt === target || (target.length > 15 && (qPrompt.includes(target) || target.includes(qPrompt))))) { inUse = true; break; }
          }
          if (inUse) break;
        }
      }

      if (!inUse && sess.wizardEval && Array.isArray(sess.wizardEval.questions)) {
        for (const q of sess.wizardEval.questions) {
          if (!q) continue;
          const qId = q.id ? String(q.id).trim().toLowerCase() : '';
          const qPrompt = q.prompt ? String(q.prompt).trim().toLowerCase() : '';
          for (const target of targets) {
            if (qId && (qId === target || qId.replace(/_q\d+$/, '') === target)) { inUse = true; break; }
            if (qPrompt && (qPrompt === target || (target.length > 15 && (qPrompt.includes(target) || target.includes(qPrompt))))) { inUse = true; break; }
          }
          if (inUse) break;
        }
      }

      if (inUse) {
        matched.push({
          sessionId: sess.id,
          sessionNumber: sessNum,
          title: sessTitle,
          classroomName: sess.classroomName || 'Salón',
          branch: sess.branch || 'rama1'
        });
      }
    });

    return matched;
  }

  /**
   * Purga rigurosa de datos no conformes (Guardarraíles del Sistema - MANUAL_SISTEMA.md):
   * 1. Elimina salones con 0 alumnos (no existe salón sin alumnos).
   * 2. Elimina sesiones guardadas asociadas a salones sin alumnos o inexistentes.
   * 3. Elimina preguntas del banco incompletas o sin rúbrica de IA (Regla 6).
   */
  function purgeNonCompliantData() {
    // Si los salones aún no han terminado de cargarse desde Supabase, no purgar
    if (Object.keys(CLASSROOMS).length === 0) return;

    // 1. Purga salones vacíos en memoria y registra sus IDs
    const emptyClassroomIds = new Set();
    Object.keys(CLASSROOMS).forEach(id => {
      const cls = CLASSROOMS[id];
      if (cls && (!cls.students || cls.students.length === 0)) {
        emptyClassroomIds.add(id);
        delete CLASSROOMS[id];
      }
    });

    // 2. Purga sesiones guardadas vacías o con salones sin alumnos
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY_SAVED_SESSIONS);
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) {
            const clean = arr.filter(s => {
              if (!s || !s.classroomId) return false;
              if (emptyClassroomIds.has(s.classroomId)) return false;
              const cls = CLASSROOMS[s.classroomId];
              // Solo purgar si el salón existe en memoria pero tiene 0 alumnos
              if (cls && (!cls.students || cls.students.length === 0)) {
                return false;
              }
              return true;
            });
            window.localStorage.setItem(STORAGE_KEY_SAVED_SESSIONS, JSON.stringify(clean));
          }
        }
      } catch (e) {
        console.warn('[purgeNonCompliantData sessions]', e);
      }
    }

    // 3. Purga preguntas del banco sin rúbrica o sin alternativas completas (Regla 6)
    Object.keys(EVALUATIONS).forEach(id => {
      const ev = EVALUATIONS[id];
      if (!ev) return;
      if (ev.type === 'mc' && (!ev.options || !ev.correct)) {
        delete EVALUATIONS[id];
        return;
      }
      if (!ev.rubric && !ev.rubrica) {
        delete EVALUATIONS[id];
      }
    });

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const rawBank = window.localStorage.getItem(STORAGE_KEY_BANK);
        if (rawBank) {
          const bank = JSON.parse(rawBank);
          if (Array.isArray(bank)) {
            const cleanBank = bank.filter(ev => {
              if (ev.type === 'mc' && (!ev.options || !ev.correct)) return false;
              return !!(ev.rubric || ev.rubrica);
            });
            window.localStorage.setItem(STORAGE_KEY_BANK, JSON.stringify(cleanBank));
          }
        }
      } catch (e) {
        console.warn('[purgeNonCompliantData bank]', e);
      }
    }

    // 4. Si la sesión activa en memoria no cumple, anularla
    const active = getActiveSession();
    if (active && active.classroomId) {
      const cls = CLASSROOMS[active.classroomId];
      if (!cls || !cls.students || cls.students.length === 0) {
        setActiveSession(null);
      }
    }
  }

  // Exportación universal
  const ClassroomData = {
    CLASSROOMS,
    EVALUATIONS,
    GRADE_CATALOG,
    DEFAULT_GRADE_STAGE,
    formatGrade,
    getGradeOptions,
    getGradeStages,
    getClassroomList,
    getEvaluationList,
    getIndividualMCQuestions,
    getClassroom,
    getClassroomColor,
    pickColorForNewClassroom() {
      const count = Object.keys(CLASSROOMS).length;
      return CLASSROOM_COLOR_PALETTE[count % CLASSROOM_COLOR_PALETTE.length] || '#3b82f6';
    },
    getClassroomGrade,
    getEvaluation,
    getEvaluationRubric,
    getStudent,
    saveCustomEvaluation,
    deleteCustomEvaluation,
    setClassroomGrade,
    setActiveSession,
    getActiveSession,
    getSavedSessions,
    syncSessionsWithCloud,
    saveSession,
    deleteSavedSession,
    isClassroomInSavedSession,
    isClassroomInUse,
    isQuestionInSavedSession,
    getQuestionSavedSessions,
    MAX_SAVED_SESSIONS,
    flushSyncQueue,
    purgeNonCompliantData,

    updateStudent(classroomId, studentCode, fullName, shortName) {
      const cls = CLASSROOMS[classroomId];
      if (!cls || !cls.students) return false;
      const st = cls.students.find(s => s.id === studentCode);
      if (st) {
        st.name = fullName;
        st.shortName = shortName;
        return true;
      }
      return false;
    },

    deleteStudent(classroomId, studentCode) {
      const cls = CLASSROOMS[classroomId];
      if (!cls || !cls.students) return false;
      cls.students = cls.students.filter(s => s.id !== studentCode);
      return true;
    },

    /**
     * Reemplaza el runtime de salones con datos frescos de Supabase.
     * Recibe un array en el formato { id, name, gradeCode, color, students[] }
     * más, si la migración ya se aplicó, { gradeStage, gradeLevel }.
     * Preserva la paleta de colores si el salón no tiene color propio.
     */
    setClassrooms(list) {
      // Limpiar los salones del runtime (conservar el objeto para no romper referencias)
      Object.keys(CLASSROOMS).forEach(k => delete CLASSROOMS[k]);
      list.forEach((cls, idx) => {
        CLASSROOMS[cls.id] = {
          id: cls.id,
          name: cls.name,
          gradeCode: cls.gradeCode || cls.id,
          // Grado: se normaliza la etapa vacía a 'primaria' porque hasta que
          // exista secundaria habilitada, "sin etapa" siempre significa primaria.
          gradeStage: cls.gradeStage || (cls.gradeLevel ? DEFAULT_GRADE_STAGE : null),
          gradeLevel: cls.gradeLevel || null,
          color: cls.color || CLASSROOM_COLOR_PALETTE[idx % CLASSROOM_COLOR_PALETTE.length],
          students: (cls.students || []).map((s, si) => ({
            id: s.id || `ALUM_${String(si + 1).padStart(2, '0')}`,
            name: s.name || s.fullName || '',
            shortName: s.shortName || s.short_name || s.name || ''
          }))
        };
      });
    },

    /**
     * Carga el historial de evaluaciones recientes del docente (desde Supabase)
     * al banco local, para que renderBankCards() las muestre.
     * Recibe filas de microeval_evaluations.
     *
     * Una evaluación se identifica por su ENUNCIADO, no por su id: el id local
     * (EVA_DOC_1234) y el de la base (un uuid) son distintos para la MISMA
     * pregunta. Comparando por id, el banco mostraba la misma pregunta DOS veces
     * —una con su rúbrica y otra recién traída de la base, que podía aparecer
     * como "falta la rúbrica"—. Que la identidad sea el enunciado es además
     * coherente con saveEvaluation(), que ya busca por enunciado para no duplicar.
     *
     * Nunca se pierde lo que la copia local tiene y la de la base no.
     */
    setRecentEvaluations(list) {
      (list || []).forEach(ev => {
        if (!ev || !ev.prompt) return;
        const promptLimpio = String(ev.prompt || '').trim();
        if (ev.branch === 'rama3' || /^Pregunta\s+\d+$/i.test(promptLimpio) || promptLimpio.startsWith('Cartilla de respuestas')) {
          return;
        }

        const idLocal = Object.keys(EVALUATIONS)
          .find(k => EVALUATIONS[k] && EVALUATIONS[k].prompt === ev.prompt);
        const id = idLocal || ev.id || `EVA_REC_${Date.now()}`;
        const previa = EVALUATIONS[id] || null;

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
          questions: ev.questions || (previa ? previa.questions : null) || undefined
        });
      });

      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          window.localStorage.setItem(STORAGE_KEY_BANK, JSON.stringify(EVALUATIONS));
        } catch (e) {}
      }
    }
  };

  global.ClassroomData = ClassroomData;

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
