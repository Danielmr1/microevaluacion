# SPEC-03: Modalidades de Evaluación (Ramas 1, 2 y 3)

* **Versión:** 1.0.0
* **Estado:** Aprobada
* **Módulos de Código:** `card-formativa.js`, `card-focalizada.js`, `card-cartilla.js`, `card-generator.js`, `session-controller.js`
* **Fuente Canónica:** `MANUAL_SISTEMA.md` (Sección 2), `AGENTS.md` (Reglas 1, 2 y 7)

---

## 1. Propósito Pedagógico y Técnico

El docente necesita distintos niveles de profundidad evaluativa según el momento del año y el tiempo disponible en el aula:
1. **Diagnóstico formativo profundo:** Razonamiento matemático manuscrito paso a paso.
2. **Control focalizado ágil:** Verificación de alternativas o claves en temas puntuales.
3. **Evaluación sumativa masiva:** Cartilla de respuestas para pruebas de unidad o simulacros.

---

## 2. Definición Canónica de las Tres Ramas

| Modalidad | Preguntas | Formato Físico | Tipo de Corrección | Análisis de Procedimiento |
| :--- | :---: | :---: | :---: | :---: |
| **Rama 1: Formativa con IA** | 1 a 2 | Ficha A5 (Horizontal / Vertical) | IA (Gemini 2.5 Flash) | **Sí**, rúbrica cualitativa en borrador manuscrito |
| **Rama 2: Focalizada en la Respuesta** | 1 a 5 | Ficha A5 (1-2 preg) / A4 (5 preg) | Determinista Rápida (OMR o Clave) | **No**, valida respuesta final o alternativa marcada |
| **Rama 3: Cartilla OMR** | 6 a 20 | Cartilla A5 / A4 (Burbujas) | Determinista Instantánea (OMR Local) | **No**, visión computacional sobre burbujas marcadas |

---

## 3. Reglas Inmutables y Guardarraíles

1. **Regla de Oro (Regla 1 · Cero Regresión en Respuesta Libre):** El sistema original de consigna abierta con cuadrícula amplia y franja `Rpta: _______` está 100% probado. Ningún cambio por alternativas u OMR puede deshabilitar o desviar el comportamiento por defecto de Respuesta Libre.
2. **Aislamiento Total de Alternativas (Regla 2):**
   * Una evaluación SOLO se considera de alternativas si cumple estricta y explícitamente:
     ```javascript
     evaluation.type === 'mc'
     ```
   * Si `evaluation.type` es nulo, indefinido o diferente de `'mc'`, el sistema DEBE tratarla como Respuesta Libre.
3. **Aislamiento de IA en Modo Rápido (Regla 7):**
   * Si la sesión es rápida (`session.correctionMode === 'quick'`), el sistema **TIENE PROHIBIDO** hacer peticiones de red a la IA durante el escaneo. La corrección es 100% local determinista.
4. **Límite Diario de Formativa IA (Cuota):**
   * El sistema limita a 2 sesiones formativas completas con IA por día mediante `daily-quota.js` para asegurar el uso sostenible del recurso.

---

## 4. Submodalidades de Rama 3 (Cartilla OMR)

* **Modo A (Solo Cartilla):** Se imprimen hojas de respuestas compactas con burbujas OMR (6, 10, 15 o 20 preguntas). El docente proyecta o dicta las preguntas en la pizarra.
* **Modo B (Cartilla + Cuadernillo):** Se imprimen las cartillas de burbujas junto con un **cuadernillo impreso A4 limpio** (sin ArUco ni marco negro) que contiene los enunciados y alternativas completas extraídas del Banco de Preguntas.

---

## 5. Criterios de Aceptación (Verificables)

* `CRIT-MOD-01`: **Fallback Universal a Respuesta Libre**
  * *Dado* un objeto de evaluación donde `type` no esté definido o sea diferente de `'mc'`
  * *Cuando* el generador o el escáner lo procesen
  * *Entonces* el sistema debe renderizar la cuadrícula de cálculo completa, franja `Rpta: _______` y corregir con rúbrica cualitativa de IA.

* `CRIT-MOD-02`: **Cero Llamadas a la Red en Modo Rápido (Rama 2 y 3)**
  * *Dado* una evaluación configurada como Focalizada o Cartilla OMR
  * *Cuando* el escáner detecta una ficha válida
  * *Entonces* el resultado debe calcularse en memoria en menos de 100 ms sin emitir ninguna llamada HTTP hacia APIs de IA.

* `CRIT-MOD-03`: **Aislamiento del Cuadernillo A4 (Modo B)**
  * *Dado* un cuadernillo de preguntas de Rama 3 generado para el estudiante
  * *Cuando* se envía a impresión o vista previa
  * *Entonces* la hoja debe estar completamente limpia de marcadores ArUco y marcos negros perimetrales, destinándose exclusivamente a lectura humana.
