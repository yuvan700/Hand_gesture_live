import React, { useState, useEffect, useRef } from 'react';
import {
  Folder,
  Terminal,
  Image as ImageIcon,
  Activity,
  Globe,
  Minus,
  X,
  Maximize2,
  FileText,
  Search,
  HardDrive,
  Cpu,
  Zap,
  Play,
  RotateCcw,
  Sparkles,
  Crosshair,
} from 'lucide-react';
import { DesktopWindow, ActionType, GestureType } from '../types/gestures';

import { soundFx } from '../utils/audioFeedback';
import { PrecisionCalibrationDrill } from './PrecisionCalibrationDrill';

interface VirtualDesktopProps {
  cursorNormalized: { x: number; y: number } | null;
  currentGesture: GestureType;
  currentAction: ActionType;
  closeCountdownProgress: number;
  closeSecondsRemaining: number;
  zoomDelta: number;
  scrollDeltaY: number;
  isControlActive: boolean;
  highAccuracyMode?: boolean;
  onLogActivity: (action: string, details: string, type?: 'action' | 'info' | 'warning' | 'success') => void;
}

export const VirtualDesktop: React.FC<VirtualDesktopProps> = ({
  cursorNormalized,
  currentGesture,
  currentAction,
  closeCountdownProgress,
  closeSecondsRemaining,
  zoomDelta,
  scrollDeltaY,
  isControlActive,
  highAccuracyMode = true,
  onLogActivity,
}) => {
  const desktopRef = useRef<HTMLDivElement>(null);
  const [activeWindowId, setActiveWindowId] = useState<string>('files');
  const [zoomScale, setZoomScale] = useState<number>(1.0);
  const [terminalScroll, setTerminalScroll] = useState<number>(0);
  const [hoveredIcon, setHoveredIcon] = useState<string | null>(null);
  const [clickRipples, setClickRipples] = useState<Array<{ id: number; x: number; y: number }>>([]);

  const [windows, setWindows] = useState<DesktopWindow[]>([
    {
      id: 'files',
      title: 'File Explorer - /home/vision',
      icon: 'folder',
      isOpen: true,
      isMinimized: false,
      zIndex: 10,
      type: 'files',
    },
    {
      id: 'gallery',
      title: 'Cosmic Photo Viewer (Pinch to Zoom)',
      icon: 'image',
      isOpen: true,
      isMinimized: false,
      zIndex: 9,
      type: 'gallery',
    },
    {
      id: 'terminal',
      title: 'System Terminal (4-Finger Scroll)',
      icon: 'terminal',
      isOpen: false,
      isMinimized: false,
      zIndex: 8,
      type: 'terminal',
    },
    {
      id: 'calibration',
      title: 'Optical Accuracy Drill (Target Range)',
      icon: 'monitor',
      isOpen: false,
      isMinimized: false,
      zIndex: 7,
      type: 'calibration',
    },
    {
      id: 'monitor',
      title: 'Performance Monitor',
      icon: 'monitor',
      isOpen: false,
      isMinimized: false,
      zIndex: 6,
      type: 'monitor',
    },
  ]);

  // Track cursor pixel position inside desktop
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!desktopRef.current || !cursorNormalized) return;
    const rect = desktopRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, cursorNormalized.x * rect.width));
    const y = Math.max(0, Math.min(rect.height, cursorNormalized.y * rect.height));
    setCursorPos({ x, y });

    // Check hovered icons
    const icons = ['icon-files', 'icon-gallery', 'icon-terminal', 'icon-monitor'];
    let found = null;
    icons.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        const elRect = el.getBoundingClientRect();
        const deskRect = desktopRef.current!.getBoundingClientRect();
        const rx = elRect.left - deskRect.left;
        const ry = elRect.top - deskRect.top;
        if (x >= rx && x <= rx + elRect.width && y >= ry && y <= ry + elRect.height) {
          found = id.replace('icon-', '');
        }
      }
    });
    setHoveredIcon(found);
  }, [cursorNormalized]);

  // Handle gestures when controls are active
  useEffect(() => {
    if (!isControlActive) return;

    // 1. Double Click (2 Fingers)
    if (currentAction === 'double_click' && cursorPos) {
      soundFx.playClick();
      // Add visual ripple
      const newRipple = { id: Date.now(), x: cursorPos.x, y: cursorPos.y };
      setClickRipples((prev) => [...prev, newRipple]);
      setTimeout(() => {
        setClickRipples((prev) => prev.filter((r) => r.id !== newRipple.id));
      }, 700);

      if (hoveredIcon) {
        openWindow(hoveredIcon);
        onLogActivity('Double Click Executed', `Opened ${hoveredIcon.toUpperCase()} via 2-finger gesture`, 'success');
      } else {
        onLogActivity('Double Click Executed', 'Double clicked on desktop canvas', 'info');
      }
    }

    // 2. Minimize Window (3 Fingers)
    if (currentAction === 'minimize' && activeWindowId) {
      soundFx.playLock();
      minimizeWindow(activeWindowId);
      onLogActivity('Window Minimized', `Minimized active window '${activeWindowId}' via 3-finger gesture`, 'warning');
    }

    // 3. Close Window (5 Fingers Open after 1s hold)
    if (currentAction === 'close_window' && activeWindowId) {
      soundFx.playLock();
      closeWindow(activeWindowId);
      onLogActivity('Window Closed (Alt+F4)', `Closed active window '${activeWindowId}' via 5-finger hold`, 'warning');
    }

    // 4. Zoom In / Out (Pinch)
    if (currentAction === 'zoom_in') {
      soundFx.playZoom();
      setZoomScale((prev) => Math.min(prev + 0.12, 2.8));
      onLogActivity('Zoom In (+)', `Scale: ${(zoomScale * 100 + 12).toFixed(0)}% via pinch spread`, 'info');
    } else if (currentAction === 'zoom_out') {
      soundFx.playZoom();
      setZoomScale((prev) => Math.max(prev - 0.12, 0.45));
      onLogActivity('Zoom Out (-)', `Scale: ${(zoomScale * 100 - 12).toFixed(0)}% via pinch contract`, 'info');
    }

    // 5. Scroll (4 Fingers)
    if (currentAction === 'scroll_up') {
      setTerminalScroll((prev) => Math.max(prev - 35, 0));
    } else if (currentAction === 'scroll_down') {
      setTerminalScroll((prev) => Math.min(prev + 35, 600));
    }
  }, [currentAction, isControlActive]);

  const openWindow = (id: string) => {
    setWindows((prev) =>
      prev.map((w) => {
        if (w.id === id) {
          return { ...w, isOpen: true, isMinimized: false, zIndex: 20 };
        }
        return { ...w, zIndex: w.zIndex > 1 ? w.zIndex - 1 : 1 };
      })
    );
    setActiveWindowId(id);
  };

  const closeWindow = (id: string) => {
    setWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, isOpen: false } : w))
    );
    // Find next open window
    const openWins = windows.filter((w) => w.id !== id && w.isOpen && !w.isMinimized);
    if (openWins.length > 0) {
      setActiveWindowId(openWins[0].id);
    } else {
      setActiveWindowId('');
    }
  };

  const minimizeWindow = (id: string) => {
    setWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, isMinimized: true } : w))
    );
    const openWins = windows.filter((w) => w.id !== id && w.isOpen && !w.isMinimized);
    if (openWins.length > 0) {
      setActiveWindowId(openWins[0].id);
    } else {
      setActiveWindowId('');
    }
  };

  const restoreWindow = (id: string) => {
    setWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, isOpen: true, isMinimized: false, zIndex: 20 } : w))
    );
    setActiveWindowId(id);
  };

  return (
    <div
      ref={desktopRef}
      className="relative w-full h-full min-h-[500px] bg-gradient-to-br from-[#070b14] via-[#0b1329] to-[#080d1a] rounded-xl overflow-hidden border border-cyan-950/60 shadow-2xl select-none"
    >
      {/* Cyber Grid Background */}
      <div
        className="absolute inset-0 opacity-15 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(#06b6d4 1px, transparent 1px), linear-gradient(90deg, #06b6d4 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Ambient glow orbs */}
      <div className="absolute top-1/4 left-1/3 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Desktop Top Status Banner */}
      <div className="absolute top-0 inset-x-0 h-9 bg-slate-950/70 backdrop-blur-md border-b border-cyan-900/40 px-4 flex items-center justify-between z-10 text-xs">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="font-semibold tracking-wider text-cyan-300">VISION-OS INTERACTIVE WORKSPACE</span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-400">Sandbox Target</span>
        </div>
        <div className="flex items-center space-x-3 text-slate-400">
          <span className="bg-cyan-950/60 text-cyan-400 px-2 py-0.5 rounded border border-cyan-800/50 text-[10px] font-mono">
            ACTIVE WIN: {activeWindowId ? activeWindowId.toUpperCase() : 'NONE'}
          </span>
          <span className="text-[10px] text-slate-400">
            {new Date().toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Desktop App Icons */}
      <div className="absolute top-14 left-6 flex flex-col space-y-4 z-10">
        {/* File Explorer Icon */}
        <div
          id="icon-files"
          onClick={() => openWindow('files')}
          className={`group flex flex-col items-center w-20 p-2.5 rounded-lg cursor-pointer transition-all ${
            hoveredIcon === 'files'
              ? 'bg-cyan-500/25 border border-cyan-400/60 scale-105'
              : 'hover:bg-slate-800/40 border border-transparent'
          }`}
        >
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-cyan-950/50 group-hover:shadow-cyan-500/30">
            <Folder className="w-6 h-6 text-white" />
          </div>
          <span className="mt-1.5 text-[11px] font-medium text-slate-200 text-center drop-shadow">
            My Files
          </span>
          <span className="text-[9px] text-cyan-400/80">2-Finger Open</span>
        </div>

        {/* Photo Gallery Icon */}
        <div
          id="icon-gallery"
          onClick={() => openWindow('gallery')}
          className={`group flex flex-col items-center w-20 p-2.5 rounded-lg cursor-pointer transition-all ${
            hoveredIcon === 'gallery'
              ? 'bg-purple-500/25 border border-purple-400/60 scale-105'
              : 'hover:bg-slate-800/40 border border-transparent'
          }`}
        >
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-purple-950/50 group-hover:shadow-purple-500/30">
            <ImageIcon className="w-6 h-6 text-white" />
          </div>
          <span className="mt-1.5 text-[11px] font-medium text-slate-200 text-center drop-shadow">
            Gallery
          </span>
          <span className="text-[9px] text-purple-400/80">Pinch Zoom</span>
        </div>

        {/* Terminal Icon */}
        <div
          id="icon-terminal"
          onClick={() => openWindow('terminal')}
          className={`group flex flex-col items-center w-20 p-2.5 rounded-lg cursor-pointer transition-all ${
            hoveredIcon === 'terminal'
              ? 'bg-emerald-500/25 border border-emerald-400/60 scale-105'
              : 'hover:bg-slate-800/40 border border-transparent'
          }`}
        >
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-slate-800 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-950/50 border border-emerald-500/30">
            <Terminal className="w-6 h-6 text-emerald-300" />
          </div>
          <span className="mt-1.5 text-[11px] font-medium text-slate-200 text-center drop-shadow">
            Terminal
          </span>
          <span className="text-[9px] text-emerald-400/80">4-Finger Scroll</span>
        </div>

        {/* Calibration Target Range Icon */}
        <div
          id="icon-calibration"
          onClick={() => openWindow('calibration')}
          className={`group flex flex-col items-center w-20 p-2.5 rounded-lg cursor-pointer transition-all ${
            hoveredIcon === 'calibration'
              ? 'bg-amber-500/25 border border-amber-400/60 scale-105'
              : 'hover:bg-slate-800/40 border border-transparent'
          }`}
        >
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-amber-600 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-950/50">
            <Crosshair className="w-6 h-6 text-white" />
          </div>
          <span className="mt-1.5 text-[11px] font-medium text-slate-200 text-center drop-shadow">
            Calibration
          </span>
          <span className="text-[9px] text-amber-400/80">Target Drill</span>
        </div>

        {/* Performance Monitor Icon */}
        <div
          id="icon-monitor"
          onClick={() => openWindow('monitor')}
          className={`group flex flex-col items-center w-20 p-2.5 rounded-lg cursor-pointer transition-all ${
            hoveredIcon === 'monitor'
              ? 'bg-blue-500/25 border border-blue-400/60 scale-105'
              : 'hover:bg-slate-800/40 border border-transparent'
          }`}
        >
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-700 to-sky-500 flex items-center justify-center shadow-lg shadow-blue-950/50">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <span className="mt-1.5 text-[11px] font-medium text-slate-200 text-center drop-shadow">
            Monitor
          </span>
          <span className="text-[9px] text-sky-400/80">System Stats</span>
        </div>
      </div>

      {/* WINDOW 1: File Explorer */}
      {windows.find((w) => w.id === 'files')?.isOpen && !windows.find((w) => w.id === 'files')?.isMinimized && (
        <div
          onClick={() => setActiveWindowId('files')}
          className={`absolute left-32 top-14 w-[380px] h-[330px] rounded-xl bg-slate-900/90 backdrop-blur-md border flex flex-col shadow-2xl transition-all ${
            activeWindowId === 'files'
              ? 'border-cyan-500/70 shadow-cyan-900/30 ring-1 ring-cyan-400/30'
              : 'border-slate-700/60 opacity-85'
          }`}
          style={{ zIndex: windows.find((w) => w.id === 'files')?.zIndex }}
        >
          {/* Header */}
          <div className="h-9 px-3 bg-slate-950/80 rounded-t-xl border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2 text-xs font-medium text-slate-200">
              <Folder className="w-4 h-4 text-cyan-400" />
              <span>File Explorer</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  minimizeWindow('files');
                }}
                className="w-5 h-5 rounded hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
                title="3-Finger Minimize"
              >
                <Minus className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeWindow('files');
                }}
                className="w-5 h-5 rounded hover:bg-red-900/50 flex items-center justify-center text-slate-400 hover:text-red-300"
                title="5-Finger Hold Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          {/* Body */}
          <div className="flex-1 p-3 overflow-y-auto space-y-2 text-xs">
            <div className="p-2 rounded bg-slate-800/40 border border-slate-700/50 flex items-center justify-between hover:bg-slate-800/70 cursor-pointer">
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-cyan-400" />
                <span className="text-slate-200 font-mono">gesture_recognizer.py</span>
              </div>
              <span className="text-[10px] text-slate-400">12.4 KB</span>
            </div>
            <div className="p-2 rounded bg-slate-800/40 border border-slate-700/50 flex items-center justify-between hover:bg-slate-800/70 cursor-pointer">
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-blue-400" />
                <span className="text-slate-200 font-mono">controller.py</span>
              </div>
              <span className="text-[10px] text-slate-400">8.9 KB</span>
            </div>
            <div className="p-2 rounded bg-slate-800/40 border border-slate-700/50 flex items-center justify-between hover:bg-slate-800/70 cursor-pointer">
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-purple-400" />
                <span className="text-slate-200 font-mono">config.py</span>
              </div>
              <span className="text-[10px] text-slate-400">3.2 KB</span>
            </div>
            <div className="p-2 rounded bg-slate-800/40 border border-slate-700/50 flex items-center justify-between hover:bg-slate-800/70 cursor-pointer">
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-emerald-400" />
                <span className="text-slate-200 font-mono">requirements.txt</span>
              </div>
              <span className="text-[10px] text-slate-400">420 B</span>
            </div>
          </div>
          <div className="h-6 px-3 bg-slate-950/60 rounded-b-xl border-t border-slate-800/70 flex items-center justify-between text-[10px] text-slate-400">
            <span>4 items selected</span>
            <span className="text-cyan-400">Ready for 2-finger click</span>
          </div>
        </div>
      )}

      {/* WINDOW 2: Cosmic Photo Viewer (Pinch Zoom Target) */}
      {windows.find((w) => w.id === 'gallery')?.isOpen && !windows.find((w) => w.id === 'gallery')?.isMinimized && (
        <div
          onClick={() => setActiveWindowId('gallery')}
          className={`absolute right-8 top-16 w-[420px] h-[340px] rounded-xl bg-slate-900/90 backdrop-blur-md border flex flex-col shadow-2xl transition-all ${
            activeWindowId === 'gallery'
              ? 'border-purple-500/70 shadow-purple-900/30 ring-1 ring-purple-400/30'
              : 'border-slate-700/60 opacity-85'
          }`}
          style={{ zIndex: windows.find((w) => w.id === 'gallery')?.zIndex }}
        >
          {/* Header */}
          <div className="h-9 px-3 bg-slate-950/80 rounded-t-xl border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2 text-xs font-medium text-slate-200">
              <ImageIcon className="w-4 h-4 text-purple-400" />
              <span>Cosmic Photo Viewer</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="bg-purple-950/80 text-purple-300 px-2 py-0.5 rounded text-[10px] font-mono border border-purple-800/40">
                ZOOM: {(zoomScale * 100).toFixed(0)}%
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  minimizeWindow('gallery');
                }}
                className="w-5 h-5 rounded hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
              >
                <Minus className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeWindow('gallery');
                }}
                className="w-5 h-5 rounded hover:bg-red-900/50 flex items-center justify-center text-slate-400 hover:text-red-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          {/* Zoomable Image Canvas */}
          <div className="flex-1 relative overflow-hidden bg-slate-950 flex items-center justify-center p-3">
            <div
              className="relative transition-transform duration-100 ease-out flex items-center justify-center"
              style={{ transform: `scale(${zoomScale})` }}
            >
              {/* High-res generative SVG galaxy artwork */}
              <div className="w-64 h-44 rounded-lg bg-gradient-to-br from-indigo-900 via-purple-900 to-black p-4 relative overflow-hidden border border-purple-500/40 shadow-inner flex flex-col justify-between">
                <div className="absolute -top-10 -right-10 w-36 h-36 bg-cyan-500/30 rounded-full blur-2xl" />
                <div className="absolute -bottom-10 -left-10 w-36 h-36 bg-pink-500/30 rounded-full blur-2xl" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full bg-gradient-to-tr from-amber-400 to-purple-600 blur-sm opacity-80" />
                
                <div className="z-10 flex justify-between items-center text-[10px] text-cyan-300 font-mono">
                  <span>NEBULA-NGC-842</span>
                  <span>SPECTRAL-VISION</span>
                </div>
                <div className="z-10 text-center">
                  <span className="text-xs font-semibold text-white tracking-widest uppercase">
                    Pinch Gesture Zoom Target
                  </span>
                  <p className="text-[9px] text-purple-200/80">Thumb + Index distance controls scale</p>
                </div>
                <div className="z-10 text-[9px] text-slate-400 font-mono">
                  Coordinates: RA 14h 03m | Dec +54° 20′
                </div>
              </div>
            </div>

            {/* Pinch action helper */}
            <div className="absolute bottom-2 left-2 bg-slate-900/80 backdrop-blur px-2 py-1 rounded text-[10px] text-purple-300 border border-purple-800/40">
              Move thumb & index apart to zoom in, closer to zoom out
            </div>
          </div>
        </div>
      )}

      {/* WINDOW 3: Terminal (4-Finger Scroll Target) */}
      {windows.find((w) => w.id === 'terminal')?.isOpen && !windows.find((w) => w.id === 'terminal')?.isMinimized && (
        <div
          onClick={() => setActiveWindowId('terminal')}
          className={`absolute left-40 bottom-12 w-[460px] h-[280px] rounded-xl bg-slate-950/95 backdrop-blur-md border flex flex-col shadow-2xl transition-all ${
            activeWindowId === 'terminal'
              ? 'border-emerald-500/70 shadow-emerald-900/30 ring-1 ring-emerald-400/30'
              : 'border-slate-700/60 opacity-85'
          }`}
          style={{ zIndex: windows.find((w) => w.id === 'terminal')?.zIndex }}
        >
          {/* Header */}
          <div className="h-9 px-3 bg-slate-900/90 rounded-t-xl border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2 text-xs font-medium text-slate-200">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span>VisionGrip AI Shell (4-Finger Scroll)</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-mono text-emerald-400">
                SCROLL: {terminalScroll}px
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  minimizeWindow('terminal');
                }}
                className="w-5 h-5 rounded hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
              >
                <Minus className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeWindow('terminal');
                }}
                className="w-5 h-5 rounded hover:bg-red-900/50 flex items-center justify-center text-slate-400 hover:text-red-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          {/* Terminal output */}
          <div
            className="flex-1 p-3 overflow-y-auto font-mono text-[11px] leading-relaxed text-emerald-300 space-y-1.5 scroll-smooth"
          >
            <p className="text-slate-400">$ python3 -m unittest discover -s tests -v</p>
            <p className="text-emerald-400">test_adaptive_cursor_smoothing ... OK</p>
            <p className="text-emerald-400">test_calculate_angle_deg ... OK</p>
            <p className="text-emerald-400">test_screen_mapping_corners ... OK</p>
            <p className="text-emerald-400">test_double_click_cooldown ... OK</p>
            <p className="text-emerald-400">test_five_finger_hold_countdown (1.0s hold) ... OK</p>
            <p className="text-emerald-400">test_four_finger_scroll ... OK</p>
            <p className="text-emerald-400">test_left_hand_rejected_when_right_hand_required ... OK</p>
            <p className="text-emerald-400">test_one_finger_cursor_move ... OK</p>
            <p className="text-emerald-400">test_pinch_zoom_detection ... OK</p>
            <p className="text-emerald-400">test_three_fingers_minimize ... OK</p>
            <p className="text-emerald-400">test_two_fingers_double_click ... OK</p>
            <p className="text-emerald-400">test_actions_blocked_by_default ... OK</p>
            <p className="text-emerald-400">test_emergency_stop_latches_all_actions ... OK</p>
            <p className="text-emerald-400">test_start_and_stop_lifecycle ... OK</p>
            <p className="text-cyan-300 font-bold">Ran 15 tests in 0.003s -- ALL PASS (100% OK)</p>
            <p className="text-slate-400 mt-2">$ [VisionGrip Background Inference Worker running at 30 FPS]</p>
          </div>
        </div>
      )}

      {/* WINDOW 4: Optical Accuracy Calibration Range */}
      {windows.find((w) => w.id === 'calibration')?.isOpen && !windows.find((w) => w.id === 'calibration')?.isMinimized && (
        <div
          onClick={() => setActiveWindowId('calibration')}
          className={`absolute left-28 top-20 w-[560px] h-[440px] rounded-xl bg-slate-950/95 backdrop-blur-md border flex flex-col shadow-2xl transition-all ${
            activeWindowId === 'calibration'
              ? 'border-cyan-400 shadow-cyan-900/40 ring-1 ring-cyan-400/40'
              : 'border-slate-700/60 opacity-85'
          }`}
          style={{ zIndex: windows.find((w) => w.id === 'calibration')?.zIndex }}
        >
          {/* Header */}
          <div className="h-9 px-3 bg-slate-900/90 rounded-t-xl border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2 text-xs font-medium text-slate-200">
              <Crosshair className="w-4 h-4 text-cyan-400" />
              <span>Optical Accuracy Calibration Drill</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/40">
                1€ FILTER
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  minimizeWindow('calibration');
                }}
                className="w-5 h-5 rounded hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
              >
                <Minus className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeWindow('calibration');
                }}
                className="w-5 h-5 rounded hover:bg-red-900/50 flex items-center justify-center text-slate-400 hover:text-red-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          {/* Drill Canvas */}
          <div className="flex-1 p-2">
            <PrecisionCalibrationDrill cursorNormalized={cursorNormalized} />
          </div>
        </div>
      )}

      {/* WINDOW 5: Performance Monitor */}
      {windows.find((w) => w.id === 'monitor')?.isOpen && !windows.find((w) => w.id === 'monitor')?.isMinimized && (
        <div
          onClick={() => setActiveWindowId('monitor')}
          className={`absolute right-12 bottom-12 w-[390px] h-[270px] rounded-xl bg-slate-900/95 backdrop-blur-md border flex flex-col shadow-2xl transition-all ${
            activeWindowId === 'monitor'
              ? 'border-blue-500/70 shadow-blue-900/30 ring-1 ring-blue-400/30'
              : 'border-slate-700/60 opacity-85'
          }`}
          style={{ zIndex: windows.find((w) => w.id === 'monitor')?.zIndex }}
        >
          {/* Header */}
          <div className="h-9 px-3 bg-slate-950/80 rounded-t-xl border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2 text-xs font-medium text-slate-200">
              <Activity className="w-4 h-4 text-blue-400" />
              <span>System & Hardware Telemetry</span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  minimizeWindow('monitor');
                }}
                className="w-5 h-5 rounded hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
              >
                <Minus className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeWindow('monitor');
                }}
                className="w-5 h-5 rounded hover:bg-red-900/50 flex items-center justify-center text-slate-400 hover:text-red-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          {/* Metrics */}
          <div className="flex-1 p-3 text-xs space-y-3">
            <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Computer Vision Pipeline</span>
                <span className="text-cyan-400 font-mono">Real-Time MediaPipe</span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full w-[85%] rounded-full animate-pulse" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Smoothing</span>
                <span className="font-mono text-cyan-300 font-semibold">1€ Optic Filter</span>
              </div>
              <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Failsafe</span>
                <span className="font-mono text-emerald-400 font-semibold">Active & Armed</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Taskbar / Dock at Bottom */}
      <div className="absolute bottom-2 inset-x-8 h-10 bg-slate-950/85 backdrop-blur-md rounded-xl border border-cyan-900/40 px-3 flex items-center justify-between z-10">
        <div className="flex items-center space-x-2">
          {windows.map((w) => (
            <button
              key={w.id}
              onClick={() => {
                if (w.isMinimized || !w.isOpen) {
                  restoreWindow(w.id);
                } else if (activeWindowId === w.id) {
                  minimizeWindow(w.id);
                } else {
                  setActiveWindowId(w.id);
                }
              }}
              className={`px-2.5 py-1 rounded text-xs flex items-center space-x-1.5 transition-all ${
                activeWindowId === w.id && w.isOpen && !w.isMinimized
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                  : w.isOpen
                  ? 'bg-slate-800/60 text-slate-300 hover:bg-slate-800 border border-slate-700/50'
                  : 'bg-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              <span>{w.title.split(' ')[0]}</span>
            </button>
          ))}
        </div>
        <div className="text-[11px] font-mono text-slate-400">
          <span className="text-cyan-400">3-Finger</span>: Min | <span className="text-red-400">5-Finger</span>: Close | <span className="text-purple-400">Pinch</span>: Zoom
        </div>
      </div>

      {/* Virtual Cursor Rendering */}
      {cursorPos && (
        <div
          className="pointer-events-none absolute z-50 transition-all duration-75 ease-out"
          style={{
            left: `${cursorPos.x}px`,
            top: `${cursorPos.y}px`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {/* Aerospace Precision Optical Reticle Head */}
          <div className="relative">
            <div className="w-8 h-8 rounded-full border border-cyan-400/80 bg-cyan-400/15 backdrop-blur-sm flex items-center justify-center shadow-lg shadow-cyan-500/40">
              <div className="w-1.5 h-1.5 rounded-full bg-white shadow-md shadow-cyan-400" />
            </div>

            {/* Precision Crosshairs */}
            <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-0.5 h-1.5 bg-cyan-400" />
            <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-0.5 h-1.5 bg-cyan-400" />
            <div className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-1.5 h-0.5 bg-cyan-400" />
            <div className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-1.5 h-0.5 bg-cyan-400" />

            {/* Sub-pixel Coordinate & Gesture Badge */}
            <div className="absolute top-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-950/95 border border-cyan-500/50 px-2 py-0.5 rounded text-[9px] font-mono text-cyan-300 shadow-xl flex items-center space-x-1.5">
              <span>{currentGesture}</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-400">
                {Math.round(cursorPos.x)},{Math.round(cursorPos.y)}
              </span>
              {highAccuracyMode && (
                <>
                  <span className="text-slate-600">·</span>
                  <span className="text-emerald-400 font-bold">1€</span>
                </>
              )}
            </div>

            {/* 5-Finger Close Window Circular Countdown Ring around cursor */}
            {closeCountdownProgress > 0 && (
              <div className="absolute -top-10 -left-10 w-26 h-26 pointer-events-none flex items-center justify-center">
                <svg className="w-20 h-20 -rotate-90">
                  <circle
                    cx="40"
                    cy="40"
                    r="32"
                    stroke="#374151"
                    strokeWidth="4"
                    fill="none"
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r="32"
                    stroke="#ef4444"
                    strokeWidth="4"
                    strokeDasharray={201}
                    strokeDashoffset={201 * (1 - closeCountdownProgress)}
                    strokeLinecap="round"
                    fill="none"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-[11px] font-bold text-red-400">
                    {closeSecondsRemaining.toFixed(1)}s
                  </span>
                  <span className="text-[8px] uppercase tracking-wider text-white">ALT+F4</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Click ripple animations */}
      {clickRipples.map((ripple) => (
        <div
          key={ripple.id}
          className="pointer-events-none absolute rounded-full border-2 border-cyan-400 animate-ping z-40"
          style={{
            left: `${ripple.x}px`,
            top: `${ripple.y}px`,
            width: '40px',
            height: '40px',
            transform: 'translate(-50%, -50%)',
          }}
        />
      ))}
    </div>
  );
};
