"use client";

import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import type { OpeningTreeNode } from "@/types";
import OpeningGameListModal from "@/features/dashboard/components/modals/OpeningGameListModal";
import { useTranslation } from "@/shared/lib/i18n";

interface Props {
  data: OpeningTreeNode[];
  side?: "white" | "black";
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
  r >= 55 ? "text-emerald-700" : r >= 45 ? "text-amber-700" : "text-red-700";

// 원형 그래프 (Pie Chart) 컴포넌트 - 개선된 디자인
function OpeningPieChart({ data }: { data: OpeningTreeNode[] }) {
  const { t } = useTranslation();
  const totalGames = data.reduce((sum, node) => sum + node.games, 0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const segments = useMemo(() => {
    let currentAngle = 0;
    // 흐릿한 파스텔 톤 색상
    const mutedColors = [
      "#94a3b8", "#a3b4c5", "#b0c0d0", "#8b9aae", "#7d8fa3",
      "#9ca8b8", "#aab8c8", "#8896a8", "#7a8898", "#b8c4d0",
      "#a0aeb8", "#9aa6b0", "#8c98a8", "#95a0b0", "#a8b4c0",
    ];

    return data.map((node, index) => {
      const percentage = (node.games / totalGames) * 100;
      const angle = (node.games / totalGames) * 360;
      const startAngle = currentAngle;
      currentAngle += angle;

      // 호버 시 바깥으로 살짝 튀어나오는 효과
      const isHovered = hoveredIndex === index;
      const popOutDistance = isHovered ? 10 : 0;
      const popOutAngle = (startAngle + angle / 2 - 90) * Math.PI / 180;
      const popOutX = Math.cos(popOutAngle) * popOutDistance;
      const popOutY = Math.sin(popOutAngle) * popOutDistance;

      const startRad = (startAngle - 90) * Math.PI / 180;
      const endRad = (startAngle + angle - 90) * Math.PI / 180;
      const r = 85;
      const cx = 120 + popOutX;
      const cy = 120 + popOutY;

      const x1 = cx + r * Math.cos(startRad);
      const y1 = cy + r * Math.sin(startRad);
      const x2 = cx + r * Math.cos(endRad);
      const y2 = cy + r * Math.sin(endRad);

      const largeArc = angle > 180 ? 1 : 0;

      const path = angle >= 360
        ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r}`
        : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;

      return {
        node,
        percentage,
        angle,
        startAngle,
        color: mutedColors[index % mutedColors.length],
        path,
        midAngle: startAngle + angle / 2,
        popOutX,
        popOutY,
      };
    });
  }, [data, totalGames, hoveredIndex]);

  // 툴팁 위치 계산
  const tooltipPos = useMemo(() => {
    if (hoveredIndex === null) return null;
    const seg = segments[hoveredIndex];
    const rad = (seg.midAngle - 90) * Math.PI / 180;
    const r = 70;
    const cx = 120;
    const cy = 120;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad),
    };
  }, [hoveredIndex, segments]);

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg viewBox="0 0 240 240" className="w-56 h-56">
          {/* 배경 원 - 흐릿한 느낌 */}
          <circle cx="120" cy="120" r="95" fill="#1f2937" opacity="0.15" />

          {segments.map((seg, i) => {
            const isHovered = hoveredIndex === i;
            return (
              <g key={i}>
                <path
                  d={seg.path}
                  fill={seg.color}
                  stroke={isHovered ? seg.color : "transparent"}
                  strokeWidth={isHovered ? 2 : 0}
                  strokeOpacity={isHovered ? 1 : 0}
                  className="transition-all duration-300 ease-out cursor-pointer"
                  style={{
                    opacity: isHovered ? 1 : 0.7,
                    filter: isHovered ? 'brightness(1.1)' : 'none',
                  }}
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
                {/* 호버 시 실선 테두리 */}
                {isHovered && (
                  <path
                    d={seg.path}
                    fill="none"
                    stroke="#e2e8f0"
                    strokeWidth="2"
                    className="pointer-events-none"
                    style={{
                      transform: `translate(${seg.popOutX}px, ${seg.popOutY}px)`,
                    }}
                  />
                )}
              </g>
            );
          })}

          {/* 중앙 홀 (도넛 차트 스타일) */}
          <circle cx="120" cy="120" r="50" fill="#111827" stroke="#374151" strokeWidth="1" strokeOpacity="0.5" />

          {/* 중앙 정보 */}
          <text x="120" y="110" textAnchor="middle" className="fill-chess-muted text-xs font-medium" opacity="0.8">
            {t("chart.totalGames")}
          </text>
          <text x="120" y="135" textAnchor="middle" className="fill-chess-accent text-xl font-bold">
            {totalGames}
          </text>
        </svg>

        {/* 툴팁 */}
        {hoveredIndex !== null && tooltipPos && (
          <div
            className="absolute pointer-events-none z-10 bg-chess-surface/95 border border-chess-border
                       rounded-lg px-3 py-2 shadow-xl backdrop-blur-sm transition-all duration-150"
            style={{
              left: `${(tooltipPos.x / 240) * 100}%`,
              top: `${(tooltipPos.y / 240) * 100}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: segments[hoveredIndex].color }}
              />
              <span className="text-chess-primary font-bold text-sm max-w-32 truncate">
                {segments[hoveredIndex].node.name}
              </span>
            </div>
            <div className="text-xs text-chess-muted space-y-0.5">
              <div className="flex justify-between gap-3">
                <span>{t("chart.ratio")}</span>
                <span className="text-chess-primary font-semibold">
                  {segments[hoveredIndex].percentage.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span>{t("chart.games")}</span>
                <span className="text-chess-primary font-semibold">
                  {t("chart.gamesCount").replace("{n}", String(segments[hoveredIndex].node.games))}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span>{t("chart.winRate")}</span>
                <span className={`font-semibold ${
                  segments[hoveredIndex].node.win_rate >= 55 ? 'text-emerald-400' :
                  segments[hoveredIndex].node.win_rate >= 45 ? 'text-amber-400' : 'text-red-400'
                }`}>
                  {segments[hoveredIndex].node.win_rate}%
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 범례 - 흐릿한 디자인 */}
      <div className="mt-4 space-y-1.5 max-h-44 overflow-y-auto w-full px-2">
        {segments.slice(0, 12).map((seg, i) => (
          <div
            key={i}
            className={`flex items-center gap-3 text-xs px-2 py-1.5 rounded-lg transition-all duration-200 cursor-pointer
              ${hoveredIndex === i ? 'bg-chess-surface/50' : 'hover:bg-chess-surface/30'}`}
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ 
                backgroundColor: seg.color, 
                opacity: hoveredIndex === i ? 1 : 0.7,
                boxShadow: hoveredIndex === i ? `0 0 6px ${seg.color}` : 'none'
              }}
            />
            <span className={`truncate flex-1 ${hoveredIndex === i ? 'text-chess-primary' : 'text-chess-muted'}`}>
              {seg.node.name}
            </span>
            <div className="flex items-center gap-2">
              <span className={`font-semibold ${hoveredIndex === i ? 'text-chess-primary' : 'text-chess-muted/80'}`}>
                {seg.percentage.toFixed(1)}%
              </span>
              <span className="text-chess-muted/50 text-xs">({t("chart.gamesCount").replace("{n}", String(seg.node.games))})</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 상세보기 모달 컴포넌트
function OpeningDetailModal({
  data,
  onClose,
  side,
}: {
  data: OpeningTreeNode[];
  onClose: () => void;
  side: "white" | "black";
}) {
  const { t } = useTranslation();
  // 각 부모 오프닝별 바리에이션(자식) 접기/펼치기 상태
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  const toggleParent = (parentName: string) => {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      next.has(parentName) ? next.delete(parentName) : next.add(parentName);
      return next;
    });
  };

  // 모든 부모 접기/펼치기
  const expandAll = () => {
    const allParents = data.map(n => n.name);
    setExpandedParents(new Set(allParents));
  };

  const collapseAll = () => {
    setExpandedParents(new Set());
  };

  const allOpenings = useMemo(() => {
    const list: Array<{
      node: OpeningTreeNode;
      isChild: boolean;
      parentName?: string;
    }> = [];

    for (const node of data) {
      list.push({ node, isChild: false });
      // 바리에이션이 펼쳐진 경우에만 자식 항목 추가
      if (node.children?.length && expandedParents.has(node.name)) {
        for (const child of node.children) {
          list.push({ node: child, isChild: true, parentName: node.name });
        }
      }
    }
    return list;
  }, [data, expandedParents]);

  // 전체 바리에이션 수 계산
  const totalVariations = useMemo(() => 
    data.reduce((sum, node) => sum + (node.children?.length || 0), 0),
    [data]
  );

  const totalGames = useMemo(() =>
    data.reduce((sum, node) => sum + node.games, 0),
    [data]
  );

  if (typeof document === "undefined") return null;

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />

      <div
        className="relative w-full max-w-[900px] h-[90dvh] sm:h-[600px] flex flex-col
                   bg-chess-bg border border-chess-border/60 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4 border-b border-chess-border">
          <div className="min-w-0">
            <h2 className="text-base sm:text-xl font-bold text-chess-primary truncate">
              {side === "white" ? t("chart.whiteOpeningAnalysis") : t("chart.blackOpeningAnalysis")}
            </h2>
            <p className="text-xs sm:text-sm text-chess-muted mt-0.5 sm:mt-1">
              {t("chart.totalOpeningsLines").replace("{n}", String(data.length))}
              <span className="text-chess-primary font-semibold mx-1">{totalGames}</span>{t("chart.totalGames")}
            </p>
          </div>

          <button
            onClick={onClose}
            className="text-chess-muted hover:text-chess-primary transition-colors text-2xl leading-none shrink-0 ml-3"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
          {/* 원형차트 패널: 모바일에서 숨김 */}
          <div className="hidden sm:flex w-[320px] flex-shrink-0 flex-col p-6 border-b lg:border-b-0 lg:border-r border-chess-border/50 bg-chess-surface/30">
            <h3 className="text-sm font-semibold text-chess-primary mb-4 text-center">
              {t("chart.gameRatioByOpening")}
            </h3>
            <OpeningPieChart data={data} />
          </div>

          <div className="flex-1 flex flex-col min-w-0">
            <div className="px-3 sm:px-6 py-2 sm:py-3 border-b border-chess-border/50 bg-chess-surface/20 flex items-center justify-between gap-2">
              <h3 className="text-xs sm:text-sm font-semibold text-chess-primary min-w-0 truncate">
                {t("chart.allOpeningsList")}
                <span className="hidden sm:inline text-chess-muted font-normal ml-1">
                  {expandedParents.size > 0 
                    ? t("chart.linesVariationsInfo").replace("{lines}", String(data.length)).replace("{showing}", String(allOpenings.length - data.length)).replace("{total}", String(totalVariations))
                    : t("chart.linesVariationsHidden").replace("{lines}", String(data.length)).replace("{total}", String(totalVariations))
                  }
                </span>
              </h3>
              <div className="flex gap-1 sm:gap-2 shrink-0">
                <button
                  onClick={expandAll}
                  className="px-2 py-1 text-xs bg-chess-surface hover:bg-chess-border/50 
                             text-chess-muted hover:text-chess-primary rounded transition-colors"
                >
                  {t("chart.expandAll")}
                </button>
                <button
                  onClick={collapseAll}
                  className="px-2 py-1 text-xs bg-chess-surface hover:bg-chess-border/50 
                             text-chess-muted hover:text-chess-primary rounded transition-colors"
                >
                  {t("chart.collapseAll")}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 sm:p-4 space-y-1 min-h-0">
              {data.map((parentNode) => {
                const isExpanded = expandedParents.has(parentNode.name);
                const hasChildren = parentNode.children && parentNode.children.length > 0;
                const childCount = parentNode.children?.length || 0;
                const winRateColor = parentNode.win_rate >= 55
                  ? "text-emerald-400"
                  : parentNode.win_rate >= 45
                    ? "text-amber-400"
                    : "text-red-400";

                return (
                  <div key={parentNode.name} className="space-y-1">
                    {/* 부모 오프닝 (메인 계열) */}
                    <div
                      className={`flex items-center justify-between py-2.5 px-3 rounded-lg
                        bg-chess-surface/70 hover:bg-chess-surface border border-chess-border/40
                        transition-colors cursor-pointer group`}
                      onClick={() => hasChildren && toggleParent(parentNode.name)}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {hasChildren && (
                          <span className={`text-chess-muted text-xs w-4 shrink-0 transition-transform duration-200
                            ${isExpanded ? 'rotate-90' : ''}`}>
                            ▶
                          </span>
                        )}
                        <span className="font-semibold text-sm text-chess-primary truncate">
                          {parentNode.name}
                        </span>
                        {hasChildren && (
                          <span className="text-xs text-chess-muted bg-chess-surface px-1.5 py-0.5 rounded">
                            {t("chart.nVariations").replace("{n}", String(childCount))}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 sm:gap-3 text-xs shrink-0 ml-2">
                        <span className="hidden sm:inline text-chess-muted">{t("chart.gamesCount").replace("{n}", String(parentNode.games))}</span>
                        <span className="sm:hidden text-chess-muted/70">{parentNode.games}</span>
                        <div className="hidden sm:flex gap-1">
                          <span className="text-emerald-600">{parentNode.wins}{t("chart.win")}</span>
                          <span className="text-chess-muted/50">/</span>
                          <span className="text-chess-muted">{parentNode.draws}{t("chart.draw")}</span>
                          <span className="text-chess-muted/50">/</span>
                          <span className="text-red-600">{parentNode.losses}{t("chart.loss")}</span>
                        </div>
                        <span className={`font-bold w-10 text-right ${winRateColor}`}>
                          {parentNode.win_rate}%
                        </span>
                      </div>
                    </div>

                    {/* 자식 오프닝 (바리에이션) - 펼쳐진 경우에만 표시 */}
                    {isExpanded && hasChildren && (
                      <div className="ml-4 space-y-0.5 border-l-2 border-chess-border/30 pl-3">
                        {parentNode.children!.map((child, childIndex) => {
                          const childWinRateColor = child.win_rate >= 55
                            ? "text-emerald-400"
                            : child.win_rate >= 45
                              ? "text-amber-400"
                              : "text-red-400";

                          return (
                            <div
                              key={`${parentNode.name}-${childIndex}`}
                              className="flex items-center justify-between py-2 px-3 rounded-lg
                                bg-chess-surface/30 hover:bg-chess-surface/50 transition-colors"
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="text-xs font-bold text-chess-accent shrink-0">
                                  {child.eco_prefix}
                                </span>
                                <span className="text-xs text-chess-muted truncate">
                                  {child.name.includes(":")
                                    ? child.name.split(":", 2)[1].trim()
                                    : child.name}
                                </span>
                              </div>

                              <div className="flex items-center gap-3 text-xs shrink-0 ml-2">
                                <span className="text-chess-muted/70">{t("chart.gamesCount").replace("{n}", String(child.games))}</span>
                                <span className={`font-medium w-8 text-right ${childWinRateColor}`}>
                                  {child.win_rate}%
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-6 py-2 sm:py-3 border-t border-chess-border bg-chess-surface/20 text-center">
          <p className="text-xs text-chess-muted">
            {t("chart.clickToViewDetail")}
          </p>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

export default function OpeningTreeTable({ data }: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showDetail, setShowDetail] = useState(false);
  const [selectedNode, setSelectedNode] = useState<OpeningTreeNode | null>(null);

  if (!data.length) {
    return <p className="text-chess-muted text-sm py-3">{t("chart.noOpeningData")}</p>;
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
      {/* 상단 헤더: +상세보기 버튼 */}
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-chess-border/30">
        <span className="text-xs text-chess-muted">
          {t("chart.totalOpenings").replace("{n}", String(data.length))}
        </span>
        <button
          onClick={() => setShowDetail(true)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium
                     bg-chess-accent/10 hover:bg-chess-accent/20
                     text-chess-accent hover:text-chess-accent/80
                     border border-chess-accent/30 hover:border-chess-accent/50
                     rounded-lg transition-all duration-200"
        >
          <span className="text-sm">+</span>
          <span>{t("chart.viewDetails")}</span>
        </button>
      </div>

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
            {isGroup ? (
              <span className="font-semibold text-sm text-chess-primary truncate">
                {node.name}
              </span>
            ) : (
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
          <div className="flex items-center gap-2 sm:gap-3 text-xs shrink-0 ml-2">
            <span className="hidden sm:inline text-chess-muted">{t("chart.gamesCount").replace("{n}", String(node.games))}</span>
            <div className="hidden sm:flex gap-1">
              <span className="text-emerald-700">{node.wins}{t("chart.win")}</span>
              <span className="text-chess-muted">/</span>
              <span className="text-chess-muted">{node.draws}{t("chart.draw")}</span>
              <span className="text-chess-muted">/</span>
              <span className="text-red-700">{node.losses}{t("chart.loss")}</span>
            </div>
            <span className="sm:hidden text-chess-muted/70">{node.games}</span>
            <span className={`font-bold w-10 text-right ${winColor(node.win_rate)}`}>
              {node.win_rate}%
            </span>
          </div>
        </div>
      ))}

      <OpeningGameListModal node={selectedNode} onClose={() => setSelectedNode(null)} />

      {showDetail && (
        <OpeningDetailModal
          data={data}
          onClose={() => setShowDetail(false)}
          side="white"
        />
      )}
    </div>
  );
}
