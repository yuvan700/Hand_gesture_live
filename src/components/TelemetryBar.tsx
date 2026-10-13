import React from 'react';
import { Cpu, Zap, Activity, Shield, HardDrive, Monitor, Volume2, VolumeX, Sparkles, Crosshair } from 'lucide-react';
import { SystemTelemetry, GestureType, ActionType } from '../types/gestures';

interface TelemetryBarProps {
  telemetry: SystemTelemetry;
  currentGesture: GestureType;
  currentAction: ActionType;
  isControlActive: boolean;
  isEmergencyStopped: boolean;
  highAccuracyMode: boolean;
  audioFeedback: boolean;
  onToggleAudio: () => void;
  onToggleHighAccuracy: () => void;
}

export const TelemetryBar: React.FC<TelemetryBarProps> = ({
  telemetry,
  currentGesture,
  currentAction,
  isControlActive,
  isEmergencyStopped,
  highAccuracyMode,
  audioFeedback,
  onToggleAudio,
  onToggleHighAccuracy,
}) => {
  return (
    <div className="w-full bg-[#050811]/95 backdrop-blur-md border border-cyan-950/70 rounded-xl p-3 shadow-2xl grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
      {/* 1. Status & Control Gate */}
      <div className="bg-[#090e1f] p-2.5 rounded-lg border border-slate-800/80 flex flex-col justify-between">
        <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
          <span>SYSTEM STATE</span>
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
        </div>
        <div className="mt-1 flex items-baseline space-x-1.5">
          <span
            className={`font-mono font-bold text-xs ${
              isEmergencyStopped
                ? 'text-red-400'
                : isControlActive
                ? 'text-emerald-300'
                : 'text-slate-400'
            }`}
          >
            {isEmergencyStopped ? 'EMERGENCY LOCK' : isControlActive ? 'ARMED & ACTIVE' : 'STANDBY'}
          </span>
        </div>
        <span className="text-[10px] text-slate-500 font-mono mt-0.5">
          {isControlActive ? 'Tracking Right Hand' : 'Awaiting Start Gate'}
        </span>
      </div>

      {/* 2. Detected Gesture */}
      <div className="bg-[#090e1f] p-2.5 rounded-lg border border-cyan-900/50 flex flex-col justify-between">
        <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
          <span>GESTURE CLASSIFIER</span>
          <span className="text-cyan-400 font-bold font-mono">98% CONF</span>
        </div>
        <div className="mt-1 font-mono font-bold text-xs text-cyan-300 truncate">
          {currentGesture}
        </div>
        <span className="text-[10px] text-purple-300/80 font-mono mt-0.5 capitalize truncate">
          Action: {currentAction.replace('_', ' ')}
        </span>
      </div>

      {/* 3. High Accuracy Mode Switcher & Filter Metric */}
      <div
        onClick={onToggleHighAccuracy}
        className={`p-2.5 rounded-lg border flex flex-col justify-between cursor-pointer transition-all ${
          highAccuracyMode
            ? 'bg-cyan-950/30 border-cyan-400/80 ring-1 ring-cyan-400/30 shadow-lg shadow-cyan-950/50'
            : 'bg-[#090e1f] border-slate-800 hover:border-slate-700'
        }`}
        title="Click to toggle High Accuracy One-Euro Filter"
      >
        <div className="flex items-center justify-between text-[10px] font-mono">
          <span className="text-slate-400">ACCURACY ENGINE</span>
          <span
            className={`font-bold px-1 rounded text-[9px] ${
              highAccuracyMode ? 'bg-cyan-400 text-slate-950' : 'text-slate-500 bg-slate-800'
            }`}
          >
            {highAccuracyMode ? '1€ HIGH ACCURACY' : 'STANDARD'}
          </span>
        </div>
        <div className="mt-1 flex items-baseline space-x-1.5 font-mono">
          <span className="text-xs font-bold text-cyan-300">
            {highAccuracyMode ? 'GRADE S+' : 'GRADE A'}
          </span>
          <span className="text-[10px] text-slate-400">
            (±{telemetry.jitterVariancePx} px jitter)
          </span>
        </div>
        <span className="text-[10px] text-slate-400 font-mono mt-0.5">
          {highAccuracyMode ? 'Zero-Jitter Active' : 'Click to enable 1€ Filter'}
        </span>
      </div>

      {/* 4. Inference Benchmark */}
      <div className="bg-[#090e1f] p-2.5 rounded-lg border border-slate-800/80 flex flex-col justify-between">
        <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
          <span>INFERENCE METRICS</span>
          <span className="text-blue-400 font-bold font-mono">{telemetry.latencyMs} ms</span>
        </div>
        <div className="mt-1 font-mono font-bold text-xs text-blue-300">
          {telemetry.fps} FPS · Real-Time
        </div>
        <span className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">
          HW: {telemetry.hardwareMode.split(' ')[0]}
        </span>
      </div>

      {/* 5. Biometric Spatial Horizon (Roll/Pitch) */}
      <div className="bg-[#090e1f] p-2.5 rounded-lg border border-slate-800/80 flex flex-col justify-between">
        <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
          <span>SPATIAL HORIZON</span>
          <span className="text-purple-400 font-bold font-mono">3D POSE</span>
        </div>
        <div className="mt-1 font-mono font-bold text-xs text-purple-300">
          Roll: {telemetry.rollDeg}° · Pitch: {telemetry.pitchDeg}°
        </div>
        <span className="text-[10px] text-slate-500 font-mono mt-0.5">
          Index Flex: {telemetry.indexAngleDeg}°
        </span>
      </div>

      {/* 6. Hardware & Audio Cues */}
      <div className="bg-[#090e1f] p-2.5 rounded-lg border border-slate-800/80 flex flex-col justify-between">
        <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
          <span>AUDIO & CPU</span>
          <button
            onClick={onToggleAudio}
            className={`cursor-pointer transition-colors ${
              audioFeedback ? 'text-cyan-400' : 'text-slate-600'
            }`}
            title="Toggle Synthesized Sci-Fi Audio Cues"
          >
            {audioFeedback ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>
        </div>
        <div className="mt-1 font-mono font-bold text-xs text-slate-200">
          {telemetry.cpuCores} Threads Active
        </div>
        <span className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">
          Sound: {audioFeedback ? 'Holographic SFX' : 'Muted'}
        </span>
      </div>
    </div>
  );
};
