"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui/primitives";

const ITEMS = [
  { href: "/settings", label: "Profile" },
  { href: "/settings/email", label: "Email accounts" },
  { href: "/settings/whatsapp", label: "WhatsApp" },
  { href: "/settings/templates", label: "Templates" },
  { href: "/settings/auto-replies", label: "Automatic replies" },
  { href: "/settings/workflows", label: "Workflows" },
  { href: "/settings/pipeline", label: "Pipeline" },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="scrollbar-thin mx-4 mt-4 flex gap-1 overflow-x-auto rounded-md border border-line bg-canvas p-1 sm:mx-6 md:mx-8">
      {ITEMS.map((item) => {
        const active = item.href === "/settings" ? pathname === "/settings" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cx("tab-link", active && "tab-link-active")}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
