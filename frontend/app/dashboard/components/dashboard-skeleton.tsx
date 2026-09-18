import { Header } from '@/components/header';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function DashboardSkeleton() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title="Dashboard"
        subtitle="Welcome back! Here's your ecommerce overview."
      />

      <main className="flex-1 p-8 space-y-8">
        {/* Metrics Grid Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          {[...Array(5)].map((_, i) => (
            <Card key={i} className="p-6 space-y-4">
              <Skeleton className="h-4 w-24 bg-slate-200" />
              <Skeleton className="h-8 w-16 bg-slate-200" />
              <Skeleton className="h-4 w-32 bg-slate-200" />
            </Card>
          ))}
        </div>

        {/* Recent Orders Table Skeleton */}
        <Card>
          <div className="p-6 border-b border-border">
            <Skeleton className="h-6 w-32 bg-slate-200" />
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
                {[...Array(5)].map((_, i) => (
                  <TableRow key={i} className="border-slate-200">
                    <TableCell>
                      <Skeleton className="h-4 w-40 bg-slate-100" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-8 bg-slate-100" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-12 bg-slate-100" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-16 rounded-full bg-slate-100" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-20 rounded-full bg-slate-100" />
                    </TableCell>
                    <TableCell className="text-right flex justify-end">
                      <Skeleton className="h-4 w-12 bg-slate-100" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* Low Stock Products Table Skeleton */}
        <Card>
          <div className="p-6 border-b border-border">
            <Skeleton className="h-6 w-40 bg-slate-200" />
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
                {[...Array(3)].map((_, i) => (
                  <TableRow key={i} className="border-slate-200">
                    <TableCell>
                      <Skeleton className="h-4 w-48 bg-slate-100" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24 bg-slate-100" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-10 bg-slate-100" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-8 bg-slate-100" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-20 rounded-full bg-slate-100" />
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
