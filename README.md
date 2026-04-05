# AI for Write — Your AI Novel Co-Author

> **Stop staring at a blank page. Let AI write with you — not for you.**

A fully **browser-based** AI writing assistant that helps you write novels, stories, and long-form fiction. Powered by Google Gemini 2.5 Pro. Zero backend. Zero data leaks. Everything runs locally in your browser.

![Version](https://img.shields.io/badge/version-0.2.0-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Stack](https://img.shields.io/badge/stack-React%2019%20%2B%20TypeScript%20%2B%20Vite-blueviolet)
![AI](https://img.shields.io/badge/AI-Gemini%202.5%20Pro-orange)
![Storage](https://img.shields.io/badge/storage-100%25%20local%20IndexedDB-green)

---

## 🚀 What It Does

You write a few sentences. AI continues. You decide what stays.

**AI for Write** acts like a co-author sitting next to you — it knows your characters, remembers your worldbuilding, matches your writing style, and keeps the story consistent across chapters. All without sending your manuscript to any cloud.

```
You write:  "She stepped into the rain, heart pounding, knowing he was watching—"
AI writes:  [3 paragraphs of tension, matching your tone, style, and character history]
You decide: Accept with Tab. Reject with Esc. It's your story.
```

---

## ✨ What's New in v0.2

| Feature | Description |
|---------|-------------|
| 🎬 **Scene Templates** | 10 built-in scene starters (conflict, flashback, inner monologue…) — insert at cursor in one click |
| 🍅 **Focus Mode + Pomodoro** | Distraction-free writing with a built-in 25/5 timer. Tracks words written per session |
| ⏹ **Abort AI Streams** | Reject AI output mid-stream — no more waiting for a bad continuation to finish |
| ⌨️ **Shortcut Help Panel** | Press `?` to see all keyboard shortcuts in an overlay |
| 📊 **Writing Stats Dashboard** | Daily word counts, 7-day bar chart, AI accept rate — know how productive you actually are |
| 🔧 **Settings Migration** | `schemaVersion` field + migration runner — your settings survive future updates safely |

---

## 🧠 Core Features

### AI Writing Engine
- **Continue Writing** — streams new content based on your text, memory context, and previous chapter tail
- **Polish & Rewrite** — select any passage and get an AI-polished version side-by-side before accepting
- **Multi-Version** — generate 3 different continuations and pick the best one
- **Cancel anytime** — AbortController kills the stream the moment you press Esc

### Long-Term Memory System
- Store characters, worldbuilding, writing rules, style preferences
- Auto-injects relevant memories before each AI call using keyword scoring
- When context overflows, older sections are compressed into summaries automatically
- 7 **Truth Files** per book: `current_state`, `particle_ledger`, `pending_hooks`, `chapter_summaries`, `character_arcs`, `world_rules`, `timeline`

### Book & Chapter Management
- Multi-book, multi-chapter hierarchy with drag-to-reorder
- Auto-save every 800ms via IndexedDB
- Cross-chapter full-text search (`Ctrl+Shift+F`)
- Version snapshots with pin-to-protect (won't be auto-deleted)
- Outline planning board with AI-generated chapter suggestions

### Privacy by Design
- **Zero backend** — no server, no relay, no analytics
- API key stored in `localStorage` only — never transmitted anywhere except directly to Google's API
- All manuscript data lives in **IndexedDB on your device**

---

## ⚡ Quickstart

### You need
- Node.js 18+
- A free [Gemini API Key](https://aistudio.google.com/app/apikey) from Google AI Studio

### Run it
```bash
git clone https://github.com/tang-0518/AI-.git
cd AI-
npm install
npm run dev
```

Open `http://localhost:5173` → paste your API key in Settings → start writing.

### Deploy it (static, free)
```bash
npm run build
# Upload dist/ to Vercel / Netlify / GitHub Pages — done.
```

### Optional: pre-fill API key via env
```bash
# .env.local (never committed to git)
VITE_GEMINI_API_KEY=your_key_here
VITE_GEMINI_MODEL=gemini-2.5-pro
```

---

## ⌨️ Keyboard Shortcuts

| Keys | Action |
|------|--------|
| `Ctrl + Enter` | AI Continue Writing |
| `Ctrl + Shift + Enter` | AI Polish |
| `Tab` | Accept AI suggestion |
| `Esc` | Reject / cancel AI stream |
| `Ctrl + F` | Find |
| `Ctrl + H` | Find & Replace |
| `Ctrl + Shift + F` | Full-book search |
| `Ctrl + =` / `-` | Font size up / down |
| `?` | Show all shortcuts |

---

## 🏗 Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript |
| Build | Vite 8 |
| AI | Google Gemini API (SSE streaming) |
| Storage | IndexedDB — zero backend |
| Styling | Pure CSS, dark theme, 4 color schemes |

---

## 📁 Project Structure

```
src/
├── api/
│   ├── gemini.ts              # Gemini streaming + polish (AbortController)
│   ├── cache.ts               # L1/L2 dual-layer request cache
│   └── contextCompression.ts  # Auto-compact long context into summaries
├── components/
│   ├── Editor.tsx             # Core editor (ghost text, audit layer)
│   ├── Sidebar.tsx            # Book + chapter two-level sidebar
│   ├── CommandBar.tsx         # Continue / Polish / Multi-version bar
│   ├── SceneTemplates.tsx     # 10 scene template quick-inserts  [NEW v0.2]
│   ├── FocusModeOverlay.tsx   # Pomodoro focus timer overlay      [NEW v0.2]
│   ├── StatsPanel.tsx         # Writing stats dashboard           [NEW v0.2]
│   ├── ShortcutHelpPanel.tsx  # Keyboard shortcut help            [NEW v0.2]
│   ├── MemoryPanel.tsx        # Long-term memory manager
│   ├── OutlinePanel.tsx       # Chapter outline planning board
│   ├── SnapshotPanel.tsx      # Version history with pin
│   └── ConsistencyPanel.tsx   # AI plot consistency checker
├── hooks/
│   ├── useEditor.ts           # Editor state + AI calls + AbortController
│   ├── useBooks.ts            # Book + chapter CRUD (IndexedDB)
│   ├── useMemory.ts           # Memory CRUD + relevance scoring
│   ├── useFocusTimer.ts       # Pomodoro timer state machine        [NEW v0.2]
│   ├── useWritingStats.ts     # Daily word count + AI accept rate   [NEW v0.2]
│   └── useSnapshots.ts        # Chapter snapshots with pin/limit
├── utils/
│   └── settingsMigration.ts   # Schema-versioned settings migration [NEW v0.2]
└── types.ts                   # Global types + DEFAULT_SETTINGS
```

---

## 🗺 Roadmap

- [ ] Dialogue generator panel
- [ ] Paragraph rewrite mode (3 angles)
- [ ] Foreshadowing tracker with inline annotations
- [ ] Character card system (appearance / personality / relationships)
- [ ] Cross-chapter timeline visualization
- [ ] Plot hole detection (full-book AI analysis)
- [ ] IndexedDB unified repository abstraction

---

## License

MIT — free to use, fork, and build on.
