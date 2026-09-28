/**
 * supabase-client.js
 * Módulo de integración con Supabase para MicroEval.
 * Gestiona: autenticación Google, salones, alumnos y banco de evaluaciones.
 */
(function (global) {
  'use strict';

  const SUPABASE_URL = 'https://bpffczohkcpoxyhzvdru.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwZmZjem9oa2Nwb3h5aHp2ZHJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2NTIyNTQsImV4cCI6MjEwMjIyODI1NH0.H9jTZ_oeU5KRXdDOe1ZWwv1sxfL2hN4LdPO64pkYPBA';

  // Cliente de Supabase (inicializado cuando el SDK carga)
  let _client = null;

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
    if (!client) return;
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: 'https://danielmr1.github.io/microevaluacion/' }
    });
    if (error) console.error('[Auth] Error al iniciar con Google:', error.message);
  }

  /**
   * Cierra la sesión actual.
   */
  async function signOut() {
    const client = getClient();
    if (!client) return;
    await client.auth.signOut();
  }

  /**
   * Devuelve el usuario autenticado actualmente, o null.
   */
  async function getCurrentUser() {
    const client = getClient();
    if (!client) return null;
    const { data: { user } } = await client.auth.getUser();
    return user || null;
  }

  /**
   * Suscribe a cambios de estado de autenticación.
   * callback(event, session) se llama al login/logout/restore.
   */
  function onAuthStateChange(callback) {
    const client = getClient();
    if (!client) return;
    client.auth.onAuthStateChange(callback);
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

  // ─────────────────────────────────────────────
  // RÚBRICA DE CORRECCIÓN (Edge Function 'rubric')
  // ─────────────────────────────────────────────

  /**
   * Pide la solución canónica y el criterio de corrección a partir del enunciado.
   *
   * Se llama UNA vez por evaluación, nunca una vez por alumno: así los 30
   * veredictos de la misma ficha se juzgan con el mismo criterio y son
   * comparables entre sí.
   *
   * La clave del proveedor vive en los secretos de Supabase, no acá. Esta
   * función nunca devuelve un error lanzado: siempre { ok, error } para que el
   * asistente no se rompa si la IA no está disponible.
   *
   * @param {object} payload { prompt, grado, metodoEnsenado? }
   * @returns {Promise<{ok: boolean, rubrica?: object, meta?: object, error?: string}>}
   */
  async function generateRubric(payload) {
    const client = getClient();
    if (!client) return { ok: false, error: 'Supabase no está inicializado.' };

    try {
      const { data, error } = await client.functions.invoke('rubric', { body: payload });

      if (error) {
        // functions.invoke() mete el mensaje real de la función en el cuerpo de
        // la respuesta, pero en error.message solo deja un texto genérico.
        let detalle = error.message || String(error);
        try {
          if (error.context && typeof error.context.json === 'function') {
            const cuerpo = await error.context.json();
            if (cuerpo && (cuerpo.error || cuerpo.message)) detalle = cuerpo.error || cuerpo.message;
          }
        } catch (e) { /* la respuesta no era JSON */ }
        console.error('[SupabaseClient] La función rubric falló:', detalle);
        return { ok: false, error: detalle };
      }

      if (!data || !data.rubrica) return { ok: false, error: 'La función no devolvió una rúbrica.' };
      return { ok: true, rubrica: data.rubrica, meta: data };

    } catch (e) {
      // Llegar acá casi siempre significa que la función no está desplegada.
      console.error('[SupabaseClient] No se pudo llamar a rubric:', e);
      return {
        ok: false,
        error: 'No se pudo contactar la función "rubric". ¿Está desplegada en Supabase?'
      };
    }
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

    if (existing) {
      const { data } = await client
        .from('microeval_evaluations')
        .update(Object.assign({}, campos, {
          used_count: existing.used_count + 1,
          last_used_at: new Date().toISOString()
        }))
        .eq('id', existing.id)
        .select()
        .single();
      return data;
    }

    const { data, error } = await client
      .from('microeval_evaluations')
      .insert(Object.assign({
        teacher_id: user.id,
        prompt: prompt,
        title: d.title || 'Evaluación'
      }, campos))
      .select()
      .single();

    if (error) {
      // Si las migraciones de rúbrica o de grado todavía no se aplicaron, el
      // insert falla entero por las columnas nuevas. Se reintenta con lo mínimo:
      // es preferible guardar la evaluación incompleta a no guardarla.
      if (error.code === '42703' || /rubric|grade_text|grade_stage|grade_level/.test(error.message || '')) {
        console.warn('[SupabaseClient] Faltan columnas nuevas; se guarda la evaluación sin rúbrica ni grado. ' +
          'Corré las migraciones de supabase/migrations/.');
        const reintento = await client
          .from('microeval_evaluations')
          .insert({ teacher_id: user.id, prompt: prompt, expected_answer: expectedAnswer, title: d.title || 'Evaluación' })
          .select()
          .single();
        if (reintento.error) {
          console.error('[SupabaseClient] Error guardando evaluación:', reintento.error.message);
          return null;
        }
        return reintento.data;
      }
      console.error('[SupabaseClient] Error guardando evaluación:', error.message);
      return null;
    }
    return data;
  }

  /**
   * Carga las últimas 8 evaluaciones del docente (más usadas primero).
   */
  async function loadRecentEvaluations() {
    const client = getClient();
    if (!client) return [];

    const { data, error } = await client
      .from('microeval_evaluations')
      .select('*')
      .order('last_used_at', { ascending: false })
      .limit(8);

    if (error) { console.error('[SupabaseClient] Error cargando evaluaciones:', error.message); return []; }
    return data || [];
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

  // ─────────────────────────────────────────────
  // CORRECCIÓN CON IA (Edge Function)
  // ─────────────────────────────────────────────

  /**
   * Manda la ficha recortada a la Edge Function 'grade-sheet' y devuelve el
   * veredicto. La clave del modelo vive en los secretos de Supabase, nunca
   * acá: por eso la llamada pasa por la función y no directo al proveedor.
   *
   * El payload típico es:
   *   { sessionRef, studentCode, gradeText, prompt, expectedAnswer,
   *     answerImage, gridImage }   // imágenes como data URL (base64)
   *
   * Las dos imágenes juntas pesan unos 350 KB en base64, bastante por debajo
   * del límite del cuerpo de una Edge Function.
   *
   * @param {object} payload
   * @returns {Promise<{ok: boolean, data?: object, error?: string}>}
   */
  async function gradeSheet(payload) {
    const client = getClient();
    if (!client) return { ok: false, error: 'Supabase no está inicializado.' };

    try {
      const { data, error } = await client.functions.invoke('grade-sheet', { body: payload });

      if (error) {
        // supabase-js deja la respuesta cruda en error.context; ahí viene el
        // mensaje real de la función (por ejemplo "falta GEMINI_API_KEY").
        let detail = error.message || String(error);
        try {
          if (error.context && typeof error.context.json === 'function') {
            const body = await error.context.json();
            if (body && (body.error || body.message)) detail = body.error || body.message;
          }
        } catch (e) { /* la respuesta no era JSON */ }
        console.error('[SupabaseClient] grade-sheet falló:', detail);
        return { ok: false, error: detail };
      }

      return { ok: true, data: data };
    } catch (e) {
      console.error('[SupabaseClient] grade-sheet lanzó una excepción:', e);
      return { ok: false, error: e.message || 'Error desconocido al llamar a la IA.' };
    }
  }

  // ─────────────────────────────────────────────
  // EXPORTACIÓN
  // ─────────────────────────────────────────────
  global.SupabaseClient = {
    signInWithGoogle,
    signOut,
    getCurrentUser,
    onAuthStateChange,
    loadClassrooms,
    createClassroom,
    deleteClassroom,
    updateClassroomGrade,
    importStudents,
    generateRubric,
    saveEvaluation,
    loadRecentEvaluations,
    saveResult,
    loadSessionResults,
    gradeSheet
  };

})(typeof window !== 'undefined' ? window : this);
