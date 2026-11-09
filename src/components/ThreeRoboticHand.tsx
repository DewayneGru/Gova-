import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import {
  RotateCcw,
  Maximize2,
  Minimize2,
  HandMetal,
  Cpu,
} from 'lucide-react';
import { RoboticJointAngles, TactileSensorFeedback } from '../types';

interface Props {
  jointAngles: RoboticJointAngles;
  isLTDGuarded?: boolean;
  motorBias?: number;
  motorFiringRates?: number[]; // [O16, O17, O18, O19]
  objectType: 'none' | 'handshake_marker' | 'fragile_glass' | 'microchip' | 'sensor_probe';
  onTactileUpdate?: (feedback: TactileSensorFeedback[]) => void;
  interactiveGripActive?: boolean;
}

export const ThreeRoboticHand: React.FC<Props> = ({
  jointAngles,
  isLTDGuarded = false,
  motorBias = 0.0,
  motorFiringRates = [12, 18, 14, 8],
  objectType,
  onTactileUpdate,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [cameraPreset, setCameraPreset] = useState<'perspective' | 'front' | 'fingers' | 'top'>('perspective');

  // Animation & Three.js refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const animFrameId = useRef<number | null>(null);

  // Mechanical joint groups
  const baseGroupRef = useRef<THREE.Group | null>(null);
  const shoulderGroupRef = useRef<THREE.Group | null>(null);
  const elbowGroupRef = useRef<THREE.Group | null>(null);
  const wristRollGroupRef = useRef<THREE.Group | null>(null);
  const wristPitchGroupRef = useRef<THREE.Group | null>(null);

  // Finger joint refs
  const thumbProxRef = useRef<THREE.Group | null>(null);
  const thumbDistRef = useRef<THREE.Group | null>(null);

  const indexProxRef = useRef<THREE.Group | null>(null);
  const indexMidRef = useRef<THREE.Group | null>(null);
  const indexDistRef = useRef<THREE.Group | null>(null);

  const midProxRef = useRef<THREE.Group | null>(null);
  const midMidRef = useRef<THREE.Group | null>(null);
  const midDistRef = useRef<THREE.Group | null>(null);

  const ringProxRef = useRef<THREE.Group | null>(null);
  const ringMidRef = useRef<THREE.Group | null>(null);
  const ringDistRef = useRef<THREE.Group | null>(null);

  const pinkyProxRef = useRef<THREE.Group | null>(null);
  const pinkyMidRef = useRef<THREE.Group | null>(null);
  const pinkyDistRef = useRef<THREE.Group | null>(null);

  // Target object & sparks
  const targetObjectGroupRef = useRef<THREE.Group | null>(null);
  const sparkPointsRef = useRef<THREE.Points | null>(null);
  const statusRingMeshRef = useRef<THREE.Mesh | null>(null);
  const chipLedMeshRef = useRef<THREE.Mesh | null>(null);

  // Current smoothed angles (for smooth mechanical lerp)
  const currentJointsRef = useRef<RoboticJointAngles>({ ...jointAngles });
  const targetJointsRef = useRef<RoboticJointAngles>({ ...jointAngles });

  // Update target joints when prop changes
  useEffect(() => {
    targetJointsRef.current = { ...jointAngles };
  }, [jointAngles]);

  // Orbit camera drag state
  const isDragging = useRef(false);
  const prevMousePos = useRef({ x: 0, y: 0 });
  const sphericalRef = useRef({ radius: 14, theta: Math.PI / 4, phi: Math.PI / 3 });

  // Touch tracking
  const prevTouchDist = useRef<number | null>(null);

  const updateCameraPosition = useCallback(() => {
    if (!cameraRef.current) return;
    const { radius, theta, phi } = sphericalRef.current;
    const x = radius * Math.sin(phi) * Math.sin(theta);
    const y = radius * Math.cos(phi) + 2.5;
    const z = radius * Math.sin(phi) * Math.cos(theta);
    cameraRef.current.position.set(x, y, z);
    cameraRef.current.lookAt(0, 3.2, 0);
  }, []);

  const setPresetView = (preset: 'perspective' | 'front' | 'fingers' | 'top') => {
    setCameraPreset(preset);
    if (preset === 'perspective') {
      sphericalRef.current = { radius: 14, theta: Math.PI / 4, phi: Math.PI / 3 };
    } else if (preset === 'front') {
      sphericalRef.current = { radius: 12, theta: 0, phi: Math.PI / 2.2 };
    } else if (preset === 'fingers') {
      sphericalRef.current = { radius: 8, theta: 0.2, phi: Math.PI / 2.5 };
    } else if (preset === 'top') {
      sphericalRef.current = { radius: 15, theta: 0, phi: 0.1 };
    }
    updateCameraPosition();
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x060913);
    scene.fog = new THREE.FogExp2(0x060913, 0.025);

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      100
    );
    cameraRef.current = camera;
    updateCameraPosition();

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;
    container.replaceChildren(renderer.domElement);

    // 4. Lighting Rig
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(10, 18, 12);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    const rimLight = new THREE.PointLight(0x06b6d4, 2.5, 30);
    rimLight.position.set(-10, 10, -8);
    scene.add(rimLight);

    const fillLight = new THREE.PointLight(0xa855f7, 1.2, 25);
    fillLight.position.set(8, -2, -6);
    scene.add(fillLight);

    // 5. Grid Floor & Pedestal
    const grid = new THREE.GridHelper(24, 24, 0x0ea5e9, 0x1e293b);
    grid.position.y = -0.01;
    scene.add(grid);

    // Materials Library
    const carbonMaterial = new THREE.MeshStandardMaterial({
      color: 0x1e2433,
      metalness: 0.85,
      roughness: 0.25,
    });

    const titaniumMaterial = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.9,
      roughness: 0.2,
    });

    const accentGoldMaterial = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.8,
      roughness: 0.3,
    });

    const siliconePadMaterial = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      roughness: 0.7,
      metalness: 0.1,
      emissive: 0x06b6d4,
      emissiveIntensity: 0.2,
    });

    const statusRingMaterial = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 0.6,
      roughness: 0.3,
    });

    // Pedestal Mount
    const pedestalGroup = new THREE.Group();
    const baseCylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(2.0, 2.4, 0.6, 32),
      carbonMaterial
    );
    baseCylinder.position.y = 0.3;
    baseCylinder.receiveShadow = true;
    pedestalGroup.add(baseCylinder);

    // Glowing Status Ring
    const statusRing = new THREE.Mesh(
      new THREE.TorusGeometry(2.1, 0.06, 16, 48),
      statusRingMaterial
    );
    statusRing.rotation.x = Math.PI / 2;
    statusRing.position.y = 0.6;
    pedestalGroup.add(statusRing);
    statusRingMeshRef.current = statusRing;

    scene.add(pedestalGroup);

    // =========================================================================
    // HIERARCHICAL KINEMATIC CHAIN
    // =========================================================================

    // 1. Base Turntable (Rotates around Y - baseRotation)
    const baseSwivel = new THREE.Group();
    baseSwivel.position.y = 0.6;
    scene.add(baseSwivel);
    baseGroupRef.current = baseSwivel;

    const turretPillar = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.6, 1.2, 32),
      carbonMaterial
    );
    turretPillar.position.y = 0.6;
    turretPillar.castShadow = true;
    baseSwivel.add(turretPillar);

    // 2. Shoulder Joint (Rotates around X - shoulderPitch)
    const shoulderGroup = new THREE.Group();
    shoulderGroup.position.set(0, 1.2, 0);
    baseSwivel.add(shoulderGroup);
    shoulderGroupRef.current = shoulderGroup;

    // Shoulder Cross-Axle Hubs
    const shoulderHubL = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.4, 24), titaniumMaterial);
    shoulderHubL.rotation.z = Math.PI / 2;
    shoulderHubL.position.x = 0.9;
    shoulderGroup.add(shoulderHubL);

    const shoulderHubR = shoulderHubL.clone();
    shoulderHubR.position.x = -0.9;
    shoulderGroup.add(shoulderHubR);

    // Upper Arm Spar (Double Carbon Trusses)
    const upperArmLength = 3.6;
    const sparL = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, upperArmLength, 16), carbonMaterial);
    sparL.position.set(0.45, upperArmLength / 2, 0);
    shoulderGroup.add(sparL);

    const sparR = sparL.clone();
    sparR.position.x = -0.45;
    shoulderGroup.add(sparR);

    // Hydraulic assist cylinder
    const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, upperArmLength * 0.75, 16), accentGoldMaterial);
    piston.position.set(0, upperArmLength * 0.45, -0.3);
    shoulderGroup.add(piston);

    // 3. Elbow Joint (Rotates around X - elbowFlexion)
    const elbowGroup = new THREE.Group();
    elbowGroup.position.set(0, upperArmLength, 0);
    shoulderGroup.add(elbowGroup);
    elbowGroupRef.current = elbowGroup;

    const elbowHub = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 1.2, 24), titaniumMaterial);
    elbowHub.rotation.z = Math.PI / 2;
    elbowGroup.add(elbowHub);

    // Forearm Structure & Neuromorphic Chip Housing
    const forearmLength = 3.2;
    const forearmCasing = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, forearmLength, 0.8),
      carbonMaterial
    );
    forearmCasing.position.set(0, forearmLength / 2, 0);
    elbowGroup.add(forearmCasing);

    // Embedded Neuromorphic Chip (Simulated Loihi/SNN Core with blinking LED)
    const chipMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.6, 0.1),
      new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        emissive: 0x0284c7,
        emissiveIntensity: 0.8,
        metalness: 0.5,
      })
    );
    chipMesh.position.set(0, forearmLength * 0.5, 0.42);
    elbowGroup.add(chipMesh);
    chipLedMeshRef.current = chipMesh;

    // 4. Wrist Roll Joint (Rotates around Y/Z - wristRoll)
    const wristRollGroup = new THREE.Group();
    wristRollGroup.position.set(0, forearmLength, 0);
    elbowGroup.add(wristRollGroup);
    wristRollGroupRef.current = wristRollGroup;

    const wristCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.52, 0.4, 24), titaniumMaterial);
    wristCollar.position.y = 0.2;
    wristRollGroup.add(wristCollar);

    // 5. Wrist Pitch Joint (Rotates around X - wristPitch)
    const wristPitchGroup = new THREE.Group();
    wristPitchGroup.position.set(0, 0.4, 0);
    wristRollGroup.add(wristPitchGroup);
    wristPitchGroupRef.current = wristPitchGroup;

    const wristPivotBall = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 20), titaniumMaterial);
    wristPitchGroup.add(wristPivotBall);

    // 6. Anthropomorphic Helping Palm
    const palmGroup = new THREE.Group();
    palmGroup.position.set(0, 0.35, 0);
    wristPitchGroup.add(palmGroup);

    // Ergonomic Palm Chassis
    const palmMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 1.4, 0.45),
      carbonMaterial
    );
    palmMesh.position.set(0, 0.7, 0);
    palmGroup.add(palmMesh);

    // Tactile Palm Center Pad
    const palmPad = new THREE.Mesh(
      new THREE.BoxGeometry(0.75, 0.8, 0.08),
      siliconePadMaterial
    );
    palmPad.position.set(0, 0.7, 0.24);
    palmGroup.add(palmPad);

    // Helper: Create 3-Phalanx Finger
    const createFinger = (xOffset: number, baseScale: number, isThumb = false) => {
      const fingerBase = new THREE.Group();
      fingerBase.position.set(xOffset, 1.4, isThumb ? 0.08 : 0);
      if (isThumb) {
        fingerBase.rotation.z = -Math.PI / 4;
        fingerBase.position.y = 0.6;
        fingerBase.position.x = 0.68;
      }
      palmGroup.add(fingerBase);

      const phalanxMat = titaniumMaterial;
      const padMat = siliconePadMaterial;

      // Proximal Phalanx
      const proxGroup = new THREE.Group();
      fingerBase.add(proxGroup);

      const pLen = 0.65 * baseScale;
      const pMesh = new THREE.Mesh(new THREE.BoxGeometry(0.24 * baseScale, pLen, 0.24 * baseScale), phalanxMat);
      pMesh.position.y = pLen / 2;
      proxGroup.add(pMesh);

      // Intermediate Phalanx
      const midGroup = new THREE.Group();
      midGroup.position.y = pLen;
      proxGroup.add(midGroup);

      const mLen = 0.5 * baseScale;
      const mMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22 * baseScale, mLen, 0.22 * baseScale), phalanxMat);
      mMesh.position.y = mLen / 2;
      midGroup.add(mMesh);

      // Distal Phalanx (Fingertip)
      const distGroup = new THREE.Group();
      distGroup.position.y = mLen;
      midGroup.add(distGroup);

      const dLen = 0.42 * baseScale;
      const dMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2 * baseScale, dLen, 0.2 * baseScale), phalanxMat);
      dMesh.position.y = dLen / 2;
      distGroup.add(dMesh);

      // Tactile Silicone Pad on Pad Surface
      const tipPad = new THREE.Mesh(new THREE.BoxGeometry(0.18 * baseScale, dLen * 0.75, 0.06), padMat);
      tipPad.position.set(0, dLen / 2, 0.12 * baseScale);
      distGroup.add(tipPad);

      return { base: fingerBase, prox: proxGroup, mid: midGroup, dist: distGroup };
    };

    // Construct 5 Articulated Fingers
    const thumb = createFinger(0.68, 1.05, true);
    thumbProxRef.current = thumb.prox;
    thumbDistRef.current = thumb.dist;

    const index = createFinger(0.42, 1.0);
    indexProxRef.current = index.prox;
    indexMidRef.current = index.mid;
    indexDistRef.current = index.dist;

    const middle = createFinger(0.14, 1.08);
    midProxRef.current = middle.prox;
    midMidRef.current = middle.mid;
    midDistRef.current = middle.dist;

    const ring = createFinger(-0.14, 0.98);
    ringProxRef.current = ring.prox;
    ringMidRef.current = ring.mid;
    ringDistRef.current = ring.dist;

    const pinky = createFinger(-0.42, 0.85);
    pinkyProxRef.current = pinky.prox;
    pinkyMidRef.current = pinky.mid;
    pinkyDistRef.current = pinky.dist;

    // =========================================================================
    // TARGET WORKSPACE OBJECT
    // =========================================================================
    const targetObjectGroup = new THREE.Group();
    targetObjectGroup.position.set(0, 5.2, 2.8);
    scene.add(targetObjectGroup);
    targetObjectGroupRef.current = targetObjectGroup;

    // Contact spark particles
    const sparkCount = 35;
    const sparkGeo = new THREE.BufferGeometry();
    const sparkPos = new Float32Array(sparkCount * 3);
    for (let i = 0; i < sparkCount * 3; i++) {
      sparkPos[i] = (Math.random() - 0.5) * 1.5;
    }
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
    const sparkMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.15,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });
    const sparkPoints = new THREE.Points(sparkGeo, sparkMat);
    targetObjectGroup.add(sparkPoints);
    sparkPointsRef.current = sparkPoints;

    // Resize handler
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      camera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    // =========================================================================
    // ANIMATION & KINEMATIC UPDATE LOOP
    // =========================================================================
    const clock = new THREE.Clock();

    const animate = () => {
      animFrameId.current = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const time = clock.getElapsedTime();

      // Smooth lerp of all joint angles
      const cur = currentJointsRef.current;
      const tgt = targetJointsRef.current;
      const lerpSpeed = Math.min(1.0, delta * 7.5);

      cur.baseRotation += (tgt.baseRotation - cur.baseRotation) * lerpSpeed;
      cur.shoulderPitch += (tgt.shoulderPitch - cur.shoulderPitch) * lerpSpeed;
      cur.elbowFlexion += (tgt.elbowFlexion - cur.elbowFlexion) * lerpSpeed;
      cur.wristPitch += (tgt.wristPitch - cur.wristPitch) * lerpSpeed;
      cur.wristRoll += (tgt.wristRoll - cur.wristRoll) * lerpSpeed;

      cur.thumbCurl += (tgt.thumbCurl - cur.thumbCurl) * lerpSpeed;
      cur.indexCurl += (tgt.indexCurl - cur.indexCurl) * lerpSpeed;
      cur.middleCurl += (tgt.middleCurl - cur.middleCurl) * lerpSpeed;
      cur.ringCurl += (tgt.ringCurl - cur.ringCurl) * lerpSpeed;
      cur.pinkyCurl += (tgt.pinkyCurl - cur.pinkyCurl) * lerpSpeed;

      // Apply to Three.js joint transforms (convert deg to rad)
      const deg2rad = Math.PI / 180;
      if (baseGroupRef.current) {
        baseGroupRef.current.rotation.y = cur.baseRotation * deg2rad;
      }
      if (shoulderGroupRef.current) {
        shoulderGroupRef.current.rotation.x = -cur.shoulderPitch * deg2rad;
      }
      if (elbowGroupRef.current) {
        elbowGroupRef.current.rotation.x = cur.elbowFlexion * deg2rad;
      }
      if (wristRollGroupRef.current) {
        wristRollGroupRef.current.rotation.z = cur.wristRoll * deg2rad;
      }
      if (wristPitchGroupRef.current) {
        wristPitchGroupRef.current.rotation.x = cur.wristPitch * deg2rad;
      }

      // Fingers articulation
      const applyCurl = (prox: THREE.Group | null, mid: THREE.Group | null, dist: THREE.Group | null, curl: number) => {
        const rad = curl * (Math.PI / 2.3);
        if (prox) prox.rotation.x = rad * 0.45;
        if (mid) mid.rotation.x = rad * 0.35;
        if (dist) dist.rotation.x = rad * 0.25;
      };

      applyCurl(thumbProxRef.current, null, thumbDistRef.current, cur.thumbCurl);
      applyCurl(indexProxRef.current, indexMidRef.current, indexDistRef.current, cur.indexCurl);
      applyCurl(midProxRef.current, midMidRef.current, midDistRef.current, cur.middleCurl);
      applyCurl(ringProxRef.current, ringMidRef.current, ringDistRef.current, cur.ringCurl);
      applyCurl(pinkyProxRef.current, pinkyMidRef.current, pinkyDistRef.current, cur.pinkyCurl);

      // Auto-orbit camera
      if (autoRotate) {
        sphericalRef.current.theta += delta * 0.35;
        updateCameraPosition();
      }

      // Neuromorphic Chip & Status Ring LED Pulse
      if (chipLedMeshRef.current) {
        const pulse = 0.5 + 0.5 * Math.sin(time * 8 + (motorBias || 0) * 3);
        const mat = chipLedMeshRef.current.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = pulse * 1.2;
      }

      if (statusRingMeshRef.current) {
        const mat = statusRingMeshRef.current.material as THREE.MeshStandardMaterial;
        if (isLTDGuarded) {
          mat.color.setHex(0xf43f5e);
          mat.emissive.setHex(0xf43f5e);
          mat.emissiveIntensity = 0.9;
        } else {
          mat.color.setHex(0x10b981);
          mat.emissive.setHex(0x10b981);
          mat.emissiveIntensity = 0.5 + 0.3 * Math.sin(time * 2.5);
        }
      }

      // Contact spark jitter
      if (sparkPointsRef.current) {
        const positions = sparkPointsRef.current.geometry.attributes.position.array as Float32Array;
        const contactMagnitude = (cur.indexCurl + cur.thumbCurl) * 0.5;
        sparkPointsRef.current.visible = contactMagnitude > 0.4 && objectType !== 'none';
        for (let i = 0; i < sparkCount; i++) {
          positions[i * 3 + 1] += Math.sin(time * 12 + i) * 0.005;
        }
        sparkPointsRef.current.geometry.attributes.position.needsUpdate = true;
      }

      // Floating object subtle idle bob
      if (targetObjectGroupRef.current) {
        targetObjectGroupRef.current.position.y = 5.2 + Math.sin(time * 2.2) * 0.08;
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
      renderer.dispose();
      carbonMaterial.dispose();
      titaniumMaterial.dispose();
      accentGoldMaterial.dispose();
      siliconePadMaterial.dispose();
      statusRingMaterial.dispose();
    };
  }, [updateCameraPosition, autoRotate, isLTDGuarded, motorBias, objectType]);

  // Update Target Object Mesh inside group when objectType changes
  useEffect(() => {
    const group = targetObjectGroupRef.current;
    if (!group) return;

    // Clear previous children except spark points
    const sparks = sparkPointsRef.current;
    group.clear();
    if (sparks) group.add(sparks);

    if (objectType === 'none') return;

    if (objectType === 'fragile_glass') {
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.85, 32, 32),
        new THREE.MeshPhysicalMaterial({
          color: 0x38bdf8,
          transmission: 0.9,
          opacity: 1.0,
          transparent: true,
          roughness: 0.1,
          ior: 1.5,
          thickness: 0.5,
          emissive: 0x0284c7,
          emissiveIntensity: 0.2,
        })
      );
      group.add(sphere);

      const innerCore = new THREE.Mesh(
        new THREE.SphereGeometry(0.4, 16, 16),
        new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          emissive: 0x38bdf8,
          emissiveIntensity: 0.9,
        })
      );
      group.add(innerCore);
    } else if (objectType === 'microchip') {
      const chipTile = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.1, 1.2),
        new THREE.MeshStandardMaterial({
          color: 0x047857,
          roughness: 0.3,
          metalness: 0.8,
        })
      );
      group.add(chipTile);

      const pins = new THREE.Mesh(
        new THREE.BoxGeometry(1.3, 0.04, 1.3),
        new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.95, roughness: 0.1 })
      );
      group.add(pins);
    } else if (objectType === 'sensor_probe') {
      const probeBody = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 1.8, 24),
        new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.9, roughness: 0.2 })
      );
      probeBody.rotation.x = Math.PI / 2;
      group.add(probeBody);

      const probeTip = new THREE.Mesh(
        new THREE.ConeGeometry(0.22, 0.5, 24),
        new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 0.8 })
      );
      probeTip.rotation.x = Math.PI / 2;
      probeTip.position.z = 1.0;
      group.add(probeTip);
    } else if (objectType === 'handshake_marker') {
      const holoMat = new THREE.MeshStandardMaterial({
        color: 0xa855f7,
        emissive: 0xa855f7,
        emissiveIntensity: 0.6,
        transparent: true,
        opacity: 0.65,
        wireframe: true,
      });
      const holoMesh = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.6, 0.4), holoMat);
      holoMesh.position.set(0, 0, 0);
      group.add(holoMesh);
    }
  }, [objectType]);

  // Compute tactile sensor readings based on joint curls and proximity
  useEffect(() => {
    if (!onTactileUpdate) return;
    const isContact = objectType !== 'none';
    const grasp = jointAngles.graspTension || 0.0;
    const avgCurl = (jointAngles.thumbCurl + jointAngles.indexCurl + jointAngles.middleCurl) / 3;
    const pressureBase = isContact ? Math.min(1.0, avgCurl * 0.85 + grasp * 0.3) : 0.0;

    const readings: TactileSensorFeedback[] = [
      {
        padId: 'thumb',
        pressure: Number(Math.min(1.0, pressureBase * (jointAngles.thumbCurl > 0.3 ? 1.0 : 0.1)).toFixed(3)),
        contactDetected: isContact && jointAngles.thumbCurl > 0.3,
        rawMv: Math.round(pressureBase * 4200),
        temperatureC: 36.4,
      },
      {
        padId: 'index',
        pressure: Number(Math.min(1.0, pressureBase * (jointAngles.indexCurl > 0.25 ? 1.0 : 0.1)).toFixed(3)),
        contactDetected: isContact && jointAngles.indexCurl > 0.25,
        rawMv: Math.round(pressureBase * 4350),
        temperatureC: 36.5,
      },
      {
        padId: 'middle',
        pressure: Number(Math.min(1.0, pressureBase * (jointAngles.middleCurl > 0.3 ? 0.95 : 0.05)).toFixed(3)),
        contactDetected: isContact && jointAngles.middleCurl > 0.3,
        rawMv: Math.round(pressureBase * 3900),
        temperatureC: 36.3,
      },
      {
        padId: 'ring',
        pressure: Number(Math.min(1.0, pressureBase * (jointAngles.ringCurl > 0.35 ? 0.8 : 0.05)).toFixed(3)),
        contactDetected: isContact && jointAngles.ringCurl > 0.35,
        rawMv: Math.round(pressureBase * 3200),
        temperatureC: 36.2,
      },
      {
        padId: 'pinky',
        pressure: Number(Math.min(1.0, pressureBase * (jointAngles.pinkyCurl > 0.35 ? 0.75 : 0.05)).toFixed(3)),
        contactDetected: isContact && jointAngles.pinkyCurl > 0.35,
        rawMv: Math.round(pressureBase * 2800),
        temperatureC: 36.1,
      },
      {
        padId: 'palm',
        pressure: Number(Math.min(1.0, pressureBase * 0.45).toFixed(3)),
        contactDetected: isContact && pressureBase > 0.4,
        rawMv: Math.round(pressureBase * 2100),
        temperatureC: 36.6,
      },
    ];

    onTactileUpdate(readings);
  }, [jointAngles, objectType, onTactileUpdate]);

  // Orbit drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    prevMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - prevMousePos.current.x;
    const dy = e.clientY - prevMousePos.current.y;
    prevMousePos.current = { x: e.clientX, y: e.clientY };

    sphericalRef.current.theta -= dx * 0.007;
    sphericalRef.current.phi = Math.max(0.1, Math.min(Math.PI / 2.05, sphericalRef.current.phi - dy * 0.007));
    updateCameraPosition();
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    sphericalRef.current.radius = Math.max(6, Math.min(26, sphericalRef.current.radius + e.deltaY * 0.015));
    updateCameraPosition();
  };

  // Touch orbit
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      isDragging.current = true;
      prevMousePos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      prevTouchDist.current = Math.hypot(dx, dy);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isDragging.current) {
      const dx = e.touches[0].clientX - prevMousePos.current.x;
      const dy = e.touches[0].clientY - prevMousePos.current.y;
      prevMousePos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      sphericalRef.current.theta -= dx * 0.007;
      sphericalRef.current.phi = Math.max(0.1, Math.min(Math.PI / 2.05, sphericalRef.current.phi - dy * 0.007));
      updateCameraPosition();
    } else if (e.touches.length === 2 && prevTouchDist.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const diff = prevTouchDist.current - dist;
      prevTouchDist.current = dist;
      sphericalRef.current.radius = Math.max(6, Math.min(26, sphericalRef.current.radius + diff * 0.03));
      updateCameraPosition();
    }
  };

  const handleTouchEnd = () => {
    isDragging.current = false;
    prevTouchDist.current = null;
  };

  return (
    <div
      className={`relative w-full rounded-2xl overflow-hidden border border-slate-800 bg-slate-950/90 shadow-2xl transition-all ${
        isFullscreen ? 'fixed inset-4 z-50 rounded-2xl' : 'h-[500px] md:h-[580px]'
      }`}
    >
      {/* 3D Canvas Mount */}
      <div
        ref={mountRef}
        className="w-full h-full cursor-grab active:cursor-grabbing select-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />

      {/* Top Floating Controls Bar */}
      <div className="absolute top-3.5 left-3.5 right-3.5 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 backdrop-blur-md border border-slate-800 text-xs font-semibold text-white shadow-lg">
            <HandMetal className="w-3.5 h-3.5 text-cyan-400" />
            <span>Argon 6-DOF Helping Hand</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                isLTDGuarded
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}
            >
              {isLTDGuarded ? 'LTD GUARD ACTIVE' : 'NOMINAL COMPLIANCE'}
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-900/80 backdrop-blur-md border border-slate-800 text-[11px] font-mono text-slate-400 shadow-lg">
            <Cpu className="w-3 h-3 text-sky-400" />
            <span>O16-O19:</span>
            <span className="text-white font-bold">{motorFiringRates.join('/')} Hz</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 pointer-events-auto">
          {/* Camera Presets */}
          <div className="flex items-center bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-xl p-0.5 text-xs shadow-lg">
            <button
              onClick={() => setPresetView('perspective')}
              className={`px-2 py-1 rounded-lg text-[10px] font-medium transition-all ${
                cameraPreset === 'perspective' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Iso
            </button>
            <button
              onClick={() => setPresetView('front')}
              className={`px-2 py-1 rounded-lg text-[10px] font-medium transition-all ${
                cameraPreset === 'front' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Front
            </button>
            <button
              onClick={() => setPresetView('fingers')}
              className={`px-2 py-1 rounded-lg text-[10px] font-medium transition-all ${
                cameraPreset === 'fingers' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Grip
            </button>
            <button
              onClick={() => setPresetView('top')}
              className={`px-2 py-1 rounded-lg text-[10px] font-medium transition-all ${
                cameraPreset === 'top' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Top
            </button>
          </div>

          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`p-2 rounded-xl border backdrop-blur-md transition-all shadow-lg ${
              autoRotate
                ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-white'
            }`}
            title="Toggle Auto-Orbit"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-400 hover:text-white backdrop-blur-md transition-all shadow-lg"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Bottom Floating Telemetry Overlay */}
      <div className="absolute bottom-3.5 left-3.5 right-3.5 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="px-3 py-1.5 rounded-xl bg-slate-900/85 backdrop-blur-md border border-slate-800/90 text-[11px] font-mono text-slate-300 shadow-xl flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            <span>Target:</span>
            <span className="text-white font-semibold uppercase">{objectType.replace('_', ' ')}</span>
            <span className="text-slate-500">|</span>
            <span>Tension:</span>
            <span className="text-cyan-300 font-semibold">{((jointAngles.graspTension || 0) * 100).toFixed(0)}%</span>
            <span className="text-slate-500">|</span>
            <span>Compliance:</span>
            <span className="text-emerald-300 font-semibold">{((jointAngles.compliance || 0.8) * 100).toFixed(0)}%</span>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2 pointer-events-auto text-[11px] text-slate-400 px-3 py-1.5 rounded-xl bg-slate-900/85 backdrop-blur-md border border-slate-800/90">
          <span>Click & Drag to Orbit • Scroll to Zoom</span>
        </div>
      </div>
    </div>
  );
};
