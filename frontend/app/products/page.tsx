"use client";
import { displayDate, formatCurrency } from '@/lib/utils';


import { useState, useEffect } from "react";
import { apiDelete, apiGet, apiPost, apiPatch, apiUpload } from "@/lib/api";
import { useProducts } from "@/hooks/use-products";
import { useCategoryOptions } from "@/hooks/use-categories";
import { getAvailableStock } from "@/lib/inventory";
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
  ProductVariant,
} from "@/lib/types";
import { format } from "date-fns";
import Image from "next/image";
import { AdminProductImages } from "@/components/admin/product-images";
import { VariantMatrixGenerator, BulkVariantPayload } from "@/components/admin/variant-matrix-generator";
import { VariantStockDialog } from "@/components/admin/variant-stock-dialog";

export default function ProductsPage() {
  const { categories, error: categoriesError, isLoading: categoriesLoading, mutate: retryCategories } = useCategoryOptions();

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [matrixDialogOpen, setMatrixDialogOpen] = useState(false);
  const [matrixProduct, setMatrixProduct] = useState<Product | null>(null);
  const [stockDialogVariant, setStockDialogVariant] = useState<ProductVariant | null>(null);

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
    error: productsError,
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
  const [saving, setSaving] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [loadingProduct, setLoadingProduct] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [formData, setFormData] = useState<ProductFormData>({
    name: "",
    price: 0,
    currency: "VND",
    category_id: null,
    stock_quantity: 0,
    reserved_quantity: 0,
    sold_quantity: 0,
    description: "",
    is_active: false,
    brand: "",
    gender: "unisex",
    material: "",
    fit: "",
    care_instructions: "",
  });

  const hasActiveVariants = (p: Product | null | undefined) =>
    p?.variants ? p.variants.some((v) => v.is_active) : null;

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
      currency: "VND",
      category_id: null,
      stock_quantity: 0,
      reserved_quantity: 0,
      sold_quantity: 0,
      description: "",
      is_active: false,
      brand: "",
      gender: "unisex",
      material: "",
      fit: "",
      care_instructions: "",
    });
    setSelectedImage(null);
  };
  const handleCreateProduct = async () => {
    const { stock_quantity, reserved_quantity, sold_quantity, ...createPayload } = formData;
    const createdProduct = await apiPost<Product, typeof createPayload>(
      "/products",
      createPayload,
    );
    if (!createdProduct.id) return;
    setEditingProduct(createdProduct);
    if (selectedImage) {
      const imageFormData = new FormData();
      imageFormData.append("file", selectedImage);
      imageFormData.append("is_primary", "true");
      await apiUpload<{ id: string; url: string }>(
        `/products/${createdProduct.id}/upload-image`,
        imageFormData,
      );
    }

    await mutateProducts();
    resetFormData();
    setCreateDialogOpen(false);
    setEditingProduct(null);
  };

  const openEditProduct = async (product: Product) => {
    setSaveError(null);
    if (product.slug) {
      setLoadingProduct(true);
      try { product = await apiGet<Product>(`/products/by-slug/${product.slug}`); }
      catch (error) { setSaveError(error instanceof Error ? error.message : 'Unable to load product'); return; }
      finally { setLoadingProduct(false); }
    }
    setSelectedImage(null);
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
      brand: product.brand || "",
      gender: product.gender || "unisex",
      material: product.material || "",
      fit: product.fit || "",
      care_instructions: product.care_instructions || "",
    });
    setCreateDialogOpen(true);
  };
  const openProductDetails = async (product: Product) => {
    setLoadingProduct(true);
    setSaveError(null);
    try { setSelectedProduct(product.slug ? await apiGet<Product>(`/products/by-slug/${product.slug}`) : product); }
    catch (error) { setSaveError(error instanceof Error ? error.message : 'Unable to load product'); }
    finally { setLoadingProduct(false); }
  };
  const handleUpdateProduct = async () => {
    if (!editingProduct) return;
    const { stock_quantity, reserved_quantity, sold_quantity, ...patchPayload } = formData;
    await apiPatch<Product, typeof patchPayload>(
      `/products/${editingProduct.id}`,
      patchPayload,
    );
    if (selectedImage) {
      const imageFormData = new FormData();
      imageFormData.append("file", selectedImage);
      imageFormData.append("is_primary", "true");
      await apiUpload<{ id: string; url: string }>(
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
    setSaveError(null);
    try {
      await apiDelete<void>(`/products/${product.id}`);
      await mutateProducts();
      setDeleteProduct(null);
    } catch (error) { setSaveError(error instanceof Error ? error.message : 'Delete failed'); }
  };

  const runSave = async (action: () => Promise<void>) => {
    if (saving || imageBusy) return;
    setSaving(true); setSaveError(null);
    try { await action(); } catch (error) { setSaveError(error instanceof Error ? error.message : 'Save failed'); }
    finally { setSaving(false); }
  };
  useEffect(() => { if (!loading && !productsError && currentPage > 1 && products.length === 0) setCurrentPage(Math.max(1, Math.ceil(totalProducts / pageSize))); }, [loading, productsError, currentPage, products.length, totalProducts, pageSize]);

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Products" subtitle="Manage your product catalog" />

      <main className="flex-1 p-8">
        {loadingProduct && <p role="status" className="text-sm text-slate-500">Loading product details...</p>}
        {productsError && <p role="alert"><span>{productsError.message}</span> <button onClick={()=>mutateProducts()}>Retry products</button></p>}
        {categoriesError && <p role="alert"><span>{categoriesError.message}</span> <button onClick={()=>retryCategories()}>Retry categories</button></p>}
        {categoriesLoading && <p>Loading categories...</p>}
        {saveError && !createDialogOpen && <p role="alert">{saveError}</p>}
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
                if (saving || imageBusy) return;
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
                          <SelectItem value="VND">VND</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <label htmlFor="category" className="text-sm font-medium">
                      Category
                    </label>
                    <Select
                      value={formData.category_id?.toString() || ""}
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
                  {editingProduct ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                      <div className="font-medium text-slate-700 mb-1">
                        Thông tin tồn kho (Chỉ đọc)
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-slate-600">
                        <div>Tổng kho: <span className="font-semibold text-slate-900">{editingProduct.stock_quantity}</span></div>
                        <div>Đang giữ: <span className="font-semibold text-slate-900">{editingProduct.reserved_quantity}</span></div>
                        <div>Đã bán: <span className="font-semibold text-slate-900">{editingProduct.sold_quantity}</span></div>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        * Tồn kho được quản lý theo từng biến thể (Variant). Hãy dùng nút &quot;Quản lý biến thể&quot; để điều chỉnh kho có kiểm toán.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 text-xs text-blue-700">
                      💡 Tồn kho sẽ được tạo và cập nhật khi bạn thêm các biến thể (size/màu) cho sản phẩm này.
                    </div>
                  )}
                  <div className="grid gap-2">
                    <label htmlFor="is_active" className="text-sm font-medium">
                      Trạng thái kích hoạt (Active Status)
                    </label>
                    <div className="flex items-center gap-3">
                      <Select
                        value={formData.is_active ? "active" : "inactive"}
                        onValueChange={(val) => updateFormData("is_active", val === "active")}
                      >
                        <SelectTrigger id="is_active" className="w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active (Kích hoạt)</SelectItem>
                          <SelectItem value="inactive">Inactive (Bản nháp)</SelectItem>
                        </SelectContent>
                      </Select>
                      {(!editingProduct || hasActiveVariants(editingProduct) === false) && (
                        <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded">
                          Thêm biến thể rồi kích hoạt
                        </span>
                      )}
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
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <label htmlFor="brand" className="text-sm font-medium">
                        Brand (Thương hiệu)
                      </label>
                      <Input
                        id="brand"
                        placeholder="VD: TrueLook"
                        value={formData.brand || ""}
                        onChange={(e) => updateFormData("brand", e.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <label htmlFor="gender" className="text-sm font-medium">
                        Gender (Đối tượng)
                      </label>
                      <Select
                        value={formData.gender || "unisex"}
                        onValueChange={(value) => updateFormData("gender", value)}
                      >
                        <SelectTrigger id="gender">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="male">Nam (Male)</SelectItem>
                          <SelectItem value="female">Nữ (Female)</SelectItem>
                          <SelectItem value="unisex">Unisex</SelectItem>
                          <SelectItem value="kids">Trẻ em (Kids)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <label htmlFor="material" className="text-sm font-medium">
                        Material (Chất liệu)
                      </label>
                      <Input
                        id="material"
                        placeholder="VD: 100% Cotton Compact"
                        value={formData.material || ""}
                        onChange={(e) => updateFormData("material", e.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <label htmlFor="fit" className="text-sm font-medium">
                        Fit (Kiểu dáng)
                      </label>
                      <Input
                        id="fit"
                        placeholder="VD: Regular Fit, Oversized"
                        value={formData.fit || ""}
                        onChange={(e) => updateFormData("fit", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <label htmlFor="care_instructions" className="text-sm font-medium">
                      Care Instructions (Hướng dẫn giặt ủi)
                    </label>
                    <Input
                      id="care_instructions"
                      placeholder="VD: Giặt máy nước lạnh, không sấy khô"
                      value={formData.care_instructions || ""}
                      onChange={(e) => updateFormData("care_instructions", e.target.value)}
                    />
                  </div>
                  {saveError && <p role="alert">{saveError}</p>}
                  <AdminProductImages
                    onFileSelected={setSelectedImage}
                    onBusyChange={setImageBusy}
                    productId={editingProduct?.id}
                    images={editingProduct?.images}
                    onImagesChange={(images) => {
                      setEditingProduct(current => current ? { ...current, images } : current);
                      void mutateProducts();
                    }}
                    onUploadSuccess={(url) => {
                      if (url && !url.startsWith("blob:")) {
                        mutateProducts();
                      }
                    }}
                  />
                </div>

                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    disabled={saving || imageBusy}
                    onClick={() => { setCreateDialogOpen(false); setSelectedImage(null); }}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={
                      editingProduct ? () => runSave(handleUpdateProduct) : () => runSave(handleCreateProduct)
                    }
                    disabled={saving || imageBusy || !formData.name || formData.price <= 0}
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
                        {formatCurrency(product.price, product.currency)}
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
                        <div className="flex flex-col gap-1 items-start">
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
                          {hasActiveVariants(product) === false && (
                            <Badge
                              variant="outline"
                              className="text-[11px] bg-amber-50 text-amber-700 border-amber-200"
                            >
                              Chưa hiển thị trên cửa hàng vì chưa có biến thể
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-600 text-sm">
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
                              onClick={() => openProductDetails(product)}
                            >
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => openEditProduct(product)}
                            >
                              Edit Product
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => openEditProduct(product)}
                            >
                              Upload Image
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setMatrixProduct(product);
                                setMatrixDialogOpen(true);
                              }}
                            >
                              Tạo biến thể (Matrix)
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
                      src={product.images[0].url}
                      alt={product.name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <ImageIcon className="w-8 h-8 text-slate-400" />
                    </div>
                  )}
                  <div className="absolute top-3 right-3 flex flex-col items-end gap-1">
                    <Badge
                      className={
                        product.is_active
                          ? "bg-green-100 text-green-800"
                          : "bg-slate-100 text-slate-800"
                      }
                    >
                      {product.is_active ? "Active" : "Inactive"}
                    </Badge>
                    {hasActiveVariants(product) === false && (
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 shadow-sm"
                      >
                        Chưa hiển thị trên cửa hàng vì chưa có biến thể
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-slate-900 line-clamp-2">
                    {product.name}
                  </h3>
                  <p className="text-sm text-slate-600 mt-1">
                    {product.category?.name}
                  </p>
                  <p className="text-lg font-bold text-slate-900 mt-2">
                    {formatCurrency(product.price, product.currency)}
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
                      onClick={() => openProductDetails(product)}
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
                          onClick={() => openEditProduct(product)}
                        >
                          Upload Image
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setMatrixProduct(product);
                            setMatrixDialogOpen(true);
                          }}
                        >
                          Tạo biến thể (Matrix)
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

        {!loading && !productsError && filteredProducts.length === 0 && (
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
                        selectedProduct.images[0].url
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
                    {formatCurrency(selectedProduct.price, selectedProduct.currency)}
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
                  <div className="flex flex-col gap-1 items-start">
                    <Badge
                      className={`${
                        selectedProduct.is_active
                          ? "bg-green-100 text-green-800"
                          : "bg-slate-100 text-slate-800"
                      }`}
                    >
                      {selectedProduct.is_active ? "Active" : "Inactive"}
                    </Badge>
                    {hasActiveVariants(selectedProduct) === false && (
                      <Badge
                        variant="outline"
                        className="text-[11px] bg-amber-50 text-amber-700 border-amber-200"
                      >
                        Chưa hiển thị trên cửa hàng vì chưa có biến thể
                      </Badge>
                    )}
                  </div>
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
                        {getAvailableStock(selectedProduct)}
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
                    {displayDate(selectedProduct.created_at, "PPP")}
                  </p>
                  <p>
                    Updated:{" "}
                    {displayDate(selectedProduct.updated_at, "PPP")}
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

            {/* Fashion Variants List */}
            {selectedProduct.variants && selectedProduct.variants.length > 0 && (
              <div className="py-4 border-t space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900">
                    Danh sách biến thể ({selectedProduct.variants.length})
                  </h4>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setMatrixProduct(selectedProduct);
                      setMatrixDialogOpen(true);
                    }}
                    className="text-xs"
                  >
                    Tạo thêm biến thể
                  </Button>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {selectedProduct.variants.map((v) => (
                    <div
                      key={v.id}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200/80 bg-slate-50 text-xs"
                    >
                      <div>
                        <span className="font-mono font-bold text-slate-800">{v.sku}</span>
                        <span className="text-slate-500 ml-2">
                          Size {v.size} · {v.color_name}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-slate-700">
                          Kho: {v.stock_quantity} (Khả dụng: {v.available_stock})
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-[11px] h-7 px-2"
                          onClick={() => setStockDialogVariant(v)}
                        >
                          Sửa tồn kho
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
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

      {/* Variant Matrix Generator Modal */}
      {matrixProduct && (
        <Dialog open={matrixDialogOpen} onOpenChange={setMatrixDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0 border-0 bg-transparent shadow-none">
            <DialogTitle className="sr-only">Clothing size and color variants</DialogTitle>
            <DialogDescription className="sr-only">Generate size and color combinations for this product.</DialogDescription>
            <VariantMatrixGenerator
              productId={matrixProduct.id}
              productSlug={matrixProduct.slug || "product"}
              defaultPrice={matrixProduct.price}
              onGenerate={async (payload) => {
                try {
                  await apiPost(`/products/${matrixProduct.id}/variants/bulk`, payload);
                  await mutateProducts();
                  setMatrixDialogOpen(false);
                } catch (err: any) {
                  alert(err.message || "Failed to generate variants");
                }
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Variant Stock Adjustment Dialog */}
      <VariantStockDialog
        variant={stockDialogVariant}
        isOpen={!!stockDialogVariant}
        onClose={() => setStockDialogVariant(null)}
        onSubmit={async (data) => {
          if (!stockDialogVariant) return;
          try {
            await apiPost(`/variants/${stockDialogVariant.id}/adjust-stock`, data);
            await mutateProducts();
            setStockDialogVariant(null);
          } catch (err: any) {
            alert(err.message || "Failed to adjust variant stock");
          }
        }}
      />
    </div>
  );
}
