import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  ArgonRefinedStructuralSet,
  HardwareTelemetry,
  LIFNeuron,
  Synapse,
} from '../types';
import { SNNEngine } from '../lib/snnEngine';
import {
  Boxes,
  Camera,
  ChevronDown,
  ChevronUp,
  Cpu,
  Eye,
  Layers,
  Maximize2,
  Minimize2,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Zap,
} from 'lucide-react';

interface ArgonStructuralMatrix3DProps {
  engine: SNNEngine;
  argonSet: ArgonRefinedStructuralSet;
  telemetry: HardwareTelemetry;
  isEvaluating: boolean;
  onApplyArgonSet: () => void;
  onTriggerResynthesize: () => void;
}

type TargetFocusMode = 'all' | 'ring_shunt' | 'stdp_clamp' | 'drift_guard' | 'aer_dma';
type CameraPreset = 'isometric' | 'top_matrix' | 'argon_core' | 'profile';

// Pre-allocated module-scope scratch objects for zero-GC render loop
const _dummyObj = new THREE.Object3D();
const _scratchColor = new THREE.Color();
const _targetCamPos = new THREE.Vector3();
const _targetLookAt = new THREE.Vector3();

/**
 * Generates a procedural circuit/grid CanvasTexture for the neuromorphic silicon substrate floor
 */
function createSubstrateFloorTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  // Deep silicon wafer background
  ctx.fillStyle = '#070b14';
  ctx.fillRect(0, 0, 1024, 1024);

  // Subtle sub-grid lines
  ctx.strokeStyle = 'rgba(30, 58, 138, 0.28)';
  ctx.lineWidth = 1;
  const step = 32;
  for (let i = 0; i <= 1024; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 1024);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(1024, i);
    ctx.stroke();
  }

  // Major bus traces
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 1024; i += 128) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 1024);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(1024, i);
    ctx.stroke();
  }

  // Concentric cortical ring markings in center
  ctx.strokeStyle = 'rgba(99, 102, 241, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(512, 512, 220, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(16, 185, 129, 0.28)';
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.arc(512, 512, 165, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/**
 * Generates a soft radial contact shadow CanvasTexture
 */
function createRadialShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 120);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
  grad.addColorStop(0.55, 'rgba(2, 6, 23, 0.28)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const ArgonStructuralMatrix3D: React.FC<ArgonStructuralMatrix3DProps> = ({
  engine,
  argonSet,
  telemetry,
  isEvaluating,
  onApplyArgonSet,
  onTriggerResynthesize,
}) => {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);

  // Interactive HUD controls state
  const [targetFocus, setTargetFocus] = useState<TargetFocusMode>('all');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('isometric');
  const [explodedSeparation, setExplodedSeparation] = useState<number>(0.35);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [isExpandedHeight, setIsExpandedHeight] = useState<boolean>(false);
  const [selectedNeuronInfo, setSelectedNeuronInfo] = useState<{
    id: number;
    label: string;
    layer: string;
    vMem: number;
    argonRole: string;
  } | null>(null);
  const [buildPulseProgress, setBuildPulseProgress] = useState<number>(1.0);

  // Store latest mutable state in refs for the 60fps Three.js loop without re-mounting WebGL
  const stateRef = useRef({
    engine,
    argonSet,
    telemetry,
    targetFocus: 'all' as TargetFocusMode,
    cameraPreset: 'isometric' as CameraPreset,
    explodedSeparation: 0.35,
    cameraTransitionActive: false,
    buildWaveTime: 0,
  });

  useEffect(() => {
    stateRef.current.engine = engine;
    stateRef.current.argonSet = argonSet;
    stateRef.current.telemetry = telemetry;
  }, [engine, argonSet, telemetry]);

  useEffect(() => {
    stateRef.current.targetFocus = targetFocus;
  }, [targetFocus]);

  useEffect(() => {
    stateRef.current.explodedSeparation = explodedSeparation;
  }, [explodedSeparation]);

  const handleSelectCameraPreset = (preset: CameraPreset) => {
    setCameraPreset(preset);
    stateRef.current.cameraPreset = preset;
    stateRef.current.cameraTransitionActive = true;
  };

  const handleTriggerBuildWave = () => {
    stateRef.current.buildWaveTime = performance.now();
    setBuildPulseProgress(0);
    onApplyArgonSet();
  };

  // Keyboard shortcut 'H' to collapse/expand bottom control dock
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() === 'h' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        setDockCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    // 1. Software-WebGL detection from GPU renderer string
    const isSoftwareGl = (() => {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 480;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const horizonColor = new THREE.Color(0x060a14);
    scene.background = horizonColor;
    scene.fog = new THREE.FogExp2(0x060a14, 0.018);

    // 2. Studio Environment Reflection via RoomEnvironment + PMREMGenerator
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 200);
    camera.position.set(14.5, 12.0, 15.5);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.5, 0);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.minDistance = 6;
    controls.maxDistance = 36;
    controls.addEventListener('start', () => {
      stateRef.current.cameraTransitionActive = false;
    });

    // 3. Balanced 3-Point Studio Lighting Rig (Warm Key + Cool Hemisphere Fill + Rim)
    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x090d16, 0.85);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1e0, 2.2);
    keyLight.position.set(12, 18, 10);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 45;
    const d = 14;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x818cf8, 1.35);
    rimLight.position.set(-14, 10, -12);
    scene.add(rimLight);

    // 4. Ground Substrate Wafer Pedestal & Contact Shadow Plane
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const floorTex = createSubstrateFloorTexture(maxAniso);
    const shadowTex = createRadialShadowTexture();

    const waferGroup = new THREE.Group();
    scene.add(waferGroup);

    const waferBaseGeo = new THREE.CylinderGeometry(12.2, 12.6, 0.36, 64);
    const waferBaseMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.78,
      roughness: 0.28,
    });
    const waferBaseMesh = new THREE.Mesh(waferBaseGeo, waferBaseMat);
    waferBaseMesh.position.y = -0.18;
    waferBaseMesh.receiveShadow = true;
    waferGroup.add(waferBaseMesh);

    const waferRimGeo = new THREE.TorusGeometry(12.3, 0.08, 16, 96);
    waferRimGeo.rotateX(Math.PI / 2);
    const waferRimMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      metalness: 0.9,
      roughness: 0.18,
      emissive: 0x0284c7,
      emissiveIntensity: 0.35,
    });
    const waferRimMesh = new THREE.Mesh(waferRimGeo, waferRimMat);
    waferRimMesh.position.y = 0.01;
    waferGroup.add(waferRimMesh);

    const waferSurfaceGeo = new THREE.CircleGeometry(12.1, 64);
    waferSurfaceGeo.rotateX(-Math.PI / 2);
    const waferSurfaceMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.45,
      metalness: 0.35,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const waferSurfaceMesh = new THREE.Mesh(waferSurfaceGeo, waferSurfaceMat);
    waferSurfaceMesh.position.y = 0.005;
    waferSurfaceMesh.receiveShadow = true;
    waferGroup.add(waferSurfaceMesh);

    // Contact shadow grounding plane under the central crossbar & Argon core
    const contactShadowGeo = new THREE.PlaneGeometry(16, 16);
    contactShadowGeo.rotateX(-Math.PI / 2);
    const contactShadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
    });
    const contactShadowMesh = new THREE.Mesh(contactShadowGeo, contactShadowMat);
    contactShadowMesh.position.y = 0.02;
    scene.add(contactShadowMesh);

    // 5. 20x20 SNN Synaptic Crossbar Matrix (`InstancedMesh` = 400 synaptic weight cells)
    // Positioned in the central square of the substrate floor (-4.5 to +4.5 on X and Z)
    const matrixCount = 400; // 20 pre x 20 post
    const cellGeo = new THREE.BoxGeometry(0.32, 1.0, 0.32);
    cellGeo.translate(0, 0.5, 0); // Pivot at bottom-center so y=0 sits flush on floor
    const cellMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.25,
      metalness: 0.72,
    });
    const crossbarInstanced = new THREE.InstancedMesh(cellGeo, cellMat, matrixCount);
    crossbarInstanced.castShadow = !isSoftwareGl;
    crossbarInstanced.receiveShadow = true;
    crossbarInstanced.frustumCulled = false;

    for (let i = 0; i < matrixCount; i++) {
      const pre = Math.floor(i / 20);
      const post = i % 20;
      const x = (pre - 9.5) * 0.44;
      const z = (post - 9.5) * 0.44;
      _dummyObj.position.set(x, 0.03, z);
      _dummyObj.scale.set(1, 0.08, 1);
      _dummyObj.updateMatrix();
      crossbarInstanced.setMatrixAt(i, _dummyObj.matrix);
      crossbarInstanced.setColorAt(i, _scratchColor.setHex(0x1e293b));
    }
    crossbarInstanced.instanceMatrix.needsUpdate = true;
    if (crossbarInstanced.instanceColor) crossbarInstanced.instanceColor.needsUpdate = true;
    crossbarInstanced.computeBoundingSphere();
    scene.add(crossbarInstanced);

    // 6. Composite 6-Part Procedural Argon Builder Core (Elevated above the SNN Matrix)
    const argonCoreGroup = new THREE.Group();
    argonCoreGroup.position.set(0, 5.2, 0);
    scene.add(argonCoreGroup);

    // Part 1: Primary Silhouette — Octahedral Crystalline Synthesizer Core
    const coreCrystalGeo = new THREE.OctahedronGeometry(0.95, 1);
    const coreCrystalMat = new THREE.MeshPhysicalMaterial({
      color: 0x6366f1,
      emissive: 0x4f46e5,
      emissiveIntensity: 0.75,
      metalness: 0.2,
      roughness: 0.12,
      clearcoat: 1.0,
      transmission: isSoftwareGl ? 0 : 0.75,
      transparent: true,
      opacity: isSoftwareGl ? 0.88 : 1.0,
    });
    const coreCrystalMesh = new THREE.Mesh(coreCrystalGeo, coreCrystalMat);
    argonCoreGroup.add(coreCrystalMesh);

    // Part 2: Secondary Read — Inner Brushed Titanium Gimbal Ring
    const innerGimbalGeo = new THREE.TorusGeometry(1.38, 0.065, 16, 64);
    const innerGimbalMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.92,
      roughness: 0.18,
    });
    const innerGimbalMesh = new THREE.Mesh(innerGimbalGeo, innerGimbalMat);
    argonCoreGroup.add(innerGimbalMesh);

    // Part 3: Secondary Read — Outer Anodized Indigo Telemetry Gimbal Ring
    const outerGimbalGeo = new THREE.TorusGeometry(1.75, 0.055, 16, 72);
    const outerGimbalMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      metalness: 0.65,
      roughness: 0.45,
      emissive: 0x0284c7,
      emissiveIntensity: 0.35,
    });
    const outerGimbalMesh = new THREE.Mesh(outerGimbalGeo, outerGimbalMat);
    outerGimbalMesh.rotation.x = Math.PI / 3;
    argonCoreGroup.add(outerGimbalMesh);

    // Part 4: Accent Detail — 4 Radial Bevelled Heat-Sink Stabilizer Fins
    const finShape = new THREE.Shape();
    finShape.moveTo(0, -0.35);
    finShape.lineTo(0.55, -0.18);
    finShape.lineTo(0.55, 0.18);
    finShape.lineTo(0, 0.35);
    finShape.closePath();
    const finGeo = new THREE.ExtrudeGeometry(finShape, {
      depth: 0.08,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 2,
    });
    finGeo.center();
    const finMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.85,
      roughness: 0.32,
    });
    const finsGroup = new THREE.Group();
    for (let f = 0; f < 4; f++) {
      const finMesh = new THREE.Mesh(finGeo, finMat);
      const angle = (f * Math.PI) / 2;
      finMesh.position.set(Math.cos(angle) * 1.18, 0, Math.sin(angle) * 1.18);
      finMesh.rotation.y = -angle;
      finsGroup.add(finMesh);
    }
    argonCoreGroup.add(finsGroup);

    // Part 5: Downward Structural Projection Emitter Nozzle (LatheGeometry)
    const lathePoints = [
      new THREE.Vector2(0.08, -1.35),
      new THREE.Vector2(0.28, -1.1),
      new THREE.Vector2(0.42, -0.75),
      new THREE.Vector2(0.18, -0.65),
    ];
    const nozzleGeo = new THREE.LatheGeometry(lathePoints, 24);
    const nozzleMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.95,
      roughness: 0.15,
    });
    const nozzleMesh = new THREE.Mesh(nozzleGeo, nozzleMat);
    argonCoreGroup.add(nozzleMesh);

    // Part 6: Top Crown Cap Ring
    const crownCapGeo = new THREE.CylinderGeometry(0.22, 0.45, 0.25, 16);
    const crownCapMat = new THREE.MeshStandardMaterial({
      color: 0xa855f7,
      metalness: 0.55,
      roughness: 0.42,
      emissive: 0x7e22ce,
      emissiveIntensity: 0.45,
    });
    const crownCapMesh = new THREE.Mesh(crownCapGeo, crownCapMat);
    crownCapMesh.position.y = 0.95;
    argonCoreGroup.add(crownCapMesh);

    // 7. 20 Composite Multi-Part Neuron Assemblies Arranged in 3 Concentric / Layered Zones
    // - Afferent E0-E7: Left arc (radius 8.8, angle -110 deg to +110 deg)
    // - Cortical Ring N8-N15: Elevated mid-ring (radius 5.6, 8 octagonal ring positions)
    // - Efferent Decoders O16-O19: Right arc (radius 8.8, 4 output positions)
    const neuronGroups: THREE.Group[] = [];
    const neuronCoreMeshes: THREE.Mesh[] = [];
    const neuronShieldMeshes: (THREE.Mesh | null)[] = [];
    const neuronBasePositions: THREE.Vector3[] = [];
    const pickableProxies: THREE.Mesh[] = [];

    const basePedestalGeo = new THREE.CylinderGeometry(0.46, 0.54, 0.18, 6);
    basePedestalGeo.translate(0, 0.09, 0);
    const somaHousingGeo = new THREE.CylinderGeometry(0.32, 0.38, 0.55, 16);
    somaHousingGeo.translate(0, 0.45, 0);
    const somaCoreGeo = new THREE.SphereGeometry(0.26, 20, 20);
    somaCoreGeo.translate(0, 0.82, 0);
    const dendriticCrownGeo = new THREE.TorusGeometry(0.34, 0.04, 12, 24);
    dendriticCrownGeo.rotateX(Math.PI / 2);
    dendriticCrownGeo.translate(0, 0.82, 0);
    const shuntShieldGeo = new THREE.TorusGeometry(0.62, 0.05, 12, 32);
    shuntShieldGeo.rotateX(Math.PI / 2);
    shuntShieldGeo.translate(0, 0.45, 0);
    const proxyGeo = new THREE.CylinderGeometry(0.65, 0.65, 1.3, 12);
    proxyGeo.translate(0, 0.65, 0);
    const proxyMat = new THREE.MeshBasicMaterial({ visible: false });

    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.85,
      roughness: 0.25,
    });
    const housingMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.6,
      roughness: 0.52,
    });

    for (let id = 0; id < 20; id++) {
      const nGroup = new THREE.Group();
      let pos = new THREE.Vector3();

      if (id < 8) {
        // Afferent Input Channels E0-E7 (Left Crescent)
        const t = (id / 7) * 1.6 - 0.8; // -0.8 to +0.8 rad around -X
        const angle = Math.PI + t;
        pos.set(Math.cos(angle) * 8.6, 0.0, Math.sin(angle) * 8.6);
      } else if (id < 16) {
        // Cortical Association Ring N8-N15 (Center Ring around Crossbar)
        const ringIdx = id - 8;
        const angle = (ringIdx / 8) * Math.PI * 2;
        pos.set(Math.cos(angle) * 6.0, 0.6, Math.sin(angle) * 6.0);
      } else {
        // Efferent Decoders O16-O19 (Right Crescent)
        const effIdx = id - 16;
        const angle = ((effIdx / 3) - 0.5) * 1.1;
        pos.set(Math.cos(angle) * 8.8, 0.0, Math.sin(angle) * 8.8);
      }

      neuronBasePositions.push(pos.clone());
      nGroup.position.copy(pos);

      // Part 1: Hexagonal Base Pedestal (pivoted at bottom-center y=0)
      const pedMesh = new THREE.Mesh(basePedestalGeo, pedestalMat);
      pedMesh.castShadow = !isSoftwareGl;
      pedMesh.receiveShadow = true;
      nGroup.add(pedMesh);

      // Part 2: Metallic Soma Housing
      const houseMesh = new THREE.Mesh(somaHousingGeo, housingMat);
      houseMesh.castShadow = !isSoftwareGl;
      nGroup.add(houseMesh);

      // Part 3: Glowing Membrane Voltage Core
      const isParvalbuminShunt = id === 12 || id === 13;
      const baseColor =
        id < 8
          ? 0x38bdf8 // Afferent Cyan
          : isParvalbuminShunt
          ? 0x10b981 // Parvalbumin N12/N13 Emerald Shunt
          : id < 16
          ? 0x818cf8 // Cortical Indigo
          : 0xf59e0b; // Efferent Amber

      const coreMat = new THREE.MeshStandardMaterial({
        color: baseColor,
        emissive: baseColor,
        emissiveIntensity: 0.5,
        roughness: 0.2,
        metalness: 0.3,
      });
      const coreMesh = new THREE.Mesh(somaCoreGeo, coreMat);
      nGroup.add(coreMesh);
      neuronCoreMeshes.push(coreMesh);

      // Part 4: Dendritic Crown Ring
      const crownMat = new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        metalness: 0.9,
        roughness: 0.15,
      });
      const crownMesh = new THREE.Mesh(dendriticCrownGeo, crownMat);
      nGroup.add(crownMesh);

      // Part 5: Parvalbumin Lateral Inhibition Shunt Ring for N12 & N13 (or subtle target ring)
      if (isParvalbuminShunt) {
        const shieldMat = new THREE.MeshStandardMaterial({
          color: 0x10b981,
          emissive: 0x059669,
          emissiveIntensity: 0.85,
          metalness: 0.5,
          roughness: 0.25,
        });
        const shieldMesh = new THREE.Mesh(shuntShieldGeo, shieldMat);
        nGroup.add(shieldMesh);
        neuronShieldMeshes.push(shieldMesh);
      } else {
        neuronShieldMeshes.push(null);
      }

      // Raycasting proxy on Layer 1
      const proxyMesh = new THREE.Mesh(proxyGeo, proxyMat);
      proxyMesh.layers.set(1);
      proxyMesh.userData = { neuronId: id };
      nGroup.add(proxyMesh);
      pickableProxies.push(proxyMesh);

      scene.add(nGroup);
      neuronGroups.push(nGroup);
    }

    // 8. Argon Target Projection Laser Beams (Connecting Argon Builder Core to the 4 Target Zones)
    const projectionBeamsGroup = new THREE.Group();
    scene.add(projectionBeamsGroup);

    const beamMaterials: THREE.MeshBasicMaterial[] = [];
    const beamMeshes: THREE.Mesh[] = [];

    // Create 8 structural projection beams from the Argon Core to key SNN coordinates
    const beamTargets = [
      { pos: neuronBasePositions[12], color: 0x10b981, targetType: 'ring_shunt' }, // N12 Shunt
      { pos: neuronBasePositions[13], color: 0x10b981, targetType: 'ring_shunt' }, // N13 Shunt
      { pos: new THREE.Vector3(-2.0, 0.2, -2.0), color: 0x6366f1, targetType: 'stdp_clamp' }, // Crossbar Q1
      { pos: new THREE.Vector3(2.0, 0.2, 2.0), color: 0x6366f1, targetType: 'stdp_clamp' }, // Crossbar Q4
      { pos: neuronBasePositions[9], color: 0xf59e0b, targetType: 'drift_guard' }, // Cortical Drift Guard
      { pos: neuronBasePositions[14], color: 0xf59e0b, targetType: 'drift_guard' }, // Cortical Drift Guard
      { pos: neuronBasePositions[3], color: 0x06b6d4, targetType: 'aer_dma' }, // Afferent DMA Bus
      { pos: neuronBasePositions[17], color: 0x06b6d4, targetType: 'aer_dma' }, // Efferent DMA Bus
    ];

    beamTargets.forEach((bt) => {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 4.2, 0),
        new THREE.Vector3(bt.pos.x * 0.45, 2.6, bt.pos.z * 0.45),
        new THREE.Vector3(bt.pos.x, bt.pos.y + 0.8, bt.pos.z),
      ]);
      const tubeGeo = new THREE.TubeGeometry(curve, 24, 0.045, 8, false);
      const tubeMat = new THREE.MeshBasicMaterial({
        color: bt.color,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      });
      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      tubeMesh.userData = { targetType: bt.targetType, baseColor: bt.color };
      projectionBeamsGroup.add(tubeMesh);
      beamMaterials.push(tubeMat);
      beamMeshes.push(tubeMesh);
    });

    // Lateral Ring Inhibition Torus Loop connecting Cortical Neurons N8..N15
    const corticalRingGeo = new THREE.TorusGeometry(6.0, 0.06, 12, 64);
    corticalRingGeo.rotateX(Math.PI / 2);
    const corticalRingMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 0.55,
      metalness: 0.7,
      roughness: 0.2,
      transparent: true,
      opacity: 0.85,
    });
    const corticalRingMesh = new THREE.Mesh(corticalRingGeo, corticalRingMat);
    corticalRingMesh.position.y = 1.05;
    scene.add(corticalRingMesh);

    // 9. Compile shaders once on hardware WebGL
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // 10. High-Performance Raycasting on Layer 1 for clicking neurons
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);
    const pointer = new THREE.Vector2();

    const onPointerDown = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(pickableProxies, false);
      if (hits.length > 0) {
        const hitId = hits[0].object.userData.neuronId;
        const liveNeuron: LIFNeuron | undefined = stateRef.current.engine?.neurons?.[hitId];
        if (liveNeuron) {
          let role = 'Feedforward Afferent Channel (64B Burst DMA Routed)';
          if (hitId === 12 || hitId === 13) {
            role = 'Parvalbumin Fast-Spiking Ring Inhibitor (Lateral Shunt N12/N13)';
          } else if (hitId >= 8 && hitId < 16) {
            role = 'Cortical Associative Neuron (STDP LTD Clamp & Drift Guarded)';
          } else if (hitId >= 16) {
            role = 'Efferent Motor/Output Decoder (Capability Lock >= 2.2x)';
          }
          setSelectedNeuronInfo({
            id: liveNeuron.id,
            label: liveNeuron.label,
            layer: liveNeuron.layer.toUpperCase(),
            vMem: Math.round(liveNeuron.vMem * 10) / 10,
            argonRole: role,
          });
        }
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    // Resize observer
    const onResize = () => {
      if (!container) return;
      const newW = container.clientWidth || 800;
      const newH = container.clientHeight || 480;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    // 11. Animation Loop with Software-WebGL `afterDraw` Pacing and Smooth Exponential Damping
    const clock = new THREE.Clock();
    let frameId = 0;
    let currentExploded = stateRef.current.explodedSeparation;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } else {
        frameId = window.setTimeout(cb, 80);
      }
    }

    function tick() {
      const rawDt = clock.getDelta();
      const dt = Math.min(rawDt, 0.05);
      const elapsed = clock.getElapsedTime();
      const {
        engine: liveEngine,
        targetFocus: activeFocus,
        cameraPreset: activePreset,
        explodedSeparation: targetExploded,
        cameraTransitionActive,
        buildWaveTime,
      } = stateRef.current;

      // Smoothly damp exploded view separation
      currentExploded = THREE.MathUtils.damp(currentExploded, targetExploded, 6.0, dt);

      // Elevate Argon Core and Cortical Ring based on exploded separation
      argonCoreGroup.position.y = 4.2 + currentExploded * 3.2 + Math.sin(elapsed * 1.8) * 0.12;
      corticalRingMesh.position.y = 0.75 + currentExploded * 1.45;

      // Rotate Argon Core & Gimbal Rings
      coreCrystalMesh.rotation.y += dt * 0.85;
      coreCrystalMesh.rotation.x = Math.sin(elapsed * 0.9) * 0.25;
      innerGimbalMesh.rotation.x += dt * 1.2;
      innerGimbalMesh.rotation.y -= dt * 0.7;
      outerGimbalMesh.rotation.z += dt * 0.65;
      finsGroup.rotation.y -= dt * 0.4;

      // Build wave animation progress (when user clicks Apply Argon Set)
      let waveBoost = 0;
      if (buildWaveTime > 0) {
        const sinceWaveSec = (performance.now() - buildWaveTime) / 1000;
        if (sinceWaveSec < 2.5) {
          waveBoost = Math.sin((sinceWaveSec / 2.5) * Math.PI);
        }
      }

      // Update Neuron Positions & Membrane Voltage Glow from live SNNEngine
      const neurons: LIFNeuron[] = liveEngine?.neurons || [];
      const simTime = liveEngine?.simulationTime || 0;

      for (let i = 0; i < 20; i++) {
        const nGroup = neuronGroups[i];
        const basePos = neuronBasePositions[i];
        const layerLift = i >= 8 && i < 16 ? currentExploded * 1.45 : currentExploded * 0.35;
        nGroup.position.y = basePos.y + layerLift;

        const coreMesh = neuronCoreMeshes[i];
        const coreMat = coreMesh.material as THREE.MeshStandardMaterial;
        const nData = neurons[i];

        if (nData) {
          const spikedRecently = simTime - nData.lastSpikeTime < 35;
          const vNorm = THREE.MathUtils.clamp((nData.vMem - nData.vReset) / (nData.vThresh - nData.vReset), 0, 1.2);
          const scale = 1.0 + (spikedRecently ? 0.38 : vNorm * 0.18) + waveBoost * 0.2;
          coreMesh.scale.setScalar(scale);
          coreMat.emissiveIntensity = (spikedRecently ? 1.8 : 0.35 + vNorm * 0.75) + waveBoost * 0.6;
        }

        const shield = neuronShieldMeshes[i];
        if (shield) {
          shield.rotation.z += dt * 1.5;
          const sMat = shield.material as THREE.MeshStandardMaterial;
          sMat.emissiveIntensity =
            activeFocus === 'all' || activeFocus === 'ring_shunt' ? 0.95 + waveBoost * 0.8 : 0.25;
        }
      }

      // Update 20x20 Synaptic Crossbar InstancedMesh heights & colors from live synapses
      const synapses: Synapse[] = liveEngine?.synapses || [];
      // Build fast lookup map for active weights
      const weightLookup = new Float32Array(400);
      for (let s = 0; s < synapses.length; s++) {
        const syn = synapses[s];
        if (syn.preId >= 0 && syn.preId < 20 && syn.postId >= 0 && syn.postId < 20) {
          weightLookup[syn.preId * 20 + syn.postId] = syn.weight;
        }
      }

      for (let idx = 0; idx < matrixCount; idx++) {
        const pre = Math.floor(idx / 20);
        const post = idx % 20;
        const w = weightLookup[idx];
        const absW = Math.abs(w);

        const x = (pre - 9.5) * 0.44;
        const z = (post - 9.5) * 0.44;
        const barHeight = Math.max(0.06, absW * (0.95 + currentExploded * 0.6) + waveBoost * 0.25);

        _dummyObj.position.set(x, 0.03, z);
        _dummyObj.scale.set(1, barHeight, 1);
        _dummyObj.updateMatrix();
        crossbarInstanced.setMatrixAt(idx, _dummyObj.matrix);

        if (absW < 0.02) {
          _scratchColor.setHex(0x0f172a);
        } else if (w < 0) {
          // Inhibitory / Parvalbumin Shunt Synapse
          if (activeFocus === 'all' || activeFocus === 'ring_shunt') {
            _scratchColor.setHex(0x10b981);
          } else {
            _scratchColor.setHex(0x064e3b);
          }
        } else if (absW > 1.05) {
          // High-weight synapse targeted by Argon LTD Clamp
          if (activeFocus === 'all' || activeFocus === 'stdp_clamp') {
            _scratchColor.setHex(0xa855f7);
          } else {
            _scratchColor.setHex(0x4c1d95);
          }
        } else {
          // Nominal Excitatory Synapse
          if (activeFocus === 'all' || activeFocus === 'stdp_clamp' || activeFocus === 'drift_guard') {
            _scratchColor.setHex(0x38bdf8);
          } else {
            _scratchColor.setHex(0x1e3a8a);
          }
        }
        crossbarInstanced.setColorAt(idx, _scratchColor);
      }
      crossbarInstanced.instanceMatrix.needsUpdate = true;
      if (crossbarInstanced.instanceColor) crossbarInstanced.instanceColor.needsUpdate = true;

      // Update Argon Target Projection Beams visibility & opacity based on targetFocus
      for (let b = 0; b < beamMeshes.length; b++) {
        const mesh = beamMeshes[b];
        const mat = beamMaterials[b];
        const tType = mesh.userData.targetType;
        const isHighlighted = activeFocus === 'all' || activeFocus === tType;
        mat.opacity = isHighlighted ? 0.68 + Math.sin(elapsed * 4 + b) * 0.18 + waveBoost * 0.3 : 0.08;
      }

      // Smoothly damp camera to preset if transition is active
      if (cameraTransitionActive) {
        if (activePreset === 'isometric') {
          _targetCamPos.set(14.5, 12.0, 15.5);
          _targetLookAt.set(0, 1.5, 0);
        } else if (activePreset === 'top_matrix') {
          _targetCamPos.set(0.01, 21.5, 0.01);
          _targetLookAt.set(0, 0, 0);
        } else if (activePreset === 'argon_core') {
          _targetCamPos.set(5.2, 6.8, 5.8);
          _targetLookAt.set(0, 4.5, 0);
        } else {
          _targetCamPos.set(0, 4.2, 18.5);
          _targetLookAt.set(0, 1.8, 0);
        }

        const alpha = 1 - Math.exp(-5.0 * dt);
        camera.position.lerp(_targetCamPos, alpha);
        controls.target.lerp(_targetLookAt, alpha);

        if (camera.position.distanceToSquared(_targetCamPos) < 0.02) {
          stateRef.current.cameraTransitionActive = false;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      controls.dispose();
      floorTex.dispose();
      shadowTex.dispose();
      envTarget.dispose();
      renderer.dispose();
    };
  }, []);

  const ltdRatio = (
    argonSet.hyperparameterSet.aMinus / Math.max(0.001, argonSet.hyperparameterSet.aPlus)
  ).toFixed(2);

  return (
    <div
      className={`relative w-full rounded-xl border border-indigo-500/40 bg-[#060a14] overflow-hidden shadow-2xl transition-all duration-300 ${
        isExpandedHeight ? 'h-[660px]' : 'h-[480px]'
      }`}
    >
      {/* Dedicated Empty WebGL Mount Container (Never Re-Renders on React State Changes) */}
      <div ref={canvasMountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Top-Left Minimal Spec & Telemetry Badge (Pointer-Events None Except Action Buttons) */}
      <div className="pointer-events-none absolute top-3 left-3 right-3 flex flex-wrap items-start justify-between gap-2">
        <div className="pointer-events-auto bg-[#0a0f1dd9] border border-slate-800 rounded-lg px-3 py-2 flex flex-col gap-1 shadow-lg">
          <div className="flex items-center gap-2">
            <Boxes className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              3D Argon Structural Set Matrix Synthesizer
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-700/60 font-semibold">
              {argonSet.builderModel}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono text-slate-400">
            <span>
              Crossbar: <strong className="text-sky-300">20×20 SNN (400 Synapses)</strong>
            </span>
            <span>
              LTD/LTP Target: <strong className="text-emerald-300">{ltdRatio}x</strong>
            </span>
            <span>
              Power: <strong className="text-amber-300">{telemetry.powerMw.toFixed(2)} mW</strong>
            </span>
            <span>
              Score: <strong className="text-purple-300">{argonSet.architecturalScorePct}%</strong>
            </span>
          </div>
        </div>

        {/* Selected Neuron Live Readout or Expand Viewport Button */}
        <div className="pointer-events-auto flex items-center gap-2">
          {selectedNeuronInfo && (
            <div className="bg-[#0a0f1dd9] border border-indigo-500/50 rounded-lg px-3 py-1.5 text-[11px] font-mono flex items-center gap-3 shadow-lg">
              <div>
                <span className="text-indigo-300 font-bold">{selectedNeuronInfo.label}</span>{' '}
                <span className="text-slate-400">({selectedNeuronInfo.layer})</span>
                <span className="ml-2 text-emerald-300">vMem: {selectedNeuronInfo.vMem} mV</span>
                <div className="text-[10px] text-slate-400">{selectedNeuronInfo.argonRole}</div>
              </div>
              <button
                onClick={() => setSelectedNeuronInfo(null)}
                className="text-slate-400 hover:text-white text-[10px] px-1.5 py-0.5 rounded bg-slate-800 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          <button
            onClick={() => setIsExpandedHeight((prev) => !prev)}
            className="bg-[#0a0f1dd9] hover:bg-slate-900 text-slate-300 border border-slate-800 rounded-lg p-2 transition-colors cursor-pointer"
            title={isExpandedHeight ? 'Restore Standard Viewport Height' : 'Expand 3D Viewport'}
          >
            {isExpandedHeight ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Unified Collapsible Bottom Control Dock (Zero Side-Panel Clutter, Solid RGBA Surface) */}
      <div
        className={`absolute left-1/2 -translate-x-1/2 bottom-3 w-[94%] max-w-[920px] transition-transform duration-300 ${
          dockCollapsed ? 'translate-y-[calc(100%-28px)]' : 'translate-y-0'
        }`}
      >
        {/* Collapse / Expand Toggle Tab */}
        <div className="flex justify-center">
          <button
            onClick={() => setDockCollapsed((prev) => !prev)}
            className="bg-[#0b1120] hover:bg-slate-900 text-slate-300 border border-b-0 border-slate-700/80 rounded-t-lg px-3 py-1 text-[10px] font-mono flex items-center gap-1.5 cursor-pointer shadow"
            title="Toggle 3D Control Dock (Shortcut: H)"
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="w-3 h-3 text-indigo-400" />
                <span>Show 3D Matrix Controls (H)</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3 text-indigo-400" />
                <span>Hide Controls (H)</span>
              </>
            )}
          </button>
        </div>

        {/* Main Dock Body */}
        <div className="bg-[#0b1120f2] border border-slate-700/90 rounded-xl p-3 shadow-2xl flex flex-col gap-2.5 text-xs">
          {/* Top Row: Structural Target Layer Filter Pills & Action CTA */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-mono text-slate-400 uppercase mr-1 flex items-center gap-1">
                <Layers className="w-3 h-3 text-indigo-400" />
                Target Map:
              </span>
              {[
                { id: 'all', label: 'All Argon Targets (4)' },
                { id: 'ring_shunt', label: 'N12/N13 Ring Shunt' },
                { id: 'stdp_clamp', label: 'STDP LTD Clamp' },
                { id: 'drift_guard', label: 'Drift Quenching' },
                { id: 'aer_dma', label: '64B DMA Bus' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setTargetFocus(item.id as TargetFocusMode)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-mono font-semibold transition-colors cursor-pointer border ${
                    targetFocus === item.id
                      ? 'bg-indigo-600 text-white border-indigo-400'
                      : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleTriggerBuildWave}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-md text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer shadow"
              >
                <Zap className="w-3.5 h-3.5 text-amber-300" />
                <span>Project & Apply Set</span>
              </button>
              <button
                onClick={onTriggerResynthesize}
                disabled={isEvaluating}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-md text-[11px] flex items-center gap-1 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isEvaluating ? 'animate-spin' : 'text-sky-400'}`} />
                <span>Re-Synthesize</span>
              </button>
            </div>
          </div>

          {/* Bottom Row: Exploded Elevation Slider, Camera View Presets & Legend */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/90 text-[11px]">
            {/* Exploded View Slider */}
            <div className="flex items-center gap-2 min-w-[210px]">
              <Sliders className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="text-[10px] font-mono text-slate-400 whitespace-nowrap">
                Layer Separation:
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={explodedSeparation}
                onChange={(e) => setExplodedSeparation(parseFloat(e.target.value))}
                className="w-24 accent-indigo-500 cursor-pointer"
              />
              <span className="text-[10px] font-mono text-indigo-300 w-8">
                {Math.round(explodedSeparation * 100)}%
              </span>
            </div>

            {/* Camera View Presets */}
            <div className="flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5 text-purple-400 mr-0.5" />
              {[
                { id: 'isometric', label: 'Isometric' },
                { id: 'top_matrix', label: 'Top Crossbar' },
                { id: 'argon_core', label: 'Argon Core' },
                { id: 'profile', label: 'Side Profile' },
              ].map((cam) => (
                <button
                  key={cam.id}
                  onClick={() => handleSelectCameraPreset(cam.id as CameraPreset)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors cursor-pointer border ${
                    cameraPreset === cam.id
                      ? 'bg-purple-600/40 text-purple-200 border-purple-400'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {cam.label}
                </button>
              ))}
            </div>

            {/* Static Color Legend (No Pulsating Dots) */}
            <div className="flex items-center gap-3 text-[10px] font-mono text-slate-400">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-xs bg-emerald-400 inline-block" />
                <span>Inhibitory Shunt</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-xs bg-purple-400 inline-block" />
                <span>LTD Clamped</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-xs bg-sky-400 inline-block" />
                <span>Excitatory Matrix</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
