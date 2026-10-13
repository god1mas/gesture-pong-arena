# Gesture Pong Arena

Gesture Pong Arena is an interactive, webcam-controlled Pong game. Move your index finger in front of the camera to control the player paddle, compete against an AI opponent, and customize each match with difficulty and winning-score settings.

The project uses **HTML**, **CSS**, **Vanilla JavaScript**, **HTML5 Canvas**, and **MediaPipe Hands**. Camera processing stays in the browser; the application does not record or upload webcam footage.

## Features

- Webcam-based paddle control using hand landmarks.
- Real-time camera and hand-tracking status.
- Modern, responsive arcade interface.
- AI opponent with Easy, Normal, and Hard difficulty levels.
- First to 5 or First to 10 winning conditions.
- Match result overlay with final score and outcome.
- Play Again and Restart Match controls.
- Start, pause, and resume states with the `P` keyboard shortcut.
- Horizontal and vertical arena modes.
- Player and AI side switching.
- Camera preview toggle while hand tracking remains active.
- Fullscreen gameplay.
- Procedurally generated sound effects using the Web Audio API.

## Getting Started

### Requirements

- A modern browser with webcam and WebAssembly support, preferably Chrome or Edge.
- A webcam and permission to access it.
- An internet connection to load MediaPipe Hands and its model files from the CDN.
- VS Code with the Live Server extension, or Python for a local HTTP server.

### Clone the repository

```bash
git clone https://github.com/god1mas/gesture-pong-arena.git
cd gesture-pong-arena
```

### Run with VS Code Live Server

1. Open the project folder in VS Code.
2. Open `index.html`.
3. Select **Open with Live Server** or click **Go Live**.
4. Open the local URL provided by Live Server.

### Run with a local HTTP server

```bash
python -m http.server 4173
```

Open `http://localhost:4173` in your browser.

When prompted, allow camera access. Run the project through `localhost` or `127.0.0.1` instead of opening `index.html` directly with a `file://` URL.

## How to Play

1. Choose an AI difficulty: **Easy**, **Normal**, or **Hard**.
2. Select a winning score: **5 Points** or **10 Points**.
3. Keep one hand clearly visible in the camera frame.
4. Select **Start** or press `P`.
5. Move your index finger to guide the blue player paddle.
6. Send the ball past the purple AI paddle to score.
7. The first side to reach the selected score wins the match.

Use **Play Again** to start another match with the same settings. Use **Restart Match** to reset the score to 0–0 and unlock the match settings. The toolbar also provides controls for arena rotation, side switching, camera preview, and fullscreen mode.

## Project Structure

```text
gesture-pong-arena/
├── index.html       # Application layout, controls, settings, and overlays
├── style.css        # Responsive arcade UI and component styling
├── script.js        # MediaPipe integration, rendering, game logic, and AI
├── screenshot.png   # Screenshot asset inherited from the original project
├── README.md        # Project documentation
└── LICENSE          # Original MIT License and copyright notice
```

## Development Changes

### Phase 1 — UI and Tracking Status

- Redesigned the interface as Gesture Pong Arena.
- Added a responsive scoreboard, toolbar, sensor panel, and playing guide.
- Added real-time camera and hand-detection states with debouncing.
- Updated Canvas visuals while retaining the existing ball physics and collision system.

### Phase 2 — Difficulty and Winning System

- Added centralized Easy, Normal, and Hard AI configurations.
- Added First to 5 and First to 10 match targets.
- Added explicit idle, playing, paused, and finished match states.
- Added match results, final scores, Play Again, Restart Match, and settings locking.

## Credits and Attribution

This project is based on the open-source [Hand-Tracking Pong project by alyhxn](https://github.com/alyhxn/hand-tracking-pong).

It extends and modifies the original project and was not created entirely from scratch. The original game architecture, MediaPipe-based controls, and other foundational work remain credited to the original author.

## License

This project is distributed under the MIT License used by the original repository. The original copyright notice and license text are preserved in [LICENSE](LICENSE).

The presence of modifications and additional features does not constitute a claim of ownership over the entire original source code.
