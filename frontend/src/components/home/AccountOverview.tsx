import { ArrowRight } from "lucide-react";

interface AccountStat {
  id: string;
  label: string;
  value: string;
}

const stats: AccountStat[] = [
  { id: "orders", label: "Total Orders", value: "24" },
  { id: "spent", label: "Spent", value: "$3,245.60" },
  { id: "saved-aois", label: "Saved AOIs", value: "14" },
  { id: "downloads", label: "Downloads", value: "37" },
];

export function AccountOverview() {
  return (
    <div className="rounded-[var(--radius-large)] border border-[var(--color-border-subtle)] bg-white p-5 shadow-card">
      <h2 className="mb-4 text-base font-semibold text-obsidian-graphite">Account Overview</h2>

      <dl className="grid grid-cols-2 gap-4">
        {stats.map((stat) => (
          <div key={stat.id}>
            <dt className="text-xs text-[var(--color-text-secondary)]">{stat.label}</dt>
            <dd className="text-xl font-bold text-obsidian-graphite">{stat.value}</dd>
          </div>
        ))}
      </dl>

      <a
        href="/account"
        className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-atlas-cobalt transition-colors hover:text-[var(--color-cobalt-hover)]"
      >
        View Account Dashboard
        <ArrowRight className="h-4 w-4" />
      </a>
    </div>
  );
}
