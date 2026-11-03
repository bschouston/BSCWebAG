import { ShopProductForm } from "@/components/admin/shop-product-form";

export default function NewShopProductPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">New product</h1>
      <ShopProductForm />
    </div>
  );
}
