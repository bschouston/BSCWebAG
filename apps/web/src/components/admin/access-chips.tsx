import { Badge } from "@/components/ui/badge";
import type { MemberAccessLabel } from "@/lib/member-access";

export function AccessChips({ labels }: { labels: MemberAccessLabel[] }) {
  if (labels.length === 0) {
    return <span className="text-xs text-muted-foreground">None</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {labels.map((label) => (
        <Badge key={label} variant="outline">
          {label}
        </Badge>
      ))}
    </div>
  );
}
