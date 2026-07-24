"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Moon, Sun } from "lucide-react";
import { isFantasyAdminProfile, useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme";
import { Button, cn } from "@bsc/ui";

function navActive(pathname: string, href: string) {
  if (href.endsWith("/teams")) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }
  return pathname === href;
}

export function FantasyShell({
  children,
  tournamentId,
}: {
  children: React.ReactNode;
  tournamentId?: string;
}) {
  const { profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();
  const isAdmin = isFantasyAdminProfile(profile);
  const displayName =
    [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || "Player";

  const links = tournamentId
    ? [
        { href: `/t/${tournamentId}/teams`, label: "All teams" },
        { href: `/t/${tournamentId}`, label: "My team" },
        { href: `/t/${tournamentId}/players`, label: "Players" },
      ]
    : [];

  return (
    <div className="min-h-screen flex flex-col w-full">
      <header className="bsc-brand-bar sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="w-full px-3 sm:px-4 lg:px-6 py-3 flex items-center gap-3 sm:gap-4">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="relative h-9 w-9">
              <Image src="/images/bsclogo.png" alt="BSC" fill className="object-contain" />
            </span>
            <span className="font-extrabold tracking-tight text-foreground">Fantasy</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-1 flex-1 min-w-0">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
                  navActive(pathname, l.href)
                    ? "bg-bsc-red/10 text-bsc-red shadow-[inset_0_-2px_0_var(--bsc-red)]"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                )}
              >
                {l.label}
              </Link>
            ))}
            {isAdmin ? (
              <Link
                href={tournamentId ? `/admin/tournaments/${tournamentId}` : "/admin"}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
                  pathname.startsWith("/admin")
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                )}
              >
                Admin
              </Link>
            ) : null}
          </nav>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <span className="text-sm font-medium text-muted-foreground hidden md:inline truncate max-w-[140px]">
              {displayName}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-9 w-9 p-0"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={theme === "dark" ? "Light mode" : "Dark mode"}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>
        {tournamentId ? (
          <div className="sm:hidden flex gap-1 px-3 pb-2 overflow-x-auto">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap",
                  navActive(pathname, l.href)
                    ? "bg-bsc-red text-bsc-red-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {l.label}
              </Link>
            ))}
            {isAdmin ? (
              <Link
                href={`/admin/tournaments/${tournamentId}`}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap",
                  pathname.startsWith("/admin")
                    ? "bg-amber-500 text-amber-950"
                    : "bg-muted text-muted-foreground"
                )}
              >
                Admin
              </Link>
            ) : null}
          </div>
        ) : null}
      </header>
      <div className="flex-1 w-full min-w-0">{children}</div>
    </div>
  );
}
