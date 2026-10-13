# VisionGrip AI - Hand Gesture Computer Control System

A high-performance, real-time computer vision system that translates natural hand gestures into precise operating system controls using **Python 3**, **OpenCV**, **MediaPipe**, **PyAutoGUI**, and **Tkinter**, paired with an interactive modern web dashboard.

---

## 🖐️ Gesture Control Specifications

| Gesture | Hand Geometry | Action Triggered | Safety / Behavior |
| :--- | :--- | :--- | :--- |
| **Index Finger Only** | Index extended, middle/ring/pinky folded | **Move Cursor** | Velocity-adaptive exponential smoothing |
| **2 Fingers (Index + Middle)** | Index + Middle extended, ring/pinky folded | **Double-Click** | Opens files, folders, and applications (0.65s cooldown) |
| **3 Fingers (Index + Mid + Ring)**| Index + Middle + Ring extended | **Minimize Window** | Minimizes current active window |
| **5 Fingers Open** | All 5 fingers extended | **Close Window (Alt+F4)** | **1.0-Second Hold** with visible circular countdown HUD |
| **Pinch (Thumb + Index)** | Thumb tip and Index tip touching | **Zoom In / Out** | Spreading apart zooms in; closing together zooms out |
| **4 Fingers Extended** | Index, Middle, Ring, Pinky extended | **Vertical Scroll** | Moving hand upward scrolls up; downward scrolls down |

---

## 🏛️ Modular Project Architecture

```
├── config.py                 # Dataclasses for camera, gesture thresholds, smoothing & safety
├── geometry_utils.py         # 3D vector math, joint angle calculation & adaptive EMA smoother
├── gesture_recognizer.py     # Mutually exclusive geometric gesture state machine & timers
├── controller.py             # PyAutoGUI wrapper with failsafe, click debouncing & window actions
├── hand_tracker.py           # MediaPipe Hands wrapper, right-hand isolation & cyber HUD
├── ui.py                     # Modern dark Tkinter dashboard with thread-safe queue updates
├── main.py                   # Main application entrypoint and worker thread coordinator
├── tests/                    # Comprehensive unit tests
│   ├── test_gesture_recognizer.py
│   ├── test_coordinate_mapping.py
│   └── test_safety_system.py
├── requirements.txt          # Python dependencies
└── README.md                 # Documentation and launch instructions
```

---

## 🚀 Quick Start & VS Code Terminal Commands

### 1. Prerequisites
- **Python 3.10+**
- Working webcam

### 2. Setup Virtual Environment (Recommended)

```bash
# Windows (PowerShell)
python -m venv venv
.\venv\Scripts\Activate.ps1

# macOS / Linux
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

> **Note for Linux users:** If running on Ubuntu/Debian, install Tkinter system package if missing:
> ```bash
> sudo apt-get update && sudo apt-get install -y python3-tk xdotool
> ```

### 4. Run Unit Tests (15/15 Tests)

```bash
python3 -m unittest discover -s tests -v
```

### 5. Launch Application in VS Code

```bash
# Launch with modern Dark Dashboard GUI (default webcam index 0)
python3 main.py

# Launch on secondary webcam index 1 with custom sensitivity
python3 main.py --camera 1 --sensitivity 1.4

# Launch in headless CLI mode (no Tkinter window)
python3 main.py --no-gui
```

---

## 🛡️ Safety & Reliability Features

1. **Explicit Enable Toggle**: All actions are locked in standby until **Start** is pressed in the UI.
2. **Emergency Failsafe**:
   - PyAutoGUI corner failsafe is permanently active (`FAILSAFE = True`). Slam cursor to screen corner to immediately abort.
   - Press **Escape (`Esc`)** at any time to trigger an instant software lock.
3. **Accidental Close Protection**: 5-finger open requires a continuous **1.0-second hold** with a visible circular countdown timer. If the hand posture is broken before 1.0s, the timer instantly resets.
4. **Debouncing & Cooldowns**: Double-click (0.65s) and Minimize (1.2s) actions are debounced to prevent duplicate rapid executions.
5. **Right Hand Isolation**: Handedness is verified with mirror-compensation to reject left hand or background artifacts.
6. **Thread Separation**: Camera capture and MediaPipe inference run on a dedicated worker thread, keeping the GUI running at a fluid 60 FPS without frame lag.
