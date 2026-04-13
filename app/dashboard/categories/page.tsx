"use client";

import { useEffect, useMemo, useState } from "react";

type Category = {
  id: string;
  name: string;
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 8,
  fontSize: 13,
  color: "var(--d-text-1)",
  background: "var(--d-input-bg)",
  border: "1px solid var(--d-border)",
  outline: "none",
  boxSizing: "border-box",
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

  useEffect(() => { void loadCategories(); }, []);

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
    const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!data.success) alert("Category masih digunakan oleh product.");
    await loadCategories();
  };

  const startEdit = (c: Category) => {
    setEditingId(c.id);
    setName(c.name);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => { setEditingId(null); setName(""); };

  return (
    <div style={{ minHeight: "100vh", background: "var(--d-bg)", padding: "28px 28px 40px", color: "var(--d-text-1)" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>Categories</h1>
        <p style={{ fontSize: 13, color: "var(--d-text-3)", marginTop: 4 }}>Manage category list used by products.</p>
      </div>

      {/* Add/Edit form */}
      <div
        style={{
          background: "var(--d-surface)",
          border: "1px solid var(--d-border)",
          borderRadius: 14,
          padding: "16px 18px",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10 }}>
          <input
            placeholder="Category name"
            style={inputStyle}
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") void handleSubmit(); }}
          />
          <button
            onClick={() => void handleSubmit()}
            disabled={saving || !name.trim()}
            style={{
              padding: "9px 18px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              background: "var(--d-accent)",
              border: "none",
              cursor: saving || !name.trim() ? "not-allowed" : "pointer",
              opacity: saving || !name.trim() ? 0.5 : 1,
              whiteSpace: "nowrap",
            }}
          >
            {saving ? "Saving..." : editingId ? "Update Category" : "Add Category"}
          </button>
          {editingId && (
            <button
              onClick={cancelEdit}
              style={{
                padding: "9px 14px",
                borderRadius: 8,
                fontSize: 13,
                color: "var(--d-text-2)",
                background: "transparent",
                border: "1px solid var(--d-border)",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Category list */}
      <div
        style={{
          background: "var(--d-surface)",
          border: "1px solid var(--d-border)",
          borderRadius: 14,
          padding: "16px 18px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
          <p style={{ fontSize: 13, color: "var(--d-text-3)" }}>{filteredCategories.length} categories</p>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search category"
            style={{ ...inputStyle, width: "auto", minWidth: 200 }}
          />
        </div>

        {loading ? (
          <p style={{ fontSize: 13, color: "var(--d-text-3)" }}>Loading categories...</p>
        ) : filteredCategories.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--d-text-3)" }}>No categories found.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
            {filteredCategories.map(c => (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid var(--d-border-soft)",
                  background: "var(--d-surface-hover)",
                }}
              >
                <p style={{ fontSize: 14, fontWeight: 500, color: "var(--d-text-1)" }}>{c.name}</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => startEdit(c)}
                    style={{
                      padding: "4px 12px",
                      borderRadius: 7,
                      fontSize: 12,
                      fontWeight: 500,
                      color: "var(--d-text-2)",
                      background: "transparent",
                      border: "1px solid var(--d-border)",
                      cursor: "pointer",
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => void handleDelete(c.id)}
                    style={{
                      padding: "4px 12px",
                      borderRadius: 7,
                      fontSize: 12,
                      fontWeight: 500,
                      color: "#fff",
                      background: "var(--d-error)",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
