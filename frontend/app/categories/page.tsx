"use client";
import { useEffect, useState, useRef } from "react";
import { apiPost, apiPatch, apiDelete } from "@/lib/api";
import { useCategoryOptions } from '@/hooks/use-categories';
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
  const { categories: allCategories, isLoading: loading, error, mutate } = useCategoryOptions();
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const actionPending = useRef(false);
  const roots = allCategories.filter(category => category.parent_id == null);
  const categoryById = new Map(allCategories.map(category => [category.id, category]));
  const filtered = allCategories.filter(category =>
    (group == null || category.id === group || category.parent_id === group) &&
    `${category.name} ${category.slug || ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  );
  const total = filtered.length;
  const categories = filtered.slice((page - 1) * 20, page * 20);
  const [actionError, setActionError] = useState<string | null>(null);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deleteCategory, setDeleteCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    slug: string;
    parent_id: number | null;
    description: string;
  }>({
    name: "",
    slug: "",
    parent_id: null,
    description: "",
  });
  useEffect(() => { if (!loading && !error && page > 1 && categories.length === 0) setPage(page - 1); }, [loading, error, page, categories.length]);
  const runAction = async (action: () => Promise<void>) => {
    if (actionPending.current) return;
    actionPending.current = true;
    setBusy(true);
    setActionError(null);
    try { await action(); }
    catch (error) { setActionError(error instanceof Error ? error.message : 'Action failed'); }
    finally { actionPending.current = false; setBusy(false); }
  };

  const resetFormData = () => {
    setFormData({
      name: "",
      slug: "",
      parent_id: null,
      description: "",
    });
  };

  const openEditCategory = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      slug: category.slug || "",
      parent_id: category.parent_id ?? null,
      description: category.description || "",
    });
    setCreateDialogOpen(true);
  };

  const handleCreateCategory = async () => {
    const payload = {
      name: formData.name.trim(),
      slug: formData.slug.trim() || undefined,
      parent_id: formData.parent_id,
      description: formData.description.trim() || undefined,
    };
    await apiPost<Category, typeof payload>(
      "/categories",
      payload,
    );
    await mutate();
    resetFormData();
    setCreateDialogOpen(false);
  };

  const handleUpdateCategory = async () => {
    if (!editingCategory) return;
    const payload = {
      name: formData.name.trim(),
      slug: formData.slug.trim() || undefined,
      parent_id: formData.parent_id,
      description: formData.description.trim() || undefined,
    };
    await apiPatch<Category, typeof payload>(
      `/categories/${editingCategory.id}`,
      payload,
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
      <Header title="Clothing categories" subtitle="Áo · Quần · Váy & Đầm · Áo khoác — quản lý danh mục quần áo hai cấp" />

      <main className="flex-1 p-4 md:p-8 space-y-6">
        <section aria-label="Clothing groups" className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {roots.map(root => (
            <button key={root.id} type="button" aria-pressed={group === root.id}
              onClick={() => { setGroup(group === root.id ? null : root.id); setPage(1); }}
              className={`rounded-2xl border p-4 text-left transition-colors ${group === root.id ? "border-sky-500 bg-sky-50 ring-1 ring-sky-500" : "border-slate-200 bg-white hover:border-sky-300"}`}>
              <span className="block font-semibold text-slate-900">{root.name}</span>
              <span className="mt-1 block text-xs text-slate-500">{allCategories.filter(category => category.parent_id === root.id).length} subcategories</span>
            </button>
          ))}
        </section>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="w-full sm:max-w-sm space-y-1.5">
            <label htmlFor="category-search" className="text-sm font-medium text-slate-700">Search categories</label>
            <Input id="category-search" placeholder="Search clothing categories..." value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} />
          </div>
          <Button variant="outline" onClick={() => { setSearch(""); setGroup(null); setPage(1); }}>All categories ({allCategories.length})</Button>
        </div>
        <div className="mb-6 flex justify-end">
          <Dialog
            open={createDialogOpen}
            onOpenChange={(open) => {
              if (busy) return;
              setActionError(null);
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
                  Organize clothing into a main group and its subcategories. Size and color belong to product variants.
                </DialogDescription>
              </DialogHeader>

              <form id="category-form" className="grid gap-4 py-4" onSubmit={event => { event.preventDefault(); if (formData.name.trim()) void runAction(editingCategory ? handleUpdateCategory : handleCreateCategory); }}>
                <div className="grid gap-2">
                  <label htmlFor="name" className="text-sm font-medium">
                    Name
                  </label>
                  <Input
                    maxLength={255}
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
                  <label htmlFor="parent_id" className="text-sm font-medium">
                    Parent Category (Danh mục cha)
                  </label>
                  <select
                    id="parent_id"
                    disabled={!!editingCategory && allCategories.some(category => category.parent_id === editingCategory.id)}
                    className="w-full px-3 py-2 border border-input rounded-md text-sm bg-white"
                    value={formData.parent_id ?? ""}
                    onChange={(e) =>
                      setFormData((current) => ({
                        ...current,
                        parent_id: e.target.value ? parseInt(e.target.value) : null,
                      }))
                    }
                  >
                    <option value="">-- None (Danh mục gốc cấp 1) --</option>
                    {roots
                      .filter((c) => !editingCategory || c.id !== editingCategory.id)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                  <p className="text-xs text-slate-500">Only main groups can be parents. Groups with subcategories must remain at the top level.</p>
                </div>

                <div className="grid gap-2">
                  <label htmlFor="slug" className="text-sm font-medium">
                    Slug (URL định danh)
                  </label>
                  <Input
                    id="slug"
                    placeholder="VD: ao-thun-nam"
                    value={formData.slug}
                    onChange={(e) =>
                      setFormData((current) => ({
                        ...current,
                        slug: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="grid gap-2">
                  <label htmlFor="description" className="text-sm font-medium">
                    Description
                  </label>
                  <textarea
                    maxLength={1000}
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
                {actionError && <p role="alert" className="text-sm text-rose-600">{actionError}</p>}
              </form>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  form="category-form"
                  disabled={busy || !formData.name.trim()}
                >
                  {editingCategory ? "Update Category" : "Create Category"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        {(error || (actionError && !createDialogOpen && !deleteCategory)) && <p role="alert" className="text-sm text-rose-600">{actionError || error?.message}<button onClick={()=>mutate()}>Retry</button></p>}
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
                    <TableHead className="text-slate-600">Parent group</TableHead>
                    <TableHead className="text-slate-600">Slug</TableHead>
                    <TableHead className="text-slate-600">
                      Description
                    </TableHead>

                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!categories.length && <TableRow><TableCell colSpan={5} className="p-8 text-center text-slate-500">No clothing categories match your search.</TableCell></TableRow>}
                  {categories.map((category) => (
                    <TableRow key={category.id} className="border-slate-200">
                      <TableCell className="font-medium text-slate-900">
                        {category.name}
                        <span className="mt-1 block text-xs font-normal text-slate-400">{category.parent_id == null ? "Main group" : "Subcategory"}</span>
                      </TableCell>
                      <TableCell className="text-slate-600">{category.parent_id == null ? "—" : categoryById.get(category.parent_id)?.name || "Unknown group"}</TableCell>
                      <TableCell className="text-xs text-slate-500">{category.slug}</TableCell>
                      <TableCell className="text-slate-600">
                        {category.description}
                      </TableCell>

                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" aria-label={`Actions for ${category.name}`}>
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
          onOpenChange={(open) => { if (!open && !busy) setDeleteCategory(null); }}
        >
          <AlertDialogContent>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteCategory.name}&quot;?
              This action cannot be undone.
            </AlertDialogDescription>

            {actionError && <p role="alert" className="text-sm text-rose-600">{actionError}</p>}
            <div className="flex gap-2 justify-end">
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={busy}
                onClick={event => { event.preventDefault(); void runAction(() => handleDeleteCategory(deleteCategory)); }}
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
