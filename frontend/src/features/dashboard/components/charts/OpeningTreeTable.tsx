"use client";

import { useState } from "react";
import type { OpeningTreeNode } from "@/types";
import OpeningGameListModal from "@/features/dashboard/components/modals/OpeningGameListModal";

interface Props {
  data: OpeningTreeNode[];
}

type RowMeta = { node: OpeningTreeNode; indent: number; isGroup: boolean };

/** 계층 데이터를 표시용 평탄 배열로 변환 */
function flatten(nodes: OpeningTreeNode[], expanded: Set<string>): RowMeta[] {
  const rows: RowMeta[] = [];
  for (const node of nodes) {
    rows.push({ node, indent: 0, isGroup: true });
    if (expanded.has(node.name) && node.children?.length) {
      for (const child of node.children) {
        rows.push({ node: child, indent: 1, isGroup: false });
      }
    }
  }
  return rows;
}

const winColor = (r: number) =>
  r >= 55 ? "text-emerald-400" : r >= 45 ? "text-amber-400" : "text-red-400";

export default function OpeningTreeTable({ data }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [selectedNode, setSelectedNode] = useState<OpeningTreeNode | null>(null);

  if (!data.length) {
    return <p className="text-chess-muted text-sm py-3">오프닝 데이터가 없습니다.</p>;
  }

  const toggle = (prefix: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(prefix) ? next.delete(prefix) : next.add(prefix);
      return next;
    });
  };

  const TOP_N = 10;
  const topNodes = showAll ? data : data.slice(0, TOP_N);
  const rows = flatten(topNodes, expanded);

  return (
    <div className="space-y-0.5 font-mono text-sm">
      {rows.map(({ node, indent, isGroup }) => (
        <div
          key={`${indent}-${node.eco_prefix}-${node.name}`}
          className={`group flex items-center justify-between py-1.5 px-2 rounded transition-colors cursor-pointer ${
            isGroup
              ? "hover:bg-chess-border/50 bg-chess-surface/40"
              : "hover:bg-chess-border/30"
          }`}
          style={{ paddingLeft: indent * 20 + 8 }}
          onClick={() => setSelectedNode(node)}
        >
          {/* Name */}
          <div className="flex items-center gap-1.5 min-w-0">
            {isGroup && node.children?.length ? (
              <span
                className="text-chess-muted text-xs w-3 shrink-0 hover:text-chess-primary transition-colors"
                onClick={(e) => { e.stopPropagation(); toggle(node.name); }}
              >
                {expanded.has(node.name) ? "▾" : "▸"}
              </span>
            ) : (
              <span className="text-chess-border text-xs w-3 shrink-0">└</span>
            )}
            {/* Level에 따라 다르게 표시 */}
            {isGroup ? (
              // Level 1: 실제 오프닝명 — ECO 단일 알파벳 숨김
              <span className="font-semibold text-sm text-chess-primary truncate">
                {node.name}
              </span>
            ) : (
              // Level 2: ECO3 배지 + 변형명
              <>
                <span className="font-bold shrink-0 text-chess-accent text-xs font-mono">
                  {node.eco_prefix}
                </span>
                <span className="text-chess-muted truncate text-xs">
                  {node.name.includes(":") ? node.name.split(":", 2)[1].trim() : node.name}
                </span>
              </>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 text-xs shrink-0 ml-2">
            <span className="text-chess-muted">{node.games}게임</span>
            <div className="flex gap-1">
              <span className="text-emerald-400">{node.wins}승</span>
              <span className="text-chess-muted">/</span>
              <span className="text-chess-muted">{node.draws}무</span>
              <span className="text-chess-muted">/</span>
              <span className="text-red-400">{node.losses}패</span>
            </div>
            <span className={`font-bold w-10 text-right ${winColor(node.win_rate)}`}>
              {node.win_rate}%
            </span>
          </div>
        </div>
      ))}

      {/* 더 보기 / 접기 토글 */}
      {data.length > TOP_N && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="w-full mt-1 py-1.5 text-xs text-chess-muted hover:text-chess-primary hover:bg-chess-border/30 rounded transition-colors"
        >
          {showAll ? `▲ 접기` : `▼ 더 보기 (${data.length - TOP_N}개 더)`}
        </button>
      )}

      <OpeningGameListModal node={selectedNode} onClose={() => setSelectedNode(null)} />
    </div>
  );
}
