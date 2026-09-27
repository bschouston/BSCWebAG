"use client";

import * as React from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobileModeToggle } from "@/components/mobile-mode-toggle";
import { useAuth } from "@/lib/auth-context";
import { UserNav } from "@/components/user-nav";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type NavLink = { title: string; href: string };

interface MobileNavProps {
  tournamentItems: NavLink[];
  registrationItems: NavLink[];
}

const linkClass =
  "block rounded-md px-2 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-muted";

export function MobileNav({ tournamentItems, registrationItems }: MobileNavProps) {
  const [open, setOpen] = React.useState(false);
  const { user, loading } = useAuth();
  const close = () => setOpen(false);

  return (
    <div className="md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Open menu">
            <Menu className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="flex w-[min(100%,20rem)] flex-col gap-0 overflow-y-auto p-0 sm:max-w-sm">
          <SheetHeader className="border-b p-4 pr-12 text-left">
            <SheetTitle className="text-lg font-semibold text-foreground">Menu</SheetTitle>
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-6 p-4">
            <nav className="flex flex-col gap-1">
              <a
                href="https://fantasy.burhanisportsclub.com"
                target="_blank"
                rel="noopener noreferrer"
                onClick={close}
                className={linkClass}
              >
                Fantasy
              </a>

              {tournamentItems.map((item) => (
                <Link key={item.href} href={item.href} onClick={close} className={linkClass}>
                  {item.title}
                </Link>
              ))}

              {registrationItems.length > 0 ? (
                <>
                  <p className="px-2 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Registration
                  </p>
                  {registrationItems.map((item) => (
                    <Link key={item.href} href={item.href} onClick={close} className={linkClass}>
                      {item.title}
                    </Link>
                  ))}
                </>
              ) : null}

              <Link href="/events/calendar" onClick={close} className={linkClass}>
                Calendar
              </Link>
              <Link href="/contact" onClick={close} className={linkClass}>
                Contact
              </Link>
            </nav>

            <div className="mt-auto flex flex-col gap-4 border-t pt-4">
              <MobileModeToggle />
              {!loading && user ? (
                <UserNav variant="inline" onNavigate={close} />
              ) : !loading ? (
                <Link
                  href="/login"
                  onClick={close}
                  className="inline-flex items-center justify-center rounded-md bg-[#1a3556] px-4 py-2.5 text-base font-medium text-white transition-opacity hover:opacity-90 dark:bg-[#ffd700] dark:text-[#122540]"
                >
                  Log in
                </Link>
              ) : null}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
