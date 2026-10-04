// ============================================================================
// Supabase Edge Function: grade-sheet
// ============================================================================
// Evalúa y califica la ficha del estudiante mediante visión multimodal de Gemini.
//
// Soporta dos modalidades estrictamente aisladas:
// 1. Respuesta Libre (type !== 'mc'):
//    - Analiza la franja manuscrita 'Rpta: ______' (answerImage)
//    - Analiza la cuadrícula de cálculo/borrador (gridImage)
//    - Evalúa contra la rúbrica y criterios pedagógicos oficiales.
// 2. Alternativas + Procedimiento (type === 'mc'):
//    - Recibe la alternativa elegida por el alumno vía OMR (omrSelected, omrMatch)
//    - Analiza la cuadrícula de cálculo para comprobar coherencia y validez
//
// ── AUTOCONTENIDO (Sin dependencias externas) ────────────────────────────────
// Un único archivo TypeScript para Deno, desplegable mediante CLI o panel web.
//
// ── SECRETOS REQUERIDOS EN SUPABASE ─────────────────────────────────────────
//   GEMINI_API_KEY : Clave de API de Google AI Studio / Gemini
//   AI_MODEL       : Identificador del modelo (ej: "gemini-2.5-flash")
// ============================================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const PROMPT_VERSION = 'grade-v1';

// Taxonomía estricta y cerrada de errores de primaria (idéntica a rubric/index.ts)
const TAXONOMIA = [
  'vacio_conceptual',       // Eligió la operación equivocada o invirtió los datos
  'alineacion_estructura',  // Desalineó cifras/decimales, erró el algoritmo vertical
  'acarreo_canje',          // Falló al llevar o prestar, reagrupación incorrecta
  'tabla_calculo_basico',   // Sabía qué hacer pero falló una operación elemental
  'omision_paso',           // Realizó un paso y olvidó el siguiente
  'unidad_medida',          // Número correcto pero omitió unidad o respondió otra cosa
  'sin_respuesta',          // Borrador o respuesta en blanco, sin intento
  'ninguno'                 // Procedimiento y resultado coherentes y correctos
];

const ESQUEMA_RESPUESTA = {
  type: 'OBJECT',
  properties: {
    answer_read: { type: 'STRING' },
    procedure_valid: { type: 'BOOLEAN' },
    score: { type: 'NUMBER' },
    verdict: { type: 'STRING', enum: ['CORRECTO', 'PARCIAL', 'INCORRECTO'] },
    criterios_evaluados: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          nombre: { type: 'STRING' },
          puntaje_obtenido: { type: 'NUMBER' },
          observacion: { type: 'STRING' }
        },
        required: ['nombre', 'puntaje_obtenido']
      }
    },
    error_detectado: { type: 'STRING', enum: TAXONOMIA },
    feedback: { type: 'STRING' }
  },
  required: ['answer_read', 'procedure_valid', 'score', 'verdict', 'error_detectado', 'feedback']
};

/**
 * Extrae y limpia una cadena en base64 de un data URL.
 */
function parseBase64Image(dataUri: string): { mimeType: string; data: string } | null {
  if (!dataUri || typeof dataUri !== 'string') return null;
  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return { mimeType: match[1], data: match[2] };
  }
  // Si ya viene solo el base64 sin prefijo
  if (/^[A-Za-z0-9+/=]+$/.test(dataUri.trim())) {
    return { mimeType: 'image/jpeg', data: dataUri.trim() };
  }
  return null;
}

/**
 * Construye el prompt para la IA según la modalidad de evaluación.
 */
function construirPromptEvaluacion(params: {
  isMultipleChoice: boolean;
  prompt: string;
  expectedAnswer: string;
  rubric: any;
  omrSelected?: string;
  omrMatch?: boolean;
}): string {
  const { isMultipleChoice, prompt, expectedAnswer, rubric, omrSelected, omrMatch } = params;

  let instrucciones = `Eres un docente evaluador de matemáticas de educación primaria experto y justo.\n\n`;
  instrucciones += `DATOS DEL PROBLEMA:\n`;
  instrucciones += `- Enunciado: "${prompt}"\n`;
  instrucciones += `- Respuesta esperada / canónica: "${expectedAnswer}"\n\n`;

  if (rubric && typeof rubric === 'object') {
    instrucciones += `RÚBRICA DE CORRECCIÓN:\n`;
    if (rubric.procedimiento_esperado) {
      instrucciones += `- Procedimiento esperado: ${rubric.procedimiento_esperado}\n`;
    }
    if (Array.isArray(rubric.criterios) && rubric.criterios.length > 0) {
      instrucciones += `- Criterios de puntaje (Total ${rubric.puntaje_total || 4} pts):\n`;
      rubric.criterios.forEach((c: any) => {
        instrucciones += `  * ${c.nombre} (${c.peso} pts): ${c.que_se_espera}\n`;
      });
    }
    if (Array.isArray(rubric.respuestas_aceptables) && rubric.respuestas_aceptables.length > 0) {
      instrucciones += `- Formas aceptables de responder: ${rubric.respuestas_aceptables.join(', ')}\n`;
    }
  }

  instrucciones += `\nINSTRUCCIONES DE ANÁLISIS DE LA FICHA DEL ESTUDIANTE:\n`;

  if (isMultipleChoice) {
    instrucciones += `TIPO DE EVALUACIÓN: Opción Múltiple (Alternativas).\n`;
    instrucciones += `- El estudiante marcó en la ficha la opción: "${omrSelected || 'No marcada'}".\n`;
    instrucciones += `- Coincidencia preliminar de clave: ${omrMatch ? 'CORRECTA' : 'INCORRECTA'}.\n`;
    instrucciones += `- En la imagen adjunta tienes la cuadrícula de cálculo (borrador) del estudiante.\n`;
    instrucciones += `- Determina si en el borrador el estudiante desarrolló un procedimiento válido que sustente su respuesta o si la cuadrícula está en blanco / contiene cálculos no relacionados.\n`;
    instrucciones += `- Si la alternativa es correcta y el procedimiento es coherente, verdict = "CORRECTO", procedure_valid = true, score = 4.\n`;
    instrucciones += `- Si la alternativa es correcta pero la cuadrícula está vacía o sin procedimiento, verdict = "CORRECTO", procedure_valid = false (adivinó o cálculo mental), score = 4.\n`;
    instrucciones += `- Si la alternativa es incorrecta, verdict = "INCORRECTO", score = 0, y clasifica el error según la taxonomía en error_detectado.\n`;
  } else {
    instrucciones += `TIPO DE EVALUACIÓN: Respuesta Libre.\n`;
    instrucciones += `- En las imágenes adjuntas tienes:\n`;
    instrucciones += `  1. La franja manuscrita donde el alumno escribió "Rpta: _______".\n`;
    instrucciones += `  2. La cuadrícula de cálculo donde realizó sus operaciones.\n`;
    instrucciones += `- Lee con OCR visual la respuesta manuscrita final y colócala en "answer_read".\n`;
    instrucciones += `- Analiza el procedimiento en la cuadrícula y evalúa si llegó a la respuesta correcta siguiendo los criterios de la rúbrica.\n`;
    instrucciones += `- Asigna puntaje_obtenido (de 0 a su peso) a cada criterio de la rúbrica y suma el total en "score" (0 a 4 puntos).\n`;
    instrucciones += `- Veredicto: "CORRECTO" si score >= 3.5, "PARCIAL" si 1 <= score < 3.5, "INCORRECTO" si score < 1.\n`;
    instrucciones += `- Si cometió un error, identifícalo estrictamente en "error_detectado" usando una de las opciones de la taxonomía.\n`;
  }

  instrucciones += `\nDevuelve únicamente el objeto JSON cumpliendo el esquema solicitado. En feedback escribe una breve retroalimentación pedagógica para el docente (máximo 2 oraciones).`;

  return instrucciones;
}

/**
 * Llama a la API de Gemini con las imágenes y el prompt estructurado.
 */
async function llamarGemini(params: {
  promptText: string;
  images: Array<{ mimeType: string; data: string }>;
  clave: string;
  modelo: string;
}) {
  const { promptText, images, clave, modelo } = params;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`;

  const parts: any[] = [{ text: promptText }];
  for (const img of images) {
    parts.push({
      inlineData: {
        mimeType: img.mimeType,
        data: img.data
      }
    });
  }

  const cuerpo = JSON.stringify({
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 600,
      responseMimeType: 'application/json',
      responseSchema: ESQUEMA_RESPUESTA
    }
  });

  const ESPERAS_MS = [800, 2000];
  let ultimoRechazo: any = null;

  for (let intento = 0; intento <= ESPERAS_MS.length; intento++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave },
      body: cuerpo
    });

    const texto = await res.text();
    let datos: any = null;
    try { datos = JSON.parse(texto); } catch { datos = null; }

    if (res.ok) {
      if (!datos) throw new Error('El proveedor de IA no devolvió un JSON válido.');
      const candidato = (datos.candidates || [])[0];
      if (!candidato) throw new Error('El proveedor no devolvió ningún candidato (filtro de seguridad).');

      const contenidoTexto = candidato.content?.parts?.[0]?.text;
      if (!contenidoTexto) throw new Error('Respuesta vacía del modelo.');

      let jsonEvaluacion = null;
      try {
        jsonEvaluacion = JSON.parse(contenidoTexto);
      } catch (err) {
        throw new Error('Error al parsear el resultado estructurado de la IA.');
      }

      return {
        evaluacion: jsonEvaluacion,
        finishReason: candidato.finishReason || null,
        uso: datos.usageMetadata || null,
        reintentos: intento
      };
    }

    const detalle = (datos && datos.error && datos.error.message) || texto.slice(0, 300);
    ultimoRechazo = { status: res.status, detalle };

    const esPasajero = [429, 500, 502, 503, 504].includes(res.status);
    if (!esPasajero || intento === ESPERAS_MS.length) break;

    await new Promise(r => setTimeout(r, ESPERAS_MS[intento]));
  }

  throw new Error(`Error del proveedor de IA (${ultimoRechazo.status}): ${ultimoRechazo.detalle}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido. Use POST.' }), {
      status: 405, headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }

  const responder = (cuerpo: any, status = 200) => new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });

  try {
    const datos = await req.json().catch(() => null);
    if (!datos || typeof datos !== 'object') return responder({ error: 'Cuerpo de solicitud inválido.' }, 400);

    const clave = Deno.env.get('GEMINI_API_KEY')?.trim();
    if (!clave) return responder({ error: 'Falta configurar el secreto GEMINI_API_KEY en Supabase.' }, 500);

    const modelo = (Deno.env.get('AI_MODEL') || 'gemini-2.5-flash').trim();

    const prompt = String(datos.prompt || '').trim();
    const expectedAnswer = String(datos.expectedAnswer || '').trim();
    const isMultipleChoice = datos.type === 'mc';

    // Preparación de imágenes
    const imagenes: Array<{ mimeType: string; data: string }> = [];

    // 1. Imagen de respuesta libre manuscrita (si aplica)
    if (!isMultipleChoice && datos.answerImage) {
      const parsed = parseBase64Image(datos.answerImage);
      if (parsed) imagenes.push(parsed);
    }

    // 2. Imagen de la cuadrícula de cálculo (para libre o para MC + procedimiento)
    if (datos.gridImage) {
      const parsed = parseBase64Image(datos.gridImage);
      if (parsed) imagenes.push(parsed);
    }

    if (imagenes.length === 0) {
      return responder({ error: 'No se recibieron imágenes de la ficha para evaluar.' }, 400);
    }

    const promptText = construirPromptEvaluacion({
      isMultipleChoice,
      prompt,
      expectedAnswer,
      rubric: datos.rubric,
      omrSelected: datos.omrSelected,
      omrMatch: datos.omrMatch
    });

    const inicio = Date.now();
    const resultado = await llamarGemini({
      promptText,
      images: imagenes,
      clave,
      modelo
    });

    return responder({
      ok: true,
      data: resultado.evaluacion,
      modelo,
      prompt_version: PROMPT_VERSION,
      reintentos: resultado.reintentos,
      ms: Date.now() - inicio
    });

  } catch (e: any) {
    console.error('[grade-sheet]', e?.message || e);
    return responder({ error: e?.message || 'Error durante la corrección con IA.' }, 502);
  }
});
