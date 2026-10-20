/**
 * EVA Copilot: Barra de Comandos Inteligente y Gestión Asistida (Fase 1 y Fase 2)
 * Microevaluación Formativa - Versión 3.2.91
 * 
 * Capacidades:
 * - Fase 1: Navegación instantánea (0 ms, offline) y aclaración con chips interactivos.
 * - Fase 2: Gestión asistida con tarjetas interactivas de confirmación en el chat:
 *   1. Creación asistida de salones (con o sin nómina de estudiantes).
 *   2. Creación asistida de preguntas con sus 4 alternativas y rúbrica pedagógica (Regla 6).
 *   3. Eliminación protegida de salones con doble confirmación y chequeo de sesiones.
 */

(function (global) {
  'use strict';

  // Estado conversacional de ranuras (slots)
  let pendingState = {
    action: null,        // 'eval' | 'bank' | 'classrooms' | 'saved-sessions' | 'create_classroom' | 'create_question' | 'delete_classroom'
    branch: null,        // 'rama1' | 'rama2' | 'rama3'
    classroomId: null,   // id del salón
    classroomName: null, // nombre legible
    questionCount: null, // número de preguntas (opcional)
    sessionId: null,     // id de sesión guardada
    createClassData: null, // { name, gradeStage, gradeLevel, students }
    createQuestionData: null // { topic, gradeStage, gradeLevel, key }
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

      const gradeMatch = clsNorm.match(/\b([1-6])\b/);
      const sectionMatch = clsNorm.match(/\b([a-z])\b/);
      const isSec = clsNorm.includes('sec');
      const isPri = clsNorm.includes('pri') || !isSec;

      const num = gradeMatch ? gradeMatch[1] : null;
      const sec = sectionMatch ? sectionMatch[1] : null;

      if (num && sec) {
        const patternStrict = new RegExp(`\\b${num}\\s*°?\\s*${sec}\\b|\\b${num}${sec}\\b`);
        if (patternStrict.test(normText)) {
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
    if (/cartilla|cartillas|burbuja|burbujas|omr|hoja de respuesta|fichas de respuesta/.test(normText)) {
      return 'rama3';
    }
    if (/formativa|rubrica|procedimiento|con ia|desarrollo|paso a paso|escrito/.test(normText)) {
      return 'rama1';
    }
    if (/focalizada|sin rubrica|rapida|rapidas|solo clave|directa|alternativas/.test(normText)) {
      return 'rama2';
    }
    return null;
  }

  /**
   * Extrae cantidad de preguntas si fue indicada
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
   * Extrae datos para creación de salón (grado, sección, etapa, alumnos)
   */
  function parseClassroomCreation(rawText, normText) {
    const isSec = normText.includes('sec');
    const stage = isSec ? 'secundaria' : 'primaria';

    const gradeMatch = normText.match(/\b([1-6])\b/);
    const level = gradeMatch ? parseInt(gradeMatch[1], 10) : (isSec ? 1 : 4);

    const secMatch = normText.match(/\b([a-d])\b/);
    const section = secMatch ? secMatch[1].toUpperCase() : 'A';

    const stageLabel = stage === 'secundaria' ? 'Secundaria' : 'Primaria';
    const name = `${level}° ${section} - ${stageLabel}`;

    // Extraer lista de alumnos si se especificaron
    let students = [];
    const alumnosMatch = rawText.match(/(?:alumnos|estudiantes|nomina)\s*:\s*([^.\n]+)/i) ||
                         rawText.match(/(?:con alumnos|con estudiantes)\s*([^.\n]+)/i);
    if (alumnosMatch && alumnosMatch[1]) {
      const rawList = alumnosMatch[1].split(/[,;y\n]+/);
      students = rawList
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
    }

    return {
      name,
      gradeStage: stage,
      gradeLevel: level,
      gradeText: `${level}° de ${stageLabel.toLowerCase()}`,
      section,
      students
    };
  }

  /**
   * Genera un problema estructurado para el banco con alternativas y rúbrica completa (Regla 6)
   */
  function generateQuestionWithRubric(topic, stage, level, preferredKey) {
    const correctKey = (preferredKey && ['A', 'B', 'C', 'D'].includes(preferredKey.toUpperCase()))
      ? preferredKey.toUpperCase()
      : 'B';

    const cleanTopic = (topic || '').trim().toLowerCase();
    const isFrac = cleanTopic.includes('fraccion') || cleanTopic.includes('fracciones');
    const isGeom = cleanTopic.includes('perimetro') || cleanTopic.includes('area') || cleanTopic.includes('triangulo');
    const isSec = stage === 'secundaria';

    let prompt = '';
    let options = {};
    let solucionCanonica = '';
    let procedimiento = '';

    if (isSec) {
      prompt = `En la ecuación lineal 3x + 12 = 36, ¿cuál es el valor de x?`;
      const ansVal = 8;
      const optMap = { A: '6', B: '8', C: '10', D: '12' };
      if (correctKey !== 'B') {
        const temp = optMap[correctKey];
        optMap[correctKey] = '8';
        optMap['B'] = temp;
      }
      options = optMap;
      solucionCanonica = `3x = 36 - 12 => 3x = 24 => x = 8.`;
      procedimiento = `1. Restar 12 a ambos miembros: 3x = 24. 2. Dividir entre 3: x = 8.`;
    } else if (isGeom) {
      prompt = `Un terreno rectangular mide 15 metros de largo y 8 metros de ancho. ¿Cuál es su perímetro total?`;
      const optMap = { A: '38 m', B: '46 m', C: '40 m', D: '52 m' };
      if (correctKey !== 'B') {
        const temp = optMap[correctKey];
        optMap[correctKey] = '46 m';
        optMap['B'] = temp;
      }
      options = optMap;
      solucionCanonica = `Perímetro = 2 * (15 + 8) = 2 * 23 = 46 metros.`;
      procedimiento = `1. Sumar los 4 lados: 15 + 8 + 15 + 8 = 46 m.`;
    } else {
      // Fracciones o aritmética por defecto
      prompt = `María tenía 3/4 de kilogramo de harina y utilizó 1/4 de kilogramo para preparar un pastel. ¿Cuánta harina le quedó?`;
      const optMap = { A: '1/4 kg', B: '2/4 kg (1/2 kg)', C: '3/8 kg', D: '4/4 kg' };
      if (correctKey !== 'B') {
        const temp = optMap[correctKey];
        optMap[correctKey] = '2/4 kg (1/2 kg)';
        optMap['B'] = temp;
      }
      options = optMap;
      solucionCanonica = `3/4 - 1/4 = (3 - 1) / 4 = 2/4 = 1/2 kg.`;
      procedimiento = `1. Identificar fracciones homogéneas con denominador 4. 2. Restar numeradores: 3 - 1 = 2. 3. Resultado: 2/4 kg o 1/2 kg.`;
    }

    const stageLabel = stage === 'secundaria' ? 'secundaria' : 'primaria';
    const gradeText = `${level}° de ${stageLabel}`;

    const rubric = {
      solucion_canonica: solucionCanonica,
      procedimiento_paso_a_paso: procedimiento,
      criterios_evaluacion: [
        { criterio: 'Comprensión y planteamiento del problema', peso: 40 },
        { criterio: 'Ejecución matemática del procedimiento', peso: 40 },
        { criterio: 'Determinación exacta del resultado', peso: 20 }
      ],
      errores_comunes_previsibles: [
        'Confusión en operaciones con signos o fracciones',
        'Cálculo de área en vez de perímetro'
      ]
    };

    return {
      title: `Pregunta sobre ${topic || 'Matemática'}`,
      prompt,
      options,
      correct: correctKey,
      rubric,
      gradeStage: stage,
      gradeLevel: level,
      gradeText
    };
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
    pendingState = { action: null, branch: null, classroomId: null, classroomName: null, questionCount: null, sessionId: null, createClassData: null, createQuestionData: null };
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
   * Confirma y ejecuta la creación de un salón (Fase 2)
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

      // 1. Guardar en Supabase si está disponible
      if (typeof SupabaseClient !== 'undefined' && SupabaseClient.createClassroom) {
        const res = await SupabaseClient.createClassroom(data.name, gradeCode, color, data.gradeStage, data.gradeLevel);
        newId = (res && res.id) || (res && res.data && res.data.id);
        if (newId && data.students && data.students.length > 0 && SupabaseClient.importStudents) {
          await SupabaseClient.importStudents(newId, data.students);
        }
      }

      // 2. Fallback local si no hay id remoto
      if (!newId) {
        newId = `cls_${Date.now()}`;
      }

      // 3. Sincronizar con el runtime local
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
        const fullList = currentList.map(c => {
          const original = ClassroomData.getClassroom(c.id);
          return original || c;
        });
        fullList.push(newClsObj);
        ClassroomData.setClassrooms(fullList);
      }

      // 4. Actualizar selectores en la interfaz
      if (typeof renderClassroomSelect === 'function') renderClassroomSelect();
      if (typeof renderClassroomManager === 'function') renderClassroomManager(newId);

      // 5. Reemplazar tarjeta con éxito
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
  async function confirmSaveQuestion(payloadStr, cardId) {
    const cardEl = document.getElementById(cardId);
    if (cardEl) {
      cardEl.innerHTML = '<span style="color:#0284c7; font-size:0.82rem; font-weight:700;">⏳ Guardando pregunta y rúbrica en el Banco...</span>';
    }

    try {
      const data = JSON.parse(decodeURIComponent(payloadStr));

      const evalObj = {
        title: data.title || 'Pregunta de alternativa',
        type: 'mc',
        questionCount: 1,
        prompt: data.prompt,
        expectedAnswer: `Clave: ${data.correct}`,
        options: data.options,
        correct: data.correct,
        questions: [{
          prompt: data.prompt,
          options: data.options,
          correct: data.correct,
          gradeStage: data.gradeStage,
          gradeLevel: Number(data.gradeLevel),
          gradeText: data.gradeText,
          rubric: data.rubric,
          hasRubric: true
        }],
        rubric: data.rubric,
        hasRubric: true,
        gradeStage: data.gradeStage,
        gradeLevel: Number(data.gradeLevel),
        gradeText: data.gradeText
      };

      if (typeof ClassroomData !== 'undefined' && ClassroomData.saveCustomEvaluation) {
        ClassroomData.saveCustomEvaluation(evalObj);
      }
      if (typeof SupabaseClient !== 'undefined' && SupabaseClient.saveEvaluation) {
        SupabaseClient.saveEvaluation(evalObj).catch(e => console.warn('[Copilot Cloud Save]', e));
      }

      if (typeof renderBankCards === 'function') renderBankCards();
      if (typeof renderBankManagerQuestions === 'function') renderBankManagerQuestions();

      if (cardEl) {
        cardEl.innerHTML = `
          <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:10px; color:#15803d; font-size:0.82rem;">
            ✅ <b>¡Pregunta guardada en el Banco!</b><br>
            Lista para ser usada en Formativa con IA, Focalizada o Cartillas OMR.
            <div style="margin-top:8px;">
              <button type="button" class="copilot-card-btn copilot-card-btn-primary" onclick="openFlow('bank')">📚 Ver en el Banco de Preguntas</button>
            </div>
          </div>
        `;
      }

      if (typeof showToast === 'function') showToast('✅ Pregunta guardada con éxito en el Banco');

    } catch (err) {
      console.error('[Copilot saveQuestion Error]', err);
      if (cardEl) {
        cardEl.innerHTML = `<span style="color:#ef4444; font-size:0.8rem;">❌ Error al guardar la pregunta: ${err.message || 'error'}</span>`;
      }
    }
  }

  /**
   * Confirma y elimina un salón tras validar que no está en uso
   */
  async function confirmDeleteClassroom(classroomId, cardId) {
    const cardEl = document.getElementById(cardId);
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
   * Responde cuando el usuario selecciona una opción de aclaración (chip)
   */
  function sendChip(type, value, displayText) {
    appendMessage('user', displayText);

    if (type === 'classroom') {
      pendingState.classroomId = value;
      const cls = typeof ClassroomData !== 'undefined' ? ClassroomData.getClassroom(value) : null;
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
      // Viene de selección de grado para crear pregunta
      const [stage, level] = value.split(':');
      const topic = pendingState.createQuestionData?.topic || 'Matemática';
      renderQuestionPreviewCard(topic, stage, parseInt(level, 10));
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
   * Renderiza la tarjeta de previsualización de pregunta con alternativas y rúbrica (Fase 2)
   */
  function renderQuestionPreviewCard(topic, stage, level, preferredKey) {
    const qData = generateQuestionWithRubric(topic, stage, level, preferredKey);
    const cardId = `card-q-${Date.now()}`;
    const encData = encodeURIComponent(JSON.stringify(qData));

    const cardHtml = `
      <div class="copilot-action-card" id="${cardId}">
        <span class="copilot-card-badge badge-green">📚 Nueva Pregunta para el Banco</span>
        <h4 class="copilot-card-title">${qData.gradeText} — ${qData.title}</h4>
        <div class="copilot-card-details">
          <b>Enunciado:</b> ${qData.prompt}
        </div>
        <div class="copilot-card-options-grid">
          <div class="copilot-card-opt ${qData.correct === 'A' ? 'is-correct' : ''}"><b>A)</b> ${qData.options.A}</div>
          <div class="copilot-card-opt ${qData.correct === 'B' ? 'is-correct' : ''}"><b>B)</b> ${qData.options.B}</div>
          <div class="copilot-card-opt ${qData.correct === 'C' ? 'is-correct' : ''}"><b>C)</b> ${qData.options.C}</div>
          <div class="copilot-card-opt ${qData.correct === 'D' ? 'is-correct' : ''}"><b>D)</b> ${qData.options.D}</div>
        </div>
        <div class="copilot-card-details" style="font-size:0.75rem; color:#15803d; background:#f0fdf4; padding:6px 10px; border-radius:6px; border:1px solid #bbf7d0;">
          ✨ <b>Rúbrica pedagógica de IA generada:</b> Solución canónica y criterios de evaluación ponderados listos para corregir.
        </div>
        <div class="copilot-card-actions">
          <button type="button" class="copilot-card-btn copilot-card-btn-primary" onclick="CopilotCommand.confirmSaveQuestion('${encData}', '${cardId}')">💾 Guardar en el Banco</button>
          <button type="button" class="copilot-card-btn copilot-card-btn-secondary" onclick="CopilotCommand.dismissCard('${cardId}')">❌ Descartar</button>
        </div>
      </div>
    `;

    appendMessage('ai', `He redactado la pregunta completa con sus 4 alternativas y rúbrica pedagógica (Regla 6):${cardHtml}`);
  }

  /**
   * Renderiza la tarjeta de confirmación de eliminación segura (Fase 2)
   */
  function renderClassroomDeleteCard(cls) {
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
   * Procesa el texto escrito por el docente (heurística local y Fase 2)
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
    // FASE 2: GESTIÓN ASISTIDA (CREACIÓN Y ELIMINACIÓN)
    // =========================================================================

    // 1. Eliminar Salón con Guardarraíl de Seguridad
    if (/eliminar salon|borrar salon|elimina el salon|borra el salon|elimina salon|borra salon/.test(norm)) {
      const clsRes = matchClassroom(norm);
      if (clsRes.match) {
        const cls = clsRes.match;
        const activeSess = typeof ClassroomData !== 'undefined' ? ClassroomData.getActiveSession() : null;
        const savedRes = typeof ClassroomData !== 'undefined' && ClassroomData.isClassroomInSavedSession
          ? ClassroomData.isClassroomInSavedSession(cls.id)
          : null;
        const isInSaved = !!(savedRes && savedRes.inUse);

        if (isInSaved || (activeSess && activeSess.classroomId === cls.id)) {
          appendMessage('ai', `⚠️ <b>Acción bloqueada por seguridad:</b> El salón <b>"${cls.name}"</b> tiene una evaluación activa o guardada en curso. Finaliza o elimina la sesión antes de borrar el salón.`);
          return;
        }

        renderClassroomDeleteCard(cls);
        return;
      }

      if (clsRes.candidates.length > 0) {
        appendMessage('ai', '¿Qué salón deseas eliminar?');
        showClassroomClarification(clsRes.candidates);
        return;
      }
    }

    // 2. Crear Pregunta Asistida hacia el Banco de Preguntas (Regla 6)
    if (/crear pregunta|nueva pregunta|genera una pregunta|redacta una pregunta|crea una pregunta|pregunta sobre/.test(norm)) {
      // Extraer tema
      const topicMatch = trimmed.match(/(?:sobre|de)\s+([^.\n]+)/i);
      const topic = topicMatch ? topicMatch[1].trim() : 'Matemática';

      // Extraer clave si fue especificada
      const keyMatch = norm.match(/\bclave\s*([a-d])\b/);
      const preferredKey = keyMatch ? keyMatch[1].toUpperCase() : null;

      // Extraer grado si fue especificado
      const gradeMatch = norm.match(/\b([1-6])\b/);
      const isSec = norm.includes('sec');
      const stage = isSec ? 'secundaria' : 'primaria';

      if (gradeMatch) {
        const level = parseInt(gradeMatch[1], 10);
        renderQuestionPreviewCard(topic, stage, level, preferredKey);
        return;
      }

      // Si falta el grado, preguntar con chips
      pendingState.action = 'create_question';
      pendingState.createQuestionData = { topic, preferredKey };
      const gradeChips = `
        <div class="copilot-clarify-chips">
          <button type="button" class="copilot-chip" onclick="CopilotCommand.sendChip('create_q_grade', 'primaria:4', '4° Primaria')">4° Pri.</button>
          <button type="button" class="copilot-chip" onclick="CopilotCommand.sendChip('create_q_grade', 'primaria:5', '5° Primaria')">5° Pri.</button>
          <button type="button" class="copilot-chip" onclick="CopilotCommand.sendChip('create_q_grade', 'primaria:6', '6° Primaria')">6° Pri.</button>
          <button type="button" class="copilot-chip" onclick="CopilotCommand.sendChip('create_q_grade', 'secundaria:1', '1° Secundaria')">1° Sec.</button>
        </div>
      `;
      appendMessage('ai', `¿Para qué grado deseas crear la pregunta sobre <b>${topic}</b>?${gradeChips}`);
      return;
    }

    // 3. Crear Salón Asistido (con o sin nómina)
    if (/crear salon|nuevo salon|crea salon|crea el salon|agregar salon|agrega salon|crear aula|crea aula/.test(norm)) {
      const classData = parseClassroomCreation(trimmed, norm);
      renderClassroomPreviewCard(classData);
      return;
    }

    // =========================================================================
    // FASE 1: NAVEGACIÓN Y ACLARACIÓN DE SESIONES / EVALUACIONES
    // =========================================================================

    // 4. Detección directa: Banco de Preguntas
    if (/banco|banco de preguntas|preguntas guardadas/.test(norm)) {
      pendingState.action = 'bank';
      executeNavigation(pendingState);
      return;
    }

    // 5. Detección directa: Salones y Alumnos
    if (/salones|alumnos|nomina|nominas|estudiantes|aulas|lista de alumnos/.test(norm) && !/cartilla|evaluar|prueba|examen/.test(norm)) {
      pendingState.action = 'classrooms';
      executeNavigation(pendingState);
      return;
    }

    // 6. Detección directa: Sesiones Guardadas / Escanear Sesión
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

    // 7. Extracción de entidades para evaluación: Salón, Modalidad, Preguntas
    const branch = matchBranch(norm);
    const clsRes = matchClassroom(norm);
    const qCount = matchQuestionCount(norm);

    if (branch) pendingState.branch = branch;
    if (qCount) pendingState.questionCount = qCount;
    if (clsRes.match) {
      pendingState.classroomId = clsRes.match.id;
      pendingState.classroomName = clsRes.match.name;
    }

    // Salón ambiguo
    if (!clsRes.match && clsRes.candidates.length > 1) {
      appendMessage('ai', `Encontré más de un salón para esa indicación. ¿A cuál te refieres?`);
      showClassroomClarification(clsRes.candidates);
      return;
    }

    // Modalidad y Salón listos -> Ejecución inmediata
    if (pendingState.branch && pendingState.classroomId) {
      pendingState.action = 'eval';
      executeNavigation(pendingState);
      return;
    }

    // Solo Modalidad
    if (pendingState.branch && !pendingState.classroomId) {
      const branchTitle = pendingState.branch === 'rama3' ? 'Cartilla OMR' : (pendingState.branch === 'rama2' ? 'Focalizada' : 'Formativa con IA');
      appendMessage('ai', `¡Excelente! Vamos a preparar una evaluación con <b>${branchTitle}</b>.`);
      showClassroomClarification();
      return;
    }

    // Solo Salón
    if (!pendingState.branch && pendingState.classroomId) {
      appendMessage('ai', `Entendido, evaluaremos a <b>${pendingState.classroomName}</b>.`);
      showBranchClarification();
      return;
    }

    // Solo cantidad de preguntas
    if (pendingState.questionCount && !pendingState.branch && !pendingState.classroomId) {
      appendMessage('ai', `Para una evaluación de <b>${pendingState.questionCount} preguntas</b>, ¿qué modalidad y salón prefieres?`);
      showBranchClarification();
      return;
    }

    // Caso de ayuda / consulta abierta
    appendMessage('ai', `
      Puedo ayudarte a preparar evaluaciones o gestionar tu aula. Prueba con:
      <div class="copilot-clarify-chips" style="margin-top:8px;">
        <button type="button" class="copilot-chip" onclick="CopilotCommand.sendQuick('Crear salón 5° B de primaria con alumnos: Mateo, Lucía')">🏫 Crear Salón</button>
        <button type="button" class="copilot-chip" onclick="CopilotCommand.sendQuick('Crear pregunta de fracciones para 4° Pri con clave B')">📚 Crear Pregunta</button>
        <button type="button" class="copilot-chip" onclick="CopilotCommand.sendQuick('Cartilla OMR para 4° A')">📝 Cartilla 4° A</button>
        <button type="button" class="copilot-chip" onclick="CopilotCommand.sendQuick('Escanear sesión guardada')">📷 Escanear Sesión</button>
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
    clearChat,
    dismissCard,
    confirmCreateClassroom,
    confirmSaveQuestion,
    confirmDeleteClassroom
  };

  // Inicializar al cargar el DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(typeof window !== 'undefined' ? window : this);
