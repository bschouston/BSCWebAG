"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function StatsPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Stats</CardTitle>
        <CardDescription>
          Coming soon. This tournament’s selected stat tracker will power this view in V2.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-muted-foreground">
        Placeholder to keep navigation structure stable while we finish the tracker module system.
      </CardContent>
    </Card>
  );
}

