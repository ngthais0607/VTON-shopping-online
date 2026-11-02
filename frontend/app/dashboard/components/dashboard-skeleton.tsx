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

      <main className="flex-1 p-4 space-y-6 sm:p-6 lg:p-8">
        {/* Metrics Grid Skeleton */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <Card key={i} className="p-6 space-y-4">
              <Skeleton className="h-4 w-24 bg-muted" />
              <Skeleton className="h-8 w-16 bg-muted" />
              <Skeleton className="h-4 w-32 bg-muted" />
            </Card>
          ))}
        </div>

        {/* Recent Orders Table Skeleton */}
        <Card>
          <div className="p-6 border-b border-border">
            <Skeleton className="h-6 w-32 bg-muted" />
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
                {[...Array(5)].map((_, i) => (
                  <TableRow key={i} className="border-border">
                    <TableCell>
                      <Skeleton className="h-4 w-40 bg-secondary" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-8 bg-secondary" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-12 bg-secondary" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-16 rounded-full bg-secondary" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-20 rounded-full bg-secondary" />
                    </TableCell>
                    <TableCell className="text-right flex justify-end">
                      <Skeleton className="h-4 w-12 bg-secondary" />
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
            <Skeleton className="h-6 w-40 bg-muted" />
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
                {[...Array(3)].map((_, i) => (
                  <TableRow key={i} className="border-border">
                    <TableCell>
                      <Skeleton className="h-4 w-48 bg-secondary" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24 bg-secondary" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-10 bg-secondary" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-8 bg-secondary" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-20 rounded-full bg-secondary" />
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
