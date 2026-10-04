// ============================================================================
// Supabase Edge Function: rubric
// ============================================================================
// Genera la solución canónica y la RÚBRICA de corrección a partir del enunciado
// de un problema. Es un paso SOLO TEXTO, a propósito: más barato, más rápido y
// mucho más confiable que leer letra a mano, y produce el insumo que después
// necesita la corrección de las fichas.
//
// Se llama UNA VEZ por evaluación, no una vez por alumno. Eso es lo que hace que
// los 30 veredictos de la misma ficha se juzguen con el mismo criterio y sean
// comparables entre sí.
//
// ── SIN IMPORTS A PROPÓSITO ─────────────────────────────────────────────────
// Todo el archivo es autocontenido: no usa `_shared/` ni ningún módulo. Así
// funciona igual si se despliega con la CLI de Supabase o pegándolo en el editor
// del dashboard, que solo acepta un archivo.
//
// ── SECRETOS QUE HAY QUE CONFIGURAR ─────────────────────────────────────────
//   GEMINI_API_KEY  clave del proveedor
//   AI_MODEL        id del modelo, por ejemplo "gemini-2.5-flash"
//
// AI_MODEL es OBLIGATORIO y no tiene valor por defecto a propósito: los nombres
// y la disponibilidad de los modelos cambian seguido, y un nombre viejo
// hardcodeado daría un error confuso del proveedor en lugar de un mensaje claro
// de configuración. Se configura una vez y se cambia sin tocar el código.
// ============================================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// v2: agrega la regla 10 de coherencia entre "supuestos" y "respuestas_aceptables".
// v3: agrega los CRITERIOS DE PUNTAJE (1 a 3, sumando 4 puntos). Son lo que
//     después decide la nota del alumno, así que se generan acá, una sola vez por
//     pregunta, y no en cada corrección: si se decidieran al corregir, cada alumno
//     tendría su propio juego de criterios y no se podría comparar a ninguno.
const PROMPT_VERSION = 'rubric-v3';

// ── TAXONOMÍA DE ERRORES (4° a 6° de primaria) ──────────────────────────────
// Lista CERRADA a propósito, y la misma en toda la app.
//
// Por qué cerrada: si el modelo pudiera inventar categorías, no se podría
// comparar a un alumno con otro ni un problema con otro, y el informe de la
// clase ("7 alumnos con dificultad en tabla de cálculo") no significaría nada.
// Además es el freno contra la alucinación: elige entre estas, no inventa.
//
// Que sea fija no quiere decir que las 8 apliquen a cada problema. En una suma
// sin canje, acarreo_canje es imposible y el modelo simplemente no la usa: la
// lista es todo el vocabulario, no una lista de verificación por problema.
const TAXONOMIA = [
  'vacio_conceptual',       // eligió la operación equivocada o invirtió los datos
  'alineacion_estructura',  // desalineó decimales, mezcló numerador con denominador, erró el algoritmo vertical
  'acarreo_canje',          // falló al llevar o prestar, o al reagrupar
  'tabla_calculo_basico',   // sabía qué hacer pero falló una operación directa
  'omision_paso',           // hizo un paso y olvidó el siguiente
  'unidad_medida',          // el número está bien pero falta la unidad, o no respondió lo que se preguntaba
  'sin_respuesta',          // no intentó: dejó la respuesta en blanco
  'ninguno'                 // procedimiento y respuesta correctos
];

// Se mantiene el nombre viejo como alias para no romper nada que lo importe.
const TIPOS_ERROR = TAXONOMIA;

const ESQUEMA = {
  type: 'OBJECT',
  properties: {
    respuesta_canonica: { type: 'STRING' },
    unidad: { type: 'STRING' },
    // Los criterios son lo que se puntúa. De 1 a 3, y el tope es a propósito:
    // sin tope el modelo inventa criterios para "rellenar" y después no se puede
    // comparar a un alumno con otro.
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

/**
 * Arma el prompt. Es la pieza que más determina la calidad de la rúbrica, así
 * que las reglas están explícitas y numeradas.
 */
function construirPrompt(datos) {
  const lineas = [
    'Sos un docente experto de escuela primaria y evaluador pedagógico.',
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
    '1. Resolvé con el procedimiento que corresponde al GRADO indicado, no con el',
    '   más elegante ni con álgebra. Un alumno de 9 a 11 años no usa ecuaciones.',
    '2. "respuesta_canonica" es SOLO el valor, sin texto ni unidad. Ejemplo: "85".',
    '   Si es decimal, usá punto como separador. Si son varias respuestas, separalas',
    '   con punto y coma.',
    '3. En "respuestas_aceptables" poné TODAS las formas en que un alumno podría',
    '   escribir válidamente lo mismo: con unidad ("85 libros"), en palabras',
    '   ("ochenta y cinco"), con separador de miles, con el signo de moneda, etc.',
    '4. En "variantes_aceptables" poné otros MÉTODOS correctos para ese grado',
    '   (descomposición, cálculo mental, dibujo, conteo). Un método distinto del',
    '   esperado NO es un error y el corrector tiene que saberlo.',
    '5. En "supuestos" listá lo que tuviste que asumir porque el enunciado no lo',
    '   dice: si se exige dejar el procedimiento, si se acepta cálculo mental, qué',
    '   unidad se espera. Si el enunciado es ambiguo, es obligatorio listar al menos uno.',
    '6. En "errores_previsibles" poné errores REALES que cometería un alumno de ese',
    '   grado en ESTE problema, cada uno con su tipo. No pongas errores genéricos.',
    '   El "tipo" tiene que ser UNO de estos, escritos exactamente así (es una lista',
    '   cerrada, no inventes categorías nuevas):',
    '     vacio_conceptual, alineacion_estructura, acarreo_canje,',
    '     tabla_calculo_basico, omision_paso, unidad_medida, sin_respuesta, ninguno.',
    '   No todas aplican a todos los problemas: si el problema no tiene canje, no',
    '   pongas acarreo_canje. "ninguno" NO va en la lista de errores previsibles.',
    '7. No inventes datos que no estén en el enunciado. Si está incompleto o es',
    '   imposible de resolver, decilo en "avisos" y bajá "confianza".',
    '8. "confianza" es un número entre 0 y 1 sobre tu propia rúbrica.',
    '9. Escribí todo en español neutro y sin jerga.',
    '10. COHERENCIA entre "supuestos" y "respuestas_aceptables". Si un supuesto dice',
    '   que se exige la unidad, NO incluyas la respuesta sin unidad entre las',
    '   aceptables, porque el corrector daría por buena algo que tu propio supuesto',
    '   dice que está mal. Y al revés: si el enunciado NO pide la unidad de forma',
    '   explícita, aceptá tanto el número solo como con unidad, y no lo pongas como',
    '   supuesto obligatorio. Es mejor aceptar de más que reprobar a un alumno por',
    '   cómo escribió y no por lo que resolvió.',
    '11. CRITERIOS DE PUNTAJE ("criterios"). Son los pasos o habilidades que se',
    '   puntúan por separado, y son lo que después decide la nota del alumno.',
    '   REGLAS ESTRICTAS, sin excepciones:',
    '   a. De 1 a 3 criterios. NUNCA más de 3. Si el problema se resuelve en un',
    '      solo paso, poné UN criterio. No agregues criterios para "rellenar".',
    '   b. Los pesos tienen que sumar EXACTAMENTE 4.0, que es "puntaje_total".',
    '   c. Cada criterio tiene que ser un paso o habilidad VERIFICABLE por',
    '      separado en el papel, y no una descripción general del problema.',
    '   d. "nombre" es corto (3 a 6 palabras) y va en el boletín:',
    '      "Hallar los 3/5 de 120", "Multiplicar por el precio".',
    '   e. En "que_se_espera" explicá qué tiene que hacer el alumno para llevarse',
    '      ese puntaje, con los números de este problema.',
    '   f. Un problema de un solo cálculo se desdobla así: 2 puntos por plantear',
    '      la operación correcta y 2 por resolverla bien. Un problema de dos pasos',
    '      lleva un criterio por paso, por ejemplo 2 + 2.',
    '   EJEMPLO con OTRO problema. Fijate en la FORMA, no copies estos criterios:',
    '     Para "había 47 libros y llegaron 38 más":',
    '     criterios = [',
    '       { nombre: "Plantear la suma", peso: 2,',
    '         que_se_espera: "47 + 38" },',
    '       { nombre: "Resolver la suma", peso: 2,',
    '         que_se_espera: "47 + 38 = 85" }',
    '     ]'
  ];
  return lineas.filter(l => l !== '').join('\n');
}

/**
 * Saca el JSON de la respuesta del modelo.
 *
 * Los modelos actuales "piensan" antes de contestar y devuelven la respuesta en
 * varias partes: una con el razonamiento y otra con el resultado. Además no
 * siempre marcan cuál es cuál. Por eso se prueban varios candidatos en orden
 * hasta que uno sea JSON válido.
 */
function extraerJSON(candidato) {
  const partes = (candidato && candidato.content && candidato.content.parts) || [];
  const conTexto = partes.filter(p => p && typeof p.text === 'string');
  if (!conTexto.length) throw new Error('La respuesta no trae texto.');

  // Las que NO son razonamiento son las buenas; si están marcadas, mucho mejor.
  const sinRazonamiento = conTexto.filter(p => !p.thought);

  // Algunos modelos envuelven el JSON en ```json ... ``` aunque se les pida JSON.
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
    } catch (e) { /* se prueba el siguiente candidato */ }
  }

  throw new Error('La respuesta del modelo no es un JSON válido.');
}

/** Llama al modelo. Aislado para poder cambiar de proveedor sin tocar el resto. */
async function llamarModelo(prompt) {
  const clave = Deno.env.get('GEMINI_API_KEY');

  // El nombre del modelo tiene que ser el identificador técnico, NO el nombre
  // visible. El listado del proveedor lo devuelve como "models/gemini-3.8-flash";
  // ese prefijo se saca porque en la dirección ya va puesto.
  //
  // Cualquier otra cosa (mayúsculas, espacios, comillas, el nombre visible
  // "Gemini 3.8 Flash", o la línea entera del listado) hace que el proveedor
  // conteste 400 "unexpected model name format", que no explica nada. Por eso
  // se valida acá y el mensaje muestra QUÉ llegó.
  const modeloCrudo = String(Deno.env.get('AI_MODEL') || '').trim();
  const modelo = modeloCrudo.replace(/^models\//i, '').trim();

  if (!clave) throw new Error('Falta el secreto GEMINI_API_KEY. Configuralo en Supabase → Edge Functions → Secrets.');
  if (!modelo) throw new Error('Falta el secreto AI_MODEL. Poné el id del modelo, por ejemplo "gemini-3.8-flash".');

  if (!/^[a-z0-9][a-z0-9.\-]*$/.test(modelo)) {
    throw new Error(
      'El secreto AI_MODEL tiene caracteres que no van. Llegó esto: «' + modeloCrudo + '». ' +
      'Tiene que ser SOLO el identificador, todo en minúscula, sin comillas y sin espacios. ' +
      'Por ejemplo: gemini-3.8-flash'
    );
  }

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(modelo) + ':generateContent';

  const cuerpo = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      // Temperatura baja: acá no queremos creatividad, queremos la misma
      // solución canónica todas las veces.
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: ESQUEMA
    }
  });

  // ── REINTENTOS ──────────────────────────────────────────────────────────
  // El proveedor devuelve 503 ("high demand") cada tanto. Es pasajero y, sin
  // reintentos, el docente ve un error que parece culpa de la app. Con dos
  // esperas cortas, la mayoría de esos picos se resuelven solos y el docente
  // solo nota que tardó un poco más.
  //
  // Solo se reintenta lo pasajero. Un 400 (pedido mal armado) o un 403 (clave
  // inválida) se devuelven enseguida: reintentarlos no arreglaría nada y haría
  // esperar al docente al pedo.
  const ESPERAS_MS = [800, 2500];

  let ultimoRechazo = null;

  for (let intento = 0; intento <= ESPERAS_MS.length; intento++) {
    const res = await fetch(url, {
      method: 'POST',
      // La clave va en el encabezado y no en la URL: así no queda escrita en
      // registros ni en mensajes de error.
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave },
      body: cuerpo
    });

    const texto = await res.text();
    let datos = null;
    try { datos = JSON.parse(texto); } catch { datos = null; }

    if (res.ok) {
      if (!datos) throw new Error('El proveedor devolvió algo que no es JSON.');

      const candidato = (datos.candidates || [])[0];
      if (!candidato) throw new Error('El proveedor no devolvió ningún candidato. Suele ser un filtro de contenido.');

      return {
        rubrica: extraerJSON(candidato),
        finishReason: candidato.finishReason || null,
        uso: datos.usageMetadata || null,
        reintentos: intento
      };
    }

    const detalle = (datos && datos.error && datos.error.message) || texto.slice(0, 300);
    ultimoRechazo = { status: res.status, detalle: detalle };

    const esPasajero = [429, 500, 502, 503, 504].includes(res.status);
    if (!esPasajero || intento === ESPERAS_MS.length) break;

    await new Promise(seguir => setTimeout(seguir, ESPERAS_MS[intento]));
  }

  // Saturado: mensaje pensado para que el docente sepa que no hizo nada mal.
  if ([429, 500, 502, 503, 504].includes(ultimoRechazo.status)) {
    throw new Error(
      'El servicio de IA está saturado en este momento (código ' + ultimoRechazo.status + '). ' +
      'Se intentó ' + (ESPERAS_MS.length + 1) + ' veces y no respondió. Es pasajero: ' +
      'probá de nuevo en unos segundos. Si pasa seguido, se puede cambiar el modelo ' +
      'desde el secreto AI_MODEL sin tocar el código (por ejemplo a gemini-2.5-flash).'
    );
  }

  // Cualquier otro rechazo sí es un problema nuestro o de configuración.
  throw new Error(
    'El proveedor rechazó la llamada (' + ultimoRechazo.status + ') con el modelo «' + modelo + '».\n' +
    'Dirección: ' + url + '\n' +
    'Respuesta: ' + ultimoRechazo.detalle
  );
}

// ── CRITERIOS DE PUNTAJE ────────────────────────────────────────────────────
// Cuántos criterios como máximo y cuánto suman. Los dos topes se aplican acá,
// del lado del servidor, y no se confía en que el modelo los respete: de esto
// depende que un alumno se pueda comparar con otro.
const MAX_CRITERIOS = 3;
const PUNTAJE_TOTAL = 4;

/**
 * Deja los criterios usables: entre 1 y 3, con los pesos sumando exactamente 4.
 *
 * Si el modelo se pasa de criterios, se recortan. Si los pesos no suman 4, se
 * reescalan y se ajusta el último para que la suma sea exacta (el redondeo solo
 * deja 3.9 o 4.1). Si no devolvió ningún criterio usable, se arma uno solo con
 * todo el puntaje a partir del procedimiento esperado: es preferible a una
 * rúbrica sin puntaje.
 */
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

/** Comprueba que la rúbrica tenga lo mínimo usable y normaliza los tipos. */
function validarRubrica(r) {
  if (!r || typeof r !== 'object') throw new Error('La rúbrica no es un objeto.');
  const respuesta = String(r.respuesta_canonica == null ? '' : r.respuesta_canonica).trim();
  if (!respuesta) throw new Error('La rúbrica vino sin respuesta canónica.');

  const lista = v => Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean) : [];
  const errores = Array.isArray(r.errores_previsibles)
    ? r.errores_previsibles
        .filter(e => e && e.descripcion)
        .map(e => ({
          // Si el modelo se salió de la lista, cae en la categoría más general.
          tipo: TAXONOMIA.includes(e.tipo) ? e.tipo : 'vacio_conceptual',
          descripcion: String(e.descripcion).trim()
        }))
    : [];

  let confianza = Number(r.confianza);
  if (!isFinite(confianza)) confianza = 0;
  confianza = Math.max(0, Math.min(1, confianza));

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
    confianza: confianza
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

    const prompt = String(datos.prompt || '').trim();
    if (!prompt) return responder({ error: 'Falta el enunciado del problema.' }, 400);
    if (prompt.length > 600) return responder({ error: 'El enunciado es demasiado largo.' }, 400);

    const inicio = Date.now();
    // Nunca se registra el JWT ni la clave: solo el largo del enunciado.
    const { rubrica, finishReason, uso, reintentos } = await llamarModelo(construirPrompt({
      prompt: prompt,
      grado: datos.grado ? String(datos.grado) : '',
      metodoEnsenado: datos.metodoEnsenado ? String(datos.metodoEnsenado) : ''
    }));

    const limpia = validarRubrica(rubrica);

    return responder({
      ok: true,
      rubrica: limpia,
      // Trazabilidad: sin esto no se puede medir si las rúbricas mejoran.
      prompt_version: PROMPT_VERSION,
      modelo: Deno.env.get('AI_MODEL'),
      finish_reason: finishReason,
      tokens: uso ? { entrada: uso.promptTokenCount, salida: uso.candidatesTokenCount } : null,
      // Si hubo que reintentar por saturación, el cliente puede avisarlo.
      reintentos: reintentos,
      ms: Date.now() - inicio,
      // Si el modelo se cortó o el JSON vino incompleto, el cliente lo sabe.
      completa: finishReason === 'STOP'
    });

  } catch (e) {
    console.error('[rubric]', e && e.message);
    return responder({ error: (e && e.message) || 'Error generando la rúbrica.' }, 502);
  }
});
