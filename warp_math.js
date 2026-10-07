// Math and rendering module for real-time quad tracking and perspective warping
function getSquareToQuadTransform(qTL, qTR, qBR, qBL) {
  const x0 = qTL.x, y0 = qTL.y;
  const x1 = qTR.x, y1 = qTR.y;
  const x2 = qBR.x, y2 = qBR.y;
  const x3 = qBL.x, y3 = qBL.y;

  const dx1 = x1 - x2, dx2 = x3 - x2, sx = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, sy = y0 - y1 + y2 - y3;

  const det = dx1 * dy2 - dx2 * dy1;
  let g = 0, h = 0;
  if (Math.abs(det) > 1e-7) {
    g = (sx * dy2 - sy * dx2) / det;
    h = (dx1 * sy - dy1 * sx) / det;
  }
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + h * x3;
  const c = x0;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + h * y3;
  const f = y0;

  return function map(u, v) {
    const denom = g * u + h * v + 1;
    return {
      x: (a * u + b * v + c) / denom,
      y: (d * u + e * v + f) / denom
    };
  };
}

function estimateSheetQuad(qTL, qTR, qBR, qBL) {
  const vx = {
    x: ((qTR.x - qTL.x) + (qBR.x - qBL.x)) / 2,
    y: ((qTR.y - qTL.y) + (qBR.y - qBL.y)) / 2
  };
  const vy = {
    x: ((qBL.x - qTL.x) + (qBR.x - qTR.x)) / 2,
    y: ((qBL.y - qTL.y) + (qBR.y - qTR.y)) / 2
  };

  // Calibrado con margen exterior holgado (~6mm) hacia afuera de los 4 marcadores negros
  // para asegurar que los 4 cuadrados negros queden 100% íntegros, libres de cortes y holgados
  const uL = -6.02; // Margen exterior izquierdo ampliado
  const uR = 1.67;  // Margen exterior derecho ampliado
  const vT = -0.37; // Margen exterior superior ampliado
  const vB = 5.02;  // Margen exterior inferior ampliado

  return {
    pTL: { x: qTL.x + uL * vx.x + vT * vy.x, y: qTL.y + uL * vx.y + vT * vy.y },
    pTR: { x: qTL.x + uR * vx.x + vT * vy.x, y: qTL.y + uR * vx.y + vT * vy.y },
    pBR: { x: qTL.x + uR * vx.x + vB * vy.x, y: qTL.y + uR * vx.y + vB * vy.y },
    pBL: { x: qTL.x + uL * vx.x + vB * vy.x, y: qTL.y + uL * vx.y + vB * vy.y }
  };
}

function checkCornersInFrame(quad, width, height, margin = 14) {
  const corners = [
    { id: 'TL', name: 'superior izquierda', p: quad.pTL },
    { id: 'TR', name: 'superior derecha', p: quad.pTR },
    { id: 'BR', name: 'inferior derecha', p: quad.pBR },
    { id: 'BL', name: 'inferior izquierda', p: quad.pBL }
  ];

  const outside = [];
  for (const c of corners) {
    if (c.p.x < margin || c.p.x > width - margin || c.p.y < margin || c.p.y > height - margin) {
      outside.push(c);
    }
  }

  return {
    isFullyInside: outside.length === 0,
    outsideCorners: outside
  };
}

function getQuadArea(pTL, pTR, pBR, pBL) {
  const x = [pTL.x, pTR.x, pBR.x, pBL.x];
  const y = [pTL.y, pTR.y, pBR.y, pBL.y];
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    area += x[i] * y[j] - x[j] * y[i];
  }
  return Math.abs(area) / 2;
}

function renderPerspectiveWarp(sourceCanvas, quad, destWidth, destHeight) {
  const destCanvas = document.createElement('canvas');
  destCanvas.width = destWidth;
  destCanvas.height = destHeight;
  const ctx = destCanvas.getContext('2d');

  const subdivisions = 8;
  for (let i = 0; i < subdivisions; i++) {
    for (let j = 0; j < subdivisions; j++) {
      const u0 = i / subdivisions;
      const v0 = j / subdivisions;
      const u1 = (i + 1) / subdivisions;
      const v1 = (j + 1) / subdivisions;

      const dx0 = u0 * destWidth;
      const dy0 = v0 * destHeight;
      const dx1 = u1 * destWidth;
      const dy1 = v1 * destHeight;

      function interp(u, v) {
        const topX = quad.pTL.x + u * (quad.pTR.x - quad.pTL.x);
        const topY = quad.pTL.y + u * (quad.pTR.y - quad.pTL.y);
        const botX = quad.pBL.x + u * (quad.pBR.x - quad.pBL.x);
        const botY = quad.pBL.y + u * (quad.pBR.y - quad.pBL.y);
        return {
          x: topX + v * (botX - topX),
          y: topY + v * (botY - topY)
        };
      }

      const p00 = interp(u0, v0);
      const p10 = interp(u1, v0);
      const p11 = interp(u1, v1);
      const p01 = interp(u0, v1);

      drawTriangleAffine(ctx, sourceCanvas, p00, p10, p01, {x: dx0, y: dy0}, {x: dx1, y: dy0}, {x: dx0, y: dy1});
      drawTriangleAffine(ctx, sourceCanvas, p10, p11, p01, {x: dx1, y: dy0}, {x: dx1, y: dy1}, {x: dx0, y: dy1});
    }
  }

  return destCanvas;
}

function drawTriangleAffine(destCtx, srcImg, s0, s1, s2, d0, d1, d2) {
  const x0 = s0.x, y0 = s0.y;
  const x1 = s1.x, y1 = s1.y;
  const x2 = s2.x, y2 = s2.y;

  const det = x0 * (y1 - y2) + x1 * (y2 - y0) + x2 * (y0 - y1);
  if (Math.abs(det) < 1e-6) return;

  const u0 = d0.x, u1 = d1.x, u2 = d2.x;
  const v0 = d0.y, v1 = d1.y, v2 = d2.y;

  const a = (u0 * (y1 - y2) + u1 * (y2 - y0) + u2 * (y0 - y1)) / det;
  const c = (u0 * (x2 - x1) + u1 * (x0 - x2) + u2 * (x1 - x0)) / det;
  const e = (u0 * (x1 * y2 - x2 * y1) + u1 * (x2 * y0 - x0 * y2) + u2 * (x0 * y1 - x1 * y0)) / det;

  const b = (v0 * (y1 - y2) + v1 * (y2 - y0) + v2 * (y0 - y1)) / det;
  const d = (v0 * (x2 - x1) + v1 * (x0 - x2) + v2 * (x1 - x0)) / det;
  const f = (v0 * (x1 * y2 - x2 * y1) + v1 * (x2 * y0 - x0 * y2) + v2 * (x0 * y1 - x1 * y0)) / det;

  destCtx.save();
  destCtx.beginPath();
  destCtx.moveTo(d0.x, d0.y);
  destCtx.lineTo(d1.x, d1.y);
  destCtx.lineTo(d2.x, d2.y);
  destCtx.closePath();
  destCtx.clip();

  destCtx.transform(a, b, c, d, e, f);
  destCtx.drawImage(srcImg, 0, 0);
  destCtx.restore();
}

if (typeof module !== 'undefined') {
  module.exports = {
    getSquareToQuadTransform,
    estimateSheetQuad,
    checkCornersInFrame,
    getQuadArea,
    renderPerspectiveWarp,
    drawTriangleAffine
  };
}
