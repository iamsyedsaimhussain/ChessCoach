# ChessCoach

Your personal chess coach. Enter a Chess.com username → loads your public games from the free Chess.com Public API → Stockfish 19 (running directly in your browser) reviews them → identifies the habits and leaks costing you rating points.

---

## Complete Features

### 1. Game Review & Move Explanations
- **Stockfish 19 In-Browser Engine**: Client-side single-thread Web Worker analysis (Quick depth 10, Standard depth 12, Deep depth 16).
- **Advanced Move Breakdown**: Rule-based plain-English explanation for every mistake or blunder (Material loss, hanging pieces, missed tactics, king safety concessions, missed mates, and positional errors).
- **Interactive Move Navigation**: Step forward/back with arrow keys, click moves or blunder summaries, flip board, interactive eval bar, and best-move arrows.
- **Time per Move Tracking**: Parses PGN `{[%clk]}` comments to compute precise seconds spent on each move; interactive SVG time-per-move bar chart and active move note ("You spent 24 s").
- **Batch Review**: "Review all games" sequential analysis at quick depth 10 with stoppable progress bar.

### 2. Personal Chess Intelligence & "My Leaks"
- **Top 3 Weaknesses**: Dynamic identification of phase vulnerabilities, tactical blunders, black piece performance, and time trouble with direct action buttons.
- **Time-Trouble Leak**: Detection of slow mistakes (>30s), rushed blunders (<3s), and games lost on time.
- **Interactive Opening Details**: Click any opening to inspect all played games and average move number where your first mistake typically occurs.
- **Weekly Plan v2**: Maximum 3 actionable improvement recommendations linking directly to tailored practice modes.
- **Rating Progression Chart**: Lightweight responsive SVG rating trends across Rapid, Blitz, Bullet, and Daily time controls.

### 3. Unified Practice & Tactical Puzzles
- **Randomized Training Queue**: Merges blunder puzzles from your own games, endgame drills, and tactical challenges into a single, seamless, randomized queue.
- **"From Your Game" Blunder Marker**: Positions generated from your own reviews are prominently badged with `🚨 From Your Game`, showing the opponent, the move you originally played, and the evaluation loss.
- **Endgame & Core Technique**: Integrated endgame technique drills (Opposition, Pawn Promotion, King & Rook box mate, King & Queen mate) alongside tactical positions.
- **Interactive Move Freedom**: Play any legal chess move on your side with standard legal move dots and capture rings. If you make a mistake, the move remains on the board with an instant "↺ Try Again" button to learn through experimentation.
- **Spaced Repetition & Streak Tracking**: Tracks consecutive correct answers and saves completion history in `localStorage`.

### 5. Opening Lab & Personal Repertoire
- **Repertoire Breakdown**: Separate White and Black repertoires showing games count, win/loss/draw %, accuracy, and blunder frequency.
- **Move Variation Trees**: Automatically extracts actual variation sequences played in your games.
- **Opening Favorites**: Star and save favorite openings.
- **Direct Opening Practice**: Quick launch to practice positions from your opening games.

### 6. Progress Dashboard & Daily Training
- **Date Filters**: Compare performance across 7 Days, 30 Days, or Lifetime.
- **Side-by-Side Comparison**: "This week vs last week" card comparing accuracy, blunders per game, and puzzles solved.
- **Accuracy Progression Chart**: SVG curve of game-by-game move accuracy.
- **Personalized Daily Session**: 3 daily training recommendations with streak tracking.

### 7. Universal Device & Low-End Hardware Optimization
- **Hardware Detection**: Automatically detects device CPU cores (`hardwareConcurrency`) and memory (`deviceMemory`) to choose an optimal Stockfish depth (Depth 8 for budget phones, 10 for mid-range, 12 for desktop).
- **Engine Throttling Safety**: Adaptive evaluation timeouts (1800ms limit on budget devices, 3000ms on desktop) prevent CPU freeze and thermal battery drain.
- **Transposition Cache & Micro-Yielding**: Repeated game positions are instantly resolved from memory (`fenCache`), and micro-yielding ensures 60 FPS UI/touch responsiveness during analysis.
- **Dynamic Code Splitting**: Heavy sub-pages (Lessons, Openings, Puzzles, Progress) are lazy-loaded on demand, cutting initial JS bundle down to ~41 KB gzip.
- **Virtual DOM / Mobile CSS**: `content-visibility: auto`, `overscroll-behavior: contain`, and `touch-action: manipulation` provide native-app smoothness on budget 390px mobile screens.
- **Proactive Quota Management**: 5-minute API memory caching and auto-pruned `localStorage` preventing storage overflow and slow JSON parsing.

---

## Tech Stack & Architecture
- **Vanilla JavaScript + Vite**: Ultra-fast, zero-framework, static deployment.
- **Chessground & Chess.js**: Board UI and legal move generation.
- **Client-Side Stockfish 19**: Runs inside a Web Worker from `public/engine/`.
- **Storage**: Safe `localStorage` persistence with error handling and backward compatibility.
- **Zero Paid APIs / Zero Backend**: 100% free, static-host ready (Vercel, Netlify, GitHub Pages).

---

## Project Structure

Following the clean modular design style of the `reign` project:

```text
chess/
├── public/                     # Static assets served at root /
│   ├── engine/                 # Stockfish 19 lite WASM, worker script & license
│   │   ├── stockfish-19-lite-single.js
│   │   ├── stockfish-19-lite-single.wasm
│   │   └── STOCKFISH-LICENSE.txt
│   └── puzzles.json            # Bundled offline fallback puzzle dataset
├── src/                        # Modular frontend source code
│   ├── components/             # Reusable UI & visualization components
│   │   └── charts.js           # SVG Rating trend & Time per move charts
│   ├── engine/                 # Chess analysis, Stockfish Web Worker bridge & clocks
│   │   ├── analysis.js         # Move evaluation, classification & accuracy
│   │   ├── clocks.js           # PGN clock parser & time tracker
│   │   ├── engine.js           # Stockfish worker interface & hardware concurrency detection
│   │   └── explanations.js     # Rule-based natural language move explanations
│   ├── pages/                  # Page views & feature controllers (lazy-loaded)
│   │   ├── intel.js            # Personal Chess Intelligence & Top 3 Weaknesses
│   │   ├── leaks.js            # My Leaks dashboard
│   │   ├── lessons.js          # Interactive Lessons & Endgame Trainer
│   │   ├── openings.js         # Opening Lab & Repertoire
│   │   ├── progress.js         # Progress & Weekly Comparison
│   │   ├── puzzles.js          # Blunder Puzzles & Spaced Repetition (SRS)
│   │   └── review.js           # Game Review & interactive board
│   ├── services/               # Data access, APIs & storage
│   │   ├── api.js              # Chess.com Public API client with 5-minute cache
│   │   ├── state.js            # Global reactive app state
│   │   └── storage.js          # LocalStorage persistence & puzzle query helpers
│   ├── styles/                 # Theme and component styles
│   │   └── style.css           # Chess.com dark theme, layout, components, mobile responsive
│   ├── utils/                  # General utilities & formatters
│   │   └── util.js             # Escaping, labels, date formatting
│   └── main.js                 # App entry point, router, layout shell, batch runner
├── index.html                  # HTML entry point (references /src/main.js)
├── package.json                # Project dependencies & npm scripts
├── package-lock.json           # Locked dependency tree
├── vite.config.js              # Vite configuration (server, build targets, output)
├── vercel.json                 # Vercel deployment configuration & engine caching headers
├── .gitignore                  # Git ignore rules (node_modules, dist, etc.)
├── README.md                   # Complete documentation
└── Run-ChessCoach.bat          # One-click ASCII banner launcher (Node check + auto-run)
```

---

## Run Locally

### One-Click Opener (Windows)
Double-click **`Run-ChessCoach.bat`** in the project directory. It automatically checks your Node.js environment, synchronizes dependencies if missing, starts the Vite development server, and opens ChessCoach directly in your default web browser at `http://localhost:5173`.

### Via Command Line
```bash
npm install
npm run dev
```

## Production Build & Deployment

### Build Locally
```bash
npm run build
```
Outputs static bundle to `dist/`.

### Deploy to Vercel
1. Push or import the repository into your Git provider (GitHub, GitLab, Bitbucket).
2. Connect the project in Vercel.
3. Framework Preset: **Vite**
4. Root Directory: `./` (or leave default root)
5. Build Command: `npm run build`
6. Output Directory: `dist`
7. Click **Deploy**. The included `vercel.json` automatically configures immutable 1-year caching for the Stockfish WASM engine.
