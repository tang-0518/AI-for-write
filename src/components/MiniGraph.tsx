// =============================================================
// MiniGraph.tsx — 知识图谱可视化（Canvas 2D + 力仿真）
// =============================================================

import { useEffect, useRef, useCallback, useState } from 'react';
import { useNovelGraph } from '../hooks/useNovelGraph';

// ── 节点类型配色 ───────────────────────────────────────────────
const TYPE_COLOR: Record<string, string> = {
  character: '#a78bfa',   // 紫色
  event:     '#60a5fa',   // 蓝色
  location:  '#34d399',   // 绿色
  item:      '#fbbf24',   // 琥珀
  concept:   '#f472b6',   // 粉色
};
const DEFAULT_COLOR = '#94a3b8';

function nodeColor(type: string) {
  return TYPE_COLOR[type] ?? DEFAULT_COLOR;
}

// ── 力仿真常量 ─────────────────────────────────────────────────
const BASE_R     = 9;
const R_PER_DEG  = 1.5;    // 每条边增加的半径
const MAX_R      = 20;
const K_REP      = 2200;
const K_SPR      = 0.05;
const L0         = 100;
const K_GRAV     = 0.015;
const DAMP       = 0.76;
const ALPHA_STOP = 0.004;
const MAX_NODES  = 28;

interface SimNode {
  id:     string;
  name:   string;
  type:   string;
  r:      number;          // 节点半径（由连接度决定）
  x:      number; y: number;
  vx:     number; vy: number;
  pinned: boolean;
}

interface MiniGraphProps {
  bookId:        string | null;
  height?:       number;
  highlightName?: string | null;
  onNodeClick?:  (name: string, type: string) => void;
}

// ── 绘制工具 ──────────────────────────────────────────────────
function drawGlow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha = 0.3) {
  const grad = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 2.2);
  grad.addColorStop(0, color.replace(')', `, ${alpha})`).replace('rgb', 'rgba'));
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath();
  ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

export function MiniGraph({ bookId, height = 420, highlightName = null, onNodeClick }: MiniGraphProps) {
  const { graph, loading } = useNovelGraph(bookId);

  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const nodesRef     = useRef<SimNode[]>([]);
  const rafRef       = useRef<number>(0);
  const alphaRef     = useRef(1);
  const hoveredRef   = useRef<string | null>(null);
  const selectedRef  = useRef<string | null>(null);
  const dragRef      = useRef<{ id: string } | null>(null);
  const sizeRef      = useRef({ w: 280, h: height });
  const pulseRef     = useRef(0);   // 脉冲动画计数器

  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);

  // ── 从 graph 同步节点列表（含连接度计算）──────────────────
  useEffect(() => {
    if (!graph) return;
    const { w, h } = sizeRef.current;

    // 计算每个节点的连接度
    const degMap = new Map<string, number>();
    for (const rel of graph.relations) {
      degMap.set(rel.from, (degMap.get(rel.from) ?? 0) + 1);
      degMap.set(rel.to,   (degMap.get(rel.to)   ?? 0) + 1);
    }

    const sorted = graph.entities
      .slice()
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    const hl = highlightName ? sorted.find(e => e.name === highlightName) : undefined;
    const incoming = hl
      ? [hl, ...sorted.filter(e => e.id !== hl.id).slice(0, MAX_NODES - 1)]
      : sorted.slice(0, MAX_NODES);

    const prev = new Map(nodesRef.current.map(n => [n.id, n]));
    nodesRef.current = incoming.map(e => {
      const deg = degMap.get(e.name) ?? 0;
      const r   = Math.min(BASE_R + deg * R_PER_DEG, MAX_R);
      const p   = prev.get(e.id);
      return p
        ? { ...p, r }
        : {
            id: e.id, name: e.name, type: e.type, r,
            x: w / 2 + (Math.random() - 0.5) * 140,
            y: h / 2 + (Math.random() - 0.5) * 100,
            vx: 0, vy: 0, pinned: false,
          };
    });

    alphaRef.current = 1;
  }, [graph, highlightName]);

  useEffect(() => {
    if (!highlightName) return;
    const n = nodesRef.current.find(node => node.name === highlightName);
    if (n) { selectedRef.current = n.id; alphaRef.current = 1; }
  }, [highlightName, graph]);

  // ── 力仿真 tick ───────────────────────────────────────────────
  const tick = useCallback(() => {
    if (!nodesRef.current.length || alphaRef.current < ALPHA_STOP) return;
    const nodes = nodesRef.current.map(n => ({ ...n }));
    const { w, h } = sizeRef.current;
    const cx = w / 2, cy = h / 2;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const d2 = dx * dx + dy * dy + 1;
        const d  = Math.sqrt(d2);
        const f  = K_REP / d2;
        nodes[i].vx -= f * dx / d; nodes[i].vy -= f * dy / d;
        nodes[j].vx += f * dx / d; nodes[j].vy += f * dy / d;
      }
    }

    if (graph) {
      const nodeMap = new Map(nodes.map(n => [n.name, n]));
      for (const rel of graph.relations) {
        const a = nodeMap.get(rel.from), b = nodeMap.get(rel.to);
        if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d  = Math.sqrt(dx * dx + dy * dy) || 1;
        const f  = K_SPR * (d - L0);
        a.vx += f * dx / d; a.vy += f * dy / d;
        b.vx -= f * dx / d; b.vy -= f * dy / d;
      }
    }

    let maxV = 0;
    for (const n of nodes) {
      if (n.pinned) continue;
      n.vx += K_GRAV * (cx - n.x);
      n.vy += K_GRAV * (cy - n.y);
      n.vx *= DAMP; n.vy *= DAMP;
      n.x  += n.vx; n.y  += n.vy;
      const margin = n.r + 6;
      n.x = Math.max(margin, Math.min(w - margin, n.x));
      n.y = Math.max(margin, Math.min(h - margin, n.y));
      maxV = Math.max(maxV, Math.abs(n.vx), Math.abs(n.vy));
    }

    nodesRef.current  = nodes;
    alphaRef.current  = maxV;
    pulseRef.current += 0.06;
  }, [graph]);

  // ── 绘制 ──────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx)  return;
    const { w, h } = sizeRef.current;
    const nodes     = nodesRef.current;
    ctx.clearRect(0, 0, w, h);
    if (!nodes.length) return;

    const nodeMap   = new Map(nodes.map(n => [n.name, n]));
    const selId     = selectedRef.current;
    const hovId     = hoveredRef.current;
    const pulse     = pulseRef.current;

    // ── 边 ───────────────────────────────────────────────────
    if (graph) {
      for (const rel of graph.relations) {
        const a = nodeMap.get(rel.from), b = nodeMap.get(rel.to);
        if (!a || !b) continue;

        const adjSelected = (a.id === selId || b.id === selId);
        const adjHovered  = (a.id === hovId || b.id === hovId);
        const alpha = adjSelected ? 0.75 : adjHovered ? 0.55 : 0.18;

        // 渐变线
        const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
        const ca = nodeColor(a.type), cb = nodeColor(b.type);
        grad.addColorStop(0, `rgba(${hexToRgb(ca)},${alpha})`);
        grad.addColorStop(1, `rgba(${hexToRgb(cb)},${alpha})`);

        // 轻微弧线（控制点向垂直方向偏移）
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const dx = b.x - a.x,       dy = b.y - a.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const bend = Math.min(20, len * 0.12);
        const cpx = mx - dy / len * bend, cpy = my + dx / len * bend;

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(cpx, cpy, b.x, b.y);
        ctx.strokeStyle = grad;
        ctx.lineWidth   = adjSelected ? 1.8 : 1;
        ctx.stroke();

        // 关系标签（仅悬停相邻边时显示）
        if (adjHovered && rel.relationType) {
          ctx.save();
          ctx.font         = '9px "Microsoft YaHei",sans-serif';
          ctx.fillStyle    = `rgba(255,255,255,0.55)`;
          ctx.textAlign    = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(rel.relationType.slice(0, 8), cpx, cpy);
          ctx.restore();
        }
      }
    }

    // ── 节点 ──────────────────────────────────────────────────
    for (const n of nodes) {
      const color      = nodeColor(n.type);
      const rgb        = hexToRgb(color);
      const isSelected = n.id === selId;
      const isHovered  = n.id === hovId;
      const isHL       = highlightName === n.name;

      // 发光晕圈
      if (isSelected || isHL) {
        const pulseR = n.r + 5 + Math.sin(pulse) * 3;
        const glow = ctx.createRadialGradient(n.x, n.y, n.r, n.x, n.y, pulseR + 8);
        glow.addColorStop(0, `rgba(${rgb},0.45)`);
        glow.addColorStop(1, `rgba(${rgb},0)`);
        ctx.beginPath();
        ctx.arc(n.x, n.y, pulseR + 8, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(n.x, n.y, pulseR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${rgb},0.7)`;
        ctx.lineWidth   = 1.5;
        ctx.stroke();
      } else if (isHovered) {
        drawGlow(ctx, n.x, n.y, n.r, color, 0.25);
      }

      // 节点主体：径向渐变填充
      const grad = ctx.createRadialGradient(n.x - n.r * 0.3, n.y - n.r * 0.3, n.r * 0.1, n.x, n.y, n.r);
      grad.addColorStop(0, `rgba(${rgb},1)`);
      grad.addColorStop(0.65, `rgba(${rgb},0.9)`);
      grad.addColorStop(1, `rgba(${rgb},0.55)`);

      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // 边框
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${rgb},0.9)`;
      ctx.lineWidth   = isSelected || isHL ? 2 : 1;
      ctx.stroke();

      // 标签
      const label  = n.name.length > 5 ? n.name.slice(0, 5) + '…' : n.name;
      const labelY = n.y + n.r + 4;
      ctx.font         = `${isSelected || isHL ? 600 : 400} 11px "Microsoft YaHei","PingFang SC",sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      // 文字阴影
      ctx.shadowColor  = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur   = 4;
      ctx.fillStyle    = isSelected || isHL ? '#fff' : `rgba(${rgb},0.95)`;
      ctx.fillText(label, n.x, labelY);
      ctx.shadowBlur   = 0;
    }
  }, [graph, highlightName]);

  // ── 动画循环 ─────────────────────────────────────────────────
  useEffect(() => {
    const loop = () => {
      tick();
      draw();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [tick, draw]);

  // ── Canvas 尺寸响应 ───────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(entries => {
      const w = Math.floor(entries[0].contentRect.width);
      canvas.width  = w * devicePixelRatio;
      canvas.height = height * devicePixelRatio;
      canvas.style.width  = `${w}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(devicePixelRatio, devicePixelRatio);
      }
      sizeRef.current  = { w, h: height };
      alphaRef.current = 1;
    });
    ro.observe(canvas.parentElement!);
    return () => ro.disconnect();
  }, [height]);

  // ── 鼠标交互 ─────────────────────────────────────────────────
  const hitTest = (cx: number, cy: number): SimNode | null => {
    for (const n of nodesRef.current) {
      const dx = cx - n.x, dy = cy - n.y;
      if (dx * dx + dy * dy <= (n.r + 4) ** 2) return n;
    }
    return null;
  };

  const getPos = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);

  const onMouseMove = (e: React.MouseEvent) => {
    const { x, y } = getPos(e);
    if (dragRef.current) {
      nodesRef.current = nodesRef.current.map(n =>
        n.id === dragRef.current!.id ? { ...n, x, y, pinned: true } : n,
      );
      alphaRef.current = 1;
      return;
    }
    const hit = hitTest(x, y);
    hoveredRef.current = hit?.id ?? null;
    if (hit) {
      setTooltip({ text: `${hit.name}（${hit.type}）`, x, y });
      canvasRef.current!.style.cursor = 'pointer';
    } else {
      setTooltip(null);
      canvasRef.current!.style.cursor = 'default';
    }
  };

  const onMouseDown = (e: React.MouseEvent) => {
    const { x, y } = getPos(e);
    mouseDownPosRef.current = { x, y };
    const hit = hitTest(x, y);
    if (hit) {
      dragRef.current    = { id: hit.id };
      selectedRef.current = hit.id;
      alphaRef.current   = 1;
    } else {
      selectedRef.current = null;
    }
  };

  const onMouseUp = (e: React.MouseEvent) => {
    const { x, y } = getPos(e);
    const down    = mouseDownPosRef.current;
    const isClick = down && Math.abs(x - down.x) < 5 && Math.abs(y - down.y) < 5;
    if (isClick && dragRef.current && onNodeClick) {
      const node = nodesRef.current.find(n => n.id === dragRef.current!.id);
      if (node) onNodeClick(node.name, node.type);
    }
    dragRef.current        = null;
    mouseDownPosRef.current = null;
  };

  // ── 图例（去重后的类型列表）────────────────────────────────
  const presentTypes = graph
    ? [...new Set(graph.entities.map(e => e.type))].filter(t => TYPE_COLOR[t])
    : [];

  return (
    <div className="mg-root">
      <div className="mg-bar">
        <span className="mg-stat">
          {graph
            ? `${graph.entities.length} 实体 · ${graph.relations.length} 关系`
            : loading ? '加载中…' : '暂无数据'}
        </span>
        {presentTypes.length > 0 && (
          <div className="mg-legend">
            {presentTypes.map(t => (
              <span key={t} className="mg-legend-item">
                <span className="mg-legend-dot" style={{ background: TYPE_COLOR[t] }} />
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mg-canvas-wrap" style={{ height }}>
        {loading && !graph && (
          <div className="mg-loading"><span /><span /><span /></div>
        )}
        {graph && graph.entities.length === 0 && (
          <div className="mg-empty">暂无实体数据<br /><span>完成章节后自动提取</span></div>
        )}
        <canvas
          ref={canvasRef}
          className="mg-canvas"
          onMouseMove={onMouseMove}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onMouseLeave={() => {
            hoveredRef.current = null;
            dragRef.current    = null;
            setTooltip(null);
          }}
        />
        {tooltip && (
          <div
            className="mg-tooltip"
            style={{ left: tooltip.x + 12, top: tooltip.y - 28 }}
          >
            {tooltip.text}
          </div>
        )}
      </div>
    </div>
  );
}

export default MiniGraph;
