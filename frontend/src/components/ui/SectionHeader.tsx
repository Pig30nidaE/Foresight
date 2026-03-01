/**
 * 섹션 헤더 컴포넌트 — 제목 + 설명
 */

interface Props {
  title: string;
  desc?: string;
}

export default function SectionHeader({ title, desc }: Props) {
  return (
    <div className="mb-6">
      <h2 className="text-xl font-bold text-white leading-tight">{title}</h2>
      {desc && (
        <p className="text-zinc-400 text-sm mt-1.5">{desc}</p>
      )}
    </div>
  );
}
