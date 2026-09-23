"use client";

import { useEffect } from "react";
import { useNotifications } from "@/components/shell/notifications-provider";

/** Refreshes the unread counters after a conversation has been marked as read on the server. */
export function RefreshCounts() {
  const { refresh } = useNotifications();
  useEffect(() => {
    void refresh(false);
  }, [refresh]);
  return null;
}
