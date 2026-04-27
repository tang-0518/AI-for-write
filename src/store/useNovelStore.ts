import { create } from 'zustand';

interface InlineMenuState {
  visible: boolean;
  x: number;
  y: number;
  selectedText: string;
}

export type NovelRightTab = 'ai' | 'plot' | 'graph' | 'autopilot';
export type NovelTheme = 'dark' | 'light' | 'parchment';

interface NovelStore {
  currentContent: string;
  setCurrentContent: (value: string) => void;

  wordCount: number;
  setWordCount: (count: number) => void;

  isAiLoading: boolean;
  aiLoadingLabel: string;
  setAiLoading: (loading: boolean, label?: string) => void;

  aiSuggestion: string;
  setAiSuggestion: (text: string) => void;

  rightTab: NovelRightTab;
  setRightTab: (tab: NovelRightTab) => void;

  leftSidebarOpen: boolean;
  toggleLeftSidebar: () => void;

  rightSidebarOpen: boolean;
  toggleRightSidebar: () => void;

  inlineMenu: InlineMenuState;
  showInlineMenu: (x: number, y: number, text: string) => void;
  hideInlineMenu: () => void;

  highlightedEntityName: string | null;
  setHighlightedEntity: (name: string | null) => void;

  focusMode: boolean;
  toggleFocusMode: () => void;

  theme: NovelTheme;
  setTheme: (theme: NovelTheme) => void;
}

const DEFAULT_INLINE_MENU: InlineMenuState = {
  visible: false,
  x: 0,
  y: 0,
  selectedText: '',
};

export const useNovelStore = create<NovelStore>()((set) => ({
  currentContent: '',
  setCurrentContent: (value) => set({ currentContent: value }),

  wordCount: 0,
  setWordCount: (count) => set({ wordCount: count }),

  isAiLoading: false,
  aiLoadingLabel: '',
  setAiLoading: (loading, label = '') => set({
    isAiLoading: loading,
    aiLoadingLabel: loading ? label : '',
  }),

  aiSuggestion: '',
  setAiSuggestion: (text) => set({ aiSuggestion: text }),

  rightTab: 'ai',
  setRightTab: (tab) => set({ rightTab: tab }),

  leftSidebarOpen: true,
  toggleLeftSidebar: () => set((state) => ({ leftSidebarOpen: !state.leftSidebarOpen })),

  rightSidebarOpen: true,
  toggleRightSidebar: () => set((state) => ({ rightSidebarOpen: !state.rightSidebarOpen })),

  inlineMenu: DEFAULT_INLINE_MENU,
  showInlineMenu: (x, y, selectedText) => set({
    inlineMenu: {
      visible: true,
      x,
      y,
      selectedText,
    },
  }),
  hideInlineMenu: () => set({ inlineMenu: DEFAULT_INLINE_MENU }),

  highlightedEntityName: null,
  setHighlightedEntity: (name) => set({ highlightedEntityName: name }),

  focusMode: false,
  toggleFocusMode: () => set((state) => ({ focusMode: !state.focusMode })),

  theme: 'dark',
  setTheme: (theme) => set({ theme }),
}));
