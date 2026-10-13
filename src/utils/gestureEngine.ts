import { Point3D, GestureType, ActionType, GestureResult, AppSettings } from '../types/gestures';

export function euclideanDistance(p1: Point3D, p2: Point3D): number {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

export function calculateAngleDeg(a: Point3D, b: Point3D, c: Point3D): number {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;

  const dot = v1x * v2x + v1y * v2y;
  const mag1 = Math.hypot(v1x, v1y);
  const mag2 = Math.hypot(v2x, v2y);

  if (mag1 * mag2 === 0) return 0;
  const cosTheta = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  return (Math.acos(cosTheta) * 180) / Math.PI;
}

export function getPalmScale(landmarks: Point3D[]): number {
  if (landmarks.length < 21) return 1.0;
  return Math.max(euclideanDistance(landmarks[0], landmarks[9]), 0.001);
}

export function isFingerExtended(
  landmarks: Point3D[],
  tipIdx: number,
  pipIdx: number,
  mcpIdx: number,
  wristIdx: number = 0,
  angleThreshold: number = 145
): boolean {
  if (landmarks.length < 21) return false;
  const tip = landmarks[tipIdx];
  const pip = landmarks[pipIdx];
  const mcp = landmarks[mcpIdx];
  const wrist = landmarks[wristIdx];

  const angle = calculateAngleDeg(mcp, pip, tip);
  const distWristTip = euclideanDistance(wrist, tip);
  const distWristPip = euclideanDistance(wrist, pip);
  const distMcpTip = euclideanDistance(mcp, tip);
  const distMcpPip = euclideanDistance(mcp, pip);

  const angleExt = angle >= angleThreshold;
  const distExt = distWristTip > distWristPip * 1.08 && distMcpTip > distMcpPip * 1.15;

  return angleExt || distExt;
}

export function isThumbExtended(landmarks: Point3D[], angleThreshold: number = 138): boolean {
  if (landmarks.length < 21) return false;
  const mcp = landmarks[2];
  const ip = landmarks[3];
  const tip = landmarks[4];
  const pinkyMcp = landmarks[17];

  const angle = calculateAngleDeg(mcp, ip, tip);
  const distToPinky = euclideanDistance(tip, pinkyMcp);
  const mcpToPinky = euclideanDistance(mcp, pinkyMcp);

  return angle >= angleThreshold && distToPinky >= mcpToPinky * 1.1;
}

/**
 * 1-Euro Filter 1D implementation for ultra-high accuracy and low jitter
 */
export class ClientOneEuroFilter1D {
  private xPrev: number | null = null;
  private dxPrev: number = 0;
  private tPrev: number | null = null;

  constructor(
    public minCutoff: number = 0.85,
    public beta: number = 0.012,
    public dCutoff: number = 1.0
  ) {}

  private alpha(dt: number, cutoff: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  reset() {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }

  filter(x: number, timestamp: number): number {
    if (this.tPrev === null || this.xPrev === null) {
      this.xPrev = x;
      this.dxPrev = 0;
      this.tPrev = timestamp;
      return x;
    }

    const dt = Math.max((timestamp - this.tPrev) / 1000, 0.001);

    // Filter derivative
    const dx = (x - this.xPrev) / dt;
    const aD = this.alpha(dt, this.dCutoff);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;

    // Dynamic cutoff frequency
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = this.alpha(dt, cutoff);
    const xHat = a * x + (1 - a) * this.xPrev;

    this.xPrev = xHat;
    this.dxPrev = dxHat;
    this.tPrev = timestamp;

    return xHat;
  }
}

/**
 * 2D One-Euro Filter with sub-pixel deadband
 */
export class ClientOneEuroSmoother {
  private fx: ClientOneEuroFilter1D;
  private fy: ClientOneEuroFilter1D;
  private lastEmittedX: number | null = null;
  private lastEmittedY: number | null = null;

  constructor(minCutoff: number = 0.85, beta: number = 0.012, private deadband: number = 0.0015) {
    this.fx = new ClientOneEuroFilter1D(minCutoff, beta);
    this.fy = new ClientOneEuroFilter1D(minCutoff, beta);
  }

  reset() {
    this.fx.reset();
    this.fy.reset();
    this.lastEmittedX = null;
    this.lastEmittedY = null;
  }

  update(rawX: number, rawY: number, timestamp: number): { x: number; y: number } {
    const fx = this.fx.filter(rawX, timestamp);
    const fy = this.fy.filter(rawY, timestamp);

    if (this.lastEmittedX === null || this.lastEmittedY === null) {
      this.lastEmittedX = fx;
      this.lastEmittedY = fy;
      return { x: fx, y: fy };
    }

    const dist = Math.hypot(fx - this.lastEmittedX, fy - this.lastEmittedY);
    if (dist < this.deadband) {
      return { x: this.lastEmittedX, y: this.lastEmittedY };
    }

    this.lastEmittedX = fx;
    this.lastEmittedY = fy;
    return { x: fx, y: fy };
  }
}

export class ClientAdaptiveSmoother {
  private smoothedX: number | null = null;
  private smoothedY: number | null = null;
  private prevX: number | null = null;
  private prevY: number | null = null;
  private prevTime: number | null = null;

  constructor(
    private baseAlpha: number = 0.65,
    private minAlpha: number = 0.20,
    private maxAlpha: number = 0.85
  ) {}

  reset() {
    this.smoothedX = null;
    this.smoothedY = null;
    this.prevX = null;
    this.prevY = null;
    this.prevTime = null;
  }

  update(rawX: number, rawY: number, timestamp: number, userAlpha?: number): { x: number; y: number } {
    const alphaBase = userAlpha !== undefined ? userAlpha : this.baseAlpha;
    if (this.smoothedX === null || this.smoothedY === null || this.prevTime === null) {
      this.smoothedX = rawX;
      this.smoothedY = rawY;
      this.prevX = rawX;
      this.prevY = rawY;
      this.prevTime = timestamp;
      return { x: rawX, y: rawY };
    }

    const dt = Math.max((timestamp - this.prevTime) / 1000, 0.001);
    const prevX = this.prevX ?? rawX;
    const prevY = this.prevY ?? rawY;
    const velocity = Math.hypot(rawX - prevX, rawY - prevY) / dt;

    const speedFactor = Math.min(velocity / 1.5, 1.0);
    const alpha = alphaBase * (1.0 - speedFactor * 0.6);

    const prevSmoothX = this.smoothedX ?? rawX;
    const prevSmoothY = this.smoothedY ?? rawY;

    this.smoothedX = alpha * prevSmoothX + (1.0 - alpha) * rawX;
    this.smoothedY = alpha * prevSmoothY + (1.0 - alpha) * rawY;

    this.prevX = rawX;
    this.prevY = rawY;
    this.prevTime = timestamp;

    return { x: this.smoothedX, y: this.smoothedY };
  }
}

export class ClientGestureEngine {
  private fiveFingerHoldStart: number | null = null;
  private closeWindowTriggered: boolean = false;

  private isPinching: boolean = false;
  private lastPinchDist: number | null = null;
  private lastZoomActionTime: number = 0;

  private lastScrollWristY: number | null = null;

  private lastDoubleClickTime: number = 0;
  private lastMinimizeTime: number = 0;

  private emaSmoother = new ClientAdaptiveSmoother();
  private oneEuroSmoother = new ClientOneEuroSmoother();

  // Jitter tracking window
  private recentPoints: Array<{ x: number; y: number }> = [];

  reset() {
    this.fiveFingerHoldStart = null;
    this.closeWindowTriggered = false;
    this.isPinching = false;
    this.lastPinchDist = null;
    this.lastZoomActionTime = 0;
    this.lastScrollWristY = null;
    this.lastDoubleClickTime = 0;
    this.lastMinimizeTime = 0;
    this.emaSmoother.reset();
    this.oneEuroSmoother.reset();
    this.recentPoints = [];
  }

  process(
    landmarks: Point3D[],
    handedness: string,
    settings: AppSettings,
    now: number = performance.now()
  ): {
    result: GestureResult;
    biometrics: {
      rollDeg: number;
      pitchDeg: number;
      indexAngleDeg: number;
      middleAngleDeg: number;
      pinchMm: number;
      jitterVariancePx: number;
      accuracyGrade: 'S+' | 'A' | 'B' | 'CALIBRATING';
    };
  } {
    const nowSec = now / 1000;

    const defaultBiometrics = {
      rollDeg: 0,
      pitchDeg: 0,
      indexAngleDeg: 180,
      middleAngleDeg: 180,
      pinchMm: 0,
      jitterVariancePx: 0.2,
      accuracyGrade: 'S+' as const,
    };

    if (!landmarks || landmarks.length < 21) {
      this.breakHold();
      return {
        result: {
          gesture: 'NONE',
          action: 'idle',
          confidence: 0,
          fingerStates: { thumb: false, index: false, middle: false, ring: false, pinky: false },
          closeHoldProgress: 0,
          closeSecondsRemaining: settings.closeHoldDuration,
          pinchDistance: 0,
          zoomDelta: 0,
          scrollDeltaY: 0,
        },
        biometrics: defaultBiometrics,
      };
    }

    // Handedness check: right hand required
    const isRight = handedness.toLowerCase() === 'right';
    if (!isRight) {
      this.breakHold();
      return {
        result: {
          gesture: 'NONE',
          action: 'idle',
          confidence: 0,
          fingerStates: { thumb: false, index: false, middle: false, ring: false, pinky: false },
          closeHoldProgress: 0,
          closeSecondsRemaining: settings.closeHoldDuration,
          pinchDistance: 0,
          zoomDelta: 0,
          scrollDeltaY: 0,
        },
        biometrics: defaultBiometrics,
      };
    }

    const palmScale = getPalmScale(landmarks);

    // Compute joint angles for biometrics & detection
    const indexPipAngle = calculateAngleDeg(landmarks[5], landmarks[6], landmarks[8]);
    const middlePipAngle = calculateAngleDeg(landmarks[9], landmarks[10], landmarks[12]);

    // Compute palm roll & pitch
    const dx = landmarks[17].x - landmarks[5].x;
    const dy = landmarks[17].y - landmarks[5].y;
    const rollDeg = Math.round((Math.atan2(dy, dx) * 180) / Math.PI);
    const spanW = euclideanDistance(landmarks[5], landmarks[17]);
    const spanH = euclideanDistance(landmarks[0], landmarks[9]);
    const pitchRatio = spanH / Math.max(spanW, 0.001);
    const pitchDeg = Math.round((Math.acos(Math.max(-1, Math.min(1, pitchRatio / 1.4))) * 180) / Math.PI);

    const thumbExt = isThumbExtended(landmarks);
    const indexExt = isFingerExtended(landmarks, 8, 6, 5);
    const middleExt = isFingerExtended(landmarks, 12, 10, 9);
    const ringExt = isFingerExtended(landmarks, 16, 14, 13);
    const pinkyExt = isFingerExtended(landmarks, 20, 18, 17);

    const fingerStates = {
      thumb: thumbExt,
      index: indexExt,
      middle: middleExt,
      ring: ringExt,
      pinky: pinkyExt,
    };

    const fourCount = (indexExt ? 1 : 0) + (middleExt ? 1 : 0) + (ringExt ? 1 : 0) + (pinkyExt ? 1 : 0);
    const totalCount = fourCount + (thumbExt ? 1 : 0);

    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const rawPinchDist = euclideanDistance(thumbTip, indexTip);
    const normPinchDist = rawPinchDist / palmScale;
    const pinchMm = Math.round(normPinchDist * 160); // approx mm scale based on average palm

    // Jitter calculation
    this.recentPoints.push({ x: indexTip.x, y: indexTip.y });
    if (this.recentPoints.length > 15) this.recentPoints.shift();

    let jitterVariancePx = 0.3;
    if (this.recentPoints.length >= 8) {
      const avgX = this.recentPoints.reduce((s, p) => s + p.x, 0) / this.recentPoints.length;
      const avgY = this.recentPoints.reduce((s, p) => s + p.y, 0) / this.recentPoints.length;
      const variance =
        this.recentPoints.reduce((s, p) => s + Math.hypot(p.x - avgX, p.y - avgY), 0) /
        this.recentPoints.length;
      jitterVariancePx = parseFloat((variance * 1920).toFixed(2));
    }

    const accuracyGrade: 'S+' | 'A' | 'B' | 'CALIBRATING' =
      jitterVariancePx < 1.0 ? 'S+' : jitterVariancePx < 2.5 ? 'A' : 'B';

    const biometrics = {
      rollDeg,
      pitchDeg,
      indexAngleDeg: Math.round(indexPipAngle),
      middleAngleDeg: Math.round(middlePipAngle),
      pinchMm,
      jitterVariancePx,
      accuracyGrade,
    };

    // Helper to smooth coordinate with chosen filter mode
    const smoothCoordinate = (rawPt: { x: number; y: number }) => {
      if (settings.highAccuracyMode) {
        return this.oneEuroSmoother.update(rawPt.x, rawPt.y, now);
      } else {
        return this.emaSmoother.update(rawPt.x, rawPt.y, now, settings.smoothingFactor);
      }
    };

    // 1. PINCH DETECTION (Thumb + Index Pinch)
    const pinchThresh = settings.pinchThreshold;
    const releaseThresh = pinchThresh * 1.5;
    const isPinchCandidate =
      normPinchDist < pinchThresh || (this.isPinching && normPinchDist < releaseThresh);
    const isNotFullHand = !(middleExt && ringExt && pinkyExt);

    if (isPinchCandidate && isNotFullHand) {
      this.isPinching = true;
      this.fiveFingerHoldStart = null;
      this.lastScrollWristY = null;

      let zoomAction: ActionType = 'idle';
      let delta = 0;

      if (this.lastPinchDist !== null) {
        delta = normPinchDist - this.lastPinchDist;
        const deadzone = 0.007;

        if (nowSec - this.lastZoomActionTime >= 0.12) {
          if (delta > deadzone) {
            zoomAction = 'zoom_in';
            this.lastZoomActionTime = nowSec;
          } else if (delta < -deadzone) {
            zoomAction = 'zoom_out';
            this.lastZoomActionTime = nowSec;
          }
        }
      }

      this.lastPinchDist = normPinchDist;
      const pinchCenter = {
        x: (thumbTip.x + indexTip.x) / 2,
        y: (thumbTip.y + indexTip.y) / 2,
      };

      const smoothed = smoothCoordinate(pinchCenter);

      return {
        result: {
          gesture: 'PINCH_ZOOM',
          action: zoomAction,
          confidence: 0.94,
          cursorPos: smoothed,
          fingerStates,
          closeHoldProgress: 0,
          closeSecondsRemaining: settings.closeHoldDuration,
          pinchDistance: normPinchDist,
          zoomDelta: delta,
          scrollDeltaY: 0,
        },
        biometrics,
      };
    } else {
      this.isPinching = false;
      this.lastPinchDist = null;
    }

    // 2. FIVE FINGERS OPEN: CLOSE WINDOW (Alt+F4 after 1s hold)
    if (totalCount === 5) {
      this.lastScrollWristY = null;

      if (this.fiveFingerHoldStart === null) {
        this.fiveFingerHoldStart = nowSec;
        this.closeWindowTriggered = false;
      }

      const elapsed = nowSec - this.fiveFingerHoldStart;
      const holdReq = settings.closeHoldDuration;
      const progress = Math.min(elapsed / holdReq, 1.0);
      const remaining = Math.max(0, holdReq - elapsed);

      let action: ActionType = 'holding_close';
      if (progress >= 1.0 && !this.closeWindowTriggered) {
        action = 'close_window';
        this.closeWindowTriggered = true;
      }

      return {
        result: {
          gesture: 'CLOSE_WINDOW',
          action,
          confidence: 0.96,
          fingerStates,
          closeHoldProgress: progress,
          closeSecondsRemaining: remaining,
          pinchDistance: normPinchDist,
          zoomDelta: 0,
          scrollDeltaY: 0,
        },
        biometrics,
      };
    } else {
      this.fiveFingerHoldStart = null;
      this.closeWindowTriggered = false;
    }

    // 3. FOUR FINGERS EXTENDED: SCROLL UP / DOWN
    if (fourCount === 4 && !thumbExt) {
      const wristY = landmarks[0].y;
      let scrollAction: ActionType = 'idle';
      let scrollDy = 0;

      if (this.lastScrollWristY !== null) {
        scrollDy = wristY - this.lastScrollWristY;
        const deadzone = 0.012;

        if (scrollDy < -deadzone) {
          scrollAction = 'scroll_up';
        } else if (scrollDy > deadzone) {
          scrollAction = 'scroll_down';
        }
      }

      this.lastScrollWristY = wristY;
      const palmPos = { x: landmarks[9].x, y: landmarks[9].y };
      const smoothed = smoothCoordinate(palmPos);

      return {
        result: {
          gesture: 'SCROLL',
          action: scrollAction,
          confidence: 0.92,
          cursorPos: smoothed,
          fingerStates,
          closeHoldProgress: 0,
          closeSecondsRemaining: settings.closeHoldDuration,
          pinchDistance: normPinchDist,
          zoomDelta: 0,
          scrollDeltaY: scrollDy,
        },
        biometrics,
      };
    } else {
      this.lastScrollWristY = null;
    }

    // 4. THREE FINGERS: MINIMIZE ACTIVE WINDOW
    if (indexExt && middleExt && ringExt && !pinkyExt && !thumbExt) {
      let action: ActionType = 'idle';
      if (nowSec - this.lastMinimizeTime >= 1.2) {
        action = 'minimize';
        this.lastMinimizeTime = nowSec;
      }

      const smoothed = smoothCoordinate({ x: landmarks[12].x, y: landmarks[12].y });
      return {
        result: {
          gesture: 'MINIMIZE',
          action,
          confidence: 0.95,
          cursorPos: smoothed,
          fingerStates,
          closeHoldProgress: 0,
          closeSecondsRemaining: settings.closeHoldDuration,
          pinchDistance: normPinchDist,
          zoomDelta: 0,
          scrollDeltaY: 0,
        },
        biometrics,
      };
    }

    // 5. TWO FINGERS: DOUBLE CLICK
    if (indexExt && middleExt && !ringExt && !pinkyExt && !thumbExt) {
      let action: ActionType = 'idle';
      if (nowSec - this.lastDoubleClickTime >= 0.65) {
        action = 'double_click';
        this.lastDoubleClickTime = nowSec;
      }

      const midPt = {
        x: (indexTip.x + landmarks[12].x) / 2,
        y: (indexTip.y + landmarks[12].y) / 2,
      };
      const smoothed = smoothCoordinate(midPt);

      return {
        result: {
          gesture: 'DOUBLE_CLICK',
          action,
          confidence: 0.95,
          cursorPos: smoothed,
          fingerStates,
          closeHoldProgress: 0,
          closeSecondsRemaining: settings.closeHoldDuration,
          pinchDistance: normPinchDist,
          zoomDelta: 0,
          scrollDeltaY: 0,
        },
        biometrics,
      };
    }

    // 6. ONE FINGER: CURSOR MOVE
    if (indexExt && !middleExt && !ringExt && !pinkyExt) {
      const smoothed = smoothCoordinate({ x: indexTip.x, y: indexTip.y });
      return {
        result: {
          gesture: 'CURSOR_MOVE',
          action: 'move_cursor',
          confidence: 0.98,
          cursorPos: smoothed,
          fingerStates,
          closeHoldProgress: 0,
          closeSecondsRemaining: settings.closeHoldDuration,
          pinchDistance: normPinchDist,
          zoomDelta: 0,
          scrollDeltaY: 0,
        },
        biometrics,
      };
    }

    this.breakHold();
    return {
      result: {
        gesture: 'NONE',
        action: 'idle',
        confidence: 0.5,
        fingerStates,
        closeHoldProgress: 0,
        closeSecondsRemaining: settings.closeHoldDuration,
        pinchDistance: normPinchDist,
        zoomDelta: 0,
        scrollDeltaY: 0,
      },
      biometrics,
    };
  }

  private breakHold() {
    this.fiveFingerHoldStart = null;
    this.closeWindowTriggered = false;
    this.isPinching = false;
    this.lastPinchDist = null;
    this.lastScrollWristY = null;
  }
}
