export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-4 py-10 text-center">
      <p className="text-sm font-medium text-neutral-900">{title}</p>
      <p className="mt-1 text-sm text-neutral-500">{description}</p>
    </div>
  );
}
