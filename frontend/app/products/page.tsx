"use client";


import { ProductFormFields } from "@/components/admin/product-form-fields";
import { VariantMatrixGenerator } from "@/components/admin/variant-matrix-generator";
import { VariantStockDialog } from "@/components/admin/variant-stock-dialog";
import { DeleteProductDialog } from "@/components/admin/delete-product-dialog";
import { ProductDetailsDialog } from "@/components/admin/product-details-dialog";
import { AdminProductList } from "@/components/admin/product-list";
import { Header } from "@/components/header";
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
import { Input } from "@/components/ui/input";
import {
Select,
SelectContent,
SelectItem,
SelectTrigger,
SelectValue,
} from "@/components/ui/select";
import { useCategoryOptions } from "@/hooks/use-categories";
import { useProducts } from "@/hooks/use-products";
import { apiDelete, apiGet, apiPatch, apiPost, apiUpload } from "@/lib/api";
import {
Product,
ProductFormData,
ProductVariant
} from "@/lib/types";
import {
Grid3x3,
Image as ImageIcon,
List,
Plus,
Search,
} from "lucide-react";
import { useEffect,useRef,useState } from "react";

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
  const [stagedImages, setStagedImages] = useState<File[]>([]);
  const storedImages = useRef(0);
  const [garmentImage, setGarmentImage] = useState<File | null>(null);
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
    vton_enabled: true,
    brand: "",
    gender: "unisex",
    material: "",
    fit: "",
    care_instructions: "",
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
      currency: "VND",
      category_id: null,
      stock_quantity: 0,
      reserved_quantity: 0,
      sold_quantity: 0,
      description: "",
      is_active: false,
      vton_enabled: true,
      brand: "",
      gender: "unisex",
      material: "",
      fit: "",
      care_instructions: "",
    });
    setStagedImages([]);
    storedImages.current = 0;
    setGarmentImage(null);
  };
  /** Uploads files picked in the dialog. Each one is cleared once stored, so a retry never repeats it. */
  const uploadPendingImages = async (productId: number) => {
    // Uploaded in the chosen order; each file leaves the list once stored, so a retry never repeats it.
    const queue = [...stagedImages];
    while (queue.length > 0) {
      const imageFormData = new FormData();
      imageFormData.append("file", queue[0]);
      imageFormData.append("is_primary", String(storedImages.current === 0));
      await apiUpload<{ id: string; url: string }>(
        `/products/${productId}/upload-image`,
        imageFormData,
      );
      storedImages.current += 1;
      queue.shift();
      setStagedImages([...queue]);
    }
    if (garmentImage) {
      const garmentData = new FormData();
      garmentData.append("file", garmentImage);
      garmentData.append("is_primary", "false");
      garmentData.append("kind", "vton_garment");
      await apiUpload<{ id: string; url: string }>(
        `/products/${productId}/images`,
        garmentData,
      );
      setGarmentImage(null);
    }
  };
  const handleCreateProduct = async () => {
    const { stock_quantity, reserved_quantity, sold_quantity, ...createPayload } = formData;
    const createdProduct = await apiPost<Product, typeof createPayload>(
      "/products",
      createPayload,
    );
    if (!createdProduct.id) return;
    setEditingProduct(createdProduct);
    await uploadPendingImages(createdProduct.id);

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
    setStagedImages([]);
    storedImages.current = 0;
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
      vton_enabled: product.vton_enabled ?? true,
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
    await uploadPendingImages(editingProduct.id);
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
        {saveError && !createDialogOpen && (
          <p
            role="alert"
            className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
          >
            {saveError}
          </p>
        )}
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
                <ProductFormFields
                  formData={formData}
                  onChange={updateFormData}
                  categories={categories}
                  editingProduct={editingProduct}
                  saveError={saveError}
                  stagedImages={stagedImages}
                  onStagedImagesChange={setStagedImages}
                  onBusyChange={setImageBusy}
                  onImagesChange={(images) =>
                    setEditingProduct((current) => (current ? { ...current, images } : current))
                  }
                  onProductsChanged={() => void mutateProducts()}
                  onGarmentSelected={setGarmentImage}
                />

                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    disabled={saving || imageBusy}
                    onClick={() => { setCreateDialogOpen(false); setStagedImages([]); setGarmentImage(null); }}
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
        <AdminProductList
          loading={loading}
          viewMode={viewMode}
          products={filteredProducts}
          totalProducts={totalProducts}
          currentPage={currentPage}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setCurrentPage(1);
          }}
          onView={openProductDetails}
          onEdit={openEditProduct}
          onAddVariants={(product) => {
            setMatrixProduct(product);
            setMatrixDialogOpen(true);
          }}
          onDelete={setDeleteProduct}
        />

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

      {selectedProduct && (
        <ProductDetailsDialog
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAddVariants={(product) => {
            setMatrixProduct(product);
            setMatrixDialogOpen(true);
          }}
          onAdjustStock={setStockDialogVariant}
        />
      )}

      {deleteProduct && (
        <DeleteProductDialog
          product={deleteProduct}
          onClose={() => setDeleteProduct(null)}
          onConfirm={handleDeleteProduct}
        />
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
                } catch (err: unknown) {
                  alert(err instanceof Error && err.message ? err.message : "Failed to generate variants");
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
          } catch (err: unknown) {
            alert(err instanceof Error && err.message ? err.message : "Failed to adjust variant stock");
          }
        }}
      />
    </div>
  );
}
