"use client";

import React from "react";
import { usePos } from "../pos-context";
import { Product } from "../types";

export default function ProductsOverlay() {
  const s = usePos();

  // ━━━ Product management functions ━━━
  async function loadCategories() { try { const r = await fetch("/api/categories"); const d = await r.json(); s.setAllCategories(Array.isArray(d) ? d : []); } catch {} }

  function openAddProduct() {
    s.setProdName(""); s.setProdPrice(""); s.setProdCost(""); s.setProdStock("100"); s.setProdCategoryId(""); s.setProdImageUrl(""); s.setEditingProduct(null); s.setNewCatName("");
    s.setVariantName(""); s.setVariantPrice(""); s.setAddonName(""); s.setAddonPrice(""); s.setShowAddProduct(true); void loadCategories();
  }

  function openEditProduct(p: Product) {
    s.setProdName(p.name); s.setProdPrice(String(p.price)); s.setProdCost(""); s.setProdStock(String(p.stock)); s.setProdImageUrl("");
    s.setVariantName(""); s.setVariantPrice(""); s.setAddonName(""); s.setAddonPrice(""); s.setNewCatName("");
    s.setEditingProduct(p); s.setShowAddProduct(true); void loadCategories();
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    s.setProdImageUploading(true);
    try {
      const form = new FormData(); form.append("file", file);
      const res = await fetch("/api/products/upload-image", { method: "POST", body: form });
      const data = await res.json();
      if (data.file_url) s.setProdImageUrl(data.file_url); else alert(data.error || "Upload gagal");
    } catch { alert("Upload error"); } finally { s.setProdImageUploading(false); }
  }

  async function saveProduct() {
    if (!s.prodName.trim() || !s.prodPrice) { alert("Nama dan harga diperlukan"); return; }
    let categoryId = s.prodCategoryId;
    if (categoryId === "__new__" && s.newCatName.trim()) {
      try {
        await fetch("/api/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: s.newCatName.trim() }) });
        const cats = await (await fetch("/api/categories")).json();
        s.setAllCategories(Array.isArray(cats) ? cats : []);
        const created = (Array.isArray(cats) ? cats : []).find((c: { name: string }) => c.name === s.newCatName.trim());
        categoryId = created?.id || "";
      } catch {}
    }
    if (!categoryId || categoryId === "__new__") { alert("Pilih kategori"); return; }
    s.setProdSaving(true);
    try {
      if (s.editingProduct) {
        const body: Record<string, unknown> = { name: s.prodName.trim(), price: Number(s.prodPrice), stock: Number(s.prodStock || 0), category_id: categoryId };
        if (s.prodImageUrl) body.image_url = s.prodImageUrl;
        const res = await fetch(`/api/products/${s.editingProduct.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!res.ok) { alert("Gagal update"); return; }
        s.setShowAddProduct(false);
        const r = await fetch("/api/products"); const d = await r.json(); s.setProducts(Array.isArray(d) ? d : []);
      } else {
        const body: Record<string, unknown> = { name: s.prodName.trim(), price: Number(s.prodPrice), cost: Number(s.prodCost || 0), stock: Number(s.prodStock || 100), category_id: categoryId };
        if (s.prodImageUrl) body.image_url = s.prodImageUrl;
        const res = await fetch("/api/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || "Gagal tambah"); return; }
        const created = await res.json().catch(() => null);
        const r = await fetch("/api/products"); const d = await r.json(); s.setProducts(Array.isArray(d) ? d : []);
        if (created?.product?.id) {
          const newProd = (Array.isArray(d) ? d : []).find((p: Product) => p.id === created.product.id);
          if (newProd) { s.setEditingProduct(newProd); s.setAddedToast("Produk ditambah — tambah variant/addon di bawah"); return; }
        }
        s.setShowAddProduct(false);
      }
    } catch { alert("Ralat"); } finally { s.setProdSaving(false); }
  }

  async function addVariantToProduct(productId: string) {
    if (!s.variantName.trim()) return;
    await fetch("/api/products/add-variant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product_id: productId, name: s.variantName.trim(), price_adjustment: Number(s.variantPrice || 0) }) });
    s.setVariantName(""); s.setVariantPrice("");
    const r = await fetch("/api/products"); const d = await r.json(); s.setProducts(Array.isArray(d) ? d : []);
    const updated = (Array.isArray(d) ? d : []).find((p: Product) => p.id === productId);
    if (updated) s.setEditingProduct(updated);
  }

  async function addAddonToProduct(productId: string) {
    if (!s.addonName.trim()) return;
    await fetch("/api/products/add-addon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product_id: productId, name: s.addonName.trim(), price: Number(s.addonPrice || 0) }) });
    s.setAddonName(""); s.setAddonPrice("");
    const r = await fetch("/api/products"); const d = await r.json(); s.setProducts(Array.isArray(d) ? d : []);
    const updated = (Array.isArray(d) ? d : []).find((p: Product) => p.id === productId);
    if (updated) s.setEditingProduct(updated);
  }

  async function toggleProductActive(p: Product) {
    const newStock = Number(p.stock) > 0 ? 0 : 100;
    try { await fetch(`/api/products/${p.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stock: newStock }) });
      const r = await fetch("/api/products"); const d = await r.json(); s.setProducts(Array.isArray(d) ? d : []);
    } catch {}
  }

  return (
    <div className="screen-enter fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <button onClick={() => { s.setOverlay("none"); s.setShowAddProduct(false); }} className="text-sm text-gray-500">← Kembali</button>
        <span className="text-sm font-semibold text-gray-900">Products</span>
        <button onClick={openAddProduct} className="text-sm font-medium text-[#7F1D1D]">+ Tambah</button>
      </div>

      {/* Add/Edit form */}
      {s.showAddProduct && (
        <div className="border-b border-gray-200 px-4 py-4 space-y-3 bg-gray-50/50 max-h-[70vh] overflow-y-auto">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{s.editingProduct ? "Edit Product" : "Produk Baru"}</div>
          <input value={s.prodName} onChange={e => s.setProdName(e.target.value)} placeholder="Nama produk" className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#7F1D1D]" />
          <div className="flex gap-2">
            <input type="number" value={s.prodPrice} onChange={e => s.setProdPrice(e.target.value)} placeholder="Selling Price (RM)" className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#7F1D1D]" />
            <input type="number" value={s.prodCost} onChange={e => s.setProdCost(e.target.value)} placeholder="Cost Price" className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#7F1D1D]" />
          </div>
          <div className="flex gap-2">
            <input type="number" value={s.prodStock} onChange={e => s.setProdStock(e.target.value)} placeholder="Stock" className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#7F1D1D]" />
          </div>
          <select value={s.prodCategoryId} onChange={e => s.setProdCategoryId(e.target.value)} className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#7F1D1D] bg-white">
            <option value="">— Pilih kategori —</option>
            {s.allCategories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
            <option value="__new__">+ Kategori baru...</option>
          </select>
          {s.prodCategoryId === "__new__" && <input value={s.newCatName} onChange={e => s.setNewCatName(e.target.value)} placeholder="Nama kategori baru" className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#7F1D1D]" />}
          <div>
            <div className="text-xs text-gray-400 mb-1">Product Image (optional)</div>
            <div className="flex items-center gap-3">
              {s.prodImageUrl && <img src={s.prodImageUrl} alt="" className="h-12 w-12 rounded-lg object-cover border border-gray-200" />}
              <label className="cursor-pointer rounded-lg border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50">
                {s.prodImageUploading ? "Uploading..." : "Choose Image"}
                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" disabled={s.prodImageUploading} />
              </label>
            </div>
          </div>
          {s.editingProduct && (
            <div>
              <div className="text-xs text-gray-400 mb-1">Variants</div>
              {s.editingProduct.variants && s.editingProduct.variants.length > 0 && (
                <div className="mb-2 space-y-1">{s.editingProduct.variants.map(v => (
                  <div key={v.id} className="flex justify-between text-xs bg-white rounded-md border border-gray-100 px-3 py-1.5">
                    <span className="text-gray-700">{v.name}</span>
                    <span className="text-gray-400">+RM{v.price_adjustment.toFixed(2)}</span>
                  </div>
                ))}</div>
              )}
              <div className="flex gap-2">
                <input value={s.variantName} onChange={e => s.setVariantName(e.target.value)} placeholder="Variant name" className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-[#7F1D1D]" />
                <input type="number" value={s.variantPrice} onChange={e => s.setVariantPrice(e.target.value)} placeholder="+RM" className="w-20 rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-[#7F1D1D]" />
                <button onClick={() => void addVariantToProduct(s.editingProduct!.id)} className="shrink-0 rounded-lg bg-[#7F1D1D] px-3 py-2 text-xs font-medium text-white">Add</button>
              </div>
            </div>
          )}
          {s.editingProduct && (
            <div>
              <div className="text-xs text-gray-400 mb-1">Addons</div>
              {s.editingProduct.addons && s.editingProduct.addons.length > 0 && (
                <div className="mb-2 space-y-1">{s.editingProduct.addons.map(a => (
                  <div key={a.id} className="flex justify-between text-xs bg-white rounded-md border border-gray-100 px-3 py-1.5">
                    <span className="text-gray-700">{a.name}</span>
                    <span className="text-gray-400">+RM{a.price.toFixed(2)}</span>
                  </div>
                ))}</div>
              )}
              <div className="flex gap-2">
                <input value={s.addonName} onChange={e => s.setAddonName(e.target.value)} placeholder="Addon name" className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-[#7F1D1D]" />
                <input type="number" value={s.addonPrice} onChange={e => s.setAddonPrice(e.target.value)} placeholder="+RM" className="w-20 rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-[#7F1D1D]" />
                <button onClick={() => void addAddonToProduct(s.editingProduct!.id)} className="shrink-0 rounded-lg bg-[#7F1D1D] px-3 py-2 text-xs font-medium text-white">Add</button>
              </div>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={() => s.setShowAddProduct(false)} className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-600">Batal</button>
            <button onClick={() => void saveProduct()} disabled={s.prodSaving || s.prodImageUploading} className="flex-1 rounded-lg bg-[#7F1D1D] py-2.5 text-sm font-semibold text-white disabled:opacity-50">{s.prodSaving ? "Saving..." : s.prodImageUploading ? "Uploading..." : "Simpan"}</button>
          </div>
        </div>
      )}

      {/* Product list */}
      <div className="flex-1 overflow-y-auto">
        {s.products.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-sm text-gray-400">Tiada produk</div>
        ) : (
          s.products.map(p => (
            <div key={p.id} className={`flex items-center justify-between border-b border-gray-200 px-4 py-3.5 ${Number(p.stock) <= 0 ? "opacity-40" : ""}`}>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-gray-900">{p.name}</div>
                <div className="mt-0.5 text-xs text-gray-400">
                  {p.category || "—"} · Stock: {p.stock}
                  {p.variants && p.variants.length > 0 && ` · ${p.variants.length} variants`}
                  {p.addons && p.addons.length > 0 && ` · ${p.addons.length} addons`}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-semibold tabular-nums text-gray-700">RM{Number(p.price).toFixed(2)}</span>
                <button onClick={() => openEditProduct(p)} className="rounded-md border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-500 active:bg-gray-100">Edit</button>
                <button onClick={() => void toggleProductActive(p)} className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${Number(p.stock) > 0 ? "border border-gray-200 text-gray-500" : "bg-[#7F1D1D] text-white"}`}>
                  {Number(p.stock) > 0 ? "Hide" : "Show"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
