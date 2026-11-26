/**
 * HHB_Builder - 3D Amber Wireframe Visualizer Engine
 * High-performance 3D vector wireframe renderer with authentic CRT phosphor bloom,
 * orbit camera, envelope revolution mesh, basket/burner assemblies, and gore highlighting.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Wireframe3D = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class Wireframe3D {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.options = Object.assign({
        autoRotate: true,
        rotateSpeed: 0.005,
        goreCount: 16,
        showBasket: true,
        showCables: true,
        showBurner: true,
        showMeshDiagonals: false,
        showAxes: true,
        selectedGore: -1,
        onGoreSelect: null
      }, options);

      // Camera parameters
      this.camera = {
        distance: 8.0, // meters
        azimuth: Math.PI * 0.25, // yaw
        elevation: 0.28,         // pitch (radians)
        target: { x: 0, y: 1.7, z: 0 },
        fov: 48 * (Math.PI / 180)
      };

      // Animation & Interaction
      this.isDragging = false;
      this.isPanning = false;
      this.lastMouseX = 0;
      this.lastMouseY = 0;
      this.hoveredGore = -1;
      this.animId = null;

      // Geometry cache
      this.solver = null;
      this.panelStationsZ = [];
      this.meridians = [];
      this.parallels = [];
      this.diagonals = [];
      this.accessorySegments = [];
      this.groundY = -0.5;
      this.groundSize = 6;
      this.groundStep = 1.0;

      this._initCanvas();
      this._bindEvents();
      this.startAnimation();
    }

    _initCanvas() {
      this._handleResize();
      window.addEventListener('resize', () => {
        this._handleResize();
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

    setSolver(solver, goreCount, panelStationsZ = []) {
      this.solver = solver;
      if (goreCount) this.options.goreCount = goreCount;
      this.panelStationsZ = panelStationsZ;

      if (solver) {
        // Center camera target on envelope
        const centerZ = (solver.minZ + solver.maxZ) / 2;
        this.camera.target.y = centerZ;
        this.camera.distance = Math.max(3.5, solver.height * 2.0);
      }

      this._rebuildGeometry();
    }

    _rebuildGeometry() {
      if (!this.solver) return;

      const solver = this.solver;
      const N = this.options.goreCount;
      const zSteps = 45;
      const dz = solver.height / zSteps;

      this.meridians = [];
      this.parallels = [];
      this.diagonals = [];
      this.accessorySegments = [];

      // 1. Build Meridians (Gore Ribs)
      for (let g = 0; g < N; g++) {
        const theta = (2 * Math.PI * g) / N;
        const sinT = Math.sin(theta);
        const cosT = Math.cos(theta);
        const points = [];

        for (let j = 0; j <= zSteps; j++) {
          const z = solver.minZ + j * dz;
          const r = solver.spline.eval(z);
          points.push({
            x: r * sinT,
            y: z,
            z: r * cosT
          });
        }
        this.meridians.push({ goreIndex: g, points });
      }

      // 2. Build Parallels (Panel Seams and intermediate hoops)
      const ringStationsZ = [];
      // Panel stations
      if (this.panelStationsZ && this.panelStationsZ.length > 0) {
        for (const st of this.panelStationsZ) {
          ringStationsZ.push(st.z);
        }
      } else {
        // Fallback rings
        for (let j = 0; j <= 12; j++) {
          ringStationsZ.push(solver.minZ + (j / 12) * solver.height);
        }
      }

      for (const zVal of ringStationsZ) {
        const r = solver.spline.eval(zVal);
        const ringPoints = [];
        const ringSegments = N * 2; // smooth circle
        for (let k = 0; k <= ringSegments; k++) {
          const theta = (2 * Math.PI * k) / ringSegments;
          ringPoints.push({
            x: r * Math.sin(theta),
            y: zVal,
            z: r * Math.cos(theta)
          });
        }
        this.parallels.push(ringPoints);
      }

      // 3. Build Mesh Diagonals (Tension Diamond Lattice)
      if (this.options.showMeshDiagonals) {
        for (let g = 0; g < N; g++) {
          const gNext = (g + 1) % N;
          const ptsA = this.meridians[g].points;
          const ptsB = this.meridians[gNext].points;

          for (let j = 0; j < ptsA.length - 1; j += 2) {
            this.diagonals.push([ptsA[j], ptsB[Math.min(ptsB.length - 1, j + 2)]]);
          }
        }
      }

      // 4. Build Accessories: Throat skirt, Burner, Basket, Cables
      this._buildAccessories(solver);
    }

    _buildAccessories(solver) {
      const minZ = solver.minZ;
      const throatR = solver.throatRadius;
      const H = solver.height;

      // Scale accessories proportionally to envelope height (reference: 18m full-scale balloon)
      const scale = Math.max(0.18, Math.min(1.2, H / 18.0));

      // Nomex Skirt (slight conical flare beneath throat mouth)
      const skirtBottomZ = minZ - 0.75 * scale;
      const skirtBottomR = throatR * 1.15;
      const skirtSegments = 16;
      const skirtTopRing = [];
      const skirtBotRing = [];

      for (let k = 0; k <= skirtSegments; k++) {
        const theta = (2 * Math.PI * k) / skirtSegments;
        skirtTopRing.push({ x: throatR * Math.sin(theta), y: minZ, z: throatR * Math.cos(theta) });
        skirtBotRing.push({ x: skirtBottomR * Math.sin(theta), y: skirtBottomZ, z: skirtBottomR * Math.cos(theta) });
      }
      this.accessorySegments.push({ type: 'skirt', poly: skirtTopRing });
      this.accessorySegments.push({ type: 'skirt', poly: skirtBotRing });

      for (let k = 0; k < skirtSegments; k += 2) {
        this.accessorySegments.push({
          type: 'skirt',
          line: [skirtTopRing[k], skirtBotRing[k]]
        });
      }

      // Burner Position & Geometry (scaled)
      const burnerZ = minZ - 2.0 * scale;
      const burnerW = 0.55 * scale; // frame width
      const bHalf = burnerW / 2;

      // Burner outer frame
      const bf1 = { x: -bHalf, y: burnerZ, z: -bHalf };
      const bf2 = { x: bHalf, y: burnerZ, z: -bHalf };
      const bf3 = { x: bHalf, y: burnerZ, z: bHalf };
      const bf4 = { x: -bHalf, y: burnerZ, z: bHalf };
      this.accessorySegments.push({ type: 'burner', poly: [bf1, bf2, bf3, bf4, bf1] });

      // Dual burner coils
      const coilR = 0.16 * scale;
      for (const cx of [-0.15 * scale, 0.15 * scale]) {
        const coilRing1 = [];
        const coilRing2 = [];
        for (let k = 0; k <= 8; k++) {
          const th = (2 * Math.PI * k) / 8;
          coilRing1.push({ x: cx + coilR * Math.sin(th), y: burnerZ + 0.05 * scale, z: coilR * Math.cos(th) });
          coilRing2.push({ x: cx + coilR * Math.sin(th), y: burnerZ + 0.28 * scale, z: coilR * Math.cos(th) });
        }
        this.accessorySegments.push({ type: 'burner', poly: coilRing1 });
        this.accessorySegments.push({ type: 'burner', poly: coilRing2 });
      }

      // Basket / Gondola Position & Geometry (scaled)
      const basketTopZ = minZ - 3.0 * scale;
      const basketBotZ = minZ - 4.2 * scale;
      const basketHalfW = 0.70 * scale;
      const basketHalfD = 0.55 * scale;

      // Store ground plane height and scale
      this.groundY = basketBotZ - 0.15 * scale;
      this.groundSize = Math.max(3.0, H * 0.85);
      this.groundStep = Math.max(0.5, Number((this.groundSize / 6.0).toFixed(1)));

      // Top Bolster Rim
      const btr1 = { x: -basketHalfW, y: basketTopZ, z: -basketHalfD };
      const btr2 = { x: basketHalfW, y: basketTopZ, z: -basketHalfD };
      const btr3 = { x: basketHalfW, y: basketTopZ, z: basketHalfD };
      const btr4 = { x: -basketHalfW, y: basketTopZ, z: basketHalfD };
      this.accessorySegments.push({ type: 'basket', poly: [btr1, btr2, btr3, btr4, btr1] });

      // Mid wicker rail
      const midZ = (basketTopZ + basketBotZ) / 2;
      const bmr1 = { x: -basketHalfW * 0.98, y: midZ, z: -basketHalfD * 0.98 };
      const bmr2 = { x: basketHalfW * 0.98, y: midZ, z: -basketHalfD * 0.98 };
      const bmr3 = { x: basketHalfW * 0.98, y: midZ, z: basketHalfD * 0.98 };
      const bmr4 = { x: -basketHalfW * 0.98, y: midZ, z: basketHalfD * 0.98 };
      this.accessorySegments.push({ type: 'basket', poly: [bmr1, bmr2, bmr3, bmr4, bmr1] });

      // Bottom Floor Rim
      const bbr1 = { x: -basketHalfW * 0.95, y: basketBotZ, z: -basketHalfD * 0.95 };
      const bbr2 = { x: basketHalfW * 0.95, y: basketBotZ, z: -basketHalfD * 0.95 };
      const bbr3 = { x: basketHalfW * 0.95, y: basketBotZ, z: basketHalfD * 0.95 };
      const bbr4 = { x: -basketHalfW * 0.95, y: basketBotZ, z: basketHalfD * 0.95 };
      this.accessorySegments.push({ type: 'basket', poly: [bbr1, bbr2, bbr3, bbr4, bbr1] });

      // Corner Uprights
      this.accessorySegments.push({ type: 'basket', line: [btr1, bbr1] });
      this.accessorySegments.push({ type: 'basket', line: [btr2, bbr2] });
      this.accessorySegments.push({ type: 'basket', line: [btr3, bbr3] });
      this.accessorySegments.push({ type: 'basket', line: [btr4, bbr4] });

      // Burner Support Uprights (from basket corners up to burner frame)
      this.accessorySegments.push({ type: 'burner-upright', line: [btr1, bf1] });
      this.accessorySegments.push({ type: 'burner-upright', line: [btr2, bf2] });
      this.accessorySegments.push({ type: 'burner-upright', line: [btr3, bf3] });
      this.accessorySegments.push({ type: 'burner-upright', line: [btr4, bf4] });

      // Flying Suspension Cables (Stainless steel wires from throat ring down to burner/basket)
      const cablePointsThroat = 8;
      for (let k = 0; k < cablePointsThroat; k++) {
        const th = (2 * Math.PI * k) / cablePointsThroat;
        const ptThr = { x: throatR * Math.sin(th), y: minZ, z: throatR * Math.cos(th) };
        const destCorner = (k < 2) ? bf1 : (k < 4) ? bf2 : (k < 6) ? bf3 : bf4;
        this.accessorySegments.push({ type: 'cable', line: [ptThr, destCorner] });
      }

      // Wooden Skid Runners under basket
      const runnerZ = basketBotZ - 0.08 * scale;
      for (const rx of [-basketHalfW * 0.6, basketHalfW * 0.6]) {
        const sr1 = { x: rx, y: runnerZ, z: -basketHalfD * 1.1 };
        const sr2 = { x: rx, y: runnerZ, z: basketHalfD * 1.1 };
        this.accessorySegments.push({ type: 'skid', line: [sr1, sr2] });
      }
    }

    _bindEvents() {
      const canvas = this.canvas;

      canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
      window.addEventListener('mousemove', (e) => this._onMouseMove(e));
      window.addEventListener('mouseup', (e) => this._onMouseUp(e));
      canvas.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());

      // Touch controls
      canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
          const t = e.touches[0];
          this._onMouseDown({ clientX: t.clientX, clientY: t.clientY, button: 0 });
        }
      }, { passive: false });

      canvas.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1) {
          const t = e.touches[0];
          this._onMouseMove({ clientX: t.clientX, clientY: t.clientY });
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

      if (e.button === 2 || e.shiftKey) {
        this.isPanning = true;
      } else {
        this.isDragging = true;
      }

      // Pause auto-rotate during user interaction
      this._userInteracting = true;
    }

    _onMouseMove(e) {
      const pos = this._getCanvasCoords(e);
      const dx = pos.x - this.lastMouseX;
      const dy = pos.y - this.lastMouseY;
      this.lastMouseX = pos.x;
      this.lastMouseY = pos.y;

      if (this.isDragging) {
        this.camera.azimuth += dx * 0.008;
        this.camera.elevation += dy * 0.008;

        // Clamp elevation to prevent gimbal flipping
        const maxElev = Math.PI * 0.46;
        this.camera.elevation = Math.max(-maxElev, Math.min(maxElev, this.camera.elevation));
        return;
      }

      if (this.isPanning) {
        const panFactor = this.camera.distance * 0.0015;
        this.camera.target.y += dy * panFactor;
        return;
      }

      // Gore hover detection
      this._checkGoreHover(pos);
    }

    _onMouseUp(e) {
      this.isDragging = false;
      this.isPanning = false;
      this._userInteracting = false;
    }

    _onWheel(e) {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 0.90 : 1.10;
      this.camera.distance = Math.max(1.5, Math.min(120, this.camera.distance * zoomFactor));
    }

    _checkGoreHover(pos) {
      if (!this.meridians || !this.meridians.length) return;

      // Project meridians to screen and find closest gore line
      let closestGore = -1;
      let minDistance = 14;

      for (let g = 0; g < this.meridians.length; g++) {
        const pts = this.meridians[g].points;
        for (let j = 0; j < pts.length; j += 4) {
          const scr = this.project(pts[j]);
          if (scr && scr.visible) {
            const d = Math.hypot(scr.x - pos.x, scr.y - pos.y);
            if (d < minDistance) {
              minDistance = d;
              closestGore = g;
            }
          }
        }
      }

      if (closestGore !== this.hoveredGore) {
        this.hoveredGore = closestGore;
        if (closestGore !== -1 && typeof this.options.onGoreSelect === 'function') {
          this.options.onGoreSelect(closestGore);
        }
      }
    }

    setCameraPreset(preset) {
      if (!this.solver) return;
      const H = this.solver.height;
      const centerZ = (this.solver.minZ + this.solver.maxZ) / 2;
      const dist = Math.max(3.5, H * 2.0);

      switch (preset) {
        case 'FRONT':
          this.camera.azimuth = 0;
          this.camera.elevation = 0.05;
          this.camera.target.y = centerZ;
          this.camera.distance = dist;
          break;
        case 'SIDE':
          this.camera.azimuth = Math.PI * 0.5;
          this.camera.elevation = 0.05;
          this.camera.target.y = centerZ;
          this.camera.distance = dist;
          break;
        case 'TOP':
          this.camera.azimuth = 0;
          this.camera.elevation = Math.PI * 0.45;
          this.camera.target.y = centerZ;
          this.camera.distance = dist * 1.15;
          break;
        case 'BASKET':
          this.camera.azimuth = Math.PI * 0.2;
          this.camera.elevation = -0.15;
          this.camera.target.y = (this.groundY !== undefined) ? this.groundY + 0.5 : centerZ - H * 0.4;
          this.camera.distance = Math.max(1.8, dist * 0.45);
          break;
        case 'PERSPECTIVE':
        default:
          this.camera.azimuth = Math.PI * 0.25;
          this.camera.elevation = 0.25;
          this.camera.target.y = centerZ;
          this.camera.distance = dist;
          break;
      }
      if (window.TerminalAudio) window.TerminalAudio.playSwitch();
    }

    /**
     * Project 3D World point {x, y, z} to 2D Screen point {x, y, zDepth, visible}.
     */
    project(p) {
      const cam = this.camera;
      const cosAz = Math.cos(cam.azimuth);
      const sinAz = Math.sin(cam.azimuth);
      const cosEl = Math.cos(cam.elevation);
      const sinEl = Math.sin(cam.elevation);

      // Translate relative to target
      const tx = p.x - cam.target.x;
      const ty = p.y - cam.target.y;
      const tz = p.z - cam.target.z;

      // Rotate Yaw (Azimuth around Y)
      const x1 = tx * cosAz - tz * sinAz;
      const y1 = ty;
      const z1 = tx * sinAz + tz * cosAz;

      // Rotate Pitch (Elevation around X)
      const x2 = x1;
      const y2 = y1 * cosEl - z1 * sinEl;
      const z2 = y1 * sinEl + z1 * cosEl;

      // Camera position is along +Z axis at camera.distance
      const camZ = z2 + cam.distance;
      if (camZ <= 0.8) {
        return { x: 0, y: 0, zDepth: camZ, visible: false };
      }

      // Perspective divide
      const f = (this.height / 2) / Math.tan(cam.fov / 2);
      const sx = (this.width / 2) + (x2 * f) / camZ;
      const sy = (this.height / 2) - (y2 * f) / camZ;

      return {
        x: sx,
        y: sy,
        zDepth: camZ,
        visible: true
      };
    }

    startAnimation() {
      if (this.animId) return;
      const loop = () => {
        this.update();
        this.render();
        this.animId = requestAnimationFrame(loop);
      };
      this.animId = requestAnimationFrame(loop);
    }

    stopAnimation() {
      if (this.animId) {
        cancelAnimationFrame(this.animId);
        this.animId = null;
      }
    }

    update() {
      if (this.options.autoRotate && !this._userInteracting) {
        this.camera.azimuth += this.options.rotateSpeed;
      }
    }

    render() {
      const ctx = this.ctx;
      const w = this.width;
      const h = this.height;

      // Deep cathode black background
      ctx.fillStyle = '#0a0800';
      ctx.fillRect(0, 0, w, h);

      // Sub-pixel vector antialiasing & amber phosphor glow
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Draw Ground Grid
      this._renderGroundGrid(ctx);

      if (!this.solver) return;

      // Render Envelope Parallels (Latitudinal Hoops)
      this._renderParallels(ctx);

      // Render Mesh Diagonals (if enabled)
      if (this.options.showMeshDiagonals) {
        this._renderDiagonals(ctx);
      }

      // Render Envelope Meridians (Gore Ribs)
      this._renderMeridians(ctx);

      // Render Basket, Burner, Cables, and Skirt
      this._renderAccessories(ctx);

      // Render 3D Gimbal / Orientation Compass Triad
      if (this.options.showAxes) {
        this._renderGimbal(ctx, w, h);
      }

      // Render Telemetry Overlay
      this._renderTelemetry(ctx);
    }

    _renderGroundGrid(ctx) {
      const gridSize = this.groundSize || 14;
      const gridStep = this.groundStep || 2.0;
      const groundY = this.groundY !== undefined ? this.groundY : -4.5;

      ctx.save();
      ctx.lineWidth = 1;

      for (let x = -gridSize; x <= gridSize; x += gridStep) {
        const p1 = this.project({ x, y: groundY, z: -gridSize });
        const p2 = this.project({ x, y: groundY, z: gridSize });
        if (p1.visible && p2.visible) {
          const avgZ = (p1.zDepth + p2.zDepth) / 2;
          const alpha = Math.max(0.02, Math.min(0.12, 18 / avgZ));
          ctx.strokeStyle = `rgba(255, 176, 0, ${alpha})`;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }

      for (let z = -gridSize; z <= gridSize; z += gridStep) {
        const p1 = this.project({ x: -gridSize, y: groundY, z });
        const p2 = this.project({ x: gridSize, y: groundY, z });
        if (p1.visible && p2.visible) {
          const avgZ = (p1.zDepth + p2.zDepth) / 2;
          const alpha = Math.max(0.02, Math.min(0.12, 18 / avgZ));
          ctx.strokeStyle = `rgba(255, 176, 0, ${alpha})`;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }

      ctx.restore();
    }

    _renderParallels(ctx) {
      ctx.save();
      for (const ring of this.parallels) {
        let prevScr = null;
        for (let i = 0; i < ring.length; i++) {
          const scr = this.project(ring[i]);
          if (scr.visible && prevScr && prevScr.visible) {
            const avgZ = (scr.zDepth + prevScr.zDepth) / 2;
            const alpha = Math.max(0.08, Math.min(0.40, 28 / avgZ));
            ctx.strokeStyle = `rgba(255, 160, 0, ${alpha})`;
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            ctx.moveTo(prevScr.x, prevScr.y);
            ctx.lineTo(scr.x, scr.y);
            ctx.stroke();
          }
          prevScr = scr;
        }
      }
      ctx.restore();
    }

    _renderDiagonals(ctx) {
      ctx.save();
      ctx.lineWidth = 0.8;
      for (const line of this.diagonals) {
        const p1 = this.project(line[0]);
        const p2 = this.project(line[1]);
        if (p1.visible && p2.visible) {
          const avgZ = (p1.zDepth + p2.zDepth) / 2;
          const alpha = Math.max(0.04, Math.min(0.22, 22 / avgZ));
          ctx.strokeStyle = `rgba(255, 140, 0, ${alpha})`;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    _renderMeridians(ctx) {
      ctx.save();

      for (let g = 0; g < this.meridians.length; g++) {
        const item = this.meridians[g];
        const isHovered = (g === this.hoveredGore);
        const isSelected = (g === this.options.selectedGore);
        const pts = item.points;

        for (let j = 0; j < pts.length - 1; j++) {
          const p1 = this.project(pts[j]);
          const p2 = this.project(pts[j + 1]);

          if (p1.visible && p2.visible) {
            const avgZ = (p1.zDepth + p2.zDepth) / 2;

            if (isSelected || isHovered) {
              // Blinding electric amber flare pass
              ctx.shadowColor = '#ffe066';
              ctx.shadowBlur = 10;
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 3.0;
            } else {
              // Depth-cued phosphor vector line
              const alpha = Math.max(0.18, Math.min(0.95, 34 / avgZ));
              ctx.shadowColor = 'rgba(255, 176, 0, 0.5)';
              ctx.shadowBlur = 5;
              ctx.strokeStyle = `rgba(255, 176, 0, ${alpha})`;
              ctx.lineWidth = 1.4;
            }

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }
      }

      ctx.restore();
    }

    _renderAccessories(ctx) {
      ctx.save();

      for (const item of this.accessorySegments) {
        if (item.line) {
          const p1 = this.project(item.line[0]);
          const p2 = this.project(item.line[1]);
          if (p1.visible && p2.visible) {
            const avgZ = (p1.zDepth + p2.zDepth) / 2;
            const alpha = Math.max(0.15, Math.min(0.85, 30 / avgZ));

            if (item.type === 'cable') {
              ctx.strokeStyle = `rgba(255, 210, 80, ${alpha * 0.9})`;
              ctx.lineWidth = 1.0;
            } else if (item.type === 'burner' || item.type === 'burner-upright') {
              ctx.strokeStyle = `rgba(255, 190, 40, ${alpha})`;
              ctx.lineWidth = 1.6;
            } else {
              ctx.strokeStyle = `rgba(255, 160, 20, ${alpha})`;
              ctx.lineWidth = 1.4;
            }

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        } else if (item.poly) {
          const pts = item.poly;
          ctx.beginPath();
          let anyVisible = false;

          for (let i = 0; i < pts.length; i++) {
            const scr = this.project(pts[i]);
            if (scr.visible) {
              anyVisible = true;
              if (i === 0) ctx.moveTo(scr.x, scr.y);
              else ctx.lineTo(scr.x, scr.y);
            }
          }

          if (anyVisible) {
            ctx.strokeStyle = item.type === 'burner' ? '#ffd040' : '#ffaa00';
            ctx.lineWidth = 1.4;
            ctx.stroke();
          }
        }
      }

      ctx.restore();
    }

    _renderGimbal(ctx, w, h) {
      const gx = 48;
      const gy = h - 48;
      const axisLen = 32;

      const cam = this.camera;
      const cosAz = Math.cos(cam.azimuth);
      const sinAz = Math.sin(cam.azimuth);
      const cosEl = Math.cos(cam.elevation);
      const sinEl = Math.sin(cam.elevation);

      const rotateVec = (v) => {
        const x1 = v.x * cosAz - v.z * sinAz;
        const y1 = v.y;
        const z1 = v.x * sinAz + v.z * cosAz;
        const x2 = x1;
        const y2 = y1 * cosEl - z1 * sinEl;
        return { x: x2, y: y2 };
      };

      const axes = [
        { name: 'X', color: '#ff6600', v: { x: 1, y: 0, z: 0 } },
        { name: 'Z', color: '#ffd54f', v: { x: 0, y: 1, z: 0 } }, // Altitude (Z in balloon coords)
        { name: 'Y', color: '#ffaa00', v: { x: 0, y: 0, z: 1 } }
      ];

      ctx.save();
      ctx.lineWidth = 1.8;
      ctx.font = '10px monospace';

      for (const ax of axes) {
        const proj = rotateVec(ax.v);
        const endX = gx + proj.x * axisLen;
        const endY = gy - proj.y * axisLen;

        ctx.strokeStyle = ax.color;
        ctx.fillStyle = ax.color;
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        ctx.fillText(ax.name, endX + 4, endY + 4);
      }

      // Center dot
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(gx, gy, 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    _renderTelemetry(ctx) {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 176, 0, 0.7)';
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';

      const rotDeg = Math.round((this.camera.azimuth * (180 / Math.PI)) % 360);
      const elevDeg = Math.round(this.camera.elevation * (180 / Math.PI));
      const distM = this.camera.distance.toFixed(1);

      ctx.fillText(`CAM AZIMUTH: ${rotDeg}° | ELEV: ${elevDeg}° | RANGE: ${distM}m`, this.width - 12, 18);
      if (this.hoveredGore !== -1) {
        ctx.fillStyle = '#ffe066';
        ctx.fillText(`TARGET GORE: #${this.hoveredGore + 1} OF ${this.options.goreCount}`, this.width - 12, 32);
      }
      ctx.restore();
    }
  }

  return Wireframe3D;
}));
