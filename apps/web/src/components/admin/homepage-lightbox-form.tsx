"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { storage } from "@/lib/firebase/client";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { HomepageLightboxItem } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export function HomepageLightboxForm({
  initialData,
  itemId,
}: {
  initialData?: HomepageLightboxItem;
  itemId?: string;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [sport, setSport] = useState(initialData?.sport ?? "");
  const [era, setEra] = useState(initialData?.era ?? "");
  const [enabled, setEnabled] = useState(initialData?.enabled !== false);
  const [imageUrl, setImageUrl] = useState(initialData?.imageUrl ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      alert("Title is required");
      return;
    }
    setSaving(true);
    try {
      const token = await user?.getIdToken();
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };

      let id = itemId;
      if (!id) {
        const created = await fetch("/api/homepage/lightbox", {
          method: "POST",
          headers,
          body: JSON.stringify({
            title: title.trim(),
            sport: sport.trim(),
            era: era.trim(),
            enabled,
            imageUrl: imageUrl || null,
          }),
        });
        if (!created.ok) {
          alert("Failed to save");
          return;
        }
        const createdJson = await created.json();
        id = createdJson.id as string;
      }

      let finalUrl = imageUrl || null;
      if (file && storage && id) {
        const safeName = file.name.replace(/[^\w.\-]+/g, "_");
        const path = `homepage/lightbox/${id}/${Date.now()}_${safeName}`;
        const fileRef = storageRef(storage, path);
        await uploadBytes(fileRef, file, { contentType: file.type || "image/jpeg" });
        finalUrl = await getDownloadURL(fileRef);
      }

      const res = await fetch(`/api/homepage/lightbox/${id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          title: title.trim(),
          sport: sport.trim(),
          era: era.trim(),
          imageUrl: finalUrl,
          enabled,
        }),
      });
      if (!res.ok) {
        alert("Failed to save");
        return;
      }
      router.push("/admin/homepage");
      router.refresh();
    } catch (err) {
      console.error(err);
      alert("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="sport">Sport</Label>
        <Input id="sport" value={sport} onChange={(e) => setSport(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="era">Era / year</Label>
        <Input id="era" value={era} onChange={(e) => setEra(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="image">Flyer image</Label>
        <Input
          id="image"
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {imageUrl ? (
          <img src={imageUrl} alt="" className="mt-2 max-h-48 w-auto rounded-md border object-contain" />
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="enabled"
          checked={enabled}
          onCheckedChange={(v) => setEnabled(v === true)}
        />
        <Label htmlFor="enabled">Show on homepage</Label>
      </div>
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : itemId ? "Save changes" : "Add flyer"}
      </Button>
    </form>
  );
}
