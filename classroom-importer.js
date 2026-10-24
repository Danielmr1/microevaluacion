// =============================================================================
// classroom-importer.js — Microevaluación
// MÓDULO: IMPORTADOR EXCEL / CSV Y SANITIZACIÓN UTF-8 (SHEETJS)
//
// Guardarraíles activos:
//   Regla 10 – Sanitización y Resiliencia en la Exportación e Importación:
//              Tolerancia a mojibake, UTF-8 estricto y compatibilidad Excel.
// =============================================================================

/**
 * Decodifica un CSV respetando su codificación real.
 * Intenta UTF-8 primero; si aparecen caracteres de reemplazo (U+FFFD),
 * prueba Windows-1252, que es la otra codificación habitual en planillas.
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function decodeCsvBuffer(buffer) {
  const bytes = new Uint8Array(buffer);

  // Quitar el BOM UTF-8 si está, porque si no aparece en el primer nombre.
  let start = 0;
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    start = 3;
  }
  const cuerpo = bytes.subarray(start);

  let texto = new TextDecoder('utf-8').decode(cuerpo);
  if (texto.indexOf('\uFFFD') !== -1) {
    try {
      const alterno = new TextDecoder('windows-1252').decode(cuerpo);
      // Solo se queda el alterno si de verdad mejora (menos reemplazos).
      if (alterno.indexOf('\uFFFD') === -1) texto = alterno;
    } catch (e) { /* el navegador no soporta windows-1252: se deja UTF-8 */ }
  }
  return texto;
}

/**
 * Repara texto con mojibake (UTF-8 leído como Latin-1/Windows-1252):
 * "cafÃ©" -> "café".
 *
 * Es conservador a propósito: solo actúa si el texto tiene las secuencias
 * típicas (Ã, Â, Ð, Ñ) Y todos sus caracteres caben en un byte, Y el
 * resultado de reinterpretarlos como UTF-8 es válido. Un texto bien
 * codificado no se toca: por ejemplo "SÃO PAULO" queda igual, porque
 * C3 4F no es UTF-8 válido y la decodificación estricta falla.
 *
 * @param {string} valor
 * @returns {string} el texto corregido, o el original si no era mojibake
 */
function fixMojibake(valor) {
  if (!valor || typeof valor !== 'string') return valor;
  if (!/[ÃÂÐÑ]/.test(valor)) return valor;

  const bytes = new Uint8Array(valor.length);
  for (let i = 0; i < valor.length; i++) {
    const code = valor.charCodeAt(i);
    if (code > 255) return valor;      // hay caracteres fuera de Latin-1
    bytes[i] = code;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (e) {
    return valor;                       // no era mojibake recuperable
  }
}


/* ── VALIDACIÓN Y REGLAS DE NOMBRES (v3.1.28) ─────────────────────────
   - Longitud de salón: 3 a 50 caracteres.
   - Longitud de alumno: 3 a 60 caracteres.
   - Longitud de nombre corto: 2 a 20 caracteres.
   - Caracteres estrictamente prohibidos: %, $, # y símbolos especiales.
   - No permite duplicados o similitudes de nombres completos ni cortos en el mismo salón. */

const RE_PROHIBITED_CHARS = /[%$#@!?*+=<>\\/|^&{}[\]";:~'’`]/;
const RE_ALLOWED_STUDENT_CHARS = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s.,-]+$/;
const RE_ALLOWED_CLASSROOM_CHARS = /^[a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ°º\s.,-]+$/;

function validateClassroomName(name) {
  const clean = cleanName(name);
  if (!clean || clean.length < 3 || clean.length > 15) {
    return { valid: false, error: 'El nombre del salón debe tener entre 3 y 15 letras o caracteres.' };
  }
  if (RE_PROHIBITED_CHARS.test(clean) || !RE_ALLOWED_CLASSROOM_CHARS.test(clean)) {
    return { valid: false, error: 'El nombre del salón contiene caracteres no permitidos (no se permiten %, $, # ni símbolos especiales).' };
  }
  return { valid: true, clean };
}

function validateStudentNames(fullName, shortName) {
  const cleanFull = cleanName(fullName);
  const cleanShort = cleanName(shortName);

  if (!cleanFull || cleanFull.length < 3 || cleanFull.length > 45) {
    return { valid: false, error: 'El nombre completo debe tener entre 3 y 45 letras.' };
  }
  if (RE_PROHIBITED_CHARS.test(cleanFull) || !RE_ALLOWED_STUDENT_CHARS.test(cleanFull)) {
    return { valid: false, error: `El nombre "${cleanFull}" contiene caracteres no permitidos (no se permiten %, $, #, números ni símbolos especiales).` };
  }

  if (cleanShort) {
    if (cleanShort.length < 2 || cleanShort.length > 20) {
      return { valid: false, error: 'El nombre corto debe tener entre 2 y 20 caracteres.' };
    }
    if (RE_PROHIBITED_CHARS.test(cleanShort) || !RE_ALLOWED_STUDENT_CHARS.test(cleanShort)) {
      return { valid: false, error: `El nombre corto "${cleanShort}" contiene caracteres no permitidos (no se permiten %, $, # ni símbolos especiales).` };
    }
  }

  return { valid: true, fullName: cleanFull, shortName: cleanShort };
}

function normalizeTextForComparison(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function validateClassroomStudents(students) {
  const seenFullName = new Map();
  const seenShortName = new Map();

  for (let i = 0; i < students.length; i++) {
    const s = students[i];
    const val = validateStudentNames(s.fullName, s.shortName);
    if (!val.valid) {
      return { valid: false, error: `Fila #${i + 1}: ${val.error}` };
    }

    const normFull = normalizeTextForComparison(val.fullName);
    if (seenFullName.has(normFull)) {
      const prevIdx = seenFullName.get(normFull);
      return {
        valid: false,
        error: `⚠️ Alumno duplicado o muy similar: "${val.fullName}" (fila #${i + 1}) ya existe en la fila #${prevIdx + 1}.`
      };
    }
    seenFullName.set(normFull, i);

    const effectiveShort = val.shortName || generateShortName(val.fullName);
    const normShort = normalizeTextForComparison(effectiveShort);
    if (seenShortName.has(normShort)) {
      const prevIdx = seenShortName.get(normShort);
      return {
        valid: false,
        error: `⚠️ Nombre corto duplicado: "${effectiveShort}" (fila #${i + 1}) coincide con el de la fila #${prevIdx + 1}. Asígnales nombres cortos distintos para distinguirlos en la ficha.`
      };
    }
    seenShortName.set(normShort, i);
  }

  return { valid: true };
}

function getExportTimestamp() {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${day}-${month}_${hours}-${mins}`;
}

function sanitizeExportFileName(name) {
  return (name || 'Salon')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_\-]/g, '');
}

/** Limpia y repara un nombre que viene de un archivo o del formulario. */
function cleanName(valor) {
  return fixMojibake((valor == null ? '' : String(valor)).trim());
}

/**
 * Genera un nombre corto optimizado para chips de pantalla móvil (máx. 18 caracteres).
 * Si el docente ingresó un nombre corto personalizado, lo respeta.
 * Si no, extrae el primer nombre e inicial del apellido (ej. 'Mateo G.').
 */
function generateShortName(fullName, customShort = '') {
  const cleanCustom = cleanName(customShort || '');
  if (cleanCustom) {
    return cleanCustom.slice(0, 18).trim();
  }
  const cleanFull = cleanName(fullName || '');
  if (!cleanFull) return '';

  // Formato: "APELLIDOS, NOMBRES" (con coma)
  if (cleanFull.includes(',')) {
    const parts = cleanFull.split(',');
    const lastNamePart = (parts[0] || '').trim();
    const firstNamePart = (parts[1] || '').trim();
    const firstNames = firstNamePart.split(/\s+/).filter(Boolean);
    const lastNames = lastNamePart.split(/\s+/).filter(Boolean);
    const firstName = firstNames[0] || '';
    const lastInitial = lastNames[0] ? (lastNames[0][0].toUpperCase() + '.') : '';
    const res = (firstName + ' ' + lastInitial).trim();
    return (res || cleanFull).slice(0, 18).trim();
  }

  // Formato: "Nombres Apellidos" (sin coma)
  const tokens = cleanFull.split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) {
    return cleanFull.slice(0, 18).trim();
  }
  if (tokens.length === 2) {
    return (tokens[0] + ' ' + tokens[1][0].toUpperCase() + '.').slice(0, 18).trim();
  }
  const firstName = tokens[0];
  const lastInitial = tokens.length >= 4 ? tokens[2][0].toUpperCase() + '.' : tokens[1][0].toUpperCase() + '.';
  return (firstName + ' ' + lastInitial).slice(0, 18).trim();
}

function downloadEmptyRosterTemplate() {
  const contenido = '\uFEFF"Apellidos, Nombres"\n';
  try {
    const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_nomina.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('⬇️ Plantilla descargada. Completa una fila por alumno.');
  } catch (e) {
    console.error('[Plantilla] No se pudo generar la descarga:', e);
    showToast('❌ No se pudo descargar la plantilla.');
  }
}


/**
 * Lee el archivo Excel/CSV seleccionado y lo importa como un nuevo salón o actualiza el seleccionado.
 */
async function handleExcelImport(input) {
  const activeSession = ClassroomData.getActiveSession();
  if (activeSession && activeSession.classroomId) {
    showToast('⚠️ No se pueden importar ni modificar nóminas mientras haya una evaluación en marcha.');
    input.value = '';
    return;
  }
  const file = input.files[0];
  if (!file) return;
  const statusEl = document.getElementById('excel-import-status');
  const sel = document.getElementById('builder-classroom');
  let classroomId = sel ? sel.value : '';

  if (statusEl) { statusEl.textContent = '⏳ Leyendo archivo...'; statusEl.style.color = '#94a3b8'; }

  try {
    // Los CSV se decodifican a mano en UTF-8. Si se deja que SheetJS lo
    // haga, asume Windows-1252 y los acentos se rompen ("SofÃ a").
    // Los .xlsx/.xls traen su propia codificación y se leen como binario.
    const esCsv = /\.csv$/i.test(file.name);
    let wb;
    if (esCsv) {
      const texto = decodeCsvBuffer(await file.arrayBuffer());
      wb = XLSX.read(texto, { type: 'string' });
    } else {
      wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    }

    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // Detectar si la primera fila es encabezado
    let startIndex = 0;
    if (rows.length > 0) {
      const firstCol = cleanName(rows[0][0]).toLowerCase();
      if (firstCol.includes('nombre') || firstCol.includes('alumno') || firstCol.includes('estudiante')) {
        startIndex = 1;
      }
    }

    const dataRows = rows.slice(startIndex).filter(r => r[0] && String(r[0]).trim());
    if (dataRows.length === 0) {
      if (statusEl) { statusEl.textContent = '⚠️ No se encontraron alumnos en el archivo'; statusEl.style.color = '#f87171'; }
      input.value = '';
      return;
    }

    // cleanName() repara el mojibake de archivos que ya vienen mal y de
    // paso saca espacios sobrantes.
    const students = dataRows.map(r => {
      const fullName = cleanName(r[0]);
      const shortName = generateShortName(fullName, r[1]);
      return { fullName: fullName, shortName: shortName };
    }).filter(s => s.fullName);

    // Validar reglas de nombres y no duplicados
    const dupCheck = validateClassroomStudents(students);
    if (!dupCheck.valid) {
      if (statusEl) {
        statusEl.textContent = dupCheck.error;
        statusEl.style.color = '#f87171';
      }
      showToast(dupCheck.error);
      input.value = '';
      return;
    }

    let targetClassroomId = classroomId;

    // Si ya había un salón elegido, preguntar si se actualiza ese o se crea
    // uno nuevo. Ya no se pide nada por prompt(): la creación siempre pasa
    // por el formulario de alta.
    if (targetClassroomId) {
      const selectedText = sel.options[sel.selectedIndex]?.textContent || 'este salón';
      const inUse = (typeof ClassroomData !== 'undefined' && ClassroomData.isClassroomInUse)
        ? ClassroomData.isClassroomInUse(targetClassroomId)
        : (typeof ClassroomData !== 'undefined' && ClassroomData.isClassroomInSavedSession ? ClassroomData.isClassroomInSavedSession(targetClassroomId) : { inUse: false });
      if (inUse && inUse.inUse) {
        showToast(`⚠️ No puedes sobrescribir la nómina de "${selectedText}" porque está en uso en: "${inUse.sessionTitle}".`);
        alert(`⚠️ Reemplazo de Nómina Bloqueado:\n\nEl salón "${selectedText}" está siendo utilizado en la sesión:\n"${inUse.sessionTitle}".\n\nSobrescribir la nómina invalidaría las fichas impresas y los resultados existentes.\n\nPor favor, crea un salón nuevo con este archivo o elimina primero la sesión asociada en "Sesiones Guardadas".`);
        input.value = '';
        return;
      }
      const wantUpdate = confirm(
        `¿Actualizar la lista de alumnos de:\n"${selectedText}"?\n\n` +
        `(Aceptar = actualizar ese salón / Cancelar = crear un salón nuevo)`
      );
      if (!wantUpdate) targetClassroomId = null;
    }

    // Sin salón destino: se abre el formulario de alta con el nombre y la
    // nómina YA cargados, para que el docente revise qué se leyó del
    // archivo, elija el GRADO y confirme.
    //
    // Esto es lo que garantiza que ningún salón nazca sin grado: la
    // importación ya no crea salones por su cuenta, solo prepara el alta.
    if (!targetClassroomId) {
      if (statusEl) {
        statusEl.textContent = `📋 ${students.length} alumnos leídos — elige el grado y confirma`;
        statusEl.style.color = '#38bdf8';
      }
      prefillManualClassroomForm(nombreSugeridoDeArchivo(file.name), students);
      input.value = '';
      return;
    }

    const importRes = await SupabaseClient.importStudents(targetClassroomId, students);
    const importOk = importRes === true || (importRes && importRes.success === true);
    if (importOk) {
      if (statusEl) { statusEl.textContent = `✅ ${students.length} alumnos guardados`; statusEl.style.color = '#4ade80'; }
      const user = await SupabaseClient.getCurrentUser();
      if (user) await loadAndRenderClassrooms(user, targetClassroomId);
      closeAddClassroomModal();
      renderClassroomManager(targetClassroomId);
      openClassroomModal(targetClassroomId);
      showToast(`✅ Salón y nómina guardados: ${students.length} alumnos`);
    } else {
      if (statusEl) { statusEl.textContent = '❌ Error al guardar alumnos'; statusEl.style.color = '#f87171'; }
    }
  } catch (e) {
    console.error('[ExcelImport]', e);
    if (statusEl) { statusEl.textContent = '❌ Archivo inválido o error al procesar'; statusEl.style.color = '#f87171'; }
  }
  input.value = '';  // Resetear el input para permitir reimportar el mismo archivo
}


// Exposición global
if (typeof window !== "undefined") {
  window.decodeCsvBuffer = decodeCsvBuffer;
  window.fixMojibake = fixMojibake;
  window.validateClassroomName = validateClassroomName;
  window.validateStudentNames = validateStudentNames;
  window.normalizeTextForComparison = normalizeTextForComparison;
  window.validateClassroomStudents = validateClassroomStudents;
  window.getExportTimestamp = getExportTimestamp;
  window.sanitizeExportFileName = sanitizeExportFileName;
  window.cleanName = cleanName;
  window.generateShortName = generateShortName;
  window.downloadEmptyRosterTemplate = downloadEmptyRosterTemplate;
  window.handleExcelImport = handleExcelImport;
}
