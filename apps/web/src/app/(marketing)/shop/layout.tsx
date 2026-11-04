"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useShopCart } from "@/lib/shop-cart-context";
import { ChevronRight, ShoppingBag } from "lucide-react";

type Crumb = { label: string; href?: string };

function useShopBreadcrumbs(): Crumb[] {
  const pathname = usePathname() || "/shop";
  const [productName, setProductName] = useState<string | null>(null);

  const segments = useMemo(
    () => pathname.split("/").filter(Boolean),
    [pathname]
  );

  const productSlug = useMemo(() => {
    if (segments[0] !== "shop") return null;
    const second = segments[1];
    if (!second || second === "cart" || second === "checkout") return null;
    return second;
  }, [segments]);

  useEffect(() => {
    if (!productSlug) {
      setProductName(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/shop/products/${encodeURIComponent(productSlug)}`)
      .then(async (r) => {
        const data = await r.json();
        if (!cancelled && r.ok && typeof data.product?.name === "string") {
          setProductName(data.product.name);
        }
      })
      .catch(() => {
        if (!cancelled) setProductName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [productSlug]);

  return useMemo(() => {
    const crumbs: Crumb[] = [];
    const isShopRoot = segments.length === 1 && segments[0] === "shop";

    if (isShopRoot) {
      crumbs.push({ label: "Shop" });
      return crumbs;
    }

    crumbs.push({ label: "Shop", href: "/shop" });

    if (segments[1] === "cart") {
      crumbs.push({ label: "Bag" });
      return crumbs;
    }

    if (segments[1] === "checkout") {
      if (segments[2] === "success") {
        crumbs.push({ label: "Order received" });
      } else if (segments[2] === "repay") {
        crumbs.push({ label: "Complete payment" });
      } else {
        crumbs.push({ label: "Checkout" });
      }
      return crumbs;
    }

    if (productSlug) {
      crumbs.push({
        label:
          productName ||
          productSlug
            .split("-")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" "),
      });
    }

    return crumbs;
  }, [segments, productSlug, productName]);
}

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  const { totalQty } = useShopCart();
  const crumbs = useShopBreadcrumbs();

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
            <ol className="flex flex-wrap items-center gap-1 text-sm">
              {crumbs.map((crumb, i) => {
                const isLast = i === crumbs.length - 1;
                return (
                  <li key={`${crumb.label}-${i}`} className="flex min-w-0 items-center gap-1">
                    {i > 0 ? (
                      <ChevronRight
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                    ) : null}
                    {crumb.href && !isLast ? (
                      <Link
                        href={crumb.href}
                        className="truncate text-muted-foreground hover:text-foreground"
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span
                        className={
                          isLast
                            ? "truncate font-semibold text-[#1a3556] dark:text-[#ffd700]"
                            : "truncate text-muted-foreground"
                        }
                        aria-current={isLast ? "page" : undefined}
                      >
                        {crumb.label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
          <Link
            href="/shop/cart"
            className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-card text-[#1a3556] dark:text-[#ffd700]"
            aria-label="Shop bag"
          >
            <ShoppingBag className="h-5 w-5" />
            {totalQty > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#1a3556] px-1 text-[10px] font-bold text-white dark:bg-[#ffd700] dark:text-[#122540]">
                {totalQty}
              </span>
            ) : null}
          </Link>
        </div>
      </div>
      {children}
    </div>
  );
}
