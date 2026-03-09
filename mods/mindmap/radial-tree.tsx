// Miro-style mind map — horizontal balanced tree with organic bezier curves
// Pure SVG: text labels + colored branches, no foreignObject

import { hierarchy, type HierarchyPointNode, tree as d3tree } from 'd3-hierarchy';
import { select } from 'd3-selection';
import 'd3-transition';
import { zoom as d3zoom, type ZoomBehavior, zoomIdentity } from 'd3-zoom';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { TreeItem } from './use-tree-data';

type Props = {
  data: TreeItem;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
  branchColors: Map<string, string>;
  width: number;
  height: number;
};

// Type → icon mapping (simple SVG paths)
const TYPE_ICONS: Record<string, string> = {
  dir: 'M2 4h5l2 2h9v12H2V4z',
  ref: 'M10 2a8 8 0 100 16 8 8 0 000-16zm1 4v4l3.5 2.1-.8 1.3L9 11V6h2z',
  user: 'M12 4a4 4 0 110 8 4 4 0 010-8zM12 14c-4.42 0-8 1.79-8 4v2h16v-2c0-2.21-3.58-4-8-4z',
  root: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
};

function getIcon(type: string): string | null {
  if (TYPE_ICONS[type]) return TYPE_ICONS[type];
  const base = type.split('.')[0];
  return TYPE_ICONS[base] ?? null;
}

// Measure text width roughly (8px per char at 13px font, 6.5px at 11px)
function textWidth(str: string, fontSize: number): number {
  return str.length * fontSize * 0.62;
}

// Split tree children: odd indices left, even indices right (balanced)
type SplitNode = TreeItem & { _side?: 'left' | 'right' };

function splitTree(root: TreeItem): SplitNode {
  const left: SplitNode[] = [];
  const right: SplitNode[] = [];

  root.children.forEach((child, i) => {
    const tagged = { ...child, _side: (i % 2 === 0 ? 'right' : 'left') as const };
    if (i % 2 === 0) right.push(tagged);
    else left.push(tagged);
  });

  return { ...root, children: [...right, ...left] };
}

function tagSide(item: SplitNode, side: 'left' | 'right'): SplitNode {
  return {
    ...item,
    _side: item._side ?? side,
    children: item.children.map(c => tagSide(c as SplitNode, side)),
  };
}

function buildSide(root: TreeItem, children: SplitNode[], side: 'left' | 'right'): SplitNode {
  return {
    ...root,
    _side: undefined,
    children: children.map(c => tagSide(c, side)),
  };
}

// Organic cubic bezier — Miro-style smooth S-curve
function linkPath(sx: number, sy: number, tx: number, ty: number): string {
  const dx = tx - sx;
  const cp = Math.abs(dx) * 0.5;
  return `M${sx},${sy} C${sx + (dx > 0 ? cp : -cp)},${sy} ${tx - (dx > 0 ? cp : -cp)},${ty} ${tx},${ty}`;
}

type LayoutNode = HierarchyPointNode<SplitNode> & { _rx?: number; _ry?: number };

function layoutHalf(
  root: TreeItem,
  children: SplitNode[],
  side: 'left' | 'right',
  height: number,
): LayoutNode | null {
  if (children.length === 0) return null;

  const subtree = buildSide(root, children, side);
  const h = hierarchy(subtree, d => d.children) as LayoutNode;

  const nodeCount = h.descendants().length;
  const treeHeight = Math.max(height * 0.8, nodeCount * 32);

  const layout = d3tree<SplitNode>()
    .size([treeHeight, 220 * Math.max(1, h.height)])
    .separation((a, b) => (a.parent === b.parent ? 1 : 1.5));

  layout(h);

  // Convert: d3tree gives vertical layout (x=vertical, y=horizontal)
  // We flip and mirror for left side
  for (const node of h.descendants()) {
    const lNode = node as LayoutNode;
    if (side === 'left') {
      lNode._rx = -lNode.y!;
      lNode._ry = lNode.x! - treeHeight / 2;
    } else {
      lNode._rx = lNode.y!;
      lNode._ry = lNode.x! - treeHeight / 2;
    }
  }

  return h;
}

export function MindMapTree({ data, selectedPath, onSelect, onToggle, branchColors, width, height }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  // Split into left/right halves
  const { leftNodes, rightNodes } = useMemo(() => {
    const split = splitTree(data);
    const leftChildren: SplitNode[] = [];
    const rightChildren: SplitNode[] = [];
    for (const c of split.children) {
      if ((c as SplitNode)._side === 'left') leftChildren.push(c as SplitNode);
      else rightChildren.push(c as SplitNode);
    }

    const left = layoutHalf(data, leftChildren, 'left', height);
    const right = layoutHalf(data, rightChildren, 'right', height);

    return {
      leftNodes: left ? left.descendants().slice(1) : [],
      rightNodes: right ? right.descendants().slice(1) : [],
    };
  }, [data, height]);

  const allNodes = useMemo(() => [...leftNodes, ...rightNodes], [leftNodes, rightNodes]);

  // Build links from parent→child coords
  const links = useMemo(() => {
    const result: { key: string; path: string; color: string; width: number; source: LayoutNode; target: LayoutNode }[] = [];

    for (const node of allNodes) {
      const parent = node.parent as LayoutNode | null;
      if (!parent) continue;

      const sx = parent.depth === 0 ? 0 : parent._rx!;
      const sy = parent.depth === 0 ? 0 : parent._ry!;
      const tx = node._rx!;
      const ty = node._ry!;
      const color = branchColors.get(node.data.path) ?? 'var(--text-3)';
      const strokeWidth = Math.max(1.5, 3.5 - node.depth * 0.6);

      result.push({
        key: `${parent.data.path}->${node.data.path}`,
        path: linkPath(sx, sy, tx, ty),
        color,
        width: strokeWidth,
        source: parent,
        target: node,
      });
    }

    return result;
  }, [allNodes, branchColors]);

  // Zoom
  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;

    const svg = select(svgRef.current);
    const g = select(gRef.current);

    const zoomBehavior = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', event => {
        g.attr('transform', event.transform.toString());
      });

    svg.call(zoomBehavior);

    const initialTransform = zoomIdentity.translate(width / 2, height / 2).scale(0.85);
    svg.call(zoomBehavior.transform, initialTransform);
    zoomRef.current = zoomBehavior;

    return () => { svg.on('.zoom', null); };
  }, [width, height]);

  // Fit view
  const fitView = useCallback(() => {
    if (!svgRef.current || !zoomRef.current || !gRef.current) return;
    const svg = select(svgRef.current);
    const bounds = gRef.current.getBBox();
    if (!bounds.width || !bounds.height) return;

    const pad = 60;
    const scale = Math.min(
      (width - pad * 2) / bounds.width,
      (height - pad * 2) / bounds.height,
      1.5,
    );
    const tx = width / 2 - (bounds.x + bounds.width / 2) * scale;
    const ty = height / 2 - (bounds.y + bounds.height / 2) * scale;

    svg.transition().duration(400).call(
      zoomRef.current.transform,
      zoomIdentity.translate(tx, ty).scale(scale),
    );
  }, [width, height]);

  // Auto-fit on data change
  useEffect(() => {
    const t = setTimeout(fitView, 80);
    return () => clearTimeout(t);
  }, [data, fitView]);

  const rootName = data.name === '/' ? '/' : data.name;
  const rootColor = branchColors.get(data.path) ?? 'var(--text)';

  return (
    <div className="mm-tree-wrap">
      <div className="mm-toolbar">
        <button className="mm-btn" onClick={fitView} title="Fit view">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
        </button>
      </div>

      <svg ref={svgRef} width={width} height={height} className="mm-svg">
        <g ref={gRef}>
          {/* Links */}
          {links.map(l => (
            <path
              key={l.key}
              d={l.path}
              fill="none"
              stroke={l.color}
              strokeWidth={l.width}
              strokeOpacity={0.7}
              strokeLinecap="round"
              className="mm-link"
            />
          ))}

          {/* Root node — pill shape */}
          <g
            className={`mm-node mm-root${selectedPath === data.path ? ' mm-node-selected' : ''}`}
            onClick={() => onSelect(data.path)}
            onDoubleClick={() => onToggle(data.path)}
          >
            <rect
              x={-textWidth(rootName, 16) / 2 - 24}
              y={-20}
              width={textWidth(rootName, 16) + 48}
              height={40}
              rx={20}
              className="mm-root-bg"
            />
            <text
              textAnchor="middle"
              dominantBaseline="central"
              className="mm-root-label"
            >
              {rootName}
            </text>
          </g>

          {/* Child nodes — text labels with optional icon */}
          {allNodes.map(node => {
            const d = node.data;
            const x = node._rx!;
            const y = node._ry!;
            const color = branchColors.get(d.path) ?? 'var(--text-2)';
            const isLeft = d._side === 'left';
            const isSelected = selectedPath === d.path;
            const icon = getIcon(d.type);
            const hasChildren = d.childCount > 0;
            const label = d.name;

            // Type badge (short)
            const shortType = d.type.includes('.') ? d.type.split('.').pop()! : '';

            return (
              <g
                key={d.path}
                transform={`translate(${x},${y})`}
                className={`mm-node${isSelected ? ' mm-node-selected' : ''}`}
                onClick={() => onSelect(d.path)}
                onDoubleClick={() => onToggle(d.path)}
              >
                {/* Invisible hit area */}
                <rect
                  x={isLeft ? -textWidth(label, 13) - 30 : -10}
                  y={-14}
                  width={textWidth(label, 13) + 50}
                  height={28}
                  fill="transparent"
                  className="mm-hit"
                />

                {/* Selection indicator */}
                {isSelected && (
                  <rect
                    x={isLeft ? -textWidth(label, 13) - 26 : -6}
                    y={-12}
                    width={textWidth(label, 13) + 42}
                    height={24}
                    rx={12}
                    className="mm-select-bg"
                    fill={color}
                    fillOpacity={0.1}
                  />
                )}

                {/* Dot at connection point */}
                <circle
                  cx={0}
                  cy={0}
                  r={hasChildren && !d.expanded ? 4 : 3}
                  fill={color}
                  className="mm-dot"
                />

                {/* Icon */}
                {icon && (
                  <g transform={`translate(${isLeft ? -22 : 8}, -8) scale(0.7)`}>
                    <path d={icon} fill={color} fillOpacity={0.6} />
                  </g>
                )}

                {/* Label */}
                <text
                  x={isLeft ? -12 : (icon ? 24 : 12)}
                  textAnchor={isLeft ? 'end' : 'start'}
                  dominantBaseline="central"
                  className="mm-label"
                  fill={color}
                >
                  {label}
                </text>

                {/* Type badge */}
                {shortType && node.depth <= 2 && (
                  <text
                    x={isLeft ? -12 - textWidth(label, 13) - 8 : (icon ? 24 : 12) + textWidth(label, 13) + 8}
                    textAnchor={isLeft ? 'end' : 'start'}
                    dominantBaseline="central"
                    className="mm-type-tag"
                    fill={color}
                  >
                    {shortType}
                  </text>
                )}

                {/* Child count badge */}
                {hasChildren && !d.expanded && (
                  <g
                    transform={`translate(${isLeft ? 8 : -8 + (icon ? 24 : 12) + textWidth(label, 13) + (shortType && node.depth <= 2 ? textWidth(shortType, 10) + 16 : 8)}, 0)`}
                    className="mm-count-badge"
                    onClick={e => { e.stopPropagation(); onToggle(d.path); }}
                  >
                    <circle r={8} fill={color} fillOpacity={0.15} />
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={color}
                      fontSize="9"
                      fontWeight="600"
                    >
                      {d.childCount}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
