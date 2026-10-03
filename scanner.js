/**
 * Módulo de Aplicación: Scanner de Aula A5
 * Microevaluación Formativa de Clase v2.5.0
 * 
 * Funcionalidad:
 * - Ciclo de tracking de visión en tiempo real (Marcadores ArUco 0, 1, 2, 3)
 * - Cuadrilátero elástico de guía interactiva
 * - Verificación de nitidez (20%), paralelismo y cobertura (45%)
 * - Auto-disparo inteligente con retroalimentación audiovisual y háptica
 * - Corrección de perspectiva a resolución fija (2000 x 1441 px = 10.75 px/mm)
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

  // --- DIAGNÓSTICO ---
  // Rastro de lo último que pasó. En el celular no hay consola que mirar, así que
  // sin esto, cuando algo falla en plena clase no queda ninguna forma de saber
  // qué pasó: el botón de diagnóstico del portal lee de acá.
  let ultimaCaptura = null;
  const erroresRecientes = [];

  /** Anota un problema con su hora, para el informe de diagnóstico. */
  function anotarError(mensaje) {
    erroresRecientes.push(new Date().toLocaleTimeString() + ' — ' + mensaje);
    if (erroresRecientes.length > 20) erroresRecientes.shift();
  }

  /** Lo que sabe el escáner, para el informe de diagnóstico. */
  function diagnostico() {
    return {
      ultimaCaptura: ultimaCaptura,
      errores: erroresRecientes.slice(),
      escaneando: isScanning,
      camaraEncendida: document.body.classList.contains('camera-active'),
      detectorNativoQR: !!nativeBarcodeDetector
    };
  }

  // Canvas de procesamiento en memoria
  const procCanvas = document.createElement('canvas');
  const procCtx = procCanvas.getContext('2d', { willReadFrequently: true });

  let arucoDetector = null;
  let stableFrameCount = 0;
  const REQUIRED_STABLE_FRAMES = 3;   // ~150-200ms de quietud absoluta
  const COVERAGE_THRESHOLD = 45;       // Cobertura mínima de pantalla
  const SHARPNESS_THRESHOLD = 20;      // Umbral calibrado de nitidez (20%)
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
    if (typeof ClassroomData === 'undefined') missing.push('classroom-data.js (Nóminas del Aula)');
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

  // --- GESTIÓN DE SESIÓN Y NÓMINA DEL AULA ---
  let currentClassroomId = '3A';
  let currentEvaluationId = 'EVA_01';
  let evaluatedStudentIds = new Set();

  function setSession(classId, evalId) {
    currentClassroomId = classId || '3A';
    currentEvaluationId = evalId || 'EVA_01';
    evaluatedStudentIds.clear();
    // Ocultar banner de sesión completa si venía de una sesión anterior
    const g8Banner = document.getElementById('g8-session-complete-banner');
    if (g8Banner) g8Banner.style.display = 'none';
    updateSessionCounter();
  }

  function onClassroomChanged(classId) {
    currentClassroomId = classId;
    evaluatedStudentIds.clear();
    updateSessionCounter();
  }

  function onEvaluationChanged(evalId) {
    currentEvaluationId = evalId;
    updateSessionCounter();
  }

  function updateSessionCounter() {
    const cls = typeof ClassroomData !== 'undefined' ? ClassroomData.getClassroom(currentClassroomId) : null;
    // Sin salón cargado el total es 0, no un 10 inventado: antes el contador
    // mostraba "0 / 10" sin haber ningún salón elegido. Con 0, el guardrail 8
    // (sesión completa) queda desactivado por su propia condición `total > 0`.
    const total = cls ? cls.students.length : 0;
    const evaluated = evaluatedStudentIds.size;
    const texto = `${evaluated} / ${total} evaluados`;

    const counterEl = document.getElementById('session-counter');
    if (counterEl) {
      counterEl.textContent = texto;
      // Colorear el contador con el color del salón activo
      if (typeof ClassroomData !== 'undefined' && ClassroomData.getClassroomColor) {
        counterEl.style.color = ClassroomData.getClassroomColor(currentClassroomId);
      }
    }

    // El mismo contador dentro del modal de captura.
    // Hace falta porque durante el escaneo la barra de sesión está oculta (modo
    // inmersivo): al revisar cada ficha, este es el único lugar donde el
    // docente ve cuántos van y cuántos faltan.
    const modalCounter = document.getElementById('modal-counter');
    if (modalCounter) modalCounter.textContent = texto;

    // GUARDRAIL 8: Detectar sesión completa y pausar cámara
    const g8Banner = document.getElementById('g8-session-complete-banner');
    if (g8Banner && evaluated >= total && total > 0) {
      g8Banner.style.display = 'flex';
      const titleEl = document.getElementById('g8-complete-title');
      if (titleEl) titleEl.textContent = `🎉 ¡Sesión completa! ${cls ? cls.name : ''} — ${evaluated}/${total} alumnos`;
      // Pausar el bucle de escaneo
      isScanning = false;
    }

    // Actualizar el panel de nómina en tiempo real
    renderRosterPanel();
  }

  function renderRosterPanel() {
    const listEl = document.getElementById('roster-list');
    const labelEl = document.getElementById('roster-toggle-label');
    if (!listEl) return;

    const cls = typeof ClassroomData !== 'undefined' ? ClassroomData.getClassroom(currentClassroomId) : null;
    if (!cls) return;

    const color = typeof ClassroomData !== 'undefined' && ClassroomData.getClassroomColor
      ? ClassroomData.getClassroomColor(currentClassroomId)
      : '#3b82f6';

    const total = cls.students.length;
    const pendingCount = total - evaluatedStudentIds.size;

    // Actualizar label del toggle
    if (labelEl) {
      if (pendingCount === 0) {
        labelEl.textContent = `✅ Nómina completa — todos escaneados`;
        labelEl.style.color = '#4ade80';
      } else {
        labelEl.textContent = `📋 Ver nómina — ${pendingCount} pendiente${pendingCount !== 1 ? 's' : ''}`;
        labelEl.style.color = color;
      }
    }

    // Reconstruir la grilla de alumnos
    listEl.innerHTML = '';
    cls.students.forEach(student => {
      const done = evaluatedStudentIds.has(student.id);
      const card = document.createElement('div');
      card.style.cssText = [
        'display:flex', 'align-items:center', 'gap:6px',
        'padding:5px 8px', 'border-radius:7px', 'font-size:0.72rem',
        'border:1px solid ' + (done ? '#1a3a1a' : color + '55'),
        'background:' + (done ? '#0d1f0d' : color + '12'),
        'color:' + (done ? '#4b5563' : '#f1f5f9'),
        'transition:all 0.25s',
      ].join(';');

      const icon = document.createElement('span');
      icon.textContent = done ? '✓' : '⏳';
      icon.style.cssText = 'font-size:0.8rem; min-width:14px; color:' + (done ? '#22c55e' : color);

      const name = document.createElement('span');
      name.textContent = student.shortName;
      name.style.cssText = done
        ? 'text-decoration:line-through; opacity:0.45;'
        : 'font-weight:600;';

      card.appendChild(icon);
      card.appendChild(name);
      listEl.appendChild(card);
    });
  }

  function renderModalPending() {
    const listEl = document.getElementById('modal-pending-list');
    const allDoneEl = document.getElementById('modal-pending-all-done');
    if (!listEl) return;

    const cls = typeof ClassroomData !== 'undefined' ? ClassroomData.getClassroom(currentClassroomId) : null;
    if (!cls) return;

    const color = typeof ClassroomData !== 'undefined' && ClassroomData.getClassroomColor
      ? ClassroomData.getClassroomColor(currentClassroomId)
      : '#3b82f6';

    // Solo los que aún NO fueron escaneados
    const pending = cls.students.filter(s => !evaluatedStudentIds.has(s.id));

    listEl.innerHTML = '';

    if (pending.length === 0) {
      listEl.style.display = 'none';
      if (allDoneEl) allDoneEl.style.display = 'block';
      return;
    }

    if (allDoneEl) allDoneEl.style.display = 'none';
    listEl.style.display = 'flex';

    pending.forEach(student => {
      const chip = document.createElement('span');
      chip.textContent = student.shortName;
      chip.style.cssText = [
        'display:inline-block',
        'padding:3px 8px',
        'border-radius:20px',
        'font-size:0.7rem',
        'font-weight:600',
        'background:' + color + '18',
        'color:' + color,
        'border:1px solid ' + color + '40',
        'white-space:nowrap',
      ].join(';');
      listEl.appendChild(chip);
    });
  }

  function populateManualStudentSelect() {
    const sel = document.getElementById('manual-student-select');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Toca aquí para elegir al alumno --</option>';
    const cls = typeof ClassroomData !== 'undefined' ? ClassroomData.getClassroom(currentClassroomId) : null;
    if (!cls) return;
    cls.students.forEach(s => {
      const isDone = evaluatedStudentIds.has(s.id);
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.id}: ${s.name} ${isDone ? '✓ (Ya evaluado)' : ''}`;
      sel.appendChild(opt);
    });
  }

  function assignManualStudent(studentId) {
    if (!studentId) return;
    const s = typeof ClassroomData !== 'undefined' ? ClassroomData.getStudent(currentClassroomId, studentId) : null;
    if (!s) return;
    evaluatedStudentIds.add(studentId);
    updateSessionCounter();

    const nameEl = document.getElementById('res-student-name');
    if (nameEl) {
      nameEl.textContent = s.name.toUpperCase();
      nameEl.style.color = '#f8fafc';
    }
    const idEl = document.getElementById('res-student-id');
    if (idEl) idEl.textContent = 'ID: ' + s.id;

    const ev = typeof ClassroomData !== 'undefined' ? ClassroomData.getEvaluation(currentEvaluationId) : null;
    const testEl = document.getElementById('res-test-id');
    if (testEl && ev) testEl.textContent = 'Resultado Esperado: ' + ev.expectedAnswer;

    const wrap = document.getElementById('manual-student-wrap');
    if (wrap) wrap.style.display = 'none';

    // El docente acaba de identificar al alumno de esta captura: recién ahora
    // se puede persistir el resultado con su identidad real y su corrección OMR.
    persistCapture(s.id, s.name, lastOMRInfo);
  }

  /**
   * Reemplaza el conjunto de alumnos ya escaneados.
   * Lo usa el portal al restaurar una sesión, para que la nómina y el contador
   * reflejen los resultados que ya están guardados en Supabase en vez de
   * aparecer todos como pendientes después de una recarga.
   * @param {string[]} ids códigos de alumno, ej. ['ALUM_01','ALUM_03']
   */
  function setEvaluatedStudents(ids) {
    evaluatedStudentIds.clear();
    (ids || []).forEach(id => { if (id) evaluatedStudentIds.add(id); });
    updateSessionCounter();
    renderRosterPanel();
    renderModalPending();
  }

  // --- ENTRADA POR FOTO GUARDADA (botón "Probar Foto") ---
  // Procesa una imagen guardada por el MISMO camino que una captura en vivo:
  // se dibuja en el canvas de proceso de 640px, se buscan los 4 marcadores
  // ArUco, se escala el cuadrilátero al tamaño real de la imagen y se dispara
  // la misma captura (QR, ROIs, modal y guardado).
  //
  // Para qué sirve: reproducir una ficha que falló (con la cámara ese momento
  // se pierde y no se puede repetir la misma foto), probar el escáner sin
  // teléfono, y correr un conjunto fijo de fichas para medir la corrección con
  // IA — con la cámara cada corrida tiene otro encuadre y otra luz, así que no
  // se puede comparar un resultado con otro.
  async function handleFile(e) {
    const input = e && e.target;
    const file = input && input.files && input.files[0];

    // Se limpia el input YA MISMO para poder volver a elegir el MISMO archivo.
    // Sin esto el navegador no dispara 'change' la segunda vez y parece que el
    // botón dejó de funcionar.
    if (input) input.value = '';

    if (!file) return;
    if (file.type && !file.type.startsWith('image/')) {
      avisar('⚠️ Ese archivo no es una imagen.');
      return;
    }
    if (!checkDependencies()) return;

    if (!arucoDetector) {
      avisar('⚠️ El detector ArUco no está disponible. Recargá la página.');
      return;
    }

    let objectUrl = null;
    try {
      objectUrl = URL.createObjectURL(file);
      const img = await cargarImagen(objectUrl);

      // Mismo canvas de proceso que usa la cámara: 640px de ancho con la
      // proporción de la imagen.
      procCanvas.width = 640;
      procCanvas.height = Math.max(1, Math.round(640 * img.naturalHeight / img.naturalWidth));
      procCtx.drawImage(img, 0, 0, procCanvas.width, procCanvas.height);
      const imgData = procCtx.getImageData(0, 0, procCanvas.width, procCanvas.height);

      const aruco = detectArucoQuad(imgData);
      if (!aruco.found) {
        const vistos = (typeof aruco.count === 'number') ? aruco.count : 0;
        avisar('⚠️ No se encontraron las 4 esquinas ArUco en la foto' +
          (vistos ? ' (se vieron ' + vistos + ' marcador' + (vistos === 1 ? '' : 'es') + ')' : '') +
          '. Asegurate de que la ficha esté completa, derecha y con buena luz.');
        return;
      }

      // Del canvas de 640px al tamaño real de la imagen
      const sx = img.naturalWidth / procCanvas.width;
      const sy = img.naturalHeight / procCanvas.height;
      const quad = {
        pTL: { x: aruco.quad.pTL.x * sx, y: aruco.quad.pTL.y * sy },
        pTR: { x: aruco.quad.pTR.x * sx, y: aruco.quad.pTR.y * sy },
        pBR: { x: aruco.quad.pBR.x * sx, y: aruco.quad.pBR.y * sy },
        pBL: { x: aruco.quad.pBL.x * sx, y: aruco.quad.pBL.y * sy }
      };

      const sharpness = calculateSharpness(imgData);
      const sheetQuad = getExpandedSheetQuad(quad);

      // El 5º argumento (img) hace que el warp salga de la foto y no del <video>
      await triggerAutoCapture(sharpness, sheetQuad, null, null, img);
    } catch (err) {
      console.error('[Scanner] Error procesando la foto:', err);
      avisar('❌ No se pudo procesar la foto: ' + ((err && err.message) || 'error desconocido'));
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }

  /** Carga una imagen desde una URL y resuelve cuando ya está lista. */
  function cargarImagen(url) {
    return new Promise((resolver, rechazar) => {
      const img = new Image();
      img.onload = () => resolver(img);
      img.onerror = () => rechazar(new Error('la imagen no se pudo abrir'));
      img.src = url;
    });
  }

  /** Avisa al docente: usa el toast del portal si está cargado, si no un alert. */
  function avisar(mensaje) {
    anotarError(mensaje);
    if (typeof showToast === 'function') showToast(mensaje);
    else alert(mensaje);
  }

  // --- PERSISTENCIA DEL RESULTADO EN SUPABASE ---
  // Se guarda la captura AUNQUE todavía no exista corrección con IA: el
  // veredicto se agrega después con un upsert sobre la MISMA fila (la clave es
  // session_ref + student_code). Así, si la IA falla, no hay red o el docente
  // cierra la app, la clase igual quedó registrada y se puede recompletar.
  //
  // No se guardan imágenes: solo el resultado. Las rutas (answer_image_path /
  // grid_image_path) quedan en NULL; activarlas es subir los recortes a
  // Supabase Storage y completar esos dos campos, sin cambiar el esquema.
  //
  let lastOMRInfo = null;

  function persistCapture(studentId, studentName, omrInfo = null) {
    if (typeof SupabaseClient === 'undefined' || !SupabaseClient.saveResult) return;
    if (typeof ClassroomData === 'undefined') return;

    if (!studentId || studentId === 'MANUAL') return;

    let session = ClassroomData.getActiveSession();
    if (!session || !session.sessionRef) {
      const classId = currentClassroomId || '3A';
      const evalId = currentEvaluationId || 'EVA_01';
      session = {
        sessionRef: `${classId}::${evalId}`,
        classroomId: classId,
        evalId: evalId,
        title: 'Evaluación del Día'
      };
    }

    const cls = ClassroomData.getClassroom(currentClassroomId);
    const activeEval = ClassroomData.getEvaluation(currentEvaluationId) || session;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(currentClassroomId);

    let answerRead = null;
    let isMatch = null;
    let verdict = null;
    let aiRaw = null;

    const info = omrInfo || lastOMRInfo;
    if (info && info.results && info.results.length > 0) {
      answerRead = info.results.map(r => `P${r.qIndex}: ${r.marked}`).join(' | ');
      isMatch = info.allCorrect;
      verdict = info.allCorrect ? 'CORRECTA' : 'INCORRECTA';
      aiRaw = { omrResults: info.results };
    }

    SupabaseClient.saveResult({
      session_ref: session.sessionRef,
      classroom_id: isUuid ? currentClassroomId : null,
      student_code: studentId,
      student_name: studentName,
      grade_stage: cls ? cls.gradeStage : null,
      grade_level: cls ? cls.gradeLevel : null,
      evaluation_ref: currentEvaluationId,
      evaluation_title: session.title || null,
      prompt: session.prompt || (activeEval ? activeEval.prompt : null),
      expected_answer: session.expectedAnswer || (activeEval ? activeEval.expectedAnswer : null),
      ai_answer_read: answerRead,
      ai_expected_match: isMatch,
      deterministic_match: isMatch,
      teacher_verdict: verdict,
      ai_raw: aiRaw,
      captured_at: new Date().toISOString()
    }).then(row => {
      if (row) console.log('[Resultados] Captura guardada en Supabase:', studentId, verdict);
    }).catch(e => {
      console.warn('[Resultados] No se pudo guardar la captura:', e && e.message);
    });
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
        // Etiqueta corta: en modo inmersivo el botón comparte la fila con los
        // tres medidores y no entra "Detener Cámara" completo.
        btn.innerHTML = '<span>⏹ Detener</span>';
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
        const downIdx = ((y + 1) * width + x) * 4;
        const lumDown = (data[downIdx] + data[downIdx + 1] + data[downIdx + 2]) / 3;

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

  // --- EXPANSIÓN VECTORIAL HASTA EL BORDE DE LA FICHA ---
  // Los márgenes NO se hardcodean: salen de ROIProcessor.getExpansionMargins(),
  // que los deriva del tamaño de la ficha (188 x 138 mm) y del inset (5 mm) y
  // tamaño (10 mm) de los marcadores impresos. Expandir el cuadrilátero de
  // CENTROS de marcador en esta proporción hace que el lienzo rectificado
  // corresponda exactamente al borde de la ficha, que es lo que asumen las
  // coordenadas de ROIProcessor.CONFIG.
  function getExpandedSheetQuad(quad, marginX, marginY) {
    if (marginX === undefined || marginY === undefined) {
      const gm = (typeof ROIProcessor !== 'undefined' && ROIProcessor.getExpansionMargins)
        ? ROIProcessor.getExpansionMargins()
        : { marginX: 0.0595238095, marginY: 0.0847457627 };
      marginX = gm.marginX;
      marginY = gm.marginY;
    }

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

    // REGLA 4: Nitidez (>= 20%) y 3 cuadros consecutivos de quietud
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

  // Deja el visor en estado neutro: sin chip de estado y sin los estilos de
  // "fijado". La retícula HUD estática se eliminó del HTML, así que acá ya no
  // hay nada que resetear de ella.
  function resetHUD() {
    const badge = document.getElementById('status-badge');
    const statusText = document.getElementById('status-text');
    if (badge) {
      badge.classList.remove('locked');
      badge.style.display = 'none';
    }
    if (statusText) statusText.textContent = '';
  }

  // --- DISPARO AUTOMÁTICO Y EXTRACCIÓN DE ROIs ---
  /**
   * @param {number} sharpness índice de nitidez medido
   * @param {object|null} sheetQuad cuadrilátero YA expandido al borde de la ficha
   * @param {string|null} directDataUrl imagen ya enderezada (vía legacy)
   * @param {string|null} qrData texto del QR si ya se conoce
   * @param {HTMLImageElement|null} source imagen de la que warpear. Si es null
   *        se usa el <video> de la cámara. Lo usa handleFile() para procesar una
   *        foto guardada por el mismo camino que una captura en vivo.
   */
  async function triggerAutoCapture(sharpness, sheetQuad, directDataUrl = null, qrData = null, source = null) {
    // GUARDRAIL 2: cooldown anti-duplicados.
    // NO se aplica a una foto elegida a mano: ahí el docente dispara una vez y
    // quiere que se procese, aunque haya cargado otra imagen hace dos segundos.
    const esFotoSubida = !!source;
    const now = Date.now();
    if (!esFotoSubida && now - lastCaptureTime < CAPTURE_COOLDOWN_MS) return;
    lastCaptureTime = now;

    // GUARDRAIL 6: Pausar inmediatamente el bucle
    isScanning = false;
    playBeep();
    if (navigator.vibrate) navigator.vibrate([70]);
    flashCaptureEffect();

    let fullWarpCanvas = null;
    let resolutionPreviewUrl = null;
    let answerPreviewUrl = null;
    let qrText = qrData;
    // Qué intento de lectura del QR fue el que funcionó (0 = ninguno). Saber si
    // lo leyó el detector nativo, jsQR sobre todo el lienzo o el recorte con
    // contraste es la diferencia entre "el QR no se lee" y "el QR se lee pero
    // solo por el camino de respaldo".
    let qrIntento = qrData ? 1 : 0;
    let omrResults = null;

    // Sincronizar SIEMPRE con la sesión activa de ClassroomData (Single Source of Truth)
    const activeSession = (typeof ClassroomData !== 'undefined') ? ClassroomData.getActiveSession() : null;
    if (activeSession) {
      if (activeSession.classroomId) currentClassroomId = activeSession.classroomId;
      if (activeSession.evalId) currentEvaluationId = activeSession.evalId;
    }

    let activeEval = (typeof ClassroomData !== 'undefined' && currentEvaluationId)
      ? ClassroomData.getEvaluation(currentEvaluationId)
      : null;

    if (!activeEval && activeSession) {
      activeEval = activeSession;
    }

    // Solo es OMR si la evaluación es explícitamente de alternativas ('mc')
    const isOMR = (activeEval && activeEval.type === 'mc') || (activeSession && activeSession.type === 'mc');

    try {
      if (sheetQuad) {
        // Perspective Warp al tamaño estándar del lienzo, tomado de
        // ROIProcessor para que el warp y las ROIs no puedan desincronizarse.
        // 2000 x 1441 px = 10.75 px/mm sobre la ficha de 186 x 134 mm.
        const warpW = (typeof ROIProcessor !== 'undefined' && ROIProcessor.SHEET_WIDTH) || 2000;
        const warpH = (typeof ROIProcessor !== 'undefined' && ROIProcessor.SHEET_HEIGHT) || 1441;
        // La fuente es el <video> con la cámara en vivo, o la imagen cargada a
        // mano. Las coordenadas del cuadrilátero vienen en el espacio de
        // píxeles de esa misma fuente, por eso el warp da igual en los dos casos.
        fullWarpCanvas = renderPerspectiveWarp(source || video, sheetQuad, warpW, warpH);
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
            if (barcodes && barcodes.length > 0) { qrText = barcodes[0].rawValue; qrIntento = 1; }
          } catch (e) {}
        }

        // Intento 2: jsQR sobre lienzo completo
        if (!qrText && typeof jsQR !== 'undefined') {
          try {
            const wCtx = fullWarpCanvas.getContext('2d');
            const wData = wCtx.getImageData(0, 0, fullWarpCanvas.width, fullWarpCanvas.height);
            const qr = jsQR(wData.data, wData.width, wData.height, { inversionAttempts: 'dontInvert' });
            if (qr) { qrText = qr.data; qrIntento = 2; }
          } catch (e) {}
        }

        // Intento 3 (Respaldo): Extraer ROI de QR específica y aplicar contraste si no se leyó
        if (!qrText && typeof ROIProcessor !== 'undefined') {
          const qrRoi = ROIProcessor.extractROI(fullWarpCanvas, ROIProcessor.CONFIG.QR);
          if (qrRoi.success && typeof jsQR !== 'undefined') {
            ROIProcessor.enhanceHandwritingContrast(qrRoi.canvas, { blackCutoff: 100, whiteCutoff: 160 });
            const qrDataImg = qrRoi.canvas.getContext('2d').getImageData(0, 0, qrRoi.canvas.width, qrRoi.canvas.height);
            const qrRetry = jsQR(qrDataImg.data, qrDataImg.width, qrDataImg.height, { inversionAttempts: 'attemptBoth' });
            if (qrRetry) { qrText = qrRetry.data; qrIntento = 3; }
          }
        }
      }

      // GUARDRAIL 3 & 5: EXTRACCIÓN DE ROI DE RESOLUCIÓN + CONTRASTE DE GRAFITO / EVALUACIÓN OMR
      if (fullWarpCanvas && typeof ROIProcessor !== 'undefined') {
        if (isOMR && ROIProcessor.evaluateOMRSheet) {
          let qCount = 1;
          if (activeEval && (activeEval.questionCount === 2 || (activeEval.questions && activeEval.questions.length === 2))) {
            qCount = 2;
          } else if (activeSession && (activeSession.questionCount === 2 || (activeSession.questions && activeSession.questions.length === 2))) {
            qCount = 2;
          } else if (activeEval && activeEval.prompt && activeEval.prompt.includes('1.') && activeEval.prompt.includes('2.')) {
            qCount = 2;
          } else if (activeSession && activeSession.prompt && activeSession.prompt.includes('1.') && activeSession.prompt.includes('2.')) {
            qCount = 2;
          }
          omrResults = ROIProcessor.evaluateOMRSheet(fullWarpCanvas, qCount);
          console.log('[Scanner] OMR Results detectados:', omrResults);
          resolutionPreviewUrl = fullWarpCanvas.toDataURL('image/jpeg', 0.90);
        } else {
          const procResult = ROIProcessor.processCapturedSheet(fullWarpCanvas);
          if (procResult.success && procResult.resolutionCanvas) {
            resolutionPreviewUrl = procResult.resolutionCanvas.toDataURL('image/jpeg', 0.92);
          }
          if (procResult.success && procResult.answerCanvas) {
            answerPreviewUrl = procResult.answerCanvas.toDataURL('image/jpeg', 0.92);
          }
        }
      }

      // Si no se pudo recortar la ROI, usar la hoja completa como respaldo seguro
      if (!resolutionPreviewUrl && fullWarpCanvas) {
        resolutionPreviewUrl = fullWarpCanvas.toDataURL('image/jpeg', 0.90);
      }

    } catch (err) {
      console.error('[Scanner] Error en triggerAutoCapture:', err);
    }

    // GUARDRAIL 9: Análisis de brillo de la imagen capturada
    // Muestrea una cuadrícula de píxeles del canvas warpeado para estimar el brillo promedio.
    // Umbral: < 30% → imagen probablemente ilegible por baja luz.
    const BRIGHTNESS_THRESHOLD = 30;
    let brightnessPercent = 100;
    let imageTooDark = false;
    if (fullWarpCanvas) {
      try {
        const bCtx = fullWarpCanvas.getContext('2d');
        const sampleStep = Math.floor(fullWarpCanvas.width / 40); // ~40x27 muestras
        const sampleData = bCtx.getImageData(0, 0, fullWarpCanvas.width, fullWarpCanvas.height);
        const pixels = sampleData.data;
        let totalLuminance = 0, count = 0;
        for (let y = 0; y < fullWarpCanvas.height; y += sampleStep) {
          for (let x = 0; x < fullWarpCanvas.width; x += sampleStep) {
            const i = (y * fullWarpCanvas.width + x) * 4;
            // Luminancia perceptual (rec. 709)
            totalLuminance += 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
            count++;
          }
        }
        brightnessPercent = count > 0 ? Math.round((totalLuminance / count / 255) * 100) : 100;
        imageTooDark = brightnessPercent < BRIGHTNESS_THRESHOLD;
      } catch (e) {
        console.warn('[G9] Error analizando brillo:', e);
      }
    }

    // Decodificación del alumno desde el payload QR (Soporta formato nuevo 'ALUM_01' y legado 'MATEVAL|ALUM_01|...')
    let studentId = null;
    let qrSuccess = false;

    if (qrText) {
      const match = qrText.match(/ALUM_\d{2}/i);
      if (match) {
        studentId = match[0].toUpperCase();
        qrSuccess = true;
      } else if (qrText.trim().startsWith('ALUM_')) {
        studentId = qrText.trim().toUpperCase();
        qrSuccess = true;
      }
    }

    let studentObj = null;
    if (studentId && typeof ClassroomData !== 'undefined') {
      studentObj = ClassroomData.getStudent(currentClassroomId, studentId);
    }

    const expectedAns = (activeSession && activeSession.expectedAnswer)
                     || (activeEval && activeEval.expectedAnswer)
                     || 'A';

    let studentName = '';
    let alreadyEvaluated = false;
    if (studentObj) {
      studentName = studentObj.name;
      // Verificar ANTES de agregar si este alumno ya fue registrado en esta sesión
      alreadyEvaluated = evaluatedStudentIds.has(studentId);
      evaluatedStudentIds.add(studentId);
      updateSessionCounter();
    } else if (studentId) {
      studentName = 'ALUMNO (' + studentId + ')';
    } else {
      studentName = '⚠️ QR NO LEÍDO';
      studentId = 'MANUAL';
    }

    // Presentar modal con la captura procesada
    setTimeout(() => {
      try {
        const imgEl = document.getElementById('captured-img');
        if (imgEl && resolutionPreviewUrl) imgEl.src = resolutionPreviewUrl;

        // Advertencia de duplicado: banner naranja + nombre en color distinto
        const dupBanner = document.getElementById('res-duplicate-warning');
        if (dupBanner) dupBanner.style.display = alreadyEvaluated ? 'flex' : 'none';

        const nameEl = document.getElementById('res-student-name');
        if (nameEl) {
          nameEl.textContent = studentName.toUpperCase();
          nameEl.style.color = alreadyEvaluated ? '#f97316' : (qrSuccess ? '#f8fafc' : '#f59e0b');
        }

        const idEl = document.getElementById('res-student-id');
        if (idEl) idEl.textContent = 'ID: ' + studentId;

        // Mostrar salón activo en el modal con su color identificador
        const classroomEl = document.getElementById('res-classroom-name');
        if (classroomEl) {
          const clsObj = typeof ClassroomData !== 'undefined' ? ClassroomData.getClassroom(currentClassroomId) : null;
          const clsColor = typeof ClassroomData !== 'undefined' && ClassroomData.getClassroomColor
            ? ClassroomData.getClassroomColor(currentClassroomId)
            : '#60a5fa';
          classroomEl.textContent = clsObj ? clsObj.name : currentClassroomId;
          classroomEl.style.color = clsColor;
          classroomEl.style.background = clsColor + '18';
          classroomEl.style.border = `1px solid ${clsColor}40`;
          classroomEl.style.borderRadius = '5px';
          classroomEl.style.padding = '1px 6px';
        }

        const testEl = document.getElementById('res-test-id');
        if (testEl) testEl.textContent = 'Resultado Esperado: ' + expectedAns;

        // Renderizar resultado OMR o imagen de escritura tradicional
        const omrContainer = document.getElementById('omr-result-container');
        const hwContainer = document.getElementById('handwriting-result-container');

        if (isOMR && omrResults && omrResults.length > 0) {
          if (omrContainer) {
            omrContainer.style.display = 'flex';
            omrContainer.innerHTML = '';

            const questionsList = (activeEval && activeEval.questions)
                               || (activeSession && activeSession.questions)
                               || [];

            let allCorrect = true;
            const evaluatedResults = [];

            omrResults.forEach((qRes, idx) => {
              const qObj = questionsList[idx] || null;
              let expectedKey = qObj ? (qObj.correct || qObj.expectedAnswer) : null;
              if (!expectedKey) {
                if (idx === 0) {
                  const m1 = String(expectedAns).match(/(?:P1[:\s]+)?([A-D])/i);
                  if (m1) expectedKey = m1[1].toUpperCase();
                } else if (idx === 1) {
                  const m2 = String(expectedAns).match(/P2[:\s]+([A-D])/i);
                  if (m2) expectedKey = m2[1].toUpperCase();
                }
              }
              if (!expectedKey) {
                const mDef = String(expectedAns).match(/[A-D]/i);
                expectedKey = mDef ? mDef[0].toUpperCase() : 'A';
              }
              const m = String(expectedKey).match(/[A-D]/i);
              if (m) expectedKey = m[0].toUpperCase();

              const isCorrect = qRes.marked === expectedKey;
              if (!isCorrect) allCorrect = false;

              evaluatedResults.push({
                qIndex: qRes.qIndex,
                marked: qRes.marked,
                expected: expectedKey,
                correct: isCorrect
              });

              let markedLabel = qRes.marked;
              let markedColor = '#f8fafc';
              if (qRes.marked === 'BLANK') {
                markedLabel = '⚠️ En blanco (no marcada)';
                markedColor = '#fbbf24';
              } else if (qRes.marked === 'MULTIPLE') {
                markedLabel = '⚠️ Doble marca';
                markedColor = '#f87171';
              }

              const item = document.createElement('div');
              item.style.background = '#1e293b';
              item.style.borderRadius = '8px';
              item.style.padding = '8px 12px';
              item.style.border = isCorrect ? '1.5px solid #22c55e' : (qRes.marked === 'BLANK' ? '1.5px solid #f59e0b' : '1.5px solid #ef4444');
              item.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span style="font-weight:700; color:#e2e8f0; font-size:0.85rem;">Pregunta ${qRes.qIndex}</span>
                  <span style="font-weight:800; font-size:0.82rem; padding:2px 8px; border-radius:5px; background:${isCorrect ? '#22c55e20' : '#ef444420'}; color:${isCorrect ? '#22c55e' : '#ef4444'};">
                    ${isCorrect ? '✅ CORRECTA' : (qRes.marked === 'BLANK' ? '⚠️ SIN RESPUESTA' : '❌ INCORRECTA')}
                  </span>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px; font-size:0.82rem; color:#94a3b8;">
                  <span>Marcó: <strong style="color:${markedColor}; font-size:1.15rem; margin-left:4px;">${markedLabel}</strong></span>
                  <span>Clave esperada: <strong style="color:#22c55e; font-size:1.15rem; margin-left:4px;">${expectedKey}</strong></span>
                </div>
              `;
              omrContainer.appendChild(item);
            });

            lastOMRInfo = { allCorrect: allCorrect, results: evaluatedResults };
            persistCapture(studentId, studentName, lastOMRInfo);
          }
          if (hwContainer) hwContainer.style.display = 'none';
        } else {
          lastOMRInfo = null;
          persistCapture(studentId, studentName, null);
          if (omrContainer) omrContainer.style.display = 'none';
          if (hwContainer) hwContainer.style.display = 'block';

          const ansImgEl = document.getElementById('captured-answer-img');
          if (ansImgEl) {
            if (answerPreviewUrl) {
              ansImgEl.src = answerPreviewUrl;
              ansImgEl.style.display = 'block';
            } else {
              ansImgEl.style.display = 'none';
            }
          }

          const expValEl = document.getElementById('res-expected-val');
          if (expValEl) expValEl.textContent = expectedAns;
        }

        const evalPromptEl = document.getElementById('res-eval-prompt');
        if (evalPromptEl && activeEval) {
          evalPromptEl.textContent = activeEval.prompt;
        }

        const sharpEl = document.getElementById('res-sharpness');
        if (sharpEl) sharpEl.textContent = sharpness + '%';

        // GUARDRAIL 9: Mostrar/ocultar advertencia de imagen oscura
        const g9Banner = document.getElementById('g9-dark-image-warning');
        const g9Val = document.getElementById('g9-brightness-val');
        if (g9Banner) g9Banner.style.display = imageTooDark ? 'flex' : 'none';
        if (g9Val) g9Val.textContent = brightnessPercent;

        const focusDuration = targetLockStartTime ? ((Date.now() - targetLockStartTime) / 1000).toFixed(2) : '0.20';
        const timeEl = document.getElementById('res-time');
        if (timeEl) timeEl.textContent = focusDuration + ' s';

        // Selector de respaldo de 1 toque si el QR no se pudo decodificar
        const manualWrap = document.getElementById('manual-student-wrap');
        if (manualWrap) {
          if (!qrSuccess) {
            manualWrap.style.display = 'block';
            populateManualStudentSelect();
          } else {
            manualWrap.style.display = 'none';
          }
        }

        renderModalPending();
        playDing();

        ultimaCaptura = {
          momento: new Date().toLocaleTimeString(),
          alumno: studentId + (studentObj ? ' (' + studentObj.name + ')' : ''),
          qrTexto: qrText || '',
          intentoQr: qrIntento === 0 ? 'ninguno (no se leyo)' : ('intento ' + qrIntento + ' de 3'),
          cobertura: typeof coverage !== 'undefined' ? coverage : 0,
          nitidez: sharpness,
          brillo: brightnessPercent,
          enfoque: focusDuration,
          respuestaEsperada: expectedAns,
          demasiadoOscura: imageTooDark,
          yaEvaluado: alreadyEvaluated
        };
      } catch (modalErr) {
        console.error('[Scanner] Error renderizando modal:', modalErr);
      } finally {
        const modal = document.getElementById('capture-modal');
        if (modal) modal.classList.add('open');
      }
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
      bar.style.background = val >= SHARPNESS_THRESHOLD ? '#22c55e' : (val >= 12 ? '#f59e0b' : '#ef4444');
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
    // Liberar imágenes anteriores del modal
    const imgEl = document.getElementById('captured-img');
    if (imgEl) imgEl.src = '';
    const ansImgEl = document.getElementById('captured-answer-img');
    if (ansImgEl) ansImgEl.src = '';

    const manualWrap = document.getElementById('manual-student-wrap');
    if (manualWrap) manualWrap.style.display = 'none';

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

    // Verificar dependencias e inicializar ArUco y Nóminas
    checkDependencies();
    initArUco();

    // BUGFIX: Restaurar salón activo desde localStorage al inicio del scanner.
    // Esto garantiza que currentClassroomId sea correcto incluso si el script
    // inline del portal aún no corrió su propio DOMContentLoaded, o si el docente
    // navegó directo al tab de escáner sin presionar "Generar".
    if (typeof ClassroomData !== 'undefined') {
      const savedSession = ClassroomData.getActiveSession();
      if (savedSession && savedSession.classroomId) {
        currentClassroomId = savedSession.classroomId;
        currentEvaluationId = savedSession.evalId || currentEvaluationId;
        console.log('[Scanner] Sesión restaurada desde localStorage → salón:', currentClassroomId);
      }
    }

    updateSessionCounter();
  });

  // Exportar funciones para interacción con la interfaz HTML
  global.Scanner = {
    toggleCamera,
    toggleTorch,
    toggleFullscreen,
    nextScan,
    closeModal,
    setSession,
    setEvaluatedStudents,
    onClassroomChanged,
    onEvaluationChanged,
    assignManualStudent,
    handleFile,
    diagnostico
  };

  // Bindings directos para eventos onclick / onchange en HTML
  // handleFile tiene que estar acá además de en Scanner: el input de archivo lo
  // llama desde un atributo onchange, y esos se resuelven en el ámbito global.
  global.handleFile = handleFile;
  global.toggleCamera = toggleCamera;
  global.toggleTorch = toggleTorch;
  global.toggleFullscreen = toggleFullscreen;
  global.nextScan = nextScan;
  global.closeModal = closeModal;
  global.setSession = setSession;
  global.onClassroomChanged = onClassroomChanged;
  global.onEvaluationChanged = onEvaluationChanged;
  global.assignManualStudent = assignManualStudent;

})(typeof window !== 'undefined' ? window : this);
