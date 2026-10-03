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
    { stage: 'secundaria', label: 'Secundaria', grades: [] }
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

  // Cargar evaluaciones guardadas previamente en localStorage.
  //
  // La clave subió a v2 para que el banco viejo de cada navegador quede
  // ignorado: si no, las preguntas guardadas antes de esta regla (sin rúbrica ni
  // grado) volverían a aparecer aunque se hubieran borrado de la base.
  const STORAGE_KEY_BANK = 'microeval_teacher_bank_v2';
  const STORAGE_KEY_BANK_VIEJO = 'microeval_teacher_bank_v1';
  const STORAGE_KEY_SESSION = 'microeval_active_session_v1';

  function loadSavedBank() {
    if (typeof window !== 'undefined' && window.localStorage) {
      // Se borra el banco con la clave vieja para que no quede ocupando lugar ni
      // pueda reaparecer si alguna vez se vuelve a usar esa clave.
      try { window.localStorage.removeItem(STORAGE_KEY_BANK_VIEJO); } catch (e) {}

      try {
        const raw = window.localStorage.getItem(STORAGE_KEY_BANK);
        if (raw) {
          const bank = JSON.parse(raw);
          Object.assign(EVALUATIONS, bank);
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
    return EVALUATIONS[evalId] || null;
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
  function saveCustomEvaluation(evalData) {
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

    // Propiedades de formato Opción Múltiple (OMR)
    if (evalData.type) newEval.type = evalData.type;
    if (evalData.questionCount) newEval.questionCount = evalData.questionCount;
    if (evalData.questions) newEval.questions = evalData.questions;

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

    return newEval;
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
        window.localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));
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
    getClassroom,
    getClassroomColor,
    getClassroomGrade,
    getEvaluation,
    getEvaluationRubric,
    getStudent,
    saveCustomEvaluation,
    setClassroomGrade,
    setActiveSession,
    getActiveSession,

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

        const idLocal = Object.keys(EVALUATIONS)
          .find(k => EVALUATIONS[k] && EVALUATIONS[k].prompt === ev.prompt);
        const id = idLocal || ev.id || `EVA_REC_${Date.now()}`;
        const previa = EVALUATIONS[id] || null;

        EVALUATIONS[id] = {
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
        };
      });
    }
  };

  global.ClassroomData = ClassroomData;

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
