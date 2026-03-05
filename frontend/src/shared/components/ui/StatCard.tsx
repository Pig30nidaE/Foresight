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
          ? "border-chess-accent/40 bg-chess-accent/10"
          : "border-chess-border bg-chess-surface"
      )}
    >
      <span className="text-xs text-chess-muted uppercase tracking-wide">{label}</span>
      <span
        className={clsx(
          "text-2xl font-bold",
          color === "emerald" && "text-emerald-400",
          color === "red" && "text-red-400",
          !color && "text-chess-primary"
        )}
      >
        {value}
      </span>
    </div>
  );
}
