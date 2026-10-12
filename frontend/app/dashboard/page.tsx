"use client";

import { useEffect, useState, useCallback } from "react";
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
import { getAvailableStock } from '@/lib/inventory';

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
        <main className="flex-1 p-8 flex flex-col items-center justify-center space-y-4">
          <div role="alert" className="text-red-500 font-semibold text-lg">{error.message}</div>
          <button
            onClick={() => loadData()}
            className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 active:scale-95 transition-all shadow-md"
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

      <main className="flex-1 p-8 space-y-8">
        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
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
            value={`$${dashboardMetrics.revenue.toLocaleString('en-US', {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            })}`}
            icon={TrendingUp}
          />
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
            <h2 className="text-lg font-semibold text-slate-900">
              Low Stock Products
            </h2>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-200 bg-slate-50">
                  <TableHead className="text-slate-600">Product Name</TableHead>
                  <TableHead className="text-slate-600">Category</TableHead>
                  <TableHead className="text-slate-600">Available</TableHead>
                  <TableHead className="text-slate-600">Reserved</TableHead>
                  <TableHead className="text-slate-600">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lowStockProducts.map((product) => (
                  <TableRow key={product.id} className="border-slate-200">
                    <TableCell className="font-medium text-slate-900">
                      {product.name}
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {product.category?.name || 'N/A'}
                    </TableCell>
                    <TableCell className="text-slate-900 font-medium">
                      {product.available_stock}
                    </TableCell>
                    <TableCell className="text-slate-600">
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
