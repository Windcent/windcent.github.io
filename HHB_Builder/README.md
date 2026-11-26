# HHB_Builder // Hot Air Balloon Envelope Planner & Flight Computer

> **Aeronautical CAD & Aerostatic Planning Suite for Hot Air Balloon Envelopes**  
> Styled in an authentic **Amber CRT Phosphor Terminal Theme** (`#ffb000`) with zero external runtime dependencies.

---

## 🚀 Overview

`HHB_Builder` is an interactive engineering web application designed for hot air balloon builders, pilots, and aerospace enthusiasts. It enables complete parametric design of balloon envelopes from vertical profile splines down to flat pattern fabric cutting templates and aerostatic flight performance modeling.

---

## ✨ Features

### 1. 📐 Interactive 2D Profile Editor & Adimensional Shape Presets
- **Adimensional Shape Presets**: All geometry presets are defined in dimensionless coordinates ($\bar{z} \in [0.0, 1.0]$, $\bar{r} = r/H$). Selecting a preset preserves normalized aerodynamic curvature while decoupling the shape from any arbitrary fixed size:
  1. **Model Conical (Optimized 4-Gore Flat Build)**: Truncated conical envelope engineered for clean 4-to-6-gore builds without compound curves.
  2. **Natural Shape (Taylor/Smalley Membrane)**: Zero-circumferential-stress catenary profile minimizing skin tension and fabric deformation.
  3. **Classic Teardrop (AX Sphere-Cone)**: Traditional sphere-cone hot air balloon contour offering an ideal balance between volume and vertical stability.
  4. **High-Aspect Racer (Competition Streamline)**: High fineness ratio ($H/D \approx 1.55$) envelope designed for rapid vertical ascent and descent in competition flying.
  5. **Bulbous Hopper (High Volume / Low Aspect)**: Wide equator ($H/D \approx 1.04$) envelope delivering maximum enclosed volume at compact heights.
  6. **Spherical Aerostat (Minimal Fabric Skin)**: Near-spherical envelope contour minimizing fabric surface area per unit volume.
- **Monotone Cubic Spline Interpolation (Fritsch-Carlson)**: Guarantees smooth envelope contours without artificial ripples or negative radii.
- **Draggable Control Handles**: Adjust throat opening diameter, lower cone angle, equator (maximum diameter station), upper shoulder, and parachute top crown ring.
- **Double-Click Operations**: Double-click on the canvas to add a new control point; double-click an intermediate point to remove it.
- **Visual Station Overlays**: Live horizontal dashed station lines show the exact height of panel horizontal seams.
- **Dimensional Callouts**: Real-time height ($H$), maximum diameter ($D_{\text{max}}$), and throat radius measurements in metric ($m$) or imperial ($ft$).
- **Symmetry Mirroring & Snap-to-Grid**: Toggle between mirrored full silhouette and half-profile with $0.25\text{ m}$ grid snapping.

### 2. 🌐 3D Vector Wireframe Visualizer
- **Revolved Surface Engine**: Real-time 3D vector wireframe renderer with depth-cued amber phosphor line bloom.
- **Complete Rigging Assembly**:
  - Longitudinal meridian ribs ($N$ gores).
  - Latitudinal hoop rings at panel seam stations.
  - Parachute crown ring and throat mouth ring.
  - Conical Nomex heat skirt.
  - Stainless steel flying suspension cables.
  - Dual burner assembly with coil manifolds and upright struts.
  - Wicker basket with top bolster rim, internal floor, and oak skid runners.
- **Interactive Orbit Camera**:
  - Drag to orbit (azimuth / elevation with gimbal lock protection).
  - Scroll wheel to zoom.
  - Right-drag / Shift-drag to pan.
  - One-click camera presets: `PERSP`, `FRONT`, `SIDE`, `TOP`, `BASKET`.
  - Auto-rotation toggle with configurable rotation rate.
- **Gore Raycasting & Highlighting**: Hovering over or clicking any gore illuminates that meridian rib in brilliant electric amber phosphor flare.

### 3. ✂️ Segment Cutout Planner (with Toggleable Max Size Constraint)
- **Minimum 4 Gores**: Supports low-gore model envelopes starting at just 4 gores (4, 5, 6, 8, ... 32) up to complex full-scale balloons.
- **Enable / Disable Max Size Constraint**:
  - One-click toggle (`[MAX SIZE: ON/OFF]`) to enable or disable fabric roll and cutting table limits.
  - When disabled, panels are cut without roll boundary alarms.
  - When enabled, checks if any panel exceeds max bolt width ($1.50\text{ m}$ / $60''$ or custom) or cutting table / panel length ($10.00\text{ m}$ / $33\text{ ft}$ or custom).
- **Max Panel Length Control & Live Length Readout**:
  - Slider control for **Max Panel Length** ($0.20\text{ m}$ to $10.00\text{ m}$ / $8''$ to $33\text{ ft}$) representing cutting table limits or fabric segment constraints (defaults to $10.00\text{ m}$ with $1$ panel per gore).
  - Live average panel arc length readout under the Panels Per Gore slider (e.g. `~4.50m (15 ft) / seg`).
  - Maximum length dashed guideline drawn directly onto panel blueprints.
- **Smart Auto-Fit (Gores & Panels)**:
  - **Auto-Fit Panels & Dynamic Length Sync**: Changing the Max Panel Length dynamically updates the Panels Per Gore to the minimum number of panels required ($P_{\text{req}} = \max(1, \lceil S / (L_{\text{max}} - 2 \cdot \text{seam}) \rceil)$), supporting continuous full-gore cutting down to a minimum of 1 panel per gore. Manual auto-fitting is also available via the `[AUTO-FIT]` button.
  - **Auto-Fit Gores (`[AUTO-FIT GORES]`)**: Computes the exact minimum number of gores required to eliminate width overflow on your fabric roll.
  - Dual-action violation alert banner with one-click auto-fit corrections for both width and length constraints.
- **Cutting Blueprint vs. Stitch Seam**:
  - Outer solid line: Cut line including French fell seam allowance ($10\text{ mm}$ to $35\text{ mm}$).
  - Inner dashed line: Nominal stitch seam.
  - Alignment notches at 25%, 50%, and 75% height for seam registration during sewing.
- **Multiple Visualization Modes**:
  - **Panel Template**: Detailed individual panel blueprint with top width, bottom width, max width, arc height, and diagonal corner-to-corner squareness check.
  - **All Panels**: Comprehensive cutting catalog displaying all unique gore panel templates ($P_1 \dots P_n$) arranged in an inspectable grid with dimensions, seam allowances, and constraint status. Click any panel to select it.
  - **Full Gore**: Unfolded continuous single gore strip showing all panel seam divisions.
  - **All Gores**: Complete unrolled envelope meridian blueprint displaying all $N$ gores ($G_1 \dots G_N$) side-by-side with continuous horizontal seam registration lines across the entire envelope. Click any gore or panel to select it.
  - **Bolt Nesting**: Staggered cutting preview showing fabric roll layout and yardage requirements.
- **Export Capabilities**:
  - **Download Scaled SVG**: Production-ready vector graphic with dimensional labels and seam allowances.
  - **Download CSV Lofting Table**: Point-by-point $(X, Y)$ coordinates from centerline for manual table lofting or CNC cutting.
  - **Interactive Lofting Modal Table**: In-browser inspection of cutting stations.

### 4. 🎈 Aerostatic Buoyancy & Flight Computer (Sized by Lift in LBS)
- **Top Telemetry Banner & HUD**:
  - Prominent 4-card operational telemetry banner at the top of the workspace:
    - **VOLUME**: $m^3$ and cu ft.
    - **SURFACE AREA**: $m^2$ and sq ft.
    - **GROSS LIFT**: Total aerostatic buoyancy in lbs and kg.
    - **NET LIFT**: True usable payload lift capacity in lbs, oz, and kg.
- **Design Requirement // Fix Specification by Target Net Lift**:
  - Target Net Lift slider and numeric input (0.10 lbs up to 500.0 lbs) with quick presets (`1.0 lb`, `2.5 lbs`, `5.0 lbs`, `10.0 lbs`, `25.0 lbs`, `500.0 lbs`), defaulting to 2.50 lbs net lift with 2x 1.0 lb DOT bottles, 10 gores, and 1 panel per gore.
  - **Live Analytical Inverse Sizing Solver**: Computes the exact scale factor $k$, required height $H_{\text{req}}$, diameter $D_{\text{req}}$, and volume $V_{\text{req}}$ to guarantee your payload requirement under current atmospheric conditions.
  - **One-Click & Live Auto-Scale**: Click `[⚡ AUTO-SIZE ENVELOPE TO MEET TARGET LIFT]` or toggle `[x] AUTO-SCALE LIVE` to dynamically scale the 2D profile spline, 3D wireframe, and cutting patterns in real-time as atmospheric parameters or target lifts change.
- **Operational Partial Payload Loading (Flight Time Simulation Only)**:
  - Dedicated slider ($0\%$ to $100\%$, default $100\%$) and numeric input located under the payload sizing controls.
  - **Zero Design Side-Effects**: This operational slider **never** resizes or alters envelope geometry, 2D profile points, 3D wireframe mesh, or cutting patterns. The envelope remains sized for 100% full payload capacity.
  - **Thermodynamic Re-Equilibrium**: Determines the reduced airborne weight ($M_{\text{actual}} = M_{\text{env}} + M_{\text{fuelRig}} + \text{Payload} \times \frac{\text{LoadingPct}}{100}$) and calculates the lower internal hot air density ($\rho_{\text{eq}} = \rho_{\text{amb}} - \frac{M_{\text{actual}}}{V}$) and cruise equilibrium temperature ($T_{\text{eq}}$) required for level hover.
  - **Instant Flight Endurance Re-evaluation**: Re-evaluates burner power $P_{\text{cruise}}$, fuel burn rate (oz/min, g/min, lbs/hr), initial cold inflation propane, and endurance times for Case [A] (hot launch) and Case [B] (cold bottle inflation).
- **True Net Lift (Deducting Envelope, Fuel, and Container Tare Weight)**:
  - For radio-controlled model balloons, container tare weight is critical: a standard 1.0 lb (16.0 oz) DOT disposable steel camping bottle carries 16.0 oz of propane, but the empty steel cylinder itself weighs ~15.0 oz, making the fuel rig weigh 31.0 oz (1.94 lbs)!
  - Net lift subtracts all dead weight from gross buoyancy:
    $$\text{Net Lift (lbs)} = \text{Gross Aerostatic Lift} - \left(W_{\text{envelope}} + W_{\text{fuel}} + W_{\text{container}}\right)$$
  - Directly represents the true usable payload remaining for basket, burner frame, receiver, servos, battery, and cameras.
  - **3-Part Aerostatic Balance Gauge**: Visualizes the proportional split of Gross Lift between Envelope Fabric (amber solid), Fuel & Tank Rig (amber medium), and Net Usable Payload (amber flare).
  - Canister presets include standard empty cylinder tare weights:
    - **1x 8.0 oz Butane Bottle**: 8.0 oz fuel + 3.6 oz steel tare = 11.6 oz total (0.73 lbs / 329 g)
    - **1x 1.0 lb (16.0 oz) DOT Bottle**: 16.0 oz fuel + 15.0 oz steel tare = 31.0 oz total (1.94 lbs)
    - **2x 1.0 lb (32.0 oz) DOT Bottles**: 32.0 oz fuel + 30.0 oz steel tare = 62.0 oz total (3.88 lbs)
    - **3x 1.0 lb (48.0 oz) DOT Bottles**: 48.0 oz fuel + 45.0 oz steel tare = 93.0 oz total (5.81 lbs)
    - **4x 1.0 lb (64.0 oz) DOT Bottles**: 64.0 oz fuel + 60.0 oz steel tare = 124.0 oz total (7.75 lbs)
    - 5.0 lb aluminum model tank (tare: 80.0 oz)
    - 10.0 lb propane tank (tare: 216.0 oz)
    - 20.0 lb standard propane tank (tare: 272.0 oz)
    - Fully editable custom canister fuel and container tare weight inputs (minimum 8.0 oz).
- **Exact Frustum Numerical Integration**:
  - Volume $V = \sum \frac{\pi \Delta z}{3} (r_1^2 + r_1 r_2 + r_2^2)$.
  - Surface Area $A = \sum \pi (r_1 + r_2) ds$.
- **Barometric Atmospheric Modeling**:
  - Tropospheric lapse rate pressure $P(h)$ and air density calculation from sea level up to $4,000\text{ m}$ ($13,000\text{ ft}$).
  - Ambient air density $\rho_{\text{amb}}$ vs. internal hot air density $\rho_{\text{int}}$.
  - Gross aerostatic lift in pounds ($L_{\text{gross}} = V \cdot (\rho_{\text{amb}} - \rho_{\text{int}}) \cdot g$).
- **Equilibrium Fuel Consumption Rate (To Keep Warm)**:
  - Convective and radiative heat loss rate through envelope surface:
    $$P_{\text{loss}} = U \cdot A \cdot (T_{\text{int}} - T_{\text{amb}}) \quad \left(U = 15 \text{ W}/(\text{m}^2 \cdot \text{K})\right)$$
  - Burner thermal heat release required: $P_{\text{burner}} = \frac{P_{\text{loss}}}{\eta_{\text{burner}}}$ ($\eta = 70\%$).
  - Continuous propane fuel burn rate displayed in:
    - **oz/min** and **g/min** (vital for model RC balloonists)
    - **lbs/hr** and **kg/hr**
    - **kW** and **BTU/hr** thermal power
- **Initial Fuel Needed to Heat Envelope (Cold Inflation)**:
  - Thermal enthalpy required to heat the cold ambient air volume and fabric mass:
    $$Q_{\text{infl}} = \frac{m_{\text{air}} \cdot c_p \cdot \Delta T + m_{\text{env}} \cdot c_{\text{nylon}} \cdot \Delta T}{\eta_{\text{inflation}}} \quad (\eta = 55\%)$$
  - Initial propane mass required displayed in **oz**, **grams**, and **lbs** (with total MJ and BTU).
- **Dual Flight Endurance Estimation (With & Without Initial Heating)**:
  - **[A] Without Initial Heating (Pre-Heated / Hot Launch)**: Models flights where the envelope is inflated using ground burners or blowers, leaving 100% of onboard canister propane available for cruise flight.
  - **[B] With Initial Heating (Cold Inflation from Onboard Bottle)**: Deducts initial cold inflation enthalpy and propane mass from the canister to calculate actual remaining usable flight fuel and cruise duration. Flags deficits if canister capacity is insufficient to reach flight equilibrium.
  - Displays cruise flight duration (~50% duty cycle for level equilibrium) and 100% full-blast continuous burn time with hours and minutes breakdown.
  - Direct canister size selection (1x 8 oz butane bottle, 1x 1 lb, 2x 1 lb, 3x 1 lb, 4x 1 lb bottles, 5 lb / 10 lb / 20 lb tanks, or custom slider/number input).
- **Live Temperature & Altitude Sensitivity**:
  - Live recalculation of aerostatic lift, balance gauges, and fuel burn rates when adjusting envelope temperature (60°C to 125°C, defaulting to 80°C), ambient temperature (-20°C to 45°C, defaulting to 25°C), or launch altitude ASL (0 m to 4,000 m).
  - Bidirectional slider and numeric temperature inputs with dual Celsius and Fahrenheit readouts (`°C (°F)`).
  - When `[x] AUTO-SCALE LIVE` is enabled, altering temperatures dynamically resizes the 2D profile spline, 3D wireframe mesh, and fabric cutouts in real-time to preserve target lift.
  - Thermal safety monitoring with alerts for nylon stress (>118°C) and zero-buoyancy conditions ($T_{\text{env}} \le T_{\text{amb}}$).

### 5. 📺 Amber Terminal Theme & Soundscapes
- **CRT Phosphor Amber Palette**: Authentic P3 phosphor (`#ffb000`) on cathode black (`#090701`).
- **Scanline & Vignette Effect**: Hardware-accelerated CRT scanline overlay with instant toggle (defaults to OFF for crisp modern display).
- **Synthesized Audio Soundscape**: Web Audio API retro terminal clicks, relay switches, radar pings, and alert tones with mute toggle.
- **Layout Adaptability**:
  - **Master Dashboard**: Flight Computer is full height on the right; 2D Profile Editor and 3D Wireframe Visualizer share the top cell side-by-side; Segment Cutout Planner spans the lower-left width.
  - **Focused Views**: One-click expansion to single-panel view (`2D PROFILE`, `3D WIREFRAME`, `CUTOUT PLANNER`, `FLIGHT COMPUTER`).
- **Save & Load**: One-click JSON export and import for balloon design specifications.

---

## 🏃 Running the Application

`HHB_Builder` is 100% self-contained vanilla HTML5, CSS3, and JavaScript with **zero external dependencies** and no build step required.

### One-Click Launch (Bash Script):

Run the provided launcher script:
```bash
./start.sh
# or:
./launch.sh
```

This script will:
1. Scan and detect an available network port (starts at 8080).
2. Start Python's built-in HTTP server.
3. Automatically launch your default web browser to the page (`xdg-open` / `sensible-browser`).
4. Gracefully shut down the server when you press `Ctrl+C`.

You can also specify a custom port:
```bash
./start.sh 9000
```

### Manual Alternative:

1. Open `index.html` directly in any web browser:
   ```bash
   xdg-open index.html
   ```

2. Or serve manually via Python:
   ```bash
   python3 -m http.server 8080
   ```
   Then open `http://localhost:8080` in your web browser.

---

## 📁 Project Structure

```
HHB_Builder/
├── index.html              # Main terminal interface & HUD layout
├── README.md               # Project documentation
├── css/
│   └── terminal.css        # Amber CRT phosphor styling, scanlines, box-drawing styles
└── js/
    ├── balloon-math.js     # Spline interpolation, volume/area integration, aerostatics
    ├── audio-synth.js      # Web Audio API retro terminal sound generator
    ├── profile-editor.js   # 2D interactive canvas profile editor with draggable handles
    ├── wireframe-3d.js     # 3D vector wireframe renderer with basket/burner & orbit camera
    ├── cutout-planner.js   # Gore/panel flat pattern generator, constraints & SVG exporter
    ├── flight-computer.js  # Buoyancy calculations, atmospheric densities & payload gauges
    └── app.js              # Master application controller and event coordinator
```

---

## 📜 Hot Air Balloon Engineering Formulas

### 1. Envelope Volume of Revolution
$$V = \pi \int_0^H r(z)^2 dz$$

### 2. Envelope Lateral Surface Area
$$A = 2\pi \int_0^H r(z) \sqrt{1 + \left(\frac{dr}{dz}\right)^2} dz$$

### 3. Flat Gore Width at Station $s$
$$W(s) = \frac{2\pi \cdot r(s)}{N_{\text{gores}}}$$

### 4. Ideal Gas Aerostatic Lift
$$\rho = \frac{P}{R_{\text{specific}} \cdot (T_{^\circ\text{C}} + 273.15)}$$
$$\Delta \rho = \rho_{\text{ambient}} - \rho_{\text{envelope}}$$
$$L_{\text{gross}} = V \cdot \Delta \rho \cdot g$$

### 5. Inverse Sizing Polynomial for Target Net Lift
When an envelope's geometry is scaled isotropically by a linear factor $k$:
$$V(k) = k^3 \cdot V_0, \quad A(k) = k^2 \cdot A_0$$
The net usable lift $L_{\text{net}}(k)$ in pounds satisfies:
$$a \cdot k^3 - b \cdot k^2 - c = 0$$
where:
$$a = V_0 \cdot \Delta \rho \cdot 2.20462 \quad (\text{lbs of gross lift at } k=1)$$
$$b = A_0 \cdot \rho_{\text{fabric}} \cdot (1 + f_{\text{waste}}) \cdot 2.20462 \quad (\text{lbs of envelope weight at } k=1)$$
$$c = L_{\text{target}} + W_{\text{fuel}} + W_{\text{container}} \quad (\text{target payload + fuel rig mass in lbs})$$
Solved numerically using Newton-Raphson iteration from initial guess $k_0 = \left(\frac{c}{a}\right)^{1/3} + \frac{b}{3a}$:
$$k_{n+1} = k_n - \frac{a \cdot k_n^3 - b \cdot k_n^2 - c}{3a \cdot k_n^2 - 2b \cdot k_n}$$

---

## 🛰 License
Open Source. Designed for balloon builders, pilots, and aerospace engineers.
