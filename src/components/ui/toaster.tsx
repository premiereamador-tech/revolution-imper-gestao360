"use client";

import { useEffect, useState } from "react";

/** Avisos curtos de confirmação. Sobrevivem ao fechamento do modal e ao refresh da lista. */
export function toast(message: string) {
  window.dispatchEvent(new CustomEvent("ri:toast", { detail: message }));
}

export function Toaster() {
  const [items, setItems] = useState<Array<{ id: number; text: string }>>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const id = Date.now() + Math.random();
      setItems((l) => [...l.slice(-2), { id, text: (e as CustomEvent<string>).detail }]);
      setTimeout(() => setItems((l) => l.filter((x) => x.id !== id)), 4500);
    };
    window.addEventListener("ri:toast", on);
    return () => window.removeEventListener("ri:toast", on);
  }, []);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <div key={t.id} role="status" className="pointer-events-auto max-w-md rounded-xl bg-abyss px-4 py-3 text-sm text-white shadow-xl">
          {t.text}
        </div>
      ))}
    </div>
  );
}
