import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "default" | "danger" | "ghost";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  block?: boolean;
  children: ReactNode;
}

const variantClass: Record<Variant, string> = {
  primary: "ll-btn-primary",
  default: "",
  danger: "ll-btn-danger",
  ghost: "ll-btn-ghost",
};

export function Button({
  variant = "default",
  block = false,
  className = "",
  children,
  ...rest
}: Props) {
  const cls = [
    "ll-btn",
    variantClass[variant],
    block ? "ll-btn-block" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}