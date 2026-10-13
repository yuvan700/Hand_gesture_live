import React from 'react';
import { Play, Square, AlertOctagon, Sliders, ShieldCheck, RefreshCw, LayoutTemplate } from 'lucide-react';

interface ControlPanelProps {
  isControlActive: boolean;
  isEmergencyStopped: boolean;
  onStart: () => void;
  onStop: () => void;
  onEmergencyStop: () => void;
  onResetEmergencyStop: () => void;
  onOpenSettings: () => void;
  activeLayout: 'split' | 'sandbox';
  onToggleLayout: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  isControlActive,
  isEmergencyStopped,
  onStart,
  onStop,
  onEmergencyStop,
  onResetEmergencyStop,
  onOpenSettings,
  activeLayout,
  onToggleLayout,
}) => {
  return (
    <div className="w-full bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-xl">
      {/* Control Action Buttons */}
      <div className="flex items-center space-x-2.5">
        {!isEmergencyStopped ? (
          <>
            <button
              onClick={onStart}
              disabled={isControlActive}
              className={`px-4 py-2 rounded-lg font-medium text-xs flex items-center space-x-2 transition-all shadow-md ${
                isControlActive
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 cursor-default'
                  : 'bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white cursor-pointer active:scale-95 shadow-cyan-900/30'
              }`}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isControlActive ? 'SYSTEM RUNNING' : 'START CONTROL'}</span>
            </button>

            <button
              onClick={onStop}
              disabled={!isControlActive}
              className={`px-4 py-2 rounded-lg font-medium text-xs flex items-center space-x-2 transition-all ${
                !isControlActive
                  ? 'bg-slate-800/50 text-slate-500 border border-slate-800 cursor-not-allowed'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer active:scale-95'
              }`}
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>STOP</span>
            </button>
          </>
        ) : (
          <button
            onClick={onResetEmergencyStop}
            className="px-4 py-2 rounded-lg font-semibold text-xs flex items-center space-x-2 bg-amber-600 hover:bg-amber-500 text-white cursor-pointer shadow-lg shadow-amber-950/40 active:scale-95"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>RESET EMERGENCY LOCK</span>
          </button>
        )}

        {/* Emergency Stop Button */}
        <button
          onClick={onEmergencyStop}
          className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center space-x-2 transition-all cursor-pointer ${
            isEmergencyStopped
              ? 'bg-red-600 text-white ring-2 ring-red-400 ring-offset-2 ring-offset-slate-900 animate-pulse'
              : 'bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/50 active:scale-95'
          }`}
          title="Press Escape on keyboard or click to immediately freeze all cursor and click operations"
        >
          <AlertOctagon className="w-4 h-4 text-red-400" />
          <span>EMERGENCY STOP (ESC)</span>
        </button>
      </div>

      {/* Safety Status & Calibration */}
      <div className="flex items-center space-x-2.5">
        <div className="hidden sm:flex items-center space-x-2 bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800 text-xs">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span className="text-slate-300 font-mono text-[11px]">
            FAILSAFE: <strong className="text-emerald-400">ARMED</strong>
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400 text-[10px]">Corner Abort</span>
        </div>

        <button
          onClick={onToggleLayout}
          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs flex items-center space-x-1.5 transition-all cursor-pointer"
        >
          <LayoutTemplate className="w-3.5 h-3.5 text-cyan-400" />
          <span>{activeLayout === 'split' ? 'Expanded Sandbox' : 'Split View'}</span>
        </button>

        <button
          onClick={onOpenSettings}
          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs flex items-center space-x-1.5 transition-all cursor-pointer"
        >
          <Sliders className="w-3.5 h-3.5 text-purple-400" />
          <span>Calibration</span>
        </button>
      </div>
    </div>
  );
};
