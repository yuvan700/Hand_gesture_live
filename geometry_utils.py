"""
Geometry Utilities for Hand Landmark Analysis and Cursor Smoothing
Provides vector math, joint angle calculations, palm-normalized distance scaling,
and velocity-adaptive exponential moving average filters.
"""

import math
from typing import Dict, List, Optional, Tuple, NamedTuple


class Point3D(NamedTuple):
    x: float
    y: float
    z: float = 0.0


# MediaPipe Hand Landmark Index Definitions
WRIST = 0
THUMB_CMC = 1
THUMB_MCP = 2
THUMB_IP = 3
THUMB_TIP = 4

INDEX_MCP = 5
INDEX_PIP = 6
INDEX_DIP = 7
INDEX_TIP = 8

MIDDLE_MCP = 9
MIDDLE_PIP = 10
MIDDLE_DIP = 11
MIDDLE_TIP = 12

RING_MCP = 13
RING_PIP = 14
RING_DIP = 15
RING_TIP = 16

PINKY_MCP = 17
PINKY_PIP = 18
PINKY_DIP = 19
PINKY_TIP = 20


def euclidean_distance_2d(p1: Point3D, p2: Point3D) -> float:
    """Computes standard 2D Euclidean distance between two points."""
    return math.hypot(p1.x - p2.x, p1.y - p2.y)


def euclidean_distance_3d(p1: Point3D, p2: Point3D) -> float:
    """Computes 3D Euclidean distance between two points."""
    return math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2 + (p1.z - p2.z) ** 2)


def calculate_angle_deg(a: Point3D, b: Point3D, c: Point3D) -> float:
    """
    Calculates the interior angle in degrees at vertex B formed by segments BA and BC.
    Formula: arccos((BA . BC) / (|BA| * |BC|))
    Returns value in range [0.0, 180.0].
    """
    v1_x = a.x - b.x
    v1_y = a.y - b.y
    v1_z = a.z - b.z
    
    v2_x = c.x - b.x
    v2_y = c.y - b.y
    v2_z = c.z - b.z
    
    dot_product = (v1_x * v2_x) + (v1_y * v2_y) + (v1_z * v2_z)
    mag1 = math.sqrt(v1_x * v1_x + v1_y * v1_y + v1_z * v1_z)
    mag2 = math.sqrt(v2_x * v2_x + v2_y * v2_y + v2_z * v2_z)
    
    if mag1 * mag2 == 0:
        return 0.0
    
    cos_theta = max(-1.0, min(1.0, dot_product / (mag1 * mag2)))
    return math.degrees(math.acos(cos_theta))


def get_palm_scale(landmarks: List[Point3D]) -> float:
    """
    Returns reference scale of the palm (distance between WRIST and MIDDLE_MCP).
    Used to normalize distance thresholds invariant to distance from camera.
    """
    if len(landmarks) < 21:
        return 1.0
    scale = euclidean_distance_2d(landmarks[WRIST], landmarks[MIDDLE_MCP])
    return max(scale, 0.001)


def is_finger_extended_robust(
    landmarks: List[Point3D],
    tip_idx: int,
    pip_idx: int,
    mcp_idx: int,
    wrist_idx: int = WRIST,
    angle_threshold: float = 145.0,
) -> bool:
    """
    Determines if a finger is extended using both joint angle and distance ratio.
    Avoids naive Y-coordinate comparisons that fail when the user tilts their hand sideways.
    """
    if len(landmarks) < 21:
        return False
    
    tip = landmarks[tip_idx]
    pip = landmarks[pip_idx]
    mcp = landmarks[mcp_idx]
    wrist = landmarks[wrist_idx]
    
    # 1. Angle at PIP joint (straight finger approaches 180 deg, curled drops below 100 deg)
    pip_angle = calculate_angle_deg(mcp, pip, tip)
    
    # 2. Euclidean distance from wrist: when extended, tip is substantially further from wrist than PIP
    dist_wrist_tip = euclidean_distance_2d(wrist, tip)
    dist_wrist_pip = euclidean_distance_2d(wrist, pip)
    dist_wrist_mcp = euclidean_distance_2d(wrist, mcp)
    
    # 3. Tip is further from MCP than PIP is from MCP
    dist_mcp_tip = euclidean_distance_2d(mcp, tip)
    dist_mcp_pip = euclidean_distance_2d(mcp, pip)
    
    is_angle_extended = pip_angle >= angle_threshold
    is_distance_extended = (dist_wrist_tip > dist_wrist_pip * 1.08) and (dist_mcp_tip > dist_mcp_pip * 1.15)
    
    return is_angle_extended or is_distance_extended


def is_thumb_extended_robust(
    landmarks: List[Point3D],
    is_right_hand: bool = True,
    angle_threshold: float = 140.0
) -> bool:
    """
    Determines if the thumb is extended.
    Checks thumb IP angle and distance from pinky MCP baseline.
    """
    if len(landmarks) < 21:
        return False
    
    mcp = landmarks[THUMB_MCP]
    ip = landmarks[THUMB_IP]
    tip = landmarks[THUMB_TIP]
    pinky_mcp = landmarks[PINKY_MCP]
    
    ip_angle = calculate_angle_deg(mcp, ip, tip)
    
    # Lateral distance of thumb tip from index MCP compared to thumb MCP
    dist_to_pinky = euclidean_distance_2d(tip, pinky_mcp)
    mcp_to_pinky = euclidean_distance_2d(mcp, pinky_mcp)
    
    return ip_angle >= angle_threshold and dist_to_pinky >= mcp_to_pinky * 1.10


class AdaptiveCursorSmoother:
    """
    Velocity-adaptive exponential smoothing filter.
    When movement is slow (fine pointing), smoothing is high to eliminate jitter.
    When movement is fast (sweeping gestures), smoothing decreases to eliminate lag.
    """
    def __init__(self, base_alpha: float = 0.65, min_alpha: float = 0.20, max_alpha: float = 0.85):
        self.base_alpha = base_alpha
        self.min_alpha = min_alpha
        self.max_alpha = max_alpha
        self.prev_x: Optional[float] = None
        self.prev_y: Optional[float] = None
        self.prev_time: Optional[float] = None
        self.smoothed_x: Optional[float] = None
        self.smoothed_y: Optional[float] = None

    def reset(self):
        """Resets the smoother state."""
        self.prev_x = None
        self.prev_y = None
        self.prev_time = None
        self.smoothed_x = None
        self.smoothed_y = None

    def update(self, raw_x: float, raw_y: float, timestamp: float) -> Tuple[float, float]:
        """Updates and returns smoothed (x, y) coordinates."""
        if self.smoothed_x is None or self.smoothed_y is None or self.prev_time is None:
            self.smoothed_x = raw_x
            self.smoothed_y = raw_y
            self.prev_x = raw_x
            self.prev_y = raw_y
            self.prev_time = timestamp
            return raw_x, raw_y

        dt = max(timestamp - self.prev_time, 0.001)
        velocity = math.hypot(raw_x - self.prev_x, raw_y - self.prev_y) / dt

        # Velocity threshold in normalized units/sec (0.0 to 1.0)
        # Low velocity -> higher weight on smoothed (closer to max_alpha)
        # High velocity -> higher weight on raw (closer to min_alpha)
        speed_factor = min(velocity / 1.5, 1.0)
        alpha = self.max_alpha - speed_factor * (self.max_alpha - self.min_alpha)

        self.smoothed_x = (alpha * self.smoothed_x) + ((1.0 - alpha) * raw_x)
        self.smoothed_y = (alpha * self.smoothed_y) + ((1.0 - alpha) * raw_y)

        self.prev_x = raw_x
        self.prev_y = raw_y
        self.prev_time = timestamp

        return self.smoothed_x, self.smoothed_y


class OneEuroFilter1D:
    """
    1-Euro Filter for 1D signals (Casiez et al., CHI 2012).
    Gold standard for human-computer interaction and low-latency, zero-jitter filtering.
    """
    def __init__(self, min_cutoff: float = 1.0, beta: float = 0.007, d_cutoff: float = 1.0):
        self.min_cutoff = min_cutoff
        self.beta = beta
        self.d_cutoff = d_cutoff
        self.x_prev: Optional[float] = None
        self.dx_prev: float = 0.0
        self.t_prev: Optional[float] = None

    def _smoothing_factor(self, dt: float, cutoff: float) -> float:
        r = 2 * math.pi * cutoff * dt
        return r / (r + 1.0)

    def reset(self):
        self.x_prev = None
        self.dx_prev = 0.0
        self.t_prev = None

    def filter(self, x: float, timestamp: float) -> float:
        if self.t_prev is None or self.x_prev is None:
            self.x_prev = x
            self.dx_prev = 0.0
            self.t_prev = timestamp
            return x

        dt = max(timestamp - self.t_prev, 0.001)

        # Derivative
        dx = (x - self.x_prev) / dt
        alpha_d = self._smoothing_factor(dt, self.d_cutoff)
        dx_hat = alpha_d * dx + (1.0 - alpha_d) * self.dx_prev

        # Dynamic cutoff
        cutoff = self.min_cutoff + self.beta * abs(dx_hat)
        alpha = self._smoothing_factor(dt, cutoff)
        x_hat = alpha * x + (1.0 - alpha) * self.x_prev

        self.x_prev = x_hat
        self.dx_prev = dx_hat
        self.t_prev = timestamp

        return x_hat


class HighAccuracyOneEuroSmoother:
    """
    2D One-Euro Filter with sub-pixel deadband thresholding.
    Provides sub-millimeter jitter suppression and instant sweep reaction.
    """
    def __init__(self, min_cutoff: float = 0.85, beta: float = 0.009, deadband: float = 0.0015):
        self.fx = OneEuroFilter1D(min_cutoff=min_cutoff, beta=beta)
        self.fy = OneEuroFilter1D(min_cutoff=min_cutoff, beta=beta)
        self.deadband = deadband
        self.last_emitted_x: Optional[float] = None
        self.last_emitted_y: Optional[float] = None

    def reset(self):
        self.fx.reset()
        self.fy.reset()
        self.last_emitted_x = None
        self.last_emitted_y = None

    def update(self, raw_x: float, raw_y: float, timestamp: float) -> Tuple[float, float]:
        fx = self.fx.filter(raw_x, timestamp)
        fy = self.fy.filter(raw_y, timestamp)

        if self.last_emitted_x is None or self.last_emitted_y is None:
            self.last_emitted_x = fx
            self.last_emitted_y = fy
            return fx, fy

        # Sub-pixel deadband: ignore tiny micro-tremors below threshold
        dist = math.hypot(fx - self.last_emitted_x, fy - self.last_emitted_y)
        if dist < self.deadband:
            return self.last_emitted_x, self.last_emitted_y

        self.last_emitted_x = fx
        self.last_emitted_y = fy
        return fx, fy


def calculate_palm_orientation(landmarks: List[Point3D]) -> Tuple[float, float]:
    """
    Computes palm roll angle (in-plane tilt) and pitch angle (tilt towards camera).
    Allows invariant classification regardless of user hand orientation.
    """
    if len(landmarks) < 21:
        return 0.0, 0.0

    wrist = landmarks[WRIST]
    middle_mcp = landmarks[MIDDLE_MCP]
    index_mcp = landmarks[INDEX_MCP]
    pinky_mcp = landmarks[PINKY_MCP]

    # Roll: angle of index_mcp to pinky_mcp baseline relative to horizontal
    dx = pinky_mcp.x - index_mcp.x
    dy = pinky_mcp.y - index_mcp.y
    roll_deg = math.degrees(math.atan2(dy, dx))

    # Pitch: vertical compression of wrist to middle_mcp compared to palm width
    span_w = euclidean_distance_2d(index_mcp, pinky_mcp)
    span_h = euclidean_distance_2d(wrist, middle_mcp)
    ratio = span_h / max(span_w, 0.001)
    pitch_deg = math.degrees(math.acos(max(-1.0, min(1.0, ratio / 1.4))))

    return roll_deg, pitch_deg


def map_coordinates_to_screen(
    norm_x: float,
    norm_y: float,
    screen_width: int,
    screen_height: int,
    margin_x: float = 0.15,
    margin_y: float = 0.15,
    sensitivity: float = 1.0
) -> Tuple[int, int]:
    """
    Maps normalized camera coordinates [0.0, 1.0] inside the active bounding box
    to screen pixel coordinates [0, screen_width - 1], [0, screen_height - 1].
    Includes margin calibration so user can comfortably reach all screen edges.
    """
    clamped_x = max(margin_x, min(1.0 - margin_x, norm_x))
    clamped_y = max(margin_y, min(1.0 - margin_y, norm_y))
    
    active_w = max(1.0 - 2 * margin_x, 0.01)
    active_h = max(1.0 - 2 * margin_y, 0.01)
    
    rel_x = (clamped_x - margin_x) / active_w
    rel_y = (clamped_y - margin_y) / active_h
    
    centered_x = (rel_x - 0.5) * sensitivity + 0.5
    centered_y = (rel_y - 0.5) * sensitivity + 0.5
    
    final_norm_x = max(0.0, min(1.0, centered_x))
    final_norm_y = max(0.0, min(1.0, centered_y))
    
    screen_x = int(round(final_norm_x * (screen_width - 1)))
    screen_y = int(round(final_norm_y * (screen_height - 1)))
    
    return screen_x, screen_y
