"use client";
import { useEffect, useState } from "react";
import { apiGet, apiDelete } from "@/lib/api";
import { User, Order } from "@/lib/types";

import { Header } from "@/components/header";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MoreVertical, Mail, Calendar, ShoppingBag, UserCheck, ShieldAlert, ArrowRight, Search, Users } from "lucide-react";
import { format } from "date-fns";

export default function CustomersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // States cho các Dialogs
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const [ordersOpen, setOrdersOpen] = useState(false);
  const [userOrders, setUserOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Tải danh sách khách hàng
  async function loadUsers() {
    try {
      setLoading(true);
      const data = await apiGet<User[]>("/users/");
      setUsers(data);
    } catch (err) {
      console.error("Failed to load users", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  // API Vô hiệu hóa tài khoản (Soft delete)
  const handleDeactivate = async (userId: number) => {
    if (confirm("Are you sure you want to deactivate this customer account?")) {
      try {
        await apiDelete(`/users/${userId}`);
        alert("Customer deactivated successfully.");
        loadUsers(); // Tải lại danh sách
      } catch (err) {
        alert("Failed to deactivate customer.");
      }
    }
  };

  // Tải đơn hàng của một Customer cụ thể
  const handleViewOrders = async (user: User) => {
    setSelectedUser(user);
    setOrdersOpen(true);
    setLoadingOrders(true);
    try {
      const data = await apiGet<Order[]>(`/orders/user/${user.id}`);
      setUserOrders(data);
    } catch (err) {
      console.error("Failed to load customer orders", err);
    } finally {
      setLoadingOrders(false);
    }
  };

  const getInitials = (firstName?: string, lastName?: string) => {
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
  const filteredUsers = users.filter((u) => {
    const fullName = `${u.first_name || ""} ${u.last_name || ""}`.toLowerCase();
    const email = (u.email || "").toLowerCase();
    const username = (u.username || "").toLowerCase();
    const query = searchQuery.toLowerCase();
    return fullName.includes(query) || email.includes(query) || username.includes(query);
  });

  return (
    <div className="flex flex-col min-h-screen bg-slate-50/50">
      <Header title="Customers" subtitle="Manage and monitor your registered customer base" />

      <main className="flex-1 p-8 space-y-6 max-w-7xl mx-auto w-full">
        {/* Thanh tìm kiếm & Stats nhanh */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search customer by name, email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all"
            />
          </div>

          <div className="flex gap-4 items-center self-end md:self-auto">
            <div className="bg-white border border-slate-100 rounded-xl px-4 py-2 flex items-center gap-3 shadow-sm">
              <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Customers</p>
                <p className="text-base font-bold text-slate-900">{users.length}</p>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <Card className="p-12 text-center text-slate-600 border border-slate-100 shadow-sm bg-white">
            <span className="flex flex-col items-center justify-center gap-3">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" />
              <span className="text-sm font-medium text-slate-500">Loading your customer base...</span>
            </span>
          </Card>
        ) : (
          <Card className="bg-white border border-slate-100 shadow-sm rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-100 bg-slate-50/70 hover:bg-slate-50/70">
                    <TableHead className="text-slate-500 font-semibold py-4 pl-6">Customer</TableHead>
                    <TableHead className="text-slate-500 font-semibold py-4">Email Address</TableHead>
                    <TableHead className="text-slate-500 font-semibold py-4">Username</TableHead>
                    <TableHead className="text-slate-500 font-semibold py-4">Joined Date</TableHead>
                    <TableHead className="w-14 py-4"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id} className="border-slate-100 hover:bg-slate-50/30 transition-all group">
                      <TableCell className="py-4 pl-6">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9 ring-2 ring-white shadow-sm transition-transform duration-300 group-hover:scale-105">
                            <AvatarFallback className={`bg-gradient-to-tr font-semibold text-xs tracking-wider ${getGradientClass(user.username)}`}>
                              {getInitials(user.first_name, user.last_name)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                              {user.first_name} {user.last_name}
                            </div>
                            <span className="inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                              <span className="w-1 h-1 rounded-full bg-emerald-500" /> Active
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-600 font-medium text-sm">
                        {user.email}
                      </TableCell>
                      <TableCell className="text-slate-500 text-sm font-medium">
                        @{user.username}
                      </TableCell>
                      <TableCell className="text-slate-500 text-xs font-semibold">
                        {format(new Date(user.created_at), "MMM dd, yyyy")}
                      </TableCell>
                      <TableCell className="py-4 pr-6">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-slate-100 rounded-lg">
                              <MoreVertical className="w-4 h-4 text-slate-500" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40 p-1.5 rounded-xl border border-slate-100 shadow-md bg-white">
                            <DropdownMenuItem
                              className="rounded-lg text-slate-700 hover:bg-slate-50 text-sm"
                              onClick={() => {
                                setSelectedUser(user);
                                setProfileOpen(true);
                              }}
                            >
                              <UserCheck className="w-4 h-4 mr-2 text-slate-400" />
                              View Profile
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="rounded-lg text-slate-700 hover:bg-slate-50 text-sm"
                              onClick={() => handleViewOrders(user)}
                            >
                              <ShoppingBag className="w-4 h-4 mr-2 text-slate-400" />
                              View Orders
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="rounded-lg text-red-600 focus:text-red-700 focus:bg-red-50 text-sm"
                              onClick={() => handleDeactivate(user.id)}
                            >
                              <ShieldAlert className="w-4 h-4 mr-2 text-red-400" />
                              Deactivate
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredUsers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-slate-400 font-medium">
                        No customers found matching &quot;{searchQuery}&quot;
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}
      </main>

      {/* 1. DIALOG VIEW PROFILE */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="max-w-md bg-white border border-slate-100 rounded-2xl shadow-xl overflow-hidden p-0">
          <div className="h-20 bg-gradient-to-r from-indigo-500 to-purple-600 w-full" />

          {selectedUser && (
            <div className="px-6 pb-6 pt-0 relative space-y-6">
              <div className="flex items-end gap-4 -mt-8 mb-4">
                <Avatar className="h-20 w-20 ring-4 ring-white shadow-md">
                  <AvatarFallback className={`bg-gradient-to-tr font-bold text-lg tracking-wider ${getGradientClass(selectedUser.username)}`}>
                    {getInitials(selectedUser.first_name, selectedUser.last_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="pb-1">
                  <h3 className="text-lg font-bold text-slate-900 leading-tight">
                    {selectedUser.first_name} {selectedUser.last_name}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">@{selectedUser.username}</p>
                </div>
              </div>

              <div className="space-y-4 border-t border-slate-100 pt-4">
                <div className="flex items-center gap-3 text-slate-600 text-sm">
                  <div className="p-2 rounded-lg bg-slate-50 text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Email Address</p>
                    <p className="font-semibold text-slate-800">{selectedUser.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-slate-600 text-sm">
                  <div className="p-2 rounded-lg bg-slate-50 text-slate-400">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Date Joined</p>
                    <p className="font-semibold text-slate-800">{format(new Date(selectedUser.created_at), "MMMM dd, yyyy")}</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <Button variant="outline" className="rounded-xl border-slate-200" onClick={() => setProfileOpen(false)}>
                  Close Window
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 2. DIALOG VIEW ORDERS */}
      <Dialog open={ordersOpen} onOpenChange={setOrdersOpen}>
        <DialogContent className="max-w-2xl bg-white border border-slate-100 rounded-2xl shadow-xl overflow-hidden p-6">
          <DialogHeader className="border-b border-slate-100 pb-4">
            <DialogTitle className="text-lg font-bold text-slate-950 flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-indigo-500" />
              Customer Orders History
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              List of all orders placed by <span className="font-semibold text-slate-700">{selectedUser?.first_name} {selectedUser?.last_name}</span>
            </DialogDescription>
          </DialogHeader>

          {loadingOrders ? (
            <div className="py-12 text-center text-slate-500">
              <span className="flex flex-col items-center justify-center gap-2">
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" />
                <span className="text-xs font-semibold text-slate-400 mt-2">Loading orders...</span>
              </span>
            </div>
          ) : (
            <div className="space-y-6 mt-4">
              <div className="max-h-[300px] overflow-y-auto rounded-xl border border-slate-100">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-100 bg-slate-50/70 hover:bg-slate-50/70">
                      <TableHead className="text-[11px] font-bold text-slate-500 py-3 pl-4">Order ID</TableHead>
                      <TableHead className="text-[11px] font-bold text-slate-500 py-3">Product Name</TableHead>
                      <TableHead className="text-[11px] font-bold text-slate-500 py-3">Qty</TableHead>
                      <TableHead className="text-[11px] font-bold text-slate-500 py-3">Total Amount</TableHead>
                      <TableHead className="text-[11px] font-bold text-slate-500 py-3">Status</TableHead>
                      <TableHead className="text-[11px] font-bold text-slate-500 py-3 text-right pr-4">Order Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {userOrders.map((order) => (
                      <TableRow key={order.id} className="border-slate-100 hover:bg-slate-50/30 text-sm">
                        <TableCell className="font-bold text-slate-900 py-3 pl-4">#{order.id}</TableCell>
                        <TableCell className="font-medium text-slate-700">{order.product_name}</TableCell>
                        <TableCell className="text-slate-500 font-semibold">{order.quantity}</TableCell>
                        <TableCell className="font-bold text-slate-900">${order.total.toFixed(2)}</TableCell>
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
                        <TableCell className="text-right text-slate-400 text-xs font-semibold pr-4">
                          {format(new Date(order.created_at), "yyyy-MM-dd")}
                        </TableCell>
                      </TableRow>
                    ))}
                    {userOrders.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-slate-400 font-medium">
                          No order history found for this customer.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end border-t border-slate-100 pt-4">
                <Button variant="outline" className="rounded-xl border-slate-200" onClick={() => setOrdersOpen(false)}>
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
