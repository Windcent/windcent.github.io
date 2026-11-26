/**
 * HHB_Builder - Segment Cutout Planner with Max Size Constraints
 * Manages gore flattening, panel station division, fabric roll constraint checking,
 * nesting yardage analysis, interactive 2D blueprint rendering, and SVG/CSV exports.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./balloon-math'));
  } else {
    root.CutoutPlanner = factory(root.BalloonMath || window.BalloonMath);
  }
}(typeof self !== 'undefined' ? self : this, function (BalloonMath) {
  'use strict';

  class CutoutPlanner {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.options = Object.assign({
        goreCount: 10,
        panelCount: 1,
        maxFabricWidth: 1.50, // 1.5m standard fabric bolt
        maxPanelHeight: 10.00, // 10.0m max cutting table / panel length
        seamAllowance: 0.020, // 20mm (0.8 in) seam allowance
        enableMaxSizeConstraint: true, // toggle to enable/disable max size enforcement
        unit: 'metric',
        viewMode: 'panel',    // 'panel', 'gore', 'nesting'
        selectedPanelIndex: 1,
        onChange: null
      }, options);

      this.solver = null;
      this.cutter = null;
      this.fabricSummary = null;

      // View transforms
      this.zoom = 1.0;
      this.panX = 0;
      this.panY = 0;
      this.isPanning = false;
      this.lastMouseX = 0;
      this.lastMouseY = 0;

      this._initCanvas();
      this._bindEvents();
    }

    _initCanvas() {
      this._handleResize();
      window.addEventListener('resize', () => {
        this._handleResize();
        this.render();
      });
    }

    _handleResize() {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.width = rect.width || 600;
      this.height = rect.height || 600;

      this.canvas.width = this.width * dpr;
      this.canvas.height = this.height * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    update(solver, params = {}) {
      this.solver = solver;
      if (params.goreCount !== undefined) this.options.goreCount = Math.max(4, params.goreCount);
      if (params.panelCount !== undefined) this.options.panelCount = Math.max(1, params.panelCount);
      if (params.maxFabricWidth !== undefined) this.options.maxFabricWidth = Math.max(0.4, params.maxFabricWidth);
      if (params.maxPanelHeight !== undefined) this.options.maxPanelHeight = Math.max(0.2, params.maxPanelHeight);
      if (params.seamAllowance !== undefined) this.options.seamAllowance = Math.max(0.005, params.seamAllowance);
      if (params.enableMaxSizeConstraint !== undefined) this.options.enableMaxSizeConstraint = Boolean(params.enableMaxSizeConstraint);
      if (params.unit !== undefined) this.options.unit = params.unit;

      if (!solver) return;

      const BM = BalloonMath || window.BalloonMath;
      this.cutter = new BM.GoreCutter(solver, {
        goreCount: this.options.goreCount,
        panelCount: this.options.panelCount,
        maxFabricWidth: this.options.maxFabricWidth,
        maxPanelHeight: this.options.maxPanelHeight,
        seamAllowance: this.options.seamAllowance,
        enableMaxSizeConstraint: this.options.enableMaxSizeConstraint
      });

      this.fabricSummary = this.cutter.getFabricSummary();

      // Clamp selected panel
      if (this.options.selectedPanelIndex > this.options.panelCount) {
        this.options.selectedPanelIndex = this.options.panelCount;
      }
      if (this.options.selectedPanelIndex < 1) {
        this.options.selectedPanelIndex = 1;
      }

      this.resetView();
      this.render();

      if (typeof this.options.onChange === 'function') {
        this.options.onChange(this.getPlannerState());
      }
    }

    setViewMode(mode) {
      this.options.viewMode = mode;
      this.resetView();
      this.render();
      if (window.TerminalAudio) window.TerminalAudio.playSwitch();
    }

    selectPanel(index) {
      if (!this.cutter) return;
      const clamped = Math.max(1, Math.min(this.cutter.panels.length, index));
      this.options.selectedPanelIndex = clamped;
      this.render();
      if (typeof this.options.onChange === 'function') {
        this.options.onChange(this.getPlannerState());
      }
    }

    getPlannerState() {
      if (!this.cutter) return null;
      const currentPanel = this.cutter.panels[this.options.selectedPanelIndex - 1];
      return {
        goreCount: this.options.goreCount,
        panelCount: this.options.panelCount,
        maxFabricWidth: this.options.maxFabricWidth,
        maxPanelHeight: this.options.maxPanelHeight,
        seamAllowance: this.options.seamAllowance,
        enableMaxSizeConstraint: this.options.enableMaxSizeConstraint,
        hasViolations: this.cutter.hasConstraintViolations,
        violations: this.cutter.violations,
        currentPanel,
        fabricSummary: this.fabricSummary,
        panels: this.cutter.panels
      };
    }

    resetView() {
      this._handleResize();
      this.zoom = 1.0;
      this.panX = this.width / 2;
      this.panY = this.height / 2;

      if (!this.cutter || !this.solver) return;

      const margin = 50;
      const availW = Math.max(100, this.width - margin * 2);
      const availH = Math.max(100, this.height - margin * 2);

      if (this.options.viewMode === 'panel') {
        const p = this.cutter.panels[this.options.selectedPanelIndex - 1];
        if (p) {
          const w = Math.max(p.cutWidthMax, this.options.maxFabricWidth) * 1.35;
          const h = p.cutHeight * 1.35;
          const scale = Math.min(availW / w, availH / h);
          this.scale = scale;
          this.panX = this.width / 2;
          this.panY = this.height / 2;
        }
      } else if (this.options.viewMode === 'all-panels') {
        const P = this.cutter.panels.length;
        const cols = P <= 3 ? P : (P <= 6 ? 3 : 4);
        const rows = Math.ceil(P / cols);
        const maxPanelW = this.cutter.panels.reduce((m, p) => Math.max(m, p.cutWidthMax), 0);
        const maxPanelH = this.cutter.panels.reduce((m, p) => Math.max(m, p.cutHeight), 0);
        const cellW = maxPanelW * 1.35 + 0.35;
        const cellH = maxPanelH * 1.38 + 0.50;
        const totalGridW = cols * cellW;
        const totalGridH = rows * cellH;
        const scale = Math.min(availW / (totalGridW * 1.08), availH / (totalGridH * 1.08));
        this.scale = scale;
        this.panX = this.width / 2;
        this.panY = this.height / 2;
      } else if (this.options.viewMode === 'gore') {
        const S = this.solver.totalArcLength;
        const maxW = this.cutter.maxGoreWidth * 1.8;
        const scale = Math.min(availW / maxW, availH / (S * 1.15));
        this.scale = scale;
        this.panX = this.width / 2;
        this.panY = this.height - margin;
      } else if (this.options.viewMode === 'all-gores') {
        const S = this.solver.totalArcLength;
        const N = this.options.goreCount;
        const goreW = this.cutter.maxGoreWidth;
        const goreGap = goreW * 0.18 + 0.15;
        const totalW = N * goreW + (N - 1) * goreGap;
        const scale = Math.min(availW / (totalW * 1.08), availH / (S * 1.18));
        this.scale = scale;
        this.panX = this.width / 2;
        this.panY = this.height - margin;
      } else if (this.options.viewMode === 'nesting') {
        this.scale = availW / (this.options.maxFabricWidth * 1.8);
        this.panX = this.width / 2;
        this.panY = 80;
      }
    }

    _bindEvents() {
      const canvas = this.canvas;

      canvas.addEventListener('mousedown', (e) => {
        this.isPanning = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        canvas.style.cursor = 'grab';
      });

      window.addEventListener('mousemove', (e) => {
        if (!this.isPanning) return;
        const dx = e.clientX - this.lastMouseX;
        const dy = e.clientY - this.lastMouseY;
        this.panX += dx;
        this.panY += dy;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.render();
      });

      window.addEventListener('mouseup', () => {
        this.isPanning = false;
        canvas.style.cursor = 'default';
      });

      canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.12 : 0.89;
        this.zoom = Math.max(0.2, Math.min(8.0, this.zoom * factor));
        this.render();
      }, { passive: false });

      // Click to select panel across view modes (gore, all-panels, all-gores)
      canvas.addEventListener('click', (e) => {
        if (!this.cutter) return;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const s = this.scale * this.zoom;

        if (this.options.viewMode === 'gore') {
          const arcPos = (this.panY - my) / s;
          const P = this.cutter.panels;
          for (let i = 0; i < P.length; i++) {
            if (arcPos >= P[i].sBottom && arcPos <= P[i].sTop) {
              this.selectPanel(i + 1);
              if (window.TerminalAudio) window.TerminalAudio.playClick();
              break;
            }
          }
        } else if (this.options.viewMode === 'all-panels') {
          const panels = this.cutter.panels;
          const P = panels.length;
          const cols = P <= 3 ? P : (P <= 6 ? 3 : 4);
          const rows = Math.ceil(P / cols);
          const maxPanelW = panels.reduce((m, p) => Math.max(m, p.cutWidthMax), 0);
          const maxPanelH = panels.reduce((m, p) => Math.max(m, p.cutHeight), 0);
          const cellW = maxPanelW * 1.35 + 0.35;
          const cellH = maxPanelH * 1.38 + 0.50;
          const totalGridW = cols * cellW;
          const totalGridH = rows * cellH;
          const startX = this.panX - (totalGridW / 2) * s + (cellW / 2) * s;
          const startY = this.panY - (totalGridH / 2) * s + (cellH / 2) * s;

          for (let i = 0; i < P; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const pcx = startX + col * cellW * s;
            const pcy = startY + row * cellH * s;
            const cardHalfW = (cellW / 2) * s * 0.96;
            const cardHalfH = (cellH / 2) * s * 0.96;

            if (mx >= pcx - cardHalfW && mx <= pcx + cardHalfW &&
                my >= pcy - cardHalfH && my <= pcy + cardHalfH) {
              this.selectPanel(i + 1);
              if (window.TerminalAudio) window.TerminalAudio.playClick();
              break;
            }
          }
        } else if (this.options.viewMode === 'all-gores') {
          const N = this.options.goreCount;
          const S = this.solver.totalArcLength;
          const goreW = this.cutter.maxGoreWidth;
          const goreGap = goreW * 0.18 + 0.15;
          const totalW = N * goreW + (N - 1) * goreGap;
          const startX = this.panX - (totalW / 2) * s + (goreW / 2) * s;
          const baseY = this.panY;

          for (let g = 0; g < N; g++) {
            const gcx = startX + g * (goreW + goreGap) * s;
            const halfW = (goreW / 2) * s + 8;
            if (mx >= gcx - halfW && mx <= gcx + halfW && my >= baseY - S * s - 25 && my <= baseY + 25) {
              const statusEl = document.getElementById('statusActiveGore');
              if (statusEl) statusEl.textContent = `GORE #${String(g + 1).padStart(2, '0')}/${N}`;

              const arcPos = (baseY - my) / s;
              const P = this.cutter.panels;
              for (let i = 0; i < P.length; i++) {
                if (arcPos >= P[i].sBottom && arcPos <= P[i].sTop) {
                  this.selectPanel(i + 1);
                  break;
                }
              }
              if (window.TerminalAudio) window.TerminalAudio.playClick();
              break;
            }
          }
        }
      });
    }

    render() {
      const ctx = this.ctx;
      const w = this.width;
      const h = this.height;

      // Dark cathode phosphor background
      ctx.fillStyle = '#0a0800';
      ctx.fillRect(0, 0, w, h);

      if (!this.cutter) {
        ctx.fillStyle = '#ffaa00';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('NO PROFILE LOADED', w / 2, h / 2);
        return;
      }

      if (this.options.viewMode === 'panel') {
        this._renderPanelBlueprint(ctx, w, h);
      } else if (this.options.viewMode === 'all-panels') {
        this._renderAllPanels(ctx, w, h);
      } else if (this.options.viewMode === 'gore') {
        this._renderFullGore(ctx, w, h);
      } else if (this.options.viewMode === 'all-gores') {
        this._renderAllGores(ctx, w, h);
      } else if (this.options.viewMode === 'nesting') {
        this._renderNestingBolt(ctx, w, h);
      }

      // Render Constraint Alarm Banner only if constraints are enabled and violations exist
      if (this.options.enableMaxSizeConstraint && this.cutter.hasConstraintViolations) {
        this._renderConstraintAlarm(ctx, w, h);
      }
    }

    _renderPanelBlueprint(ctx, w, h) {
      const pIdx = this.options.selectedPanelIndex - 1;
      const panel = this.cutter.panels[pIdx];
      if (!panel) return;

      const s = this.scale * this.zoom;
      const seam = this.options.seamAllowance;
      const cx = this.panX;
      const cy = this.panY;
      const constraintActive = this.options.enableMaxSizeConstraint;

      ctx.save();

      // 1. Draw Fabric Bolt Guidelines (Max Width Constraint)
      const boltHalfW = (this.options.maxFabricWidth / 2) * s;
      const boltX1 = cx - boltHalfW;
      const boltX2 = cx + boltHalfW;

      const isExceeded = constraintActive && panel.exceedsWidth;
      ctx.strokeStyle = isExceeded
        ? 'rgba(255, 60, 0, 0.7)'
        : (constraintActive ? 'rgba(255, 176, 0, 0.28)' : 'rgba(255, 176, 0, 0.12)');
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 6]);

      ctx.beginPath();
      ctx.moveTo(boltX1, 0);
      ctx.lineTo(boltX1, h);
      ctx.moveTo(boltX2, 0);
      ctx.lineTo(boltX2, h);
      ctx.stroke();
      ctx.setLineDash([]);

      // Bolt limit label
      ctx.fillStyle = isExceeded
        ? '#ff4444'
        : (constraintActive ? 'rgba(255, 176, 0, 0.45)' : 'rgba(255, 176, 0, 0.22)');
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      const statusSuffix = constraintActive ? '' : ' [CONSTRAINT OFF]';
      const boltStr = this.options.unit === 'imperial'
        ? `FABRIC BOLT LIMIT: ${(this.options.maxFabricWidth * 39.37).toFixed(1)}" (${(this.options.maxFabricWidth).toFixed(2)}m)${statusSuffix}`
        : `FABRIC BOLT LIMIT: ${(this.options.maxFabricWidth).toFixed(2)}m${statusSuffix}`;
      ctx.fillText(boltStr, cx, 28);

      // 2. Draw Centerline
      ctx.strokeStyle = 'rgba(255, 176, 0, 0.4)';
      ctx.setLineDash([6, 4, 2, 4]);
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, h);
      ctx.stroke();
      ctx.setLineDash([]);

      // 3. Render Flat Panel Contour
      const contour = panel.contour;
      const nSteps = contour.length;
      const halfH = panel.heightArc / 2;

      // Coordinate mapping: sRel goes from 0 to heightArc
      // Screen Y: cy + (halfH - sRel) * s
      const mapY = (sRel) => cy + (halfH - sRel) * s;

      // Outer Cut Line (includes seam allowance)
      ctx.beginPath();
      const cutTopY = mapY(panel.heightArc) - seam * s;
      const cutBotY = mapY(0) + seam * s;

      // Draw Max Panel Length Constraint Line
      const isHeightExceeded = constraintActive && panel.exceedsHeight;
      const maxLenLimitY = cutBotY - (this.options.maxPanelHeight * s);

      ctx.save();
      ctx.strokeStyle = isHeightExceeded
        ? 'rgba(255, 60, 0, 0.75)'
        : (constraintActive ? 'rgba(255, 176, 0, 0.28)' : 'rgba(255, 176, 0, 0.12)');
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 6]);

      ctx.beginPath();
      ctx.moveTo(boltX1 - 30, maxLenLimitY);
      ctx.lineTo(boltX2 + 30, maxLenLimitY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = isHeightExceeded
        ? '#ff4444'
        : (constraintActive ? 'rgba(255, 176, 0, 0.45)' : 'rgba(255, 176, 0, 0.22)');
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      const maxH = this.options.maxPanelHeight;
      const feet = maxH * 3.28084;
      const inches = maxH * 39.3701;
      const lenStr = this.options.unit === 'imperial'
        ? `MAX LENGTH: ${maxH >= 2.0 ? `${feet.toFixed(1)} ft` : `${inches.toFixed(1)}"`} (${maxH.toFixed(2)}m)`
        : `MAX LENGTH: ${maxH.toFixed(2)}m (${maxH >= 2.0 ? `${feet.toFixed(1)} ft` : `${Math.round(inches)}"`})`;
      ctx.fillText(lenStr, boltX2 + 25, maxLenLimitY - 4);
      ctx.restore();

      // Bottom cut edge
      ctx.moveTo(cx - (panel.cutWidthBottom / 2) * s, cutBotY);
      ctx.lineTo(cx + (panel.cutWidthBottom / 2) * s, cutBotY);

      // Right cut edge
      for (let i = 0; i < nSteps; i++) {
        const pt = contour[i];
        const y = mapY(pt.sRel);
        const x = cx + (pt.halfWidth + seam) * s;
        ctx.lineTo(x, y);
      }

      // Top cut edge
      ctx.lineTo(cx - (panel.cutWidthTop / 2) * s, cutTopY);

      // Left cut edge
      for (let i = nSteps - 1; i >= 0; i--) {
        const pt = contour[i];
        const y = mapY(pt.sRel);
        const x = cx - (pt.halfWidth + seam) * s;
        ctx.lineTo(x, y);
      }
      ctx.closePath();

      const isPanelViolated = constraintActive && (panel.exceedsWidth || panel.exceedsHeight);

      // Fill with phosphor tint
      ctx.fillStyle = isPanelViolated ? 'rgba(255, 50, 0, 0.08)' : 'rgba(255, 176, 0, 0.06)';
      ctx.fill();

      // Outer Cut Stroke
      ctx.shadowColor = isPanelViolated ? '#ff3300' : 'rgba(255, 176, 0, 0.8)';
      ctx.shadowBlur = 8;
      ctx.strokeStyle = isPanelViolated ? '#ff4444' : '#ffb000';
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Inner Stitch Seam Line (dashed)
      ctx.beginPath();
      const seamTopY = mapY(panel.heightArc);
      const seamBotY = mapY(0);

      ctx.moveTo(cx - (panel.wBottom / 2) * s, seamBotY);
      ctx.lineTo(cx + (panel.wBottom / 2) * s, seamBotY);

      for (let i = 0; i < nSteps; i++) {
        const pt = contour[i];
        const y = mapY(pt.sRel);
        const x = cx + pt.halfWidth * s;
        ctx.lineTo(x, y);
      }

      ctx.lineTo(cx - (panel.wTop / 2) * s, seamTopY);

      for (let i = nSteps - 1; i >= 0; i--) {
        const pt = contour[i];
        const y = mapY(pt.sRel);
        const x = cx - pt.halfWidth * s;
        ctx.lineTo(x, y);
      }
      ctx.closePath();

      ctx.strokeStyle = '#ff8800';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // 4. Registration Notches (25%, 50%, 75% height ticks on sides)
      const notchFractions = [0.25, 0.50, 0.75];
      ctx.strokeStyle = '#ffd040';
      ctx.lineWidth = 2;

      for (const frac of notchFractions) {
        const sRel = frac * panel.heightArc;
        const y = mapY(sRel);
        const r = this.solver.getRadiusAtArc(panel.sBottom + sRel);
        const halfCut = ((2 * Math.PI * r) / this.options.goreCount) / 2 + seam;

        // Right notch tick
        const rx = cx + halfCut * s;
        ctx.beginPath();
        ctx.moveTo(rx, y);
        ctx.lineTo(rx - 8, y);
        ctx.stroke();

        // Left notch tick
        const lx = cx - halfCut * s;
        ctx.beginPath();
        ctx.moveTo(lx, y);
        ctx.lineTo(lx + 8, y);
        ctx.stroke();
      }

      // 5. Dimension Callouts
      this._renderPanelDimensions(ctx, panel, cx, cy, mapY, s, seam, cutTopY, cutBotY);

      ctx.restore();
    }

    _renderPanelDimensions(ctx, panel, cx, cy, mapY, s, seam, cutTopY, cutBotY) {
      ctx.fillStyle = '#ffaa00';
      ctx.strokeStyle = 'rgba(255, 176, 0, 0.45)';
      ctx.font = '10px monospace';
      ctx.lineWidth = 1;

      // Top Width Dimension
      const topHalfW = (panel.cutWidthTop / 2) * s;
      const dimTopY = cutTopY - 14;
      ctx.beginPath();
      ctx.moveTo(cx - topHalfW, dimTopY);
      ctx.lineTo(cx + topHalfW, dimTopY);
      ctx.moveTo(cx - topHalfW, dimTopY - 4);
      ctx.lineTo(cx - topHalfW, dimTopY + 4);
      ctx.moveTo(cx + topHalfW, dimTopY - 4);
      ctx.lineTo(cx + topHalfW, dimTopY + 4);
      ctx.stroke();

      ctx.textAlign = 'center';
      const topWStr = this.options.unit === 'imperial'
        ? `TOP CUT: ${(panel.cutWidthTop * 39.37).toFixed(1)}" (${(panel.cutWidthTop).toFixed(3)}m)`
        : `TOP CUT: ${(panel.cutWidthTop).toFixed(3)}m (SEAM: ${(panel.wTop).toFixed(3)}m)`;
      ctx.fillText(topWStr, cx, dimTopY - 5);

      // Bottom Width Dimension
      const botHalfW = (panel.cutWidthBottom / 2) * s;
      const dimBotY = cutBotY + 18;
      ctx.beginPath();
      ctx.moveTo(cx - botHalfW, dimBotY);
      ctx.lineTo(cx + botHalfW, dimBotY);
      ctx.moveTo(cx - botHalfW, dimBotY - 4);
      ctx.lineTo(cx - botHalfW, dimBotY + 4);
      ctx.moveTo(cx + botHalfW, dimBotY - 4);
      ctx.lineTo(cx + botHalfW, dimBotY + 4);
      ctx.stroke();

      const botWStr = this.options.unit === 'imperial'
        ? `BOT CUT: ${(panel.cutWidthBottom * 39.37).toFixed(1)}" (${(panel.cutWidthBottom).toFixed(3)}m)`
        : `BOT CUT: ${(panel.cutWidthBottom).toFixed(3)}m (SEAM: ${(panel.wBottom).toFixed(3)}m)`;
      ctx.fillText(botWStr, cx, dimBotY + 14);

      // Height Dimension (Right side)
      const maxCutHalfW = (panel.cutWidthMax / 2) * s;
      const dimXRight = cx + maxCutHalfW + 28;

      ctx.beginPath();
      ctx.moveTo(dimXRight, cutTopY);
      ctx.lineTo(dimXRight, cutBotY);
      ctx.moveTo(dimXRight - 4, cutTopY);
      ctx.lineTo(dimXRight + 4, cutTopY);
      ctx.moveTo(dimXRight - 4, cutBotY);
      ctx.lineTo(dimXRight + 4, cutBotY);
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const isHeightExceeded = this.options.enableMaxSizeConstraint && panel.exceedsHeight;
      const hStr = this.options.unit === 'imperial'
        ? `CUT HT: ${(panel.cutHeight * 39.37).toFixed(1)}"${isHeightExceeded ? ' [OVER LIMIT]' : ''}`
        : `CUT HT: ${(panel.cutHeight).toFixed(3)}m${isHeightExceeded ? ' [OVER LIMIT]' : ''}`;
      ctx.fillStyle = isHeightExceeded ? '#ff4444' : '#ffaa00';
      ctx.fillText(hStr, dimXRight + 8, (cutTopY + cutBotY) / 2);
      ctx.fillStyle = '#ffaa00';

      // Max Width Line (if wider than top & bot)
      if (panel.cutWidthMax > Math.max(panel.cutWidthTop, panel.cutWidthBottom) + 0.02) {
        const sMaxRel = panel.maxWidthS - panel.sBottom;
        const maxCutY = mapY(sMaxRel);
        ctx.strokeStyle = panel.exceedsWidth ? '#ff4444' : 'rgba(255, 200, 50, 0.5)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(cx - maxCutHalfW, maxCutY);
        ctx.lineTo(cx + maxCutHalfW, maxCutY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = panel.exceedsWidth ? '#ff5555' : '#ffd040';
        ctx.textAlign = 'center';
        const maxWStr = `MAX-W: ${(panel.cutWidthMax).toFixed(3)}m`;
        ctx.fillText(maxWStr, cx, maxCutY - 5);
      }

      // Corner Squareness Diagonal Check
      ctx.strokeStyle = 'rgba(255, 176, 0, 0.2)';
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(cx - botHalfW, cutBotY);
      ctx.lineTo(cx + topHalfW, cutTopY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(255, 176, 0, 0.45)';
      ctx.textAlign = 'center';
      ctx.fillText(`DIAG: ${(panel.diagonal).toFixed(3)}m`, cx, (cutTopY + cutBotY) / 2 + 15);
    }

    _renderAllPanels(ctx, w, h) {
      if (!this.cutter || !this.cutter.panels.length) return;

      const panels = this.cutter.panels;
      const P = panels.length;
      const s = this.scale * this.zoom;
      const seam = this.options.seamAllowance;
      const constraintActive = this.options.enableMaxSizeConstraint;

      // Determine grid dimensions
      const cols = P <= 3 ? P : (P <= 6 ? 3 : 4);
      const rows = Math.ceil(P / cols);

      const maxPanelW = panels.reduce((m, p) => Math.max(m, p.cutWidthMax), 0);
      const maxPanelH = panels.reduce((m, p) => Math.max(m, p.cutHeight), 0);

      const cellW = maxPanelW * 1.35 + 0.35;
      const cellH = maxPanelH * 1.38 + 0.50;

      const totalGridW = cols * cellW;
      const totalGridH = rows * cellH;

      const startX = this.panX - (totalGridW / 2) * s + (cellW / 2) * s;
      const startY = this.panY - (totalGridH / 2) * s + (cellH / 2) * s;

      ctx.save();

      // Master Header Label
      ctx.fillStyle = '#ffb000';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        `ALL CUTTING PANELS // ${P} UNIQUE TEMPLATES // GORE DIVISION: ${P} STATIONS // SEAM: ${(seam * 1000).toFixed(0)}mm`,
        this.panX,
        Math.max(24, startY - (cellH / 2) * s - 18)
      );

      for (let i = 0; i < P; i++) {
        const panel = panels[i];
        const col = i % cols;
        const row = Math.floor(i / cols);

        const pcx = startX + col * cellW * s;
        const pcy = startY + row * cellH * s;
        const isSelected = (panel.index === this.options.selectedPanelIndex);
        const isExceeded = constraintActive && (panel.exceedsWidth || panel.exceedsHeight);

        // Card frame around panel
        const cardHalfW = (cellW / 2) * s * 0.96;
        const cardHalfH = (cellH / 2) * s * 0.96;
        ctx.fillStyle = isSelected
          ? 'rgba(255, 176, 0, 0.10)'
          : (isExceeded ? 'rgba(255, 60, 0, 0.08)' : 'rgba(20, 15, 0, 0.6)');
        ctx.strokeStyle = isSelected
          ? '#ffd040'
          : (isExceeded ? 'rgba(255, 60, 0, 0.75)' : 'rgba(255, 176, 0, 0.28)');
        ctx.lineWidth = isSelected ? 2.0 : 1.0;
        ctx.fillRect(pcx - cardHalfW, pcy - cardHalfH, cardHalfW * 2, cardHalfH * 2);
        ctx.strokeRect(pcx - cardHalfW, pcy - cardHalfH, cardHalfW * 2, cardHalfH * 2);

        // Panel Tag
        ctx.fillStyle = isSelected ? '#ffffff' : (isExceeded ? '#ff5555' : '#ffb000');
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        const tagText = isExceeded
          ? `PANEL #${String(panel.index).padStart(2, '0')} ⚠ OVERFLOW`
          : `PANEL #${String(panel.index).padStart(2, '0')} // ${panel.name}`;
        ctx.fillText(tagText, pcx, pcy - cardHalfH + 16);

        // Subtitle spec
        ctx.font = '9px monospace';
        ctx.fillStyle = isSelected ? '#ffd040' : 'rgba(255, 176, 0, 0.6)';
        const specText = `HT: ${(panel.cutHeight).toFixed(2)}m | MAX-W: ${(panel.cutWidthMax).toFixed(2)}m | ${(panel.fabricArea).toFixed(2)}m²`;
        ctx.fillText(specText, pcx, pcy - cardHalfH + 28);

        // Fabric Bolt Guideline (if constraint enabled)
        if (constraintActive) {
          const boltHalfW = (this.options.maxFabricWidth / 2) * s;
          ctx.strokeStyle = isExceeded ? 'rgba(255, 60, 0, 0.45)' : 'rgba(255, 176, 0, 0.2)';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(pcx - boltHalfW, pcy - cardHalfH + 34);
          ctx.lineTo(pcx - boltHalfW, pcy + cardHalfH - 8);
          ctx.moveTo(pcx + boltHalfW, pcy - cardHalfH + 34);
          ctx.lineTo(pcx + boltHalfW, pcy + cardHalfH - 8);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Draw flat panel contour
        const contour = panel.contour;
        const nSteps = contour.length;
        const halfH = panel.heightArc / 2;
        const mapY = (sRel) => pcy + 10 + (halfH - sRel) * s;

        const cutTopY = mapY(panel.heightArc) - seam * s;
        const cutBotY = mapY(0) + seam * s;

        // Cut Path
        ctx.beginPath();
        ctx.moveTo(pcx - (panel.cutWidthBottom / 2) * s, cutBotY);
        ctx.lineTo(pcx + (panel.cutWidthBottom / 2) * s, cutBotY);

        for (let j = 0; j < nSteps; j++) {
          const pt = contour[j];
          ctx.lineTo(pcx + (pt.halfWidth + seam) * s, mapY(pt.sRel));
        }

        ctx.lineTo(pcx - (panel.cutWidthTop / 2) * s, cutTopY);

        for (let j = nSteps - 1; j >= 0; j--) {
          const pt = contour[j];
          ctx.lineTo(pcx - (pt.halfWidth + seam) * s, mapY(pt.sRel));
        }
        ctx.closePath();

        ctx.fillStyle = isSelected
          ? 'rgba(255, 176, 0, 0.15)'
          : (isExceeded ? 'rgba(255, 50, 0, 0.12)' : 'rgba(255, 176, 0, 0.05)');
        ctx.fill();

        ctx.strokeStyle = isSelected
          ? '#ffd040'
          : (isExceeded ? '#ff4444' : '#ffaa00');
        ctx.lineWidth = isSelected ? 2.0 : 1.3;
        ctx.stroke();

        // Stitch Seam Path (dashed)
        ctx.beginPath();
        const seamTopY = mapY(panel.heightArc);
        const seamBotY = mapY(0);
        ctx.moveTo(pcx - (panel.wBottom / 2) * s, seamBotY);
        ctx.lineTo(pcx + (panel.wBottom / 2) * s, seamBotY);
        for (let j = 0; j < nSteps; j++) {
          const pt = contour[j];
          ctx.lineTo(pcx + pt.halfWidth * s, mapY(pt.sRel));
        }
        ctx.lineTo(pcx - (panel.wTop / 2) * s, seamTopY);
        for (let j = nSteps - 1; j >= 0; j--) {
          const pt = contour[j];
          ctx.lineTo(pcx - pt.halfWidth * s, mapY(pt.sRel));
        }
        ctx.closePath();
        ctx.strokeStyle = 'rgba(255, 150, 0, 0.55)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 2]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Bottom label
        ctx.fillStyle = 'rgba(255, 176, 0, 0.5)';
        ctx.font = '8.5px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`TOP: ${(panel.cutWidthTop).toFixed(2)}m | BOT: ${(panel.cutWidthBottom).toFixed(2)}m`, pcx, pcy + cardHalfH - 8);
      }

      ctx.restore();
    }

    _renderFullGore(ctx, w, h) {
      if (!this.cutter) return;

      const s = this.scale * this.zoom;
      const cx = this.panX;
      const cy = this.panY;
      const S = this.solver.totalArcLength;
      const N = this.options.goreCount;

      ctx.save();

      // Centerline
      ctx.strokeStyle = 'rgba(255, 176, 0, 0.3)';
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, cy - S * s);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw continuous gore envelope
      const steps = 140;
      const ds = S / steps;

      ctx.beginPath();
      ctx.moveTo(cx, cy); // throat base

      // Right contour going up
      for (let i = 0; i <= steps; i++) {
        const arc = i * ds;
        const r = this.solver.getRadiusAtArc(arc);
        const halfW = ((2 * Math.PI * r) / N) / 2;
        ctx.lineTo(cx + halfW * s, cy - arc * s);
      }

      // Crown top
      ctx.lineTo(cx, cy - S * s);

      // Left contour going down
      for (let i = steps; i >= 0; i--) {
        const arc = i * ds;
        const r = this.solver.getRadiusAtArc(arc);
        const halfW = ((2 * Math.PI * r) / N) / 2;
        ctx.lineTo(cx - halfW * s, cy - arc * s);
      }

      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 176, 0, 0.05)';
      ctx.fill();
      ctx.strokeStyle = '#ffaa00';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // Draw Horizontal Panel Seam Stations
      const panels = this.cutter.panels;
      for (let i = 0; i < panels.length; i++) {
        const p = panels[i];
        const isSelected = (p.index === this.options.selectedPanelIndex);
        const yBot = cy - p.sBottom * s;
        const yTop = cy - p.sTop * s;

        // Seam station line
        const rTop = this.solver.getRadiusAtArc(p.sTop);
        const halfWTop = ((2 * Math.PI * rTop) / N) / 2;
        const isViolated = this.options.enableMaxSizeConstraint && (p.exceedsWidth || p.exceedsHeight);

        ctx.strokeStyle = isSelected ? '#ffffff' : (isViolated ? '#ff4444' : 'rgba(255, 176, 0, 0.5)');
        ctx.lineWidth = isSelected ? 2.5 : 1.2;

        ctx.beginPath();
        ctx.moveTo(cx - halfWTop * s, yTop);
        ctx.lineTo(cx + halfWTop * s, yTop);
        ctx.stroke();

        // Panel highlighted box if selected
        if (isSelected) {
          ctx.fillStyle = 'rgba(255, 210, 60, 0.15)';
          ctx.fillRect(cx - 70, yTop, 140, yBot - yTop);
        }

        // Panel label
        ctx.fillStyle = isSelected ? '#ffffff' : (isViolated ? '#ff5555' : 'rgba(255, 176, 0, 0.7)');
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = isViolated ? `P${p.index} [OVERFLOW]` : `PANEL #${p.index}`;
        ctx.fillText(label, cx, (yBot + yTop) / 2);
      }

      ctx.restore();
    }

    _renderAllGores(ctx, w, h) {
      if (!this.cutter || !this.solver) return;

      const N = this.options.goreCount;
      const S = this.solver.totalArcLength;
      const s = this.scale * this.zoom;
      const goreW = this.cutter.maxGoreWidth;
      const goreGap = goreW * 0.18 + 0.15;
      const totalW = N * goreW + (N - 1) * goreGap;

      const startX = this.panX - (totalW / 2) * s + (goreW / 2) * s;
      const baseY = this.panY; // throat line at bottom

      const panels = this.cutter.panels;
      const selectedPanelIdx = this.options.selectedPanelIndex;
      const constraintActive = this.options.enableMaxSizeConstraint;

      ctx.save();

      // Top Blueprint Title Banner
      ctx.fillStyle = '#ffb000';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      const areaM2 = this.fabricSummary ? Math.round(this.fabricSummary.totalEnvelopeFabricArea) : 0;
      ctx.fillText(
        `ALL GORES // COMPLETE UNROLLED ENVELOPE MERIDIAN BLUEPRINT // ${N} GORES // TOTAL AREA: ${areaM2} m²`,
        this.panX,
        Math.max(22, baseY - S * s - 28)
      );

      // Continuous Horizontal Seam Lines across ALL gores
      for (let p = 0; p < panels.length; p++) {
        const pan = panels[p];
        const isSelected = (pan.index === selectedPanelIdx);
        const yTop = baseY - pan.sTop * s;

        const panViolated = constraintActive && (pan.exceedsWidth || pan.exceedsHeight);
        ctx.strokeStyle = isSelected
          ? 'rgba(255, 220, 80, 0.85)'
          : (panViolated ? 'rgba(255, 60, 0, 0.55)' : 'rgba(255, 176, 0, 0.25)');
        ctx.lineWidth = isSelected ? 1.8 : 0.8;
        ctx.setLineDash(isSelected ? [4, 2] : [2, 4]);

        const lineLeft = startX - (goreW / 2) * s - 15;
        const lineRight = startX + (N - 1) * (goreW + goreGap) * s + (goreW / 2) * s + 15;

        ctx.beginPath();
        ctx.moveTo(lineLeft, yTop);
        ctx.lineTo(lineRight, yTop);
        ctx.stroke();
        ctx.setLineDash([]);

        // Seam station index label on left margin
        ctx.fillStyle = isSelected ? '#ffffff' : 'rgba(255, 176, 0, 0.6)';
        ctx.font = '9px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`SEAM #${pan.index}`, lineLeft - 4, yTop + 3);
      }

      // Draw each Gore
      const steps = 100;
      const ds = S / steps;

      for (let g = 0; g < N; g++) {
        const gcx = startX + g * (goreW + goreGap) * s;

        // Centerline
        ctx.strokeStyle = 'rgba(255, 176, 0, 0.25)';
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(gcx, baseY);
        ctx.lineTo(gcx, baseY - S * s);
        ctx.stroke();
        ctx.setLineDash([]);

        // Gore Contour
        ctx.beginPath();
        ctx.moveTo(gcx, baseY);

        // Right side going up
        for (let i = 0; i <= steps; i++) {
          const arc = i * ds;
          const r = this.solver.getRadiusAtArc(arc);
          const halfW = ((2 * Math.PI * r) / N) / 2;
          ctx.lineTo(gcx + halfW * s, baseY - arc * s);
        }

        // Crown top
        ctx.lineTo(gcx, baseY - S * s);

        // Left side going down
        for (let i = steps; i >= 0; i--) {
          const arc = i * ds;
          const r = this.solver.getRadiusAtArc(arc);
          const halfW = ((2 * Math.PI * r) / N) / 2;
          ctx.lineTo(gcx - halfW * s, baseY - arc * s);
        }
        ctx.closePath();

        // Subtle phosphor fill
        ctx.fillStyle = 'rgba(255, 176, 0, 0.04)';
        ctx.fill();

        ctx.strokeStyle = '#ffaa00';
        ctx.lineWidth = 1.3;
        ctx.stroke();

        // Horizontal panel station subdivisions inside this gore
        for (let p = 0; p < panels.length; p++) {
          const pan = panels[p];
          const isSelected = (pan.index === selectedPanelIdx);
          const yBot = baseY - pan.sBottom * s;
          const yTop = baseY - pan.sTop * s;

          const rTop = this.solver.getRadiusAtArc(pan.sTop);
          const halfWTop = ((2 * Math.PI * rTop) / N) / 2;

          const panViolated = constraintActive && (pan.exceedsWidth || pan.exceedsHeight);

          // Seam line
          ctx.strokeStyle = isSelected ? '#ffffff' : (panViolated ? '#ff4444' : 'rgba(255, 176, 0, 0.45)');
          ctx.lineWidth = isSelected ? 2.0 : 1.0;
          ctx.beginPath();
          ctx.moveTo(gcx - halfWTop * s, yTop);
          ctx.lineTo(gcx + halfWTop * s, yTop);
          ctx.stroke();

          // Panel highlight fill if selected
          if (isSelected) {
            ctx.fillStyle = 'rgba(255, 210, 60, 0.18)';
            const rBot = this.solver.getRadiusAtArc(pan.sBottom);
            const halfWBot = ((2 * Math.PI * rBot) / N) / 2;
            ctx.beginPath();
            ctx.moveTo(gcx - halfWBot * s, yBot);
            ctx.lineTo(gcx + halfWBot * s, yBot);
            ctx.lineTo(gcx + halfWTop * s, yTop);
            ctx.lineTo(gcx - halfWTop * s, yTop);
            ctx.closePath();
            ctx.fill();
          }

          // Small panel label
          ctx.fillStyle = isSelected ? '#ffffff' : (panViolated ? '#ff5555' : 'rgba(255, 176, 0, 0.6)');
          ctx.font = '8px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`P${pan.index}`, gcx, (yBot + yTop) / 2);
        }

        // Header for this gore
        ctx.fillStyle = '#ffd040';
        ctx.font = 'bold 9.5px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`GORE #${String(g + 1).padStart(2, '0')}`, gcx, baseY - S * s - 10);

        // Footer for this gore
        ctx.fillStyle = 'rgba(255, 176, 0, 0.6)';
        ctx.font = '8.5px monospace';
        ctx.fillText(`G#${g + 1}`, gcx, baseY + 14);
      }

      ctx.restore();
    }

    _renderNestingBolt(ctx, w, h) {
      if (!this.cutter) return;

      const s = this.scale * this.zoom;
      const cx = this.panX;
      const cy = this.panY;
      const boltW = this.options.maxFabricWidth;
      const boltHalfW = (boltW / 2) * s;

      ctx.save();

      // Fabric Roll Boundary
      ctx.strokeStyle = '#ffb000';
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - boltHalfW, cy, boltW * s, h - cy - 20);

      // Roll Header
      ctx.fillStyle = '#ffaa00';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`FABRIC BOLT LAYOUT // WIDTH: ${(boltW).toFixed(2)}m (${(boltW * 39.37).toFixed(1)}")`, cx, cy - 18);

      // Nesting preview of panels laid along the bolt length
      let curY = cy + 15;
      const panels = this.cutter.panels;

      for (let i = 0; i < panels.length; i++) {
        const p = panels[i];
        const pH = p.cutHeight * s * 0.45; // scaled down preview
        const pTopW = p.cutWidthTop * s * 0.45;
        const pBotW = p.cutWidthBottom * s * 0.45;

        if (curY + pH > h - 40) break; // viewport limit

        const isViolated = this.options.enableMaxSizeConstraint && (p.exceedsWidth || p.exceedsHeight);

        ctx.strokeStyle = isViolated ? '#ff4444' : 'rgba(255, 176, 0, 0.8)';
        ctx.fillStyle = isViolated ? 'rgba(255, 60, 0, 0.12)' : 'rgba(255, 176, 0, 0.08)';
        ctx.lineWidth = 1.2;

        ctx.beginPath();
        ctx.moveTo(cx - pBotW / 2, curY + pH);
        ctx.lineTo(cx + pBotW / 2, curY + pH);
        ctx.lineTo(cx + pTopW / 2, curY);
        ctx.lineTo(cx - pTopW / 2, curY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isViolated ? '#ff6666' : '#ffd040';
        ctx.font = '9px monospace';
        const label = isViolated ? `${p.name} [OVERFLOW]` : `${p.name} (x${this.options.goreCount})`;
        ctx.fillText(label, cx, curY + pH / 2);

        curY += pH + 10;
      }

      ctx.restore();
    }

    _renderConstraintAlarm(ctx, w, h) {
      const v = this.cutter.violations;
      if (!v || !v.length) return;

      ctx.save();
      const bannerH = 34;
      const bannerY = h - bannerH - 8;

      ctx.fillStyle = 'rgba(160, 20, 0, 0.88)';
      ctx.fillRect(10, bannerY, w - 20, bannerH);
      ctx.strokeStyle = '#ff3333';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(10, bannerY, w - 20, bannerH);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';

      const widthViols = v.filter(item => item.exceedsWidth);
      const heightViols = v.filter(item => item.exceedsHeight);
      const violPanels = v.map(item => `#${item.panelIndex}`).join(', ');

      let title = `⚠ CONSTRAINT EXCEEDED ON PANEL(S): ${violPanels}`;
      if (widthViols.length && !heightViols.length) {
        title = `⚠ FABRIC BOLT WIDTH CONSTRAINT EXCEEDED ON PANEL(S): ${violPanels}`;
      } else if (!widthViols.length && heightViols.length) {
        title = `⚠ MAX PANEL LENGTH CONSTRAINT EXCEEDED ON PANEL(S): ${violPanels}`;
      }
      ctx.fillText(title, 20, bannerY + 12);

      let detailParts = [];
      if (widthViols.length) {
        const maxWExcess = Math.max(...widthViols.map(item => item.widthExcess || 0));
        detailParts.push(`Width: +${maxWExcess.toFixed(3)}m over ${(this.options.maxFabricWidth).toFixed(2)}m bolt`);
      }
      if (heightViols.length) {
        const maxHExcess = Math.max(...heightViols.map(item => item.heightExcess || 0));
        detailParts.push(`Length: +${maxHExcess.toFixed(3)}m over ${(this.options.maxPanelHeight).toFixed(2)}m limit`);
      }

      ctx.font = '10px monospace';
      ctx.fillStyle = '#ffcccc';
      ctx.fillText(`${detailParts.join(' | ')}. Recommend using [AUTO-FIT] in sidebar.`, 20, bannerY + 24);

      ctx.restore();
    }

    /**
     * Download selected panel SVG template.
     */
    downloadPanelSVG() {
      if (!this.cutter) return;
      const svgStr = this.cutter.generatePanelSVG(this.options.selectedPanelIndex);
      const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `HHB_Panel_${String(this.options.selectedPanelIndex).padStart(2, '0')}_Pattern.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    /**
     * Download CNC / Drafting CSV coordinate table.
     */
    downloadLoftingCSV() {
      if (!this.cutter) return;
      const table = this.cutter.getLoftingTable(this.options.selectedPanelIndex, 20);
      let csv = 'Step,Percent_Height,Height_M,Seam_HalfWidth_M,Seam_FullWidth_M,Cut_HalfWidth_M,Cut_FullWidth_M,Is_Alignment_Notch\n';

      for (const row of table) {
        csv += `${row.step},${row.percent}%,${row.sRelativeM.toFixed(4)},${row.halfWidthSeamM.toFixed(4)},${row.fullWidthSeamM.toFixed(4)},${row.halfWidthCutM.toFixed(4)},${row.fullWidthCutM.toFixed(4)},${row.isNotch ? 'YES' : 'NO'}\n`;
      }

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `HHB_Panel_${String(this.options.selectedPanelIndex).padStart(2, '0')}_Lofting_Table.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    /**
     * Smart Auto-Correction: compute minimum gore count needed to eliminate width violations.
     */
    getRecommendedGoresToFit() {
      if (!this.cutter || !this.solver) return this.options.goreCount;
      const maxR = this.solver.maxRadius;
      const allowedW = this.options.maxFabricWidth - 2 * this.options.seamAllowance;
      if (allowedW <= 0) return this.options.goreCount;

      const requiredGores = Math.ceil((2 * Math.PI * maxR) / allowedW);
      // Hot air balloons typically use even gore counts: 12, 14, 16, 18, 20, 22, 24
      const evenGores = requiredGores % 2 === 0 ? requiredGores : requiredGores + 1;
      return Math.max(evenGores, this.options.goreCount);
    }

    /**
     * Smart Auto-Correction: compute minimum panel count needed to satisfy maxPanelHeight.
     */
    getRecommendedPanelsToFit(overrideMaxHeight) {
      if (!this.cutter || !this.solver) return this.options.panelCount;
      const maxH = overrideMaxHeight !== undefined ? overrideMaxHeight : this.options.maxPanelHeight;
      const S = this.solver.totalArcLength;
      const seam = this.options.seamAllowance;
      const maxAllowedNominalHeight = maxH - 2 * seam;
      if (maxAllowedNominalHeight <= 0) return this.options.panelCount;
      const reqPanels = Math.ceil(S / maxAllowedNominalHeight);
      return Math.max(1, reqPanels);
    }
  }

  return CutoutPlanner;
}));
