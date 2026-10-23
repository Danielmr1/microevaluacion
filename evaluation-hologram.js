/**
 * EVALUATION 3D HOLOGRAM CONTROLLER (Paleta Mariposa Biónica)
 * - PC (>=768px): 2 hologramas compactos alternantes en laterales (izq/der), nunca simultáneos.
 * - Móvil (<768px): 1 holograma central compacto al inicio; desaparece al elegir salón.
 * - Dinámica: Ondulación continua en reposo, pulsación ArUco y descenso por scroll.
 */

(function () {
  'use strict';

  let scene, camera, renderer, animationFrameId;
  let canvas = null;
  let isRunning = false;
  let clock = null;

  // Parámetros y colores Bionic Butterfly
  const config = {
    cardWidth: 20,        // Tamaño compacto optimizado para márgenes laterales
    cardHeight: 28,
    gridCols: 20,
    gridRows: 26,
    baseAmplitude: 1.8,
    colorLinen: 0xEDE8DF,
    colorCyan: 0x00B4D8,
    colorCyanLight: 0x48CAE4,
    colorAmber: 0xFFB703,
    colorBrown: 0x2B2118,
    colorBlueDeep: 0x0077B6
  };

  const state = {
    isMobile: false,
    classroomSelected: false,
    scrollProgress: 0,
    targetProgress: 0,
    scrollSpeed: 0,
    lastScrollTop: 0,
    lastScrollTime: performance.now(),
    amplitude: config.baseAmplitude,
    targetAmplitude: config.baseAmplitude,
    idleTime: 0
  };

  // Instancias de hologramas
  let cardLeft = null;
  let cardRight = null;
  let cardCenterMobile = null;

  function initHologram() {
    if (typeof THREE === 'undefined') {
      console.warn('Three.js no disponible.');
      return false;
    }

    const view = document.getElementById('view-create');
    if (!view) return false;

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
      canvas.style.transition = 'opacity 0.5s ease';
      document.body.appendChild(canvas);
    }

    const width = window.innerWidth;
    const height = window.innerHeight;
    state.isMobile = width < 768;

    scene = new THREE.Scene();
    clock = new THREE.Clock();

    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, -4, 90);
    camera.lookAt(0, -3, 0);

    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    buildAllHolograms();
    bindEvents();
    checkClassroomState();

    return true;
  }

  // Fábrica para crear una ficha holográfica completa
  function createHologramCard(tag) {
    const group = new THREE.Group();
    const w = config.cardWidth;
    const h = config.cardHeight;
    const cols = config.gridCols;
    const rows = config.gridRows;

    // 1. Malla Wireframe de la Cuadrícula
    const planeGeom = new THREE.PlaneGeometry(w, h, cols, rows);
    planeGeom.rotateX(-Math.PI / 2);
    const wireMat = new THREE.MeshBasicMaterial({
      color: config.colorCyan,
      wireframe: true,
      transparent: true,
      opacity: 0.55
    });
    const gridMesh = new THREE.Mesh(planeGeom, wireMat);
    planeGeom.userData = { basePositions: planeGeom.attributes.position.clone() };
    group.add(gridMesh);

    // 2. Marco perimetral
    const halfW = w / 2;
    const halfH = h / 2;
    const frameGeom = new THREE.BufferGeometry();
    frameGeom.setFromPoints([
      new THREE.Vector3(-halfW, 0, -halfH),
      new THREE.Vector3(halfW, 0, -halfH),
      new THREE.Vector3(halfW, 0, halfH),
      new THREE.Vector3(-halfW, 0, halfH),
      new THREE.Vector3(-halfW, 0, -halfH)
    ]);
    const frameMat = new THREE.LineBasicMaterial({
      color: config.colorBrown,
      linewidth: 1.5,
      transparent: true,
      opacity: 0.75
    });
    group.add(new THREE.Line(frameGeom, frameMat));

    // 3. Vértices ArUco dorados en las 4 esquinas
    const arucoMarkers = [];
    const cornerOffsets = [
      { x: -halfW + 2.5, z: -halfH + 2.5 },
      { x: halfW - 2.5, z: -halfH + 2.5 },
      { x: -halfW + 2.5, z: halfH - 2.5 },
      { x: halfW - 2.5, z: halfH - 2.5 }
    ];

    cornerOffsets.forEach(pos => {
      const mGroup = new THREE.Group();
      mGroup.position.set(pos.x, 0.3, pos.z);

      // Marco dorado exterior
      const boxOuter = new THREE.Mesh(
        new THREE.BoxGeometry(3.6, 0.6, 3.6),
        new THREE.MeshBasicMaterial({ color: config.colorAmber, transparent: true, opacity: 0.95 })
      );
      mGroup.add(boxOuter);

      // Matriz interna marrón
      const boxInner = new THREE.Mesh(
        new THREE.BoxGeometry(2.0, 0.7, 2.0),
        new THREE.MeshBasicMaterial({ color: config.colorBrown, transparent: true, opacity: 0.9 })
      );
      mGroup.add(boxInner);

      // Retículas de mira láser
      const rGeom = new THREE.BufferGeometry();
      const dx = pos.x < 0 ? 1 : -1;
      const dz = pos.z < 0 ? 1 : -1;
      rGeom.setFromPoints([
        new THREE.Vector3(0, 0.4, 0), new THREE.Vector3(dx * 3, 0.4, 0),
        new THREE.Vector3(0, 0.4, 0), new THREE.Vector3(0, 0.4, dz * 3)
      ]);
      const reticle = new THREE.LineSegments(
        rGeom,
        new THREE.LineBasicMaterial({ color: config.colorCyanLight, transparent: true, opacity: 0.75 })
      );
      mGroup.add(reticle);

      group.add(mGroup);
      arucoMarkers.push(mGroup);
    });

    // 4. Haz láser de barrido
    const laserGeom = new THREE.BufferGeometry();
    laserGeom.setFromPoints([
      new THREE.Vector3(-halfW - 1.5, 0.5, 0),
      new THREE.Vector3(halfW + 1.5, 0.5, 0)
    ]);
    const laserMat = new THREE.LineBasicMaterial({
      color: config.colorCyanLight,
      linewidth: 2,
      transparent: true,
      opacity: 0.85
    });
    const laserLine = new THREE.Line(laserGeom, laserMat);
    group.add(laserLine);

    // 5. Partículas de escaneo
    const pCount = 36;
    const pGeom = new THREE.BufferGeometry();
    const pPos = new Float32Array(pCount * 3);
    const pCol = new Float32Array(pCount * 3);
    const cCyan = new THREE.Color(config.colorCyan);
    const cAmber = new THREE.Color(config.colorAmber);

    for (let i = 0; i < pCount; i++) {
      pPos[i * 3] = (Math.random() - 0.5) * (w + 16);
      pPos[i * 3 + 1] = (Math.random() - 0.5) * 12;
      pPos[i * 3 + 2] = (Math.random() - 0.5) * (h + 16);
      const c = Math.random() > 0.4 ? cCyan : cAmber;
      pCol[i * 3] = c.r;
      pCol[i * 3 + 1] = c.g;
      pCol[i * 3 + 2] = c.b;
    }
    pGeom.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    pGeom.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
    const particlesMesh = new THREE.Points(
      pGeom,
      new THREE.PointsMaterial({ size: 1.2, vertexColors: true, transparent: true, opacity: 0.6 })
    );
    group.add(particlesMesh);

    scene.add(group);

    // Método para controlar opacidad y visibilidad del holograma
    function setOpacity(alpha) {
      if (alpha <= 0.01) {
        group.visible = false;
        return;
      }
      group.visible = true;
      wireMat.opacity = 0.55 * alpha;
      frameMat.opacity = 0.75 * alpha;
      laserMat.opacity = 0.85 * alpha;
      particlesMesh.material.opacity = 0.6 * alpha;
      arucoMarkers.forEach(m => {
        m.children[0].material.opacity = 0.95 * alpha;
        m.children[1].material.opacity = 0.90 * alpha;
        m.children[2].material.opacity = 0.75 * alpha;
      });
    }

    return {
      tag,
      group,
      gridMesh,
      laserLine,
      arucoMarkers,
      particlesMesh,
      setOpacity
    };
  }

  function buildAllHolograms() {
    // 1. Holograma Izquierdo (PC)
    cardLeft = createHologramCard('left');
    cardLeft.group.position.set(-42, -10, -5);
    cardLeft.group.rotation.set(0.60, 0.38, -0.08); // Inclinado mirando hacia el centro

    // 2. Holograma Derecho (PC)
    cardRight = createHologramCard('right');
    cardRight.group.position.set(42, -14, -5);
    cardRight.group.rotation.set(0.60, -0.38, 0.08); // Inclinado mirando hacia el centro
    cardRight.setOpacity(0); // Oculto al inicio

    // 3. Holograma Central (Móvil)
    cardCenterMobile = createHologramCard('centerMobile');
    cardCenterMobile.group.scale.set(0.68, 0.68, 0.68); // Más pequeño en móvil
    cardCenterMobile.group.position.set(0, -12, -2);
    cardCenterMobile.group.rotation.set(0.65, -0.25, 0.08);
  }

  function checkClassroomState() {
    const sel = document.getElementById('builder-classroom');
    state.classroomSelected = !!(sel && sel.value && sel.value.trim() !== '');
  }

  function bindEvents() {
    const view = document.getElementById('view-create');

    const onScroll = () => {
      const currentScroll = window.scrollY || document.documentElement.scrollTop || (view ? view.scrollTop : 0);
      const maxScroll = Math.max(
        document.documentElement.scrollHeight - window.innerHeight,
        view ? (view.scrollHeight - view.clientHeight) : 0,
        1
      );

      state.targetProgress = maxScroll > 20 ? Math.min(Math.max(currentScroll / maxScroll, 0), 1) : 0;

      const now = performance.now();
      const dt = Math.max(now - state.lastScrollTime, 16);
      const dy = Math.abs(currentScroll - state.lastScrollTop);
      state.scrollSpeed = dy / dt;
      state.targetAmplitude = config.baseAmplitude + Math.min(state.scrollSpeed * 8.0, 7.0);

      state.lastScrollTop = currentScroll;
      state.lastScrollTime = now;
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    if (view) view.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });

    // Escuchar cambios de selección de salón
    const sel = document.getElementById('builder-classroom');
    if (sel) {
      sel.addEventListener('change', () => {
        checkClassroomState();
      });
    }
  }

  function onResize() {
    if (!camera || !renderer || !canvas) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    state.isMobile = w < 768;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  function updateCardPhysics(card, dt, timeOffset = 0) {
    if (!card || !card.group.visible) return;

    const t = state.idleTime + timeOffset;
    const amp = state.amplitude;

    // A. Ondulación de cuadrícula
    const posAttr = card.gridMesh.geometry.attributes.position;
    const basePos = card.gridMesh.geometry.userData.basePositions;
    const count = posAttr.count;

    for (let i = 0; i < count; i++) {
      const x = basePos.getX(i);
      const z = basePos.getZ(i);
      const r2 = (x * x + z * z) / 450;
      const wave1 = Math.sin(0.20 * x + t * 2.2) * Math.cos(0.16 * z + t * 1.7);
      const wave2 = Math.sin(0.35 * z - t * 2.8) * 0.4;
      const y = (wave1 + wave2) * amp * Math.exp(-r2 * 0.45);
      posAttr.setY(i, y);
    }
    posAttr.needsUpdate = true;

    // B. Pulsación de los 4 ArUco dorados
    const pulseScale = 1.0 + 0.12 * Math.sin(t * 2.8);
    card.arucoMarkers.forEach(m => m.scale.set(pulseScale, pulseScale, pulseScale));

    // C. Haz de barrido láser
    const halfH = config.cardHeight / 2;
    card.laserLine.position.z = Math.sin(t * 1.8) * (halfH - 2);

    // D. Micro-partículas
    card.particlesMesh.rotation.y = t * 0.05;
  }

  function updateFrame(dt) {
    state.idleTime += dt;
    checkClassroomState();

    // Suavizado de scroll y amplitud
    state.scrollProgress += (state.targetProgress - state.scrollProgress) * 0.08;
    state.targetAmplitude += (config.baseAmplitude - state.targetAmplitude) * 0.04;
    state.amplitude += (state.targetAmplitude - state.amplitude) * 0.1;

    const p = state.scrollProgress;

    if (state.isMobile) {
      // ── MODO CELULAR (<768px) ──
      // En PC se apagan los laterales
      if (cardLeft) cardLeft.setOpacity(0);
      if (cardRight) cardRight.setOpacity(0);

      // Si el docente seleccionó un salón, el holograma central desaparece por completo
      if (state.classroomSelected) {
        if (cardCenterMobile) cardCenterMobile.setOpacity(0);
      } else {
        // Al inicio (sin salón), flota vivo en el centro
        if (cardCenterMobile) {
          cardCenterMobile.setOpacity(1.0);
          updateCardPhysics(cardCenterMobile, dt, 0);
        }
      }
    } else {
      // ── MODO PC (>=768px): CASCADA DE DESCENSO Y RELEVO SECUENCIAL ──
      if (cardCenterMobile) cardCenterMobile.setOpacity(0);

      // 1. Tramo Izquierdo: Nace alto (Y=+6) y desciende a Y=-6 mientras p va de 0.0 a 0.40
      //    Se desvanece suavemente de 1.0 a 0.0 entre 0.20 y 0.40 hasta desaparecer por completo.
      // 2. Zona de pausa limpia (p=0.40 a 0.48): Ningún holograma visible.
      // 3. Tramo Derecho: Nace ya más abajo (Y=-6) a partir de p=0.48, y continúa
      //    descendiendo hasta Y=-20 (junto al botón Confirmar Fichas) al 100% de visibilidad.

      let alphaLeft = 0;
      let alphaRight = 0;
      let yLeft = 6;
      let yRight = -6;

      if (p < 0.20) {
        alphaLeft = 1.0;
        yLeft = 6 - (p / 0.20) * 5; // baja de +6 a +1
      } else if (p < 0.40) {
        const tFade = (p - 0.20) / (0.40 - 0.20);
        alphaLeft = Math.cos(tFade * (Math.PI / 2)); // 1.0 -> 0.0
        yLeft = 1 - tFade * 7; // continúa bajando hasta -6 al desaparecer
      } else {
        alphaLeft = 0;
        yLeft = -6;
      }

      if (p <= 0.48) {
        alphaRight = 0;
        yRight = -6;
      } else if (p < 0.68) {
        const tIn = (p - 0.48) / (0.68 - 0.48);
        alphaRight = Math.sin(tIn * (Math.PI / 2)); // 0.0 -> 1.0
        yRight = -6 - tIn * 8; // desciende de -6 a -14
      } else {
        alphaRight = 1.0;
        const tEnd = (p - 0.68) / (1.0 - 0.68);
        yRight = -14 - tEnd * 6; // desciende suavemente a -20 junto a Confirmar Fichas
      }

      // Separación lateral adaptativa según el ancho real de pantalla y la posición de la ficha
      const vDist = 95;
      const halfH3D = vDist * Math.tan((camera.fov * Math.PI) / 360);
      const halfW3D = halfH3D * (window.innerWidth / window.innerHeight);

      // Buscar el bloque o ficha visible real en pantalla (compatible con Rama 1, 2 y 3)
      let sheetRect = null;
      const candidates = [
        document.getElementById('r3-cartilla-render-host'),
        document.getElementById('r3-exam-render-host'),
        document.getElementById('sim-card-render-host'),
        document.getElementById('branch-3-options'),
        document.querySelector('.sim-card-host'),
        document.querySelector('.teacher-panel')
      ];
      for (let i = 0; i < candidates.length; i++) {
        const el = candidates[i];
        if (el) {
          const r = el.getBoundingClientRect();
          if (r.width > 80 && r.height > 40) {
            sheetRect = r;
            break;
          }
        }
      }

      const leftMarginPx = sheetRect ? Math.max(sheetRect.left, 40) : Math.max(window.innerWidth * 0.16, 60);
      const rightMarginPx = sheetRect ? Math.max(window.innerWidth - sheetRect.right, 40) : Math.max(window.innerWidth * 0.16, 60);

      // Posicionamiento simétrico y pegado a los costados:
      // Izquierda: a 25px del borde izquierdo
      // Derecha: a 25px de la barra de desplazamiento derecha
      const pxLeft = Math.max(leftMarginPx * 0.22, 25);
      const pxRight = Math.min(window.innerWidth - Math.max(rightMarginPx * 0.22, 25) - 12, window.innerWidth - 30);

      const targetXLeft = ((pxLeft / window.innerWidth) - 0.5) * 2 * halfW3D;
      const targetXRight = ((pxRight / window.innerWidth) - 0.5) * 2 * halfW3D;

      const scaleLeft = Math.min(Math.max(leftMarginPx / 180, 0.52), 0.90);
      const scaleRight = Math.min(Math.max(rightMarginPx / 180, 0.52), 0.90);

      if (cardLeft) {
        cardLeft.setOpacity(alphaLeft);
        cardLeft.group.scale.set(scaleLeft, scaleLeft, scaleLeft);
        cardLeft.group.position.x = targetXLeft;
        cardLeft.group.position.y = yLeft;
        if (alphaLeft > 0.01) {
          updateCardPhysics(cardLeft, dt, 0);
        }
      }

      if (cardRight) {
        cardRight.setOpacity(alphaRight);
        cardRight.group.scale.set(scaleRight, scaleRight, scaleRight);
        cardRight.group.position.x = targetXRight;
        cardRight.group.position.y = yRight;
        if (alphaRight > 0.01) {
          updateCardPhysics(cardRight, dt, 2.5);
        }
      }
    }
  }

  function renderLoop() {
    if (!isRunning) return;
    animationFrameId = requestAnimationFrame(renderLoop);

    const dt = clock ? Math.min(clock.getDelta(), 0.1) : 0.016;
    updateFrame(dt);

    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  }

  // API Pública
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
        setTimeout(() => { if (canvas) canvas.style.opacity = '1'; }, 30);
      }
      if (clock) clock.start();
      checkClassroomState();
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
        }, 500);
      }
    },

    onClassroomChanged: function () {
      checkClassroomState();
    },

    isActive: function () {
      return isRunning;
    },

    _debug: function () {
      return {
        state: { ...state },
        leftPos: cardLeft?.group?.position ? { x: cardLeft.group.position.x, y: cardLeft.group.position.y, z: cardLeft.group.position.z } : null,
        rightPos: cardRight?.group?.position ? { x: cardRight.group.position.x, y: cardRight.group.position.y, z: cardRight.group.position.z } : null,
        leftVis: cardLeft?.group?.visible,
        rightVis: cardRight?.group?.visible
      };
    }
  };

  window.EvaluationHologram = EvaluationHologram;
})();
