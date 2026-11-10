# Closed-Loop Inhibitory Shunting & Ring-Topology Lateral Inhibition

Implement real-time excess spike current shunting to inhibitory interneurons, distance-decayed ring lateral inhibition among cortical clusters, and criticality stabilization to lock the neural branching ratio ($\sigma$) at 1.0 while protecting the LTP/LTD plasticity ratio from runaway potentiation.

## User Review & Critical Decisions

> [!IMPORTANT]
> The architectural parameters below reflect the user's confirmed choices from Phase 1 interactive clarification:

- **Lateral Inhibition Topology**: **Ring topology with distance-decayed lateral inhibition** across cortical interneurons (N8–N15). When an interneuron fires strongly, it delivers distance-decayed negative inhibitory currents ($I_{inh} = -g_{lat} \cdot \exp(-d_{ring} / \lambda)$) to its neighbors on the circular topology, enforcing a soft Winner-Take-All (WTA) gate.
- **Criticality Shunt Safe Threshold**: **Dynamic rate envelope above 30.0 Hz setpoint** (against the 28.0 Hz biological baseline). Any instantaneous spike emissions exceeding this dynamic threshold are immediately routed into the inhibitory interneuron pool as negative current injection, stepping up inhibitory gain in proportion to the excess spike count ($g_{inh} \leftarrow g_{inh} + \Delta_{shunt}$).
- **UI & Telemetry Exposure**: Telemetry, live inhibitory gain steps, and lateral suppression vectors will be rendered across **both the Neural Topology canvas** (visual inhibitory wavefront arcs, WTA suppression halos, and current injection indicators) and the **Subsystem Integrity dashboard** (real-time Branching Ratio $\sigma = 1.0$ gauge, LTP/LTD ratio guard rail, and shunt event counters).

---

## 1. Overview & Core Concept

- **What It Does**:
  1. **Excess Spike Shunting to Inhibitory Interneurons**: When the network firing rate exceeds the safe 30.0 Hz ceiling, excess spikes are not allowed to trigger unconstrained recurrent feedback. Instead, the surplus spike count is shunted directly into the inhibitory interneuron pool as an instantaneous negative current injection. For every excess spike, the inhibitory gain dynamically scales up by the exact equivalent weight, locking the avalanche branching ratio $\sigma$ precisely at 1.0 (self-organized criticality).
  2. **Distance-Decayed Ring Lateral Inhibition (Local Winner-Take-All)**: When an interneuron receives a strong sensory afferent or cortical input and emits an action potential, it immediately emits inhibitory pulses to its topological neighbors on the ring ($N_8 \leftrightarrow N_9 \leftrightarrow \dots \leftrightarrow N_{15} \leftrightarrow N_8$). Weaker competing signals are suppressed below threshold, allowing only the highest-strength signal to propagate.
  3. **Plasticity Protection (STDP Stabilization)**: Because sub-threshold noise and rival spikes are suppressed by lateral inhibition, Spike-Timing-Dependent Plasticity (STDP) only reinforces the dominant, causal synaptic pathways, preventing the LTD/LTP ratio from spiraling or pinning weights to saturation limits.
- **Target Audience**: Neuromorphic systems researchers, computational neuroscientists, and neuromorphic edge hardware engineers monitoring autonomous bio-silicon self-stabilization.
- **Key Value**: Guarantees physical and numerical stability without artificial resets or hard clamps: the network self-organizes to the critical phase boundary ($\sigma = 1.0$) through natural neurobiological feedback mechanisms.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  - **Burst Injection & Shunt Verification**: The user selects `Burst` stimulus mode or pulses sensory channels E0–E7. The rate temporarily spikes above 30.0 Hz; the UI immediately visualizes the excess spike shunting mechanism stepping in, displaying instant negative current pulses into N8–N15 and the dynamic step-up of inhibitory gain.
  - **Lateral Ring Wavefront Inspection**: On the Neural Topology canvas, firing interneurons emit concentric ring-inhibition arcs to adjacent neighbor nodes, rendering suppressed neighbors in a temporary dimmed/hyperpolarized blue state while the winning neuron illuminates in high-contrast cyan/emerald.
  - **Criticality & Plasticity Gauges**: In the Subsystem Integrity dashboard, the user watches the branching ratio gauge snap to $\sigma = 1.00 \pm 0.02$, while the STDP Plasticity Balance indicator stays locked within the nominal biological range ($A_-/A_+ \approx 1.25$–$1.41\text{x}$) even under aggressive burst stimuli.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Clinical scientific instrumentation and aerospace telemetry (deep space obsidian `#07090E` canvas, crisp 1px hairline borders `#1E293B`, and phosphor accents).
  - *Color Palette & Semantic Tokens*:
    - Inhibitory Ring Suppression & Shunting: Electric Cobalt / GABAergic Indigo (`#6366F1` / `#818CF8`).
    - Critical Branching ($\sigma = 1.0$): Calibrated Phosphor Emerald (`#10B981` / `#34D399`).
    - Power & Saturated Excursions: Telemetry Amber (`#F59E0B`).
    - Resting / Muted Coordinates: Lab Slate (`#64748B` / `#334155`).
  - *Typography*: Clean geometric sans (`Plus Jakarta Sans`) for panel hierarchy; dedicated tabular monospace (`font-mono tabular-nums`) for exact voltages, branching ratios, and shunted spike counts.
- **Interactive Controls**:
  - **Lateral Ring Strength Slider ($g_{lat}$)**: Adjust lateral neighbor inhibition strength (0.0 to 2.5 mV).
  - **Shunt Sensitivity ($k_{shunt}$)**: Tune the inhibitory gain step-up factor per excess spike.
  - **Ring Topology Visualizer Overlay Toggle**: Enable/disable live visual lateral connection arcs and WTA winner halos.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Ring Topology vs. All-to-All Winner-Take-All**:
  - *Chosen Approach*: Ring topology where distance $d(i, j) = \min(|i - j|, 8 - |i - j|)$ on the 8-neuron interneuron layer ($N_8$ to $N_{15}$).
  - *Why*: All-to-all global inhibition causes global network silence (winner kills all other activity in the chip). Distance-decayed ring inhibition allows multiple spatial patterns to coexist in distinct topological sectors while preventing diffuse burst synchrony.
- **Decision 2: Instant Negative Current Injection vs. Passive Threshold Raising**:
  - *Chosen Approach*: Instant negative current ($I_{inh}$) injected directly into the LIF membrane equation ($v_{mem} \leftarrow v_{mem} - I_{shunt}$) coupled with step-up of the inhibitory synapse multiplier.
  - *Why*: Threshold manipulation alone has a delayed effect because neurons near threshold still discharge during the same frame. Negative current shunting immediately quenches membrane integration in real time.
- **Decision 3: Dual Canvas & Dashboard Visualization**:
  - *Chosen Approach*: Expose lateral ring inhibition arcs on `NeuralTopologyCanvas` and quantitative avalanche metrics ($\sigma$, shunted spike counters, and inhibitory gain multiplier) on `SubsystemIntegrityDashboard`.
  - *Why*: Gives both spatial intuition (how neighbors suppress each other) and quantitative proof of homeostatic self-stabilization.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        SNN SIMULATION ENGINE                           │
│                                                                        │
│   Afferent Spikes (E0-E7) ──> Interneuron Integration (N8-N15)        │
│                                           │                            │
│           ┌───────────────────────────────┴────────────────────────┐   │
│           │                                                        │   │
│           ▼                                                        ▼   │
│   [Local Signal Check]                                    [Rate Monitor]│
│   Neuron N_i fires strongly                                Rate > 30 Hz│
│           │                                                        │   │
│           ▼                                                        ▼   │
│   [Ring Lateral Inhibition]                               [Excess Shunt]│
│   Inhibitory pulse to neighbors:                           Surplus spikes│
│   d = min(|i-j|, 8-|i-j|)                                  shunted to N8-N15│
│   I_inh = -g_lat * exp(-d / λ)                             g_inh += Δ_step│
│           │                                                        │   │
│           ▼                                                        ▼   │
│   Only strongest pathway survives                         Branching σ  │
│   STDP rewards only clear signals                         locked at 1.0│
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                             TELEMETRY                                  │
│  - branchingRatio: 1.00                                                │
│  - lateralInhibitionEvents: count & active arcs                        │
│  - shuntedSpikeCount: excess spikes quenched                           │
│  - inhibitoryGainRatio: dynamic step-up value                          │
└────────────────────────────────────────────────────────────────────────┘
               │                                            │
               ▼                                            ▼
┌──────────────────────────────┐            ┌────────────────────────────┐
│    NeuralTopologyCanvas      │            │ SubsystemIntegrityDashboard│
│  - Ring inhibitory arcs      │            │  - Criticality gauge (σ)   │
│  - Dimmed suppressed nodes   │            │  - Shunted spike metrics   │
│  - Active WTA winner halos   │            │  - Plasticity balance guard│
└──────────────────────────────┘            └────────────────────────────┘
```

### Core Mathematical Formulations

1. **Distance-Decayed Ring Lateral Inhibition**:
   For any firing interneuron $i \in \{8, \dots, 15\}$:
   $$d_{ring}(i, j) = \min(|i - j|, 8 - |i - j|), \quad \text{for } j \in \{8, \dots, 15\}, j \neq i$$
   $$I_{lateral}(j) = -g_{lat} \cdot \exp\left(-\frac{d_{ring}(i, j)}{\lambda}\right)$$
   Where $g_{lat} = 1.4\text{ mV}$ (tunable) and decay constant $\lambda = 1.25$.
   When neuron $i$ fires, $I_{lateral}(j)$ is subtracted immediately from $v_{mem}(j)$ and sets an ephemeral lateral suppression flag.

2. **Excess Spike Shunting to Inhibitory Interneurons & Criticality Lock**:
   Given instantaneous rate $R_{inst}$ (Hz) and safe threshold $R_{safe} = 30.0\text{ Hz}$:
   $$\text{Excess Spikes } N_{excess} = \max\left(0, \frac{R_{inst} - R_{safe}}{\text{frame rate}}\right)$$
   $$\Delta I_{shunt} = N_{excess} \cdot k_{current} \quad (k_{current} = 1.8\text{ mV/spike})$$
   $$\text{Inhibitory Gain Step: } g_{inh} \leftarrow g_{inh} + N_{excess} \cdot \Delta_{gain} \quad (\Delta_{gain} = 0.045)$$
   Each interneuron in the inhibitory pool receives instant negative current $- \Delta I_{shunt} / 8$, quenching runaway cascades and holding the generational branching ratio:
   $$\sigma = \frac{\langle N_{generation+1} \rangle}{\langle N_{generation} \rangle} \longrightarrow 1.00$$

3. **STDP Protection**:
   Because lateral inhibition suppresses sub-threshold co-activations, STDP updates:
   $$\Delta w_{ij} = \begin{cases} A_+ e^{-\Delta t / \tau_+} & \text{if winner fires causal spike} \\ -A_- e^{\Delta t / \tau_-} & \text{for suppressed competing paths} \end{cases}$$
   Only the clear, winner pathway receives potentiation, maintaining $A_- / A_+ \ge 1.25$.

### File Touchpoints (Implementation Phase)

- `src/types.ts`: Add `lateralInhibitionConfig`, `shuntedSpikeCount`, `lateralInhibitionEvents`, and `ringInhibitionActive` to `HardwareTelemetry` and engine types.
- `src/lib/snnEngine.ts`: Implement `applyRingLateralInhibition()`, `shuntExcessSpikesToInhibitors()`, ring distance calculator, and dynamic branching ratio tracking.
- `src/components/NeuralTopologyCanvas.tsx`: Render dynamic ring-topology inhibitory wavefront arcs, suppressed node dimming, and winner glow halos.
- `src/components/SubsystemIntegrityDashboard.tsx`: Add dedicated Criticality ($\sigma = 1.0$) indicator, excess spike shunt counter, and lateral inhibition diagnostic card.
- `src/components/NeuralStabilityPanel.tsx`: Display real-time WTA gating efficiency and plasticity protection status.
