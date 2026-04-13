"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Variant = {
  id: string;
  name: string;
  price_adjustment: number;
};

type Addon = {
  id: string;
  name: string;
  price: number;
};

type Product = {
  id: string;
  name: string;
  price: number;
  cost?: number;
  image_url?: string | null;
  stock: number;
  category?: string;
  category_id?: string | null;
  status?: "enabled" | "disabled";
  variants?: Variant[];
  addons?: Addon[];
};

type Category = {
  id: string;
  name: string;
};

type DraftValue = {
  name: string;
  price: string;
};

type ProductEditDraft = {
  name: string;
  category_id: string;
  price: string;
  cost: string;
  image_url: string;
  stock: string;
};

// Shared style helpers
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

const smallInputStyle: React.CSSProperties = {
  ...inputStyle,
  width: 80,
  flexShrink: 0,
};

const accentBtnStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  color: "#fff",
  background: "var(--d-accent)",
  border: "none",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const ghostBtnStyle: React.CSSProperties = {
  padding: "7px 14px",
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 500,
  color: "var(--d-text-2)",
  background: "transparent",
  border: "1px solid var(--d-border)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

export default function ProductsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const LOW_STOCK_THRESHOLD = 10;

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // New Product State
  const [newName, setNewName] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newCost, setNewCost] = useState("");
  const [newImageUrl, setNewImageUrl] = useState("");
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [newImageFileName, setNewImageFileName] = useState("");
  const [uploadingNewImage, setUploadingNewImage] = useState(false);
  const [newStock, setNewStock] = useState("");

  // Initial Variant/Addons when adding new product
  const [draftVariantName, setDraftVariantName] = useState("");
  const [draftVariantPrice, setDraftVariantPrice] = useState("");
  const [draftAddonName, setDraftAddonName] = useState("");
  const [draftAddonPrice, setDraftAddonPrice] = useState("");
  const [initialVariants, setInitialVariants] = useState<Array<{ name: string; price_adjustment: number }>>([]);
  const [initialAddons, setInitialAddons] = useState<Array<{ name: string; price: number }>>([]);

  // Per-product draft state
  const [variantDrafts, setVariantDrafts] = useState<Record<string, DraftValue>>({});
  const [addonDrafts, setAddonDrafts] = useState<Record<string, DraftValue>>({});
  const [productDrafts, setProductDrafts] = useState<Record<string, ProductEditDraft>>({});
  const [productImageFiles, setProductImageFiles] = useState<Record<string, File | null>>({});
  const [uploadingProductImageId, setUploadingProductImageId] = useState<string | null>(null);
  const [savingProductId, setSavingProductId] = useState<string | null>(null);

  // Edit variant/addon state
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [editingAddonId, setEditingAddonId] = useState<string | null>(null);
  const [editVariantName, setEditVariantName] = useState("");
  const [editVariantPrice, setEditVariantPrice] = useState("");
  const [editAddonName, setEditAddonName] = useState("");
  const [editAddonPrice, setEditAddonPrice] = useState("");

  useEffect(() => {
    void refreshProducts();
    void refreshCategories();
  }, []);

  useEffect(() => {
    if (!highlightId) return;
    const highlightedProduct = products.find(p => p.id === highlightId);
    if (!highlightedProduct) return;

    if (Number(highlightedProduct.stock || 0) > LOW_STOCK_THRESHOLD) {
      router.replace(pathname);
      return;
    }

    setExpandedId(highlightId);
  }, [highlightId, products, router, pathname]);

  async function refreshProducts() {
    const res = await fetch("/api/products?include_inactive=1");
    const data = await res.json();
    setProducts(Array.isArray(data) ? data : []);
  }

  async function refreshCategories() {
    const res = await fetch("/api/categories");
    const data = await res.json();
    setCategories(Array.isArray(data) ? data : []);
  }

  async function uploadProductImage(file: File) {
    const form = new FormData();
    form.append("file", file);

    const res = await fetch("/api/products/upload-image", {
      method: "POST",
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.file_url) {
      throw new Error(data?.error || "Failed to upload image");
    }
    return {
      fileUrl: String(data.file_url),
      fileName: String(data.file_name || file.name),
    };
  }

  async function uploadNewProductImage() {
    if (!newImageFile) { alert("Choose an image first"); return; }
    setUploadingNewImage(true);
    try {
      const uploaded = await uploadProductImage(newImageFile);
      setNewImageUrl(uploaded.fileUrl);
      setNewImageFileName(uploaded.fileName);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to upload image");
    } finally {
      setUploadingNewImage(false);
    }
  }

  async function uploadEditProductImage(productId: string) {
    const file = productImageFiles[productId];
    if (!file) { alert("Choose an image first"); return; }
    setUploadingProductImageId(productId);
    try {
      const uploaded = await uploadProductImage(file);
      const sourceProduct = products.find(p => p.id === productId);
      if (!sourceProduct) return;
      setProductDrafts(prev => ({
        ...prev,
        [productId]: {
          ...ensureDraft(prev, productId, initProductDraft(sourceProduct)),
          image_url: uploaded.fileUrl,
        },
      }));
      setProductImageFiles(prev => ({ ...prev, [productId]: null }));
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to upload image");
    } finally {
      setUploadingProductImageId(null);
    }
  }

  function ensureDraft<T>(target: Record<string, T>, key: string, fallback: T): T {
    return target[key] ?? fallback;
  }

  function initProductDraft(product: Product): ProductEditDraft {
    return {
      name: product.name || "",
      category_id: product.category_id || "",
      price: String(product.price ?? ""),
      cost: String(product.cost ?? 0),
      image_url: product.image_url || "",
      stock: String(product.stock ?? 0),
    };
  }

  function openProductEditor(product: Product) {
    if (expandedId === product.id) { setExpandedId(null); return; }
    setProductDrafts(prev => ({ ...prev, [product.id]: initProductDraft(product) }));
    setExpandedId(product.id);
  }

  function addInitialVariant() {
    if (!draftVariantName.trim()) return;
    setInitialVariants(prev => [...prev, { name: draftVariantName.trim(), price_adjustment: Number(draftVariantPrice || 0) }]);
    setDraftVariantName(""); setDraftVariantPrice("");
  }

  function addInitialAddon() {
    if (!draftAddonName.trim()) return;
    setInitialAddons(prev => [...prev, { name: draftAddonName.trim(), price: Number(draftAddonPrice || 0) }]);
    setDraftAddonName(""); setDraftAddonPrice("");
  }

  async function addProduct() {
    if (!newName.trim() || !newCategoryId || newPrice === "" || newStock === "") {
      alert("Please fill name, category, selling price, and stock");
      return;
    }

    const createRes = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(), category_id: newCategoryId, price: Number(newPrice),
        cost: Number(newCost || 0), image_url: newImageUrl.trim() || null, stock: Number(newStock || 0),
      }),
    });

    const createData = await createRes.json();
    if (!createRes.ok || !createData?.success || !createData?.product?.id) {
      alert(createData?.error || "Failed to add product"); return;
    }

    const createdProductId = createData.product.id as string;

    for (const v of initialVariants) {
      await fetch("/api/products/add-variant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: createdProductId, name: v.name, price_adjustment: v.price_adjustment }),
      });
    }

    for (const a of initialAddons) {
      await fetch("/api/products/add-addon", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: createdProductId, name: a.name, price: a.price }),
      });
    }

    setNewName(""); setNewCategoryId(""); setNewPrice(""); setNewCost("");
    setNewImageUrl(""); setNewImageFile(null); setNewImageFileName(""); setNewStock("");
    setInitialVariants([]); setInitialAddons([]);
    setDraftVariantName(""); setDraftVariantPrice(""); setDraftAddonName(""); setDraftAddonPrice("");
    setShowCreateForm(false);
    await refreshProducts();
  }

  async function toggleStatus(product: Product) {
    const shouldEnable = product.status !== "enabled";
    const res = await fetch(`/api/products/${product.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: shouldEnable }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data?.error || "Failed to update status"); return;
    }

    setProducts(prev =>
      prev.map(p => p.id === product.id ? { ...p, status: shouldEnable ? "enabled" : "disabled" } : p)
    );
  }

  async function addVariant(productId: string) {
    const draft = ensureDraft(variantDrafts, productId, { name: "", price: "" });
    if (!draft.name.trim()) return;
    const res = await fetch("/api/products/add-variant", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: productId, name: draft.name.trim(), price_adjustment: Number(draft.price || 0) }),
    });
    if (!res.ok) { const data = await res.json().catch(() => ({})); alert(data?.error || "Failed to add variant"); return; }
    setVariantDrafts(prev => ({ ...prev, [productId]: { name: "", price: "" } }));
    await refreshProducts();
  }

  async function addAddon(productId: string) {
    const draft = ensureDraft(addonDrafts, productId, { name: "", price: "" });
    if (!draft.name.trim()) return;
    const res = await fetch("/api/products/add-addon", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: productId, name: draft.name.trim(), price: Number(draft.price || 0) }),
    });
    if (!res.ok) { const data = await res.json().catch(() => ({})); alert(data?.error || "Failed to add addon"); return; }
    setAddonDrafts(prev => ({ ...prev, [productId]: { name: "", price: "" } }));
    await refreshProducts();
  }

  async function deleteVariant(id: string) {
    await fetch("/api/products/delete-variant", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
    });
    await refreshProducts();
  }

  async function deleteAddon(id: string) {
    await fetch("/api/products/delete-addon", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
    });
    await refreshProducts();
  }

  async function saveVariantEdit() {
    if (!editingVariantId || !editVariantName.trim()) return;
    const res = await fetch("/api/products/update-variant", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingVariantId, name: editVariantName.trim(), price_adjustment: Number(editVariantPrice || 0) }),
    });
    if (!res.ok) { const data = await res.json().catch(() => ({})); alert(data?.error || "Failed to edit variant"); return; }
    setEditingVariantId(null); setEditVariantName(""); setEditVariantPrice("");
    await refreshProducts();
  }

  async function saveAddonEdit() {
    if (!editingAddonId || !editAddonName.trim()) return;
    const res = await fetch("/api/products/update-addon", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingAddonId, name: editAddonName.trim(), price: Number(editAddonPrice || 0) }),
    });
    if (!res.ok) { const data = await res.json().catch(() => ({})); alert(data?.error || "Failed to edit addon"); return; }
    setEditingAddonId(null); setEditAddonName(""); setEditAddonPrice("");
    await refreshProducts();
  }

  async function saveProductDetails(productId: string) {
    const sourceProduct = products.find(p => p.id === productId);
    if (!sourceProduct) return;
    const draft = ensureDraft(productDrafts, productId, initProductDraft(sourceProduct));

    if (!draft.name.trim() || !draft.category_id || draft.price === "" || draft.stock === "") {
      alert("Please fill name, category, price, and stock"); return;
    }

    setSavingProductId(productId);
    const res = await fetch(`/api/products/${productId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name.trim(), category_id: draft.category_id,
        price: Number(draft.price || 0), cost: Number(draft.cost || 0),
        image_url: draft.image_url.trim() || null, stock: Number(draft.stock || 0),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSavingProductId(null);

    if (!res.ok || !data?.success) { alert(data?.error || "Failed to update product"); return; }

    await refreshProducts();
    setExpandedId(null);
    if (highlightId === productId) router.replace(pathname);
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--d-bg)", padding: "28px 28px 40px", color: "var(--d-text-1)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>Products</h1>
          <p style={{ fontSize: 13, color: "var(--d-text-3)", marginTop: 4 }}>Manage your product catalogue, variants, addons, and stock.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateForm(prev => !prev)}
          style={accentBtnStyle}
        >
          {showCreateForm ? "Close Form" : "+ New Product"}
        </button>
      </div>

      {/* Create product form */}
      {showCreateForm && (
        <div
          style={{
            background: "var(--d-surface)",
            border: "1px solid var(--d-border)",
            borderRadius: 14,
            padding: 20,
            marginBottom: 20,
          }}
        >
          <p style={{ fontSize: 14, fontWeight: 700, color: "var(--d-text-1)", marginBottom: 14 }}>New Product</p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10, marginBottom: 14 }}>
            <input placeholder="Product name" value={newName} onChange={e => setNewName(e.target.value)} style={inputStyle} />
            <select value={newCategoryId} onChange={e => setNewCategoryId(e.target.value)} style={inputStyle}>
              <option value="">Select Category</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input placeholder="Selling Price" type="number" value={newPrice} onChange={e => setNewPrice(e.target.value)} style={inputStyle} />
            <input placeholder="Cost Price" type="number" value={newCost} onChange={e => setNewCost(e.target.value)} style={inputStyle} />
            <input placeholder="Stock" type="number" value={newStock} onChange={e => setNewStock(e.target.value)} style={inputStyle} />
            <input placeholder="Image URL (optional)" value={newImageUrl} onChange={e => setNewImageUrl(e.target.value)} style={inputStyle} />
          </div>

          {/* Image upload */}
          <div
            style={{
              background: "var(--d-surface-hover)",
              border: "1px solid var(--d-border-soft)",
              borderRadius: 10,
              padding: "12px 14px",
              marginBottom: 14,
            }}
          >
            <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Product Image (optional)</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
                onChange={e => setNewImageFile(e.target.files?.[0] || null)}
                style={{ ...inputStyle, fontSize: 12 }}
              />
              <button
                type="button"
                onClick={() => void uploadNewProductImage()}
                disabled={!newImageFile || uploadingNewImage}
                style={{ ...accentBtnStyle, opacity: (!newImageFile || uploadingNewImage) ? 0.6 : 1 }}
              >
                {uploadingNewImage ? "Uploading..." : "Upload Image"}
              </button>
            </div>
            {newImageFileName && (
              <p style={{ marginTop: 8, fontSize: 12, color: "var(--d-success)" }}>Uploaded: {newImageFileName}</p>
            )}
            {newImageUrl && (
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={newImageUrl} alt="preview" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover", border: "1px solid var(--d-border)" }} />
                <p style={{ fontSize: 12, color: "var(--d-text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{newImageUrl}</p>
              </div>
            )}
          </div>

          {/* Initial Variants & Addons */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16, borderTop: "1px solid var(--d-border)", paddingTop: 14 }}>
            {/* Variants */}
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Initial Variants (optional)</p>
              {initialVariants.map((v, idx) => (
                <div key={`${v.name}-${idx}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, fontSize: 13, color: "var(--d-text-2)" }}>
                  <span>{v.name} (+RM{v.price_adjustment})</span>
                  <button onClick={() => setInitialVariants(prev => prev.filter((_, i) => i !== idx))} style={{ color: "var(--d-error)", background: "none", border: "none", cursor: "pointer", fontSize: 12 }}>Remove</button>
                </div>
              ))}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <input placeholder="Variant Name" value={draftVariantName} onChange={e => setDraftVariantName(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
                <input placeholder="+RM" type="number" value={draftVariantPrice} onChange={e => setDraftVariantPrice(e.target.value)} style={smallInputStyle} />
                <button onClick={addInitialVariant} style={accentBtnStyle}>Add</button>
              </div>
            </div>

            {/* Addons */}
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Initial Addons (optional)</p>
              {initialAddons.map((a, idx) => (
                <div key={`${a.name}-${idx}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, fontSize: 13, color: "var(--d-text-2)" }}>
                  <span>{a.name} (+RM{a.price})</span>
                  <button onClick={() => setInitialAddons(prev => prev.filter((_, i) => i !== idx))} style={{ color: "var(--d-error)", background: "none", border: "none", cursor: "pointer", fontSize: 12 }}>Remove</button>
                </div>
              ))}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <input placeholder="Addon Name" value={draftAddonName} onChange={e => setDraftAddonName(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
                <input placeholder="+RM" type="number" value={draftAddonPrice} onChange={e => setDraftAddonPrice(e.target.value)} style={smallInputStyle} />
                <button onClick={addInitialAddon} style={accentBtnStyle}>Add</button>
              </div>
            </div>
          </div>

          <button onClick={() => void addProduct()} style={accentBtnStyle}>Add Product</button>
        </div>
      )}

      {/* Product list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {products.map(product => {
          const variantDraft = ensureDraft(variantDrafts, product.id, { name: "", price: "" });
          const addonDraft = ensureDraft(addonDrafts, product.id, { name: "", price: "" });
          const productDraft = ensureDraft(productDrafts, product.id, initProductDraft(product));
          const isRestockTarget = highlightId === product.id && Number(product.stock || 0) <= LOW_STOCK_THRESHOLD;
          const isEnabled = product.status === "enabled";

          return (
            <div
              key={product.id}
              style={{
                background: "var(--d-surface)",
                border: isRestockTarget ? "1px solid var(--d-accent)" : "1px solid var(--d-border)",
                borderRadius: 14,
                padding: "16px 18px",
                boxShadow: isRestockTarget ? "0 0 0 2px var(--d-accent-soft)" : "none",
              }}
            >
              {/* Product header row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  {/* Thumbnail */}
                  <div
                    style={{
                      width: 56, height: 56, borderRadius: 10, flexShrink: 0, overflow: "hidden",
                      border: "1px solid var(--d-border)", background: "var(--d-surface-hover)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    {product.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.image_url} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <span style={{ fontSize: 20, fontWeight: 700, color: "var(--d-text-3)" }}>
                        {String(product.name || "?").charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "var(--d-text-1)" }}>{product.name}</span>
                      {isRestockTarget && (
                        <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: "var(--d-accent-soft)", color: "var(--d-accent)" }}>
                          Restock Target
                        </span>
                      )}
                      <span style={{ fontSize: 12, color: isEnabled ? "var(--d-success)" : "var(--d-error)" }}>
                        ({product.status || "disabled"})
                      </span>
                    </div>
                    <p style={{ fontSize: 13, color: "var(--d-text-3)", marginTop: 4 }}>
                      {product.category || "—"} · RM {product.price} · Stock: {product.stock}
                    </p>
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => void toggleStatus(product)}
                    style={{
                      ...accentBtnStyle,
                      background: isEnabled ? "var(--d-success)" : "var(--d-error)",
                      padding: "6px 14px",
                      fontSize: 12,
                    }}
                  >
                    {isEnabled ? "Disable" : "Enable"}
                  </button>
                  <button onClick={() => openProductEditor(product)} style={ghostBtnStyle}>
                    {expandedId === product.id ? "Close" : "Edit"}
                  </button>
                </div>
              </div>

              {/* Expanded editor */}
              {expandedId === product.id && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--d-border)", display: "flex", flexDirection: "column", gap: 20 }}>
                  {/* Product Details */}
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Product Details</p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                      <input
                        value={productDraft.name}
                        onChange={e => setProductDrafts(prev => ({ ...prev, [product.id]: { ...ensureDraft(prev, product.id, initProductDraft(product)), name: e.target.value } }))}
                        placeholder="Product name"
                        style={inputStyle}
                      />
                      <select
                        value={productDraft.category_id}
                        onChange={e => setProductDrafts(prev => ({ ...prev, [product.id]: { ...ensureDraft(prev, product.id, initProductDraft(product)), category_id: e.target.value } }))}
                        style={inputStyle}
                      >
                        <option value="">Select Category</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <input
                        type="number"
                        value={productDraft.price}
                        onChange={e => setProductDrafts(prev => ({ ...prev, [product.id]: { ...ensureDraft(prev, product.id, initProductDraft(product)), price: e.target.value } }))}
                        placeholder="Selling price"
                        style={inputStyle}
                      />
                      <input
                        type="number"
                        value={productDraft.cost}
                        onChange={e => setProductDrafts(prev => ({ ...prev, [product.id]: { ...ensureDraft(prev, product.id, initProductDraft(product)), cost: e.target.value } }))}
                        placeholder="Cost price"
                        style={inputStyle}
                      />
                      <input
                        type="number"
                        value={productDraft.stock}
                        onChange={e => setProductDrafts(prev => ({ ...prev, [product.id]: { ...ensureDraft(prev, product.id, initProductDraft(product)), stock: e.target.value } }))}
                        placeholder="Stock"
                        style={inputStyle}
                      />
                      <input
                        value={productDraft.image_url}
                        onChange={e => setProductDrafts(prev => ({ ...prev, [product.id]: { ...ensureDraft(prev, product.id, initProductDraft(product)), image_url: e.target.value } }))}
                        placeholder="Image URL (optional)"
                        style={inputStyle}
                      />
                    </div>

                    {/* Image upload */}
                    <div style={{ background: "var(--d-surface-hover)", border: "1px solid var(--d-border-soft)", borderRadius: 10, padding: "12px 14px", marginTop: 10 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Upload Product Image</p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
                          onChange={e => setProductImageFiles(prev => ({ ...prev, [product.id]: e.target.files?.[0] || null }))}
                          style={{ ...inputStyle, fontSize: 12 }}
                        />
                        <button
                          type="button"
                          onClick={() => void uploadEditProductImage(product.id)}
                          disabled={!productImageFiles[product.id] || uploadingProductImageId === product.id}
                          style={{ ...accentBtnStyle, opacity: (!productImageFiles[product.id] || uploadingProductImageId === product.id) ? 0.6 : 1 }}
                        >
                          {uploadingProductImageId === product.id ? "Uploading..." : "Upload Image"}
                        </button>
                      </div>
                      {productDraft.image_url && (
                        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={productDraft.image_url} alt={productDraft.name || product.name} style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover", border: "1px solid var(--d-border)" }} />
                          <p style={{ fontSize: 12, color: "var(--d-text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{productDraft.image_url}</p>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => void saveProductDetails(product.id)}
                      disabled={savingProductId === product.id}
                      style={{ ...accentBtnStyle, marginTop: 10, opacity: savingProductId === product.id ? 0.6 : 1 }}
                    >
                      {savingProductId === product.id ? "Saving..." : "Save Product"}
                    </button>
                  </div>

                  {/* Variants */}
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Variants</p>
                    {product.variants?.map(v => (
                      <div key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
                        {editingVariantId === v.id ? (
                          <div style={{ display: "flex", gap: 6, flex: 1, flexWrap: "wrap" }}>
                            <input value={editVariantName} onChange={e => setEditVariantName(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
                            <input type="number" value={editVariantPrice} onChange={e => setEditVariantPrice(e.target.value)} style={smallInputStyle} />
                            <button onClick={() => void saveVariantEdit()} style={{ ...accentBtnStyle, padding: "6px 12px", fontSize: 12 }}>Save</button>
                            <button onClick={() => { setEditingVariantId(null); setEditVariantName(""); setEditVariantPrice(""); }} style={ghostBtnStyle}>Cancel</button>
                          </div>
                        ) : (
                          <>
                            <span style={{ fontSize: 13, color: "var(--d-text-2)" }}>{v.name} (+RM{v.price_adjustment})</span>
                            <div style={{ display: "flex", gap: 10 }}>
                              <button onClick={() => { setEditingVariantId(v.id); setEditVariantName(v.name); setEditVariantPrice(String(v.price_adjustment)); }} style={{ color: "var(--d-warning)", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}>Edit</button>
                              <button onClick={() => void deleteVariant(v.id)} style={{ color: "var(--d-error)", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}>Delete</button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                      <input
                        placeholder="Variant Name"
                        value={variantDraft.name}
                        onChange={e => setVariantDrafts(prev => ({ ...prev, [product.id]: { ...ensureDraft(prev, product.id, { name: "", price: "" }), name: e.target.value } }))}
                        style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                      />
                      <input
                        placeholder="+RM"
                        type="number"
                        value={variantDraft.price}
                        onChange={e => setVariantDrafts(prev => ({ ...prev, [product.id]: { ...ensureDraft(prev, product.id, { name: "", price: "" }), price: e.target.value } }))}
                        style={smallInputStyle}
                      />
                      <button onClick={() => void addVariant(product.id)} style={{ ...accentBtnStyle, padding: "8px 12px", fontSize: 12 }}>Add</button>
                    </div>
                  </div>

                  {/* Addons */}
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Addons</p>
                    {product.addons?.map(a => (
                      <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
                        {editingAddonId === a.id ? (
                          <div style={{ display: "flex", gap: 6, flex: 1, flexWrap: "wrap" }}>
                            <input value={editAddonName} onChange={e => setEditAddonName(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
                            <input type="number" value={editAddonPrice} onChange={e => setEditAddonPrice(e.target.value)} style={smallInputStyle} />
                            <button onClick={() => void saveAddonEdit()} style={{ ...accentBtnStyle, padding: "6px 12px", fontSize: 12 }}>Save</button>
                            <button onClick={() => { setEditingAddonId(null); setEditAddonName(""); setEditAddonPrice(""); }} style={ghostBtnStyle}>Cancel</button>
                          </div>
                        ) : (
                          <>
                            <span style={{ fontSize: 13, color: "var(--d-text-2)" }}>{a.name} (+RM{a.price})</span>
                            <div style={{ display: "flex", gap: 10 }}>
                              <button onClick={() => { setEditingAddonId(a.id); setEditAddonName(a.name); setEditAddonPrice(String(a.price)); }} style={{ color: "var(--d-warning)", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}>Edit</button>
                              <button onClick={() => void deleteAddon(a.id)} style={{ color: "var(--d-error)", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}>Delete</button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                      <input
                        placeholder="Addon Name"
                        value={addonDraft.name}
                        onChange={e => setAddonDrafts(prev => ({ ...prev, [product.id]: { ...ensureDraft(prev, product.id, { name: "", price: "" }), name: e.target.value } }))}
                        style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                      />
                      <input
                        placeholder="+RM"
                        type="number"
                        value={addonDraft.price}
                        onChange={e => setAddonDrafts(prev => ({ ...prev, [product.id]: { ...ensureDraft(prev, product.id, { name: "", price: "" }), price: e.target.value } }))}
                        style={smallInputStyle}
                      />
                      <button onClick={() => void addAddon(product.id)} style={{ ...accentBtnStyle, padding: "8px 12px", fontSize: 12 }}>Add</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
