/**
 * Módulo de Procesamiento de Regiones de Interés (ROIs) y Normalización de Contraste
 * Microevaluación Formativa de Clase A5
 * 
 * Funcionalidad:
 * 1. Definición estandarizada de ROIs sobre el lienzo de perspectiva (1400 x 953 px).
 * 2. Extracción quirúrgica de la ROI de Resolución (Cuadrícula + Respuesta).
 * 3. Extracción de la ROI del Código QR para decodificación rápida.
 * 4. Normalización de histograma y realce suave de grafito escolar (sin binarización destructiva).
 * 5. Guardrails completos de dimensiones, bordes y manejo de excepciones en memoria.
 */

(function (global) {
  'use strict';

  // Dimensiones base del lienzo aplanado en alta resolución
  const SHEET_WIDTH = 1400;
  const SHEET_HEIGHT = 953;

  // Definición de Coordenadas Fijas de ROIs (en px sobre base 1400 x 953)
  const ROI_CONFIG = {
    // Código QR (Esquina superior derecha)
    QR: {
      x: 1020,
      y: 35,
      width: 320,
      height: 220,
      label: 'Código QR'
    },

    // Zona Completa de Resolución (Cuadrícula de cálculo + Franja de respuesta)
    RESOLUTION: {
      x: 140,
      y: 375,
      width: 1120,
      height: 485,
      label: 'Resolución y Respuesta'
    },

    // Sub-ROI exclusiva de la caja de respuesta
    ANSWER_BOX: {
      x: 140,
      y: 725,
      width: 580,
      height: 135,
      label: 'Caja de Respuesta'
    }
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
   * Procesa la captura completa: extrae la ROI de resolución y aplica contraste
   * @param {HTMLCanvasElement} sheetCanvas - Canvas aplanado de la hoja (1400x953)
   * @returns {Object} { success: boolean, resolutionCanvas: HTMLCanvasElement|null, error: string|null }
   */
  function processCapturedSheet(sheetCanvas) {
    if (!isValidCanvas(sheetCanvas)) {
      return { success: false, resolutionCanvas: null, error: 'Lienzo de hoja inválido' };
    }

    // 1. Extraer ROI de Resolución (Cuadrícula + Respuesta)
    const extResult = extractROI(sheetCanvas, ROI_CONFIG.RESOLUTION);
    if (!extResult.success) {
      return extResult;
    }

    const resolutionCanvas = extResult.canvas;

    // 2. Aplicar normalización y contraste de grafito
    enhanceHandwritingContrast(resolutionCanvas);

    return {
      success: true,
      resolutionCanvas: resolutionCanvas,
      error: null
    };
  }

  // Exportar el módulo al objeto global (navegador o node)
  const ROIProcessor = {
    SHEET_WIDTH,
    SHEET_HEIGHT,
    CONFIG: ROI_CONFIG,
    isValidCanvas,
    clampROI,
    extractROI,
    enhanceHandwritingContrast,
    processCapturedSheet
  };

  global.ROIProcessor = ROIProcessor;

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
