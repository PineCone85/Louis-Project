"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { cx } from "./primitives";

/** Table row that navigates on click while keeping inner links and buttons usable. */
export function LinkRow({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  const router = useRouter();
  return (
    <tr
      className={cx("table-row-link", className)}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("a, button, input, select, textarea, form")) return;
        router.push(href);
      }}
    >
      {children}
    </tr>
  );
}
