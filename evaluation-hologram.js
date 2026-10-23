/**
 * EVALUATION 3D HOLOGRAM CONTROLLER (Paleta Mariposa Biónica)
 * Malla tridimensional reactiva al scroll con 4 vértices ArUco dorados,
 * haz de barrido láser y ondulación continua inspirada en Dirac.
 */

(function () {
  'use strict';

  let scene, camera, renderer, animationFrameId;
  let hologramGroup, gridMesh, laserLine, arucoMarkers = [], particlesMesh;
  let canvas = null;
  let isRunning = false;
  let clock = null;

  // Parámetros y estado de la física
  const config = {
    cardWidth: 44,
    cardHeight: 60,
    gridCols: 26,
    gridRows: 36,
    baseAmplitude: 2.2,
    scrollSpeedMultiplier: 0.18,
    colorLinen: 0xEDE8DF,
    colorCyan: 0x00B4D8,
    colorCyanLight: 0x48CAE4,
    colorAmber: 0xFFB703,
    colorBrown: 0x2B2118,
    colorBlueDeep: 0x0077B6
  };

  const state = {
    scrollProgress: 0,
    targetProgress: 0,
    scrollSpeed: 0,
    lastScrollTop: 0,
    lastScrollTime: performance.now(),
    amplitude: config.baseAmplitude,
    targetAmplitude: config.baseAmplitude,
    idleTime: 0
  };

  function initHologram() {
    if (typeof THREE === 'undefined') {
      console.warn('Three.js no está cargado. Se pospone la inicialización del holograma.');
      return false;
    }

    const view = document.getElementById('view-create');
    if (!view) return false;

    // Crear canvas si no existe
    canvas = document.getElementById('eval-hologram-canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'eval-hologram-canvas';
      canvas.style.position = 'fixed';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.width = '100vw';
      canvas.style.height = '100vh';
      canvas.style.pointerEvents = 'none';
      canvas.style.zIndex = '0';
      canvas.style.opacity = '0';
      canvas.style.transition = 'opacity 0.6s ease';
      // Insertar al inicio de view-create
      view.insertBefore(canvas, view.firstChild);
    }

    const width = window.innerWidth;
    const height = window.innerHeight;

    scene = new THREE.Scene();
    clock = new THREE.Clock();

    // Cámara en perspectiva
    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, -6, 95);
    camera.lookAt(0, -4, 0);

    // Renderer con fondo transparente
    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    buildHologramObjects();
    bindScrollAndResize();

    return true;
  }

  function buildHologramObjects() {
    hologramGroup = new THREE.Group();
    scene.add(hologramGroup);

    // ── 1. MALLA DE LÍNEAS 3D (CUADRÍCULA DE LA FICHA) ──
    const cols = config.gridCols;
    const rows = config.gridRows;
    const w = config.cardWidth;
    const h = config.cardHeight;

    const planeGeom = new THREE.PlaneGeometry(w, h, cols, rows);
    // Orientar en plano XZ
    planeGeom.rotateX(-Math.PI / 2);

    // Material de alambre (wireframe) en cian turquesa
    const wireMat = new THREE.MeshBasicMaterial({
      color: config.colorCyan,
      wireframe: true,
      transparent: true,
      opacity: 0.55
    });

    gridMesh = new THREE.Mesh(planeGeom, wireMat);
    hologramGroup.add(gridMesh);

    // Guardar posiciones base de vértices para la animación de ondulación
    gridMesh.geometry.userData = {
      basePositions: planeGeom.attributes.position.clone()
    };

    // ── 2. MARCO PERIMETRAL EXTERIOR ──
    const frameGeom = new THREE.BufferGeometry();
    const halfW = w / 2;
    const halfH = h / 2;
    const framePoints = [
      new THREE.Vector3(-halfW, 0, -halfH),
      new THREE.Vector3(halfW, 0, -halfH),
      new THREE.Vector3(halfW, 0, halfH),
      new THREE.Vector3(-halfW, 0, halfH),
      new THREE.Vector3(-halfW, 0, -halfH)
    ];
    frameGeom.setFromPoints(framePoints);
    const frameMat = new THREE.LineBasicMaterial({
      color: config.colorBrown,
      linewidth: 2,
      transparent: true,
      opacity: 0.8
    });
    const frameLine = new THREE.Line(frameGeom, frameMat);
    hologramGroup.add(frameLine);

    // ── 3. LOS 4 VÉRTICES ARUCO DORADOS ──
    arucoMarkers = [];
    const cornerOffsets = [
      { x: -halfW + 3.2, z: -halfH + 3.2 }, // Superior izquierda
      { x: halfW - 3.2, z: -halfH + 3.2 },  // Superior derecha
      { x: -halfW + 3.2, z: halfH - 3.2 },  // Inferior izquierda
      { x: halfW - 3.2, z: halfH - 3.2 }   // Inferior derecha
    ];

    cornerOffsets.forEach((pos, idx) => {
      const markerGroup = new THREE.Group();
      markerGroup.position.set(pos.x, 0.4, pos.z);

      // Marco exterior ArUco en dorado ámbar (#FFB703)
      const boxOuterGeom = new THREE.BoxGeometry(4.4, 0.8, 4.4);
      const boxOuterMat = new THREE.MeshBasicMaterial({
        color: config.colorAmber,
        transparent: true,
        opacity: 0.95
      });
      const boxOuter = new THREE.Mesh(boxOuterGeom, boxOuterMat);
      markerGroup.add(boxOuter);

      // Matriz interna negra/marrón (#2B2118)
      const boxInnerGeom = new THREE.BoxGeometry(2.4, 0.9, 2.4);
      const boxInnerMat = new THREE.MeshBasicMaterial({
        color: config.colorBrown,
        transparent: true,
        opacity: 0.9
      });
      const boxInner = new THREE.Mesh(boxInnerGeom, boxInnerMat);
      markerGroup.add(boxInner);

      // Líneas de mira / retículas láser que apuntan al centro
      const reticleGeom = new THREE.BufferGeometry();
      const dirX = pos.x < 0 ? 1 : -1;
      const dirZ = pos.z < 0 ? 1 : -1;
      const reticlePoints = [
        new THREE.Vector3(0, 0.5, 0),
        new THREE.Vector3(dirX * 4, 0.5, 0),
        new THREE.Vector3(0, 0.5, 0),
        new THREE.Vector3(0, 0.5, dirZ * 4)
      ];
      reticleGeom.setFromPoints(reticlePoints);
      const reticleMat = new THREE.LineBasicMaterial({
        color: config.colorCyanLight,
        transparent: true,
        opacity: 0.7
      });
      const reticle = new THREE.LineSegments(reticleGeom, reticleMat);
      markerGroup.add(reticle);

      hologramGroup.add(markerGroup);
      arucoMarkers.push(markerGroup);
    });

    // ── 4. HAZ DE ESCANEO LÁSER (LÍNEA HORIZONTAL LUMINOSA) ──
    const laserGeom = new THREE.BufferGeometry();
    const laserPoints = [
      new THREE.Vector3(-halfW - 2, 0.6, 0),
      new THREE.Vector3(halfW + 2, 0.6, 0)
    ];
    laserGeom.setFromPoints(laserPoints);
    const laserMat = new THREE.LineBasicMaterial({
      color: config.colorCyanLight,
      linewidth: 3,
      transparent: true,
      opacity: 0.85
    });
    laserLine = new THREE.Line(laserGeom, laserMat);
    hologramGroup.add(laserLine);

    // ── 5. NUBE DE MICRO-PARTÍCULAS FLOTANTES ──
    const particleCount = 70;
    const particleGeom = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    const particleColors = new Float32Array(particleCount * 3);

    const cCyan = new THREE.Color(config.colorCyan);
    const cAmber = new THREE.Color(config.colorAmber);

    for (let i = 0; i < particleCount; i++) {
      particlePositions[i * 3] = (Math.random() - 0.5) * (w + 24);
      particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 16;
      particlePositions[i * 3 + 2] = (Math.random() - 0.5) * (h + 24);

      const color = Math.random() > 0.4 ? cCyan : cAmber;
      particleColors[i * 3] = color.r;
      particleColors[i * 3 + 1] = color.g;
      particleColors[i * 3 + 2] = color.b;
    }

    particleGeom.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    particleGeom.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));

    const particleMat = new THREE.PointsMaterial({
      size: 1.4,
      vertexColors: true,
      transparent: true,
      opacity: 0.65
    });
    particlesMesh = new THREE.Points(particleGeom, particleMat);
    hologramGroup.add(particlesMesh);

    // Configuración inicial de posición y ángulo del holograma
    hologramGroup.position.set(0, -12, -8);
    hologramGroup.rotation.set(0.68, -0.42, 0.12); // Vista isométrica suave
  }

  function bindScrollAndResize() {
    const view = document.getElementById('view-create');

    const onScroll = () => {
      const currentScroll = window.scrollY || document.documentElement.scrollTop || (view ? view.scrollTop : 0);
      const maxScroll = Math.max(
        document.documentElement.scrollHeight - window.innerHeight,
        view ? (view.scrollHeight - view.clientHeight) : 0,
        1
      );

      state.targetProgress = maxScroll > 20 ? Math.min(Math.max(currentScroll / maxScroll, 0), 1) : 0;

      // Calcular velocidad de scroll
      const now = performance.now();
      const dt = Math.max(now - state.lastScrollTime, 16);
      const dy = Math.abs(currentScroll - state.lastScrollTop);
      state.scrollSpeed = dy / dt;

      // Excitación de amplitud por scroll (Dirac physics)
      state.targetAmplitude = config.baseAmplitude + Math.min(state.scrollSpeed * 9.0, 8.0);

      state.lastScrollTop = currentScroll;
      state.lastScrollTime = now;
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    if (view) {
      view.addEventListener('scroll', onScroll, { passive: true });
    }
    window.addEventListener('resize', onWindowResize, { passive: true });
  }

  function onWindowResize() {
    if (!camera || !renderer || !canvas) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  function updatePhysics(dt) {
    state.idleTime += dt;

    // Amortiguamiento suave de velocidad e inercia hacia target
    state.scrollProgress += (state.targetProgress - state.scrollProgress) * 0.08;
    state.targetAmplitude += (config.baseAmplitude - state.targetAmplitude) * 0.04;
    state.amplitude += (state.targetAmplitude - state.amplitude) * 0.1;

    // ── A. ONDULACIÓN DE LA MALLA (Continuo + Reactivo) ──
    if (gridMesh) {
      const posAttr = gridMesh.geometry.attributes.position;
      const basePos = gridMesh.geometry.userData.basePositions;
      const count = posAttr.count;
      const t = state.idleTime;
      const amp = state.amplitude;

      for (let i = 0; i < count; i++) {
        const x = basePos.getX(i);
        const z = basePos.getZ(i);

        // Ecuación de resonancia de sala con amortiguamiento gaussiano
        const r2 = (x * x + z * z) / 600;
        const wave1 = Math.sin(0.18 * x + t * 2.2) * Math.cos(0.14 * z + t * 1.6);
        const wave2 = Math.sin(0.32 * z - t * 3.0) * 0.45;
        const y = (wave1 + wave2) * amp * Math.exp(-r2 * 0.4);

        posAttr.setY(i, y);
      }
      posAttr.needsUpdate = true;
    }

    // ── B. PULSACIÓN DE LOS 4 ARUCO DORADOS ──
    const pulseScale = 1.0 + 0.12 * Math.sin(state.idleTime * 2.8);
    arucoMarkers.forEach(marker => {
      marker.scale.set(pulseScale, pulseScale, pulseScale);
    });

    // ── C. BARRIDO LÁSER DE ESCANEO ──
    if (laserLine) {
      const halfH = config.cardHeight / 2;
      // Combina ciclo automático continuo con la posición de scroll
      const autoSweep = Math.sin(state.idleTime * 1.6) * (halfH - 2);
      const scrollSweep = (state.scrollProgress - 0.5) * (halfH * 1.8);
      // Mezcla equilibrada entre ciclo vivo y desplazamiento del usuario
      const laserZ = autoSweep * 0.5 + scrollSweep * 0.5;
      laserLine.position.z = laserZ;
    }

    // ── D. CINEMÁTICA Y DESCENSO CON EL SCROLL ──
    if (hologramGroup) {
      const p = state.scrollProgress;

      // 1. Descenso físico en el eje Y y acercamiento en Z
      // En scroll 0% está en Y=-12 (en el espacio inferior vacío del paso 1)
      // Conforme avanza el scroll a 100%, acompaña la bajada hacia Y=-26
      const targetY = -12 - p * 14;
      const targetZ = -8 + p * 6;
      hologramGroup.position.y += (targetY - hologramGroup.position.y) * 0.08;
      hologramGroup.position.z += (targetZ - hologramGroup.position.z) * 0.08;

      // 2. Rotación: En scroll 0% diagonal (38° pitch, -24° yaw)
      // En scroll 100% se orienta más de frente (20° pitch, -5° yaw) lista para confirmar
      const targetRotX = 0.68 - p * 0.32;
      const targetRotY = -0.42 + p * 0.36 + Math.sin(state.idleTime * 0.6) * 0.04;
      const targetRotZ = 0.12 - p * 0.10;

      hologramGroup.rotation.x += (targetRotX - hologramGroup.rotation.x) * 0.08;
      hologramGroup.rotation.y += (targetRotY - hologramGroup.rotation.y) * 0.08;
      hologramGroup.rotation.z += (targetRotZ - hologramGroup.rotation.z) * 0.08;
    }

    // ── E. ROTACIÓN LENTA DE MICRO-PARTÍCULAS ──
    if (particlesMesh) {
      particlesMesh.rotation.y = state.idleTime * 0.04;
    }
  }

  function renderLoop() {
    if (!isRunning) return;
    animationFrameId = requestAnimationFrame(renderLoop);

    const dt = clock ? Math.min(clock.getDelta(), 0.1) : 0.016;
    updatePhysics(dt);

    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  }

  // ── CONTROL DE CICLO DE VIDA PÚBLICO ──
  const EvaluationHologram = {
    start: function () {
      if (isRunning) return;
      if (!scene) {
        const ok = initHologram();
        if (!ok) return;
      }
      isRunning = true;
      if (canvas) {
        canvas.style.display = 'block';
        setTimeout(() => { if (canvas) canvas.style.opacity = '1'; }, 40);
      }
      if (clock) clock.start();
      renderLoop();
    },

    stop: function () {
      if (!isRunning) return;
      isRunning = false;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      if (canvas) {
        canvas.style.opacity = '0';
        setTimeout(() => {
          if (!isRunning && canvas) canvas.style.display = 'none';
        }, 600);
      }
    },

    isActive: function () {
      return isRunning;
    }
  };

  window.EvaluationHologram = EvaluationHologram;
})();
