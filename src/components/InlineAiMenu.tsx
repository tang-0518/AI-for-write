import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNovelStore } from '../store/useNovelStore';
import type { RewriteAngle } from '../api/gemini';

const REWRITE_ANGLE_LABELS: Record<RewriteAngle, string> = {
  narrative: '叙事视角',
  psychological: '心理独白',
  dialogue: '对话化',
};

interface InlineAiMenuProps {
  disabled: boolean;
  onPolish: () => void;
  onContinue: () => void;
  onRewrite: (angle: RewriteAngle) => void;
  onExplain: (text: string) => Promise<string>;
}

export function InlineAiMenu({
  disabled,
  onPolish,
  onContinue,
  onRewrite,
  onExplain,
}: InlineAiMenuProps) {
  const inlineMenu = useNovelStore((state) => state.inlineMenu);
  const hideInlineMenu = useNovelStore((state) => state.hideInlineMenu);
  const setAiSuggestion = useNovelStore((state) => state.setAiSuggestion);
  const [isExplaining, setIsExplaining] = useState(false);
  const [showRewrite, setShowRewrite] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!inlineMenu.visible) {
      setShowRewrite(false);
      setMessage('');
    }
  }, [inlineMenu.visible]);

  const close = () => {
    setMessage('');
    setShowRewrite(false);
    hideInlineMenu();
  };

  const runAction = (action: () => void) => {
    if (disabled) return;
    setMessage('');
    setShowRewrite(false);
    action();
    hideInlineMenu();
  };

  const handleExplain = async () => {
    if (disabled || !inlineMenu.selectedText.trim()) return;
    setIsExplaining(true);
    setMessage('');
    try {
      const result = await onExplain(inlineMenu.selectedText);
      setMessage(result);
      setAiSuggestion(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '解释失败，请稍后重试');
    } finally {
      setIsExplaining(false);
    }
  };

  const handleRewrite = (angle: RewriteAngle) => {
    if (disabled || !inlineMenu.selectedText.trim()) return;
    setMessage('');
    setShowRewrite(false);
    onRewrite(angle);
    hideInlineMenu();
  };

  return createPortal(
    <div
      className="inline-ai-menu"
      data-visible={inlineMenu.visible ? 'true' : 'false'}
      style={{
        position: 'fixed',
        left: inlineMenu.x,
        top: inlineMenu.y,
        transform: 'translateX(-50%) translateY(-100%)',
        visibility: inlineMenu.visible ? 'visible' : 'hidden',
      }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="inline-ai-actions">
        <button type="button" onClick={() => runAction(onPolish)} disabled={disabled}>
          润色
        </button>
        <button type="button" onClick={() => runAction(onContinue)} disabled={disabled}>
          续写
        </button>
        <div className="inline-ai-rewrite-group">
          <button type="button" onClick={() => setShowRewrite((value) => !value)} disabled={disabled}>
            重写 ▾
          </button>
          {showRewrite && (
            <div className="inline-ai-rewrite-options">
              {(['narrative', 'psychological', 'dialogue'] as RewriteAngle[]).map((angle) => (
                <button
                  key={angle}
                  type="button"
                  className="inline-ai-rewrite-opt"
                  onClick={() => handleRewrite(angle)}
                >
                  {REWRITE_ANGLE_LABELS[angle]}
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" onClick={handleExplain} disabled={disabled || isExplaining}>
          {isExplaining ? '解释中' : '解释'}
        </button>
        <button type="button" onClick={close} aria-label="关闭行内 AI 菜单">
          ×
        </button>
      </div>
      {message && <div className="inline-ai-result">{message}</div>}
    </div>,
    document.body,
  );
}
