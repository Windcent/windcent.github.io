# Hull Lab — 2D Hydrodynamic Planing & Displacement Simulation

An interactive, real-time 2D side-view hydrodynamic simulation comparing a **Planing Hull** (flat-bottom skiff) and a **Displacement Hull** (rockered round-bilge trawler) across displacement, hump transition, semi-planing, and full-planing regimes.

Built as a self-contained single-file web application ([main.html](./main.html)) using HTML5 Canvas and Tailwind CSS with zero build dependencies.

---

## Quick Start

Run the local launcher script (binds an available localhost port and opens the simulation in your browser):

```bash
./launch.sh        # Defaults to port 8080 (auto-increments if busy)
./launch.sh 9000   # Optional custom starting port
```

Or open `main.html` directly in any modern browser.

---

## Interactive Controls & Telemetry

### Right Side Pane
- **Hull Type Selector**: Toggle between **Planing Hull** ($0\text{–}35\text{ kn}$) and **Displacement Hull** ($0\text{–}20\text{ kn}$).
- **Live Readout**: Boat speed in knots ($\text{kn}$) and $\text{m/s}$, plus trim angle $\theta$ in degrees ($^\circ$, positive = bow up).
- **Vertical Speed Bar & POI Markers**: Drag/click the track or click named regime markers (**Rest**, **Cruise/Displacement**, **Hump**, **Semi**, **Plane**, **Max**) for smooth cubic-eased speed transitions. Keyboard arrow keys are also supported (`Shift` for larger steps).
- **CG Control & Slow Auto-Sweep**: Adjust longitudinal center of gravity fraction $\text{LCG}/L \in [0.30, 0.50]$ (Aft $\leftrightarrow$ Fwd), or enable **Sweep** for a slow sinusoidal oscillation (~21 s period).
- **Weight Control & Slow Auto-Sweep**: Adjust weight multiplier $s_w \in [0.50, 1.50]$ (Light $\leftrightarrow$ Heavy), scaling mass $m$, weight $W$, and pitch inertia $I_{yy}$ proportionally, or enable **Sweep** (~21 s period).
- **Force Vectors Toggle**: Show/hide live force vectors (**B** Buoyancy, **L** Lift, **D** Drag, **T** Thrust, **F** Total) scaled against nominal hull weight.
- **Playback Controls**: **Pause/Play**, **Ramp** (continuous speed sweep), and **Reset**.

### Canvas Overlays
- **Top-Left HUD**:
  - Active hydrodynamic regime badge + live Froude number ($Fr$), Reynolds number ($Re$), and Drag ($D / 1000$).
  - **Static B vs. Dynamic L** ratio bar showing the share of vertical support from hydrostatic buoyancy vs. dynamic planing lift.
  - **Drag Sources** ratio bar showing the share of **Wave**, **Induced**, and **Skin** drag.
  - Regime-specific hydrodynamic notes.
- **Top-Right Graph**: Live **Drag vs. Speed** steady-state curve plotting **Total**, **Wave**, **Induced**, and **Skin** drag across the active hull's speed envelope, updating dynamically as hull type, CG, or weight changes, with a live speed hairline.

---

## Physical Constants & Hull Profiles

All physics are computed in SI units ($\text{m}, \text{kg}, \text{s}, \text{N}$):

| Constant | Symbol | Value | Description |
| :--- | :---: | :---: | :--- |
| Gravitational acceleration | $g$ | $9.81\ \text{m/s}^2$ | Standard gravity |
| Seawater density | $\rho$ | $1025.0\ \text{kg/m}^3$ | Sea-level saltwater density |
| Kinematic viscosity | $\nu$ | $1.19 \times 10^{-6}\ \text{m}^2/\text{s}$ | Seawater at $\sim 15^\circ\text{C}$ |
| Air density | $\rho_{\text{air}}$ | $1.225\ \text{kg/m}^3$ | Used for bow ground-effect lift |
| Knots to $\text{m/s}$ | — | $0.514444$ | Exact speed conversion |

### Hull Profiles (`HULL_PROFILES`)

| Parameter | Symbol | Planing Hull (`skiff`) | Displacement Hull (`trawler`) |
| :--- | :---: | :---: | :---: |
| Length overall | $L$ | $5.0\ \text{m}$ | $5.0\ \text{m}$ |
| Flat keel end | $x_{\text{flat}}$ | $3.90\ \text{m}$ | $3.35\ \text{m}$ |
| Bow rake height / exponent | $h_{\text{bow}}, n_{\text{bow}}$ | $0.44\ \text{m},\ 2.15$ | $0.54\ \text{m},\ 2.00$ |
| Transom / bow sheer height | $h_{\text{tr}}, h_{\text{sh}}$ | $0.62\ \text{m},\ 0.80\ \text{m}$ | $0.78\ \text{m},\ 1.12\ \text{m}$ |
| Flat / bow-tip beam | $B_{\text{flat}}, B_{\text{tip}}$ | $1.45\ \text{m},\ 0.90\ \text{m}$ | $1.68\ \text{m},\ 0.72\ \text{m}$ |
| Nominal mass | $m_0$ | $1150\ \text{kg}$ | $1780\ \text{kg}$ |
| Nominal pitch inertia | $I_{yy,0}$ | $1880\ \text{kg}\cdot\text{m}^2$ | $2950\ \text{kg}\cdot\text{m}^2$ |
| Vertical CG above keel | $z_{\text{CG}}$ | $0.36\ \text{m}$ | $0.44\ \text{m}$ |
| Bottom panel count | $N_p$ | $44$ | $44$ |
| Planing lift efficiency | $k_{\text{planing}}$ | $1.00$ | $0.16$ |
| Transom ventilation scale | $k_{\text{vent}}$ | $1.00$ | $0.22$ |
| Wave drag scale | $k_{\text{wave}}$ | $1.00$ | $2.25$ |
| Max speed | $V_{\max}$ | $35.0\ \text{kn}$ | $20.0\ \text{kn}$ |

With the Weight slider multiplier $s_w \in [0.50, 1.50]$:

$$m = s_w \, m_0, \qquad W = m g, \qquad I_{yy} = s_w \, I_{yy,0}$$

---

## Coordinate Systems & Hull Geometry

- **Boat-local frame** $(x_l, z_l)$: $x_l = 0$ at the transom, $x_l = L$ at the bow stem; $z_l = 0$ at the baseline flat keel, positive upward.
- **World frame** $(X, Z)$: $X$ positive forward (right), $Z = 0$ at the undisturbed mean waterline, positive upward. Positive pitch/trim angle $\theta > 0$ is **bow up** (counterclockwise).
- **Rigid-body transform** from local $(x_l, z_l)$ to world $(X, Z)$ given heave $Z_{\text{CG}}$, trim $\theta$, and LCG fraction $f_{\text{LCG}} = x_{\text{CG},l} / L$:

$$X_{\text{CG}} = x_{\text{CG},l} - \frac{L}{2}, \qquad \Delta x = x_l - x_{\text{CG},l}, \qquad \Delta z = z_l - z_{\text{CG}}$$

$$X = X_{\text{CG}} + \Delta x \cos\theta - \Delta z \sin\theta, \qquad Z = Z_{\text{CG}} + \Delta x \sin\theta + \Delta z \cos\theta$$

Vertical velocity of any panel midpoint with heave velocity $v_z$ and pitch rate $\omega = \dot{\theta}$:

$$v_{z,i} = v_z + \omega \, (\Delta x_i \cos\theta - \Delta z_i \sin\theta)$$

### Keel Elevation $z_{\text{keel}}(x_l)$ & Local Beam $B(x_l)$

- **Planing Hull**:
  $$z_{\text{keel}}(x_l) = \begin{cases} 0 & x_l \le x_{\text{flat}} \\ h_{\text{bow}} \left(\dfrac{x_l - x_{\text{flat}}}{L - x_{\text{flat}}}\right)^{n_{\text{bow}}} & x_l > x_{\text{flat}} \end{cases}$$
  $$B(x_l) = \begin{cases} B_{\text{flat}} & x_l \le x_{\text{flat}} \\ B_{\text{flat}} - (B_{\text{flat}} - B_{\text{tip}})\left(\dfrac{x_l - x_{\text{flat}}}{L - x_{\text{flat}}}\right)^{1.5} & x_l > x_{\text{flat}} \end{cases}$$

- **Displacement Hull** (adds a rockered aft run for $x_l < 1.35\ \text{m}$ and tapered waterlines fore and aft):
  $$z_{\text{keel}}(x_l) = 0.20 \left(\frac{1.35 - x_l}{1.35}\right)^{1.85} \quad (x_l < 1.35\ \text{m})$$
  $$B(x_l) = B_{\text{flat}} - (B_{\text{flat}} - B_{\text{tip}})\left(\min\!\left(1, \frac{|x_l / L - 0.45|}{0.55}\right)\right)^{1.8}$$

The hull bottom is discretized into $N_p = 44$ linear panels with midpoint $(x_{m,i}, z_{m,i})$, arc length $\Delta s_i$, local beam $B_i = B(x_{m,i})$, and panel slope angle $\beta_i = \operatorname{atan2}(\Delta z_i, \Delta x_i)$.

---

## Water Surface Model

The total water surface elevation $\eta(X, t)$ and slope $\partial \eta / \partial X$ combine a **quasi-steady hump wave** and a **1D dynamic wave PDE**:

$$\eta(X, t) = \eta_{\text{dyn}}(X, t) + \eta_{\text{hump}}(X, U), \qquad \frac{\partial \eta}{\partial X} = \frac{\partial \eta_{\text{dyn}}}{\partial X} + \frac{\partial \eta_{\text{hump}}}{\partial X}$$

### 1. Quasi-Steady Transverse Hump Wave (`sampleHumpWave`)

Models the Kelvin-like bow crest and stern trough that peaks near hull-speed hump resonance ($Fr_L \approx 0.56$) and flattens at supercritical planing speeds:

$$Fr_L = \frac{U}{\sqrt{g L}}, \qquad E_{\text{hump}} = \exp\!\left(-\left(\frac{Fr_L - 0.56}{0.16}\right)^2\right)$$

$$\lambda = \operatorname{clamp}\!\left(\frac{2\pi U^2}{g},\ 2.6,\ 13.5\right), \qquad k = \frac{2\pi}{\lambda}, \qquad d = X - 1.65$$

$$E_{\text{spatial}}(d) = \begin{cases} \exp\!\left(-(d / 1.15)^2\right) & d > 0 \\ \exp(d / 7.5) & d \le 0 \end{cases}$$

$$\eta_{\text{hump}}(X, U) = 0.175 \, E_{\text{hump}} \, E_{\text{spatial}}(d) \cos(k d)$$

The local slope $\partial \eta_{\text{hump}} / \partial X$ is evaluated analytically by differentiating the product $E_{\text{spatial}}(d)\cos(kd)$.

### 2. 1D Coupled Dynamic Wave PDE (`WaveField`)

Solved on a uniform 1D grid of $N = 240$ nodes over $X \in [-7.5, 8.5]\ \text{m}$ ($\Delta X \approx 0.0669\ \text{m}$) with intrinsic wave phase speed $c = 3.85\ \text{m/s}$:

1. **Semi-Lagrangian Advection** (sweeps wakes aft at boat speed $U$):
   $$\eta^*(X_i) = \eta(X_i + U \Delta t), \qquad v^*(X_i) = v(X_i + U \Delta t)$$

2. **Damped Restoring Wave Integration**:
   $$\frac{\partial^2 \eta_{\text{dyn}}}{\partial t^2} = c^2 \frac{\partial^2 \eta^*}{\partial X^2} - \kappa_{\text{rest}} \eta^* - \left(\gamma + \gamma_{\text{sponge}}(i)\right) v^* - P_{\text{hull}}(X_i)$$
   where $\kappa_{\text{rest}} = 3.2\ \text{s}^{-2}$, $\gamma = 1.65\ \text{s}^{-1}$, and an outflow sponge layer $\gamma_{\text{sponge}}(i) = 9.0 \left(\frac{18 - i}{18}\right)^2$ for $i < 18$ prevents reflections at the left boundary. Elevation is softly clamped to $|\eta_{\text{dyn}}| \le 0.42\ \text{m}$.

3. **Two-Way Hull-to-Water Coupling**:
   - Each submerged panel deposits a downward pressure impulse onto adjacent grid nodes:
     $$P_{\text{down}, i} = \left(2.8 \, d_i + 0.55 \max(0, -v_{\text{rel},i})\right)(0.4 + 0.55 U)$$
   - Just ahead of the stagnation point ($X_{\text{stag}} + 0.22\ \text{m}$, for $U > 1\ \text{m/s}$), a localized upward bow pile-up impulse is injected:
     $$P_{\text{bow}} = -0.35 \min(6.0, U)\left(0.5 + 0.5 \sin(4\max(0, \theta))\right)$$

---

## 2-DOF Panel Hydrodynamic Force & Moment Equations

At speed $U = V_{\text{kn}} \times 0.514444\ \text{m/s}$:

$$q = \frac{1}{2} \rho U^2, \qquad Fr_L = \frac{U}{\sqrt{g L}}, \qquad Re = \frac{U L_w}{\nu}$$

For each bottom panel $i$, submergence depth is $d_i = \eta(X_i) - Z_i$. A panel is wetted when $d_i > 0$. The leading wetted edge (stagnation point $x_{\text{stag}}$) is found by linear zero-crossing interpolation between the last wetted panel and the first dry panel, yielding wetted length $L_w = \max(0.05, x_{\text{stag}} - x_{\text{start}})$.

For each wetted panel $i$, define:
- Total pitch angle: $\phi_i = \theta + \beta_i$
- Horizontal projection: $\Delta x_{h,i} = \Delta s_i \max(0.15, \cos\phi_i)$
- Pitch moment arm: $r_i = X_i - X_{\text{CG}}$
- Normalized wetted coordinate: $\xi_i = \operatorname{clamp}(x_{m,i} / \max(0.15, x_{\text{stag}}), 0, 1)$ ($0$ at transom, $1$ at stagnation edge)

### (A) Hydrostatic Buoyancy ($B$)

Once supercritical flow clears the sharp transom ($Fr_L > 0.28$), atmospheric ventilation relieves aft hydrostatic pressure:

$$f_{\text{vent}} = \operatorname{clamp}\!\left(\frac{Fr_L - 0.28}{0.62}, 0, 1\right) k_{\text{vent}}$$

$$R_{\text{buoy},i} = 1 - 0.58 \, f_{\text{vent}} (1 - \xi_i)^{0.75}$$

$$F_{B,i} = \rho g \, d_i \, B_i \, \Delta x_{h,i} \, R_{\text{buoy},i}, \qquad \tau_{B,i} = r_i F_{B,i}$$

### (B) Dynamic Planing Lift ($L$, Savitsky-Inspired)

- **Aspect-ratio lift factor** ($\lambda_{\text{AR}} = \max(0.45, L_w / B_{\text{flat}})$):
  $$K_{\text{AR}} = \frac{1.38}{\sqrt{\lambda_{\text{AR}}}}$$
- **Stagnation-concentrated pressure distribution** (shifts CP forward toward $\sim 0.82\text{–}0.86\,L_w$ as planing develops):
  $$b_{\text{plane}} = \operatorname{clamp}\!\left(\frac{Fr_L - 0.45}{0.85}, 0, 1\right), \qquad p = 2.6 + 2.0 \, b_{\text{plane}}$$
  $$w_{\text{dist}}(\xi_i) = (p + 1) \, \xi_i^p \qquad \left(\int_0^1 w_{\text{dist}}(\xi)\,d\xi = 1\right)$$
- **Effective angle of attack** (accounting for local wave slope $\alpha_{\text{wave}} = \arctan(\partial \eta/\partial X)$ and relative vertical velocity $v_{\text{rel},i} = v_{z,i} - v_{\text{water},i}$):
  $$\alpha_{\text{eff},i} = \phi_i - \alpha_{\text{wave},i} - \frac{v_{\text{rel},i}}{U + 2.2}$$
- **Local lift coefficient & panel lift** (for $\alpha_{\text{eff},i} > 0.001$ and $U > 0.2\ \text{m/s}$):
  $$C_{L,i} = K_{\text{AR}} \left(\sin\min(0.65, \alpha_{\text{eff},i})\right)^{1.08} (\cos\beta_i)^{2.2} \, k_{\text{planing}}$$
  $$r_{\text{entry},i} = \min\!\left(1, \frac{d_i}{0.025}\right)$$
  $$F_{L,i} = q \, B_i \, \Delta x_{h,i} \, C_{L,i} \, w_{\text{dist}}(\xi_i) \, r_{\text{entry},i}, \qquad \tau_{L,i} = r_i F_{L,i}$$

### (C) Hydrodynamic Radiation & Added-Mass Damping

$$c_{\text{damp}} = 1450.0 \, (1 + 0.42 \, U)$$

$$F_{\text{damp},i} = -c_{\text{damp}} \, B_i \, \Delta x_{h,i} \, v_{\text{rel},i}, \qquad \tau_{\text{damp},i} = r_i F_{\text{damp},i}$$

### (D) Drag Breakdown ($D$)

Total hydrodynamic drag is the sum of three components:

$$D_{\text{total}} = D_{\text{wave}} + D_{\text{induced}} + D_{\text{skin}}$$

1. **Lift-Induced Pressure Drag**:
   $$D_{\text{induced}} = F_{L,\text{total}} \tan(\max(0, \theta))$$
2. **Viscous Skin Friction Drag** ($C_f = 0.0036$):
   $$D_{\text{skin}} = q \, C_f \, B_{\text{flat}} \, L_w$$
3. **Wave-Making Drag** (resonant hump peak + displacement hull-speed resistance wall):
   $$D_{\text{hump}} = 0.14 \, W \exp\!\left(-\left(\frac{Fr_L - 0.56}{0.17}\right)^2\right)$$
   $$D_{\text{wall}} = \begin{cases} 0.18 \, W \left(\max(0, Fr_L - 0.38)\right)^{1.65} & \text{Displacement Hull} \\ 0 & \text{Planing Hull} \end{cases}$$
   $$D_{\text{wave}} = k_{\text{wave}} \, D_{\text{hump}} + D_{\text{wall}}$$

### (E) Propulsion Thrust ($T$) & Thrust Moment

Thrust acts along the hull axis to balance drag and longitudinal acceleration $a_x = \dot{U}$, capped at $0.55\,W$:

$$T = \min\!\left(0.55\,W,\ \frac{\max(0, D_{\text{total}} + m a_x)}{\max(0.5, \cos\theta)}\right)$$

$$T_x = T \cos\theta, \qquad T_z = T \sin\theta$$

$$\tau_{\text{prop}} = T \, z_{\text{arm}} - D_{\text{skin}} \, z_{\text{CG}}, \qquad z_{\text{arm}} = \begin{cases} 0.42\ \text{m} & \text{Planing Hull (outboard)} \\ 0.22\ \text{m} & \text{Displacement Hull (inboard shaft)} \end{cases}$$

### (F) High-Speed Aerodynamic Bow Cushion

Under the dry forward hull length $L_{\text{dry}} = \max(0, L - L_w)$:

$$F_{\text{aero}} = \frac{1}{2} \rho_{\text{air}} U^2 \, B_{\text{flat}} \, L_{\text{dry}} \, (0.42) \max(0, \sin\theta)$$

$$\tau_{\text{aero}} = F_{\text{aero}} \left(x_{\text{stag}} + \frac{L_{\text{dry}}}{2} - x_{\text{CG},l}\right)$$

### (G) Reserve-Buoyancy Pitch Restoring & Rotational Damping

A progressive nonlinear pitch restoring torque acts beyond a soft trim threshold $\theta_{\text{soft}}$ ($0.105\ \text{rad} \approx 6.0^\circ$ Planing, $0.075\ \text{rad} \approx 4.3^\circ$ Displacement) or bow-down below $-0.04\ \text{rad}$:

$$\tau_{\text{trim}} = \begin{cases} -k_{\text{rest}} \, e \, (1 + 14 e), & e = \theta - \theta_{\text{soft}} > 0 \\ +22000 \, e \, (1 + 10 e), & e = -0.04 - \theta > 0 \\ 0 & \text{otherwise} \end{cases}$$

with $k_{\text{rest}} = 21000$ (Planing) or $28000$ (Displacement), plus global rotational damping $\tau_{\text{global}} = -c_\omega \omega$ ($c_\omega = 780$ Planing, $1150$ Displacement).

### Net Equations of Motion & Centers of Action

$$F_{\text{total},Z} = F_{B,\text{total}} + F_{L,\text{total}} + F_{\text{aero}} + F_{\text{damp},\text{total}} + T_z - W$$

$$\tau_{\text{total}} = \tau_{B,\text{total}} + \tau_{L,\text{total}} + \tau_{\text{damp},\text{total}} + \tau_{\text{prop}} + \tau_{\text{aero}} + \tau_{\text{trim}} + \tau_{\text{global}}$$

$$\ddot{Z}_{\text{CG}} = \frac{F_{\text{total},Z}}{m}, \qquad \ddot{\theta} = \frac{\tau_{\text{total}}}{I_{yy}}$$

Combined hydrodynamic Center of Pressure on the keel:

$$x_{\text{CP},l} = \frac{\sum_i x_{m,i} (F_{B,i} + F_{L,i})}{F_{B,\text{total}} + F_{L,\text{total}}}$$

---

## Numerical Integration & Solvers

- **Real-Time Loop**: Fixed-timestep semi-implicit (symplectic) Euler integrator with $\Delta t = 1/180\ \text{s}$ inside an accumulator driven by `requestAnimationFrame`.
- **Transom Freeboard Constraint (`enforceHullConstraints`)**: Guards numerical stability ($|\theta| \le 0.61\ \text{rad}$) and ensures the transom top never submerges below $\max(0, \eta_{\text{transom}}) + 0.05\ \text{m}$.
- **Steady-State Equilibrium Solver (`solveSteadyState`)**: Uses damped relaxation ($\Delta t = 0.022\ \text{s}$, velocity decay factor $0.84$, 150 iterations) with the quasi-steady hump wave to compute rest/equilibrium trim and draft.
- **Drag vs. Speed Graph (`computeDragCurve`)**: Sweeps 36 speed samples from $0$ to $V_{\max}$ using warm-started continuation (45 damped iterations per sample) and caches results keyed by `(hullType, CG, weightScale)` with throttling during auto-sweeps.

---

## Hydrodynamic Regimes

Regime classification is driven by length Froude number $Fr_L = U / \sqrt{g L}$:

| Regime | Froude Number ($Fr_L$) | Approx. Speed ($L = 5\ \text{m}$) | Dominant Physics |
| :--- | :---: | :---: | :--- |
| **Displacement** | $Fr_L < 0.44$ | $0\text{–}6\ \text{kn}$ | Hydrostatic buoyancy supports weight; full keel wetted; low wave drag. |
| **Hump Transition** | $0.44 \le Fr_L < 0.81$ | $6\text{–}11\ \text{kn}$ | Hull sits in its stern trough behind a steep bow wave; peak wave-making drag & bow-up trim. |
| **Semi-Planing** | $0.81 \le Fr_L < 1.29$ | $11\text{–}17.5\ \text{kn}$ | Dynamic lift overtakes buoyancy; transom ventilates; wetted keel shortens; wave drag falls (Planing Hull). |
| **Full Planing** | $Fr_L \ge 1.29$ | $17.5+\ \text{kn}$ | Dynamic stagnation lift dominates; minimal aft wetted keel; CP concentrates near leading edge. |

---

## Model Simplifications & Scope

This simulation is designed as an interactive visual aid rather than a full CFD solver:
- Uses a **2D side-view strip/panel formulation** (heave $Z_{\text{CG}}$ and pitch $\theta$, with prescribed forward speed $U$ rather than a full propeller curve).
- Represents the free surface with a **1D advected wave equation** superposed with an analytical transverse hump wave (no 3D Kelvin divergent wave pattern or chine spray sheet physics).
- Uses **Savitsky-inspired empirical forms** for planing lift, transom ventilation, and wave/skin drag coefficients tuned for smooth real-time stability across both hull archetypes.
