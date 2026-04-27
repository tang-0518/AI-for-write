import { lazy, Suspense } from 'react';
import type { AppSettings } from '../../types';
import type { Draft } from '../../hooks/useBooks';
import type { Snapshot } from '../../hooks/useSnapshots';
import type { WritingStats } from '../../hooks/useWritingStats';
import type { AnalysisStatus } from '../../hooks/useStyleLearning';
import type { OutlineCard, CanvasNodePosition } from '../../hooks/useOutline';
import type { StyleProfile } from '../../types/styleProfile';
import type { CharacterCapsule } from '../../capsule/types';
import type { MemoryEntry, MemoryType } from '../../memory/types';
import type { ParsedChapter } from '../../utils/txtImport';
import type { ConsistencyIssue } from '../../api/gemini';
import { usePanelStore } from '../../store/panelStore';

const SettingsModal = lazy(() => import('../SettingsModal'));
const MemoryPanel = lazy(() => import('../MemoryPanel'));
const CreateBookModal = lazy(() => import('../CreateBookModal'));
const ChapterCompleteModal = lazy(() => import('../ChapterCompleteModal'));
const SnapshotPanel = lazy(() => import('../SnapshotPanel'));
const VersionPickerPanel = lazy(() => import('../VersionPickerPanel'));
const ConsistencyPanel = lazy(() => import('../ConsistencyPanel'));
const CrossChapterSearch = lazy(() => import('../CrossChapterSearch'));
const OutlinePanel = lazy(() => import('../OutlinePanel'));
const SceneTemplates = lazy(() => import('../SceneTemplates'));
const StyleLearningPanel = lazy(() => import('../StyleLearningPanel'));
const ShortcutHelpPanel = lazy(() => import('../ShortcutHelpPanel'));
const StatsPanel = lazy(() => import('../StatsPanel'));
const AiDetectionPanel = lazy(() => import('../AiDetectionPanel'));
const CapsulePanel = lazy(() => import('../CapsulePanel'));

const LazyFallback = () => <div className="panel-lazy-loading">加载中...</div>;

interface OutlineState {
  cards: OutlineCard[];
  canvasPositions: CanvasNodePosition[];
  addCard: (card: Omit<OutlineCard, 'id' | 'order'>) => void;
  updateCard: (id: string, patch: Partial<Omit<OutlineCard, 'id'>>) => void;
  deleteCard: (id: string) => void;
  reorderCards: (fromIndex: number, toIndex: number) => void;
  setNodePosition: (id: string, x: number, y: number) => void;
}

interface GlobalModalsProps {
  settings: AppSettings;
  setSettings: (settings: AppSettings) => void;
  booksCount: number;
  createBook: (title: string, synopsis?: string) => Promise<unknown> | unknown;
  createBookWithChapters: (bookTitle: string, synopsis: string, chapters: ParsedChapter[]) => Promise<unknown> | unknown;
  showChapterComplete: boolean;
  setShowChapterComplete: (value: boolean) => void;
  chapterCompleteDraft: Draft | null;
  currentDraftWordCount: number;
  activeBookId: string | null;
  onChapterCompleteDone: (draftId: string, summary: string) => void;
  saveSnapshot: (content: string, title: string, label: string) => Promise<void>;
  chapterSummaries: MemoryEntry[];
  notes: MemoryEntry[];
  addMemory: (entry: { name: string; type: MemoryType; content: string }) => Promise<MemoryEntry> | void;
  updateMemory: (id: string, patch: Partial<Omit<MemoryEntry, 'id' | 'updatedAt'>>) => Promise<void> | void;
  removeMemory: (id: string) => Promise<void> | void;
  pendingVersions: string[] | null;
  selectVersion: (version: string) => void;
  dismissVersions: () => void;
  activeDraft: Draft | null;
  snapshots: Snapshot[];
  overLimitWarning: boolean;
  setContent: (content: string) => void;
  deleteSnapshot: (id: string) => Promise<void>;
  pinSnapshot: (id: string, pinned: boolean) => void;
  content: string;
  dismissOverLimitWarning: () => void;
  consistencyIssues: ConsistencyIssue[] | null;
  isCheckingConsistency: boolean;
  consistencyError: string | null;
  handleCheckConsistency: () => Promise<void>;
  bookChapters: Draft[];
  selectDraft: (chapterId: string) => void;
  writingStats: WritingStats;
  insertAtCursor: (snippet: string) => void;
  styleProfiles: StyleProfile[];
  styleStatus: AnalysisStatus;
  styleError: string;
  createStyleProfile: (params: {
    name: string;
    sourceBookId: string;
    chapters: { id: string; title: string; content: string }[];
  }) => Promise<StyleProfile | null>;
  deleteStyleProfile: (id: string) => Promise<void>;
  renameStyleProfile: (id: string, newName: string) => Promise<void>;
  isPolishing: boolean;
  polishAntiDetect: () => void;
  capsules: CharacterCapsule[];
  memoryCharacters: MemoryEntry[];
  capsuleStats: { total: number; totalTokens: number };
  createCapsule: (name: string, partial?: Partial<CharacterCapsule>) => Promise<CharacterCapsule>;
  updateCapsule: (id: string, patch: Partial<CharacterCapsule>) => Promise<CharacterCapsule>;
  removeCapsule: (id: string) => Promise<void>;
  migrateCapsuleFromMemory: (entries: MemoryEntry[]) => Promise<number>;
  capsuleHighlight?: string;
  clearCapsuleHighlight: () => void;
  outline: OutlineState;
  activeBookTitle: string;
  activeBookSynopsis: string;
  isGeneratingOutline: boolean;
  handleGenerateOutline: () => void;
}

export function GlobalModals({
  settings,
  setSettings,
  booksCount,
  createBook,
  createBookWithChapters,
  showChapterComplete,
  setShowChapterComplete,
  chapterCompleteDraft,
  currentDraftWordCount,
  activeBookId,
  onChapterCompleteDone,
  saveSnapshot,
  chapterSummaries,
  notes,
  addMemory,
  updateMemory,
  removeMemory,
  pendingVersions,
  selectVersion,
  dismissVersions,
  activeDraft,
  snapshots,
  overLimitWarning,
  setContent,
  deleteSnapshot,
  pinSnapshot,
  content,
  dismissOverLimitWarning,
  consistencyIssues,
  isCheckingConsistency,
  consistencyError,
  handleCheckConsistency,
  bookChapters,
  selectDraft,
  writingStats,
  insertAtCursor,
  styleProfiles,
  styleStatus,
  styleError,
  createStyleProfile,
  deleteStyleProfile,
  renameStyleProfile,
  isPolishing,
  polishAntiDetect,
  capsules,
  memoryCharacters,
  capsuleStats,
  createCapsule,
  updateCapsule,
  removeCapsule,
  migrateCapsuleFromMemory,
  capsuleHighlight,
  clearCapsuleHighlight,
  outline,
  activeBookTitle,
  activeBookSynopsis,
  isGeneratingOutline,
  handleGenerateOutline,
}: GlobalModalsProps) {
  const openPanel = usePanelStore((state) => state.openPanel);
  const closePanel = usePanelStore((state) => state.closePanel);

  return (
    <Suspense fallback={<LazyFallback />}>
      {openPanel === 'memory' && (
        <MemoryPanel
          chapterSummaries={chapterSummaries}
          notes={notes}
          onAdd={addMemory}
          onUpdate={updateMemory}
          onRemove={removeMemory}
          onClose={closePanel}
          onOpenCharacters={closePanel}
        />
      )}

      {openPanel === 'settings' && (
        <SettingsModal
          settings={settings}
          onSave={setSettings}
          onClose={closePanel}
        />
      )}

      {showChapterComplete && chapterCompleteDraft && activeBookId && (
        <ChapterCompleteModal
          draft={chapterCompleteDraft}
          wordCount={currentDraftWordCount}
          settings={settings}
          bookId={activeBookId}
          saveSnapshot={saveSnapshot}
          onDone={(summary) => onChapterCompleteDone(chapterCompleteDraft.id, summary)}
          onClose={() => setShowChapterComplete(false)}
        />
      )}

      {openPanel === 'createBook' && (
        <CreateBookModal
          isFirst={booksCount === 0}
          onConfirm={async (title, synopsis) => {
            await createBook(title, synopsis);
            closePanel();
          }}
          onConfirmImport={async (bookTitle, chapters) => {
            await createBookWithChapters(bookTitle, '', chapters);
            closePanel();
          }}
          onCancel={closePanel}
        />
      )}

      {pendingVersions && pendingVersions.length > 0 && (
        <VersionPickerPanel
          versions={pendingVersions}
          onSelect={selectVersion}
          onDismiss={dismissVersions}
        />
      )}

      {openPanel === 'snapshot' && activeDraft && (
        <SnapshotPanel
          snapshots={snapshots}
          overLimitWarning={overLimitWarning}
          onRestore={setContent}
          onDelete={deleteSnapshot}
          onPin={pinSnapshot}
          onManualSave={() => saveSnapshot(content, activeDraft.title, '手动存档')}
          onDismissWarning={dismissOverLimitWarning}
          onClose={closePanel}
        />
      )}

      {openPanel === 'consistency' && (
        <ConsistencyPanel
          issues={consistencyIssues}
          isChecking={isCheckingConsistency}
          error={consistencyError}
          onCheck={handleCheckConsistency}
          onClose={closePanel}
          onGoComplete={() => {
            closePanel();
            setShowChapterComplete(true);
          }}
        />
      )}

      {openPanel === 'crossSearch' && (
        <CrossChapterSearch
          chapters={bookChapters}
          onNavigate={(chapterId) => {
            selectDraft(chapterId);
          }}
          onClose={closePanel}
        />
      )}

      {openPanel === 'stats' && (
        <StatsPanel stats={writingStats} onClose={closePanel} />
      )}

      {openPanel === 'shortcutHelp' && (
        <ShortcutHelpPanel onClose={closePanel} />
      )}

      {openPanel === 'sceneTemplates' && (
        <SceneTemplates
          onInsert={insertAtCursor}
          onClose={closePanel}
        />
      )}

      {openPanel === 'styleLearning' && (
        <StyleLearningPanel
          profiles={styleProfiles}
          status={styleStatus}
          errorMsg={styleError}
          drafts={bookChapters}
          sourceBookId={activeBookId ?? ''}
          activeProfileId={settings.imitationProfileId ?? ''}
          imitationMode={settings.imitationMode ?? false}
          modularWriting={settings.modularWriting ?? false}
          onCreateProfile={createStyleProfile}
          onDeleteProfile={deleteStyleProfile}
          onRenameProfile={renameStyleProfile}
          onSelectProfile={(id) => setSettings({ ...settings, imitationProfileId: id })}
          onToggleImitation={(on) => setSettings({ ...settings, imitationMode: on })}
          onToggleModular={(on) => setSettings({ ...settings, modularWriting: on })}
          onClose={closePanel}
        />
      )}

      {openPanel === 'aiDetect' && activeDraft && (
        <AiDetectionPanel
          content={content}
          isPolishing={isPolishing}
          onPolishAntiDetect={polishAntiDetect}
          onClose={closePanel}
        />
      )}

      {openPanel === 'capsule' && (
        <div className="panel-right-overlay">
          <CapsulePanel
            capsules={capsules}
            characterMemories={memoryCharacters}
            stats={capsuleStats}
            onClose={() => {
              closePanel();
              clearCapsuleHighlight();
            }}
            onCreate={createCapsule}
            onUpdate={updateCapsule}
            onDelete={removeCapsule}
            onMigrateMemory={migrateCapsuleFromMemory}
            onInjectContext={insertAtCursor}
            onViewGraph={() => {}}
            highlightName={capsuleHighlight}
          />
        </div>
      )}

      {openPanel === 'outline' && (
        <OutlinePanel
          cards={outline.cards}
          bookTitle={activeBookTitle}
          bookSynopsis={activeBookSynopsis}
          isGenerating={isGeneratingOutline}
          canvasPositions={outline.canvasPositions}
          settings={settings}
          onAdd={outline.addCard}
          onUpdate={outline.updateCard}
          onDelete={outline.deleteCard}
          onReorder={outline.reorderCards}
          onGenerate={handleGenerateOutline}
          onNodeMove={outline.setNodePosition}
          onClose={closePanel}
        />
      )}
    </Suspense>
  );
}
