/**
 * supabase-ai-service.js — Microevaluación A5
 * MÓDULO: SERVICIOS DE IA EN LA NUBE (EDGE FUNCTIONS) Y DIAGNÓSTICO
 *
 * Responsabilidad única:
 *   - Rastrear el diagnóstico de la última llamada a la IA (diagnosticoIA, anotarLlamadaIA).
 *   - Conexión a Edge Functions en Supabase:
 *       • generateRubric: Solución canónica y rúbrica ponderada con IA (Gemini).
 *       • generateQuestionWithAI: Generación de consignas con 4 alternativas y clave.
 *       • chatWithAI: Asistente conversacional de aula para el Copiloto pedagógico.
 *       • gradeSheet: Calificación formativa e inspección de cuadrícula de cálculo.
 */

(function (global) {
  'use strict';

  const SupabaseClient = global.SupabaseClient = global.SupabaseClient || {};

  function getClient() {
    return typeof SupabaseClient.getClient === 'function' ? SupabaseClient.getClient() : null;
  }

  function getCurrentUser() {
    return typeof SupabaseClient.getCurrentUser === 'function' ? SupabaseClient.getCurrentUser() : Promise.resolve(null);
  }

  // ─────────────────────────────────────────────
  // DIAGNÓSTICO
  // ─────────────────────────────────────────────
  let _ultimaLlamadaIA = null;

  function diagnosticoIA() {
    return _ultimaLlamadaIA;
  }

  function anotarLlamadaIA(datos) {
    _ultimaLlamadaIA = Object.assign({ cuando: new Date().toLocaleTimeString() }, datos);
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
    // Guardarraíl Nivel 2: Límite diario de 6 rúbricas con IA
    if (typeof DailyQuota !== 'undefined' && !DailyQuota.canConsume('rubrics')) {
      return {
        ok: false,
        error: '⚠️ Has alcanzado el límite diario de 6 rúbricas con IA. Tu cuota se renovará automáticamente a las 00:00 (medianoche).'
      };
    }

    const client = getClient();
    if (!client) return { ok: false, error: 'Supabase no está inicializado.' };

    // Guardarraíl de Autenticación: Requiere cuenta Google activa
    const user = await getCurrentUser();
    if (!user) {
      return { ok: false, error: 'Acceso no autorizado: debes iniciar sesión con Google para generar rúbricas con IA.' };
    }

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Tiempo de espera agotado (45 s). La IA de Gemini no respondió a tiempo.')), 45000)
      );

      const invokePromise = (async () => {
        let res = await client.functions.invoke('super-worker', { body: payload });
        if (res.error && (String(res.error.message || '').includes('Failed to send') || String(res.error.message || '').includes('not found') || res.error.status === 404)) {
          const alt = await client.functions.invoke('rubric', { body: payload });
          if (!alt.error) res = alt;
        }
        return res;
      })();

      const res = await Promise.race([invokePromise, timeoutPromise]);
      const { data, error } = res;

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
        anotarLlamadaIA({ funcion: 'rubric', ok: false, error: detalle });
        return { ok: false, error: detalle };
      }

      if (!data || !data.rubrica) {
        anotarLlamadaIA({ funcion: 'rubric', ok: false, error: 'La función no devolvió una rúbrica estructurada.' });
        return { ok: false, error: 'La función no devolvió una rúbrica estructurada.' };
      }
      if (typeof DailyQuota !== 'undefined') {
        DailyQuota.consume('rubrics');
      }
      anotarLlamadaIA({
        funcion: 'rubric',
        ok: true,
        modelo: data.modelo,
        ms: data.ms,
        reintentos: data.reintentos,
        prompt_version: data.prompt_version
      });
      return { ok: true, rubrica: data.rubrica, meta: data };

    } catch (e) {
      console.error('[SupabaseClient] Error en llamada a rubric:', e);
      const msg = e && e.message ? e.message : 'No se pudo contactar la función "rubric". ¿Está desplegada en Supabase?';
      anotarLlamadaIA({ funcion: 'rubric', ok: false, error: msg });
      return {
        ok: false,
        error: msg
      };
    }
  }

  /**
   * Genera una pregunta matemática inédita con alternativas y rúbrica usando Gemini en Supabase
   * @param {object} payload { grado, tema }
   * @returns {Promise<{ok: boolean, question?: object, error?: string}>}
   */
  async function generateQuestionWithAI(payload) {
    const client = getClient();
    if (!client) return { ok: false, error: 'Supabase no está inicializado.' };

    // Guardarraíl de Autenticación: Requiere cuenta Google activa
    const user = await getCurrentUser();
    if (!user) {
      return { ok: false, error: 'Acceso no autorizado: debes iniciar sesión con Google para crear preguntas con IA.' };
    }

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Tiempo de espera agotado (40 s). La IA de Gemini no respondió a tiempo.')), 40000)
      );

      const invokePromise = (async () => {
        return await client.functions.invoke('super-worker', {
          body: Object.assign({ action: 'generate_question' }, payload)
        });
      })();

      const res = await Promise.race([invokePromise, timeoutPromise]);
      const { data, error } = res;

      if (error) {
        let detalle = error.message || String(error);
        try {
          if (error.context && typeof error.context.json === 'function') {
            const cuerpo = await error.context.json();
            if (cuerpo && (cuerpo.error || cuerpo.message)) detalle = cuerpo.error || cuerpo.message;
          }
        } catch (e) {}
        console.error('[SupabaseClient] generateQuestionWithAI falló:', detalle);
        anotarLlamadaIA({ funcion: 'generate_question', ok: false, error: detalle });
        return { ok: false, error: detalle };
      }

      if (!data || !data.ok || !data.question) {
        anotarLlamadaIA({ funcion: 'generate_question', ok: false, error: 'Respuesta inválida de IA.' });
        return { ok: false, error: (data && data.error) || 'La IA no devolvió una pregunta estructurada.' };
      }

      anotarLlamadaIA({ funcion: 'generate_question', ok: true });
      return { ok: true, question: data.question };

    } catch (e) {
      console.error('[SupabaseClient] Error en llamada a generateQuestionWithAI:', e);
      const msg = e && e.message ? e.message : 'Error al conectar con la IA.';
      anotarLlamadaIA({ funcion: 'generate_question', ok: false, error: msg });
      return { ok: false, error: msg };
    }
  }

  /**
   * Conversación de texto libre con el Asistente EVA impulsado por Gemini
   * @param {string} message - Texto escrito por el docente
   * @param {object} [context] - Contexto actual del aula
   * @param {Array} [history] - Historial reciente de la conversación
   * @returns {Promise<{ok: boolean, reply?: string, action?: string, action_label?: string, error?: string}>}
   */
  async function chatWithAI(message, context = {}, history = []) {
    const client = getClient();
    if (!client) return { ok: false, error: 'Supabase no está inicializado.' };

    // Guardarraíl de Autenticación: Requiere cuenta Google activa
    const user = await getCurrentUser();
    if (!user) {
      return { ok: false, error: 'Acceso no autorizado: debes iniciar sesión con Google para consultar al Asistente EVA.' };
    }

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Tiempo de espera agotado (20 s).')), 20000)
      );

      const invokePromise = (async () => {
        return await client.functions.invoke('super-worker', {
          body: { action: 'chat', message, context, history }
        });
      })();

      const res = await Promise.race([invokePromise, timeoutPromise]);
      const { data, error } = res;

      if (error) {
        let detalle = error.message || String(error);
        try {
          if (error.context && typeof error.context.json === 'function') {
            const cuerpo = await error.context.json();
            if (cuerpo && (cuerpo.error || cuerpo.message)) detalle = cuerpo.error || cuerpo.message;
          }
        } catch (e) {}
        console.error('[SupabaseClient] chatWithAI falló:', detalle);
        anotarLlamadaIA({ funcion: 'chat', ok: false, error: detalle });
        return { ok: false, error: detalle };
      }

      if (!data || !data.ok) {
        anotarLlamadaIA({ funcion: 'chat', ok: false, error: 'Respuesta inválida de IA.' });
        return { ok: false, error: (data && data.error) || 'La IA no devolvió respuesta.' };
      }

      anotarLlamadaIA({ funcion: 'chat', ok: true });
      return {
        ok: true,
        reply: data.reply || '',
        action: data.action || 'none',
        action_label: data.action_label || '',
        out_of_scope: Boolean(data.out_of_scope)
      };
    } catch (e) {
      console.error('[SupabaseClient] Error en llamada a chatWithAI:', e);
      const msg = e && e.message ? e.message : 'Error al conectar con la IA.';
      anotarLlamadaIA({ funcion: 'chat', ok: false, error: msg });
      return { ok: false, error: msg };
    }
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

    // Guardarraíl de Autenticación: Requiere cuenta Google activa
    const user = await getCurrentUser();
    if (!user) {
      return { ok: false, error: 'Acceso no autorizado: debes iniciar sesión con Google para calificar con IA.' };
    }

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
  // EXPOSICIÓN AL OBJETO UNIVERSAL
  // ─────────────────────────────────────────────
  Object.assign(SupabaseClient, {
    diagnosticoIA,
    anotarLlamadaIA,
    generateRubric,
    generateQuestionWithAI,
    chatWithAI,
    gradeSheet
  });

})(typeof window !== 'undefined' ? window : this);
