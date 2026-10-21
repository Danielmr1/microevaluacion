// ============================================================================
// Supabase Edge Function: super-worker
// ============================================================================
// Servidor unificado para IA pedagógica de Microevaluación (Gemini):
// 1. action === 'generate_question': Redacta preguntas matemáticas inéditas con IA
//    para el grado y tema especificado, con alternativas, clave y rúbrica.
// 2. Default: Genera rúbrica de corrección para un enunciado existente.
// ============================================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const PROMPT_VERSION = 'super-worker-v5';

const TAXONOMIA = [
  'vacio_conceptual',
  'alineacion_estructura',
  'acarreo_canje',
  'tabla_calculo_basico',
  'omision_paso',
  'unidad_medida',
  'sin_respuesta',
  'ninguno'
];

const TIPOS_ERROR = TAXONOMIA;

// Esquema para Rúbricas
const ESQUEMA_RUBRICA = {
  type: 'OBJECT',
  properties: {
    respuesta_canonica: { type: 'STRING' },
    unidad: { type: 'STRING' },
    criterios: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          nombre: { type: 'STRING' },
          peso: { type: 'NUMBER' },
          que_se_espera: { type: 'STRING' }
        },
        required: ['nombre', 'peso', 'que_se_espera']
      }
    },
    puntaje_total: { type: 'NUMBER' },
    solucion_pasos: { type: 'ARRAY', items: { type: 'STRING' } },
    procedimiento_esperado: { type: 'STRING' },
    variantes_aceptables: { type: 'ARRAY', items: { type: 'STRING' } },
    respuestas_aceptables: { type: 'ARRAY', items: { type: 'STRING' } },
    supuestos: { type: 'ARRAY', items: { type: 'STRING' } },
    errores_previsibles: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          tipo: { type: 'STRING', enum: TIPOS_ERROR },
          descripcion: { type: 'STRING' }
        },
        required: ['tipo', 'descripcion']
      }
    },
    avisos: { type: 'ARRAY', items: { type: 'STRING' } },
    confianza: { type: 'NUMBER' }
  },
  required: [
    'respuesta_canonica', 'criterios', 'puntaje_total', 'solucion_pasos',
    'procedimiento_esperado', 'respuestas_aceptables', 'supuestos',
    'errores_previsibles', 'avisos', 'confianza'
  ],
  propertyOrdering: [
    'respuesta_canonica', 'unidad', 'criterios', 'puntaje_total', 'solucion_pasos',
    'procedimiento_esperado', 'variantes_aceptables', 'respuestas_aceptables',
    'supuestos', 'errores_previsibles', 'avisos', 'confianza'
  ]
};

// Esquema para Creación de Preguntas con IA
const ESQUEMA_PREGUNTA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    prompt: { type: 'STRING' },
    options: {
      type: 'OBJECT',
      properties: {
        A: { type: 'STRING' },
        B: { type: 'STRING' },
        C: { type: 'STRING' },
        D: { type: 'STRING' }
      },
      required: ['A', 'B', 'C', 'D']
    },
    correct: { type: 'STRING', enum: ['A', 'B', 'C', 'D'] },
    solucion_canonica: { type: 'STRING' },
    procedimiento_paso_a_paso: { type: 'STRING' },
    criterios: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          nombre: { type: 'STRING' },
          peso: { type: 'NUMBER' },
          que_se_espera: { type: 'STRING' }
        },
        required: ['nombre', 'peso', 'que_se_espera']
      }
    },
    errores_previsibles: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          tipo: { type: 'STRING' },
          descripcion: { type: 'STRING' }
        },
        required: ['tipo', 'descripcion']
      }
    }
  },
  required: ['title', 'prompt', 'options', 'correct', 'solucion_canonica', 'procedimiento_paso_a_paso', 'criterios']
};

// Esquema para Chat Conversacional con IA
const ESQUEMA_CHAT = {
  type: 'OBJECT',
  properties: {
    reply: { type: 'STRING' },
    action: {
      type: 'STRING',
      enum: ['open_create_classroom', 'open_generate_session', 'open_bank', 'open_comparative_table', 'none']
    },
    action_label: { type: 'STRING' }
  },
  required: ['reply', 'action', 'action_label']
};

function construirPromptRubrica(datos) {
  const lineas = [
    'Sos un docente experto de escuela y evaluador pedagógico de matemática.',
    'Recibís el enunciado de un problema de matemática y tenés que producir la',
    'solución canónica y el CRITERIO DE CORRECCIÓN que usará otro sistema para',
    'evaluar las respuestas escritas a mano de los alumnos.',
    '',
    'DATOS',
    '- Enunciado: "' + datos.prompt + '"',
    '- Grado: ' + (datos.grado || 'no especificado'),
    datos.metodoEnsenado ? '- Método que el docente enseñó: ' + datos.metodoEnsenado : '',
    '',
    'REGLAS',
    '1. Resolvé con el procedimiento que corresponde al GRADO indicado.',
    '2. "respuesta_canonica" es SOLO el valor, sin texto ni unidad. Ejemplo: "85".',
    '3. En "respuestas_aceptables" poné TODAS las formas en que un alumno podría escribir válidamente lo mismo.',
    '4. En "variantes_aceptables" poné otros MÉTODOS correctos para ese grado.',
    '5. En "errores_previsibles" poné errores REALES que cometería un alumno de ese grado en ESTE problema.',
    '6. CRITERIOS DE PUNTAJE ("criterios"): De 1 a 3 criterios que sumen exactamente 4.0 puntos.'
  ];
  return lineas.filter(l => l !== '').join('\n');
}

function construirPromptPregunta(datos) {
  const lineas = [
    'Sos un docente especialista en currículo y evaluación formativa de Matemática (CNEB/Minedu).',
    'Tu objetivo es redactar un PROBLEMA MATEMÁTICO INÉDITO para evaluar a estudiantes de:',
    `- Grado: ${datos.grado || '4° de primaria'}`,
    `- Tema o competencia requerida: ${datos.tema || 'Matemática'}`,
    '',
    'REGLAS OBLIGATORIAS:',
    '1. El problema debe ser 100% de MATEMÁTICA, ajustado a la edad y nivel del grado indicado.',
    '2. RESTRICCIÓN FÍSICA ESTRICTA DE ESPACIO: El enunciado ("prompt") debe tener un MÁXIMO ABSOLUTO DE 240 CARACTERES (de 1 a 3 líneas concisas). Debe caber en la ranura física de la ficha A5 sin desbordar ni tapar la cuadrícula de cálculo.',
    '3. Genera 4 alternativas completas (A, B, C, D). Solo una es la correcta.',
    '4. Las 3 alternativas incorrectas (distractores) deben basarse en errores conceptuales, de cálculo o de planteamiento típicos que cometen los alumnos de este grado.',
    '5. Asigna la clave correcta de forma aleatoria entre A, B, C y D.',
    '6. Redacta la solución canónica y el procedimiento paso a paso.',
    '7. Criterios de evaluación: 1 a 3 criterios específicos de puntaje que sumen 4 puntos.',
    '8. Idioma: Español neutro claro, directo y motivador para estudiantes.'
  ];
  return lineas.join('\n');
}

function construirPromptChat(datos) {
  const lineas = [
    'Sos EVA, la asistente pedagógica inteligente y experta de la plataforma Microevaluación A5.',
    'Microevaluación es un sistema web y PWA para docentes de Matemática (Primaria 4°-6° y Secundaria 1°-5°).',
    'Capacidades y estructura del sistema:',
    '- Salones de clases: Cada salón tiene su nómina con Nombre Completo y Nombre Corto. No existen salones sin alumnos.',
    '- Evaluaciones impresas en fichas A5 en 3 modalidades: Formativa con IA (1-2 preg. con rúbrica), Focalizada (1-5 preg. rápida) y Cartilla OMR (6-20 preg. burbujas). Límite de 8 sesiones guardadas.',
    '- Banco de Preguntas: Preguntas matemáticas inéditas con alternativas y rúbricas generadas con IA.',
    '- Escáner con cámara de alta velocidad: Lee QR, ArUco y corrige al instante.',
    '- Cuadro Comparativo y análisis de rendimiento.',
    '',
    datos.context ? `Contexto del aula: ${JSON.stringify(datos.context)}` : '',
    '',
    datos.history && Array.isArray(datos.history) && datos.history.length > 0
      ? 'HISTORIAL DE LA CONVERSACIÓN RECIENTE:\n' + datos.history.map((h: any) => `${h.role === 'user' ? 'Docente' : 'EVA'}: "${h.text || h.content || ''}"`).join('\n')
      : '',
    '',
    `El docente te acaba de escribir: "${datos.message}"`,
    '',
    'INSTRUCCIONES PARA RESPONDER:',
    '1. Responde de forma cálida, humana, profesional y clara en español. Mantén total coherencia con el hilo y contexto previo de la conversación.',
    '2. MEMORIA CONVERSACIONAL: Si el docente hace referencia a un salón, grado o tema mencionado en los turnos anteriores (ej. "ese salón", "el grado anterior", "sus alumnos", "de ese grado"), identifica inmediatamente de cuál se trata usando el HISTORIAL y el Contexto del aula. NUNCA le vuelvas a preguntar qué grado o salón es si ya fue indicado o aclarado previamente.',
    '3. Si el docente pide la lista de alumnos de un grado o salón específico:',
    '   - Busca dicho salón en el "Contexto del aula" y enumera la lista de sus alumnos de forma clara, ordenada y legible.',
    '   - Setea action: "none", action_label: "".',
    '4. Si el docente expresa la intención de CREAR, AGREGAR o REGISTRAR un SALÓN o AULA (ej. "quiero crear un salón", "cómo agrego un aula", "registrar clase", "nuevo salón"):',
    '   - Explica brevemente que puede hacerlo importando su nómina desde Excel/CSV o ingresándolos a mano.',
    '   - Setea action: "open_create_classroom", action_label: "➕ Agregar Nuevo Salón".',
    '5. Si el docente expresa la intención de CREAR, GENERAR o INICIAR una SESIÓN o EVALUACIÓN (ej. "quiero generar una sesión", "evaluar"):',
    '   - Setea action: "open_generate_session", action_label: "⚡ Generar sesión".',
    '6. Si el docente expresa la intención de ver o crear PREGUNTAS en el banco:',
    '   - Setea action: "open_bank", action_label: "📚 Banco de Preguntas".',
    '7. Si el docente expresa la intención de comparar salones o ver estadísticas:',
    '   - Setea action: "open_comparative_table", action_label: "📊 Cuadro Comparativo".',
    '8. Si el docente pregunta sobre sus salones, sesiones o alumnos actuales (ej. cuántos salones tiene, qué salones tiene, cuántas sesiones guardadas tiene):',
    '   - Consulta los datos del "Contexto del aula" y responde con las cifras y nombres exactos.',
    '   - Setea action: "none", action_label: "".',
    '9. Si es una consulta pedagógica, duda conceptual de matemática, saludo o pregunta general:',
    '   - Responde pedagógicamente.',
    '   - Setea action: "none", action_label: "".'
  ];
  return lineas.filter(Boolean).join('\n');
}

function extraerJSON(candidato) {
  const partes = (candidato && candidato.content && candidato.content.parts) || [];
  const conTexto = partes.filter(p => p && typeof p.text === 'string');
  if (!conTexto.length) throw new Error('La respuesta no trae texto.');

  const sinRazonamiento = conTexto.filter(p => !p.thought);
  const limpiar = t => String(t).replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

  const candidatos = [];
  if (sinRazonamiento.length) candidatos.push(sinRazonamiento.map(p => p.text).join(''));
  candidatos.push(conTexto.map(p => p.text).join(''));
  if (conTexto.length > 1) candidatos.push(conTexto[conTexto.length - 1].text);

  const vistos = new Set();
  for (const bruto of candidatos) {
    const texto = limpiar(bruto);
    if (!texto || vistos.has(texto)) continue;
    vistos.add(texto);
    try {
      const datos = JSON.parse(texto);
      if (datos && typeof datos === 'object') return datos;
    } catch (e) {}
  }

  throw new Error('La respuesta del modelo no es un JSON válido.');
}

async function llamarGemini(promptText, schema, temperature = 0.2) {
  const clave = Deno.env.get('GEMINI_API_KEY');
  if (!clave) throw new Error('Falta el secreto GEMINI_API_KEY en Supabase.');

  const envModelo = String(Deno.env.get('AI_MODEL') || '').replace(/^models\//i, '').trim();
  const modelosCascada = [
    envModelo || 'gemini-2.5-flash',
    'gemini-3.5-flash',
    'gemini-2.5-flash-lite'
  ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

  let ultimoRechazo = null;

  for (const modelo of modelosCascada) {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(modelo) + ':generateContent';

    const cuerpo = JSON.stringify({
      contents: [{ parts: [{ text: promptText }] }],
      generationConfig: {
        temperature: temperature,
        responseMimeType: 'application/json',
        responseSchema: schema
      }
    });

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave },
        body: cuerpo
      });

      const texto = await res.text();
      let datos = null;
      try { datos = JSON.parse(texto); } catch { datos = null; }

      if (res.ok) {
        if (!datos) throw new Error('El proveedor devolvió algo que no es JSON.');
        const candidato = (datos.candidates || [])[0];
        if (!candidato) throw new Error('El proveedor no devolvió candidatos.');
        return extraerJSON(candidato);
      }

      const detalle = (datos && datos.error && datos.error.message) || texto.slice(0, 300);
      ultimoRechazo = { status: res.status, detalle: detalle, modelo: modelo };

      // Si falló por modelo no disponible (404), límite de cuota (429) o saturación (500, 502, 503, 504), salta de inmediato al siguiente modelo
      const esRecuperable = [404, 429, 500, 502, 503, 504].includes(res.status);
      console.warn(`[super-worker] Modelo ${modelo} devolvió ${res.status}: ${detalle}. ${esRecuperable ? 'Probando siguiente modelo de respaldo...' : ''}`);
      if (!esRecuperable) break;

    } catch (netErr: any) {
      ultimoRechazo = { status: 502, detalle: netErr?.message || 'Error de red', modelo: modelo };
      console.warn(`[super-worker] Fallo de red con modelo ${modelo}: ${netErr?.message}. Saltando a respaldo...`);
    }
  }

  throw new Error(`Error de IA (${ultimoRechazo?.status}): ${ultimoRechazo?.detalle}`);
}

const MAX_CRITERIOS = 3;
const PUNTAJE_TOTAL = 4;

function normalizarCriterios(brutos, procedimiento) {
  let lista = Array.isArray(brutos) ? brutos : [];
  lista = lista
    .filter(c => c && (c.nombre || c.que_se_espera))
    .slice(0, MAX_CRITERIOS)
    .map(c => {
      const peso = Number(c.peso);
      return {
        nombre: String(c.nombre || '').trim() || 'Criterio',
        peso: (isFinite(peso) && peso > 0) ? peso : 1,
        que_se_espera: String(c.que_se_espera || '').trim()
      };
    });

  if (!lista.length) {
    return [{
      nombre: 'Resolución del problema',
      peso: PUNTAJE_TOTAL,
      que_se_espera: String(procedimiento || '').trim() || 'Resolver correctamente el problema.'
    }];
  }

  const suma = lista.reduce((t, c) => t + c.peso, 0);
  const factor = PUNTAJE_TOTAL / suma;
  lista = lista.map(c => Object.assign({}, c, { peso: Math.round(c.peso * factor * 10) / 10 }));

  const sumaFinal = lista.reduce((t, c) => t + c.peso, 0);
  const diferencia = Math.round((PUNTAJE_TOTAL - sumaFinal) * 10) / 10;
  if (diferencia !== 0) {
    const ultimo = lista[lista.length - 1];
    ultimo.peso = Math.round((ultimo.peso + diferencia) * 10) / 10;
  }
  return lista;
}

function validarRubrica(r) {
  if (!r || typeof r !== 'object') throw new Error('La rúbrica no es un objeto.');
  const respuesta = String(r.respuesta_canonica == null ? '' : r.respuesta_canonica).trim();
  const lista = v => Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean) : [];
  const errores = Array.isArray(r.errores_previsibles)
    ? r.errores_previsibles
        .filter(e => e && e.descripcion)
        .map(e => ({
          tipo: TAXONOMIA.includes(e.tipo) ? e.tipo : 'vacio_conceptual',
          descripcion: String(e.descripcion).trim()
        }))
    : [];

  const criterios = normalizarCriterios(r.criterios, r.procedimiento_esperado);
  const puntajeTotal = criterios.reduce((t, c) => t + c.peso, 0);

  return {
    respuesta_canonica: respuesta,
    unidad: String(r.unidad || '').trim(),
    criterios: criterios,
    puntaje_total: puntajeTotal,
    solucion_pasos: lista(r.solucion_pasos),
    procedimiento_esperado: String(r.procedimiento_esperado || '').trim(),
    variantes_aceptables: lista(r.variantes_aceptables),
    respuestas_aceptables: lista(r.respuestas_aceptables),
    supuestos: lista(r.supuestos),
    errores_previsibles: errores,
    avisos: lista(r.avisos),
    confianza: typeof r.confianza === 'number' ? r.confianza : 1
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Usá POST.' }), {
      status: 405, headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }

  const responder = (cuerpo, status) => new Response(JSON.stringify(cuerpo), {
    status: status || 200,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });

  try {
    const datos = await req.json().catch(() => null);
    if (!datos || typeof datos !== 'object') return responder({ error: 'Cuerpo inválido.' }, 400);

    // =========================================================================
    // MODO 1: GENERACIÓN DE PREGUNTA INÉDITA CON IA (GEMINI)
    // =========================================================================
    if (datos.action === 'generate_question') {
      const grado = String(datos.grado || '4° de primaria').trim();
      const tema = String(datos.tema || 'Matemática').trim();

      const promptText = construirPromptPregunta({ grado, tema });
      const rawQuestion = await llamarGemini(promptText, ESQUEMA_PREGUNTA, 0.7);

      // Limitar estrictamente el prompt a 240 caracteres (límite físico ficha A5)
      let cleanPrompt = String(rawQuestion.prompt || '').trim();
      if (cleanPrompt.length > 240) {
        cleanPrompt = cleanPrompt.slice(0, 237).trim() + '...';
      }

      const criterios = normalizarCriterios(rawQuestion.criterios, rawQuestion.procedimiento_paso_a_paso);

      const rubricaObj = {
        solucion_canonica: String(rawQuestion.solucion_canonica || '').trim(),
        procedimiento_paso_a_paso: String(rawQuestion.procedimiento_paso_a_paso || '').trim(),
        criterios_evaluacion: criterios.map(c => ({ criterio: c.nombre, peso: Math.round(c.peso * 25) })),
        criterios: criterios,
        errores_comunes_previsibles: (rawQuestion.errores_previsibles || []).map(e => `${e.tipo || 'Error'}: ${e.descripcion || ''}`)
      };

      return responder({
        ok: true,
        question: {
          title: String(rawQuestion.title || `Problema sobre ${tema}`).trim(),
          prompt: cleanPrompt,
          options: {
            A: String(rawQuestion.options?.A || '').trim(),
            B: String(rawQuestion.options?.B || '').trim(),
            C: String(rawQuestion.options?.C || '').trim(),
            D: String(rawQuestion.options?.D || '').trim()
          },
          correct: String(rawQuestion.correct || 'A').toUpperCase(),
          rubric: rubricaObj
        }
      });
    }

    // =========================================================================
    // MODO 3: CHAT CONVERSACIONAL PEDAGÓGICO CON IA REAL (GEMINI)
    // =========================================================================
    if (datos.action === 'chat') {
      const message = String(datos.message || '').trim();
      if (!message) return responder({ error: 'Falta el mensaje del docente.' }, 400);

      const promptText = construirPromptChat({
        message,
        context: datos.context || null,
        history: Array.isArray(datos.history) ? datos.history : []
      });

      const chatRes = await llamarGemini(promptText, ESQUEMA_CHAT, 0.4);

      return responder({
        ok: true,
        reply: String(chatRes.reply || '').trim(),
        action: chatRes.action || 'none',
        action_label: String(chatRes.action_label || '').trim()
      });
    }

    // =========================================================================
    // MODO 2: GENERACIÓN DE RÚBRICA PARA ENUNCIADO EXISTENTE (COMPATIBILIDAD 100%)
    // =========================================================================
    const prompt = String(datos.prompt || '').trim();
    if (!prompt) return responder({ error: 'Falta el enunciado del problema.' }, 400);
    if (prompt.length > 600) return responder({ error: 'El enunciado es demasiado largo.' }, 400);

    const inicio = Date.now();
    const promptText = construirPromptRubrica({
      prompt: prompt,
      grado: datos.grado ? String(datos.grado) : '',
      metodoEnsenado: datos.metodoEnsenado ? String(datos.metodoEnsenado) : ''
    });

    const rawRubric = await llamarGemini(promptText, ESQUEMA_RUBRICA, 0.1);
    const limpia = validarRubrica(rawRubric);

    return responder({
      ok: true,
      rubrica: limpia,
      prompt_version: PROMPT_VERSION,
      modelo: Deno.env.get('AI_MODEL'),
      ms: Date.now() - inicio
    });

  } catch (e) {
    console.error('[super-worker]', e && e.message);
    return responder({ error: (e && e.message) || 'Error procesando la solicitud con IA.' }, 502);
  }
});
