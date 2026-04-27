// =============================================================
// components/OutlineCanvas.tsx — 大纲思维导图画布
// SVG 原生节点（rect + text）避免 foreignObject 裁剪问题
// =============================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import type { OutlineCard, CanvasNodePosition } from '../hooks/useOutline';

// ── 布局常量 ──────────────────────────────────────────────────
const NODE_W    = 190;
const NODE_H    = 72;
const ROOT_W    = 210;
const ROOT_H    = 52;
const ROOT_ID   = '__root__';
const H_GAP     = 50;
const V_GAP     = 80;
const BTN_R     = 11;   // 操作按钮半径

// ── 构建树结构 ─────────────────────────────────────────────────
function buildTree(cards: OutlineCard[]): Map<string | null, OutlineCard[]> {
  const tree = new Map<string | null, OutlineCard[]>();
  for (const card of cards) {
    const pid = card.parentId ?? null;
    if (!tree.has(pid)) tree.set(pid, []);
    tree.get(pid)!.push(card);
  }
  for (const [, children] of tree) children.sort((a, b) => a.order - b.order);
  return tree;
}

// ── 自动布局（只为没有保存位置的节点计算初始位置） ─────────────
function computeAutoLayout(
  cards: OutlineCard[],
  savedPositions: CanvasNodePosition[],
  canvasW: number,
): Map<string, { x: number; y: number }> {
  const posMap = new Map<string, { x: number; y: number }>(
    savedPositions.map(p => [p.id, { x: p.x, y: p.y }]),
  );

  if (!posMap.has(ROOT_ID)) {
    const cx = Math.max((canvasW || 900) / 2 - ROOT_W / 2, 20);
    posMap.set(ROOT_ID, { x: cx, y: 40 });
  }

  const tree = buildTree(cards);

  // 递归布局：无论有没有待布局节点都要继续递归
  function layout(parentId: string | null, parentX: number, parentY: number, parentW: number) {
    const children = tree.get(parentId) ?? [];
    const unplaced = children.filter(c => !posMap.has(c.id));

    if (unplaced.length > 0) {
      const childY = parentY + (parentId === null ? ROOT_H : NODE_H) + V_GAP;
      const totalW = unplaced.length * NODE_W + (unplaced.length - 1) * H_GAP;
      let startX = parentX + parentW / 2 - totalW / 2;
      for (const child of unplaced) {
        posMap.set(child.id, { x: startX, y: childY });
        startX += NODE_W + H_GAP;
      }
    }

    // 总是递归所有子节点（不只是刚布局的）
    for (const child of children) {
      const pos = posMap.get(child.id);
      if (pos) layout(child.id, pos.x, pos.y, NODE_W);
    }
  }

  const rootPos = posMap.get(ROOT_ID)!;
  layout(null, rootPos.x, rootPos.y, ROOT_W);
  return posMap;
}

// ── 贝塞尔连线路径 ────────────────────────────────────────────
function edgePath(
  px: number, py: number, pw: number, ph: number,
  cx: number, cy: number, cw: number,
): string {
  const x1 = px + pw / 2;
  const y1 = py + ph;
  const x2 = cx + cw / 2;
  const y2 = cy;
  const mid = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`;
}

// ── 状态颜色 ──────────────────────────────────────────────────
const STATUS_COLOR: Record<OutlineCard['status'], string> = {
  planned: '#a78bfa',
  writing: '#fbbf24',
  done:    '#4ade80',
};
const STATUS_LABEL: Record<OutlineCard['status'], string> = {
  planned: '计划中',
  writing: '写作中',
  done:    '已完成',
};

// ── Props ──────────────────────────────────────────────────────
interface OutlineCanvasProps {
  cards: OutlineCard[];
  bookTitle: string;
  positions: CanvasNodePosition[];
  onUpdateCard: (id: string, patch: Partial<Omit<OutlineCard, 'id'>>) => void;
  onAddCard: (card: Omit<OutlineCard, 'id' | 'order'>) => void;
  onDeleteCard: (id: string) => void;
  onNodeMove: (id: string, x: number, y: number) => void;
}

export function OutlineCanvas({
  cards,
  bookTitle,
  positions,
  onUpdateCard,
  onAddCard,
  onDeleteCard,
  onNodeMove,
}: OutlineCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasW, setCanvasW] = useState(900);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCanvasW(el.clientWidth || 900));
    ro.observe(el);
    const frameId = window.requestAnimationFrame(() => setCanvasW(el.clientWidth || 900));
    return () => {
      window.cancelAnimationFrame(frameId);
      ro.disconnect();
    };
  }, []);

  // ── 计算位置 ──────────────────────────────────────────────
  const posMap = computeAutoLayout(cards, positions, canvasW);

  // ── 本地拖拽覆盖（实时，拖完持久化） ───────────────────────
  const [localPos, setLocalPos] = useState<Map<string, { x: number; y: number }>>(new Map());

  const getPos = useCallback((id: string) =>
    localPos.get(id) ?? posMap.get(id) ?? { x: 0, y: 0 },
  [localPos, posMap]);

  // ── 拖拽状态 ──────────────────────────────────────────────
  const [dragging, setDragging] = useState<{
    id: string; mx0: number; my0: number; nx0: number; ny0: number;
  } | null>(null);

  // ── 平移状态 ──────────────────────────────────────────────
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);

  // ── 悬停节点 ──────────────────────────────────────────────
  const [hoverId, setHoverId] = useState<string | null>(null);

  // ── 编辑状态（inline title edit） ────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) editInputRef.current?.focus();
  }, [editingId]);

  // ── 全局鼠标移动/释放 ─────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragging) {
        setLocalPos(prev => new Map(prev).set(dragging.id, {
          x: dragging.nx0 + e.clientX - dragging.mx0,
          y: dragging.ny0 + e.clientY - dragging.my0,
        }));
        return;
      }
      if (panStart.current) {
        setPan({
          x: panStart.current.px + e.clientX - panStart.current.mx,
          y: panStart.current.py + e.clientY - panStart.current.my,
        });
      }
    };
    const onUp = (e: MouseEvent) => {
      if (dragging) {
        const nx = dragging.nx0 + e.clientX - dragging.mx0;
        const ny = dragging.ny0 + e.clientY - dragging.my0;
        onNodeMove(dragging.id, nx, ny);
        setDragging(null);
        return;
      }
      if (panStart.current) {
        panStart.current = null;
        setIsPanning(false);
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, onNodeMove]);

  const tree = buildTree(cards);

  // ── SVG 视口大小 ──────────────────────────────────────────
  const allPos = [posMap.get(ROOT_ID)!, ...cards.map(c => posMap.get(c.id)).filter(Boolean)] as { x: number; y: number }[];
  const svgW = Math.max(...allPos.map(p => p.x + NODE_W + 60), canvasW || 900);
  const svgH = Math.max(...allPos.map(p => p.y + NODE_H + 80), 500);

  // ── 渲染连线 ──────────────────────────────────────────────
  const renderEdges = () => {
    const edges: React.ReactNode[] = [];
    const rootPos = getPos(ROOT_ID);

    // 根节点 → level-1
    for (const card of (tree.get(null) ?? [])) {
      const cp = getPos(card.id);
      edges.push(
        <path key={`e-root-${card.id}`} className="canvas-edge"
          d={edgePath(rootPos.x, rootPos.y, ROOT_W, ROOT_H, cp.x, cp.y, NODE_W)} />,
      );
    }

    // 任意父节点 → 子节点
    for (const card of cards) {
      for (const child of (tree.get(card.id) ?? [])) {
        const pp = getPos(card.id);
        const cp = getPos(child.id);
        edges.push(
          <path key={`e-${card.id}-${child.id}`} className="canvas-edge"
            d={edgePath(pp.x, pp.y, NODE_W, NODE_H, cp.x, cp.y, NODE_W)} />,
        );
      }
    }
    return edges;
  };

  // ── 渲染单个节点（纯 SVG，无 foreignObject） ─────────────
  const renderNode = (
    id: string,
    x: number, y: number,
    w: number, h: number,
    label: string,
    opts: { isRoot?: boolean; card?: OutlineCard } = {},
  ) => {
    const isHovered = hoverId === id;
    const isEditing = editingId === id;
    const isDragging = dragging?.id === id;
    const fillColor = opts.isRoot ? 'var(--purple-600, #7c3aed)' : 'var(--canvas-node-bg, #1e1b2e)';
    const strokeColor = isHovered
      ? 'var(--purple-400, #a78bfa)'
      : opts.isRoot
        ? 'var(--purple-400, #a78bfa)'
        : 'var(--canvas-node-stroke, rgba(139,92,246,0.28))';

    const startDrag = (e: React.MouseEvent) => {
      if (isEditing) return;
      e.stopPropagation();
      const pos = getPos(id);
      setDragging({ id, mx0: e.clientX, my0: e.clientY, nx0: pos.x, ny0: pos.y });
    };

    const commitEdit = () => {
      const val = editValue.trim();
      if (val && opts.card) onUpdateCard(id, { title: val });
      setEditingId(null);
    };

    // Synopsis 截取（最多2行 ~34字）
    const synopsisText = opts.card?.synopsis
      ? opts.card.synopsis.slice(0, 34) + (opts.card.synopsis.length > 34 ? '…' : '')
      : '';

    return (
      <g
        key={id}
        transform={`translate(${x}, ${y})`}
        style={{ cursor: isDragging ? 'grabbing' : isEditing ? 'text' : 'grab' }}
        onMouseEnter={() => setHoverId(id)}
        onMouseLeave={() => setHoverId(null)}
      >
        {/* 节点背景 */}
        <rect
          x={0} y={0} width={w} height={h}
          rx={8} ry={8}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={isHovered ? 1.5 : 1}
          style={{ filter: isDragging ? 'opacity(0.75)' : undefined }}
          onMouseDown={startDrag}
          onDoubleClick={() => {
            if (opts.card) {
              setEditingId(id);
              setEditValue(opts.card.title);
            }
          }}
        />

        {/* 标题文字 / 编辑输入框 */}
        {isEditing && opts.card ? (
          <foreignObject x={8} y={opts.card?.synopsis ? 8 : (h - 24) / 2} width={w - 16} height={28}>
            <input
              ref={editInputRef}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={e => {
                if (e.key === 'Enter') commitEdit();
                if (e.key === 'Escape') setEditingId(null);
                e.stopPropagation();
              }}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'transparent', border: 'none',
                outline: '1px solid #a78bfa', borderRadius: 4,
                color: opts.isRoot ? '#fff' : 'var(--text-primary, #e2e8f0)',
                fontSize: 13, fontWeight: 600,
                fontFamily: 'var(--font-ui, sans-serif)',
                padding: '2px 4px',
              }}
              maxLength={60}
            />
          </foreignObject>
        ) : (
          <text
            x={w / 2}
            y={synopsisText ? 24 : h / 2 + 5}
            textAnchor="middle"
            fontSize={opts.isRoot ? 14 : 13}
            fontWeight={600}
            fill={opts.isRoot ? '#fff' : 'var(--text-primary, #e2e8f0)'}
            style={{ pointerEvents: 'none', userSelect: 'none', fontFamily: 'var(--font-ui, sans-serif)', dominantBaseline: 'auto' }}
            onMouseDown={startDrag}
          >
            {label.length > 16 ? label.slice(0, 16) + '…' : label}
          </text>
        )}

        {/* 梗概 */}
        {synopsisText && !isEditing && (
          <text
            x={w / 2} y={42}
            textAnchor="middle"
            fontSize={10}
            fill={opts.isRoot ? 'rgba(255,255,255,0.65)' : 'var(--text-muted, #64748b)'}
            style={{ pointerEvents: 'none', userSelect: 'none', fontFamily: 'var(--font-ui, sans-serif)' }}
          >
            {synopsisText}
          </text>
        )}

        {/* 状态标签 */}
        {opts.card && !isEditing && (
          <text
            x={w - 8} y={h - 8}
            textAnchor="end"
            fontSize={9}
            fontWeight={600}
            fill={STATUS_COLOR[opts.card.status]}
            style={{ pointerEvents: 'none', userSelect: 'none', fontFamily: 'var(--font-ui, sans-serif)' }}
          >
            {STATUS_LABEL[opts.card.status]}
          </text>
        )}

        {/* 悬停时操作按钮（SVG 原生，不受 foreignObject 裁剪） */}
        {isHovered && !isDragging && !isEditing && (
          <g onMouseDown={e => e.stopPropagation()}>
            {/* + 添加子节点 */}
            <circle
              cx={w - 32} cy={-BTN_R - 2} r={BTN_R}
              fill="var(--bg-panel, #1e1e2e)"
              stroke="rgba(167,139,250,0.5)"
              strokeWidth={1}
              style={{ cursor: 'pointer' }}
              onClick={e => {
                e.stopPropagation();
                onAddCard({
                  title: '新节点',
                  synopsis: '',
                  status: 'planned',
                  parentId: opts.isRoot ? null : id,
                });
              }}
            />
            <text
              x={w - 32} y={-BTN_R + 4}
              textAnchor="middle"
              fontSize={13}
              fill="#a78bfa"
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >+</text>

            {/* 删除按钮（只有普通节点有） */}
            {opts.card && (
              <>
                <circle
                  cx={w - 10} cy={-BTN_R - 2} r={BTN_R}
                  fill="var(--bg-panel, #1e1e2e)"
                  stroke="rgba(248,113,113,0.4)"
                  strokeWidth={1}
                  style={{ cursor: 'pointer' }}
                  onClick={e => {
                    e.stopPropagation();
                    if (window.confirm(`删除「${opts.card!.title}」？`)) onDeleteCard(id);
                  }}
                />
                <text
                  x={w - 10} y={-BTN_R + 4}
                  textAnchor="middle"
                  fontSize={11}
                  fill="#f87171"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >✕</text>
              </>
            )}
          </g>
        )}
      </g>
    );
  };

  // ── 背景拖拽平移 ──────────────────────────────────────────
  const onBgDown = (e: React.MouseEvent<SVGSVGElement>) => {
    const target = e.target as SVGElement;
    if (target.tagName === 'svg' || target.tagName === 'rect' && target.getAttribute('data-bg')) {
      panStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
      setIsPanning(true);
    }
  };

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, overflow: 'hidden', position: 'relative', background: 'var(--bg-base)' }}
    >
      <svg
        width={svgW}
        height={svgH}
        style={{
          display: 'block',
          transform: `translate(${pan.x}px, ${pan.y}px)`,
          overflow: 'visible',
          cursor: dragging ? 'grabbing' : isPanning ? 'grabbing' : 'default',
        }}
        onMouseDown={onBgDown}
      >
        {/* 背景点阵 */}
        <defs>
          <pattern id="cg" x={0} y={0} width={28} height={28} patternUnits="userSpaceOnUse">
            <circle cx={1} cy={1} r={1} fill="rgba(255,255,255,0.06)" />
          </pattern>
        </defs>
        <rect data-bg="1" x={-200} y={-200} width={svgW + 400} height={svgH + 400} fill="url(#cg)" />

        {/* 连线 */}
        <g>{renderEdges()}</g>

        {/* 节点 */}
        <g>
          {/* 根节点 */}
          {(() => {
            const p = getPos(ROOT_ID);
            return renderNode(ROOT_ID, p.x, p.y, ROOT_W, ROOT_H, bookTitle || '书名', { isRoot: true });
          })()}

          {/* 大纲卡片 */}
          {cards.map(card => {
            const p = getPos(card.id);
            return renderNode(card.id, p.x, p.y, NODE_W, NODE_H, card.title, { card });
          })}
        </g>
      </svg>

      {/* 使用提示 */}
      <div style={{
        position: 'absolute', bottom: 10, right: 14,
        fontSize: 11, color: 'rgba(255,255,255,0.25)',
        pointerEvents: 'none', userSelect: 'none',
      }}>
        拖拽节点移动 · 背景拖拽平移 · 双击编辑标题 · 悬停显示 +/✕
      </div>
    </div>
  );
}
