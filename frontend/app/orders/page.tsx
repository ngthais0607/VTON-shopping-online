// Path: frontend/app/orders/page.tsx
"use client";
import { displayDate, formatCurrency } from '@/lib/utils';


import { useEffect, useState } from "react";
import { format } from "date-fns";
import { MoreVertical, Eye, Edit2 } from "lucide-react";

import { PaginationControls } from '@/components/pagination-controls';
import { useOrders } from "@/hooks/use-orders";
import { Order } from "@/lib/types";
import { Header } from "@/components/header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { ExportCSVButton } from "./components/export-csv-button";
import { QuickStatusModal } from "./components/quick-status-modal";

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
      return "bg-slate-100 text-slate-600 border-slate-200";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
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
      return "bg-slate-100 text-slate-800 border-slate-300";
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
      <Header title="Orders" subtitle="Track and manage all customer orders">
        <ExportCSVButton orders={orders} />
      </Header>

      <main className="flex-1 p-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-slate-800">All Orders ({total})</h2>
          <ExportCSVButton orders={orders} />
        </div>

        {error && <p role="alert">{error.message}<button onClick={()=>mutate()}>Retry</button></p>}
        <PaginationControls page={page} pageSize={10} total={total} onPageChange={setPage} disabled={loading}/>
        {loading ? (
          <Card className="p-8 text-center text-slate-600">
            <span className="flex items-center justify-center gap-2">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
              Loading orders...
            </span>
          </Card>
        ) : (
          <Card className="overflow-hidden border border-slate-200">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-200 bg-slate-50">
                  <TableHead className="text-slate-600">Order ID</TableHead>
                  <TableHead className="text-slate-600">Product</TableHead>
                  <TableHead className="text-slate-600">Quantity</TableHead>
                  <TableHead className="text-slate-600">Total Amount</TableHead>
                  <TableHead className="text-slate-600">Status</TableHead>
                  <TableHead className="text-slate-600">Payment Status</TableHead>
                  <TableHead className="text-right text-slate-600">Date</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => {
                  const orderTotal = order.total ?? order.total_amount ?? 0;
                  return (
                    <TableRow key={order.id} className="border-slate-200 hover:bg-slate-50/50">
                      <TableCell className="font-semibold text-slate-900">
                        #{order.id}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {order.product_name || (order.items && order.items.length > 0 ? (order.items.length === 1 ? order.items[0].product_name : `${order.items[0].product_name} (+${order.items.length - 1})`) : "N/A")}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {order.quantity ?? (order.items ? order.items.reduce((acc, it) => acc + it.quantity, 0) : 1)}
                      </TableCell>
                      <TableCell className="font-semibold text-slate-900">
                        {formatCurrency(orderTotal, order.currency)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`capitalize font-medium ${getStatusColor(order.status)}`}
                        >
                          {order.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border capitalize ${getPaymentStatusColor(
                            order.payment_status,
                          )}`}
                        >
                          {order.payment_status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-slate-600 text-sm">
                        {order.created_at ? displayDate(order.created_at, "MMM dd, yyyy") : "N/A"}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedOrder(order);
                                setViewDialogOpen(true);
                              }}
                            >
                              <Eye className="w-4 h-4 mr-2" /> View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedOrder(order);
                                setStatusDialogOpen(true);
                              }}
                            >
                              <Edit2 className="w-4 h-4 mr-2" /> Update Status
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Order #{selectedOrder?.id} Details</DialogTitle>
            <DialogDescription>
              Created on {selectedOrder?.created_at ? displayDate(selectedOrder.created_at, "PPP p") : "N/A"}
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4 pt-2">
              <div className="rounded-lg bg-slate-50 p-4 border text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Customer ID:</span>
                  <span className="font-medium text-slate-900">#{selectedOrder.user_id}</span>
                </div>
                {selectedOrder.items && selectedOrder.items.length > 0 ? (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-xs font-semibold text-slate-500 uppercase">Items ({selectedOrder.items.length})</span>
                    {selectedOrder.items.map((it, idx) => (
                      <div key={idx} className="flex justify-between items-start text-xs py-1.5 border-b last:border-b-0">
                        <div>
                          <span className="text-slate-800 font-medium">{it.product_name}</span>
                          {(it.size || it.color_name) && (
                            <span className="text-slate-500 block text-[11px]">
                              {[it.size && `Size: ${it.size}`, it.color_name && `Màu: ${it.color_name}`].filter(Boolean).join(" · ")}
                            </span>
                          )}
                          {it.sku && <span className="text-slate-400 font-mono block text-[10px]">SKU: {it.sku}</span>}
                          <span className="text-slate-500 block text-[11px]">Qty: {it.quantity}</span>
                        </div>
                        <span className="font-medium text-slate-900">{formatCurrency(it.subtotal ?? (it.unit_price * it.quantity), selectedOrder.currency)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Product Name:</span>
                      <span className="font-medium text-slate-900">{selectedOrder.product_name || "N/A"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Unit Price:</span>
                      <span className="font-medium text-slate-900">{formatCurrency(selectedOrder.unit_price ?? 0, selectedOrder.currency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Quantity:</span>
                      <span className="font-medium text-slate-900">{selectedOrder.quantity ?? 1}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between border-t pt-2 mt-2">
                  <span className="font-semibold text-slate-700">Total Amount:</span>
                  <span className="font-bold text-slate-900">{formatCurrency(selectedOrder.total ?? selectedOrder.total_amount ?? 0, selectedOrder.currency)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Statuses</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="p-3 rounded border bg-slate-50">
                    <div className="text-xs text-slate-500 mb-1">Order Status</div>
                    <Badge variant="outline" className={`capitalize ${getStatusColor(selectedOrder.status)}`}>
                      {selectedOrder.status}
                    </Badge>
                  </div>
                  <div className="p-3 rounded border bg-slate-50">
                    <div className="text-xs text-slate-500 mb-1">Payment Status</div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border capitalize ${getPaymentStatusColor(selectedOrder.payment_status)}`}>
                      {selectedOrder.payment_status}
                    </span>
                  </div>
                </div>
              </div>

              {/* TIMESTAMPS */}
              <div className="space-y-1.5 text-xs text-slate-500 pt-2 border-t">
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
