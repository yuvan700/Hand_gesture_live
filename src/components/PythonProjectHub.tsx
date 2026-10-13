import React, { useState, useEffect } from 'react';
import {
  Code2,
  Terminal,
  Play,
  CheckCircle,
  Copy,
  Check,
  FileCode,
  FolderTree,
  ExternalLink,
  Cpu,
  Layers,
} from 'lucide-react';

export const PythonProjectHub: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<string>('gesture_recognizer.py');
  const [fileContent, setFileContent] = useState<string>('');
  const [isLoadingFile, setIsLoadingFile] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  // Test Runner state
  const [isRunningTests, setIsRunningTests] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    totalTests: number;
    duration: string;
    output: string;
    timestamp: string;
  } | null>(null);

  const files = [
    { name: 'main.py', group: 'Entrypoint', desc: 'Worker thread & Tkinter runner' },
    { name: 'gesture_recognizer.py', group: 'Core Engine', desc: 'Geometric 6-gesture state machine' },
    { name: 'controller.py', group: 'OS Control', desc: 'PyAutoGUI actions & safety latch' },
    { name: 'hand_tracker.py', group: 'Computer Vision', desc: 'MediaPipe & mirrored camera tracking' },
    { name: 'geometry_utils.py', group: 'Math & Filters', desc: 'Vector angles & adaptive smoother' },
    { name: 'config.py', group: 'Settings', desc: 'Thresholds & hardware configs' },
    { name: 'ui.py', group: 'GUI', desc: 'Tkinter modern dark dashboard' },
    { name: 'tests/test_gesture_recognizer.py', group: 'Test Suite', desc: '15 Gesture unit tests' },
    { name: 'tests/test_coordinate_mapping.py', group: 'Test Suite', desc: 'Screen coordinate tests' },
    { name: 'tests/test_safety_system.py', group: 'Test Suite', desc: 'Safety lock & latch tests' },
    { name: 'requirements.txt', group: 'Dependencies', desc: 'Pinned Python packages' },
    { name: 'README.md', group: 'Docs', desc: 'Setup & VS Code launch guide' },
  ];

  // Fetch selected file content
  useEffect(() => {
    async function loadFile() {
      setIsLoadingFile(true);
      try {
        const res = await fetch(`/api/source-file?file=${encodeURIComponent(selectedFile)}`);
        const data = await res.json();
        if (data.content) {
          setFileContent(data.content);
        } else {
          setFileContent('# Error loading file');
        }
      } catch (err) {
        setFileContent('# Could not connect to backend server');
      } finally {
        setIsLoadingFile(false);
      }
    }
    loadFile();
  }, [selectedFile]);

  // Execute unit tests via backend
  const handleRunTests = async () => {
    setIsRunningTests(true);
    try {
      const res = await fetch('/api/run-tests', { method: 'POST' });
      const data = await res.json();
      setTestResult(data);
    } catch (err) {
      setTestResult({
        success: false,
        totalTests: 0,
        duration: '0',
        output: 'Failed to communicate with test backend.',
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsRunningTests(false);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(fileContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyCommand = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/40 flex items-center justify-center">
            <Code2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
              <span>Python Computer Vision Architecture & Test Hub</span>
            </h3>
            <p className="text-[11px] text-slate-400">
              OpenCV + MediaPipe + PyAutoGUI + Tkinter Production Modules
            </p>
          </div>
        </div>

        {/* Run Tests Button */}
        <button
          onClick={handleRunTests}
          disabled={isRunningTests}
          className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center space-x-2 transition-all cursor-pointer shadow-lg ${
            isRunningTests
              ? 'bg-purple-900/60 text-purple-300 border border-purple-700 animate-pulse'
              : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-950/40'
          }`}
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>{isRunningTests ? 'Executing Tests...' : 'Run Python Unit Tests'}</span>
        </button>
      </div>

      {/* Test Output Banner if executed */}
      {testResult && (
        <div
          className={`p-3 rounded-lg border text-xs font-mono transition-all ${
            testResult.success
              ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-200'
              : 'bg-red-950/40 border-red-500/60 text-red-200'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5 font-sans">
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span className="font-bold text-xs">
                {testResult.success
                  ? `ALL 15 TESTS PASSED SUCCESSFULLY (in ${testResult.duration}s)`
                  : 'Tests Reported Failures'}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              {new Date(testResult.timestamp).toLocaleTimeString()}
            </span>
          </div>
          <pre className="p-2 rounded bg-slate-950/80 text-[10px] overflow-x-auto text-slate-300 max-h-36 leading-tight whitespace-pre-wrap">
            {testResult.output}
          </pre>
        </div>
      )}

      {/* VS Code Quick Command Strip */}
      <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center space-x-2">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <span className="text-slate-400">Launch in VS Code:</span>
          <code className="bg-slate-900 px-2 py-1 rounded text-cyan-300 font-mono text-[11px] border border-cyan-900/50">
            python3 main.py
          </code>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => copyCommand('python3 main.py')}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-mono flex items-center space-x-1 border border-slate-700 cursor-pointer"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>Copy Command</span>
          </button>
          <button
            onClick={() => copyCommand('python3 -m unittest discover -s tests -v')}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-mono flex items-center space-x-1 border border-slate-700 cursor-pointer"
          >
            <Copy className="w-3 h-3" />
            <span>Copy Test Command</span>
          </button>
        </div>
      </div>

      {/* Dual Column: File Explorer on left, Code Viewer on right */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 min-h-[380px]">
        {/* Left: File List */}
        <div className="bg-slate-950/80 rounded-lg border border-slate-800 p-2 space-y-1">
          <div className="px-2 py-1 text-[10px] uppercase font-mono font-bold text-slate-500 tracking-wider">
            Workspace Files
          </div>
          {files.map((f) => (
            <button
              key={f.name}
              onClick={() => setSelectedFile(f.name)}
              className={`w-full text-left px-2.5 py-2 rounded text-xs flex flex-col transition-all cursor-pointer ${
                selectedFile === f.name
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center space-x-2">
                <FileCode className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="font-mono truncate">{f.name}</span>
              </div>
              <span className="text-[10px] text-slate-500 pl-5.5">{f.desc}</span>
            </button>
          ))}
        </div>

        {/* Right: Code Viewer */}
        <div className="md:col-span-3 bg-slate-950 rounded-lg border border-slate-800 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="h-9 px-3 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2 font-mono text-slate-300">
              <span className="text-cyan-400 font-bold">{selectedFile}</span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-500 text-[11px]">
                {fileContent.split('\n').length} lines
              </span>
            </div>
            <button
              onClick={handleCopyCode}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Copied' : 'Copy Code'}</span>
            </button>
          </div>

          {/* Code Body */}
          <div className="flex-1 p-3 overflow-auto max-h-[420px] font-mono text-[11px] leading-relaxed text-slate-300 bg-[#070b14]">
            {isLoadingFile ? (
              <div className="h-40 flex items-center justify-center text-slate-500">
                Loading source code...
              </div>
            ) : (
              <pre className="whitespace-pre">{fileContent}</pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
