import { diffWords } from '../utils/diffHighlight';

interface DiffPreviewProps {
  original: string;
  revised: string;
  onAccept: () => void;
  onReject: () => void;
}

export function DiffPreview({
  original,
  revised,
  onAccept,
  onReject,
}: DiffPreviewProps) {
  const tokens = diffWords(original, revised);

  return (
    <div className="diff-preview">
      <div className="diff-preview-content">
        {tokens.map((token, index) => {
          if (token.type === 'delete') {
            return <del key={`${token.type}-${index}`} className="diff-del">{token.text}</del>;
          }
          if (token.type === 'insert') {
            return <ins key={`${token.type}-${index}`} className="diff-ins">{token.text}</ins>;
          }
          return <span key={`${token.type}-${index}`}>{token.text}</span>;
        })}
      </div>
      <div className="diff-preview-actions">
        <button className="audit-btn audit-accept" onClick={onAccept}>
          接受 <kbd>Tab</kbd>
        </button>
        <button className="audit-btn audit-reject" onClick={onReject}>
          拒绝 <kbd>Esc</kbd>
        </button>
      </div>
    </div>
  );
}
