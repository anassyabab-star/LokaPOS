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
  stock: string;
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

  function ensureDraft<T>(target: Record<string, T>, key: string, fallback: T): T {
    return target[key] ?? fallback;
  }

  function initProductDraft(product: Product): ProductEditDraft {
    return {
      name: product.name || "",
      category_id: product.category_id || "",
      price: String(product.price ?? ""),
      cost: String(product.cost ?? 0),
      stock: String(product.stock ?? 0),
    };
  }

  function openProductEditor(product: Product) {
    if (expandedId === product.id) {
      setExpandedId(null);
      return;
    }

    setProductDrafts(prev => ({
      ...prev,
      [product.id]: initProductDraft(product),
    }));
    setExpandedId(product.id);
  }

  function addInitialVariant() {
    if (!draftVariantName.trim()) return;
    setInitialVariants(prev => [
      ...prev,
      {
        name: draftVariantName.trim(),
        price_adjustment: Number(draftVariantPrice || 0),
      },
    ]);
    setDraftVariantName("");
    setDraftVariantPrice("");
  }

  function addInitialAddon() {
    if (!draftAddonName.trim()) return;
    setInitialAddons(prev => [
      ...prev,
      {
        name: draftAddonName.trim(),
        price: Number(draftAddonPrice || 0),
      },
    ]);
    setDraftAddonName("");
    setDraftAddonPrice("");
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
        name: newName.trim(),
        category_id: newCategoryId,
        price: Number(newPrice),
        cost: Number(newCost || 0),
        stock: Number(newStock || 0),
      }),
    });

    const createData = await createRes.json();
    if (!createRes.ok || !createData?.success || !createData?.product?.id) {
      alert(createData?.error || "Failed to add product");
      return;
    }

    const createdProductId = createData.product.id as string;

    for (const v of initialVariants) {
      await fetch("/api/products/add-variant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: createdProductId,
          name: v.name,
          price_adjustment: v.price_adjustment,
        }),
      });
    }

    for (const a of initialAddons) {
      await fetch("/api/products/add-addon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: createdProductId,
          name: a.name,
          price: a.price,
        }),
      });
    }

    setNewName("");
    setNewCategoryId("");
    setNewPrice("");
    setNewCost("");
    setNewStock("");
    setInitialVariants([]);
    setInitialAddons([]);
    setDraftVariantName("");
    setDraftVariantPrice("");
    setDraftAddonName("");
    setDraftAddonPrice("");
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
      alert(data?.error || "Failed to update status");
      return;
    }

    setProducts(prev =>
      prev.map(p =>
        p.id === product.id ? { ...p, status: shouldEnable ? "enabled" : "disabled" } : p
      )
    );
  }

  async function addVariant(productId: string) {
    const draft = ensureDraft(variantDrafts, productId, { name: "", price: "" });
    if (!draft.name.trim()) return;

    const res = await fetch("/api/products/add-variant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_id: productId,
        name: draft.name.trim(),
        price_adjustment: Number(draft.price || 0),
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data?.error || "Failed to add variant");
      return;
    }

    setVariantDrafts(prev => ({ ...prev, [productId]: { name: "", price: "" } }));
    await refreshProducts();
  }

  async function addAddon(productId: string) {
    const draft = ensureDraft(addonDrafts, productId, { name: "", price: "" });
    if (!draft.name.trim()) return;

    const res = await fetch("/api/products/add-addon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_id: productId,
        name: draft.name.trim(),
        price: Number(draft.price || 0),
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data?.error || "Failed to add addon");
      return;
    }

    setAddonDrafts(prev => ({ ...prev, [productId]: { name: "", price: "" } }));
    await refreshProducts();
  }

  async function deleteVariant(id: string) {
    await fetch("/api/products/delete-variant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await refreshProducts();
  }

  async function deleteAddon(id: string) {
    await fetch("/api/products/delete-addon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await refreshProducts();
  }

  async function saveVariantEdit() {
    if (!editingVariantId || !editVariantName.trim()) return;

    const res = await fetch("/api/products/update-variant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingVariantId,
        name: editVariantName.trim(),
        price_adjustment: Number(editVariantPrice || 0),
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data?.error || "Failed to edit variant");
      return;
    }

    setEditingVariantId(null);
    setEditVariantName("");
    setEditVariantPrice("");
    await refreshProducts();
  }

  async function saveAddonEdit() {
    if (!editingAddonId || !editAddonName.trim()) return;

    const res = await fetch("/api/products/update-addon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingAddonId,
        name: editAddonName.trim(),
        price: Number(editAddonPrice || 0),
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data?.error || "Failed to edit addon");
      return;
    }

    setEditingAddonId(null);
    setEditAddonName("");
    setEditAddonPrice("");
    await refreshProducts();
  }

  async function saveProductDetails(productId: string) {
    const sourceProduct = products.find(p => p.id === productId);
    if (!sourceProduct) return;
    const draft = ensureDraft(productDrafts, productId, initProductDraft(sourceProduct));

    if (!draft.name.trim() || !draft.category_id || draft.price === "" || draft.stock === "") {
      alert("Please fill name, category, price, and stock");
      return;
    }

    setSavingProductId(productId);
    const res = await fetch(`/api/products/${productId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name.trim(),
        category_id: draft.category_id,
        price: Number(draft.price || 0),
        cost: Number(draft.cost || 0),
        stock: Number(draft.stock || 0),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSavingProductId(null);

    if (!res.ok || !data?.success) {
      alert(data?.error || "Failed to update product");
      return;
    }

    await refreshProducts();
    setExpandedId(null);

    if (highlightId === productId) {
      router.replace(pathname);
    }
  }

  return (
    <div className="p-6 text-white">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Products</h1>
        <button
          type="button"
          onClick={() => setShowCreateForm(prev => !prev)}
          className="rounded-md bg-[#7F1D1D] px-4 py-2 text-sm font-medium hover:bg-[#942424]"
        >
          {showCreateForm ? "Close Form" : "+ New Product"}
        </button>
      </div>

      {showCreateForm ? (
        <div className="bg-[#111] p-4 rounded-xl border border-gray-800 mb-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <input
            placeholder="Product name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="p-2 bg-black border border-gray-700 rounded"
          />
          <select
            value={newCategoryId}
            onChange={e => setNewCategoryId(e.target.value)}
            className="p-2 bg-black border border-gray-700 rounded"
          >
            <option value="">Select Category</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            placeholder="Selling Price"
            type="number"
            value={newPrice}
            onChange={e => setNewPrice(e.target.value)}
            className="p-2 bg-black border border-gray-700 rounded"
          />
          <input
            placeholder="Cost Price"
            type="number"
            value={newCost}
            onChange={e => setNewCost(e.target.value)}
            className="p-2 bg-black border border-gray-700 rounded"
          />
          <input
            placeholder="Stock"
            type="number"
            value={newStock}
            onChange={e => setNewStock(e.target.value)}
            className="p-2 bg-black border border-gray-700 rounded"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-gray-800 pt-4">
          <div className="space-y-2">
            <div className="font-semibold text-sm">Initial Variants (optional)</div>
            {initialVariants.map((v, idx) => (
              <div key={`${v.name}-${idx}`} className="text-sm text-gray-300 flex justify-between">
                <span>{v.name} (+RM{v.price_adjustment})</span>
                <button
                  className="text-red-400"
                  onClick={() => setInitialVariants(prev => prev.filter((_, i) => i !== idx))}
                >
                  Remove
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <input
                placeholder="Variant Name"
                value={draftVariantName}
                onChange={e => setDraftVariantName(e.target.value)}
                className="flex-1 p-2 bg-black border border-gray-700 rounded"
              />
              <input
                placeholder="+RM"
                type="number"
                value={draftVariantPrice}
                onChange={e => setDraftVariantPrice(e.target.value)}
                className="w-24 p-2 bg-black border border-gray-700 rounded"
              />
              <button onClick={addInitialVariant} className="bg-[#7F1D1D] hover:bg-[#942424] px-4 rounded">
                Add
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="font-semibold text-sm">Initial Addons (optional)</div>
            {initialAddons.map((a, idx) => (
              <div key={`${a.name}-${idx}`} className="text-sm text-gray-300 flex justify-between">
                <span>{a.name} (+RM{a.price})</span>
                <button
                  className="text-red-400"
                  onClick={() => setInitialAddons(prev => prev.filter((_, i) => i !== idx))}
                >
                  Remove
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <input
                placeholder="Addon Name"
                value={draftAddonName}
                onChange={e => setDraftAddonName(e.target.value)}
                className="flex-1 p-2 bg-black border border-gray-700 rounded"
              />
              <input
                placeholder="+RM"
                type="number"
                value={draftAddonPrice}
                onChange={e => setDraftAddonPrice(e.target.value)}
                className="w-24 p-2 bg-black border border-gray-700 rounded"
              />
              <button onClick={addInitialAddon} className="bg-[#7F1D1D] hover:bg-[#942424] px-4 rounded">
                Add
              </button>
            </div>
          </div>
        </div>

        <button onClick={addProduct} className="bg-[#7F1D1D] hover:bg-[#942424] px-4 py-2 rounded">
          Add Product
        </button>
        </div>
      ) : null}

      <div className="space-y-4">
        {products.map(product => {
          const variantDraft = ensureDraft(variantDrafts, product.id, { name: "", price: "" });
          const addonDraft = ensureDraft(addonDrafts, product.id, { name: "", price: "" });
          const productDraft = ensureDraft(productDrafts, product.id, initProductDraft(product));
          const isRestockTarget =
            highlightId === product.id &&
            Number(product.stock || 0) <= LOW_STOCK_THRESHOLD;

          return (
            <div
              key={product.id}
              className={`bg-[#111] p-4 rounded-xl border ${
                isRestockTarget
                  ? "border-[#7F1D1D] shadow-[0_0_0_1px_rgba(127,29,29,0.35)]"
                  : "border-gray-800"
              }`}
            >
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-lg font-semibold">
                    {product.name}{" "}
                    {isRestockTarget ? (
                      <span className="mr-2 rounded bg-[#7F1D1D]/25 px-2 py-0.5 text-xs text-[#fda4a4]">
                        Restock Target
                      </span>
                    ) : null}
                    <span
                      className={`text-sm ${
                        product.status === "enabled"
                          ? "text-green-400"
                          : "text-red-400"
                      }`}
                    >
                      ({product.status || "disabled"})
                    </span>
                  </div>
                  <div className="text-sm text-gray-400">
                    Category: {product.category || "-"} | RM {product.price} | Stock: {product.stock}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => void toggleStatus(product)}
                    className={`px-3 py-1 rounded text-white ${
                      product.status === "enabled"
                        ? "bg-green-600 hover:bg-green-500"
                        : "bg-red-700 hover:bg-red-600"
                    }`}
                  >
                    {product.status === "enabled" ? "Disable" : "Enable"}
                  </button>

                  <button
                    onClick={() => openProductEditor(product)}
                    className="px-3 py-1 bg-[#2d2d2d] hover:bg-[#3b3b3b] rounded"
                  >
                    Edit
                  </button>
                </div>
              </div>

              {expandedId === product.id && (
                <div className="mt-4 space-y-6 border-t border-gray-700 pt-4">
                  <div>
                    <div className="font-semibold mb-2">Product Details</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <input
                        value={productDraft.name}
                        onChange={e =>
                          setProductDrafts(prev => ({
                            ...prev,
                            [product.id]: { ...ensureDraft(prev, product.id, initProductDraft(product)), name: e.target.value },
                          }))
                        }
                        placeholder="Product name"
                        className="p-2 bg-black border border-gray-700 rounded"
                      />
                      <select
                        value={productDraft.category_id}
                        onChange={e =>
                          setProductDrafts(prev => ({
                            ...prev,
                            [product.id]: { ...ensureDraft(prev, product.id, initProductDraft(product)), category_id: e.target.value },
                          }))
                        }
                        className="p-2 bg-black border border-gray-700 rounded"
                      >
                        <option value="">Select Category</option>
                        {categories.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={productDraft.price}
                        onChange={e =>
                          setProductDrafts(prev => ({
                            ...prev,
                            [product.id]: { ...ensureDraft(prev, product.id, initProductDraft(product)), price: e.target.value },
                          }))
                        }
                        placeholder="Selling price"
                        className="p-2 bg-black border border-gray-700 rounded"
                      />
                      <input
                        type="number"
                        value={productDraft.cost}
                        onChange={e =>
                          setProductDrafts(prev => ({
                            ...prev,
                            [product.id]: { ...ensureDraft(prev, product.id, initProductDraft(product)), cost: e.target.value },
                          }))
                        }
                        placeholder="Cost price"
                        className="p-2 bg-black border border-gray-700 rounded"
                      />
                      <input
                        type="number"
                        value={productDraft.stock}
                        onChange={e =>
                          setProductDrafts(prev => ({
                            ...prev,
                            [product.id]: { ...ensureDraft(prev, product.id, initProductDraft(product)), stock: e.target.value },
                          }))
                        }
                        placeholder="Stock"
                        className="p-2 bg-black border border-gray-700 rounded"
                      />
                    </div>
                    <div className="mt-2">
                      <button
                        onClick={() => void saveProductDetails(product.id)}
                        disabled={savingProductId === product.id}
                        className="bg-[#7F1D1D] px-4 py-2 rounded disabled:opacity-60"
                      >
                        {savingProductId === product.id ? "Saving..." : "Save Product"}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="font-semibold mb-2">Variants</div>

                    {product.variants?.map(v => (
                      <div key={v.id} className="flex justify-between items-center mb-2 gap-2">
                        {editingVariantId === v.id ? (
                          <div className="flex gap-2 flex-1">
                            <input
                              className="flex-1 p-2 bg-black border border-gray-700 rounded"
                              value={editVariantName}
                              onChange={e => setEditVariantName(e.target.value)}
                            />
                            <input
                              className="w-24 p-2 bg-black border border-gray-700 rounded"
                              type="number"
                              value={editVariantPrice}
                              onChange={e => setEditVariantPrice(e.target.value)}
                            />
                            <button onClick={() => void saveVariantEdit()} className="px-3 py-1 rounded bg-[#7F1D1D] hover:bg-[#942424]">
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setEditingVariantId(null);
                                setEditVariantName("");
                                setEditVariantPrice("");
                              }}
                              className="px-3 py-1 rounded bg-gray-600"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <div>{v.name} (+RM{v.price_adjustment})</div>
                            <div className="flex gap-3">
                              <button
                                onClick={() => {
                                  setEditingVariantId(v.id);
                                  setEditVariantName(v.name);
                                  setEditVariantPrice(String(v.price_adjustment));
                                }}
                                className="text-[#fda4a4]"
                              >
                                Edit
                              </button>
                              <button onClick={() => void deleteVariant(v.id)} className="text-red-400">
                                Delete
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}

                    <div className="flex gap-2 mt-2">
                      <input
                        placeholder="Variant Name"
                        value={variantDraft.name}
                        onChange={e =>
                          setVariantDrafts(prev => ({
                            ...prev,
                            [product.id]: { ...ensureDraft(prev, product.id, { name: "", price: "" }), name: e.target.value },
                          }))
                        }
                        className="flex-1 p-2 bg-black border border-gray-700 rounded"
                      />
                      <input
                        placeholder="+RM"
                        type="number"
                        value={variantDraft.price}
                        onChange={e =>
                          setVariantDrafts(prev => ({
                            ...prev,
                            [product.id]: { ...ensureDraft(prev, product.id, { name: "", price: "" }), price: e.target.value },
                          }))
                        }
                        className="w-24 p-2 bg-black border border-gray-700 rounded"
                      />
                      <button onClick={() => void addVariant(product.id)} className="bg-[#7F1D1D] hover:bg-[#942424] px-4 rounded">
                        Add
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="font-semibold mb-2">Addons</div>

                    {product.addons?.map(a => (
                      <div key={a.id} className="flex justify-between items-center mb-2 gap-2">
                        {editingAddonId === a.id ? (
                          <div className="flex gap-2 flex-1">
                            <input
                              className="flex-1 p-2 bg-black border border-gray-700 rounded"
                              value={editAddonName}
                              onChange={e => setEditAddonName(e.target.value)}
                            />
                            <input
                              className="w-24 p-2 bg-black border border-gray-700 rounded"
                              type="number"
                              value={editAddonPrice}
                              onChange={e => setEditAddonPrice(e.target.value)}
                            />
                            <button onClick={() => void saveAddonEdit()} className="px-3 py-1 rounded bg-[#7F1D1D] hover:bg-[#942424]">
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setEditingAddonId(null);
                                setEditAddonName("");
                                setEditAddonPrice("");
                              }}
                              className="px-3 py-1 rounded bg-gray-600"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <div>{a.name} (+RM{a.price})</div>
                            <div className="flex gap-3">
                              <button
                                onClick={() => {
                                  setEditingAddonId(a.id);
                                  setEditAddonName(a.name);
                                  setEditAddonPrice(String(a.price));
                                }}
                                className="text-[#fda4a4]"
                              >
                                Edit
                              </button>
                              <button onClick={() => void deleteAddon(a.id)} className="text-red-400">
                                Delete
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}

                    <div className="flex gap-2 mt-2">
                      <input
                        placeholder="Addon Name"
                        value={addonDraft.name}
                        onChange={e =>
                          setAddonDrafts(prev => ({
                            ...prev,
                            [product.id]: { ...ensureDraft(prev, product.id, { name: "", price: "" }), name: e.target.value },
                          }))
                        }
                        className="flex-1 p-2 bg-black border border-gray-700 rounded"
                      />
                      <input
                        placeholder="+RM"
                        type="number"
                        value={addonDraft.price}
                        onChange={e =>
                          setAddonDrafts(prev => ({
                            ...prev,
                            [product.id]: { ...ensureDraft(prev, product.id, { name: "", price: "" }), price: e.target.value },
                          }))
                        }
                        className="w-24 p-2 bg-black border border-gray-700 rounded"
                      />
                      <button onClick={() => void addAddon(product.id)} className="bg-[#7F1D1D] hover:bg-[#942424] px-4 rounded">
                        Add
                      </button>
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
