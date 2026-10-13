import React from 'react';
import { Activity, Trash2, Clock } from 'lucide-react';
import { ActivityEvent } from '../types/gestures';

interface ActivityLogProps {
  events: ActivityEvent[];
  onClear: () => void;
}

export const ActivityLog: React.FC<ActivityLogProps> = ({ events, onClear }) => {
  return (
    <div className="bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col h-full min-h-[220px]">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-2">
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 text-purple-400" />
          <h3 className="text-xs font-bold text-slate-200 uppercase font-mono tracking-wider">
            Activity History Log
          </h3>
          <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">
            {events.length}
          </span>
        </div>
        {events.length > 0 && (
          <button
            onClick={onClear}
            className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center space-x-1 cursor-pointer transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear</span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 max-h-[260px]">
        {events.length === 0 ? (
          <div className="h-28 flex flex-col items-center justify-center text-slate-500 text-xs">
            <Clock className="w-5 h-5 mb-1.5 opacity-50" />
            <span>No actions logged yet. Start control to track gestures.</span>
          </div>
        ) : (
          events.map((ev) => (
            <div
              key={ev.id}
              className="p-2 rounded bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-xs hover:border-slate-700 transition-colors"
            >
              <div className="flex items-center space-x-2">
                <span className="font-mono text-[10px] text-slate-500">{ev.timestamp}</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${
                    ev.type === 'action'
                      ? 'bg-blue-500/20 text-blue-300'
                      : ev.type === 'success'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : ev.type === 'warning'
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-purple-500/20 text-purple-300'
                  }`}
                >
                  {ev.action}
                </span>
                <span className="text-slate-300 text-[11px] truncate max-w-[200px] sm:max-w-xs">
                  {ev.details}
                </span>
              </div>
              <span className="text-[10px] font-mono text-cyan-400/80">{ev.gesture}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
