"""
Gesture Recognizer Module
Implements landmark geometric classification for the 6 core gestures:
1. Index finger only -> Smooth cursor move
2. 2 Fingers (Index + Middle) -> Double-click to open file/folder/app
3. 3 Fingers (Index + Middle + Ring) -> Minimize active window
4. 5 Fingers Open -> Alt+F4 Close active window (1.0s hold with countdown)
5. Pinch (Thumb + Index) -> Dynamic Zoom In / Zoom Out based on distance change
6. 4 Fingers Extended -> Scroll Up / Down based on vertical hand movement vector
"""

import time
from enum import Enum
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, field

from config import AppConfig, DEFAULT_CONFIG
from geometry_utils import (
    Point3D,
    WRIST,
    THUMB_CMC,
    THUMB_MCP,
    THUMB_IP,
    THUMB_TIP,
    INDEX_MCP,
    INDEX_PIP,
    INDEX_DIP,
    INDEX_TIP,
    MIDDLE_MCP,
    MIDDLE_PIP,
    MIDDLE_DIP,
    MIDDLE_TIP,
    RING_MCP,
    RING_PIP,
    RING_DIP,
    RING_TIP,
    PINKY_MCP,
    PINKY_PIP,
    PINKY_DIP,
    PINKY_TIP,
    euclidean_distance_2d,
    get_palm_scale,
    is_finger_extended_robust,
    is_thumb_extended_robust,
)


class GestureType(str, Enum):
    NONE = "NONE"
    CURSOR_MOVE = "CURSOR_MOVE"         # Index finger only
    DOUBLE_CLICK = "DOUBLE_CLICK"       # 2 fingers: Index + Middle
    MINIMIZE = "MINIMIZE"               # 3 fingers: Index + Middle + Ring
    CLOSE_WINDOW = "CLOSE_WINDOW"       # 5 fingers open (after 1s hold)
    PINCH_ZOOM = "PINCH_ZOOM"           # Thumb & Index pinch distance change
    SCROLL = "SCROLL"                   # 4 fingers extended: vertical motion


class ActionTrigger(str, Enum):
    NONE = "none"
    MOVE_CURSOR = "move_cursor"
    EXECUTE_DOUBLE_CLICK = "execute_double_click"
    EXECUTE_MINIMIZE = "execute_minimize"
    EXECUTE_CLOSE_WINDOW = "execute_close_window"
    EXECUTE_ZOOM_IN = "execute_zoom_in"
    EXECUTE_ZOOM_OUT = "execute_zoom_out"
    EXECUTE_SCROLL_UP = "execute_scroll_up"
    EXECUTE_SCROLL_DOWN = "execute_scroll_down"
    HOLDING_CLOSE = "holding_close"


@dataclass
class GestureRecognitionResult:
    gesture: GestureType
    action: ActionTrigger
    confidence: float
    cursor_pos: Optional[Tuple[float, float]] = None
    finger_states: Dict[str, bool] = field(default_factory=dict)
    
    # 5-finger hold countdown metrics
    close_hold_progress: float = 0.0      # 0.0 to 1.0
    close_seconds_remaining: float = 1.0  # 1.0s down to 0.0s
    
    # Pinch zoom metrics
    pinch_distance: float = 0.0
    zoom_delta: float = 0.0
    
    # Scroll metrics
    scroll_delta_y: float = 0.0
    
    # Debug info
    metadata: Dict[str, Any] = field(default_factory=dict)


class GestureRecognizer:
    """
    Robust geometric classifier for hand gestures with hysteresis, debouncing,
    hold timers, and strict mutually exclusive classification.
    """

    def __init__(self, config: Optional[AppConfig] = None):
        self.config = config or DEFAULT_CONFIG
        
        # Hold state for 5-finger Close Window
        self._five_finger_hold_start: Optional[float] = None
        self._close_window_triggered: bool = False
        
        # Pinch zoom state
        self._is_pinching: bool = False
        self._last_pinch_dist: Optional[float] = None
        self._last_zoom_action_time: float = 0.0
        
        # Scroll tracking state
        self._last_scroll_wrist_y: Optional[float] = None
        
        # Cooldown timestamps
        self._last_double_click_time: float = 0.0
        self._last_minimize_time: float = 0.0
        self._last_action_time: float = 0.0

    def reset(self):
        """Resets all internal tracking timers and states."""
        self._five_finger_hold_start = None
        self._close_window_triggered = False
        self._is_pinching = False
        self._last_pinch_dist = None
        self._last_scroll_wrist_y = None
        self._last_double_click_time = 0.0
        self._last_minimize_time = 0.0
        self._last_action_time = 0.0

    def evaluate_fingers(self, landmarks: List[Point3D], is_right_hand: bool = True) -> Dict[str, bool]:
        """Evaluates whether each finger is extended using joint geometry."""
        if len(landmarks) < 21:
            return {"thumb": False, "index": False, "middle": False, "ring": False, "pinky": False}

        thumb_ext = is_thumb_extended_robust(landmarks, is_right_hand=is_right_hand)
        index_ext = is_finger_extended_robust(landmarks, INDEX_TIP, INDEX_PIP, INDEX_MCP, WRIST)
        middle_ext = is_finger_extended_robust(landmarks, MIDDLE_TIP, MIDDLE_PIP, MIDDLE_MCP, WRIST)
        ring_ext = is_finger_extended_robust(landmarks, RING_TIP, RING_PIP, RING_MCP, WRIST)
        pinky_ext = is_finger_extended_robust(landmarks, PINKY_TIP, PINKY_PIP, PINKY_MCP, WRIST)

        return {
            "thumb": thumb_ext,
            "index": index_ext,
            "middle": middle_ext,
            "ring": ring_ext,
            "pinky": pinky_ext,
        }

    def process(
        self,
        landmarks: List[Point3D],
        handedness: str = "Right",
        current_time: Optional[float] = None
    ) -> GestureRecognitionResult:
        """
        Classifies current hand landmarks into a verified gesture and action.
        """
        now = current_time if current_time is not None else time.time()

        # Reject if fewer than 21 landmarks
        if len(landmarks) < 21:
            self._handle_gesture_break()
            return GestureRecognitionResult(
                gesture=GestureType.NONE,
                action=ActionTrigger.NONE,
                confidence=0.0
            )

        # Enforce right-hand detection if required by config
        is_right = handedness.lower() == "right"
        if self.config.camera.allowed_handedness.lower() == "right" and not is_right:
            self._handle_gesture_break()
            return GestureRecognitionResult(
                gesture=GestureType.NONE,
                action=ActionTrigger.NONE,
                confidence=0.0,
                metadata={"error": "Left hand ignored - right hand required"}
            )

        palm_scale = get_palm_scale(landmarks)
        finger_states = self.evaluate_fingers(landmarks, is_right_hand=is_right)
        
        # Compute normalized pinch distance
        thumb_tip = landmarks[THUMB_TIP]
        index_tip = landmarks[INDEX_TIP]
        raw_pinch_dist = euclidean_distance_2d(thumb_tip, index_tip)
        norm_pinch_dist = raw_pinch_dist / palm_scale

        # Number of extended 4 fingers (index, middle, ring, pinky)
        four_finger_count = sum([
            finger_states["index"],
            finger_states["middle"],
            finger_states["ring"],
            finger_states["pinky"],
        ])
        total_extended = four_finger_count + (1 if finger_states["thumb"] else 0)

        # -------------------------------------------------------------
        # 1. PINCH DETECTION (Thumb + Index pinch)
        # Zoom in when moving apart, Zoom out when moving closer
        # -------------------------------------------------------------
        pinch_thresh = self.config.gestures.pinch_distance_threshold
        release_thresh = self.config.gestures.pinch_release_threshold
        
        # Check pinch condition: thumb tip near index tip, other fingers not fully open (ring & pinky relaxed or folded)
        is_pinch_candidate = (norm_pinch_dist < pinch_thresh) or (self._is_pinching and norm_pinch_dist < release_thresh)
        is_not_full_hand = not (finger_states["middle"] and finger_states["ring"] and finger_states["pinky"])
        
        if is_pinch_candidate and is_not_full_hand:
            self._is_pinching = True
            # Cancel 5-finger hold if active
            self._five_finger_hold_start = None
            self._last_scroll_wrist_y = None

            zoom_action = ActionTrigger.NONE
            delta = 0.0

            if self._last_pinch_dist is not None:
                delta = norm_pinch_dist - self._last_pinch_dist
                deadzone = self.config.gestures.zoom_delta_deadzone
                
                # Check cooldown between zoom steps
                if (now - self._last_zoom_action_time) >= self.config.gestures.action_debounce_seconds:
                    if delta > deadzone:
                        zoom_action = ActionTrigger.EXECUTE_ZOOM_IN
                        self._last_zoom_action_time = now
                    elif delta < -deadzone:
                        zoom_action = ActionTrigger.EXECUTE_ZOOM_OUT
                        self._last_zoom_action_time = now

            self._last_pinch_dist = norm_pinch_dist
            
            # Cursor position follows midpoint between thumb and index tip
            pinch_center = ((thumb_tip.x + index_tip.x) / 2.0, (thumb_tip.y + index_tip.y) / 2.0)

            return GestureRecognitionResult(
                gesture=GestureType.PINCH_ZOOM,
                action=zoom_action,
                confidence=0.92,
                cursor_pos=pinch_center,
                finger_states=finger_states,
                pinch_distance=norm_pinch_dist,
                zoom_delta=delta,
                metadata={"pinch_active": True}
            )
        else:
            self._is_pinching = False
            self._last_pinch_dist = None

        # -------------------------------------------------------------
        # 2. FIVE FINGERS OPEN: CLOSE WINDOW (Alt+F4 after 1s hold)
        # Must have all 5 fingers clearly extended
        # -------------------------------------------------------------
        if total_extended == 5:
            self._last_scroll_wrist_y = None
            
            if self._five_finger_hold_start is None:
                self._five_finger_hold_start = now
                self._close_window_triggered = False

            elapsed = now - self._five_finger_hold_start
            required_hold = self.config.gestures.close_window_hold_seconds
            progress = min(elapsed / required_hold, 1.0)
            remaining = max(0.0, required_hold - elapsed)

            action = ActionTrigger.HOLDING_CLOSE
            if progress >= 1.0 and not self._close_window_triggered:
                action = ActionTrigger.EXECUTE_CLOSE_WINDOW
                self._close_window_triggered = True

            return GestureRecognitionResult(
                gesture=GestureType.CLOSE_WINDOW,
                action=action,
                confidence=0.95,
                finger_states=finger_states,
                close_hold_progress=progress,
                close_seconds_remaining=remaining,
                metadata={"hold_elapsed": elapsed, "triggered": self._close_window_triggered}
            )
        else:
            # Five finger condition broken - immediately reset countdown
            self._five_finger_hold_start = None
            self._close_window_triggered = False

        # -------------------------------------------------------------
        # 3. FOUR FINGERS EXTENDED: SCROLL UP / DOWN
        # (Index, Middle, Ring, Pinky extended, thumb tucked or not wide)
        # -------------------------------------------------------------
        if four_finger_count == 4 and not finger_states["thumb"]:
            wrist_y = landmarks[WRIST].y
            scroll_action = ActionTrigger.NONE
            scroll_dy = 0.0

            if self._last_scroll_wrist_y is not None:
                scroll_dy = wrist_y - self._last_scroll_wrist_y
                deadzone = self.config.gestures.scroll_vertical_deadzone

                # Note: in camera coordinates, moving up means wrist_y decreases (dy < 0)
                # Moving down means wrist_y increases (dy > 0)
                if scroll_dy < -deadzone:
                    scroll_action = ActionTrigger.EXECUTE_SCROLL_UP
                elif scroll_dy > deadzone:
                    scroll_action = ActionTrigger.EXECUTE_SCROLL_DOWN

            self._last_scroll_wrist_y = wrist_y
            palm_pos = (landmarks[MIDDLE_MCP].x, landmarks[MIDDLE_MCP].y)

            return GestureRecognitionResult(
                gesture=GestureType.SCROLL,
                action=scroll_action,
                confidence=0.90,
                cursor_pos=palm_pos,
                finger_states=finger_states,
                scroll_delta_y=scroll_dy,
                metadata={"scroll_active": True}
            )
        else:
            self._last_scroll_wrist_y = None

        # -------------------------------------------------------------
        # 4. THREE FINGERS: MINIMIZE ACTIVE WINDOW
        # (Index + Middle + Ring extended; Pinky & Thumb folded)
        # -------------------------------------------------------------
        if (
            finger_states["index"]
            and finger_states["middle"]
            and finger_states["ring"]
            and not finger_states["pinky"]
            and not finger_states["thumb"]
        ):
            action = ActionTrigger.NONE
            if (now - self._last_minimize_time) >= self.config.gestures.minimize_cooldown_seconds:
                action = ActionTrigger.EXECUTE_MINIMIZE
                self._last_minimize_time = now

            cursor_pt = (landmarks[MIDDLE_TIP].x, landmarks[MIDDLE_TIP].y)
            return GestureRecognitionResult(
                gesture=GestureType.MINIMIZE,
                action=action,
                confidence=0.93,
                cursor_pos=cursor_pt,
                finger_states=finger_states,
                metadata={"minimize_cooldown": max(0.0, self.config.gestures.minimize_cooldown_seconds - (now - self._last_minimize_time))}
            )

        # -------------------------------------------------------------
        # 5. TWO FINGERS: DOUBLE CLICK
        # (Index + Middle extended; Ring, Pinky, Thumb folded)
        # -------------------------------------------------------------
        if (
            finger_states["index"]
            and finger_states["middle"]
            and not finger_states["ring"]
            and not finger_states["pinky"]
            and not finger_states["thumb"]
        ):
            action = ActionTrigger.NONE
            if (now - self._last_double_click_time) >= self.config.gestures.double_click_cooldown_seconds:
                action = ActionTrigger.EXECUTE_DOUBLE_CLICK
                self._last_double_click_time = now

            cursor_pt = ((landmarks[INDEX_TIP].x + landmarks[MIDDLE_TIP].x) / 2.0,
                         (landmarks[INDEX_TIP].y + landmarks[MIDDLE_TIP].y) / 2.0)
            return GestureRecognitionResult(
                gesture=GestureType.DOUBLE_CLICK,
                action=action,
                confidence=0.94,
                cursor_pos=cursor_pt,
                finger_states=finger_states,
                metadata={"double_click_cooldown": max(0.0, self.config.gestures.double_click_cooldown_seconds - (now - self._last_double_click_time))}
            )

        # -------------------------------------------------------------
        # 6. ONE FINGER: CURSOR MOVE
        # (Index extended only; Middle, Ring, Pinky folded)
        # -------------------------------------------------------------
        if (
            finger_states["index"]
            and not finger_states["middle"]
            and not finger_states["ring"]
            and not finger_states["pinky"]
        ):
            cursor_pt = (landmarks[INDEX_TIP].x, landmarks[INDEX_TIP].y)
            return GestureRecognitionResult(
                gesture=GestureType.CURSOR_MOVE,
                action=ActionTrigger.MOVE_CURSOR,
                confidence=0.96,
                cursor_pos=cursor_pt,
                finger_states=finger_states,
                metadata={"cursor_active": True}
            )

        # Default fallback: No recognized gesture
        self._handle_gesture_break()
        return GestureRecognitionResult(
            gesture=GestureType.NONE,
            action=ActionTrigger.NONE,
            confidence=0.5,
            finger_states=finger_states
        )

    def _handle_gesture_break(self):
        """Resets hold and movement tracking when hand is lost or gesture broken."""
        self._five_finger_hold_start = None
        self._close_window_triggered = False
        self._is_pinching = False
        self._last_pinch_dist = None
        self._last_scroll_wrist_y = None
