"use client";

import type { OpeningTreeNode } from "@/types";

interface Props {
  data: OpeningTreeNode[];
}

type DisplayNode = OpeningTreeNode & { indent: number; prefix: string };

export default function OpeningTreeTable({ data }: Props) {
  if (!data.length) {
    return <p className="text-zinc-500 text-sm py-3">오프닝 데이터가 없습니다.</p>;
  }

  // ECO 접두사 기준 트리 상위 9개
  const display: DisplayNode[] = data.slice(0, 9).map((node) => ({
    ...node,
    indent: node.eco_prefix.length === 1 ? 0 : node.eco_prefix.length === 3 ? 1 : 2,
    prefix: node.eco_prefix.length === 1 ? "── " : node.eco_prefix.length === 3 ? "   ├── " : "       └── ",
  }));

  return (
    <div className="space-y-0.5 font-mono text-sm">
      {display.map((node) => (
        <div
          key={node.eco_prefix}
          className="group flex items-center justify-between py-1.5 px-2 rounded hover:bg-zinc-800/60 transition-colors cursor-default"
        >
          {/* Name */}
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-zinc-600 shrink-0">{node.prefix}</span>
            <span className="text-zinc-200 font-bold shrink-0">{node.eco_prefix}</span>
            <span className="text-zinc-400 truncate text-xs ml-1">{node.name}</span>
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
            <span
              className={`font-bold w-10 text-right ${
                node.win_rate >= 55
                  ? "text-emerald-400"
                  : node.win_rate >= 45
                  ? "text-amber-400"
                  : "text-red-400"
              }`}
            >
              {node.win_rate}%
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
