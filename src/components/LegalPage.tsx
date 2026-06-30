import type { ReactNode } from "react";

/** Shared layout + typography for the static legal/policy pages. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-1 text-sm text-gray-500">Last updated: {updated}</p>
      <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-300">
        Draft for review. This template has not yet been reviewed by counsel and is not legal advice.
      </div>
      <div className="legal mt-6 space-y-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300 [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-gray-900 dark:[&_h2]:text-gray-100 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_a]:text-brand-600 [&_a]:underline">
        {children}
      </div>
    </article>
  );
}
