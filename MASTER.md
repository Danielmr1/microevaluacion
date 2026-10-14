# MASTER: Sistema de Diseño e Identidad UI/UX (Microevaluación A5)

Este documento es la **Fuente Única de Verdad (Single Source of Truth)** para el diseño de interfaz de usuario (UI), experiencia de usuario (UX) y arquitectura visual de **Microevaluación**.
Cualquier modificación o evolución de pantallas en este repositorio DEBE apegarse de forma estricta a estas directrices para preservar una identidad unificada, profesional y sin regresiones funcionales.

---

## 1. Fundamentos y Filosofía de Diseño

### 1.1. Perfil del Usuario Docente
* **Audiencia principal:** Docentes escolares de educación básica regular (primaria y secundaria).
* **Contextos de uso:**
  1. **En aula (móvil/tablet):** Docente de pie, caminando entre filas de carpetas, operando el celular con una sola mano mientras sostiene evaluaciones con la otra. Exige botones táctiles generosos (**≥ 48px**), alto contraste y cero distracciones.
  2. **En escritorio (laptop/PC):** En sala de profesores o casa para crear evaluaciones, importar listas de Excel y exportar reportes.
* **Estado emocional:** Carga laboral intensa y tiempo limitado entre clases. La interfaz debe transmitir **rapidez, serenidad, certidumbre y orden**, evitando tecnicismos informáticos innecesarios.

### 1.2. Estilo Visual: *Modern Dark Slate & Glass*
* Estética moderna basada en tonos pizarra oscuros, efecto cristal (*glassmorphism*) con desenfoque de fondo y acentos de color neón funcional.
* **Beneficios pedagógicos y técnicos:**
  * Reduce la fatiga visual prolongada.
  * Ahorra batería en pantallas OLED de teléfonos móviles en el aula.
  * Proporciona un ratio de contraste superior que facilita la lectura bajo luces fluorescentes o luz solar indirecta.

---

## 2. Tokens de Diseño y Variables Cromáticas

### 2.1. Superficies y Neutros (Regla 60-30-10)
| Rol | Token Hex / RGBA | Uso |
| :--- | :--- | :--- |
| **Fondo Base (60%)** | `#0b1120` / `#0f172a` | Lienzo principal del body y contenedores de vista. |
| **Superficie / Card (30%)** | `#1e293b` | Tarjetas interactivas, modales y paneles wizard. |
| **Borde Estructural** | `#334155` / `rgba(255,255,255,0.08)` | Delimitador fino de 1px o 1.5px con brillo tenue. |
| **Texto Primario** | `#f8fafc` | Títulos, nombres de alumnos y números clave. |
| **Texto Secundario** | `#94a3b8` | Subtítulos, descripciones e instrucciones breves. |
| **Texto Atenuado** | `#64748b` | Etiquetas en mayúsculas (eyebrows), metadatos. |

### 2.2. Codificación Funcional de Modalidades (Inmutable)
Cada rama de evaluación posee una identidad cromática única y consistente que guía visualmente al docente:

| Modalidad | Color Primario | Color Fondo / Glow | Significado Pedagógico |
| :--- | :--- | :--- | :--- |
| **Formativa con IA** (Rama 1) | `#6366f1` (Índigo) / `#c084fc` (Púrpura) | `rgba(99, 102, 241, 0.15)` | Inteligencia pedagógica, análisis formativo y rúbricas Gemini. |
| **Focalizada en la Respuesta** (Rama 2) | `#0284c7` (Sky) / `#34d399` (Menta) | `rgba(14, 165, 233, 0.15)` | Inmediatez, precisión y corrección directa de la clave. |
| **Cartilla OMR** (Rama 3) | `#059669` (Esmeralda) / `#38bdf8` (Celeste) | `rgba(16, 185, 129, 0.15)` | Calificación masiva instantánea y determinista sin IA. |
| **Sesiones Guardadas y Banco** | `#d97706` (Ámbar) / `#fbbf24` (Dorado) | `rgba(217, 119, 6, 0.15)` | Biblioteca, recursos permanentes y memoria local. |

---

## 3. Tipografía y Jerarquía Visual

* **Familia Tipográfica:** Fuente nativa sans-serif optimizada para legibilidad de alta densidad:
  ```css
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  ```
* **Escala y Pesos:**
  * **H1 / Títulos Principales:** `font-size: 1.4rem – 1.6rem`, `font-weight: 800 - 900`, `color: #f8fafc`.
  * **H2 / H3 / Subtítulos:** `font-size: 1.0rem – 1.15rem`, `font-weight: 800`, con acento temático de la rama.
  * **Body / Párrafos:** `font-size: 0.8rem – 0.88rem`, `font-weight: 400 - 500`, `line-height: 1.45`, `color: #cbd5e1`.
  * **Eyebrows / Badges:** `font-size: 0.68rem – 0.74rem`, `font-weight: 800`, `text-transform: uppercase`, `letter-spacing: 0.05em`.

---

## 4. Ergonomía Táctil y Espaciado (8pt Grid)

* **Cuadrícula Base:** Todo padding, margen y espacio entre elementos responde a múltiplos de 4 y 8 píxeles (`4px`, `8px`, `12px`, `16px`, `20px`, `24px`).
* **Zonas de Toque (Touch Targets - Ley de Fitts):**
  * Ningún botón táctil en pantalla móvil debe medir menos de **44px × 44px** (óptimo: **48px** de altura).
  * Margen de separación mínimo entre botones interactivos: **8px**.
* **Microinteracciones y Feedback:**
  * Elevación sutil al pasar el cursor: `transform: translateY(-2px);`.
  * Efecto de pulsación táctil al hacer clic: `transform: scale(0.98);`.
  * Curva de animación suave: `transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);`.

---

## 5. Arquitectura Visual Minimalista de Alta Gama (Luz Natural & Pureza Awwwards)

Inspirado en la composición diáfana, luminosa y minimalista del referente ([Unitree Go2](https://ai-robots.apps.mdxpreview.xyz/unitree-go2)), adaptada a la temática de educación y papel:

### 5.1. Paleta de Luz Natural de Aula (Daylight & Clean Paper)
* **Lienzo Principal (`#view-hub`):** Fondo blanco tiza / gris perla suave (`#f8fafc` a `#f1f5f9`) con gradientes ambientales muy sutiles en tonos cielo y menta translúcidos. Cero oscuridad opresiva.
* **Tipografía de Alto Contraste:** Títulos en Slate 900 profundo (`#0f172a`), subtítulos en Slate 600 (`#475569`) y acentos en Azul Educativo (`#0284c7`).
* **Máximo Aire y Espacio Negativo:** Generosos márgenes para permitir que el contenido respire sin sobrecargar la visión del docente.

### 5.2. Barra Superior en Cápsula de Vidrio Claro (`.island-capsule`)
* Cápsula flotante translúcida de vidrio esmerilado blanco (`rgba(255, 255, 255, 0.88)` con `backdrop-filter: blur(20px)` y borde fino `rgba(15, 23, 42, 0.08)`).
* **Navegación Unificada sin Redundancias:**
  * Marca: Ícono azul con tipografía nítida `MICROEVAL`.
  * Enlaces centrales: `Inicio`, `Salones`, `Banco`, `Sesiones (badge)`.
  * Acciones: Pantalla completa y Avatar de docente.
* **Prohibición de Controles Duplicados:** La barra superior es la **única** ubicación de navegación general; queda prohibido agregar docks inferiores con los mismos botones.

### 5.3. Escenario Central: Ficha A5 de Papel Físico con Escaneo Láser Sutil
* El objeto protagonista es una **Ficha A5 de papel real**, blanca pura (`#ffffff`), con bordes nítidos, marcadores ArUco de esquina y cuadrícula realista.
* Un haz de luz de escaneo sutil (`#0284c7`) recorre verticalmente la ficha para comunicar la tecnología de visión artificial de forma elegante y no invasiva.
* **Prohibición de Ruido Visual:** Eliminados los badges de telemetría flotantes, chips con specs irrelevantes y fuegos artificiales decorativos.

### 5.4. Tarjetas de Modalidad Diáfanas y Sin Relleno
* 3 tarjetas en blanco puro con elevación sutil al hover:
  * **Evaluación Formativa (IA):** Análisis cualitativo del procedimiento manuscrito.
  * **Focalizada en Respuesta:** Corrección directa de alternativas marcadas (1–5 preguntas).
  * **Cartilla OMR:** Calificación masiva instantánea hasta 20 preguntas sin IA.
* Cero listas de chips de relleno técnico; solo título claro, descripción en una línea y acción directa hacia el flujo.


---

## 6. Guardarraíles Innegociables de Seguridad Técnica (Anti-Regresión)

> [!CAUTION]
> **REGLA SUPREMA: NINGÚN CAMBIO DE UI PUEDE AFECTAR LA LÓGICA NI LA GEOMETRÍA IMPRESA.**

1. **Intocabilidad de IDs y Controladores DOM:**
   * Ningún rediseño CSS o HTML puede renombrar, eliminar o reubicar elementos con IDs funcionales (`builder-classroom`, `btn-save-session`, `step-summary`, `input-eval-*`, `modal-*`, etc.).
   * Los controladores `onclick`, `onchange` e `oninput` deben preservarse íntegros.
2. **Blindaje de la Geometría Física de Fichas (Reglas 4, 13 y 14 de AGENTS.md):**
   * Las reglas de impresión `@media print`, los contenedores `.sheet-a4`, `.a5-card`, `.card-header`, `.qr-box`, y los cálculos del simulador WYSIWYG son **soberanos e intocables por el sistema de diseño web**.
   * El encabezado de la ficha física mantiene siempre **20 mm** de altura fija, clearance de **16 mm** para marcadores ArUco y marco perimetral negro cerrado de **1 mm**.
3. **Cero Ruptura del Algoritmo de Visión Artificial:**
   * La cámara, el clasificador neuronal INT8 y la lectura OMR dependen de la pureza en blanco y negro del papel. Ningún gradiente, sombra o redondeo decorativo de este sistema puede filtrarse hacia las plantillas de impresión.

---

## 7. Versionado y Registro de Cambios

* **Versión inicial del documento:** v1.0.0
* **Fecha de fijación:** Octubre 2026
* **Versión del software sincronizada:** `v3.2.17`
