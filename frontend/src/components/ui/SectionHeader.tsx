/**
 * 섹션 헤더 컴포넌트
 * 번호 배지 + 제목 + 설명 통일된 스타일
 */

interface Props {
  number: string;     // "1" | "2-A" | "3-B" 등
  title: string;
  desc?: string;
}

export default function SectionHeader({ number, title, desc }: Props) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-zinc-800 text-xs font-bold text-emerald-400 font-mono shrink-0 border border-zinc-700">
          {number}
        </span>
        <h2 className="text-base font-semibold text-white leading-tight">{title}</h2>
      </div>
      {desc && (
        <p className="text-zinc-500 text-xs mt-1.5 ml-[37px]">{desc}</p>
      )}
    </div>
  );
}
