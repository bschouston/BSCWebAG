import { AdminSidebar } from "@/components/dashboard/admin-sidebar";

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-1">
            <aside className="hidden md:block h-[calc(100vh-4rem)] sticky top-16">
                <AdminSidebar />
            </aside>
            <main className="flex-1 p-8 overflow-y-auto h-[calc(100vh-4rem)]">
                {children}
            </main>
        </div>
    );
}
