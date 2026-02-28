import clsx from "clsx";

interface StatCardProps {
  label: string;
  value: string | number;
  highlight?: boolean;
  color?: "emerald" | "red" | "zinc";
}

export default function StatCard({ label, value, highlight, color }: StatCardProps) {
  return (
    <div
      className={clsx(
        "rounded-xl border p-4 flex flex-col gap-1",
        highlight
          ? "border-emerald-500/40 bg-emerald-950/30"
          : "border-zinc-800 bg-zinc-900"
      )}
    >
      <span className="text-xs text-zinc-500 uppercase tracking-wide">{label}</span>
      <span
        className={clsx(
          "text-2xl font-bold",
          color === "emerald" && "text-emerald-400",
          color === "red" && "text-red-400",
          !color && "text-white"
        )}
      >
        {value}
      </span>
    </div>
  );
}
