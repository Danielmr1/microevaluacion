/**
 * Módulo de Datos del Aula: Salones, Nóminas de Estudiantes y Catálogo de Grados
 * Microevaluación Formativa de Clase A5
 *
 * Funcionalidad:
 * 1. Nóminas escalables de estudiantes por salón (gestión en memoria y Supabase).
 * 2. Catálogo canónico de grados y etapas educativas (Primaria / Secundaria).
 * 3. Funciones auxiliares para emparejamiento con código QR y generación de tarjetas.
 */

(function (global) {
  'use strict';

  const ClassroomData = global.ClassroomData = global.ClassroomData || {};

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


  function getClassroomList() {
    return Object.values(CLASSROOMS).map(c => ({ id: c.id, name: c.name, count: c.students.length }));
  }

  function getClassroom(classroomId) {
    return CLASSROOMS[classroomId] || null;
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

  function pickColorForNewClassroom() {
    const count = Object.keys(CLASSROOMS).length;
    return CLASSROOM_COLOR_PALETTE[count % CLASSROOM_COLOR_PALETTE.length] || '#3b82f6';
  }

  function updateStudent(classroomId, studentCode, fullName, shortName) {
    const cls = CLASSROOMS[classroomId];
    if (!cls || !cls.students) return false;
    const st = cls.students.find(s => s.id === studentCode);
    if (st) {
      st.name = fullName;
      st.shortName = shortName;
      return true;
    }
    return false;
  }

  function deleteStudent(classroomId, studentCode) {
    const cls = CLASSROOMS[classroomId];
    if (!cls || !cls.students) return false;
    cls.students = cls.students.filter(s => s.id !== studentCode);
    return true;
  }

    /**
     * Reemplaza el runtime de salones con datos frescos de Supabase.
     * Recibe un array en el formato { id, name, gradeCode, color, students[] }
     * más, si la migración ya se aplicó, { gradeStage, gradeLevel }.
     * Preserva la paleta de colores si el salón no tiene color propio.
     */
  function setClassrooms(list) {
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
    }

  // Asignar al objeto universal
  Object.assign(ClassroomData, {
    CLASSROOMS,
    GRADE_CATALOG,
    DEFAULT_GRADE_STAGE,
    formatGrade,
    getGradeOptions,
    getGradeStages,
    getClassroomList,
    getClassroom,
    getClassroomColor,
    pickColorForNewClassroom,
    getClassroomGrade,
    setClassroomGrade,
    getStudent,
    updateStudent,
    deleteStudent,
    setClassrooms
  });

  global.ClassroomData = ClassroomData;

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
