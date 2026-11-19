"use client";

import { ImageUploader } from "@/components/image-uploader";
import { AdminProductImages } from "@/components/admin/product-images";
import { TryOnStatus } from "@/components/admin/try-on-status";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  Category,
  Product,
  ProductFormData,
  ProductImage,
} from "@/lib/types";

interface ProductFormFieldsProps {
  formData: ProductFormData;
  onChange: <K extends keyof ProductFormData>(
    key: K,
    value: ProductFormData[K],
  ) => void;
  categories: Category[];
  editingProduct: Product | null;
  saveError: string | null;
  stagedImages: File[];
  onStagedImagesChange: (files: File[]) => void;
  onBusyChange: (busy: boolean) => void;
  onImagesChange: (images: ProductImage[]) => void;
  onProductsChanged: () => void;
  onGarmentSelected: (file: File | null) => void;
}

const hasActiveVariants = (p: Product | null | undefined) =>
  p?.variants ? p.variants.some((v) => v.is_active) : null;

/** Fields of the admin create/edit product dialog (presentational; state lives in the page). */
export function ProductFormFields({
  formData,
  onChange,
  categories,
  editingProduct,
  saveError,
  stagedImages,
  onStagedImagesChange,
  onBusyChange,
  onImagesChange,
  onProductsChanged,
  onGarmentSelected,
}: ProductFormFieldsProps) {
  return (
    <div className="grid gap-4 py-4">
      <div className="grid gap-2">
        <label htmlFor="name" className="text-sm font-medium">
          Product Name
        </label>
        <Input
          id="name"
          placeholder="Enter product name"
          value={formData.name}
          onChange={(e) => onChange("name", e.target.value)}
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
              onChange("price", Number(e.target.value))
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
              onChange("currency", value)
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
            onChange(
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
            onValueChange={(val) => onChange("is_active", val === "active")}
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
      <div className="grid gap-2 rounded border border-border p-3">
        <label htmlFor="vton_enabled" className="flex items-center gap-2 text-sm font-medium">
          <input
            id="vton_enabled"
            type="checkbox"
            className="h-4 w-4"
            checked={formData.vton_enabled !== false}
            onChange={(e) => onChange("vton_enabled", e.target.checked)}
          />
          Offer virtual try-on
        </label>
        <p className="text-xs text-muted-foreground">
          Turn off if the model does not try this garment on well. For a good result: garment only on a plain
          background, front view, no mannequin or person, PNG/JPG/WEBP at least 256 px and up to 5MB, tagged
          with the right colour. Best for tops; the category must support try-on.
        </p>
        <TryOnStatus
          productId={editingProduct?.id}
          imageId={editingProduct?.images?.find(image => image.kind !== "vton_garment" && /\.(png|jpe?g|webp)$/i.test(image.url.split("?")[0]))?.id}
          refreshKey={`${editingProduct?.images?.length ?? 0}-${editingProduct?.category?.id ?? ""}`}
        />
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
            onChange("description", e.target.value)
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
            onChange={(e) => onChange("brand", e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <label htmlFor="gender" className="text-sm font-medium">
            Gender
          </label>
          <Select
            value={formData.gender || "unisex"}
            onValueChange={(value) => onChange("gender", value)}
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
            onChange={(e) => onChange("material", e.target.value)}
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
            onChange={(e) => onChange("fit", e.target.value)}
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
          onChange={(e) => onChange("care_instructions", e.target.value)}
        />
      </div>
      {saveError && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
        >
          {saveError}
        </p>
      )}
      <AdminProductImages
        stagedFiles={stagedImages}
        onStagedFilesChange={onStagedImagesChange}
        onBusyChange={onBusyChange}
        productId={editingProduct?.id}
        images={editingProduct?.images}
        colors={Array.from(new Set((editingProduct?.variants ?? []).map((variant) => variant.color_name).filter(Boolean)))}
        onImagesChange={(images) => {
          onImagesChange(images);
          onProductsChanged();
        }}
        onUploadSuccess={(url) => {
          if (url && !url.startsWith("blob:")) {
            onProductsChanged();
          }
        }}
      />
      {!editingProduct && (
        <ImageUploader
          kind="vton_garment"
          isPrimary={false}
          label="Try-on garment image (optional)"
          hint="Garment only, plain background, at least 256 px. Enables virtual try-on."
          onFileSelected={onGarmentSelected}
          onUploadSuccess={() => {}}
        />
      )}
    </div>
  );
}
