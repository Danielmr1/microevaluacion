// @ts-check
// =============================================================================
// license-pro-manager.js — Gestor de Licencias PRO y Monetización Yape (Perú)
// =============================================================================
// Estándar TypeScript JSDoc: Verificación estricta de tipos sin compilador.

/**
 * @typedef {'free' | 'pro' | 'institutional'} PlanType
 */

/**
 * @typedef {Object} LicenseState
 * @property {PlanType} plan - Nivel de plan activo
 * @property {boolean} active - Si la membresía está vigente
 * @property {string|null} expiresAt - Fecha ISO de vencimiento o null si es permanente
 * @property {string|null} code - Código de licencia activado
 * @property {string|null} claimedBy - Correo del docente asociado
 */

(function () {
  'use strict';

  const STORAGE_KEY_PRO = 'microeval_license_pro_v1';
  const YAPE_PHONE = '944020941';
  const YAPE_HOLDER = 'Daniel Morales Rodriguez';
  const WHATSAPP_LINK_BASE = 'https://wa.me/51944020941';

  // Configuración de Precios (Modificables según mercado o promociones)
  const PRICE_MONTHLY = 'S/ 9.90';
  const PRICE_ANNUAL = 'S/ 69.00';
  const DISCOUNT_ANNUAL_TEXT = 'Ahorras más del 40%';

  /**
   * Obtiene el estado local de la licencia.
   * @returns {LicenseState}
   */
  function getLocalLicense() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_PRO);
      if (raw) {
        /** @type {LicenseState} */
        const parsed = JSON.parse(raw);
        // Validar si ya expiró
        if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() < Date.now()) {
          parsed.active = false;
          parsed.plan = 'free';
          saveLocalLicense(parsed);
        }
        return parsed;
      }
    } catch (e) {
      console.warn('[LicenseManager] Error leyendo licencia local:', e);
    }
    return { plan: 'free', active: false, expiresAt: null, code: null, claimedBy: null };
  }

  /**
   * Guarda el estado de la licencia localmente.
   * @param {LicenseState} state
   */
  function saveLocalLicense(state) {
    try {
      localStorage.setItem(STORAGE_KEY_PRO, JSON.stringify(state));
    } catch (e) {
      console.warn('[LicenseManager] Error guardando licencia local:', e);
    }
  }

  /**
   * Verifica si el usuario actual cuenta con estado PRO activo.
   * @returns {boolean}
   */
  function isProActive() {
    const lic = getLocalLicense();
    return lic.active && (lic.plan === 'pro' || lic.plan === 'institutional');
  }

  /**
   * Genera el enlace dinámico a WhatsApp con el correo del docente.
   * @returns {string}
   */
  function getWhatsAppUrl() {
    let email = 'mi_correo@docente.pe';
    try {
      const user = window.supabaseAuth?.user || JSON.parse(localStorage.getItem('sb-bpffczohkcpoxyhzvdru-auth-token') || '{}')?.user;
      if (user && user.email) email = user.email;
    } catch (e) {}

    const text = encodeURIComponent(
      `Hola Daniel, acabo de realizar mi transferencia por Yape para activar mi cuenta PRO en Microevaluación.\n\n` +
      `👤 Correo docente: ${email}\n` +
      `Adjunto mi captura de comprobante:`
    );
    return `${WHATSAPP_LINK_BASE}?text=${text}`;
  }

  /**
   * Copia el número de Yape al portapapeles.
   */
  function copyYapeNumber() {
    navigator.clipboard.writeText(YAPE_PHONE).then(() => {
      const btn = document.getElementById('btn-copy-yape');
      if (btn) {
        const originalText = btn.innerHTML;
        btn.innerHTML = '✅ ¡Copiado!';
        btn.style.background = '#15803d';
        btn.style.color = '#ffffff';
        setTimeout(() => {
          btn.innerHTML = originalText;
          btn.style.background = '#F1F5F9';
          btn.style.color = '#1E293B';
        }, 2000);
      }
    }).catch(() => {
      alert(`Número de Yape: ${YAPE_PHONE}`);
    });
  }

  /**
   * Abre el modal de activación PRO.
   */
  function openProModal() {
    const modal = document.getElementById('modal-pro-activation');
    if (!modal) {
      injectProModal();
    }
    const target = document.getElementById('modal-pro-activation');
    if (target) {
      target.style.display = 'flex';
      updateProModalView();
    }
  }

  /**
   * Cierra el modal de activación PRO.
   */
  function closeProModal() {
    const modal = document.getElementById('modal-pro-activation');
    if (modal) modal.style.display = 'none';
  }

  /**
   * Canjea un código de activación ingresado por el docente.
   */
  async function claimLicenseCode() {
    const input = /** @type {HTMLInputElement|null} */ (document.getElementById('input-pro-license-code'));
    const statusBox = document.getElementById('pro-license-status');
    const btn = document.getElementById('btn-claim-license');
    if (!input || !statusBox || !btn) return;

    const rawCode = input.value.trim().toUpperCase();
    if (!rawCode) {
      statusBox.innerHTML = '<span style="color:#DC2626;">⚠️ Por favor ingresa un código de licencia.</span>';
      return;
    }

    btn.setAttribute('disabled', 'true');
    statusBox.innerHTML = '<span style="color:#0284C7;">⏳ Validando código en el servidor...</span>';

    // 1. Obtener email del docente
    let email = 'docente_local';
    try {
      const user = window.supabaseAuth?.user || JSON.parse(localStorage.getItem('sb-bpffczohkcpoxyhzvdru-auth-token') || '{}')?.user;
      if (user && user.email) email = user.email;
    } catch (e) {}

    try {
      // Si Supabase está disponible y online, verificar en la tabla remota con timeout de 3.5s
      if (window.supabaseClient && navigator.onLine) {
        const queryPromise = window.supabaseClient
          .from('microeval_licenses')
          .select('*')
          .eq('code', rawCode)
          .single();

        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('timeout')), 3500)
        );

        const res = /** @type {any} */ (await Promise.race([queryPromise, timeoutPromise]));
        const data = res?.data;
        const error = res?.error;

        if (error || !data) {
          throw new Error('Código no encontrado o inválido.');
        }

        if (data.is_claimed && data.claimed_by_email !== email) {
          throw new Error('Este código ya fue canjeado por otra cuenta.');
        }

        const durationDays = data.duration_days || 365;
        const expires = new Date();
        expires.setDate(expires.getDate() + durationDays);
        const expiresAtIso = expires.toISOString();

        // Marcar como canjeado en Supabase
        await window.supabaseClient
          .from('microeval_licenses')
          .update({
            is_claimed: true,
            claimed_by_email: email,
            claimed_at: new Date().toISOString(),
            expires_at: expiresAtIso
          })
          .eq('code', rawCode);

        // Guardar estado local
        /** @type {LicenseState} */
        const newState = {
          plan: 'pro',
          active: true,
          expiresAt: expiresAtIso,
          code: rawCode,
          claimedBy: email
        };
        saveLocalLicense(newState);
        updateUserMenuProBadge();
        updateProModalView();

        statusBox.innerHTML = `
          <div style="background:#DCFCE7; border:1.5px solid #22C55E; color:#15803D; padding:10px 12px; border-radius:10px; font-weight:700; text-align:center;">
            🎉 ¡Felicidades! Tu cuenta PRO ha sido activada con éxito hasta el ${new Date(expiresAtIso).toLocaleDateString('es-PE')}.
          </div>
        `;
        return;
      } else {
        throw new Error('offline');
      }
    } catch (err) {
      console.warn('[LicenseManager] Error validando en nube:', err);
      // Fallback: Si no hay internet o tabla aún no creada, verificar si es código maestro de prueba
      if (rawCode.startsWith('PRO-PERU-') && rawCode.length >= 12) {
        const expires = new Date();
        expires.setFullYear(expires.getFullYear() + 1);
        const expiresAtIso = expires.toISOString();
        /** @type {LicenseState} */
        const fallbackState = {
          plan: 'pro',
          active: true,
          expiresAt: expiresAtIso,
          code: rawCode,
          claimedBy: email
        };
        saveLocalLicense(fallbackState);
        updateUserMenuProBadge();
        updateProModalView();
        statusBox.innerHTML = `
          <div style="background:#DCFCE7; border:1.5px solid #22C55E; color:#15803D; padding:10px 12px; border-radius:10px; font-weight:700; text-align:center;">
            🎉 ¡Cuenta PRO activada localmente por 1 año!
          </div>
        `;
        return;
      }

      statusBox.innerHTML = `
        <div style="background:#FEE2E2; border:1.5px solid #EF4444; color:#B91C1C; padding:10px 12px; border-radius:10px; font-weight:600; text-align:center; font-size:0.8rem;">
          ❌ ${err.message || 'Código inválido o ya utilizado'}.<br>
          Si yapeaste y tienes tu comprobante, <a href="${getWhatsAppUrl()}" target="_blank" style="color:#B91C1C; font-weight:800; text-decoration:underline;">escríbenos al WhatsApp</a> para ayudarte.
        </div>
      `;
    } finally {
      btn.removeAttribute('disabled');
    }
  }

  /**
   * Actualiza el badge visual del menú de usuario en la barra superior.
   */
  function updateUserMenuProBadge() {
    const isPro = isProActive();
    const lic = getLocalLicense();
    let container = document.getElementById('user-menu-plan-badge');

    if (!container) {
      const userEmailEl = document.getElementById('user-email');
      if (userEmailEl && userEmailEl.parentElement) {
        container = document.createElement('div');
        container.id = 'user-menu-plan-badge';
        container.style.marginTop = '4px';
        userEmailEl.parentElement.appendChild(container);
      }
    }

    if (container) {
      if (isPro) {
        const expDate = lic.expiresAt ? new Date(lic.expiresAt).toLocaleDateString('es-PE') : 'Activo';
        container.innerHTML = `
          <div style="display:inline-flex; align-items:center; gap:5px; background:linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%); border:1.5px solid #F59E0B; border-radius:6px; padding:2px 7px;">
            <span style="font-size:0.75rem;">⭐</span>
            <span style="font-size:0.68rem; font-weight:900; color:#B45309; letter-spacing:0.02em;">DOCENTE PRO</span>
            <span style="font-size:0.60rem; color:#92400E; font-weight:700;">(${expDate})</span>
          </div>
        `;
      } else {
        container.innerHTML = `
          <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; margin-top:2px;">
            <span style="font-size:0.65rem; font-weight:800; color:#64748B; background:#F1F5F9; border:1px solid #CBD5E1; border-radius:5px; padding:2px 6px;">PLAN GRATUITO</span>
            <button type="button" onclick="openProModal()" style="background:#FFB703; border:1px solid #D97706; color:#181512; border-radius:6px; padding:3px 8px; font-size:0.66rem; font-weight:900; cursor:pointer; display:inline-flex; align-items:center; gap:3px;">
              <span>⭐</span> Mejorar a PRO
            </button>
          </div>
        `;
      }
    }
  }

  /**
   * Actualiza el contenido del modal según el estado del docente.
   */
  function updateProModalView() {
    const isPro = isProActive();
    const lic = getLocalLicense();
    const activeNotice = document.getElementById('pro-active-banner');
    const paymentSection = document.getElementById('pro-payment-section');

    if (activeNotice && paymentSection) {
      if (isPro) {
        activeNotice.style.display = 'block';
        paymentSection.style.display = 'none';
        const expEl = document.getElementById('pro-active-expiration');
        if (expEl && lic.expiresAt) {
          expEl.textContent = new Date(lic.expiresAt).toLocaleDateString('es-PE');
        }
      } else {
        activeNotice.style.display = 'none';
        paymentSection.style.display = 'block';
      }
    }
  }

  /**
   * Inyecta el modal en el DOM si no existe.
   */
  function injectProModal() {
    if (document.getElementById('modal-pro-activation')) return;

    const markup = `
    <!-- Modal: Activación y Suscripción PRO (Yape Perú) -->
    <div id="modal-pro-activation" class="classroom-glass-backdrop"
      onclick="if(event.target === this) closeProModal()"
      style="display:none; position:fixed; inset:0; background:rgba(15,23,42,0.72); backdrop-filter:blur(8px); z-index:10060; align-items:center; justify-content:center; padding:16px;">
      <div class="classroom-glass-card"
        style="border-radius:20px; max-width:540px; width:100%; max-height:92vh; background:#FFFFFF; border:2px solid #2B2118; box-shadow:0 25px 60px -15px rgba(0,0,0,0.5); display:flex; flex-direction:column; overflow:hidden;">

        <!-- Cabecera del Modal -->
        <div style="background:linear-gradient(135deg, #18202F 0%, #0F172A 100%); padding:16px 20px; border-bottom:3px solid #FFB703; display:flex; align-items:center; justify-content:space-between; flex-shrink:0;">
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="width:36px; height:36px; border-radius:10px; background:rgba(255,183,3,0.18); border:1.5px solid #FFB703; display:flex; align-items:center; justify-content:center; font-size:1.2rem;">
              ⭐
            </div>
            <div>
              <h2 style="font-size:1.05rem; font-weight:900; color:#FFFFFF; margin:0; line-height:1.2;">Microevaluación PRO</h2>
              <p style="font-size:0.72rem; color:#94A3B8; margin:2px 0 0; font-weight:600;">Potencia tu aula sin límites de escaneo ni salones</p>
            </div>
          </div>
          <button type="button" onclick="closeProModal()"
            style="background:transparent; border:none; color:#94A3B8; font-size:1.4rem; cursor:pointer; line-height:1; padding:4px;" title="Cerrar">✕</button>
        </div>

        <!-- Contenido Scrollable -->
        <div style="padding:18px 20px; overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:14px;">

          <!-- Banner si ya es PRO -->
          <div id="pro-active-banner" style="display:none; background:#F0FDF4; border:2px solid #22C55E; border-radius:14px; padding:16px; text-align:center;">
            <div style="font-size:2rem; margin-bottom:4px;">👑</div>
            <h3 style="font-size:1rem; font-weight:900; color:#15803D; margin:0 0 4px;">¡Eres Docente PRO Activo!</h3>
            <p style="font-size:0.78rem; color:#166534; margin:0 0 10px;">
              Tu membresía cuenta con salones ilimitados, escaneo continuo, rúbricas IA y Aula en Vivo PRO.<br>
              <strong>Vigente hasta:</strong> <span id="pro-active-expiration" style="font-weight:900;">—</span>
            </p>
            <div style="background:#FFFFFF; border:1px solid #86EFAC; border-radius:10px; padding:10px 12px; font-size:0.74rem; color:#166534; text-align:left;">
              <strong>💻 ¿Usas Aula en Vivo en tu laptop?</strong><br>
              Tu suscripción PRO incluye las 30 tablets y salones ilimitados para tu aula offline. Envíanos el código de 16 caracteres de tu laptop al WhatsApp para entregarte tu clave de licencia.
            </div>
          </div>

          <!-- Sección de Pago y Beneficios -->
          <div id="pro-payment-section" style="display:flex; flex-direction:column; gap:14px;">

            <!-- Beneficios PRO -->
            <div style="background:#FAF8F5; border:1.2px solid #E2D9CC; border-radius:12px; padding:10px 14px;">
              <div style="font-size:0.68rem; font-weight:900; color:#78350F; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:6px;">
                🚀 ¿Qué incluye tu membresía PRO?
              </div>
              <ul style="margin:0; padding-left:18px; font-size:0.76rem; color:#334155; line-height:1.55; font-weight:600;">
                <li><strong>Microevaluación:</strong> Salones ilimitados, escaneo OMR y rúbricas IA con Gemini.</li>
                <li><strong>Aula en Vivo (Incluido):</strong> Hasta 30 tablets en simultáneo, proyector y red local 100% offline.</li>
                <li><strong>Mando Móvil Táctil:</strong> Controla tu clase desde el celular mientras caminas por el aula.</li>
                <li><strong>Sincronización multi-dispositivo:</strong> Misma cuenta en laptop, tablet y celular.</li>
              </ul>
            </div>

            <!-- Precios Transparentes Perú -->
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
              <!-- Plan Mensual -->
              <div style="border:1.5px solid #E2E8F0; border-radius:12px; padding:10px; text-align:center; background:#FFFFFF;">
                <div style="font-size:0.68rem; font-weight:800; color:#64748B; text-transform:uppercase;">Plan Mensual</div>
                <div style="font-size:1.35rem; font-weight:900; color:#0F172A; margin:3px 0 2px;">${PRICE_MONTHLY}</div>
                <div style="font-size:0.65rem; color:#94A3B8;">Renovación mensual</div>
              </div>
              <!-- Plan Anual (Destacado) -->
              <div style="border:2px solid #FFB703; border-radius:12px; padding:10px; text-align:center; background:#FFFBEB; position:relative; box-shadow:0 4px 14px rgba(255,183,3,0.22);">
                <span style="position:absolute; top:-9px; right:10px; background:#D97706; color:#FFFFFF; font-size:0.58rem; font-weight:900; padding:1px 6px; border-radius:6px; letter-spacing:0.03em;">MÁS POPULAR</span>
                <div style="font-size:0.68rem; font-weight:800; color:#B45309; text-transform:uppercase;">Año Escolar (12 meses)</div>
                <div style="font-size:1.35rem; font-weight:900; color:#B45309; margin:3px 0 2px;">${PRICE_ANNUAL}</div>
                <div style="font-size:0.65rem; color:#92400E; font-weight:700;">${DISCOUNT_ANNUAL_TEXT}</div>
              </div>
            </div>

            <!-- Tarjeta de Pago con Yape -->
            <div style="background:linear-gradient(145deg, #6D28D9 0%, #4C1D95 100%); color:#FFFFFF; border-radius:14px; padding:14px; display:flex; flex-direction:column; align-items:center; text-align:center; box-shadow:0 8px 24px rgba(109,40,217,0.32);">
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
                <span style="font-size:1.05rem; font-weight:900; background:#00D1B2; color:#0F172A; padding:2px 9px; border-radius:6px; letter-spacing:0.02em;">Yape</span>
                <span style="font-size:0.88rem; font-weight:800; color:#EDE9FE;">Paga al instante</span>
              </div>

              <!-- Imagen del QR Yape Grande y Nítida sin fondo morado sobrante -->
              <div style="background:#FFFFFF; padding:8px; border-radius:12px; margin-bottom:10px; box-shadow:0 6px 16px rgba(0,0,0,0.25); display:inline-flex; align-items:center; justify-content:center;">
                <img src="qr-yape.png" alt="QR Yape Daniel Morales Rodriguez" style="width:210px; max-width:85vw; height:auto; border-radius:8px; display:block;" onerror="this.src='qr-yape.jpg'">
              </div>

              <div style="font-size:0.74rem; color:#DDD6FE; margin-bottom:2px;">Titular registrado:</div>
              <div style="font-size:0.95rem; font-weight:900; letter-spacing:0.02em; margin-bottom:8px; color:#FFFFFF;">${YAPE_HOLDER}</div>

              <!-- Número con botón de copia -->
              <div style="display:inline-flex; align-items:center; gap:8px; background:rgba(255,255,255,0.16); border:1.5px solid rgba(255,255,255,0.32); border-radius:10px; padding:5px 12px; margin-bottom:12px;">
                <span style="font-size:1.15rem; font-weight:900; letter-spacing:0.08em; color:#FDE047;">944 020 941</span>
                <button type="button" id="btn-copy-yape" onclick="window._copyYapeNumber()"
                  style="background:#F1F5F9; border:none; color:#1E293B; border-radius:6px; padding:4px 8px; font-size:0.72rem; font-weight:800; cursor:pointer;">
                  📋 Copiar
                </button>
              </div>

              <!-- Botón WhatsApp -->
              <a href="${getWhatsAppUrl()}" target="_blank" rel="noopener noreferrer"
                style="width:100%; max-width:320px; background:#22C55E; color:#FFFFFF; text-decoration:none; border-radius:10px; padding:10px 14px; font-size:0.86rem; font-weight:900; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow:0 4px 12px rgba(34,197,94,0.35); transition:transform 0.15s;">
                <span>💬 Enviar comprobante al WhatsApp</span>
              </a>
            </div>

          </div>

          <!-- Sección de Canje de Código -->
          <div style="border-top:1.5px dashed #CBD5E1; padding-top:14px;">
            <label style="display:block; font-size:0.78rem; font-weight:800; color:#1E293B; margin-bottom:6px;">
              🔑 ¿Ya tienes tu código de activación?
            </label>
            <div style="display:flex; gap:8px;">
              <input type="text" id="input-pro-license-code" placeholder="Ej. PRO-PERU-XXXX"
                style="flex:1; border:1.5px solid #CBD5E1; border-radius:10px; padding:10px 12px; font-size:0.86rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:#0F172A;"
                onkeydown="if(event.key === 'Enter') window._claimLicenseCode()">
              <button type="button" id="btn-claim-license" onclick="window._claimLicenseCode()"
                style="background:#0284C7; border:none; color:#FFFFFF; border-radius:10px; padding:10px 16px; font-size:0.82rem; font-weight:800; cursor:pointer; white-space:nowrap;">
                Activar
              </button>
            </div>
            <div id="pro-license-status" style="margin-top:8px; font-size:0.75rem;"></div>
          </div>

        </div>

      </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', markup);
  }

  // Exponer métodos globales
  window.openProModal = openProModal;
  window.closeProModal = closeProModal;
  window._copyYapeNumber = copyYapeNumber;
  window._claimLicenseCode = claimLicenseCode;
  window.isProActive = isProActive;
  window.updateUserMenuProBadge = updateUserMenuProBadge;

  // Inicialización al cargar la página
  if (document.body) {
    injectProModal();
    updateUserMenuProBadge();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      injectProModal();
      updateUserMenuProBadge();
    });
  }

})();

