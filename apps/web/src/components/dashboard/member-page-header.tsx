"use client";

import { cn } from "@/lib/utils";

export function MemberPageHeader({
  title,
  subtitle,
  className,
}: {
  title: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <header className={cn("mz-header mb-8", className)}>
      <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">{title}</h1>
      {subtitle ? (
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">{subtitle}</p>
      ) : null}
      <div className="mz-rule mt-4" />
    </header>
  );
}
