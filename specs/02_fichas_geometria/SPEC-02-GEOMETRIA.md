# SPEC-02: Geometría Física y Fichas Imprimibles

* **Versión:** 1.0.0
* **Estado:** Aprobada
* **Módulos de Código:** `card-generator.js`, `card-simulator.js`, `styles.css`
* **Fuente Canónica:** `ESPECIFICACION_FICHA_INTERACTIVA.md`, `AGENTS.md` (Reglas 4, 13 y 14)

---

## 1. Propósito Pedagógico y Técnico

Las fichas de evaluación son leídas por la cámara de teléfonos móviles en el aula mediante algoritmos de visión artificial. Para que la rectificación de perspectiva (*perspective warp*) sea matemáticamente exacta y el escaneo ocurra en menos de 100 ms, las dimensiones físicas impresas, la posición de los marcadores ArUco y los espacios libres de despeje (*clearances*) deben mantenerse dentro de tolerancias milimétricas estrictas.

---

## 2. Reglas Inmutables y Guardarraíles

1. **Guardarraíl 14 (Tolerancia Cero $\pm 1\text{ mm}$):** Las medidas computadas en renderizado real de navegador deben cumplir:
   * **A6 Horizontal:** Ancho $132\text{ mm} \pm 1\text{ mm}$ × Alto $89\text{ mm} \pm 1\text{ mm}$ (Relación $W/H \approx 1.48$).
   * **A6 Vertical:** Ancho $89\text{ mm} \pm 1\text{ mm}$ × Alto $132\text{ mm} \pm 1\text{ mm}$ (Relación $W/H \approx 0.67$).
   * **A5 Horizontal:** Ancho $186\text{ mm} \pm 1\text{ mm}$ × Alto $134\text{ mm} \pm 1\text{ mm}$ (Relación $W/H \approx 1.39$).
   * **A5 Vertical:** Ancho $132\text{ mm} \pm 1\text{ mm}$ × Alto $182\text{ mm} \pm 1\text{ mm}$ (Relación $W/H \approx 0.72$).
2. **Soberanía de Dimensiones en Contenedores Flex:** Ninguna propiedad `flex-basis`, `flex-shrink` o regla externa de contenedores padres puede aplastar o estirar los ejes de una ficha (`.sim-card-host`).
3. **Guardarraíl 13 (Marco Perimetral y Margen Blanco):** Toda ficha con ArUco y QR lleva un marco perimetral negro de $1\text{ mm}$ (`border: 1mm solid #000000`). Entre el borde exterior de la hoja de papel y el marco negro de la ficha debe existir siempre un margen libre en blanco para evitar mutilaciones por los rodillos de arrastre de impresoras.
4. **Geometría Sagrada de la Cabecera:**
   * La cabecera `.card-header` mantiene **20 mm** de altura fija.
   * El espaciado interior (`padding`) horizontal es de al menos **16 mm** para dejar libres los marcadores ArUco (los marcadores miden $10\text{ mm}$ y están a $5\text{ mm}$ del borde, ocupando hasta $15\text{ mm}$).
   * Ningún texto ni QR puede situarse a menos de **4 mm** del borde interno de un marcador ArUco.

---

## 3. Especificación de Componentes por Ficha

```text
┌────────────────────────────────────────────────────────┐
│ [ArUco TL: 10mm]                  [ArUco TR: 10mm]     │
│       CABECERA (20mm fijos): Alumno | Grado | QR       │
│                                                        │
│       ENUNCIADO (Ranura fija o proporcional)           │
│                                                        │
│       CUADRÍCULA DE CÁLCULO (Borrador manuscrito)      │
│       ó ALTERNATIVAS A, B, C, D                        │
│                                                        │
│       FRANJA DE RESPUESTA DIRECTA (Rpta: ______)       │
│ [ArUco BL: 10mm]                  [ArUco BR: 10mm]     │
└────────────────────────────────────────────────────────┘
```

---

## 4. Criterios de Aceptación (Verificables)

* `CRIT-GEO-01`: **Dimensiones Físicas A6 Horizontal**
  * *Dado* el simulador o el generador de PDF renderizando una ficha A6 Horizontal
  * *Cuando* se mide el ancho y alto computados
  * *Entonces* el ancho debe ser $132\text{ mm} \pm 1\text{ mm}$ y el alto $89\text{ mm} \pm 1\text{ mm}$.

* `CRIT-GEO-02`: **Dimensiones Físicas A5 Horizontal**
  * *Dado* el simulador o el generador de PDF renderizando una ficha A5 Horizontal
  * *Cuando* se mide el ancho y alto computados
  * *Entonces* el ancho debe ser $186\text{ mm} \pm 1\text{ mm}$ y el alto $134\text{ mm} \pm 1\text{ mm}$.

* `CRIT-GEO-03`: **Inmutabilidad de la Cabecera (20 mm)**
  * *Dado* una ficha con 1 pregunta o 2 preguntas con texto largo (hasta 3 líneas)
  * *Cuando* se renderiza la ficha
  * *Entonces* la cabecera debe mantener exactamente $20\text{ mm}$ de altura; el ajuste espacial recae única y exclusivamente sobre la cuadrícula de cálculo.

* `CRIT-GEO-04`: **Zona Limpia de Marcadores ArUco**
  * *Dado* cualquier tipo de ficha impresa
  * *Cuando* se inspeccionan las 4 esquinas interiores
  * *Entonces* debe existir un espacio libre $\ge 4\text{ mm}$ entre el marcador ArUco y cualquier texto, borde de tabla o código QR.
