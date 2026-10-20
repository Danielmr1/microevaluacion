/**
 * EVA Copilot: Barra de Comandos Inteligente y Diálogo de Navegación (Fase 1)
 * Microevaluación Formativa - Versión 3.2.90
 * 
 * Permite al docente escribir libremente lo que desea evaluar o consultar
 * (ej: "4to A con cartillas", "banco de preguntas", "escanear sesion 1").
 * Analiza la intención mediante heurística local ultrarrápida (0 ms, offline)
 * y aclara datos faltantes mediante chips interactivos antes de ejecutar la acción.
 */

(function (global) {
  'use strict';

  // Estado conversacional de ranuras (slots)
  let pendingState = {
    action: null,        // 'eval' | 'bank' | 'classrooms' | 'saved-sessions' | 'help'
    branch: null,        // 'rama1' | 'rama2' | 'rama3'
    classroomId: null,   // id del salón
    classroomName: null, // nombre legible
    questionCount: null, // número de preguntas (opcional)
    sessionId: null      // id de sesión guardada
  };

  /**
   * Limpia y normaliza texto para comparación difusa (tildes, mayúsculas, espacios)
   */
  function normalizeText(text) {
    if (!text) return '';
    let s = text.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Quita tildes
      .replace(/["'«»]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Normalizar números y palabras ordinales frecuentes
    s = s.replace(/\b(primero|primer|1ro|1er|1°|1ra)\b/g, '1')
         .replace(/\b(segundo|segunda|2do|2°|2da)\b/g, '2')
         .replace(/\b(tercero|tercer|tercera|3ro|3er|3°|3ra)\b/g, '3')
         .replace(/\b(cuarto|cuarta|4to|4°|4ta)\b/g, '4')
         .replace(/\b(quinto|quinta|5to|5°|5ta)\b/g, '5')
         .replace(/\b(sexto|sexta|6to|6°|6ta)\b/g, '6');

    // Normalizar etapas
    s = s.replace(/\b(primaria|prim)\b/g, 'pri')
         .replace(/\b(secundaria)\b/g, 'sec');

    return s;
  }

  /**
   * Extrae salón de clases a partir del texto ingresado comparando con ClassroomData
   */
  function matchClassroom(normText) {
    if (typeof ClassroomData === 'undefined' || typeof ClassroomData.getClassroomList !== 'function') {
      return { match: null, candidates: [] };
    }
    const list = ClassroomData.getClassroomList();
    if (!list || list.length === 0) return { match: null, candidates: [] };

    const candidates = [];
    for (const cls of list) {
      const clsNorm = normalizeText(cls.name);

      // Extraer grado y sección del salón (ej: "4", "a", "pri")
      const gradeMatch = clsNorm.match(/\b([1-6])\b/);
      const sectionMatch = clsNorm.match(/\b([a-z])\b/);
      const isSec = clsNorm.includes('sec');
      const isPri = clsNorm.includes('pri') || !isSec;

      const num = gradeMatch ? gradeMatch[1] : null;
      const sec = sectionMatch ? sectionMatch[1] : null;

      // Comprobar coincidencia exacta o fuerte
      if (num && sec) {
        // Busca combinaciones como "4 a", "4a", "4° a", etc.
        const patternStrict = new RegExp(`\\b${num}\\s*°?\\s*${sec}\\b|\\b${num}${sec}\\b`);
        if (patternStrict.test(normText)) {
          // Si el texto especifica "sec" o "pri", verificar coherencia
          const textHasSec = normText.includes('sec');
          const textHasPri = normText.includes('pri');
          if ((textHasSec && isSec) || (textHasPri && isPri) || (!textHasSec && !textHasPri)) {
            candidates.push(cls);
          }
        } else if (normText.includes(clsNorm)) {
          candidates.push(cls);
        }
      } else if (normText.includes(clsNorm)) {
        candidates.push(cls);
      }
    }

    if (candidates.length === 1) {
      return { match: candidates[0], candidates: [] };
    }
    if (candidates.length > 1) {
      return { match: null, candidates: candidates };
    }

    // Comprobar si al menos mencionó un grado (ej: "4to" o "quinto") para sugerir las secciones disponibles
    const singleGradeMatch = normText.match(/\b([1-6])\b/);
    if (singleGradeMatch) {
      const gradeNum = singleGradeMatch[1];
      const gradeCandidates = list.filter(c => {
        const cNorm = normalizeText(c.name);
        return new RegExp(`\\b${gradeNum}\\b`).test(cNorm);
      });
      if (gradeCandidates.length > 0) {
        return { match: null, candidates: gradeCandidates };
      }
    }

    return { match: null, candidates: [] };
  }

  /**
   * Extrae la modalidad (rama1, rama2, rama3) del texto
   */
  function matchBranch(normText) {
    // Rama 3: Cartilla OMR
    if (/cartilla|cartillas|burbuja|burbujas|omr|hoja de respuesta|fichas de respuesta/.test(normText)) {
      return 'rama3';
    }
    // Rama 1: Formativa con IA / Procedimiento escrito
    if (/formativa|rubrica|procedimiento|con ia|desarrollo|paso a paso|escrito/.test(normText)) {
      return 'rama1';
    }
    // Rama 2: Focalizada en la Respuesta / Sin rúbrica / Rápida
    if (/focalizada|sin rubrica|rapida|rapidas|solo clave|directa|alternativas/.test(normText)) {
      return 'rama2';
    }
    return null;
  }

  /**
   * Extrae cantidad de preguntas si fue indicada (ej: "5 preguntas", "10 preg", "de 5")
   */
  function matchQuestionCount(normText) {
    const m = normText.match(/\b(\d{1,2})\s*(?:preguntas?|preg|items?|ejercicios?)\b/) ||
              normText.match(/\bde\s*(\d{1,2})\b/);
    if (m) {
      const val = parseInt(m[1], 10);
      if (val >= 1 && val <= 20) return val;
    }
    return null;
  }

  /**
   * Extrae sesión guardada o intención de escanear sesión
   */
  function matchSession(normText) {
    const isSessionQuery = /sesion|sesiones|escanear|camara|corregir/.test(normText);
    if (!isSessionQuery) return { isSession: false, session: null, candidates: [] };

    const sessions = (typeof ClassroomData !== 'undefined' && typeof ClassroomData.getSavedSessions === 'function')
      ? ClassroomData.getSavedSessions()
      : [];

    // Buscar si especificó un número (ej: "sesion 1", "sesion 2")
    const numMatch = normText.match(/\b(?:sesion|sesiones)\s*(\d+)\b/);
    if (numMatch && sessions.length > 0) {
      const idx = parseInt(numMatch[1], 10) - 1;
      if (idx >= 0 && idx < sessions.length) {
        return { isSession: true, session: sessions[idx], candidates: [] };
      }
    }

    return { isSession: true, session: null, candidates: sessions };
  }

  /**
   * Agrega un mensaje a la conversación del Copilot
   */
  function appendMessage(role, contentHtml) {
    const container = document.getElementById('copilot-messages');
    if (!container) return;

    const msg = document.createElement('div');
    msg.className = role === 'user' ? 'copilot-msg-user' : 'copilot-msg-ai';
    msg.innerHTML = contentHtml;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  }

  /**
   * Muestra u oculta el contenedor de diálogo interactivo (chat drawer)
   */
  function toggleChat(show) {
    const drawer = document.getElementById('copilot-chat-drawer');
    if (!drawer) return;
    drawer.style.display = show ? 'flex' : 'none';
  }

  /**
   * Limpia el historial de diálogo y resetea el estado de ranuras
   */
  function clearChat() {
    const container = document.getElementById('copilot-messages');
    if (container) container.innerHTML = '';
    pendingState = { action: null, branch: null, classroomId: null, classroomName: null, questionCount: null, sessionId: null };
    toggleChat(false);
  }

  /**
   * Ejecuta la navegación concreta en el sistema
   */
  function executeNavigation(state) {
    const { action, branch, classroomId, questionCount, sessionId } = state;

    if (action === 'bank') {
      appendMessage('ai', '📚 Abriendo el <b>Banco de Preguntas</b>...');
      setTimeout(() => {
        if (typeof openFlow === 'function') openFlow('bank');
      }, 350);
      return;
    }

    if (action === 'classrooms') {
      appendMessage('ai', '🏫 Abriendo la gestión de <b>Salones y Nóminas</b>...');
      setTimeout(() => {
        if (typeof openFlow === 'function') openFlow('classrooms');
      }, 350);
      return;
    }

    if (action === 'saved-sessions') {
      if (sessionId) {
        appendMessage('ai', `📷 Cargando sesión guardada para escanear...`);
        setTimeout(() => {
          if (typeof loadAndActivateSavedSession === 'function') {
            loadAndActivateSavedSession(sessionId, { asDirectModalityView: true });
          } else if (typeof openSessionFromBank === 'function') {
            openSessionFromBank(sessionId);
          }
        }, 350);
      } else {
        appendMessage('ai', '📁 Abriendo <b>Sesiones Guardadas</b>...');
        setTimeout(() => {
          if (typeof openFlow === 'function') openFlow('saved-sessions');
        }, 350);
      }
      return;
    }

    if (action === 'eval' || branch) {
      const chosenBranch = branch || 'rama3';
      const branchLabel = chosenBranch === 'rama3' ? 'Cartilla OMR' : (chosenBranch === 'rama2' ? 'Focalizada en la Respuesta' : 'Formativa con IA');
      const clsName = state.classroomName || 'el salón seleccionado';

      appendMessage('ai', `🚀 Preparando evaluación <b>${branchLabel}</b> para <b>${clsName}</b>...`);

      setTimeout(() => {
        // 1. Abrir la rama solicitada
        if (typeof openBranchFlow === 'function') {
          openBranchFlow(chosenBranch);
        }

        // 2. Si hay salón, seleccionarlo en el selector y activar
        if (classroomId) {
          const sel = document.getElementById('builder-classroom');
          if (sel) {
            sel.value = classroomId;
            if (typeof onClassroomSelectChanged === 'function') {
              onClassroomSelectChanged(classroomId);
            }
          }
        }

        // 3. Si hay cantidad de preguntas, configurarla según la rama
        if (questionCount) {
          if (chosenBranch === 'rama3' && typeof setRama3Count === 'function') {
            setRama3Count(questionCount);
          } else if ((chosenBranch === 'rama2' || chosenBranch === 'rama1') && typeof setSimCount === 'function') {
            setSimCount(questionCount);
          }
        }

        // 4. Scroll suave hacia la zona de trabajo
        const evalView = document.getElementById('view-create') || document.getElementById('view-eval');
        if (evalView) {
          evalView.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 400);

      // Reiniciar estado pendiente
      pendingState = { action: null, branch: null, classroomId: null, classroomName: null, questionCount: null, sessionId: null };
    }
  }

  /**
   * Responde cuando el usuario selecciona una opción de aclaración (chip)
   */
  function sendChip(type, value, displayText) {
    appendMessage('user', displayText);

    if (type === 'classroom') {
      pendingState.classroomId = value;
      const cls = typeof ClassroomData !== 'undefined' ? ClassroomData.getClassroom(value) : null;
      pendingState.classroomName = cls ? cls.name : value;

      // Si falta la modalidad, preguntarla
      if (!pendingState.branch) {
        showBranchClarification();
      } else {
        pendingState.action = 'eval';
        executeNavigation(pendingState);
      }
    } else if (type === 'branch') {
      pendingState.branch = value;
      pendingState.action = 'eval';

      // Si falta el salón, preguntarlo
      if (!pendingState.classroomId) {
        showClassroomClarification();
      } else {
        executeNavigation(pendingState);
      }
    } else if (type === 'session') {
      pendingState.action = 'saved-sessions';
      pendingState.sessionId = value;
      executeNavigation(pendingState);
    } else if (type === 'action') {
      pendingState.action = value;
      executeNavigation(pendingState);
    }
  }

  /**
   * Genera chips de salones para aclaración
   */
  function showClassroomClarification(customList) {
    const list = customList || (typeof ClassroomData !== 'undefined' ? ClassroomData.getClassroomList() : []);
    if (!list || list.length === 0) {
      appendMessage('ai', 'No tienes salones registrados todavía. <button type="button" class="copilot-chip" onclick="CopilotCommand.sendChip(\'action\', \'classrooms\', \'Crear Salón\')">🏫 Crear primer salón</button>');
      return;
    }

    let chipsHtml = '<div class="copilot-clarify-chips">';
    list.forEach(c => {
      chipsHtml += `<button type="button" class="copilot-chip" onclick="CopilotCommand.sendChip('classroom', '${c.id}', '${c.name}')">${c.name} (${c.count} alum.)</button>`;
    });
    chipsHtml += '</div>';

    appendMessage('ai', `¿Para qué salón deseas preparar la evaluación?${chipsHtml}`);
  }

  /**
   * Genera chips de modalidad para aclaración
   */
  function showBranchClarification() {
    const chipsHtml = `
      <div class="copilot-clarify-chips">
        <button type="button" class="copilot-chip" onclick="CopilotCommand.sendChip('branch', 'rama3', '📝 Cartilla OMR')">📝 Cartilla OMR (6 a 20 preg.)</button>
        <button type="button" class="copilot-chip" onclick="CopilotCommand.sendChip('branch', 'rama1', '🧠 Formativa con IA')">🧠 Formativa con IA (1 a 2 preg.)</button>
        <button type="button" class="copilot-chip" onclick="CopilotCommand.sendChip('branch', 'rama2', '⚡ Focalizada en la Respuesta')">⚡ Focalizada (1 a 5 preg.)</button>
      </div>
    `;
    const clsInfo = pendingState.classroomName ? ` para <b>${pendingState.classroomName}</b>` : '';
    appendMessage('ai', `¿Qué modalidad de evaluación deseas utilizar${clsInfo}?${chipsHtml}`);
  }

  /**
   * Procesa el texto escrito por el docente (heurística local ultrarrápida)
   */
  function handleInput(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) return;

    toggleChat(true);
    appendMessage('user', trimmed);

    // Limpiar input
    const inputEl = document.getElementById('copilot-input');
    if (inputEl) inputEl.value = '';

    const norm = normalizeText(trimmed);

    // 1. Detección directa: Banco de Preguntas
    if (/banco|banco de preguntas|crear pregunta|nueva pregunta|preguntas guardadas/.test(norm)) {
      pendingState.action = 'bank';
      executeNavigation(pendingState);
      return;
    }

    // 2. Detección directa: Salones y Alumnos
    if (/salones|alumnos|nomina|nominas|estudiantes|aulas|lista de alumnos/.test(norm) && !/cartilla|evaluar|prueba|examen/.test(norm)) {
      pendingState.action = 'classrooms';
      executeNavigation(pendingState);
      return;
    }

    // 3. Detección directa: Sesiones Guardadas / Escanear Sesión
    const sessionRes = matchSession(norm);
    if (sessionRes.isSession) {
      if (sessionRes.session) {
        pendingState.action = 'saved-sessions';
        pendingState.sessionId = sessionRes.session.id;
        executeNavigation(pendingState);
        return;
      }
      if (sessionRes.candidates.length > 0) {
        let chipsHtml = '<div class="copilot-clarify-chips">';
        sessionRes.candidates.forEach((s, idx) => {
          const cls = typeof ClassroomData !== 'undefined' ? ClassroomData.getClassroom(s.classroomId) : null;
          const label = `Sesión ${idx + 1}: ${cls ? cls.name : 'Salón'} (${s.branchTitle || 'Evaluación'})`;
          chipsHtml += `<button type="button" class="copilot-chip" onclick="CopilotCommand.sendChip('session', '${s.id}', '${label}')">${label}</button>`;
        });
        chipsHtml += '</div>';
        appendMessage('ai', `Tienes las siguientes sesiones guardadas listas para escanear:${chipsHtml}`);
        return;
      } else {
        appendMessage('ai', 'No tienes sesiones guardadas todavía. ¿Deseas preparar una nueva evaluación ahora?');
        showBranchClarification();
        return;
      }
    }

    // 4. Extracción de entidades para evaluación: Salón, Modalidad, Preguntas
    const branch = matchBranch(norm);
    const clsRes = matchClassroom(norm);
    const qCount = matchQuestionCount(norm);

    if (branch) pendingState.branch = branch;
    if (qCount) pendingState.questionCount = qCount;
    if (clsRes.match) {
      pendingState.classroomId = clsRes.match.id;
      pendingState.classroomName = clsRes.match.name;
    }

    // Caso A: Salón ambiguo (ej: escribió "4to" y hay 4° A y 4° B)
    if (!clsRes.match && clsRes.candidates.length > 1) {
      appendMessage('ai', `Encontré más de un salón para esa indicación. ¿A cuál te refieres?`);
      showClassroomClarification(clsRes.candidates);
      return;
    }

    // Caso B: Tenemos Modalidad y Salón -> ¡Ejecución inmediata!
    if (pendingState.branch && pendingState.classroomId) {
      pendingState.action = 'eval';
      executeNavigation(pendingState);
      return;
    }

    // Caso C: Tenemos solo la Modalidad pero falta el Salón
    if (pendingState.branch && !pendingState.classroomId) {
      const branchTitle = pendingState.branch === 'rama3' ? 'Cartilla OMR' : (pendingState.branch === 'rama2' ? 'Focalizada' : 'Formativa con IA');
      appendMessage('ai', `¡Excelente! Vamos a preparar una evaluación con <b>${branchTitle}</b>.`);
      showClassroomClarification();
      return;
    }

    // Caso D: Tenemos solo el Salón pero falta la Modalidad
    if (!pendingState.branch && pendingState.classroomId) {
      appendMessage('ai', `Entendido, evaluaremos a <b>${pendingState.classroomName}</b>.`);
      showBranchClarification();
      return;
    }

    // Caso E: Solo indicó cantidad de preguntas (ej: "quiero tomar 5 preguntas")
    if (pendingState.questionCount && !pendingState.branch && !pendingState.classroomId) {
      appendMessage('ai', `Para una evaluación de <b>${pendingState.questionCount} preguntas</b>, ¿qué modalidad y salón prefieres?`);
      showBranchClarification();
      return;
    }

    // Caso F: Consulta general / no reconocida con las reglas locales
    appendMessage('ai', `
      Puedo ayudarte a preparar evaluaciones o navegar rápidamente por el sistema. Prueba con:
      <div class="copilot-clarify-chips" style="margin-top:8px;">
        <button type="button" class="copilot-chip" onclick="CopilotCommand.sendQuick('Cartilla OMR para 4° A')">📝 Cartilla 4° A</button>
        <button type="button" class="copilot-chip" onclick="CopilotCommand.sendQuick('Banco de Preguntas')">📚 Banco de Preguntas</button>
        <button type="button" class="copilot-chip" onclick="CopilotCommand.sendQuick('Escanear sesión guardada')">📷 Escanear Sesión</button>
        <button type="button" class="copilot-chip" onclick="CopilotCommand.sendQuick('Ver salones y alumnos')">🏫 Ver Salones</button>
      </div>
    `);
  }

  /**
   * Enviar consulta rápida desde los chips de sugerencia
   */
  function sendQuick(promptText) {
    const inputEl = document.getElementById('copilot-input');
    if (inputEl) inputEl.value = promptText;
    handleInput(promptText);
  }

  /**
   * Inicialización de eventos del Copilot
   */
  function init() {
    const inputEl = document.getElementById('copilot-input');
    const submitBtn = document.getElementById('copilot-submit-btn');

    if (inputEl) {
      inputEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleInput(inputEl.value);
        }
      });
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', function () {
        if (inputEl) handleInput(inputEl.value);
      });
    }
  }

  // Exportar API global
  global.CopilotCommand = {
    init,
    handleInput,
    sendChip,
    sendQuick,
    toggleChat,
    clearChat
  };

  // Inicializar al cargar el DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(typeof window !== 'undefined' ? window : this);
