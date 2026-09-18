"use client";

import { useState, useEffect } from "react";
import { apiDelete, apiPost, apiPut, apiUpload } from "@/lib/api";
import { useProducts } from "@/hooks/use-products";
import { useCategories } from "@/hooks/use-categories";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MoreVertical,
  Plus,
  Search,
  Grid3x3,
  List,
  Image as ImageIcon,
} from "lucide-react";
import {
  Product,
  Category,
  ProductFormData,
  Order,
  OrderCreate,
} from "@/lib/types";
import { format } from "date-fns";
import Image from "next/image";
import { ImageUploader } from "@/components/image-uploader";

export default function ProductsPage() {
  const { categories } = useCategories();

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [stockFilter, setStockFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("latest");

  const [searchVal, setSearchVal] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(searchVal);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchVal]);

  const handleCategoryChange = (val: string) => {
    setSelectedCategory(val);
    setCurrentPage(1);
  };

  const {
    products,
    total: totalProducts,
    isLoading: loading,
    mutate: mutateProducts,
  } = useProducts({
    page: currentPage,
    pageSize,
    search: searchTerm,
    category_id: selectedCategory,
    is_active: statusFilter === "all" ? null : statusFilter === "active",
    stock_status: stockFilter,
    sort_by: sortBy,
  });

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [formData, setFormData] = useState<ProductFormData>({
    name: "",
    price: 0,
    currency: "USD",
    category_id: null,
    stock_quantity: 0,
    reserved_quantity: 0,
    sold_quantity: 0,
    description: "",
    is_active: true,
  });

  // Filters and sorting are now handled backend-side.
  // We keep filteredProducts as a direct passthrough of products to preserve visual mapping.
  const filteredProducts = products;

  const updateFormData = <K extends keyof ProductFormData>(
    key: K,
    value: ProductFormData[K],
  ) => {
    setFormData((current) => ({ ...current, [key]: value }));
  };
  const resetFormData = () => {
    setFormData({
      name: "",
      price: 0,
      currency: "USD",
      category_id: null,
      stock_quantity: 0,
      reserved_quantity: 0,
      sold_quantity: 0,
      description: "",
      is_active: true,
    });
    setSelectedImage(null);
  };
  const handleCreateOrder = async (product: Product) => {
    await apiPost<Order, OrderCreate>("/orders/", {
      product_id: product.id,
      quantity: 1,
    });
    await mutateProducts();
  };
  const handleCreateProduct = async () => {
    const createdProduct = await apiPost<Product, ProductFormData>(
      "/products/",
      formData,
    );
    if (!createdProduct.id) return;
    if (selectedImage) {
      const imageFormData = new FormData();
      imageFormData.append("file", selectedImage);
      await apiUpload<{ file_name: string }>(
        `/products/${createdProduct.id}/upload-image`,
        imageFormData,
      );
    }

    await mutateProducts();
    resetFormData();
    setCreateDialogOpen(false);
  };

  const openEditProduct = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      price: product.price,
      currency: product.currency,
      category_id: product.category?.id || null,
      stock_quantity: product.stock_quantity,
      reserved_quantity: product.reserved_quantity,
      sold_quantity: product.sold_quantity,
      description: product.description || "",
      is_active: product.is_active,
    });
    setCreateDialogOpen(true);
  };
  const handleUpdateProduct = async () => {
    if (!editingProduct) return;
    await apiPut<Product, ProductFormData>(
      `/products/${editingProduct.id}`,
      formData,
    );
    if (selectedImage) {
      const imageFormData = new FormData();
      imageFormData.append("file", selectedImage);
      await apiUpload<{ file_name: string }>(
        `/products/${editingProduct.id}/upload-image`,
        imageFormData,
      );
    }
    await mutateProducts();
    resetFormData();
    setEditingProduct(null);
    setCreateDialogOpen(false);
  };

  const handleDeleteProduct = async (product: Product) => {
    await apiDelete<{ message: string }>(`/products/${product.id}`);
    await mutateProducts();
    setDeleteProduct(null);
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Products" subtitle="Manage your product catalog" />

      <main className="flex-1 p-8">
        {/* Filters and Controls */}
        <div className="space-y-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === "table" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("table")}
              >
                <List className="w-4 h-4 mr-2" />
                Table
              </Button>
              <Button
                variant={viewMode === "grid" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("grid")}
              >
                <Grid3x3 className="w-4 h-4 mr-2" />
                Grid
              </Button>
            </div>

            <Dialog
              open={createDialogOpen}
              onOpenChange={(open) => {
                setCreateDialogOpen(open);
                if (!open) {
                  setEditingProduct(null);
                  resetFormData();
                }
              }}
            >
              <DialogTrigger asChild>
                <Button
                  onClick={() => {
                    setEditingProduct(null);
                    resetFormData();
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create Product
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editingProduct ? "Edit Product" : "Create New Product"}
                  </DialogTitle>
                  <DialogDescription>
                    Fill in the product details below
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <label htmlFor="name" className="text-sm font-medium">
                      Product Name
                    </label>
                    <Input
                      id="name"
                      placeholder="Enter product name"
                      value={formData.name}
                      onChange={(e) => updateFormData("name", e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <label htmlFor="price" className="text-sm font-medium">
                        Price
                      </label>
                      <Input
                        id="price"
                        type="number"
                        placeholder="0.00"
                        step="0.01"
                        value={formData.price}
                        onChange={(e) =>
                          updateFormData("price", Number(e.target.value))
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <label htmlFor="currency" className="text-sm font-medium">
                        Currency
                      </label>
                      <Select
                        value={formData.currency}
                        onValueChange={(value) =>
                          updateFormData("currency", value)
                        }
                      >
                        <SelectTrigger id="currency">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="EUR">EUR</SelectItem>
                          <SelectItem value="GBP">GBP</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <label htmlFor="category" className="text-sm font-medium">
                      Category
                    </label>
                    <Select
                      value={formData.category_id?.toString() || undefined}
                      onValueChange={(value) =>
                        updateFormData(
                          "category_id",
                          value ? Number(value) : null,
                        )
                      }
                    >
                      <SelectTrigger id="category">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id.toString()}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="grid gap-2">
                      <label htmlFor="stock" className="text-sm font-medium">
                        Stock Quantity
                      </label>
                      <Input
                        id="stock"
                        type="number"
                        value={formData.stock_quantity}
                        onChange={(e) =>
                          updateFormData(
                            "stock_quantity",
                            Number(e.target.value),
                          )
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <label htmlFor="reserved" className="text-sm font-medium">
                        Reserved
                      </label>
                      <Input
                        id="reserved"
                        type="number"
                        value={formData.reserved_quantity}
                        onChange={(e) =>
                          updateFormData(
                            "reserved_quantity",
                            Number(e.target.value),
                          )
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <label htmlFor="sold" className="text-sm font-medium">
                        Sold
                      </label>
                      <Input
                        id="sold"
                        type="number"
                        value={formData.sold_quantity}
                        onChange={(e) =>
                          updateFormData(
                            "sold_quantity",
                            Number(e.target.value),
                          )
                        }
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <label
                      htmlFor="description"
                      className="text-sm font-medium"
                    >
                      Description
                    </label>
                    <textarea
                      id="description"
                      placeholder="Product description"
                      className="w-full px-3 py-2 border border-input rounded-md text-sm"
                      rows={2}
                      value={formData.description || ""}
                      onChange={(e) =>
                        updateFormData("description", e.target.value)
                      }
                    />
                  </div>
                  <ImageUploader
                    productId={editingProduct?.id}
                    currentImageUrl={editingProduct?.images && editingProduct.images.length > 0 ? editingProduct.images[0].url : undefined}
                    onUploadSuccess={(url) => {
                      if (url) {
                        mutateProducts();
                      }
                    }}
                  />
                </div>

                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => setCreateDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={
                      editingProduct ? handleUpdateProduct : handleCreateProduct
                    }
                    disabled={!formData.name || formData.price <= 0}
                  >
                    {editingProduct ? "Update Product" : "Create Product"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Search and Filters */}
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search products..."
                value={searchVal}
                onChange={(e) => setSearchVal(e.target.value)}
                className="pl-10 bg-white"
              />
            </div>

            <Select
              value={selectedCategory}
              onValueChange={handleCategoryChange}
            >
              <SelectTrigger className="w-full md:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id.toString()}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setCurrentPage(1); }}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>

            <Select value={stockFilter} onValueChange={(val) => { setStockFilter(val); setCurrentPage(1); }}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stock</SelectItem>
                <SelectItem value="instock">In Stock</SelectItem>
                <SelectItem value="low">Low Stock</SelectItem>
                <SelectItem value="outofstock">Out of Stock</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={(val) => { setSortBy(val); setCurrentPage(1); }}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="latest">Latest</SelectItem>
                <SelectItem value="price-asc">Price: Low to High</SelectItem>
                <SelectItem value="price-desc">Price: High to Low</SelectItem>
                <SelectItem value="stock-asc">Stock: Low to High</SelectItem>
                <SelectItem value="stock-desc">Stock: High to Low</SelectItem>
                <SelectItem value="sold-desc">Most Sold</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Products Display */}
        {loading ? (
          <Card className="p-8 text-center text-slate-600">
            Loading products...
          </Card>
        ) : viewMode === "table" ? (
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-200 bg-slate-50">
                    <TableHead className="text-slate-600">Product</TableHead>
                    <TableHead className="text-slate-600">Category</TableHead>
                    <TableHead className="text-slate-600">Price</TableHead>
                    <TableHead className="text-slate-600">Stock</TableHead>
                    <TableHead className="text-slate-600">Reserved</TableHead>
                    <TableHead className="text-slate-600">Sold</TableHead>
                    <TableHead className="text-slate-600">Status</TableHead>
                    <TableHead className="text-slate-600">Created</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => (
                    <TableRow key={product.id} className="border-slate-200">
                      <TableCell className="font-medium text-slate-900">
                        {product.name}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {product.category?.name || "N/A"}
                      </TableCell>
                      <TableCell className="text-slate-900 font-medium">
                        ${product.price.toFixed(2)} {product.currency}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {product.stock_quantity}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {product.reserved_quantity}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {product.sold_quantity}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={product.is_active ? "default" : "secondary"}
                          className={
                            product.is_active
                              ? "bg-green-100 text-green-800"
                              : "bg-slate-100 text-slate-800"
                          }
                        >
                          {product.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-600 text-sm">
                        {format(new Date(product.created_at), "MMM dd, yyyy")}
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
                              onClick={() => setSelectedProduct(product)}
                            >
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => openEditProduct(product)}
                            >
                              Edit Product
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleCreateOrder(product)}
                            >
                              Create Order
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => openEditProduct(product)}
                            >
                              Upload Image
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => setDeleteProduct(product)}
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
            <div className="flex items-center justify-between p-4 border-t border-slate-200 bg-slate-50 rounded-b-lg">
              <div className="text-sm text-slate-600">
                Showing <span className="font-semibold">{totalProducts === 0 ? 0 : Math.min(totalProducts, (currentPage - 1) * pageSize + 1)}</span> to{" "}
                <span className="font-semibold">{Math.min(totalProducts, currentPage * pageSize)}</span> of{" "}
                <span className="font-semibold">{totalProducts}</span> products
              </div>
              <div className="flex items-center gap-4">
                <Select value={pageSize.toString()} onValueChange={(val) => { setPageSize(parseInt(val)); setCurrentPage(1); }}>
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
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage * pageSize >= totalProducts}
                    onClick={() => setCurrentPage(prev => prev + 1)}
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
            {filteredProducts.map((product) => (
              <Card
                key={product.id}
                className="overflow-hidden hover:shadow-lg transition-shadow"
              >
                <div className="relative aspect-square overflow-hidden bg-slate-100">
                  {product.images.length > 0 ? (
                    <Image
                      src={product.images[product.images.length - 1].url}
                      alt={product.name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <ImageIcon className="w-8 h-8 text-slate-400" />
                    </div>
                  )}
                  <Badge
                    className={`absolute top-3 right-3 ${
                      product.is_active
                        ? "bg-green-100 text-green-800"
                        : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    {product.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-slate-900 line-clamp-2">
                    {product.name}
                  </h3>
                  <p className="text-sm text-slate-600 mt-1">
                    {product.category?.name}
                  </p>
                  <p className="text-lg font-bold text-slate-900 mt-2">
                    ${product.price.toFixed(2)}
                  </p>
                  <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                    <div className="text-center">
                      <p className="font-medium text-slate-900">
                        {product.stock_quantity}
                      </p>
                      <p className="text-slate-500">Stock</p>
                    </div>
                    <div className="text-center">
                      <p className="font-medium text-slate-900">
                        {product.reserved_quantity}
                      </p>
                      <p className="text-slate-500">Reserved</p>
                    </div>
                    <div className="text-center">
                      <p className="font-medium text-slate-900">
                        {product.sold_quantity}
                      </p>
                      <p className="text-slate-500">Sold</p>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs"
                      onClick={() => setSelectedProduct(product)}
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
                          onClick={() => openEditProduct(product)}
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleCreateOrder(product)}
                        >
                          Create Order
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => openEditProduct(product)}
                        >
                          Upload Image
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => setDeleteProduct(product)}
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
            <div className="flex items-center justify-between p-4">
              <div className="text-sm text-slate-600">
                Showing <span className="font-semibold">{totalProducts === 0 ? 0 : Math.min(totalProducts, (currentPage - 1) * pageSize + 1)}</span> to{" "}
                <span className="font-semibold">{Math.min(totalProducts, currentPage * pageSize)}</span> of{" "}
                <span className="font-semibold">{totalProducts}</span> products
              </div>
              <div className="flex items-center gap-4">
                <Select value={pageSize.toString()} onValueChange={(val) => { setPageSize(parseInt(val)); setCurrentPage(1); }}>
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
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage * pageSize >= totalProducts}
                    onClick={() => setCurrentPage(prev => prev + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          </Card>
          </>
        )}

        {!loading && filteredProducts.length === 0 && (
          <Card className="p-12 text-center">
            <ImageIcon className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900">
              No products found
            </h3>
            <p className="text-slate-600 mt-1">
              Try adjusting your filters or search term
            </p>
          </Card>
        )}
      </main>

      {/* Product Details Sheet */}
      {selectedProduct && (
        <Dialog
          open={!!selectedProduct}
          onOpenChange={() => setSelectedProduct(null)}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{selectedProduct.name}</DialogTitle>
              <DialogDescription>
                Product details and information
              </DialogDescription>
            </DialogHeader>
            <div className="grid md:grid-cols-2 gap-6 py-4">
              <div>
                {selectedProduct.images.length > 0 ? (
                  <div className="relative aspect-square rounded-lg overflow-hidden bg-slate-100">
                    <Image
                      src={
                        selectedProduct.images[
                          selectedProduct.images.length - 1
                        ].url
                      }
                      alt={selectedProduct.name}
                      fill
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="aspect-square rounded-lg bg-slate-100 flex items-center justify-center">
                    <ImageIcon className="w-12 h-12 text-slate-400" />
                  </div>
                )}
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-slate-600">Price</p>
                  <p className="text-2xl font-bold text-slate-900">
                    ${selectedProduct.price.toFixed(2)}{" "}
                    {selectedProduct.currency}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-600">Category</p>
                  <p className="font-medium text-slate-900">
                    {selectedProduct.category?.name || "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-600">Status</p>
                  <Badge
                    className={`${
                      selectedProduct.is_active
                        ? "bg-green-100 text-green-800"
                        : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    {selectedProduct.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div className="pt-4 border-t space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-slate-600">Stock Quantity</p>
                      <p className="text-lg font-semibold text-slate-900">
                        {selectedProduct.stock_quantity}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-600">Reserved</p>
                      <p className="text-lg font-semibold text-slate-900">
                        {selectedProduct.reserved_quantity}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-600">Available</p>
                      <p className="text-lg font-semibold text-slate-900">
                        {selectedProduct.stock_quantity -
                          selectedProduct.reserved_quantity}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-600">Sold</p>
                      <p className="text-lg font-semibold text-slate-900">
                        {selectedProduct.sold_quantity}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="pt-4 border-t text-sm text-slate-600">
                  <p>
                    Created:{" "}
                    {format(new Date(selectedProduct.created_at), "PPP")}
                  </p>
                  <p>
                    Updated:{" "}
                    {format(new Date(selectedProduct.updated_at), "PPP")}
                  </p>
                </div>
              </div>
            </div>
            {selectedProduct.description && (
              <div className="py-4 border-t">
                <p className="text-sm text-slate-600">Description</p>
                <p className="text-slate-900 mt-2">
                  {selectedProduct.description}
                </p>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation */}
      {deleteProduct && (
        <AlertDialog
          open={!!deleteProduct}
          onOpenChange={() => setDeleteProduct(null)}
        >
          <AlertDialogContent>
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteProduct.name}&quot;?
              This action cannot be undone.
            </AlertDialogDescription>
            <div className="flex gap-2 justify-end">
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => handleDeleteProduct(deleteProduct)}
                className="bg-red-600 hover:bg-red-700"
              >
                Delete
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
