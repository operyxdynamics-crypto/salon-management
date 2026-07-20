"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Check } from "lucide-react";

/**
 * One toast for the whole panel.
 *
 * This replaces the old pattern of saving and then calling `window.location.reload()`. A full
 * reload flashes white, loses scroll position and refetches every query on the page to change one
 * row - in a demo it reads as "slow software" no matter how fast the server is. Now a save is:
 * `router.refresh()` to re-render the server data in place, and a toast so the person knows it
 * worked. Salon staff and admins both work fast; a save with no confirmation gets clicked twice.
 *
 * Deliberately only a success toast. Errors stay inline next to the thing that failed, because an
 * error you have to act on should not disappear on a timer.
 */

const ToastContext = createContext<(message: string) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ key: number; message: string } | null>(null);

  // Keyed by time so showing the same message twice restarts the animation and the timer.
  const show = useCallback((message: string) => setToast({ key: Date.now(), message }), []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div
          key={toast.key}
          role="status"
          className="fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2.5 rounded-xl bg-[#1F2937] py-3 pl-3.5 pr-5 text-sm font-semibold text-white shadow-2xl"
          style={{ animation: "platformToastIn 160ms ease-out" }}
        >
          <span className="grid size-5 place-items-center rounded-full bg-[#0B6B4F]"><Check size={12} /></span>
          {toast.message}
          <style>{`@keyframes platformToastIn { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }`}</style>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
