"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const customerLinks = [
  { href: "/customer/usage", label: "Usage" },
  { href: "/customer/invoices", label: "Invoices" },
];

const consoleLinks = [{ href: "/console/customers", label: "Customers" }];

export function PageShell({
  section,
  title,
  description,
  children,
}: {
  section: "customer" | "console" | "home";
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const links = section === "customer" ? customerLinks : section === "console" ? consoleLinks : [];

  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-6 py-4">
          <Link href="/" className="text-sm font-medium text-neutral-900">
            Verita
          </Link>
          {links.length > 0 ? (
            <nav className="flex items-center gap-5">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "text-sm transition-colors",
                    pathname.startsWith(link.href)
                      ? "font-medium text-neutral-900"
                      : "text-neutral-500 hover:text-neutral-900",
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        <div>
          <h1 className="text-xl font-medium text-neutral-900">{title}</h1>
          {description ? (
            <p className="mt-1 text-sm text-neutral-500">{description}</p>
          ) : null}
        </div>
        {children}
      </main>
    </div>
  );
}
