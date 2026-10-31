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
   * @param {string} [cardType='a5'] - 'a5', 'a5_vertical' o 'a6'
   * @returns {{marginX: number, marginY: number}}
   */
  function getExpansionMargins(cardType = 'a5') {
    if (cardType === 'a6_vertical') {
      // Ficha A6 Vertical: 89 x 132 mm, inset 3.5 mm, marcador 8 mm -> offset = 7.5 mm
      const quadW = 89 - 15;  // 74 mm
      const quadH = 132 - 15; // 117 mm
      return { marginX: 7.5 / quadW, marginY: 7.5 / quadH };
    }
    if (cardType === 'a6') {
      // Ficha A6: 132 x 89 mm, inset 3.5 mm, marcador 8 mm -> offset = 7.5 mm
      const quadW = 132 - 15; // 117 mm
      const quadH = 89 - 15;  // 74 mm
      return { marginX: 7.5 / quadW, marginY: 7.5 / quadH }; // 0.06410 / 0.10135
    }
    if (cardType === 'a5_vertical' || cardType === 'vertical') {
      // Ficha A5 Vertical: 134 x 186 mm, inset 5 mm, marcador 10 mm -> offset = 10 mm
      const quadW = 134 - 20; // 114 mm
      const quadH = 186 - 20; // 166 mm
      return { marginX: 10 / quadW, marginY: 10 / quadH }; // 0.08772 / 0.06024
    }
    // Ficha A5 Horizontal (por defecto - CERO REGRESIÓN)
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
   * Escala para ficha vertical A5 (134 mm ancho x 186 mm alto en lienzo rectificado de 1441 x 2000 px).
   */
  function mmToPxVertical(xMm, yMm, wMm, hMm) {
    const scaleX = 1441 / 134; // 10.7537 px/mm
    const scaleY = 2000 / 186; // 10.7527 px/mm
    return {
      x: Math.round(xMm * scaleX),
      y: Math.round(yMm * scaleY),
      width: Math.round(wMm * scaleX),
      height: Math.round(hMm * scaleY)
    };
  }

  // Definición de Coordenadas Fijas de ROIs para Ficha A5 Vertical.
  const ROI_CONFIG_VERTICAL = {
    // Código QR (esquina superior derecha de la cabecera vertical de 134 mm)
    QR: Object.assign(mmToPxVertical(92, 2.0, 28, 24), {
      label: 'Código QR (Vertical)'
    }),

    // Cuadrícula de cálculo vertical (13 columnas x 10 filas)
    RESOLUTION: Object.assign(mmToPxVertical(11, 47, 112, 114), {
      label: 'Cuadrícula de cálculo (Vertical)'
    }),

    // Caja de respuesta manuscrita
    ANSWER_BOX: Object.assign(mmToPxVertical(23, 164, 50, 16), {
      label: 'Caja de Respuesta (Vertical)'
    })
  };

  /**
   * Escala para ficha A6 horizontal (132 mm ancho x 89 mm alto en lienzo rectificado de 2000 x 1441 px).
   */
  function mmToPxA6(xMm, yMm, wMm, hMm) {
    const scaleX = 2000 / 132; // 15.1515 px/mm
    const scaleY = 1441 / 89;  // 16.1910 px/mm
    return {
      x: Math.round(xMm * scaleX),
      y: Math.round(yMm * scaleY),
      width: Math.round(wMm * scaleX),
      height: Math.round(hMm * scaleY)
    };
  }

  /**
   * Escala para ficha A6 vertical (89 mm ancho x 132 mm alto en lienzo rectificado de 1441 x 2000 px).
   */
  function mmToPxA6Vertical(xMm, yMm, wMm, hMm) {
    const scaleX = 1441 / 89;  // 16.1910 px/mm
    const scaleY = 2000 / 132; // 15.1515 px/mm
    return {
      x: Math.round(xMm * scaleX),
      y: Math.round(yMm * scaleY),
      width: Math.round(wMm * scaleX),
      height: Math.round(hMm * scaleY)
    };
  }

  // Definición de Coordenadas Fijas de ROIs para Ficha A6 Horizontal (132 x 89 mm en lienzo 2000 x 1441 px).
  const ROI_CONFIG_A6 = {
    // Código QR (esquina superior derecha de la cabecera A6 Horizontal: 132 x 89 mm)
    // Cabecera 20 mm, padding derecho 15 mm -> QR en X=102..117 mm, Y=1..16 mm
    // Margen de seguridad con 4 mm de holgura: X=98..120 mm, Y=0.5..19.5 mm
    QR: Object.assign(mmToPxA6(98.0, 0.5, 22.0, 19.0), {
      label: 'Código QR (A6 Horizontal)'
    }),
    // Caja de respuesta manuscrita en A6
    ANSWER_BOX: Object.assign(mmToPxA6(36.0, 68.0, 60.0, 18.0), {
      label: 'Caja de Respuesta (A6 Horizontal)'
    })
  };

  // Definición de Coordenadas Fijas de ROIs para Ficha A6 Vertical (89 x 132 mm en lienzo 1441 x 2000 px).
  const ROI_CONFIG_A6_VERTICAL = {
    // Código QR (esquina superior derecha de la cabecera A6 Vertical: 89 x 132 mm)
    // Cabecera 20 mm, padding derecho 15 mm -> QR en X=59..74 mm, Y=1..16 mm
    // Margen de seguridad con 4 mm de holgura: X=55..77 mm, Y=0.5..19.5 mm
    QR: Object.assign(mmToPxA6Vertical(55.0, 0.5, 22.0, 19.0), {
      label: 'Código QR (A6 Vertical)'
    }),
    // Caja de respuesta manuscrita en A6 Vertical
    ANSWER_BOX: Object.assign(mmToPxA6Vertical(14.0, 110.0, 60.0, 18.0), {
      label: 'Caja de Respuesta (A6 Vertical)'
    })
  };

  // Coordenadas Fijas de ROIs para OMR en Ficha A5 Vertical (1441 x 2000 px).
  const ROI_OMR_CONFIG_VERTICAL = {
    MC2: {
      Q1_GRID: mmToPxVertical(11.0, 38.0, 112.0, 48.0),
      Q1_BUBBLES: mmToPxVertical(11.0, 87.0, 112.0, 18.0),
      Q2_GRID: mmToPxVertical(11.0, 112.0, 112.0, 48.0),
      Q2_BUBBLES: mmToPxVertical(11.0, 161.0, 112.0, 18.0)
    },
    MC1: {
      Q1_GRID: mmToPxVertical(11.0, 47.0, 112.0, 114.0),
      Q1_GRID_EXPANDED: mmToPxVertical(11.0, 47.0, 112.0, 126.0),
      Q1_BUBBLES: mmToPxVertical(11.0, 162.0, 112.0, 18.0)
    }
  };

  // Coordenadas Fijas de ROIs para OMR en Ficha A6 Horizontal (2000 x 1441 px normalizado).
  const ROI_OMR_CONFIG_A6 = {
    MC1: {
      Q1_GRID: mmToPxA6(14.0, 36.0, 104.0, 29.0),
      Q1_BUBBLES: mmToPxA6(12.0, 68.0, 108.0, 14.0)
    },
    MC2: {
      Q1_BUBBLES: mmToPxA6(12.0, 46.0, 108.0, 14.0),
      Q2_BUBBLES: mmToPxA6(12.0, 78.5, 108.0, 14.0)
    }
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
   * Preprocesamiento Local de Trazos y Atenuación/Eliminación Morfológica de Cuadrícula
   * 
   * Aísla la escritura del alumno (grafito HB/2B o tinta) y remueve las líneas
   * periódicas ortogonales de la cuadrícula de cálculo (16x7 o 16x4).
   * 
   * Guardarraíles activos:
   * - Regla 11: Actúa únicamente como filtro de eficiencia y limpiador (< 15ms). NUNCA califica.
   * - Preserva prioritariamente trazos de lápiz infantiles (incluso si cruzan líneas).
   * - Identifica cuadrícula vacía (Gatekeeper INT8 / Blank Detector).
   * - Cero regresión: Si ocurre cualquier excepción, aplica fallback silencioso con realce clásico.
   * 
   * @param {HTMLCanvasElement} targetCanvas - Canvas con la ROI de la cuadrícula recortada
   * @param {Object} options - { cols: 16, rows: 7, strokeRatio: 0.72, gridRatio: 0.95 }
   * @returns {{ success: boolean, isEmpty: boolean, strokeDensity: number, strokePixels: number, erasedGridPixels: number, paperLum: number }}
   */
  function preprocessCalculationGridStrokes(targetCanvas, options = {}) {
    if (!isValidCanvas(targetCanvas)) {
      return { success: false, isEmpty: false, strokeDensity: 0, strokePixels: 0, erasedGridPixels: 0, paperLum: 235 };
    }

    try {
      const width = targetCanvas.width;
      const height = targetCanvas.height;
      const totalPixels = width * height;
      if (totalPixels <= 0) {
        return { success: false, isEmpty: false, strokeDensity: 0, strokePixels: 0, erasedGridPixels: 0, paperLum: 235 };
      }

      const cols = options.cols || 16;
      const rows = options.rows || 7;
      const stepX = width / cols;
      const stepY = height / rows;

      const ctx = targetCanvas.getContext('2d', { willReadFrequently: true });
      const imgData = ctx.getImageData(0, 0, width, height);
      const data = imgData.data;

      // Lectura y escritura directa en memoria usando 32-bit words (< 15 ms en V8)
      const buf32 = new Uint32Array(data.buffer);
      const WHITE_PIXEL = 0xFFFFFFFF; // 32-bit RGBA blanco puro

      // 1. Muestreo ultra-rápido de luminancia del papel con stride adaptativo
      const stride = Math.max(32, Math.floor(totalPixels / 10000));
      const hist = new Uint32Array(256);
      let sampleCount = 0;
      for (let i = 0; i < totalPixels; i += stride) {
        const px = buf32[i];
        const lum = ((px & 0xFF) * 77 + ((px >> 8) & 0xFF) * 150 + ((px >> 16) & 0xFF) * 29) >> 8;
        hist[lum]++;
        sampleCount++;
      }

      // Estimar fondo del papel (percentil 85 superior)
      let acc = 0;
      let paperLum = 235;
      for (let i = 255; i >= 0; i--) {
        acc += hist[i];
        if (acc >= sampleCount * 0.15) {
          paperLum = i;
          break;
        }
      }
      paperLum = Math.max(160, Math.min(250, paperLum));

      // Umbrales adaptativos
      const strokeCutoff = Math.round(paperLum * (options.strokeRatio || 0.72));
      const gridFaintCutoff = Math.round(paperLum * (options.gridRatio || 0.97));

      // 2. Precalcular máscaras 1D ortogonales para líneas de rejilla (tolerancia ±3px)
      const isNearVLine = new Uint8Array(width);
      for (let c = 0; c <= cols; c++) {
        const vx = Math.round(c * stepX);
        for (let dx = -3; dx <= 3; dx++) {
          const x = vx + dx;
          if (x >= 0 && x < width) isNearVLine[x] = 1;
        }
      }

      const isNearHLine = new Uint8Array(height);
      for (let r = 0; r <= rows; r++) {
        const hy = Math.round(r * stepY);
        for (let dy = -3; dy <= 3; dy++) {
          const y = hy + dy;
          if (y >= 0 && y < height) isNearHLine[y] = 1;
        }
      }

      // 3. LUT pre-empaquetada en 32 bits para realce suave de lápiz
      const strokePixelLUT = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        const enh = Math.min(255, Math.max(0, Math.round(i * 0.82)));
        strokePixelLUT[i] = (255 << 24) | (enh << 16) | (enh << 8) | enh;
      }

      let detectedStrokePixels = 0;
      let erasedGridPixels = 0;

      // 4. Barrido ortogonal optimizado de pasada única
      let pIdx = 0;
      for (let y = 0; y < height; y++) {
        const nearH = isNearHLine[y];
        for (let x = 0; x < width; x++, pIdx++) {
          const px = buf32[pIdx];
          const lum = ((px & 0xFF) * 77 + ((px >> 8) & 0xFF) * 150 + ((px >> 16) & 0xFF) * 29) >> 8;

          if (lum < strokeCutoff) {
            // Trazo de lápiz oscuro infantil: PRESERVAR Y REALZAR
            detectedStrokePixels++;
            buf32[pIdx] = strokePixelLUT[lum];
          } else if ((nearH || isNearVLine[x]) && lum <= gridFaintCutoff) {
            // Cuadrícula impresa tenue: BORRAR A BLANCO PURO
            erasedGridPixels++;
            buf32[pIdx] = WHITE_PIXEL;
          } else {
            // Fondo de papel normal: BLANCO PURO
            buf32[pIdx] = WHITE_PIXEL;
          }
        }
      }

      ctx.putImageData(imgData, 0, 0);

      const strokeDensity = detectedStrokePixels / totalPixels;
      // Umbral calibrado de cuadrícula vacía: < 0.12% de píxeles con trazo
      const isEmpty = strokeDensity < 0.0012;

      return {
        success: true,
        isEmpty,
        strokeDensity,
        strokePixels: detectedStrokePixels,
        erasedGridPixels,
        paperLum
      };
    } catch (err) {
      console.warn('[ROIProcessor] Fallo en preprocessCalculationGridStrokes, aplicando fallback seguro:', err);
      enhanceHandwritingContrast(targetCanvas);
      return { success: true, isEmpty: false, strokeDensity: 0.05, strokePixels: 0, erasedGridPixels: 0, paperLum: 235, fallback: true };
    }
  }

  /**
   * Procesa la captura completa: extrae la ROI de la cuadrícula de cálculo y
   * la de la caja de respuesta, y realza el contraste de ambas.
   * Son dos ROIs separadas a propósito: la cuadrícula es la evidencia de CÓMO
   * resolvió el alumno y la caja de respuesta es el resultado final. El paso a
   * la IA las va a necesitar por separado.
   * @param {HTMLCanvasElement} sheetCanvas - Canvas aplanado de la ficha (2000x1441)
   * @returns {Object} { success, resolutionCanvas, answerCanvas, strokeInfo, error }
   */
  function processCapturedSheet(sheetCanvas, options = {}) {
    if (!isValidCanvas(sheetCanvas)) {
      return { success: false, resolutionCanvas: null, answerCanvas: null, strokeInfo: null, error: 'Lienzo de hoja inválido' };
    }

    const isPortrait = sheetCanvas.height > sheetCanvas.width;
    const isA6 = options.isA6 || options.cardFormat === 'a6';
    const cfg = isPortrait
      ? (isA6 ? ROI_CONFIG_A6_VERTICAL : ROI_CONFIG_VERTICAL)
      : (isA6 ? ROI_CONFIG_A6 : ROI_CONFIG);

    // 1. Extraer ROI de la Cuadrícula de cálculo (los pasos del alumno)
    let resolutionCanvas = null;
    let strokeInfo = null;

    if (options.withGrid !== false) {
      let resRoi = cfg.RESOLUTION || ROI_CONFIG.RESOLUTION;
      if (isPortrait && options.gridSize === 'expanded') {
        resRoi = Object.assign(mmToPxVertical(11, 47, 112, 126), {
          label: 'Cuadrícula de cálculo ampliada (Vertical)'
        });
      } else if (!isPortrait && options.gridSize === 'expanded' && !isA6) {
        resRoi = Object.assign(mmToPx(14, 46, 158, 73), {
          label: 'Cuadrícula de cálculo ampliada (Horizontal)'
        });
      }

      const extResult = extractROI(sheetCanvas, resRoi);
      if (extResult.success && extResult.canvas) {
        resolutionCanvas = extResult.canvas;
        const gridCols = isPortrait ? 13 : 16;
        const gridRows = isPortrait
          ? (options.gridSize === 'expanded' ? 12 : 10)
          : (options.gridSize === 'expanded' ? 8 : 7);
        strokeInfo = preprocessCalculationGridStrokes(resolutionCanvas, { cols: gridCols, rows: gridRows });
      }
    }

    // 2. Extraer ROI de la Caja de Respuesta (el resultado final)
    let answerCanvas = null;
    const ansRoi = cfg.ANSWER_BOX || ROI_CONFIG.ANSWER_BOX;
    const ansResult = extractROI(sheetCanvas, ansRoi);
    if (ansResult.success) {
      answerCanvas = ansResult.canvas;
      enhanceHandwritingContrast(answerCanvas);
    }

    return {
      success: true,
      resolutionCanvas: resolutionCanvas,
      answerCanvas: answerCanvas,
      strokeInfo: strokeInfo,
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

  // Radio de medición interno para no tomar los bordes impresos del círculo (2.1 mm)
  const OMR_BUBBLE_HALF_SIZE_MM = 2.1;

  /**
   * Muestrea el brillo promedio del fondo del papel en la fila de alternativas,
   * leyendo zonas libres de texto y burbujas (entre opciones y a los lados).
   * Esto permite que la detección funcione igual de bien con luz tenue, sombras o en pantalla.
   * @param {HTMLCanvasElement} sheetCanvas
   * @param {number} yCenterMm
   * @returns {number} Luminancia promedio del papel (0 a 255)
   */
  function samplePaperLuminance(sheetCanvas, yCenterMm, cardFormat = 'a5') {
    if (!isValidCanvas(sheetCanvas)) return 220;
    const ctx = sheetCanvas.getContext('2d', { willReadFrequently: true });
    const isVertical = sheetCanvas.height > sheetCanvas.width;
    let sheetWidthMm = isVertical ? 136 : 186;
    let sheetHeightMm = isVertical ? 188 : 134;

    if (cardFormat === 'a6') {
      sheetWidthMm = 132;
      sheetHeightMm = 89;
    } else if (cardFormat === 'a5_vertical' || isVertical) {
      sheetWidthMm = 136;
      sheetHeightMm = 188;
    } else {
      sheetWidthMm = 186;
      sheetHeightMm = 134;
    }

    const pxMmX = sheetCanvas.width / sheetWidthMm;
    const pxMmY = sheetCanvas.height / sheetHeightMm;
    // Zonas de fondo puro en la fila OMR
    const bgXSpots = (cardFormat === 'a6')
      ? [20, 50, 95, 115]
      : (isVertical ? [22, 45, 95, 115] : [42, 80, 119, 152]);
    const sampleHalfSizeMm = 1.5;
    let totalLum = 0;
    let count = 0;

    for (let i = 0; i < bgXSpots.length; i++) {
      const xMm = bgXSpots[i];
      const rx = Math.round((xMm - sampleHalfSizeMm) * pxMmX);
      const ry = Math.round((yCenterMm - sampleHalfSizeMm) * pxMmY);
      const rw = Math.round(sampleHalfSizeMm * 2 * pxMmX);
      const rh = Math.round(sampleHalfSizeMm * 2 * pxMmY);

      const clamped = clampROI({ x: rx, y: ry, width: rw, height: rh }, sheetCanvas.width, sheetCanvas.height);
      if (clamped.width <= 0 || clamped.height <= 0) continue;

      const imgData = ctx.getImageData(clamped.x, clamped.y, clamped.width, clamped.height);
      const d = imgData.data;
      let spotSum = 0;
      const spotPixels = clamped.width * clamped.height;
      for (let j = 0; j < d.length; j += 4) {
        spotSum += (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
      }
      totalLum += (spotSum / spotPixels);
      count++;
    }

    return count > 0 ? (totalLum / count) : 220;
  }

  /**
   * Mide la densidad de grafito/tinta en una burbuja de alternativa de forma adaptativa
   * @param {HTMLCanvasElement} sheetCanvas Lienzo rectificado
   * @param {number} cxMm Coordenada X del centro en mm
   * @param {number} cyMm Coordenada Y del centro en mm
   * @param {number} darkCutoff Umbral de luminancia por debajo del cual un píxel es considerado oscuro
   * @param {string} cardFormat Formato de la ficha ('a6', 'a5_vertical', 'a5')
   */
  function measureBubbleDarkness(sheetCanvas, cxMm, cyMm, darkCutoff = 165, cardFormat = 'a5') {
    const isVertical = sheetCanvas.height > sheetCanvas.width;
    let sheetWidthMm = isVertical ? 136 : 186;
    let sheetHeightMm = isVertical ? 188 : 134;

    if (cardFormat === 'a6') {
      sheetWidthMm = 132;
      sheetHeightMm = 89;
    } else if (cardFormat === 'a5_vertical' || isVertical) {
      sheetWidthMm = 136;
      sheetHeightMm = 188;
    } else {
      sheetWidthMm = 186;
      sheetHeightMm = 134;
    }

    const pxMmX = sheetCanvas.width / sheetWidthMm;
    const pxMmY = sheetCanvas.height / sheetHeightMm;

    // Para ser tolerante a variaciones de impresión, corte y encuadre (+-2.8mm vertical),
    // probamos el centro y offsets de barrido vertical
    const offsets = [0, -0.7, 0.7, -1.4, 1.4, -2.1, 2.1, -2.8, 2.8];
    let maxDark = 0;
    const ctx = sheetCanvas.getContext('2d', { willReadFrequently: true });

    for (let i = 0; i < offsets.length; i++) {
      const dy = offsets[i];
      const rx = Math.round((cxMm - OMR_BUBBLE_HALF_SIZE_MM) * pxMmX);
      const ry = Math.round((cyMm + dy - OMR_BUBBLE_HALF_SIZE_MM) * pxMmY);
      const rw = Math.round(OMR_BUBBLE_HALF_SIZE_MM * 2 * pxMmX);
      const rh = Math.round(OMR_BUBBLE_HALF_SIZE_MM * 2 * pxMmY);

      const clamped = clampROI({ x: rx, y: ry, width: rw, height: rh }, sheetCanvas.width, sheetCanvas.height);
      const imgData = ctx.getImageData(clamped.x, clamped.y, clamped.width, clamped.height);
      const d = imgData.data;

      let darkPixels = 0;
      const totalPixels = clamped.width * clamped.height;
      if (totalPixels === 0) continue;

      for (let j = 0; j < d.length; j += 4) {
        const lum = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
        if (lum < darkCutoff) {
          darkPixels++;
        }
      }

      const dens = darkPixels / totalPixels;
      if (dens > maxDark) maxDark = dens;
    }

    return maxDark;
  }

  /**
   * Evalúa las 4 alternativas de una fila (A, B, C, D) con umbral adaptativo
   * @param {HTMLCanvasElement} sheetCanvas
   * @param {number} yCenterMm Coordenada Y central de la fila en mm
   * @returns {{ marked: string, confidence: number, densities: Object }}
   */
  function evaluateAlternativeRow(sheetCanvas, yCenterMm) {
    // 1. Muestreo adaptativo del fondo real del papel en esta toma
    const paperLum = samplePaperLuminance(sheetCanvas, yCenterMm);
    // Un píxel se considera marca si es al menos 28% más oscuro que el fondo del papel
    // (Mínimo de seguridad 40 para evitar ruido en fotos ultra oscuras)
    const darkCutoff = Math.max(40, Math.round(paperLum * 0.72));

    const densities = {};
    let maxDensity = -1;
    let bestKey = null;

    OMR_BUBBLES_X_MM.forEach(b => {
      const dens = measureBubbleDarkness(sheetCanvas, b.xMm, yCenterMm, darkCutoff);
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

    // Umbral calibrado: la letra impresa A/B/C/D ocupa el 20-28% del área interna.
    // Un alumno rellenando con lápiz/bolígrafo cubre del 50% al 90%.
    const MIN_DARKNESS_THRESHOLD = 0.38;

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
   * Evalúa las alternativas de una fila de la cartilla OMR (con 4 burbujas compactas en columna)
   * @param {HTMLCanvasElement} sheetCanvas
   * @param {Array<{key: string, xMm: number}>} bubblesCoords
   * @param {number} yCenterMm
   * @returns {{ marked: string, confidence: number, densities: Object }}
   */
  function evaluateCompactRow(sheetCanvas, bubblesCoords, yCenterMm, cardFormat = 'a5') {
    const paperLum = samplePaperLuminance(sheetCanvas, yCenterMm, cardFormat);
    const darkCutoff = Math.max(40, Math.round(paperLum * 0.72));

    const densities = {};
    let maxDensity = -1;
    let bestKey = null;

    bubblesCoords.forEach(b => {
      const dens = measureBubbleDarkness(sheetCanvas, b.xMm, yCenterMm, darkCutoff, cardFormat);
      densities[b.key] = Math.round(dens * 100);
      if (dens > maxDensity) {
        maxDensity = dens;
        bestKey = b.key;
      }
    });

    let secondDensity = -1;
    bubblesCoords.forEach(b => {
      if (b.key !== bestKey && (densities[b.key] / 100) > secondDensity) {
        secondDensity = densities[b.key] / 100;
      }
    });

    const MIN_DARKNESS_THRESHOLD = 0.38;

    if (maxDensity < MIN_DARKNESS_THRESHOLD) {
      return { marked: 'BLANK', confidence: Math.round((1 - maxDensity) * 100), densities };
    }

    if (secondDensity >= MIN_DARKNESS_THRESHOLD && secondDensity >= maxDensity * 0.75) {
      return { marked: 'MULTIPLE', confidence: 50, densities };
    }

    return { marked: bestKey, confidence: Math.round(maxDensity * 100), densities };
  }

  /**
   * Evalúa la ficha completa en modo alternativas (1 o 2 preguntas con borrador, Rama 2 o Rama 3)
   * @param {HTMLCanvasElement} sheetCanvas
   * @param {number} questionCount Cantidad de preguntas
   * @param {Object} options Opciones { branch, withGrid, cardFormat, cardOrientation }
   * @returns {Array<{ qIndex: number, marked: string, confidence: number, densities: Object }>}
   */
  function evaluateOMRSheet(sheetCanvas, questionCount = 1, options = {}) {
    if (!isValidCanvas(sheetCanvas)) return [];

    const branch = options.branch || (questionCount > 3 ? 'rama3' : 'rama1');
    const withGrid = options.withGrid !== undefined ? options.withGrid : true;
    const isVertical = sheetCanvas.height > sheetCanvas.width;
    const cardFormat = options.cardFormat || (isVertical ? 'a5_vertical' : ((branch === 'rama3' && questionCount <= 10) ? 'a6' : 'a5'));

    // ── GUARDRAIL DINÁMICO: Alturas exactas guardadas en la sesión (omrLayout) ──
    if (options.omrLayout && Array.isArray(options.omrLayout.rows) && options.omrLayout.rows.length >= questionCount) {
      const results = [];
      const format = options.omrLayout.format || (isVertical ? 'a5_vertical' : 'a5');
      for (let i = 0; i < questionCount; i++) {
        const rowData = options.omrLayout.rows[i];
        if (!rowData) continue;
        const yCenterMm = rowData.yCenterMm;
        let bubblesCoords = rowData.bubbles;
        if (!bubblesCoords || bubblesCoords.length < 4) {
          bubblesCoords = isVertical ? [
            { key: 'A', xMm: 17.5 },
            { key: 'B', xMm: 46.0 },
            { key: 'C', xMm: 74.5 },
            { key: 'D', xMm: 103.0 }
          ] : OMR_BUBBLES_X_MM;
        }
        const res = evaluateCompactRow(sheetCanvas, bubblesCoords, yCenterMm, format);
        results.push(Object.assign({ qIndex: i + 1 }, res));
      }
      return results;
    }

    // ── RAMA 3: CARTILLA DE RESPUESTAS OMR (HASTA 20 PREGUNTAS) ──
    if (branch === 'rama3' || questionCount > 3) {
      const totalQ = questionCount;
      const results = [];

      // SUB-RAMA 3A: Cartilla A6 (hasta 10 preguntas)
      if (branch === 'rama3' && totalQ <= 10) {
        if (totalQ === 8 || totalQ === 10) {
          const col1Bubbles = [
            { key: 'A', xMm: 34.3 },
            { key: 'B', xMm: 41.6 },
            { key: 'C', xMm: 48.9 },
            { key: 'D', xMm: 56.2 }
          ];
          const col2Bubbles = [
            { key: 'A', xMm: 88.8 },
            { key: 'B', xMm: 96.1 },
            { key: 'C', xMm: 103.4 },
            { key: 'D', xMm: 110.7 }
          ];
          const half = totalQ / 2;
          const startY = 24.0;
          const stepY = 60.0 / (half + 1);
          for (let i = 0; i < half; i++) {
            const qNum = i + 1;
            const yMm = startY + (i + 1) * stepY;
            const res = evaluateCompactRow(sheetCanvas, col1Bubbles, yMm, 'a6');
            results.push(Object.assign({ qIndex: qNum }, res));
          }
          for (let j = 0; j < half; j++) {
            const qNum = half + j + 1;
            const yMm = startY + (j + 1) * stepY;
            const res = evaluateCompactRow(sheetCanvas, col2Bubbles, yMm, 'a6');
            results.push(Object.assign({ qIndex: qNum }, res));
          }
          return results;
        }

        // 1 columna vertical centrada (1 a 7 preguntas, como la cartilla de 5 preguntas)
        const a6Bubbles = [
          { key: 'A', xMm: 61.55 },
          { key: 'B', xMm: 68.85 },
          { key: 'C', xMm: 76.15 },
          { key: 'D', xMm: 83.45 }
        ];
        const startY = 24.0;
        const stepY = 60.0 / (totalQ + 1);
        for (let i = 0; i < totalQ; i++) {
          const qNum = i + 1;
          const yMm = startY + (i + 1) * stepY;
          const res = evaluateCompactRow(sheetCanvas, a6Bubbles, yMm, 'a6');
          results.push(Object.assign({ qIndex: qNum }, res));
        }
        return results;
      }

      // SUB-RAMA 3B: Cartilla A5 Vertical (11 a 20 preguntas)
      if (branch === 'rama3') {
        if (totalQ === 20 && isVertical) {
          const col1Bubbles = [
            { key: 'A', xMm: 35.3 },
            { key: 'B', xMm: 42.6 },
            { key: 'C', xMm: 49.9 },
            { key: 'D', xMm: 57.2 }
          ];
          const col2Bubbles = [
            { key: 'A', xMm: 91.8 },
            { key: 'B', xMm: 99.1 },
            { key: 'C', xMm: 106.4 },
            { key: 'D', xMm: 113.7 }
          ];
          const stepY = 160.0 / 11;
          const startY = 22.0;
          for (let i = 0; i < 10; i++) {
            const qNum = i + 1;
            const yMm = startY + (i + 1) * stepY;
            const res = evaluateCompactRow(sheetCanvas, col1Bubbles, yMm, 'a5_vertical');
            results.push(Object.assign({ qIndex: qNum }, res));
          }
          for (let j = 0; j < 10; j++) {
            const qNum = 10 + j + 1;
            const yMm = startY + (j + 1) * stepY;
            const res = evaluateCompactRow(sheetCanvas, col2Bubbles, yMm, 'a5_vertical');
            results.push(Object.assign({ qIndex: qNum }, res));
          }
          return results;
        }

        // 11 a 19 preguntas (1 columna centrada en A5 Vertical)
        const vBubbles = [
          { key: 'A', xMm: 63.55 },
          { key: 'B', xMm: 70.85 },
          { key: 'C', xMm: 78.15 },
          { key: 'D', xMm: 85.45 }
        ];
        const stepY = 160.0 / (totalQ + 1);
        const startY = 22.0;

        for (let i = 0; i < totalQ; i++) {
          const qNum = i + 1;
          const yMm = startY + (i + 1) * stepY;
          const res = evaluateCompactRow(sheetCanvas, vBubbles, yMm, isVertical ? 'a5_vertical' : 'a5');
          results.push(Object.assign({ qIndex: qNum }, res));
        }
        return results;
      }

      // Fallback genérico para evaluaciones no-rama3 con más de 3 preguntas
      const half = Math.ceil(totalQ / 2);
      const col1Bubbles = [
        { key: 'A', xMm: 54.0 }, { key: 'B', xMm: 63.7 }, { key: 'C', xMm: 73.4 }, { key: 'D', xMm: 83.1 }
      ];
      const col2Bubbles = [
        { key: 'A', xMm: 135.0 }, { key: 'B', xMm: 144.7 }, { key: 'C', xMm: 154.4 }, { key: 'D', xMm: 164.1 }
      ];
      let startY = 37.0;
      let stepY = 9.5;
      if (half <= 3) { startY = 48.0; stepY = 28.0; }
      else if (half <= 5) { startY = 42.0; stepY = 19.0; }
      else if (half <= 8) { startY = 38.0; stepY = 12.0; }

      for (let i = 0; i < half; i++) {
        const qNum = i + 1;
        const yMm = startY + i * stepY;
        const res = evaluateCompactRow(sheetCanvas, col1Bubbles, yMm);
        results.push(Object.assign({ qIndex: qNum }, res));
      }
      const col2Count = totalQ - half;
      for (let j = 0; j < col2Count; j++) {
        const qNum = half + j + 1;
        const yMm = startY + j * stepY;
        const res = evaluateCompactRow(sheetCanvas, col2Bubbles, yMm);
        results.push(Object.assign({ qIndex: qNum }, res));
      }

      return results;
    }

    // ── RAMA 2: FOCALIZADA SIN BORRADOR (1 A 5 PREGUNTAS) ──
    if (branch === 'rama2' && !withGrid) {
      const isPortrait = sheetCanvas.height > sheetCanvas.width;
      if (isPortrait) {
        // En A5 Vertical (134x186 mm), las preguntas se distribuyen equitativamente entre Y=24mm y Y=178mm
        const vBubbles = [
          { key: 'A', xMm: 17.5 },
          { key: 'B', xMm: 46.0 },
          { key: 'C', xMm: 74.5 },
          { key: 'D', xMm: 103.0 }
        ];
        const startY = 24.0;
        const totalHeight = 154.0; // 178 - 24
        const stepY = totalHeight / questionCount;
        const results = [];
        for (let i = 0; i < questionCount; i++) {
          const yCenter = startY + (i + 0.5) * stepY;
          const res = evaluateCompactRow(sheetCanvas, vBubbles, yCenter);
          results.push(Object.assign({ qIndex: i + 1 }, res));
        }
        return results;
      }

      // Detectar si es ficha A6 (1 o 2 preguntas en pliego 4 por hoja)
      const isA6 = options.isA6 || options.cardFormat === 'a6' || (questionCount <= 2 && options.cardFormat !== 'a5');
      if (isA6) {
        // En A6 (132 x 89 mm), mapeado a lienzo normalizado (2000 x 1441 px / 186 x 134 mm)
        const a6BubblesNorm = [
          { key: 'A', xMm: 34.2 },
          { key: 'B', xMm: 67.0 },
          { key: 'C', xMm: 99.7 },
          { key: 'D', xMm: 132.4 }
        ];
        if (questionCount === 1) {
          const q1Result = evaluateCompactRow(sheetCanvas, a6BubblesNorm, 53.1);
          return [Object.assign({ qIndex: 1 }, q1Result)];
        } else {
          // 2 Preguntas
          const q1Result = evaluateCompactRow(sheetCanvas, a6BubblesNorm, 53.1);
          const q2Result = evaluateCompactRow(sheetCanvas, a6BubblesNorm, 85.8);
          return [
            Object.assign({ qIndex: 1 }, q1Result),
            Object.assign({ qIndex: 2 }, q2Result)
          ];
        }
      }

      // Disposición Horizontal A5 (186x134 mm)
      if (questionCount === 5) {
        const stepY = 100.0 / 5;
        const results = [];
        for (let i = 0; i < 5; i++) {
          const yCenter = 28.0 + (i + 0.5) * stepY;
          const res = evaluateAlternativeRow(sheetCanvas, yCenter);
          results.push(Object.assign({ qIndex: i + 1 }, res));
        }
        return results;
      } else if (questionCount === 4) {
        const stepY = 100.0 / 4;
        const results = [];
        for (let i = 0; i < 4; i++) {
          const yCenter = 28.0 + (i + 0.5) * stepY;
          const res = evaluateAlternativeRow(sheetCanvas, yCenter);
          results.push(Object.assign({ qIndex: i + 1 }, res));
        }
        return results;
      } else if (questionCount === 3) {
        const q1Result = evaluateAlternativeRow(sheetCanvas, 54.0);
        const q2Result = evaluateAlternativeRow(sheetCanvas, 89.0);
        const q3Result = evaluateAlternativeRow(sheetCanvas, 124.0);
        return [
          Object.assign({ qIndex: 1 }, q1Result),
          Object.assign({ qIndex: 2 }, q2Result),
          Object.assign({ qIndex: 3 }, q3Result)
        ];
      } else if (questionCount === 2) {
        const q1Result = evaluateAlternativeRow(sheetCanvas, 70.0);
        const q2Result = evaluateAlternativeRow(sheetCanvas, 122.0);
        return [
          Object.assign({ qIndex: 1 }, q1Result),
          Object.assign({ qIndex: 2 }, q2Result)
        ];
      } else {
        const q1Result = evaluateAlternativeRow(sheetCanvas, 124.0);
        return [
          Object.assign({ qIndex: 1 }, q1Result)
        ];
      }
    }

    // ── RAMA 1: CASO ESTÁNDAR (1 O 2 PREGUNTAS CON BORRADOR) ──
    const isPortraitSheet = sheetCanvas.height > sheetCanvas.width;
    if (isPortraitSheet) {
      // Coordenadas para Ficha A5 Vertical (134 mm ancho x 186 mm alto)
      const vBubbles = [
        { key: 'A', xMm: 17.5 },
        { key: 'B', xMm: 46.0 },
        { key: 'C', xMm: 74.5 },
        { key: 'D', xMm: 103.0 }
      ];
      if (questionCount === 2) {
        // P1 en Y=97 mm y P2 en Y=169 mm
        const q1Result = evaluateCompactRow(sheetCanvas, vBubbles, 97.0);
        const q2Result = evaluateCompactRow(sheetCanvas, vBubbles, 169.0);
        return [
          Object.assign({ qIndex: 1 }, q1Result),
          Object.assign({ qIndex: 2 }, q2Result)
        ];
      } else {
        // 1 Pregunta vertical: burbujas OMR al pie en Y=169 mm
        const q1Result = evaluateCompactRow(sheetCanvas, vBubbles, 169.0);
        return [
          Object.assign({ qIndex: 1 }, q1Result)
        ];
      }
    }

    if (questionCount === 2) {
      // 2 Preguntas Horizontal: P1 tiene alternativas a Y=71.5mm y P2 a Y=125.5mm
      const q1Result = evaluateAlternativeRow(sheetCanvas, 71.5);
      const q2Result = evaluateAlternativeRow(sheetCanvas, 125.5);
      return [
        Object.assign({ qIndex: 1 }, q1Result),
        Object.assign({ qIndex: 2 }, q2Result)
      ];
    } else {
      // 1 Pregunta Horizontal: Alternativas al pie en Y=124.0mm
      const q1Result = evaluateAlternativeRow(sheetCanvas, 124.0);
      return [
        Object.assign({ qIndex: 1 }, q1Result)
      ];
    }
  }

  const ROI_OMR_CONFIG = {
    MC2: {
      Q1_GRID: mmToPx(15.0, 40.0, 156.0, 26.0),
      Q1_BUBBLES: mmToPx(15.0, 65.5, 156.0, 12.0),
      Q2_GRID: mmToPx(15.0, 94.0, 156.0, 26.0),
      Q2_BUBBLES: mmToPx(15.0, 119.5, 156.0, 12.0)
    },
    MC1: {
      Q1_GRID: mmToPx(14.0, 49.0, 158.0, 67.0),
      Q1_BUBBLES: mmToPx(15.0, 117.5, 156.0, 13.0)
    }
  };

  /**
   * Extrae los recortes visuales individuales de cada pregunta para el modal:
   * Cuadrícula de cálculo (con realce de grafito) y franja de alternativas marcadas.
   * Soporta A5 Horizontal, A5 Vertical, A6 y modo sin borrador.
   * @param {HTMLCanvasElement} sheetCanvas
   * @param {number} questionCount 1 a 5 preguntas
   * @param {Object} options Opciones { branch, withGrid, gridSize, cardFormat, isPortrait }
   * @returns {Array<{ qIndex: number, bubblesCanvas: HTMLCanvasElement|null, gridCanvas: HTMLCanvasElement|null, strokeInfo: Object|null }>}
   */
  function extractOMRCrops(sheetCanvas, questionCount = 1, options = {}) {
    if (!isValidCanvas(sheetCanvas)) return [];

    const branch = options.branch || (questionCount > 3 ? 'rama3' : 'rama1');
    const withGrid = options.withGrid !== undefined ? options.withGrid : true;
    const isPortrait = sheetCanvas.height > sheetCanvas.width || options.isPortrait;
    const isA6 = options.isA6 || options.cardFormat === 'a6' || (branch === 'rama2' && !withGrid && questionCount <= 2 && options.cardFormat !== 'a5');

    // Para Rama 3 pura no hay recortes individuales
    if (branch === 'rama3' || questionCount > 5) {
      return [];
    }

    const list = [];

    // ── GUARDRAIL DINÁMICO: Recortes OMR basados en omrLayout de la sesión ──
    if (options.omrLayout && Array.isArray(options.omrLayout.rows) && options.omrLayout.rows.length >= questionCount && (!withGrid || branch === 'rama2')) {
      const format = options.omrLayout.format || (isPortrait ? 'a5_vertical' : (isA6 ? 'a6' : 'a5'));
      const isA6Sheet = format === 'a6' || isA6;
      const sheetWidthMm = options.omrLayout.sheetWidthMm || (isPortrait ? (isA6Sheet ? 89 : 134) : (isA6Sheet ? 132 : 186));
      const sheetHeightMm = options.omrLayout.sheetHeightMm || (isPortrait ? (isA6Sheet ? 132 : 186) : (isA6Sheet ? 89 : 134));
      const scaleX = sheetCanvas.width / sheetWidthMm;
      const scaleY = sheetCanvas.height / sheetHeightMm;

      for (let i = 0; i < questionCount; i++) {
        const rowData = options.omrLayout.rows[i];
        if (!rowData) continue;
        const yCenterMm = rowData.yCenterMm;
        const marginX = isA6Sheet ? 12.0 : 10.0;
        const roiW = sheetWidthMm - 2 * marginX;
        const bubbleRoi = {
          x: Math.round(marginX * scaleX),
          y: Math.round((yCenterMm - 7.0) * scaleY),
          width: Math.round(roiW * scaleX),
          height: Math.round(14.0 * scaleY)
        };
        const b = extractROI(sheetCanvas, bubbleRoi);
        if (b.success && b.canvas) enhanceHandwritingContrast(b.canvas);
        list.push({
          qIndex: i + 1,
          bubblesCanvas: b.success ? b.canvas : null,
          gridCanvas: null,
          strokeInfo: null
        });
      }
      return list;
    }

    // ── MODO CON CUADRÍCULA (FORMATIVA / FOCALIZADA CON BORRADOR, 1 o 2 PREGUNTAS) ──
    if (withGrid) {
      if (isPortrait) {
        // A5 Vertical con cuadrícula
        const is2Q = questionCount === 2;
        const vCfg = is2Q ? ROI_OMR_CONFIG_VERTICAL.MC2 : ROI_OMR_CONFIG_VERTICAL.MC1;

        // Q1
        const b1 = extractROI(sheetCanvas, vCfg.Q1_BUBBLES);
        const gridRoi1 = (!is2Q && options.gridSize === 'expanded') ? vCfg.Q1_GRID_EXPANDED : vCfg.Q1_GRID;
        const g1 = extractROI(sheetCanvas, gridRoi1);
        let strokeInfo1 = null;
        if (b1.success && b1.canvas) enhanceHandwritingContrast(b1.canvas);
        if (g1.success && g1.canvas) {
          strokeInfo1 = preprocessCalculationGridStrokes(g1.canvas, { cols: 13, rows: is2Q ? 5 : (options.gridSize === 'expanded' ? 12 : 10) });
        }
        list.push({
          qIndex: 1,
          bubblesCanvas: b1.success ? b1.canvas : null,
          gridCanvas: g1.success ? g1.canvas : null,
          strokeInfo: strokeInfo1
        });

        // Q2 si corresponde
        if (is2Q) {
          const b2 = extractROI(sheetCanvas, vCfg.Q2_BUBBLES);
          const g2 = extractROI(sheetCanvas, vCfg.Q2_GRID);
          let strokeInfo2 = null;
          if (b2.success && b2.canvas) enhanceHandwritingContrast(b2.canvas);
          if (g2.success && g2.canvas) {
            strokeInfo2 = preprocessCalculationGridStrokes(g2.canvas, { cols: 13, rows: 5 });
          }
          list.push({
            qIndex: 2,
            bubblesCanvas: b2.success ? b2.canvas : null,
            gridCanvas: g2.success ? g2.canvas : null,
            strokeInfo: strokeInfo2
          });
        }
        return list;
      }

      // A6 Horizontal con cuadrícula (1 o 2 preguntas)
      if (isA6) {
        const a6Cfg = is2Q ? ROI_OMR_CONFIG_A6.MC2 : ROI_OMR_CONFIG_A6.MC1;
        const b1 = extractROI(sheetCanvas, a6Cfg.Q1_BUBBLES);
        const g1 = a6Cfg.Q1_GRID ? extractROI(sheetCanvas, a6Cfg.Q1_GRID) : { success: false, canvas: null };
        let strokeInfo1 = null;
        if (b1.success && b1.canvas) enhanceHandwritingContrast(b1.canvas);
        if (g1.success && g1.canvas) {
          strokeInfo1 = preprocessCalculationGridStrokes(g1.canvas, { cols: 13, rows: 5 });
        }
        list.push({
          qIndex: 1,
          bubblesCanvas: b1.success ? b1.canvas : null,
          gridCanvas: g1.success ? g1.canvas : null,
          strokeInfo: strokeInfo1
        });

        if (is2Q) {
          const b2 = extractROI(sheetCanvas, a6Cfg.Q2_BUBBLES);
          if (b2.success && b2.canvas) enhanceHandwritingContrast(b2.canvas);
          list.push({
            qIndex: 2,
            bubblesCanvas: b2.success ? b2.canvas : null,
            gridCanvas: null,
            strokeInfo: null
          });
        }
        return list;
      }

      // A5 Horizontal con cuadrícula (Comportamiento probado estándar)
      const is2Q = questionCount === 2;
      const cfg = is2Q ? ROI_OMR_CONFIG.MC2 : ROI_OMR_CONFIG.MC1;

      const pLum1 = samplePaperLuminance(sheetCanvas, is2Q ? 71.5 : 124.0);
      const whiteCutoff1 = Math.max(90, Math.min(235, Math.round(pLum1 * 0.98)));
      const blackCutoff1 = Math.max(25, Math.round(pLum1 * 0.40));

      const b1 = extractROI(sheetCanvas, cfg.Q1_BUBBLES);
      const g1 = extractROI(sheetCanvas, cfg.Q1_GRID);
      let strokeInfo1 = null;
      if (b1.success && b1.canvas) {
        enhanceHandwritingContrast(b1.canvas, { blackCutoff: blackCutoff1, whiteCutoff: whiteCutoff1 });
      }
      if (g1.success && g1.canvas) {
        strokeInfo1 = preprocessCalculationGridStrokes(g1.canvas, { cols: is2Q ? 26 : 16, rows: is2Q ? 4 : (options.gridSize === 'expanded' ? 8 : 7) });
      }
      list.push({
        qIndex: 1,
        bubblesCanvas: b1.success ? b1.canvas : null,
        gridCanvas: g1.success ? g1.canvas : null,
        strokeInfo: strokeInfo1
      });

      if (is2Q) {
        const pLum2 = samplePaperLuminance(sheetCanvas, 125.5);
        const whiteCutoff2 = Math.max(90, Math.min(235, Math.round(pLum2 * 0.98)));
        const blackCutoff2 = Math.max(25, Math.round(pLum2 * 0.40));

        const b2 = extractROI(sheetCanvas, cfg.Q2_BUBBLES);
        const g2 = extractROI(sheetCanvas, cfg.Q2_GRID);
        let strokeInfo2 = null;
        if (b2.success && b2.canvas) {
          enhanceHandwritingContrast(b2.canvas, { blackCutoff: blackCutoff2, whiteCutoff: whiteCutoff2 });
        }
        if (g2.success && g2.canvas) {
          strokeInfo2 = preprocessCalculationGridStrokes(g2.canvas, { cols: 26, rows: 4 });
        }
        list.push({
          qIndex: 2,
          bubblesCanvas: b2.success ? b2.canvas : null,
          gridCanvas: g2.success ? g2.canvas : null,
          strokeInfo: strokeInfo2
        });
      }
      return list;
    }

    // ── MODO SIN CUADRÍCULA (FOCALIZADA, 1 A 5 PREGUNTAS): EXTRAER FRANJA DE BURBUJAS ──
    for (let i = 0; i < questionCount; i++) {
      let bubbleRoi = null;
      if (isPortrait) {
        const stepY = 154.0 / questionCount;
        const yCenter = 24.0 + (i + 0.5) * stepY;
        bubbleRoi = mmToPxVertical(11, yCenter - 7, 112, 14);
      } else if (isA6) {
        const yCenter = (i === 0) ? 53.1 : 85.8;
        bubbleRoi = mmToPx(20.0, yCenter - 7.0, 130.0, 14.0);
      } else {
        let yCenter = 124.0;
        if (questionCount === 5) yCenter = 28.0 + (i + 0.5) * 20.0;
        else if (questionCount === 4) yCenter = 28.0 + (i + 0.5) * 25.0;
        else if (questionCount === 3) yCenter = [54.0, 89.0, 124.0][i];
        else if (questionCount === 2) yCenter = [70.0, 122.0][i];
        bubbleRoi = mmToPx(15, yCenter - 6.5, 156, 13);
      }

      const b = extractROI(sheetCanvas, bubbleRoi);
      if (b.success && b.canvas) enhanceHandwritingContrast(b.canvas);

      // En A6 sin cuadrícula de 1 pregunta, extraer la zona de cálculo vacía donde el alumno escribió sus pasos
      let calcCanvas = null;
      let strokeInfo = null;
      if (isA6 && questionCount === 1 && i === 0) {
        const gExt = extractROI(sheetCanvas, ROI_OMR_CONFIG_A6.MC1.Q1_GRID);
        if (gExt.success && gExt.canvas) {
          calcCanvas = gExt.canvas;
          strokeInfo = preprocessCalculationGridStrokes(calcCanvas, { cols: 13, rows: 5 });
        }
      }

      list.push({
        qIndex: i + 1,
        bubblesCanvas: b.success ? b.canvas : null,
        gridCanvas: calcCanvas,
        strokeInfo: strokeInfo
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
    CONFIG_VERTICAL: ROI_CONFIG_VERTICAL,
    CONFIG_A6: ROI_CONFIG_A6,
    CONFIG_A6_VERTICAL: ROI_CONFIG_A6_VERTICAL,
    OMR_CONFIG: ROI_OMR_CONFIG,
    OMR_CONFIG_VERTICAL: ROI_OMR_CONFIG_VERTICAL,
    isValidCanvas,
    clampROI,
    extractROI,
    enhanceHandwritingContrast,
    preprocessCalculationGridStrokes,
    processCapturedSheet,
    // Métodos OMR
    measureBubbleDarkness,
    evaluateAlternativeRow,
    evaluateOMRSheet,
    extractOMRCrops
  };

  global.ROIProcessor = ROIProcessor;

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
