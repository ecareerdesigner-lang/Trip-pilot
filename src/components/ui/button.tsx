import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-route text-white hover:bg-route-deep active:bg-route-deep shadow-[0_1px_0_rgb(9_90_78/0.6)]",
  secondary:
    "bg-card text-ink border border-line hover:border-route hover:text-route-deep",
  ghost: "text-muted hover:text-ink hover:bg-paper-deep",
  danger: "bg-alert text-white hover:brightness-110",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[0.8125rem] gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2.5",
};

/** Shared styling so `<Link>` can render as a button without duplication. */
export function buttonStyles(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
): string {
  return cn(
    "inline-flex items-center justify-center rounded-pill font-medium",
    "transition-colors duration-150 whitespace-nowrap",
    "disabled:opacity-50 disabled:pointer-events-none",
    VARIANT[variant],
    SIZE[size],
    className,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonStyles(variant, size, className)}
      {...props}
    />
  );
}
