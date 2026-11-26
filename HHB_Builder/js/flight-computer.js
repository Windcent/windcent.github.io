/**
 * HHB_Builder - Aerostatic Flight Computer & Fuel Thermodynamics Engine
 * Computes atmospheric barometrics, gross lift, envelope mass,
 * remaining lift strictly after envelope weight in pounds (lbs),
 * and thermodynamic propane fuel consumption (equilibrium burn rate + cold inflation fuel).
 * Features Design Requirement Sizing Engine: auto-scales any shape to meet a target lift specification.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./balloon-math'));
  } else {
    root.FlightUI = factory(root.BalloonMath || window.BalloonMath);
  }
}(typeof self !== 'undefined' ? self : this, function (BalloonMath) {
  'use strict';

  class FlightUI {
    constructor(containerElement, options = {}) {
      this.container = containerElement;
      this.options = Object.assign({
        unit: 'metric',
        onChange: null,
        onScaleEnvelope: null
      }, options);

      // Default flight parameters for model hot air balloon
      this.params = {
        altitudeM: 0,
        ambientTempC: 25,
        envelopeTempC: 80,
        fabricWeightGsm: 55,
        tapeFactor: 0.20,
        canisterFuelOz: 32.0, // 2x 1.0 lb (32.0 oz) DOT camping propane bottles default
        containerTareOz: 30.0, // Empty cylinder tare weight (2x 15.0 oz = 30.0 oz)
        targetRemainingLiftLbs: 2.50, // Builder design requirement target net lift in lbs
        autoSyncLift: true, // Live auto-scale toggle
        partialLoadingPct: 100 // Operational payload loading % (flight time simulation only)
      };

      this.currentVolumeM3 = 0;
      this.currentAreaM2 = 0;
      this.currentHeightM = 3.4;
      this.currentMaxDiamM = 2.7;
      this.perf = null;
      this.sizing = null;
      this._isScaling = false;

      this._renderHTML();
      this._bindInputs();
    }

    setEnvelopeGeometry(volumeM3, surfaceAreaM2, heightM = 0, maxDiamM = 0) {
      this.currentVolumeM3 = volumeM3;
      this.currentAreaM2 = surfaceAreaM2;
      if (heightM > 0) this.currentHeightM = heightM;
      if (maxDiamM > 0) this.currentMaxDiamM = maxDiamM;
      this.recalculate();
    }

    setUnit(unit) {
      this.options.unit = unit;
      this.recalculate();
    }

    _renderHTML() {
      this.container.innerHTML = `
        <div class="terminal-panel flight-computer-panel">
          <div class="panel-header">
            <span class="header-glitch">[FLIGHT COMPUTER // BUOYANCY & FUEL THERMODYNAMICS]</span>
            <span class="fai-badge" id="faiClassBadge">RC MODEL</span>
          </div>

          <!-- Quick Telemetry Readouts -->
          <div class="telemetry-grid">
            <div class="telem-card">
              <div class="telem-label">ENVELOPE VOLUME</div>
              <div class="telem-val" id="valVolume">0.0 m³</div>
              <div class="telem-sub" id="valVolumeCuFt">0 cu ft</div>
            </div>
            <div class="telem-card">
              <div class="telem-label">ENVELOPE WEIGHT</div>
              <div class="telem-val" id="valEnvMassLbs">0.00 lbs</div>
              <div class="telem-sub" id="valEnvMassSub">0.0 oz / 0.0 kg</div>
            </div>
            <div class="telem-card">
              <div class="telem-label">FUEL & TANK WEIGHT</div>
              <div class="telem-val" id="valFuelRigLbs">0.00 lbs</div>
              <div class="telem-sub" id="valFuelRigSub">0.0 oz / 0.0 kg</div>
            </div>
            <div class="telem-card">
              <div class="telem-label">GROSS LIFT</div>
              <div class="telem-val" id="valGrossLiftLbs">0.00 lbs</div>
              <div class="telem-sub" id="valGrossLiftKg">0.00 kg</div>
            </div>
            <div class="telem-card highlight">
              <div class="telem-label">NET LIFT (PAYLOAD)</div>
              <div class="telem-val text-flare" id="valNetPayloadLbs">0.00 lbs</div>
              <div class="telem-sub" id="valNetPayloadSub">0.0 oz / 0 g</div>
            </div>
          </div>

          <!-- Prominent Net Lift Card (Gross - Envelope - Fuel - Tank) -->
          <div class="payload-status-card">
            <div class="payload-main-display">
              <span class="payload-label">NET LIFT (USABLE PAYLOAD CAPACITY):</span>
              <span class="payload-value-huge text-flare" id="lblHugePayloadLbs">0.00 LBS</span>
              <span class="payload-sub-value" id="lblHugePayloadSub">(0.0 oz / 0 g / 0.00 kg)</span>
            </div>
            <div class="payload-model-badge" id="lblPayloadBadge">NET LIFT: 0% OF GROSS</div>
          </div>

          <!-- 3-Part Weight & Lift Balance Gauge -->
          <div class="gauge-container">
            <div class="gauge-header">
              <span>AEROSTATIC BALANCE:</span>
              <span id="liftMarginPct">100% GROSS LIFT</span>
            </div>
            <div class="gauge-bar-track">
              <div class="gauge-bar-fill fill-envelope" id="barEnvelope" style="width: 40%" title="Envelope Mass"></div>
              <div class="gauge-bar-fill fill-fuel" id="barFuelRig" style="width: 25%" title="Fuel & Canister Weight"></div>
              <div class="gauge-bar-fill fill-remaining" id="barPayload" style="width: 35%" title="Net Payload Lift"></div>
            </div>
            <div class="gauge-legend">
              <span class="leg-item"><span class="dot dot-env"></span> ENVELOPE: <b id="legEnvMass">0.0 lbs (0%)</b></span>
              <span class="leg-item"><span class="dot dot-fuel"></span> FUEL + TANK: <b id="legFuelRigMass">0.0 lbs (0%)</b></span>
              <span class="leg-item"><span class="dot dot-rem"></span> NET LIFT: <b id="legPayMass">0.0 lbs (0%)</b></span>
            </div>
          </div>

          <!-- DESIGN REQUIREMENT // FIX SPECIFICATION BY TARGET NET LIFT -->
          <div class="design-requirement-card">
            <div class="card-title-bar">
              <span class="req-title">[DESIGN REQUIREMENT // FIX SPECIFICATION BY TARGET NET LIFT]</span>
              <span class="req-badge" id="lblReqStatusBadge">INVERSE SIZING ACTIVE</span>
            </div>

            <div class="req-body">
              <!-- Left Column: Input Target Lift Controls -->
              <div class="req-input-col">
                <div class="req-header-row">
                  <label for="inputTargetLiftLbs">TARGET NET LIFT (AFTER ENV + FUEL + TANK):</label>
                  <span class="req-val-large text-flare" id="lblTargetLiftDisplay">2.50 LBS</span>
                </div>

                <!-- Quick Requirement Preset Buttons Strip -->
                <div class="req-preset-buttons" id="reqPresetBtnGroup">
                  <button type="button" class="btn-terminal btn-sm btn-req-preset" data-lbs="1.0">1.0 LB (MICRO)</button>
                  <button type="button" class="btn-terminal btn-sm btn-req-preset active" data-lbs="2.5">2.5 LBS (1:5 SCALE)</button>
                  <button type="button" class="btn-terminal btn-sm btn-req-preset" data-lbs="5.0">5.0 LBS (HEAVY)</button>
                  <button type="button" class="btn-terminal btn-sm btn-req-preset" data-lbs="10.0">10.0 LBS (CARGO)</button>
                  <button type="button" class="btn-terminal btn-sm btn-req-preset" data-lbs="25.0">25.0 LBS</button>
                  <button type="button" class="btn-terminal btn-sm btn-req-preset" data-lbs="500.0">500 LBS (AX-7)</button>
                </div>

                <!-- Target Lift Range Slider and Number Input Row -->
                <div class="req-slider-row">
                  <input type="range" id="inputTargetLiftLbs" min="0.2" max="50.0" step="0.1" value="2.5" />
                  <div class="req-number-wrap">
                    <input type="number" id="numTargetLiftInput" min="0.1" max="5000" step="0.1" value="2.5" class="terminal-number-input" />
                    <span class="unit-tag" id="lblTargetLiftUnit">LBS</span>
                  </div>
                </div>

                <!-- Action Button & Auto-Sync Toggle -->
                <div class="req-actions-row">
                  <button type="button" class="btn-terminal active btn-apply-lift" id="btnApplyTargetLift">
                    ⚡ AUTO-SIZE ENVELOPE TO MEET TARGET LIFT
                  </button>
                  <label class="auto-sync-label">
                    <input type="checkbox" id="chkAutoSyncLift" checked />
                    <span>AUTO-SCALE LIVE</span>
                  </label>
                </div>

                <!-- Operational Partial Payload Loading (Flight Time Simulation Only) -->
                <div class="partial-loading-container">
                  <div class="ctrl-header-flex">
                    <label for="inputPartialLoading" style="margin-bottom: 0;">
                      <span>OPERATIONAL PARTIAL LOADING:</span>
                      <span class="ctrl-val" id="lblPartialLoading">100% (2.50 lbs)</span>
                    </label>
                    <span class="badge-partial-status" id="badgePartialStatus">100% FULL LOAD</span>
                  </div>
                  <div class="partial-slider-row">
                    <input type="range" id="inputPartialLoading" min="0" max="100" step="1" value="100" />
                    <div class="temp-num-wrap" style="width: 58px;">
                      <input type="number" id="numPartialLoading" class="terminal-number-input temp-num-input" min="0" max="100" step="1" value="100" style="width: 36px;" />
                      <span class="unit-tag">%</span>
                    </div>
                  </div>
                  <div class="range-limits" style="margin-top: 2px;">
                    <span>0% (EMPTY BASKET)</span>
                    <span id="lblPartialEquilTemp" style="color: var(--amber-dim); font-size: 8.5px;">Cruise Eq: 80.0°C</span>
                    <span>100% (FULL DESIGN)</span>
                  </div>
                  <div class="endurance-heat-note">
                    // Sizing fixed at full capacity. Adjusting payload loading reruns thermal equilibrium and flight endurance.
                  </div>
                </div>
              </div>

              <!-- Right Column: Computed Required Sizing Output Readouts -->
              <div class="req-output-col">
                <div class="req-output-title">// COMPUTED SIZING FOR CURRENT SHAPE & ATMOSPHERE</div>

                <div class="req-metrics-grid">
                  <div class="req-metric-box">
                    <span class="m-label">REQUIRED HEIGHT:</span>
                    <b class="m-val text-flare" id="reqMetricHeight">3.48 m</b>
                    <span class="m-sub" id="reqMetricHeightFt">11.4 ft</span>
                  </div>
                  <div class="req-metric-box">
                    <span class="m-label">REQUIRED DIAMETER:</span>
                    <b class="m-val text-flare" id="reqMetricDiam">2.76 m</b>
                    <span class="m-sub" id="reqMetricDiamFt">9.1 ft</span>
                  </div>
                  <div class="req-metric-box">
                    <span class="m-label">REQUIRED VOLUME:</span>
                    <b class="m-val" id="reqMetricVol">9.6 m³</b>
                    <span class="m-sub" id="reqMetricVolFt">340 cu ft</span>
                  </div>
                  <div class="req-metric-box">
                    <span class="m-label">SCALE FACTOR (k):</span>
                    <b class="m-val" id="reqMetricScaleK">1.023x</b>
                    <span class="m-sub">relative to base</span>
                  </div>
                </div>

                <div class="req-summary-row">
                  <span>ENV: <b id="reqSumEnvWt">3.44 lbs</b></span>
                  <span>FUEL+TANK: <b id="reqSumFuelRigWt">1.76 lbs</b></span>
                  <span>GROSS: <b id="reqSumGrossLift">7.70 lbs</b></span>
                  <span>NET LIFT: <b class="text-flare" id="reqSumNetLift">2.50 lbs</b></span>
                </div>
              </div>
            </div>
          </div>

          <!-- Fuel Thermodynamics & Burn Rate Suite -->
          <div class="fuel-suite-grid">
            <!-- Card 1: Equilibrium Burn Rate to Keep Warm -->
            <div class="fuel-card highlight">
              <div class="fuel-card-title">
                <span>[1] FUEL CONSUMPTION RATE (KEEP WARM)</span>
                <span class="ctrl-val" id="lblDeltaTBadge">ΔT 75°C</span>
              </div>
              <div class="fuel-val-container">
                <span class="fuel-val-large text-flare" id="lblBurnRateOzMin">0.00 OZ / MIN</span>
                <span class="fuel-val-sub" id="lblBurnRateGMin">(0.0 g/min)</span>
              </div>
              <div class="fuel-detail-row">
                <span>HOURLY PROPANE BURN:</span>
                <b id="lblBurnRateLbsHr">0.00 lbs/hr (0.00 kg/hr)</b>
              </div>
              <div class="fuel-detail-row">
                <span>BURNER HEAT RELEASE:</span>
                <b id="lblBurnerKw">0.0 kW (0 BTU/hr)</b>
              </div>
              <div class="fuel-detail-row">
                <span>ENVELOPE HEAT LOSS:</span>
                <b id="lblHeatLossKw">0.0 kW (convection & rad)</b>
              </div>
              <div class="fuel-footnote">// Equilibrium heat required to sustain envelope temperature against ambient convective cooling.</div>
            </div>

            <!-- Card 2: Initial Heat-Up Fuel Needed for Cold Inflation -->
            <div class="fuel-card highlight">
              <div class="fuel-card-title">
                <span>[2] INITIAL COLD INFLATION FUEL</span>
                <span class="ctrl-val">HEAT-UP</span>
              </div>
              <div class="fuel-val-container">
                <span class="fuel-val-large text-flare" id="lblInitialFuelOz">0.00 OZ</span>
                <span class="fuel-val-sub" id="lblInitialFuelSub">(0.0 g / 0.00 lbs)</span>
              </div>
              <div class="fuel-detail-row">
                <span>COLD INTERNAL AIR MASS:</span>
                <b id="lblColdAirMass">0.0 kg air</b>
              </div>
              <div class="fuel-detail-row">
                <span>SENSIBLE ENTHALPY (AIR):</span>
                <b id="lblSensibleAirKj">0 kJ</b>
              </div>
              <div class="fuel-detail-row">
                <span>TOTAL INFLATION ENERGY:</span>
                <b id="lblTotalHeatMj">0.00 MJ (0 BTU)</b>
              </div>
              <div class="fuel-footnote">// Propane needed to heat ambient air volume and fabric mass from cold to flight equilibrium.</div>
            </div>

            <!-- Card 3: Propane Canister & Estimated Flight Endurance -->
            <div class="fuel-endurance-card">
              <div class="fuel-card-title">
                <span>[3] PROPANE CANISTER & ESTIMATED FLIGHT ENDURANCE</span>
                <span class="ctrl-val" id="lblCanisterFuelOz">32.0 oz fuel + 30.0 oz tank = 62.0 oz (3.88 lbs / 1758 g)</span>
              </div>

              <div class="canister-input-row">
                <div style="flex: 1.1;">
                  <select id="selectCanisterPreset" class="terminal-select" style="width: 100%;">
                    <option value="8.0">1x 8.0 oz (227g) Butane Bottle // 3.6 oz steel tare</option>
                    <option value="16.0">1x 1.0 lb (16 oz) DOT Bottle // 15 oz steel tare</option>
                    <option value="32.0" selected>2x 1.0 lb (32 oz) DOT Bottles // 30 oz steel tare</option>
                    <option value="48.0">3x 1.0 lb (48 oz) DOT Bottles // 45 oz steel tare</option>
                    <option value="64.0">4x 1.0 lb (64 oz) DOT Bottles // 60 oz steel tare</option>
                    <option value="80.0">5.0 lbs (80 oz / 2.3 kg) Aluminum Model Tank</option>
                    <option value="160.0">10.0 lbs (160 oz / 4.5 kg) Propane Tank</option>
                    <option value="320.0">20.0 lbs (320 oz / 9.1 kg) Standard BBQ Tank</option>
                    <option value="custom">Custom Fuel Quantity...</option>
                  </select>
                </div>
                <div style="flex: 1; display: flex; align-items: center; gap: 6px;">
                  <span class="ctrl-sub-label" style="font-size: 9px; color: var(--amber-dim);">FUEL:</span>
                  <input type="range" id="inputCanisterFuelOz" min="8.0" max="320" step="0.5" value="32.0" style="flex: 1;" />
                  <div class="temp-num-wrap">
                    <input type="number" id="numCanisterFuelOz" class="terminal-number-input temp-num-input" min="8.0" max="500" step="0.5" value="32.0" />
                    <span class="unit-tag">OZ</span>
                  </div>
                </div>
                <div style="display: flex; align-items: center; gap: 4px;">
                  <span class="ctrl-sub-label" style="font-size: 9px; color: var(--amber-dim);" title="Container / Cylinder Tare Weight">TANK TARE:</span>
                  <div class="temp-num-wrap">
                    <input type="number" id="numContainerTareOz" class="terminal-number-input temp-num-input" min="0" max="500" step="0.5" value="30.0" />
                    <span class="unit-tag">OZ</span>
                  </div>
                </div>
              </div>

              <!-- Dual Comparison: Without Initial Heating vs With Initial Heating -->
              <div class="endurance-dual-grid">
                <!-- Case A: Without Initial Heating -->
                <div class="endurance-case-card">
                  <div class="endurance-case-header">
                    <span class="case-badge-no-init">[A] WITHOUT INITIAL HEATING</span>
                    <span class="case-subtext">PRE-HEATED ENVELOPE / HOT LAUNCH</span>
                  </div>
                  <div class="endurance-metric-main">
                    <span class="endurance-label">CRUISE FLIGHT DURATION (~50% DUTY):</span>
                    <span class="endurance-val-large text-flare" id="lblEnduranceCruiseNoInit">~0.0 min</span>
                  </div>
                  <div class="endurance-detail-grid">
                    <div>
                      <span class="endurance-label">100% FULL BLAST:</span>
                      <b class="endurance-sub-val" id="lblEnduranceFullNoInit">~0.0 min</b>
                    </div>
                    <div>
                      <span class="endurance-label">USABLE FUEL:</span>
                      <b class="endurance-sub-val" id="lblFuelUsableNoInit">14.1 oz (100%)</b>
                    </div>
                  </div>
                </div>

                <!-- Case B: With Initial Heating -->
                <div class="endurance-case-card highlight-case">
                  <div class="endurance-case-header">
                    <span class="case-badge-with-init" id="badgeWithInit">[B] WITH INITIAL HEATING</span>
                    <span class="case-subtext">COLD INFLATION FROM ONBOARD BOTTLE</span>
                  </div>
                  <div class="endurance-metric-main">
                    <span class="endurance-label">CRUISE FLIGHT DURATION (~50% DUTY):</span>
                    <span class="endurance-val-large text-flare" id="lblEnduranceCruiseWithInit">~0.0 min</span>
                  </div>
                  <div class="endurance-detail-grid">
                    <div>
                      <span class="endurance-label">100% FULL BLAST:</span>
                      <b class="endurance-sub-val" id="lblEnduranceFullWithInit">~0.0 min</b>
                    </div>
                    <div>
                      <span class="endurance-label">REM FUEL:</span>
                      <b class="endurance-sub-val" id="lblFuelUsableWithInit">12.2 oz (86%)</b>
                    </div>
                  </div>
                  <div class="endurance-heat-note" id="lblEnduranceHeatNote">
                    // Consumes 1.9 oz propane (14%) for cold inflation
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Interactive Environment & Balloon Parameters -->
          <div class="controls-grid">
            <div class="ctrl-group">
              <div class="ctrl-header-flex">
                <label for="inputEnvTemp">
                  <span>ENV INTERNAL TEMP:</span>
                  <span class="ctrl-val" id="lblEnvTemp">80 °C (176 °F)</span>
                </label>
                <div class="temp-num-wrap">
                  <input type="number" id="numEnvTemp" class="terminal-number-input temp-num-input" min="60" max="125" step="1" value="80" />
                  <span class="unit-tag">°C</span>
                </div>
              </div>
              <input type="range" id="inputEnvTemp" min="60" max="125" step="1" value="80" />
              <div class="range-limits">
                <span>60°C (MIN)</span>
                <span class="text-alert" id="tempWarn">80°C (RC OPTIMAL)</span>
                <span>125°C (MAX NYLON)</span>
              </div>
            </div>

            <div class="ctrl-group">
              <div class="ctrl-header-flex">
                <label for="inputAmbTemp">
                  <span>AMBIENT AIR TEMP:</span>
                  <span class="ctrl-val" id="lblAmbTemp">25 °C</span>
                </label>
                <div class="temp-num-wrap">
                  <input type="number" id="numAmbTemp" class="terminal-number-input temp-num-input" min="-20" max="45" step="1" value="25" />
                  <span class="unit-tag">°C</span>
                </div>
              </div>
              <input type="range" id="inputAmbTemp" min="-20" max="45" step="1" value="25" />
              <div class="range-limits">
                <span>-20°C (WINTER)</span>
                <span>15°C (ISA)</span>
                <span>25°C (SUMMER)</span>
                <span>+45°C (DESERT)</span>
              </div>
            </div>

            <div class="ctrl-group">
              <label>
                <span>LAUNCH ALTITUDE ASL:</span>
                <span class="ctrl-val" id="lblAltitude">0 m</span>
              </label>
              <input type="range" id="inputAltitude" min="0" max="4000" step="50" value="0" />
              <div class="range-limits">
                <span>0 m (SEA LEVEL)</span>
                <span>2000 m</span>
                <span>4000 m (13k ft)</span>
              </div>
            </div>

            <div class="ctrl-group">
              <label>
                <span>FABRIC DENSITY:</span>
                <span class="ctrl-val" id="lblFabricGsm">55 g/m²</span>
              </label>
              <input type="range" id="inputFabricGsm" min="25" max="75" step="1" value="55" />
              <div class="range-limits">
                <span>25 g/m² (ULTRALIGHT)</span>
                <span>40 g/m² (LIGHT)</span>
                <span>55 g/m² (STD)</span>
              </div>
            </div>
          </div>

          <!-- Telemetry Footer / Barometric Info -->
          <div class="baro-info-footer">
            <span>BARO PRESSURE: <b id="lblBaroP">1013.2 hPa</b></span>
            <span>AMB DENSITY: <b id="lblAmbRho">1.184 kg/m³</b></span>
            <span>HOT DENSITY: <b id="lblHotRho">0.946 kg/m³</b></span>
            <span>UNIT LIFT: <b id="lblUnitLift">14.9 lb/kft³</b></span>
            <span>PROPANE LHV: <b>46.3 MJ/kg</b></span>
          </div>
        </div>
      `;
    }

    _bindInputs() {
      const get = (id) => document.getElementById(id);

      // Temperature Inputs (bidirectional: slider <-> number input)
      const inputEnv = get('inputEnvTemp');
      const numEnv = get('numEnvTemp');
      const onEnvTempChange = (val) => {
        val = Math.max(60, Math.min(125, val));
        this.params.envelopeTempC = val;
        inputEnv.value = val;
        if (numEnv && document.activeElement !== numEnv) numEnv.value = val;
        this.recalculate();
        if (this.params.autoSyncLift && !this._isScaling) {
          this._applyTargetScale(false);
        }
      };
      inputEnv.addEventListener('input', (e) => onEnvTempChange(Number(e.target.value)));
      if (numEnv) {
        numEnv.addEventListener('input', (e) => {
          const val = Number(e.target.value);
          if (!isNaN(val)) onEnvTempChange(val);
        });
      }

      const inputAmb = get('inputAmbTemp');
      const numAmb = get('numAmbTemp');
      const onAmbTempChange = (val) => {
        val = Math.max(-20, Math.min(45, val));
        this.params.ambientTempC = val;
        inputAmb.value = val;
        if (numAmb && document.activeElement !== numAmb) numAmb.value = val;
        this.recalculate();
        if (this.params.autoSyncLift && !this._isScaling) {
          this._applyTargetScale(false);
        }
      };
      inputAmb.addEventListener('input', (e) => onAmbTempChange(Number(e.target.value)));
      if (numAmb) {
        numAmb.addEventListener('input', (e) => {
          const val = Number(e.target.value);
          if (!isNaN(val)) onAmbTempChange(val);
        });
      }

      get('inputAltitude').addEventListener('input', (e) => {
        this.params.altitudeM = Number(e.target.value);
        this.recalculate();
        if (this.params.autoSyncLift && !this._isScaling) {
          this._applyTargetScale(false);
        }
      });

      get('inputFabricGsm').addEventListener('input', (e) => {
        this.params.fabricWeightGsm = Number(e.target.value);
        this.recalculate();
        if (this.params.autoSyncLift && !this._isScaling) {
          this._applyTargetScale(false);
        }
      });

      // Canister fuel inputs (bidirectional: slider <-> number input)
      const inputCanister = get('inputCanisterFuelOz');
      const numCanister = get('numCanisterFuelOz');
      const numTare = get('numContainerTareOz');

      const onCanisterFuelChange = (val) => {
        val = Math.max(8.0, val);
        this.params.canisterFuelOz = val;
        inputCanister.value = Math.min(320, val);
        if (numCanister && document.activeElement !== numCanister) numCanister.value = val.toFixed(1);
        get('selectCanisterPreset').value = 'custom';
        this._updateCanisterDisplay();
        this.recalculate();
        if (this.params.autoSyncLift && !this._isScaling) {
          this._applyTargetScale(false);
        }
      };

      inputCanister.addEventListener('input', (e) => onCanisterFuelChange(Number(e.target.value)));
      if (numCanister) {
        numCanister.addEventListener('input', (e) => {
          const val = Number(e.target.value);
          if (!isNaN(val)) onCanisterFuelChange(val);
        });
      }

      const onTareChange = (val) => {
        val = Math.max(0, val);
        this.params.containerTareOz = val;
        if (numTare && document.activeElement !== numTare) numTare.value = val.toFixed(1);
        get('selectCanisterPreset').value = 'custom';
        this._updateCanisterDisplay();
        this.recalculate();
        if (this.params.autoSyncLift && !this._isScaling) {
          this._applyTargetScale(false);
        }
      };

      if (numTare) {
        numTare.addEventListener('input', (e) => {
          const val = Number(e.target.value);
          if (!isNaN(val)) onTareChange(val);
        });
      }

      get('selectCanisterPreset').addEventListener('change', (e) => {
        if (e.target.value === 'custom') return;
        const BM = BalloonMath || window.BalloonMath;
        const preset = (BM.CANISTER_PRESETS && BM.CANISTER_PRESETS[e.target.value]) || {
          fuelOz: Number(e.target.value),
          tareOz: Number(e.target.value) >= 80 ? Number(e.target.value) : 15.0
        };
        this.params.canisterFuelOz = preset.fuelOz;
        this.params.containerTareOz = preset.tareOz;
        inputCanister.value = preset.fuelOz;
        if (numCanister) numCanister.value = preset.fuelOz.toFixed(1);
        if (numTare) numTare.value = preset.tareOz.toFixed(1);
        this._updateCanisterDisplay();
        this.recalculate();
        if (this.params.autoSyncLift && !this._isScaling) {
          this._applyTargetScale(false);
        }
        if (window.TerminalAudio) window.TerminalAudio.playClick();
      });

      // Target Lift Inputs
      const sliderLift = get('inputTargetLiftLbs');
      const numLift = get('numTargetLiftInput');

      sliderLift.addEventListener('input', (e) => {
        const val = Number(e.target.value);
        this.params.targetRemainingLiftLbs = val;
        numLift.value = val.toFixed(1);
        this._updateTargetLiftDisplay();
        this._updatePresetBtnActive(val);
        this._updateSizingCalculations();
        if (this.params.autoSyncLift && !this._isScaling) {
          this._applyTargetScale(false);
        }
      });

      numLift.addEventListener('input', (e) => {
        const val = Math.max(0.1, Number(e.target.value) || 0.1);
        this.params.targetRemainingLiftLbs = val;
        sliderLift.value = Math.min(50.0, val);
        this._updateTargetLiftDisplay();
        this._updatePresetBtnActive(val);
        this._updateSizingCalculations();
        if (this.params.autoSyncLift && !this._isScaling) {
          this._applyTargetScale(false);
        }
      });

      // Quick Requirement Preset Buttons
      const btnGroup = get('reqPresetBtnGroup');
      if (btnGroup) {
        btnGroup.addEventListener('click', (e) => {
          const btn = e.target.closest('.btn-req-preset');
          if (!btn) return;
          const val = Number(btn.getAttribute('data-lbs'));
          if (val > 0) {
            this.params.targetRemainingLiftLbs = val;
            sliderLift.value = Math.min(50.0, val);
            numLift.value = val.toFixed(1);
            this._updateTargetLiftDisplay();
            this._updatePresetBtnActive(val);
            this._updateSizingCalculations();
            this._applyTargetScale(true);
            if (window.TerminalAudio) window.TerminalAudio.playClick();
          }
        });
      }

      // Auto-Sync Checkbox
      const chkSync = get('chkAutoSyncLift');
      chkSync.addEventListener('change', (e) => {
        this.params.autoSyncLift = Boolean(e.target.checked);
        if (this.params.autoSyncLift) {
          this._applyTargetScale(true);
        }
      });

      // Manual Apply Button
      get('btnApplyTargetLift').addEventListener('click', () => {
        this._applyTargetScale(true);
      });

      // Operational Partial Loading Slider & Number Input
      const sliderPartial = get('inputPartialLoading');
      const numPartial = get('numPartialLoading');
      const onPartialChange = (val) => {
        val = Math.max(0, Math.min(100, Math.round(val)));
        this.params.partialLoadingPct = val;
        if (sliderPartial) sliderPartial.value = val;
        if (numPartial && document.activeElement !== numPartial) numPartial.value = val;
        this._updatePartialLoadingDisplay();
        this._updateEnduranceDisplay();
      };
      if (sliderPartial) {
        sliderPartial.addEventListener('input', (e) => {
          onPartialChange(Number(e.target.value));
        });
      }
      if (numPartial) {
        numPartial.addEventListener('input', (e) => {
          const val = Number(e.target.value);
          if (!isNaN(val)) onPartialChange(val);
        });
      }
    }

    _updateTargetLiftDisplay() {
      const get = (id) => document.getElementById(id);
      const isImp = this.options.unit === 'imperial';
      const lbs = this.params.targetRemainingLiftLbs;
      const kg = lbs / 2.20462;
      get('lblTargetLiftDisplay').textContent = isImp
        ? `${lbs.toFixed(2)} LBS`
        : `${lbs.toFixed(2)} LBS (${kg.toFixed(2)} kg)`;
      get('lblTargetLiftUnit').textContent = 'LBS';
      this._updatePartialLoadingDisplay();
    }

    _updatePartialLoadingDisplay() {
      const get = (id) => document.getElementById(id);
      const isImp = this.options.unit === 'imperial';
      const pct = this.params.partialLoadingPct !== undefined ? this.params.partialLoadingPct : 100;

      const designPayloadLbs = (this.perf && this.perf.netLiftLbs > 0)
        ? this.perf.netLiftLbs
        : this.params.targetRemainingLiftLbs;
      const carriedLbs = designPayloadLbs * (pct / 100.0);
      const carriedKg = carriedLbs / 2.20462;

      const lbl = get('lblPartialLoading');
      if (lbl) {
        lbl.textContent = isImp
          ? `${pct}% (${carriedLbs.toFixed(2)} lbs)`
          : `${pct}% (${carriedLbs.toFixed(2)} lbs / ${carriedKg.toFixed(2)} kg)`;
      }

      const badge = get('badgePartialStatus');
      if (badge) {
        if (pct === 100) {
          badge.textContent = '100% FULL LOAD';
          badge.className = 'badge-partial-status';
        } else if (pct === 0) {
          badge.textContent = '0% EMPTY BASKET';
          badge.className = 'badge-partial-status badge-empty';
        } else {
          badge.textContent = `${pct}% PARTIAL LOAD`;
          badge.className = 'badge-partial-status badge-partial';
        }
      }

      const slider = get('inputPartialLoading');
      if (slider && document.activeElement !== slider) {
        slider.value = pct;
      }
      const numInput = get('numPartialLoading');
      if (numInput && document.activeElement !== numInput) {
        numInput.value = pct;
      }
    }

    _updatePresetBtnActive(val) {
      const get = (id) => document.getElementById(id);
      const btns = get('reqPresetBtnGroup').querySelectorAll('.btn-req-preset');
      btns.forEach(b => {
        const bVal = Number(b.getAttribute('data-lbs'));
        b.classList.toggle('active', Math.abs(bVal - val) < 0.05);
      });
    }

    _applyTargetScale(playSound = false) {
      if (this._isScaling) return;
      if (!this.sizing || this.sizing.impossible || typeof this.options.onScaleEnvelope !== 'function') return;
      const k = this.sizing.k;
      if (Math.abs(k - 1.0) > 0.005) {
        this._isScaling = true;
        try {
          this.options.onScaleEnvelope(k, playSound);
        } finally {
          this._isScaling = false;
        }
        if (playSound && window.TerminalAudio) window.TerminalAudio.playPing();
      }
    }

    _updateCanisterDisplay() {
      const get = (id) => document.getElementById(id);
      const fuelOz = this.params.canisterFuelOz;
      const tareOz = this.params.containerTareOz !== undefined ? this.params.containerTareOz : 15.0;
      const totalOz = fuelOz + tareOz;
      const totalLbs = totalOz / 16.0;
      const totalG = totalOz * 28.3495;
      if (get('lblCanisterFuelOz')) {
        get('lblCanisterFuelOz').textContent = `${fuelOz.toFixed(1)} oz fuel + ${tareOz.toFixed(1)} oz tank = ${totalOz.toFixed(1)} oz (${totalLbs.toFixed(2)} lbs / ${Math.round(totalG)} g)`;
      }
    }

    _formatDuration(min) {
      if (min <= 0 || !isFinite(min)) return '0.0 min';
      if (min < 60) return `~${min.toFixed(1)} min`;
      const hrs = Math.floor(min / 60);
      const rem = Math.round(min % 60);
      return `~${hrs}h ${rem}m (${min.toFixed(1)}m)`;
    }

    _updateEnduranceDisplay() {
      const get = (id) => document.getElementById(id);
      if (!this.perf) return;

      const canisterOz = this.params.canisterFuelOz;
      const pct = (this.params.partialLoadingPct !== undefined ? this.params.partialLoadingPct : 100) / 100.0;
      const pctInt = Math.round(pct * 100);

      // Sizing payload & actual carried airborne mass
      const designPayloadKg = (this.perf.netLiftKg > 0) ? this.perf.netLiftKg : (this.params.targetRemainingLiftLbs / 2.20462);
      const carriedPayloadKg = Math.max(0, designPayloadKg * pct);
      const actualTotalMassKg = this.perf.envelopeMassKg + this.perf.fuelRigMassKg + carriedPayloadKg;

      // Calculate internal air density needed to achieve equilibrium (gross lift = total airborne mass)
      const volumeM3 = this.perf.volumeM3;
      const surfaceAreaM2 = this.perf.surfaceAreaM2;
      const ambientDensity = this.perf.ambientDensity;
      const pressurePa = this.perf.pressurePa || 101325;
      const ambientTempC = this.params.ambientTempC;
      const designEnvTempC = this.params.envelopeTempC;

      // Required internal density: rho_internal = rho_ambient - (M_actual / V)
      const reqDeltaRho = actualTotalMassKg / volumeM3;
      const reqInternalRho = ambientDensity - reqDeltaRho;

      // Physical bounds check & equilibrium temperature
      let tempEqC = designEnvTempC;
      let tempDeltaEq = Math.max(1, tempEqC - ambientTempC);

      if (reqInternalRho > 0.05 && reqInternalRho < ambientDensity) {
        // From ideal gas law: rho = P / (R * T) => T = P / (R * rho)
        const reqTempK = pressurePa / (287.058 * reqInternalRho);
        tempEqC = reqTempK - 273.15;
        if (pct >= 0.999) {
          tempEqC = designEnvTempC;
        } else {
          tempEqC = Math.max(ambientTempC + 1.0, Math.min(150.0, tempEqC));
        }
        tempDeltaEq = Math.max(1.0, tempEqC - ambientTempC);
      } else {
        tempEqC = designEnvTempC;
        tempDeltaEq = this.perf.tempDelta;
      }

      // Update equilibrium temperature readout
      const lblEquil = get('lblPartialEquilTemp');
      if (lblEquil) {
        lblEquil.textContent = `Cruise Eq: ${tempEqC.toFixed(1)}°C (ΔT ${Math.round(tempDeltaEq)}°C)`;
      }

      // Thermodynamic parameters
      const heatLossCoeff = 15.0; // W/(m^2*K) overall envelope heat transfer
      const burnerEfficiency = 0.70; // 70% combustion & throat transfer
      const inflationEfficiency = 0.55; // 55% during initial cold inflation
      const fuelLhvJ = 46.3 * 1e6; // 46.3 MJ/kg propane lower heating value

      // Burner heat & fuel consumption at cruise equilibrium
      const heatLossPowerW = heatLossCoeff * surfaceAreaM2 * tempDeltaEq;
      const heatLossPowerKw = heatLossPowerW / 1000.0;
      const burnerPowerW = heatLossPowerW / burnerEfficiency;
      const burnerPowerKw = burnerPowerW / 1000.0;
      const burnerPowerBtuHr = burnerPowerW * 3.41214;

      const fuelBurnRateKgS = burnerPowerW / fuelLhvJ;
      const fuelBurnRateKgHr = fuelBurnRateKgS * 3600.0;
      const fuelBurnRateLbsHr = fuelBurnRateKgHr * 2.20462;
      const fuelBurnRateOzMin = (fuelBurnRateLbsHr * 16.0) / 60.0;
      const fuelBurnRateGMin = (fuelBurnRateKgHr * 1000.0) / 60.0;

      // Initial cold inflation fuel for this equilibrium temp
      const coldAirMassKg = volumeM3 * ambientDensity;
      const heatAirJoules = coldAirMassKg * 1005.0 * tempDeltaEq;
      const heatFabricJoules = this.perf.envelopeMassKg * 1700.0 * tempDeltaEq;
      const initialHeatJoules = (heatAirJoules + heatFabricJoules) / inflationEfficiency;
      const initialHeatMj = initialHeatJoules / 1e6;
      const initialHeatBtu = initialHeatJoules * 0.000947817;

      const initialFuelKg = initialHeatJoules / fuelLhvJ;
      const initialFuelLbs = initialFuelKg * 2.20462;
      const initialFuelOz = initialFuelLbs * 16.0;
      const initialFuelGrams = initialFuelKg * 1000.0;

      // Update Card [1] telemetry with actual cruise equilibrium rate
      if (get('lblDeltaTBadge')) {
        get('lblDeltaTBadge').textContent = pctInt < 100
          ? `ΔT ${Math.round(tempDeltaEq)}°C (@ ${pctInt}%)`
          : `ΔT ${this.perf.tempDelta}°C`;
      }
      if (get('lblBurnRateOzMin')) get('lblBurnRateOzMin').textContent = `${fuelBurnRateOzMin.toFixed(2)} OZ / MIN`;
      if (get('lblBurnRateGMin')) get('lblBurnRateGMin').textContent = `(${fuelBurnRateGMin.toFixed(1)} g/min)`;
      if (get('lblBurnRateLbsHr')) get('lblBurnRateLbsHr').textContent = `${fuelBurnRateLbsHr.toFixed(2)} lbs/hr (${fuelBurnRateKgHr.toFixed(2)} kg/hr)`;
      if (get('lblBurnerKw')) get('lblBurnerKw').textContent = `${burnerPowerKw.toFixed(1)} kW (${Math.round(burnerPowerBtuHr).toLocaleString()} BTU/hr)`;
      if (get('lblHeatLossKw')) get('lblHeatLossKw').textContent = `${heatLossPowerKw.toFixed(1)} kW @ ΔT ${Math.round(tempDeltaEq)}°C`;

      // Update Card [2] initial cold inflation telemetry
      if (get('lblInitialFuelOz')) {
        get('lblInitialFuelOz').textContent = `${initialFuelOz.toFixed(2)} OZ PROPANE`;
      }
      if (get('lblInitialFuelSub')) {
        get('lblInitialFuelSub').textContent = pctInt < 100
          ? `(${initialFuelGrams.toFixed(1)} g / ${initialFuelLbs.toFixed(2)} lbs @ ${tempEqC.toFixed(1)}°C)`
          : `(${initialFuelGrams.toFixed(1)} g / ${initialFuelLbs.toFixed(2)} lbs)`;
      }
      if (get('lblSensibleAirKj')) {
        get('lblSensibleAirKj').textContent = `${Math.round(heatAirJoules / 1000).toLocaleString()} kJ enthalpy`;
      }
      if (get('lblTotalHeatMj')) {
        get('lblTotalHeatMj').textContent = `${initialHeatMj.toFixed(2)} MJ (${Math.round(initialHeatBtu).toLocaleString()} BTU)`;
      }

      if (fuelBurnRateOzMin <= 0) {
        get('lblEnduranceCruiseNoInit').textContent = '—';
        get('lblEnduranceFullNoInit').textContent = '—';
        get('lblFuelUsableNoInit').textContent = '—';
        get('lblEnduranceCruiseWithInit').textContent = '—';
        get('lblEnduranceFullWithInit').textContent = '—';
        get('lblFuelUsableWithInit').textContent = '—';
        get('lblEnduranceHeatNote').textContent = '// No burn rate telemetry available';
        return;
      }

      // -------------------------------------------------------------
      // Case A: WITHOUT INITIAL HEATING (Pre-heated / Hot Launch)
      // -------------------------------------------------------------
      const fullMinNoInit = canisterOz / fuelBurnRateOzMin;
      const cruiseMinNoInit = fullMinNoInit * 2.0; // 50% duty cycle
      get('lblEnduranceCruiseNoInit').textContent = this._formatDuration(cruiseMinNoInit);
      get('lblEnduranceFullNoInit').textContent = this._formatDuration(fullMinNoInit);
      get('lblFuelUsableNoInit').textContent = `${canisterOz.toFixed(1)} oz (100%)`;

      // -------------------------------------------------------------
      // Case B: WITH INITIAL HEATING (Cold Inflation from Bottle)
      // -------------------------------------------------------------
      const heatNote = get('lblEnduranceHeatNote');
      const badgeWithInit = get('badgeWithInit');
      const cruiseWithInitEl = get('lblEnduranceCruiseWithInit');

      if (canisterOz < initialFuelOz) {
        const deficitOz = initialFuelOz - canisterOz;
        cruiseWithInitEl.textContent = '0.0 min';
        cruiseWithInitEl.className = 'endurance-val-large text-danger';
        get('lblEnduranceFullWithInit').textContent = '0.0 min';
        get('lblFuelUsableWithInit').textContent = `0.0 oz (DEFICIT: -${deficitOz.toFixed(1)} oz)`;
        if (badgeWithInit) {
          badgeWithInit.textContent = '[B] ⚠ INSUFFICIENT FUEL FOR COLD INFLATION';
          badgeWithInit.className = 'case-badge-with-init badge-danger';
        }
        heatNote.textContent = `⚠ COLD INFLATION DEFICIT: Requires ${initialFuelOz.toFixed(1)} oz propane, but canister only holds ${canisterOz.toFixed(1)} oz (-${deficitOz.toFixed(1)} oz shortfall). Pre-heat on ground!`;
        heatNote.className = 'endurance-heat-note text-danger';
      } else {
        const remFuelOz = canisterOz - initialFuelOz;
        const remPct = (remFuelOz / canisterOz) * 100;
        const initPct = (initialFuelOz / canisterOz) * 100;
        const fullMinWithInit = remFuelOz / fuelBurnRateOzMin;
        const cruiseMinWithInit = fullMinWithInit * 2.0;

        cruiseWithInitEl.textContent = this._formatDuration(cruiseMinWithInit);
        cruiseWithInitEl.className = 'endurance-val-large text-flare';
        get('lblEnduranceFullWithInit').textContent = this._formatDuration(fullMinWithInit);
        get('lblFuelUsableWithInit').textContent = `${remFuelOz.toFixed(1)} oz (${remPct.toFixed(0)}%)`;
        if (badgeWithInit) {
          badgeWithInit.textContent = '[B] WITH INITIAL HEATING';
          badgeWithInit.className = 'case-badge-with-init';
        }
        if (pctInt < 100) {
          heatNote.textContent = `// Operational loading ${pctInt}%: cruise equilibrium at ${tempEqC.toFixed(1)}°C. Cold inflation requires ${initialFuelOz.toFixed(2)} oz (${initPct.toFixed(1)}% of fuel), leaving ${remFuelOz.toFixed(1)} oz for cruise.`;
        } else {
          heatNote.textContent = `// Cold inflation consumes ${initialFuelOz.toFixed(2)} oz propane (${initPct.toFixed(1)}% of bottle), leaving ${remFuelOz.toFixed(1)} oz for cruise flight.`;
        }
        heatNote.className = 'endurance-heat-note';
      }
    }

    _updateSizingCalculations() {
      const get = (id) => document.getElementById(id);
      if (this.currentVolumeM3 <= 0 || this.currentAreaM2 <= 0) return;

      const BM = BalloonMath || window.BalloonMath;
      const sizing = BM.FlightComputer.solveScaleForTargetLift(
        this.currentVolumeM3,
        this.currentAreaM2,
        this.params.targetRemainingLiftLbs,
        this.params
      );
      this.sizing = sizing;

      if (sizing.impossible) {
        get('reqMetricHeight').textContent = 'NO LIFT';
        get('reqMetricHeightFt').textContent = 'T_env ≤ T_amb';
        get('reqMetricDiam').textContent = 'NO LIFT';
        get('reqMetricDiamFt').textContent = 'T_env ≤ T_amb';
        get('reqMetricVol').textContent = 'NO LIFT';
        get('reqMetricVolFt').textContent = 'NO LIFT';
        get('reqMetricScaleK').textContent = 'N/A';
        get('reqSumEnvWt').textContent = `${sizing.requiredEnvelopeMassLbs.toFixed(2)} lbs`;
        if (get('reqSumFuelRigWt')) get('reqSumFuelRigWt').textContent = `${(sizing.fuelRigMassLbs || 0).toFixed(2)} lbs`;
        get('reqSumGrossLift').textContent = `0.00 lbs`;
        get('reqSumNetLift').textContent = `0.00 lbs`;
        return;
      }

      const k = sizing.k;
      const reqH = this.currentHeightM * k;
      const reqD = this.currentMaxDiamM * k;
      const isImp = this.options.unit === 'imperial';

      get('reqMetricHeight').textContent = isImp ? `${(reqH * 3.28084).toFixed(1)} ft` : `${reqH.toFixed(2)} m`;
      get('reqMetricHeightFt').textContent = isImp ? `${reqH.toFixed(2)} m` : `${(reqH * 3.28084).toFixed(1)} ft`;

      get('reqMetricDiam').textContent = isImp ? `${(reqD * 3.28084).toFixed(1)} ft` : `${reqD.toFixed(2)} m`;
      get('reqMetricDiamFt').textContent = isImp ? `${reqD.toFixed(2)} m` : `${(reqD * 3.28084).toFixed(1)} ft`;

      get('reqMetricVol').textContent = isImp ? `${Math.round(sizing.requiredVolumeM3 * 35.3147).toLocaleString()} ft³` : `${sizing.requiredVolumeM3.toFixed(1)} m³`;
      get('reqMetricVolFt').textContent = isImp ? `${sizing.requiredVolumeM3.toFixed(1)} m³` : `${Math.round(sizing.requiredVolumeM3 * 35.3147).toLocaleString()} cu ft`;

      get('reqMetricScaleK').textContent = `${k.toFixed(3)}x`;

      get('reqSumEnvWt').textContent = `${sizing.requiredEnvelopeMassLbs.toFixed(2)} lbs (${(sizing.requiredEnvelopeMassLbs / 2.20462).toFixed(2)} kg)`;
      if (get('reqSumFuelRigWt')) get('reqSumFuelRigWt').textContent = `${(sizing.fuelRigMassLbs || 0).toFixed(2)} lbs`;
      get('reqSumGrossLift').textContent = `${sizing.requiredGrossLiftLbs.toFixed(2)} lbs (${(sizing.requiredGrossLiftLbs / 2.20462).toFixed(2)} kg)`;
      get('reqSumNetLift').textContent = `${sizing.resultingNetLiftLbs.toFixed(2)} lbs`;
    }

    recalculate() {
      if (this.currentVolumeM3 <= 0) return;

      const BM = BalloonMath || window.BalloonMath;
      const perf = BM.FlightComputer.calculateFlightPerformance(
        this.currentVolumeM3,
        this.currentAreaM2,
        this.params
      );
      this.perf = perf;

      this._updateUI(perf);
      this._updateTargetLiftDisplay();
      this._updatePartialLoadingDisplay();
      this._updateSizingCalculations();
      this._updateCanisterDisplay();
      this._updateEnduranceDisplay();

      if (typeof this.options.onChange === 'function') {
        this.options.onChange(perf);
      }
    }

    applyInitialSizing() {
      if (this.params.autoSyncLift) {
        this._applyTargetScale(false);
      }
    }

    _updateUI(perf) {
      const get = (id) => document.getElementById(id);
      const isImp = this.options.unit === 'imperial';

      // Category badge
      if (perf.volumeM3 < 50) {
        get('faiClassBadge').textContent = `RC MODEL (${perf.volumeM3.toFixed(1)} m³)`;
      } else {
        get('faiClassBadge').textContent = `${perf.fai.code} (${perf.fai.desc.split('(')[0].trim()})`;
      }

      // Telemetry Cards
      get('valVolume').textContent = isImp
        ? `${Math.round(perf.volumeCuFt).toLocaleString()} ft³`
        : `${perf.volumeM3.toFixed(1)} m³`;
      get('valVolumeCuFt').textContent = isImp
        ? `${perf.volumeM3.toFixed(1)} m³`
        : `${Math.round(perf.volumeCuFt).toLocaleString()} cu ft`;

      get('valEnvMassLbs').textContent = `${perf.envelopeMassLbs.toFixed(2)} lbs`;
      get('valEnvMassSub').textContent = `${(perf.envelopeMassOz).toFixed(1)} oz (${perf.envelopeMassKg.toFixed(2)} kg)`;

      if (get('valFuelRigLbs')) {
        get('valFuelRigLbs').textContent = `${perf.fuelRigMassLbs.toFixed(2)} lbs`;
        get('valFuelRigSub').textContent = `${perf.fuelRigMassOz.toFixed(1)} oz (${perf.fuelRigMassKg.toFixed(2)} kg)`;
      }

      get('valGrossLiftLbs').textContent = `${perf.grossLiftLbs.toFixed(2)} lbs`;
      get('valGrossLiftKg').textContent = `${perf.grossLiftKg.toFixed(2)} kg (${(perf.grossLiftLbs * 16).toFixed(0)} oz)`;

      get('valNetPayloadLbs').textContent = `${perf.netLiftLbs.toFixed(2)} lbs`;
      get('valNetPayloadSub').textContent = `${(perf.netLiftOz).toFixed(1)} oz (${Math.round(perf.netLiftGrams).toLocaleString()} g)`;

      // Prominent Net Lift Card
      const hugeLbs = get('lblHugePayloadLbs');
      const hugeSub = get('lblHugePayloadSub');
      const badge = get('lblPayloadBadge');

      if (perf.envelopeTempC <= perf.ambientTempC) {
        hugeLbs.textContent = `0.00 LBS (NO LIFT)`;
        hugeLbs.className = 'payload-value-huge text-danger';
        badge.textContent = '⚠ ENV TEMP ≤ AMBIENT (NO BUOYANCY)';
        badge.style.background = '#ff3322';
      } else if (perf.netLiftLbs <= 0) {
        hugeLbs.textContent = `0.00 LBS (NEGATIVE LIFT)`;
        hugeLbs.className = 'payload-value-huge text-danger';
        badge.textContent = '⚠ DEAD WEIGHT EXCEEDS LIFT';
        badge.style.background = '#ff3322';
      } else {
        hugeLbs.textContent = `${perf.netLiftLbs.toFixed(2)} LBS`;
        hugeLbs.className = 'payload-value-huge text-flare';
        badge.textContent = `NET LIFT: ${perf.netLiftRatioPct.toFixed(0)}% OF GROSS`;
        badge.style.background = 'var(--amber-primary)';
      }
      hugeSub.textContent = `(${perf.netLiftOz.toFixed(1)} oz / ${Math.round(perf.netLiftGrams).toLocaleString()} g / ${perf.netLiftKg.toFixed(2)} kg)`;

      // 3-Part Aerostatic Balance Gauge (Envelope Mass vs Fuel Rig vs Net Payload)
      const totalGross = Math.max(0.01, perf.grossLiftLbs);
      const envPct = Math.min(100, (perf.envelopeMassLbs / totalGross) * 100);
      const fuelPct = Math.min(100 - envPct, (perf.fuelRigMassLbs / totalGross) * 100);
      const netPct = Math.max(0, 100 - envPct - fuelPct);

      if (get('barEnvelope')) get('barEnvelope').style.width = `${envPct.toFixed(1)}%`;
      if (get('barFuelRig')) get('barFuelRig').style.width = `${fuelPct.toFixed(1)}%`;
      if (get('barPayload')) get('barPayload').style.width = `${netPct.toFixed(1)}%`;

      if (get('legEnvMass')) get('legEnvMass').textContent = `${perf.envelopeMassLbs.toFixed(2)} lbs (${envPct.toFixed(0)}%)`;
      if (get('legFuelRigMass')) get('legFuelRigMass').textContent = `${perf.fuelRigMassLbs.toFixed(2)} lbs (${fuelPct.toFixed(0)}%)`;
      if (get('legPayMass')) get('legPayMass').textContent = `${perf.netLiftLbs.toFixed(2)} lbs (${netPct.toFixed(0)}%)`;
      if (get('liftMarginPct')) get('liftMarginPct').textContent = `${perf.netLiftRatioPct.toFixed(0)}% NET PAYLOAD LIFT`;

      // -----------------------------------------------------------------
      // Fuel Thermodynamics Display
      // -----------------------------------------------------------------
      get('lblDeltaTBadge').textContent = `ΔT ${perf.tempDelta}°C`;

      // Card 1: Burn rate to keep warm
      get('lblBurnRateOzMin').textContent = `${perf.fuelBurnRateOzMin.toFixed(2)} OZ / MIN`;
      get('lblBurnRateGMin').textContent = `(${perf.fuelBurnRateGMin.toFixed(1)} g/min)`;
      get('lblBurnRateLbsHr').textContent = `${perf.fuelBurnRateLbsHr.toFixed(2)} lbs/hr (${perf.fuelBurnRateKgHr.toFixed(2)} kg/hr)`;
      get('lblBurnerKw').textContent = `${perf.burnerPowerKw.toFixed(1)} kW (${Math.round(perf.burnerPowerBtuHr).toLocaleString()} BTU/hr)`;
      get('lblHeatLossKw').textContent = `${perf.heatLossPowerKw.toFixed(1)} kW @ ΔT ${perf.tempDelta}°C`;

      // Card 2: Initial cold inflation fuel
      get('lblInitialFuelOz').textContent = `${perf.initialFuelOz.toFixed(2)} OZ PROPANE`;
      get('lblInitialFuelSub').textContent = `(${perf.initialFuelGrams.toFixed(1)} g / ${perf.initialFuelLbs.toFixed(2)} lbs)`;
      get('lblColdAirMass').textContent = `${(perf.volumeM3 * perf.ambientDensity).toFixed(1)} kg ambient air`;
      get('lblSensibleAirKj').textContent = `${Math.round((perf.volumeM3 * perf.ambientDensity * 1005 * perf.tempDelta) / 1000).toLocaleString()} kJ enthalpy`;
      get('lblTotalHeatMj').textContent = `${perf.initialHeatMj.toFixed(2)} MJ (${Math.round(perf.initialHeatBtu).toLocaleString()} BTU)`;

      // Sliders & Number Values Displays
      const envC = this.params.envelopeTempC;
      const ambC = this.params.ambientTempC;
      const envF = Math.round(envC * 1.8 + 32);
      const ambF = Math.round(ambC * 1.8 + 32);

      get('lblEnvTemp').textContent = `${envC} °C (${envF} °F)`;
      get('lblAmbTemp').textContent = `${ambC} °C (${ambF} °F)`;
      if (get('numEnvTemp') && document.activeElement !== get('numEnvTemp')) {
        get('numEnvTemp').value = envC;
      }
      if (get('numAmbTemp') && document.activeElement !== get('numAmbTemp')) {
        get('numAmbTemp').value = ambC;
      }
      if (get('numContainerTareOz') && document.activeElement !== get('numContainerTareOz')) {
        get('numContainerTareOz').value = (this.params.containerTareOz !== undefined ? this.params.containerTareOz : 30.0).toFixed(1);
      }
      get('lblAltitude').textContent = isImp ? `${Math.round(this.params.altitudeM * 3.28084)} ft` : `${this.params.altitudeM} m`;
      get('lblFabricGsm').textContent = `${this.params.fabricWeightGsm} g/m²`;

      // Thermal stress & buoyancy alert
      const tempWarn = get('tempWarn');
      if (envC <= ambC) {
        tempWarn.textContent = '⚠ ENV ≤ AMB (ZERO BUOYANCY)';
        tempWarn.className = 'text-danger blink';
      } else if (this.params.envelopeTempC >= 118) {
        tempWarn.textContent = '⚠ HIGH THERMAL STRESS (> 118°C)';
        tempWarn.className = 'text-danger blink';
      } else if (this.params.envelopeTempC >= 105) {
        tempWarn.textContent = 'MODERATE (> 105°C)';
        tempWarn.className = 'text-alert';
      } else {
        tempWarn.textContent = 'OPTIMAL (< 105°C)';
        tempWarn.className = 'text-dim';
      }

      // Barometric footer
      get('lblBaroP').textContent = `${perf.pressureHpa.toFixed(1)} hPa`;
      get('lblAmbRho').textContent = `${perf.ambientDensity.toFixed(3)} kg/m³`;
      get('lblHotRho').textContent = `${perf.internalDensity.toFixed(3)} kg/m³`;
      get('lblUnitLift').textContent = isImp
        ? `${perf.unitLiftLbs1000CuFt.toFixed(1)} lb/kft³`
        : `${perf.unitLiftKgM3.toFixed(3)} kg/m³ (${perf.unitLiftLbs1000CuFt.toFixed(1)} lb/kft³)`;
    }
  }

  return FlightUI;
}));
