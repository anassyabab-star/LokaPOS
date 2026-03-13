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

  const panelClass = "rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4";
  const fieldClass =
    "w-full rounded border border-[color:var(--app-border)] bg-[color:var(--app-bg)] px-3 py-2 text-[color:var(--app-text)] placeholder:text-[color:var(--app-muted)]";
  const neutralButtonClass =
    "rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface-soft)] px-3 py-1.5 text-xs text-[color:var(--app-text)]";

  return (
    <div className="space-y-4 p-4 text-[color:var(--app-text)] md:space-y-6 md:p-6">
      <div>
        <h1 className="text-xl font-semibold md:text-2xl">Categories</h1>
        <p className="mt-1 text-sm text-[color:var(--app-muted)]">Manage category list used by products.</p>
      </div>

      <section className={panelClass}>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_auto]">
          <input
            placeholder="Category name"
            className={fieldClass}
            value={name}
            onChange={e => setName(e.target.value)}
          />

          <button
            onClick={() => void handleSubmit()}
            disabled={saving || !name.trim()}
            className="rounded bg-[#7F1D1D] px-4 py-2 text-[#ffffff] disabled:opacity-50"
          >
            {saving ? "Saving..." : editingId ? "Update Category" : "Add Category"}
          </button>

          {editingId ? (
            <button onClick={cancelEdit} className="rounded border border-[color:var(--app-border)] bg-[color:var(--app-surface-soft)] px-4 py-2 text-[color:var(--app-text)]">
              Cancel
            </button>
          ) : null}
        </div>
      </section>

      <section className={panelClass}>
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-[color:var(--app-muted)]">{filteredCategories.length} category</p>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search category"
            className={`${fieldClass} text-sm md:max-w-xs`}
          />
        </div>

        {loading ? (
          <p className="text-sm text-[color:var(--app-muted)]">Loading categories...</p>
        ) : filteredCategories.length === 0 ? (
          <p className="text-sm text-[color:var(--app-muted)]">No categories found.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {filteredCategories.map(c => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-lg border border-[color:var(--app-border)] bg-[color:var(--app-bg)] p-3"
              >
                <p className="font-medium">{c.name}</p>

                <div className="flex gap-2">
                  <button
                    onClick={() => startEdit(c)}
                    className={neutralButtonClass}
                  >
                    Edit
                  </button>

                  <button
                    onClick={() => void handleDelete(c.id)}
                    className="rounded bg-red-700 px-3 py-1.5 text-xs text-[#ffffff]"
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
