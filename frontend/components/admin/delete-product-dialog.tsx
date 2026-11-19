"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Product } from "@/lib/types";

interface DeleteProductDialogProps {
  product: Product;
  onClose: () => void;
  onConfirm: (product: Product) => void;
}

export function DeleteProductDialog({ product, onClose, onConfirm }: DeleteProductDialogProps) {
  return (
        <AlertDialog
          open={!!product}
          onOpenChange={() => onClose()}
        >
          <AlertDialogContent className="admin-dialog">
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{product.name}&quot;?
              This action cannot be undone.
            </AlertDialogDescription>
            <div className="flex gap-2 justify-end">
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onConfirm(product)}
                className="bg-red-600 hover:bg-red-700"
              >
                Delete
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>
  );
}
