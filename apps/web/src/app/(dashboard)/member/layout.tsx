"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { MemberSidebar } from "@/components/dashboard/member-sidebar";
import { RequireItsNumber } from "@/components/auth/require-its-number";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export default function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <RequireItsNumber>
      <div className="member-zone flex flex-1">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] md:block">
          <MemberSidebar />
        </aside>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden fixed bottom-4 right-4 z-40 h-12 w-12 rounded-full shadow-lg bg-background border"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex h-full w-64 flex-col overflow-y-auto p-0">
            <SheetTitle className="sr-only">Member navigation</SheetTitle>
            <MemberSidebar />
          </SheetContent>
        </Sheet>

        <main className="h-[calc(100vh-4rem)] flex-1 overflow-y-auto p-4 md:p-8">
          {children}
        </main>
      </div>
    </RequireItsNumber>
  );
}
