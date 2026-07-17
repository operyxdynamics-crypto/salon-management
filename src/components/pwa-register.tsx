"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const INSTALL_DISMISS_KEY = "operyx-pwa-install-dismissed";

export function PwaRegister() {
  const [online, setOnline] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const storedDismissed = window.localStorage.getItem(INSTALL_DISMISS_KEY) === "true";
    const standalone = isStandaloneMode();
    setDismissed(storedDismissed || standalone);
    setOnline(navigator.onLine);

    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      if (!storedDismissed && !isStandaloneMode()) setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      window.localStorage.setItem(INSTALL_DISMISS_KEY, "true");
      setDismissed(true);
      setInstallPrompt(null);
      setShowIosHint(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setShowIosHint(isIos && !storedDismissed && !standalone);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice.catch(() => ({ outcome: "dismissed" as const, platform: "" }));
    if (choice.outcome === "accepted") {
      window.localStorage.setItem(INSTALL_DISMISS_KEY, "true");
      setDismissed(true);
    }
    setInstallPrompt(null);
  }

  function dismissInstall() {
    window.localStorage.setItem(INSTALL_DISMISS_KEY, "true");
    setDismissed(true);
    setInstallPrompt(null);
    setShowIosHint(false);
  }

  if (!online) {
    return <div className="fixed inset-x-3 top-[calc(.75rem+env(safe-area-inset-top))] z-[80] mx-auto max-w-md rounded-2xl border border-[#e2c46d] bg-[#fff7df] p-3 text-sm font-bold text-[#6d4b12] shadow-[0_16px_44px_rgba(31,41,55,.18)]">
      Offline mode: cached screens may open, but bookings, POS, payments, stock, and register actions need internet.
    </div>;
  }

  if (dismissed || (!installPrompt && !showIosHint)) return null;

  return <div className="fixed inset-x-3 top-[calc(.75rem+env(safe-area-inset-top))] z-[80] mx-auto max-w-md rounded-2xl border border-[#16B994]/40 bg-[#173279] p-3 text-white shadow-[0_16px_44px_rgba(23,50,121,.3)]">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm font-extrabold text-[#16B994]">Use Operyx like an app</p>
        <p className="mt-1 text-xs leading-5 text-white/68">{showIosHint ? "On iPhone, tap Share and choose Add to Home Screen." : "Install the workspace for full-screen mobile access."}</p>
      </div>
      <button type="button" onClick={dismissInstall} className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10" aria-label="Dismiss install prompt"><X size={15} /></button>
    </div>
    {installPrompt && <button type="button" onClick={() => void installApp()} className="mt-3 w-full rounded-full bg-[#16B994] px-4 py-2.5 text-sm font-extrabold text-[#173279]">Install app</button>}
  </div>;
}

function isStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}
