"""
Computer Controller Module
Executes OS actions via PyAutoGUI with strict safety rules:
- Emergency Failsafe enabled (cursor to corner kills execution)
- Actions disabled until Start is engaged
- Emergency Stop instantly terminates control
- Coordinate mapping with smoothing
- Cross-platform window minimization and Alt+F4 window closing
"""

import logging
import platform
import subprocess
import sys
import time
from typing import Optional, Tuple

from config import AppConfig, DEFAULT_CONFIG
from geometry_utils import AdaptiveCursorSmoother, map_coordinates_to_screen

logger = logging.getLogger(__name__)

# Attempt to import PyAutoGUI gracefully
try:
    import pyautogui
    pyautogui.FAILSAFE = True  # Move mouse to any corner to trigger FailSafeException
    pyautogui.PAUSE = 0.01     # Minimize latency between sequential commands
    PYAUTOGUI_AVAILABLE = True
except Exception as e:
    logger.warning("PyAutoGUI not available in current environment: %s. Using simulation mode.", e)
    pyautogui = None
    PYAUTOGUI_AVAILABLE = False


class ComputerController:
    """
    Controls mouse and keyboard actions with safety failsafes,
    debouncing, and coordinate mapping.
    """

    def __init__(self, config: Optional[AppConfig] = None):
        self.config = config or DEFAULT_CONFIG
        self.is_enabled: bool = False
        self.emergency_stopped: bool = False
        
        # Cursor smoother
        self.smoother = AdaptiveCursorSmoother(
            base_alpha=self.config.cursor.smoothing_factor,
            min_alpha=0.15,
            max_alpha=0.85
        )
        
        # Screen dimensions
        self.screen_width = self.config.cursor.screen_width
        self.screen_height = self.config.cursor.screen_height
        
        # Auto-detect screen size if PyAutoGUI is present
        if PYAUTOGUI_AVAILABLE and pyautogui is not None:
            try:
                w, h = pyautogui.size()
                if w > 0 and h > 0:
                    self.screen_width = w
                    self.screen_height = h
            except Exception:
                pass

        self.last_action_timestamp = 0.0
        self.action_history = []

    def start_control(self):
        """Enables gesture computer control."""
        if not self.emergency_stopped:
            self.is_enabled = True
            logger.info("Computer control enabled.")

    def stop_control(self):
        """Disables gesture computer control."""
        self.is_enabled = False
        self.smoother.reset()
        logger.info("Computer control disabled.")

    def trigger_emergency_stop(self):
        """Latches emergency stop. All actions are immediately blocked."""
        self.emergency_stopped = True
        self.is_enabled = False
        self.smoother.reset()
        logger.warning("EMERGENCY STOP TRIGGERED. All actions frozen.")

    def reset_emergency_stop(self):
        """Clears emergency stop latch."""
        self.emergency_stopped = False
        self.is_enabled = False
        self.smoother.reset()
        logger.info("Emergency stop cleared. Click Start to resume.")

    def move_cursor(self, norm_x: float, norm_y: float, timestamp: Optional[float] = None) -> Tuple[int, int]:
        """
        Maps normalized camera point [0.0, 1.0] to screen pixel coordinates
        using adaptive smoothing and sensitivity margins.
        """
        now = timestamp if timestamp is not None else time.time()
        
        # Apply adaptive velocity-based exponential smoothing
        smooth_x, smooth_y = self.smoother.update(norm_x, norm_y, now)
        
        # Map to screen pixels
        screen_x, screen_y = map_coordinates_to_screen(
            smooth_x,
            smooth_y,
            screen_width=self.screen_width,
            screen_height=self.screen_height,
            margin_x=self.config.cursor.margin_x,
            margin_y=self.config.cursor.margin_y,
            sensitivity=self.config.cursor.sensitivity_x
        )

        if self.is_enabled and not self.emergency_stopped:
            if PYAUTOGUI_AVAILABLE and pyautogui is not None:
                try:
                    pyautogui.moveTo(screen_x, screen_y, _pause=False)
                except Exception as ex:
                    logger.error("Cursor movement failed: %s", ex)
        
        return screen_x, screen_y

    def double_click(self) -> bool:
        """Executes double-click on the current cursor position."""
        if not self.is_enabled or self.emergency_stopped:
            return False

        if PYAUTOGUI_AVAILABLE and pyautogui is not None:
            try:
                pyautogui.doubleClick()
                self._record_action("Double Click")
                return True
            except Exception as ex:
                logger.error("Double-click failed: %s", ex)
                return False
        else:
            self._record_action("Double Click (Simulated)")
            return True

    def minimize_active_window(self) -> bool:
        """
        Minimizes the currently active window across Windows, macOS, and Linux.
        """
        if not self.is_enabled or self.emergency_stopped:
            return False

        current_os = platform.system().lower()
        success = False

        if PYAUTOGUI_AVAILABLE and pyautogui is not None:
            try:
                if "windows" in current_os:
                    # Windows: Win + Down Arrow twice, or Win + M, or Alt + Space then N
                    pyautogui.hotkey("win", "down")
                    success = True
                elif "darwin" in current_os:
                    # macOS: Cmd + M
                    pyautogui.hotkey("command", "m")
                    success = True
                else:
                    # Linux / X11: Super + H or Alt + F9 or xdotool
                    try:
                        subprocess.run(["xdotool", "getactivewindow", "windowminimize"], check=True)
                        success = True
                    except Exception:
                        pyautogui.hotkey("alt", "f9")
                        success = True
            except Exception as ex:
                logger.error("Minimize active window failed: %s", ex)
                return False
        else:
            success = True

        if success:
            self._record_action("Minimize Window")
        return success

    def close_active_window(self) -> bool:
        """
        Closes the active window using Alt+F4 (Windows/Linux) or Cmd+W / Cmd+Q (macOS).
        """
        if not self.is_enabled or self.emergency_stopped:
            return False

        current_os = platform.system().lower()
        success = False

        if PYAUTOGUI_AVAILABLE and pyautogui is not None:
            try:
                if "darwin" in current_os:
                    pyautogui.hotkey("command", "w")
                else:
                    # Windows / Linux standard Alt+F4
                    pyautogui.hotkey("alt", "f4")
                success = True
            except Exception as ex:
                logger.error("Close active window failed: %s", ex)
                return False
        else:
            success = True

        if success:
            self._record_action("Close Window (Alt+F4)")
        return success

    def zoom_in(self) -> bool:
        """Zooms in using Ctrl + Plus hotkey."""
        if not self.is_enabled or self.emergency_stopped:
            return False

        if PYAUTOGUI_AVAILABLE and pyautogui is not None:
            try:
                if "darwin" in platform.system().lower():
                    pyautogui.hotkey("command", "+")
                else:
                    pyautogui.hotkey("ctrl", "+")
                self._record_action("Zoom In")
                return True
            except Exception as ex:
                logger.error("Zoom in failed: %s", ex)
                return False
        else:
            self._record_action("Zoom In (Simulated)")
            return True

    def zoom_out(self) -> bool:
        """Zooms out using Ctrl + Minus hotkey."""
        if not self.is_enabled or self.emergency_stopped:
            return False

        if PYAUTOGUI_AVAILABLE and pyautogui is not None:
            try:
                if "darwin" in platform.system().lower():
                    pyautogui.hotkey("command", "-")
                else:
                    pyautogui.hotkey("ctrl", "-")
                self._record_action("Zoom Out")
                return True
            except Exception as ex:
                logger.error("Zoom out failed: %s", ex)
                return False
        else:
            self._record_action("Zoom Out (Simulated)")
            return True

    def scroll(self, delta_y: float) -> bool:
        """
        Scrolls up or down proportional to vertical displacement.
        """
        if not self.is_enabled or self.emergency_stopped:
            return False

        scroll_clicks = int(-delta_y * self.config.gestures.scroll_speed_multiplier)
        if scroll_clicks == 0:
            return False

        if PYAUTOGUI_AVAILABLE and pyautogui is not None:
            try:
                pyautogui.scroll(scroll_clicks)
                self._record_action(f"Scroll {'Up' if scroll_clicks > 0 else 'Down'}")
                return True
            except Exception as ex:
                logger.error("Scroll failed: %s", ex)
                return False
        else:
            self._record_action(f"Scroll {'Up' if scroll_clicks > 0 else 'Down'} (Simulated)")
            return True

    def _record_action(self, action_name: str):
        """Maintains timestamped log of executed actions."""
        item = {"timestamp": time.time(), "action": action_name}
        self.action_history.append(item)
        if len(self.action_history) > 50:
            self.action_history.pop(0)
