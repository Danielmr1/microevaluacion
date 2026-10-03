/**
 * Módulo de Procesamiento de Regiones de Interés (ROIs) y Normalización de Contraste
 * Microevaluación Formativa de Clase A5
 *
 * Funcionalidad:
 * 1. Definición estandarizada de ROIs sobre el lienzo de perspectiva (2000 x 1441 px).
 * 2. Extracción quirúrgica de la ROI de Resolución (Cuadrícula) y de la Caja de Respuesta.
 * 3. Extracción de la ROI del Código QR para decodificación rápida.
 * 4. Normalización de histograma y realce suave de grafito escolar (sin binarización destructiva).
 * 5. Guardrails completos de dimensiones, bordes y manejo de excepciones en memoria.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CÓMO SE DERIVAN ESTAS COORDENADAS (no son números mágicos)
 * ─────────────────────────────────────────────────────────────────────────
 * La ficha impresa mide 186 x 134 mm (ver .card-a5 en index.html) y lleva
 * cuatro marcadores ArUco de 10 mm a 5 mm del borde, es decir con el centro
 * a 10 mm de cada borde. El lienzo se rectifica mapeando el cuadrilátero de
 * CENTROS de marcador expandido exactamente 10 mm por lado, que es justo
 * hasta el borde de la ficha. Por eso:
 *
 *     2000 px / 186 mm = 10.7527 px/mm   (eje X)
 *     1441 px / 134 mm = 10.7537 px/mm   (eje Y)   -> anisotropía 0.01%
 *
 * Con esa escala, las ROIs se escriben en milímetros de la ficha y mmToPx()
 * las pasa a píxeles. Si se cambia el tamaño de la ficha, el inset o el
 * tamaño de los marcadores en el CSS de index.html, hay que recalcular
 * GEOMETRY, SHEET_WIDTH/HEIGHT y estas ROIs.
 *
 * Reparto vertical de la ficha (mm desde el borde superior). TODO el alto es
 * de tramos fijos, así que ninguna coordenada depende de la longitud del
 * enunciado:
 *     4.000  fin de borde+padding
 *    24.000  fin de cabecera       (x 15..171)
 *    27.000  ranura del enunciado  (x  4..182, alto fijo 20 mm)
 *    50.000  cuadrícula            (x 15..171, 156 x 65 mm, 16 x 7 celdas)
 *   118.000  franja de respuesta   (x 15..171, 156 x 12 mm)
 *   119.500  caja de respuesta     (x 36.8..80.8 mm, 44 x 9 mm)
 *   134.000  borde inferior de la ficha
 *
 * x=15..171mm es la zona libre de marcadores: los ArUco ocupan las esquinas
 * (5..15mm y 171..181mm). Por eso la cabecera, la cuadrícula y la franja de
 * respuesta miden 156 mm y no el ancho completo de la ficha.
 */

(function (global) {
  'use strict';

  // Dimensiones base del lienzo aplanado en alta resolución.
  // 2000 px de ancho dan 10.75 px/mm, suficiente para leer grafito infantil
  // incluso en la caja de respuesta (antes eran 7.2 px/mm con 1400 px).
  const SHEET_WIDTH = 2000;
  const SHEET_HEIGHT = 1441;

  // Escala del lienzo rectificado (px por mm de la ficha)
  const PX_PER_MM_X = SHEET_WIDTH / 186;   // 10.7527
  const PX_PER_MM_Y = SHEET_HEIGHT / 134;  // 10.7537

  // ── GEOMETRÍA FÍSICA DE LA FICHA IMPRESA ──
  // Fuente única de verdad compartida con scanner.js: de aquí sale cuánto hay
  // que expandir el cuadrilátero de marcadores para que el lienzo rectificado
  // corresponda exactamente al borde de la ficha.
  const GEOMETRY = {
    cardWidthMm: 186,
    cardHeightMm: 134,
    markerInsetMm: 5,    // distancia del marcador al borde de la ficha (.fiducial-tl, etc.)
    markerSizeMm: 10     // lado del marcador (.fiducial)
  };

  /**
   * Factores de expansión que hay que aplicar al cuadrilátero de CENTROS de
   * marcador para que coincida con el borde de la ficha.
   * Son fracciones de los vectores del propio cuadrilátero, así que funcionan
   * igual a cualquier distancia o ángulo de captura.
   * @returns {{marginX: number, marginY: number}}
   */
  function getExpansionMargins() {
    const offset = GEOMETRY.markerInsetMm + GEOMETRY.markerSizeMm / 2;      // 10 mm
    const quadW = GEOMETRY.cardWidthMm - 2 * offset;                        // 166 mm
    const quadH = GEOMETRY.cardHeightMm - 2 * offset;                       // 114 mm
    return { marginX: offset / quadW, marginY: offset / quadH };            // 0.06024 / 0.08772
  }

  /** Convierte un rectángulo en milímetros de la ficha a píxeles del lienzo. */
  function mmToPx(xMm, yMm, wMm, hMm) {
    return {
      x: Math.round(xMm * PX_PER_MM_X),
      y: Math.round(yMm * PX_PER_MM_Y),
      width: Math.round(wMm * PX_PER_MM_X),
      height: Math.round(hMm * PX_PER_MM_Y)
    };
  }

  // Definición de Coordenadas Fijas de ROIs.
  // Todas nacen de mmToPx() sobre las coordenadas en mm documentadas arriba.
  const ROI_CONFIG = {
    // Código QR de 16 mm (esquina superior derecha de la cabecera), que está
    // en x 155..171 mm e y 5..21 mm. La ROI toma x 151..171 mm e y 3.5..22.5 mm:
    // el borde izquierdo del marcador ArUco superior derecho está en x=171 mm,
    // así que la ROI llega justo hasta ahí sin incluir ni un píxel del marcador.
    QR: Object.assign(mmToPx(151, 3.5, 20, 19), {
      label: 'Código QR'
    }),

    // Cuadrícula de cálculo completa (7 filas x 16 columnas), que ocupa
    // x 15..171 mm e y 50..115 mm. La ROI toma 1 mm de aire alrededor
    // (x 14..172, y 49..116) para no recortar la primera ni la última columna.
    RESOLUTION: Object.assign(mmToPx(14, 49, 158, 67), {
      label: 'Cuadrícula de cálculo'
    }),

    // Caja de respuesta: el recuadro de 44 x 9 mm donde el alumno escribe el
    // resultado final. La caja está en x 36.8..80.8 mm e y 119.5..128.5 mm,
    // así que la ROI toma 1 mm de aire simétrico a cada lado: x 35.8..81.8 mm,
    // y 118.5..129.5 mm. Con la cuadrícula y la franja a alto fijo, esta caja
    // cae siempre en el mismo sitio sin importar la longitud del enunciado.
    ANSWER_BOX: Object.assign(mmToPx(35.8, 118.5, 46, 11), {
      label: 'Caja de Respuesta'
    })
  };

  /**
   * Ajustes de contraste pensados para el modelo de visión (pendiente de uso
   * en la Edge Function de corrección). Son más suaves que los del realce que
   * ve el docente: aquí NO interesa saturar a negro puro, porque eso borra los
   * trazos tenues de lápiz y el modelo necesita ver el trazo real.
   */
  const AI_CONTRAST_OPTIONS = {
    blackCutoff: 90,
    whiteCutoff: 215,
    gamma: 1.05
  };

  /**
   * GUARDRAIL: Valida que un canvas exista y tenga dimensiones útiles
   */
  function isValidCanvas(canvas) {
    return canvas && typeof canvas.getContext === 'function' && canvas.width > 0 && canvas.height > 0;
  }

  /**
   * GUARDRAIL: Ajusta las coordenadas para que nunca se salgan del lienzo de origen
   */
  function clampROI(roi, srcWidth, srcHeight) {
    const x = Math.max(0, Math.min(roi.x, srcWidth - 1));
    const y = Math.max(0, Math.min(roi.y, srcHeight - 1));
    const width = Math.max(1, Math.min(roi.width, srcWidth - x));
    const height = Math.max(1, Math.min(roi.height, srcHeight - y));
    return { x, y, width, height };
  }

  /**
   * Extrae una Región de Interés (ROI) desde un canvas origen a un nuevo canvas
   * @param {HTMLCanvasElement} sourceCanvas - Lienzo rectificado completo
   * @param {Object} roi - Objeto con {x, y, width, height}
   * @returns {Object} { success: boolean, canvas: HTMLCanvasElement|null, error: string|null }
   */
  function extractROI(sourceCanvas, roi) {
    if (!isValidCanvas(sourceCanvas)) {
      return { success: false, canvas: null, error: 'Canvas de origen inválido o vacío' };
    }

    try {
      const clamped = clampROI(roi, sourceCanvas.width, sourceCanvas.height);
      const roiCanvas = document.createElement('canvas');
      roiCanvas.width = clamped.width;
      roiCanvas.height = clamped.height;

      const ctx = roiCanvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(
        sourceCanvas,
        clamped.x, clamped.y, clamped.width, clamped.height,
        0, 0, clamped.width, clamped.height
      );

      return { success: true, canvas: roiCanvas, error: null };
    } catch (err) {
      console.error('[ROIProcessor] Error al extraer ROI:', err);
      return { success: false, canvas: null, error: err.message };
    }
  }

  /**
   * Realza el contraste de trazos de lápiz escolar (HB/2B)
   * Aumenta los tonos oscuros un 15-20% y clarea el fondo para desvanecer la cuadrícula tenue (#d4d4d8).
   * GUARDRAIL: No aplica binarización dura (Otsu al 100%) para evitar romper números infantiles.
   * 
   * @param {HTMLCanvasElement} targetCanvas - Canvas a mejorar
   * @param {Object} options - Parámetros de ajuste
   * @returns {boolean} true si se procesó correctamente
   */
  function enhanceHandwritingContrast(targetCanvas, options = {}) {
    if (!isValidCanvas(targetCanvas)) return false;

    const opts = Object.assign({
      blackCutoff: 65,   // Píxeles por debajo de este valor se vuelven negros profundos (realce de grafito)
      whiteCutoff: 195,  // Píxeles por encima de este valor se empujan al blanco puro (fondo y cuadrícula tenue)
      gamma: 0.95        // Curva suave para conservar medios tonos finos
    }, options);

    try {
      const ctx = targetCanvas.getContext('2d', { willReadFrequently: true });
      const imgData = ctx.getImageData(0, 0, targetCanvas.width, targetCanvas.height);
      const data = imgData.data;
      const len = data.length;

      const range = Math.max(1, opts.whiteCutoff - opts.blackCutoff);

      // Precalcular tabla de búsqueda (LUT) para velocidad de ejecución (< 4ms)
      const lut = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        if (i <= opts.blackCutoff) {
          lut[i] = 0;
        } else if (i >= opts.whiteCutoff) {
          lut[i] = 255;
        } else {
          const norm = (i - opts.blackCutoff) / range;
          lut[i] = Math.round(255 * Math.pow(norm, opts.gamma));
        }
      }

      for (let i = 0; i < len; i += 4) {
        // Conversión rápida a escala de grises ponderada (luminancia humana)
        const gray = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
        const enhanced = lut[gray];

        data[i] = enhanced;
        data[i + 1] = enhanced;
        data[i + 2] = enhanced;
        // data[i + 3] (Alpha) se mantiene intacto
      }

      ctx.putImageData(imgData, 0, 0);
      return true;
    } catch (err) {
      console.warn('[ROIProcessor] Fallo en enhanceHandwritingContrast:', err);
      return false;
    }
  }

  /**
   * Procesa la captura completa: extrae la ROI de la cuadrícula de cálculo y
   * la de la caja de respuesta, y realza el contraste de ambas.
   * Son dos ROIs separadas a propósito: la cuadrícula es la evidencia de CÓMO
   * resolvió el alumno y la caja de respuesta es el resultado final. El paso a
   * la IA las va a necesitar por separado.
   * @param {HTMLCanvasElement} sheetCanvas - Canvas aplanado de la ficha (2000x1441)
   * @returns {Object} { success, resolutionCanvas, answerCanvas, error }
   */
  function processCapturedSheet(sheetCanvas) {
    if (!isValidCanvas(sheetCanvas)) {
      return { success: false, resolutionCanvas: null, answerCanvas: null, error: 'Lienzo de hoja inválido' };
    }

    // 1. Extraer ROI de la Cuadrícula de cálculo (los pasos del alumno)
    const extResult = extractROI(sheetCanvas, ROI_CONFIG.RESOLUTION);
    if (!extResult.success) {
      return extResult;
    }
    const resolutionCanvas = extResult.canvas;
    enhanceHandwritingContrast(resolutionCanvas);

    // 2. Extraer ROI de la Caja de Respuesta (el resultado final)
    let answerCanvas = null;
    const ansResult = extractROI(sheetCanvas, ROI_CONFIG.ANSWER_BOX);
    if (ansResult.success) {
      answerCanvas = ansResult.canvas;
      enhanceHandwritingContrast(answerCanvas);
    }

    return {
      success: true,
      resolutionCanvas: resolutionCanvas,
      answerCanvas: answerCanvas,
      error: null
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MOTOR DE RECONOCIMIENTO ÓPTICO DE MARCAS (OMR - OPTICAL MARK RECOGNITION)
  // ─────────────────────────────────────────────────────────────────────────

  // Coordenadas horizontales fijas de los centros de las 4 burbujas (A, B, C, D) en mm
  const OMR_BUBBLES_X_MM = [
    { key: 'A', xMm: 21 },
    { key: 'B', xMm: 60 },
    { key: 'C', xMm: 99 },
    { key: 'D', xMm: 138 }
  ];

  // Radio de medición interno para no tomar los bordes impresos del círculo (2.4 mm)
  const OMR_BUBBLE_HALF_SIZE_MM = 2.4;

  /**
   * Mide la densidad de grafito/tinta en una burbuja de alternativa
   * @param {HTMLCanvasElement} sheetCanvas Lienzo rectificado (2000x1441 px)
   * @param {number} cxMm Coordenada X del centro en mm
   * @param {number} cyMm Coordenada Y del centro en mm
   * @returns {number} Densidad de píxeles oscuros de 0.0 a 1.0
   */
  function measureBubbleDarkness(sheetCanvas, cxMm, cyMm) {
    // Para ser tolerante a variaciones de impresión, corte y encuadre (+-3mm vertical),
    // probamos el centro y offsets de barrido vertical
    const offsets = [0, -1.5, 1.5, -3, 3];
    let maxDark = 0;
    const ctx = sheetCanvas.getContext('2d', { willReadFrequently: true });

    for (let i = 0; i < offsets.length; i++) {
      const dy = offsets[i];
      const rx = Math.round((cxMm - OMR_BUBBLE_HALF_SIZE_MM) * PX_PER_MM_X);
      const ry = Math.round((cyMm + dy - OMR_BUBBLE_HALF_SIZE_MM) * PX_PER_MM_Y);
      const rw = Math.round(OMR_BUBBLE_HALF_SIZE_MM * 2 * PX_PER_MM_X);
      const rh = Math.round(OMR_BUBBLE_HALF_SIZE_MM * 2 * PX_PER_MM_Y);

      const clamped = clampROI({ x: rx, y: ry, width: rw, height: rh }, sheetCanvas.width, sheetCanvas.height);
      const imgData = ctx.getImageData(clamped.x, clamped.y, clamped.width, clamped.height);
      const d = imgData.data;

      let darkPixels = 0;
      const totalPixels = clamped.width * clamped.height;
      if (totalPixels === 0) continue;

      for (let j = 0; j < d.length; j += 4) {
        const lum = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
        if (lum < 165) {
          darkPixels++;
        }
      }

      const dens = darkPixels / totalPixels;
      if (dens > maxDark) maxDark = dens;
    }

    return maxDark;
  }

  /**
   * Evalúa las 4 alternativas de una fila (A, B, C, D)
   * @param {HTMLCanvasElement} sheetCanvas
   * @param {number} yCenterMm Coordenada Y central de la fila en mm
   * @returns {{ marked: string, confidence: number, densities: Object }}
   */
  function evaluateAlternativeRow(sheetCanvas, yCenterMm) {
    const densities = {};
    let maxDensity = -1;
    let bestKey = null;

    OMR_BUBBLES_X_MM.forEach(b => {
      const dens = measureBubbleDarkness(sheetCanvas, b.xMm, yCenterMm);
      densities[b.key] = Math.round(dens * 100);
      if (dens > maxDensity) {
        maxDensity = dens;
        bestKey = b.key;
      }
    });

    let secondDensity = -1;
    OMR_BUBBLES_X_MM.forEach(b => {
      if (b.key !== bestKey && (densities[b.key] / 100) > secondDensity) {
        secondDensity = densities[b.key] / 100;
      }
    });

    // Umbral calibrado para detectar marcas de lápiz/bolígrafo con seguridad
    const MIN_DARKNESS_THRESHOLD = 0.18;

    if (maxDensity < MIN_DARKNESS_THRESHOLD) {
      return { marked: 'BLANK', confidence: Math.round((1 - maxDensity) * 100), densities };
    }

    // Si marcó dos opciones con densidad similar
    if (secondDensity >= MIN_DARKNESS_THRESHOLD && secondDensity >= maxDensity * 0.75) {
      return { marked: 'MULTIPLE', confidence: 50, densities };
    }

    return { marked: bestKey, confidence: Math.round(maxDensity * 100), densities };
  }

  /**
   * Evalúa la ficha completa en modo alternativas (1 o 2 preguntas)
   * @param {HTMLCanvasElement} sheetCanvas
   * @param {number} questionCount 1 o 2 preguntas
   * @returns {Array<{ qIndex: number, marked: string, confidence: number, densities: Object }>}
   */
  function evaluateOMRSheet(sheetCanvas, questionCount = 1) {
    if (!isValidCanvas(sheetCanvas)) return [];
    if (questionCount === 2) {
      const q1Result = evaluateAlternativeRow(sheetCanvas, 41.5);
      const q2Result = evaluateAlternativeRow(sheetCanvas, 96.5);
      return [
        Object.assign({ qIndex: 1 }, q1Result),
        Object.assign({ qIndex: 2 }, q2Result)
      ];
    } else {
      const q1Result = evaluateAlternativeRow(sheetCanvas, 54.5);
      return [
        Object.assign({ qIndex: 1 }, q1Result)
      ];
    }
  }

  const ROI_OMR_CONFIG = {
    MC2: {
      Q1_BUBBLES: mmToPx(14, 37, 158, 12),
      Q1_GRID: mmToPx(14, 49, 158, 21),
      Q2_BUBBLES: mmToPx(14, 87, 158, 12),
      Q2_GRID: mmToPx(14, 99, 158, 21)
    },
    MC1: {
      Q1_BUBBLES: mmToPx(14, 46, 158, 13),
      Q1_GRID: mmToPx(14, 60, 158, 53)
    }
  };

  /**
   * Extrae los recortes visuales individuales de cada pregunta para el modal:
   * Cuadrícula de cálculo (con realce de grafito) y franja de alternativas marcadas.
   * @param {HTMLCanvasElement} sheetCanvas
   * @param {number} questionCount 1 o 2 preguntas
   * @returns {Array<{ qIndex: number, bubblesCanvas: HTMLCanvasElement|null, gridCanvas: HTMLCanvasElement|null }>}
   */
  function extractOMRCrops(sheetCanvas, questionCount = 1) {
    if (!isValidCanvas(sheetCanvas)) return [];
    const is2Q = questionCount === 2;
    const cfg = is2Q ? ROI_OMR_CONFIG.MC2 : ROI_OMR_CONFIG.MC1;
    const list = [];

    // Pregunta 1
    const b1 = extractROI(sheetCanvas, cfg.Q1_BUBBLES);
    const g1 = extractROI(sheetCanvas, cfg.Q1_GRID);
    if (g1.success && g1.canvas) {
      enhanceHandwritingContrast(g1.canvas, { blackCutoff: 110, whiteCutoff: 175 });
    }
    list.push({
      qIndex: 1,
      bubblesCanvas: b1.success ? b1.canvas : null,
      gridCanvas: g1.success ? g1.canvas : null
    });

    // Pregunta 2 si corresponde
    if (is2Q) {
      const b2 = extractROI(sheetCanvas, cfg.Q2_BUBBLES);
      const g2 = extractROI(sheetCanvas, cfg.Q2_GRID);
      if (g2.success && g2.canvas) {
        enhanceHandwritingContrast(g2.canvas, { blackCutoff: 110, whiteCutoff: 175 });
      }
      list.push({
        qIndex: 2,
        bubblesCanvas: b2.success ? b2.canvas : null,
        gridCanvas: g2.success ? g2.canvas : null
      });
    }

    return list;
  }

  // Exportar el módulo al objeto global (navegador o node)
  const ROIProcessor = {
    SHEET_WIDTH,
    SHEET_HEIGHT,
    PX_PER_MM_X,
    PX_PER_MM_Y,
    GEOMETRY,
    getExpansionMargins,
    mmToPx,
    AI_CONTRAST_OPTIONS,
    CONFIG: ROI_CONFIG,
    OMR_CONFIG: ROI_OMR_CONFIG,
    isValidCanvas,
    clampROI,
    extractROI,
    enhanceHandwritingContrast,
    processCapturedSheet,
    // Métodos OMR
    measureBubbleDarkness,
    evaluateAlternativeRow,
    evaluateOMRSheet,
    extractOMRCrops
  };

  global.ROIProcessor = ROIProcessor;

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
