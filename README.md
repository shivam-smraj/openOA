# OA Open — Free Online Assessment Practice Platform

OA Open is an ultra-fast, modern, offline-first practice platform for technical and aptitude Online Assessments (OAs). It contains **1,798+ curated practice questions** with verified answer keys, interactive coding drills with in-browser WebAssembly execution (Python via Pyodide, SQL via SQLite WASM, and JavaScript), listening comprehension audio drills, game-based aptitude puzzles, and AI explanations and frontend code reviews via Google Gemini API.

---

## ✨ Features

- 🎯 **Company OA Question Banks**: Curated tests simulating assessment patterns for top tech companies:
  - **Accenture**: Critical Reasoning, Abstract Reasoning, MS Office, Networking & Cloud, Core CS, and Coding Lab (111 tasks).
  - **Cognizant**: Quantitative, Verbal, Listening Drills with 30 synced audio clips, AI Prompt Engineering, and RAG Drills.
  - **Infosys**: Pseudocode Tracing, Lateral Logic Puzzles, Verbal, Reasoning, and Specialist Programmer Coding.
  - **Infineon**: Core Electronics, Microcontrollers (8051/ARM), Digital Logic, Embedded C/C++.
  - **Visa**: Algorithms, Data Structures, and Problem Solving across 33 topic families (90 problems).
- ⚡ **In-Browser Code Execution**:
  - **Python**: Real client-side Python execution using Pyodide WebAssembly.
  - **SQL**: In-memory relational database powered by SQL.js (SQLite WASM).
  - **JavaScript**: Sandboxed instant execution.
  - **Frontend**: Live HTML, CSS, and JS preview sandbox.
- 🎧 **Cognizant Listening Drills**: 30 high-quality audio clips and synced comprehension questions.
- 🧩 **Interactive Aptitude Games & Drills**: Key Maze (with responsive D-pad & keyboard controls), Arithmetic Order (speed mental math), and Matrix Flow.
- 🤖 **AI Explanations & Frontend Code Evaluation**:
  - Built-in automatic key rotation with Google Gemini API (`gemini-3.6-flash`, `gemini-3.5-flash`, etc.).
  - Automated rubric evaluation of student HTML/CSS/JS frontend submissions.
  - Optional custom Gemini API key override in local storage.
  - In-browser speech recognition (STT) and voice feedback (TTS).
- 🎨 **Modern Themes**:
  - **Cyber (Default)**: Sleek obsidian dark (`#080a11`), electric cyan (`#00e5ff`), and vibrant violet glow.
  - **Paper**: Warm ceramic light, deep charcoal ink, and terracotta rust accent.
  - **Slate**: Dark graphite with warm amber accents.
  - **Terminal**: Phosphor emerald green with high-contrast monospace styling.
- 💾 **100% Offline-Capable & Privacy First**:
  - All progress, attempts, notes, bookmarks, and API keys are stored locally in your browser (`localStorage`).
  - No account registration required. Zero telemetry, zero tracking.

---

## 🚀 Getting Started

### Option 1: Direct File Serving / Local Server

Since OA Open is built with standard web standards (HTML5, Vanilla CSS, JS, WebAssembly), you can run it using any static HTTP server:

```bash
# Using Python 3 built-in server
python -m http.server 8080

# Or using Node http-server / npx serve
npx serve .
```

Open your browser and navigate to `http://localhost:8080`.

### Option 2: Deploying to Vercel / Cloudflare Pages / GitHub Pages

OA Open is pre-configured for instant zero-configuration static deployment:
- Includes `vercel.json` with security headers and `.wasm` WebAssembly MIME types.
- Works out of the box on Vercel (`npx vercel`), Cloudflare Pages, Netlify, or GitHub Pages.

---

## 📁 Project Structure

```
├── index.html              # Main application shell & UI views
├── style.css               # Modern design system & theme engine
├── app.js                  # App bootstrap and initialization
├── app-core.js             # Navigation, question viewer, state management, progress backup
├── app-coding.js           # In-browser Code Studio (Pyodide WASM, SQL.js, CodeMirror editor)
├── app-games.js            # Interactive aptitude games & puzzles
├── app-ai.js               # AI assistant & Google Gemini API integration
├── data.js                 # 1,798 curated questions & assessment datasets
├── audio/                  # 30 audio clips for Cognizant listening drills
├── vendor/                 # Offline dependencies (Pyodide, CodeMirror, SQL.js WASM)
├── site.webmanifest        # PWA manifest
├── vercel.json             # Vercel deployment configuration
└── README.md
```

---

## 🔒 Security & Privacy

- All assessment practice is executed strictly client-side.
- Your progress data never leaves your device.
- API keys (Google Gemini) are saved only in your local browser storage and used for direct API calls to `generativelanguage.googleapis.com`.

---

## 📄 License

MIT License — Free for everyone, forever.
