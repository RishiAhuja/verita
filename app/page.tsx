import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 px-6 py-12">
      <div className="space-y-2">
        <h1 className="text-2xl font-medium text-neutral-900">Verita</h1>
        <p className="text-sm leading-relaxed text-neutral-600">
          Metered API billing — usage, invoices, and ops tooling.
        </p>
      </div>

      <div className="flex flex-col gap-2 text-sm">
        <Link
          href="/customer/usage"
          className="text-neutral-900 underline decoration-neutral-300 underline-offset-4 hover:decoration-neutral-900"
        >
          Customer dashboard
        </Link>
        <Link
          href="/console/customers"
          className="text-neutral-900 underline decoration-neutral-300 underline-offset-4 hover:decoration-neutral-900"
        >
          Ops console
        </Link>
      </div>
    </main>
  );
}
