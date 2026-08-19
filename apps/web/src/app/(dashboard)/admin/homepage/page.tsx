"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { HomepageLightboxItem } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

export default function AdminHomepagePage() {
  const { user } = useAuth();
  const [items, setItems] = useState<HomepageLightboxItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const token = await user?.getIdToken();
    const res = await fetch("/api/homepage/lightbox", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const data = await res.json();
    setItems(data.items ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const authHeaders = async () => ({
    Authorization: `Bearer ${await user?.getIdToken()}`,
    "Content-Type": "application/json",
  });

  const swap = async (index: number, direction: -1 | 1) => {
    const other = index + direction;
    if (other < 0 || other >= items.length) return;
    const a = items[index];
    const b = items[other];
    const headers = await authHeaders();
    await Promise.all([
      fetch(`/api/homepage/lightbox/${a.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ sortOrder: b.sortOrder }),
      }),
      fetch(`/api/homepage/lightbox/${b.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ sortOrder: a.sortOrder }),
      }),
    ]);
    await load();
  };

  const toggle = async (item: HomepageLightboxItem) => {
    const headers = await authHeaders();
    await fetch(`/api/homepage/lightbox/${item.id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ enabled: !item.enabled }),
    });
    await load();
  };

  const remove = async (item: HomepageLightboxItem) => {
    if (!confirm(`Delete “${item.title}”?`)) return;
    const headers = await authHeaders();
    await fetch(`/api/homepage/lightbox/${item.id}`, { method: "DELETE", headers });
    await load();
  };

  if (loading) return <div className="p-8">Loading homepage flyers…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Manage Homepage</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Lightbox flyers on the club homepage. Toggle visibility, reorder, or add new graphics.
          </p>
        </div>
        <Link href="/admin/homepage/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" /> Add flyer
          </Button>
        </Link>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[88px]">Order</TableHead>
              <TableHead className="w-[96px]">Preview</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Sport</TableHead>
              <TableHead>Era</TableHead>
              <TableHead className="w-[80px]">On</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  No flyers yet.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item, index) => (
                <TableRow key={item.id} className={item.enabled ? "" : "opacity-60"}>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={index === 0}
                        onClick={() => void swap(index, -1)}
                        aria-label="Move up"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={index === items.length - 1}
                        onClick={() => void swap(index, 1)}
                        aria-label="Move down"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" className="h-14 w-12 rounded object-cover" />
                    ) : (
                      <span className="text-xs text-muted-foreground">No image</span>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{item.title}</TableCell>
                  <TableCell>{item.sport}</TableCell>
                  <TableCell>{item.era}</TableCell>
                  <TableCell>
                    <Checkbox
                      checked={item.enabled}
                      onCheckedChange={() => void toggle(item)}
                      aria-label="Show on homepage"
                    />
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Link href={`/admin/homepage/${item.id}`}>
                      <Button size="icon" variant="ghost" aria-label="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Button size="icon" variant="ghost" onClick={() => void remove(item)} aria-label="Delete">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
