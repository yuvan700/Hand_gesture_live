"""
Configuration Module for Hand Gesture Computer Control System
Defines all thresholds, smoothing parameters, camera settings, and safety policies.
"""

from dataclasses import dataclass, field
from typing import Tuple


@dataclass
class CameraConfig:
    """Camera hardware and capture configuration."""
    camera_index: int = 0
    frame_width: int = 1280
    frame_height: int = 720
    target_fps: int = 30
    flip_horizontal: bool = True  # Mirror camera frame for natural human-computer interaction
    max_num_hands: int = 1
    min_detection_confidence: float = 0.70
    min_tracking_confidence: float = 0.70
    allowed_handedness: str = "Right"  # Strict right-hand detection as requested


@dataclass
class GestureThresholds:
    """Geometric and temporal thresholds for gesture recognition."""
    # Joint angle thresholds (degrees)
    finger_extended_angle: float = 160.0
    finger_folded_angle: float = 100.0
    
    # Distance ratio thresholds (relative to palm size)
    tip_to_wrist_extended_ratio: float = 1.15
    tip_to_wrist_folded_ratio: float = 0.85
    
    # Pinch detection (Thumb tip to Index tip distance relative to palm scale)
    pinch_distance_threshold: float = 0.075
    pinch_release_threshold: float = 0.110  # Hysteresis to prevent jitter
    zoom_delta_deadzone: float = 0.008
    zoom_step_factor: float = 1.0
    
    # Scroll detection (4 fingers extended)
    scroll_vertical_deadzone: float = 0.012
    scroll_speed_multiplier: float = 45.0
    
    # Temporal debouncing and safety hold (seconds)
    close_window_hold_seconds: float = 1.0  # 1-second hold before Alt+F4
    double_click_cooldown_seconds: float = 0.65
    minimize_cooldown_seconds: float = 1.20
    action_debounce_seconds: float = 0.15


@dataclass
class CursorControlConfig:
    """Cursor mapping, smoothing, and sensitivity configuration."""
    # Active interaction bounding box inside camera frame (normalized 0.0 - 1.0)
    # Allows comfortable edge-to-edge screen navigation without straining arms
    margin_x: float = 0.15
    margin_y: float = 0.15
    
    # Smoothing parameters
    # Exponential moving average factor: higher = smoother (more latency), lower = faster
    smoothing_factor: float = 0.65
    velocity_adaptive_smoothing: bool = True
    
    # Sensitivity multiplier
    sensitivity_x: float = 1.25
    sensitivity_y: float = 1.25
    
    # Screen resolution (auto-detected or default fallback)
    screen_width: int = 1920
    screen_height: int = 1080


@dataclass
class SafetyConfig:
    """Safety locks, emergency failsafe, and state flags."""
    pyautogui_failsafe: bool = True  # Slam cursor into screen corner to abort
    require_explicit_start: bool = True  # Controls disabled until user clicks Start
    emergency_stop_key: str = "Escape"
    auto_freeze_on_hand_lost: bool = True
    countdown_visual_feedback: bool = True


@dataclass
class AppConfig:
    """Master application configuration container."""
    camera: CameraConfig = field(default_factory=CameraConfig)
    gestures: GestureThresholds = field(default_factory=GestureThresholds)
    cursor: CursorControlConfig = field(default_factory=CursorControlConfig)
    safety: SafetyConfig = field(default_factory=SafetyConfig)


# Global default configuration instance
DEFAULT_CONFIG = AppConfig()
