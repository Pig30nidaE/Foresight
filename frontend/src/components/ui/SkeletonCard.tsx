/**
 * 로딩 스켈레톤 컴포넌트
 * CSS shimmer 애니메이션 (globals.css .skeleton 클래스 사용)
 */
import type { CSSProperties } from "react";

interface SkeletonProps {
  className?: string;
  style?: CSSProperties;
}

/** 단일 shimmer 블록 */
export function Skeleton({ className = "", style }: SkeletonProps) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden="true" />;
}

/** 섹션 1: 첫 수 바 차트 스켈레톤 */
export function FirstMovesSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {["white", "black"].map((side) => (
        <div key={side} className="space-y-3">
          <Skeleton className="h-4 w-40" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex justify-between">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-5" style={{ width: `${60 + i * 8}%` }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** 섹션 2-A: 오프닝 트리 스켈레톤 */
export function OpeningTreeSkeleton() {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between py-1.5 px-2">
          <Skeleton className="h-4" style={{ width: `${30 + (i % 3) * 20}%` }} />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

/** 섹션 2-B: 베스트/워스트 스켈레톤 */
export function BestWorstSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1].map((i) => (
        <div key={i} className="p-4 rounded-xl border border-zinc-800 space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
      <div className="mt-4 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex justify-between items-center">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** 섹션 3: 타임라인 스켈레톤 */
export function TimelineSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex-1 p-3 rounded-lg border border-zinc-800 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-12" />
          </div>
        ))}
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

/** 섹션 3-B: 도넛 차트 스켈레톤 */
export function DonutSkeleton() {
  return (
    <div className="flex flex-col items-center gap-4">
      <Skeleton className="w-44 h-44 rounded-full" />
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 w-full">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="w-2.5 h-2.5 shrink-0" />
            <Skeleton className="h-3 flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}
