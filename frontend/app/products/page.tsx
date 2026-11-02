"use client";
import { displayDate,formatCurrency } from '@/lib/utils';


import { AdminProductImages } from "@/components/admin/product-images";
import { VariantMatrixGenerator } from "@/components/admin/variant-matrix-generator";
import { VariantStockDialog } from "@/components/admin/variant-stock-dialog";
import { Header } from "@/components/header";
import {
AlertDialog,
AlertDialogAction,
AlertDialogCancel,
AlertDialogContent,
AlertDialogDescription,
AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
Dialog,
DialogContent,
DialogDescription,
DialogHeader,
DialogTitle,
DialogTrigger,
} from "@/components/ui/dialog";
import {
DropdownMenu,
DropdownMenuContent,
DropdownMenuItem,
DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
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
import { useCategoryOptions } from "@/hooks/use-categories";
import { useProducts } from "@/hooks/use-products";
import { apiDelete,apiGet,apiPatch,apiPost,apiUpload } from "@/lib/api";
import { getAvailableStock } from "@/lib/inventory";
import {
Product,
ProductFormData,
ProductVariant
} from "@/lib/types";
import {
Grid3x3,
Image as ImageIcon,
List,
MoreVertical,
Plus,
Search,
} from "lucide-react";
import Image from "next/image";
import { useEffect,useState } from "react";

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

      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        {loadingProduct && <p role="status" className="text-sm text-muted-foreground">Loading product details...</p>}
        {productsError && <p role="alert"><span>{productsError.message}</span> <button onClick={()=>mutateProducts()}>Retry products</button></p>}
        {categoriesError && <p role="alert"><span>{categoriesError.message}</span> <button onClick={()=>retryCategories()}>Retry categories</button></p>}
        {categoriesLoading && <p>Loading categories...</p>}
        {saveError && !createDialogOpen && <p role="alert">{saveError}</p>}
        {/* Filters and Controls */}
        <div className="space-y-4 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === "table" ? "default" : "outline"}
                aria-pressed={viewMode === "table"}
                size="sm"
                onClick={() => setViewMode("table")}
              >
                <List className="w-4 h-4 mr-2" />
                Table
              </Button>
              <Button
                variant={viewMode === "grid" ? "default" : "outline"}
                aria-pressed={viewMode === "grid"}
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
              <DialogContent className="admin-dialog max-w-xl max-h-[85vh] overflow-y-auto">
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
                    <div className="rounded border border-border bg-background p-3 text-sm">
                      <div className="font-medium text-foreground mb-1">
                        Inventory information (Read only)
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-muted-foreground">
                        <div>Total stock: <span className="font-semibold text-foreground">{editingProduct.stock_quantity}</span></div>
                        <div>Reserved: <span className="font-semibold text-foreground">{editingProduct.reserved_quantity}</span></div>
                        <div>Sold: <span className="font-semibold text-foreground">{editingProduct.sold_quantity}</span></div>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        * Inventory is managed by variant. Use &quot;Manage Variants&quot; to make audited stock adjustments.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded border border-blue-100 bg-blue-50/50 p-3 text-xs text-blue-700">
                      💡 Inventory is created and updated when you add size and color variants to this product.
                    </div>
                  )}
                  <div className="grid gap-2">
                    <label htmlFor="is_active" className="text-sm font-medium">
                      Active Status
                    </label>
                    <div className="flex flex-wrap items-center gap-3">
                      <Select
                        value={formData.is_active ? "active" : "inactive"}
                        onValueChange={(val) => updateFormData("is_active", val === "active")}
                      >
                        <SelectTrigger id="is_active" className="w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive (Draft)</SelectItem>
                        </SelectContent>
                      </Select>
                      {(!editingProduct || hasActiveVariants(editingProduct) === false) && (
                        <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded">
                          Add variants, then activate
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
                        Brand
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
                        Gender
                      </label>
                      <Select
                        value={formData.gender || "unisex"}
                        onValueChange={(value) => updateFormData("gender", value)}
                      >
                        <SelectTrigger id="gender">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                          <SelectItem value="unisex">Unisex</SelectItem>
                          <SelectItem value="kids">Kids</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <label htmlFor="material" className="text-sm font-medium">
                        Material
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
                        Fit
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
                      Care Instructions
                    </label>
                    <Input
                      id="care_instructions"
                      placeholder="e.g. Machine wash cold, do not tumble dry"
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
                    colors={Array.from(new Set((editingProduct?.variants ?? []).map((variant) => variant.color_name).filter(Boolean)))}
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="relative min-w-0 sm:col-span-2 xl:col-span-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                aria-label="Search products"
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
              <SelectTrigger aria-label="Filter by category" className="w-full">
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
              <SelectTrigger aria-label="Filter by product status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>

            <Select value={stockFilter} onValueChange={(val) => { setStockFilter(val); setCurrentPage(1); }}>
              <SelectTrigger aria-label="Filter by stock" className="w-full">
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
              <SelectTrigger aria-label="Sort products" className="w-full">
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
                  {filteredProducts.map((product) => (
                    <TableRow key={product.id} className="border-border">
                      <TableCell className="font-medium text-foreground">
                        {product.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {product.category?.name || "N/A"}
                      </TableCell>
                      <TableCell className="text-foreground font-medium">
                        {formatCurrency(product.price, product.currency)}
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
                              Create Variants (Matrix)
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
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-t border-border bg-background rounded-b-lg">
              <div className="text-sm text-muted-foreground">
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
                    {formatCurrency(product.price, product.currency)}
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
                          Create Variants (Matrix)
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
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="text-sm text-muted-foreground">
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
            <h3 className="text-lg font-semibold text-foreground">
              No products found
            </h3>
            <p className="text-muted-foreground mt-1">
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
          <DialogContent className="admin-dialog max-w-2xl max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedProduct.name}</DialogTitle>
              <DialogDescription>
                Product details and information
              </DialogDescription>
            </DialogHeader>
            <div className="grid md:grid-cols-2 gap-6 py-4">
              <div>
                {selectedProduct.images.length > 0 ? (
                  <div className="relative aspect-square rounded overflow-hidden bg-secondary">
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
                  <div className="aspect-square rounded bg-secondary flex items-center justify-center">
                    <ImageIcon className="w-12 h-12 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Price</p>
                  <p className="text-2xl font-bold text-foreground">
                    {formatCurrency(selectedProduct.price, selectedProduct.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Category</p>
                  <p className="font-medium text-foreground">
                    {selectedProduct.category?.name || "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <div className="flex flex-col gap-1 items-start">
                    <Badge
                      className={`${
                        selectedProduct.is_active
                          ? "bg-green-100 text-green-800"
                          : "bg-secondary text-foreground"
                      }`}
                    >
                      {selectedProduct.is_active ? "Active" : "Inactive"}
                    </Badge>
                    {hasActiveVariants(selectedProduct) === false && (
                      <Badge
                        variant="outline"
                        className="text-[11px] bg-amber-50 text-amber-700 border-amber-200"
                      >
                        Hidden from the store until variants are added
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="pt-4 border-t space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Stock Quantity</p>
                      <p className="text-lg font-semibold text-foreground">
                        {selectedProduct.stock_quantity}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Reserved</p>
                      <p className="text-lg font-semibold text-foreground">
                        {selectedProduct.reserved_quantity}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Available</p>
                      <p className="text-lg font-semibold text-foreground">
                        {getAvailableStock(selectedProduct)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Sold</p>
                      <p className="text-lg font-semibold text-foreground">
                        {selectedProduct.sold_quantity}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="pt-4 border-t text-sm text-muted-foreground">
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
                <p className="text-sm text-muted-foreground">Description</p>
                <p className="text-foreground mt-2">
                  {selectedProduct.description}
                </p>
              </div>
            )}

            {/* Fashion Variants List */}
            {selectedProduct.variants && selectedProduct.variants.length > 0 && (
              <div className="py-4 border-t space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h4 className="text-sm font-bold text-foreground">
                    Variants ({selectedProduct.variants.length})
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
                    Add Variants
                  </Button>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {selectedProduct.variants.map((v) => (
                    <div
                      key={v.id}
                      className="flex items-center justify-between p-2.5 rounded-md border border-border/80 bg-background text-xs"
                    >
                      <div>
                        <span className="font-mono font-bold text-foreground">{v.sku}</span>
                        <span className="text-muted-foreground ml-2">
                          Size {v.size} · {v.color_name}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="font-semibold text-foreground">
                          Stock: {v.stock_quantity} (Available: {v.available_stock})
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-[11px] h-7 px-2"
                          onClick={() => setStockDialogVariant(v)}
                        >
                          Adjust Stock
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
          <AlertDialogContent className="admin-dialog">
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
          <DialogContent className="admin-dialog max-w-3xl max-h-[90vh] overflow-y-auto p-0 border-0 bg-transparent shadow-none">
            <DialogTitle className="sr-only">Clothing size and color variants</DialogTitle>
            <DialogDescription className="sr-only">Generate size and color combinations for this product.</DialogDescription>
            <VariantMatrixGenerator
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
