import type { ReactNode } from "react";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-3xl bg-card p-8 shadow-xl ring-1 ring-border">
        <div className="text-center">
          <div className="text-4xl">💍</div>
          <h1 className="mt-2 font-display text-2xl text-foreground">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mx-auto mt-4 h-px w-16 bg-gradient-to-l from-transparent via-gold to-transparent" />
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
