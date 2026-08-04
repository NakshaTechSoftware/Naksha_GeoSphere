import { Card } from "@/components/ui/Card";
import { StatusIndicator, type IndicatorState } from "@/components/ui/StatusIndicator";

export interface ServiceStatusCardProps {
  name: string;
  description: string;
  state: IndicatorState;
  detail?: string;
}

export function ServiceStatusCard({ name, description, state, detail }: ServiceStatusCardProps) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-sm font-semibold text-spatial-navy">{name}</h3>
        <StatusIndicator state={state} />
      </div>
      <p className="text-sm text-spatial-navy/70">{description}</p>
      {detail && <p className="text-xs text-spatial-navy/50">{detail}</p>}
    </Card>
  );
}
