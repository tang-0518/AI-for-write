// =============================================================
// components/SceneTemplates.tsx — 场景模板库（一键插入）
// =============================================================

interface SceneTemplate {
  id: string;
  name: string;
  icon: string;
  category: string;
  content: string;
}

const TEMPLATES: SceneTemplate[] = [
  {
    id: 'meet',
    name: '初次相遇',
    icon: '👥',
    category: '人物',
    content: `【初次相遇】\n\n他们的目光在人群中短暂交汇，然后迅速错开。\n\n`,
  },
  {
    id: 'conflict',
    name: '正面冲突',
    icon: '⚔️',
    category: '冲突',
    content: `【正面冲突】\n\n气氛陡然凝固，空气中弥漫着一触即发的紧张。\n\n`,
  },
  {
    id: 'reveal',
    name: '秘密揭露',
    icon: '🔍',
    category: '转折',
    content: `【秘密揭露】\n\n那个被隐藏已久的真相，终于在这一刻浮出水面。\n\n`,
  },
  {
    id: 'farewell',
    name: '离别场景',
    icon: '🌅',
    category: '情感',
    content: `【离别】\n\n回头的那一刻，背影已渐渐模糊在晨雾之中。\n\n`,
  },
  {
    id: 'flashback',
    name: '回忆闪回',
    icon: '💭',
    category: '叙事',
    content: `【回忆——】\n\n记忆像潮水般涌来，将意识拉回到那个久远的午后……\n\n【回到当下】\n\n`,
  },
  {
    id: 'battle',
    name: '战斗场景',
    icon: '🥊',
    category: '动作',
    content: `【战斗】\n\n每一拳都带着愤怒与求生的本能，没有技巧，只有力量与意志的对撞。\n\n`,
  },
  {
    id: 'dialogue',
    name: '对话开场',
    icon: '💬',
    category: '对话',
    content: `"——"\n\n沉默片刻后，对方缓缓开口。\n\n"……"\n\n`,
  },
  {
    id: 'scenery',
    name: '环境描写',
    icon: '🌄',
    category: '描写',
    content: `【环境】\n\n光线斜斜地穿过窗棱，在地板上拉出长长的影子。整个房间安静得像一幅画。\n\n`,
  },
  {
    id: 'climax',
    name: '高潮转折',
    icon: '🌪️',
    category: '结构',
    content: `【转折点】\n\n一切都在这一刻改变了——没有预兆，没有退路。\n\n`,
  },
  {
    id: 'inner',
    name: '内心独白',
    icon: '🧠',
    category: '心理',
    content: `【内心】\n\n（为什么……我明明早就知道会是这样的结局。）\n\n`,
  },
];

const CATEGORIES = [...new Set(TEMPLATES.map(t => t.category))];

interface SceneTemplatesProps {
  onInsert: (text: string) => void;
  onClose: () => void;
}

export function SceneTemplates({ onInsert, onClose }: SceneTemplatesProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-panel scene-templates-panel"
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <span className="modal-title">🎬 场景模板库</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="scene-templates-body">
          {CATEGORIES.map(cat => (
            <div key={cat} className="scene-template-group">
              <div className="scene-template-group-label">{cat}</div>
              <div className="scene-template-list">
                {TEMPLATES.filter(t => t.category === cat).map(tpl => (
                  <button
                    key={tpl.id}
                    className="scene-template-item"
                    onClick={() => { onInsert(tpl.content); onClose(); }}
                    title={tpl.content.slice(0, 60) + '…'}
                  >
                    <span className="scene-template-icon">{tpl.icon}</span>
                    <span className="scene-template-name">{tpl.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="modal-footer scene-templates-footer">
          <span className="scene-templates-hint">点击模板即可插入光标处</span>
        </div>
      </div>
    </div>
  );
}
