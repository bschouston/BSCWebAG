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
      <div className="member-zone flex flex-1">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] md:block">
          <MemberSidebar />
        </aside>
        <main className="h-[calc(100vh-4rem)] flex-1 overflow-y-auto p-4 md:p-8">
          {children}
        </main>
      </div>
    </RequireItsNumber>
  );
}
