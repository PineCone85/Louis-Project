"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

export type Counts = {
  unreadNotifications: number;
  unreadMessages: { total: number; email: number; whatsapp: number };
};

type LatestNotification = { id: string; title: string; body: string | null; clientId: string | null; createdAt: string };

type PollResponse = Counts & {
  latest: LatestNotification[];
  gmail: { connected: boolean; lastSyncAt: string | null; error: string | null };
};

type Toast = { id: string; title: string; body: string | null; href: string };

type ContextValue = {
  counts: Counts;
  gmailError: string | null;
  refresh: (sync?: boolean) => Promise<void>;
  syncing: boolean;
};

const NotificationsContext = createContext<ContextValue | null>(null);

const POLL_INTERVAL_MS = 45_000;

export function NotificationsProvider({ initial, children }: { initial: Counts; children: ReactNode }) {
  const router = useRouter();
  const [counts, setCounts] = useState<Counts>(initial);
  const [gmailError, setGmailError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [syncing, setSyncing] = useState(false);
  const lastSeenAt = useRef<string>(new Date().toISOString());
  const inFlight = useRef(false);

  const refresh = useCallback(
    async (sync = true) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setSyncing(sync);
      try {
        const response = await fetch(`/api/notifications${sync ? "?sync=1" : ""}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as PollResponse;
        setCounts({ unreadNotifications: data.unreadNotifications, unreadMessages: data.unreadMessages });
        setGmailError(data.gmail.error);
        const fresh = data.latest.filter((n) => n.createdAt > lastSeenAt.current);
        if (fresh.length > 0) {
          lastSeenAt.current = fresh.reduce((max, n) => (n.createdAt > max ? n.createdAt : max), lastSeenAt.current);
          setToasts((current) => [
            ...fresh.map((n) => ({ id: n.id, title: n.title, body: n.body, href: n.clientId ? `/clients/${n.clientId}` : "/inbox" })),
            ...current,
          ].slice(0, 4));
          router.refresh();
        }
      } catch {
        // Network hiccups are ignored; the next poll will retry.
      } finally {
        inFlight.current = false;
        setSyncing(false);
      }
    },
    [router],
  );

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void refresh(true);
    };
    const interval = window.setInterval(tick, POLL_INTERVAL_MS);
    const initialTimer = window.setTimeout(tick, 4_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(initialTimer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = window.setTimeout(() => setToasts((current) => current.slice(0, -1)), 9_000);
    return () => window.clearTimeout(timer);
  }, [toasts]);

  const value = useMemo(() => ({ counts, gmailError, refresh, syncing }), [counts, gmailError, refresh, syncing]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      {toasts.length > 0 ? (
        <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
          {toasts.map((toast) => (
            <div key={toast.id} className="pointer-events-auto flex items-start gap-3 rounded-md border border-line bg-paper p-3.5 shadow-[0_8px_30px_rgba(21,23,21,0.12)]">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sage-600" />
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  setToasts((current) => current.filter((t) => t.id !== toast.id));
                  router.push(toast.href);
                }}
              >
                <p className="truncate text-[13px] font-semibold text-ink">{toast.title}</p>
                {toast.body ? <p className="mt-0.5 line-clamp-2 text-[12px] text-ink-muted">{toast.body}</p> : null}
              </button>
              <button
                type="button"
                aria-label="Dismiss"
                className="text-ink-faint hover:text-ink"
                onClick={() => setToasts((current) => current.filter((t) => t.id !== toast.id))}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): ContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used inside NotificationsProvider");
  return ctx;
}
