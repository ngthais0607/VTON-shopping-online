"use client";

import Link from 'next/link';
import { Header } from '@/components/header';
import { MetricCard } from './components/metric-card';
import { RecentOrders } from './components/recent-orders';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  BarChart3,
  CheckCircle2,
  AlertCircle,
  ShoppingCart,
  TrendingUp,
} from 'lucide-react';

import { apiGet } from '@/lib/api';
import { DashboardSkeleton } from './components/dashboard-skeleton';
import { DashboardMetrics, LowStockProductSummary, RecentOrderSummary } from '@/lib/types';
import useSWR from 'swr';
import { RevenueChart } from './components/revenue-chart';
import { OrderStatusChart } from './components/order-status-chart';
import { formatCurrency } from '@/lib/utils';

export default function Dashboard() {
  const {data, error, isLoading: loading, mutate: loadData} = useSWR('/dashboard-summary', async () => Promise.all([
    apiGet<DashboardMetrics>('/dashboard/metrics'),
    apiGet<LowStockProductSummary[]>('/dashboard/low-stock-products'),
    apiGet<RecentOrderSummary[]>('/dashboard/recent-orders'),
  ]), {shouldRetryOnError:false});
  const [dashboardMetrics, lowStockProducts, recentOrders] = data ?? [null, [], []];

  if (error && !dashboardMetrics) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header
          title="Dashboard"
          subtitle="Welcome back! Here&apos;s your ecommerce overview."
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 flex flex-col items-center justify-center space-y-4">
          <div role="alert" className="text-red-500 font-semibold text-lg">{error.message}</div>
          <button
            onClick={() => loadData()}
            className="px-6 py-2.5 bg-primary text-white rounded font-medium hover:bg-primary active:bg-primary/90 transition-all shadow-none"
          >
            Retry
          </button>
        </main>
      </div>
    );
  }

  if (loading || !dashboardMetrics) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title="Dashboard"
        subtitle="Welcome back! Here&apos;s your ecommerce overview."
      />

      <main className="flex-1 p-4 space-y-6 sm:p-6 lg:p-8">
        {/* Metrics Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            title="Total Products"
            value={dashboardMetrics.total_products}
            icon={BarChart3}
          />
          <MetricCard
            title="Active Products"
            value={dashboardMetrics.active_products}
            icon={CheckCircle2}
          />
          <MetricCard
            title="Low Stock"
            value={dashboardMetrics.low_stock}
            icon={AlertCircle}
          />
          <MetricCard
            title="Pending Orders"
            value={dashboardMetrics.pending_orders}
            icon={ShoppingCart}
          />
          <MetricCard
            title="Revenue"
            value={formatCurrency(dashboardMetrics.revenue)}
            icon={TrendingUp}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border border-border bg-secondary/50 px-5 py-4">
          <div><p className="text-xs font-semibold text-primary">Your store, at a glance</p><p className="mt-1 text-sm text-muted-foreground">Review orders and keep your clothing collection ready to shop.</p></div>
          <Link href="/products" className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90">Manage catalog</Link>
        </div>

        {/* Analytics Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RevenueChart data={[]} />
          <OrderStatusChart data={Object.entries(recentOrders.reduce<Record<string,number>>((counts, order) => {counts[order.status]=(counts[order.status] ?? 0)+1; return counts;},{})).map(([status,count])=>({status,count}))} />
        </div>

        {/* Recent Orders */}
        <RecentOrders orders={recentOrders} />

        {/* Low Stock Products */}
        <Card>
          <div className="p-6 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">
              Low Stock Products
            </h2>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border bg-background">
                  <TableHead className="text-muted-foreground">Product Name</TableHead>
                  <TableHead className="text-muted-foreground">Category</TableHead>
                  <TableHead className="text-muted-foreground">Available</TableHead>
                  <TableHead className="text-muted-foreground">Reserved</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lowStockProducts.length === 0 && <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">No low-stock products.</TableCell></TableRow>}
                {lowStockProducts.map((product) => (
                  <TableRow key={product.id} className="border-border">
                    <TableCell className="font-medium text-foreground">
                      {product.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {product.category?.name || 'N/A'}
                    </TableCell>
                    <TableCell className="text-foreground font-medium">
                      {product.available_stock}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {product.reserved_quantity}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">
                        Low Stock
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </main>
    </div>
  );
}
