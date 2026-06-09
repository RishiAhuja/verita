import { cn } from "@/lib/utils";

/** Plain text status — no pills or color coding. */
export function StatusText({ value, className }: { value: string; className?: string }) {
  return (
    <span className={cn("text-sm text-neutral-500", className)}>
      {value.toLowerCase()}
    </span>
  );
}
