import { SuperAdminSidebar } from "@/components/dashboard/super-admin-sidebar";

export default function SuperAdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex h-screen bg-background">
            <div className="hidden md:flex flex-col w-64 fixed inset-y-0 z-50">
                <SuperAdminSidebar />
            </div>
            <main className="flex-1 md:pl-64 flex flex-col overflow-y-auto">
                <div className="flex-1 p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
