/**
 * Módulo de Sesiones Activas y Guardadas
 * Microevaluación Formativa de Clase A5
 *
 * Funcionalidad:
 * 1. Persistencia de la sesión activa de escaneo en memoria y localStorage.
 * 2. Gestión de hasta 8 sesiones guardadas con sincronización bidireccional en Supabase.
 * 3. Integridad relacional (salones/preguntas en uso) y purga de datos no conformes.
 */

(function (global) {
  'use strict';

  const ClassroomData = global.ClassroomData = global.ClassroomData || {};

  const STORAGE_KEY_SESSION = 'microeval_active_session_v1';
  const STORAGE_KEY_SAVED_SESSIONS = 'microeval_saved_sessions_v1';
  const MAX_SAVED_SESSIONS = 8;
  const STORAGE_KEY_BANK = 'microeval_teacher_bank_v2';

  // Acceso referencial seguro a salones y banco compartidos
  function getClassroom(id) {
    return ClassroomData.getClassroom ? ClassroomData.getClassroom(id) : (ClassroomData.CLASSROOMS ? ClassroomData.CLASSROOMS[id] || null : null);
  }

  const CLASSROOMS = ClassroomData.CLASSROOMS = ClassroomData.CLASSROOMS || {};
  const EVALUATIONS = ClassroomData.EVALUATIONS = ClassroomData.EVALUATIONS || {};

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

    // 3. Purga preguntas corruptas del banco (sin enunciado o alternativas inválidas si es mc)
    Object.keys(EVALUATIONS).forEach(id => {
      const ev = EVALUATIONS[id];
      if (!ev || !ev.prompt) {
        delete EVALUATIONS[id];
        return;
      }
      if (ev.type === 'mc' && (!ev.options || !ev.correct)) {
        delete EVALUATIONS[id];
        return;
      }
    });

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const rawBank = window.localStorage.getItem(STORAGE_KEY_BANK);
        if (rawBank) {
          const bank = JSON.parse(rawBank);
          if (Array.isArray(bank)) {
            const cleanBank = bank.filter(ev => {
              if (!ev || !ev.prompt) return false;
              if (ev.type === 'mc' && (!ev.options || !ev.correct)) return false;
              return true;
            });
            window.localStorage.setItem(STORAGE_KEY_BANK, JSON.stringify(cleanBank));
          } else if (typeof bank === 'object') {
            let mod = false;
            Object.keys(bank).forEach(k => {
              const bEv = bank[k];
              if (!bEv || !bEv.prompt || (bEv.type === 'mc' && (!bEv.options || !bEv.correct))) {
                delete bank[k];
                mod = true;
              }
            });
            if (mod) {
              window.localStorage.setItem(STORAGE_KEY_BANK, JSON.stringify(bank));
            }
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


  // Asignar al objeto universal
  Object.assign(ClassroomData, {
    MAX_SAVED_SESSIONS,
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
    purgeNonCompliantData
  });

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
