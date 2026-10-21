// =============================================================================
// daily-quota.js — Microevaluación A5 v3.5.5
// MÓDULO: GESTOR DE CUOTAS DIARIAS DE INTELIGENCIA ARTIFICIAL
//
// Guardarraíles de Cuota Canónicos (según MANUAL_SISTEMA.md Sección 8):
//   Nivel 1: Chat con IA (EVA Copilot) — 15 consultas diarias con IA
//   Nivel 2: Generador de Rúbricas — 6 rúbricas completas al día con IA
//   Nivel 3: Modalidad Formativa con IA — 2 sesiones formativas completas al día
//
// Reinicio: Automático a las 00:00 (medianoche) en hora local del docente.
// =============================================================================

const DailyQuota = (() => {
  const STORAGE_KEY_PREFIX = 'microeval_daily_quota_';

  const LIMITS = {
    chat: 15,             // 15 consultas diarias con IA
    rubrics: 6,           // 6 rúbricas completas al día
    formativeSessions: 2  // 2 sesiones formativas completas al día
  };

  /**
   * Obtiene la clave de almacenamiento para el día calendario actual (YYYY-MM-DD local)
   */
  function getTodayKey() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${STORAGE_KEY_PREFIX}${year}-${month}-${day}`;
  }

  /**
   * Obtiene el uso registrado para el día actual.
   * Si es un nuevo día, devuelve contadores en cero.
   */
  function getUsage() {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { chat: 0, rubrics: 0, formativeSessions: 0, formativeSessionIds: [] };
    }
    try {
      const key = getTodayKey();
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          chat: Number(parsed.chat) || 0,
          rubrics: Number(parsed.rubrics) || 0,
          formativeSessions: Number(parsed.formativeSessions) || 0,
          formativeSessionIds: Array.isArray(parsed.formativeSessionIds) ? parsed.formativeSessionIds : []
        };
      }
    } catch (e) {
      console.warn('[DailyQuota getUsage Error]', e);
    }
    return { chat: 0, rubrics: 0, formativeSessions: 0, formativeSessionIds: [] };
  }

  /**
   * Guarda el estado de uso del día actual
   */
  function saveUsage(usage) {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const key = getTodayKey();
      window.localStorage.setItem(key, JSON.stringify(usage));
    } catch (e) {
      console.warn('[DailyQuota saveUsage Error]', e);
    }
  }

  /**
   * Verifica si el docente puede consumir una acción del tipo especificado
   * @param {'chat' | 'rubrics' | 'formativeSessions'} type
   * @param {string} [id] ID de la sesión (para sesiones formativas ya registradas)
   * @returns {boolean}
   */
  function canConsume(type, id = null) {
    const usage = getUsage();
    if (type === 'chat') {
      return usage.chat < LIMITS.chat;
    }
    if (type === 'rubrics') {
      return usage.rubrics < LIMITS.rubrics;
    }
    if (type === 'formativeSessions') {
      if (id && usage.formativeSessionIds.includes(String(id))) {
        return true; // Ya forma parte de las sesiones autorizadas de hoy
      }
      return usage.formativeSessions < LIMITS.formativeSessions;
    }
    return true;
  }

  /**
   * Consume una unidad de cuota para el tipo especificado
   * @param {'chat' | 'rubrics' | 'formativeSessions'} type
   * @param {string} [id] ID de la sesión (para registrarla en formativeSessionIds)
   * @returns {number} Cantidad usada tras el incremento
   */
  function consume(type, id = null) {
    const usage = getUsage();
    if (type === 'chat') {
      usage.chat += 1;
      saveUsage(usage);
      return usage.chat;
    }
    if (type === 'rubrics') {
      usage.rubrics += 1;
      saveUsage(usage);
      return usage.rubrics;
    }
    if (type === 'formativeSessions') {
      if (id) {
        const strId = String(id);
        if (!usage.formativeSessionIds.includes(strId)) {
          usage.formativeSessionIds.push(strId);
          usage.formativeSessions = usage.formativeSessionIds.length;
          saveUsage(usage);
        }
      } else {
        usage.formativeSessions += 1;
        saveUsage(usage);
      }
      return usage.formativeSessions;
    }
    return 0;
  }

  /**
   * Devuelve las consultas/sesiones restantes para un tipo específico
   */
  function getRemaining(type) {
    const usage = getUsage();
    const limit = LIMITS[type] || 0;
    const current = usage[type] || 0;
    return Math.max(0, limit - current);
  }

  /**
   * Devuelve un resumen estructurado de las 3 cuotas para paneles o diagnósticos
   */
  function getQuotaSummary() {
    const usage = getUsage();
    return {
      chat: {
        used: usage.chat,
        limit: LIMITS.chat,
        remaining: Math.max(0, LIMITS.chat - usage.chat)
      },
      rubrics: {
        used: usage.rubrics,
        limit: LIMITS.rubrics,
        remaining: Math.max(0, LIMITS.rubrics - usage.rubrics)
      },
      formativeSessions: {
        used: usage.formativeSessions,
        limit: LIMITS.formativeSessions,
        remaining: Math.max(0, LIMITS.formativeSessions - usage.formativeSessions),
        sessionIds: [...usage.formativeSessionIds]
      }
    };
  }

  /**
   * Devuelve los límites configurados
   */
  function getLimits() {
    return { ...LIMITS };
  }

  return {
    canConsume,
    consume,
    getUsage,
    getRemaining,
    getQuotaSummary,
    getLimits
  };
})();

if (typeof window !== 'undefined') {
  window.DailyQuota = DailyQuota;
}
