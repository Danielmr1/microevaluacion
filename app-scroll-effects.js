// =============================================================================
// app-scroll-effects.js — Microevaluación A5
// MÓDULO: EFECTOS DE SCROLL, TRANSICIONES CINEMÁTICAS Y SHARED ELEMENTS (GSAP)
//
// Responsabilidad única:
//   - Inicialización de ScrollTrigger para elevación de cabecera y scrub cinemático.
//   - Animación de zoom y desvanecimiento de la portada Hero.
//   - Transición fluida de elemento compartido (shared element transition) entre
//     tarjetas del Hub y la vista del asistente.
//   - Desplazamiento animado suave hacia la sección de modalidades.
// =============================================================================

    function initScrollTransitions() {
      if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

      // 1. Compactar y elevar cabecera con glassmorphism fluido al hacer scroll
      ScrollTrigger.create({
        start: 'top -15',
        end: 999999,
        toggleClass: {
          className: 'header-scrolled',
          targets: 'header'
        }
      });

      // 2. Efecto Scrub Hero Cinemático (Inspirado en el Robot del Modelo REA)
      // La Ficha ArUco Translúcida escala en acercamiento (zoom-in) y se desvanece suavemente
      // junto con el título frontal EVA para enfocar el 100% de la atención en Formativa con IA
      const hubContainer = document.querySelector('.cyber-hub-container');
      const ghostSheet = document.querySelector('.ghost-stage-sheet');
      const heroFront = document.querySelector('.hero-front-content');
      if (hubContainer && (ghostSheet || heroFront)) {
        const heroTL = gsap.timeline({
          scrollTrigger: {
            trigger: hubContainer,
            start: 'top top',
            end: () => window.innerWidth <= 768 ? 'bottom top' : 'bottom 20%',
            scrub: 0.6,
            invalidateOnRefresh: true,
            snap: {
              snapTo: [0, 1],
              directional: false,
              inertia: false,
              duration: { min: 0.25, max: 0.45 },
              delay: 0.08,
              ease: 'power1.inOut'
            }
          }
        });
        if (ghostSheet) {
          heroTL.to(ghostSheet, {
            scale: 1.25,
            opacity: 0,
            ease: 'power1.inOut'
          }, 0);
        }
        if (heroFront) {
          heroTL.to(heroFront, {
            y: -50,
            opacity: 0,
            ease: 'power1.in'
          }, 0);
        }
        heroTL.to('.hub-scroll-down', {
          opacity: 0,
          duration: 0.25
        }, 0);
      }

      // 3. Escenario Fijado Interactivo (Pinned Stage - Modelo REA)
      const targetSection = document.querySelector('#target-section');
      const progressBar = document.querySelector('#target-progress-bar .loaded');
      const stepsContainer = document.querySelector('#target-section .steps');
      const items = gsap.utils.toArray('#target-section .target-stage .item');
      const headTitles = [
        document.getElementById('stage-head-1'),
        document.getElementById('stage-head-2'),
        document.getElementById('stage-head-3')
      ];

      if (targetSection && items.length >= 3) {
        ScrollTrigger.matchMedia({
          // ESCRITORIO (> 768px): Experiencia interactiva de 2 columnas con scroll fijado
          "(min-width: 769px)": function() {
            ScrollTrigger.create({
              trigger: '#target-section',
              start: 'top 15%',
              end: 'bottom 85%',
              pin: '#target-section .head',
              pinSpacing: false,
              invalidateOnRefresh: true
            });

            // Frases descriptivas pedagógicas para el efecto de revelado de texto de izquierda a derecha
            const desc1 = items[0] ? items[0].querySelector('.item-title') : null;
            const desc2 = items[1] ? items[1].querySelector('.item-title') : null;
            const desc3 = items[2] ? items[2].querySelector('.item-title') : null;

            // Asegurar que el primer ítem y su título comiencen 100% nítidos y visibles
            gsap.set(items[0], { opacity: 1, filter: 'blur(0px)', scale: 1 });
            if (headTitles[0]) gsap.set(headTitles[0], { opacity: 1, y: 0, pointerEvents: 'auto', zIndex: 10 });
            if (headTitles[1]) gsap.set(headTitles[1], { opacity: 0, y: 10, pointerEvents: 'none', zIndex: 1 });
            if (headTitles[2]) gsap.set(headTitles[2], { opacity: 0, y: 10, pointerEvents: 'none', zIndex: 1 });

            // Inicializar llenado en 0% para las frases de las modalidades
            if (desc1) gsap.set(desc1, { '--fill': '0%' });
            if (desc2) gsap.set(desc2, { '--fill': '0%' });
            if (desc3) gsap.set(desc3, { '--fill': '0%' });

            // Entrada inicial: Al llegar a la sección de modalidades,
            // "Diagnóstico Profundo del Aprendizaje" se llena de color negro de izquierda a derecha al hacer scroll
            if (desc1) {
              gsap.fromTo(desc1, 
                { '--fill': '0%' },
                {
                  '--fill': '100%',
                  ease: 'power1.out',
                  scrollTrigger: {
                    trigger: '#target-section',
                    start: 'top 75%',
                    end: 'top 20%',
                    scrub: 0.5
                  }
                }
              );
            }

            // Línea de tiempo maestra que coordina las 3 etapas al hacer scroll con imán magnético
            const stageTL = gsap.timeline({
              scrollTrigger: {
                trigger: '#target-section',
                start: 'top 20%',
                end: 'bottom 90%',
                scrub: 0.5,
                invalidateOnRefresh: true,
                snap: {
                  snapTo: [0, 0.5, 1],
                  directional: false,
                  inertia: false,
                  duration: { min: 0.25, max: 0.45 },
                  delay: 0.08,
                  ease: 'power1.inOut'
                }
              }
            });

            // Etapa 1 -> Sostiene la visibilidad inicial (Hold 1 - progress 0.0) y llena el primer tercio
            stageTL.to(progressBar, { scaleY: 0.33, ease: 'none', duration: 0.5 });

            // Transición Etapa 1 -> Etapa 2 (Focalizada en la Respuesta)
            stageTL
              .to(items[0], { opacity: 0.08, scale: 0.96, duration: 0.8, ease: 'power1.in' })
              .to(headTitles[0], { opacity: 0, y: -10, duration: 0.5, ease: 'power1.in', pointerEvents: 'none', zIndex: 1 }, '<')
              .to(stepsContainer, { yPercent: -33.33, duration: 0.8, ease: 'power2.inOut' }, '<')
              .to(progressBar, { scaleY: 0.66, ease: 'none', duration: 0.8 }, '<')
              .fromTo(items[1], 
                { opacity: 0.08, scale: 0.96 },
                { opacity: 1, filter: 'blur(0px)', scale: 1, duration: 0.8, ease: 'power2.out' },
                '<'
              )
              .to(headTitles[1], { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out', pointerEvents: 'auto', zIndex: 10 }, '<0.1')
              // "Verificación Ágil de Contenidos" se llena de color negro de izquierda a derecha
              .fromTo(desc2, { '--fill': '0%' }, { '--fill': '100%', duration: 0.9, ease: 'power1.out' }, '>');

            // Sostiene la visibilidad de la Etapa 2 (Hold 2) en el centro exacto (progress 0.5)
            stageTL.to({}, { duration: 0.5 });

            // Transición Etapa 2 -> Etapa 3 (Cartilla OMR)
            stageTL
              .to(items[1], { opacity: 0.08, scale: 0.96, duration: 0.8, ease: 'power1.in' })
              .to(headTitles[1], { opacity: 0, y: -10, duration: 0.5, ease: 'power1.in', pointerEvents: 'none', zIndex: 1 }, '<')
              .to(stepsContainer, { yPercent: -66.66, duration: 0.8, ease: 'power2.inOut' }, '<')
              .to(progressBar, { scaleY: 1.0, ease: 'none', duration: 1 }, '<')
              .fromTo(items[2], 
                { opacity: 0.08, scale: 0.96 },
                { opacity: 1, filter: 'blur(0px)', scale: 1, duration: 0.8, ease: 'power2.out' },
                '<'
              )
              .to(headTitles[2], { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out', pointerEvents: 'auto', zIndex: 10 }, '<0.1')
              // "Calificación Óptica Instantánea" se llena de color negro de izquierda a derecha
              .fromTo(desc3, { '--fill': '0%' }, { '--fill': '100%', duration: 0.9, ease: 'power1.out' }, '>');

            // Sostiene la visibilidad de la Etapa 3 (Hold 3) al final (progress 1.0)
            stageTL.to({}, { duration: 0.5 });
          },

          // MÓVIL (<= 768px): Transición Cross-Fade en el mismo lugar con imán magnético
          "(max-width: 768px)": function() {
            const mdesc1 = items[0] ? items[0].querySelector('.item-title') : null;
            const mdesc2 = items[1] ? items[1].querySelector('.item-title') : null;
            const mdesc3 = items[2] ? items[2].querySelector('.item-title') : null;

            // Inicializar llenado en 0% para todas las frases descriptivas móviles
            if (mdesc1) gsap.set(mdesc1, { '--fill': '0%' });
            if (mdesc2) gsap.set(mdesc2, { '--fill': '0%' });
            if (mdesc3) gsap.set(mdesc3, { '--fill': '0%' });

            // Entrada inicial móvil: Al llegar a la sección de modalidades
            if (mdesc1) {
              gsap.fromTo(mdesc1,
                { '--fill': '0%' },
                {
                  '--fill': '100%',
                  ease: 'power1.out',
                  scrollTrigger: {
                    trigger: '#target-section',
                    start: 'top 75%',
                    end: 'top 20%',
                    scrub: 0.4
                  }
                }
              );
            }

            // Estado inicial: solo el ítem 1 es visible, ítem 2 y 3 invisibles
            gsap.set(items[0], { autoAlpha: 1, y: 0 });
            gsap.set(items[1], { autoAlpha: 0, y: 18 });
            gsap.set(items[2], { autoAlpha: 0, y: 18 });

            const mobileTL = gsap.timeline({
              scrollTrigger: {
                trigger: '#target-section',
                start: 'top top',
                end: 'bottom bottom',
                scrub: 0.6,
                invalidateOnRefresh: true,
                snap: {
                  snapTo: [0, 0.5, 1],
                  directional: false,
                  inertia: false,
                  duration: { min: 0.25, max: 0.45 },
                  delay: 0.08,
                  ease: 'power1.inOut'
                }
              }
            });

            // 1. Mantener ítem 1 visible al inicio (Hold 1 - progress 0.0)
            mobileTL.to({}, { duration: 0.5 });

            // 2. Transición Ítem 1 -> Ítem 2 (Focalizada en la Respuesta)
            mobileTL
              .to(items[0], { autoAlpha: 0, y: -18, duration: 0.6, ease: 'power1.in' })
              .to(items[1], { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power2.out' }, '-=0.1')
              .fromTo(mdesc2, { '--fill': '0%' }, { '--fill': '100%', duration: 0.8, ease: 'power1.out' }, '>');

            // 3. Mantener ítem 2 visible para lectura cómoda (Hold 2 - centro exacto en progress 0.5)
            mobileTL.to({}, { duration: 0.5 });

            // 4. Transición Ítem 2 -> Ítem 3 (Cartilla OMR)
            mobileTL
              .to(items[1], { autoAlpha: 0, y: -18, duration: 0.6, ease: 'power1.in' })
              .to(items[2], { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power2.out' }, '-=0.1')
              .fromTo(mdesc3, { '--fill': '0%' }, { '--fill': '100%', duration: 0.8, ease: 'power1.out' }, '>');

            // 5. Mantener ítem 3 visible al final (Hold 3 - progress 1.0)
            mobileTL.to({}, { duration: 0.5 });
          }
        });
      }
    }
    window.initScrollTransitions = initScrollTransitions;

    function scrollToHubStage() {
      const el = document.getElementById('target-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    window.scrollToHubStage = scrollToHubStage;

    function playSharedElementTransition(branch, onSetupView) {
      if (typeof gsap === 'undefined') {
        if (typeof onSetupView === 'function') onSetupView();
        return;
      }

      // Identificar el elemento de origen correspondiente a la rama seleccionada
      const stageIdx = branch === 'rama1' ? 0 : (branch === 'rama2' ? 1 : 2);
      const isMobile = window.innerWidth <= 768;
      let originEl = null;

      if (isMobile) {
        const mobileHeaders = document.querySelectorAll('#target-section .mobile-stage-header');
        originEl = mobileHeaders[stageIdx] ? mobileHeaders[stageIdx].querySelector('.mobile-stage-title') : null;
      } else {
        const headInfo = document.getElementById(`stage-head-${stageIdx + 1}`);
        originEl = headInfo ? headInfo.querySelector('.h1') : null;
      }

      // Si no hay elemento o está oculto por scroll extremo, cambiar de forma instantánea
      if (!originEl || originEl.offsetParent === null) {
        if (typeof onSetupView === 'function') onSetupView();
        return;
      }

      const startRect = originEl.getBoundingClientRect();
      const text = originEl.textContent.trim();

      // Configurar inmediatamente el estado interno de la vista y barra superior
      if (typeof onSetupView === 'function') onSetupView();

      const targetEl = document.getElementById('topbar-app-title');
      if (!targetEl) return;

      const targetRect = targetEl.getBoundingClientRect();
      if (!targetRect || targetRect.width === 0) return;

      // Crear el elemento compartido flotante (clon que realiza el vuelo)
      const flyer = document.createElement('div');
      flyer.className = 'shared-element-flyer';
      flyer.textContent = text;

      const computedStart = window.getComputedStyle(originEl);
      Object.assign(flyer.style, {
        position: 'fixed',
        top: `${startRect.top}px`,
        left: `${startRect.left}px`,
        width: `${startRect.width}px`,
        height: `${startRect.height}px`,
        fontSize: computedStart.fontSize,
        fontWeight: '900',
        fontFamily: computedStart.fontFamily,
        letterSpacing: computedStart.letterSpacing,
        lineHeight: computedStart.lineHeight,
        color: '#0f172a',
        background: '#ffffff00',
        border: '1px solid transparent',
        borderRadius: '9999px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: '0px 4px',
        margin: '0px',
        boxSizing: 'border-box',
        zIndex: '99999',
        pointerEvents: 'none',
        whiteSpace: 'nowrap'
      });

      document.body.appendChild(flyer);

      // Ocultar temporalmente el elemento destino fijo hasta que el flyer aterrice
      targetEl.style.visibility = 'hidden';

      // Entrada suave del contenedor wizard de preparación
      const viewCreate = document.getElementById('view-create');
      if (viewCreate) {
        gsap.fromTo(viewCreate, 
          { opacity: 0, y: 16 }, 
          { opacity: 1, y: 0, duration: 0.38, ease: 'power2.out', delay: 0.08 }
        );
      }

      // Vuelo FLIP hacia la pastilla en la barra superior
      gsap.to(flyer, {
        top: targetRect.top,
        left: targetRect.left,
        width: targetRect.width,
        height: targetRect.height,
        fontSize: '0.82rem',
        fontWeight: '800',
        padding: '6px 16px',
        background: '#ffffff',
        borderColor: '#e2e8f0',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.06)',
        justifyContent: 'center',
        duration: 0.44,
        ease: 'power3.inOut',
        onComplete: () => {
          targetEl.style.visibility = 'visible';
          if (flyer.parentNode) flyer.parentNode.removeChild(flyer);
        }
      });
    }

// ── EXPOSICIÓN GLOBAL DE FUNCIONES DE EFECTOS DE SCROLL ──
if (typeof window !== 'undefined') {
  window.initScrollTransitions = initScrollTransitions;
  window.scrollToHubStage = scrollToHubStage;
  window.playSharedElementTransition = playSharedElementTransition;
}
