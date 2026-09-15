import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { DeliveryOrder } from "../types";

interface OrdersContextValue {
  orders: DeliveryOrder[];
  setOrders: (orders: DeliveryOrder[]) => void;
  updateOrder: (id: string, patch: Partial<DeliveryOrder>) => void;
  updateOrders: (patches: Record<string, Partial<DeliveryOrder>>) => void;
  assignees: string[];
  clearAll: () => void;
}

const OrdersContext = createContext<OrdersContextValue | null>(null);

export function OrdersProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);

  const updateOrder = (id: string, patch: Partial<DeliveryOrder>) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  };

  const updateOrders = (patches: Record<string, Partial<DeliveryOrder>>) => {
    setOrders((prev) => prev.map((o) => (patches[o.id] ? { ...o, ...patches[o.id] } : o)));
  };

  const assignees = useMemo(() => {
    const set = new Set<string>();
    for (const o of orders) if (o.assignee) set.add(o.assignee);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [orders]);

  const clearAll = () => setOrders([]);

  return (
    <OrdersContext.Provider value={{ orders, setOrders, updateOrder, updateOrders, assignees, clearAll }}>
      {children}
    </OrdersContext.Provider>
  );
}

export function useOrders() {
  const ctx = useContext(OrdersContext);
  if (!ctx) throw new Error("useOrders는 OrdersProvider 내부에서만 사용할 수 있습니다.");
  return ctx;
}
