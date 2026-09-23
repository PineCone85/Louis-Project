"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui/primitives";

const ITEMS = [
  { href: "/settings", label: "Profile" },
  { href: "/settings/gmail", label: "Gmail" },
  { href: "/settings/whatsapp", label: "WhatsApp" },
  { href: "/settings/templates", label: "Templates" },
  { href: "/settings/auto-replies", label: "Automatic replies" },
  { href: "/settings/workflows", label: "Workflows" },
  { href: "/settings/pipeline", label: "Pipeline" },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 border-b border-line bg-paper px-6 md:px-8">
      {ITEMS.map((item) => {
        const active = item.href === "/settings" ? pathname === "/settings" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cx(
              "-mb-px border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors",
              active ? "border-ink text-ink" : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
