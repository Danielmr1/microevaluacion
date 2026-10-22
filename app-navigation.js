// =============================================================================
// app-navigation.js — Microevaluación A5 v3.2.61
// MÓDULO: NAVEGACIÓN, HUB INTERACTIVO, VISTAS Y AUTENTICACIÓN
// =============================================================================
// =============================================================================
// VARIABLES GLOBALES DE ESTADO DE LA APLICACIÓN
// =============================================================================
var activeTab = 'create';
var wizardClassroomId = null;
var wizardEvalType = null;
var wizardEval = null;
var currentFlow = 'hub';
var usuarioMontadoEnPantalla = null;

if (typeof window !== 'undefined') {
  window.activeTab = activeTab;
  window.wizardClassroomId = wizardClassroomId;
  window.wizardEvalType = wizardEvalType;
  window.wizardEval = wizardEval;
  window.currentFlow = currentFlow;
}

// activeTab defined in globals

    function showToast(msg) {
      const t = document.getElementById('toast-msg');
      if (!t) return;
      t.textContent = msg;
      t.style.display = 'block';
      setTimeout(() => { t.style.display = 'none'; }, 2800);
    }

    function switchTab(tabId) {
      activeTab = tabId;
      const tabBtnCreate = document.getElementById('tab-btn-create');
      const tabBtnScan = document.getElementById('tab-btn-scan');
      if (tabBtnCreate) tabBtnCreate.classList.toggle('active', tabId === 'create');
      if (tabBtnScan) tabBtnScan.classList.toggle('active', tabId === 'scan');

      showView(tabId === 'create' ? 'eval' : 'scan');

      // La linterna solo está disponible en la pestaña de escáner.
      // (El botón de cambiar a cámara frontal se quitó: no aportaba nada al
      // escanear una ficha sobre el pupitre.)
      const btnTorch = document.getElementById('btn-torch');
      if (btnTorch) btnTorch.style.display = (tabId === 'scan') ? 'flex' : 'none';

      // GUARDRAIL 7: Al entrar al tab de escáner, verificar si hay sesión configurada
      if (tabId === 'scan') {
        const session = ClassroomData.getActiveSession();
        // Guardarraíl Nivel 3: Límite diario de 2 sesiones formativas completas con IA
        if (session) {
          const isFormativa = (session.branch === 'rama1') || (session.branchTitle && session.branchTitle.toLowerCase().includes('formativa')) || (session.correctionMode === 'ai' || (!session.branch && session.rubric && session.type !== 'mc'));
          if (isFormativa) {
            const sessId = session.id || session.sessionId || session.sessionRef || 'formativa_active';
            if (typeof DailyQuota !== 'undefined' && !DailyQuota.canConsume('formativeSessions', sessId)) {
              showToast('⚠️ Límite de 2 sesiones formativas con IA alcanzado por hoy.');
              alert('⚠️ Límite Diario de Formativa con IA Alcanzado:\n\nHas utilizado tus 2 sesiones formativas completas de IA el día de hoy.\n\nPara continuar evaluando, te recomendamos utilizar la modalidad Cartilla OMR o Focalizada en la Respuesta, las cuales son 100% locales, ultrarrápidas y no consumen cuota de IA.');
              switchTab('create');
              return;
            }
            if (typeof DailyQuota !== 'undefined') {
              DailyQuota.consume('formativeSessions', sessId);
            }
          }
        }
        const sessionValid = !!(session && session.expectedAnswer && session.expectedAnswer.trim() !== ''
                             && session.prompt && session.prompt.trim() !== '');

        const g7Banner = document.getElementById('g7-no-session-banner');
        if (g7Banner) g7Banner.style.display = sessionValid ? 'none' : 'flex';

        if (session && typeof Scanner !== 'undefined' && Scanner.setSession) {
          Scanner.setSession(session.classroomId, session.evalId);
        }
        if (session && typeof updateScannerSessionBar === 'function') {
          updateScannerSessionBar(session);
        }

        if (typeof showScannerOrientationHint === 'function') {
          showScannerOrientationHint();
        }

        // La línea del estado vacío sale del MISMO control que usa el botón de la
        // cámara, así no pueden contradecirse.
        updatePlaceholderHint();
      }
    }

    /**
     * Ajusta el texto del estado vacío del visor.
     * Delega en estadoParaEscanear() para que diga EXACTAMENTE lo mismo que va a
     * hacer el botón de la cámara: si el visor dice "tocá Iniciar Cámara", el
     * botón tiene que arrancar.
     */
    function updatePlaceholderHint() {
      const hint = document.getElementById('placeholder-hint');
      if (!hint) return;

      const estado = estadoParaEscanear();
      hint.textContent = estado.ok ? estado.detalle : ('⚠️ ' + estado.detalle);
      hint.style.color = estado.ok ? '#64748b' : '#f59e0b';
    }

    // ── Estado interno del wizard ──
    var wizardClassroomId = null;
    var wizardEvalType = null; // 'mc1' | 'mc2' | 'free'
    var wizardEval = null;     // { id, title, prompt, expectedAnswer, type, ... }

    /* ── NAVEGACIÓN Y CONTROLADOR DE FLUJOS (v3.1.28) ── */
// currentFlow defined in globals

    function onBrandClick() {
      if (currentFlow === 'hub') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
    window.onBrandClick = onBrandClick;

    function updateTopbarModeTitle(branch) {
      const mainActionsEl = document.getElementById('topbar-main-actions');
      const titleEl = document.getElementById('topbar-app-title');
      const iconEl = document.getElementById('topbar-brand-icon');
      const tagEl = document.getElementById('topbar-version-tag');
      const brandEl = document.getElementById('topbar-island-brand');

      if (branch === 'classrooms' || branch === 'bank' || branch === 'saved-sessions' || branch === 'rama3' || branch === 'rama2' || branch === 'rama1') {
        if (mainActionsEl) mainActionsEl.style.display = 'none';
        if (brandEl) {
          brandEl.style.display = 'flex';
          brandEl.style.cursor = 'default';
          brandEl.style.pointerEvents = 'none';
        }
        if (iconEl) iconEl.style.display = 'none';
        if (tagEl) tagEl.style.display = 'none';

        if (titleEl) {
          titleEl.style.display = 'inline-flex';
          titleEl.classList.add('topbar-modality-pill');
          if (branch === 'classrooms') {
            titleEl.textContent = 'Salones';
          } else if (branch === 'bank') {
            titleEl.textContent = 'Banco de Preguntas';
          } else if (branch === 'saved-sessions') {
            const count = (typeof ClassroomData !== 'undefined' && ClassroomData.getSavedSessions)
              ? ClassroomData.getSavedSessions().length
              : 0;
            const max = (typeof ClassroomData !== 'undefined' && ClassroomData.MAX_SAVED_SESSIONS) || 8;
            titleEl.textContent = count > 0 ? `${count}/${max} Sesiones` : 'Sesiones';
          } else if (branch === 'rama3') {
            titleEl.textContent = 'Cartilla OMR';
          } else if (branch === 'rama2') {
            titleEl.textContent = 'Focalizada en la respuesta';
          } else if (branch === 'rama1') {
            titleEl.textContent = 'Formativa con IA';
          }
        }
      } else {
        // En el Hub de inicio: mostramos los 3 botones principales de barra superior y ocultamos el indicador de modalidad
        if (mainActionsEl) mainActionsEl.style.display = 'inline-flex';
        if (brandEl) brandEl.style.display = 'none';
        if (titleEl) titleEl.style.display = 'none';
      }
    }
    window.updateTopbarModeTitle = updateTopbarModeTitle;

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

            // Títulos de cabecera para el efecto de revelado de texto de izquierda a derecha
            const t1 = headTitles[0] ? headTitles[0].querySelector('.h1') : null;
            const t2 = headTitles[1] ? headTitles[1].querySelector('.h1') : null;
            const t3 = headTitles[2] ? headTitles[2].querySelector('.h1') : null;

            // Asegurar que el primer ítem y su título comiencen 100% nítidos y visibles
            gsap.set(items[0], { opacity: 1, filter: 'blur(0px)', scale: 1 });
            if (headTitles[0]) gsap.set(headTitles[0], { opacity: 1, y: 0 });
            if (headTitles[1]) gsap.set(headTitles[1], { opacity: 0, y: 10 });
            if (headTitles[2]) gsap.set(headTitles[2], { opacity: 0, y: 10 });

            // Inicializar llenado en 0% para todas las modalidades
            if (t1) gsap.set(t1, { '--fill': '0%' });
            if (t2) gsap.set(t2, { '--fill': '0%' });
            if (t3) gsap.set(t3, { '--fill': '0%' });

            // Entrada inicial: Al llegar a la sección de modalidades, el título 1 ("Formativa con IA")
            // se llena de color negro desde la izquierda a la derecha al hacer scroll
            if (t1) {
              gsap.fromTo(t1, 
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
              .to(headTitles[0], { opacity: 0, y: -10, duration: 0.6, ease: 'power1.in' }, '<')
              .to(headTitles[1], { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }, '<0.2')
              .fromTo(t2, { '--fill': '0%' }, { '--fill': '100%', duration: 0.7, ease: 'power1.out' }, '<')
              .to(stepsContainer, { yPercent: -33.33, duration: 0.8, ease: 'power2.inOut' }, '<')
              .to(progressBar, { scaleY: 0.66, ease: 'none', duration: 0.8 }, '<')
              .fromTo(items[1], 
                { opacity: 0.08, scale: 0.96 },
                { opacity: 1, filter: 'blur(0px)', scale: 1, duration: 0.8, ease: 'power2.out' },
                '<'
              );

            // Sostiene la visibilidad de la Etapa 2 (Hold 2) en el centro exacto (progress 0.5)
            stageTL.to({}, { duration: 0.6 });

            // Transición Etapa 2 -> Etapa 3 (Cartilla OMR)
            stageTL
              .to(items[1], { opacity: 0.08, scale: 0.96, duration: 0.8, ease: 'power1.in' })
              .to(headTitles[1], { opacity: 0, y: -10, duration: 0.6, ease: 'power1.in' }, '<')
              .to(headTitles[2], { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }, '<0.2')
              .fromTo(t3, { '--fill': '0%' }, { '--fill': '100%', duration: 0.7, ease: 'power1.out' }, '<')
              .to(stepsContainer, { yPercent: -66.66, duration: 0.8, ease: 'power2.inOut' }, '<')
              .to(progressBar, { scaleY: 1.0, ease: 'none', duration: 1 }, '<')
              .fromTo(items[2], 
                { opacity: 0.08, scale: 0.96 },
                { opacity: 1, filter: 'blur(0px)', scale: 1, duration: 0.8, ease: 'power2.out' },
                '<'
              );

            // Sostiene la visibilidad de la Etapa 3 (Hold 3) al final (progress 1.0)
            stageTL.to({}, { duration: 0.5 });
          },

          // MÓVIL (<= 768px): Transición Cross-Fade en el mismo lugar con imán magnético
          "(max-width: 768px)": function() {
            const mt1 = items[0] ? items[0].querySelector('.mobile-stage-title') : null;
            const mt2 = items[1] ? items[1].querySelector('.mobile-stage-title') : null;
            const mt3 = items[2] ? items[2].querySelector('.mobile-stage-title') : null;

            // Inicializar llenado en 0% para todas las modalidades móviles
            if (mt1) gsap.set(mt1, { '--fill': '0%' });
            if (mt2) gsap.set(mt2, { '--fill': '0%' });
            if (mt3) gsap.set(mt3, { '--fill': '0%' });

            // Entrada inicial móvil: Al llegar a la sección de modalidades
            if (mt1) {
              gsap.fromTo(mt1,
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
              .to(items[0], { autoAlpha: 0, y: -18, duration: 0.8, ease: 'power1.in' })
              .to(items[1], { autoAlpha: 1, y: 0, duration: 0.8, ease: 'power2.out' }, '-=0.2')
              .fromTo(mt2, { '--fill': '0%' }, { '--fill': '100%', duration: 0.7, ease: 'power1.out' }, '<');

            // 3. Mantener ítem 2 visible para lectura cómoda (Hold 2 - centro exacto en progress 0.5)
            mobileTL.to({}, { duration: 0.6 });

            // 4. Transición Ítem 2 -> Ítem 3 (Cartilla OMR)
            mobileTL
              .to(items[1], { autoAlpha: 0, y: -18, duration: 0.8, ease: 'power1.in' })
              .to(items[2], { autoAlpha: 1, y: 0, duration: 0.8, ease: 'power2.out' }, '-=0.2')
              .fromTo(mt3, { '--fill': '0%' }, { '--fill': '100%', duration: 0.7, ease: 'power1.out' }, '<');

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

    function showView(flowName) {
      currentFlow = flowName;
      const viewHub = document.getElementById('view-hub');
      const viewCreate = document.getElementById('view-create');
      const viewClassrooms = document.getElementById('view-classrooms');
      const viewBank = document.getElementById('view-bank');
      const viewSavedSessions = document.getElementById('view-saved-sessions');
      const viewScan = document.getElementById('view-scan');

      const headerEl = document.querySelector('header');
      if (headerEl) {
        if (flowName === 'scan') {
          headerEl.classList.remove('header-light');
          headerEl.classList.add('header-dark');
        } else {
          headerEl.classList.remove('header-dark');
          headerEl.classList.add('header-light');
        }
      }

      if (viewHub) viewHub.classList.toggle('active', flowName === 'hub');
      if (viewCreate) viewCreate.classList.toggle('active', flowName === 'eval');
      if (viewClassrooms) viewClassrooms.classList.toggle('active', flowName === 'classrooms');
      if (viewBank) viewBank.classList.toggle('active', flowName === 'bank');
      if (viewSavedSessions) viewSavedSessions.classList.toggle('active', flowName === 'saved-sessions');
      if (viewScan) viewScan.classList.toggle('active', flowName === 'scan');

      // Botón INICIO en la barra superior: oculto en el Hub de inicio, visible en cualquier otra vista
      const btnHome = document.getElementById('topbar-btn-home');
      if (btnHome) {
        if (flowName === 'hub') {
          btnHome.classList.add('is-hidden');
          btnHome.style.setProperty('display', 'none', 'important');
        } else {
          btnHome.classList.remove('is-hidden');
          btnHome.style.setProperty('display', 'inline-flex', 'important');
        }
      }

      if (typeof ScrollTrigger !== 'undefined') {
        setTimeout(() => ScrollTrigger.refresh(), 80);
      }

      // Linterna solo en escáner
      const btnTorch = document.getElementById('btn-torch');
      if (btnTorch) btnTorch.style.display = (flowName === 'scan') ? 'flex' : 'none';

      if (flowName === 'hub') {
        updateTopbarModeTitle(null);
        updateHubSessionBadge();
        updateHubSavedSessionsBadge();
      } else if (flowName === 'eval') {
        if (window.isViewingSavedSessionsMode) {
          updateTopbarModeTitle('saved-sessions');
        } else {
          const curBranch = window.selectedBranch || (wizardEval && wizardEval.branch) || (typeof currentBranchMode !== 'undefined' ? currentBranchMode : 'rama1');
          updateTopbarModeTitle(curBranch);
        }
      } else if (flowName === 'classrooms') {
        updateTopbarModeTitle('classrooms');
      } else if (flowName === 'bank') {
        updateTopbarModeTitle('bank');
      } else if (flowName === 'saved-sessions') {
        updateTopbarModeTitle('saved-sessions');
      }
    }

    function openFlow(flowName) {
      if (flowName === 'eval') {
        window.isViewingSavedSessionsMode = false;
        showView('eval');
        const session = ClassroomData.getActiveSession();
        if (!session || !session.classroomId) {
          const stepClass = document.getElementById('step-classroom');
          if (stepClass) stepClass.style.display = 'block';
          const sel = document.getElementById('builder-classroom');
          if (sel && sel.value) {
            onClassroomSelectChanged(sel.value);
          }
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (flowName === 'classrooms') {
        const session = ClassroomData.getActiveSession();
        if (session && session.classroomId) {
          const cls = ClassroomData.getClassroom(session.classroomId);
          const clsName = cls ? cls.name : 'el salón actual';
          showToast(`⚠️ Hay una evaluación en marcha para "${clsName}". Finaliza o reinicia la sesión antes de editar salones o nóminas.`);
          return;
        }
        showView('classrooms');
        renderClassroomManager();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (flowName === 'bank') {
        showView('bank');
        openBankManagerModal();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (flowName === 'saved-sessions') {
        const sessions = (typeof ClassroomData !== 'undefined' && ClassroomData.getSavedSessions)
          ? ClassroomData.getSavedSessions()
          : [];
        if (sessions.length > 0) {
          window.isViewingSavedSessionsMode = true;
          loadAndActivateSavedSession(sessions[0].id);
          window.scrollTo({ top: 0, behavior: 'smooth' });

          // Sincronización en segundo plano con Supabase para incorporar sesiones creadas en otros dispositivos (ej. celular)
          if (typeof ClassroomData !== 'undefined' && typeof ClassroomData.syncSessionsWithCloud === 'function') {
            ClassroomData.syncSessionsWithCloud().then(syncedList => {
              if (syncedList && syncedList.length !== sessions.length) {
                if (typeof renderSummarySessionsStrip === 'function') {
                  renderSummarySessionsStrip(sessions[0].id);
                }
                if (typeof updateHubSavedSessionsBadge === 'function') {
                  updateHubSavedSessionsBadge();
                }
              }
            }).catch(() => {});
          }
          return;
        }

        // Resiliencia: si la caché local no las tenía aún, consultar Supabase antes de abrir estado vacío
        if (typeof ClassroomData !== 'undefined' && typeof ClassroomData.syncSessionsWithCloud === 'function') {
          ClassroomData.syncSessionsWithCloud().then(cloudSess => {
            if (cloudSess && cloudSess.length > 0) {
              window.isViewingSavedSessionsMode = true;
              loadAndActivateSavedSession(cloudSess[0].id);
            } else {
              window.isViewingSavedSessionsMode = false;
              showView('saved-sessions');
              if (typeof openSavedSessionsModal === 'function') {
                openSavedSessionsModal();
              }
            }
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }).catch(() => {
            window.isViewingSavedSessionsMode = false;
            showView('saved-sessions');
            if (typeof openSavedSessionsModal === 'function') {
              openSavedSessionsModal();
            }
            window.scrollTo({ top: 0, behavior: 'smooth' });
          });
          return;
        }

        window.isViewingSavedSessionsMode = false;
        showView('saved-sessions');
        if (typeof openSavedSessionsModal === 'function') {
          openSavedSessionsModal();
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
    window.openFlow = openFlow;

    function openBranchFlow(branch) {
      window.isViewingSavedSessionsMode = false;
      window.selectedBranch = branch;
      showView('eval');

      // Iniciar de cero sin nada previamente guardado
      ClassroomData.setActiveSession(null);
      wizardClassroomId = null;
      wizardEval = null;
      wizardEvalType = null;
      if (typeof resetRama3Builder === 'function') {
        resetRama3Builder();
      }

      // Paso 1: selector de salón vacío (— Elige un salón —) con acciones visibles
      renderClassroomSelect();
      const sel = document.getElementById('builder-classroom');
      if (sel) {
        sel.value = '';
        sel.style.borderColor = '';
        sel.style.color = '';
      }
      renderGradeSelect(null);
      updateClassroomActionsVisibility(null);

      const badge = document.getElementById('nav-students-badge');
      if (badge) badge.textContent = '0 Alumnos';

      const stepClass = document.getElementById('step-classroom');
      if (stepClass) stepClass.style.display = 'block';

      // Ocultar paso 2, 3, etc. y limpiar contenedores
      hideWizardSteps();

      if (typeof clearGeneratedPdfContainers === 'function') {
        clearGeneratedPdfContainers();
      }

      // Configurar modo de la rama elegida
      if (typeof selectBranchMode === 'function') {
        selectBranchMode(branch);
      }

      // Título en la cabecera fija
      updateTopbarModeTitle(branch);

      // Garantizar que el Paso 2 permanezca oculto hasta que el docente elija un salón
      const stepType = document.getElementById('step-eval-type');
      if (stepType) stepType.style.display = 'none';

      const stepSummary = document.getElementById('step-summary');
      if (stepSummary) stepSummary.style.display = 'none';

      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.openBranchFlow = openBranchFlow;

    function goHomeHub() {
      if (typeof Scanner !== 'undefined' && Scanner.stopCamera) {
        try { Scanner.stopCamera(); } catch (e) {}
      }
      document.body.classList.remove('camera-active');
      document.title = 'Microevaluación';
      closeBankManagerModal();
      if (typeof closeSavedSessionsModal === 'function') closeSavedSessionsModal();
      if (typeof clearGeneratedPdfContainers === 'function') {
        clearGeneratedPdfContainers();
      } else {
        const pages = document.getElementById('pages-container');
        if (pages) { pages.innerHTML = ''; pages.style.display = 'none'; }
        const booklet = document.getElementById('booklet-container');
        if (booklet) { booklet.innerHTML = ''; booklet.style.display = 'none'; }
      }

      // Limpiar sesión activa y reiniciar estado para nuevo inicio limpio
      window.isViewingSavedSessionsMode = false;
      ClassroomData.setActiveSession(null);
      wizardClassroomId = null;
      wizardEval = null;
      wizardEvalType = null;
      if (typeof resetRama3Builder === 'function') {
        resetRama3Builder();
      }

      const sel = document.getElementById('builder-classroom');
      if (sel) {
        sel.value = '';
        sel.style.borderColor = '';
        sel.style.color = '';
      }
      renderGradeSelect(null);
      updateClassroomActionsVisibility(null);
      const badge = document.getElementById('nav-students-badge');
      if (badge) badge.textContent = '0 Alumnos';
      hideWizardSteps();

      showView('hub');
      if (typeof updateHubSavedSessionsBadge === 'function') updateHubSavedSessionsBadge();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function updateHubSessionBadge() {
      const badge = document.getElementById('hub-session-badge');
      if (!badge) return;
      const session = ClassroomData.getActiveSession();
      if (session && session.classroomId) {
        const cls = ClassroomData.getClassroom(session.classroomId);
        badge.style.display = 'inline-block';
        badge.textContent = cls ? `EN CURSO (${cls.name})` : 'EN CURSO';
      } else {
        badge.style.display = 'none';
      }
    }


    // [classroom-manager.js] GESTOR DE SALONES + ALUMNOS extraído en Tanda 3 (v3.1.31)

    /**
     * Oculta o muestra los botones de creación e importación de salón en el Paso 1.
     * Si hay un salón seleccionado (classId no vacío), se ocultan para mantener limpia la vista.
     */
    function updateClassroomActionsVisibility(classId) {
      const group = document.getElementById('classroom-actions-group');
      if (group) {
        group.style.display = classId ? 'none' : 'block';
      }
    }


    function toggleUserMenu(event) {
      if (event) {
        event.stopPropagation();
        event.preventDefault();
      }
      const dropdown = document.getElementById('user-menu-dropdown');
      if (!dropdown) return;
      dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
    }
    window.toggleUserMenu = toggleUserMenu;

    function closeUserMenu() {
      const dropdown = document.getElementById('user-menu-dropdown');
      if (dropdown) dropdown.style.display = 'none';
    }
    window.closeUserMenu = closeUserMenu;

    // ── Dropdown de Gestor (Salones, Banco, Sesiones) ──
    function toggleGestorDropdown(event) {
      if (event) {
        event.stopPropagation();
      }
      const wrap = document.querySelector('.eva-gestor-wrap');
      if (wrap) {
        wrap.classList.toggle('open');
      }
    }
    window.toggleGestorDropdown = toggleGestorDropdown;

    function closeGestorDropdown() {
      const wrap = document.querySelector('.eva-gestor-wrap');
      if (wrap) wrap.classList.remove('open');
    }
    window.closeGestorDropdown = closeGestorDropdown;

    // Cerrar menús al hacer clic afuera o presionar Escape
    document.addEventListener('click', (e) => {
      const wrap = document.getElementById('user-menu-wrap');
      if (wrap && !wrap.contains(e.target)) {
        closeUserMenu();
      }
      const gestorWrap = document.querySelector('.eva-gestor-wrap');
      if (gestorWrap && !gestorWrap.contains(e.target)) {
        closeGestorDropdown();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeUserMenu();
        closeGestorDropdown();
      }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // GUARDARRAÍL DE CIBERSEGURIDAD: Cierre Automático por Inactividad (30 min)
    // ─────────────────────────────────────────────────────────────────────────
    const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos de inactividad
    let inactivityTimer = null;
    let lastActivityTracked = 0;

    function resetInactivityTimer() {
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
      }

      // Solo armar el temporizador si el usuario tiene una sesión iniciada
      const overlay = document.getElementById('login-overlay');
      const isLoggedOut = overlay && overlay.style.display !== 'none';
      if (isLoggedOut) return;

      inactivityTimer = setTimeout(async () => {
        await handleSignOut(true);
      }, INACTIVITY_TIMEOUT_MS);
    }

    function handleUserActivity() {
      const now = Date.now();
      // Throttle a cada 5 segundos para no sobrecargar eventos del navegador
      if (now - lastActivityTracked > 5000) {
        lastActivityTracked = now;
        resetInactivityTimer();
      }
    }

    ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'].forEach(evt => {
      window.addEventListener(evt, handleUserActivity, { passive: true });
    });

    function showLoginOverlay(isInactive = false) {
      const overlay = document.getElementById('login-overlay');
      if (overlay) overlay.style.display = 'flex';
      const userMenu = document.getElementById('user-menu-wrap');
      if (userMenu) userMenu.style.display = 'none';
      const inactNotice = document.getElementById('login-inactivity-notice');
      if (inactNotice) {
        inactNotice.style.display = isInactive ? 'block' : 'none';
      }
      closeUserMenu();
    }

    function hideLoginOverlay(user) {
      const overlay = document.getElementById('login-overlay');
      if (overlay) overlay.style.display = 'none';
      const userMenu = document.getElementById('user-menu-wrap');
      if (userMenu) userMenu.style.display = 'block';

      const inactNotice = document.getElementById('login-inactivity-notice');
      if (inactNotice) inactNotice.style.display = 'none';

      // Fallback SVG si el usuario no tiene avatar configurado
      const defaultAvatar = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2394a3b8'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";
      const avatarUrl = user.user_metadata?.avatar_url || defaultAvatar;

      const avatar = document.getElementById('user-avatar');
      if (avatar) avatar.src = avatarUrl;
      const avatarLarge = document.getElementById('user-menu-avatar-large');
      if (avatarLarge) avatarLarge.src = avatarUrl;

      const name = document.getElementById('user-name');
      const fullName = user.user_metadata?.full_name || 'Docente';
      if (name) name.textContent = fullName;
      const hubWelcome = document.getElementById('hub-welcome-title');
      if (hubWelcome) {
        const primerNombre = fullName.trim().split(/\s+/)[0];
        hubWelcome.textContent = `¡Hola, ${primerNombre}!`;
      }
      const email = document.getElementById('user-email');
      if (email) email.textContent = user.email || '';

      // Iniciar el temporizador de inactividad de 30 minutos
      resetInactivityTimer();
    }

    async function handleSignIn() {
      const btn = document.getElementById('btn-google-login');
      const err = document.getElementById('login-error');
      if (btn) { btn.style.opacity = '0.6'; btn.disabled = true; }
      if (err) err.style.display = 'none';
      try {
        if (typeof SupabaseClient === 'undefined' || !SupabaseClient.signInWithGoogle) {
          throw new Error('El servicio de autenticación aún está cargando. Espera un momento y vuelve a presionar.');
        }
        await SupabaseClient.signInWithGoogle();
      } catch (e) {
        if (err) {
          err.textContent = (e && e.message) || 'Error al conectar con Google. Intentá de nuevo.';
          err.style.display = 'block';
        }
        if (btn) { btn.style.opacity = '1'; btn.disabled = false; }
      }
    }
    window.handleSignIn = handleSignIn;

    async function handleSignOut(isInactive = false) {
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
      }
      // Detener cámara si estaba activa
      if (typeof Scanner !== 'undefined' && Scanner.stopCamera) {
        try { Scanner.stopCamera(); } catch (e) {}
      }
      // Limpiar sesión local
      ClassroomData.setActiveSession(null);
      wizardClassroomId = null;
      wizardEval = null;
      // Limpiar wizard UI
      resetWizard();
      const sel = document.getElementById('builder-classroom');
      if (sel) sel.innerHTML = '';
      const pages = document.getElementById('pages-container');
      if (pages) {
        pages.innerHTML = '';
        pages.style.display = 'none';
      }
      // Cerrar sesión Supabase
      if (typeof SupabaseClient !== 'undefined' && SupabaseClient.signOut) {
        await SupabaseClient.signOut();
      }
      showLoginOverlay(isInactive);
      if (isInactive) {
        showToast('Cerrado por inactividad.');
      }
    }
    window.handleSignOut = handleSignOut;

    /**
     * Carga los salones del docente desde Supabase y puebla el selector.
     * Si no tiene salones aún, el selector solo muestra un mensaje guía.
     */
    async function loadAndRenderClassrooms(user, selectClassroomId = null) {
      const classrooms = await SupabaseClient.loadClassrooms();
      const sel = document.getElementById('builder-classroom');
      if (!sel) return;
      sel.innerHTML = '<option value="">— Elige un salón —</option>';

      const noClsAlert = document.getElementById('no-classrooms-alert');
      if (classrooms.length === 0) {
        sel.innerHTML += '<option value="" disabled>No tienes salones aún. Crea uno en Mis Salones y Alumnos</option>';
        if (noClsAlert) noClsAlert.style.display = 'flex';
        syncClassroomsToLocal([]);
        renderGradeSelect(null);
        updateClassroomActionsVisibility(null);
        if (typeof renderClassroomManager === 'function') renderClassroomManager();
        return;
      }

      if (noClsAlert) noClsAlert.style.display = 'none';

      classrooms.forEach(cls => {
        const opt = document.createElement('option');
        opt.value = cls.id;  // UUID del salón en Supabase
        opt.textContent = `${cls.name}  (${(cls.microeval_students || []).length} alumnos)`;
        opt.dataset.color = cls.color || '#3b82f6';
        sel.appendChild(opt);
      });

      // Guardar en ClassroomData local para compatibilidad con el resto del sistema
      syncClassroomsToLocal(classrooms);

      if (selectClassroomId) {
        sel.value = selectClassroomId;
        onClassroomSelectChanged(selectClassroomId);
      } else {
        renderGradeSelect(sel.value || null);
        updateClassroomActionsVisibility(sel.value || null);
      }

      if (typeof renderClassroomManager === 'function') renderClassroomManager();
    }

    /**
     * Convierte los salones de Supabase al formato que espera ClassroomData localmente.
     * Permite que scanner.js siga leyendo de ClassroomData.getClassroom() sin cambios.
     */
    function syncClassroomsToLocal(classrooms) {
      if (typeof ClassroomData === 'undefined' || !ClassroomData.setClassrooms) return;
      const mapped = classrooms.map((cls, idx) => ({
        id: cls.id,
        name: cls.name,
        gradeCode: cls.grade_code,
        // Si la migración de grade_stage todavía no se aplicó, estas dos
        // propiedades llegan undefined y el salón queda "sin grado".
        gradeStage: cls.grade_stage,
        gradeLevel: cls.grade_level,
        color: cls.color || '#3b82f6',
        students: (cls.microeval_students || []).map(s => ({
          id: s.student_code,
          name: s.full_name,
          shortName: s.short_name || generateShortName(s.full_name)
        }))
      }));
      ClassroomData.setClassrooms(mapped);
      if (mapped.length > 0 && typeof ClassroomData.purgeNonCompliantData === 'function') {
        ClassroomData.purgeNonCompliantData();
      }
      if (typeof ClassroomData !== 'undefined' && ClassroomData.syncSessionsWithCloud) {
        ClassroomData.syncSessionsWithCloud().then(() => {
          if (typeof updateHubSavedSessionsBadge === 'function') updateHubSavedSessionsBadge();
          if (typeof renderSavedSessionsModal === 'function') renderSavedSessionsModal();
        }).catch(() => {});
      }
    }


    // [classroom-manager.js] CODIFICACIÓN + VALIDACIÓN + ALTA MANUAL + BORRAR extraído en Tanda 3 (v3.1.31)

    // ── Inicialización al cargar la página ──
    document.addEventListener('DOMContentLoaded', () => {
      // Mostrar overlay de login por defecto hasta verificar sesión
      showLoginOverlay();
      initScrollTransitions();

      // Usuario cuyo asistente ya está montado en pantalla.
      //
      // Por qué hace falta: onAuthStateChange NO se dispara solo al entrar o
      // salir. También se dispara con cada refresco de token (TOKEN_REFRESHED) y
      // con las revalidaciones que hace el cliente al volver el foco a la
      // pestaña. Antes, CUALQUIERA de esos eventos limpiaba el asistente
      // (wizardClassroomId = null + hideWizardSteps), así que al docente que
      // estaba redactando se le borraba la rúbrica y volvía al paso 1 sin haber
      // tocado nada, unos 20-30 segundos después de generarla.
      // Ahora la interfaz se reconstruye una sola vez por usuario: si el que
      // llega es el mismo que ya estaba, no se toca nada.
// usuarioMontadoEnPantalla defined in globals

      // Escuchar cambios de sesión (login / logout / restore desde cookie)
      SupabaseClient.onAuthStateChange(async (event, session) => {
        if (session && session.user) {
          const user = session.user;
          hideLoginOverlay(user);

          // Limpiar tokens OAuth de la barra de direcciones para evitar fuga por URL / Referer
          if (typeof window !== 'undefined' && window.history && window.history.replaceState && window.location.hash.includes('access_token')) {
            window.history.replaceState(null, document.title, window.location.pathname);
          }

          // Mismo usuario que ya está en pantalla: no se toca el asistente.
          if (usuarioMontadoEnPantalla === user.id) return;
          usuarioMontadoEnPantalla = user.id;

          // Cargar salones del docente desde Supabase
          await loadAndRenderClassrooms(user);
          // También cargar banco de evaluaciones recientes
          const recentEvals = await SupabaseClient.loadRecentEvaluations();
          if (typeof ClassroomData !== 'undefined' && ClassroomData.setRecentEvaluations) {
            ClassroomData.setRecentEvaluations(recentEvals);
          }
          if (typeof ClassroomData !== 'undefined' && ClassroomData.flushSyncQueue) {
            ClassroomData.flushSyncQueue();
          }

          // ── RESTAURAR LA SESIÓN ACTIVA ──────────────────────────────
          // Antes acá se hacía setActiveSession(null) en CADA carga de página.
          // Este callback se dispara siempre (INITIAL_SESSION y
          // TOKEN_REFRESHED), así que el docente que imprimía las fichas a las
          // 8:00 y volvía a escanear a las 8:40 —después de que el celular se
          // bloqueó o el navegador recargó— se encontraba con el cartel "no hay
          // sesión configurada" y tenía que rehacer el asistente completo.
          // Ahora la sesión sobrevive la recarga y solo se borra al cerrar
          // sesión o al pulsar "Cambiar salón o evaluación".
          //
          // El orden importa: hay que LEER la sesión antes de limpiar la
          // interfaz, porque resetWizard() la borra a propósito.
          const savedSession = ClassroomData.getActiveSession();

          wizardClassroomId = null;
          wizardEval = null;
          hideWizardSteps();
          renderGradeSelect(null);

          if (savedSession) {
            restoreActiveSession(savedSession);
            showView('eval');
          } else {
            showView('hub');
          }
          if (typeof updateHubSavedSessionsBadge === 'function') {
            updateHubSavedSessionsBadge();
          }
          if (typeof ClassroomData !== 'undefined' && ClassroomData.syncSessionsWithCloud) {
            ClassroomData.syncSessionsWithCloud().then(() => {
              if (typeof updateHubSavedSessionsBadge === 'function') {
                updateHubSavedSessionsBadge();
              }
            }).catch(() => {});
          }
        } else {
          // Sin sesión → mostrar overlay de login.
          // Se olvida el usuario montado: si vuelve a entrar (aunque sea el
          // mismo), el asistente se reconstruye desde cero.
          usuarioMontadoEnPantalla = null;
          showLoginOverlay();
        }
      });
    });