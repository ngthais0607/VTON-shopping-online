"use client";
import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import { Category } from "@/lib/types";

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

import { MoreVertical, Plus } from "lucide-react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deleteCategory, setDeleteCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
  });
  useEffect(() => {
    async function loadCategories() {
      try {
        const data = await apiGet<Category[]>("/categories");
        setCategories(data);
      } finally {
        setLoading(false);
      }
    }
    loadCategories();
  }, []);

  const resetFormData = () => {
    setFormData({
      name: "",
      description: "",
    });
  };

  const openEditCategory = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description || "",
    });
    setCreateDialogOpen(true);
  };

  const handleCreateCategory = async () => {
    const createdCategory = await apiPost<Category, typeof formData>(
      "/categories",
      formData,
    );
    setCategories((current) => [createdCategory, ...current]);
    resetFormData();
    setCreateDialogOpen(false);
  };

  const handleUpdateCategory = async () => {
    if (!editingCategory) return;
    const updatedCategory = await apiPut<Category, typeof formData>(
      `/categories/${editingCategory.id}`,
      formData,
    );
    setCategories((current) =>
      current.map((category) =>
        category.id === updatedCategory.id ? updatedCategory : category,
      ),
    );
    resetFormData();
    setEditingCategory(null);
    setCreateDialogOpen(false);
  };

  const handleDeleteCategory = async (category: Category) => {
    await apiDelete<{ message: string }>(
      `/categories/${category.id}`
    );
    setCategories((current) =>
      current.filter((item) => item.id !== category.id),
    );
    setDeleteCategory(null);
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Categories" subtitle="Manage product categories" />

      <main className="flex-1 p-8">
        <div className="mb-6 flex justify-end">
          <Dialog
            open={createDialogOpen}
            onOpenChange={(open) => {
              setCreateDialogOpen(open);
              if (!open) {
                setEditingCategory(null);
                resetFormData();
              }
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create Category
              </Button>
            </DialogTrigger>

            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingCategory ? "Edit Category" : "Create Category"}
                </DialogTitle>
                <DialogDescription>
                  Fill in the category details below
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <label htmlFor="name" className="text-sm font-medium">
                    Name
                  </label>
                  <Input
                    id="name"
                    placeholder="Enter category name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData((current) => ({
                        ...current,
                        name: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="grid gap-2">
                  <label htmlFor="description" className="text-sm font-medium">
                    Description
                  </label>
                  <textarea
                    id="description"
                    placeholder="Category description"
                    className="w-full px-3 py-2 border border-input rounded-md text-sm"
                    rows={3}
                    value={formData.description}
                    onChange={(e) =>
                      setFormData((current) => ({
                        ...current,
                        description: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  disabled={!formData.name}
                  onClick={
                    editingCategory
                      ? handleUpdateCategory
                      : handleCreateCategory
                  }
                >
                  {editingCategory ? "Update Category" : "Create Category"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        {loading ? (
          <Card className="p-8 text-center text-slate-600">
            Loading categories...
          </Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-200 bg-slate-50">
                    <TableHead className="text-slate-600">Name</TableHead>
                    <TableHead className="text-slate-600">
                      Description
                    </TableHead>
                    <TableHead className="text-slate-600">Products</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((category) => (
                    <TableRow key={category.id} className="border-slate-200">
                      <TableCell className="font-medium text-slate-900">
                        {category.name}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {category.description}
                      </TableCell>
                      <TableCell className="text-slate-900">
                        {category.product_count}
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
                              onClick={() => openEditCategory(category)}
                            >
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => setDeleteCategory(category)}
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
          </Card>
        )}
      </main>
      {deleteCategory && (
        <AlertDialog
          open={!!deleteCategory}
          onOpenChange={() => setDeleteCategory(null)}
        >
          <AlertDialogContent>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteCategory.name}&quot;?
              This action cannot be undone.
            </AlertDialogDescription>

            <div className="flex gap-2 justify-end">
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => handleDeleteCategory(deleteCategory)}
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
