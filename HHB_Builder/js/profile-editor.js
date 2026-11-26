/**
 * HHB_Builder - 2D Balloon Envelope Profile Editor
 * Interactive vector profile editor with draggable control points,
 * spline interpolation, dimension lines, panel cut lines, and grid snapping.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./balloon-math'));
  } else {
    root.ProfileEditor = factory(root.BalloonMath || window.BalloonMath);
  }
}(typeof self !== 'undefined' ? self : this, function (BalloonMath) {
  'use strict';

  class ProfileEditor {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.options = Object.assign({
        mirror: true,
        snapToGrid: true,
        gridStep: 0.25, // 25 cm grid snapping
        unit: 'metric', // 'metric' (m) or 'imperial' (ft)
        showPanelLines: true,
        onChange: null
      }, options);

      // Control points array { z, r }
      this.points = [];
      this.panelStationsZ = [];

      // View transform
      this.zoom = 1.0;
      this.panX = 0;
      this.panY = 0;
      this.scale = 24; // pixels per meter default

      // Interaction state
      this.draggedIndex = -1;
      this.hoveredIndex = -1;
      this.isPanning = false;
      this.lastMouseX = 0;
      this.lastMouseY = 0;
      this.hoverZ = 0;
      this.hoverR = 0;
      this.cursorInCanvas = false;

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

    setPoints(points, resetView = false) {
      this.points = points.map(p => ({ z: Number(p.z), r: Number(p.r) }))
                          .sort((a, b) => a.z - b.z);
      if (resetView) {
        this.fitToScreen();
      } else {
        this.render();
      }
    }

    setPanelStations(stationsZ) {
      this.panelStationsZ = stationsZ || [];
      this.render();
    }

    fitToScreen() {
      this._handleResize();
      if (!this.points || !this.points.length) return;
      const maxZ = this.points[this.points.length - 1].z;
      const maxR = Math.max(...this.points.map(p => p.r));

      const margin = 50;
      const availableW = Math.max(100, this.width - margin * 2);
      const availableH = Math.max(100, this.height - margin * 2);

      const fullW = this.options.mirror ? maxR * 2.5 : maxR * 1.4;
      const fullH = Math.max(0.5, maxZ * 1.20);

      const scaleX = availableW / fullW;
      const scaleY = availableH / fullH;
      this.scale = Math.min(scaleX, scaleY);
      this.zoom = 1.0;

      // Center horizontally, place throat near bottom
      if (this.options.mirror) {
        this.panX = this.width / 2;
      } else {
        this.panX = this.width * 0.28;
      }
      this.panY = this.height - margin * 0.8;
      this.render();
    }

    // Coordinate conversions: World (z, r in meters) <-> Screen (px)
    worldToScreen(z, r) {
      const s = this.scale * this.zoom;
      const sx = this.panX + r * s;
      const sy = this.panY - z * s;
      return { x: sx, y: sy };
    }

    screenToWorld(sx, sy) {
      const s = this.scale * this.zoom;
      const r = (sx - this.panX) / s;
      const z = (this.panY - sy) / s;
      return { z, r };
    }

    _bindEvents() {
      const canvas = this.canvas;

      canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
      window.addEventListener('mousemove', (e) => this._onMouseMove(e));
      window.addEventListener('mouseup', (e) => this._onMouseUp(e));
      canvas.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
      canvas.addEventListener('dblclick', (e) => this._onDoubleClick(e));
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());

      canvas.addEventListener('mouseenter', () => { this.cursorInCanvas = true; });
      canvas.addEventListener('mouseleave', () => {
        this.cursorInCanvas = false;
        if (!this.isPanning && this.draggedIndex === -1) {
          this.hoveredIndex = -1;
          this.render();
        }
      });

      // Touch events for mobile/tablets
      canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
          const t = e.touches[0];
          this._onMouseDown({
            clientX: t.clientX,
            clientY: t.clientY,
            button: 0,
            shiftKey: false
          });
        }
      }, { passive: false });

      canvas.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1) {
          const t = e.touches[0];
          this._onMouseMove({
            clientX: t.clientX,
            clientY: t.clientY
          });
          e.preventDefault();
        }
      }, { passive: false });

      canvas.addEventListener('touchend', () => {
        this._onMouseUp({});
      });
    }

    _getCanvasCoords(e) {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    }

    _onMouseDown(e) {
      const pos = this._getCanvasCoords(e);
      this.lastMouseX = pos.x;
      this.lastMouseY = pos.y;

      // Right click or shift-click: start panning
      if (e.button === 2 || e.shiftKey) {
        this.isPanning = true;
        this.canvas.style.cursor = 'grab';
        return;
      }

      // Check if clicked on a control point
      const hitRadius = 14;
      let clickedIdx = -1;

      for (let i = 0; i < this.points.length; i++) {
        const pt = this.points[i];
        const scr = this.worldToScreen(pt.z, pt.r);
        const dist = Math.hypot(scr.x - pos.x, scr.y - pos.y);
        if (dist <= hitRadius) {
          clickedIdx = i;
          break;
        }

        // Also check mirror side if mirror is active
        if (this.options.mirror) {
          const scrM = this.worldToScreen(pt.z, -pt.r);
          const distM = Math.hypot(scrM.x - pos.x, scrM.y - pos.y);
          if (distM <= hitRadius) {
            clickedIdx = i;
            break;
          }
        }
      }

      if (clickedIdx !== -1) {
        this.draggedIndex = clickedIdx;
        this.canvas.style.cursor = 'grabbing';
        if (window.TerminalAudio) window.TerminalAudio.playClick();
      }
    }

    _onMouseMove(e) {
      const pos = this._getCanvasCoords(e);
      const world = this.screenToWorld(pos.x, pos.y);
      this.hoverZ = Math.max(0, world.z);
      this.hoverR = Math.max(0, Math.abs(world.r));

      if (this.isPanning) {
        const dx = pos.x - this.lastMouseX;
        const dy = pos.y - this.lastMouseY;
        this.panX += dx;
        this.panY += dy;
        this.lastMouseX = pos.x;
        this.lastMouseY = pos.y;
        this.render();
        return;
      }

      if (this.draggedIndex !== -1) {
        let newZ = world.z;
        let newR = Math.abs(world.r);

        // Grid snapping
        if (this.options.snapToGrid) {
          const step = this.options.gridStep;
          newZ = Math.round(newZ / step) * step;
          newR = Math.round(newR / step) * step;
        }

        const idx = this.draggedIndex;
        const total = this.points.length;

        // Constraint rules:
        // Throat point (idx 0): z is locked to 0
        if (idx === 0) {
          newZ = 0;
          newR = Math.max(0.4, Math.min(newR, 3.5));
        } else if (idx === total - 1) {
          // Crown point: must stay above previous point
          const minZ = this.points[idx - 1].z + 0.5;
          newZ = Math.max(minZ, newZ);
          newR = Math.max(0.2, Math.min(newR, 2.0)); // crown parachute ring
        } else {
          // Intermediate point: clamped between neighboring z points
          const minZ = this.points[idx - 1].z + 0.3;
          const maxZ = this.points[idx + 1].z - 0.3;
          newZ = Math.max(minZ, Math.min(maxZ, newZ));
          newR = Math.max(0.3, Math.min(newR, 18.0));
        }

        this.points[idx].z = Number(newZ.toFixed(2));
        this.points[idx].r = Number(newR.toFixed(2));

        this._notifyChange();
        this.render();
        return;
      }

      // Check hover
      const hitRadius = 14;
      let hovered = -1;
      for (let i = 0; i < this.points.length; i++) {
        const pt = this.points[i];
        const scr = this.worldToScreen(pt.z, pt.r);
        const dist = Math.hypot(scr.x - pos.x, scr.y - pos.y);
        if (dist <= hitRadius) {
          hovered = i;
          break;
        }
        if (this.options.mirror) {
          const scrM = this.worldToScreen(pt.z, -pt.r);
          const distM = Math.hypot(scrM.x - pos.x, scrM.y - pos.y);
          if (distM <= hitRadius) {
            hovered = i;
            break;
          }
        }
      }

      if (hovered !== this.hoveredIndex) {
        this.hoveredIndex = hovered;
        this.canvas.style.cursor = hovered !== -1 ? 'pointer' : 'crosshair';
        this.render();
      } else if (this.cursorInCanvas) {
        this.render();
      }
    }

    _onMouseUp(e) {
      if (this.draggedIndex !== -1) {
        this.draggedIndex = -1;
        this.canvas.style.cursor = this.hoveredIndex !== -1 ? 'pointer' : 'crosshair';
      }
      if (this.isPanning) {
        this.isPanning = false;
        this.canvas.style.cursor = 'crosshair';
      }
    }

    _onWheel(e) {
      e.preventDefault();
      const pos = this._getCanvasCoords(e);
      const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;

      // Zoom centered at mouse position
      const newZoom = Math.max(0.3, Math.min(6.0, this.zoom * zoomFactor));
      if (newZoom !== this.zoom) {
        this.panX = pos.x - (pos.x - this.panX) * (newZoom / this.zoom);
        this.panY = pos.y - (pos.y - this.panY) * (newZoom / this.zoom);
        this.zoom = newZoom;
        this.render();
      }
    }

    _onDoubleClick(e) {
      const pos = this._getCanvasCoords(e);
      const world = this.screenToWorld(pos.x, pos.y);
      const z = Math.max(0.5, world.z);
      const r = Math.max(0.5, Math.abs(world.r));

      // Don't add if clicking existing point
      if (this.hoveredIndex !== -1) {
        // Double-click on existing point deletes it (if intermediate)
        this.deletePoint(this.hoveredIndex);
        return;
      }

      this.addPoint(z, r);
    }

    addPoint(z, r) {
      if (this.points.length >= 16) {
        alert('Maximum 16 control points permitted for smooth envelope generation.');
        return;
      }

      // Check height bounds
      const minZ = this.points[0].z;
      const maxZ = this.points[this.points.length - 1].z;
      if (z <= minZ || z >= maxZ) {
        // Can't add outside bottom or top
        return;
      }

      this.points.push({ z: Number(z.toFixed(2)), r: Number(r.toFixed(2)) });
      this.points.sort((a, b) => a.z - b.z);

      if (window.TerminalAudio) window.TerminalAudio.playPing();
      this._notifyChange();
      this.render();
    }

    deletePoint(idx) {
      if (idx <= 0 || idx >= this.points.length - 1) {
        // Cannot delete throat or crown point
        return;
      }
      if (this.points.length <= 3) {
        alert('Envelope requires at least 3 control points (throat, equator, crown).');
        return;
      }

      this.points.splice(idx, 1);
      this.hoveredIndex = -1;
      this.draggedIndex = -1;

      if (window.TerminalAudio) window.TerminalAudio.playAlert();
      this._notifyChange();
      this.render();
    }

    _notifyChange() {
      if (typeof this.options.onChange === 'function') {
        this.options.onChange(this.points.slice());
      }
    }

    render() {
      const ctx = this.ctx;
      const w = this.width;
      const h = this.height;

      // Clear with dark CRT background
      ctx.fillStyle = '#0a0800';
      ctx.fillRect(0, 0, w, h);

      // Draw Grid & Axes
      this._renderGrid(ctx, w, h);

      if (!this.points || this.points.length < 2) return;

      // Draw Panel Station Lines
      if (this.options.showPanelLines && this.panelStationsZ.length > 0) {
        this._renderPanelLines(ctx);
      }

      // Draw Envelope Profile Spline
      this._renderProfileCurve(ctx);

      // Draw Dimension Callout Arrows
      this._renderDimensions(ctx);

      // Draw Control Point Handles
      this._renderControlPoints(ctx);

      // Draw Centerline Indicator
      this._renderCenterline(ctx, h);

      // Draw Coordinate Tooltip HUD
      this._renderHUD(ctx, w, h);
    }

    _renderGrid(ctx, w, h) {
      const s = this.scale * this.zoom;
      const meterStep = s >= 50 ? 0.5 : (s >= 20 ? 1.0 : 2.0);

      ctx.save();
      ctx.lineWidth = 1;

      // Minor grid
      ctx.strokeStyle = 'rgba(255, 176, 0, 0.05)';
      ctx.beginPath();
      // Vertical lines
      const minWorldX = this.screenToWorld(0, 0).r;
      const maxWorldX = this.screenToWorld(w, 0).r;
      const startX = Math.floor(Math.min(minWorldX, maxWorldX) / meterStep) * meterStep;
      const endX = Math.ceil(Math.max(minWorldX, maxWorldX) / meterStep) * meterStep;

      for (let r = startX; r <= endX; r += meterStep) {
        const sx = this.worldToScreen(0, r).x;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, h);
      }

      // Horizontal lines
      const minWorldY = this.screenToWorld(0, h).z;
      const maxWorldY = this.screenToWorld(0, 0).z;
      const startZ = Math.floor(Math.min(minWorldY, maxWorldY) / meterStep) * meterStep;
      const endZ = Math.ceil(Math.max(minWorldY, maxWorldY) / meterStep) * meterStep;

      for (let z = startZ; z <= endZ; z += meterStep) {
        const sy = this.worldToScreen(z, 0).y;
        ctx.moveTo(0, sy);
        ctx.lineTo(w, sy);
      }
      ctx.stroke();

      // Major axes
      // Ground plane / Throat plane (z = 0)
      const groundY = this.worldToScreen(0, 0).y;
      ctx.strokeStyle = 'rgba(255, 176, 0, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, groundY);
      ctx.lineTo(w, groundY);
      ctx.stroke();

      // Centerline (r = 0)
      const centerLineX = this.worldToScreen(0, 0).x;
      ctx.strokeStyle = 'rgba(255, 176, 0, 0.45)';
      ctx.setLineDash([6, 4, 2, 4]);
      ctx.beginPath();
      ctx.moveTo(centerLineX, 0);
      ctx.lineTo(centerLineX, h);
      ctx.stroke();
      ctx.setLineDash([]);

      // Axis Tick Labels
      ctx.fillStyle = 'rgba(255, 176, 0, 0.4)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      for (let z = Math.max(0, startZ); z <= endZ; z += meterStep * 2) {
        const sy = this.worldToScreen(z, 0).y;
        if (sy >= 15 && sy <= h - 15) {
          const valStr = this.options.unit === 'imperial'
            ? `${(z * 3.28084).toFixed(0)}ft`
            : `${z.toFixed(1)}m`;
          ctx.fillText(valStr, centerLineX - 8, sy);
        }
      }

      ctx.restore();
    }

    _renderPanelLines(ctx) {
      if (!this.panelStationsZ || !this.panelStationsZ.length) return;

      ctx.save();
      ctx.strokeStyle = 'rgba(255, 150, 0, 0.28)';
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;

      for (let i = 0; i < this.panelStationsZ.length; i++) {
        const st = this.panelStationsZ[i];
        const z = st.z;
        const r = st.r;
        const ptRight = this.worldToScreen(z, r);
        const ptLeft = this.options.mirror ? this.worldToScreen(z, -r) : this.worldToScreen(z, 0);

        ctx.beginPath();
        ctx.moveTo(ptLeft.x, ptLeft.y);
        ctx.lineTo(ptRight.x, ptRight.y);
        ctx.stroke();

        // Panel label
        if (i < this.panelStationsZ.length - 1) {
          const zNext = this.panelStationsZ[i + 1].z;
          const zMid = (z + zNext) / 2;
          const syMid = this.worldToScreen(zMid, 0).y;
          ctx.fillStyle = 'rgba(255, 176, 0, 0.22)';
          ctx.font = '9px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(`P${i + 1}`, this.panX, syMid);
        }
      }

      ctx.restore();
    }

    _renderProfileCurve(ctx) {
      try {
        const BM = BalloonMath || window.BalloonMath;
        const spline = new BM.MonotoneCubicSpline(this.points);
        const minZ = this.points[0].z;
        const maxZ = this.points[this.points.length - 1].z;
        const steps = 180;
        const dz = (maxZ - minZ) / steps;

        // Path right side
        const rightPoints = [];
        for (let i = 0; i <= steps; i++) {
          const z = minZ + i * dz;
          const r = spline.eval(z);
          rightPoints.push(this.worldToScreen(z, r));
        }

        // Fill silhouette with phosphor semi-transparent glow
        ctx.save();
        ctx.beginPath();
        if (this.options.mirror) {
          ctx.moveTo(this.worldToScreen(minZ, -spline.eval(minZ)).x, this.worldToScreen(minZ, 0).y);
          for (let i = 0; i <= steps; i++) {
            const z = minZ + i * dz;
            const pt = this.worldToScreen(z, spline.eval(z));
            ctx.lineTo(pt.x, pt.y);
          }
          for (let i = steps; i >= 0; i--) {
            const z = minZ + i * dz;
            const pt = this.worldToScreen(z, -spline.eval(z));
            ctx.lineTo(pt.x, pt.y);
          }
        } else {
          ctx.moveTo(this.panX, this.worldToScreen(minZ, 0).y);
          for (let i = 0; i <= steps; i++) {
            ctx.lineTo(rightPoints[i].x, rightPoints[i].y);
          }
          ctx.lineTo(this.panX, this.worldToScreen(maxZ, 0).y);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 176, 0, 0.05)';
        ctx.fill();

        // Phosphor Glow Stroke pass
        ctx.shadowColor = 'rgba(255, 176, 0, 0.8)';
        ctx.shadowBlur = 8;
        ctx.strokeStyle = '#ffaa00';
        ctx.lineWidth = 2.2;

        ctx.beginPath();
        for (let i = 0; i <= steps; i++) {
          if (i === 0) ctx.moveTo(rightPoints[i].x, rightPoints[i].y);
          else ctx.lineTo(rightPoints[i].x, rightPoints[i].y);
        }
        ctx.stroke();

        // Mirrored curve
        if (this.options.mirror) {
          ctx.beginPath();
          for (let i = 0; i <= steps; i++) {
            const z = minZ + i * dz;
            const ptM = this.worldToScreen(z, -spline.eval(z));
            if (i === 0) ctx.moveTo(ptM.x, ptM.y);
            else ctx.lineTo(ptM.x, ptM.y);
          }
          ctx.stroke();
        }

        // Draw throat mouth line and crown cap
        ctx.shadowBlur = 0;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#ffd040';

        // Throat mouth
        const throatR = this.points[0].r;
        const ptThrR = this.worldToScreen(minZ, throatR);
        const ptThrL = this.options.mirror ? this.worldToScreen(minZ, -throatR) : this.worldToScreen(minZ, 0);
        ctx.beginPath();
        ctx.moveTo(ptThrL.x, ptThrL.y);
        ctx.lineTo(ptThrR.x, ptThrR.y);
        ctx.stroke();

        // Parachute crown ring
        const crownR = this.points[this.points.length - 1].r;
        const ptCrwR = this.worldToScreen(maxZ, crownR);
        const ptCrwL = this.options.mirror ? this.worldToScreen(maxZ, -crownR) : this.worldToScreen(maxZ, 0);
        ctx.beginPath();
        ctx.moveTo(ptCrwL.x, ptCrwL.y);
        ctx.lineTo(ptCrwR.x, ptCrwR.y);
        ctx.stroke();

        ctx.restore();
      } catch (err) {
        console.error('Error drawing spline:', err);
      }
    }

    _renderDimensions(ctx) {
      if (this.points.length < 2) return;
      const minZ = this.points[0].z;
      const maxZ = this.points[this.points.length - 1].z;
      const H = maxZ - minZ;

      let maxR = 0;
      let maxRZ = 0;
      for (const p of this.points) {
        if (p.r > maxR) {
          maxR = p.r;
          maxRZ = p.z;
        }
      }

      ctx.save();
      ctx.strokeStyle = 'rgba(255, 190, 40, 0.65)';
      ctx.fillStyle = '#ffaa00';
      ctx.font = '10px monospace';
      ctx.lineWidth = 1;

      // Height Dimension (Left side)
      const leftX = this.panX - (maxR * this.scale * this.zoom) - 35;
      const topY = this.worldToScreen(maxZ, 0).y;
      const botY = this.worldToScreen(minZ, 0).y;

      ctx.beginPath();
      ctx.moveTo(leftX, topY);
      ctx.lineTo(leftX, botY);
      // Top tick
      ctx.moveTo(leftX - 6, topY);
      ctx.lineTo(leftX + 6, topY);
      // Bottom tick
      ctx.moveTo(leftX - 6, botY);
      ctx.lineTo(leftX + 6, botY);
      ctx.stroke();

      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const hStr = this.options.unit === 'imperial'
        ? `H: ${(H * 3.28084).toFixed(1)}ft`
        : `H: ${H.toFixed(2)}m`;
      ctx.fillText(hStr, leftX - 10, (topY + botY) / 2);

      // Max Diameter Callout (at maxRZ)
      const ptEqR = this.worldToScreen(maxRZ, maxR);
      const ptEqL = this.options.mirror ? this.worldToScreen(maxRZ, -maxR) : this.worldToScreen(maxRZ, 0);

      ctx.beginPath();
      ctx.moveTo(ptEqL.x, ptEqL.y);
      ctx.lineTo(ptEqR.x, ptEqR.y);
      ctx.stroke();

      ctx.textAlign = 'left';
      const diaStr = this.options.unit === 'imperial'
        ? `MAX Ø: ${(maxR * 2 * 3.28084).toFixed(1)}ft`
        : `MAX Ø: ${(maxR * 2).toFixed(2)}m`;
      ctx.fillText(diaStr, ptEqR.x + 10, ptEqR.y);

      ctx.restore();
    }

    _renderControlPoints(ctx) {
      ctx.save();
      for (let i = 0; i < this.points.length; i++) {
        const pt = this.points[i];
        const isHovered = (i === this.hoveredIndex);
        const isDragged = (i === this.draggedIndex);

        const scr = this.worldToScreen(pt.z, pt.r);

        // Draw diamond handle
        const radius = isDragged ? 8 : (isHovered ? 7 : 5);
        ctx.shadowColor = '#ffb000';
        ctx.shadowBlur = isHovered || isDragged ? 12 : 5;
        ctx.fillStyle = isDragged ? '#ffffff' : (isHovered ? '#ffd040' : '#ff9800');
        ctx.strokeStyle = '#ffb000';
        ctx.lineWidth = 1.5;

        // Diamond shape
        ctx.beginPath();
        ctx.moveTo(scr.x, scr.y - radius);
        ctx.lineTo(scr.x + radius, scr.y);
        ctx.lineTo(scr.x, scr.y + radius);
        ctx.lineTo(scr.x - radius, scr.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Index tag
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffaa00';
        ctx.font = '9px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`P${i}`, scr.x + radius + 4, scr.y - 2);

        // If hovered or dragged, show coordinate tooltip right next to it
        if (isHovered || isDragged) {
          const zVal = this.options.unit === 'imperial' ? `${(pt.z * 3.28084).toFixed(1)}ft` : `${pt.z.toFixed(2)}m`;
          const rVal = this.options.unit === 'imperial' ? `${(pt.r * 3.28084).toFixed(1)}ft` : `${pt.r.toFixed(2)}m`;
          const text = `[Z:${zVal} R:${rVal}]`;
          ctx.fillStyle = '#0a0800';
          const tw = ctx.measureText(text).width;
          ctx.fillRect(scr.x + radius + 3, scr.y + 2, tw + 4, 12);
          ctx.fillStyle = '#ffd040';
          ctx.fillText(text, scr.x + radius + 5, scr.y + 11);
        }

        // Mirrored handle (ghosted)
        if (this.options.mirror) {
          const scrM = this.worldToScreen(pt.z, -pt.r);
          ctx.fillStyle = 'rgba(255, 176, 0, 0.4)';
          ctx.beginPath();
          ctx.arc(scrM.x, scrM.y, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    _renderCenterline(ctx, h) {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 176, 0, 0.7)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('℄ AXIS OF SYMMETRY', this.panX, 20);
      ctx.restore();
    }

    _renderHUD(ctx, w, h) {
      if (!this.cursorInCanvas && this.hoveredIndex === -1) return;

      ctx.save();
      ctx.fillStyle = 'rgba(10, 8, 0, 0.85)';
      ctx.strokeStyle = '#ff9800';
      ctx.lineWidth = 1;
      const boxW = 210;
      const boxH = 42;
      const bx = 12;
      const by = h - boxH - 12;

      ctx.fillRect(bx, by, boxW, boxH);
      ctx.strokeRect(bx, by, boxW, boxH);

      ctx.fillStyle = '#ffaa00';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';

      const zDisp = this.options.unit === 'imperial'
        ? `${(this.hoverZ * 3.28084).toFixed(2)} ft`
        : `${this.hoverZ.toFixed(2)} m`;
      const rDisp = this.options.unit === 'imperial'
        ? `${(this.hoverR * 3.28084).toFixed(2)} ft`
        : `${this.hoverR.toFixed(2)} m`;
      const dDisp = this.options.unit === 'imperial'
        ? `${(this.hoverR * 2 * 3.28084).toFixed(2)} ft`
        : `${(this.hoverR * 2).toFixed(2)} m`;

      ctx.fillText(`CURSOR POSITION:`, bx + 8, by + 14);
      ctx.fillStyle = '#ffd040';
      ctx.fillText(`HEIGHT Z: ${zDisp}`, bx + 8, by + 26);
      ctx.fillText(`RADIUS R: ${rDisp} (Ø ${dDisp})`, bx + 8, by + 37);

      ctx.restore();
    }
  }

  return ProfileEditor;
}));
