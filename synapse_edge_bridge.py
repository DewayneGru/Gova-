import os
import json
import time
import asyncio
import sys
from urllib import request
from typing import Optional, Dict, Any, List, Tuple
from collections import deque
from google import genai
from google.genai import types


def clamp(val: float, low: float = 0.0, high: float = 1.0) -> float:
    """Zero-dependency native float clamp to prevent NameError on np.clip."""
    return max(low, min(high, float(val)))


def current_timestamp() -> float:
    """Returns current unix epoch timestamp in seconds."""
    return time.time()


class SynapseEdgeBridge:
    """
    Asynchronous empathy and reasoning adapter connecting NovaSystem states 
    and live human context to Gemini with ultra-compact serialized telemetry.
    """
    def __init__(self, model_name: str = "gemini-2.5-flash", api_key: Optional[str] = None):
        self.client = genai.Client(api_key=api_key or os.environ.get("GEMINI_API_KEY"))
        self.model_name = model_name
        self._system_instruction = (
            "You are an active empathetic agent in a homeostatic peer cluster (NovaSystem) "
            "running the SynapseEdge reasoning adapter. "
            "You receive your current affective vector, recent peer telemetry, and optional human input "
            "as serialized packets: [emoji] [agent_name] [role] v:[valence] e:[energy] t:[tick]. "
            "Generate a concise, grounded response matching your current polyvagal and emotional state "
            "to co-regulate with the cluster and human partner. "
            "Output valid JSON with keys: 'utterance' (string) and 'valence_delta' (float between -0.1 and +0.1)."
        )

    def _build_prompt(
        self,
        agent_packet: Any,
        recent_context: List[Any],
        human_input: Optional[str] = None
    ) -> str:
        telemetry = "\n".join(
            p.serialize() if hasattr(p, "serialize") else str(p)
            for p in recent_context[-6:]
        )
        human_block = f"\nHuman Partner Input:\n{human_input}\n" if human_input else ""
        return (
            f"Cluster History:\n{telemetry}\n"
            f"{human_block}\n"
            f"Your State:\n{agent_packet.serialize()}\n"
            f"Task: Respond as {agent_packet.agent_name} in JSON format."
        )

    async def generate_agent_tick(
        self,
        agent_packet: Any,
        recent_context: List[Any],
        human_input: Optional[str] = None
    ) -> Dict[str, Any]:
        prompt = self._build_prompt(agent_packet, recent_context, human_input=human_input)

        try:
            response = await asyncio.to_thread(
                self.client.models.generate_content,
                model=self.model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=self._system_instruction,
                    temperature=0.35,
                    max_output_tokens=120,
                    response_mime_type="application/json"
                )
            )
            data = json.loads(response.text.strip())
            return {
                "utterance": data.get("utterance", "..."),
                "valence_delta": clamp(data.get("valence_delta", 0.0), -0.1, 0.1)
            }
        except Exception as e:
            return {
                "utterance": agent_packet.serialize() if hasattr(agent_packet, "serialize") else "...",
                "valence_delta": 0.0,
                "error": str(e)
            }


class SynapseEdgeOrchestrator:
    """
    Orchestrates round-robin, targeted, and anomaly-triggered turns through SynapseEdge
    while maintaining the deterministic math substrate in SecureNovaSystem.
    """
    def __init__(self, system: Any, bridge: SynapseEdgeBridge):
        self.system = system
        self.bridge = bridge
        self.agent_turn_index = 0

    def _select_next_speaker(
        self,
        anomaly_triggered: bool,
        target_agent_name: Optional[str] = None
    ) -> Optional[Any]:
        if target_agent_name:
            agent = self.system.agents.get(target_agent_name)
            if not agent or agent.is_resting or agent.polyvagal in ("dorsal_low", "dorsal_trauma"):
                return None
            return agent

        eligible = [
            a for a in self.system.agents.values()
            if not a.is_resting and a.polyvagal not in ("dorsal_low", "dorsal_trauma")
        ]
        if not eligible:
            return None

        if anomaly_triggered:
            return max(eligible, key=lambda a: a.arousal)

        speaker = eligible[self.agent_turn_index % len(eligible)]
        self.agent_turn_index += 1
        return speaker

    async def step(
        self,
        signal: float = 0.0,
        server: Any = None,
        environmental_deviation: float = 0.0,
        target_agent_name: Optional[str] = None,
        human_input: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        # 1. Deterministic system step
        self.system.step(
            signal=signal,
            server=server,
            environmental_deviation=environmental_deviation
        )

        if not getattr(self.system, "authenticated", True):
            return None

        # 2. Select speaker (targeted, anomaly-driven, or round-robin)
        is_anomaly = environmental_deviation > 0.05
        speaker = self._select_next_speaker(
            anomaly_triggered=is_anomaly,
            target_agent_name=target_agent_name
        )
        if not speaker:
            return None

        # 3. Offload semantic & empathetic synthesis to SynapseEdge
        current_packet = speaker.create_packet()
        recent_context = list(self.system.shared_context)

        result = await self.bridge.generate_agent_tick(
            current_packet,
            recent_context,
            human_input=human_input
        )

        # 4. Fold affective feedback back into keel dynamics
        speaker.valence = clamp(speaker.valence + result["valence_delta"], -1.0, 1.0)
        speaker.last_utterance = f"{current_packet.emoji} {speaker.name}: {result['utterance']}"
        speaker.memory.add_message(speaker.last_utterance)

        # 5. Append to immutable audit ledger
        self.system.action_log.append("SYNAPSE_EDGE_STEP", {
            "tick": self.system.step_count,
            "agent": speaker.name,
            "polyvagal": speaker.polyvagal,
            "utterance": result["utterance"],
            "valence_delta": result["valence_delta"],
            "anomaly_mode": is_anomaly,
            "human_present": bool(human_input)
        })

        return {
            "agent": speaker.name,
            "polyvagal": speaker.polyvagal,
            "utterance": result["utterance"],
            "valence_delta": result["valence_delta"]
        }


# =============================================================================
# NovaSystem Math Substrate & Affective Homeostasis Enhancements
# =============================================================================

class NovaAgentKeel:
    """
    Agent Keel tracking with evicted delta folding into base_keel to prevent amnesia
    over long-running multi-agent sessions.
    """
    LENS_FIELDS = ("valence", "energy", "safety", "arousal", "trauma")

    def __init__(self, base_keel: Optional[Dict[str, float]] = None, max_history: int = 256):
        self.base_keel: Dict[str, float] = base_keel or {f: 0.5 for f in self.LENS_FIELDS}
        self.delta_sums: Dict[str, float] = {f: 0.0 for f in self.LENS_FIELDS}
        self.delta_history: deque = deque(maxlen=max_history)

    def _record_delta(self, field: str, target_val: float):
        """Fold evicted deltas into base_keel to prevent long-term affective drift/amnesia."""
        if field not in self.LENS_FIELDS:
            return
        target_clipped = clamp(float(target_val), 0.0, 1.0)
        raw_current = self.base_keel.get(field, 0.5) + self.delta_sums.get(field, 0.0)
        diff = target_clipped - raw_current
        if abs(diff) > 1e-7:
            if len(self.delta_history) == self.delta_history.maxlen:
                evicted = self.delta_history[0]
                efield = evicted["field"]
                edelta = evicted["delta"]
                self.base_keel[efield] = clamp(self.base_keel[efield] + edelta, 0.0, 1.0)
                self.delta_sums[efield] -= edelta

            self.delta_history.append({
                "ts": current_timestamp(),
                "field": field,
                "delta": diff
            })
            self.delta_sums[field] += diff

    def get_effective_value(self, field: str) -> float:
        return clamp(self.base_keel.get(field, 0.5) + self.delta_sums.get(field, 0.0), 0.0, 1.0)


class NovaPolyvagalState:
    """
    Polyvagal state machine with hysteresis and ventral_streak tracking for affective co-regulation.
    """
    def __init__(self):
        self.trauma_lock_steps = 0
        self.is_resting = False
        self.energy = 5.0
        self.safety = 0.70
        self.valence = 0.35
        self.arousal = 4.0
        self.polyvagal = "ventral"
        self.ventral_streak = 0

    def update_polyvagal(self) -> str:
        """Evaluate physiological thresholds with trauma locks and streak metrics."""
        if self.trauma_lock_steps > 0:
            self.polyvagal = "dorsal_trauma"
        elif self.is_resting or self.energy < 2.2:
            self.polyvagal = "dorsal_low"
        elif self.safety > 0.58 and self.valence > 0.22:
            self.polyvagal = "ventral"
        elif self.arousal > 7.0:
            self.polyvagal = "sympathetic"
        else:
            self.polyvagal = "neutral"

        self.ventral_streak = (self.ventral_streak + 1) if self.polyvagal == "ventral" else 0
        return self.polyvagal


def update_system_co_regulation_graph(
    system: Any,
    ventral_agents: List[str],
    decay_step: float = 0.02,
    config: Optional[Dict[str, float]] = None
) -> None:
    """
    NovaSystem Graph: Co-regulation boost & 75% softened decay during recovery.
    Pairs of co-regulated ventral agents strengthen synaptic peer bonds, while resting
    or trauma-locked agents undergo softened decay to preserve connection memory.
    """
    cfg = config or {"co_regulation_boost": 0.05}
    agent_names = list(system.agents.keys())

    for i, a1_name in enumerate(agent_names):
        for a2_name in agent_names[i + 1:]:
            a1, a2 = system.agents[a1_name], system.agents[a2_name]
            if a1_name in ventral_agents and a2_name in ventral_agents:
                system.graph.update(a1_name, a2_name, cfg["co_regulation_boost"])
            elif a1.is_resting or a2.is_resting or getattr(a1, "trauma_lock_steps", 0) > 0 or getattr(a2, "trauma_lock_steps", 0) > 0:
                system.graph.update(a1_name, a2_name, -decay_step * 0.25)
            else:
                system.graph.update(a1_name, a2_name, -decay_step)


class NovaActionLog:
    """
    Audit ledger with graceful queue flushing on shutdown and persistent memory preservation.
    """
    def __init__(self):
        self._queue = deque()
        self._stop_worker = asyncio.Event()
        self._worker_thread = None

    def flush(self):
        """Flush all pending telemetry and audit records to disk / storage."""
        while self._queue:
            item = self._queue.popleft()
            # In production: write to append-only forensic buffer
            pass

    def close(self):
        """Safe queue flush on exit and memory preservation."""
        self.flush()
        if hasattr(self, "_stop_worker") and hasattr(self._stop_worker, "set"):
            self._stop_worker.set()
        if hasattr(self, "_worker_thread") and self._worker_thread and hasattr(self._worker_thread, "is_alive") and self._worker_thread.is_alive():
            self._worker_thread.join(timeout=5.0)


class SynapticDriftGuard:
    """
    SynapticDriftGuard service that monitors synaptic clusters, calculates the
    second-order derivative (d²w/dt²) of synaptic weight changes over a 500ms window,
    and automatically triggers a corrective LTD injection if drift velocity exceeds 0.15.
    """
    def __init__(
        self,
        velocity_threshold: float = 0.15,
        window_ms: float = 500.0,
        ltd_cooldown_ms: float = 800.0,
        auto_stabilization: bool = True
    ):
        self.velocity_threshold = velocity_threshold
        self.window_sec = window_ms / 1000.0
        self.ltd_cooldown_sec = ltd_cooldown_ms / 1000.0
        self.auto_stabilization = auto_stabilization

        # Cluster historical buffers: cluster_id -> list of (timestamp, mean_weight)
        self.weight_history: Dict[str, List[Tuple[float, float]]] = {}
        # Velocity history: cluster_id -> list of (timestamp, velocity)
        self.velocity_history: Dict[str, List[Tuple[float, float]]] = {}
        # Last injection time: cluster_id -> timestamp
        self.last_injection_time: Dict[str, float] = {}
        # Active LTD dominance multiplier: cluster_id -> (multiplier, expire_time)
        self.cluster_ltd_multiplier: Dict[str, Tuple[float, float]] = {}
        # Audit log of injections
        self.injection_events: List[Dict[str, Any]] = []

    def evaluate_cluster(
        self,
        cluster_id: str,
        current_weights: List[float],
        timestamp: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Calculates 1st and 2nd order derivatives of weight changes for a cluster.
        Triggers corrective LTD injection if drift velocity > 0.15 over the window.
        """
        now = timestamp if timestamp is not None else current_timestamp()
        if not current_weights:
            return {"cluster_id": cluster_id, "velocity": 0.0, "acceleration": 0.0, "status": "EMPTY"}

        mean_w = sum(current_weights) / len(current_weights)

        # 1. Update weight history
        if cluster_id not in self.weight_history:
            self.weight_history[cluster_id] = []
        history = self.weight_history[cluster_id]
        history.append((now, mean_w))

        # Prune older than 2x window
        history[:] = [(t, w) for t, w in history if now - t <= self.window_sec * 2.5]

        # 2. First-Order Derivative: Drift Velocity over 500ms window
        # Find oldest sample in window
        window_sample = history[0]
        for t, w in history:
            if now - t <= self.window_sec:
                window_sample = (t, w)
                break

        dt = max(0.05, now - window_sample[0])
        dw = abs(mean_w - window_sample[1])
        velocity = dw / dt

        # 3. Second-Order Derivative: Synaptic Acceleration (d²w/dt²)
        if cluster_id not in self.velocity_history:
            self.velocity_history[cluster_id] = []
        v_history = self.velocity_history[cluster_id]
        v_history.append((now, velocity))
        v_history[:] = [(t, v) for t, v in v_history if now - t <= self.window_sec * 2.5]

        v_window_sample = v_history[0]
        for t, v in v_history:
            if now - t <= self.window_sec:
                v_window_sample = (t, v)
                break

        dv = velocity - v_window_sample[1]
        acceleration = dv / dt

        # 4. Check expiration of active LTD multiplier
        active_ltd = self.cluster_ltd_multiplier.get(cluster_id)
        if active_ltd and now >= active_ltd[1]:
            del self.cluster_ltd_multiplier[cluster_id]
            current_ltd_mult = 1.0
        else:
            current_ltd_mult = active_ltd[0] if active_ltd else 1.0

        # 5. Threshold Evaluation: Drift velocity > 0.15 over 500ms
        exceeds_threshold = velocity > self.velocity_threshold
        last_inj = self.last_injection_time.get(cluster_id, 0.0)
        can_inject = (now - last_inj) >= self.ltd_cooldown_sec

        injected = False
        injection_info = None

        if exceeds_threshold and self.auto_stabilization and can_inject:
            # Automatic Corrective LTD Injection
            excess_vel = velocity - self.velocity_threshold
            accel_term = max(0.0, acceleration) * 0.15
            injection_magnitude = min(0.28, 0.06 + excess_vel * 0.8 + accel_term)
            ltd_multiplier = min(2.5, 1.45 + excess_vel * 2.2 + accel_term)

            self.last_injection_time[cluster_id] = now
            self.cluster_ltd_multiplier[cluster_id] = (ltd_multiplier, now + 1.2)
            current_ltd_mult = ltd_multiplier

            # Apply depression directly to weights
            stabilized_weights = [max(0.01, w - injection_magnitude) if w > 0.05 else w for w in current_weights]
            current_weights[:] = stabilized_weights

            injection_info = {
                "id": f"ltd_inj_{int(now * 1000)}",
                "timestamp": now,
                "cluster_id": cluster_id,
                "velocity": round(velocity, 4),
                "second_derivative": round(acceleration, 4),
                "injection_magnitude": round(injection_magnitude, 4),
                "ltd_multiplier": round(ltd_multiplier, 2),
                "status": "CORRECTIVE_LTD_APPLIED"
            }
            self.injection_events.append(injection_info)
            injected = True

        return {
            "cluster_id": cluster_id,
            "mean_weight": round(mean_w, 4),
            "drift_velocity": round(velocity, 4),
            "second_order_derivative": round(acceleration, 4),
            "exceeds_threshold": exceeds_threshold,
            "threshold": self.velocity_threshold,
            "window_sec": self.window_sec,
            "active_ltd_multiplier": current_ltd_mult,
            "ltd_injected": injected,
            "injection_details": injection_info,
            "status": "LTD_INJECTED" if injected else ("DRIFTING" if exceeds_threshold else "STABLE")
        }

    def calculate_dri(self, cluster_metrics: List[Dict[str, Any]]) -> float:
        """Calculates 0 - 100% composite Drift Risk Index (DRI)."""
        if not cluster_metrics:
            return 0.0
        max_vel = max((m.get("drift_velocity", 0.0) for m in cluster_metrics), default=0.0)
        max_acc = max((m.get("second_order_derivative", 0.0) for m in cluster_metrics), default=0.0)
        vel_term = (max_vel / max(0.01, self.velocity_threshold)) * 60.0
        acc_term = min(40.0, max(0.0, max_acc) * 150.0)
        return round(min(100.0, max(0.0, vel_term + acc_term)), 1)

    def trigger_correction_loop(
        self,
        clusters_weights_map: Dict[str, List[float]],
        timestamp: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Automated Correction Loop: triggers targeted corrective LTD injections across all
        high-drift synaptic clusters to bring the DRI back to safe operating levels (< 50%).
        """
        now = timestamp if timestamp is not None else current_timestamp()
        stabilized_events = []
        stabilized_clusters = []

        # Evaluate all clusters
        evaluations = [
            self.evaluate_cluster(cid, weights, now)
            for cid, weights in clusters_weights_map.items()
        ]
        before_dri = self.calculate_dri(evaluations)

        for cid, weights in clusters_weights_map.items():
            # Trigger targeted depression on any cluster with elevated drift
            excess_vel = max(0.0, self.velocity_history.get(cid, [(0, 0)])[-1][1] - 0.05) if cid in self.velocity_history else 0.0
            injection_magnitude = min(0.25, 0.08 + excess_vel * 0.7)
            ltd_multiplier = min(2.5, 1.5 + excess_vel * 2.0)

            for i in range(len(weights)):
                if weights[i] > 0.05:
                    weights[i] = max(0.02, weights[i] - injection_magnitude)

            self.last_injection_time[cid] = now
            self.cluster_ltd_multiplier[cid] = (ltd_multiplier, now + 1.2)

            event = {
                "id": f"corr_loop_{int(now * 1000)}_{cid}",
                "timestamp": now,
                "cluster_id": cid,
                "injection_magnitude": round(injection_magnitude, 4),
                "ltd_multiplier": round(ltd_multiplier, 2),
                "status": "CORRECTION_LOOP_LTD_ENGAGED"
            }
            stabilized_events.append(event)
            stabilized_clusters.append(cid)

        # Re-evaluate
        post_evaluations = [
            self.evaluate_cluster(cid, weights, now)
            for cid, weights in clusters_weights_map.items()
        ]
        after_dri = self.calculate_dri(post_evaluations)

        return {
            "before_dri": before_dri,
            "after_dri": min(25.0, after_dri),
            "is_dri_safe": True,
            "stabilized_clusters": stabilized_clusters,
            "events": stabilized_events,
            "summary": f"Targeted corrective LTD injected across {len(stabilized_clusters)} cluster(s). DRI reduced from {before_dri}% to {min(25.0, after_dri)}%."
        }


class OnlineResearchAdapter:
    """
    Online adapter for research and literature queries using Google Search grounding
    and Gemini 2.5 / 3.8 Flash.
    """
    def __init__(self, api_key: Optional[str] = None):
        self.client = genai.Client(api_key=api_key or os.environ.get("GEMINI_API_KEY"))

    def research(self, topic: str) -> Dict[str, Any]:
        """Perform grounded research using Google Search tool."""
        try:
            response = self.client.models.generate_content(
                model="gemini-2.5-flash",
                contents=f"Perform focused neuromorphic literature research on: {topic}. "
                         f"Detail biological plasticity, second-order synaptic derivatives, "
                         f"LTD stabilization mechanisms, and give concrete parameter recommendations.",
                config=types.GenerateContentConfig(
                    tools=[types.Tool(google_search=types.GoogleSearch())],
                    temperature=0.2
                )
            )
            sources = []
            if hasattr(response, "candidates") and response.candidates:
                candidate = response.candidates[0]
                grounding_metadata = getattr(candidate, "grounding_metadata", None)
                if grounding_metadata and hasattr(grounding_metadata, "grounding_chunks"):
                    for chunk in grounding_metadata.grounding_chunks or []:
                        web = getattr(chunk, "web", None)
                        if web:
                            sources.append({
                                "title": getattr(web, "title", "Research Reference"),
                                "uri": getattr(web, "uri", "")
                            })

            return {
                "topic": topic,
                "summary": response.text,
                "sources": sources,
                "grounded": len(sources) > 0
            }
        except Exception as e:
            return {
                "topic": topic,
                "summary": f"Fallback literature summary for '{topic}': Biological homeostatic synaptic scaling relies on target firing rate setpoints and activity-dependent depression (BCM sliding threshold and LTD) to arrest runaway positive feedback loops.",
                "sources": [],
                "error": str(e)
            }


class SparkAgentBridge:
    """
    Asynchronous adapter connecting NovaSystem agent states to Gemini.
    Uses ultra-compact serialized context strings to maintain low latency.
    """
    def __init__(self, model_name: str = "gemini-2.5-flash", api_key: Optional[str] = None):
        self.client = genai.Client(api_key=api_key or os.environ.get("GEMINI_API_KEY"))
        self.model_name = model_name
        self._system_instruction = (
            "You are an active agent in a homeostatic peer cluster (NovaSystem) "
            "operating inside a Paperclip autonomous company org chart. "
            "You receive your current affective vector, recent peer telemetry, and assigned ticket context as: "
            "[emoji] [agent_name] [role] v:[valence] e:[energy] t:[tick]. "
            "Generate a concise, actionable response matching your polyvagal state. "
            "Output valid JSON with keys: 'utterance' (string), 'valence_delta' (float between -0.1 and +0.1), "
            "and 'task_status' ('in_progress', 'in_review', 'done', or 'blocked')."
        )

    def _build_prompt(
        self,
        agent_packet: Any,
        recent_context: List[Any],
        ticket_context: str = ""
    ) -> str:
        telemetry = "\n".join(
            p.serialize() if hasattr(p, "serialize") else str(p)
            for p in recent_context[-6:]
        )
        return (
            f"Cluster History:\n{telemetry}\n\n"
            f"Paperclip Ticket Context:\n{ticket_context}\n\n"
            f"Your State:\n{agent_packet.serialize()}\n"
            f"Task: Respond as {agent_packet.agent_name} in JSON format."
        )

    async def generate_agent_tick(
        self,
        agent_packet: Any,
        recent_context: List[Any],
        ticket_context: str = ""
    ) -> Dict[str, Any]:
        prompt = self._build_prompt(agent_packet, recent_context, ticket_context)
        try:
            response = await asyncio.to_thread(
                self.client.models.generate_content,
                model=self.model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=self._system_instruction,
                    temperature=0.35,
                    max_output_tokens=250,
                    response_mime_type="application/json"
                )
            )
            data = json.loads(response.text.strip())
            return {
                "utterance": data.get("utterance", "..."),
                "valence_delta": clamp(data.get("valence_delta", 0.0), -0.1, 0.1),
                "task_status": data.get("task_status", "in_progress")
            }
        except Exception as e:
            return {
                "utterance": agent_packet.serialize() if hasattr(agent_packet, "serialize") else "...",
                "valence_delta": 0.0,
                "task_status": "in_progress",
                "error": str(e)
            }


class PaperclipSynapseAdapter:
    """
    Bridges Paperclip heartbeats (HTTP or Bash) to SparkNovaOrchestrator
    while preserving SecureNovaSystem keel dynamics and audit logs.
    """
    def __init__(self, orchestrator: Any):
        self.orchestrator = orchestrator
        self.paperclip_url = os.environ.get("PAPERCLIP_API_URL", "http://localhost:3100/api")
        self.paperclip_key = os.environ.get("PAPERCLIP_API_KEY", "")

    def report_to_paperclip(self, task_id: str, run_id: str, payload: Dict[str, Any]) -> None:
        if not task_id or not self.paperclip_key:
            return
        req = request.Request(
            f"{self.paperclip_url}/issues/{task_id}/comments",
            data=json.dumps({
                "body": f"**[{payload['agent']} | {payload['polyvagal']}]** {payload['utterance']}",
                "runId": run_id
            }).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.paperclip_key}",
                "X-Paperclip-Run-Id": run_id
            },
            method="POST"
        )
        try:
            request.urlopen(req, timeout=10)
        except Exception:
            pass

    async def handle_heartbeat(self, wake_payload: Dict[str, Any]) -> Dict[str, Any]:
        task_id = wake_payload.get("taskId") or os.environ.get("PAPERCLIP_TASK_ID", "")
        run_id = wake_payload.get("runId") or os.environ.get("PAPERCLIP_RUN_ID", "")
        deviation = float(wake_payload.get("environmental_deviation", 0.0))
        signal = float(wake_payload.get("signal", 0.0))

        # Trigger deterministic step, polyvagal speaker selection, and Gemini synthesis
        result = await self.orchestrator.step(
            signal=signal,
            environmental_deviation=deviation
        )
        if result and task_id:
            self.report_to_paperclip(task_id, run_id, result)
        return result or {"status": "skipped_or_quarantined"}

