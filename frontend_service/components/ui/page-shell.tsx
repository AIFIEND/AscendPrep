import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageShell({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("page-wrap space-y-8 py-8 sm:space-y-10 sm:py-10", className)}>{children}</div>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <section className="app-surface px-6 py-6 sm:px-8 sm:py-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2.5">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          {description ? <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </section>
  );
}

export function SectionBlock({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("app-surface p-5 sm:p-6", className)}>{children}</section>;
}
