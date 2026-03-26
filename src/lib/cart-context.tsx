"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type CartItem = {
    id: string; // unique item id
    type: "registration" | "product" | "token";
    title: string;
    amount: number; // unit price (not multiplied by quantity)
    quantity?: number; // defaults to 1
    metadata?: any;
};

export type PaymentType = "full" | "installment";

type CartContextType = {
    items: CartItem[];
    paymentType: PaymentType;
    setPaymentType: (type: PaymentType) => void;
    addToCart: (item: CartItem) => void;
    removeFromCart: (id: string) => void;
    decrementCartItem: (id: string) => void;
    clearCart: () => void;
    totalAmount: number;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
    const [items, setItems] = useState<CartItem[]>([]);
    const [paymentType, setPaymentType] = useState<PaymentType>("full");
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem("bsc_cart");
        if (saved) {
            try { setItems(JSON.parse(saved)); } catch (e) {}
        }
        setIsLoaded(true);
    }, []);

    useEffect(() => {
        if (isLoaded) {
            localStorage.setItem("bsc_cart", JSON.stringify(items));
        }
    }, [items, isLoaded]);

    const addToCart = (item: CartItem) => {
        setItems(prev => {
            const idx = prev.findIndex(i => i.id === item.id);
            if (idx !== -1) {
                const existing = prev[idx];
                // For products, increment quantity instead of overwriting
                if (existing.type === "product") {
                    const updated = [...prev];
                    updated[idx] = { ...existing, quantity: (existing.quantity ?? 1) + 1 };
                    return updated;
                }
                // For registrations/tokens, overwrite (e.g. editing)
                const updated = [...prev];
                updated[idx] = item;
                return updated;
            }
            return [...prev, { ...item, quantity: item.quantity ?? 1 }];
        });
    };

    const removeFromCart = (id: string) => {
        setItems(prev => prev.filter(i => i.id !== id));
    };

    const decrementCartItem = (id: string) => {
        setItems(prev =>
            prev
                .map(i => i.id === id ? { ...i, quantity: (i.quantity ?? 1) - 1 } : i)
                .filter(i => (i.quantity ?? 1) > 0)
        );
    };

    const clearCart = () => {
        setItems([]);
        setPaymentType("full");
    };

    const totalAmount = items.reduce((sum, item) => sum + item.amount * (item.quantity ?? 1), 0);

    return (
        <CartContext.Provider value={{ items, paymentType, setPaymentType, addToCart, removeFromCart, decrementCartItem, clearCart, totalAmount }}>
            {children}
        </CartContext.Provider>
    );
}

export function useCart() {
    const context = useContext(CartContext);
    if (context === undefined) {
        throw new Error("useCart must be used within a CartProvider");
    }
    return context;
}
