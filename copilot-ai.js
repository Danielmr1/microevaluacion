/**
 * EVA Copilot: Módulo de Generación Pedagógica con IA y Guardarraíles de Chat (Fase 2)
 * Microevaluación Formativa
 *
 * Capacidades:
 * - Redacción de preguntas matemáticas estructuradas con rúbrica canónica (Gemini).
 * - Guardarraíl de delimitación temática: 3 strikes con bloqueo estricto de 24 horas.
 * - Formateador y sanitizador de Markdown pedagógico (tablas, negritas, KaTeX).
 * - Chat interactivo educativo asistido por IA.
 */

(function (global) {
  "use strict";

  // Historial conversacional deslizante para memoria con Gemini
  let chatHistory = [];

  function appendMessage(role, contentHtml) {
    if (global.CopilotCommand && global.CopilotCommand.appendMessage) {
      return global.CopilotCommand.appendMessage(role, contentHtml);
    }
  }

  function toggleChat(open) {
    if (global.CopilotCommand && global.CopilotCommand.toggleChat) {
      return global.CopilotCommand.toggleChat(open);
    }
  }

  function dismissCard(cardId) {
    if (global.CopilotCommand && global.CopilotCommand.dismissCard) {
      return global.CopilotCommand.dismissCard(cardId);
    }
  }

  // GUARDARRAÍL: DELIMITACIÓN TEMÁTICA Y BLOQUEO DE 3 STRIKES (24 HORAS)
  // =========================================================================
  const CHAT_STRIKES_STORAGE_KEY = 'microeval_chat_strikes_v1';
  const MAX_CHAT_STRIKES = 3;
  const CHAT_BLOCK_DURATION_MS = 24 * 60 * 60 * 1000; // 24 horas

  function getChatStrikeStatus() {
    try {
      const raw = localStorage.getItem(CHAT_STRIKES_STORAGE_KEY);
      if (!raw) return { strikes: 0, blockedUntil: null, lastStrikeTime: null };
      const data = JSON.parse(raw);
      const now = Date.now();

      // Si el bloqueo de 24 horas ya expiró, restablecer
      if (data.blockedUntil && now >= data.blockedUntil) {
        localStorage.removeItem(CHAT_STRIKES_STORAGE_KEY);
        return { strikes: 0, blockedUntil: null, lastStrikeTime: null };
      }

      // Si no estaba bloqueado pero pasaron más de 24 horas desde la última advertencia, restablecer
      if (data.lastStrikeTime && (now - data.lastStrikeTime > CHAT_BLOCK_DURATION_MS)) {
        localStorage.removeItem(CHAT_STRIKES_STORAGE_KEY);
        return { strikes: 0, blockedUntil: null, lastStrikeTime: null };
      }

      return {
        strikes: Number(data.strikes || 0),
        blockedUntil: data.blockedUntil ? Number(data.blockedUntil) : null,
        lastStrikeTime: data.lastStrikeTime ? Number(data.lastStrikeTime) : null
      };
    } catch (_) {
      return { strikes: 0, blockedUntil: null, lastStrikeTime: null };
    }
  }

  function registerChatStrike() {
    const status = getChatStrikeStatus();
    const now = Date.now();
    const newStrikes = status.strikes + 1;
    let blockedUntil = null;

    if (newStrikes >= MAX_CHAT_STRIKES) {
      blockedUntil = now + CHAT_BLOCK_DURATION_MS;
    }

    const payload = {
      strikes: newStrikes,
      blockedUntil: blockedUntil,
      lastStrikeTime: now
    };

    try {
      localStorage.setItem(CHAT_STRIKES_STORAGE_KEY, JSON.stringify(payload));
    } catch (_) {}

    return payload;
  }

  function resetChatStrikes() {
    try {
      localStorage.removeItem(CHAT_STRIKES_STORAGE_KEY);
    } catch (_) {}
  }

  function formatHoursRemaining(blockedUntil) {
    if (!blockedUntil) return '24 horas';
    const diffMs = Math.max(0, blockedUntil - Date.now());
    const hours = Math.ceil(diffMs / (1000 * 60 * 60));
    return hours <= 1 ? '1 hora o menos' : `${hours} horas`;
  }

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
   * Genera un problema estructurado para el banco con alternativas y rúbrica completa (Regla 6)
   */
  function generateQuestionWithRubric(topic, stage, level, preferredKey, hasRubric) {
    if (hasRubric === undefined) hasRubric = true;

    // Aleatorizar clave si no viene fija
    const keys = ['A', 'B', 'C', 'D'];
    const correctKey = (preferredKey && keys.includes(preferredKey.toUpperCase()))
      ? preferredKey.toUpperCase()
      : keys[Math.floor(Math.random() * keys.length)];

    const cleanTopic = (topic || '').trim().toLowerCase();
    const isFrac = cleanTopic.includes('fraccion') || cleanTopic.includes('fracciones');
    const isGeom = cleanTopic.includes('perimetro') || cleanTopic.includes('area') || cleanTopic.includes('triangulo') || cleanTopic.includes('rectang') || cleanTopic.includes('geometria');
    const isMult = cleanTopic.includes('multiplic') || cleanTopic.includes('division') || cleanTopic.includes('operacion') || cleanTopic.includes('calculo');
    const isAlg = cleanTopic.includes('ecuacion') || cleanTopic.includes('algebra') || cleanTopic.includes('incognita') || cleanTopic.includes('variable');
    const isPct = cleanTopic.includes('porcentaj') || cleanTopic.includes('tasa') || cleanTopic.includes('interes') || cleanTopic.includes('descuento');
    const isComp = cleanTopic.includes('comprension') || cleanTopic.includes('lectura') || cleanTopic.includes('texto') || cleanTopic.includes('comunicacion') || cleanTopic.includes('verbo');
    const isSec = stage === 'secundaria';

    let prompt = '';
    let options = {};
    let solucionCanonica = '';
    let procedimiento = '';

    if (isAlg || (isSec && !isGeom && !isPct && !isComp)) {
      // Álgebra / Ecuaciones
      const factor = Math.floor(Math.random() * 3) + 2; // 2, 3 o 4
      const ans = Math.floor(Math.random() * 5) + 4; // 4 a 8
      const constant = factor * 2;
      const total = factor * ans + constant;
      prompt = `En la ecuación lineal ${factor}x + ${constant} = ${total}, ¿cuál es el valor de x?`;
      
      const optMap = {};
      optMap[correctKey] = String(ans);
      const wrong = [String(ans - 2), String(ans + 2), String(ans + 4), String(ans - 1), String(ans + 1)].filter(v => v !== String(ans));
      let wIdx = 0;
      keys.forEach(k => {
        if (k !== correctKey) {
          optMap[k] = wrong[wIdx++];
        }
      });
      options = optMap;
      solucionCanonica = `${factor}x = ${total} - ${constant} => ${factor}x = ${total - constant} => x = ${ans}.`;
      procedimiento = `1. Restar ${constant} a ambos lados: ${factor}x = ${total - constant}. 2. Dividir entre ${factor}: x = ${ans}.`;
    } else if (isPct) {
      // Porcentajes
      const base = 200;
      const pct = 15;
      const desc = 30;
      const finalPrice = 170;
      prompt = `Una prenda cuesta S/ ${base}. Si tiene un descuento especial del ${pct}%, ¿cuánto se paga finalmente?`;
      const optMap = {};
      optMap[correctKey] = `S/ ${finalPrice}`;
      const wrong = ['S/ 185', 'S/ 160', 'S/ 175', 'S/ 165'].filter(v => v !== `S/ ${finalPrice}`);
      let wIdx = 0;
      keys.forEach(k => {
        if (k !== correctKey) {
          optMap[k] = wrong[wIdx++];
        }
      });
      options = optMap;
      solucionCanonica = `Descuento: ${pct}% de ${base} = S/ ${desc}. Precio final: ${base} - ${desc} = S/ ${finalPrice}.`;
      procedimiento = `1. Calcular el 15% de 200: (15 * 200) / 100 = 30. 2. Restar del precio base: 200 - 30 = 170.`;
    } else if (isGeom) {
      // Geometría
      const largo = 12 + Math.floor(Math.random() * 6);
      const ancho = 6 + Math.floor(Math.random() * 4);
      const perim = 2 * (largo + ancho);
      prompt = `Un terreno rectangular mide ${largo} metros de largo y ${ancho} metros de ancho. ¿Cuál es su perímetro total?`;
      const optMap = {};
      optMap[correctKey] = `${perim} m`;
      const wrong = [`${perim - 6} m`, `${perim + 4} m`, `${largo * ancho} m`, `${perim + 8} m`].filter(v => v !== `${perim} m`);
      let wIdx = 0;
      keys.forEach(k => {
        if (k !== correctKey) {
          optMap[k] = wrong[wIdx++];
        }
      });
      options = optMap;
      solucionCanonica = `Perímetro = 2 * (${largo} + ${ancho}) = 2 * ${largo + ancho} = ${perim} metros.`;
      procedimiento = `1. Sumar los 4 lados de la figura rectangular: ${largo} + ${ancho} + ${largo} + ${ancho} = ${perim} m.`;
    } else if (isComp) {
      // Comprensión / Comunicación
      prompt = `Lee el texto: "Las abejas polinizan las flores al buscar néctar, permitiendo que las plantas produzcan frutos y semillas". Según el texto, ¿cuál es el beneficio directo para las plantas?`;
      const correctText = 'Producir frutos y semillas';
      const optMap = {};
      optMap[correctKey] = correctText;
      const wrong = [
        'Construir panales en los árboles',
        'Consumir las hojas de las flores',
        'Impedir el crecimiento de malezas'
      ];
      let wIdx = 0;
      keys.forEach(k => {
        if (k !== correctKey) {
          optMap[k] = wrong[wIdx++];
        }
      });
      options = optMap;
      solucionCanonica = `Identificación de causa-efecto explícita en el texto: la polinización permite producir frutos y semillas.`;
      procedimiento = `1. Localizar la idea clave en la lectura. 2. Relacionar la acción de las abejas con la consecuencia directa señalada explícitamente.`;
    } else if (isMult) {
      // Multiplicación / división
      const num1 = 15 + Math.floor(Math.random() * 10);
      const num2 = 4 + Math.floor(Math.random() * 5);
      const prod = num1 * num2;
      prompt = `En una librería se compraron ${num2} paquetes de cuadernos. Si cada paquete contiene ${num1} cuadernos, ¿cuántos cuadernos hay en total?`;
      const optMap = {};
      optMap[correctKey] = `${prod} cuadernos`;
      const wrong = [`${prod - 10} cuadernos`, `${prod + 10} cuadernos`, `${prod - 5} cuadernos`, `${prod + 15} cuadernos`].filter(v => v !== `${prod} cuadernos`);
      let wIdx = 0;
      keys.forEach(k => {
        if (k !== correctKey) {
          optMap[k] = wrong[wIdx++];
        }
      });
      options = optMap;
      solucionCanonica = `${num2} * ${num1} = ${prod} cuadernos en total.`;
      procedimiento = `1. Reconocer la operación de producto repetido: ${num2} grupos de ${num1}. 2. Multiplicar ${num2} * ${num1} = ${prod}.`;
    } else {
      // Fracciones o tema general por defecto
      const numTotal = 4;
      const numResta = 1;
      const numQueda = 3;
      prompt = `María tenía ${numTotal}/5 de kilogramo de harina y utilizó ${numResta}/5 de kilogramo para preparar un pastel. ¿Cuánta harina le quedó?`;
      const correctText = `${numQueda}/5 kg`;
      const optMap = {};
      optMap[correctKey] = correctText;
      const wrong = ['2/5 kg', '1/5 kg', '4/5 kg', '5/5 kg'].filter(v => v !== correctText);
      let wIdx = 0;
      keys.forEach(k => {
        if (k !== correctKey) {
          optMap[k] = wrong[wIdx++];
        }
      });
      options = optMap;
      solucionCanonica = `${numTotal}/5 - ${numResta}/5 = (${numTotal} - ${numResta})/5 = ${numQueda}/5 kg.`;
      procedimiento = `1. Identificar fracciones homogéneas con denominador 5. 2. Restar los numeradores: ${numTotal} - ${numResta} = ${numQueda}. 3. Mantener el denominador: ${numQueda}/5 kg.`;
    }

    const stageLabel = stage === 'secundaria' ? 'secundaria' : 'primaria';
    const gradeText = `${level}° de ${stageLabel}`;

    let rubric = null;
    if (hasRubric) {
      rubric = {
        solucion_canonica: solucionCanonica,
        procedimiento_paso_a_paso: procedimiento,
        criterios_evaluacion: [
          { criterio: 'Comprensión y planteamiento del problema', peso: 40 },
          { criterio: 'Ejecución matemática del procedimiento', peso: 40 },
          { criterio: 'Determinación exacta del resultado', peso: 20 }
        ],
        errores_comunes_previsibles: [
          'Confusión en operaciones con signos o fracciones',
          'Omisión de pasos clave en el cálculo'
        ]
      };
    }

    return {
      title: `Pregunta sobre ${topic || 'Matemática'}`,
      prompt,
      options,
      correct: correctKey,
      rubric,
      hasRubric: !!hasRubric,
      gradeStage: stage,
      gradeLevel: level,
      gradeText
    };
  }

  /**
   * Agrega un mensaje a la conversación del Copilot
   */
  const MAX_VISIBLE_MESSAGES = 25;

  /**
   * Formatea texto Markdown en respuestas de EVA:
   * - Convierte tablas Markdown (| col1 | col2 |) a tablas HTML compactas con scroll interno.
   * - Convierte negritas **texto** a <b>texto</b>.
   * - Respeta saltos de línea sin romper estructuras de tabla.
   */
  function formatCopilotMarkdown(raw) {
    if (!raw) return '';
    let text = String(raw).trim();

    // Pre-normalizador auto-reparador: si una tabla viene comprimida en una sola línea o con filas unidas por '| |'
    if (/\|[-:\s|]{3,}\|/.test(text)) {
      if (/\|\s*\|/.test(text)) {
        text = text.replace(/\|\s*\|\s*/g, '|\n|');
      }

      // Separar texto previo si está pegado al encabezado antes del primer '|'
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length - 1; i++) {
        if (/^\|[-:\s|]+\|$/.test(lines[i + 1].trim())) {
          const firstPipe = lines[i].indexOf('|');
          if (firstPipe > 0) {
            const prefix = lines[i].slice(0, firstPipe).trim();
            const header = lines[i].slice(firstPipe).trim();
            lines[i] = (prefix ? prefix + '\n\n' : '') + header;
          }
          break;
        }
      }

      // Separar texto posterior si está pegado a la última fila tras el último '|'
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith('|')) {
          const lastPipe = line.lastIndexOf('|');
          if (lastPipe !== -1 && lastPipe < line.length - 1) {
            const row = line.slice(0, lastPipe + 1).trim();
            const suffix = line.slice(lastPipe + 1).trim();
            lines[i] = row + (suffix ? '\n\n' + suffix : '');
          }
          break;
        }
      }

      text = lines.join('\n');
    }

    const tables = [];
    const tableRegex = /(?:(?:^|\n)\|[^\n]+\|\r?\n\|[-:\s|]+\|\r?\n(?:\|[^\n]+\|\r?\n?)+)/g;

    text = text.replace(tableRegex, function (match) {
      const rows = match.trim().split(/\r?\n/).map(r => r.trim()).filter(Boolean);
      if (rows.length < 3) return match;

      const parseRow = (rowStr) => {
        return rowStr
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map(c => c.trim());
      };

      const headers = parseRow(rows[0]);
      const bodyRows = rows.slice(2).map(parseRow);

      let html = '<div class="copilot-table-wrapper" style="overflow-x:auto; margin:10px 0; border:1.5px solid #cbd5e1; border-radius:8px; box-shadow:0 1px 4px rgba(0,0,0,0.05); background:#ffffff;">';
      html += '<table style="width:100%; border-collapse:collapse; font-size:0.78rem; text-align:left; min-width:220px;">';
      html += '<thead style="background:#f1f5f9;"><tr>';
      headers.forEach(h => {
        html += `<th style="padding:7px 10px; font-weight:800; color:#0f172a; border-bottom:1.5px solid #cbd5e1; white-space:nowrap;">${h}</th>`;
      });
      html += '</tr></thead>';
      html += '<tbody>';
      bodyRows.forEach((cols, rIdx) => {
        const bg = rIdx % 2 === 1 ? '#f8fafc' : '#ffffff';
        html += `<tr style="background:${bg};">`;
        cols.forEach(c => {
          html += `<td style="padding:6px 10px; border-bottom:1px solid #f1f5f9; color:#334155;">${c}</td>`;
        });
        html += '</tr>';
      });
      html += '</tbody></table></div>';

      const placeholder = `%%%COPILOT_TABLE_${tables.length}%%%`;
      tables.push(html);
      return '\n' + placeholder + '\n';
    });

    // Formatear negritas **texto**
    text = text.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

    // Convertir saltos de línea dobles y simples a <br>
    text = text.replace(/\n\n+/g, '<br><br>').replace(/\n/g, '<br>');

    // Restaurar tablas HTML en sus placeholders
    tables.forEach((tblHtml, idx) => {
      text = text.replace(`<br>%%%COPILOT_TABLE_${idx}%%%<br>`, tblHtml);
      text = text.replace(`%%%COPILOT_TABLE_${idx}%%%`, tblHtml);
    });

    return text;
  }

  /**
   * Sanitiza HTML para neutralizar vectores XSS (scripts, iframes, atributos on*, javascript: links)
   */
  function sanitizeCopilotHtml(dirty) {
    if (!dirty) return '';
    return String(dirty)
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
      .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
      .replace(/on\w+\s*=\s*[^>\s]+/gi, '')
      .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"');
  }

  /**
   * Agrega un mensaje a la conversación del Copilot
   * Guardarraíl de visualización: Mantiene un tope de los últimos 25 mensajes en pantalla
   * Blindaje Anti-XSS: Mensajes de usuario como textContent estricto, respuestas IA sanitizadas
   */

  async function confirmSaveQuestion(payloadStr, cardId) {
    const cardEl = document.getElementById(cardId);
    if (cardEl) {
      cardEl.innerHTML = '<span style="color:#0284c7; font-size:0.82rem; font-weight:700;">⏳ Guardando pregunta y rúbrica en el Banco...</span>';
    }

    try {
      const data = JSON.parse(decodeURIComponent(payloadStr));
      const hasRubric = !!data.hasRubric;

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
          rubric: hasRubric ? data.rubric : null,
          hasRubric: hasRubric
        }],
        rubric: hasRubric ? data.rubric : null,
        hasRubric: hasRubric,
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

  function startCreateQuestionFlow() {
    toggleChat(true);

    const currentUser = (typeof SupabaseClient !== 'undefined' && SupabaseClient.getCachedUser)
      ? SupabaseClient.getCachedUser()
      : null;
    if (!currentUser) {
      appendMessage('ai', '🔒 <b>Acceso Restringido:</b> Debes iniciar sesión con tu cuenta de Google para crear preguntas con IA.<div class="copilot-clarify-chips" style="margin-top:10px;"><button type="button" class="copilot-chip" style="background:#0284c7; color:#ffffff; font-weight:700;" onclick="handleSignIn()">🔑 Iniciar sesión con Google</button></div>');
      return;
    }

    pendingState = {
      action: 'create_question_await_grade',
      branch: null,
      classroomId: null,
      classroomName: null,
      questionCount: null,
      sessionId: null,
      createClassData: null,
      createQuestionData: {}
    };

    const stages = (typeof ClassroomData !== 'undefined' && ClassroomData.getGradeStages)
      ? ClassroomData.getGradeStages()
      : [
          { stage: 'primaria', label: 'Primaria', grades: [4, 5, 6] },
          { stage: 'secundaria', label: 'Secundaria', grades: [1, 2, 3, 4, 5] }
        ];

    let chipsGrade = '';
    stages.forEach(st => {
      const icon = st.stage === 'primaria' ? '🏫' : '🏛️';
      chipsGrade += `<div style="font-size:0.75rem; font-weight:700; color:#475569; margin:8px 0 4px 0;">${icon} ${st.label}:</div><div class="copilot-clarify-chips">`;
      st.grades.forEach(lvl => {
        const shortLabel = `${lvl}° ${st.stage === 'primaria' ? 'Pri.' : 'Sec.'}`;
        const fullLabel = `${lvl}° ${st.label}`;
        chipsGrade += `<button type="button" class="copilot-chip" onclick="CopilotCommand.sendChip('cq_grade', '${st.stage}:${lvl}', '${fullLabel}', this)">${shortLabel}</button>`;
      });
      chipsGrade += `</div>`;
    });

    appendMessage('ai', `<b>¡Crear Nueva Pregunta con IA!</b><br>Toda pregunta en Microevaluación se asocia a un grado curricular para estar disponible en todos los salones de ese nivel.<br><br><b>Paso 1:</b> Selecciona el <b>grado</b> de la pregunta:${chipsGrade}`);
  }

  /**
   * Renderiza la tarjeta de previsualización de pregunta con alternativas y rúbrica generada por IA
   */
  async function renderQuestionPreviewCard(topic, stage, level, preferredKey, hasRubric) {
    if (hasRubric === undefined) hasRubric = true;
    const stageLabel = stage === 'secundaria' ? 'Secundaria' : 'Primaria';
    const gradeText = `${level}° de ${stageLabel}`;

    // Guardarraíl Nivel 2: Límite de 6 rúbricas diarias con IA
    if (hasRubric && typeof DailyQuota !== 'undefined' && !DailyQuota.canConsume('rubrics')) {
      appendMessage('ai', '⚠️ <b>Límite de rúbricas alcanzado:</b> Has generado tus 6 rúbricas completas con IA de hoy. Puedes seguir utilizando todas las preguntas con rúbrica guardadas en tu Banco de Preguntas o generar nuevas a partir de las 00:00.');
      return;
    }

    const loadingId = `msg-loading-${Date.now()}`;
    appendMessage('ai', `<div id="${loadingId}">⏳ <b>EVA y Gemini están redactando tu pregunta con IA...</b><br>Generando problema matemático, 4 alternativas con distractores de razonamiento y rúbrica para <b>${gradeText}</b> sobre <i>"${topic}"</i> (~5-10 seg).</div>`);

    let qData = null;

    if (typeof SupabaseClient !== 'undefined' && SupabaseClient.generateQuestionWithAI) {
      try {
        const res = await SupabaseClient.generateQuestionWithAI({ grado: gradeText, tema: topic });
        if (res && res.ok && res.question) {
          qData = {
            title: res.question.title || `Problema sobre ${topic}`,
            prompt: res.question.prompt,
            options: res.question.options,
            correct: res.question.correct,
            rubric: hasRubric ? res.question.rubric : null,
            hasRubric: !!hasRubric,
            gradeStage: stage,
            gradeLevel: level,
            gradeText: gradeText
          };
        } else {
          console.warn('[Copilot AI Generation Fallback]', res?.error);
        }
      } catch (err) {
        console.warn('[Copilot AI Generation Error]', err);
      }
    }

    // Fallback de resiliencia si la red o IA se desconecta
    if (!qData) {
      qData = generateQuestionWithRubric(topic, stage, level, preferredKey, hasRubric);
    }

    const loadEl = document.getElementById(loadingId);
    if (loadEl && loadEl.parentElement) {
      loadEl.parentElement.remove();
    }

    const cardId = `card-q-${Date.now()}`;
    const encData = encodeURIComponent(JSON.stringify(qData));
    const encTopic = encodeURIComponent(topic || 'Matemática');

    const rubricBadge = hasRubric
      ? `<div class="copilot-card-details" style="font-size:0.75rem; color:#15803d; background:#f0fdf4; padding:6px 10px; border-radius:6px; border:1px solid #bbf7d0;">
           ✨ <b>Rúbrica pedagógica de IA generada:</b> Solución canónica y criterios de evaluación ponderados listos para calificar el borrador en la modalidad Formativa con IA.
         </div>`
      : `<div class="copilot-card-details" style="font-size:0.75rem; color:#0369a1; background:#f0f9ff; padding:6px 10px; border-radius:6px; border:1px solid #bae6fd;">
           ⚡ <b>Sin Rúbrica (Pregunta Rápida):</b> Calificación determinista inmediata por clave para las modalidades Focalizada y Cartillas OMR.
         </div>`;

    const cardHtml = `
      <div class="copilot-action-card" id="${cardId}">
        <span class="copilot-card-badge badge-green">🤖 Pregunta Inédita Generada con IA</span>
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
        ${rubricBadge}
        <div class="copilot-card-actions">
          <button type="button" class="copilot-card-btn copilot-card-btn-primary" onclick="CopilotCommand.confirmSaveQuestion('${encData}', '${cardId}')">💾 Guardar en el Banco</button>
          <button type="button" class="copilot-card-btn" style="background:#e0e7ff; color:#3730a3; border:1px solid #c7d2fe;" onclick="CopilotCommand.regenerateQuestion('${encTopic}', '${stage}', ${level}, '${preferredKey || ''}', ${hasRubric}, '${cardId}')">🔄 Regenerar con IA</button>
          <button type="button" class="copilot-card-btn copilot-card-btn-secondary" onclick="CopilotCommand.dismissCard('${cardId}')">❌ Descartar</button>
        </div>
      </div>
    `;

    appendMessage('ai', `¡Pregunta matemática redactada por Gemini para <b>${qData.gradeText}</b>!${cardHtml}`);
  }

  /**
   * Regenera una pregunta con nuevas variantes manteniendo el grado, tema y modalidad de rúbrica
   */
  async function regenerateQuestion(encTopic, stage, level, preferredKey, hasRubric, oldCardId) {
    dismissCard(oldCardId);
    const topic = decodeURIComponent(encTopic);
    await renderQuestionPreviewCard(topic, stage, parseInt(level, 10), preferredKey || null, !!hasRubric);
  }

  /**
   * Renderiza la tarjeta de confirmación de eliminación segura (Fase 2)
   */

  async function handleAIChatMessage(userText) {
    // Guardarraíl de Delimitación Temática: Bloqueo de 24 horas tras 3 strikes
    const strikeStatus = getChatStrikeStatus();
    if (strikeStatus.blockedUntil && Date.now() < strikeStatus.blockedUntil) {
      const remaining = formatHoursRemaining(strikeStatus.blockedUntil);
      appendMessage('ai', `🔒 <b>Chat con IA bloqueado temporalmente por 24 horas.</b><br><br>` +
        `Has acumulado 3 advertencias por realizar consultas fuera de los temas permitidos (Matemática y la plataforma Microevaluación).<br><br>` +
        `⏳ <b>Tiempo restante para desbloqueo:</b> aproximadamente ${remaining}.<br><br>` +
        `💡 <i>Puedes continuar utilizando el resto de funciones del sistema (salones, escáner, cartillas y banco) con total normalidad.</i>`);
      return;
    }

    const loadingId = 'msg-eva-thinking-' + Date.now();
    appendMessage('ai', '<div id="' + loadingId + '" style="display:flex; align-items:center; gap:8px; color:#64748b; font-size:0.84rem;"><span class="copilot-spinner" style="display:inline-block; width:14px; height:14px; border:2px solid #cbd5e1; border-top-color:#0284c7; border-radius:50%; animation:spin 0.8s linear infinite;"></span><span>EVA está pensando...</span></div>');

    const classrooms = (typeof ClassroomData !== 'undefined' && ClassroomData.CLASSROOMS)
      ? Object.values(ClassroomData.CLASSROOMS).map(c => ({
          id: c.id,
          nombre: c.name,
          grado: c.gradeLevel ? `${c.gradeLevel}° ${c.gradeStage}` : (c.gradeText || ''),
          totalAlumnos: (c.students || []).length,
          alumnos: (c.students || []).map(s => s.name || s.shortName)
        }))
      : [];
    const sessions = (typeof ClassroomData !== 'undefined' && ClassroomData.getSavedSessions)
      ? ClassroomData.getSavedSessions().map((s, idx) => ({
          numero: idx + 1,
          salon: s.classroomName,
          modalidad: s.branchTitle || s.branch,
          preguntasCount: (s.questions || []).length || (s.prompt ? 1 : 0)
        }))
      : [];
    const context = {
      salones: classrooms,
      totalSalonesRegistrados: classrooms.length,
      sesionesGuardadas: sessions,
      totalSesionesGuardadas: sessions.length,
      maxSesionesPermitidas: (typeof ClassroomData !== 'undefined' && ClassroomData.MAX_SAVED_SESSIONS) || 8
    };

    // Guardarraíl de Autenticación: Requiere cuenta Google activa para consultar a la IA
    const currentUser = (typeof SupabaseClient !== 'undefined' && SupabaseClient.getCachedUser)
      ? SupabaseClient.getCachedUser()
      : null;
    if (!currentUser) {
      const loadEl = document.getElementById(loadingId);
      if (loadEl) loadEl.remove();
      appendMessage('ai', '🔒 <b>Acceso Restringido:</b> Debes iniciar sesión con tu cuenta de Google para conversar con EVA y utilizar las funciones de Inteligencia Artificial.<div class="copilot-clarify-chips" style="margin-top:10px;"><button type="button" class="copilot-chip" style="background:#0284c7; color:#ffffff; font-weight:700;" onclick="handleSignIn()">🔑 Iniciar sesión con Google</button></div>');
      return;
    }

    // Guardarraíl Nivel 1: Límite diario de 15 consultas con IA
    if (typeof DailyQuota !== 'undefined' && !DailyQuota.canConsume('chat')) {
      const loadEl = document.getElementById(loadingId);
      if (loadEl) loadEl.remove();
      appendMessage('ai', '⏳ <b>Has completado tus 15 consultas de IA de hoy.</b><br><br>Tus consultas se renovarán automáticamente a las 00:00 (medianoche).<br><br>💡 <i>La navegación rápida del sistema (ej: "ir a salones", "abrir banco", "buscar salón") sigue 100% activa e ilimitada.</i>');
      return;
    }

    let aiRes = null;
    if (typeof SupabaseClient !== 'undefined' && SupabaseClient.chatWithAI) {
      try {
        aiRes = await SupabaseClient.chatWithAI(userText, context, chatHistory);
      } catch (err) {
        aiRes = { ok: false, error: err.message };
      }
    }

    const loadEl = document.getElementById(loadingId);
    if (loadEl) loadEl.remove();

    if (aiRes && aiRes.ok) {
      if (typeof DailyQuota !== 'undefined') {
        DailyQuota.consume('chat');
      }

      let replyText = formatCopilotMarkdown(aiRes.reply || '');

      // Guardarraíl de Delimitación Temática: Manejo de strikes si la pregunta fue fuera de lugar
      if (aiRes.out_of_scope) {
        const strikeResult = registerChatStrike();
        let strikeNotice = '';
        if (strikeResult.strikes === 1) {
          strikeNotice = `<div style="margin-top:10px; padding:9px 12px; background:#fffbeb; border:1px solid #fde68a; border-radius:6px; color:#92400e; font-size:0.83rem; line-height:1.4;">` +
            `⚠️ <b>Advertencia de uso (1/3):</b> EVA solo responde consultas sobre Matemática y la plataforma Microevaluación. Si continúas preguntando sobre temas ajenos, el chat se bloqueará por 24 horas.` +
            `</div>`;
        } else if (strikeResult.strikes === 2) {
          strikeNotice = `<div style="margin-top:10px; padding:9px 12px; background:#fef2f2; border:1px solid #fecaca; border-radius:6px; color:#991b1b; font-size:0.83rem; line-height:1.4;">` +
            `⚠️ <b>Segunda advertencia (2/3):</b> Consulta fuera de los temas permitidos. Al próximo intento el chat quedará bloqueado por 24 horas.` +
            `</div>`;
        } else {
          strikeNotice = `<div style="margin-top:10px; padding:10px 12px; background:#fef2f2; border:2px solid #ef4444; border-radius:8px; color:#991b1b; font-size:0.85rem; line-height:1.4;">` +
            `🔒 <b>Chat bloqueado por 24 horas (3/3):</b> Has alcanzado las 3 advertencias por consultas fuera de tema. El acceso al chat con IA ha quedado suspendido por 24 horas.` +
            `</div>`;
        }
        appendMessage('ai', replyText + strikeNotice);
        return;
      }

      // Registrar en el historial de memoria conversacional sólo si fue pedagógicamente válida
      chatHistory.push({ role: 'user', text: userText });
      chatHistory.push({ role: 'assistant', text: aiRes.reply || '' });
      if (chatHistory.length > 10) {
        chatHistory = chatHistory.slice(-10);
      }

      let actionBtn = '';

      if (aiRes.action === 'open_create_classroom') {
        actionBtn = '<div class="copilot-clarify-chips" style="margin-top:10px;"><button type="button" class="copilot-chip" style="background:#0284c7; color:#ffffff; font-weight:700;" onclick="CopilotCommand.openCreateClassroomModalFromChat()">' + (aiRes.action_label || '➕ Agregar Nuevo Salón') + '</button></div>';
      } else if (aiRes.action === 'open_generate_session') {
        actionBtn = '<div class="copilot-clarify-chips" style="margin-top:10px;"><button type="button" class="copilot-chip" style="background:#0284c7; color:#ffffff; font-weight:700;" onclick="CopilotCommand.handleGenerateSession()">' + (aiRes.action_label || '⚡ Generar sesión') + '</button></div>';
      } else if (aiRes.action === 'open_bank') {
        actionBtn = '<div class="copilot-clarify-chips" style="margin-top:10px;"><button type="button" class="copilot-chip" style="background:#0284c7; color:#ffffff; font-weight:700;" onclick="openFlow(\'bank\'); CopilotCommand.toggleChat(false);">' + (aiRes.action_label || '📚 Ir al Banco de Preguntas') + '</button></div>';
      } else if (aiRes.action === 'open_comparative_table') {
        actionBtn = '<div class="copilot-clarify-chips" style="margin-top:10px;"><button type="button" class="copilot-chip" style="background:#0284c7; color:#ffffff; font-weight:700;" onclick="CopilotCommand.renderComparativeTable()">' + (aiRes.action_label || '📊 Ver Cuadro Comparativo') + '</button></div>';
      }

      appendMessage('ai', replyText + actionBtn);
      return;
    }

    appendMessage('ai', '⚠️ <i>No pude conectar con el servicio de IA en este momento (' + ((aiRes && aiRes.error) || 'sin conexión') + ').</i><br><br>Puedes acceder directamente a las opciones del sistema:<div class="copilot-clarify-chips" style="margin-top:8px;"><button type="button" class="copilot-chip" onclick="CopilotCommand.openCreateClassroomModalFromChat()">🏫 Crear Salón</button><button type="button" class="copilot-chip" onclick="CopilotCommand.handleGenerateSession()">⚡ Generar sesión</button><button type="button" class="copilot-chip" onclick="CopilotCommand.startCreateQuestionFlow()">⚡ Crear Pregunta IA</button></div>');
  }

  /**
   * Cierra el chat y navega a la vista de sesiones guardadas
   */

  // Exposición en global
  global.CopilotAI = {
    chatHistory,
    getChatStrikeStatus,
    registerChatStrike,
    resetChatStrikes,
    formatHoursRemaining,
    normalizeText,
    generateQuestionWithRubric,
    formatCopilotMarkdown,
    sanitizeCopilotHtml,
    confirmSaveQuestion,
    startCreateQuestionFlow,
    renderQuestionPreviewCard,
    regenerateQuestion,
    handleAIChatMessage
  };

})(typeof window !== "undefined" ? window : this);
