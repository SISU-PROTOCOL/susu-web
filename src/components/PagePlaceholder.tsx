type PagePlaceholderProps = {
  title: string;
  description: string;
  /** The implementation phase in which this screen is built. */
  phase: string;
};

/**
 * Placeholder for routes whose UI lands in a later phase.
 *
 * Intentionally contains no financial figures, no simulated balances, and no
 * success states — nothing here should imply that functionality already exists.
 */
export function PagePlaceholder({ title, description, phase }: PagePlaceholderProps) {
  return (
    <section className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">{phase}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-4 text-base leading-relaxed text-neutral-600 dark:text-neutral-400">
        {description}
      </p>
      <p className="mt-8 rounded-lg border border-dashed border-neutral-300 px-4 py-3 text-sm text-neutral-500 dark:border-neutral-700">
        This screen is scaffolding. It is implemented in {phase} and is not functional yet.
      </p>
    </section>
  );
}
