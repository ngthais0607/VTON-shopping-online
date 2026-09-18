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
import { Order } from '@/lib/types';
import { format } from 'date-fns';

interface RecentOrdersProps {
  orders: Order[];
}

export function RecentOrders({ orders }: RecentOrdersProps) {
  const getStatusColor = (status: Order['status']) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'expired':
        return 'bg-gray-100 text-gray-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-slate-100 text-slate-800';
    }
  };

  const getPaymentStatusColor = (status: Order['payment_status']) => {
    switch (status) {
      case 'completed':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'pending':
        return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      case 'failed':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <Card>
      <div className="p-6 border-b border-border">
        <h2 className="text-lg font-semibold text-slate-900">Recent Orders</h2>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-200 bg-slate-50">
              <TableHead className="text-slate-600">Product</TableHead>
              <TableHead className="text-slate-600">Qty</TableHead>
              <TableHead className="text-slate-600">Total</TableHead>
              <TableHead className="text-slate-600">Status</TableHead>
              <TableHead className="text-slate-600">Payment</TableHead>
              <TableHead className="text-right text-slate-600">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id} className="border-slate-200">
                <TableCell className="font-medium text-slate-900">
                  {order.product_name}
                </TableCell>
                <TableCell className="text-slate-600">{order.quantity}</TableCell>
                <TableCell className="font-medium text-slate-900">
                  ${order.total.toFixed(2)}
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
                <TableCell className="text-right text-slate-600 text-sm">
                  {format(new Date(order.created_at), 'MMM dd')}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
