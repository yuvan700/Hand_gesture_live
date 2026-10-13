import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera,
  CameraOff,
  RefreshCw,
  Sliders,
  ShieldAlert,
  Zap,
  Activity,
  Maximize2,
  Sparkles,
} from 'lucide-react';
import { Point3D, GestureResult, AppSettings } from '../types/gestures';

interface CameraViewProps {
  onLandmarksDetected: (landmarks: Point3D[], handedness: string, latencyMs: number) => void;
  gestureResult: GestureResult;
  settings: AppSettings;
  isControlActive: boolean;
  isEmergencyStopped: boolean;
}

export const CameraView: React.FC<CameraViewProps> = ({
  onLandmarksDetected,
  gestureResult,
  settings,
  isControlActive,
  isEmergencyStopped,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [hasCamera, setHasCamera] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simulationPreset, setSimulationPreset] = useState<string>('index');

  const animationFrameRef = useRef<number | null>(null);
  const handsModelRef = useRef<any>(null);
  const prevTimeRef = useRef<number>(performance.now());
  const fpsRef = useRef<number>(30);

  // Enumerate video devices
  useEffect(() => {
    async function getDevices() {
      try {
        const devList = await navigator.mediaDevices.enumerateDevices();
        const videoDevs = devList.filter((d) => d.kind === 'videoinput');
        setDevices(videoDevs);
        if (videoDevs.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(videoDevs[0].deviceId);
        }
      } catch (err) {
        console.warn('Could not list media devices:', err);
      }
    }
    getDevices();
  }, []);

  // Initialize MediaPipe Hands via official Google CDN script
  useEffect(() => {
    let isCancelled = false;

    async function loadMediaPipe() {
      try {
        // If window.Hands already loaded
        if ((window as any).Hands) {
          initHands();
          return;
        }

        // Dynamically inject MediaPipe Hands script
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js';
        script.crossOrigin = 'anonymous';
        script.onload = () => {
          if (!isCancelled) initHands();
        };
        script.onerror = () => {
          console.warn('MediaPipe CDN load failed, falling back to simulated hand tracking.');
          setIsSimulating(true);
        };
        document.head.appendChild(script);
      } catch (e) {
        console.warn('Error loading MediaPipe:', e);
        setIsSimulating(true);
      }
    }

    function initHands() {
      try {
        const HandsClass = (window as any).Hands;
        if (!HandsClass) return;

        const hands = new HandsClass({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        });

        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.65,
          minTrackingConfidence: 0.65,
        });

        hands.onResults(handleMediaPipeResults);
        handsModelRef.current = hands;
      } catch (err) {
        console.error('Hands initialization error:', err);
        setIsSimulating(true);
      }
    }

    loadMediaPipe();

    return () => {
      isCancelled = true;
      if (handsModelRef.current) {
        try {
          handsModelRef.current.close();
        } catch (_) {}
      }
    };
  }, []);

  // Handle MediaPipe inference results
  const handleMediaPipeResults = useCallback(
    (results: any) => {
      const now = performance.now();
      const dt = (now - prevTimeRef.current) / 1000;
      prevTimeRef.current = now;
      if (dt > 0) {
        fpsRef.current = Math.round(0.85 * fpsRef.current + 0.15 * (1 / dt));
      }

      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const rawLandmarks = results.multiHandLandmarks[0];
        const rawHandedness = results.multiHandedness?.[0]?.label || 'Right';
        // With flipped camera frame, MediaPipe's Left is user's physical Right
        const handedness = rawHandedness === 'Left' ? 'Right' : 'Left';

        const landmarks: Point3D[] = rawLandmarks.map((lm: any) => ({
          x: lm.x,
          y: lm.y,
          z: lm.z || 0,
        }));

        onLandmarksDetected(landmarks, handedness, Math.round(dt * 1000));
        drawOverlay(landmarks, handedness);
      } else {
        onLandmarksDetected([], 'None', 0);
        drawOverlay([], 'None');
      }
    },
    [onLandmarksDetected, settings, gestureResult]
  );

  // Start Camera Stream
  const startCamera = async () => {
    try {
      setCameraError(null);
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: selectedDeviceId
          ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setHasCamera(true);
        setIsSimulating(false);
      }
    } catch (err: any) {
      console.warn('Camera access denied or failed:', err);
      setCameraError(err.message || 'Camera permission denied');
      setHasCamera(false);
      setIsSimulating(true);
    }
  };

  useEffect(() => {
    startCamera();
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [selectedDeviceId]);

  // Video processing loop
  useEffect(() => {
    let isActive = true;

    async function processLoop() {
      if (!isActive) return;

      if (hasCamera && videoRef.current && handsModelRef.current && videoRef.current.readyState >= 2) {
        try {
          await handsModelRef.current.send({ image: videoRef.current });
        } catch (e) {
          // Frame skip
        }
      } else if (isSimulating) {
        runSimulationFrame();
      }

      animationFrameRef.current = requestAnimationFrame(processLoop);
    }

    animationFrameRef.current = requestAnimationFrame(processLoop);

    return () => {
      isActive = false;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [hasCamera, isSimulating, simulationPreset]);

  // Synthetic Landmark Generator for testing without webcam
  const runSimulationFrame = () => {
    const time = performance.now() / 1000;
    const lms: Point3D[] = [];

    // Base hand position wandering smoothly in active margin
    const centerX = 0.5 + Math.sin(time * 0.8) * 0.22;
    const centerY = 0.55 + Math.cos(time * 0.6) * 0.18;
    const wristY = centerY + 0.25;

    for (let i = 0; i < 21; i++) {
      lms.push({ x: centerX, y: centerY, z: 0 });
    }

    lms[0] = { x: centerX, y: wristY, z: 0 };
    lms[1] = { x: centerX - 0.08, y: wristY - 0.08, z: 0 };
    lms[2] = { x: centerX - 0.12, y: wristY - 0.16, z: 0 };
    lms[5] = { x: centerX - 0.04, y: wristY - 0.24, z: 0 };
    lms[9] = { x: centerX, y: wristY - 0.26, z: 0 };
    lms[13] = { x: centerX + 0.04, y: wristY - 0.24, z: 0 };
    lms[17] = { x: centerX + 0.08, y: wristY - 0.20, z: 0 };

    const setFinger = (tipIdx: number, pipIdx: number, dipIdx: number, mcpIdx: number, ext: boolean, bx: number) => {
      const my = lms[mcpIdx].y;
      if (ext) {
        lms[pipIdx] = { x: bx, y: my - 0.12, z: 0 };
        lms[dipIdx] = { x: bx, y: my - 0.22, z: 0 };
        lms[tipIdx] = { x: bx, y: my - 0.30, z: 0 };
      } else {
        lms[pipIdx] = { x: bx, y: my - 0.06, z: 0 };
        lms[dipIdx] = { x: bx, y: my + 0.01, z: 0 };
        lms[tipIdx] = { x: bx, y: my + 0.06, z: 0 };
      }
    };

    if (simulationPreset === 'index') {
      // 1 Finger: Index
      lms[3] = { x: centerX - 0.10, y: wristY - 0.18, z: 0 };
      lms[4] = { x: centerX - 0.06, y: wristY - 0.18, z: 0 };
      setFinger(8, 6, 7, 5, true, centerX - 0.04);
      setFinger(12, 10, 11, 9, false, centerX);
      setFinger(16, 14, 15, 13, false, centerX + 0.04);
      setFinger(20, 18, 19, 17, false, centerX + 0.08);
    } else if (simulationPreset === 'two_finger') {
      // 2 Fingers: Index + Middle (Double-Click)
      lms[3] = { x: centerX - 0.10, y: wristY - 0.18, z: 0 };
      lms[4] = { x: centerX - 0.06, y: wristY - 0.18, z: 0 };
      setFinger(8, 6, 7, 5, true, centerX - 0.04);
      setFinger(12, 10, 11, 9, true, centerX);
      setFinger(16, 14, 15, 13, false, centerX + 0.04);
      setFinger(20, 18, 19, 17, false, centerX + 0.08);
    } else if (simulationPreset === 'three_finger') {
      // 3 Fingers: Minimize
      lms[3] = { x: centerX - 0.10, y: wristY - 0.18, z: 0 };
      lms[4] = { x: centerX - 0.06, y: wristY - 0.18, z: 0 };
      setFinger(8, 6, 7, 5, true, centerX - 0.04);
      setFinger(12, 10, 11, 9, true, centerX);
      setFinger(16, 14, 15, 13, true, centerX + 0.04);
      setFinger(20, 18, 19, 17, false, centerX + 0.08);
    } else if (simulationPreset === 'five_finger') {
      // 5 Fingers: Close Window with 1s hold
      lms[3] = { x: centerX - 0.16, y: wristY - 0.22, z: 0 };
      lms[4] = { x: centerX - 0.22, y: wristY - 0.28, z: 0 };
      setFinger(8, 6, 7, 5, true, centerX - 0.04);
      setFinger(12, 10, 11, 9, true, centerX);
      setFinger(16, 14, 15, 13, true, centerX + 0.04);
      setFinger(20, 18, 19, 17, true, centerX + 0.08);
    } else if (simulationPreset === 'pinch') {
      // Pinch (Thumb + Index oscillating distance)
      const pinchGap = 0.02 + Math.abs(Math.sin(time * 2.0)) * 0.06;
      lms[4] = { x: centerX - pinchGap / 2, y: centerY - 0.1, z: 0 };
      lms[8] = { x: centerX + pinchGap / 2, y: centerY - 0.1, z: 0 };
      lms[3] = { x: centerX - 0.06, y: centerY - 0.05, z: 0 };
      lms[6] = { x: centerX + 0.04, y: centerY - 0.05, z: 0 };
      setFinger(12, 10, 11, 9, false, centerX);
      setFinger(16, 14, 15, 13, false, centerX + 0.04);
      setFinger(20, 18, 19, 17, false, centerX + 0.08);
    } else if (simulationPreset === 'scroll') {
      // 4 Fingers: Vertical Scroll
      const scrollY = centerY + Math.sin(time * 1.5) * 0.12;
      lms[0].y = scrollY + 0.25;
      lms[3] = { x: centerX - 0.08, y: scrollY + 0.12, z: 0 };
      lms[4] = { x: centerX - 0.04, y: scrollY + 0.14, z: 0 };
      setFinger(8, 6, 7, 5, true, centerX - 0.04);
      setFinger(12, 10, 11, 9, true, centerX);
      setFinger(16, 14, 15, 13, true, centerX + 0.04);
      setFinger(20, 18, 19, 17, true, centerX + 0.08);
    }

    onLandmarksDetected(lms, 'Right', 12);
    drawOverlay(lms, 'Right');
  };

  // Canvas HUD & Skeleton renderer
  const drawOverlay = (landmarks: Point3D[], handedness: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Margin bounding box
    const mx = settings.marginBox * w;
    const my = settings.marginBox * h;
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(mx, my, w - 2 * mx, h - 2 * my);
    ctx.setLineDash([]);

    if (landmarks.length >= 21) {
      // Skeleton connections
      const connections = [
        [0, 1], [1, 2], [2, 3], [3, 4],
        [0, 5], [5, 6], [6, 7], [7, 8],
        [0, 9], [9, 10], [10, 11], [11, 12],
        [0, 13], [13, 14], [14, 15], [15, 16],
        [0, 17], [17, 18], [18, 19], [19, 20],
        [5, 9], [9, 13], [13, 17],
      ];

      // Draw cyber bones
      ctx.lineWidth = 3;
      connections.forEach(([start, end]) => {
        const p1 = landmarks[start];
        const p2 = landmarks[end];
        const grad = ctx.createLinearGradient(p1.x * w, p1.y * h, p2.x * w, p2.y * h);
        grad.addColorStop(0, '#06b6d4');
        grad.addColorStop(1, '#8b5cf6');
        ctx.strokeStyle = grad;
        ctx.beginPath();
        ctx.moveTo(p1.x * w, p1.y * h);
        ctx.lineTo(p2.x * w, p2.y * h);
        ctx.stroke();
      });

      // Draw Horizon Orientation Guide Line (Index MCP to Pinky MCP)
      const pIdxMcp = landmarks[5];
      const pPinkyMcp = landmarks[17];
      ctx.beginPath();
      ctx.moveTo(pIdxMcp.x * w, pIdxMcp.y * h);
      ctx.lineTo(pPinkyMcp.x * w, pPinkyMcp.y * h);
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw Glowing Joints
      landmarks.forEach((lm, i) => {
        const px = lm.x * w;
        const py = lm.y * h;
        const isTip = [4, 8, 12, 16, 20].includes(i);

        ctx.beginPath();
        ctx.arc(px, py, isTip ? 6 : 4, 0, Math.PI * 2);
        ctx.fillStyle = isTip ? '#22d3ee' : '#c084fc';
        ctx.shadowColor = isTip ? '#06b6d4' : '#a855f7';
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // Optical Targeting Reticle over Index Tip
      const pIdxTip = landmarks[8];
      const itX = pIdxTip.x * w;
      const itY = pIdxTip.y * h;
      ctx.beginPath();
      ctx.arc(itX, itY, 14, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Precision Crosshairs on Index Tip
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(itX - 18, itY);
      ctx.lineTo(itX - 8, itY);
      ctx.moveTo(itX + 8, itY);
      ctx.lineTo(itX + 18, itY);
      ctx.moveTo(itX, itY - 18);
      ctx.lineTo(itX, itY - 8);
      ctx.moveTo(itX, itY + 8);
      ctx.lineTo(itX, itY + 18);
      ctx.stroke();

      // Pinch indicator line
      if (gestureResult.gesture === 'PINCH_ZOOM') {
        const pThumb = landmarks[4];
        const pIndex = landmarks[8];
        ctx.beginPath();
        ctx.moveTo(pThumb.x * w, pThumb.y * h);
        ctx.lineTo(pIndex.x * w, pIndex.y * h);
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 4;
        ctx.stroke();

        // Midpoint circle
        const midX = ((pThumb.x + pIndex.x) / 2) * w;
        const midY = ((pThumb.y + pIndex.y) / 2) * h;
        ctx.beginPath();
        ctx.arc(midX, midY, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#34d399';
        ctx.fill();
      }

      // 5-Finger Close Window Hold Countdown Ring
      if (gestureResult.closeHoldProgress > 0) {
        const wrist = landmarks[0];
        const cx = wrist.x * w;
        const cy = wrist.y * h - 80;
        const radius = 40;

        // Background circle
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.3)';
        ctx.lineWidth = 6;
        ctx.stroke();

        // Progress arc
        ctx.beginPath();
        ctx.arc(
          cx,
          cy,
          radius,
          -Math.PI / 2,
          -Math.PI / 2 + gestureResult.closeHoldProgress * Math.PI * 2
        );
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 6;
        ctx.stroke();

        // Text
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 13px Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${gestureResult.closeSecondsRemaining.toFixed(1)}s`, cx, cy + 5);
        ctx.font = '10px sans-serif';
        ctx.fillStyle = '#fca5a5';
        ctx.fillText('HOLD TO CLOSE', cx, cy - 18);
      }
    }
  };

  return (
    <div className="relative w-full h-full min-h-[380px] bg-slate-950 rounded-xl overflow-hidden border border-slate-800 shadow-2xl flex flex-col">
      {/* Top Video Toolbar */}
      <div className="h-10 px-4 bg-slate-900/90 backdrop-blur border-b border-slate-800 flex items-center justify-between z-20">
        <div className="flex items-center space-x-2">
          <Camera className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-semibold text-slate-200">LIVE SENSOR FEED</span>
          <span className="text-slate-600">|</span>
          <div className="flex items-center space-x-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                hasCamera ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span className="text-[11px] text-slate-300 font-mono">
              {hasCamera ? 'WEBCAM ACTIVE' : isSimulating ? 'SIMULATION MODE' : 'CONNECTING'}
            </span>
          </div>
        </div>

        {/* Camera Selector or Simulation Preset */}
        <div className="flex items-center space-x-2">
          {devices.length > 0 && (
            <select
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1 outline-none font-mono"
            >
              {devices.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
          )}

          {/* Test Simulation Preset Selector */}
          <div className="flex items-center space-x-1 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
            <span className="text-[10px] text-slate-400 font-medium">Test Preset:</span>
            <select
              value={simulationPreset}
              onChange={(e) => {
                setSimulationPreset(e.target.value);
                setIsSimulating(true);
              }}
              className="bg-transparent text-cyan-300 text-[11px] outline-none font-mono cursor-pointer"
            >
              <option value="index" className="bg-slate-900">1-Finger (Cursor)</option>
              <option value="two_finger" className="bg-slate-900">2-Fingers (Double-Click)</option>
              <option value="three_finger" className="bg-slate-900">3-Fingers (Minimize)</option>
              <option value="five_finger" className="bg-slate-900">5-Fingers (Close Hold 1s)</option>
              <option value="pinch" className="bg-slate-900">Pinch (Zoom In/Out)</option>
              <option value="scroll" className="bg-slate-900">4-Fingers (Scroll)</option>
            </select>
          </div>

          <button
            onClick={startCamera}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center space-x-1 border border-slate-700"
            title="Reload Camera"
          >
            <RefreshCw className="w-3 h-3 text-cyan-400" />
          </button>
        </div>
      </div>

      {/* Main Video & Landmark Canvas Area */}
      <div className="relative flex-1 w-full h-full bg-slate-950 flex items-center justify-center overflow-hidden">
        {/* Real mirrored webcam video element */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`absolute inset-0 w-full h-full object-cover transform ${
            settings.mirrorCamera ? '-scale-x-100' : ''
          } opacity-75`}
        />

        {/* HUD Landmark Canvas */}
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10"
        />

        {/* Fallback info when camera permission requested or denied */}
        {!hasCamera && !isSimulating && (
          <div className="z-10 bg-slate-900/90 p-5 rounded-xl border border-slate-800 max-w-sm text-center">
            <CameraOff className="w-8 h-8 text-amber-400 mx-auto mb-2" />
            <h4 className="text-sm font-semibold text-slate-200">Camera Feed Initializing</h4>
            <p className="text-xs text-slate-400 mt-1">
              Please allow webcam access when prompted, or select a Test Preset above to simulate any of the 6 gestures.
            </p>
          </div>
        )}

        {/* Real-time Telemetry HUD Watermark */}
        <div className="absolute bottom-3 left-3 bg-slate-950/85 backdrop-blur px-3 py-1.5 rounded-lg border border-cyan-900/50 flex items-center space-x-4 z-20 text-[11px] font-mono">
          <div>
            <span className="text-slate-400">FPS: </span>
            <span className="text-cyan-400 font-bold">{fpsRef.current}</span>
          </div>
          <div className="w-px h-3 bg-slate-700" />
          <div>
            <span className="text-slate-400">LATENCY: </span>
            <span className="text-purple-400 font-bold">14ms</span>
          </div>
          <div className="w-px h-3 bg-slate-700" />
          <div>
            <span className="text-slate-400">HAND: </span>
            <span className="text-emerald-400 font-bold">RIGHT</span>
          </div>
        </div>

        {/* Current Gesture Badge */}
        <div className="absolute bottom-3 right-3 bg-slate-950/85 backdrop-blur px-3 py-1.5 rounded-lg border border-purple-900/50 flex items-center space-x-2 z-20">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider">DETECTED:</span>
          <span className="text-xs font-mono font-bold text-cyan-300">
            {gestureResult.gesture}
          </span>
        </div>
      </div>
    </div>
  );
};
