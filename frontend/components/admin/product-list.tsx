"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SalePrice } from "@/components/store/sale-price";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Product } from "@/lib/types";
import { displayDate } from "@/lib/utils";
import { Image as ImageIcon, MoreVertical } from "lucide-react";
import Image from "next/image";

interface AdminProductListProps {
  loading: boolean;
  viewMode: "table" | "grid";
  products: Product[];
  totalProducts: number;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onView: (product: Product) => void;
  onEdit: (product: Product) => void;
  onAddVariants: (product: Product) => void;
  onDelete: (product: Product) => void;
}

const hasActiveVariants = (p: Product) =>
  p.variants ? p.variants.some((v) => v.is_active) : null;

export function AdminProductList({
  loading,
  viewMode,
  products,
  totalProducts,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onView,
  onEdit,
  onAddVariants,
  onDelete,
}: AdminProductListProps) {
  return (
    <>
        {loading ? (
          <Card className="p-8 text-center text-muted-foreground">
            Loading products...
          </Card>
        ) : viewMode === "table" ? (
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border bg-background">
                    <TableHead className="text-muted-foreground">Product</TableHead>
                    <TableHead className="text-muted-foreground">Category</TableHead>
                    <TableHead className="text-muted-foreground">Price</TableHead>
                    <TableHead className="text-muted-foreground">Stock</TableHead>
                    <TableHead className="text-muted-foreground">Reserved</TableHead>
                    <TableHead className="text-muted-foreground">Sold</TableHead>
                    <TableHead className="text-muted-foreground">Status</TableHead>
                    <TableHead className="text-muted-foreground">Created</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => (
                    <TableRow key={product.id} className="border-border">
                      <TableCell className="font-medium text-foreground">
                        {product.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {product.category?.name || "N/A"}
                      </TableCell>
                      <TableCell className="text-foreground font-medium">
                        <SalePrice price={product.price_min || product.price} compareAt={product.compare_at_price} currency={product.currency} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {product.stock_quantity}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {product.reserved_quantity}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {product.sold_quantity}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 items-start">
                          <Badge
                            variant={product.is_active ? "default" : "secondary"}
                            className={
                              product.is_active
                                ? "bg-green-100 text-green-800"
                                : "bg-secondary text-foreground"
                            }
                          >
                            {product.is_active ? "Active" : "Inactive"}
                          </Badge>
                          {hasActiveVariants(product) === false && (
                            <Badge
                              variant="outline"
                              className="text-[11px] bg-amber-50 text-amber-700 border-amber-200"
                            >
                              Hidden from the store until variants are added
                            </Badge>
                          )}
                          {product.vton_enabled === false && (
                            <Badge variant="outline" className="text-[11px] text-muted-foreground">
                              Try-on off
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {displayDate(product.created_at, "MMM dd, yyyy")}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => onView(product)}
                            >
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => onEdit(product)}
                            >
                              Edit Product
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                onAddVariants(product);
                              }}
                            >
                              Create Variants (Matrix)
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => onDelete(product)}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {/* Pagination Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-t border-border bg-background rounded-b-lg">
              <div className="text-sm text-muted-foreground">
                Showing <span className="font-semibold">{totalProducts === 0 ? 0 : Math.min(totalProducts, (currentPage - 1) * pageSize + 1)}</span> to{" "}
                <span className="font-semibold">{Math.min(totalProducts, currentPage * pageSize)}</span> of{" "}
                <span className="font-semibold">{totalProducts}</span> products
              </div>
              <div className="flex items-center gap-4">
                <Select value={pageSize.toString()} onValueChange={(val) => onPageSizeChange(parseInt(val))}>
                  <SelectTrigger className="w-20 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage * pageSize >= totalProducts}
                    onClick={() => onPageChange(currentPage + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {products.map((product) => (
              <Card
                key={product.id}
                className="overflow-hidden hover:border-[#B89B6A]/50 transition-shadow"
              >
                <div className="relative aspect-square overflow-hidden bg-secondary">
                  {product.images.length > 0 ? (
                    <Image
                      src={product.images[0].url}
                      alt={product.name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <ImageIcon className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                  {product.on_sale && (
                    <span className="sale-badge top-3 left-3 bg-red-600 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white shadow">
                      Sale{product.discount_percent ? ` -${product.discount_percent}%` : ""}
                    </span>
                  )}
                  <div className="absolute top-3 right-3 flex flex-col items-end gap-1">
                    <Badge
                      className={
                        product.is_active
                          ? "bg-green-100 text-green-800"
                          : "bg-secondary text-foreground"
                      }
                    >
                      {product.is_active ? "Active" : "Inactive"}
                    </Badge>
                    {hasActiveVariants(product) === false && (
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 shadow-none"
                      >
                        Hidden from the store until variants are added
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-foreground line-clamp-2">
                    {product.name}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {product.category?.name}
                  </p>
                  <p className="text-lg font-bold text-foreground mt-2">
                    <SalePrice price={product.price_min || product.price} compareAt={product.compare_at_price} currency={product.currency} />
                  </p>
                  <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                    <div className="text-center">
                      <p className="font-medium text-foreground">
                        {product.stock_quantity}
                      </p>
                      <p className="text-muted-foreground">Stock</p>
                    </div>
                    <div className="text-center">
                      <p className="font-medium text-foreground">
                        {product.reserved_quantity}
                      </p>
                      <p className="text-muted-foreground">Reserved</p>
                    </div>
                    <div className="text-center">
                      <p className="font-medium text-foreground">
                        {product.sold_quantity}
                      </p>
                      <p className="text-muted-foreground">Sold</p>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs"
                      onClick={() => onView(product)}
                    >
                      View
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem
                          onClick={() => onEdit(product)}
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            onAddVariants(product);
                          }}
                        >
                          Create Variants (Matrix)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => onDelete(product)}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </Card>
            ))}
          </div>
          {/* Pagination Controls for Grid View */}
          <Card className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="text-sm text-muted-foreground">
                Showing <span className="font-semibold">{totalProducts === 0 ? 0 : Math.min(totalProducts, (currentPage - 1) * pageSize + 1)}</span> to{" "}
                <span className="font-semibold">{Math.min(totalProducts, currentPage * pageSize)}</span> of{" "}
                <span className="font-semibold">{totalProducts}</span> products
              </div>
              <div className="flex items-center gap-4">
                <Select value={pageSize.toString()} onValueChange={(val) => onPageSizeChange(parseInt(val))}>
                  <SelectTrigger className="w-20 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage * pageSize >= totalProducts}
                    onClick={() => onPageChange(currentPage + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          </Card>
          </>
        )}
    </>
  );
}
