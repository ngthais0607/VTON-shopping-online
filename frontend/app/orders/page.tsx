// Path: frontend/app/orders/page.tsx
"use client";
import { displayDate,formatCurrency } from '@/lib/utils';


import { Edit2,Eye } from "lucide-react";
import { useEffect,useState } from "react";

import { Header } from "@/components/header";
import { PaginationControls } from '@/components/pagination-controls';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
Dialog,
DialogContent,
DialogDescription,
DialogHeader,
DialogTitle,
} from "@/components/ui/dialog";
import {
Table,
TableBody,
TableCell,
TableHead,
TableHeader,
TableRow,
} from "@/components/ui/table";
import { useOrders } from "@/hooks/use-orders";
import { Order } from "@/lib/types";

import { ExportCSVButton } from "./components/export-csv-button";
import { getNextStatuses,QuickStatusModal } from "./components/quick-status-modal";

function getStatusColor(status: string) {
  switch (status?.toLowerCase()) {
    case "paid":
    case "completed":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "pending":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "confirmed":
    case "shipped":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "delivered":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "cancelled":
      return "bg-rose-50 text-rose-700 border-rose-200";
    case "expired":
      return "bg-secondary text-muted-foreground border-border";
    default:
      return "bg-background text-foreground border-border";
  }
}

function getPaymentStatusColor(status: string) {
  switch (status?.toLowerCase()) {
    case "completed":
    case "paid":
      return "bg-emerald-100 text-emerald-800 border-emerald-300";
    case "pending":
      return "bg-amber-100 text-amber-800 border-amber-300";
    case "failed":
    case "expired":
    case "cancelled":
      return "bg-rose-100 text-rose-800 border-rose-300";
    default:
      return "bg-secondary text-foreground border-border";
  }
}

export default function OrdersPage() {
  const [page, setPage] = useState(1);
  const { orders, total, error, isLoading: loading, mutate } = useOrders({page});
  useEffect(() => { if (!loading && !error && page > 1 && orders.length === 0) setPage(page - 1); }, [loading, error, page, orders.length]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Orders" subtitle="Track and manage all customer orders" />

      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
          <h2 className="text-lg font-bold text-foreground">All Orders ({total})</h2>
          <ExportCSVButton orders={orders} />
        </div>

        {error && <p role="alert">{error.message}<button onClick={()=>mutate()}>Retry</button></p>}
        <PaginationControls page={page} pageSize={10} total={total} onPageChange={setPage} disabled={loading}/>
        {loading ? (
          <Card className="p-8 text-center text-muted-foreground">
            <span className="flex items-center justify-center gap-2">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />
              Loading orders...
            </span>
          </Card>
        ) : (
          <Card className="overflow-hidden border border-border">
            <Table>
              <TableHeader>
                <TableRow className="border-border bg-background">
                  <TableHead className="text-muted-foreground">Order</TableHead>
                  <TableHead className="text-muted-foreground">Customer</TableHead>
                  <TableHead className="text-muted-foreground">Product</TableHead>
                  <TableHead className="text-right text-muted-foreground">Total</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-right text-muted-foreground">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => {
                  const orderTotal = order.total ?? order.total_amount ?? 0;
                  const quantity = order.quantity ?? (order.items ? order.items.reduce((acc, it) => acc + it.quantity, 0) : 1);
                  const productName = order.product_name || (order.items && order.items.length > 0 ? (order.items.length === 1 ? order.items[0].product_name : `${order.items[0].product_name} (+${order.items.length - 1})`) : "N/A");
                  const canUpdate = getNextStatuses(order).length > 0;
                  return (
                    <TableRow key={order.id} className="border-border hover:bg-background/50">
                      <TableCell>
                        <div className="font-semibold text-foreground">#{order.id}</div>
                        <div className="text-xs text-muted-foreground">
                          {order.created_at ? displayDate(order.created_at, "MMM dd, yyyy") : "N/A"}
                        </div>
                      </TableCell>
                      <TableCell className="text-foreground">
                        <div className="max-w-[10rem] truncate">{order.customer_name || "Guest"}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <div className="max-w-[16rem] truncate" title={productName}>{productName}</div>
                        <div className="text-xs">Qty {quantity}</div>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-foreground whitespace-nowrap">
                        {formatCurrency(orderTotal, order.currency)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`capitalize font-medium ${getStatusColor(order.status)}`}
                        >
                          {order.status}
                        </Badge>
                        <div className="mt-1 text-xs text-muted-foreground whitespace-nowrap">
                          {order.payment_method === "cod" ? "COD" : "VietQR"} · <span className="capitalize">{order.payment_status}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedOrder(order);
                              setViewDialogOpen(true);
                            }}
                          >
                            <Eye className="w-4 h-4 mr-1.5" /> View
                          </Button>
                          <Button
                            size="sm"
                            disabled={!canUpdate}
                            title={canUpdate ? undefined : "This order can no longer be changed"}
                            onClick={() => {
                              setSelectedOrder(order);
                              setStatusDialogOpen(true);
                            }}
                          >
                            <Edit2 className="w-4 h-4 mr-1.5" /> Update
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </main>

      {/* VIEW ORDER DETAILS DIALOG */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="admin-dialog max-w-md">
          <DialogHeader>
            <DialogTitle>Order #{selectedOrder?.id} Details</DialogTitle>
            <DialogDescription>
              Created on {selectedOrder?.created_at ? displayDate(selectedOrder.created_at, "PPP p") : "N/A"}
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4 pt-2">
              <div className="rounded bg-background p-4 border text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer ID:</span>
                  <span className="font-medium text-foreground">#{selectedOrder.user_id}</span>
                </div>
                {selectedOrder.items && selectedOrder.items.length > 0 ? (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-xs font-semibold text-muted-foreground uppercase">Items ({selectedOrder.items.length})</span>
                    {selectedOrder.items.map((it, idx) => (
                      <div key={idx} className="flex justify-between items-start text-xs py-1.5 border-b last:border-b-0">
                        <div>
                          <span className="text-foreground font-medium">{it.product_name}</span>
                          {(it.size || it.color_name) && (
                            <span className="text-muted-foreground block text-[11px]">
                              {[it.size && `Size: ${it.size}`, it.color_name && `Color: ${it.color_name}`].filter(Boolean).join(" · ")}
                            </span>
                          )}
                          {it.sku && <span className="text-muted-foreground font-mono block text-[10px]">SKU: {it.sku}</span>}
                          <span className="text-muted-foreground block text-[11px]">Qty: {it.quantity}</span>
                        </div>
                        <span className="font-medium text-foreground">{formatCurrency(it.subtotal ?? (it.unit_price * it.quantity), selectedOrder.currency)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Product Name:</span>
                      <span className="font-medium text-foreground">{selectedOrder.product_name || "N/A"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Unit Price:</span>
                      <span className="font-medium text-foreground">{formatCurrency(selectedOrder.unit_price ?? 0, selectedOrder.currency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Quantity:</span>
                      <span className="font-medium text-foreground">{selectedOrder.quantity ?? 1}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between border-t pt-2 mt-2">
                  <span className="font-semibold text-foreground">Total Amount:</span>
                  <span className="font-bold text-foreground">{formatCurrency(selectedOrder.total ?? selectedOrder.total_amount ?? 0, selectedOrder.currency)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Statuses</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="p-3 rounded border bg-background">
                    <div className="text-xs text-muted-foreground mb-1">Order Status</div>
                    <Badge variant="outline" className={`capitalize ${getStatusColor(selectedOrder.status)}`}>
                      {selectedOrder.status}
                    </Badge>
                  </div>
                  <div className="p-3 rounded border bg-background">
                    <div className="text-xs text-muted-foreground mb-1">Payment Status</div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border capitalize ${getPaymentStatusColor(selectedOrder.payment_status)}`}>
                      {selectedOrder.payment_status}
                    </span>
                  </div>
                </div>
              </div>

              {/* TIMESTAMPS */}
              <div className="space-y-1.5 text-xs text-muted-foreground pt-2 border-t">
                {selectedOrder.expires_at && selectedOrder.status === "pending" && (
                  <div className="flex justify-between text-amber-600">
                    <span>Expires At:</span>
                    <span className="font-medium">{displayDate(selectedOrder.expires_at, "yyyy-MM-dd HH:mm")}</span>
                  </div>
                )}
                {selectedOrder.paid_at && (
                  <div className="flex justify-between">
                    <span>Paid At:</span>
                    <span className="font-medium text-green-600">{displayDate(selectedOrder.paid_at, "yyyy-MM-dd HH:mm")}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* QUICK STATUS UPDATE MODAL */}
      <QuickStatusModal
        order={selectedOrder}
        isOpen={statusDialogOpen}
        onClose={() => setStatusDialogOpen(false)}
        onStatusUpdated={mutate}
      />
    </div>
  );
}
