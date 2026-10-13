"""
Hand Gesture Computer Control System - Main Application Entrypoint
Coordinates:
- Camera capture & MediaPipe hand tracking (background worker thread)
- Geometric gesture recognition
- OS Controller via PyAutoGUI
- Modern Tkinter dashboard UI (main thread)
"""

import argparse
import logging
import os
import signal
import sys
import threading
import time

from config import AppConfig, DEFAULT_CONFIG
from geometry_utils import Point3D
from gesture_recognizer import GestureRecognizer, ActionTrigger, GestureType
from controller import ComputerController
from hand_tracker import HandTracker, OPENCV_AVAILABLE, MEDIAPIPE_AVAILABLE
from ui import GestureDashboardUI, TKINTER_AVAILABLE

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("VisionGrip")

try:
    from PIL import Image
except ImportError:
    Image = None

try:
    import cv2
except ImportError:
    cv2 = None


class HandGestureSystem:
    """
    Master application orchestrator coordinating camera acquisition,
    gesture processing, OS action execution, and UI rendering.
    """

    def __init__(self, config: AppConfig, headless: bool = False):
        self.config = config
        self.headless = headless
        
        self.tracker = HandTracker(self.config)
        self.recognizer = GestureRecognizer(self.config)
        self.controller = ComputerController(self.config)
        
        self.ui = None
        if not headless and TKINTER_AVAILABLE:
            self.ui = GestureDashboardUI(
                config=self.config,
                on_start_cb=self.controller.start_control,
                on_stop_cb=self.controller.stop_control,
                on_emergency_stop_cb=self.controller.trigger_emergency_stop,
            )

        self.is_running = False
        self.worker_thread = None

    def start(self):
        """Initializes components and launches worker thread + UI."""
        logger.info("Initializing Hand Gesture Computer Control System...")
        logger.info("Hardware Detection: %s", self.tracker.hardware_info)

        self.is_running = True
        
        # Start background CV worker thread
        self.worker_thread = threading.Thread(target=self._worker_loop, daemon=True)
        self.worker_thread.start()

        if self.ui is not None:
            self.ui.initialize_window()
            self.ui.run()
        else:
            logger.info("Running in CLI headless mode. Press Ctrl+C to terminate.")
            try:
                while self.is_running:
                    time.sleep(0.5)
            except KeyboardInterrupt:
                self.stop()

    def stop(self):
        """Stops application and cleans up camera/threads."""
        logger.info("Stopping system...")
        self.is_running = False
        self.controller.stop_control()
        if self.tracker:
            self.tracker.close_camera()
        if self.ui and self.ui.root:
            self.ui.on_close()

    def _worker_loop(self):
        """
        Background worker thread executing camera capture and inference.
        Never blocks the Tkinter GUI main thread.
        """
        logger.info("Background Vision Worker started.")
        
        if OPENCV_AVAILABLE:
            opened = self.tracker.open_camera(self.config.camera.camera_index)
            if not opened:
                logger.warning("Could not open webcam index %d. Retrying index 0 or running simulation.", self.config.camera.camera_index)
        
        while self.is_running:
            success, frame, landmarks, handedness = self.tracker.read_and_track()
            
            if not success or frame is None:
                time.sleep(0.033)  # ~30 FPS throttle when no frame
                continue

            # Classify gestures
            res = self.recognizer.process(landmarks, handedness=handedness)

            # Execute controller actions if enabled
            action_desc = "IDLE"
            if res.action == ActionTrigger.MOVE_CURSOR and res.cursor_pos:
                cx, cy = res.cursor_pos
                self.controller.move_cursor(cx, cy)
                action_desc = "Moving Cursor"

            elif res.action == ActionTrigger.EXECUTE_DOUBLE_CLICK:
                self.controller.double_click()
                action_desc = "Double Click (Open)"

            elif res.action == ActionTrigger.EXECUTE_MINIMIZE:
                self.controller.minimize_active_window()
                action_desc = "Minimized Active Window"

            elif res.action == ActionTrigger.EXECUTE_CLOSE_WINDOW:
                self.controller.close_active_window()
                action_desc = "Closed Window (Alt+F4)"

            elif res.action == ActionTrigger.HOLDING_CLOSE:
                action_desc = f"Holding Close ({res.close_seconds_remaining:.1f}s)"

            elif res.action == ActionTrigger.EXECUTE_ZOOM_IN:
                self.controller.zoom_in()
                action_desc = "Zoom In (+)"

            elif res.action == ActionTrigger.EXECUTE_ZOOM_OUT:
                self.controller.zoom_out()
                action_desc = "Zoom Out (-)"

            elif res.action == ActionTrigger.EXECUTE_SCROLL_UP:
                self.controller.scroll(-0.1)
                action_desc = "Scrolling Up"

            elif res.action == ActionTrigger.EXECUTE_SCROLL_DOWN:
                self.controller.scroll(0.1)
                action_desc = "Scrolling Down"

            # Draw HUD on video frame
            self.tracker.draw_hud(
                frame=frame,
                landmarks=landmarks,
                gesture_name=res.gesture.value,
                action_name=action_desc,
                close_countdown_progress=res.close_hold_progress,
                close_seconds_remaining=res.close_seconds_remaining,
                pinch_distance=res.pinch_distance,
                is_pinching=(res.gesture == GestureType.PINCH_ZOOM)
            )

            # Push telemetry & frame to Tkinter UI queue
            if self.ui is not None:
                ui_data = {
                    "fps": self.tracker.fps,
                    "latency": self.tracker.inference_latency_ms,
                    "gesture": res.gesture.value,
                    "action": action_desc,
                }
                
                # Convert frame for Tkinter Canvas (BGR -> RGB -> PIL Image)
                if Image is not None and cv2 is not None:
                    rgb_hud = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    ui_data["image"] = Image.fromarray(rgb_hud)

                self.ui.push_update(ui_data)

        logger.info("Background Vision Worker terminated.")


def parse_arguments():
    parser = argparse.ArgumentParser(description="Hand Gesture Computer Control System")
    parser.add_argument("--camera", type=int, default=0, help="Webcam device index (default: 0)")
    parser.add_argument("--sensitivity", type=float, default=1.25, help="Cursor sensitivity multiplier")
    parser.add_argument("--smoothing", type=float, default=0.65, help="Smoothing factor (0.0 - 0.95)")
    parser.add_argument("--no-gui", action="store_true", help="Run in headless terminal mode without Tkinter")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_arguments()
    cfg = DEFAULT_CONFIG
    cfg.camera.camera_index = args.camera
    cfg.cursor.sensitivity_x = args.sensitivity
    cfg.cursor.sensitivity_y = args.sensitivity
    cfg.cursor.smoothing_factor = args.smoothing

    app = HandGestureSystem(cfg, headless=args.no_gui)

    def sig_handler(sig, frame):
        logger.info("Signal caught, shutting down...")
        app.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, sig_handler)
    app.start()
