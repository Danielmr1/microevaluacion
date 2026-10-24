/**
 * EVA Copilot: Barra de Comandos Inteligente, Gestión y Orquestador Principal (v3.10.30)
 * Microevaluación Formativa
 *
 * Submódulos auxiliares vinculados:
 *   - copilot-analytics.js : Cuadros comparativos, errores frecuentes y exportación Excel (Fase 3)
 *   - copilot-ai.js        : Redacción de preguntas, rúbricas Gemini y 3 strikes (Fase 2)
 *
 * Capacidades:
 * - Fase 1: Navegación instantánea (0 ms, offline) y aclaración con chips interactivos.
 * - Fase 2: Gestión asistida con tarjetas interactivas de confirmación en el chat.
 */

(function (global) {
  "use strict";

  // Estado conversacional de ranuras (slots)
  let pendingState = {
    action: null,
    branch: null,
    classroomId: null,
    classroomName: null,
    questionCount: null,
    sessionId: null,
    createClassData: null,
    createQuestionData: null
  };

  function appendMessage(role, contentHtml) {
    const container = document.getElementById('copilot-messages');
    if (!container) return;

    const msg = document.createElement('div');
    msg.className = role === 'user' ? 'copilot-msg-user' : 'copilot-msg-ai';
    if (role === 'user') {
      msg.textContent = contentHtml;
    } else {
      msg.innerHTML = sanitizeCopilotHtml(contentHtml);
    }
    container.appendChild(msg);

    // Guardarraíl: Mantener solo los últimos 25 mensajes visibles en pantalla
    while (container.children.length > MAX_VISIBLE_MESSAGES) {
      container.firstElementChild.remove();
    }

    container.scrollTop = container.scrollHeight;
  }

  /**
   * Muestra u oculta el contenedor de diálogo interactivo (chat drawer)
   * Opción A: Oculta la barra superior fija cuando el chat está abierto para evitar dos cajas de texto
   */
  function toggleChat(show) {
    const drawer = document.getElementById('copilot-chat-drawer');
    const inputWrapper = document.querySelector('.copilot-input-wrapper');
    const quickChips = document.getElementById('copilot-quick-chips');
    const drawerInput = document.getElementById('copilot-drawer-input');

    if (!drawer) return;

    if (show) {
      drawer.style.display = 'flex';
      if (inputWrapper) inputWrapper.style.display = 'none';
      if (quickChips) quickChips.style.display = 'none';
      if (drawerInput) {
        setTimeout(() => drawerInput.focus(), 80);
      }
    } else {
      drawer.style.display = 'none';
      if (inputWrapper) inputWrapper.style.display = 'flex';
      if (quickChips) quickChips.style.display = 'flex';
      const mainInput = document.getElementById('copilot-input');
      if (mainInput) {
        setTimeout(() => mainInput.focus(), 80);
      }
    }
  }

  /**
   * Limpia el historial de diálogo y resetea el estado de ranuras
   */
  function clearChat() {
    const container = document.getElementById('copilot-messages');
    if (container) container.innerHTML = '';
    pendingState = { action: null, branch: null, classroomId: null, classroomName: null, questionCount: null, sessionId: null, createClassData: null, createQuestionData: null };
    chatHistory = [];
    toggleChat(false);
  }

  /**
   * Descarta una tarjeta interactiva sin ejecutar cambios
   */
  function dismissCard(cardId) {
    const el = document.getElementById(cardId);
    if (el) {
      el.innerHTML = '<span style="color:#64748b; font-size:0.8rem; font-style:italic;">Operación cancelada.</span>';
      setTimeout(() => el.remove(), 1200);
    }
  }

  /**
   * Exporta datos analíticos generados a Excel con SheetJS (Fase 3 - Regla 10)
   */

  async function confirmCreateClassroom(payloadStr, cardId) {
    const cardEl = document.getElementById(cardId);
    if (cardEl) {
      cardEl.innerHTML = '<span style="color:#0284c7; font-size:0.82rem; font-weight:700;">⏳ Creando salón y registrando nómina...</span>';
    }

    try {
      const data = JSON.parse(decodeURIComponent(payloadStr));
      const gradeCode = data.name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'S1';
      const color = (typeof ClassroomData !== 'undefined' && ClassroomData.pickColorForNewClassroom)
        ? ClassroomData.pickColorForNewClassroom()
        : '#3b82f6';

      let newId = null;

      if (typeof SupabaseClient !== 'undefined' && SupabaseClient.createClassroom) {
        const res = await SupabaseClient.createClassroom(data.name, gradeCode, color, data.gradeStage, data.gradeLevel);
        newId = (res && res.id) || (res && res.data && res.data.id);
        if (newId && data.students && data.students.length > 0 && SupabaseClient.importStudents) {
          await SupabaseClient.importStudents(newId, data.students);
        }
      }

      if (!newId) {
        newId = `cls_${Date.now()}`;
      }

      const currentList = (typeof ClassroomData !== 'undefined' && ClassroomData.getClassroomList)
        ? ClassroomData.getClassroomList()
        : [];

      const newClsObj = {
        id: newId,
        name: data.name,
        gradeCode: gradeCode,
        color: color,
        gradeStage: data.gradeStage,
        gradeLevel: data.gradeLevel,
        students: data.students || []
      };

      if (typeof ClassroomData !== 'undefined' && ClassroomData.setClassrooms) {
        const fullList = currentList.map(c => ClassroomData.getClassroom(c.id) || c);
        fullList.push(newClsObj);
        ClassroomData.setClassrooms(fullList);
      }

      if (typeof renderClassroomSelect === 'function') renderClassroomSelect();
      if (typeof renderClassroomManager === 'function') renderClassroomManager(newId);

      if (cardEl) {
        cardEl.innerHTML = `
          <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:10px; color:#15803d; font-size:0.82rem;">
            ✅ <b>¡Salón creado con éxito!</b><br>
            "${data.name}" con ${data.students.length} estudiantes registrados.
            <div style="margin-top:8px;">
              <button type="button" class="copilot-card-btn copilot-card-btn-primary" onclick="CopilotCommand.sendQuick('Evaluar a ${data.name}')">🚀 Preparar Evaluación para este Salón</button>
            </div>
          </div>
        `;
      }

      if (typeof showToast === 'function') showToast(`✅ Salón "${data.name}" creado con éxito.`);

    } catch (err) {
      console.error('[Copilot createClassroom Error]', err);
      if (cardEl) {
        cardEl.innerHTML = `<span style="color:#ef4444; font-size:0.8rem;">❌ Error al crear el salón: ${err.message || 'error'}</span>`;
      }
    }
  }

  /**
   * Confirma y guarda una pregunta en el Banco de Preguntas con su Rúbrica completa (Regla 6)
   */

  async function confirmDeleteClassroom(classroomId, cardId) {
    const cardEl = document.getElementById(cardId);
    const inUse = (typeof ClassroomData !== 'undefined' && ClassroomData.isClassroomInUse)
      ? ClassroomData.isClassroomInUse(classroomId)
      : (typeof ClassroomData !== 'undefined' && ClassroomData.isClassroomInSavedSession ? ClassroomData.isClassroomInSavedSession(classroomId) : { inUse: false });
    if (inUse && inUse.inUse) {
      if (cardEl) {
        cardEl.innerHTML = `
          <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:10px; padding:10px; color:#92400e; font-size:0.82rem;">
            ⚠️ <b>No se puede eliminar este salón:</b> está en uso en "${inUse.sessionTitle}". Debes eliminar esa sesión en "Sesiones Guardadas" primero.
          </div>
        `;
      }
      if (typeof showToast === 'function') {
        showToast(`⚠️ Salón en uso en la sesión "${inUse.sessionTitle}".`);
      }
      return;
    }

    if (cardEl) {
      cardEl.innerHTML = '<span style="color:#ef4444; font-size:0.82rem; font-weight:700;">⏳ Eliminando salón...</span>';
    }

    try {
      if (typeof SupabaseClient !== 'undefined' && SupabaseClient.deleteClassroom) {
        await SupabaseClient.deleteClassroom(classroomId);
      }

      if (typeof ClassroomData !== 'undefined' && ClassroomData.getClassroomList) {
        const remaining = ClassroomData.getClassroomList().filter(c => c.id !== classroomId);
        const mapped = remaining.map(c => ClassroomData.getClassroom(c.id) || c);
        ClassroomData.setClassrooms(mapped);
      }

      if (typeof renderClassroomSelect === 'function') renderClassroomSelect();
      if (typeof renderClassroomManager === 'function') renderClassroomManager();

      if (cardEl) {
        cardEl.innerHTML = `
          <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:10px; padding:10px; color:#b91c1c; font-size:0.82rem;">
            🗑️ <b>Salón eliminado definitivamente.</b>
          </div>
        `;
      }

      if (typeof showToast === 'function') showToast('🗑️ Salón eliminado con éxito.');

    } catch (err) {
      console.error('[Copilot deleteClassroom Error]', err);
      if (cardEl) {
        cardEl.innerHTML = `<span style="color:#ef4444; font-size:0.8rem;">❌ Error al eliminar salón: ${err.message || 'error'}</span>`;
      }
    }
  }

  /**
   * Ejecuta la navegación concreta en el sistema (Fase 1)
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
        if (typeof openBranchFlow === 'function') {
          openBranchFlow(chosenBranch);
        }

        if (classroomId) {
          const sel = document.getElementById('builder-classroom');
          if (sel) {
            sel.value = classroomId;
            if (typeof onClassroomSelectChanged === 'function') {
              onClassroomSelectChanged(classroomId);
            }
          }
        }

        if (questionCount) {
          if (chosenBranch === 'rama3' && typeof setRama3Count === 'function') {
            setRama3Count(questionCount);
          } else if ((chosenBranch === 'rama2' || chosenBranch === 'rama1') && typeof setSimCount === 'function') {
            setSimCount(questionCount);
          }
        }

        const evalView = document.getElementById('view-create') || document.getElementById('view-eval');
        if (evalView) {
          evalView.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 400);

      pendingState = { action: null, branch: null, classroomId: null, classroomName: null, questionCount: null, sessionId: null, createClassData: null, createQuestionData: null };
    }
  }

  /**
   * Responde cuando el usuario selecciona una opción de aclaración (chip).
   * Poda y rebobina el chat si se pulsa una opción de un paso anterior.
   */

  function sendChip(type, value, displayText, btnEl) {
    // Rebobinar (Rollback): Si el chip pulsado proviene de un paso anterior,
    // eliminamos todos los mensajes que se generaron después de ese mensaje.
    const trigger = btnEl || (typeof window !== 'undefined' && window.event && window.event.target ? window.event.target : null);
    if (trigger && typeof trigger.closest === 'function') {
      const msgEl = trigger.closest('.copilot-msg-ai');
      if (msgEl) {
        while (msgEl.nextElementSibling) {
          msgEl.nextElementSibling.remove();
        }
        const allChips = msgEl.querySelectorAll('.copilot-chip');
        allChips.forEach(c => c.classList.remove('is-selected'));
        const activeBtn = trigger.classList.contains('copilot-chip') ? trigger : trigger.closest('.copilot-chip');
        if (activeBtn) activeBtn.classList.add('is-selected');
      }
    }

    appendMessage('user', displayText);

    if (type === 'classroom') {
      const cls = typeof ClassroomData !== 'undefined' ? ClassroomData.getClassroom(value) : null;
      if (!cls || !cls.students || cls.students.length === 0) {
        appendMessage('ai', `⚠️ <b>El salón "${displayText}" no tiene alumnos registrados.</b> No es posible preparar una evaluación para un salón vacío. Carga la lista de estudiantes primero.`);
        return;
      }
      pendingState.classroomId = value;
      pendingState.classroomName = cls ? cls.name : value;

      if (!pendingState.branch) {
        showBranchClarification();
      } else {
        pendingState.action = 'eval';
        executeNavigation(pendingState);
      }
    } else if (type === 'branch') {
      pendingState.branch = value;
      pendingState.action = 'eval';

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
    } else if (type === 'create_q_grade') {
      const [stage, level] = value.split(':');
      const topic = pendingState.createQuestionData?.topic || 'Matemática';
      renderQuestionPreviewCard(topic, stage, parseInt(level, 10));
    } else if (type === 'cq_grade') {
      const [stage, level] = value.split(':');
      if (!pendingState.createQuestionData) pendingState.createQuestionData = {};
      pendingState.createQuestionData.stage = stage;
      pendingState.createQuestionData.level = parseInt(level, 10);
      pendingState.createQuestionData.gradeText = displayText;
      pendingState.action = 'create_question_await_topic';

      const isSec = stage === 'secundaria';
      const topicChips = isSec
        ? `
          <div class="copilot-clarify-chips" style="margin-top:6px;">
            <button type="button" class="copilot-chip" onclick="CopilotCommand.sendChip('cq_topic', 'Ecuaciones lineales', '📐 Ecuaciones lineales', this)">📐 Ecuaciones lineales</button>
            <button type="button" class="copilot-chip" onclick="CopilotCommand.sendChip('cq_topic', 'Porcentajes y descuentos', '🏷️ Porcentajes', this)">🏷️ Porcentajes</button>
            <button type="button" class="copilot-chip" onclick="CopilotCommand.sendChip('cq_topic', 'Perímetro y áreas geométricas', '📏 Geometría', this)">📏 Geometría</button>
            <button type="button" class="copilot-chip" onclick="CopilotCommand.sendChip('cq_topic', 'Funciones y gráficas', '📈 Funciones', this)">📈 Funciones</button>
          </div>
        `
        : `
          <div class="copilot-clarify-chips" style="margin-top:6px;">
            <button type="button" class="copilot-chip" onclick="CopilotCommand.sendChip('cq_topic', 'Fracciones y partes', '🥧 Fracciones', this)">🥧 Fracciones</button>
            <button type="button" class="copilot-chip" onclick="CopilotCommand.sendChip('cq_topic', 'Multiplicación y problemas cotidianos', '✖️ Multiplicación', this)">✖️ Multiplicación</button>
            <button type="button" class="copilot-chip" onclick="CopilotCommand.sendChip('cq_topic', 'Perímetros de figuras planas', '📐 Perímetros', this)">📐 Perímetros</button>
            <button type="button" class="copilot-chip" onclick="CopilotCommand.sendChip('cq_topic', 'Ecuaciones y valor desconocido', '🔢 Ecuaciones', this)">🔢 Ecuaciones</button>
          </div>
        `;

      appendMessage('ai', `Grado seleccionado: <b>${displayText}</b>.<br><br><b>Paso 2:</b> ¿Qué <b>tema</b> o competencia deseas trabajar? Elige un tema sugerido o <i>escribe el tema deseado en el chat</i>:${topicChips}`);
    } else if (type === 'cq_topic') {
      if (!pendingState.createQuestionData) pendingState.createQuestionData = {};
      pendingState.createQuestionData.topic = value;
      pendingState.action = 'create_question_await_rubric';

      const rubricChips = `
        <div class="copilot-clarify-chips" style="margin-top:6px; flex-direction:column; align-items:stretch; gap:6px;">
          <button type="button" class="copilot-chip" style="text-align:left; padding:8px 12px;" onclick="CopilotCommand.sendChip('cq_rubric', 'con_rubrica', '✨ Con Rúbrica Pedagógica', this)">
            <b>✨ Con Rúbrica Pedagógica</b><br>
            <span style="font-size:0.75rem; color:#475569;">Para la modalidad Formativa con IA. Genera solución canónica y criterios ponderados para calificar el borrador manuscrito.</span>
          </button>
          <button type="button" class="copilot-chip" style="text-align:left; padding:8px 12px;" onclick="CopilotCommand.sendChip('cq_rubric', 'sin_rubrica', '⚡ Sin Rúbrica (Pregunta Rápida)', this)">
            <b>⚡ Sin Rúbrica (Pregunta Rápida)</b><br>
            <span style="font-size:0.75rem; color:#475569;">Para la modalidad Focalizada y Cartillas OMR. Calificación determinista inmediata sólo por clave.</span>
          </button>
        </div>
      `;

      appendMessage('ai', `Tema establecido: <b>${value}</b> para <b>${pendingState.createQuestionData.gradeText || 'el grado'}</b>.<br><br><b>Paso 3:</b> ¿Deseas la pregunta con rúbrica de IA o rápida sin rúbrica?${rubricChips}`);
    } else if (type === 'cq_rubric') {
      const hasRubric = value === 'con_rubrica';
      const qData = pendingState.createQuestionData || {};
      const topic = qData.topic || 'Matemática';
      const stage = qData.stage || 'primaria';
      const level = qData.level || 4;
      const preferredKey = qData.preferredKey || null;

      pendingState = { action: null, branch: null, classroomId: null, classroomName: null, questionCount: null, sessionId: null, createClassData: null, createQuestionData: null };
      renderQuestionPreviewCard(topic, stage, level, preferredKey, hasRubric);
    }
  }

  /**
   * Genera chips de salones para aclaración
   */
  function showClassroomClarification(customList) {
    const list = customList || (typeof ClassroomData !== 'undefined' ? ClassroomData.getClassroomList() : []);
    const validList = list.filter(c => c.count > 0);
    if (!validList || validList.length === 0) {
      appendMessage('ai', 'No tienes salones con alumnos registrados todavía. Recuerda que según las reglas de Microevaluación no es posible evaluar un salón vacío. <button type="button" class="copilot-chip" onclick="CopilotCommand.sendChip(\'action\', \'classrooms\', \'Crear Salón\', this)">🏫 Crear primer salón con alumnos</button>');
      return;
    }

    let chipsHtml = '<div class="copilot-clarify-chips">';
    validList.forEach(c => {
      chipsHtml += `<button type="button" class="copilot-chip" onclick="CopilotCommand.sendChip('classroom', '${c.id}', '${c.name}', this)">${c.name} (${c.count} alum.)</button>`;
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
        <button type="button" class="copilot-chip" onclick="CopilotCommand.sendChip('branch', 'rama3', '📝 Cartilla OMR', this)">📝 Cartilla OMR (6 a 20 preg.)</button>
        <button type="button" class="copilot-chip" onclick="CopilotCommand.sendChip('branch', 'rama1', '🧠 Formativa con IA', this)">🧠 Formativa con IA (1 a 2 preg.)</button>
        <button type="button" class="copilot-chip" onclick="CopilotCommand.sendChip('branch', 'rama2', '⚡ Focalizada en la Respuesta', this)">⚡ Focalizada (1 a 5 preg.)</button>
      </div>
    `;
    const clsInfo = pendingState.classroomName ? ` para <b>${pendingState.classroomName}</b>` : '';
    appendMessage('ai', `¿Qué modalidad de evaluación deseas utilizar${clsInfo}?${chipsHtml}`);
  }

  /**
   * Renderiza la tarjeta de previsualización para creación de salón (Fase 2)
   */
  function renderClassroomPreviewCard(data) {
    const cardId = `card-cls-${Date.now()}`;
    const encData = encodeURIComponent(JSON.stringify(data));
    const stCount = data.students ? data.students.length : 0;
    const stText = stCount > 0 ? `<b>${stCount} alumnos detectados:</b> ${data.students.map(s => s.name).join(', ')}` : 'Sin lista de alumnos (puedes agregarlos luego).';

    const cardHtml = `
      <div class="copilot-action-card" id="${cardId}">
        <span class="copilot-card-badge badge-blue">🏫 Nuevo Salón por Confirmar</span>
        <h4 class="copilot-card-title">${data.name}</h4>
        <div class="copilot-card-details">
          • <b>Grado pedagógico:</b> ${data.gradeText}<br>
          • <b>Nómina:</b> ${stText}
        </div>
        <div class="copilot-card-actions">
          <button type="button" class="copilot-card-btn copilot-card-btn-primary" onclick="CopilotCommand.confirmCreateClassroom('${encData}', '${cardId}')">✅ Confirmar y Crear Salón</button>
          <button type="button" class="copilot-card-btn copilot-card-btn-secondary" onclick="CopilotCommand.dismissCard('${cardId}')">❌ Cancelar</button>
        </div>
      </div>
    `;

    appendMessage('ai', `He preparado los datos del nuevo salón. Confirma para darlo de alta en el sistema:${cardHtml}`);
  }

  /**
   * Inicia el flujo de Generar Sesión con verificación previa de cupo (máx. 8 sesiones)
   */
  function handleGenerateSession() {
    toggleChat(true);

    const sessions = (typeof ClassroomData !== 'undefined' && ClassroomData.getSavedSessions)
      ? ClassroomData.getSavedSessions()
      : [];
    const maxSess = (typeof ClassroomData !== 'undefined' && ClassroomData.MAX_SAVED_SESSIONS) || 8;

    if (sessions.length >= maxSess) {
      appendMessage('ai', `
        ⚠️ <b>Límite de sesiones alcanzado (${sessions.length} de ${maxSess}).</b><br><br>
        Ya tienes las ${maxSess} sesiones ocupadas. Para generar una nueva sesión, primero debes liberar espacio eliminando alguna que ya no utilices.
        <div class="copilot-clarify-chips" style="margin-top:10px;">
          <button type="button" class="copilot-chip" style="background:#0284c7; color:#ffffff; font-weight:700;" onclick="CopilotCommand.goToSavedSessions()">📂 Ir a Sesiones Guardadas (${sessions.length}/${maxSess})</button>
        </div>
      `);
      return;
    }

    appendMessage('ai', `
      Para generar tu nueva sesión, elige una de las 3 modalidades de evaluación:
      <div class="copilot-clarify-chips" style="margin-top:10px; display:flex; flex-direction:column; gap:8px;">
        <button type="button" class="copilot-chip" style="text-align:left; padding:9px 13px;" onclick="CopilotCommand.selectBranchAndStart('rama1')">
          <b>🧠 Formativa con IA</b><br>
          <span style="font-size:0.75rem; color:#475569;">1 a 2 preguntas. Rúbrica pedagógica y análisis de borradores manuscritos.</span>
        </button>
        <button type="button" class="copilot-chip" style="text-align:left; padding:9px 13px;" onclick="CopilotCommand.selectBranchAndStart('rama2')">
          <b>⚡ Focalizada en la Respuesta</b><br>
          <span style="font-size:0.75rem; color:#475569;">1 a 5 preguntas. Corrección inmediata y directa por clave o número.</span>
        </button>
        <button type="button" class="copilot-chip" style="text-align:left; padding:9px 13px;" onclick="CopilotCommand.selectBranchAndStart('rama3')">
          <b>📝 Cartilla OMR</b><br>
          <span style="font-size:0.75rem; color:#475569;">6 a 20 preguntas. Evaluación estándar con hoja de respuestas de burbujas.</span>
        </button>
      </div>
    `);
  }

  /**
   * Cierra el chat y navega a la vista de sesiones guardadas
   */
  function goToSavedSessions() {
    toggleChat(false);
    if (typeof openFlow === 'function') {
      openFlow('saved-sessions');
    }
  }

  /**
   * Cierra el chat y arranca el flujo de la modalidad elegida
   */
  function selectBranchAndStart(branch) {
    toggleChat(false);
    if (typeof openBranchFlow === 'function') {
      openBranchFlow(branch);
    }
  }

  /**
   * Inicia el flujo conversacional guiado para crear una pregunta IA en el Banco
   * Paso 1: Grado curricular (asociado al grado, no a salones)
   * Paso 2: Tema / competencia (sugerencias o texto libre en el chat)
   * Paso 3: Rúbrica (Con Rúbrica Pedagógica para Formativa con IA / Sin Rúbrica para Focalizada y Cartillas OMR)
   * Paso 4: Tarjeta de acción con alternativas, guardado en banco y opción de regenerar
   */

  function renderClassroomDeleteCard(cls) {
    const inUse = (typeof ClassroomData !== 'undefined' && ClassroomData.isClassroomInUse)
      ? ClassroomData.isClassroomInUse(cls.id)
      : (typeof ClassroomData !== 'undefined' && ClassroomData.isClassroomInSavedSession ? ClassroomData.isClassroomInSavedSession(cls.id) : { inUse: false });
    if (inUse && inUse.inUse) {
      appendMessage('ai', `⚠️ No puedo eliminar el salón <b>"${cls.name}"</b> porque está siendo utilizado en la sesión <b>"${inUse.sessionTitle}"</b>.<br><br>Para proteger los resultados y las fichas de evaluación impresas, elimina primero esa sesión en <i>Sesiones Guardadas</i>.`);
      return;
    }
    const cardId = `card-del-${Date.now()}`;
    const cardHtml = `
      <div class="copilot-action-card" id="${cardId}" style="border-color:#fecaca;">
        <span class="copilot-card-badge badge-red">⚠️ Confirmación de Eliminación</span>
        <h4 class="copilot-card-title" style="color:#b91c1c;">¿Eliminar el salón "${cls.name}"?</h4>
        <div class="copilot-card-details">
          Esta acción eliminará el salón y sus <b>${cls.students ? cls.students.length : cls.count || 0} estudiantes</b> registrados.
        </div>
        <div class="copilot-card-actions">
          <button type="button" class="copilot-card-btn copilot-card-btn-danger" onclick="CopilotCommand.confirmDeleteClassroom('${cls.id}', '${cardId}')">🗑️ Sí, Eliminar Definitivamente</button>
          <button type="button" class="copilot-card-btn copilot-card-btn-secondary" onclick="CopilotCommand.dismissCard('${cardId}')">Cancelar</button>
        </div>
      </div>
    `;

    appendMessage('ai', `Esta acción requiere confirmación:${cardHtml}`);
  }

  /**
   * Procesa el texto escrito por el docente (heurística local y Fases 1, 2 y 3)
   */
  function handleInput(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) return;

    toggleChat(true);
    appendMessage('user', trimmed);

    const inputEl = document.getElementById('copilot-input');
    if (inputEl) inputEl.value = '';

    const norm = normalizeText(trimmed);

    // =========================================================================
    // GUARDARRAÍL 1: ESPERA DE NÓMINA SI SE INTENTÓ CREAR SALÓN VACÍO
    // =========================================================================
    if (pendingState.action === 'create_classroom_pending_students' && pendingState.createClassData) {
      const rawList = trimmed.split(/[,;\n]+/);
      const students = rawList
        .map(s => s.trim().replace(/^[\d.\-\s]+/, ''))
        .filter(s => s.length > 2)
        .map((name, i) => {
          const parts = name.split(/\s+/);
          const shortName = parts[0] || `ALUMNO_${i + 1}`;
          return {
            id: `alu_${Date.now()}_${i + 1}`,
            name: name.toUpperCase(),
            shortName: shortName.toUpperCase(),
            position: i + 1
          };
        });

      if (students.length === 0) {
        appendMessage('ai', '⚠️ No detecté nombres válidos. Por favor escribe o pega al menos el nombre de un estudiante (ej. <i>"Juan Pérez, María Gómez"</i>):');
        return;
      }

      pendingState.createClassData.students = students;
      pendingState.action = null;
      renderClassroomPreviewCard(pendingState.createClassData);
      return;
    }

    // =========================================================================
    // GUARDARRAÍL: ESPERA DE RESPUESTAS EN FLUJO GUIADO DE PREGUNTA IA
    // =========================================================================
    if (pendingState.action === 'create_question_await_grade') {
      const isSec = /sec|secundaria/.test(norm);
      const stage = isSec ? 'secundaria' : 'primaria';
      const numMatch = norm.match(/\b([1-6])\b/);
      if (numMatch) {
        const level = parseInt(numMatch[1], 10);
        if (stage === 'primaria' && (level < 4 || level > 6)) {
          appendMessage('ai', '⚠️ En Primaria el sistema está habilitado exclusivamente para <b>4°, 5° y 6° grado</b>.<br>Por favor selecciona uno de estos grados:');
          return;
        }
        if (stage === 'secundaria' && (level < 1 || level > 5)) {
          appendMessage('ai', '⚠️ En Secundaria el sistema está habilitado de <b>1° a 5° año</b>.<br>Por favor selecciona uno de estos grados:');
          return;
        }
        sendChip('cq_grade', `${stage}:${level}`, `${level}° ${stage === 'secundaria' ? 'Secundaria' : 'Primaria'}`);
        return;
      }
      appendMessage('ai', 'Por favor selecciona o escribe el grado oficial (ej. <i>"4° Primaria"</i> o <i>"2° Secundaria"</i>):');
      return;
    }

    if (pendingState.action === 'create_question_await_topic') {
      sendChip('cq_topic', trimmed, trimmed);
      return;
    }

    if (pendingState.action === 'create_question_await_rubric') {
      const withRubric = /con|si|rubrica|formativa|pedagogica/i.test(norm) && !/sin|no|rapida|focalizada|omr/i.test(norm);
      sendChip('cq_rubric', withRubric ? 'con_rubrica' : 'sin_rubrica', withRubric ? '✨ Con Rúbrica Pedagógica' : '⚡ Sin Rúbrica');
      return;
    }

    // =========================================================================
    // CHAT CONVERSACIONAL PEDAGÓGICO CON IA REAL (GEMINI)
    // =========================================================================
    handleAIChatMessage(trimmed);
  }

  /**
   * Cierra el chat y abre la ventana modal de creación de salón
   */
  function openCreateClassroomModalFromChat() {
    toggleChat(false);
    if (typeof openAddClassroomModal === 'function') {
      openAddClassroomModal();
    } else if (typeof openFlow === 'function') {
      openFlow('classrooms');
    }
  }

  /**
   * Procesa mensajes en lenguaje natural con IA real (Gemini en Supabase)
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
    // --- Barra de comandos superior (fuera del chat drawer) ---
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

    // --- Caja de texto libre dentro del chat drawer ---
    const drawerInput = document.getElementById('copilot-drawer-input');
    const drawerSubmit = document.getElementById('copilot-drawer-submit');

    if (drawerInput) {
      drawerInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          const val = drawerInput.value.trim();
          if (val) {
            handleInput(val);
            drawerInput.value = '';
          }
        }
      });
    }

    if (drawerSubmit) {
      drawerSubmit.addEventListener('click', function () {
        const val = drawerInput ? drawerInput.value.trim() : '';
        if (val) {
          handleInput(val);
          drawerInput.value = '';
        }
      });
    }
  }

  // Exportar API global completa unificada
  global.CopilotCommand = {
    init,
    handleInput,
    appendMessage,
    sendChip,
    sendQuick,
    toggleChat,
    clearChat,
    dismissCard,
    handleGenerateSession,
    goToSavedSessions,
    selectBranchAndStart,
    openCreateClassroomModalFromChat,
    confirmCreateClassroom,
    confirmDeleteClassroom,
    // Delegados en copilot-ai.js
    startCreateQuestionFlow: (...args) => (global.CopilotAI && global.CopilotAI.startCreateQuestionFlow(...args)),
    regenerateQuestion: (...args) => (global.CopilotAI && global.CopilotAI.regenerateQuestion(...args)),
    confirmSaveQuestion: (...args) => (global.CopilotAI && global.CopilotAI.confirmSaveQuestion(...args)),
    getChatStrikeStatus: (...args) => (global.CopilotAI && global.CopilotAI.getChatStrikeStatus(...args)),
    resetChatStrikes: (...args) => (global.CopilotAI && global.CopilotAI.resetChatStrikes(...args)),
    formatCopilotMarkdown: (...args) => (global.CopilotAI ? global.CopilotAI.formatCopilotMarkdown(...args) : (args[0] || "")),
    // Delegados en copilot-analytics.js
    exportAnalyticsToExcel: (...args) => (global.CopilotAnalytics && global.CopilotAnalytics.exportAnalyticsToExcel(...args)),
    renderComparativeTable: (...args) => (global.CopilotAnalytics && global.CopilotAnalytics.renderComparativeTable(...args)),
    renderQuestionErrorAnalysis: (...args) => (global.CopilotAnalytics && global.CopilotAnalytics.renderQuestionErrorAnalysis(...args)),
    renderStudentsReinforcement: (...args) => (global.CopilotAnalytics && global.CopilotAnalytics.renderStudentsReinforcement(...args))
  };

  // Inicializar al cargar el DOM
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})(typeof window !== "undefined" ? window : this);
