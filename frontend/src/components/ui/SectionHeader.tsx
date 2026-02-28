/**
 * 섹션 헤더 컴포넌트 — 제목 + 설명
 */

interface Props {
  title: string;
  desc?: string;
}

export default function SectionHeader({ title, desc }: Props) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-semibold text-white leading-tight">{title}</h2>
      {desc && (
        <p className="text-zinc-500 text-xs mt-1">{desc}</p>
      )}
    </div>
  );
}
