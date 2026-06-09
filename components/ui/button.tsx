import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  loading?: boolean;
};

const variants = {
  primary: "bg-neutral-900 text-white hover:bg-neutral-800",
  secondary: "border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50",
  ghost: "text-neutral-600 hover:text-neutral-900",
};

export function Button({
  className,
  variant = "primary",
  loading,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Spinner size="sm" className="border-neutral-400 border-t-white" /> : null}
      {children}
    </button>
  );
}
