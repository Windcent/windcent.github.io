/**
 * HHB_Builder - Balloon Mathematics & Physics Engine
 * Handles profile interpolation, numerical integration (volume, surface area, arc length),
 * flat gore projection, panel cutting layouts, and aerostatic flight physics.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BalloonMath = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Constants
  const R_SPECIFIC_AIR = 287.058; // J/(kg*K) specific gas constant for dry air
  const P0_SEA_LEVEL = 101325;    // Pa standard sea level pressure
  const T0_SEA_LEVEL = 288.15;    // K (15 C) standard sea level temperature
  const LAPSE_RATE = 0.0065;      // K/m tropospheric temperature lapse rate
  const GRAVITY = 9.80665;        // m/s^2

  /**
   * Monotone Cubic Spline (Fritsch-Carlson algorithm).
   * Prevents overshooting and guarantees smooth, non-oscillating radius curves.
   */
  class MonotoneCubicSpline {
    constructor(points) {
      // Points must be sorted by z (height)
      this.points = points.slice().sort((a, b) => a.z - b.z);
      this.n = this.points.length;
      if (this.n < 2) {
        throw new Error('At least 2 points required for spline');
      }

      const z = this.points.map(p => p.z);
      const r = this.points.map(p => Math.max(0, p.r)); // radius is non-negative
      this.z = z;
      this.r = r;

      const n = this.n;
      const dx = new Float64Array(n - 1);
      const dy = new Float64Array(n - 1);
      const slopes = new Float64Array(n - 1);

      for (let i = 0; i < n - 1; i++) {
        dx[i] = z[i + 1] - z[i];
        dy[i] = r[i + 1] - r[i];
        slopes[i] = dx[i] === 0 ? 0 : dy[i] / dx[i];
      }

      const m = new Float64Array(n);
      m[0] = slopes[0];
      m[n - 1] = slopes[n - 2];

      for (let i = 1; i < n - 1; i++) {
        if (slopes[i - 1] * slopes[i] <= 0) {
          m[i] = 0;
        } else {
          m[i] = (slopes[i - 1] + slopes[i]) / 2;
        }
      }

      for (let i = 0; i < n - 1; i++) {
        if (dy[i] === 0) {
          m[i] = 0;
          m[i + 1] = 0;
        } else {
          const alpha = m[i] / slopes[i];
          const beta = m[i + 1] / slopes[i];
          const dist = alpha * alpha + beta * beta;
          if (dist > 9) {
            const tau = 3 / Math.sqrt(dist);
            m[i] = tau * alpha * slopes[i];
            m[i + 1] = tau * beta * slopes[i];
          }
        }
      }

      this.m = m;
      this.c = new Float64Array(n - 1);
      this.d = new Float64Array(n - 1);

      for (let i = 0; i < n - 1; i++) {
        const h = dx[i];
        if (h === 0) continue;
        this.c[i] = (3 * slopes[i] - 2 * m[i] - m[i + 1]) / h;
        this.d[i] = (m[i] + m[i + 1] - 2 * slopes[i]) / (h * h);
      }
    }

    eval(zVal) {
      const z = this.z;
      const r = this.r;
      const n = this.n;

      if (zVal <= z[0]) return Math.max(0, r[0]);
      if (zVal >= z[n - 1]) return Math.max(0, r[n - 1]);

      // Binary search for interval
      let low = 0;
      let high = n - 2;
      while (low <= high) {
        const mid = (low + high) >> 1;
        if (zVal < z[mid]) {
          high = mid - 1;
        } else if (zVal > z[mid + 1]) {
          low = mid + 1;
        } else {
          const dx = zVal - z[mid];
          const res = r[mid] + this.m[mid] * dx + this.c[mid] * dx * dx + this.d[mid] * dx * dx * dx;
          return Math.max(0, res);
        }
      }
      return Math.max(0, r[n - 1]);
    }

    evalDerivative(zVal) {
      const z = this.z;
      const n = this.n;

      if (zVal <= z[0]) return this.m[0];
      if (zVal >= z[n - 1]) return this.m[n - 1];

      let low = 0;
      let high = n - 2;
      while (low <= high) {
        const mid = (low + high) >> 1;
        if (zVal < z[mid]) {
          high = mid - 1;
        } else if (zVal > z[mid + 1]) {
          low = mid + 1;
        } else {
          const dx = zVal - z[mid];
          return this.m[mid] + 2 * this.c[mid] * dx + 3 * this.d[mid] * dx * dx;
        }
      }
      return 0;
    }
  }

  /**
   * Balloon envelope geometry and calculus solver.
   */
  class EnvelopeSolver {
    constructor(controlPoints, samples = 300) {
      this.controlPoints = controlPoints;
      this.samples = Math.max(100, samples);
      this.spline = new MonotoneCubicSpline(controlPoints);
      this.minZ = this.spline.z[0];
      this.maxZ = this.spline.z[this.spline.n - 1];
      this.height = this.maxZ - this.minZ;

      this._computeProfileData();
    }

    _computeProfileData() {
      const N = this.samples;
      const dz = this.height / (N - 1);

      this.zData = new Float64Array(N);
      this.rData = new Float64Array(N);
      this.arcLength = new Float64Array(N);
      this.cumVolume = new Float64Array(N);
      this.cumArea = new Float64Array(N);

      let maxR = 0;
      let maxRZ = 0;
      let totalS = 0;
      let totalV = 0;
      let totalA = 0;

      this.zData[0] = this.minZ;
      this.rData[0] = this.spline.eval(this.minZ);
      this.arcLength[0] = 0;
      this.cumVolume[0] = 0;
      this.cumArea[0] = 0;

      if (this.rData[0] > maxR) {
        maxR = this.rData[0];
        maxRZ = this.minZ;
      }

      for (let i = 1; i < N; i++) {
        const zCurr = this.minZ + i * dz;
        const rCurr = this.spline.eval(zCurr);
        const zPrev = this.zData[i - 1];
        const rPrev = this.rData[i - 1];

        const deltaZ = zCurr - zPrev;
        const deltaR = rCurr - rPrev;
        const ds = Math.sqrt(deltaZ * deltaZ + deltaR * deltaR);
        totalS += ds;

        // Frustum of cone volume: V = (pi * dz / 3) * (r1^2 + r1*r2 + r2^2)
        const dV = (Math.PI * deltaZ / 3) * (rPrev * rPrev + rPrev * rCurr + rCurr * rCurr);
        totalV += dV;

        // Frustum lateral surface area: A = pi * (r1 + r2) * ds
        const dA = Math.PI * (rPrev + rCurr) * ds;
        totalA += dA;

        this.zData[i] = zCurr;
        this.rData[i] = rCurr;
        this.arcLength[i] = totalS;
        this.cumVolume[i] = totalV;
        this.cumArea[i] = totalA;

        if (rCurr > maxR) {
          maxR = rCurr;
          maxRZ = zCurr;
        }
      }

      this.maxRadius = maxR;
      this.maxRadiusZ = maxRZ;
      this.totalArcLength = totalS;
      this.totalVolume = totalV;
      this.totalSurfaceArea = totalA;
      this.throatRadius = this.rData[0];
      this.crownRadius = this.rData[N - 1];
    }

    /**
     * Map arc length s in [0, totalArcLength] to height z.
     */
    getZFromArcLength(s) {
      if (s <= 0) return this.minZ;
      if (s >= this.totalArcLength) return this.maxZ;

      let low = 0;
      let high = this.samples - 1;
      while (low <= high) {
        const mid = (low + high) >> 1;
        if (this.arcLength[mid] < s) {
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      const idx = Math.max(0, Math.min(this.samples - 2, low - 1));
      const s0 = this.arcLength[idx];
      const s1 = this.arcLength[idx + 1];
      const t = s1 === s0 ? 0 : (s - s0) / (s1 - s0);
      return this.zData[idx] + t * (this.zData[idx + 1] - this.zData[idx]);
    }

    /**
     * Get radius at arc length s.
     */
    getRadiusAtArc(s) {
      const z = this.getZFromArcLength(s);
      return this.spline.eval(z);
    }
  }

  /**
   * Panel & Gore Cutter Planner.
   * Calculates flattened gore pattern and partitions into individual panels
   * based on user constraints (max fabric roll width, max panel height, seam allowance).
   */
  class GoreCutter {
    constructor(solver, options = {}) {
      this.solver = solver;
      this.goreCount = Math.max(4, options.goreCount || 10);
      this.panelCount = Math.max(1, options.panelCount !== undefined ? options.panelCount : 1);
      this.maxFabricWidth = options.maxFabricWidth || 1.50; // meters (e.g. 1.5m standard bolt)
      this.maxPanelHeight = options.maxPanelHeight !== undefined ? options.maxPanelHeight : 10.00; // meters (default 10m)
      this.seamAllowance = options.seamAllowance || 0.020;  // 20mm French fell seam
      this.enableMaxSizeConstraint = options.enableMaxSizeConstraint !== undefined ? Boolean(options.enableMaxSizeConstraint) : true;
      this.throatCutZ = options.throatCutZ !== undefined ? options.throatCutZ : solver.minZ;
      this.crownCutZ = options.crownCutZ !== undefined ? options.crownCutZ : solver.maxZ;

      this.panels = [];
      this.maxGoreWidth = 0;
      this.hasConstraintViolations = false;
      this.violations = [];

      this.computeGoreLayout();
    }

    computeGoreLayout() {
      const S = this.solver.totalArcLength;
      const N = this.goreCount;
      const P = this.panelCount;
      const seam = this.seamAllowance;
      const checkConstraints = this.enableMaxSizeConstraint;

      this.panels = [];
      this.violations = [];
      this.hasConstraintViolations = false;

      // Equal arc length spacing for panel stations
      const stationArcs = [];
      for (let i = 0; i <= P; i++) {
        stationArcs.push((i / P) * S);
      }

      let maxW = 0;

      for (let i = 0; i < P; i++) {
        const sBottom = stationArcs[i];
        const sTop = stationArcs[i + 1];
        const heightArc = sTop - sBottom;

        // Sample points along panel to find true maximum width and perimeter
        const subSteps = 30;
        let pMaxWidth = 0;
        let pMaxWidthS = sBottom;
        const contour = [];

        for (let j = 0; j <= subSteps; j++) {
          const sCurr = sBottom + (j / subSteps) * heightArc;
          const rCurr = this.solver.getRadiusAtArc(sCurr);
          const fullW = (2 * Math.PI * rCurr) / N;
          const halfW = fullW / 2;

          if (fullW > pMaxWidth) {
            pMaxWidth = fullW;
            pMaxWidthS = sCurr;
          }

          contour.push({
            s: sCurr,
            sRel: sCurr - sBottom,
            radius: rCurr,
            width: fullW,
            halfWidth: halfW
          });
        }

        const rBottom = this.solver.getRadiusAtArc(sBottom);
        const rTop = this.solver.getRadiusAtArc(sTop);
        const wBottom = (2 * Math.PI * rBottom) / N;
        const wTop = (2 * Math.PI * rTop) / N;

        // Cut dimensions with seam allowance
        const cutWidthMax = pMaxWidth + 2 * seam;
        const cutWidthBottom = wBottom + 2 * seam;
        const cutWidthTop = wTop + 2 * seam;
        const cutHeight = heightArc + 2 * seam;

        // Diagonal squareness distance for table lofting:
        // Distance from bottom-left corner to top-right corner on flat fabric
        const dxDiag = (cutWidthBottom / 2) + (cutWidthTop / 2);
        const dyDiag = cutHeight;
        const diagonal = Math.sqrt(dxDiag * dxDiag + dyDiag * dyDiag);

        // Approximate panel flat fabric area (trapezoid with seam allowance)
        const fabricArea = ((cutWidthBottom + cutWidthTop) / 2) * cutHeight;

        // Constraint validation (only active if enableMaxSizeConstraint is true)
        const exceedsWidth = checkConstraints && (cutWidthMax > this.maxFabricWidth);
        const exceedsHeight = checkConstraints && (cutHeight > this.maxPanelHeight);

        if (exceedsWidth || exceedsHeight) {
          this.hasConstraintViolations = true;
          this.violations.push({
            panelIndex: i + 1,
            exceedsWidth,
            exceedsHeight,
            cutWidthMax,
            maxAllowedWidth: this.maxFabricWidth,
            cutHeight,
            maxAllowedHeight: this.maxPanelHeight,
            widthExcess: cutWidthMax - this.maxFabricWidth,
            heightExcess: cutHeight - this.maxPanelHeight
          });
        }

        if (cutWidthMax > maxW) {
          maxW = cutWidthMax;
        }

        this.panels.push({
          index: i + 1,
          name: `PANEL #${String(i + 1).padStart(2, '0')}`,
          sBottom,
          sTop,
          heightArc,
          wBottom,
          wTop,
          maxWidth: pMaxWidth,
          maxWidthS: pMaxWidthS,
          cutWidthBottom,
          cutWidthTop,
          cutWidthMax,
          cutHeight,
          diagonal,
          fabricArea,
          seamAllowance: seam,
          exceedsWidth,
          exceedsHeight,
          contour
        });
      }

      this.maxGoreWidth = maxW;
    }

    /**
     * Compute coordinate lofting table for a specific panel.
     * Returns an array of cross-station cut coordinates with seam allowances.
     */
    getLoftingTable(panelIndex, steps = 10) {
      const panel = this.panels[panelIndex - 1];
      if (!panel) return [];

      const list = [];
      const seam = this.seamAllowance;
      const H = panel.heightArc;

      for (let i = 0; i <= steps; i++) {
        const frac = i / steps;
        const sRel = frac * H;
        const sAbs = panel.sBottom + sRel;
        const r = this.solver.getRadiusAtArc(sAbs);
        const wSeam = (2 * Math.PI * r) / this.goreCount;
        const halfSeam = wSeam / 2;
        const halfCut = halfSeam + seam;

        // Notches at 25%, 50%, 75%
        const isNotch = (i === Math.round(steps * 0.25) || i === Math.round(steps * 0.5) || i === Math.round(steps * 0.75));

        list.push({
          step: i,
          percent: Math.round(frac * 100),
          sRelativeM: sRel,
          sCutM: sRel + seam,
          halfWidthSeamM: halfSeam,
          fullWidthSeamM: wSeam,
          halfWidthCutM: halfCut,
          fullWidthCutM: halfCut * 2,
          isNotch
        });
      }

      return list;
    }

    /**
     * Generate printable / CAD SVG vector data for a panel.
     */
    generatePanelSVG(panelIndex, options = {}) {
      const panel = this.panels[panelIndex - 1];
      if (!panel) return '';

      const scale = options.scale || 100; // 100 px per meter
      const seam = this.seamAllowance;
      const margin = 40;

      const totalH = panel.cutHeight;
      const maxW = Math.max(panel.cutWidthMax, this.maxFabricWidth);

      const svgWidth = maxW * scale + margin * 2;
      const svgHeight = totalH * scale + margin * 2;
      const cx = svgWidth / 2;

      // Construct path for seam line (inner) and cut line (outer)
      const contour = panel.contour;
      const nSteps = contour.length;

      // Cut line path
      let cutD = '';
      // Bottom edge: from left to right at y = margin + seam*scale
      const yBottomCut = svgHeight - margin;
      const yTopCut = margin;

      // We map sRel from 0 (bottom) to H (top)
      const getCutY = (sRel) => yBottomCut - (sRel + seam) * scale;
      const getSeamY = (sRel) => yBottomCut - (sRel + seam) * scale;

      // Outer cut points (right side going up)
      const rightCutPoints = [];
      const leftCutPoints = [];

      for (let i = 0; i < nSteps; i++) {
        const pt = contour[i];
        const y = getCutY(pt.sRel);
        const xHalfCut = (pt.halfWidth + seam) * scale;
        rightCutPoints.push({ x: cx + xHalfCut, y });
        leftCutPoints.push({ x: cx - xHalfCut, y });
      }

      // Cut path string
      cutD = `M ${cx - (panel.cutWidthBottom / 2) * scale} ${yBottomCut} ` +
             `L ${cx + (panel.cutWidthBottom / 2) * scale} ${yBottomCut} `;

      for (let i = 0; i < rightCutPoints.length; i++) {
        cutD += `L ${rightCutPoints[i].x.toFixed(1)} ${rightCutPoints[i].y.toFixed(1)} `;
      }

      cutD += `L ${cx - (panel.cutWidthTop / 2) * scale} ${yTopCut} `;

      for (let i = leftCutPoints.length - 1; i >= 0; i--) {
        cutD += `L ${leftCutPoints[i].x.toFixed(1)} ${leftCutPoints[i].y.toFixed(1)} `;
      }
      cutD += 'Z';

      // Inner stitch seam path
      let seamD = '';
      const rightSeamPoints = [];
      const leftSeamPoints = [];
      const yBottomSeam = yBottomCut - seam * scale;
      const yTopSeam = yTopCut + seam * scale;

      for (let i = 0; i < nSteps; i++) {
        const pt = contour[i];
        const y = yBottomCut - (pt.sRel + seam) * scale;
        const xHalf = pt.halfWidth * scale;
        rightSeamPoints.push({ x: cx + xHalf, y });
        leftSeamPoints.push({ x: cx - xHalf, y });
      }

      seamD = `M ${cx - (panel.wBottom / 2) * scale} ${yBottomSeam} ` +
              `L ${cx + (panel.wBottom / 2) * scale} ${yBottomSeam} `;

      for (let i = 0; i < rightSeamPoints.length; i++) {
        seamD += `L ${rightSeamPoints[i].x.toFixed(1)} ${rightSeamPoints[i].y.toFixed(1)} `;
      }

      seamD += `L ${cx - (panel.wTop / 2) * scale} ${yTopSeam} `;

      for (let i = leftSeamPoints.length - 1; i >= 0; i--) {
        seamD += `L ${leftSeamPoints[i].x.toFixed(1)} ${leftSeamPoints[i].y.toFixed(1)} `;
      }
      seamD += 'Z';

      // Fabric Roll Limit Guideline
      const halfBolt = (this.maxFabricWidth / 2) * scale;
      const boltX1 = cx - halfBolt;
      const boltX2 = cx + halfBolt;

      return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth.toFixed(1)} ${svgHeight.toFixed(1)}" width="${svgWidth.toFixed(1)}" height="${svgHeight.toFixed(1)}">
  <style>
    .bg { fill: #0a0800; }
    .bolt-guide { stroke: #664400; stroke-width: 1.5; stroke-dasharray: 6 4; }
    .cut-line { stroke: #ffb000; stroke-width: 2.5; fill: none; }
    .seam-line { stroke: #ff8800; stroke-width: 1.5; stroke-dasharray: 4 3; fill: rgba(255,176,0,0.06); }
    .center-line { stroke: #ffaa00; stroke-width: 1; stroke-dasharray: 8 4 2 4; }
    .notch { stroke: #ffd040; stroke-width: 2; }
    .text-title { fill: #ffb000; font-family: monospace; font-size: 14px; font-weight: bold; }
    .text-dim { fill: #ffcc00; font-family: monospace; font-size: 11px; }
  </style>
  <rect class="bg" width="100%" height="100%" />

  <!-- Fabric Bolt Width Reference -->
  <line class="bolt-guide" x1="${boltX1.toFixed(1)}" y1="${margin}" x2="${boltX1.toFixed(1)}" y2="${(svgHeight - margin).toFixed(1)}" />
  <line class="bolt-guide" x2="${boltX2.toFixed(1)}" y1="${margin}" x2="${boltX2.toFixed(1)}" y2="${(svgHeight - margin).toFixed(1)}" />
  <text class="text-dim" x="${(boltX1 + 6).toFixed(1)}" y="${margin + 16}">BOLT LIMIT: ${(this.maxFabricWidth).toFixed(2)}m</text>

  <!-- Centerline -->
  <line class="center-line" x1="${cx}" y1="${margin - 15}" x2="${cx}" y2="${svgHeight - margin + 15}" />

  <!-- Stitch Seam Line -->
  <path class="seam-line" d="${seamD}" />

  <!-- Cut Line -->
  <path class="cut-line" d="${cutD}" />

  <!-- Annotations -->
  <text class="text-title" x="${cx}" y="${margin - 18}" text-anchor="middle">HHB_BUILDER // ${panel.name} // GORE COUNT: ${this.goreCount}</text>
  <text class="text-dim" x="${cx}" y="${yTopCut - 6}" text-anchor="middle">TOP CUT: ${(panel.cutWidthTop).toFixed(3)}m (SEAM: ${(panel.wTop).toFixed(3)}m)</text>
  <text class="text-dim" x="${cx}" y="${yBottomCut + 18}" text-anchor="middle">BOT CUT: ${(panel.cutWidthBottom).toFixed(3)}m (SEAM: ${(panel.wBottom).toFixed(3)}m)</text>
  <text class="text-dim" x="${(cx + (panel.cutWidthMax / 2) * scale + 15).toFixed(1)}" y="${((yTopCut + yBottomCut) / 2).toFixed(1)}">HEIGHT: ${(panel.cutHeight).toFixed(3)}m | MAX-W: ${(panel.cutWidthMax).toFixed(3)}m</text>
  <text class="text-dim" x="${margin}" y="${svgHeight - 12}">SEAM ALLOWANCE: ${(seam * 1000).toFixed(0)}mm | AREA: ${(panel.fabricArea).toFixed(2)}m²</text>
</svg>`;
    }

    /**
     * Nesting & Total Fabric Usage estimation across all gores.
     */
    getFabricSummary() {
      const P = this.panels.length;
      const N = this.goreCount;

      let singleGoreArea = 0;
      let singleGoreCutHeight = 0;

      for (let i = 0; i < P; i++) {
        singleGoreArea += this.panels[i].fabricArea;
        singleGoreCutHeight += this.panels[i].cutHeight;
      }

      const totalEnvelopeFabricArea = singleGoreArea * N;
      // Linear meters on bolt assuming average packing efficiency of 85%
      const estimatedBoltLength = (totalEnvelopeFabricArea / this.maxFabricWidth) * 1.15;

      return {
        goreCount: N,
        panelCountPerGore: P,
        totalPanelsToCut: N * P,
        singleGoreArea,
        singleGoreCutHeight,
        totalEnvelopeFabricArea,
        estimatedBoltLengthMeters: estimatedBoltLength,
        estimatedBoltLengthYards: estimatedBoltLength * 1.09361,
        maxGoreCutWidth: this.maxGoreWidth,
        fabricRollWidth: this.maxFabricWidth
      };
    }
  }

  /**
   * Buoyancy and Atmospheric Flight Computer.
   * Calculates density, gross lift, empty weights, payload, FAI classification, and limits.
   */
  class FlightComputer {
    static getFAIClass(volumeM3) {
      if (volumeM3 <= 250) return { code: 'AX-1', desc: 'Mini / Cloudhopper (< 250 m³)' };
      if (volumeM3 <= 400) return { code: 'AX-2', desc: 'Solo Ultra-light (250 - 400 m³)' };
      if (volumeM3 <= 600) return { code: 'AX-3', desc: 'Light 1-Person (400 - 600 m³)' };
      if (volumeM3 <= 900) return { code: 'AX-4', desc: 'Sport Solo (600 - 900 m³)' };
      if (volumeM3 <= 1200) return { code: 'AX-5', desc: 'Compact 2-Person (900 - 1200 m³)' };
      if (volumeM3 <= 1600) return { code: 'AX-6', desc: 'Standard 2-3 Person (1200 - 1600 m³)' };
      if (volumeM3 <= 2200) return { code: 'AX-7', desc: 'Club 3-4 Person (~77k cu ft, 1600 - 2200 m³)' };
      if (volumeM3 <= 3000) return { code: 'AX-8', desc: 'Touring 4-5 Person (~90k-105k cu ft, 2200 - 3000 m³)' };
      if (volumeM3 <= 4000) return { code: 'AX-9', desc: 'Passenger 6-8 Person (3000 - 4000 m³)' };
      if (volumeM3 <= 6000) return { code: 'AX-10', desc: 'Commercial 10-12 Person (4000 - 6000 m³)' };
      return { code: 'AX-11+', desc: 'Large Commercial Safari Envelope (> 6000 m³)' };
    }

    /**
     * Atmospheric pressure at altitude h (meters) using barometric formula.
     */
    static getPressureAtAltitude(altitudeM) {
      if (altitudeM <= 0) return P0_SEA_LEVEL;
      const T = T0_SEA_LEVEL - LAPSE_RATE * altitudeM;
      if (T <= 0) return 0;
      const exponent = (GRAVITY * 0.0289644) / (8.3144598 * LAPSE_RATE);
      return P0_SEA_LEVEL * Math.pow(T / T0_SEA_LEVEL, exponent);
    }

    /**
     * Dry air density given pressure and temperature (Celsius).
     */
    static getAirDensity(pressurePa, tempC) {
      const tempK = tempC + 273.15;
      if (tempK <= 0) return 0;
      return pressurePa / (R_SPECIFIC_AIR * tempK);
    }

    /**
     * Complete aerostatic calculation for balloon envelopes.
     * Computes gross lift, envelope mass, net lift remaining after envelope weight in pounds (lbs),
     * and thermodynamic propane fuel consumption (equilibrium burn rate + cold inflation fuel).
     */
    static calculateFlightPerformance(volumeM3, surfaceAreaM2, params = {}) {
      const altitudeM = params.altitudeM !== undefined ? params.altitudeM : 0;
      const ambientTempC = params.ambientTempC !== undefined ? params.ambientTempC : 25;
      const envelopeTempC = params.envelopeTempC !== undefined ? params.envelopeTempC : 80;
      const fabricWeightGsm = params.fabricWeightGsm || 55; // g/m^2 ripstop nylon
      const tapeFactor = params.tapeFactor !== undefined ? params.tapeFactor : 0.20; // +20% for load tapes and seams

      const canisterFuelOz = params.canisterFuelOz !== undefined ? params.canisterFuelOz : 32.0;
      const containerTareOz = params.containerTareOz !== undefined ? params.containerTareOz : 30.0;
      const fuelMassLbs = canisterFuelOz / 16.0;
      const fuelMassKg = fuelMassLbs / 2.20462;
      const containerTareLbs = containerTareOz / 16.0;
      const containerTareKg = containerTareLbs / 2.20462;
      const fuelRigMassLbs = fuelMassLbs + containerTareLbs;
      const fuelRigMassKg = fuelRigMassLbs / 2.20462;
      const fuelRigMassOz = canisterFuelOz + containerTareOz;

      // Environmental conditions
      const pressurePa = FlightComputer.getPressureAtAltitude(altitudeM);
      const ambientDensity = FlightComputer.getAirDensity(pressurePa, ambientTempC);
      const internalDensity = FlightComputer.getAirDensity(pressurePa, envelopeTempC);

      // Differential density (unit lift in kg/m^3)
      const unitLiftKgM3 = Math.max(0, ambientDensity - internalDensity);

      // Gross Aerostatic Lift
      const grossLiftKg = volumeM3 * unitLiftKgM3;
      const grossLiftLbs = grossLiftKg * 2.20462;
      const grossLiftOz = grossLiftLbs * 16.0;

      // Envelope Mass (Fabric + structural load tapes, skirt, and top crown)
      const rawFabricMassKg = (surfaceAreaM2 * fabricWeightGsm) / 1000;
      const envelopeMassKg = rawFabricMassKg * (1 + tapeFactor);
      const envelopeMassLbs = envelopeMassKg * 2.20462;
      const envelopeMassOz = envelopeMassLbs * 16.0;
      const envelopeMassGrams = envelopeMassKg * 1000.0;

      // Total Fixed Dead Weight: Envelope Structure + Fuel Mass + Container Tare Weight
      const totalDeadWeightKg = envelopeMassKg + fuelRigMassKg;
      const totalDeadWeightLbs = totalDeadWeightKg * 2.20462;

      // True Net Lift (Payload Capacity remaining after Envelope, Fuel, and Container Tare)
      const netLiftKg = Math.max(0, grossLiftKg - totalDeadWeightKg);
      const netLiftLbs = netLiftKg * 2.20462;
      const netLiftOz = netLiftLbs * 16.0;
      const netLiftGrams = netLiftKg * 1000.0;
      const netLiftRatioPct = grossLiftKg > 0 ? (netLiftKg / grossLiftKg) * 100 : 0;

      // Lift remaining after envelope only (before fuel rig deduction, for reference)
      const liftAfterEnvOnlyKg = Math.max(0, grossLiftKg - envelopeMassKg);
      const liftAfterEnvOnlyLbs = liftAfterEnvOnlyKg * 2.20462;

      // Thermal gradient
      const tempDelta = Math.max(1, envelopeTempC - ambientTempC);
      const liftPerDegree = grossLiftKg / tempDelta;

      // -------------------------------------------------------------
      // Thermodynamic Fuel Estimations (Propane / LPG)
      // -------------------------------------------------------------
      const heatLossCoeff = params.heatLossCoeff || 15.0; // W/(m^2*K) overall envelope heat transfer
      const burnerEfficiency = params.burnerEfficiency || 0.70; // 70% combustion & throat transfer
      const inflationEfficiency = params.inflationEfficiency || 0.55; // 55% during initial cold inflation
      const fuelLhvJ = (params.fuelLhvMjKg || 46.3) * 1e6; // 46.3 MJ/kg propane lower heating value

      // 1. Equilibrium heat loss rate & burner power to keep envelope warm
      const heatLossPowerW = heatLossCoeff * surfaceAreaM2 * tempDelta;
      const heatLossPowerKw = heatLossPowerW / 1000.0;
      const burnerPowerW = heatLossPowerW / burnerEfficiency;
      const burnerPowerKw = burnerPowerW / 1000.0;
      const burnerPowerBtuHr = burnerPowerW * 3.41214;

      // Fuel burn rate to keep warm
      const fuelBurnRateKgS = burnerPowerW / fuelLhvJ;
      const fuelBurnRateKgHr = fuelBurnRateKgS * 3600.0;
      const fuelBurnRateLbsHr = fuelBurnRateKgHr * 2.20462;
      const fuelBurnRateOzMin = (fuelBurnRateLbsHr * 16.0) / 60.0;
      const fuelBurnRateGMin = (fuelBurnRateKgHr * 1000.0) / 60.0;

      // 2. Initial fuel needed to heat envelope from ambient to operating temperature
      const coldAirMassKg = volumeM3 * ambientDensity;
      const heatAirJoules = coldAirMassKg * 1005.0 * tempDelta; // c_p air = 1005 J/(kg*K)
      const heatFabricJoules = envelopeMassKg * 1700.0 * tempDelta; // c_p nylon = 1700 J/(kg*K)
      const initialHeatJoules = (heatAirJoules + heatFabricJoules) / inflationEfficiency;
      const initialHeatMj = initialHeatJoules / 1e6;
      const initialHeatBtu = initialHeatJoules * 0.000947817;

      const initialFuelKg = initialHeatJoules / fuelLhvJ;
      const initialFuelLbs = initialFuelKg * 2.20462;
      const initialFuelOz = initialFuelLbs * 16.0;
      const initialFuelGrams = initialFuelKg * 1000.0;

      // Conversions
      const volumeCuFt = volumeM3 * 35.3147;
      const surfaceAreaSqFt = surfaceAreaM2 * 10.7639;
      const fai = FlightComputer.getFAIClass(volumeM3);

      return {
        volumeM3,
        volumeCuFt,
        surfaceAreaM2,
        surfaceAreaSqFt,
        fai,
        pressurePa,
        pressureHpa: pressurePa / 100,
        ambientTempC,
        envelopeTempC,
        tempDelta,
        ambientDensity,
        internalDensity,
        unitLiftKgM3,
        unitLiftLbs1000CuFt: (unitLiftKgM3 * 2.20462) * (1000 / 35.3147),
        grossLiftKg,
        grossLiftLbs,
        grossLiftOz,
        envelopeMassKg,
        envelopeMassLbs,
        envelopeMassOz,
        envelopeMassGrams,
        fuelMassLbs,
        fuelMassKg,
        fuelMassOz: canisterFuelOz,
        containerTareLbs,
        containerTareKg,
        containerTareOz,
        fuelRigMassLbs,
        fuelRigMassKg,
        fuelRigMassOz,
        totalDeadWeightLbs,
        totalDeadWeightKg,
        liftAfterEnvOnlyLbs,
        netLiftKg,
        netLiftLbs,
        netLiftOz,
        netLiftGrams,
        netLiftRatioPct,
        remainingLiftKg: netLiftKg,
        remainingLiftLbs: netLiftLbs,
        remainingLiftOz: netLiftOz,
        remainingLiftGrams: netLiftGrams,
        remainingLiftRatioPct: netLiftRatioPct,
        usefulLiftKg: netLiftKg, // backwards compatibility
        usefulLiftLbs: netLiftLbs,
        usefulLiftOz: netLiftOz,
        usefulLiftGrams: netLiftGrams,
        payloadRatioPct: netLiftRatioPct,
        liftPerDegree,

        // Fuel & Thermodynamics Telemetry
        heatLossPowerW,
        heatLossPowerKw,
        burnerPowerW,
        burnerPowerKw,
        burnerPowerBtuHr,
        fuelBurnRateKgHr,
        fuelBurnRateLbsHr,
        fuelBurnRateOzMin,
        fuelBurnRateGMin,
        initialHeatJoules,
        initialHeatMj,
        initialHeatBtu,
        initialFuelKg,
        initialFuelLbs,
        initialFuelOz,
        initialFuelGrams
      };
    }

    /**
     * Inverse design solver: determines the required linear scale factor k to achieve
     * a specified target remaining lift under given atmospheric and envelope fabric conditions.
     */
    static solveScaleForTargetLift(volumeM3, surfaceAreaM2, targetLiftLbs, params = {}) {
      const altitudeM = params.altitudeM !== undefined ? params.altitudeM : 0;
      const ambientTempC = params.ambientTempC !== undefined ? params.ambientTempC : 25;
      const envelopeTempC = params.envelopeTempC !== undefined ? params.envelopeTempC : 80;
      const fabricWeightGsm = params.fabricWeightGsm || 55;
      const tapeFactor = params.tapeFactor !== undefined ? params.tapeFactor : 0.20;

      const pressurePa = FlightComputer.getPressureAtAltitude(altitudeM);
      const ambientDensity = FlightComputer.getAirDensity(pressurePa, ambientTempC);
      const internalDensity = FlightComputer.getAirDensity(pressurePa, envelopeTempC);
      const diffDensity = ambientDensity - internalDensity;

      const rawFabricMassKg = (surfaceAreaM2 * fabricWeightGsm) / 1000;
      const b = rawFabricMassKg * (1 + tapeFactor) * 2.20462; // Envelope mass in lbs for k=1

      const canisterFuelOz = params.canisterFuelOz !== undefined ? params.canisterFuelOz : 32.0;
      const containerTareOz = params.containerTareOz !== undefined ? params.containerTareOz : 30.0;
      const fuelMassLbs = canisterFuelOz / 16.0;
      const containerTareLbs = containerTareOz / 16.0;
      const fuelRigMassLbs = fuelMassLbs + containerTareLbs;

      // Net Lift requires overcoming envelope mass + fuel & container mass + target payload
      const c = targetLiftLbs + fuelRigMassLbs;

      // If envelope is colder or equal to ambient air, or buoyancy is near zero, flight is physically impossible
      if (diffDensity <= 0.005 || targetLiftLbs <= 0) {
        return {
          k: 1.0,
          requiredVolumeM3: volumeM3,
          requiredSurfaceAreaM2: surfaceAreaM2,
          requiredGrossLiftLbs: 0,
          requiredEnvelopeMassLbs: b,
          fuelRigMassLbs,
          fuelMassLbs,
          containerTareLbs,
          resultingRemainingLiftLbs: 0,
          resultingNetLiftLbs: 0,
          impossible: true
        };
      }

      const unitLiftKgM3 = diffDensity;
      const a = volumeM3 * unitLiftKgM3 * 2.20462; // Gross lift in lbs for k=1

      // Newton-Raphson to solve a*k^3 - b*k^2 - c = 0
      let k = Math.cbrt(c / a) + (b / (3.0 * a));
      for (let iter = 0; iter < 25; iter++) {
        const f = a * k * k * k - b * k * k - c;
        const df = 3.0 * a * k * k - 2.0 * b * k;
        if (Math.abs(df) < 1e-12) break;
        const dk = f / df;
        k -= dk;
        if (Math.abs(dk) < 1e-7) break;
      }
      k = Math.max(0.05, k);

      const reqVol = volumeM3 * (k * k * k);
      const reqArea = surfaceAreaM2 * (k * k);
      const reqGrossLbs = a * (k * k * k);
      const reqEnvLbs = b * (k * k);
      const reqNetLbs = Math.max(0, reqGrossLbs - reqEnvLbs - fuelRigMassLbs);

      return {
        k,
        requiredVolumeM3: reqVol,
        requiredSurfaceAreaM2: reqArea,
        requiredGrossLiftLbs: reqGrossLbs,
        requiredEnvelopeMassLbs: reqEnvLbs,
        fuelRigMassLbs,
        fuelMassLbs,
        containerTareLbs,
        resultingRemainingLiftLbs: reqNetLbs,
        resultingNetLiftLbs: reqNetLbs
      };
    }
  }

  /**
   * Propane Canister & Cylinder Tare Weight Specifications.
   * Defines standard net fuel mass and tare (empty container) weight in ounces.
   */
  const CANISTER_PRESETS = {
    '8.0': { fuelOz: 8.0, tareOz: 3.6, desc: '1x 8.0 oz (227g) Butane Bottle (3.6 oz steel tare)' },
    '16.0': { fuelOz: 16.0, tareOz: 15.0, desc: '1x 16.0 oz (1.0 lb) DOT Camping Bottle (15 oz steel tare)' },
    '32.0': { fuelOz: 32.0, tareOz: 30.0, desc: '2x 16.0 oz (2.0 lbs) DOT Camping Bottles (30 oz steel tare)' },
    '48.0': { fuelOz: 48.0, tareOz: 45.0, desc: '3x 16.0 oz (3.0 lbs) DOT Camping Bottles (45 oz steel tare)' },
    '64.0': { fuelOz: 64.0, tareOz: 60.0, desc: '4x 16.0 oz (4.0 lbs) DOT Camping Bottles (60 oz steel tare)' },
    '80.0': { fuelOz: 80.0, tareOz: 80.0, desc: '5.0 lbs (80 oz / 2.3 kg) Aluminum Model Tank' },
    '160.0': { fuelOz: 160.0, tareOz: 216.0, desc: '10.0 lbs (160 oz / 4.5 kg) Propane Tank' },
    '320.0': { fuelOz: 320.0, tareOz: 272.0, desc: '20.0 lbs (320 oz / 9.1 kg) Standard BBQ Tank' }
  };

  /**
   * Adimensional (Normalized) Balloon Envelope Shape Presets.
   * Profiles defined in dimensionless coordinates (z in [0.0, 1.0], r = radius / height).
   * Physical size is determined by the builder's Target Lift or required height.
   */
  const PRESETS = {
    'ADIM_MODEL_CONICAL': {
      name: 'Model Conical (Optimized 4-Gore Flat Build)',
      description: 'Adimensional 4-gore profile [H=1.0, D=0.79]. Linear lower taper engineered for zero-waste flat fabric cutting and rapid model envelope assembly.',
      aspectRatio: 0.794,
      points: [
        { z: 0.00, r: 0.082 },
        { z: 0.12, r: 0.162 },
        { z: 0.32, r: 0.338 },
        { z: 0.58, r: 0.397 },
        { z: 0.76, r: 0.353 },
        { z: 0.91, r: 0.206 },
        { z: 1.00, r: 0.035 }
      ],
      defaultHeight: 3.4,
      recommendedGores: 4,
      recommendedPanels: 1
    },
    'ADIM_NATURAL': {
      name: 'Natural Shape (Taylor/Smalley Membrane)',
      description: 'Adimensional hydrostatic tension profile [H=1.0, D=0.91]. Zero circumferential membrane stress under aerostatic pressure gradient.',
      aspectRatio: 0.910,
      points: [
        { z: 0.00, r: 0.050 },
        { z: 0.12, r: 0.115 },
        { z: 0.30, r: 0.270 },
        { z: 0.52, r: 0.440 },
        { z: 0.72, r: 0.455 },
        { z: 0.88, r: 0.360 },
        { z: 1.00, r: 0.025 }
      ],
      defaultHeight: 3.4,
      recommendedGores: 8,
      recommendedPanels: 1
    },
    'ADIM_CLASSIC_TEARDROP': {
      name: 'Classic Teardrop (AX Sphere-Cone)',
      description: 'Adimensional classic teardrop [H=1.0, D=0.83]. Spherical upper dome curve with smooth conical lower envelope taper.',
      aspectRatio: 0.830,
      points: [
        { z: 0.00, r: 0.060 },
        { z: 0.15, r: 0.130 },
        { z: 0.35, r: 0.290 },
        { z: 0.58, r: 0.415 },
        { z: 0.78, r: 0.380 },
        { z: 0.92, r: 0.260 },
        { z: 1.00, r: 0.025 }
      ],
      defaultHeight: 3.4,
      recommendedGores: 8,
      recommendedPanels: 1
    },
    'ADIM_RACER': {
      name: 'High-Aspect Racer (Competition Streamline)',
      description: 'Adimensional slender silhouette [H=1.0, D=0.59]. High aspect ratio engineered for steep climb and terminal descent rate control.',
      aspectRatio: 0.590,
      points: [
        { z: 0.00, r: 0.048 },
        { z: 0.18, r: 0.105 },
        { z: 0.40, r: 0.215 },
        { z: 0.62, r: 0.295 },
        { z: 0.80, r: 0.270 },
        { z: 0.94, r: 0.185 },
        { z: 1.00, r: 0.020 }
      ],
      defaultHeight: 3.8,
      recommendedGores: 8,
      recommendedPanels: 1
    },
    'ADIM_BULBOUS_HOPPER': {
      name: 'Bulbous Hopper (High Volume / Low Aspect)',
      description: 'Adimensional wide-body profile [H=1.0, D=0.94]. Maximizes buoyant volume and useful lift per meter of envelope height.',
      aspectRatio: 0.940,
      points: [
        { z: 0.00, r: 0.065 },
        { z: 0.14, r: 0.150 },
        { z: 0.32, r: 0.330 },
        { z: 0.52, r: 0.470 },
        { z: 0.74, r: 0.440 },
        { z: 0.90, r: 0.290 },
        { z: 1.00, r: 0.030 }
      ],
      defaultHeight: 3.2,
      recommendedGores: 6,
      recommendedPanels: 1
    },
    'ADIM_SPHERICAL': {
      name: 'Spherical Aerostat (Minimal Fabric Skin)',
      description: 'Adimensional near-spherical geometry [H=1.0, D=0.98]. Optimal surface-area-to-volume ratio for minimum envelope structural weight.',
      aspectRatio: 0.980,
      points: [
        { z: 0.00, r: 0.070 },
        { z: 0.18, r: 0.210 },
        { z: 0.40, r: 0.410 },
        { z: 0.60, r: 0.490 },
        { z: 0.78, r: 0.450 },
        { z: 0.92, r: 0.300 },
        { z: 1.00, r: 0.030 }
      ],
      defaultHeight: 3.0,
      recommendedGores: 10,
      recommendedPanels: 1
    }
  };

  return {
    MonotoneCubicSpline,
    EnvelopeSolver,
    GoreCutter,
    FlightComputer,
    CANISTER_PRESETS,
    PRESETS
  };
}));
