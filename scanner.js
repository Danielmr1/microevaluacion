/**
 * Módulo de Aplicación: Scanner de Aula A5
 * Microevaluación Formativa de Clase v2.5.0
 * 
 * Funcionalidad:
 * - Ciclo de tracking de visión en tiempo real (Marcadores ArUco 0, 1, 2, 3)
 * - Cuadrilátero elástico de guía interactiva
 * - Verificación de nitidez (55%), paralelismo y cobertura (45%)
 * - Auto-disparo inteligente con retroalimentación audiovisual y háptica
 * - Corrección de perspectiva a resolución fija (1400 x 953 px)
 * - Integración con ROIProcessor para extracción de resolución y contraste de grafito
 * - 6 Guardrails de seguridad para ejecución estable en aula
 */

(function (global) {
  'use strict';

  // --- VARIABLES DE ESTADO Y CONFIGURACIÓN ---
  let videoStream = null;
  let isScanning = false;
  let currentFacingMode = 'environment';
  let torchActive = false;
  let track = null;

  let video = null;
  let overlay = null;
  let ctx = null;

  // Canvas de procesamiento en memoria
  const procCanvas = document.createElement('canvas');
  const procCtx = procCanvas.getContext('2d', { willReadFrequently: true });

  let arucoDetector = null;
  let stableFrameCount = 0;
  const REQUIRED_STABLE_FRAMES = 3;   // ~150-200ms de quietud absoluta
  const COVERAGE_THRESHOLD = 45;       // Cobertura mínima de pantalla
  const SHARPNESS_THRESHOLD = 55;      // Umbral calibrado de nitidez (55%)
  const CAPTURE_COOLDOWN_MS = 2500;    // Guardrail anti-duplicados (2.5 seg)

  let lastCaptureTime = 0;
  let scanStartTime = null;
  let targetLockStartTime = null;
  let activeTarget = null;
  let lostFramesCount = 0;
  const MAX_LOST_FRAMES = 12;

  // Detector nativo de Android Chrome si está disponible
  let nativeBarcodeDetector = null;
  if ('BarcodeDetector' in window) {
    try {
      nativeBarcodeDetector = new BarcodeDetector({ formats: ['qr_code'] });
    } catch (e) {
      nativeBarcodeDetector = null;
    }
  }

  // --- GUARDRAIL 1: VERIFICACIÓN DE DEPENDENCIAS AL INICIAR ---
  function checkDependencies() {
    const missing = [];
    if (typeof AR === 'undefined' || !AR.Detector) missing.push('aruco.bundle.js (Detector ArUco)');
    if (typeof CV === 'undefined') missing.push('CV (Visión Computacional)');
    if (typeof jsQR === 'undefined' && !nativeBarcodeDetector) missing.push('jsqr.min.js (Lector QR)');
    if (typeof ROIProcessor === 'undefined') missing.push('roi-processor.js (Procesador ROI)');

    if (missing.length > 0) {
      const banner = document.getElementById('dependency-error-banner');
      if (banner) {
        banner.style.display = 'block';
        banner.innerHTML = '<strong>⚠️ Error de Carga de Módulos:</strong> Faltan archivos clave: ' + missing.join(', ') + '. Por favor recarga la página.';
      }
      console.error('[Scanner] Faltan dependencias:', missing);
      return false;
    }
    return true;
  }

  // Inicializar detector ArUco de forma segura
  function initArUco() {
    if (typeof AR !== 'undefined' && AR.Detector) {
      try {
        arucoDetector = new AR.Detector({ dictionaryName: 'ARUCO' });
      } catch (err) {
        console.error('[Scanner] Error instanciando AR.Detector:', err);
      }
    }
  }

  // --- SINTETIZADOR DE AUDIO WEB (Cero archivos mp3 externos) ---
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playBeep() {
    try {
      const actx = getAudioContext();
      const osc = actx.createOscillator();
      const gain = actx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, actx.currentTime);
      gain.gain.setValueAtTime(0.3, actx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(actx.destination);
      osc.start();
      osc.stop(actx.currentTime + 0.12);
    } catch (e) {}
  }

  function playDing() {
    try {
      const actx = getAudioContext();
      const chords = [523.25, 659.25, 783.99]; // Do mayor
      chords.forEach(freq => {
        const osc = actx.createOscillator();
        const gain = actx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, actx.currentTime);
        gain.gain.setValueAtTime(0.15, actx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.35);
        osc.connect(gain);
        gain.connect(actx.destination);
        osc.start();
        osc.stop(actx.currentTime + 0.35);
      });
    } catch (e) {}
  }

  // --- MODO PANTALLA COMPLETA ---
  function enterFullscreen() {
    const docEl = document.documentElement;
    const req = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.msRequestFullscreen;
    if (req && !document.fullscreenElement && !document.webkitFullscreenElement) {
      req.call(docEl).then(() => {
        if (screen.orientation && screen.orientation.lock) {
          screen.orientation.lock('landscape').catch(() => {});
        }
      }).catch(() => {});
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      enterFullscreen();
    } else {
      const exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
      if (exit) exit.call(document).catch(() => {});
    }
  }

  function updateFullscreenIcon() {
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    const btn = document.getElementById('btn-fullscreen');
    if (btn) {
      btn.innerHTML = isFs ? '🗗' : '⛶';
      btn.classList.toggle('active', isFs);
      btn.title = isFs ? 'Salir de pantalla completa' : 'Pantalla completa';
    }
  }

  // --- CONTROL DE CÁMARA ---
  async function toggleCamera() {
    if (isScanning) {
      stopCamera();
    } else {
      if (!checkDependencies()) return;
      enterFullscreen();
      await startCamera();
    }
  }

  async function startCamera() {
    try {
      const constraints = {
        video: {
          facingMode: { ideal: currentFacingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      };

      videoStream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = videoStream;
      track = videoStream.getVideoTracks()[0];

      try {
        if (track && track.applyConstraints) {
          await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
        }
      } catch (e) {}

      await new Promise(resolve => {
        video.onloadedmetadata = () => {
          video.play();
          resolve();
        };
      });

      overlay.width = video.videoWidth;
      overlay.height = video.videoHeight;
      procCanvas.width = 640;
      procCanvas.height = Math.round((640 * video.videoHeight) / video.videoWidth);

      document.body.classList.add('camera-active');
      const btn = document.getElementById('btn-start');
      if (btn) {
        btn.innerHTML = '<span>⏹ Detener Cámara</span>';
        btn.style.background = '#dc2626';
      }

      isScanning = true;
      scanStartTime = Date.now();
      targetLockStartTime = null;
      activeTarget = null;
      lostFramesCount = 0;
      requestAnimationFrame(processFrame);
    } catch (err) {
      alert('No se pudo acceder a la cámara: ' + err.message);
    }
  }

  function stopCamera() {
    isScanning = false;
    document.body.classList.remove('camera-active');
    const btn = document.getElementById('btn-start');
    if (btn) {
      btn.innerHTML = '<span>▶ Iniciar Cámara</span>';
      btn.style.background = '#2563eb';
    }
    activeTarget = null;
    lostFramesCount = 0;
    if (videoStream) {
      videoStream.getTracks().forEach(t => t.stop());
      videoStream = null;
    }
    if (ctx && overlay) {
      ctx.clearRect(0, 0, overlay.width, overlay.height);
    }
    resetHUD();
  }

  async function switchCamera() {
    currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
    if (isScanning) {
      stopCamera();
      await startCamera();
    }
  }

  async function toggleTorch() {
    if (!track || !track.getCapabilities) return;
    const capabilities = track.getCapabilities();
    if (!capabilities.torch) {
      alert('La linterna no está disponible en esta cámara');
      return;
    }
    torchActive = !torchActive;
    await track.applyConstraints({ advanced: [{ torch: torchActive }] });
    document.getElementById('btn-torch').classList.toggle('active', torchActive);
  }

  // --- ESTIMACIÓN DE NITIDEZ ---
  function calculateSharpness(imgData) {
    const data = imgData.data;
    const width = imgData.width;
    const height = imgData.height;
    let totalGradient = 0;
    let sampleCount = 0;

    for (let y = 1; y < height - 1; y += 4) {
      for (let x = 1; x < width - 1; x += 4) {
        const idx = (y * width + x) * 4;
        const lumCenter = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        const lumRight = (data[idx + 4] + data[idx + 5] + data[idx + 6]) / 3;
        const lumDown = (data[((y + 1) * width + x) * 4] + data[((y + 1) * width + x) * 4 + 1]) / 2;

        const dx = Math.abs(lumCenter - lumRight);
        const dy = Math.abs(lumCenter - lumDown);
        totalGradient += (dx + dy);
        sampleCount++;
      }
    }

    const avgGradient = totalGradient / sampleCount;
    return Math.min(100, Math.round((avgGradient / 15) * 100));
  }

  // --- DETECCIÓN ARUCO DE 4 ESQUINAS (ID 0: TL, ID 1: TR, ID 2: BR, ID 3: BL) ---
  function detectArucoQuad(imgData) {
    if (!arucoDetector) return { found: false };
    let markers = [];
    try {
      markers = arucoDetector.detect(imgData);
    } catch (err) {
      return { found: false };
    }

    if (!markers || markers.length === 0) return { found: false, count: 0 };

    const markerList = markers.map(m => {
      let cx = 0, cy = 0;
      for (let i = 0; i < 4; i++) {
        cx += m.corners[i].x;
        cy += m.corners[i].y;
      }
      return { id: m.id, cx: cx / 4, cy: cy / 4 };
    });

    const m0s = markerList.filter(m => m.id === 0);
    const m1s = markerList.filter(m => m.id === 1);
    const m2s = markerList.filter(m => m.id === 2);
    const m3s = markerList.filter(m => m.id === 3);

    if (m0s.length === 0 || m1s.length === 0 || m2s.length === 0 || m3s.length === 0) {
      return { found: false, count: markerList.length, detectedIds: markerList.map(m => m.id) };
    }

    if (m0s.length === 1 && m1s.length === 1 && m2s.length === 1 && m3s.length === 1) {
      return {
        found: true,
        quad: {
          pTL: { x: m0s[0].cx, y: m0s[0].cy },
          pTR: { x: m1s[0].cx, y: m1s[0].cy },
          pBR: { x: m2s[0].cx, y: m2s[0].cy },
          pBL: { x: m3s[0].cx, y: m3s[0].cy }
        }
      };
    }

    // Si hay múltiples cuartetos (hoja A4 con 2 A5): elegir cuarteto con mayor área coherente
    let bestQuad = null;
    let maxArea = 0;
    for (const m0 of m0s) {
      for (const m1 of m1s) {
        for (const m3 of m3s) {
          for (const m2 of m2s) {
            const area = 0.5 * Math.abs(
              m0.cx * (m1.cy - m3.cy) +
              m1.cx * (m2.cy - m0.cy) +
              m2.cx * (m3.cy - m1.cy) +
              m3.cx * (m0.cy - m2.cy)
            );
            if (area > maxArea) {
              maxArea = area;
              bestQuad = {
                pTL: { x: m0.cx, y: m0.cy },
                pTR: { x: m1.cx, y: m1.cy },
                pBR: { x: m2.cx, y: m2.cy },
                pBL: { x: m3.cx, y: m3.cy }
              };
            }
          }
        }
      }
    }

    if (bestQuad && maxArea > 300) {
      return { found: true, quad: bestQuad };
    }

    return { found: false, count: markerList.length };
  }

  // --- RECTÁNGULO CASI PERFECTO (PARALELISMO) ---
  function checkRectanglePerfection(quad) {
    const topW = Math.hypot(quad.pTR.x - quad.pTL.x, quad.pTR.y - quad.pTL.y);
    const botW = Math.hypot(quad.pBR.x - quad.pBL.x, quad.pBR.y - quad.pBL.y);
    const leftH = Math.hypot(quad.pBL.x - quad.pTL.x, quad.pBL.y - quad.pTL.y);
    const rightH = Math.hypot(quad.pBR.x - quad.pTR.x, quad.pBR.y - quad.pTR.y);

    const widthRatio = Math.min(topW, botW) / Math.max(topW, botW);
    const heightRatio = Math.min(leftH, rightH) / Math.max(leftH, rightH);
    const isAlmostPerfect = widthRatio >= 0.82 && heightRatio >= 0.82;

    return { isAlmostPerfect, widthRatio, heightRatio };
  }

  // --- SENSOR DE ESQUINAS DENTRO DEL ENCUADRE ---
  function checkCornersInFrame(quad, width, height, margin = 8) {
    const corners = [quad.pTL, quad.pTR, quad.pBR, quad.pBL];
    for (const c of corners) {
      if (c.x < margin || c.x > width - margin || c.y < margin || c.y > height - margin) {
        return { isFullyInside: false };
      }
    }
    return { isFullyInside: true };
  }

  function getQuadArea(pTL, pTR, pBR, pBL) {
    const x = [pTL.x, pTR.x, pBR.x, pBL.x];
    const y = [pTL.y, pTR.y, pBR.y, pBL.y];
    let area = 0;
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      area += x[i] * y[j] - x[j] * y[i];
    }
    return Math.abs(area) / 2;
  }

  // --- EXPANSIÓN VECTORIAL (2% EXTERIOR) PARA ENGLOBAR LA FICHA ENTERA ---
  function getExpandedSheetQuad(quad, marginX = 0.020, marginY = 0.025) {
    const vTopX = quad.pTR.x - quad.pTL.x;
    const vTopY = quad.pTR.y - quad.pTL.y;
    const vBotX = quad.pBR.x - quad.pBL.x;
    const vBotY = quad.pBR.y - quad.pBL.y;
    const vLeftX = quad.pBL.x - quad.pTL.x;
    const vLeftY = quad.pBL.y - quad.pTL.y;
    const vRightX = quad.pBR.x - quad.pTR.x;
    const vRightY = quad.pBR.y - quad.pTR.y;

    return {
      pTL: {
        x: quad.pTL.x - marginX * vTopX - marginY * vLeftX,
        y: quad.pTL.y - marginX * vTopY - marginY * vLeftY
      },
      pTR: {
        x: quad.pTR.x + marginX * vTopX - marginY * vRightX,
        y: quad.pTR.y + marginX * vTopY - marginY * vRightY
      },
      pBR: {
        x: quad.pBR.x + marginX * vBotX + marginY * vRightX,
        y: quad.pBR.y + marginX * vBotY + marginY * vRightY
      },
      pBL: {
        x: quad.pBL.x - marginX * vBotX + marginY * vLeftX,
        y: quad.pBL.y - marginX * vBotY + marginY * vLeftY
      }
    };
  }

  // --- PERSPECTIVE WARP (Rectificación Plana en Alta Resolución) ---
  function renderPerspectiveWarp(sourceCanvas, quad, destWidth, destHeight) {
    const destCanvas = document.createElement('canvas');
    destCanvas.width = destWidth;
    destCanvas.height = destHeight;
    const dCtx = destCanvas.getContext('2d');

    const subdivisions = 8;
    for (let i = 0; i < subdivisions; i++) {
      for (let j = 0; j < subdivisions; j++) {
        const u0 = i / subdivisions;
        const v0 = j / subdivisions;
        const u1 = (i + 1) / subdivisions;
        const v1 = (j + 1) / subdivisions;

        const dx0 = u0 * destWidth;
        const dy0 = v0 * destHeight;
        const dx1 = u1 * destWidth;
        const dy1 = v1 * destHeight;

        function interp(u, v) {
          const topX = quad.pTL.x + u * (quad.pTR.x - quad.pTL.x);
          const topY = quad.pTL.y + u * (quad.pTR.y - quad.pTL.y);
          const botX = quad.pBL.x + u * (quad.pBR.x - quad.pBL.x);
          const botY = quad.pBL.y + u * (quad.pBR.y - quad.pBL.y);
          return {
            x: topX + v * (botX - topX),
            y: topY + v * (botY - topY)
          };
        }

        const p00 = interp(u0, v0);
        const p10 = interp(u1, v0);
        const p11 = interp(u1, v1);
        const p01 = interp(u0, v1);

        drawTriangleAffine(dCtx, sourceCanvas, p00, p10, p01, { x: dx0, y: dy0 }, { x: dx1, y: dy0 }, { x: dx0, y: dy1 });
        drawTriangleAffine(dCtx, sourceCanvas, p10, p11, p01, { x: dx1, y: dy0 }, { x: dx1, y: dy1 }, { x: dx0, y: dy1 });
      }
    }
    return destCanvas;
  }

  function drawTriangleAffine(destCtx, srcImg, s0, s1, s2, d0, d1, d2) {
    const x0 = s0.x, y0 = s0.y;
    const x1 = s1.x, y1 = s1.y;
    const x2 = s2.x, y2 = s2.y;

    const det = x0 * (y1 - y2) + x1 * (y2 - y0) + x2 * (y0 - y1);
    if (Math.abs(det) < 1e-6) return;

    const u0 = d0.x, u1 = d1.x, u2 = d2.x;
    const v0 = d0.y, v1 = d1.y, v2 = d2.y;

    const a = (u0 * (y1 - y2) + u1 * (y2 - y0) + u2 * (y0 - y1)) / det;
    const c = (u0 * (x2 - x1) + u1 * (x0 - x2) + u2 * (x1 - x0)) / det;
    const e = (u0 * (x1 * y2 - x2 * y1) + u1 * (x2 * y0 - x0 * y2) + u2 * (x0 * y1 - x1 * y0)) / det;

    const b = (v0 * (y1 - y2) + v1 * (y2 - y0) + v2 * (y0 - y1)) / det;
    const d = (v0 * (x2 - x1) + v1 * (x0 - x2) + v2 * (x1 - x0)) / det;
    const f = (v0 * (x1 * y2 - x2 * y1) + v1 * (x2 * y0 - x0 * y2) + v2 * (x0 * y1 - x1 * y0)) / det;

    destCtx.save();
    destCtx.beginPath();
    destCtx.moveTo(d0.x, d0.y);
    destCtx.lineTo(d1.x, d1.y);
    destCtx.lineTo(d2.x, d2.y);
    destCtx.closePath();
    destCtx.clip();

    destCtx.transform(a, b, c, d, e, f);
    destCtx.drawImage(srcImg, 0, 0);
    destCtx.restore();
  }

  // --- CICLO DE PROCESAMIENTO EN TIEMPO REAL ---
  let isProcessing = false;

  async function processFrame() {
    if (!isScanning) return;

    if (video.readyState === video.HAVE_ENOUGH_DATA && !isProcessing) {
      isProcessing = true;
      try {
        procCtx.drawImage(video, 0, 0, procCanvas.width, procCanvas.height);
        const imgData = procCtx.getImageData(0, 0, procCanvas.width, procCanvas.height);

        const sharpness = calculateSharpness(imgData);
        updateSharpnessUI(sharpness);

        ctx.clearRect(0, 0, overlay.width, overlay.height);

        const sx = overlay.width / procCanvas.width;
        const sy = overlay.height / procCanvas.height;
        const arucoResult = detectArucoQuad(imgData);

        let rawQuad = null;
        if (arucoResult.found) {
          rawQuad = {
            pTL: { x: arucoResult.quad.pTL.x * sx, y: arucoResult.quad.pTL.y * sy },
            pTR: { x: arucoResult.quad.pTR.x * sx, y: arucoResult.quad.pTR.y * sy },
            pBR: { x: arucoResult.quad.pBR.x * sx, y: arucoResult.quad.pBR.y * sy },
            pBL: { x: arucoResult.quad.pBL.x * sx, y: arucoResult.quad.pBL.y * sy }
          };
        }

        if (rawQuad) {
          if (!activeTarget) {
            activeTarget = { quad: rawQuad };
          } else {
            const alpha = 0.88;
            activeTarget.quad = {
              pTL: { x: activeTarget.quad.pTL.x * (1 - alpha) + rawQuad.pTL.x * alpha, y: activeTarget.quad.pTL.y * (1 - alpha) + rawQuad.pTL.y * alpha },
              pTR: { x: activeTarget.quad.pTR.x * (1 - alpha) + rawQuad.pTR.x * alpha, y: activeTarget.quad.pTR.y * (1 - alpha) + rawQuad.pTR.y * alpha },
              pBR: { x: activeTarget.quad.pBR.x * (1 - alpha) + rawQuad.pBR.x * alpha, y: activeTarget.quad.pBR.y * (1 - alpha) + rawQuad.pBR.y * alpha },
              pBL: { x: activeTarget.quad.pBL.x * (1 - alpha) + rawQuad.pBL.x * alpha, y: activeTarget.quad.pBL.y * (1 - alpha) + rawQuad.pBL.y * alpha }
            };
          }
          lostFramesCount = 0;

          const quadArea = getQuadArea(activeTarget.quad.pTL, activeTarget.quad.pTR, activeTarget.quad.pBR, activeTarget.quad.pBL);
          const screenArea = overlay.width * overlay.height;
          const coverage = Math.min(100, Math.round((quadArea / screenArea) * 100));

          const rectCheck = checkRectanglePerfection(activeTarget.quad);
          const expandedSheet = getExpandedSheetQuad(activeTarget.quad);
          const cornerCheck = checkCornersInFrame(activeTarget.quad, overlay.width, overlay.height, 8);

          drawDynamicQuadrilateral(activeTarget.quad, coverage, cornerCheck, rectCheck);
          handleValidTarget(sharpness, expandedSheet, coverage, cornerCheck, rectCheck);

        } else if (activeTarget && lostFramesCount < MAX_LOST_FRAMES) {
          lostFramesCount++;
          const quadArea = getQuadArea(activeTarget.quad.pTL, activeTarget.quad.pTR, activeTarget.quad.pBR, activeTarget.quad.pBL);
          const screenArea = overlay.width * overlay.height;
          const coverage = Math.min(100, Math.round((quadArea / screenArea) * 100));
          const cornerCheck = checkCornersInFrame(activeTarget.quad, overlay.width, overlay.height, 8);
          const rectCheck = checkRectanglePerfection(activeTarget.quad);

          drawDynamicQuadrilateral(activeTarget.quad, coverage, cornerCheck, rectCheck);
          updateCoverageUI(coverage);
        } else {
          activeTarget = null;
          targetLockStartTime = null;
          handleLostTarget();
        }
      } finally {
        isProcessing = false;
      }
    }

    if (isScanning) {
      requestAnimationFrame(processFrame);
    }
  }

  // --- DIBUJO DEL CUADRILÁTERO GUÍA (AR) ---
  function drawDynamicQuadrilateral(quad, coverage, cornerCheck, rectCheck) {
    const isFullyInside = cornerCheck ? cornerCheck.isFullyInside : true;
    const isAlmostPerfect = rectCheck ? rectCheck.isAlmostPerfect : true;
    const isOptimalDistance = coverage >= COVERAGE_THRESHOLD;
    const sheetQuad = getExpandedSheetQuad(quad);

    let color = '#22c55e';
    let fillColor = 'rgba(34, 197, 94, 0.22)';
    let labelText = `✓ ¡Encuadre Óptimo! (${coverage}%)`;

    if (!isFullyInside) {
      color = '#ef4444';
      fillColor = 'rgba(239, 68, 68, 0.20)';
      labelText = '⚠️ Centra la hoja: esquinas al borde';
    } else if (!isOptimalDistance) {
      color = '#f59e0b';
      fillColor = 'rgba(245, 158, 11, 0.20)';
      labelText = `🔍 Acerca más la cámara (${coverage}% / ${COVERAGE_THRESHOLD}%)`;
    } else if (!isAlmostPerfect) {
      color = '#f59e0b';
      fillColor = 'rgba(245, 158, 11, 0.20)';
      labelText = '📐 Ponte más paralelo a la hoja';
    }

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(sheetQuad.pTL.x, sheetQuad.pTL.y);
    ctx.lineTo(sheetQuad.pTR.x, sheetQuad.pTR.y);
    ctx.lineTo(sheetQuad.pBR.x, sheetQuad.pBR.y);
    ctx.lineTo(sheetQuad.pBL.x, sheetQuad.pBL.y);
    ctx.closePath();

    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.restore();

    // Marcadores circulares en centros ArUco
    [quad.pTL, quad.pTR, quad.pBR, quad.pBL].forEach(pt => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 9, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
    });

    // Píldora de texto guía flotante
    const centerX = (quad.pTL.x + quad.pTR.x + quad.pBR.x + quad.pBL.x) / 4;
    const minY = Math.min(quad.pTL.y, quad.pTR.y);
    const pillY = Math.max(30, minY - 24);

    ctx.save();
    ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const textMetrics = ctx.measureText(labelText);
    const pillW = textMetrics.width + 28;
    const pillH = 32;
    const pillX = centerX - pillW / 2;

    ctx.fillStyle = (!isFullyInside) ? 'rgba(185, 28, 28, 0.95)' : ((!isOptimalDistance || !isAlmostPerfect) ? 'rgba(180, 83, 9, 0.95)' : 'rgba(21, 128, 61, 0.95)');
    ctx.beginPath();
    ctx.roundRect(pillX, pillY - pillH / 2, pillW, pillH, 16);
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelText, centerX, pillY);
    ctx.restore();
  }

  function flashCaptureEffect() {
    const flash = document.createElement('div');
    flash.style.position = 'fixed';
    flash.style.inset = '0';
    flash.style.backgroundColor = 'rgba(255, 255, 255, 0.75)';
    flash.style.zIndex = '999';
    flash.style.pointerEvents = 'none';
    flash.style.transition = 'opacity 0.25s ease-out';
    document.body.appendChild(flash);
    requestAnimationFrame(() => {
      flash.style.opacity = '0';
      setTimeout(() => flash.remove(), 250);
    });
  }

  // --- CONTROL DE ESTABILIDAD Y AUTO-DISPARO ---
  function handleValidTarget(sharpness, sheetQuad, coverage, cornerCheck, rectCheck) {
    const badge = document.getElementById('status-badge');
    const statusText = document.getElementById('status-text');
    const statusDot = document.getElementById('status-dot');

    if (badge) badge.style.display = 'flex';
    updateCoverageUI(coverage);

    // REGLA 1: Esquinas dentro
    if (!cornerCheck.isFullyInside) {
      stableFrameCount = 0;
      updateStabilityUI(0);
      badge.classList.remove('locked');
      badge.style.background = 'rgba(153, 27, 27, 0.92)';
      statusDot.style.background = '#ef4444';
      statusDot.style.boxShadow = '0 0 10px #ef4444';
      statusText.textContent = '⚠️ Centra la hoja: las 4 esquinas deben verse';
      return;
    }

    // REGLA 2: Cobertura mínima (>= 45%)
    if (coverage < COVERAGE_THRESHOLD) {
      stableFrameCount = 0;
      updateStabilityUI(0);
      badge.classList.remove('locked');
      badge.style.background = 'rgba(180, 83, 9, 0.92)';
      statusDot.style.background = '#f59e0b';
      statusDot.style.boxShadow = '0 0 10px #f59e0b';
      statusText.textContent = `Acércate más a la hoja (${coverage}% / ${COVERAGE_THRESHOLD}%)...`;
      return;
    }

    // REGLA 3: Paralelismo
    if (rectCheck && !rectCheck.isAlmostPerfect) {
      stableFrameCount = 0;
      updateStabilityUI(0);
      badge.classList.remove('locked');
      badge.style.background = 'rgba(180, 83, 9, 0.92)';
      statusDot.style.background = '#f59e0b';
      statusDot.style.boxShadow = '0 0 10px #f59e0b';
      statusText.textContent = '📐 Ponte más paralelo a la hoja (inclinada)';
      return;
    }

    badge.style.background = '';
    statusDot.style.background = '';
    statusDot.style.boxShadow = '';

    // REGLA 4: Nitidez (>= 55%) y 3 cuadros consecutivos de quietud
    if (sharpness < SHARPNESS_THRESHOLD) {
      stableFrameCount = Math.max(0, stableFrameCount - 1);
      updateStabilityUI(Math.round((stableFrameCount / REQUIRED_STABLE_FRAMES) * 100));
      badge.classList.remove('locked');
      statusText.textContent = `Enfocando nitidez (${sharpness}% / ${SHARPNESS_THRESHOLD}%)...`;
      return;
    }

    if (!targetLockStartTime) {
      targetLockStartTime = Date.now();
    }

    stableFrameCount++;
    const stabilityPercent = Math.min(100, Math.round((stableFrameCount / REQUIRED_STABLE_FRAMES) * 100));
    updateStabilityUI(stabilityPercent);

    if (stableFrameCount >= REQUIRED_STABLE_FRAMES) {
      badge.classList.add('locked');
      statusText.textContent = `✓ ¡Ficha Capturada! (${coverage}% cobertura, ${sharpness}% nitidez)`;
      triggerAutoCapture(sharpness, sheetQuad);
    } else {
      badge.classList.add('locked');
      statusText.textContent = `✓ Encuadre óptimo. Mantén quieto (${stableFrameCount}/${REQUIRED_STABLE_FRAMES})...`;
    }
  }

  function handleLostTarget() {
    stableFrameCount = 0;
    targetLockStartTime = null;
    updateStabilityUI(0);
    updateCoverageUI(0);
    resetHUD();
  }

  function resetHUD() {
    const hud = document.getElementById('hud-guide');
    const badge = document.getElementById('status-badge');
    const statusText = document.getElementById('status-text');
    if (hud) hud.classList.remove('tracking', 'locked');
    if (badge) {
      badge.classList.remove('locked');
      badge.style.display = 'none';
    }
    if (statusText) statusText.textContent = '';
  }

  // --- DISPARO AUTOMÁTICO Y EXTRACCIÓN DE ROIs ---
  async function triggerAutoCapture(sharpness, sheetQuad, directDataUrl = null, qrData = null) {
    // GUARDRAIL 2: Cooldown anti-duplicados
    const now = Date.now();
    if (now - lastCaptureTime < CAPTURE_COOLDOWN_MS) return;
    lastCaptureTime = now;

    // GUARDRAIL 6: Pausar inmediatamente el bucle
    isScanning = false;
    playBeep();
    if (navigator.vibrate) navigator.vibrate([70]);
    flashCaptureEffect();

    let fullWarpCanvas = null;
    let resolutionPreviewUrl = null;
    let qrText = qrData;

    try {
      if (sheetQuad) {
        // Perspective Warp a resolución estándar (1400 x 953 px)
        fullWarpCanvas = renderPerspectiveWarp(video, sheetQuad, 1400, 953);
      } else if (directDataUrl) {
        // Modo fallback con imagen precargada
        const img = new Image();
        await new Promise((res, rej) => {
          img.onload = res;
          img.onerror = rej;
          img.src = directDataUrl;
        });
        fullWarpCanvas = document.createElement('canvas');
        fullWarpCanvas.width = img.width;
        fullWarpCanvas.height = img.height;
        fullWarpCanvas.getContext('2d').drawImage(img, 0, 0);
      }

      // GUARDRAIL 4: LECTURA DEL QR CON TOLERANCIA A FALLOS
      if (!qrText && fullWarpCanvas) {
        // Intento 1: BarcodeDetector nativo sobre lienzo completo
        if (nativeBarcodeDetector) {
          try {
            const barcodes = await nativeBarcodeDetector.detect(fullWarpCanvas);
            if (barcodes && barcodes.length > 0) qrText = barcodes[0].rawValue;
          } catch (e) {}
        }

        // Intento 2: jsQR sobre lienzo completo
        if (!qrText && typeof jsQR !== 'undefined') {
          try {
            const wCtx = fullWarpCanvas.getContext('2d');
            const wData = wCtx.getImageData(0, 0, fullWarpCanvas.width, fullWarpCanvas.height);
            const qr = jsQR(wData.data, wData.width, wData.height, { inversionAttempts: 'dontInvert' });
            if (qr) qrText = qr.data;
          } catch (e) {}
        }

        // Intento 3 (Respaldo): Extraer ROI de QR específica y aplicar contraste si no se leyó
        if (!qrText && typeof ROIProcessor !== 'undefined') {
          const qrRoi = ROIProcessor.extractROI(fullWarpCanvas, ROIProcessor.CONFIG.QR);
          if (qrRoi.success && typeof jsQR !== 'undefined') {
            ROIProcessor.enhanceHandwritingContrast(qrRoi.canvas, { blackCutoff: 100, whiteCutoff: 160 });
            const qrDataImg = qrRoi.canvas.getContext('2d').getImageData(0, 0, qrRoi.canvas.width, qrRoi.canvas.height);
            const qrRetry = jsQR(qrDataImg.data, qrDataImg.width, qrDataImg.height, { inversionAttempts: 'attemptBoth' });
            if (qrRetry) qrText = qrRetry.data;
          }
        }
      }

      // GUARDRAIL 3 & 5: EXTRACCIÓN DE ROI DE RESOLUCIÓN + CONTRASTE DE GRAFITO
      if (fullWarpCanvas && typeof ROIProcessor !== 'undefined') {
        const procResult = ROIProcessor.processCapturedSheet(fullWarpCanvas);
        if (procResult.success && procResult.resolutionCanvas) {
          resolutionPreviewUrl = procResult.resolutionCanvas.toDataURL('image/jpeg', 0.92);
        }
      }

      // Si no se pudo recortar la ROI, usar la hoja completa como respaldo seguro
      if (!resolutionPreviewUrl && fullWarpCanvas) {
        resolutionPreviewUrl = fullWarpCanvas.toDataURL('image/jpeg', 0.90);
      }

    } catch (err) {
      console.error('[Scanner] Error en triggerAutoCapture:', err);
    }

    // Decodificación del alumno desde el payload QR
    let studentId = 'PENDIENTE';
    let studentName = 'ALUMNO REGISTRADO';
    let expectedAns = '--';
    let qrSuccess = false;

    if (qrText && qrText.startsWith('MATEVAL')) {
      qrSuccess = true;
      const parts = qrText.split('|');
      if (parts.length >= 2) studentId = parts[1];
      if (parts.length >= 4) expectedAns = parts[2];
      if (parts.length >= 7) expectedAns = parts[5];
      if (parts.length >= 1) studentName = (parts[parts.length - 1] || studentName).replace(/_/g, ' ');
    } else if (qrText) {
      studentName = 'ALUMNO (' + qrText.slice(0, 15) + ')';
    } else {
      // Guardrail 4: Aviso amable de QR no identificado (sin romper el flujo)
      studentName = '⚠️ QR NO LEÍDO (ALUMNO PENDIENTE)';
      studentId = 'MANUAL';
    }

    // Presentar modal con la captura procesada
    setTimeout(() => {
      const imgEl = document.getElementById('captured-img');
      if (imgEl && resolutionPreviewUrl) imgEl.src = resolutionPreviewUrl;

      const nameEl = document.getElementById('res-student-name');
      if (nameEl) {
        nameEl.textContent = studentName.toUpperCase();
        nameEl.style.color = qrSuccess ? '#f8fafc' : '#f59e0b';
      }

      const idEl = document.getElementById('res-student-id');
      if (idEl) idEl.textContent = 'ID: ' + studentId;

      const testEl = document.getElementById('res-test-id');
      if (testEl) testEl.textContent = 'Resultado Esperado: ' + expectedAns;

      const sharpEl = document.getElementById('res-sharpness');
      if (sharpEl) sharpEl.textContent = sharpness + '%';

      const focusDuration = targetLockStartTime ? ((Date.now() - targetLockStartTime) / 1000).toFixed(2) : '0.20';
      const timeEl = document.getElementById('res-time');
      if (timeEl) timeEl.textContent = focusDuration + ' s';

      const modal = document.getElementById('capture-modal');
      if (modal) modal.classList.add('open');
      playDing();
    }, 150);
  }

  // --- ACTUALIZACIÓN DE MEDIDORES EN TIEMPO REAL ---
  function updateCoverageUI(val) {
    const txt = document.getElementById('val-coverage');
    if (txt) txt.textContent = val + '%';
    const bar = document.getElementById('bar-coverage');
    if (bar) {
      bar.style.width = Math.min(100, Math.round((val / COVERAGE_THRESHOLD) * 100)) + '%';
      bar.style.background = val >= COVERAGE_THRESHOLD ? '#22c55e' : (val >= 25 ? '#f59e0b' : '#ef4444');
    }
  }

  function updateSharpnessUI(val) {
    const txt = document.getElementById('val-sharpness');
    if (txt) txt.textContent = val + '%';
    const bar = document.getElementById('bar-sharpness');
    if (bar) {
      bar.style.width = Math.min(100, Math.round((val / SHARPNESS_THRESHOLD) * 100)) + '%';
      bar.style.background = val >= SHARPNESS_THRESHOLD ? '#22c55e' : (val >= 35 ? '#f59e0b' : '#ef4444');
    }
  }

  function updateStabilityUI(val) {
    const txt = document.getElementById('val-stability');
    if (txt) txt.textContent = val + '%';
    const bar = document.getElementById('bar-stability');
    if (bar) {
      bar.style.width = val + '%';
      bar.style.background = val === 100 ? '#22c55e' : '#3b82f6';
    }
  }

  // --- GUARDRAIL 6: LIMPIEZA DE ESTADO Y MEMORIA AL ESCANEAR SIGUIENTE ---
  function nextScan() {
    closeModal();
    // Liberar imagen anterior del modal
    const imgEl = document.getElementById('captured-img');
    if (imgEl) imgEl.src = '';

    isScanning = true;
    scanStartTime = Date.now();
    targetLockStartTime = null;
    stableFrameCount = 0;
    activeTarget = null;
    resetHUD();
    requestAnimationFrame(processFrame);
  }

  function closeModal() {
    const modal = document.getElementById('capture-modal');
    if (modal) modal.classList.remove('open');
    if (!isScanning && videoStream) {
      isScanning = true;
      requestAnimationFrame(processFrame);
    }
  }

  // Inicialización del DOM
  document.addEventListener('DOMContentLoaded', () => {
    video = document.getElementById('video-feed');
    overlay = document.getElementById('overlay-canvas');
    if (overlay) ctx = overlay.getContext('2d');

    document.addEventListener('fullscreenchange', updateFullscreenIcon);
    document.addEventListener('webkitfullscreenchange', updateFullscreenIcon);

    // Verificar dependencias e inicializar ArUco
    checkDependencies();
    initArUco();
  });

  // Exportar funciones para interacción con la interfaz HTML
  global.Scanner = {
    toggleCamera,
    switchCamera,
    toggleTorch,
    toggleFullscreen,
    nextScan,
    closeModal
  };

  // Bindings directos para eventos onclick en HTML
  global.toggleCamera = toggleCamera;
  global.switchCamera = switchCamera;
  global.toggleTorch = toggleTorch;
  global.toggleFullscreen = toggleFullscreen;
  global.nextScan = nextScan;
  global.closeModal = closeModal;

})(typeof window !== 'undefined' ? window : this);
