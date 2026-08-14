'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface CartContextType {
  selectedUrls: string[];
  toggleUrl: (url: string) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);

  const toggleUrl = (url: string) => {
    setSelectedUrls(prev => 
      prev.includes(url) 
        ? prev.filter(u => u !== url)
        : [...prev, url]
    );
  };

  const clearCart = () => setSelectedUrls([]);

  return (
    <CartContext.Provider value={{ selectedUrls, toggleUrl, clearCart }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
