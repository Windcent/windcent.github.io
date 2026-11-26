/**
 * HHB_Builder - Master Application Coordinator
 * Binds 2D Profile Editor, 3D Wireframe Renderer, Segment Cutout Planner,
 * and Aerostatic Flight Computer into an integrated retro terminal suite.
 */

(function () {
  'use strict';

  // Application State
  const state = {
    currentPresetKey: 'ADIM_SPHERICAL',
    unit: 'metric', // 'metric' or 'imperial'
    goreCount: 10,
    panelCount: 1,
    maxFabricWidth: 1.50, // meters (standard 60" bolt)
    maxPanelHeight: 10.00, // meters (default 10m max panel length)
    seamAllowance: 0.020, // 20mm
    enableMaxSizeConstraint: true, // toggle to enable/disable max panel size
    soundEnabled: true,
    scanlinesEnabled: false,
    currentTab: 'quad', // 'quad', 'profile', '3d', 'cutout', 'flight'
    solver: null,
    editor2D: null,
    viewer3D: null,
    cutterUI: null,
    flightUI: null
  };

  function init() {
    initAudio();
    initThemeControls();
    initModules();
    loadPreset(state.currentPresetKey, true);
    bindUIEvents();
    updateMaxPanelHeightLabel();
    updateClock();
    setInterval(updateClock, 1000);

    // Initial sizing to meet target net lift (2.50 lbs) with 2x1 lb bottles
    if (state.flightUI) {
      state.flightUI.applyInitialSizing();
    }

    // Initial recalculate
    recomputeAll();

    // Trigger responsive fit once CSS layout is completely evaluated
    setTimeout(() => {
      recomputeAll();
      if (state.editor2D) state.editor2D.fitToScreen();
      if (state.viewer3D) state.viewer3D._handleResize();
      if (state.cutterUI) state.cutterUI.resetView();
    }, 60);

    window.addEventListener('resize', () => {
      if (state.editor2D) state.editor2D.fitToScreen();
      if (state.viewer3D) state.viewer3D._handleResize();
      if (state.cutterUI) state.cutterUI.resetView();
    });
  }

  function initAudio() {
    if (window.TerminalAudio) {
      const audioBtn = document.getElementById('btnAudioToggle');
      if (audioBtn) {
        audioBtn.addEventListener('click', () => {
          state.soundEnabled = window.TerminalAudio.toggle();
          audioBtn.textContent = state.soundEnabled ? '[AUDIO: ON]' : '[AUDIO: OFF]';
          audioBtn.classList.toggle('active', state.soundEnabled);
          if (state.soundEnabled) window.TerminalAudio.playClick();
        });
      }
    }
  }

  function initThemeControls() {
    // Scanlines toggle
    const scanlineBtn = document.getElementById('btnScanlineToggle');
    const scanlineOverlay = document.getElementById('scanlineOverlay');

    if (scanlineBtn && scanlineOverlay) {
      scanlineOverlay.style.display = state.scanlinesEnabled ? 'block' : 'none';
      scanlineBtn.textContent = state.scanlinesEnabled ? '[SCANLINES: ON]' : '[SCANLINES: OFF]';
      scanlineBtn.classList.toggle('active', state.scanlinesEnabled);
      scanlineBtn.addEventListener('click', () => {
        state.scanlinesEnabled = !state.scanlinesEnabled;
        scanlineOverlay.style.display = state.scanlinesEnabled ? 'block' : 'none';
        scanlineBtn.textContent = state.scanlinesEnabled ? '[SCANLINES: ON]' : '[SCANLINES: OFF]';
        scanlineBtn.classList.toggle('active', state.scanlinesEnabled);
        if (window.TerminalAudio) window.TerminalAudio.playSwitch();
      });
    }

    // Units toggle
    const unitBtn = document.getElementById('btnUnitToggle');
    if (unitBtn) {
      unitBtn.addEventListener('click', () => {
        state.unit = state.unit === 'metric' ? 'imperial' : 'metric';
        unitBtn.textContent = state.unit === 'metric' ? '[UNITS: METRIC]' : '[UNITS: IMPERIAL]';

        if (state.editor2D) state.editor2D.options.unit = state.unit;
        if (state.cutterUI) state.cutterUI.options.unit = state.unit;
        if (state.flightUI) state.flightUI.setUnit(state.unit);

        updateMaxPanelHeightLabel();
        updateCurrentPanelLengthLabel();

        recomputeAll();
        if (window.TerminalAudio) window.TerminalAudio.playSwitch();
      });
    }
  }

  function initModules() {
    // 1. Initialize 2D Profile Editor
    const canvas2D = document.getElementById('canvasProfile2D');
    if (canvas2D) {
      state.editor2D = new window.ProfileEditor(canvas2D, {
        mirror: true,
        snapToGrid: true,
        unit: state.unit,
        onChange: (points) => {
          onProfilePointsChanged(points);
        }
      });
    }

    // 2. Initialize 3D Wireframe Visualizer
    const canvas3D = document.getElementById('canvasWireframe3D');
    if (canvas3D) {
      state.viewer3D = new window.Wireframe3D(canvas3D, {
        autoRotate: true,
        goreCount: state.goreCount,
        showBasket: true,
        showCables: true,
        showAxes: true,
        onGoreSelect: (goreIdx) => {
          // Synchronize gore selection
          const goreStatus = document.getElementById('statusActiveGore');
          if (goreStatus) {
            goreStatus.textContent = `GORE #${goreIdx + 1}/${state.goreCount}`;
          }
        }
      });
    }

    // 3. Initialize Segment Cutout Planner
    const canvasCutout = document.getElementById('canvasCutout');
    if (canvasCutout) {
      state.cutterUI = new window.CutoutPlanner(canvasCutout, {
        goreCount: state.goreCount,
        panelCount: state.panelCount,
        maxFabricWidth: state.maxFabricWidth,
        maxPanelHeight: state.maxPanelHeight,
        seamAllowance: state.seamAllowance,
        enableMaxSizeConstraint: state.enableMaxSizeConstraint,
        unit: state.unit,
        viewMode: 'panel',
        onChange: (cutState) => {
          updateCutoutDOM(cutState);
        }
      });
    }

    // 4. Initialize Flight Computer
    const flightContainer = document.getElementById('flightComputerContainer');
    if (flightContainer) {
      state.flightUI = new window.FlightUI(flightContainer, {
        unit: state.unit,
        onChange: (perf) => {
          updateHeaderTelemetry(perf);
        },
        onScaleEnvelope: (scaleFactor, playSound = false) => {
          scaleCurrentEnvelope(scaleFactor, playSound);
        }
      });
    }
  }

  function loadPreset(presetKey, resetView = false) {
    const preset = window.BalloonMath.PRESETS[presetKey];
    if (!preset) return;

    state.currentPresetKey = presetKey;
    state.goreCount = preset.recommendedGores || state.goreCount;
    state.panelCount = preset.recommendedPanels !== undefined ? preset.recommendedPanels : 1;

    // Update select inputs
    const selectEl = document.getElementById('selectPreset');
    if (selectEl) selectEl.value = presetKey;

    const inputGores = document.getElementById('inputGoreCount');
    if (inputGores) inputGores.value = state.goreCount;
    const lblGores = document.getElementById('lblGoreCount');
    if (lblGores) lblGores.textContent = state.goreCount;

    const inputPanels = document.getElementById('inputPanelCount');
    if (inputPanels) inputPanels.value = state.panelCount;
    const lblPanels = document.getElementById('lblPanelCount');
    if (lblPanels) lblPanels.textContent = state.panelCount;

    // Scale adimensional points (normalized 0 to 1) by default height
    const H = preset.defaultHeight || 3.4;
    const physicalPoints = preset.points.map(p => ({
      z: Number((p.z * H).toFixed(3)),
      r: Number((p.r * H).toFixed(3))
    }));

    // Load points into 2D editor
    if (state.editor2D) {
      state.editor2D.setPoints(physicalPoints, resetView);
    }

    onProfilePointsChanged(physicalPoints);
    syncPanelCountToMaxLength(false);

    // Update preset description HUD
    const descEl = document.getElementById('presetDescription');
    if (descEl) descEl.textContent = `// ${preset.description}`;
  }

  function scaleCurrentEnvelope(scaleFactor, playSound = false) {
    if (!state.editor2D || !state.editor2D.points.length || scaleFactor <= 0) return;
    const newPoints = state.editor2D.points.map(p => ({
      z: Number((p.z * scaleFactor).toFixed(3)),
      r: Number((p.r * scaleFactor).toFixed(3))
    }));
    state.editor2D.setPoints(newPoints, true);
    onProfilePointsChanged(newPoints);
    if (state.viewer3D) state.viewer3D._rebuildGeometry();
    if (playSound && window.TerminalAudio) window.TerminalAudio.playPing();
  }

  function onProfilePointsChanged(points) {
    try {
      state.solver = new window.BalloonMath.EnvelopeSolver(points);

      // Compute panel station heights Z for 2D profile and 3D rings
      const S = state.solver.totalArcLength;
      const P = state.panelCount;
      const panelStationsZ = [];

      for (let i = 0; i <= P; i++) {
        const sArc = (i / P) * S;
        const z = state.solver.getZFromArcLength(sArc);
        const r = state.solver.getRadiusAtArc(sArc);
        panelStationsZ.push({ index: i, s: sArc, z, r });
      }

      // Update 2D editor with station lines
      if (state.editor2D) {
        state.editor2D.setPanelStations(panelStationsZ);
      }

      // Update 3D wireframe
      if (state.viewer3D) {
        state.viewer3D.setSolver(state.solver, state.goreCount, panelStationsZ);
      }

      // Update Cutout Planner
      if (state.cutterUI) {
        state.cutterUI.update(state.solver, {
          goreCount: state.goreCount,
          panelCount: state.panelCount,
          maxFabricWidth: state.maxFabricWidth,
          maxPanelHeight: state.maxPanelHeight,
          seamAllowance: state.seamAllowance,
          enableMaxSizeConstraint: state.enableMaxSizeConstraint,
          unit: state.unit
        });
      }

      updateCurrentPanelLengthLabel();

      // Update Flight Computer
      if (state.flightUI) {
        state.flightUI.setEnvelopeGeometry(
          state.solver.totalVolume,
          state.solver.totalSurfaceArea,
          state.solver.height,
          state.solver.maxRadius * 2
        );
      }
    } catch (err) {
      console.error('Error during profile recompute:', err);
    }
  }

  function recomputeAll() {
    if (state.editor2D && state.editor2D.points.length >= 2) {
      onProfilePointsChanged(state.editor2D.points);
    }
  }

  function toggleMaxSizeConstraint() {
    state.enableMaxSizeConstraint = !state.enableMaxSizeConstraint;
    updateConstraintUI();
    recomputeAll();
    if (window.TerminalAudio) window.TerminalAudio.playSwitch();
  }

  function setCutoutViewMode(mode) {
    if (!state.cutterUI) return;
    state.cutterUI.setViewMode(mode);
    const btns = {
      'panel': document.getElementById('btnViewPanel'),
      'all-panels': document.getElementById('btnViewAllPanels'),
      'gore': document.getElementById('btnViewGore'),
      'all-gores': document.getElementById('btnViewAllGores'),
      'nesting': document.getElementById('btnViewNesting')
    };
    Object.keys(btns).forEach(k => {
      if (btns[k]) btns[k].classList.toggle('active', k === mode);
    });
  }

  function updateConstraintUI() {
    const on = state.enableMaxSizeConstraint;
    const btn1 = document.getElementById('btnToggleConstraint');
    const btn2 = document.getElementById('btnToggleConstraintSide');
    const lbl = document.getElementById('lblConstraintState');

    if (btn1) {
      btn1.textContent = on ? '[MAX SIZE: ON]' : '[MAX SIZE: OFF]';
      btn1.classList.toggle('active', on);
    }
    if (btn2) {
      btn2.textContent = on ? '[MAX SIZE LIMIT: ENABLED]' : '[MAX SIZE LIMIT: DISABLED]';
      btn2.classList.toggle('active', on);
    }
    if (lbl) {
      lbl.textContent = on ? 'ENABLED' : 'DISABLED';
      lbl.style.color = on ? 'var(--amber-bright)' : 'var(--amber-dim)';
    }
  }

  function updateCutoutDOM(cutState) {
    if (!cutState) return;

    // Populate panel selector buttons
    const panelListEl = document.getElementById('panelSelectorList');
    if (panelListEl && cutState.panels) {
      panelListEl.innerHTML = '';
      for (const p of cutState.panels) {
        const btn = document.createElement('button');
        const isViolated = cutState.enableMaxSizeConstraint && (p.exceedsWidth || p.exceedsHeight);
        btn.className = `btn-terminal btn-panel-tag ${p.index === state.cutterUI.options.selectedPanelIndex ? 'active' : ''} ${isViolated ? 'danger' : ''}`;
        btn.textContent = `P${String(p.index).padStart(2, '0')}${isViolated ? ' ⚠' : ''}`;
        btn.title = `${p.name}: Max Cut Width ${(p.cutWidthMax).toFixed(2)}m, Cut Height ${(p.cutHeight).toFixed(2)}m`;
        btn.addEventListener('click', () => {
          state.cutterUI.selectPanel(p.index);
          updatePanelSelectorActive(p.index);
          if (window.TerminalAudio) window.TerminalAudio.playClick();
        });
        panelListEl.appendChild(btn);
      }
    }

    // Constraint Alert Display (only if constraints are enabled)
    const alertBox = document.getElementById('cutoutConstraintAlert');
    if (alertBox) {
      if (cutState.enableMaxSizeConstraint && cutState.hasViolations) {
        alertBox.style.display = 'block';

        const widthViols = cutState.violations.filter(v => v.exceedsWidth);
        const heightViols = cutState.violations.filter(v => v.exceedsHeight);

        let msgLines = [];
        let buttonsHtml = '';

        if (widthViols.length > 0) {
          const violW = widthViols[0];
          msgLines.push(`<b>BOLT WIDTH:</b> ${widthViols.length} panel(s) exceed ${state.maxFabricWidth.toFixed(2)}m bolt limit (Panel #${violW.panelIndex} cut width is ${violW.cutWidthMax.toFixed(3)}m, +${(violW.widthExcess * 100).toFixed(1)} cm over).`);
          buttonsHtml += `<button class="btn-terminal btn-alert-fix" id="btnAutoFixGoresAlert">AUTO-FIT GORES</button>`;
        }

        if (heightViols.length > 0) {
          const violH = heightViols[0];
          msgLines.push(`<b>PANEL LENGTH:</b> ${heightViols.length} panel(s) exceed ${state.maxPanelHeight.toFixed(2)}m table limit (Panel #${violH.panelIndex} cut length is ${violH.cutHeight.toFixed(3)}m, +${(violH.heightExcess * 100).toFixed(1)} cm over).`);
          buttonsHtml += `<button class="btn-terminal btn-alert-fix" id="btnAutoFixPanelsAlert">AUTO-FIT PANELS</button>`;
        }

        alertBox.innerHTML = `
          <div class="alert-banner">
            <span class="alert-icon">⚠</span>
            <div class="alert-text">
              <b>CONSTRAINT VIOLATION:</b>
              <br><span class="alert-detail">${msgLines.join('<br>')}</span>
            </div>
            <div class="alert-actions" style="display: flex; gap: 6px; flex-wrap: wrap;">
              ${buttonsHtml}
            </div>
          </div>
        `;
        const fixGoresBtn = document.getElementById('btnAutoFixGoresAlert');
        if (fixGoresBtn) {
          fixGoresBtn.addEventListener('click', autoFitGoreCount);
        }
        const fixPanelsBtn = document.getElementById('btnAutoFixPanelsAlert');
        if (fixPanelsBtn) {
          fixPanelsBtn.addEventListener('click', autoFitPanelCount);
        }
      } else {
        alertBox.style.display = 'none';
      }
    }

    // Update panel spec telemetry
    const curr = cutState.currentPanel;
    if (curr) {
      setElText('cutoutCurPanelName', curr.name);
      setElText('cutoutTopW', `${curr.cutWidthTop.toFixed(3)} m (${(curr.wTop).toFixed(3)}m seam)`);
      setElText('cutoutBotW', `${curr.cutWidthBottom.toFixed(3)} m (${(curr.wBottom).toFixed(3)}m seam)`);
      setElText('cutoutMaxW', `${curr.cutWidthMax.toFixed(3)} m`);
      setElText('cutoutHeight', `${curr.cutHeight.toFixed(3)} m`);
      setElText('cutoutDiag', `${curr.diagonal.toFixed(3)} m`);
      setElText('cutoutArea', `${curr.fabricArea.toFixed(2)} m²`);
    }

    // Update Fabric Yardage Summary
    const sum = cutState.fabricSummary;
    if (sum) {
      setElText('sumTotalPanels', `${sum.totalPanelsToCut} panels`);
      setElText('sumFabricArea', `${Math.round(sum.totalEnvelopeFabricArea)} m² (${Math.round(sum.totalEnvelopeFabricArea * 1.196)} yd²)`);
      setElText('sumBoltLength', `~${Math.round(sum.estimatedBoltLengthMeters)} linear meters (~${Math.round(sum.estimatedBoltLengthYards)} yds)`);
      setElText('sumMaxCutW', `${sum.maxGoreCutWidth.toFixed(2)} m`);
    }
  }

  function updatePanelSelectorActive(index) {
    const list = document.getElementById('panelSelectorList');
    if (!list) return;
    const btns = list.querySelectorAll('.btn-panel-tag');
    btns.forEach((btn, i) => {
      btn.classList.toggle('active', i + 1 === index);
    });
  }

  function autoFitGoreCount() {
    if (!state.cutterUI) return;
    const recommended = Math.max(4, state.cutterUI.getRecommendedGoresToFit());
    state.goreCount = recommended;

    const inputGores = document.getElementById('inputGoreCount');
    if (inputGores) inputGores.value = recommended;
    const lblGores = document.getElementById('lblGoreCount');
    if (lblGores) lblGores.textContent = recommended;

    recomputeAll();
    if (window.TerminalAudio) window.TerminalAudio.playPing();
  }

  function autoFitPanelCount() {
    syncPanelCountToMaxLength(true);
    recomputeAll();
  }

  function syncPanelCountToMaxLength(playSound = false) {
    if (!state.solver) return;
    const S = state.solver.totalArcLength;
    const seam = state.seamAllowance;
    const maxAllowed = state.maxPanelHeight - 2 * seam;
    let req = 1;
    if (maxAllowed > 0) {
      req = Math.max(1, Math.ceil(S / maxAllowed));
    }
    state.panelCount = Math.min(32, req);

    const inputPanels = document.getElementById('inputPanelCount');
    if (inputPanels) inputPanels.value = state.panelCount;
    const lblPanels = document.getElementById('lblPanelCount');
    if (lblPanels) lblPanels.textContent = state.panelCount;

    updateCurrentPanelLengthLabel();
    if (playSound && window.TerminalAudio) window.TerminalAudio.playPing();
  }

  function updateMaxPanelHeightLabel() {
    const isImp = state.unit === 'imperial';
    const m = state.maxPanelHeight;
    const inches = m * 39.3701;
    const feet = m * 3.28084;
    const impStr = m >= 2.0 ? `${feet.toFixed(1)} ft (${Math.round(inches)}")` : `${Math.round(inches)}"`;
    const txt = isImp
      ? `${impStr} (${m.toFixed(2)} m)`
      : `${m.toFixed(2)} m (${m >= 2.0 ? `${feet.toFixed(1)} ft` : `${Math.round(inches)}"`})`;
    setElText('lblMaxPanelHeight', txt);
  }

  function updateCurrentPanelLengthLabel() {
    const lbl = document.getElementById('lblCurrentPanelLength');
    if (!lbl || !state.solver || !state.panelCount) return;
    const avgM = state.solver.totalArcLength / state.panelCount;
    const avgIn = avgM * 39.3701;
    const avgFt = avgM * 3.28084;
    const isImp = state.unit === 'imperial';
    const impStr = avgM >= 2.0 ? `~${avgFt.toFixed(1)} ft / seg` : `~${avgIn.toFixed(1)}" / seg`;
    lbl.textContent = isImp
      ? impStr
      : `~${avgM.toFixed(2)}m (${avgM >= 2.0 ? `${avgFt.toFixed(1)} ft` : `${Math.round(avgIn)}"`}) / seg`;
  }

  function updateHeaderTelemetry(perf) {
    if (!perf) return;
    const isImp = state.unit === 'imperial';

    // 1. Top Header Ticker HUD
    setElText('headerTelemVol', isImp ? `${Math.round(perf.volumeCuFt).toLocaleString()} ft³` : `${perf.volumeM3.toFixed(1)} m³`);
    setElText('headerTelemArea', isImp ? `${Math.round(perf.surfaceAreaSqFt).toLocaleString()} ft²` : `${perf.surfaceAreaM2.toFixed(1)} m²`);
    setElText('headerTelemLift', `${perf.grossLiftLbs.toFixed(2)} lbs`);
    setElText('headerTelemPayloadLbs', `${perf.netLiftLbs.toFixed(2)} lbs`);
    setElText('headerTelemFAI', perf.volumeM3 < 50 ? 'RC MODEL' : perf.fai.code);

    // 2. Aeronautical Telemetry Summary Top Banner
    // Volume
    setElText('topBannerVol', isImp ? `${Math.round(perf.volumeCuFt).toLocaleString()} ft³` : `${perf.volumeM3.toFixed(2)} m³`);
    setElText('topBannerVolSub', isImp ? `${perf.volumeM3.toFixed(2)} m³` : `${Math.round(perf.volumeCuFt).toLocaleString()} cu ft`);

    // Surface Area
    setElText('topBannerArea', isImp ? `${Math.round(perf.surfaceAreaSqFt).toLocaleString()} sq ft` : `${perf.surfaceAreaM2.toFixed(2)} m²`);
    setElText('topBannerAreaSub', isImp ? `${perf.surfaceAreaM2.toFixed(2)} m²` : `${Math.round(perf.surfaceAreaSqFt).toLocaleString()} sq ft`);

    // Gross Aerostatic Lift
    setElText('topBannerGrossLift', `${perf.grossLiftLbs.toFixed(2)} LBS`);
    setElText('topBannerGrossLiftSub', `${perf.grossLiftKg.toFixed(2)} kg (${Math.round(perf.grossLiftOz)} oz)`);

    // Net Lift (Usable Payload Capacity after Envelope + Fuel + Container)
    const netEl = document.getElementById('topBannerNetLift');
    if (netEl) {
      if (perf.netLiftLbs <= 0) {
        netEl.textContent = '0.00 LBS';
        netEl.className = 'banner-stat-val text-danger';
      } else {
        netEl.textContent = `${perf.netLiftLbs.toFixed(2)} LBS`;
        netEl.className = 'banner-stat-val text-flare';
      }
    }
    setElText('topBannerNetLiftSub', `${(perf.netLiftOz).toFixed(1)} oz / ${perf.netLiftKg.toFixed(2)} kg`);

    const fuelRigLbs = perf.fuelRigMassLbs !== undefined ? perf.fuelRigMassLbs : 0;
    setElText('topBannerDeduction', `// Net = Gross (${perf.grossLiftLbs.toFixed(1)} lb) - Env (${perf.envelopeMassLbs.toFixed(1)} lb) - Fuel+Tank (${fuelRigLbs.toFixed(1)} lb)`);
  }

  function bindUIEvents() {
    // Preset dropdown
    const selectPreset = document.getElementById('selectPreset');
    if (selectPreset) {
      selectPreset.addEventListener('change', (e) => {
        loadPreset(e.target.value, true);
        if (window.TerminalAudio) window.TerminalAudio.playSwitch();
      });
    }

    // Gore count slider (minimum 4 gores)
    const inputGoreCount = document.getElementById('inputGoreCount');
    if (inputGoreCount) {
      inputGoreCount.addEventListener('input', (e) => {
        state.goreCount = Math.max(4, Number(e.target.value));
        setElText('lblGoreCount', state.goreCount);
        recomputeAll();
      });
    }

    // Toggle Max Size Constraint
    bindClick('btnToggleConstraint', toggleMaxSizeConstraint);
    bindClick('btnToggleConstraintSide', toggleMaxSizeConstraint);

    // Panel count slider (minimum 1 panel per gore)
    const inputPanelCount = document.getElementById('inputPanelCount');
    if (inputPanelCount) {
      inputPanelCount.addEventListener('input', (e) => {
        state.panelCount = Math.max(1, Number(e.target.value));
        setElText('lblPanelCount', state.panelCount);
        updateCurrentPanelLengthLabel();
        recomputeAll();
      });
    }

    // Auto-Fit Panels button
    bindClick('btnAutoFitPanels', autoFitPanelCount);

    // Max Panel Height slider - automatically updates panels per gore
    const inputMaxPanelHeight = document.getElementById('inputMaxPanelHeight');
    if (inputMaxPanelHeight) {
      inputMaxPanelHeight.addEventListener('input', (e) => {
        state.maxPanelHeight = Number(e.target.value);
        updateMaxPanelHeightLabel();
        syncPanelCountToMaxLength(false);
        recomputeAll();
      });
    }

    // Max Fabric Width slider
    const inputFabricWidth = document.getElementById('inputFabricWidth');
    if (inputFabricWidth) {
      inputFabricWidth.addEventListener('input', (e) => {
        state.maxFabricWidth = Number(e.target.value);
        setElText('lblFabricWidth', `${state.maxFabricWidth.toFixed(2)} m (${(state.maxFabricWidth * 39.37).toFixed(0)}")`);
        recomputeAll();
      });
    }

    // Seam Allowance slider
    const inputSeamAllowance = document.getElementById('inputSeamAllowance');
    if (inputSeamAllowance) {
      inputSeamAllowance.addEventListener('input', (e) => {
        state.seamAllowance = Number(e.target.value) / 1000;
        setElText('lblSeamAllowance', `${Number(e.target.value)} mm`);
        recomputeAll();
      });
    }

    // Cutout View Modes
    bindClick('btnViewPanel', () => setCutoutViewMode('panel'));
    bindClick('btnViewAllPanels', () => setCutoutViewMode('all-panels'));
    bindClick('btnViewGore', () => setCutoutViewMode('gore'));
    bindClick('btnViewAllGores', () => setCutoutViewMode('all-gores'));
    bindClick('btnViewNesting', () => setCutoutViewMode('nesting'));

    // SVG and CSV Downloads
    bindClick('btnDownloadSVG', () => {
      if (state.cutterUI) state.cutterUI.downloadPanelSVG();
      if (window.TerminalAudio) window.TerminalAudio.playPing();
    });

    bindClick('btnDownloadCSV', () => {
      if (state.cutterUI) state.cutterUI.downloadLoftingCSV();
      if (window.TerminalAudio) window.TerminalAudio.playPing();
    });

    // 2D Profile Controls
    bindClick('btnResetProfileView', () => state.editor2D && state.editor2D.fitToScreen());
    bindClick('btnToggleMirror', () => {
      if (state.editor2D) {
        state.editor2D.options.mirror = !state.editor2D.options.mirror;
        state.editor2D.fitToScreen();
      }
    });

    // 3D View Presets
    bindClick('btnCamPersp', () => state.viewer3D && state.viewer3D.setCameraPreset('PERSPECTIVE'));
    bindClick('btnCamFront', () => state.viewer3D && state.viewer3D.setCameraPreset('FRONT'));
    bindClick('btnCamSide', () => state.viewer3D && state.viewer3D.setCameraPreset('SIDE'));
    bindClick('btnCamTop', () => state.viewer3D && state.viewer3D.setCameraPreset('TOP'));
    bindClick('btnCamBasket', () => state.viewer3D && state.viewer3D.setCameraPreset('BASKET'));
    bindClick('btnToggleAutoRotate', () => {
      if (state.viewer3D) {
        state.viewer3D.options.autoRotate = !state.viewer3D.options.autoRotate;
        const btn = document.getElementById('btnToggleAutoRotate');
        if (btn) btn.classList.toggle('active', state.viewer3D.options.autoRotate);
      }
    });

    // Layout Tab Selector (Quad vs Focused)
    const tabBtns = document.querySelectorAll('.tab-nav-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetTab = btn.getAttribute('data-tab');
        switchWorkspaceTab(targetTab);
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (window.TerminalAudio) window.TerminalAudio.playClick();
      });
    });

    // Lofting Table Modal drawer
    bindClick('btnShowLoftingModal', showLoftingTableModal);
    bindClick('btnCloseLoftingModal', hideLoftingTableModal);

    // Design Save / Export JSON
    bindClick('btnExportJSON', exportDesignJSON);
    const fileImport = document.getElementById('fileImportJSON');
    if (fileImport) {
      fileImport.addEventListener('change', importDesignJSON);
      bindClick('btnImportJSON', () => fileImport.click());
    }
  }

  function switchWorkspaceTab(tabId) {
    state.currentTab = tabId;
    const grid = document.getElementById('mainWorkspaceGrid');
    if (!grid) return;

    grid.className = `workspace-grid layout-${tabId}`;

    // Trigger canvas resize
    setTimeout(() => {
      if (state.editor2D) state.editor2D.fitToScreen();
      if (state.viewer3D) state.viewer3D._handleResize();
      if (state.cutterUI) state.cutterUI.resetView();
    }, 50);
  }

  function showLoftingTableModal() {
    if (!state.cutterUI || !state.cutterUI.cutter) return;
    const modal = document.getElementById('loftingModal');
    const tableBody = document.getElementById('loftingTableBody');
    if (!modal || !tableBody) return;

    const data = state.cutterUI.cutter.getLoftingTable(state.cutterUI.options.selectedPanelIndex, 20);
    let rowsHtml = '';

    for (const r of data) {
      rowsHtml += `
        <tr class="${r.isNotch ? 'row-notch' : ''}">
          <td>${r.step}</td>
          <td>${r.percent}%</td>
          <td>${(r.sRelativeM).toFixed(3)} m</td>
          <td>${(r.sCutM).toFixed(3)} m</td>
          <td>${(r.halfWidthCutM).toFixed(3)} m</td>
          <td>${(r.fullWidthCutM).toFixed(3)} m</td>
          <td>${r.isNotch ? '<b class="notch-badge">ALIGN NOTCH</b>' : '—'}</td>
        </tr>
      `;
    }

    tableBody.innerHTML = rowsHtml;
    setElText('modalLoftingTitle', `LOFTING DATA: ${state.cutterUI.options.selectedPanelIndex} // ${data.length} STATIONS`);
    modal.style.display = 'flex';
  }

  function hideLoftingTableModal() {
    const modal = document.getElementById('loftingModal');
    if (modal) modal.style.display = 'none';
  }

  function exportDesignJSON() {
    if (!state.editor2D || !state.solver) return;
    const design = {
      format: 'HHB_ENVELOPE_SPEC',
      version: '2.4',
      date: new Date().toISOString(),
      presetKey: state.currentPresetKey,
      goreCount: state.goreCount,
      panelCount: state.panelCount,
      maxFabricWidth: state.maxFabricWidth,
      seamAllowance: state.seamAllowance,
      enableMaxSizeConstraint: state.enableMaxSizeConstraint,
      controlPoints: state.editor2D.points,
      volumeM3: state.solver.totalVolume,
      surfaceAreaM2: state.solver.totalSurfaceArea
    };

    const blob = new Blob([JSON.stringify(design, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `HHB_Balloon_Design_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importDesignJSON(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target.result);
        if (json.controlPoints && Array.isArray(json.controlPoints)) {
          state.goreCount = json.goreCount || state.goreCount;
          state.panelCount = json.panelCount || state.panelCount;
          state.maxFabricWidth = json.maxFabricWidth || state.maxFabricWidth;
          state.seamAllowance = json.seamAllowance || state.seamAllowance;
          if (json.enableMaxSizeConstraint !== undefined) {
            state.enableMaxSizeConstraint = json.enableMaxSizeConstraint;
            updateConstraintUI();
          }

          state.editor2D.setPoints(json.controlPoints, true);
          onProfilePointsChanged(json.controlPoints);
          alert(`Successfully imported design with ${json.controlPoints.length} points!`);
        }
      } catch (err) {
        alert('Invalid JSON file format.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function updateClock() {
    const clockEl = document.getElementById('terminalClock');
    if (!clockEl) return;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    clockEl.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} UTC`;
  }

  function bindClick(id, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', handler);
  }

  function setElText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // Launch when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
