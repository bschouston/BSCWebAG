"use client";

import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { UserNav } from "@/components/user-nav";
import { useState, useEffect } from "react";
import { collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { ModeToggle } from "@/components/mode-toggle";
import { MobileNav } from "@/components/layout/mobile-nav";
import { useCart } from "@/lib/cart-context";
import { ShoppingCart, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { livePageTitle, registrationNavTitle } from "@/lib/live-page-title";

type NavLink = { title: string; href: string };

export function Navbar() {
  const { user, loading } = useAuth();
  const { items } = useCart();

  const [tournamentLinks, setTournamentLinks] = useState<NavLink[]>([]);
  const [registrationLinks, setRegistrationLinks] = useState<NavLink[]>([]);

  useEffect(() => {
    const fetchNavData = async () => {
      if (!db) return;

      try {
        const tournamentsSnap = await getDocs(
          query(collection(db, "tournaments"), where("status", "==", "ACTIVE"))
        );
        const tournaments = tournamentsSnap.docs
          .map((docSnap) => {
            const data = docSnap.data();
            if (data.publicLiveEnabled === false) return null;
            return {
              title: livePageTitle(
                String(data.name ?? "Tournament"),
                String(data.statTrackerId ?? "")
              ),
              href: `/tournament/${docSnap.id}`,
              createdAt: data.createdAt?.toMillis?.() ?? 0,
            };
          })
          .filter((t): t is NavLink & { createdAt: number } => t !== null)
          .sort((a, b) => b.createdAt - a.createdAt)
          .map(({ title, href }) => ({ title, href }));
        setTournamentLinks(tournaments);
      } catch (error) {
        console.error("Failed to fetch active tournaments:", error);
      }

      try {
        const eventsSnap = await getDocs(
          query(
            collection(db, "events"),
            where("category", "==", "FEATURED_EVENTS"),
            where("status", "==", "PUBLISHED"),
            where("isPublic", "==", true),
            orderBy("startTime", "asc"),
            limit(2)
          )
        );
        const events = eventsSnap.docs
          .map((docSnap) => {
            const data = docSnap.data();
            const closedMs =
              data.registrationsClosedAt?.toMillis?.() ??
              (typeof data.registrationsClosedAt === "string"
                ? Date.parse(data.registrationsClosedAt)
                : NaN);

            // Keep published featured events in nav so people can find the page
            // (countdown / "opens at" CTA). Only drop hard-closed ones.
            if (Number.isFinite(closedMs)) return null;

            return {
              title: registrationNavTitle(
                String(data.title ?? "Event"),
                data.registrationFormType ? String(data.registrationFormType) : undefined
              ),
              href: `/events/${data.slug || docSnap.id}`,
            };
          })
          .filter((e): e is NavLink => e !== null);
        setRegistrationLinks(events);
      } catch (error) {
        console.error("Failed to fetch featured events:", error);
      }
    };

    void fetchNavData();
  }, []);

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center px-4 justify-between">
        <Link href="/" className="mr-6 flex items-center space-x-2">
          <Image
            src="/images/bsclogo.png"
            alt="Burhani Sports Club"
            width={200}
            height={60}
            className="h-12 w-auto object-contain"
            priority
          />
        </Link>

        <nav className="hidden md:flex flex-1 items-center justify-center space-x-6 text-sm font-medium">
          {tournamentLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="transition-colors hover:text-foreground/80 text-foreground/60"
            >
              {item.title}
            </Link>
          ))}

          {registrationLinks.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center gap-1 transition-colors hover:text-foreground/80 text-foreground/60 outline-none">
                Registration
                <ChevronDown className="h-4 w-4 opacity-70" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center">
                {registrationLinks.map((item) => (
                  <DropdownMenuItem key={item.href} asChild>
                    <Link href={item.href}>{item.title}</Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Link
            href="/contact"
            className="transition-colors hover:text-foreground/80 text-foreground/60"
          >
            Contact
          </Link>
        </nav>

        <div className="hidden md:flex items-center space-x-4">
          <ModeToggle />

          <Link
            href="/cart"
            className="relative text-foreground/60 hover:text-foreground/80 flex items-center justify-center p-2"
          >
            <ShoppingCart className="h-5 w-5" />
            {items.length > 0 && (
              <span className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground font-bold">
                {items.length}
              </span>
            )}
          </Link>

          {!loading && user && <UserNav />}
        </div>

        <MobileNav
          tournamentItems={tournamentLinks}
          registrationItems={registrationLinks}
        />
      </div>
    </header>
  );
}
