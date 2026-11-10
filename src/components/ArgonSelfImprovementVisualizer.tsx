import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  ArgonRefinedStructuralSet,
  ArgonStructuralRefinement,
  AutonomousSelfImprovementState,
  HardwareTelemetry,
  LIFNeuron,
  SNNTuningConfig,
  Synapse,
} from '../types';
import { SNNEngine } from '../lib/snnEngine';
import { ArgonSetBuilderEngine } from '../lib/selfImprovement';
import {
  Boxes,
  Zap,
  RotateCcw,
  Sliders,
  ChevronDown,
  ChevronUp,
  Layers,
  ShieldCheck,
  Sparkles,
  Play,
  Activity,
  Target,
} from 'lucide-react';

export interface ArgonSelfImprovementVisualizerProps {
  engine: SNNEngine;
  telemetry: HardwareTelemetry;
  tuningConfig: SNNTuningConfig;
  rsiState: AutonomousSelfImprovementState;
  onApplyArgonSet?: (set: ArgonRefinedStructuralSet) => void;
  onTriggerEpoch?: (reason?: string, researchQuery?: string) => Promise<void> | void;
}

type TargetFilter = 'all' | 'shunt' | 'stdp' | 'drift' | 'dma';
type CameraPreset = 'overview' | 'matrix' | 'cortical' | 'argon_core';

interface SelectedNodeInfo {
  type: 'neuron' | 'refinement' | 'matrix_cell';
  id: number | string;
  label: string;
  layer: string;
  details: string;
  targetAction: string;
  metricLabel: string;
  metricValue: string;
}

interface MatrixTargetCoord {
  preId: number;
  postId: number;
  domain: Exclude<TargetFilter, 'all'>;
  weight: number;
}

// Module-scope scratch math objects to prevent GC pressure inside requestAnimationFrame
const _dummyObj = new THREE.Object3D();
const _targetDummy = new THREE.Object3D();
const _scratchColor = new THREE.Color();
const _vecA = new THREE.Vector3();
const _vecB = new THREE.Vector3();
const _vecMid = new THREE.Vector3();

/**
 * Compute deterministic 3D spatial coordinates for each of the 20 SNN neurons
 * across the 3 structural tiers (Sensory E0-E7, Cortical Ring N8-N15, Motor O16-O19).
 */
function getNeuronPosition3D(id: number, layerElevation: number): THREE.Vector3 {
  if (id < 8) {
    // Afferent Sensory Input Channels (E0 - E7): Front arc
    const t = (id - 3.5) / 3.5;
    return new THREE.Vector3(t * 7.2, layerElevation * 0.85, 5.4 + Math.abs(t) * 0.6);
  }
  if (id < 16) {
    // Cortical Association Ring (N8 - N15): Central ring
    const ringIdx = id - 8;
    const angle = (ringIdx / 8) * Math.PI * 2 - Math.PI / 2;
    const radius = 3.85;
    return new THREE.Vector3(
      Math.cos(angle) * radius,
      layerElevation * 1.15,
      Math.sin(angle) * radius * 0.78
    );
  }
  // Efferent Motor Decoders (O16 - O19): Rear elevated row
  const mIdx = id - 16;
  const t = (mIdx - 1.5) / 1.5;
  return new THREE.Vector3(t * 5.2, layerElevation * 1.0, -5.4 - Math.abs(t) * 0.4);
}

/**
 * Compute world position of cell [preId, postId] on the 20x20 SNN Crossbar Matrix slab.
 */
function getMatrixCellPosition3D(preId: number, postId: number): THREE.Vector3 {
  const cellSpacing = 0.56;
  const gridHalf = (19 * cellSpacing) / 2;
  return new THREE.Vector3(
    postId * cellSpacing - gridHalf,
    0.16,
    preId * cellSpacing - gridHalf
  );
}

export const ArgonSelfImprovementVisualizer: React.FC<ArgonSelfImprovementVisualizerProps> = ({
  engine,
  telemetry,
  tuningConfig,
  rsiState,
  onApplyArgonSet,
  onTriggerEpoch,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const [activeFilter, setActiveFilter] = useState<TargetFilter>('all');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('overview');
  const [layerElevation, setLayerElevation] = useState<number>(3.3);
  const [animateMatrixTargets, setAnimateMatrixTargets] = useState<boolean>(true);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [selectedNode, setSelectedNode] = useState<SelectedNodeInfo | null>(null);
  const [buildPulseTrigger, setBuildPulseTrigger] = useState<number>(0);
  const [statusToast, setStatusToast] = useState<string | null>(null);

  // Synthesize or retrieve the active Argon structural refinement set
  const argonSet: ArgonRefinedStructuralSet = useMemo(() => {
    if (rsiState.activeArgonSet) return rsiState.activeArgonSet;
    const latestWithArgon = [...rsiState.history].reverse().find((e) => e.argonBuilderSet);
    if (latestWithArgon?.argonBuilderSet) return latestWithArgon.argonBuilderSet;
    return ArgonSetBuilderEngine.synthesizeFinalStructuralSet({
      currentTuning: tuningConfig,
      candidateTuning: tuningConfig,
      currentDri: rsiState.currentMetrics.divergenceRiskIndex,
      projectedDri: Math.max(0.08, rsiState.currentMetrics.divergenceRiskIndex - 0.08),
      telemetry,
    });
  }, [
    rsiState.activeArgonSet,
    rsiState.history,
    tuningConfig,
    rsiState.currentMetrics.divergenceRiskIndex,
    telemetry,
  ]);

  // Identify the top 32 SNN matrix target cells mapped by the Argon set builder
  const matrixTargetCoords = useMemo<MatrixTargetCoord[]>(() => {
    const targets: MatrixTargetCoord[] = [];
    const seen = new Set<string>();

    // 1. Parvalbumin Fast-Spiking Interneuron Shunt targets (N12, N13 -> cortical ring N8..N15)
    for (const preId of [12, 13]) {
      for (let postId = 8; postId < 16; postId++) {
        if (preId === postId) continue;
        const key = `${preId}-${postId}`;
        seen.add(key);
        targets.push({ preId, postId, domain: 'shunt', weight: -0.385 });
      }
    }

    // 2. Asymmetric STDP Clamp targets (high-magnitude excitatory synapses)
    for (const syn of engine.synapses) {
      if (targets.length >= 24) break;
      const key = `${syn.preId}-${syn.postId}`;
      if (seen.has(key)) continue;
      if (syn.weight > 0.35) {
        seen.add(key);
        targets.push({ preId: syn.preId, postId: syn.postId, domain: 'stdp', weight: syn.weight });
      }
    }

    // 3. 2nd-Order Drift Quench & 64B DMA AER Bus targets (Afferent -> Cortical & Cortical -> Motor)
    for (let i = 0; i < 4; i++) {
      const driftKey = `${i}-${8 + i}`;
      if (!seen.has(driftKey)) {
        seen.add(driftKey);
        targets.push({ preId: i, postId: 8 + i, domain: 'drift', weight: 0.42 });
      }
      const dmaKey = `${8 + i}-${16 + i}`;
      if (!seen.has(dmaKey)) {
        seen.add(dmaKey);
        targets.push({ preId: 8 + i, postId: 16 + i, domain: 'dma', weight: 0.51 });
      }
    }

    return targets.slice(0, 32);
  }, [engine.synapses]);

  // Refs synced into the Three.js animation loop without recreating the WebGL context
  const filterRef = useRef<TargetFilter>(activeFilter);
  filterRef.current = activeFilter;

  const elevationRef = useRef<number>(layerElevation);
  elevationRef.current = layerElevation;

  const animateTargetsRef = useRef<boolean>(animateMatrixTargets);
  animateTargetsRef.current = animateMatrixTargets;

  const isLoopActiveRef = useRef<boolean>(rsiState.isActive || rsiState.isAnalyzing);
  isLoopActiveRef.current = rsiState.isActive || rsiState.isAnalyzing;

  const telemetryRef = useRef<HardwareTelemetry>(telemetry);
  telemetryRef.current = telemetry;

  const argonSetRef = useRef<ArgonRefinedStructuralSet>(argonSet);
  argonSetRef.current = argonSet;

  const matrixTargetsRef = useRef<MatrixTargetCoord[]>(matrixTargetCoords);
  matrixTargetsRef.current = matrixTargetCoords;

  const buildWaveRef = useRef<number>(1.0);
  const cameraTargetPresetRef = useRef<{ pos: THREE.Vector3; look: THREE.Vector3 } | null>(null);

  // Trigger a build wave animation whenever a new epoch or manual trigger happens
  useEffect(() => {
    if (rsiState.isAnalyzing || buildPulseTrigger > 0) {
      buildWaveRef.current = 0.01;
    }
  }, [rsiState.isAnalyzing, buildPulseTrigger, argonSet.timestamp]);

  const handleCameraPreset = useCallback((preset: CameraPreset) => {
    setCameraPreset(preset);
    if (preset === 'overview') {
      cameraTargetPresetRef.current = {
        pos: new THREE.Vector3(0, 10.6, 15.8),
        look: new THREE.Vector3(0, 2.7, 0),
      };
    } else if (preset === 'matrix') {
      cameraTargetPresetRef.current = {
        pos: new THREE.Vector3(0, 9.2, 8.8),
        look: new THREE.Vector3(0, 0.2, 0),
      };
    } else if (preset === 'cortical') {
      cameraTargetPresetRef.current = {
        pos: new THREE.Vector3(5.6, 6.2, 7.6),
        look: new THREE.Vector3(0, 3.4, 0),
      };
    } else if (preset === 'argon_core') {
      cameraTargetPresetRef.current = {
        pos: new THREE.Vector3(0, 9.6, 6.8),
        look: new THREE.Vector3(0, 7.2, 0),
      };
    }
  }, []);

  const handleApplyAndAnimate = useCallback(() => {
    buildWaveRef.current = 0.01;
    setBuildPulseTrigger((p) => p + 1);
    const res = ArgonSetBuilderEngine.applyRefinedStructuralSetToEngine(engine, argonSet);
    if (onApplyArgonSet) {
      onApplyArgonSet(argonSet);
    }
    setStatusToast(res.message);
    setTimeout(() => setStatusToast(null), 4000);
  }, [engine, argonSet, onApplyArgonSet]);

  const handleTriggerSynthesisWave = useCallback(() => {
    buildWaveRef.current = 0.01;
    setBuildPulseTrigger((p) => p + 1);
    if (onTriggerEpoch) {
      onTriggerEpoch('argon_builder_synthesis', 'Argon 3D structural target synthesis');
    }
  }, [onTriggerEpoch]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 840;
    const height = container.clientHeight || 460;

    // 1. Renderer + Software-WebGL Guard
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererStr = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '';
    const isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(rendererStr);

    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 2. Scene, Camera, Environment & Studio Lighting
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060a14);
    scene.fog = new THREE.FogExp2(0x060a14, 0.021);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.7;

    const camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 150);
    camera.position.set(0, 10.6, 15.8);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.target.set(0, 2.7, 0);
    controls.minDistance = 4.5;
    controls.maxDistance = 30;
    controls.maxPolarAngle = Math.PI * 0.49;

    // Warm key light + cool sky/ground HemisphereLight
    const keyLight = new THREE.DirectionalLight(0xfff3e0, 2.3);
    keyLight.position.set(9, 16, 10);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 2;
      keyLight.shadow.camera.far = 38;
      const d = 11;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.bias = -0.0005;
    }
    scene.add(keyLight);

    const hemiLight = new THREE.HemisphereLight(0x6366f1, 0x090d16, 0.85);
    scene.add(hemiLight);

    const corePointLight = new THREE.PointLight(0x818cf8, 2.6, 18, 1.5);
    corePointLight.position.set(0, 7.4, 0);
    scene.add(corePointLight);

    // 3. Lower Tier: 20x20 SNN Crossbar Matrix Base Slab & InstancedMesh (400 Synaptic Cells)
    const matrixGroup = new THREE.Group();
    scene.add(matrixGroup);

    const slabGeo = new THREE.BoxGeometry(12.2, 0.24, 12.2);
    const slabMat = new THREE.MeshStandardMaterial({
      color: 0x0b1120,
      roughness: 0.35,
      metalness: 0.78,
    });
    const slabMesh = new THREE.Mesh(slabGeo, slabMat);
    slabMesh.position.set(0, -0.12, 0);
    slabMesh.receiveShadow = !isSoftwareGl;
    matrixGroup.add(slabMesh);

    // Subtle border frame around the 20x20 matrix slab
    const frameEdges = new THREE.EdgesGeometry(slabGeo);
    const frameLine = new THREE.LineSegments(
      frameEdges,
      new THREE.LineBasicMaterial({ color: 0x312e81, transparent: true, opacity: 0.65 })
    );
    frameLine.position.copy(slabMesh.position);
    matrixGroup.add(frameLine);

    const gridHelper = new THREE.GridHelper(11.4, 20, 0x4338ca, 0x1e293b);
    gridHelper.position.y = 0.01;
    matrixGroup.add(gridHelper);

    const cellCount = 400; // 20 pre x 20 post
    const cellGeo = new THREE.BoxGeometry(0.42, 1.0, 0.42);
    const cellMat = new THREE.MeshStandardMaterial({
      roughness: 0.26,
      metalness: 0.65,
    });
    const matrixInstanced = new THREE.InstancedMesh(cellGeo, cellMat, cellCount);
    matrixInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    matrixInstanced.castShadow = !isSoftwareGl;
    matrixInstanced.receiveShadow = !isSoftwareGl;

    for (let i = 0; i < cellCount; i++) {
      _dummyObj.position.set(0, 0, 0);
      _dummyObj.scale.set(1, 0.1, 1);
      _dummyObj.updateMatrix();
      matrixInstanced.setMatrixAt(i, _dummyObj.matrix);
      matrixInstanced.setColorAt(i, _scratchColor.setHex(0x1e293b));
    }
    matrixGroup.add(matrixInstanced);

    // 4. Animated SNN Matrix Target Extraction Tokens (InstancedMesh of 32 ascending/descending target cubes)
    const targetTokenCount = 32;
    const targetTokenGeo = new THREE.OctahedronGeometry(0.16, 0);
    const targetTokenMat = new THREE.MeshStandardMaterial({
      roughness: 0.15,
      metalness: 0.85,
      emissive: new THREE.Color(0x6366f1),
      emissiveIntensity: 0.6,
    });
    const targetTokenInstanced = new THREE.InstancedMesh(
      targetTokenGeo,
      targetTokenMat,
      targetTokenCount
    );
    targetTokenInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < targetTokenCount; i++) {
      _targetDummy.position.set(0, -10, 0);
      _targetDummy.scale.setScalar(0.001);
      _targetDummy.updateMatrix();
      targetTokenInstanced.setMatrixAt(i, _targetDummy.matrix);
      targetTokenInstanced.setColorAt(i, _scratchColor.setHex(0x818cf8));
    }
    scene.add(targetTokenInstanced);

    // 5. Middle Tier: 20 Multi-Part SNN Neuron Assemblies (E0-E7, N8-N15, O16-O19)
    const neuronsGroup = new THREE.Group();
    scene.add(neuronsGroup);

    const neuronPickables: THREE.Object3D[] = [];
    const neuronAssemblies: {
      id: number;
      group: THREE.Group;
      somaMat: THREE.MeshStandardMaterial;
      haloMat: THREE.MeshBasicMaterial;
      shuntShield?: THREE.Mesh;
    }[] = [];

    const pedGeo = new THREE.CylinderGeometry(0.32, 0.4, 0.16, 16);
    const somaGeo = new THREE.IcosahedronGeometry(0.28, 1);
    const spireGeo = new THREE.ConeGeometry(0.11, 0.44, 8);
    const shieldGeo = new THREE.TorusGeometry(0.5, 0.045, 10, 6); // Hexagonal Parvalbumin shunt ring

    for (let i = 0; i < 20; i++) {
      const nGroup = new THREE.Group();
      const pos = getNeuronPosition3D(i, elevationRef.current);
      nGroup.position.copy(pos);

      const isSensory = i < 8;
      const isCortical = i >= 8 && i < 16;
      const isInterneuronShunt = i === 12 || i === 13;

      const baseColor = isInterneuronShunt
        ? 0x10b981
        : isSensory
        ? 0x38bdf8
        : isCortical
        ? 0x818cf8
        : 0xf59e0b;

      // Part 1: Pedestal collar
      const pedMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.4,
        metalness: 0.82,
      });
      const pedMesh = new THREE.Mesh(pedGeo, pedMat);
      pedMesh.position.y = -0.22;
      nGroup.add(pedMesh);

      // Part 2: Soma core (pickable)
      const somaMat = new THREE.MeshStandardMaterial({
        color: baseColor,
        emissive: baseColor,
        emissiveIntensity: 0.35,
        roughness: 0.22,
        metalness: 0.55,
      });
      const somaMesh = new THREE.Mesh(somaGeo, somaMat);
      somaMesh.castShadow = !isSoftwareGl;
      somaMesh.userData = { neuronId: i };
      nGroup.add(somaMesh);
      neuronPickables.push(somaMesh);

      // Part 3: Apical dendrite spire
      const spireMat = new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        roughness: 0.3,
        metalness: 0.72,
      });
      const spireMesh = new THREE.Mesh(spireGeo, spireMat);
      spireMesh.position.y = 0.38;
      nGroup.add(spireMesh);

      // Part 4: Parvalbumin Fast-Spiking Shunt Shield on N12 & N13
      let shuntShield: THREE.Mesh | undefined;
      const haloMat = new THREE.MeshBasicMaterial({
        color: isInterneuronShunt ? 0x10b981 : baseColor,
        transparent: true,
        opacity: isInterneuronShunt ? 0.78 : 0.25,
      });

      if (isInterneuronShunt) {
        shuntShield = new THREE.Mesh(shieldGeo, haloMat);
        shuntShield.rotation.x = Math.PI / 2;
        nGroup.add(shuntShield);
      }

      neuronsGroup.add(nGroup);
      neuronAssemblies.push({
        id: i,
        group: nGroup,
        somaMat,
        haloMat,
        shuntShield,
      });
    }

    // 6. Upper Tier: Composite 6-Part Argon Set Builder Core (gemini-4-argon) at y = 7.4
    const argonCoreGroup = new THREE.Group();
    argonCoreGroup.position.set(0, 7.4, 0);
    scene.add(argonCoreGroup);

    // Part 1: Octagonal containment chassis ring
    const chassisGeo = new THREE.CylinderGeometry(1.75, 1.95, 0.44, 8, 1, true);
    const chassisMat = new THREE.MeshStandardMaterial({
      color: 0x1e1b4b,
      roughness: 0.25,
      metalness: 0.88,
      side: THREE.DoubleSide,
    });
    const chassisMesh = new THREE.Mesh(chassisGeo, chassisMat);
    argonCoreGroup.add(chassisMesh);

    // Part 2: Outer gyroscopic compilation ring
    const outerGyroGeo = new THREE.TorusGeometry(1.42, 0.065, 14, 48);
    const outerGyroMat = new THREE.MeshStandardMaterial({
      color: 0x6366f1,
      emissive: 0x4f46e5,
      emissiveIntensity: 0.55,
      roughness: 0.2,
      metalness: 0.82,
    });
    const outerGyroMesh = new THREE.Mesh(outerGyroGeo, outerGyroMat);
    outerGyroMesh.rotation.x = Math.PI / 2;
    argonCoreGroup.add(outerGyroMesh);

    // Part 3: Inner counter-rotating stabilizer ring
    const innerGyroGeo = new THREE.TorusGeometry(1.06, 0.05, 12, 36);
    const innerGyroMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.55,
      roughness: 0.2,
      metalness: 0.82,
    });
    const innerGyroMesh = new THREE.Mesh(innerGyroGeo, innerGyroMat);
    argonCoreGroup.add(innerGyroMesh);

    // Part 4: Central Argon Crystalline Synthesizer Core
    const crystalGeo = new THREE.IcosahedronGeometry(0.68, 1);
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0xa855f7,
      emissive: 0x7e22ce,
      emissiveIntensity: 0.85,
      roughness: 0.14,
      metalness: 0.35,
    });
    const crystalMesh = new THREE.Mesh(crystalGeo, crystalMat);
    crystalMesh.userData = { refinementCore: true };
    argonCoreGroup.add(crystalMesh);
    neuronPickables.push(crystalMesh);

    // Part 5: 4 Downward Structural Target Projector Nozzles
    const nozzleGeo = new THREE.ConeGeometry(0.18, 0.48, 6);
    const nozzleMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.3,
      metalness: 0.85,
    });
    const nozzleAngles = [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2];
    nozzleAngles.forEach((ang) => {
      const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
      nozzle.position.set(Math.cos(ang) * 1.35, -0.35, Math.sin(ang) * 1.35);
      nozzle.rotation.x = Math.PI;
      argonCoreGroup.add(nozzle);
    });

    // Part 6: Active Synthesis Pulse Wave Ring (descends from Argon core to matrix when active)
    const waveRingGeo = new THREE.TorusGeometry(2.2, 0.045, 12, 64);
    const waveRingMat = new THREE.MeshBasicMaterial({
      color: 0x818cf8,
      transparent: true,
      opacity: 0.0,
    });
    const waveRingMesh = new THREE.Mesh(waveRingGeo, waveRingMat);
    waveRingMesh.rotation.x = Math.PI / 2;
    scene.add(waveRingMesh);

    // 7. Synaptic Filament Network + Argon Projection Beams
    const synapseLinePositions = new Float32Array(120 * 6);
    const synapseLineColors = new Float32Array(120 * 6);
    const synapseLinesGeo = new THREE.BufferGeometry();
    synapseLinesGeo.setAttribute('position', new THREE.BufferAttribute(synapseLinePositions, 3));
    synapseLinesGeo.setAttribute('color', new THREE.BufferAttribute(synapseLineColors, 3));
    const synapseLinesMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.46,
    });
    const synapseLines = new THREE.LineSegments(synapseLinesGeo, synapseLinesMat);
    scene.add(synapseLines);

    // Argon Core -> SNN Target Projection Beams (up to 24 beams)
    const maxBeams = 24;
    const beamPositions = new Float32Array(maxBeams * 6);
    const beamColors = new Float32Array(maxBeams * 6);
    const beamGeo = new THREE.BufferGeometry();
    beamGeo.setAttribute('position', new THREE.BufferAttribute(beamPositions, 3));
    beamGeo.setAttribute('color', new THREE.BufferAttribute(beamColors, 3));
    const beamMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.78,
    });
    const argonBeams = new THREE.LineSegments(beamGeo, beamMat);
    scene.add(argonBeams);

    // 8. Raycaster for Interactive Node Inspection
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const handlePointerDown = (ev: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(neuronPickables, false);
      if (hits.length > 0) {
        const hitObj = hits[0].object;
        if (hitObj.userData.refinementCore) {
          const currentSet = argonSetRef.current;
          setSelectedNode({
            type: 'refinement',
            id: 'gemini-4-argon',
            label: 'Argon Set Builder Core (gemini-4-argon)',
            layer: 'Terminal Structural Synthesizer',
            details: `${currentSet.structuralRefinements.length} active structural refinements mapped onto the 20x20 SNN matrix.`,
            targetAction: 'Closed-Loop SNN Matrix Remodeling',
            metricLabel: 'Architectural Stability',
            metricValue: `${currentSet.architecturalScorePct}% (${currentSet.compilationStatus.toUpperCase()})`,
          });
          return;
        }

        const nId = hitObj.userData.neuronId;
        if (typeof nId === 'number') {
          const neuron: LIFNeuron | undefined = engine.neurons[nId];
          const isShunt = nId === 12 || nId === 13;
          const isSensory = nId < 8;
          const isCortical = nId >= 8 && nId < 16;

          setSelectedNode({
            type: 'neuron',
            id: nId,
            label: neuron?.label || `Neuron N${nId}`,
            layer: isShunt
              ? 'Parvalbumin Fast-Spiking Interneuron (Shunt)'
              : isSensory
              ? 'Afferent Sensory Input Layer (E0–E7)'
              : isCortical
              ? 'Cortical Association Ring (N8–N15)'
              : 'Efferent Motor Decoder Layer (O16–O19)',
            details: isShunt
              ? 'Argon Target #1: Inhibitory Lateral Ring Shunt (w = -0.385) clamps cortical avalanche branching ratio sigma <= 1.00.'
              : isCortical
              ? 'Argon Target #2: Bi & Poo Asymmetric STDP Trace Kinetics Clamp (A- / A+ >= 1.25) halts LTP runaway.'
              : isSensory
              ? 'Argon Target #3: Second-Order Drift Velocity Pre-Emptive Quenching (dv/dt <= 0.15).'
              : 'Argon Target #4: 64-Byte Burst DMA AER Bus Conduction & Keel Reflex Linkage.',
            targetAction: isShunt
              ? 'REINFORCE INHIBITORY SHUNT'
              : isCortical
              ? 'CLAMP STDP LTD DOMINANCE'
              : 'SYNTHESIZE DMA AER LINK',
            metricLabel: 'Membrane Potential / Spikes',
            metricValue: neuron
              ? `${neuron.vMem.toFixed(1)} mV | ${neuron.recentSpikes.length} spikes`
              : 'Nominal',
          });
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);

    // 9. ResizeObserver for Responsive Layout
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        if (w > 0 && h > 0) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        }
      }
    });
    ro.observe(container);

    // 10. Animation Loop with Software-WebGL Fence Pacing
    const timer = new THREE.Timer();
    let rafId = 0;
    let disposed = false;
    let currentElevation = elevationRef.current;

    const afterDraw = (next: FrameRequestCallback) => {
      const gl2 = gl as WebGL2RenderingContext;
      if (!isSoftwareGl || typeof gl2.fenceSync !== 'function') {
        rafId = requestAnimationFrame(next);
        return;
      }
      const sync = gl2.fenceSync(gl2.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl2.flush();
      const poll = () => {
        if (disposed) return;
        if (!sync) {
          rafId = requestAnimationFrame(next);
          return;
        }
        const s = gl2.clientWaitSync(sync, 0, 0);
        if (
          s === gl2.ALREADY_SIGNALED ||
          s === gl2.CONDITION_SATISFIED ||
          s === gl2.WAIT_FAILED
        ) {
          gl2.deleteSync(sync);
          rafId = requestAnimationFrame(next);
        } else {
          setTimeout(poll, 4);
        }
      };
      setTimeout(poll, 4);
    };

    const tick = (timestamp?: number) => {
      if (disposed) return;
      timer.update(timestamp);
      const dt = Math.min(timer.getDelta(), 0.1);
      const elapsed = timer.getElapsed();

      const activeFilterMode = filterRef.current;
      const isLoopRunning = isLoopActiveRef.current;
      const shouldAnimateTargets = animateTargetsRef.current;

      // Smoothly damp layer elevation
      currentElevation = THREE.MathUtils.damp(currentElevation, elevationRef.current, 6, dt);

      // Smoothly damp camera preset transitions
      if (cameraTargetPresetRef.current) {
        camera.position.lerp(cameraTargetPresetRef.current.pos, 1 - Math.exp(-5 * dt));
        controls.target.lerp(cameraTargetPresetRef.current.look, 1 - Math.exp(-5 * dt));
        if (camera.position.distanceTo(cameraTargetPresetRef.current.pos) < 0.08) {
          cameraTargetPresetRef.current = null;
        }
      }

      // Advance active build wave
      if (buildWaveRef.current < 1.0) {
        buildWaveRef.current = Math.min(1.0, buildWaveRef.current + dt * 0.65);
        const wProg = buildWaveRef.current;
        waveRingMesh.position.set(0, THREE.MathUtils.lerp(7.4, 0.2, wProg), 0);
        const ringScale = THREE.MathUtils.lerp(0.6, 3.1, wProg);
        waveRingMesh.scale.set(ringScale, ringScale, 1);
        waveRingMat.opacity = Math.sin(wProg * Math.PI) * 0.75;
      } else if (isLoopRunning && shouldAnimateTargets) {
        // Continuous subtle scanning wave when RSI loop is active
        const cyc = (elapsed * 0.42) % 1.0;
        waveRingMesh.position.set(0, THREE.MathUtils.lerp(7.4, 0.2, cyc), 0);
        const ringScale = THREE.MathUtils.lerp(0.65, 2.85, cyc);
        waveRingMesh.scale.set(ringScale, ringScale, 1);
        waveRingMat.opacity = Math.sin(cyc * Math.PI) * 0.42;
      } else {
        waveRingMat.opacity = 0;
      }

      // Rotate Argon Synthesizer Core
      const speedMult = isLoopRunning ? 2.1 : 1.0;
      outerGyroMesh.rotation.z = elapsed * 0.85 * speedMult;
      outerGyroMesh.rotation.y = Math.sin(elapsed * 0.5) * 0.32;
      innerGyroMesh.rotation.x = -elapsed * 1.15 * speedMult;
      innerGyroMesh.rotation.y = elapsed * 0.75 * speedMult;
      crystalMesh.rotation.y = elapsed * 0.6 * speedMult;
      crystalMesh.rotation.x = Math.sin(elapsed * 0.8) * 0.28;
      argonCoreGroup.position.y = 7.4 + Math.sin(elapsed * 1.6) * 0.12;

      // Lookup live synaptic weights from engine
      const synapses: Synapse[] = engine.synapses;
      const weightLookup = new Float32Array(400);
      for (let s = 0; s < synapses.length; s++) {
        const syn = synapses[s];
        if (syn.preId >= 0 && syn.preId < 20 && syn.postId >= 0 && syn.postId < 20) {
          weightLookup[syn.preId * 20 + syn.postId] = syn.weight;
        }
      }

      // Update 20x20 SNN Crossbar InstancedMesh (400 cells) with animated target displacement
      const cellSpacing = 0.56;
      const gridHalf = (19 * cellSpacing) / 2;

      for (let pre = 0; pre < 20; pre++) {
        for (let post = 0; post < 20; post++) {
          const idx = pre * 20 + post;
          const w = weightLookup[idx];
          const absW = Math.abs(w);

          const isShuntCell = (pre === 12 || pre === 13) && post >= 8 && post < 16 && pre !== post;
          const isStdpTargetCell = w > 0.35;
          const isDmaTargetCell = pre >= 8 && pre < 16 && post >= 16;

          const isTargetedByFilter =
            (activeFilterMode === 'all' && (isShuntCell || isStdpTargetCell || isDmaTargetCell)) ||
            (activeFilterMode === 'shunt' && isShuntCell) ||
            (activeFilterMode === 'stdp' && isStdpTargetCell) ||
            (activeFilterMode === 'dma' && isDmaTargetCell);

          // Animate vertical lift on targeted matrix cells when active
          const targetPulse =
            shouldAnimateTargets && isTargetedByFilter
              ? (Math.sin(elapsed * 4.2 + pre * 0.5 + post * 0.3) * 0.5 + 0.5) * 0.38
              : 0;

          const hScale = Math.max(0.08, absW * 0.85 + (isShuntCell ? 0.32 : 0) + targetPulse);

          _dummyObj.position.set(
            post * cellSpacing - gridHalf,
            hScale * 0.5,
            pre * cellSpacing - gridHalf
          );
          _dummyObj.scale.set(1, hScale, 1);
          _dummyObj.updateMatrix();
          matrixInstanced.setMatrixAt(idx, _dummyObj.matrix);

          if (isShuntCell && (activeFilterMode === 'all' || activeFilterMode === 'shunt')) {
            _scratchColor.setHex(0x10b981); // Emerald inhibitory shunt
          } else if (
            isStdpTargetCell &&
            (activeFilterMode === 'all' || activeFilterMode === 'stdp')
          ) {
            _scratchColor.setHex(0x818cf8); // Indigo STDP clamp
          } else if (
            isDmaTargetCell &&
            (activeFilterMode === 'all' || activeFilterMode === 'dma')
          ) {
            _scratchColor.setHex(0xf59e0b); // Amber DMA bus link
          } else if (w < -0.01) {
            _scratchColor.setHex(0x0d9488);
          } else if (w > 0.01) {
            _scratchColor.setHex(0x334155);
          } else {
            _scratchColor.setHex(0x0f172a);
          }
          matrixInstanced.setColorAt(idx, _scratchColor);
        }
      }
      matrixInstanced.instanceMatrix.needsUpdate = true;
      if (matrixInstanced.instanceColor) matrixInstanced.instanceColor.needsUpdate = true;

      // Animate the 32 SNN Matrix Target Extraction Tokens (Matrix Cell -> Argon Core -> SNN Neuron)
      const targets = matrixTargetsRef.current;
      for (let i = 0; i < targetTokenCount; i++) {
        const target = targets[i];
        const domainMatch =
          target && (activeFilterMode === 'all' || activeFilterMode === target.domain);

        if (!shouldAnimateTargets || !target || !domainMatch) {
          _targetDummy.position.set(0, -10, 0);
          _targetDummy.scale.setScalar(0.001);
          _targetDummy.updateMatrix();
          targetTokenInstanced.setMatrixAt(i, _targetDummy.matrix);
          continue;
        }

        // Phase t in [0, 1): 0..0.5 ascends from Matrix Cell [pre, post] to Argon Core;
        // 0.5..1.0 descends from Argon Core to the target SNN Neuron in the 3D topology!
        const speed = isLoopRunning ? 0.55 : 0.32;
        const phase = (elapsed * speed + i * (1 / targetTokenCount)) % 1.0;

        const matrixCellPos = getMatrixCellPosition3D(target.preId, target.postId);
        const neuronPos = getNeuronPosition3D(
          target.domain === 'shunt' ? target.preId : target.postId,
          currentElevation
        );

        if (phase < 0.5) {
          // Ascending from SNN Matrix cell [preId, postId] -> Argon Core
          const u = phase * 2.0;
          _vecA.copy(matrixCellPos);
          _vecB.copy(argonCoreGroup.position);
          _vecMid.lerpVectors(_vecA, _vecB, u);
          // Outward spiral arc
          const arcAngle = u * Math.PI + i * 0.4;
          const arcRadius = Math.sin(u * Math.PI) * 1.1;
          _vecMid.x += Math.cos(arcAngle) * arcRadius;
          _vecMid.z += Math.sin(arcAngle) * arcRadius;
          _targetDummy.position.copy(_vecMid);
        } else {
          // Descending from Argon Core -> Target SNN Neuron
          const u = (phase - 0.5) * 2.0;
          _vecA.copy(argonCoreGroup.position);
          _vecB.copy(neuronPos);
          _vecMid.lerpVectors(_vecA, _vecB, u);
          _targetDummy.position.copy(_vecMid);
        }

        const tokenScale = 0.75 + Math.sin(phase * Math.PI) * 0.55;
        _targetDummy.rotation.set(elapsed * 2.2 + i, elapsed * 1.7, 0);
        _targetDummy.scale.setScalar(tokenScale);
        _targetDummy.updateMatrix();
        targetTokenInstanced.setMatrixAt(i, _targetDummy.matrix);

        const domainColor =
          target.domain === 'shunt'
            ? 0x10b981
            : target.domain === 'stdp'
            ? 0x818cf8
            : target.domain === 'drift'
            ? 0x38bdf8
            : 0xf59e0b;
        targetTokenInstanced.setColorAt(i, _scratchColor.setHex(domainColor));
      }
      targetTokenInstanced.instanceMatrix.needsUpdate = true;
      if (targetTokenInstanced.instanceColor) {
        targetTokenInstanced.instanceColor.needsUpdate = true;
      }

      // Update 20 Multi-Part Neuron Assemblies
      for (let i = 0; i < 20; i++) {
        const item = neuronAssemblies[i];
        const targetPos = getNeuronPosition3D(i, currentElevation);
        item.group.position.copy(targetPos);

        const liveNeuron: LIFNeuron | undefined = engine.neurons[i];
        const vNorm = liveNeuron
          ? THREE.MathUtils.clamp((liveNeuron.vMem - -70) / 40, 0, 1)
          : 0.25;

        item.somaMat.emissiveIntensity = 0.3 + vNorm * 0.85;
        if (item.shuntShield) {
          item.shuntShield.rotation.z = elapsed * 1.25;
          const shuntScale = 1.0 + Math.sin(elapsed * 3.2 + i) * 0.08;
          item.shuntShield.scale.setScalar(shuntScale);
        }
      }

      // Update Synaptic Filaments between neurons
      let synWrite = 0;
      for (let s = 0; s < synapses.length && synWrite < 120; s++) {
        const syn = synapses[s];
        if (Math.abs(syn.weight) < 0.18) continue;
        const pA = neuronAssemblies[syn.preId]?.group.position;
        const pB = neuronAssemblies[syn.postId]?.group.position;
        if (!pA || !pB) continue;

        const base = synWrite * 6;
        synapseLinePositions[base] = pA.x;
        synapseLinePositions[base + 1] = pA.y;
        synapseLinePositions[base + 2] = pA.z;
        synapseLinePositions[base + 3] = pB.x;
        synapseLinePositions[base + 4] = pB.y;
        synapseLinePositions[base + 5] = pB.z;

        const isInhib = syn.weight < 0;
        const r = isInhib ? 0.06 : 0.39;
        const g = isInhib ? 0.72 : 0.45;
        const b = isInhib ? 0.5 : 0.94;
        synapseLineColors[base] = r;
        synapseLineColors[base + 1] = g;
        synapseLineColors[base + 2] = b;
        synapseLineColors[base + 3] = r;
        synapseLineColors[base + 4] = g;
        synapseLineColors[base + 5] = b;
        synWrite++;
      }
      synapseLinesGeo.setDrawRange(0, synWrite * 2);
      synapseLinesGeo.attributes.position.needsUpdate = true;
      synapseLinesGeo.attributes.color.needsUpdate = true;

      // Update Argon Core -> SNN Target Projection Beams
      let beamIdx = 0;
      const coreOrigin = argonCoreGroup.position;

      const addProjectionBeam = (targetVec: THREE.Vector3, r: number, g: number, b: number) => {
        if (beamIdx >= maxBeams) return;
        const base = beamIdx * 6;
        beamPositions[base] = coreOrigin.x;
        beamPositions[base + 1] = coreOrigin.y - 0.35;
        beamPositions[base + 2] = coreOrigin.z;
        beamPositions[base + 3] = targetVec.x;
        beamPositions[base + 4] = targetVec.y;
        beamPositions[base + 5] = targetVec.z;

        beamColors[base] = r;
        beamColors[base + 1] = g;
        beamColors[base + 2] = b;
        beamColors[base + 3] = r;
        beamColors[base + 4] = g;
        beamColors[base + 5] = b;
        beamIdx++;
      };

      if (activeFilterMode === 'all' || activeFilterMode === 'shunt') {
        addProjectionBeam(neuronAssemblies[12].group.position, 0.06, 0.73, 0.51);
        addProjectionBeam(neuronAssemblies[13].group.position, 0.06, 0.73, 0.51);
      }
      if (activeFilterMode === 'all' || activeFilterMode === 'stdp') {
        for (let n = 8; n <= 15; n++) {
          if (n === 12 || n === 13) continue;
          addProjectionBeam(neuronAssemblies[n].group.position, 0.5, 0.55, 0.97);
        }
      }
      if (activeFilterMode === 'all' || activeFilterMode === 'drift') {
        for (let n = 0; n < 6; n += 2) {
          addProjectionBeam(neuronAssemblies[n].group.position, 0.22, 0.74, 0.97);
        }
      }
      if (activeFilterMode === 'all' || activeFilterMode === 'dma') {
        for (let n = 16; n < 20; n++) {
          addProjectionBeam(neuronAssemblies[n].group.position, 0.96, 0.62, 0.04);
        }
      }

      beamGeo.setDrawRange(0, beamIdx * 2);
      beamGeo.attributes.position.needsUpdate = true;
      beamGeo.attributes.color.needsUpdate = true;

      controls.update();
      renderer.render(scene, camera);
      afterDraw(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      controls.dispose();
      pmrem.dispose();
      renderer.dispose();
    };
  }, [engine]);

  const dri = rsiState.currentMetrics.divergenceRiskIndex;
  const isRsiActive = rsiState.isActive || rsiState.isAnalyzing;

  return (
    <div className="bg-slate-950 border border-indigo-500/40 rounded-xl overflow-hidden shadow-2xl flex flex-col">
      {/* Top Structural Header */}
      <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
            <Boxes className="w-4 h-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Argon 3D Biological Self-Improvement Visualizer
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-700/60 font-semibold">
                {argonSet.builderModel} ({argonSet.biologicalPlasticity?.convergenceVelocityGain ?? 3.6}x Bio-Speed)
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700/60 font-semibold">
                Watchdog Approval: {argonSet.biologicalPlasticity?.watchdogApprovalGate.status ?? 'APPROVED'}
              </span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold ${
                  isRsiActive
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-700/60'
                    : 'bg-slate-900 text-sky-300 border-slate-700'
                }`}
              >
                {rsiState.isAnalyzing
                  ? '3-PASS BIO-PLASTICITY ACTIVE'
                  : rsiState.isActive
                  ? 'AUTONOMOUS BIO-RSI STREAM'
                  : 'READY FOR BIO-PROJECTION'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Live Three.js 3D mapping of <span className="text-indigo-300 font-mono">gemini-4-argon</span> biological plasticity (BCM &theta;<sub>M</sub>, Turrigiano &beta;-scaling, Bi-Poo STDP, PV+ &sigma;&approx;1.000) with Watchdog approval governance.
            </p>
          </div>
        </div>

        {/* Target Domain Filters */}
        <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-mono">
          {(
            [
              { id: 'all', label: 'All Bio-Targets (4)', color: 'indigo' },
              { id: 'shunt', label: 'PV+ Shunt (σ=1.000)', color: 'emerald' },
              { id: 'stdp', label: 'BCM θ_M & Bi-Poo STDP', color: 'violet' },
              { id: 'drift', label: 'Turrigiano β-Scaling', color: 'sky' },
              { id: 'dma', label: 'Watchdog Gate & DMA', color: 'amber' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              className={`px-2.5 py-1 rounded-md border transition-colors cursor-pointer ${
                activeFilter === tab.id
                  ? 'bg-indigo-600 text-white border-indigo-400 font-semibold'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Status Toast Banner */}
      {statusToast && (
        <div className="px-4 py-2 bg-emerald-950 border-b border-emerald-700/60 text-xs text-emerald-300 font-mono flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{statusToast}</span>
          </div>
          <button
            onClick={() => setStatusToast(null)}
            className="text-[10px] text-slate-400 hover:text-white cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 3D Viewport Container */}
      <div className="relative w-full h-[460px] bg-[#060a14] select-none">
        <div ref={mountRef} className="w-full h-full" />

        {/* Top-Left Telemetry & Biological Plasticity Legend Overlay (Solid opaque dark card per Three.js skill) */}
        <div className="absolute top-3 left-3 bg-slate-950 border border-slate-800 rounded-lg p-3 shadow-xl max-w-[290px] pointer-events-auto text-[11px] space-y-2">
          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
            <span className="font-mono font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-indigo-400" />
              Argon Bio-Plasticity Map
            </span>
            <span className="font-mono text-[10px] text-emerald-400 font-semibold">
              {argonSet.biologicalPlasticity?.receptiveFieldSelectivityDb.toFixed(1) ?? '22.2'} dB SNR
            </span>
          </div>

          <div className="space-y-1.5 font-mono text-[10px]">
            <div className="flex items-center justify-between">
              <span className="text-emerald-400">● PV+ Shunt (N12/N13):</span>
              <span className="text-slate-200">
                &sigma; = {argonSet.biologicalPlasticity?.criticalBranchingSigma.toFixed(3) ?? '1.000'} ({argonSet.biologicalPlasticity?.parvalbuminShuntConductance ?? -0.385})
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-indigo-400">● BCM &theta;<sub>M</sub> &amp; Bi-Poo STDP:</span>
              <span className="text-slate-200">
                &theta;<sub>M</sub>={argonSet.biologicalPlasticity?.bcmSlidingThresholdHz.toFixed(1) ?? '28.0'}Hz | {(argonSet.hyperparameterSet.aMinus / Math.max(0.001, argonSet.hyperparameterSet.aPlus)).toFixed(2)}x
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sky-400">● Turrigiano &beta;-Scale:</span>
              <span className="text-slate-200">
                {argonSet.biologicalPlasticity?.turrigianoScalingFactor.toFixed(3) ?? '0.985'}x (100% Ratio Lock)
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-amber-400">● Watchdog Approval:</span>
              <span className="text-emerald-400 font-bold">
                {argonSet.biologicalPlasticity?.watchdogApprovalGate.status ?? 'APPROVED'} ({argonSet.biologicalPlasticity?.watchdogApprovalGate.approvalLatencyMs ?? 1.4}ms)
              </span>
            </div>
          </div>

          <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-400">
            <span>DRI: {dri.toFixed(2)} | {argonSet.biologicalPlasticity?.convergenceVelocityGain ?? 3.6}x Faster</span>
            <span className="text-indigo-300">Click 3D node</span>
          </div>
        </div>

        {/* Top-Right Selected Node / Target Inspector Card */}
        {selectedNode && (
          <div className="absolute top-3 right-3 bg-slate-950 border border-indigo-500/50 rounded-lg p-3 shadow-xl max-w-[300px] pointer-events-auto text-xs space-y-2">
            <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-1.5">
              <div>
                <span className="text-[10px] font-mono uppercase text-indigo-400 block">
                  {selectedNode.layer}
                </span>
                <h4 className="font-bold text-white text-xs">{selectedNode.label}</h4>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-slate-400 hover:text-white text-[11px] font-mono px-1.5 py-0.5 bg-slate-900 rounded border border-slate-800 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">{selectedNode.details}</p>
            <div className="bg-slate-900 border border-slate-800 rounded p-2 font-mono text-[10px] space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Argon Action:</span>
                <span className="text-emerald-400 font-bold">{selectedNode.targetAction}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">{selectedNode.metricLabel}:</span>
                <span className="text-sky-300">{selectedNode.metricValue}</span>
              </div>
            </div>
          </div>
        )}

        {/* Collapsible Bottom Control Dock (Solid dark surface, no backdrop-filter over WebGL) */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl px-3.5 py-2 pointer-events-auto flex flex-col gap-2 max-w-[96%]">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-[11px] font-mono text-slate-300">
              <Sliders className="w-3.5 h-3.5 text-indigo-400" />
              <span className="font-semibold text-white">3D Matrix & Set Builder Dock</span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setAnimateMatrixTargets((prev) => !prev)}
                className={`px-2.5 py-1 rounded text-[11px] font-mono border flex items-center gap-1 cursor-pointer ${
                  animateMatrixTargets
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-600/60'
                    : 'bg-slate-900 text-slate-400 border-slate-800'
                }`}
                title="Toggle animated SNN matrix target extraction particles"
              >
                <Activity className="w-3 h-3" />
                <span>{animateMatrixTargets ? 'Matrix Targets: Animated' : 'Matrix Targets: Static'}</span>
              </button>

              <button
                onClick={handleApplyAndAnimate}
                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[11px] font-mono font-semibold flex items-center gap-1 cursor-pointer"
                title="Project and apply Argon structural set to live SNN matrix"
              >
                <Zap className="w-3 h-3 text-amber-300" />
                <span>Project Set to SNN</span>
              </button>

              <button
                onClick={handleTriggerSynthesisWave}
                disabled={rsiState.isAnalyzing}
                className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-indigo-300 border border-indigo-700/50 rounded text-[11px] font-mono flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                title="Trigger new Argon set builder synthesis cycle"
              >
                <Sparkles className="w-3 h-3 text-indigo-400" />
                <span>{rsiState.isAnalyzing ? 'Building...' : 'Pulse Synthesis Wave'}</span>
              </button>

              <button
                onClick={() => setDockCollapsed((c) => !c)}
                className="p-1 text-slate-400 hover:text-white bg-slate-900 rounded border border-slate-800 cursor-pointer"
                title={dockCollapsed ? 'Expand camera & elevation controls' : 'Collapse controls'}
              >
                {dockCollapsed ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {!dockCollapsed && (
            <div className="flex flex-wrap items-center justify-between gap-4 pt-1.5 border-t border-slate-800 text-[11px] font-mono">
              {/* Camera Viewpoint Presets */}
              <div className="flex items-center gap-1">
                <span className="text-slate-400 mr-1">Camera:</span>
                {(
                  [
                    { id: 'overview', label: 'Overview' },
                    { id: 'matrix', label: '20×20 Matrix' },
                    { id: 'cortical', label: 'Cortical Ring' },
                    { id: 'argon_core', label: 'Argon Core' },
                  ] as const
                ).map((cam) => (
                  <button
                    key={cam.id}
                    onClick={() => handleCameraPreset(cam.id)}
                    className={`px-2 py-0.5 rounded border cursor-pointer ${
                      cameraPreset === cam.id
                        ? 'bg-indigo-600/40 text-indigo-200 border-indigo-400'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {cam.label}
                  </button>
                ))}
              </div>

              {/* Layer Elevation Slider */}
              <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-sky-400" />
                <span className="text-slate-400">Topology Elevation:</span>
                <input
                  type="range"
                  min={1.6}
                  max={5.0}
                  step={0.1}
                  value={layerElevation}
                  onChange={(e) => setLayerElevation(parseFloat(e.target.value))}
                  className="w-24 accent-indigo-500 cursor-pointer"
                />
                <span className="text-indigo-300 w-8">{layerElevation.toFixed(1)}m</span>
              </div>

              <button
                onClick={() => handleCameraPreset('overview')}
                className="text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Orbit</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bottom 4-Target Structural Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 p-3 bg-slate-900 border-t border-slate-800 text-xs">
        {argonSet.structuralRefinements.map((ref: ArgonStructuralRefinement, idx: number) => {
          const domainKey: Exclude<TargetFilter, 'all'> =
            idx === 0 ? 'shunt' : idx === 1 ? 'stdp' : idx === 2 ? 'drift' : 'dma';
          const isSelected = activeFilter === domainKey;
          return (
            <button
              key={idx}
              onClick={() => setActiveFilter(isSelected ? 'all' : domainKey)}
              className={`text-left p-2.5 rounded-lg border transition-colors cursor-pointer flex flex-col justify-between gap-1 ${
                isSelected
                  ? 'bg-indigo-950/70 border-indigo-400 text-white'
                  : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300'
              }`}
            >
              <div className="flex items-center justify-between gap-1 font-mono text-[10px]">
                <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-indigo-300 uppercase">
                  {ref.module}
                </span>
                <span className="text-emerald-400 font-bold uppercase">{ref.action}</span>
              </div>
              <div className="font-bold text-[11px] text-white line-clamp-1">{ref.component}</div>
              <div className="text-[10px] text-slate-400 font-mono line-clamp-1">
                {ref.structuralImpact}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ArgonSelfImprovementVisualizer;
