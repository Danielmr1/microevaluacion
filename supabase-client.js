/**
 * supabase-client.js
 * Módulo de integración con Supabase para MicroEval.
 * Gestiona: autenticación Google, salones, alumnos, banco de evaluaciones, resultados y sesiones.
 */
(function (global) {
  'use strict';

  const SUPABASE_URL = 'https://bpffczohkcpoxyhzvdru.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwZmZjem9oa2Nwb3h5aHp2ZHJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2NTIyNTQsImV4cCI6MjEwMjIyODI1NH0.H9jTZ_oeU5KRXdDOe1ZWwv1sxfL2hN4LdPO64pkYPBA';

  // Cliente de Supabase (inicializado cuando el SDK carga)
  let _client = null;
  let _cachedUser = null;

  function getClient() {
    if (!_client) {
      if (typeof supabase === 'undefined' || !supabase.createClient) {
        console.error('[SupabaseClient] SDK no cargado todavía.');
        return null;
      }
      _client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return _client;
  }

  // ─────────────────────────────────────────────
  // AUTENTICACIÓN
  // ─────────────────────────────────────────────

  /**
   * Inicia sesión con Google OAuth.
   * Redirige al proveedor y vuelve a la misma URL.
   */
  async function signInWithGoogle() {
    const client = getClient();
    if (!client) {
      throw new Error('No se pudo inicializar la conexión con el servidor. Verifica tu conexión y recarga.');
    }
    const redirectUrl = (typeof window !== 'undefined' && window.location && window.location.origin)
      ? (window.location.origin + window.location.pathname)
      : 'https://danielmr1.github.io/microevaluacion/';

    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectUrl }
    });

    if (error) {
      console.error('[Auth] Error al iniciar con Google:', error.message);
      throw error;
    }
    if (data && data.url) {
      window.location.href = data.url;
    }
  }

  /**
   * Cierra la sesión actual.
   */
  async function signOut() {
    _cachedUser = null;
    const client = getClient();
    if (!client) return;
    await client.auth.signOut();
  }

  /**
   * Devuelve el usuario autenticado actualmente en memoria (síncrono), o null.
   */
  function getCachedUser() {
    return _cachedUser;
  }

  /**
   * Devuelve el usuario autenticado actualmente, o null.
   */
  async function getCurrentUser() {
    const client = getClient();
    if (!client) return _cachedUser;
    try {
      const { data: { user } } = await client.auth.getUser();
      _cachedUser = user || null;
      return _cachedUser;
    } catch (e) {
      return _cachedUser;
    }
  }

  /**
   * Suscribe a cambios de estado de autenticación.
   * callback(event, session) se llama al login/logout/restore.
   */
  function onAuthStateChange(callback) {
    const client = getClient();
    if (!client) return;
    client.auth.onAuthStateChange((event, session) => {
      _cachedUser = (session && session.user) ? session.user : null;
      if (typeof callback === 'function') callback(event, session);
    });
  }

  // ─────────────────────────────────────────────
  // SALONES
  // ─────────────────────────────────────────────

  /**
   * Carga todos los salones del docente autenticado.
   * @returns {Promise<Array>} Lista de salones con sus alumnos.
   */
  async function loadClassrooms() {
    const client = getClient();
    if (!client) return [];

    const { data: classrooms, error } = await client
      .from('microeval_classrooms')
      .select('*, microeval_students(*)')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[SupabaseClient] Error cargando salones:', error.message);
      return [];
    }

    // Ordenar alumnos por posición dentro de cada salón
    return (classrooms || []).map(cls => ({
      ...cls,
      microeval_students: (cls.microeval_students || []).sort((a, b) => a.position - b.position)
    }));
  }

  /**
   * Crea un salón nuevo para el docente autenticado.
   * @param {string} name Nombre del salón, ej. "4° Primaria A"
   * @param {string} gradeCode Código corto, ej. "4A"
   * @param {string} color Color hex, ej. "#3b82f6"
   * @param {string} [gradeStage] 'primaria' | 'secundaria' (opcional)
   * @param {number} [gradeLevel] Número de grado (opcional)
   * @returns {Promise<object|null>} El salón creado o null si hubo error.
   */
  async function createClassroom(name, gradeCode, color, gradeStage, gradeLevel) {
    const client = getClient();
    if (!client) return null;
    const user = await getCurrentUser();
    if (!user) return null;

    const row = { teacher_id: user.id, name, grade_code: gradeCode, color: color || '#3b82f6' };
    if (gradeStage && gradeLevel) {
      row.grade_stage = gradeStage;
      row.grade_level = gradeLevel;
    }

    let { data, error } = await client
      .from('microeval_classrooms')
      .insert(row)
      .select()
      .single();

    // Si la migración de grade_stage todavía no se aplicó, el insert CON las
    // columnas de grado falla entero y el salón no se crearía. Se reintenta sin
    // ellas: es preferible tener el salón sin grado (se completa después desde
    // el selector) a no poder crearlo.
    if (error && (error.code === '42703' || /grade_stage|grade_level/.test(error.message || ''))) {
      console.warn('[SupabaseClient] Faltan las columnas de grado; se crea el salón sin grado. ' +
        'Corré supabase/migrations/20260928010000_grade_stage.sql para que se guarde.');
      const reintento = await client
        .from('microeval_classrooms')
        .insert({ teacher_id: user.id, name, grade_code: gradeCode, color: color || '#3b82f6' })
        .select()
        .single();
      data = reintento.data;
      error = reintento.error;
    }

    if (error) {
      console.error('[SupabaseClient] Error creando salón:', error.message);
      return null;
    }
    return data;
  }

  /**
   * Elimina un salón.
   *
   * Por CASCADE se lleva sus alumnos (microeval_students) y todos los
   * resultados guardados de ese salón (microeval_results). Conviene confirmarlo
   * en la interfaz antes de llamar.
   *
   * Filtra además por teacher_id para no depender solo de la política RLS: si
   * alguna vez esa política quedara mal escrita, esto evita que un docente
   * borre el salón de otro.
   *
   * @param {string} classroomId UUID del salón
   * @returns {Promise<boolean>} true si se borró
   */
  async function deleteClassroom(classroomId) {
    const client = getClient();
    if (!client) return false;
    if (!classroomId) return false;

    const user = await getCurrentUser();
    if (!user) {
      console.error('[SupabaseClient] Sin sesión: no se puede borrar el salón.');
      return false;
    }

    const { error } = await client
      .from('microeval_classrooms')
      .delete()
      .eq('id', classroomId)
      .eq('teacher_id', user.id);

    if (error) {
      console.error('[SupabaseClient] Error borrando el salón:', error.message);
      return false;
    }
    return true;
  }

  /**
   * Guarda el grado de un salón.
   *
   * Es TOLERANTE a que la migración todavía no se haya aplicado: si las
   * columnas grade_stage / grade_level no existen, avisa por consola con la
   * instrucción concreta y devuelve false, pero NUNCA lanza ni bloquea el
   * asistente. El grado sigue funcionando en memoria durante la sesión.
   *
   * @param {string} classroomId UUID del salón
   * @param {string|null} stage 'primaria' | 'secundaria' | null para limpiar
   * @param {number|null} level
   * @returns {Promise<boolean>} true si quedó guardado en la base
   */
  async function updateClassroomGrade(classroomId, stage, level) {
    const client = getClient();
    if (!client) return false;
    if (!classroomId) return false;

    const { error } = await client
      .from('microeval_classrooms')
      .update({ grade_stage: stage || null, grade_level: (stage && level) ? level : null })
      .eq('id', classroomId);

    if (error) {
      if (error.code === '42703' || /grade_stage|grade_level/.test(error.message || '')) {
        console.warn('[SupabaseClient] Las columnas de grado no existen todavía. ' +
          'Corré supabase/migrations/20260928010000_grade_stage.sql en el SQL Editor. ' +
          'El grado queda solo en memoria por ahora.');
      } else {
        console.error('[SupabaseClient] Error guardando el grado:', error.message);
      }
      return false;
    }
    return true;
  }

  // ─────────────────────────────────────────────
  // ALUMNOS — carga desde Excel / CSV
  // ─────────────────────────────────────────────

  /**
   * Importa lista de alumnos desde un array de objetos.
   * Reemplaza todos los alumnos del salón.
   * @param {string} classroomId UUID del salón
   * @param {Array<{fullName, shortName}>} students
   */
  async function importStudents(classroomId, students) {
    const client = getClient();
    if (!client) return false;

    // Borrar alumnos anteriores
    await client.from('microeval_students').delete().eq('classroom_id', classroomId);

    const rows = students.map((s, idx) => ({
      classroom_id: classroomId,
      student_code: `ALUM_${String(idx + 1).padStart(2, '0')}`,
      full_name: s.fullName,
      short_name: s.shortName,
      position: idx + 1
    }));

    const { error } = await client.from('microeval_students').insert(rows);
    if (error) {
      console.error('[SupabaseClient] Error importando alumnos:', error.message);
      return false;
    }
    return true;
  }

  /**
   * Actualiza los datos de un alumno específico (nombre completo y/o nombre corto).
   * @param {string} classroomId UUID del salón
   * @param {string} studentCode Código único del alumno (ej: 'ALUM_01')
   * @param {string} fullName Nombre completo actualizado
   * @param {string} shortName Nombre corto actualizado
   * @returns {Promise<boolean>} true si se actualizó con éxito
   */
  async function updateStudent(classroomId, studentCode, fullName, shortName) {
    const client = getClient();
    if (!client || !classroomId || !studentCode) return false;

    const user = await getCurrentUser();
    if (!user) return false;

    const { error } = await client
      .from('microeval_students')
      .update({
        full_name: fullName,
        short_name: shortName
      })
      .eq('classroom_id', classroomId)
      .eq('student_code', studentCode);

    if (error) {
      console.error('[SupabaseClient] Error actualizando alumno:', error.message);
      return false;
    }
    return true;
  }

  /**
   * Elimina un alumno específico de un salón.
   * @param {string} classroomId UUID del salón
   * @param {string} studentCode Código único del alumno (ej: 'ALUM_01')
   * @returns {Promise<boolean>} true si se eliminó con éxito
   */
  async function deleteStudent(classroomId, studentCode) {
    const client = getClient();
    if (!client || !classroomId || !studentCode) return false;

    const user = await getCurrentUser();
    if (!user) return false;

    const { error } = await client
      .from('microeval_students')
      .delete()
      .eq('classroom_id', classroomId)
      .eq('student_code', studentCode);

    if (error) {
      console.error('[SupabaseClient] Error eliminando alumno:', error.message);
      return false;
    }
    return true;
  }


  // ─────────────────────────────────────────────
  // BANCO DE EVALUACIONES (historial personal)
  // ─────────────────────────────────────────────

  /**
   * Guarda o actualiza una evaluación en el historial del docente.
   * Si ya existe una con el mismo prompt, incrementa el contador.
   *
   * Una evaluación del banco nace CON su rúbrica y CON su grado: la rúbrica se
   * genera tomando el grado como contexto, así que el grado que se usó tiene que
   * quedar guardado junto a ella. Si la IA falló, se guarda igual sin rúbrica y
   * la app la reclama después — pero no podrá usarse para corregir hasta que
   * esté.
   *
   * @param {object} datos
   * @param {string} datos.prompt enunciado
   * @param {string} datos.expectedAnswer respuesta confirmada por el docente
   * @param {string} [datos.title]
   * @param {object} [datos.rubric] rúbrica generada. Va en una sola columna jsonb
   *        porque su forma todavía va a cambiar y no conviene migrar cada vez.
   * @param {string} [datos.gradeStage] 'primaria' | 'secundaria'
   * @param {number} [datos.gradeLevel] 4, 5, 6...
   * @param {string} [datos.gradeText] el mismo grado como texto: "4° de primaria"
   * @returns {Promise<object|null>}
   */
  async function saveEvaluation(datos) {
    const client = getClient();
    if (!client) return null;
    const user = await getCurrentUser();
    if (!user) return null;

    const d = datos || {};
    const prompt = d.prompt;
    const expectedAnswer = d.expectedAnswer;
    if (!prompt) { console.warn('[SupabaseClient] saveEvaluation sin enunciado.'); return null; }
    const pTrim = String(prompt).trim();
    if (d.branch === 'rama3' || /^Pregunta\s+\d+$/i.test(pTrim) || pTrim.startsWith('Cartilla de respuestas')) {
      return null;
    }

    // Buscar si ya existe
    const { data: existing } = await client
      .from('microeval_evaluations')
      .select('id, used_count')
      .eq('teacher_id', user.id)
      .eq('prompt', prompt)
      .maybeSingle();

    const campos = { expected_answer: expectedAnswer };
    if (d.rubric) campos.rubric = d.rubric;
    if (d.gradeStage) campos.grade_stage = d.gradeStage;
    if (d.gradeLevel) campos.grade_level = d.gradeLevel;
    if (d.gradeText) campos.grade_text = d.gradeText;
    if (d.type) campos.type = d.type;
    if (d.questionCount) campos.question_count = d.questionCount;
    if (d.questions) campos.questions = d.questions;

    if (existing) {
      const { data, error } = await client
        .from('microeval_evaluations')
        .update(Object.assign({}, campos, {
          used_count: existing.used_count + 1,
          last_used_at: new Date().toISOString()
        }))
        .eq('id', existing.id)
        .select()
        .single();

      if (!error) return data;

      // Mismo criterio que en el alta: si el problema son las columnas que
      // todavía no existen, se guarda lo mínimo pero CONSERVANDO la rúbrica y preguntas.
      if (esColumnaFaltante(error)) {
        console.warn('[SupabaseClient] Faltan columnas nuevas en microeval_evaluations; se guarda con lo que haya. ' +
          'Corré las migraciones de supabase/migrations/.');
        const conserva = { expected_answer: expectedAnswer };
        if (campos.rubric) conserva.rubric = campos.rubric;
        if (campos.type) conserva.type = campos.type;
        if (campos.questions) conserva.questions = campos.questions;
        const reintento = await client
          .from('microeval_evaluations')
          .update(Object.assign({}, conserva, {
            used_count: existing.used_count + 1,
            last_used_at: new Date().toISOString()
          }))
          .eq('id', existing.id)
          .select()
          .single();
        if (!reintento.error) return reintento.data;
        console.error('[SupabaseClient] Error guardando evaluación:', reintento.error.message);
        return null;
      }

      console.error('[SupabaseClient] Error guardando evaluación:', error.message);
      return null;
    }

    /* Alta de una evaluación nueva. */
    // Guardarraíl: Máximo 50 preguntas en la nube por usuario
    try {
      const { count, error: countErr } = await client
        .from('microeval_evaluations')
        .select('*', { count: 'exact', head: true })
        .eq('teacher_id', user.id);
      if (!countErr && typeof count === 'number' && count >= 50) {
        console.warn('[SupabaseClient] Límite de 50 preguntas alcanzado en la nube.');
        return null;
      }
    } catch (e) {}

    const intentos = [
      Object.assign({ teacher_id: user.id, prompt: prompt, title: d.title || 'Evaluación' }, campos),
      // Sin las columnas de grado, conservando tipo, alternativas y rúbrica
      Object.assign({ teacher_id: user.id, prompt: prompt, title: d.title || 'Evaluación', expected_answer: expectedAnswer },
        campos.rubric ? { rubric: campos.rubric } : {},
        campos.type ? { type: campos.type } : {},
        campos.questions ? { questions: campos.questions } : {},
        campos.grade_text ? { grade_text: campos.grade_text } : {}),
      // Último recurso: lo mínimo
      { teacher_id: user.id, prompt: prompt, expected_answer: expectedAnswer, title: d.title || 'Evaluación' }
    ];

    let ultimoError = null;
    for (let i = 0; i < intentos.length; i++) {
      const res = await client.from('microeval_evaluations').insert(intentos[i]).select().single();
      if (!res.error) return res.data;

      ultimoError = res.error;
      if (!esColumnaFaltante(res.error)) break;

      if (i === 0) {
        console.warn('[SupabaseClient] Faltan columnas nuevas en microeval_evaluations; se guarda lo máximo posible. ' +
          'Corré las migraciones de supabase/migrations/.');
      }
    }

    console.error('[SupabaseClient] Error guardando evaluación:', ultimoError && ultimoError.message);
    return null;
  }

  /** ¿El error es porque falta una columna que agrega alguna migración? */
  function esColumnaFaltante(error) {
    if (!error) return false;
    if (error.code === '42703' || error.code === 'PGRST204') return true;
    return /column .* does not exist|rubric|grade_text|grade_stage|grade_level|type|questions|question_count/i.test(error.message || '');
  }

  /**
   * Carga hasta 50 evaluaciones del docente desde la nube para el banco.
   */
  async function loadRecentEvaluations() {
    const client = getClient();
    if (!client) return null;

    const { data, error } = await client
      .from('microeval_evaluations')
      .select('*')
      .order('last_used_at', { ascending: false })
      .limit(50);

    if (error) { console.error('[SupabaseClient] Error cargando evaluaciones:', error.message); return null; }
    return (data || []).filter(ev => {
      const p = String(ev.prompt || '').trim();
      return p && !/^Pregunta\s+\d+$/i.test(p) && !p.startsWith('Cartilla de respuestas') && ev.branch !== 'rama3';
    });
  }

  /**
   * Elimina una evaluación del banco en la nube (por su enunciado).
   * @param {string} prompt Enunciado exacto de la evaluación
   * @returns {Promise<boolean>}
   */
  async function deleteEvaluation(promptOrId) {
    const client = getClient();
    if (!client) return false;
    const user = await getCurrentUser();
    if (!user) return false;
    if (!promptOrId) return false;

    const target = String(promptOrId).trim();
    try {
      // 1. Si es un UUID (o contiene sufijo _q0)
      const uuidCandidate = target.replace(/_q\d+$/, '');
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuidCandidate)) {
        await client
          .from('microeval_evaluations')
          .delete()
          .eq('teacher_id', user.id)
          .eq('id', uuidCandidate);
      }

      // 2. Por prompt exacto
      await client
        .from('microeval_evaluations')
        .delete()
        .eq('teacher_id', user.id)
        .eq('prompt', target);

      // 3. Por coincidencia parcial si es una evaluación compuesta (ej: "1. ¿Cuanto es 30 + 25? | 2. ...")
      if (target.length >= 5) {
        await client
          .from('microeval_evaluations')
          .delete()
          .eq('teacher_id', user.id)
          .ilike('prompt', `%${target}%`);
      }

      return true;
    } catch (e) {
      console.error('[SupabaseClient] Error inesperado al eliminar evaluación:', e);
      return false;
    }
  }

  // ─────────────────────────────────────────────
  // RESULTADOS POR ALUMNO
  // ─────────────────────────────────────────────

  /**
   * Guarda (o actualiza) el resultado de un alumno en una sesión.
   *
   * Usa upsert con onConflict sobre el índice único
   * (teacher_id, session_ref, student_code): si el docente reescanea al mismo
   * alumno en la misma sesión, ACTUALIZA la fila en vez de duplicarla.
   *
   * `result` debe incluir al menos: session_ref, student_code.
   * El teacher_id lo pone esta función, no el llamador.
   *
   * Es tolerante a que la migración no se haya aplicado: avisa y devuelve null.
   *
   * @param {object} result
   * @returns {Promise<object|null>}
   */
  async function saveResult(result) {
    const client = getClient();
    if (!client) return null;
    const user = await getCurrentUser();
    if (!user) return null;

    if (!result || !result.session_ref) {
      console.warn('[SupabaseClient] saveResult necesita session_ref: sin él no se ' +
        'puede deduplicar (Postgres trata cada NULL como distinto).');
      return null;
    }

    const row = Object.assign({}, result, { teacher_id: user.id });

    const { data, error } = await client
      .from('microeval_results')
      .upsert(row, { onConflict: 'teacher_id,session_ref,student_code' })
      .select()
      .single();

    if (error) {
      if (error.code === '42P01') {
        console.warn('[SupabaseClient] La tabla microeval_results no existe todavía. ' +
          'Corré supabase/migrations/20260928000000_grado_y_resultados.sql en el SQL Editor.');
      } else {
        console.error('[SupabaseClient] Error guardando resultado:', error.message);
      }
      return null;
    }
    return data;
  }

  /**
   * Carga todos los resultados de una sesión, en orden de captura.
   * @param {string} sessionRef
   * @returns {Promise<Array>}
   */
  async function loadSessionResults(sessionRef) {
    const client = getClient();
    if (!client || !sessionRef) return [];

    const { data, error } = await client
      .from('microeval_results')
      .select('*')
      .eq('session_ref', sessionRef)
      .order('captured_at', { ascending: true });

    if (error) {
      console.error('[SupabaseClient] Error cargando resultados de la sesión:', error.message);
      return [];
    }
    return data || [];
  }

  /**
   * Elimina el resultado de un alumno específico en una sesión.
   * @param {string} sessionRef
   * @param {string} studentCode
   * @returns {Promise<boolean>}
   */
  async function deleteResult(sessionRef, studentCode) {
    const client = getClient();
    if (!client || !sessionRef || !studentCode) return false;
    const user = await getCurrentUser();
    if (!user) return false;

    const { error } = await client
      .from('microeval_results')
      .delete()
      .eq('teacher_id', user.id)
      .eq('session_ref', sessionRef)
      .eq('student_code', studentCode);

    if (error) {
      console.error('[SupabaseClient] Error eliminando resultado:', error.message);
      return false;
    }
    return true;
  }

  /**
   * Elimina todos los resultados de una sesión (reinicio completo de sesión).
   * @param {string} sessionRef
   * @returns {Promise<boolean>}
   */
  async function deleteSessionResults(sessionRef) {
    const client = getClient();
    if (!client || !sessionRef) return false;
    const user = await getCurrentUser();
    if (!user) return false;

    const { error } = await client
      .from('microeval_results')
      .delete()
      .eq('teacher_id', user.id)
      .eq('session_ref', sessionRef);

    if (error) {
      console.error('[SupabaseClient] Error reiniciando resultados de la sesión:', error.message);
      return false;
    }
    return true;
  }


  // ─────────────────────────────────────────────
  // SESIONES GUARDADAS (SINCRONIZACIÓN EN LA NUBE)
  // ─────────────────────────────────────────────

  /**
   * Carga las sesiones guardadas del docente desde Supabase.
   * @returns {Promise<Array>} Lista de sesiones guardadas (hasta 8).
   */
  async function loadSavedSessions() {
    const client = getClient();
    if (!client) return [];
    const user = await getCurrentUser();
    if (!user) return [];

    const { data, error } = await client
      .from('microeval_sessions')
      .select('*')
      .eq('teacher_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(8);

    if (error) {
      console.warn('[SupabaseClient] Error al cargar sesiones guardadas:', error.message);
      return [];
    }

    return (data || []).map(row => {
      const sess = row.data || {};
      sess.id = row.session_id || sess.id;
      sess.sessionRef = row.session_ref || sess.sessionRef;
      sess.title = row.title || sess.title;
      sess.classroomId = row.classroom_id || sess.classroomId;
      sess.classroomName = row.classroom_name || sess.classroomName;
      sess.branch = row.branch || sess.branch;
      sess.branchTitle = row.branch_title || sess.branchTitle;
      sess.type = row.type || sess.type;
      sess.questionCount = row.question_count || sess.questionCount;
      sess.updatedAt = row.updated_at || sess.updatedAt;
      sess.createdAt = row.created_at || sess.createdAt;
      return sess;
    });
  }

  /**
   * Guarda o actualiza una sesión en Supabase.
   * @param {Object} sessionData Datos de la sesión.
   * @returns {Promise<boolean>}
   */
  async function saveSessionToCloud(sessionData) {
    const client = getClient();
    if (!client || !sessionData || !sessionData.id) return false;
    const user = await getCurrentUser();
    if (!user) return false;

    const row = {
      teacher_id: user.id,
      session_id: sessionData.id,
      session_ref: sessionData.sessionRef || null,
      title: sessionData.title || null,
      classroom_id: sessionData.classroomId || null,
      classroom_name: sessionData.classroomName || null,
      branch: sessionData.branch || null,
      branch_title: sessionData.branchTitle || null,
      type: sessionData.type || null,
      question_count: sessionData.questionCount || 1,
      data: sessionData,
      updated_at: new Date().toISOString()
    };

    const { error } = await client
      .from('microeval_sessions')
      .upsert(row, { onConflict: 'teacher_id,session_id' });

    if (error) {
      console.warn('[SupabaseClient] Error al guardar sesión en la nube:', error.message);
      return false;
    }
    return true;
  }

  /**
   * Elimina una sesión guardada de Supabase por su session_id.
   * @param {string} sessionId ID de la sesión.
   * @returns {Promise<boolean>}
   */
  async function deleteSessionFromCloud(sessionId) {
    const client = getClient();
    if (!client || !sessionId) return false;
    const user = await getCurrentUser();
    if (!user) return false;

    const { error } = await client
      .from('microeval_sessions')
      .delete()
      .eq('teacher_id', user.id)
      .eq('session_id', sessionId);

    if (error) {
      console.warn('[SupabaseClient] Error al eliminar sesión de la nube:', error.message);
      return false;
    }
    return true;
  }


  // ─────────────────────────────────────────────
  // EXPORTACIÓN UNIVERSAL
  // ─────────────────────────────────────────────
  const SupabaseClient = global.SupabaseClient = global.SupabaseClient || {};

  Object.assign(SupabaseClient, {
    getClient,
    signInWithGoogle,
    signOut,
    getCurrentUser,
    getCachedUser,
    onAuthStateChange,
    loadClassrooms,
    createClassroom,
    deleteClassroom,
    updateClassroomGrade,
    importStudents,
    updateStudent,
    deleteStudent,
    saveEvaluation,
    deleteEvaluation,
    loadRecentEvaluations,
    saveResult,
    loadSessionResults,
    deleteResult,
    deleteSessionResults,
    loadSavedSessions,
    saveSessionToCloud,
    deleteSessionFromCloud
  });

})(typeof window !== 'undefined' ? window : this);
