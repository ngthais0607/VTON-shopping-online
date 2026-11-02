import { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: {
    value: number;
    isPositive: boolean;
  };
  icon?: LucideIcon;
  description?: string;
}

export function MetricCard({
  title,
  value,
  change,
  icon: Icon,
  description,
}: MetricCardProps) {
  return (
    <Card className="admin-metric min-w-0 p-5 sm:p-6">
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          {Icon && <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-[#B89B6A]" />}
        </div>
        <div className="min-w-0">
          <p className="break-words font-sans text-[28px] font-medium tabular-nums tracking-tight text-foreground">{value}</p>
          {description && (
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          )}
          {change && (
            <p
              className={`text-xs font-medium mt-2 ${
                change.isPositive ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {change.isPositive ? '+' : ''}
              {change.value}% from last month
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
