"""
Unit Tests for Coordinate Smoothing and Screen Space Mapping
Verifies exponential moving average filters, bounding box margin mapping, and clamp behavior.
"""

import unittest
from geometry_utils import (
    AdaptiveCursorSmoother,
    map_coordinates_to_screen,
    calculate_angle_deg,
    Point3D
)


class TestCoordinateMapping(unittest.TestCase):

    def test_screen_mapping_corners(self):
        """Tests that normalized coordinates map correctly within the margins to 0 and screen max."""
        w, h = 1920, 1080
        margin_x, margin_y = 0.15, 0.15

        # Top-left inside active zone
        sx, sy = map_coordinates_to_screen(0.15, 0.15, w, h, margin_x, margin_y, sensitivity=1.0)
        self.assertEqual((sx, sy), (0, 0))

        # Bottom-right inside active zone
        sx, sy = map_coordinates_to_screen(0.85, 0.85, w, h, margin_x, margin_y, sensitivity=1.0)
        self.assertEqual((sx, sy), (1919, 1079))

        # Center
        sx, sy = map_coordinates_to_screen(0.50, 0.50, w, h, margin_x, margin_y, sensitivity=1.0)
        self.assertAlmostEqual(sx, 1920 // 2, delta=5)
        self.assertAlmostEqual(sy, 1080 // 2, delta=5)

    def test_adaptive_cursor_smoothing(self):
        """Tests that jitter is filtered and fast movement responds quickly."""
        smoother = AdaptiveCursorSmoother(base_alpha=0.7)

        # Initial point
        x1, y1 = smoother.update(0.5, 0.5, timestamp=10.0)
        self.assertEqual((x1, y1), (0.5, 0.5))

        # Tiny jitter step (slow velocity) -> strong smoothing
        x2, y2 = smoother.update(0.505, 0.505, timestamp=10.033)
        # Position should be smoothed, moving less than the full jump
        self.assertLess(x2, 0.505)
        self.assertGreater(x2, 0.500)

        # Large jump (fast velocity) -> alpha decreases, follows faster
        x3, y3 = smoother.update(0.800, 0.800, timestamp=10.066)
        self.assertGreater(x3, 0.60)

    def test_calculate_angle_deg(self):
        """Tests 3-point Euclidean joint angle computation."""
        # 90-degree right angle at vertex B
        a = Point3D(0.0, 1.0, 0.0)
        b = Point3D(0.0, 0.0, 0.0)
        c = Point3D(1.0, 0.0, 0.0)
        deg = calculate_angle_deg(a, b, c)
        self.assertAlmostEqual(deg, 90.0, places=3)

        # Straight line 180 degrees
        c2 = Point3D(0.0, -1.0, 0.0)
        deg180 = calculate_angle_deg(a, b, c2)
        self.assertAlmostEqual(deg180, 180.0, places=3)

    def test_high_accuracy_one_euro_filter(self):
        """Tests that One-Euro Filter suppresses stationary jitter and reacts to speed."""
        from geometry_utils import HighAccuracyOneEuroSmoother
        smoother = HighAccuracyOneEuroSmoother(min_cutoff=1.0, beta=0.01, deadband=0.002)

        # First position
        x1, y1 = smoother.update(0.5, 0.5, timestamp=1.0)
        self.assertEqual((x1, y1), (0.5, 0.5))

        # Stationary micro-jitter (sub-pixel drift) -> completely filtered by deadband
        x2, y2 = smoother.update(0.5005, 0.5005, timestamp=1.033)
        self.assertEqual((x2, y2), (0.5, 0.5))

        # Fast deliberate motion -> dynamic cutoff opens up and tracks swiftly
        x3, y3 = smoother.update(0.75, 0.75, timestamp=1.066)
        self.assertGreater(x3, 0.53)


if __name__ == "__main__":
    unittest.main()
