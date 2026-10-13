import React from 'react';
import { MousePointer, CheckCircle2, MinusCircle, XCircle, ZoomIn, ArrowUpDown } from 'lucide-react';
import { GestureType } from '../types/gestures';

interface GestureGuideProps {
  currentGesture: GestureType;
}

export const GestureGuide: React.FC<GestureGuideProps> = ({ currentGesture }) => {
  const guides = [
    {
      id: 'CURSOR_MOVE',
      title: 'Move Cursor',
      fingers: '☝ Index Finger Only',
      desc: 'Point and move smoothly with adaptive jitter cancellation.',
      icon: MousePointer,
      color: 'cyan',
    },
    {
      id: 'DOUBLE_CLICK',
      title: 'Double-Click',
      fingers: '✌ 2 Fingers (Index + Middle)',
      desc: 'Double-clicks to open hovered files, apps, or folders.',
      icon: CheckCircle2,
      color: 'blue',
    },
    {
      id: 'MINIMIZE',
      title: 'Minimize Window',
      fingers: '🖐 3 Fingers (Index + Mid + Ring)',
      desc: 'Instantly minimizes the currently focused window.',
      icon: MinusCircle,
      color: 'purple',
    },
    {
      id: 'CLOSE_WINDOW',
      title: 'Close Window (Alt+F4)',
      fingers: '✋ 5 Fingers Open (1s Hold)',
      desc: 'Hold for 1 second with visible circular countdown to close.',
      icon: XCircle,
      color: 'red',
    },
    {
      id: 'PINCH_ZOOM',
      title: 'Pinch Zoom',
      fingers: '🤏 Pinch (Thumb + Index)',
      desc: 'Move fingers apart to zoom in; move closer to zoom out.',
      icon: ZoomIn,
      color: 'emerald',
    },
    {
      id: 'SCROLL',
      title: 'Vertical Scroll',
      fingers: '🖐 4 Fingers Extended',
      desc: 'Move hand upward to scroll up; move downward to scroll down.',
      icon: ArrowUpDown,
      color: 'amber',
    },
  ];

  return (
    <div className="bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl p-4 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-slate-200 tracking-wider uppercase font-mono flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400" />
          <span>Active Gesture Guide & Visual Cues</span>
        </h3>
        <span className="text-[11px] text-slate-400 font-mono">Right Hand Only</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {guides.map((g) => {
          const isActive = currentGesture === g.id;
          const Icon = g.icon;

          return (
            <div
              key={g.id}
              className={`p-3 rounded-lg border transition-all duration-150 ${
                isActive
                  ? 'bg-slate-800 border-cyan-400 ring-1 ring-cyan-400/50 shadow-lg shadow-cyan-950/40 scale-[1.02]'
                  : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-2">
                  <div
                    className={`w-7 h-7 rounded-md flex items-center justify-center ${
                      isActive ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h4
                      className={`text-xs font-semibold ${
                        isActive ? 'text-cyan-300' : 'text-slate-200'
                      }`}
                    >
                      {g.title}
                    </h4>
                    <span className="text-[10px] text-slate-400 block font-mono">
                      {g.fingers}
                    </span>
                  </div>
                </div>
                {isActive && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse">
                    ACTIVE
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                {g.desc}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
