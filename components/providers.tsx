"use client";

import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        position="bottom-right"
        toastOptions={{
          classNames: {
            toast: "rounded-lg border border-neutral-200 bg-white text-neutral-900 shadow-sm",
            title: "text-sm font-medium",
            description: "text-sm text-neutral-500",
          },
        }}
        closeButton
      />
    </>
  );
}
