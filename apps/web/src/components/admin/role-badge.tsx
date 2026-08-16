import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function RoleBadge({ role, className }: { role?: string | null; className?: string }) {
  const label =
    role === "SUPER_ADMIN" ? "Super Admin" : role === "ADMIN" ? "Admin" : "Member";
  const colors =
    role === "SUPER_ADMIN"
      ? "border-transparent bg-[#c8102e] text-white"
      : role === "ADMIN"
        ? "border-transparent bg-[#FFD700] text-[#1a3556]"
        : "border-transparent bg-[#1a3556] text-white";
  return (
    <Badge variant="outline" className={cn(colors, className)}>
      {label}
    </Badge>
  );
}
