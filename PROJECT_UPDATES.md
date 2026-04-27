# Project Updates

## 2026-04-17

### Sprint 3 UI polish: unified Plot sub-tabs and shared sidebar cards
- Refactored the Plot tab into `节拍 / 伏笔 / 钩子` sub-tabs, removing the old stacked layout so each tool now lives inside the same sidebar shell and reuses the `ph-filter-bar` navigation pattern from `PlotHooksPanel`.
- Rebuilt `BeatsPanel`, `ForeshadowingPanel`, and `TimelinePanel` around shared `sp-*` sidebar tokens, unified button/input styling with `.btn` / `.sp-input`, and wired beat completion into `useBeats()` so progress can advance from the new UI.
- Added shared sidebar panel styles in `App.css`, removed the old `beats-btn-*`, `foreshadow-*`, and `timeline-*` styling blocks, and kept the embedded hooks panel scroll behavior consistent via `rs-embedded-panel`.

Key files:
- `src/components/layout/RightSidebar.tsx`
- `src/components/BeatsPanel.tsx`
- `src/components/ForeshadowingPanel.tsx`
- `src/components/TimelinePanel.tsx`
- `src/hooks/useBeats.ts`
- `src/App.css`

Verification:
- `npx tsc --noEmit -p tsconfig.app.json`
- `npx eslint src/components/layout/RightSidebar.tsx src/components/BeatsPanel.tsx src/components/ForeshadowingPanel.tsx src/components/TimelinePanel.tsx src/hooks/useBeats.ts`
- `npx vite build` (still fails at the existing Vite/Rolldown HTML emit path issue: `../开发/小说辅助创作-dev/index.html`)

Follow-up:
- `npx vite build` remains blocked by the pre-existing HTML emit path bug, so Sprint 3 is type-checked and lint-clean but still not production-build verified end to end.
- `PlotHooksPanel` is still the modal-style implementation adapted into the sidebar; a later pass could make that panel native to the same `sp-*` token system if we want the hooks view to visually match the other two sub-tabs even more closely.

### Sprint 2 kickoff: relation weights, foreshadowing UI, timeline, and paragraph rewrite
- Added Sprint 2 Step 1 to `completeChapter()`: chapter-complete now runs a relationship weight refresh pass after chapter-state extraction, and the completion modal tracks the new `weightUpdate` progress step.
- Added a merged foreshadowing flow with `useForeshadowings`, a new `ForeshadowingPanel`, and sidebar integration so auto-extracted `memories.plot_hook` entries and manual `plot_hooks` entries are shown together and can be marked resolved from the Plot tab.
- Added a new `TimelinePanel` in the Graph tab and wired inline paragraph rewrite into the editor via `rewriteParagraph()`, `InlineAiMenu`, and the existing diff accept/reject review flow.

Key files:
- `src/memory/completeChapter.ts`
- `src/components/ChapterCompleteModal.tsx`
- `src/hooks/useForeshadowings.ts`
- `src/components/ForeshadowingPanel.tsx`
- `src/components/TimelinePanel.tsx`
- `src/components/layout/RightSidebar.tsx`
- `src/api/gemini.ts`
- `src/hooks/useEditor.ts`
- `src/components/InlineAiMenu.tsx`
- `src/components/Editor.tsx`
- `src/components/AiSuggestionPanel.tsx`
- `src/App.tsx`
- `src/App.css`

Verification:
- `npx tsc --noEmit -p tsconfig.app.json`
- `node .\node_modules\eslint\bin\eslint.js src/App.tsx src/api/gemini.ts src/components/AiSuggestionPanel.tsx src/components/ChapterCompleteModal.tsx src/components/Editor.tsx src/components/ForeshadowingPanel.tsx src/components/InlineAiMenu.tsx src/components/TimelinePanel.tsx src/components/layout/RightSidebar.tsx src/hooks/useEditor.ts src/hooks/useForeshadowings.ts src/memory/completeChapter.ts`
- `npm run build` (still fails at the existing Vite/Rolldown HTML emit path issue: `../开发/小说辅助创作-dev/index.html`)

Follow-up:
- `npm run build` is still blocked by the pre-existing Vite path emission error, so Sprint 2 UI work is type-checked and lint-clean but not yet fully production-build verified.
- The manual `PlotHooksPanel` remains the old modal-style implementation embedded inside the sidebar; a later pass can make that panel native to the sidebar shell if we want the Plot tab fully consistent.
