"use client";
import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { useCategories } from '@/hooks/use-categories';
import { PaginationControls } from '@/components/pagination-controls';
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
  const [page, setPage] = useState(1);
  const {categories, total, isLoading: loading, error, mutate} = useCategories({page});
  const [actionError, setActionError] = useState<string | null>(null);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deleteCategory, setDeleteCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
  });
  useEffect(() => { if (!loading && !error && page > 1 && categories.length === 0) setPage(page - 1); }, [loading, error, page, categories.length]);
  const runAction = async (action: () => Promise<void>) => { setActionError(null); try { await action(); } catch (error) { setActionError(error instanceof Error ? error.message : 'Action failed'); } };

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
    await mutate();
    resetFormData();
    setCreateDialogOpen(false);
  };

  const handleUpdateCategory = async () => {
    if (!editingCategory) return;
    const updatedCategory = await apiPatch<Category, typeof formData>(
      `/categories/${editingCategory.id}`,
      formData,
    );
    await mutate();
    resetFormData();
    setEditingCategory(null);
    setCreateDialogOpen(false);
  };

  const handleDeleteCategory = async (category: Category) => {
    await apiDelete<{ message: string }>(
      `/categories/${category.id}`
    );
    await mutate();
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
                      ? () => runAction(handleUpdateCategory)
                      : () => runAction(handleCreateCategory)
                  }
                >
                  {editingCategory ? "Update Category" : "Create Category"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        {(error || actionError) && <p role="alert">{actionError || error?.message}<button onClick={()=>mutate()}>Retry</button></p>}
        <PaginationControls page={page} pageSize={20} total={total} onPageChange={setPage} disabled={loading}/>
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
                onClick={() => runAction(() => handleDeleteCategory(deleteCategory))}
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
