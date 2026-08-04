import { Globe, Upload, Search, ClipboardList } from "lucide-react";

interface QuickAction {
  id: string;
  icon: typeof Globe;
  title: string;
  description: string;
  href: string;
}

const actions: QuickAction[] = [
  {
    id: "browse",
    icon: Globe,
    title: "Browse Data",
    description: "Explore global datasets",
    href: "/explore",
  },
  {
    id: "upload",
    icon: Upload,
    title: "Upload AOI",
    description: "Get custom data quote",
    href: "/upload-aoi",
  },
  {
    id: "saved-searches",
    icon: Search,
    title: "Saved Searches",
    description: "View your saved searches",
    href: "/saved-searches",
  },
  {
    id: "order-history",
    icon: ClipboardList,
    title: "Order History",
    description: "Track your orders",
    href: "/orders",
  },
];

export function QuickActions() {
  return (
    <div className="rounded-[var(--radius-large)] border border-[var(--color-border-subtle)] bg-white p-5 shadow-card">
      <h2 className="mb-4 text-base font-semibold text-obsidian-graphite">Quick Actions</h2>
      <div className="grid grid-cols-2 gap-3">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <a
              key={action.id}
              href={action.href}
              className="flex items-start gap-3 rounded-lg border border-[var(--color-border-subtle)] p-3.5 transition-colors hover:border-atlas-cobalt/30 hover:bg-[var(--color-cobalt-soft)]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-cobalt-soft)] text-atlas-cobalt">
                <Icon className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-obsidian-graphite">
                  {action.title}
                </span>
                <span className="block text-xs text-[var(--color-text-secondary)]">
                  {action.description}
                </span>
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
