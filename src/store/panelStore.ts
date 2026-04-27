import { create } from 'zustand';

export type PanelType =
  | 'settings'
  | 'memory'
  | 'snapshot'
  | 'consistency'
  | 'crossSearch'
  | 'outline'
  | 'sceneTemplates'
  | 'shortcutHelp'
  | 'stats'
  | 'styleLearning'
  | 'plotHooks'
  | 'aiDetect'
  | 'createBook'
  | 'versionPicker'
  | 'capsule'
  | 'character'
  | null;

interface PanelStore {
  openPanel: PanelType;
  findMode: 'find' | 'replace' | null;
  showInstruction: boolean;
  openPanel_action: (panel: Exclude<PanelType, null>) => void;
  closePanel: () => void;
  toggleFind: (mode: 'find' | 'replace') => void;
  closeFind: () => void;
  toggleInstruction: () => void;
}

export const usePanelStore = create<PanelStore>()((set) => ({
  openPanel: null,
  findMode: null,
  showInstruction: true,
  openPanel_action: (panel) => set({ openPanel: panel }),
  closePanel: () => set({ openPanel: null }),
  toggleFind: (mode) => set((state) => ({
    findMode: state.findMode === mode ? null : mode,
  })),
  closeFind: () => set({ findMode: null }),
  toggleInstruction: () => set((state) => ({
    showInstruction: !state.showInstruction,
  })),
}));
