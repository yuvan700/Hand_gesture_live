export interface Point3D {
  x: number;
  y: number;
  z?: number;
}

export type GestureType =
  | 'NONE'
  | 'CURSOR_MOVE'
  | 'DOUBLE_CLICK'
  | 'MINIMIZE'
  | 'CLOSE_WINDOW'
  | 'PINCH_ZOOM'
  | 'SCROLL';

export type ActionType =
  | 'idle'
  | 'move_cursor'
  | 'double_click'
  | 'minimize'
  | 'close_window'
  | 'holding_close'
  | 'zoom_in'
  | 'zoom_out'
  | 'scroll_up'
  | 'scroll_down';

export interface GestureResult {
  gesture: GestureType;
  action: ActionType;
  confidence: number;
  cursorPos?: { x: number; y: number };
  fingerStates: {
    thumb: boolean;
    index: boolean;
    middle: boolean;
    ring: boolean;
    pinky: boolean;
  };
  closeHoldProgress: number; // 0.0 to 1.0
  closeSecondsRemaining: number;
  pinchDistance: number;
  zoomDelta: number;
  scrollDeltaY: number;
}

export interface SystemTelemetry {
  fps: number;
  latencyMs: number;
  cameraActive: boolean;
  handDetected: boolean;
  handedness: 'Right' | 'Left' | 'None';
  hardwareMode: string;
  isGpuAccelerated: boolean;
  cpuCores: number;
  platform: string;
  // High Accuracy Telemetry
  jitterVariancePx: number;
  accuracyGrade: 'S+' | 'A' | 'B' | 'CALIBRATING';
  rollDeg: number;
  pitchDeg: number;
  pinchMm: number;
  indexAngleDeg: number;
  middleAngleDeg: number;
}

export interface ActivityEvent {
  id: string;
  timestamp: string;
  gesture: GestureType;
  action: string;
  details: string;
  type: 'action' | 'warning' | 'info' | 'success';
}

export interface AppSettings {
  smoothingFactor: number;
  sensitivity: number;
  marginBox: number;
  scrollSpeed: number;
  pinchThreshold: number;
  closeHoldDuration: number;
  mirrorCamera: boolean;
  // High Accuracy settings
  highAccuracyMode: boolean; // Enables One-Euro Filter & Sub-Pixel Deadband
  oneEuroMinCutoff: number;
  oneEuroBeta: number;
  subPixelDeadband: number;
  audioFeedback: boolean;
}

export interface DesktopWindow {
  id: string;
  title: string;
  icon: string;
  isOpen: boolean;
  isMinimized: boolean;
  zIndex: number;
  type: 'files' | 'terminal' | 'gallery' | 'monitor' | 'browser' | 'calibration';
  content?: any;
}

