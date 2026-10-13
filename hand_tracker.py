"""
Hand Tracker Module
Integrates OpenCV and MediaPipe Hands for real-time computer vision tracking.
Features:
- Mirrored camera frame handling
- Explicit Right-Hand isolation
- Honest CPU/GPU hardware capability detection
- Smooth landmark extraction and conversion to Point3D objects
- Real-time FPS and inference latency benchmarking
- Futuristic cyber HUD visualization with 5-finger close countdown
"""

import logging
import math
import os
import platform
import time
from typing import Dict, List, Optional, Tuple, Any

from config import AppConfig, DEFAULT_CONFIG
from geometry_utils import Point3D, THUMB_TIP, INDEX_TIP

logger = logging.getLogger(__name__)

# Graceful import of OpenCV and MediaPipe
try:
    import cv2
    OPENCV_AVAILABLE = True
except ImportError:
    cv2 = None
    OPENCV_AVAILABLE = False

try:
    import mediapipe as mp
    MEDIAPIPE_AVAILABLE = True
except ImportError:
    mp = None
    MEDIAPIPE_AVAILABLE = False


def detect_hardware_capabilities() -> Dict[str, Any]:
    """
    Honest hardware capability detector.
    Reports real CPU architecture, cores, and whether GPU acceleration (OpenCL/CUDA) is active.
    """
    cpu_count = os.cpu_count() or 1
    system_arch = platform.machine()
    
    gpu_accelerated = False
    acceleration_type = "CPU Only (Optimized Multithreaded)"
    
    if OPENCV_AVAILABLE and cv2 is not None:
        try:
            # Check for OpenCV OpenCL acceleration
            if cv2.ocl.haveOpenCL():
                cv2.ocl.setUseOpenCL(True)
                gpu_accelerated = True
                device = cv2.ocl.Device.getDefault()
                acceleration_type = f"GPU OpenCL: {device.name()}"
            elif cv2.cuda.getCudaEnabledDeviceCount() > 0:
                gpu_accelerated = True
                acceleration_type = f"NVIDIA CUDA ({cv2.cuda.getCudaEnabledDeviceCount()} device)"
        except Exception:
            pass

    return {
        "gpu_accelerated": gpu_accelerated,
        "acceleration_type": acceleration_type,
        "cpu_cores": cpu_count,
        "system_arch": system_arch,
        "os_name": platform.system(),
    }


class HandTracker:
    """
    Manages camera video capture, MediaPipe Hands pipeline, and HUD rendering.
    """

    def __init__(self, config: Optional[AppConfig] = None):
        self.config = config or DEFAULT_CONFIG
        self.cap = None
        self.hands_detector = None
        
        # Benchmark telemetry
        self.fps: float = 0.0
        self.inference_latency_ms: float = 0.0
        self._prev_frame_time: float = time.time()
        self._frame_count: int = 0
        self._fps_accumulator: float = 0.0

        # Hardware specs
        self.hardware_info = detect_hardware_capabilities()

        # Initialize MediaPipe if installed
        if MEDIAPIPE_AVAILABLE and mp is not None:
            self.mp_hands = mp.solutions.hands
            self.hands_detector = self.mp_hands.Hands(
                static_image_mode=False,
                max_num_hands=self.config.camera.max_num_hands,
                min_detection_confidence=self.config.camera.min_detection_confidence,
                min_tracking_confidence=self.config.camera.min_tracking_confidence,
                model_complexity=1
            )
            self.mp_drawing = mp.solutions.drawing_utils
            self.mp_drawing_styles = mp.solutions.drawing_styles

    def open_camera(self, camera_index: Optional[int] = None) -> bool:
        """Opens camera video capture device."""
        if not OPENCV_AVAILABLE or cv2 is None:
            logger.warning("OpenCV not installed. Camera cannot be opened.")
            return False

        idx = camera_index if camera_index is not None else self.config.camera.camera_index
        self.cap = cv2.VideoCapture(idx)
        
        if not self.cap.isOpened():
            logger.error("Failed to open camera index %d", idx)
            return False

        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.config.camera.frame_width)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.config.camera.frame_height)
        self.cap.set(cv2.CAP_PROP_FPS, self.config.camera.target_fps)
        return True

    def close_camera(self):
        """Releases camera and detector resources cleanly."""
        if self.cap is not None:
            self.cap.release()
            self.cap = None
        if self.hands_detector is not None:
            try:
                self.hands_detector.close()
            except Exception:
                pass
            self.hands_detector = None

    def read_and_track(self) -> Tuple[bool, Any, List[Point3D], str]:
        """
        Reads camera frame, mirrors it, and runs MediaPipe hand tracking.
        Returns:
            success: bool
            frame: OpenCV BGR image (or None)
            landmarks: List[Point3D]
            handedness: 'Right' or 'Left'
        """
        if not OPENCV_AVAILABLE or self.cap is None or not self.cap.isOpened():
            return False, None, [], "None"

        ret, frame = self.cap.read()
        if not ret or frame is None:
            return False, None, [], "None"

        # Mirror frame horizontally for natural intuitive interaction
        if self.config.camera.flip_horizontal:
            frame = cv2.flip(frame, 1)

        t_start = time.perf_counter()
        
        # Color conversion BGR -> RGB for MediaPipe
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        rgb_frame.flags.writeable = False

        landmarks_list: List[Point3D] = []
        detected_handedness = "None"

        if self.hands_detector is not None:
            results = self.hands_detector.process(rgb_frame)
            rgb_frame.flags.writeable = True

            t_end = time.perf_counter()
            self.inference_latency_ms = (t_end - t_start) * 1000.0

            if results.multi_hand_landmarks and results.multi_handedness:
                for idx, hand_handedness in enumerate(results.multi_handedness):
                    label = hand_handedness.classification[0].label
                    # Because frame is flipped horizontally, MediaPipe's reported 'Left' corresponds to the physical right hand
                    # We correctly compensate for this mirror orientation
                    corrected_label = "Right" if label == "Left" else "Left"

                    if corrected_label == "Right":
                        detected_handedness = "Right"
                        hand_lms = results.multi_hand_landmarks[idx]
                        landmarks_list = [
                            Point3D(lm.x, lm.y, lm.z) for lm in hand_lms.landmark
                        ]
                        break

        # Calculate FPS
        now = time.time()
        dt = now - self._prev_frame_time
        self._prev_frame_time = now
        if dt > 0:
            current_fps = 1.0 / dt
            self.fps = (0.9 * self.fps) + (0.1 * current_fps) if self.fps > 0 else current_fps

        return True, frame, landmarks_list, detected_handedness

    def draw_hud(
        self,
        frame: Any,
        landmarks: List[Point3D],
        gesture_name: str,
        action_name: str,
        close_countdown_progress: float = 0.0,
        close_seconds_remaining: float = 1.0,
        pinch_distance: float = 0.0,
        is_pinching: bool = False,
    ):
        """
        Renders a futuristic cyber dashboard HUD on the OpenCV camera frame.
        """
        if not OPENCV_AVAILABLE or frame is None:
            return

        h, w, _ = frame.shape

        # Draw active interaction bounding box
        mx = int(self.config.cursor.margin_x * w)
        my = int(self.config.cursor.margin_y * h)
        cv2.rectangle(frame, (mx, my), (w - mx, h - my), (140, 70, 20), 1)

        # Draw skeleton connections and joints if landmarks are present
        if len(landmarks) >= 21:
            connections = [
                (0, 1), (1, 2), (2, 3), (3, 4),        # Thumb
                (0, 5), (5, 6), (6, 7), (7, 8),        # Index
                (0, 9), (9, 10), (10, 11), (11, 12),   # Middle
                (0, 13), (13, 14), (14, 15), (15, 16), # Ring
                (0, 17), (17, 18), (18, 19), (19, 20), # Pinky
                (5, 9), (9, 13), (13, 17)              # Palm base
            ]

            # Neon Cyan/Purple lines
            for start_idx, end_idx in connections:
                pt1 = (int(landmarks[start_idx].x * w), int(landmarks[start_idx].y * h))
                pt2 = (int(landmarks[end_idx].x * w), int(landmarks[end_idx].y * h))
                cv2.line(frame, pt1, pt2, (255, 180, 50), 2, cv2.LINE_AA)

            # Glowing joints
            for i, lm in enumerate(landmarks):
                px, py = int(lm.x * w), int(lm.y * h)
                color = (0, 255, 255) if i in [4, 8, 12, 16, 20] else (255, 120, 200)
                radius = 5 if i in [4, 8, 12, 16, 20] else 3
                cv2.circle(frame, (px, py), radius, color, -1, cv2.LINE_AA)

            # Pinch visual line
            if is_pinching:
                p_thumb = (int(landmarks[THUMB_TIP].x * w), int(landmarks[THUMB_TIP].y * h))
                p_index = (int(landmarks[INDEX_TIP].x * w), int(landmarks[INDEX_TIP].y * h))
                cv2.line(frame, p_thumb, p_index, (0, 255, 0), 3, cv2.LINE_AA)

            # 5-Finger Close Window Circular Countdown
            if close_countdown_progress > 0.0:
                center_x = int(landmarks[0].x * w)
                center_y = int(landmarks[0].y * h) - 60
                radius = 35
                
                # Background circle
                cv2.circle(frame, (center_x, center_y), radius, (40, 40, 40), 4, cv2.LINE_AA)
                # Progress arc
                angle = int(close_countdown_progress * 360)
                cv2.ellipse(frame, (center_x, center_y), (radius, radius), -90, 0, angle, (0, 50, 255), 4, cv2.LINE_AA)
                
                text = f"{close_seconds_remaining:.1f}s"
                cv2.putText(frame, text, (center_x - 16, center_y + 6), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 2)
                cv2.putText(frame, "HOLD TO CLOSE", (center_x - 55, center_y - 42), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 100, 255), 1)

        # Telemetry HUD Bar (Top)
        cv2.rectangle(frame, (0, 0), (w, 42), (18, 18, 24), -1)
        cv2.putText(frame, f"FPS: {self.fps:.1f}", (14, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 200), 2)
        cv2.putText(frame, f"LATENCY: {self.inference_latency_ms:.1f}ms", (130, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (100, 200, 255), 2)
        cv2.putText(frame, f"GESTURE: {gesture_name}", (310, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 200, 50), 2)
        cv2.putText(frame, f"ACTION: {action_name}", (580, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (200, 120, 255), 2)
