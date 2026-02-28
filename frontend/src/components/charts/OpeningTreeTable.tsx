"use client";

import { useState } from "react";
import type { OpeningTreeNode } from "@/types";

interface Props {
  data: OpeningTreeNode[];
}

type RowMeta = { node: OpeningTreeNode; indent: number; isGroup: boolean };

/** 계층 데이터를 표시용 평탄 배열로 변환 */
function flatten(nodes: OpeningTreeNode[], expanded: Set<string>): RowMeta[] {
  const rows: RowMeta[] = [];
  for (const node of nodes) {
    rows.push({ node, indent: 0, isGroup: true });
    if (expanded.has(node.eco_prefix) && node.children?.length) {
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

  if (!data.length) {
    return <p className="text-zinc-500 text-sm py-3">오프닝 데이터가 없습니다.</p>;
  }

  const toggle = (prefix: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(prefix) ? next.delete(prefix) : next.add(prefix);
      return next;
    });
  };

  const rows = flatten(data, expanded);

  return (
    <div className="space-y-0.5 font-mono text-sm">
      {rows.map(({ node, indent, isGroup }) => (
        <div
          key={`${indent}-${node.eco_prefix}`}
          className={`group flex items-center justify-between py-1.5 px-2 rounded transition-colors ${
            isGroup
              ? "hover:bg-zinc-800/70 cursor-pointer bg-zinc-900/40"
              : "hover:bg-zinc-800/40 cursor-default"
          }`}
          style={{ paddingLeft: indent * 20 + 8 }}
          onClick={isGroup && node.children?.length ? () => toggle(node.eco_prefix) : undefined}
        >
          {/* Name */}
          <div className="flex items-center gap-1.5 min-w-0">
            {isGroup && node.children?.length ? (
              <span className="text-zinc-500 text-xs w-3 shrink-0">
                {expanded.has(node.eco_prefix) ? "▾" : "▸"}
              </span>
            ) : (
              <span className="text-zinc-700 text-xs w-3 shrink-0">└</span>
            )}
            <span
              className={`font-bold shrink-0 ${
                isGroup ? "text-amber-300" : "text-zinc-300"
              }`}
            >
              {node.eco_prefix}
            </span>
            <span className="text-zinc-400 truncate text-xs">
              {isGroup
                ? node.name.replace(/^[A-E] — /, "")
                : node.name}
            </span>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 text-xs shrink-0 ml-2">
            <span className="text-zinc-500">{node.games}게임</span>
            <div className="flex gap-1">
              <span className="text-emerald-400">{node.wins}승</span>
              <span className="text-zinc-600">/</span>
              <span className="text-zinc-400">{node.draws}무</span>
              <span className="text-zinc-600">/</span>
              <span className="text-red-400">{node.losses}패</span>
            </div>
            <span className={`font-bold w-10 text-right ${winColor(node.win_rate)}`}>
              {node.win_rate}%
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
