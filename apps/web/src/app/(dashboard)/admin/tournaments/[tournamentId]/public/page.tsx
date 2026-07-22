"use client";

import { use, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_PUBLIC_TABS,
  PUBLIC_TOURNAMENT_TAB_IDS,
  PUBLIC_TOURNAMENT_TAB_LABELS,
  type PublicTournamentTabId,
} from "@/lib/public-tournament-tabs";

export default function PublicTournamentPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = use(params);
  const { user } = useAuth();
  const [iframeHtml, setIframeHtml] = useState("");
  const [publicTabs, setPublicTabs] = useState<PublicTournamentTabId[]>([...DEFAULT_PUBLIC_TABS]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const authHeaders = async (): Promise<Record<string, string>> => {
    const token = await user?.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const load = async () => {
    setLoading(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/tournaments/${tournamentId}`, { headers });
      if (!res.ok) return;
      const tData = await res.json();
      setIframeHtml(String(tData?.tournament?.publicIframeEmbedHtml ?? ""));
      const tabs = tData?.tournament?.publicTabs;
      if (Array.isArray(tabs) && tabs.length > 0) {
        const valid = tabs.filter((t: string) =>
          (PUBLIC_TOURNAMENT_TAB_IDS as readonly string[]).includes(t)
        );
        if (valid.length > 0) setPublicTabs(valid as PublicTournamentTabId[]);
        else setPublicTabs([...DEFAULT_PUBLIC_TABS]);
      } else {
        setPublicTabs([...DEFAULT_PUBLIC_TABS]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tournamentId]);

  const togglePublicTab = (tabId: PublicTournamentTabId, checked: boolean) => {
    setPublicTabs((prev) => {
      if (checked) {
        if (prev.includes(tabId)) return prev;
        return PUBLIC_TOURNAMENT_TAB_IDS.filter((id) => id === tabId || prev.includes(id));
      }
      const next = prev.filter((id) => id !== tabId);
      return next.length > 0 ? next : prev;
    });
  };

  const savePublicSettings = async () => {
    setSaving(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/tournaments/${tournamentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          publicIframeEmbedHtml: iframeHtml || null,
          publicTabs,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to save public page settings");
      }
      await load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>Public tournament page</CardTitle>
          <CardDescription>
            Control what visitors see at{" "}
            <span className="font-mono text-xs">/tournament/{tournamentId}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Visible tabs</Label>
                <div className="grid gap-3 sm:grid-cols-2">
                  {PUBLIC_TOURNAMENT_TAB_IDS.map((tabId) => (
                    <label
                      key={tabId}
                      htmlFor={`tab-${tabId}`}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <Checkbox
                        id={`tab-${tabId}`}
                        checked={publicTabs.includes(tabId)}
                        onCheckedChange={(checked) => togglePublicTab(tabId, checked === true)}
                      />
                      {PUBLIC_TOURNAMENT_TAB_LABELS[tabId]}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  At least one tab must remain enabled.
                </p>
              </div>

              <div className="space-y-1">
                <Label>Google Sheet iframe embed code</Label>
                <Textarea
                  value={iframeHtml}
                  onChange={(e) => setIframeHtml(e.target.value)}
                  placeholder='<iframe src="..." width="100%" height="800"></iframe>'
                  className="min-h-[160px] font-mono text-xs"
                />
              </div>
              <Button onClick={() => void savePublicSettings()} disabled={saving}>
                {saving ? "Saving…" : "Save public page settings"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
