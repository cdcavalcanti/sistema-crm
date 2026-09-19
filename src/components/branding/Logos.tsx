import { cn } from "@/lib/utils";

export function CrmLogo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <CrmMark className="h-9 w-9 shrink-0" />
      <span className="font-display text-xl font-semibold tracking-tight text-foreground">
        Sistema <span className="text-gradient-brand">CRM</span>
      </span>
    </span>
  );
}

export function CrmMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={cn("h-10 w-10", className)}
      aria-hidden
      role="img"
    >
      <title>CRM</title>
      <rect width="40" height="40" rx="10" fill="#1a2a4a" />
      <text
        x="20"
        y="26"
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize="13"
        fontWeight="700"
        fill="#ffffff"
      >
        CRM
      </text>
    </svg>
  );
}
