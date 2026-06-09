import { cn } from "@/lib/utils";

export function Spinner({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const sizeClass =
    size === "sm" ? "h-4 w-4 border-2" : size === "lg" ? "h-8 w-8 border-[3px]" : "h-5 w-5 border-2";

  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block animate-spin rounded-full border-neutral-200 border-t-neutral-900",
        sizeClass,
        className,
      )}
    />
  );
}
