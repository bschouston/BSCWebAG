"use client";

import { use, useEffect, useState } from "react";
import { HomepageLightboxForm } from "@/components/admin/homepage-lightbox-form";
import { HomepageLightboxItem } from "@/types";

export default function EditHomepageFlyerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [item, setItem] = useState<HomepageLightboxItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/homepage/lightbox/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setItem(data))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div>Loading flyer…</div>;
  if (!item) return <div>Flyer not found</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Edit homepage flyer</h1>
      <HomepageLightboxForm initialData={item} itemId={id} />
    </div>
  );
}
