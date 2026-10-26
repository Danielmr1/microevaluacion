// =============================================================================
// bank-tools-math.js — Microevaluación
// MÓDULO: HERRAMIENTAS MATEMÁTICAS, FORMATEO KATEX Y CONTADORES
// =============================================================================

/* ── TOPE UNIVERSAL DE CARACTERES DEL ENUNCIADO ──
   Para garantizar compatibilidad universal con todos los tamaños (A6, A5 y A4),
   el límite se calibra contra la ficha más pequeña (A6, ancho útil de ~52 caracteres por línea):
   - Estándar (sin fracciones): Máximo 160 caracteres (hasta 3 líneas en A6).
   - Con fracciones: Máximo 105 caracteres (máximo 2 líneas en A6 para no invadir la cuadrícula). */
const PROMPT_MAX_CHARS = 160;
const PROMPT_FRACTIONS_MAX_CHARS = 105;
const PROMPT_CHARS_PER_LINE = 52;

/** Escapa texto antes de meterlo en innerHTML. */
function escaparHtml(t) {
  return String(t == null ? "" : t)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Normaliza una respuesta para comparar. */
function normalizarRespuesta(t) {
  let s = String(t == null ? "" : t).trim().toLowerCase();
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Separador de miles cubriendo el número entero: "1.250" y "1,250" = 1250
  const soloMiles = s.match(/^(-?\d{1,3}(?:[.,]\d{3})+)$/);
  if (soloMiles) return String(parseFloat(soloMiles[1].replace(/[.,]/g, "")));

  // Un único número: comparar el valor, ignorando la unidad y el formato
  const nums = s.match(/-?\d+(?:[.,]\d+)?/g);
  if (nums && nums.length === 1) return String(parseFloat(nums[0].replace(",", ".")));

  // Sin número (o varios): comparar el texto limpio
  return s.replace(/\s+/g, " ").replace(/[.;]+$/, "");
}

function hasFractions(text) {
  if (!text) return false;
  return /\\frac\{|\[frac:|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|\b\d+\s*\/\s*\d+\b/.test(text);
}
window.hasFractions = hasFractions;

/**
 * Convierte tokens de matemáticas (\frac{a}{b}, \sqrt{x}, ^{n}) en HTML estructurado
 * para renderizado visual idéntico a Word (fracciones apiladas y raíz con techo).
 */
function formatMathHtml(safeText) {
  if (!safeText) return '';
  // 1. \frac{numerador}{denominador} -> fracción apilada con barra horizontal
  let out = safeText.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '<span class="math-frac"><span class="math-num">$1</span><span class="math-den">$2</span></span>');
  // 2. [frac:num/den] sintaxis alternativa
  out = out.replace(/\[frac:\s*([^\/\]]+)\/([^\]]+)\]/g, '<span class="math-frac"><span class="math-num">$1</span><span class="math-den">$2</span></span>');
  // 3. \sqrt{radicando} -> radical con techo continuo cubriendo el contenido
  out = out.replace(/\\sqrt\{([^{}]+)\}/g, '<span class="math-sqrt"><span class="math-rad">√</span><span class="math-radicand">$1</span></span>');
  // 4. [sqrt:radicando]
  out = out.replace(/\[sqrt:\s*([^\]]+)\]/g, '<span class="math-sqrt"><span class="math-rad">√</span><span class="math-radicand">$1</span></span>');
  // 5. ^{exponente} -> superíndice
  out = out.replace(/\^\{([^{}]+)\}/g, '<sup>$1</sup>');
  return out;
}
window.formatMathHtml = formatMathHtml;

// ── SEGUIMIENTO DE ENFOQUE E INSERCIÓN DE SÍMBOLOS MATEMÁTICOS ──
let lastFocusedMathInput = null;

function trackMathInputFocus(el) {
  if (el) lastFocusedMathInput = el;
}
window.trackMathInputFocus = trackMathInputFocus;

function insertMathSymbol(sym) {
  let target = lastFocusedMathInput;
  if (!target || !document.body.contains(target)) {
    target = document.getElementById('sim-new-prompt') || document.getElementById('bm-prompt') || document.getElementById('input-eval-prompt');
  }
  if (!target) return;

  const start = target.selectionStart != null ? target.selectionStart : target.value.length;
  const end = target.selectionEnd != null ? target.selectionEnd : target.value.length;
  const val = target.value || '';

  target.value = val.slice(0, start) + sym + val.slice(end);
  const newPos = start + sym.length;
  if (typeof target.setSelectionRange === 'function') {
    target.setSelectionRange(newPos, newPos);
  }
  target.focus();

  // Disparar evento input para actualizar contadores y validaciones
  target.dispatchEvent(new Event('input', { bubbles: true }));
}
window.insertMathSymbol = insertMathSymbol;

function updatePromptCounter() {
  const ta = document.getElementById('input-eval-prompt');
  const counter = document.getElementById('prompt-counter');
  const hint = document.getElementById('prompt-hint');
  if (!ta) return;

  const withFrac = hasFractions(ta.value);
  const maxChars = withFrac ? PROMPT_FRACTIONS_MAX_CHARS : PROMPT_MAX_CHARS;
  ta.setAttribute('maxlength', String(maxChars));

  const len = ta.value.length;
  const lines = Math.max(1, Math.ceil(len / PROMPT_CHARS_PER_LINE));
  const maxLines = withFrac ? 2 : 3;

  if (counter) {
    counter.textContent = len + ' / ' + maxChars;
    counter.style.color = len >= maxChars ? '#f59e0b' : '#64748b';
  }
  if (hint) {
    if (len > maxChars || lines > maxLines) {
      hint.textContent = '⚠️ ' + lines + ' líneas: no entran en la ficha. Acorta el enunciado.';
      hint.style.color = '#ef4444';
    } else if (withFrac) {
      hint.textContent = '≈ ' + lines + (lines === 1 ? ' línea' : ' líneas') + ' · máx 2 líneas (ajuste por fracciones)';
      hint.style.color = '#0284c7';
    } else {
      hint.textContent = '≈ ' + lines + (lines === 1 ? ' línea' : ' líneas') + ' · máx 3 (compatible A6, A5 y A4)';
      hint.style.color = '#64748b';
    }
  }
}

function updatePromptCounterFree() {
  const ta = document.getElementById('input-free-prompt');
  const counter = document.getElementById('prompt-counter-free');
  const hint = document.getElementById('prompt-hint-free');
  if (!ta) return;

  const withFrac = hasFractions(ta.value);
  const maxChars = withFrac ? PROMPT_FRACTIONS_MAX_CHARS : PROMPT_MAX_CHARS;
  ta.setAttribute('maxlength', String(maxChars));

  const len = ta.value.length;
  const lines = Math.max(1, Math.ceil(len / PROMPT_CHARS_PER_LINE));
  const maxLines = withFrac ? 2 : 3;

  if (counter) {
    counter.textContent = len + ' / ' + maxChars;
    counter.style.color = len >= maxChars ? '#f59e0b' : '#64748b';
  }
  if (hint) {
    if (len > maxChars || lines > maxLines) {
      hint.textContent = '⚠️ ' + lines + ' líneas: no entran en la ficha. Acorta el enunciado.';
      hint.style.color = '#ef4444';
    } else if (withFrac) {
      hint.textContent = '≈ ' + lines + (lines === 1 ? ' línea' : ' líneas') + ' · máx 2 líneas (ajuste por fracciones)';
      hint.style.color = '#0284c7';
    } else {
      hint.textContent = '≈ ' + lines + (lines === 1 ? ' línea' : ' líneas') + ' · máx 3 (compatible A6, A5 y A4)';
      hint.style.color = '#64748b';
    }
  }
}

/**
 * Preguntas del banco que corresponden al grado del salón elegido y a la
 * modalidad de respuesta libre.
 *
 * @returns {{lista: Array, grado: object}}
 */

function updateBMPromptCounter() {
  const ta = document.getElementById('bm-prompt');
  const counter = document.getElementById('bm-prompt-counter');
  const hint = document.getElementById('bm-prompt-hint');
  const livePreview = document.getElementById('bm-prompt-live-preview');
  const liveContent = document.getElementById('bm-prompt-live-preview-content');
  if (!ta) return;

  const withFrac = hasFractions(ta.value);
  const maxChars = withFrac ? PROMPT_FRACTIONS_MAX_CHARS : PROMPT_MAX_CHARS;
  ta.setAttribute('maxlength', String(maxChars));

  const len = ta.value.length;
  const lines = Math.max(1, Math.ceil(len / PROMPT_CHARS_PER_LINE));
  const maxLines = withFrac ? 2 : 3;

  if (counter) {
    counter.textContent = len + ' / ' + maxChars;
    counter.style.color = len >= maxChars ? '#f59e0b' : '#64748b';
  }
  if (hint) {
    if (len > maxChars || lines > maxLines) {
      hint.textContent = '⚠️ ' + lines + ' líneas: no entran en la ficha. Acorta el enunciado.';
      hint.style.color = '#ef4444';
    } else {
      hint.textContent = '';
    }
  }

  // Vista Previa Física en Vivo de Estructuras Matemáticas
  const rawVal = (ta.value || '').trim();
  const hasSpecialMath = /\\frac\{|\[frac:|\\sqrt\{|\^\{|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|\b\d+\s*\/\s*\d+\b/.test(rawVal);
  if (livePreview && liveContent) {
    if (rawVal && (withFrac || hasSpecialMath)) {
      livePreview.style.display = 'block';
      const escapeFn = (typeof escaparHtml === 'function') ? escaparHtml : (t => t);
      const formatFn = (typeof formatMathHtml === 'function') ? formatMathHtml : (t => t);
      liveContent.innerHTML = formatFn(escapeFn(rawVal));
    } else {
      livePreview.style.display = 'none';
      liveContent.innerHTML = '';
    }
  }
}

// Exposición global
if (typeof window !== "undefined") {
  window.PROMPT_MAX_CHARS = PROMPT_MAX_CHARS;
  window.PROMPT_FRACTIONS_MAX_CHARS = PROMPT_FRACTIONS_MAX_CHARS;
  window.PROMPT_CHARS_PER_LINE = PROMPT_CHARS_PER_LINE;
  window.hasFractions = hasFractions;
  window.formatMathHtml = formatMathHtml;
  window.trackMathInputFocus = trackMathInputFocus;
  window.insertMathSymbol = insertMathSymbol;
  window.updatePromptCounter = updatePromptCounter;
  window.updatePromptCounterFree = updatePromptCounterFree;
  window.updateBMPromptCounter = updateBMPromptCounter;
  window.escaparHtml = escaparHtml;
  window.normalizarRespuesta = normalizarRespuesta;
}
