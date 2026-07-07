// A small colored pill that turns a raw DB status string into plain-English copy
// with a color so state is legible at a glance (not gray-on-gray). Used for task
// statuses (My tasks, task detail) and provider bid statuses (Find work).

type Tone = "blue" | "green" | "gray" | "amber";

const TONE: Record<Tone, string> = {
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  green: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  gray: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

// Fallback for any status we haven't mapped yet: "in_review" → "In review".
function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const TASK: Record<string, { label: string; tone: Tone }> = {
  open: { label: "Open for bids", tone: "blue" },
  assigned: { label: "Provider hired", tone: "green" },
  completed: { label: "Completed", tone: "gray" },
  cancelled: { label: "Cancelled", tone: "gray" },
  hidden: { label: "Hidden", tone: "gray" },
  deleted: { label: "Removed", tone: "gray" },
};

const BID: Record<string, { label: string; tone: Tone }> = {
  active: { label: "Bid sent", tone: "blue" },
  selected: { label: "You were hired", tone: "green" },
  withdrawn: { label: "Withdrawn", tone: "gray" },
};

export default function StatusChip({ status, kind }: { status: string; kind: "task" | "bid" }) {
  const map = kind === "task" ? TASK : BID;
  const entry = map[status] ?? { label: titleCase(status), tone: "gray" as Tone };
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONE[entry.tone]}`}>
      {entry.label}
    </span>
  );
}
