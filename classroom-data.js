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

  // --- CATÁLOGO DE MICROEVALUACIONES (Problemas Matemáticos) ---
  const EVALUATIONS = {
    'EVA_01': {
      id: 'EVA_01',
      title: 'Suma con Canje: Biblioteca',
      prompt: 'En la biblioteca había 47 libros de cuentos y llegaron 38 libros nuevos. ¿Cuántos libros hay ahora en total?',
      operation: '47 + 38',
      expectedAnswer: '85',
      unitHint: '(unidades: libros, cuentos)'
    },

    'EVA_02': {
      id: 'EVA_02',
      title: 'Resta con Canje: Panadería',
      prompt: 'La panadería de don Pepe horneó 94 panes en la mañana y vendió 56 al mediodía. ¿Cuántos panes le quedan por vender?',
      operation: '94 - 56',
      expectedAnswer: '38',
      unitHint: '(unidades: panes)'
    },

    'EVA_03': {
      id: 'EVA_03',
      title: 'Multiplicación Inicial: Cajas de Manzanas',
      prompt: 'En la tienda colocaron 6 cajas con 8 manzanas rojas cada una. ¿Cuántas manzanas hay en total en las cajas?',
      operation: '6 × 8',
      expectedAnswer: '48',
      unitHint: '(unidades: manzanas)'
    }
  };

  // Cargar evaluaciones guardadas previamente en localStorage
  const STORAGE_KEY_BANK = 'microeval_teacher_bank_v1';
  const STORAGE_KEY_SESSION = 'microeval_active_session_v1';

  function loadSavedBank() {
    if (typeof window !== 'undefined' && window.localStorage) {
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
    return Object.values(EVALUATIONS).map(e => ({ id: e.id, title: e.title, expectedAnswer: e.expectedAnswer, prompt: e.prompt }));
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

  function getEvaluation(evalId) {
    return EVALUATIONS[evalId] || EVALUATIONS['EVA_01'];
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
   */
  function saveCustomEvaluation(evalData) {
    const id = evalData.id || ('EVA_DOC_' + Date.now().toString().slice(-4));
    const newEval = {
      id: id,
      title: evalData.title || 'Evaluación del Día',
      prompt: evalData.prompt.trim(),
      expectedAnswer: String(evalData.expectedAnswer).trim(),
      unitHint: evalData.unitHint ? evalData.unitHint.trim() : ''
    };

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
     * Recibe un array con { id, title, prompt, expected_answer }.
     */
    setRecentEvaluations(list) {
      list.forEach(ev => {
        const id = ev.id || `EVA_REC_${Date.now()}`;
        EVALUATIONS[id] = {
          id,
          title: ev.title || 'Evaluación',
          prompt: ev.prompt,
          expectedAnswer: ev.expected_answer,
          unitHint: ''
        };
      });
    }
  };

  global.ClassroomData = ClassroomData;

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
