# OpenOA — Free Online Assessment Practice Desk

OpenOA is a modern, lightweight, offline-first practice platform for technical and aptitude Online Assessments (OAs). It contains **1,700+ practice questions** with verified answer keys, interactive coding drills with in-browser execution (Python via Pyodide, SQL via SQLite WASM, and JavaScript), listening comprehension tests, game-based aptitude puzzles, and optional AI explanations via OpenRouter / OpenAI / Claude / Gemini.

---

## ✨ Features

- 🎯 **Company OA Question Banks**: Curated tests simulating assessment patterns for top tech companies:
  - Accenture (Critical Reasoning, Abstract Reasoning, Coding)
  - Cognizant (Quantitative, Verbal, Listening Drills with audio)
  - Infosys (Pseudocode, Puzzle Solving, Verbal, Reasoning)
  - Infineon (Core Electronics, Microcontrollers, Digital Logic, C/C++)
  - Visa (Algorithms, Data Structures, SQL, System Design)
- ⚡ **In-Browser Code Execution**:
  - **Python**: Real client-side Python execution using Pyodide WebAssembly.
  - **SQL**: In-memory relational database powered by SQL.js (SQLite WASM).
  - **JavaScript**: Safe sandbox execution.
- 🎧 **Cognizant Listening Drills**: Includes 30 high-quality audio clips and synced comprehension questions.
- 🧩 **Interactive Aptitude Games & Drills**: Abstract pattern recognition, grid puzzles, and speed tests.
- 🤖 **AI Explanations & Mock Reviews**:
  - OpenRouter OAuth (1-click sign in / BYOK)
  - Support for OpenAI, Anthropic Claude, Google Gemini, and DeepSeek keys.
  - Instant hint generation, code reviews, and solution breakdowns.
- 🎨 **Themes**:
  - **Swiss** (Clean minimalist dark / cyan)
  - **Paper** (Warm editorial cream / rust)
  - **Slate** (Dark graphite / amber)
  - **Terminal** (Hacker green phosphor / monospace)
- 💾 **100% Offline-Capable & Privacy First**:
  - All progress, attempts, and API keys are stored locally in your browser (`localStorage`).
  - No account registration required. Zero tracking.

---

## 🚀 Getting Started

### Option 1: Direct File Serving / Local Server

Since OpenOA is built with standard web technologies (HTML5, Vanilla CSS, JS, WebAssembly), you can run it using any static HTTP server.

```bash
# Using Python 3 built-in server
python -m http.server 8080

# Or using Node http-server / npx serve
npx serve .
```

Open your browser and navigate to `http://localhost:8080`.

### Option 2: Deploying to Vercel / Cloudflare Pages / GitHub Pages

OpenOA is pre-configured for static hosting:
- Includes `vercel.json` with security headers and WASM MIME types.
- Works out of the box on GitHub Pages, Cloudflare Pages, Netlify, or AWS S3.

---

## 📁 Project Structure

```
├── index.html              # Main application shell & UI views
├── style.css               # Design system & theme stylesheets
├── app.js                  # App bootstrap and initialization
├── app-core.js             # Navigation, question viewer, state management
├── app-coding.js           # Code runner (Pyodide WASM, SQL.js, CodeMirror editor)
├── app-games.js            # Interactive aptitude games & puzzles
├── app-ai.js               # AI assistant & OpenRouter integration
├── data.js                 # Question banks & assessment datasets
├── audio/                  # Audio files for listening comprehension drills
├── vendor/                 # Offline dependencies (Pyodide, CodeMirror, SQL WASM)
├── site.webmanifest        # PWA manifest
├── vercel.json             # Vercel deployment configuration
└── README.md
```

---

## 🔒 Security & Privacy

- All assessment practice is done strictly client-side.
- Your progress data never leaves your device.
- API keys (OpenRouter / OpenAI / Anthropic / Gemini) are saved only in your local browser storage and used for direct API calls to the respective provider.

---

## 📄 License

MIT License — Feel free to use, share, and contribute!
