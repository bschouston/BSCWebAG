"use client";

import { use, useEffect, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_PUBLIC_TABS,
  PUBLIC_TOURNAMENT_TAB_IDS,
  PUBLIC_TOURNAMENT_TAB_LABELS,
  normalizePublicDefaultTab,
  normalizePublicTabs,
  type PublicTournamentTabId,
} from "@/lib/public-tournament-tabs";

function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export default function PublicTournamentPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = use(params);
  const { user } = useAuth();
  const [iframeHtml, setIframeHtml] = useState("");
  const [publicTabs, setPublicTabs] = useState<PublicTournamentTabId[]>([...DEFAULT_PUBLIC_TABS]);
  const [publicDefaultTab, setPublicDefaultTab] = useState<PublicTournamentTabId>(
    DEFAULT_PUBLIC_TABS[0]!
  );
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
      const tabs = normalizePublicTabs(tData?.tournament?.publicTabs);
      setPublicTabs(tabs);
      setPublicDefaultTab(
        normalizePublicDefaultTab(tabs, tData?.tournament?.publicDefaultTab)
      );
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
      let next: PublicTournamentTabId[];
      if (checked) {
        if (prev.includes(tabId)) return prev;
        next = [...prev, tabId];
      } else {
        next = prev.filter((id) => id !== tabId);
        if (next.length === 0) return prev;
      }
      setPublicDefaultTab((current) => normalizePublicDefaultTab(next, current));
      return next;
    });
  };

  const moveTab = (index: number, delta: number) => {
    setPublicTabs((prev) => moveItem(prev, index, index + delta));
  };

  const savePublicSettings = async () => {
    setSaving(true);
    try {
      const headers = await authHeaders();
      const tabs = normalizePublicTabs(publicTabs);
      const defaultTab = normalizePublicDefaultTab(tabs, publicDefaultTab);
      const res = await fetch(`/api/tournaments/${tournamentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          publicIframeEmbedHtml: iframeHtml || null,
          publicTabs: tabs,
          publicDefaultTab: defaultTab,
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

  const hiddenTabs = PUBLIC_TOURNAMENT_TAB_IDS.filter((id) => !publicTabs.includes(id));

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
                <Label>Visible tabs (order)</Label>
                <ul className="space-y-2">
                  {publicTabs.map((tabId, index) => (
                    <li
                      key={tabId}
                      className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                    >
                      <label
                        htmlFor={`tab-${tabId}`}
                        className="flex min-w-0 flex-1 items-center gap-2 text-sm cursor-pointer"
                      >
                        <Checkbox
                          id={`tab-${tabId}`}
                          checked
                          onCheckedChange={(checked) =>
                            togglePublicTab(tabId, checked === true)
                          }
                        />
                        <span className="text-muted-foreground tabular-nums w-5">
                          {index + 1}.
                        </span>
                        <span className="font-medium">{PUBLIC_TOURNAMENT_TAB_LABELS[tabId]}</span>
                      </label>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={index === 0}
                          onClick={() => moveTab(index, -1)}
                          aria-label={`Move ${PUBLIC_TOURNAMENT_TAB_LABELS[tabId]} up`}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={index === publicTabs.length - 1}
                          onClick={() => moveTab(index, 1)}
                          aria-label={`Move ${PUBLIC_TOURNAMENT_TAB_LABELS[tabId]} down`}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
                {hiddenTabs.length > 0 ? (
                  <div className="space-y-2 pt-2">
                    <p className="text-xs font-medium text-muted-foreground">Add tabs</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {hiddenTabs.map((tabId) => (
                        <label
                          key={tabId}
                          htmlFor={`tab-add-${tabId}`}
                          className="flex items-center gap-2 text-sm cursor-pointer rounded-md border border-dashed px-3 py-2"
                        >
                          <Checkbox
                            id={`tab-add-${tabId}`}
                            checked={false}
                            onCheckedChange={(checked) =>
                              togglePublicTab(tabId, checked === true)
                            }
                          />
                          {PUBLIC_TOURNAMENT_TAB_LABELS[tabId]}
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Use the arrows to set tab order on the public page. At least one tab must remain
                  enabled.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="public-default-tab">Default landing tab</Label>
                <Select
                  value={publicDefaultTab}
                  onValueChange={(value) => {
                    if (publicTabs.includes(value as PublicTournamentTabId)) {
                      setPublicDefaultTab(value as PublicTournamentTabId);
                    }
                  }}
                >
                  <SelectTrigger id="public-default-tab" className="w-full sm:max-w-xs">
                    <SelectValue placeholder="Select default tab" />
                  </SelectTrigger>
                  <SelectContent>
                    {publicTabs.map((tabId) => (
                      <SelectItem key={tabId} value={tabId}>
                        {PUBLIC_TOURNAMENT_TAB_LABELS[tabId]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Visitors open this tab first when they load the public tournament page.
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
