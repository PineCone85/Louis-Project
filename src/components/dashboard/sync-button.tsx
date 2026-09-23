"use client";

import { RefreshCw } from "lucide-react";
import { useNotifications } from "@/components/shell/notifications-provider";
import { cx } from "@/components/ui/primitives";

export function SyncButton({ className }: { className?: string }) {
  const { refresh, syncing } = useNotifications();
  return (
    <button type="button" className={cx("btn btn-secondary", className)} onClick={() => void refresh(true)} disabled={syncing}>
      <RefreshCw size={14} className={syncing ? "animate-spin" : undefined} />
      {syncing ? "Checking…" : "Check for new messages"}
    </button>
  );
}
