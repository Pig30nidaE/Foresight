"use client";

import { useState, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import type { OpeningTreeNode } from "@/types";
import OpeningGameListModal from "@/features/dashboard/components/modals/OpeningGameListModal";
import { useTranslation } from "@/shared/lib/i18n";
import { useBodyScrollLock } from "@/shared/lib/useBodyScrollLock";
import { PixelCaretRightGlyph, PixelXGlyph } from "@/shared/components/ui/PixelGlyphs";

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

const winColor = (r: number) => (r >= 50 ? "text-chess-win" : "text-chess-loss");

/** 파이 조각·우측 목록 색 띠 동일 순서 (data 인덱스와 일치) */
const OPENING_PIE_SEGMENT_COLORS = [
  "#94a3b8", "#a3b4c5", "#b0c0d0", "#8b9aae", "#7d8fa3",
  "#9ca8b8", "#aab8c8", "#8896a8", "#7a8898", "#b8c4d0",
  "#a0aeb8", "#9aa6b0", "#8c98a8", "#95a0b0", "#a8b4c0",
];

// 원형 그래프 (Pie Chart)
function OpeningPieChart({
  data,
  showLegend = true,
  chartSize = "md",
}: {
  data: OpeningTreeNode[];
  showLegend?: boolean;
  chartSize?: "md" | "lg";
}) {
  const { t } = useTranslation();
  const totalGames = data.reduce((sum, node) => sum + node.games, 0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  /** 화면 좌표 — 부모 overflow 클리핑을 피하기 위해 툴팁은 document body로 포털 */
  const [tooltipPointer, setTooltipPointer] = useState<{ x: number; y: number } | null>(null);

  const clearHover = useCallback(() => {
    setHoveredIndex(null);
    setTooltipPointer(null);
  }, []);

  /* 고정 중심(120,120)으로 path 계산 — 호버는 <g> translate만 사용해 깨짐 방지 */
  const segments = useMemo(() => {
    let currentAngle = 0;
    const cx0 = 120;
    const cy0 = 120;
    const r = 85;
    const popDist = 6;

    return data.map((node, index) => {
      const percentage = (node.games / totalGames) * 100;
      const angle = (node.games / totalGames) * 360;
      const startAngle = currentAngle;
      currentAngle += angle;

      const midAngle = startAngle + angle / 2;
      const popRad = (midAngle - 90) * (Math.PI / 180);
      const popOutX = Math.cos(popRad) * popDist;
      const popOutY = Math.sin(popRad) * popDist;

      const startRad = (startAngle - 90) * Math.PI / 180;
      const endRad = (startAngle + angle - 90) * Math.PI / 180;

      const x1 = cx0 + r * Math.cos(startRad);
      const y1 = cy0 + r * Math.sin(startRad);
      const x2 = cx0 + r * Math.cos(endRad);
      const y2 = cy0 + r * Math.sin(endRad);

      const largeArc = angle > 180 ? 1 : 0;

      const path = angle >= 360
        ? `M ${cx0} ${cy0 - r} A ${r} ${r} 0 1 1 ${cx0} ${cy0 + r} A ${r} ${r} 0 1 1 ${cx0} ${cy0 - r}`
        : `M ${cx0} ${cy0} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;

      return {
        node,
        percentage,
        angle,
        startAngle,
        color: OPENING_PIE_SEGMENT_COLORS[index % OPENING_PIE_SEGMENT_COLORS.length],
        path,
        midAngle,
        popOutX,
        popOutY,
      };
    });
  }, [data, totalGames]);

  const maxLegendItems = 12;
  const legendSegments = segments.slice(0, maxLegendItems);

  const svgClass =
    chartSize === "lg" ? "w-[min(22rem,100%)] h-[min(22rem,100%)] max-w-full" : "w-56 h-56";

  const tooltipContent =
    hoveredIndex !== null && segments[hoveredIndex] ? (
      <div className="pointer-events-none max-w-[min(18rem,calc(100vw-1.5rem))] pixel-frame bg-chess-surface/98 px-3 py-2 shadow-lg">
        <div className="mb-1 flex items-start gap-2">
          <span
            className="mt-0.5 h-3 w-3 shrink-0 border border-chess-primary/25"
            style={{ backgroundColor: segments[hoveredIndex].color }}
          />
          <span className="break-words text-sm font-bold leading-snug text-chess-primary">
            {segments[hoveredIndex].node.name}
          </span>
        </div>
        <div className="space-y-0.5 text-xs text-chess-muted">
          <div className="flex justify-between gap-4">
            <span className="shrink-0">{t("chart.ratio")}</span>
            <span className="text-right font-semibold text-chess-primary tabular-nums">
              {segments[hoveredIndex].percentage.toFixed(1)}%
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="shrink-0">{t("chart.games")}</span>
            <span className="text-right font-semibold text-chess-primary tabular-nums">
              {t("chart.gamesCount").replace("{n}", String(segments[hoveredIndex].node.games))}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="shrink-0">{t("chart.winRate")}</span>
            <span
              className={`text-right font-semibold tabular-nums ${
                segments[hoveredIndex].node.win_rate >= 50 ? "text-chess-win" : "text-chess-loss"
              }`}
            >
              {segments[hoveredIndex].node.win_rate}%
            </span>
          </div>
        </div>
      </div>
    ) : null;

  const tooltipApproxW = 288;
  const tooltipApproxH = 140;
  const tooltipPortal =
    typeof document !== "undefined" &&
    tooltipContent &&
    tooltipPointer &&
    createPortal(
      <div
        className="fixed z-[100001] w-max max-w-[min(18rem,calc(100vw-1.5rem))]"
        style={{
          left: Math.max(
            8,
            Math.min(
              tooltipPointer.x + 14,
              (typeof window !== "undefined" ? window.innerWidth : 9999) - tooltipApproxW - 8
            )
          ),
          top: Math.max(
            8,
            Math.min(
              tooltipPointer.y + 14,
              (typeof window !== "undefined" ? window.innerHeight : 9999) - tooltipApproxH - 8
            )
          ),
        }}
      >
        {tooltipContent}
      </div>,
      document.body
    );

  return (
    <div className="flex flex-col items-center">
      <div className="relative shrink-0 overflow-visible">
        <svg
          viewBox="0 0 240 240"
          className={svgClass}
          onMouseLeave={clearHover}
        >
          {/* 배경 원 - 흐릿한 느낌 */}
          <circle cx="120" cy="120" r="95" className="fill-chess-primary/10 dark:fill-white/10" />

          {segments.map((seg, i) => {
            const isHovered = hoveredIndex === i;
            return (
              <g
                key={i}
                style={{
                  transform: isHovered
                    ? `translate(${seg.popOutX}px, ${seg.popOutY}px)`
                    : "translate(0px, 0px)",
                  transition: "transform 0.12s ease-out",
                }}
              >
                <path
                  d={seg.path}
                  fill={seg.color}
                  className="cursor-pointer"
                  style={{
                    opacity: isHovered ? 1 : 0.72,
                    filter: isHovered ? "brightness(1.08)" : undefined,
                  }}
                  onMouseEnter={(e) => {
                    setHoveredIndex(i);
                    setTooltipPointer({ x: e.clientX, y: e.clientY });
                  }}
                  onMouseMove={(e) => {
                    setTooltipPointer({ x: e.clientX, y: e.clientY });
                  }}
                />
              </g>
            );
          })}

          {/* 중앙 홀 (도넛 차트 스타일) */}
          <circle
            cx="120"
            cy="120"
            r="50"
            className="fill-chess-bg stroke-chess-border dark:fill-chess-surface dark:stroke-chess-border"
            strokeWidth="1"
            strokeOpacity={0.5}
          />

          {/* 중앙 정보 (라이트: 밝은 홀 + 진한 글자 — 다크: 기존 대비 유지) */}
          <text x="120" y="110" textAnchor="middle" className="fill-chess-muted text-xs font-medium" opacity="0.9">
            {t("chart.totalGames")}
          </text>
          <text x="120" y="135" textAnchor="middle" className="fill-chess-accent text-xl font-bold">
            {totalGames}
          </text>
        </svg>
        {tooltipPortal}
      </div>

      {showLegend && (
        <div className="mt-4 space-y-1.5 max-h-44 overflow-y-auto w-full px-2">
          <div className="flex flex-col gap-1.5 w-full">
            {legendSegments.map((seg, i) => (
              <div
                key={i}
                className={`flex items-center gap-2 rounded-[var(--pixel-radius)] transition-all duration-200 cursor-pointer min-w-0 text-xs px-2 py-1.5
                  ${hoveredIndex === i ? "bg-chess-surface/50" : "hover:bg-chess-surface/30"}`}
                onMouseEnter={() => {
                  setHoveredIndex(i);
                  setTooltipPointer(null);
                }}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <span
                  className="w-3 h-3 shrink-0 border border-chess-primary/20"
                  style={{
                    backgroundColor: seg.color,
                    opacity: hoveredIndex === i ? 1 : 0.7,
                  }}
                />
                <span
                  className={`truncate min-w-0 flex-1 ${hoveredIndex === i ? "text-chess-primary" : "text-chess-muted"}`}
                >
                  {seg.node.name}
                </span>
                <div className="flex items-center shrink-0 tabular-nums gap-2">
                  <span
                    className={
                      hoveredIndex === i ? "text-chess-primary font-semibold" : "text-chess-muted/80 font-medium"
                    }
                  >
                    {seg.percentage.toFixed(1)}%
                  </span>
                  <span className="text-chess-muted/50 text-xs">
                    ({t("chart.gamesCount").replace("{n}", String(seg.node.games))})
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
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
  useBodyScrollLock(true);
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
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-hidden overscroll-none"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/65" />

      <div
        className="relative w-full max-w-[min(1100px,96vw)] min-h-0 flex flex-col pixel-frame
                   h-[90dvh] max-h-[90dvh]
                   lg:h-[600px] lg:max-h-[min(600px,90dvh)]
                   bg-chess-bg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4 border-b border-chess-border">
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
            type="button"
            onClick={onClose}
            className="text-chess-muted hover:text-chess-primary transition-colors shrink-0 ml-3 p-1"
            aria-label="닫기"
          >
            <PixelXGlyph size={22} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden flex flex-col lg:flex-row">
          {/* 원형 그래프만 (범례는 우측 목록과 통합, 색 띠로 대응) */}
          <div className="hidden lg:flex min-w-[360px] w-[40%] max-w-[480px] flex-shrink-0 flex-col min-h-0 overflow-visible px-5 py-6 lg:border-r border-chess-border/50 bg-chess-surface/30">
            <h3 className="shrink-0 text-sm font-semibold text-chess-primary mb-4 text-center leading-tight">
              {t("chart.gameRatioByOpening")}
            </h3>
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-visible">
              <OpeningPieChart data={data} showLegend={false} chartSize="lg" />
            </div>
          </div>

          <div className="flex-1 min-h-0 flex flex-col min-w-0">
            <div className="px-3 sm:px-6 py-2 sm:py-3 border-b border-chess-border/50 bg-chess-surface/20 shrink-0">
              <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-xs sm:text-sm font-semibold text-chess-primary truncate">
                  {t("chart.allOpeningsList")}
                  <span className="hidden sm:inline text-chess-muted font-normal ml-1">
                    {expandedParents.size > 0 
                      ? t("chart.linesVariationsInfo").replace("{lines}", String(data.length)).replace("{showing}", String(allOpenings.length - data.length)).replace("{total}", String(totalVariations))
                      : t("chart.linesVariationsHidden").replace("{lines}", String(data.length)).replace("{total}", String(totalVariations))
                    }
                  </span>
                </h3>
                <p className="hidden lg:block text-[10px] text-chess-muted/90 mt-0.5 leading-snug">
                  {t("chart.pieListUnifiedHint")}
                </p>
              </div>
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
            </div>

            <div
              data-modal-scroll="true"
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-2 sm:p-4 space-y-1"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {data.map((parentNode, parentIndex) => {
                const isExpanded = expandedParents.has(parentNode.name);
                const hasChildren = parentNode.children && parentNode.children.length > 0;
                const childCount = parentNode.children?.length || 0;
                const winRateColor =
                  parentNode.win_rate >= 50 ? "text-chess-win" : "text-chess-loss";
                const pieStripe =
                  OPENING_PIE_SEGMENT_COLORS[parentIndex % OPENING_PIE_SEGMENT_COLORS.length];

                return (
                  <div key={parentNode.name} className="space-y-1">
                    {/* 부모 오프닝 (메인 계열) — 좌측 색 띠 = 파이 조각과 동일 */}
                    <div
                      className={`flex items-stretch justify-between gap-2 py-2.5 pl-2 pr-3 rounded-[var(--pixel-radius)]
                        bg-chess-surface/85 hover:bg-chess-surface border-2 border-chess-border/55
                        shadow-[inset_2px_2px_0_rgba(255,255,255,0.1),inset_-2px_-2px_0_rgba(0,0,0,0.12)]
                        dark:shadow-[inset_1px_1px_0_rgba(255,255,255,0.06),inset_-2px_-2px_0_rgba(0,0,0,0.35)]
                        transition-colors cursor-pointer group`}
                      onClick={() => hasChildren && toggleParent(parentNode.name)}
                    >
                      <span
                        className="hidden lg:block w-2 shrink-0 rounded-[1px] self-center min-h-[2.25rem] border border-chess-primary/20"
                        style={{ backgroundColor: pieStripe }}
                        aria-hidden
                      />
                      <div className="flex items-center gap-2 min-w-0 flex-1 lg:pl-0 pl-1">
                        {hasChildren && (
                          <span
                            className={`text-chess-muted text-xs w-4 shrink-0 inline-flex justify-center transition-transform duration-200
                            ${isExpanded ? "rotate-90" : ""}`}
                          >
                            <PixelCaretRightGlyph size={12} />
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
                        <span className="hidden sm:inline text-chess-muted">
                          {t("chart.gamesCount").replace("{n}", String(parentNode.games))}
                          {totalGames > 0 && (
                            <span className="hidden lg:inline text-chess-muted/70 tabular-nums ml-1">
                              ({((100 * parentNode.games) / totalGames).toFixed(0)}%)
                            </span>
                          )}
                        </span>
                        <span className="sm:hidden text-chess-muted/70">{parentNode.games}</span>
                        <div className="hidden sm:flex gap-1">
                          <span className="text-chess-win">{parentNode.wins}{t("chart.win")}</span>
                          <span className="text-chess-muted/50">/</span>
                          <span className="text-chess-muted">{parentNode.draws}{t("chart.draw")}</span>
                          <span className="text-chess-muted/50">/</span>
                          <span className="text-chess-loss">{parentNode.losses}{t("chart.loss")}</span>
                        </div>
                        <span className={`font-bold w-10 text-right ${winRateColor}`}>
                          {parentNode.win_rate}%
                        </span>
                      </div>
                    </div>

                    {/* 자식 오프닝 (바리에이션) - 펼쳐진 경우에만 표시 */}
                    {isExpanded && hasChildren && (
                      <div className="ml-3 sm:ml-4 space-y-1 border-l-[3px] border-chess-border/50 pl-2 sm:pl-3 pixel-hud-fill py-1 rounded-[var(--pixel-radius)]">
                        {parentNode.children!.map((child, childIndex) => {
                          const childWinRateColor =
                            child.win_rate >= 50 ? "text-chess-win" : "text-chess-loss";

                          return (
                            <div
                              key={`${parentNode.name}-${childIndex}`}
                              className="flex items-center justify-between py-2 px-3 rounded-[var(--pixel-radius)]
                                border border-chess-border/40 bg-chess-bg/70 dark:bg-chess-bg/40
                                shadow-[inset_1px_1px_0_rgba(255,255,255,0.08)]
                                hover:bg-chess-surface/60 transition-colors"
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

        <div className="shrink-0 px-4 sm:px-6 py-2 sm:py-3 border-t border-chess-border bg-chess-surface/20 text-center">
          <p className="text-xs text-chess-muted">
            {t("chart.clickToViewDetail")}
          </p>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

export default function OpeningTreeTable({ data, side = "white" }: Props) {
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
              <span className="text-chess-win">{node.wins}{t("chart.win")}</span>
              <span className="text-chess-muted">/</span>
              <span className="text-chess-muted">{node.draws}{t("chart.draw")}</span>
              <span className="text-chess-muted">/</span>
              <span className="text-chess-loss">{node.losses}{t("chart.loss")}</span>
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
          side={side}
        />
      )}
    </div>
  );
}
