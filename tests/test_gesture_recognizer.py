"""
Unit Tests for Gesture Recognition State Machine and Geometry
Verifies all 6 gesture classifications, countdown timers, pinch deltas, and cooldowns.
"""

import time
import unittest
from typing import List

from config import AppConfig
from geometry_utils import Point3D
from gesture_recognizer import GestureRecognizer, GestureType, ActionTrigger


def make_synthetic_hand(
    thumb: bool = False,
    index: bool = False,
    middle: bool = False,
    ring: bool = False,
    pinky: bool = False,
    wrist_y: float = 0.8,
) -> List[Point3D]:
    """
    Creates a valid 21-point MediaPipe hand landmark representation
    with controlled finger extension states.
    """
    lms = [Point3D(0.5, wrist_y, 0.0) for _ in range(21)]
    lms[0] = Point3D(0.5, wrist_y, 0.0)  # Wrist

    # Base MCPs
    lms[1] = Point3D(0.42, wrist_y - 0.10, 0.0)  # Thumb CMC
    lms[2] = Point3D(0.38, wrist_y - 0.20, 0.0)  # Thumb MCP
    lms[5] = Point3D(0.46, wrist_y - 0.30, 0.0)  # Index MCP
    lms[9] = Point3D(0.50, wrist_y - 0.32, 0.0)  # Middle MCP
    lms[13] = Point3D(0.54, wrist_y - 0.30, 0.0) # Ring MCP
    lms[17] = Point3D(0.58, wrist_y - 0.26, 0.0) # Pinky MCP

    # Helper to position joints for folded vs extended
    def set_finger(tip_idx, pip_idx, dip_idx, mcp_idx, is_ext, base_x):
        mcp = lms[mcp_idx]
        if is_ext:
            # Extended straight up
            lms[pip_idx] = Point3D(base_x, mcp.y - 0.14, 0.0)
            lms[dip_idx] = Point3D(base_x, mcp.y - 0.24, 0.0)
            lms[tip_idx] = Point3D(base_x, mcp.y - 0.34, 0.0)
        else:
            # Folded into palm
            lms[pip_idx] = Point3D(base_x, mcp.y - 0.08, 0.0)
            lms[dip_idx] = Point3D(base_x, mcp.y - 0.02, 0.0)
            lms[tip_idx] = Point3D(base_x, mcp.y + 0.04, 0.0)

    # Thumb
    if thumb:
        lms[3] = Point3D(0.30, wrist_y - 0.28, 0.0)  # IP
        lms[4] = Point3D(0.22, wrist_y - 0.35, 0.0)  # Tip (extended outward)
    else:
        lms[3] = Point3D(0.40, wrist_y - 0.22, 0.0)  # IP
        lms[4] = Point3D(0.44, wrist_y - 0.24, 0.0)  # Tip (tucked against palm)

    set_finger(8, 6, 7, 5, index, 0.46)
    set_finger(12, 10, 11, 9, middle, 0.50)
    set_finger(16, 14, 15, 13, ring, 0.54)
    set_finger(20, 18, 19, 17, pinky, 0.58)

    return lms


class TestGestureRecognizer(unittest.TestCase):

    def setUp(self):
        self.config = AppConfig()
        self.recognizer = GestureRecognizer(self.config)

    def test_one_finger_cursor_move(self):
        """Index finger only extended should trigger CURSOR_MOVE."""
        lms = make_synthetic_hand(thumb=False, index=True, middle=False, ring=False, pinky=False)
        res = self.recognizer.process(lms, handedness="Right", current_time=100.0)
        
        self.assertEqual(res.gesture, GestureType.CURSOR_MOVE)
        self.assertEqual(res.action, ActionTrigger.MOVE_CURSOR)
        self.assertIsNotNone(res.cursor_pos)

    def test_two_fingers_double_click(self):
        """Index and Middle extended should trigger DOUBLE_CLICK."""
        lms = make_synthetic_hand(thumb=False, index=True, middle=True, ring=False, pinky=False)
        res = self.recognizer.process(lms, handedness="Right", current_time=100.0)
        
        self.assertEqual(res.gesture, GestureType.DOUBLE_CLICK)
        self.assertEqual(res.action, ActionTrigger.EXECUTE_DOUBLE_CLICK)

    def test_double_click_cooldown(self):
        """Rapid sequential double-click frames should be throttled by cooldown."""
        lms = make_synthetic_hand(thumb=False, index=True, middle=True, ring=False, pinky=False)
        res1 = self.recognizer.process(lms, handedness="Right", current_time=100.0)
        self.assertEqual(res1.action, ActionTrigger.EXECUTE_DOUBLE_CLICK)

        # Immediately 50ms later (cooldown is 0.65s)
        res2 = self.recognizer.process(lms, handedness="Right", current_time=100.05)
        self.assertEqual(res2.action, ActionTrigger.NONE)

        # After cooldown expired (0.7s later)
        res3 = self.recognizer.process(lms, handedness="Right", current_time=100.75)
        self.assertEqual(res3.action, ActionTrigger.EXECUTE_DOUBLE_CLICK)

    def test_three_fingers_minimize(self):
        """Index + Middle + Ring extended should trigger MINIMIZE."""
        lms = make_synthetic_hand(thumb=False, index=True, middle=True, ring=True, pinky=False)
        res = self.recognizer.process(lms, handedness="Right", current_time=100.0)
        
        self.assertEqual(res.gesture, GestureType.MINIMIZE)
        self.assertEqual(res.action, ActionTrigger.EXECUTE_MINIMIZE)

    def test_five_fingers_close_window_with_one_second_countdown(self):
        """5 fingers open must hold for 1.0s before triggering Alt+F4 Close Window."""
        lms = make_synthetic_hand(thumb=True, index=True, middle=True, ring=True, pinky=True)
        
        # Frame 1: start holding
        res1 = self.recognizer.process(lms, handedness="Right", current_time=200.0)
        self.assertEqual(res1.gesture, GestureType.CLOSE_WINDOW)
        self.assertEqual(res1.action, ActionTrigger.HOLDING_CLOSE)
        self.assertAlmostEqual(res1.close_hold_progress, 0.0, places=2)
        self.assertAlmostEqual(res1.close_seconds_remaining, 1.0, places=2)

        # Frame 2: 0.5s into hold
        res2 = self.recognizer.process(lms, handedness="Right", current_time=200.5)
        self.assertEqual(res2.action, ActionTrigger.HOLDING_CLOSE)
        self.assertAlmostEqual(res2.close_hold_progress, 0.5, places=2)
        self.assertAlmostEqual(res2.close_seconds_remaining, 0.5, places=2)

        # Frame 3: 1.05s into hold -> Triggers EXECUTE_CLOSE_WINDOW!
        res3 = self.recognizer.process(lms, handedness="Right", current_time=201.05)
        self.assertEqual(res3.action, ActionTrigger.EXECUTE_CLOSE_WINDOW)
        self.assertAlmostEqual(res3.close_hold_progress, 1.0, places=2)
        self.assertAlmostEqual(res3.close_seconds_remaining, 0.0, places=2)

    def test_five_finger_hold_cancellation_when_hand_curled(self):
        """If 5-finger posture drops halfway through, hold countdown must immediately reset."""
        lms_5 = make_synthetic_hand(thumb=True, index=True, middle=True, ring=True, pinky=True)
        lms_1 = make_synthetic_hand(thumb=False, index=True, middle=False, ring=False, pinky=False)

        # Hold 0.6s
        self.recognizer.process(lms_5, handedness="Right", current_time=300.0)
        res = self.recognizer.process(lms_5, handedness="Right", current_time=300.6)
        self.assertAlmostEqual(res.close_hold_progress, 0.6, places=2)

        # Drop to 1 finger
        res_dropped = self.recognizer.process(lms_1, handedness="Right", current_time=300.7)
        self.assertEqual(res_dropped.gesture, GestureType.CURSOR_MOVE)

        # Resume 5 fingers: must restart from 0s, NOT continue!
        res_resumed = self.recognizer.process(lms_5, handedness="Right", current_time=300.8)
        self.assertEqual(res_resumed.action, ActionTrigger.HOLDING_CLOSE)
        self.assertAlmostEqual(res_resumed.close_hold_progress, 0.0, places=2)

    def test_pinch_zoom_detection(self):
        """Pinching thumb and index should track zoom deltas."""
        lms = make_synthetic_hand(thumb=False, index=False, middle=False, ring=False, pinky=False)
        # Position thumb tip very close to index tip (norm dist ~ 0.03)
        lms[4] = Point3D(0.495, 0.50, 0.0)  # Thumb tip
        lms[8] = Point3D(0.505, 0.50, 0.0)  # Index tip

        res1 = self.recognizer.process(lms, handedness="Right", current_time=400.0)
        self.assertEqual(res1.gesture, GestureType.PINCH_ZOOM)

        # Separate thumb and index slightly (spreading = Zoom In, within release threshold)
        lms[4] = Point3D(0.488, 0.50, 0.0)
        lms[8] = Point3D(0.512, 0.50, 0.0)
        res2 = self.recognizer.process(lms, handedness="Right", current_time=400.2)
        self.assertEqual(res2.gesture, GestureType.PINCH_ZOOM)
        self.assertEqual(res2.action, ActionTrigger.EXECUTE_ZOOM_IN)

    def test_four_finger_scroll(self):
        """4 fingers extended moving vertically should trigger scroll."""
        lms_frame1 = make_synthetic_hand(thumb=False, index=True, middle=True, ring=True, pinky=True, wrist_y=0.70)
        lms_frame2 = make_synthetic_hand(thumb=False, index=True, middle=True, ring=True, pinky=True, wrist_y=0.65) # Hand moved up

        res1 = self.recognizer.process(lms_frame1, handedness="Right", current_time=500.0)
        self.assertEqual(res1.gesture, GestureType.SCROLL)

        # Hand moved upward (wrist y decreased) -> Scroll Up
        res2 = self.recognizer.process(lms_frame2, handedness="Right", current_time=500.05)
        self.assertEqual(res2.gesture, GestureType.SCROLL)
        self.assertEqual(res2.action, ActionTrigger.EXECUTE_SCROLL_UP)

    def test_left_hand_rejected_when_right_hand_required(self):
        """Config enforces Right Hand only; Left Hand input should be ignored."""
        lms = make_synthetic_hand(thumb=False, index=True, middle=False, ring=False, pinky=False)
        res = self.recognizer.process(lms, handedness="Left", current_time=600.0)
        self.assertEqual(res.gesture, GestureType.NONE)
        self.assertIn("Left hand ignored", res.metadata.get("error", ""))


if __name__ == "__main__":
    unittest.main()
