// =============================================================
// GraphPanel.tsx — 3D 知识图谱
//
// 【升级说明】
//   原版：SVG 平面力导向（2D）
//   现版：Canvas 2D + 透视投影 + 3D 力仿真 + 轨道旋转
//
// 【交互方式】
//   背景拖拽  → 轨道旋转（方位角 + 仰角）
//   点击节点  → 选中，显示关系面板
//   点击背景  → 取消选中
//   悬停节点  → Tooltip
//
// 【3D 投影原理（project3D 函数）】
//   1. 绕 Y 轴旋转（azimuth / 方位角）
//   2. 绕 X 轴旋转（elevation / 仰角）
//   3. 透视除法：scale = FOV / (FOV + rotated_z + CAM_DIST)
//   4. 屏幕坐标：sx = W/2 + rotated_x * scale
//
// 【Painter's Algorithm】
//   每帧按投影后的 z 深度排序，从远到近绘制节点，
//   避免近处节点被远处节点遮挡。
// =============================================================

import { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import { useNovelGraph } from '../hooks/useNovelGraph';
import type { NovelEntityType, NovelEntity, NovelRelation } from '../hooks/useNovelGraph';

// ── 类型元数据 ────────────────────────────────────────────────
const META: Record<NovelEntityType, { color: string; label: string; emoji: string }> = {
  character:  { color: '#f87171', label: '角色',   emoji: '👤' },
  faction:    { color: '#f472b6', label: '势力',   emoji: '⚔️' },
  item:       { color: '#fbbf24', label: '道具',   emoji: '🗡️' },
  location:   { color: '#60a5fa', label: '地点',   emoji: '📍' },
  event:      { color: '#c084fc', label: '事件',   emoji: '⚡' },
  world_rule: { color: '#34d399', label: '规则',   emoji: '📜' },
  plot_hook:  { color: '#fb923c', label: '伏笔',   emoji: '🎣' },
};

const CHAR_TYPES  = new Set<NovelEntityType>(['character', 'faction', 'item']);
const WORLD_TYPES = new Set<NovelEntityType>(['event', 'location', 'world_rule', 'plot_hook']);
const CAUSAL_KW   = ['导致','触发','引起','影响','造成','使得','迫使','导向','引发','促使','因此','所以'];

// ── 画布 & 透视常量 ───────────────────────────────────────────
const CW = 640;   // 画布 CSS 宽度
const CH = 360;   // 画布 CSS 高度
const FOV = 480;  // 透视焦距（越大透视感越弱）
const CAM_DIST = 240; // 摄影机到原点的距离
const R = 14;     // 节点基础半径（z=0 时）

// ── 3D 力仿真常量 ─────────────────────────────────────────────
const K_REP  = 3200;  // 斥力系数
const K_SPR  = 0.038; // 弹簧系数
const L0     = 110;   // 弹簧自然长度
const K_GRAV = 0.013; // 向心引力（拉回原点）
const DAMP   = 0.80;  // 速度阻尼
const SPHERE_BOUND = 210; // 节点活动球形空间半径
const ALPHA_MIN    = 0.004;
const POLL_MS = 4000;

type TabKey = 'character' | 'world' | 'causal';

// ── 3D 仿真节点 ───────────────────────────────────────────────
interface Sim {
  id: string; name: string; type: NovelEntityType;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  pinned?: boolean; isNew?: boolean;
}

interface GraphPanelProps {
  bookId:         string | null;
  onClose:        () => void;
  onOpenCapsule?: (name: string) => void;
}

// ── 3D 透视投影 ───────────────────────────────────────────────
//
// 参数：
//   (x, y, z)  — 世界坐标
//   az         — 方位角（绕 Y 轴），单位 rad
//   el         — 仰角（绕 X 轴），单位 rad
//
// 返回：
//   sx, sy     — 屏幕坐标（CSS 像素）
//   scale      — 透视缩放因子（近大远小）
//   fz         — 旋转后的 z 深度（用于 painter's algorithm 排序）
//
function project3D(
  x: number, y: number, z: number,
  az: number, el: number,
): { sx: number; sy: number; scale: number; fz: number } {
  // 步骤 1：绕 Y 轴旋转（方位角）
  const rx = Math.cos(az) * x + Math.sin(az) * z;
  const ry = y;
  const rz = -Math.sin(az) * x + Math.cos(az) * z;

  // 步骤 2：绕 X 轴旋转（仰角）
  const fx = rx;
  const fy = Math.cos(el) * ry - Math.sin(el) * rz;
  const fz = Math.sin(el) * ry + Math.cos(el) * rz;

  // 步骤 3：透视除法（摄影机在 z = -CAM_DIST 处）
  const s = FOV / (FOV + fz + CAM_DIST);

  return { sx: CW / 2 + fx * s, sy: CH / 2 + fy * s, scale: s, fz };
}

// ── 3D 力仿真步进 ─────────────────────────────────────────────
function stepSim(
  nodes: Sim[],
  edges: { s: number; t: number; w: number }[],
): number {
  // 斥力（节点两两互斥）
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[j].x - nodes[i].x;
      const dy = nodes[j].y - nodes[i].y;
      const dz = nodes[j].z - nodes[i].z;
      const d2 = dx * dx + dy * dy + dz * dz + 1;
      const d  = Math.sqrt(d2);
      const f  = K_REP / d2;
      const nx = dx / d, ny = dy / d, nz = dz / d;
      nodes[i].vx -= nx * f; nodes[i].vy -= ny * f; nodes[i].vz -= nz * f;
      nodes[j].vx += nx * f; nodes[j].vy += ny * f; nodes[j].vz += nz * f;
    }
  }

  // 弹簧（有关系的节点互相吸引）
  for (const { s, t, w } of edges) {
    const restLen = L0 / (0.5 + w * 0.5);
    const dx = nodes[t].x - nodes[s].x;
    const dy = nodes[t].y - nodes[s].y;
    const dz = nodes[t].z - nodes[s].z;
    const d  = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const f  = K_SPR * (d - restLen);
    const nx = dx / d, ny = dy / d, nz = dz / d;
    nodes[s].vx += nx * f; nodes[s].vy += ny * f; nodes[s].vz += nz * f;
    nodes[t].vx -= nx * f; nodes[t].vy -= ny * f; nodes[t].vz -= nz * f;
  }

  // 向心引力 + 速度积分
  let maxV = 0;
  for (const n of nodes) {
    if (n.pinned) { n.vx = 0; n.vy = 0; n.vz = 0; continue; }
    n.vx += -n.x * K_GRAV;
    n.vy += -n.y * K_GRAV;
    n.vz += -n.z * K_GRAV;
    n.vx *= DAMP; n.vy *= DAMP; n.vz *= DAMP;
    n.x += n.vx; n.y += n.vy; n.z += n.vz;
    // 限制在球形空间内（防止节点飞离屏幕）
    const dist = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z);
    if (dist > SPHERE_BOUND) {
      const sf = SPHERE_BOUND / dist;
      n.x *= sf; n.y *= sf; n.z *= sf;
    }
    maxV = Math.max(maxV, Math.abs(n.vx) + Math.abs(n.vy) + Math.abs(n.vz));
  }
  return maxV;
}

// ── Canvas 绘制函数 ───────────────────────────────────────────
function drawGraph(
  ctx: CanvasRenderingContext2D,
  nodes: Sim[],
  edges: NovelRelation[],
  selected: string | null,
  hoveredId: string | null,
  az: number,
  el: number,
  selName: string | undefined,
) {
  ctx.save();
  ctx.clearRect(0, 0, CW, CH);

  // 投影所有节点
  type ProjSim = Sim & { sx: number; sy: number; scale: number; fz: number };
  const projected: ProjSim[] = nodes.map(n => ({ ...n, ...project3D(n.x, n.y, n.z, az, el) }));
  const nameMap = new Map(projected.map(n => [n.name, n]));

  // ── 绘制边 ────────────────────────────────────────────────
  for (const r of edges) {
    const sn = nameMap.get(r.from);
    const tn = nameMap.get(r.to);
    if (!sn || !tn) continue;

    const isCausal = CAUSAL_KW.some(kw => r.relationType.includes(kw));
    const isHL     = selName && (r.from === selName || r.to === selName);
    const depth    = Math.min(sn.scale, tn.scale);

    ctx.beginPath();
    ctx.moveTo(sn.sx, sn.sy);
    ctx.lineTo(tn.sx, tn.sy);

    if (isHL) {
      ctx.strokeStyle = 'rgba(167,139,250,0.85)';
      ctx.lineWidth   = 2;
      ctx.setLineDash([]);
    } else if (isCausal) {
      ctx.strokeStyle = `rgba(251,191,36,${0.22 + depth * 0.2})`;
      ctx.lineWidth   = 1.4;
      ctx.setLineDash([4, 3]);
    } else {
      ctx.strokeStyle = `rgba(255,255,255,${0.04 + depth * 0.1})`;
      ctx.lineWidth   = 0.7;
      ctx.setLineDash([]);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 高亮边的关系标签
    if (isHL) {
      const mx = (sn.sx + tn.sx) / 2;
      const my = (sn.sy + tn.sy) / 2 - 5;
      ctx.font        = '7.5px sans-serif';
      ctx.textAlign   = 'center';
      ctx.fillStyle   = 'rgba(167,139,250,0.9)';
      ctx.fillText(r.relationType, mx, my);
    }
  }

  // ── 按深度排序（从远到近，painter's algorithm）─────────────
  const sorted = [...projected].sort((a, b) => b.fz - a.fz);

  // ── 绘制节点 ─────────────────────────────────────────────
  for (const n of sorted) {
    const meta = META[n.type];
    const nr   = Math.max(5, R * n.scale); // 透视缩放后的节点半径
    const isSel = n.id === selected;
    const isHov = n.id === hoveredId;

    // 选中：外圈光晕
    if (isSel) {
      ctx.beginPath();
      ctx.arc(n.sx, n.sy, nr + 9, 0, Math.PI * 2);
      ctx.fillStyle = meta.color + '1e';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(n.sx, n.sy, nr + 5, 0, Math.PI * 2);
      ctx.strokeStyle = meta.color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.55;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // 新节点：入场光晕
    if (n.isNew) {
      ctx.beginPath();
      ctx.arc(n.sx, n.sy, nr + 13, 0, Math.PI * 2);
      ctx.fillStyle = meta.color + '18';
      ctx.fill();
    }

    // 主圆：径向渐变模拟球面光照（左上高光）
    const grad = ctx.createRadialGradient(
      n.sx - nr * 0.28, n.sy - nr * 0.28, 0,
      n.sx, n.sy, nr,
    );
    grad.addColorStop(0, meta.color + 'f0');
    grad.addColorStop(1, meta.color + '55');

    ctx.beginPath();
    ctx.arc(n.sx, n.sy, nr, 0, Math.PI * 2);
    ctx.fillStyle   = grad;
    ctx.globalAlpha = isSel || isHov ? 1 : 0.78 + n.scale * 0.18;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = meta.color;
    ctx.lineWidth   = isSel || isHov ? 2 : 1;
    ctx.globalAlpha = isSel || isHov ? 1 : 0.55 + n.scale * 0.35;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // emoji 图标（仅近处节点显示）
    if (nr > 8) {
      ctx.font        = `${Math.max(8, 10 * n.scale)}px sans-serif`;
      ctx.textAlign   = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(meta.emoji, n.sx, n.sy);
      ctx.textBaseline = 'alphabetic';
    }

    // 名称标签（节点下方）
    if (nr > 6) {
      const labelSize = Math.max(8, 9 * n.scale);
      ctx.font      = `${isSel ? '600 ' : ''}${labelSize}px 'PingFang SC','Microsoft YaHei',sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = isSel || isHov ? 'white' : `rgba(255,255,255,${0.60 + n.scale * 0.30})`;
      const label   = n.name.length > 5 ? n.name.slice(0, 4) + '…' : n.name;
      ctx.fillText(label, n.sx, n.sy + nr + 11 * n.scale);
    }
  }

  ctx.restore();
}

// ── 主组件 ────────────────────────────────────────────────────
export default function GraphPanel({ bookId, onClose, onOpenCapsule }: GraphPanelProps) {
  const { graph, stats, loading, error, apiAvailable, loadGraph } =
    useNovelGraph(bookId);

  const [tab,          setTab]          = useState<TabKey>('character');
  const [collapsed,    setCollapsed]    = useState(false);
  const [selected,     setSelected]     = useState<string | null>(null);
  const [hoveredId,    setHoveredId]    = useState<string | null>(null);
  const [isDragging,   setIsDragging]   = useState(false); // 控制鼠标 cursor

  // 轨道旋转（存 ref 避免 React 状态触发不必要重渲染）
  const azRef  = useRef(0.35);  // 初始方位角：稍微旋转，让用户看到 3D 感
  const elRef  = useRef(-0.2);  // 初始仰角：俯视角度

  const orbitDragRef = useRef<{
    startX: number; startY: number;
    startAz: number; startEl: number;
  } | null>(null);

  // 两套仿真（角色层 / 世界线）
  const charSimRef  = useRef<Sim[]>([]);
  const worldSimRef = useRef<Sim[]>([]);
  const simRef      = tab === 'world' ? worldSimRef : charSimRef;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [, setTick] = useState(0); // 触发重渲染以更新 tooltip 位置
  const rafRef    = useRef<number>(0);
  const alphaRef  = useRef(1.0);

  // ── 轮询 ──────────────────────────────────────────────────
  useEffect(() => {
    if (!apiAvailable) return;
    const id = setInterval(loadGraph, POLL_MS);
    return () => clearInterval(id);
  }, [apiAvailable, loadGraph]);

  // ── 同步图谱 → 3D 仿真节点 ───────────────────────────────
  const syncSim = useCallback((
    ref: React.MutableRefObject<Sim[]>,
    entities: NovelEntity[],
  ) => {
    const prevMap = new Map(ref.current.map(n => [n.id, n]));
    ref.current = entities.map(e => {
      const ex = prevMap.get(e.id);
      if (ex) return { ...ex, isNew: false };
      // 新节点随机分布在球面上（均匀分布）
      const θ = Math.random() * Math.PI * 2;
      const φ = Math.acos(2 * Math.random() - 1);
      const r = 70 + Math.random() * 90;
      return {
        id: e.id, name: e.name, type: e.type,
        x: r * Math.sin(φ) * Math.cos(θ),
        y: r * Math.sin(φ) * Math.sin(θ),
        z: r * Math.cos(φ),
        vx: 0, vy: 0, vz: 0,
        isNew: true,
      };
    });
    setTimeout(() => {
      ref.current = ref.current.map(n => ({ ...n, isNew: false }));
      setTick(t => t + 1);
    }, 700);
  }, []);

  useEffect(() => {
    if (!graph) return;
    syncSim(charSimRef,  graph.entities.filter(e => CHAR_TYPES.has(e.type)));
    syncSim(worldSimRef, graph.entities.filter(e => WORLD_TYPES.has(e.type)));
    alphaRef.current = 1.0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  // ── 仿真步进 ──────────────────────────────────────────────
  const runStep = useCallback(() => {
    const nodes = simRef.current;
    if (!nodes.length) return 0;
    const rels  = graph?.relations ?? [];
    const edges = rels.flatMap(r => {
      const s = nodes.findIndex(n => n.name === r.from);
      const t = nodes.findIndex(n => n.name === r.to);
      return s >= 0 && t >= 0 ? [{ s, t, w: r.weight ?? 0.5 }] : [];
    });
    return stepSim(nodes, edges);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, tab]);

  const kickSim = useCallback(() => {
    if (rafRef.current) return;
    const loop = () => {
      const physicsLive = alphaRef.current >= ALPHA_MIN;
      if (physicsLive) {
        alphaRef.current = runStep();
      }
      setTick(t => t + 1); // 触发 useLayoutEffect 重绘
      if (physicsLive || orbitDragRef.current) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        rafRef.current = 0;
      }
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [runStep]);

  // 图谱更新或 tab 切换时重启仿真
  useEffect(() => {
    if (tab === 'causal') return;
    alphaRef.current = 0.5;
    kickSim();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, tab]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // ── Canvas 绘制（每次渲染后同步执行）─────────────────────
  useLayoutEffect(() => {
    if (tab === 'causal' || collapsed) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const selEnt = selected ? graph?.entities.find(e => e.id === selected) : undefined;
    drawGraph(ctx, simRef.current, graph?.relations ?? [],
      selected, hoveredId, azRef.current, elRef.current, selEnt?.name);
  });

  // ── Hit test：找光标下最近（最大 scale）的节点 ────────────
  const hitTest = useCallback((cx: number, cy: number): Sim | null => {
    let best: Sim | null = null;
    let bestScale = -Infinity;
    for (const n of simRef.current) {
      const p  = project3D(n.x, n.y, n.z, azRef.current, elRef.current);
      const nr = Math.max(5, R * p.scale);
      const dx = cx - p.sx, dy = cy - p.sy;
      if (dx * dx + dy * dy <= (nr + 5) * (nr + 5) && p.scale > bestScale) {
        best = n;
        bestScale = p.scale;
      }
    }
    return best;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const getPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  // ── 鼠标事件 ─────────────────────────────────────────────
  const onCanvasDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getPos(e);
    const hit = hitTest(x, y);
    if (!hit) {
      orbitDragRef.current = {
        startX: e.clientX, startY: e.clientY,
        startAz: azRef.current, startEl: elRef.current,
      };
      setIsDragging(true);
      kickSim();
    }
  };

  const onCanvasMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const drag = orbitDragRef.current;
    if (drag) {
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      azRef.current = drag.startAz + dx * 0.008;
      elRef.current = Math.max(-1.1, Math.min(1.1, drag.startEl + dy * 0.008));
      setTick(t => t + 1); // 触发重绘
      return;
    }
    const { x, y } = getPos(e);
    const hit = hitTest(x, y);
    setHoveredId(hit ? hit.id : null);
  };

  const onCanvasUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const drag = orbitDragRef.current;
    if (drag) {
      const moved = Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY);
      orbitDragRef.current = null;
      setIsDragging(false);
      if (moved < 5) setSelected(null); // 几乎没动 → 取消选中
      return;
    }
    const { x, y } = getPos(e);
    const hit = hitTest(x, y);
    if (hit) setSelected(prev => prev === hit.id ? null : hit.id);
  };

  // ── 因果链数据 ────────────────────────────────────────────
  const causalChains = useMemo<{ rel: NovelRelation; src: NovelEntity; tgt: NovelEntity }[]>(() => {
    if (!graph) return [];
    const entityMap = new Map(graph.entities.map(e => [e.name, e]));
    return graph.relations
      .filter(r => CAUSAL_KW.some(kw => r.relationType.includes(kw)))
      .map(r => {
        const src = entityMap.get(r.from);
        const tgt = entityMap.get(r.to);
        return src && tgt ? { rel: r, src, tgt } : null;
      })
      .filter((x): x is { rel: NovelRelation; src: NovelEntity; tgt: NovelEntity } => x !== null)
      .slice(0, 20);
  }, [graph]);

  // ── 选中详情 ─────────────────────────────────────────────
  const selEntity = selected ? graph?.entities.find(e => e.id === selected) : null;
  const selRels   = selEntity
    ? (graph?.relations ?? []).filter(r => r.from === selEntity.name || r.to === selEntity.name)
    : [];

  // 悬停 tooltip 投影坐标（用于定位 div）
  const hovNode  = hoveredId ? simRef.current.find(n => n.id === hoveredId) : null;
  const hovProj  = hovNode ? project3D(hovNode.x, hovNode.y, hovNode.z, azRef.current, elRef.current) : null;

  // ── 主渲染 ────────────────────────────────────────────────
  return (
    <div className="gp-float gp-float-wide">

      {/* 标题栏 */}
      <div className="gp-header" onClick={() => setCollapsed(c => !c)}>
        <span className="gp-title">
          🕸️&nbsp;{bookId ? '知识图谱' : '知识图谱'}
          {stats && (
            <span className="gp-pill">
              {stats.entityCount} 节点 · {stats.relationCount} 关系
            </span>
          )}
        </span>
        <div className="gp-hbtns" onClick={e => e.stopPropagation()}>
          {loading && <span className="gp-spin">⟳</span>}
          <button className="gp-hbtn" onClick={loadGraph} title="刷新">↻</button>
          <button className="gp-hbtn" onClick={() => setCollapsed(c => !c)}>
            {collapsed ? '▲' : '▼'}
          </button>
          <button className="gp-hbtn" onClick={onClose}>✕</button>
        </div>
      </div>

      {!collapsed && (
        <div className="gp-body">

          {/* 标签页 */}
          <div className="gp-tabs">
            {([
              { key: 'character', label: '👤 角色层' },
              { key: 'world',     label: '🌍 世界线' },
              { key: 'causal',    label: '⚡ 因果链' },
            ] as { key: TabKey; label: string }[]).map(t => (
              <button
                key={t.key}
                className={`gp-tab${tab === t.key ? ' active' : ''}`}
                onClick={() => { setTab(t.key); setSelected(null); }}
              >
                {t.label}
                {t.key === 'causal' && causalChains.length > 0 && (
                  <span className="gp-tab-badge">{causalChains.length}</span>
                )}
              </button>
            ))}
          </div>

          {/* 因果链视图 */}
          {tab === 'causal' && (
            <div className="gp-causal">
              {causalChains.length === 0 ? (
                <div className="gp-causal-empty">
                  <div style={{ fontSize: 28 }}>🔗</div>
                  <div>暂无因果关系</div>
                  <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
                    在关系类型中包含「导致/触发/引发/影响」等词后自动显示
                  </div>
                </div>
              ) : (
                <div className="gp-causal-list">
                  {causalChains.map(({ rel, src, tgt }) => (
                    <div key={rel.id} className="gp-causal-row">
                      <div className="gp-causal-node" style={{ borderColor: META[src.type].color }}>
                        <span className="gp-causal-type-badge"
                          style={{ background: META[src.type].color + '30', color: META[src.type].color }}>
                          {META[src.type].emoji}
                        </span>
                        <span className="gp-causal-name">{src.name}</span>
                      </div>
                      <div className="gp-causal-arrow">
                        <span className="gp-causal-rel">{rel.relationType}</span>
                        <span className="gp-causal-line">──────→</span>
                        {rel.notes && (
                          <span className="gp-causal-notes" title={rel.notes}>
                            {rel.notes.slice(0, 18)}{rel.notes.length > 18 ? '…' : ''}
                          </span>
                        )}
                      </div>
                      <div className="gp-causal-node" style={{ borderColor: META[tgt.type].color }}>
                        <span className="gp-causal-type-badge"
                          style={{ background: META[tgt.type].color + '30', color: META[tgt.type].color }}>
                          {META[tgt.type].emoji}
                        </span>
                        <span className="gp-causal-name">{tgt.name}</span>
                        {rel.chapter != null && (
                          <span className="gp-causal-ch">第{rel.chapter}章</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 3D 力导向图（角色层 / 世界线）*/}
          {tab !== 'causal' && (
            <>
              <div className="gp-layer-hint">
                {tab === 'character'
                  ? '3D 角色层 · 拖拽空白处旋转 · 点击节点查看关系'
                  : '3D 世界线 · 事件、地点、规则节点'}
              </div>

              {/* Canvas 容器（相对定位，用于 Tooltip 绝对定位）*/}
              <div style={{ position: 'relative', lineHeight: 0 }}>
                <canvas
                  ref={canvasRef}
                  width={CW}
                  height={CH}
                  style={{
                    width: CW, height: CH,
                    display: 'block',
                    cursor: isDragging ? 'grabbing' : hoveredId ? 'pointer' : 'grab',
                    borderRadius: '0 0 4px 4px',
                  }}
                  onMouseDown={onCanvasDown}
                  onMouseMove={onCanvasMove}
                  onMouseUp={onCanvasUp}
                  onMouseLeave={() => {
                    orbitDragRef.current = null;
                    setIsDragging(false);
                    setHoveredId(null);
                  }}
                />

                {/* Tooltip */}
                {hovNode && !selected && hovProj && (
                  <div className="gp-tooltip" style={{
                    left: Math.min(hovProj.sx + 18, CW - 110),
                    top:  Math.max(hovProj.sy - 14, 4),
                  }}>
                    <span className="gp-tt-name" style={{ color: META[hovNode.type].color }}>
                      {hovNode.name}
                    </span>
                    <span className="gp-tt-type">{META[hovNode.type].label}</span>
                  </div>
                )}
              </div>

              {/* 选中详情 */}
              {selEntity && (
                <div className="gp-detail">
                  <div className="gp-detail-head">
                    <span style={{ color: META[selEntity.type].color }}>
                      {META[selEntity.type].emoji} {selEntity.name}
                    </span>
                    <span className="gp-detail-badge"
                      style={{ background: META[selEntity.type].color + '25',
                               color: META[selEntity.type].color }}>
                      {META[selEntity.type].label}
                    </span>
                    {selEntity.type === 'character' && onOpenCapsule && (
                      <button className="gp-capsule-btn"
                        onClick={() => onOpenCapsule(selEntity.name)}
                        title="打开角色胶囊">
                        🧩 胶囊
                      </button>
                    )}
                    <button className="gp-detail-close" onClick={() => setSelected(null)}>✕</button>
                  </div>

                  {Object.entries(selEntity.attributes).length > 0 && (
                    <div className="gp-detail-attrs">
                      {Object.entries(selEntity.attributes).slice(0, 4).map(([k, v]) => (
                        <div key={k} className="gp-detail-attr">
                          <span className="gp-attr-k">{k}</span>
                          <span className="gp-attr-v">{v}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {selRels.length > 0 && (
                    <div className="gp-detail-rels">
                      {selRels.slice(0, 5).map(r => {
                        const isFrom = r.from === selEntity.name;
                        const other  = isFrom ? r.to : r.from;
                        const oNode  = simRef.current.find(n => n.name === other);
                        return (
                          <div key={r.id} className="gp-detail-rel">
                            <span className="gp-rel-arrow">{isFrom ? '→' : '←'}</span>
                            <span style={{ color: oNode ? META[oNode.type].color : '#aaa' }}>
                              {other}
                            </span>
                            <span className="gp-rel-type">[{r.relationType}]</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* 图例 */}
              <div className="gp-legend">
                {(Object.entries(META) as [NovelEntityType, typeof META[NovelEntityType]][])
                  .filter(([t]) => (stats?.byType[t] ?? 0) > 0)
                  .map(([t, m]) => (
                    <span key={t} className="gp-legend-item">
                      <span className="gp-legend-dot" style={{ background: m.color }} />
                      {m.label}&thinsp;{stats?.byType[t]}
                    </span>
                  ))}
              </div>

              {!loading && !error && simRef.current.length === 0 && (
                <div className="gp-empty">
                  {bookId ? `暂无${tab === 'character' ? '角色' : '世界'}图谱数据` : '请先打开一部小说'}
                </div>
              )}
              {error && (
                <div className="gp-error">
                  ❌ {error}
                  <button onClick={loadGraph}>重试</button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
