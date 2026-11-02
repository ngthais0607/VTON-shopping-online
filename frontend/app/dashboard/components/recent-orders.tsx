import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
Table,
TableBody,
TableCell,
TableHead,
TableHeader,
TableRow,
} from '@/components/ui/table';
import { RecentOrderSummary } from '@/lib/types';
import { displayDate,formatCurrency } from '@/lib/utils';

interface RecentOrdersProps {
  orders: RecentOrderSummary[];
}

export function RecentOrders({ orders }: RecentOrdersProps) {
  const getStatusColor = (status: RecentOrderSummary['status']) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'confirmed':
        return 'bg-blue-100 text-blue-800';
      case 'expired':
        return 'bg-gray-100 text-gray-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-secondary text-foreground';
    }
  };

  const getPaymentStatusColor = (status: RecentOrderSummary['payment_status']) => {
    switch (status) {
      case 'paid':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'pending':
        return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      case 'failed':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-background text-foreground border-border';
    }
  };

  return (
    <Card>
      <div className="p-6 border-b border-border">
        <h2 className="text-lg font-semibold text-foreground">Recent Orders</h2>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border bg-background">
              <TableHead className="text-muted-foreground">Product</TableHead>
              <TableHead className="text-muted-foreground">Qty</TableHead>
              <TableHead className="text-muted-foreground">Total</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground">Payment</TableHead>
              <TableHead className="text-right text-muted-foreground">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 && <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">No recent orders.</TableCell></TableRow>}
            {orders.map((order) => (
              <TableRow key={order.id} className="border-border">
                <TableCell className="font-medium text-foreground">
                  {order.product_name}
                </TableCell>
                <TableCell className="text-muted-foreground">{order.quantity}</TableCell>
                <TableCell className="font-medium text-foreground">
                  {formatCurrency(order.total, order.currency)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={`capitalize ${getStatusColor(order.status)}`}
                  >
                    {order.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getPaymentStatusColor(
                      order.payment_status
                    )}`}
                  >
                    {order.payment_status}
                  </div>
                </TableCell>
                <TableCell className="text-right text-muted-foreground text-sm">
                  {displayDate(order.created_at, 'MMM dd')}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
