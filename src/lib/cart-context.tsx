"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type CartItem = {
    id: string; // unique item id
    type: "registration" | "product" | "token";
    title: string;
    amount: number;
    metadata?: any;
};

export type PaymentType = "full" | "installment";

type CartContextType = {
    items: CartItem[];
    paymentType: PaymentType;
    setPaymentType: (type: PaymentType) => void;
    addToCart: (item: CartItem) => void;
    removeFromCart: (id: string) => void;
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
            // If item exactly matches same registration ID, overwrite it
            const idx = prev.findIndex(i => i.id === item.id);
            if (idx !== -1) {
                const updated = [...prev];
                updated[idx] = item;
                return updated;
            }
            return [...prev, item];
        });
    };

    const removeFromCart = (id: string) => {
        setItems(prev => prev.filter(i => i.id !== id));
    };

    const clearCart = () => {
        setItems([]);
        setPaymentType("full");
    };

    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);

    return (
        <CartContext.Provider value={{ items, paymentType, setPaymentType, addToCart, removeFromCart, clearCart, totalAmount }}>
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
