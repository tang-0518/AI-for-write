// =============================================================
// components/MiniGraph.tsx — 极简知识图谱（红点 + 黑线）
//
// 【设计原则】
//   - 纯 2D Canvas，内嵌于 MemorySidebar
//   - 节点：统一红色圆圈 + 截短标签；边：半透明黑线
//   - 点击节点 → 回调 onNodeClick；拖拽节点 → 固定位置
//
// 【力仿真（2D）】
//   排斥力（库仑）+ 弹簧吸引（相连节点）+ 向心力 + 速度阻尼
// =============================================================

import { useEffect, useRef, useCallback, useState } from 'react';
import { useNovelGraph } from '../hooks/useNovelGraph';

// ── 常量 ─────────────────────────────────────────────────────────
const R          = 10;      // 节点半径
const K_REP      = 1800;    // 斥力系数
const K_SPR      = 0.06;    // 弹簧系数
const L0         = 90;      // 弹簧自然长度
const K_GRAV     = 0.018;   // 向心力
const DAMP       = 0.78;    // 速度阻尼
const ALPHA_STOP = 0.005;   // 仿真收敛阈值
const MAX_NODES  = 24;      // 节点上限（超限截取最近更新的）

// ── 仿真节点 ──────────────────────────────────────────────────────
interface SimNode {
  id:     string;
  name:   string;
  type:   string;
  x:      number; y: number;
  vx:     number; vy: number;
  pinned: boolean;
}

// ── Props ─────────────────────────────────────────────────────────
interface MiniGraphProps {
  bookId:        string | null;
  height?:       number;           // 画布高度，默认 200
  onNodeClick?:  (name: string, type: string) => void;  // 点击节点回调
}

export function MiniGraph({ bookId, height = 200, onNodeClick }: MiniGraphProps) {
  const { graph, loading } = useNovelGraph(bookId);

  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const nodesRef    = useRef<SimNode[]>([]);
  const rafRef      = useRef<number>(0);
  const alphaRef    = useRef(1);
  const hoveredRef  = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const dragRef     = useRef<{ id: string; ox: number; oy: number } | null>(null);
  const sizeRef     = useRef({ w: 260, h: height });

  const [tooltip, setTooltip] = useState<{ name: string; x: number; y: number } | null>(null);

  // ── 从 graph 同步节点列表 ─────────────────────────────────────
  useEffect(() => {
    if (!graph) return;
    const w = sizeRef.current.w;
    const h = sizeRef.current.h;

    const incoming = graph.entities
      .slice()
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, MAX_NODES);

    const prev = new Map(nodesRef.current.map(n => [n.id, n]));
    nodesRef.current = incoming.map(e => {
      const p = prev.get(e.id);
      return p ?? {
        id: e.id, name: e.name, type: e.type,
        x: w / 2 + (Math.random() - 0.5) * 120,
        y: h / 2 + (Math.random() - 0.5) * 80,
        vx: 0, vy: 0, pinned: false,
      };
    });

    alphaRef.current = 1; // 重新热启动仿真
  }, [graph]);

  // ── 力仿真 tick ───────────────────────────────────────────────
  const tick = useCallback(() => {
    const nodes = nodesRef.current;
    if (!nodes.length || alphaRef.current < ALPHA_STOP) return;

    const { w, h } = sizeRef.current;
    const cx = w / 2, cy = h / 2;

    // 斥力
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const d2 = dx * dx + dy * dy + 1;
        const f  = K_REP / d2;
        const fx = f * dx / Math.sqrt(d2);
        const fy = f * dy / Math.sqrt(d2);
        nodes[i].vx -= fx; nodes[i].vy -= fy;
        nodes[j].vx += fx; nodes[j].vy += fy;
      }
    }

    // 弹簧（connected edges）
    if (graph) {
      const nodeMap = new Map(nodes.map(n => [n.name, n]));
      for (const rel of graph.relations) {
        const a = nodeMap.get(rel.from);
        const b = nodeMap.get(rel.to);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d  = Math.sqrt(dx * dx + dy * dy) || 1;
        const f  = K_SPR * (d - L0);
        const fx = f * dx / d;
        const fy = f * dy / d;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }
    }

    // 向心力 + 积分
    let maxV = 0;
    for (const n of nodes) {
      if (n.pinned) continue;
      n.vx += K_GRAV * (cx - n.x);
      n.vy += K_GRAV * (cy - n.y);
      n.vx *= DAMP; n.vy *= DAMP;
      n.x  += n.vx; n.y  += n.vy;
      // 边界 clamp
      n.x = Math.max(R + 4, Math.min(w - R - 4, n.x));
      n.y = Math.max(R + 4, Math.min(h - R - 4, n.y));
      maxV = Math.max(maxV, Math.abs(n.vx), Math.abs(n.vy));
    }

    alphaRef.current = maxV;
  }, [graph]);

  // ── 绘制（极简：红点 + 黑线） ───────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx)  return;
    const { w, h } = sizeRef.current;
    const nodes    = nodesRef.current;

    ctx.clearRect(0, 0, w, h);
    if (!nodes.length) return;

    const nodeMap = new Map(nodes.map(n => [n.name, n]));

    // 连线：提高透明度让线条清晰可见
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth   = 1;
    if (graph) {
      for (const rel of graph.relations) {
        const a = nodeMap.get(rel.from);
        const b = nodeMap.get(rel.to);
        if (!a || !b) continue;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // 节点：统一红色圆圈
    for (const n of nodes) {
      const isSelected = selectedRef.current === n.id;
      const r = isSelected ? R + 2 : R;

      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? '#ff2222' : '#e04444';
      ctx.fill();

      // 标签（11px + CJK 字体防乱码）
      const label = n.name.length > 5 ? n.name.slice(0, 5) + '…' : n.name;
      ctx.font         = '11px "Microsoft YaHei","PingFang SC",sans-serif';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle    = 'rgba(255,255,255,0.85)';
      ctx.fillText(label, n.x, n.y + r + 3);
    }
  }, [graph]);

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
      const h = height;
      canvas.width  = w * devicePixelRatio;
      canvas.height = h * devicePixelRatio;
      canvas.style.width  = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // 先重置再 scale，防止多次 resize 导致 scale 叠加（乱码根因）
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(devicePixelRatio, devicePixelRatio);
      }
      sizeRef.current = { w, h };
      alphaRef.current = 1;
    });
    ro.observe(canvas.parentElement!);
    return () => ro.disconnect();
  }, [height]);

  // ── 鼠标命中检测 ─────────────────────────────────────────────
  const hitTest = (cx: number, cy: number): SimNode | null => {
    for (const n of nodesRef.current) {
      const dx = cx - n.x, dy = cy - n.y;
      if (dx * dx + dy * dy <= (R + 4) ** 2) return n;
    }
    return null;
  };

  const getPos = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const { x, y } = getPos(e);
    if (dragRef.current) {
      const n = nodesRef.current.find(n => n.id === dragRef.current!.id);
      if (n) { n.x = x; n.y = y; n.pinned = true; alphaRef.current = 1; }
      return;
    }
    const hit = hitTest(x, y);
    hoveredRef.current = hit?.id ?? null;
    if (hit) {
      setTooltip({ name: hit.name, x, y });
      (canvasRef.current!).style.cursor = 'pointer';
    } else {
      setTooltip(null);
      (canvasRef.current!).style.cursor = 'default';
    }
  };

  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);

  const onMouseDown = (e: React.MouseEvent) => {
    const { x, y } = getPos(e);
    mouseDownPosRef.current = { x, y };
    const hit = hitTest(x, y);
    if (hit) {
      dragRef.current = { id: hit.id, ox: x - hit.x, oy: y - hit.y };
      selectedRef.current = hit.id;
      alphaRef.current    = 1;
    } else {
      selectedRef.current = null;
    }
  };

  const onMouseUp = (e: React.MouseEvent) => {
    const { x, y } = getPos(e);
    const down = mouseDownPosRef.current;
    const isClick = down && Math.abs(x - down.x) < 5 && Math.abs(y - down.y) < 5;
    if (isClick && dragRef.current && onNodeClick) {
      const node = nodesRef.current.find(n => n.id === dragRef.current!.id);
      if (node) onNodeClick(node.name, node.type);
    }
    dragRef.current = null;
    mouseDownPosRef.current = null;
  };

  // ── 渲染 ──────────────────────────────────────────────────────
  return (
    <div className="mg-root">
      {/* 顶部栏 */}
      <div className="mg-bar">
        <span className="mg-stat">
          {graph ? `${graph.entities.length} 实体 · ${graph.relations.length} 关系` : '加载中…'}
        </span>
        <span style={{ fontSize: 10, opacity: 0.45 }}>点击节点查看</span>
      </div>

      {/* Canvas 区域 */}
      <div className="mg-canvas-wrap" style={{ height }}>
        {loading && !graph && (
          <div className="mg-loading">
            <span /><span /><span />
          </div>
        )}
        {graph && graph.entities.length === 0 && (
          <div className="mg-empty">暂无实体数据</div>
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
            style={{ left: tooltip.x + 10, top: tooltip.y - 22 }}
          >
            {tooltip.name}
          </div>
        )}
      </div>

    </div>
  );
}

export default MiniGraph;
