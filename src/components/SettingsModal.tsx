import React from 'react';
import { X, Sliders, RotateCcw, Check } from 'lucide-react';
import { AppSettings } from '../types/gestures';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
  onResetDefaults: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onResetDefaults,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/40 flex items-center justify-center">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">
                Gesture Calibration & Smoothing
              </h3>
              <p className="text-[11px] text-slate-400">
                Configure MediaPipe thresholds and adaptive cursor response
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sliders Body */}
        <div className="p-5 space-y-4 text-xs overflow-y-auto max-h-[70vh]">
          {/* High Accuracy One-Euro Mode Switch */}
          <div className="flex items-center justify-between bg-cyan-950/40 p-3 rounded-xl border border-cyan-800/60">
            <div>
              <span className="font-semibold text-cyan-200 block">High Accuracy Mode (1€ Filter)</span>
              <span className="text-[11px] text-slate-300">
                Industry-grade One-Euro filter dynamically cancels tremor while sweeping latency is 0ms.
              </span>
            </div>
            <input
              type="checkbox"
              checked={settings.highAccuracyMode}
              onChange={(e) =>
                onUpdateSettings({ ...settings, highAccuracyMode: e.target.checked })
              }
              className="w-4 h-4 accent-cyan-400 cursor-pointer"
            />
          </div>

          {/* One-Euro Min Cutoff */}
          {settings.highAccuracyMode && (
            <div className="space-y-1.5 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-200">1€ Min Cutoff Frequency (fc_min)</span>
                <span className="font-mono text-cyan-400 font-bold">{settings.oneEuroMinCutoff.toFixed(2)} Hz</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Cutoff frequency when stationary. Lower values (0.5 - 1.0 Hz) eliminate micro-jitters completely.
              </p>
              <input
                type="range"
                min="0.3"
                max="2.5"
                step="0.05"
                value={settings.oneEuroMinCutoff}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, oneEuroMinCutoff: parseFloat(e.target.value) })
                }
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>
          )}

          {/* Sub-Pixel Deadband */}
          {settings.highAccuracyMode && (
            <div className="space-y-1.5 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-200">Sub-Pixel Deadband Threshold</span>
                <span className="font-mono text-emerald-400 font-bold">{(settings.subPixelDeadband * 1000).toFixed(1)} mU</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Suppresses involuntary physiological finger tremors below threshold.
              </p>
              <input
                type="range"
                min="0.0005"
                max="0.0040"
                step="0.0002"
                value={settings.subPixelDeadband}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, subPixelDeadband: parseFloat(e.target.value) })
                }
                className="w-full accent-emerald-400 cursor-pointer"
              />
            </div>
          )}

          {/* Standard Smoothing Factor */}
          {!settings.highAccuracyMode && (
            <div className="space-y-1.5 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-200">Adaptive Smoothing (EMA Alpha)</span>
                <span className="font-mono text-cyan-400 font-bold">{settings.smoothingFactor.toFixed(2)}</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Higher values eliminate micro-jitters; lower values reduce tracking latency.
              </p>
              <input
                type="range"
                min="0.2"
                max="0.9"
                step="0.05"
                value={settings.smoothingFactor}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, smoothingFactor: parseFloat(e.target.value) })
                }
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>
          )}

          {/* Sensitivity */}
          <div className="space-y-1.5 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-slate-200">Cursor Sensitivity Multiplier</span>
              <span className="font-mono text-blue-400 font-bold">{settings.sensitivity.toFixed(2)}x</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Scales cursor speed across the active screen surface.
            </p>
            <input
              type="range"
              min="0.6"
              max="2.5"
              step="0.1"
              value={settings.sensitivity}
              onChange={(e) =>
                onUpdateSettings({ ...settings, sensitivity: parseFloat(e.target.value) })
              }
              className="w-full accent-blue-400 cursor-pointer"
            />
          </div>

          {/* Pinch Threshold */}
          <div className="space-y-1.5 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-slate-200">Pinch Distance Threshold</span>
              <span className="font-mono text-emerald-400 font-bold">{settings.pinchThreshold.toFixed(3)}</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Thumb-to-index proximity required to engage zoom scaling.
            </p>
            <input
              type="range"
              min="0.04"
              max="0.12"
              step="0.005"
              value={settings.pinchThreshold}
              onChange={(e) =>
                onUpdateSettings({ ...settings, pinchThreshold: parseFloat(e.target.value) })
              }
              className="w-full accent-emerald-400 cursor-pointer"
            />
          </div>

          {/* 5-Finger Close Hold Countdown */}
          <div className="space-y-1.5 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-slate-200">Close Window Hold Duration</span>
              <span className="font-mono text-red-400 font-bold">{settings.closeHoldDuration.toFixed(1)}s</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Continuous 5-finger hold duration before Alt+F4 is dispatched.
            </p>
            <input
              type="range"
              min="0.5"
              max="2.5"
              step="0.1"
              value={settings.closeHoldDuration}
              onChange={(e) =>
                onUpdateSettings({ ...settings, closeHoldDuration: parseFloat(e.target.value) })
              }
              className="w-full accent-red-400 cursor-pointer"
            />
          </div>

          {/* Camera Mirroring Toggle */}
          <div className="flex items-center justify-between bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <div>
              <span className="font-semibold text-slate-200 block">Mirror Camera Video</span>
              <span className="text-[11px] text-slate-400">
                Flips video horizontally for natural mirror-like interaction.
              </span>
            </div>
            <input
              type="checkbox"
              checked={settings.mirrorCamera}
              onChange={(e) =>
                onUpdateSettings({ ...settings, mirrorCamera: e.target.checked })
              }
              className="w-4 h-4 accent-cyan-400 cursor-pointer"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={onResetDefaults}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center space-x-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs flex items-center space-x-1.5 transition-colors cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Apply Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
};
