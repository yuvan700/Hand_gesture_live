"""
Modern Dark Dashboard UI for Hand Gesture Computer Control System
Built with Tkinter and TTK using a custom cyber-dark theme (Blue #3B82F6, Cyan #06B6D4, Purple #8B5CF6).
Architecture:
- Background camera & computer vision inference worker thread
- Thread-safe Queue communication to guarantee 100% responsiveness on main GUI thread
- Live video stream display with landmark and countdown overlay
- Real-time telemetry: FPS, inference latency, hardware acceleration status
- Start, Stop, and Emergency Stop controls
- Interactive gesture guide and activity history log
"""

import logging
import queue
import threading
import time
from typing import Optional, Callable, Dict, Any

from config import AppConfig, DEFAULT_CONFIG
from geometry_utils import Point3D

logger = logging.getLogger(__name__)

# Check Tkinter and PIL availability
try:
    import tkinter as tk
    from tkinter import ttk, messagebox
    TKINTER_AVAILABLE = True
except ImportError:
    tk = None
    ttk = None
    messagebox = None
    TKINTER_AVAILABLE = False

try:
    from PIL import Image, ImageTk
    PIL_AVAILABLE = True
except ImportError:
    Image = None
    ImageTk = None
    PIL_AVAILABLE = False


# Theme Palette
BG_DARK = "#0B0F19"
BG_CARD = "#111827"
BG_CARD_LIGHT = "#1F2937"
ACCENT_BLUE = "#3B82F6"
ACCENT_CYAN = "#06B6D4"
ACCENT_PURPLE = "#8B5CF6"
ACCENT_RED = "#EF4444"
ACCENT_GREEN = "#10B981"
TEXT_PRIMARY = "#F9FAFB"
TEXT_MUTED = "#9CA3AF"
BORDER_COLOR = "#374151"


class GestureDashboardUI:
    """
    Tkinter Modern Dark Dashboard for the Hand Gesture Control System.
    """

    def __init__(
        self,
        config: Optional[AppConfig] = None,
        on_start_cb: Optional[Callable[[], None]] = None,
        on_stop_cb: Optional[Callable[[], None]] = None,
        on_emergency_stop_cb: Optional[Callable[[], None]] = None,
        on_camera_change_cb: Optional[Callable[[int], None]] = None,
    ):
        self.config = config or DEFAULT_CONFIG
        self.on_start_cb = on_start_cb
        self.on_stop_cb = on_stop_cb
        self.on_emergency_stop_cb = on_emergency_stop_cb
        self.on_camera_change_cb = on_camera_change_cb

        self.root = None
        self.is_running = False
        self.update_queue = queue.Queue(maxsize=30)
        
        # UI state
        self.is_started = False
        self.is_emergency_stop = False
        self.current_photo = None

    def initialize_window(self):
        """Builds the Tkinter GUI layout and theme."""
        if not TKINTER_AVAILABLE:
            print("[UI Notice] Tkinter is not installed on this system. GUI running in headless background mode.")
            return

        self.root = tk.Tk()
        self.root.title("Hand Gesture Computer Control System - Vision Studio")
        self.root.geometry("1280x820")
        self.root.minsize(1024, 720)
        self.root.configure(bg=BG_DARK)

        self._configure_styles()
        self._build_header()
        self._build_main_layout()
        self._build_status_bar()

        # Keyboard shortcut for Emergency Stop (Esc)
        self.root.bind("<Escape>", lambda e: self._on_emergency_stop_clicked())
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

        # Start periodic queue polling on main thread
        self.root.after(16, self._process_queue_events)

    def _configure_styles(self):
        """Custom TTK styling for modern dark aesthetics."""
        style = ttk.Style()
        style.theme_use("clam")

        # Configure generic frame styles
        style.configure("TFrame", background=BG_DARK)
        style.configure("Card.TFrame", background=BG_CARD, relief="flat")
        
        # Buttons
        style.configure("Start.TButton", background=ACCENT_BLUE, foreground="#FFFFFF", font=("Segoe UI", 10, "bold"), borderwidth=0)
        style.map("Start.TButton", background=[("active", "#2563EB")])

        style.configure("Stop.TButton", background=BG_CARD_LIGHT, foreground=TEXT_PRIMARY, font=("Segoe UI", 10, "bold"), borderwidth=0)
        style.map("Stop.TButton", background=[("active", "#374151")])

        style.configure("Emergency.TButton", background=ACCENT_RED, foreground="#FFFFFF", font=("Segoe UI", 10, "bold"), borderwidth=0)
        style.map("Emergency.TButton", background=[("active", "#DC2626")])

    def _build_header(self):
        """Renders header banner with logo, title, and hardware badges."""
        header_frame = tk.Frame(self.root, bg=BG_CARD, height=64, padx=20, pady=12, highlightbackground=BORDER_COLOR, highlightthickness=1)
        header_frame.pack(fill=tk.X, side=tk.TOP)

        title_box = tk.Frame(header_frame, bg=BG_CARD)
        title_box.pack(side=tk.LEFT)

        title_lbl = tk.Label(title_box, text="VisionGrip AI", font=("Segoe UI", 16, "bold"), fg=ACCENT_CYAN, bg=BG_CARD)
        title_lbl.pack(side=tk.LEFT)

        subtitle_lbl = tk.Label(title_box, text=" | Computer Vision Gesture System", font=("Segoe UI", 11), fg=TEXT_MUTED, bg=BG_CARD)
        subtitle_lbl.pack(side=tk.LEFT, padx=5)

        # Right status chips
        chips_box = tk.Frame(header_frame, bg=BG_CARD)
        chips_box.pack(side=tk.RIGHT)

        self.hw_label = tk.Label(chips_box, text="HW: CPU Threaded", font=("Consolas", 9), fg=ACCENT_BLUE, bg=BG_CARD_LIGHT, padx=10, pady=4)
        self.hw_label.pack(side=tk.LEFT, padx=6)

        self.status_chip = tk.Label(chips_box, text="STANDBY", font=("Segoe UI", 9, "bold"), fg="#9CA3AF", bg="#374151", padx=12, pady=4)
        self.status_chip.pack(side=tk.LEFT, padx=6)

    def _build_main_layout(self):
        """Constructs split-view: Video Feed on left, Controls and Telemetry on right."""
        main_container = tk.Frame(self.root, bg=BG_DARK, padx=16, pady=16)
        main_container.pack(fill=tk.BOTH, expand=True)

        # LEFT COLUMN: Video Stream & Telemetry Cards
        left_col = tk.Frame(main_container, bg=BG_DARK)
        left_col.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 10))

        # Video Frame Card
        video_card = tk.Frame(left_col, bg=BG_CARD, padx=10, pady=10, highlightbackground=BORDER_COLOR, highlightthickness=1)
        video_card.pack(fill=tk.BOTH, expand=True)

        self.video_canvas = tk.Canvas(video_card, bg="#030712", highlightthickness=0)
        self.video_canvas.pack(fill=tk.BOTH, expand=True)

        # Metrics bar below video
        metrics_bar = tk.Frame(video_card, bg=BG_CARD, pady=8)
        metrics_bar.pack(fill=tk.X)

        self.lbl_fps = tk.Label(metrics_bar, text="FPS: 0.0", font=("Consolas", 10, "bold"), fg=ACCENT_CYAN, bg=BG_CARD)
        self.lbl_fps.pack(side=tk.LEFT, padx=12)

        self.lbl_latency = tk.Label(metrics_bar, text="Latency: 0.0 ms", font=("Consolas", 10, "bold"), fg=ACCENT_PURPLE, bg=BG_CARD)
        self.lbl_latency.pack(side=tk.LEFT, padx=12)

        self.lbl_gesture = tk.Label(metrics_bar, text="Gesture: NONE", font=("Consolas", 10, "bold"), fg=ACCENT_BLUE, bg=BG_CARD)
        self.lbl_gesture.pack(side=tk.LEFT, padx=12)

        self.lbl_action = tk.Label(metrics_bar, text="Action: IDLE", font=("Consolas", 10, "bold"), fg=ACCENT_GREEN, bg=BG_CARD)
        self.lbl_action.pack(side=tk.RIGHT, padx=12)

        # RIGHT COLUMN: Control Panel & Guides
        right_col = tk.Frame(main_container, bg=BG_DARK, width=420)
        right_col.pack(side=tk.RIGHT, fill=tk.BOTH, padx=(10, 0))
        right_col.pack_propagate(False)

        # Controls Card
        ctrl_card = tk.LabelFrame(right_col, text=" Control Center ", fg=ACCENT_CYAN, bg=BG_CARD, font=("Segoe UI", 10, "bold"), padx=14, pady=12, highlightbackground=BORDER_COLOR, highlightthickness=1)
        ctrl_card.pack(fill=tk.X, pady=(0, 12))

        btn_row = tk.Frame(ctrl_card, bg=BG_CARD)
        btn_row.pack(fill=tk.X, pady=6)

        self.btn_start = ttk.Button(btn_row, text="▶ START", style="Start.TButton", command=self._on_start_clicked)
        self.btn_start.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=3)

        self.btn_stop = ttk.Button(btn_row, text="⏹ STOP", style="Stop.TButton", command=self._on_stop_clicked)
        self.btn_stop.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=3)

        self.btn_emergency = ttk.Button(ctrl_card, text="⚠ EMERGENCY STOP (ESC)", style="Emergency.TButton", command=self._on_emergency_stop_clicked)
        self.btn_emergency.pack(fill=tk.X, pady=(6, 2))

        # Gesture Guide Card
        guide_card = tk.LabelFrame(right_col, text=" Gesture Reference ", fg=ACCENT_PURPLE, bg=BG_CARD, font=("Segoe UI", 10, "bold"), padx=14, pady=10, highlightbackground=BORDER_COLOR, highlightthickness=1)
        guide_card.pack(fill=tk.X, pady=(0, 12))

        guides = [
            ("☝ Index Only", "Move Mouse Cursor smoothly"),
            ("✌ 2 Fingers (Index+Middle)", "Double-Click to open file/app"),
            ("🖐 3 Fingers (Index+Mid+Ring)", "Minimize Active Window"),
            ("✋ 5 Fingers Open", "Close Window (Alt+F4 after 1s hold)"),
            ("🤏 Pinch (Thumb+Index)", "Zoom In (Apart) / Out (Closer)"),
            ("🖐 4 Fingers Extended", "Scroll Up/Down with hand motion")
        ]

        for g_name, g_desc in guides:
            row = tk.Frame(guide_card, bg=BG_CARD)
            row.pack(fill=tk.X, pady=2)
            lbl_k = tk.Label(row, text=g_name, font=("Segoe UI", 9, "bold"), fg=TEXT_PRIMARY, bg=BG_CARD, anchor="w", width=22)
            lbl_k.pack(side=tk.LEFT)
            lbl_v = tk.Label(row, text=g_desc, font=("Segoe UI", 8), fg=TEXT_MUTED, bg=BG_CARD, anchor="w")
            lbl_v.pack(side=tk.LEFT, fill=tk.X, expand=True)

        # Activity Log Card
        log_card = tk.LabelFrame(right_col, text=" Activity History ", fg=TEXT_PRIMARY, bg=BG_CARD, font=("Segoe UI", 10, "bold"), padx=10, pady=8, highlightbackground=BORDER_COLOR, highlightthickness=1)
        log_card.pack(fill=tk.BOTH, expand=True)

        self.log_list = tk.Listbox(log_card, bg="#0B0F19", fg=TEXT_MUTED, font=("Consolas", 8), selectbackground=BG_CARD_LIGHT, borderwidth=0, highlightthickness=0)
        self.log_list.pack(fill=tk.BOTH, expand=True)

    def _build_status_bar(self):
        """Bottom status bar."""
        self.status_bar = tk.Label(self.root, text="System Ready. Click Start to begin gesture control.", font=("Segoe UI", 9), fg=TEXT_MUTED, bg=BG_CARD, anchor="w", padx=16, pady=4)
        self.status_bar.pack(fill=tk.X, side=tk.BOTTOM)

    def _on_start_clicked(self):
        self.is_started = True
        self.is_emergency_stop = False
        self.status_chip.config(text="ACTIVE", fg="#FFFFFF", bg=ACCENT_GREEN)
        self.status_bar.config(text="Gesture control active. Move index finger to steer mouse.")
        self.log_event("Control started.")
        if self.on_start_cb:
            self.on_start_cb()

    def _on_stop_clicked(self):
        self.is_started = False
        self.status_chip.config(text="STOPPED", fg="#9CA3AF", bg="#374151")
        self.status_bar.config(text="Gesture control stopped.")
        self.log_event("Control stopped.")
        if self.on_stop_cb:
            self.on_stop_cb()

    def _on_emergency_stop_clicked(self):
        self.is_started = False
        self.is_emergency_stop = True
        self.status_chip.config(text="EMERGENCY LOCK", fg="#FFFFFF", bg=ACCENT_RED)
        self.status_bar.config(text="EMERGENCY STOP TRIGGERED. All actions frozen. Click Start to reset.")
        self.log_event("EMERGENCY STOP TRIGGERED.")
        if self.on_emergency_stop_cb:
            self.on_emergency_stop_cb()

    def log_event(self, text: str):
        """Appends timestamped event to activity list."""
        if self.root and self.log_list:
            timestamp = time.strftime("%H:%M:%S")
            self.log_list.insert(0, f"[{timestamp}] {text}")
            if self.log_list.size() > 60:
                self.log_list.delete(60, tk.END)

    def push_update(self, data: Dict[str, Any]):
        """Thread-safe method to push frame & telemetry data from background worker."""
        try:
            self.update_queue.put_nowait(data)
        except queue.Full:
            pass

    def _process_queue_events(self):
        """Executed on Tkinter main thread every 16ms."""
        if not self.root:
            return

        try:
            while not self.update_queue.empty():
                data = self.update_queue.get_nowait()
                self._apply_update(data)
        except queue.Empty:
            pass

        self.root.after(16, self._process_queue_events)

    def _apply_update(self, data: Dict[str, Any]):
        """Updates GUI widgets with data received from worker thread."""
        if "fps" in data:
            self.lbl_fps.config(text=f"FPS: {data['fps']:.1f}")
        if "latency" in data:
            self.lbl_latency.config(text=f"Latency: {data['latency']:.1f}ms")
        if "gesture" in data:
            self.lbl_gesture.config(text=f"Gesture: {data['gesture']}")
        if "action" in data:
            self.lbl_action.config(text=f"Action: {data['action']}")
        if "action_log" in data:
            self.log_event(data["action_log"])

        # Update video frame if PIL and image are available
        if "image" in data and PIL_AVAILABLE and ImageTk is not None:
            try:
                img = data["image"]
                canvas_w = self.video_canvas.winfo_width()
                canvas_h = self.video_canvas.winfo_height()
                if canvas_w > 50 and canvas_h > 50:
                    img = img.resize((canvas_w, canvas_h), Image.Resampling.BILINEAR)
                self.current_photo = ImageTk.PhotoImage(image=img)
                self.video_canvas.create_image(0, 0, anchor=tk.NW, image=self.current_photo)
            except Exception as e:
                logger.debug("Canvas render update error: %s", e)

    def run(self):
        """Starts Tkinter main loop."""
        if self.root:
            self.is_running = True
            self.root.mainloop()

    def on_close(self):
        """Cleanup on close."""
        self.is_running = False
        if self.on_stop_cb:
            self.on_stop_cb()
        if self.root:
            self.root.destroy()
            self.root = None
