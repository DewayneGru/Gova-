import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Maximize2,
  Camera,
  Sparkles,
  Layers,
  FastForward,
} from 'lucide-react';
import { AnimatedShortProject, AnimatedShortScene } from '../types';

interface ThreeShortsPlayerProps {
  project: AnimatedShortProject;
  activeSceneIndex?: number;
  onSceneChange?: (sceneIndex: number) => void;
}

export function ThreeShortsPlayer({ project, activeSceneIndex = 0, onSceneChange }: ThreeShortsPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [currentCaption, setCurrentCaption] = useState<string>('');
  const [currentCameraMode, setCurrentCameraMode] = useState<string>('hook_close');

  const animationFrameRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Three.js instances
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  // Mesh references for animation
  const characterAGroupRef = useRef<THREE.Group | null>(null);
  const characterBGroupRef = useRef<THREE.Group | null>(null);
  const charAEyesRef = useRef<THREE.Mesh[]>([]);
  const charBEyesRef = useRef<THREE.Mesh[]>([]);
  const particlesRef = useRef<THREE.Points | null>(null);
  const groundGridRef = useRef<THREE.GridHelper | null>(null);
  const stageLightRef = useRef<THREE.SpotLight | null>(null);

  // Find active scene based on currentTimeSec
  const currentScene: AnimatedShortScene = project.scenes.find(
    s => currentTimeSec >= s.timestampStart && currentTimeSec < s.timestampEnd
  ) || project.scenes[0] || {
    id: 's0',
    timestampStart: 0,
    timestampEnd: 6,
    title: 'Opposites Intro',
    narration: 'Wait! Look at this!',
    kineticCaptions: ['WAIT!', 'LOOK AT THIS!'],
    characterA_Action: 'surprised_look',
    characterB_Action: 'side_bounce',
    cameraMode: 'hook_close',
    sfxCue: 'whoosh',
    environmentTheme: 'cartoon_meadow',
  };

  // Web Audio Synth for Zero-Cost SFX
  const playSfx = useCallback((cue: string) => {
    if (!audioEnabled) return;
    try {
      const ctx = audioContextRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = ctx;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (cue === 'boing') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(540, now + 0.15);
        osc.frequency.exponentialRampToValueAtTime(260, now + 0.35);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
        osc.start(now);
        osc.stop(now + 0.4);
      } else if (cue === 'stomp_rumble') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(95, now);
        osc.frequency.exponentialRampToValueAtTime(35, now + 0.28);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.36);
      } else if (cue === 'whoosh') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(780, now + 0.12);
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.26);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (cue === 'sparkle' || cue === 'fanfare') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.setValueAtTime(659.25, now + 0.08);
        osc.frequency.setValueAtTime(783.99, now + 0.16);
        osc.frequency.setValueAtTime(1046.5, now + 0.24);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.46);
      }
    } catch (_e) {
      // Audio fallback
    }
  }, [audioEnabled]);

  // Voiceover Speech Synthesis
  const lastSpokenSceneRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isPlaying || !audioEnabled) return;
    if (currentScene && currentScene.id !== lastSpokenSceneRef.current) {
      lastSpokenSceneRef.current = currentScene.id;
      playSfx(currentScene.sfxCue);

      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(currentScene.narration);
        utterance.rate = 1.15;
        utterance.pitch = 1.25; // Friendly upbeat cartoon pitch
        window.speechSynthesis.speak(utterance);
      }
    }
  }, [currentScene, isPlaying, audioEnabled, playSfx]);

  // Three.js Scene Setup
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const width = canvas.clientWidth || 360;
    const height = canvas.clientHeight || 640;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a); // Slate 900
    scene.fog = new THREE.FogExp2(0x0f172a, 0.04);
    sceneRef.current = scene;

    // 2. Camera: Vertical 9:16 aspect ratio framing
    const camera = new THREE.PerspectiveCamera(52, width / height, 0.1, 100);
    camera.position.set(0, 2.2, 5.8);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    // 4. Lighting: Vibrant Cartoon 3-Point Light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x38bdf8, 1.8);
    dirLight.position.set(4, 8, 5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    const rimLight = new THREE.DirectionalLight(0xf43f5e, 1.4);
    rimLight.position.set(-4, 3, -3);
    scene.add(rimLight);

    const spotLight = new THREE.SpotLight(0xfacc15, 2.2, 14, Math.PI / 4, 0.4);
    spotLight.position.set(0, 7, 3);
    spotLight.target.position.set(0, 0, 0);
    scene.add(spotLight);
    scene.add(spotLight.target);
    stageLightRef.current = spotLight;

    // 5. Ground Podium Stage
    const stageGeo = new THREE.CylinderGeometry(3.2, 3.5, 0.4, 32);
    const stageMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.3,
      metalness: 0.2,
    });
    const stage = new THREE.Mesh(stageGeo, stageMat);
    stage.position.y = -0.2;
    stage.receiveShadow = true;
    scene.add(stage);

    const grid = new THREE.GridHelper(7, 14, 0x38bdf8, 0x1e293b);
    grid.position.y = 0.01;
    scene.add(grid);
    groundGridRef.current = grid;

    // 6. Character A: "Giant / Opposites Primary" (Big friendly cyan-blue creature)
    const charAGroup = new THREE.Group();
    charAGroup.position.set(-0.9, 0.75, 0);

    // Body
    const bodyAGeo = new THREE.SphereGeometry(0.85, 24, 24);
    const bodyAMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7, // Sky 600
      roughness: 0.25,
      metalness: 0.1,
    });
    const bodyA = new THREE.Mesh(bodyAGeo, bodyAMat);
    bodyA.castShadow = true;
    charAGroup.add(bodyA);

    // Cute belly patch
    const bellyGeo = new THREE.SphereGeometry(0.55, 20, 20);
    const bellyMat = new THREE.MeshStandardMaterial({ color: 0x7dd3fc });
    const belly = new THREE.Mesh(bellyGeo, bellyMat);
    belly.scale.set(1, 1, 0.3);
    belly.position.set(0, -0.15, 0.7);
    charAGroup.add(belly);

    // Big expressive eyes
    const eyeGeo = new THREE.SphereGeometry(0.18, 16, 16);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const pupilGeo = new THREE.SphereGeometry(0.09, 12, 12);
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });

    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.3, 0.28, 0.75);
    const leftPupil = new THREE.Mesh(pupilGeo, pupilMat);
    leftPupil.position.set(0, 0, 0.12);
    leftEye.add(leftPupil);
    charAGroup.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.3, 0.28, 0.75);
    const rightPupil = new THREE.Mesh(pupilGeo, pupilMat);
    rightPupil.position.set(0, 0, 0.12);
    rightEye.add(rightPupil);
    charAGroup.add(rightEye);
    charAEyesRef.current = [leftEye, rightEye];

    // Cute ears / horns
    const earGeo = new THREE.ConeGeometry(0.2, 0.45, 16);
    const earMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b });
    const leftEar = new THREE.Mesh(earGeo, earMat);
    leftEar.position.set(-0.55, 0.85, 0);
    leftEar.rotation.z = 0.3;
    charAGroup.add(leftEar);

    const rightEar = new THREE.Mesh(earGeo, earMat);
    rightEar.position.set(0.55, 0.85, 0);
    rightEar.rotation.z = -0.3;
    charAGroup.add(rightEar);

    scene.add(charAGroup);
    characterAGroupRef.current = charAGroup;

    // 7. Character B: "Tiny / Opposites Micro" (Micro bouncy pink-yellow companion)
    const charBGroup = new THREE.Group();
    charBGroup.position.set(1.1, 0.35, 0.4);

    const bodyBGeo = new THREE.SphereGeometry(0.35, 20, 20);
    const bodyBMat = new THREE.MeshStandardMaterial({
      color: 0xf43f5e, // Rose 500
      roughness: 0.2,
      metalness: 0.2,
    });
    const bodyB = new THREE.Mesh(bodyBGeo, bodyBMat);
    bodyB.castShadow = true;
    charBGroup.add(bodyB);

    // Micro eyes
    const eyeBGeo = new THREE.SphereGeometry(0.08, 12, 12);
    const eyeBMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const pupilBGeo = new THREE.SphereGeometry(0.04, 8, 8);
    const pupilBMat = new THREE.MeshBasicMaterial({ color: 0x1e1b4b });

    const leftEyeB = new THREE.Mesh(eyeBGeo, eyeBMat);
    leftEyeB.position.set(-0.12, 0.1, 0.3);
    const leftPupilB = new THREE.Mesh(pupilBGeo, pupilBMat);
    leftPupilB.position.set(0, 0, 0.05);
    leftEyeB.add(leftPupilB);
    charBGroup.add(leftEyeB);

    const rightEyeB = new THREE.Mesh(eyeBGeo, eyeBMat);
    rightEyeB.position.set(0.12, 0.1, 0.3);
    const rightPupilB = new THREE.Mesh(pupilBGeo, pupilBMat);
    rightPupilB.position.set(0, 0, 0.05);
    rightEyeB.add(rightPupilB);
    charBGroup.add(rightEyeB);
    charBEyesRef.current = [leftEyeB, rightEyeB];

    // Micro antenna with glowing orb
    const antStemGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8);
    const antStemMat = new THREE.MeshBasicMaterial({ color: 0xfde047 });
    const antStem = new THREE.Mesh(antStemGeo, antStemMat);
    antStem.position.set(0, 0.4, 0);
    charBGroup.add(antStem);

    const orbGeo = new THREE.SphereGeometry(0.08, 12, 12);
    const orbMat = new THREE.MeshStandardMaterial({
      color: 0xfde047,
      emissive: 0xfacc15,
      emissiveIntensity: 0.8,
    });
    const orb = new THREE.Mesh(orbGeo, orbMat);
    orb.position.set(0, 0.55, 0);
    charBGroup.add(orb);

    scene.add(charBGroup);
    characterBGroupRef.current = charBGroup;

    // 8. Particle Sparks Confetti in 3D
    const partCount = 180;
    const partGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(partCount * 3);
    const colors = new Float32Array(partCount * 3);

    for (let i = 0; i < partCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 8;
      positions[i * 3 + 1] = Math.random() * 6;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 6;

      const pColor = new THREE.Color().setHSL(Math.random(), 0.9, 0.65);
      colors[i * 3] = pColor.r;
      colors[i * 3 + 1] = pColor.g;
      colors[i * 3 + 2] = pColor.b;
    }
    partGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    partGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const partMat = new THREE.PointsMaterial({
      size: 0.09,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
    });
    const particles = new THREE.Points(partGeo, partMat);
    scene.add(particles);
    particlesRef.current = particles;

    // Resize handler
    const handleResize = () => {
      if (!canvas || !renderer || !camera) return;
      const newW = canvas.clientWidth || 360;
      const newH = canvas.clientHeight || 640;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      stageGeo.dispose();
      stageMat.dispose();
      bodyAGeo.dispose();
      bodyAMat.dispose();
      bodyBGeo.dispose();
      bodyBMat.dispose();
      partGeo.dispose();
      partMat.dispose();
    };
  }, []);

  // Main 3D Animation & Timeline Loop
  useEffect(() => {
    const loop = (timestamp: number) => {
      if (lastTimestampRef.current === null) {
        lastTimestampRef.current = timestamp;
      }
      const deltaSec = ((timestamp - lastTimestampRef.current) / 1000) * playbackSpeed;
      lastTimestampRef.current = timestamp;

      if (isPlaying) {
        setCurrentTimeSec(prev => {
          const next = prev + deltaSec;
          if (next >= 30.0) {
            return 0.0; // Loop 30-second YouTube Short 24/7!
          }
          return next;
        });
      }

      // Three.js Render Update
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      const renderer = rendererRef.current;
      const charA = characterAGroupRef.current;
      const charB = characterBGroupRef.current;
      const particles = particlesRef.current;

      const t = currentTimeSec;

      // Animate Character A
      if (charA) {
        if (currentScene.characterA_Action === 'giant_stomp') {
          const stompFreq = 4.2;
          charA.position.y = 0.75 + Math.abs(Math.sin(t * stompFreq)) * 0.45;
          charA.rotation.z = Math.sin(t * stompFreq) * 0.12;
          charA.scale.set(1.15, 0.9 + Math.abs(Math.cos(t * stompFreq)) * 0.2, 1.15);
        } else if (currentScene.characterA_Action === 'squash_jump') {
          charA.position.y = 0.75 + Math.sin(t * 3.5) * 0.6;
          charA.scale.y = 1.0 + Math.sin(t * 7.0) * 0.25;
          charA.rotation.y = Math.sin(t * 1.5) * 0.4;
        } else if (currentScene.characterA_Action === 'celebrate_spin') {
          charA.rotation.y += 0.08;
          charA.position.y = 0.8 + Math.abs(Math.sin(t * 6)) * 0.4;
        } else {
          // Idle bob
          charA.position.y = 0.75 + Math.sin(t * 2.2) * 0.08;
          charA.rotation.y = Math.sin(t * 1.2) * 0.15;
          charA.scale.set(1.0, 1.0, 1.0);
        }
      }

      // Animate Character B
      if (charB) {
        if (currentScene.characterB_Action === 'rocket_leap' || currentScene.characterB_Action === 'speed_dash') {
          charB.position.y = 0.4 + Math.abs(Math.sin(t * 8.5)) * 0.85;
          charB.position.x = 0.9 + Math.sin(t * 4.0) * 0.5;
          charB.rotation.z = Math.sin(t * 10) * 0.35;
        } else if (currentScene.characterB_Action === 'side_bounce') {
          charB.position.y = 0.35 + Math.abs(Math.sin(t * 5.2)) * 0.4;
          charB.position.x = 1.1 + Math.cos(t * 2.5) * 0.3;
        } else if (currentScene.characterB_Action === 'wave_hands') {
          charB.rotation.y += 0.05;
          charB.position.y = 0.35 + Math.sin(t * 4) * 0.12;
        } else {
          charB.position.y = 0.35 + Math.sin(t * 3.5) * 0.05;
        }
      }

      // Floating Particle Sparks
      if (particles) {
        particles.rotation.y += 0.003;
        const positions = particles.geometry.attributes.position.array as Float32Array;
        for (let i = 1; i < positions.length; i += 3) {
          positions[i] -= 0.015;
          if (positions[i] < 0) positions[i] = 6.0;
        }
        particles.geometry.attributes.position.needsUpdate = true;
      }

      // Dynamic Camera Modes matching YouTube Shorts retention cuts
      if (camera) {
        const mode = currentScene.cameraMode;
        if (mode === 'hook_close') {
          camera.position.set(0, 1.6 + Math.sin(t * 0.8) * 0.1, 3.8);
          camera.lookAt(0, 0.7, 0);
        } else if (mode === 'wide_stage') {
          camera.position.set(Math.sin(t * 0.5) * 1.5, 2.2, 5.6);
          camera.lookAt(0, 0.6, 0);
        } else if (mode === 'split_comparison') {
          camera.position.set(0.6, 1.4, 3.2);
          camera.lookAt(0.3, 0.6, 0);
        } else if (mode === 'hero_low') {
          camera.position.set(0, 0.4, 4.4);
          camera.lookAt(0, 1.1, 0);
        }
      }

      if (scene && camera && renderer) {
        renderer.render(scene, camera);
      }

      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, playbackSpeed, currentTimeSec, currentScene]);

  // Update dynamic kinetic caption based on progress within current scene
  useEffect(() => {
    if (!currentScene.kineticCaptions || currentScene.kineticCaptions.length === 0) {
      setCurrentCaption(currentScene.title);
      return;
    }
    const sceneDuration = currentScene.timestampEnd - currentScene.timestampStart;
    const progress = (currentTimeSec - currentScene.timestampStart) / Math.max(0.1, sceneDuration);
    const captionIdx = Math.min(
      currentScene.kineticCaptions.length - 1,
      Math.floor(progress * currentScene.kineticCaptions.length)
    );
    setCurrentCaption(currentScene.kineticCaptions[captionIdx] || currentScene.title);
    setCurrentCameraMode(currentScene.cameraMode);
  }, [currentTimeSec, currentScene]);

  // Handle Scrub
  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTimeSec(newTime);
  };

  const handleRestart = () => {
    setCurrentTimeSec(0);
    setIsPlaying(true);
  };

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-md mx-auto bg-slate-950 border border-slate-800 rounded-3xl p-4 shadow-2xl relative overflow-hidden">
      {/* Top Mobile YouTube Shorts Status Bar */}
      <div className="w-full flex items-center justify-between text-xs text-slate-400 pb-2.5 px-2 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
          <span className="font-bold text-slate-200 tracking-wide">YOUTUBE SHORTS 3D</span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">
            9:16 VERTICAL
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] text-sky-400">
          <span>{currentTimeSec.toFixed(1)}s / 30.0s</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
            $0.00 FREE
          </span>
        </div>
      </div>

      {/* 9:16 Vertical Interactive WebGL Canvas Container */}
      <div
        ref={containerRef}
        className="w-full relative aspect-[9/16] rounded-2xl overflow-hidden mt-3 shadow-inner border border-slate-800 bg-slate-900 flex items-center justify-center select-none"
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full object-cover block cursor-grab active:cursor-grabbing"
        />

        {/* Dynamic Kinetic Captions Overlay (High Retention YouTube Shorts Style) */}
        <div className="absolute top-12 left-4 right-4 pointer-events-none flex flex-col items-center text-center z-10">
          <div className="bg-slate-950/75 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-white/10 shadow-lg transform scale-105 transition-transform duration-200">
            <span className="text-[10px] font-mono tracking-widest text-sky-400 uppercase font-bold block">
              {currentScene.title}
            </span>
            <div className="text-xl sm:text-2xl font-black text-amber-300 uppercase tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] animate-pulse">
              {currentCaption}
            </div>
          </div>
        </div>

        {/* On-screen Watermark & Opposites Badge */}
        <div className="absolute top-3 left-3 bg-black/60 backdrop-blur px-2.5 py-1 rounded-lg border border-white/10 flex items-center gap-1.5 text-[11px] font-semibold text-slate-200">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>NovaVault 3D</span>
        </div>

        {/* Camera Preset Indicator */}
        <div className="absolute top-3 right-3 bg-black/60 backdrop-blur px-2 py-1 rounded-lg border border-white/10 flex items-center gap-1 text-[10px] font-mono text-slate-300">
          <Camera className="w-3 h-3 text-sky-400" />
          <span>{currentCameraMode.replace('_', ' ').toUpperCase()}</span>
        </div>

        {/* Scene Chapter Progress Bar at Bottom of Video */}
        <div className="absolute bottom-3 left-4 right-4 flex items-center gap-1">
          {project.scenes.map((s, idx) => {
            const isCurrent = currentTimeSec >= s.timestampStart && currentTimeSec < s.timestampEnd;
            const isPassed = currentTimeSec >= s.timestampEnd;
            return (
              <div
                key={s.id || idx}
                onClick={() => {
                  setCurrentTimeSec(s.timestampStart);
                  onSceneChange?.(idx);
                }}
                className={`flex-1 h-1.5 rounded-full cursor-pointer transition-all duration-200 ${
                  isCurrent
                    ? 'bg-amber-400 shadow-md shadow-amber-400/50'
                    : isPassed
                    ? 'bg-sky-500'
                    : 'bg-slate-700/60'
                }`}
                title={`${s.title} (${s.timestampStart}s - ${s.timestampEnd}s)`}
              />
            );
          })}
        </div>

        {/* Play/Pause Large Center Overlay if paused */}
        {!isPlaying && (
          <div
            onClick={() => setIsPlaying(true)}
            className="absolute inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center cursor-pointer group"
          >
            <div className="w-16 h-16 rounded-full bg-rose-600/90 text-white flex items-center justify-center shadow-xl group-hover:scale-110 group-hover:bg-rose-500 transition cursor-pointer">
              <Play className="w-8 h-8 fill-current ml-1" />
            </div>
          </div>
        )}
      </div>

      {/* Scrub Bar & Controls */}
      <div className="w-full mt-3 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={30}
            step={0.1}
            value={currentTimeSec}
            onChange={handleScrub}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400"
          />
        </div>

        {/* Button Bar */}
        <div className="flex items-center justify-between mt-1 text-slate-300">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition cursor-pointer"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
            </button>

            <button
              onClick={handleRestart}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
              title="Restart"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={() => setAudioEnabled(!audioEnabled)}
              className={`p-2 rounded-xl transition cursor-pointer ${
                audioEnabled ? 'bg-sky-600/30 text-sky-300 border border-sky-500/30' : 'bg-slate-800 text-slate-500'
              }`}
              title={audioEnabled ? 'Audio / Speech Active' : 'Audio Muted'}
            >
              {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          </div>

          {/* Speed Toggle */}
          <div className="flex items-center gap-1.5 text-xs font-mono bg-slate-900 border border-slate-800 rounded-xl p-1">
            {[1.0, 1.5, 2.0].map(speed => (
              <button
                key={speed}
                onClick={() => setPlaybackSpeed(speed)}
                className={`px-2 py-0.5 rounded-lg transition cursor-pointer ${
                  playbackSpeed === speed ? 'bg-sky-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>

        {/* Current Active Scene Detail Accordion */}
        <div className="mt-2 p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs flex items-start justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 font-bold text-slate-200">
              <span className="text-amber-400 font-mono">[{currentScene.timestampStart}s - {currentScene.timestampEnd}s]</span>
              <span>{currentScene.title}</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed italic">
              "{currentScene.narration}"
            </p>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 shrink-0">
            SFX: {currentScene.sfxCue}
          </span>
        </div>
      </div>
    </div>
  );
}
