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

  // --- CATÁLOGO DE SALONES Y NÓMINAS ---
  const CLASSROOMS = {
    '3A': {
      id: '3A',
      name: '3° Primaria "A"',
      grade: '3° de Primaria',
      section: 'A',
      color: '#3b82f6',
      students: [
        { id: 'ALUM_01', name: 'Mateo García Rodríguez', shortName: 'Mateo García' },
        { id: 'ALUM_02', name: 'Sofía López Pérez', shortName: 'Sofía López' },
        { id: 'ALUM_03', name: 'Lucas Mendoza Silva', shortName: 'Lucas Mendoza' },
        { id: 'ALUM_04', name: 'Valentina Castro Vega', shortName: 'Valentina Castro' },
        { id: 'ALUM_05', name: 'Thiago Paredes Ruiz', shortName: 'Thiago Paredes' },
        { id: 'ALUM_06', name: 'Camila Soto Morales', shortName: 'Camila Soto' },
        { id: 'ALUM_07', name: 'Joaquín Navarro Flores', shortName: 'Joaquín Navarro' },
        { id: 'ALUM_08', name: 'Lucía Gómez Herrera', shortName: 'Lucía Gómez' },
        { id: 'ALUM_09', name: 'Matías Rivas Espinoza', shortName: 'Matías Rivas' },
        { id: 'ALUM_10', name: 'Emma Chávez Cabrera', shortName: 'Emma Chávez' }
      ]
    },

    '3B': {
      id: '3B',
      name: '3° Primaria "B"',
      grade: '3° de Primaria',
      section: 'B',
      color: '#22c55e',
      students: [
        { id: 'ALUM_01', name: 'Álvaro Guzmán Miranda', shortName: 'Álvaro Guzmán' },
        { id: 'ALUM_02', name: 'Daniela Salazar Rojas', shortName: 'Daniela Salazar' },
        { id: 'ALUM_03', name: 'Leonardo Campos Núñez', shortName: 'Leonardo Campos' },
        { id: 'ALUM_04', name: 'Valeria Osorio Solís', shortName: 'Valeria Osorio' },
        { id: 'ALUM_05', name: 'Emilio Cáceres Palma', shortName: 'Emilio Cáceres' },
        { id: 'ALUM_06', name: 'Abril Bustamante Vidal', shortName: 'Abril Bustamante' },
        { id: 'ALUM_07', name: 'Maximiliano Figueroa Rey', shortName: 'Maximiliano Figueroa' },
        { id: 'ALUM_08', name: 'Elena Cornejo Arce', shortName: 'Elena Cornejo' },
        { id: 'ALUM_09', name: 'Julián Montiel Valenzuela', shortName: 'Julián Montiel' },
        { id: 'ALUM_10', name: 'Constanza Aguilar Meza', shortName: 'Constanza Aguilar' }
      ]
    }
  };

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

  function getClassroom(classroomId) {
    return CLASSROOMS[classroomId] || CLASSROOMS['3A'];
  }

  function getEvaluation(evalId) {
    return EVALUATIONS[evalId] || EVALUATIONS['EVA_01'];
  }

  function getStudent(classroomId, studentId) {
    const classroom = getClassroom(classroomId);
    return classroom.students.find(s => s.id === studentId) || null;
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
    getClassroomList,
    getEvaluationList,
    getClassroom,
    getClassroomColor,
    getEvaluation,
    getStudent,
    saveCustomEvaluation,
    setActiveSession,
    getActiveSession,

    /**
     * Reemplaza el runtime de salones con datos frescos de Supabase.
     * Recibe un array en el formato { id, name, gradeCode, color, students[] }.
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
