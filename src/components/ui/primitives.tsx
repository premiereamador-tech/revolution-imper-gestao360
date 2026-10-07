import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

// ------------------------------------------------------------------ Button
const variants = {
  primary: "bg-primary text-white hover:bg-primary-strong shadow-sm",
  secondary: "bg-surface text-text border border-border hover:bg-surface-2",
  ghost: "text-text hover:bg-surface-2",
  danger: "bg-danger text-white hover:brightness-95",
  success: "bg-success text-white hover:brightness-95",
} as const;
const sizes = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-base gap-2",
  xl: "min-h-20 px-4 text-lg gap-3 flex-col py-3",
} as const;

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
    variants[variant],
    sizes[size],
    className,
  );
}

export function Button({ variant = "primary", size = "md", className, ...props }: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({ variant = "primary", size = "md", className, ...props }: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

// ------------------------------------------------------------------ Card
export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-[var(--radius-card)] border border-border bg-surface", className)} {...props} />;
}

export function CardHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-text">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-5", className)} {...props} />;
}

// ------------------------------------------------------------------ Page header
export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-1 inline-block text-[13px] text-muted hover:text-primary">
            ‹ {back.label}
          </Link>
        )}
        <h1 className="font-display text-[30px] font-semibold leading-tight text-text md:text-[34px]">{title}</h1>
        {description && <div className="mt-1 max-w-3xl text-sm text-muted">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 no-print">{actions}</div>}
    </header>
  );
}

// ------------------------------------------------------------------ KPI
export function Kpi({
  label,
  value,
  hint,
  tone = "default",
  href,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "positive" | "negative" | "warning" | "info";
  href?: string;
  className?: string;
}) {
  const toneClass = {
    default: "text-text",
    positive: "text-success",
    negative: "text-danger",
    warning: "text-warning",
    info: "text-primary",
  }[tone];
  const body = (
    <div className={cn("flex h-full flex-col justify-between rounded-[var(--radius-card)] border border-border bg-surface px-4 py-3.5", href && "transition-colors hover:border-primary/40", className)}>
      <p className="text-[13px] text-muted">{label}</p>
      <p className={cn("font-display mt-2 whitespace-nowrap text-[26px] font-semibold leading-none tabular", toneClass)}>{value}</p>
      {hint && <p className="mt-1.5 text-[12px] text-muted">{hint}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}

// ------------------------------------------------------------------ Badge
const badgeTones = {
  slate: "bg-slate-100 text-slate-700",
  blue: "bg-primary-soft text-primary-strong",
  cyan: "bg-accent-soft text-[#1d7f88]",
  green: "bg-success-soft text-success",
  teal: "bg-teal-50 text-teal-700",
  amber: "bg-warning-soft text-[#8a5800]",
  red: "bg-danger-soft text-danger",
  violet: "bg-violet-50 text-violet-700",
} as const;
export type BadgeTone = keyof typeof badgeTones;

export function Badge({ tone = "slate", children, className }: { tone?: BadgeTone | string; children: ReactNode; className?: string }) {
  const t = (tone in badgeTones ? tone : "slate") as BadgeTone;
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium whitespace-nowrap", badgeTones[t], className)}>{children}</span>;
}

// ------------------------------------------------------------------ Table
export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="relative overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}
export function Th({ className, align, ...props }: ComponentProps<"th"> & { align?: "left" | "right" | "center" }) {
  return (
    <th
      className={cn(
        "border-b border-border bg-surface-2 px-4 py-2.5 text-[12px] font-medium text-muted whitespace-nowrap",
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
        className,
      )}
      {...props}
    />
  );
}
export function Td({ className, align, ...props }: ComponentProps<"td"> & { align?: "left" | "right" | "center" }) {
  return (
    <td
      className={cn(
        "border-b border-border/70 px-4 py-3 align-middle",
        align === "right" ? "text-right tabular" : align === "center" ? "text-center" : "text-left",
        className,
      )}
      {...props}
    />
  );
}

// ------------------------------------------------------------------ Empty state
export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <p className="font-medium text-text">{title}</p>
      {description && <p className="max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ Tabs (navegação por URL)
export function Tabs({ items, active }: { items: Array<{ key: string; label: string; href: string; count?: number }>; active: string }) {
  return (
    <nav className="no-print -mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-border px-1" aria-label="Seções">
      {items.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          scroll={false}
          aria-current={t.key === active ? "page" : undefined}
          className={cn(
            "-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors",
            t.key === active ? "border-primary font-medium text-primary" : "border-transparent text-muted hover:text-text",
          )}
        >
          {t.label}
          {t.count !== undefined && t.count > 0 && <span className="rounded-full bg-surface-2 px-1.5 text-[11px] text-muted">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

// ------------------------------------------------------------------ Definition list
export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-text">{children ?? "—"}</dd>
    </div>
  );
}

export function Progress({ value, tone = "primary", className }: { value: number; tone?: "primary" | "success" | "warning" | "danger"; className?: string }) {
  const color = { primary: "bg-primary", success: "bg-success", warning: "bg-warning", danger: "bg-danger" }[tone];
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-border", className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Avatar({ name, src, size = 32 }: { name: string; src?: string | null; size?: number }) {
  const ini = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={name} width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-medium text-primary-strong" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden>
      {ini}
    </span>
  );
}
