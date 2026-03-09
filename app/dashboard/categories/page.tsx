"use client";

import { useEffect, useMemo, useState } from "react";

type Category = {
  id: string;
  name: string;
};

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadCategories = async () => {
    setLoading(true);
    const res = await fetch("/api/categories", { cache: "no-store" });
    const data = await res.json();
    setCategories(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => {
    void loadCategories();
  }, []);

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(c => c.name.toLowerCase().includes(q));
  }, [categories, search]);

  const handleSubmit = async () => {
    if (!name.trim()) return;

    setSaving(true);

    if (editingId) {
      await fetch(`/api/categories/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      setEditingId(null);
    } else {
      await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
    }

    setName("");
    await loadCategories();
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const ok = window.confirm("Delete this category?");
    if (!ok) return;

    const res = await fetch(`/api/categories/${id}`, {
      method: "DELETE",
    });

    const data = await res.json();

    if (!data.success) {
      alert("Category masih digunakan oleh product.");
    }

    await loadCategories();
  };

  const startEdit = (c: Category) => {
    setEditingId(c.id);
    setName(c.name);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setName("");
  };

  return (
    <div className="space-y-4 p-4 text-white md:space-y-6 md:p-6">
      <div>
        <h1 className="text-xl font-semibold md:text-2xl">Categories</h1>
        <p className="mt-1 text-sm text-gray-400">Manage category list used by products.</p>
      </div>

      <section className="rounded-xl border border-gray-800 bg-[#111] p-4">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_auto]">
          <input
            placeholder="Category name"
            className="w-full rounded border border-gray-700 bg-black px-3 py-2"
            value={name}
            onChange={e => setName(e.target.value)}
          />

          <button
            onClick={() => void handleSubmit()}
            disabled={saving || !name.trim()}
            className="rounded bg-[#7F1D1D] px-4 py-2 disabled:opacity-50"
          >
            {saving ? "Saving..." : editingId ? "Update Category" : "Add Category"}
          </button>

          {editingId ? (
            <button onClick={cancelEdit} className="rounded bg-gray-700 px-4 py-2">
              Cancel
            </button>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-gray-800 bg-[#111] p-4">
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-gray-400">{filteredCategories.length} category</p>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search category"
            className="w-full rounded border border-gray-700 bg-black px-3 py-2 text-sm md:max-w-xs"
          />
        </div>

        {loading ? (
          <p className="text-sm text-gray-400">Loading categories...</p>
        ) : filteredCategories.length === 0 ? (
          <p className="text-sm text-gray-500">No categories found.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {filteredCategories.map(c => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-lg border border-gray-800 bg-black/40 p-3"
              >
                <p className="font-medium">{c.name}</p>

                <div className="flex gap-2">
                  <button
                    onClick={() => startEdit(c)}
                    className="rounded bg-gray-700 px-3 py-1.5 text-xs"
                  >
                    Edit
                  </button>

                  <button
                    onClick={() => void handleDelete(c.id)}
                    className="rounded bg-red-700 px-3 py-1.5 text-xs"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
