import { lazy, Suspense, useEffect, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { Layers, Network, Sparkles } from 'lucide-react';
import { MiniGraph } from '../MiniGraph';
import { useNovelStore, type NovelRightTab } from '../../store/useNovelStore';

const BeatsPanel = lazy(() => import('../BeatsPanel').then(m => ({ default: m.BeatsPanel })));
const ForeshadowingPanel = lazy(() => import('../ForeshadowingPanel').then(m => ({ default: m.ForeshadowingPanel })));

const RIGHT_TABS: Array<{ value: NovelRightTab; label: string; Icon: typeof Sparkles }> = [
  { value: 'ai',    label: 'AI',    Icon: Sparkles },
  { value: 'plot',  label: 'Plot',  Icon: Layers },
  { value: 'graph', label: 'Graph', Icon: Network },
];

interface RightSidebarProps {
  bookId?: string | null;
  onGraphNodeClick?: (name: string, type: string) => void;
  onToggleInstruction?: () => void;
  currentChapterNumber?: number;
  currentChapterOutline?: string;
  onWriteBeat?: (beatPrompt: string) => void;
  onContinue: () => void;
  onPolish: () => void;
  onAcceptSuggestion: () => void;
  onRejectSuggestion: () => void;
  canAcceptSuggestion: boolean;
  aiActionsDisabled: boolean;
}

function AiTab({
  onContinue,
  onPolish,
  onAcceptSuggestion,
  onRejectSuggestion,
  canAcceptSuggestion,
  aiActionsDisabled,
  onToggleInstruction,
}: Pick<RightSidebarProps,
  | 'onContinue' | 'onPolish' | 'onAcceptSuggestion' | 'onRejectSuggestion'
  | 'canAcceptSuggestion' | 'aiActionsDisabled' | 'onToggleInstruction'
>) {
  const isAiLoading  = useNovelStore(s => s.isAiLoading);
  const aiLoadingLabel = useNovelStore(s => s.aiLoadingLabel);
  const aiSuggestion = useNovelStore(s => s.aiSuggestion);
  const setAiSuggestion = useNovelStore(s => s.setAiSuggestion);

  const clearSuggestion  = () => { onRejectSuggestion(); setAiSuggestion(''); };
  const acceptSuggestion = () => { onAcceptSuggestion(); setAiSuggestion(''); };

  return (
    <div className="rs-ai-tab">
      <div className="rs-ai-actions">
        <button className="rs-action-btn" onClick={onContinue} disabled={aiActionsDisabled || isAiLoading}>
          续写
        </button>
        <button className="rs-action-btn" onClick={onPolish} disabled={aiActionsDisabled || isAiLoading}>
          润色
        </button>
        <button className="rs-action-btn" onClick={onToggleInstruction} type="button">
          指令
        </button>
      </div>

      <div className="rs-ai-preview">
        {isAiLoading ? (
          <div className="rs-ai-loading">
            <span className="rs-spinner" />
            <span>{aiLoadingLabel || 'AI 处理中...'}</span>
          </div>
        ) : aiSuggestion.trim() ? (
          <pre className="rs-ai-suggestion">{aiSuggestion}</pre>
        ) : (
          <div className="rs-empty">
            <span className="rs-empty-title">暂无 AI 输出</span>
          </div>
        )}
      </div>

      {aiSuggestion.trim() && (
        <div className="rs-ai-footer">
          <button className="rs-action-btn rs-action-primary" onClick={acceptSuggestion} disabled={!canAcceptSuggestion}>
            接受
          </button>
          <button className="rs-action-btn" onClick={onContinue} disabled={aiActionsDisabled || isAiLoading}>
            重来
          </button>
          <button className="rs-action-btn" onClick={clearSuggestion}>
            丢弃
          </button>
        </div>
      )}
    </div>
  );
}

type PlotSubTab = 'beats' | 'foreshadow';

function PlotTab({
  bookId,
  currentChapterNumber,
  currentChapterOutline,
  onWriteBeat,
}: Pick<RightSidebarProps, 'bookId' | 'currentChapterNumber' | 'currentChapterOutline' | 'onWriteBeat'>) {
  const [subTab, setSubTab] = useState<PlotSubTab>('beats');

  return (
    <div className="rs-tool-tab">
      <div className="ph-filter-bar">
        <button
          className={`ph-filter-btn ${subTab === 'beats' ? 'active' : ''}`}
          type="button"
          onClick={() => setSubTab('beats')}
        >
          节拍
        </button>
        <button
          className={`ph-filter-btn ${subTab === 'foreshadow' ? 'active' : ''}`}
          type="button"
          onClick={() => setSubTab('foreshadow')}
        >
          伏笔
        </button>
      </div>

      {subTab === 'beats' && (
        <Suspense fallback={null}>
          <BeatsPanel
            key={`${currentChapterNumber ?? 'draft'}:${currentChapterOutline ?? ''}`}
            chapterNumber={currentChapterNumber}
            chapterOutline={currentChapterOutline}
            onWriteBeat={onWriteBeat}
          />
        </Suspense>
      )}
      {subTab === 'foreshadow' && (
        <Suspense fallback={null}>
          <ForeshadowingPanel
            bookId={bookId ?? undefined}
            currentChapter={currentChapterNumber}
          />
        </Suspense>
      )}
    </div>
  );
}

function GraphTab({
  bookId,
  highlightName,
  onGraphNodeClick,
}: Pick<RightSidebarProps, 'bookId' | 'onGraphNodeClick'> & { highlightName: string | null }) {
  return (
    <div className="rs-tool-tab">
      <MiniGraph
        bookId={bookId ?? null}
        highlightName={highlightName}
        height={420}
        onNodeClick={onGraphNodeClick}
      />
    </div>
  );
}

export function RightSidebar(props: RightSidebarProps) {
  const rightSidebarOpen   = useNovelStore(s => s.rightSidebarOpen);
  const toggleRightSidebar = useNovelStore(s => s.toggleRightSidebar);
  const rightTab           = useNovelStore(s => s.rightTab);
  const setRightTab        = useNovelStore(s => s.setRightTab);
  const highlightedEntityName = useNovelStore(s => s.highlightedEntityName);

  useEffect(() => {
    if (highlightedEntityName) setRightTab('graph');
  }, [highlightedEntityName, setRightTab]);

  return (
    <div className={`workspace-sidebar workspace-sidebar-right ${rightSidebarOpen ? '' : 'workspace-sidebar-hidden'}`}>
      <Tabs.Root
        className="right-sidebar-shell"
        value={rightTab}
        onValueChange={(value) => setRightTab(value as NovelRightTab)}
      >
        <Tabs.List className="right-sidebar-tabs" aria-label="右侧工具栏">
          {RIGHT_TABS.map(({ value, label, Icon }) => (
            <Tabs.Trigger key={value} className="right-sidebar-tab" value={value} title={label}>
              <Icon size={16} strokeWidth={1.8} />
            </Tabs.Trigger>
          ))}
          <button
            className="right-sidebar-close"
            onClick={toggleRightSidebar}
            title="收起侧边栏"
            type="button"
          >
            ✕
          </button>
        </Tabs.List>

        <Tabs.Content className="right-sidebar-panel" value="ai">
          <AiTab {...props} />
        </Tabs.Content>

        <Tabs.Content className="right-sidebar-panel" value="plot">
          <PlotTab
            bookId={props.bookId}
            currentChapterNumber={props.currentChapterNumber}
            currentChapterOutline={props.currentChapterOutline}
            onWriteBeat={props.onWriteBeat}
          />
        </Tabs.Content>

        <Tabs.Content className="right-sidebar-panel" value="graph">
          <GraphTab
            bookId={props.bookId}
            highlightName={highlightedEntityName}
            onGraphNodeClick={props.onGraphNodeClick}
          />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
