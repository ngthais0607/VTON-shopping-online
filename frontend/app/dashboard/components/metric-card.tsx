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
    <Card className="p-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-600">{title}</p>
          <p className="text-3xl font-bold text-slate-900 mt-2">{value}</p>
          {description && (
            <p className="text-xs text-slate-500 mt-1">{description}</p>
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
        {Icon && (
          <div className="p-3 bg-slate-100 rounded-lg text-slate-600">
            <Icon className="w-6 h-6" />
          </div>
        )}
      </div>
    </Card>
  );
}
