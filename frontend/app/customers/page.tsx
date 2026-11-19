"use client";
import { displayDate,formatCurrency } from '@/lib/utils';

import { PaginationControls } from '@/components/pagination-controls';
import { useUsers } from '@/hooks/use-users';
import { apiDelete,apiGet } from "@/lib/api";
import { Order,Page,User } from "@/lib/types";
import { useEffect,useState } from "react";

import { Header } from "@/components/header";
import { Avatar,AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle } from "@/components/ui/dialog";
import {
Table,
TableBody,
TableCell,
TableHead,
TableHeader,
TableRow,
} from "@/components/ui/table";
import { Calendar,Mail,Search,ShieldAlert,ShoppingBag,UserCheck,Users } from "lucide-react";

export default function CustomersPage() {
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const {users, total, isLoading: loading, error, mutate: loadUsers} = useUsers({page, search:searchQuery});
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // States cho các Dialogs
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const [ordersOpen, setOrdersOpen] = useState(false);
  const [userOrders, setUserOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Tải danh sách khách hàng
  useEffect(() => { if (!loading && !error && page > 1 && users.length === 0) setPage(page - 1); }, [loading, error, page, users.length]);

  const handleDeactivate = async (userId: number) => {
    if (confirm("Are you sure you want to deactivate this customer account?")) {
      try {
        await apiDelete(`/users/${userId}`);
        setNotice("Customer deactivated.");
        loadUsers(); // Tải lại danh sách
      } catch (err) {
        setNotice(null);
        alert("Failed to deactivate customer.");
      }
    }
  };

  // Tải đơn hàng của một Customer cụ thể
  const handleViewOrders = async (user: User) => {
    setSelectedUser(user);
    setOrdersOpen(true);
    setLoadingOrders(true);
    setOrdersError(null);
    setUserOrders([]);
    try {
      const data = await apiGet<Page<Order> | Order[]>(`/orders/user/${user.id}`);
      setUserOrders(Array.isArray(data) ? data : (data?.items ?? []));
    } catch (err) {
      setOrdersError(err instanceof Error ? err.message : "Failed to load customer orders");
    } finally {
      setLoadingOrders(false);
    }
  };

  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    const first = firstName?.charAt(0) || "";
    const last = lastName?.charAt(0) || "";
    return (first + last).toUpperCase() || "U";
  };

  // Hàm sinh màu Gradient ngẫu nhiên đẹp mắt cho Avatar dựa theo ID hoặc Tên
  const getGradientClass = (username: string) => {
    const hash = username.split("").reduce((acc, char) => char.charCodeAt(0) + acc, 0);
    const gradients = [
      "from-indigo-500 to-purple-500 text-white",
      "from-blue-500 to-cyan-500 text-white",
      "from-emerald-400 to-teal-600 text-white",
      "from-rose-500 to-orange-500 text-white",
      "from-fuchsia-500 to-pink-500 text-white",
    ];
    return gradients[hash % gradients.length];
  };

  // Lọc danh sách theo thanh tìm kiếm
  const filteredUsers = users;

  return (
    <div className="flex flex-col min-h-screen bg-background/50">
      <Header title="Customers" subtitle="Manage and monitor your registered customer base" />

      <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full">
        {error && (
          <p role="alert" className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {error.message}
            <Button variant="outline" size="sm" onClick={() => loadUsers()}>Retry</Button>
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{notice}</p>
        )}
        {/* Thanh tìm kiếm & Stats nhanh */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              aria-label="Search customers"
              placeholder="Search customer by name, email..."
              value={searchQuery}
              onChange={(e) => {setSearchQuery(e.target.value); setPage(1);}}
              className="w-full pl-10 pr-4 py-2 border border-border rounded-md bg-white text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary transition-all"
            />
          </div>

          <div className="flex gap-4 items-center self-end md:self-auto">
            <div className="bg-white border border-border rounded-md px-4 py-2 flex items-center gap-3 shadow-none">
              <div className="p-1.5 rounded bg-secondary text-primary">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Total Customers</p>
                <p className="text-base font-bold text-foreground">{total}</p>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <Card className="p-12 text-center text-muted-foreground border border-border shadow-none bg-white">
            <span className="flex flex-col items-center justify-center gap-3">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
              <span className="text-sm font-medium text-muted-foreground">Loading your customer base...</span>
            </span>
          </Card>
        ) : (
          <Card className="bg-white border border-border shadow-none rounded overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border bg-background/70 hover:bg-background/70">
                    <TableHead className="text-muted-foreground font-semibold py-4 pl-6">Customer</TableHead>
                    <TableHead className="text-muted-foreground font-semibold py-4">Email Address</TableHead>
                    <TableHead className="text-muted-foreground font-semibold py-4">Username</TableHead>
                    <TableHead className="text-muted-foreground font-semibold py-4">Joined Date</TableHead>
                    <TableHead className="py-4 pr-6 text-right text-muted-foreground font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id} className="border-border hover:bg-background/30 transition-all group">
                      <TableCell className="py-4 pl-6">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9 ring-2 ring-white shadow-none transition-transform duration-300 group-">
                            <AvatarFallback className={`bg-gradient-to-tr font-semibold text-xs tracking-wider ${getGradientClass(user.username)}`}>
                              {getInitials(user.first_name, user.last_name)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                              {user.first_name} {user.last_name}
                            </div>
                            <span className={`inline-flex items-center mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${user.role === "admin" ? "bg-amber-50 text-amber-700 border-amber-100" : "bg-secondary text-muted-foreground border-border"}`}>
                              {user.role === "admin" ? "Admin" : "Customer"}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground font-medium text-sm">
                        {user.email}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm font-medium">
                        @{user.username}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs font-semibold">
                        {displayDate(user.created_at, "MMM dd, yyyy")}
                      </TableCell>
                      <TableCell className="py-4 pr-6">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { setSelectedUser(user); setProfileOpen(true); }}
                          >
                            <UserCheck className="w-4 h-4 mr-1.5" /> Profile
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleViewOrders(user)}>
                            <ShoppingBag className="w-4 h-4 mr-1.5" /> Orders
                          </Button>
                          {user.role !== "admin" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Deactivate ${user.username}`}
                              title="Deactivate account"
                              className="text-red-600 hover:bg-red-50 hover:text-red-700"
                              onClick={() => handleDeactivate(user.id)}
                            >
                              <ShieldAlert className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredUsers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-muted-foreground font-medium">
                        {searchQuery ? <>No customers found matching &quot;{searchQuery}&quot;</> : "No customers yet."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}

        {total > 20 && (
          <PaginationControls page={page} pageSize={20} total={total} onPageChange={setPage} disabled={loading}/>
        )}
      </main>

      {/* 1. DIALOG VIEW PROFILE */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="admin-dialog max-w-md bg-white border border-border rounded shadow-none overflow-hidden p-0">
          <div className="h-20 bg-gradient-to-r from-indigo-500 to-purple-600 w-full" />

          {selectedUser && (
            <div className="px-6 pb-6 pt-0 relative space-y-6">
              <div className="flex items-end gap-4 -mt-8 mb-4">
                <Avatar className="h-20 w-20 ring-4 ring-white shadow-none">
                  <AvatarFallback className={`bg-gradient-to-tr font-bold text-lg tracking-wider ${getGradientClass(selectedUser.username)}`}>
                    {getInitials(selectedUser.first_name, selectedUser.last_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="pb-1">
                  <h3 className="text-lg font-bold text-foreground leading-tight">
                    {selectedUser.first_name} {selectedUser.last_name}
                  </h3>
                  <p className="text-xs text-muted-foreground font-medium">@{selectedUser.username}</p>
                </div>
              </div>

              <div className="space-y-4 border-t border-border pt-4">
                <div className="flex items-center gap-3 text-muted-foreground text-sm">
                  <div className="p-2 rounded bg-background text-muted-foreground">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Email Address</p>
                    <p className="font-semibold text-foreground">{selectedUser.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-muted-foreground text-sm">
                  <div className="p-2 rounded bg-background text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Date Joined</p>
                    <p className="font-semibold text-foreground">{displayDate(selectedUser.created_at, "MMMM dd, yyyy")}</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button variant="outline" className="rounded-md border-border" onClick={() => setProfileOpen(false)}>
                  Close Window
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 2. DIALOG VIEW ORDERS */}
      <Dialog open={ordersOpen} onOpenChange={setOrdersOpen}>
        <DialogContent className="admin-dialog max-w-2xl bg-white border border-border rounded shadow-none overflow-hidden p-6">
          <DialogHeader className="border-b border-border pb-4">
            <DialogTitle className="text-lg font-bold text-foreground flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-primary" />
              Customer Orders History
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              List of all orders placed by <span className="font-semibold text-foreground">{selectedUser?.first_name} {selectedUser?.last_name}</span>
            </DialogDescription>
          </DialogHeader>

          {ordersError ? <p role="alert">{ordersError}</p> : loadingOrders ? (
            <div className="py-12 text-center text-muted-foreground">
              <span className="flex flex-col items-center justify-center gap-2">
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
                <span className="text-xs font-semibold text-muted-foreground mt-2">Loading orders...</span>
              </span>
            </div>
          ) : (
            <div className="space-y-6 mt-4">
              <div className="max-h-[300px] overflow-y-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border bg-background/70 hover:bg-background/70">
                      <TableHead className="text-[11px] font-bold text-muted-foreground py-3 pl-4">Order ID</TableHead>
                      <TableHead className="text-[11px] font-bold text-muted-foreground py-3">Product Name</TableHead>
                      <TableHead className="text-[11px] font-bold text-muted-foreground py-3">Qty</TableHead>
                      <TableHead className="text-[11px] font-bold text-muted-foreground py-3">Total Amount</TableHead>
                      <TableHead className="text-[11px] font-bold text-muted-foreground py-3">Status</TableHead>
                      <TableHead className="text-[11px] font-bold text-muted-foreground py-3 text-right pr-4">Order Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {userOrders.map((order) => (
                      <TableRow key={order.id} className="border-border hover:bg-background/30 text-sm">
                        <TableCell className="font-bold text-foreground py-3 pl-4">#{order.id}</TableCell>
                        <TableCell className="font-medium text-foreground">{order.product_name}</TableCell>
                        <TableCell className="text-muted-foreground font-semibold">{order.quantity}</TableCell>
                        <TableCell className="font-bold text-foreground">{formatCurrency(order.total, order.currency)}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold capitalize border ${order.status === 'paid'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                              : order.status === 'pending'
                                ? 'bg-amber-50 text-amber-700 border-amber-100'
                                : 'bg-rose-50 text-rose-700 border-rose-100'
                            }`}>
                            {order.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground text-xs font-semibold pr-4">
                          {displayDate(order.created_at, "yyyy-MM-dd")}
                        </TableCell>
                      </TableRow>
                    ))}
                    {userOrders.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-muted-foreground font-medium">
                          No order history found for this customer.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end border-t border-border pt-4">
                <Button variant="outline" className="rounded-md border-border" onClick={() => setOrdersOpen(false)}>
                  Close History
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
