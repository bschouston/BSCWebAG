"use client";

import { MemberSidebar } from "@/components/dashboard/member-sidebar";
import { RequireItsNumber } from "@/components/auth/require-its-number";

export default function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireItsNumber>
      <div className="flex flex-1">
        <aside className="hidden md:block h-[calc(100vh-4rem)] sticky top-16">
          <MemberSidebar />
        </aside>
        <main className="flex-1 p-8 overflow-y-auto h-[calc(100vh-4rem)]">{children}</main>
      </div>
    </RequireItsNumber>
  );
}
