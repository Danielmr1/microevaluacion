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
      options: { redirectTo: window.location.href }
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
   * @param {string} name Nombre del salón, ej. "3° Primaria A"
   * @param {string} gradeCode Código corto, ej. "3A"
   * @param {string} color Color hex, ej. "#3b82f6"
   * @returns {Promise<object|null>} El salón creado o null si hubo error.
   */
  async function createClassroom(name, gradeCode, color) {
    const client = getClient();
    if (!client) return null;
    const user = await getCurrentUser();
    if (!user) return null;

    const { data, error } = await client
      .from('microeval_classrooms')
      .insert({ teacher_id: user.id, name, grade_code: gradeCode, color: color || '#3b82f6' })
      .select()
      .single();

    if (error) { console.error('[SupabaseClient] Error creando salón:', error.message); return null; }
    return data;
  }

  /**
   * Elimina un salón (y sus alumnos por CASCADE).
   */
  async function deleteClassroom(classroomId) {
    const client = getClient();
    if (!client) return;
    await client.from('microeval_classrooms').delete().eq('id', classroomId);
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
    if (error) { console.error('[SupabaseClient] Error importando alumnos:', error.message); return false; }
    return true;
  }

  // ─────────────────────────────────────────────
  // BANCO DE EVALUACIONES (historial personal)
  // ─────────────────────────────────────────────

  /**
   * Guarda o actualiza una evaluación en el historial del docente.
   * Si ya existe una con el mismo prompt, incrementa el contador.
   */
  async function saveEvaluation(prompt, expectedAnswer, title) {
    const client = getClient();
    if (!client) return null;
    const user = await getCurrentUser();
    if (!user) return null;

    // Buscar si ya existe
    const { data: existing } = await client
      .from('microeval_evaluations')
      .select('id, used_count')
      .eq('teacher_id', user.id)
      .eq('prompt', prompt)
      .maybeSingle();

    if (existing) {
      const { data } = await client
        .from('microeval_evaluations')
        .update({ used_count: existing.used_count + 1, last_used_at: new Date().toISOString(), expected_answer: expectedAnswer })
        .eq('id', existing.id)
        .select()
        .single();
      return data;
    }

    const { data, error } = await client
      .from('microeval_evaluations')
      .insert({ teacher_id: user.id, prompt, expected_answer: expectedAnswer, title: title || 'Evaluación' })
      .select()
      .single();

    if (error) { console.error('[SupabaseClient] Error guardando evaluación:', error.message); return null; }
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
    importStudents,
    saveEvaluation,
    loadRecentEvaluations
  };

})(typeof window !== 'undefined' ? window : this);
