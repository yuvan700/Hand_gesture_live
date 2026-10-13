"""
Unit Tests for Safety System and Emergency Controls
Verifies that:
- Controls are strictly locked until Start is pressed
- Emergency Stop immediately locks all actions
- Failsafe latch prevents resumption until reset
"""

import unittest
from config import AppConfig
from controller import ComputerController


class TestSafetySystem(unittest.TestCase):

    def setUp(self):
        self.config = AppConfig()
        self.controller = ComputerController(self.config)

    def test_actions_blocked_by_default(self):
        """No clicks or commands should execute before start_control() is called."""
        self.assertFalse(self.controller.is_enabled)
        
        self.assertFalse(self.controller.double_click())
        self.assertFalse(self.controller.minimize_active_window())
        self.assertFalse(self.controller.close_active_window())
        self.assertFalse(self.controller.zoom_in())
        self.assertFalse(self.controller.zoom_out())
        self.assertFalse(self.controller.scroll(0.1))

    def test_start_and_stop_lifecycle(self):
        """Actions should execute when started, and cease immediately when stopped."""
        self.controller.start_control()
        self.assertTrue(self.controller.is_enabled)
        
        # Action allowed in enabled state
        self.assertTrue(self.controller.double_click())

        # Stop control
        self.controller.stop_control()
        self.assertFalse(self.controller.is_enabled)
        self.assertFalse(self.controller.double_click())

    def test_emergency_stop_latches_all_actions(self):
        """Emergency Stop should immediately freeze the system even if enabled was True."""
        self.controller.start_control()
        self.assertTrue(self.controller.is_enabled)

        # Trigger emergency stop
        self.controller.trigger_emergency_stop()
        self.assertTrue(self.controller.emergency_stopped)
        self.assertFalse(self.controller.is_enabled)

        # Calling start_control should NOT bypass emergency stop latch
        self.controller.start_control()
        self.assertFalse(self.controller.is_enabled)
        self.assertFalse(self.controller.double_click())

        # Must explicitly reset emergency stop
        self.controller.reset_emergency_stop()
        self.assertFalse(self.controller.emergency_stopped)
        
        # Now start can re-engage
        self.controller.start_control()
        self.assertTrue(self.controller.is_enabled)


if __name__ == "__main__":
    unittest.main()
