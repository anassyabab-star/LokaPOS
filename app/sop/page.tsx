"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

/* ── Types ─────────────────────────────────────────────── */
type Variation = {
  type: "ice" | "hot" | "both" | "any";
  label?: string;
  ingredients: string[];
};

type Recipe = {
  id: number;
  name: string;
  category: string;
  variations: Variation[];
};

/* ── Recipe Data ───────────────────────────────────────── */
const recipes: Recipe[] = [
  // ── COFFEE: Basic ──
  {
    id: 1,
    name: "Americano",
    category: "Coffee",
    variations: [
      { type: "ice", ingredients: ["Espresso Shots", "Ice", "Water 100ml"] },
      { type: "hot", ingredients: ["Espresso Shots", "Hot Water 150ml"] },
    ],
  },
  {
    id: 2,
    name: "Latte / Cappuccino",
    category: "Coffee",
    variations: [
      { type: "ice", ingredients: ["Espresso Shots", "Milk 110ml", "Ice"] },
      { type: "hot", ingredients: ["Espresso Shots", "Steam Milk secukupnya"] },
    ],
  },
  {
    id: 3,
    name: "Spanish Latte",
    category: "Coffee",
    variations: [
      { type: "ice", ingredients: ["Espresso Shots", "Susu Pekat 20ml", "Milk 110ml", "Whisk and Ice"] },
      { type: "hot", ingredients: ["Espresso Shots", "Susu Pekat 15ml", "Steam Milk secukupnya"] },
    ],
  },
  {
    id: 4,
    name: "Vanilla Latte",
    category: "Coffee",
    variations: [
      { type: "ice", ingredients: ["Espresso Shots", "Vanilla Pump 20ml", "Milk 110ml", "Whisk and Ice"] },
      { type: "hot", ingredients: ["Espresso Shots", "Vanilla Pump 15ml", "Steam Milk secukupnya"] },
    ],
  },
  {
    id: 5,
    name: "Hazelnut Latte",
    category: "Coffee",
    variations: [
      { type: "ice", ingredients: ["Espresso Shots", "Hazelnut Pump 20ml", "Milk 110ml", "Whisk and Ice"] },
      { type: "hot", ingredients: ["Espresso Shots", "Hazelnut Pump 15ml", "Steam Milk secukupnya"] },
    ],
  },
  {
    id: 6,
    name: "Kopi Tarik",
    category: "Coffee",
    variations: [
      { type: "ice", ingredients: ["Espresso Shots", "Susu Pekat 35ml", "Susu Cair 50ml", "Water 20ml", "Ice"] },
      { type: "hot", ingredients: ["Espresso Shots", "Susu Pekat 35ml", "Susu Cair 50ml", "Water 20ml"] },
    ],
  },
  {
    id: 7,
    name: "Mocha",
    category: "Coffee",
    variations: [
      { type: "both", ingredients: ["Espresso Shots", "Milk 100ml", "Susu Pekat 30ml", "Cocoa Powder 15ml", "Froth All"] },
    ],
  },
  {
    id: 8,
    name: "Orange Coffee",
    category: "Coffee",
    variations: [
      { type: "ice", ingredients: ["Sunquick 40ml", "Water 100ml", "Ice", "Espresso Shots"] },
    ],
  },
  // ── AIR BUAH ──
  {
    id: 9,
    name: "Oranges",
    category: "Air Buah",
    variations: [
      { type: "any", ingredients: ["Oren 3 biji", "Apple Merah 1 biji"] },
    ],
  },
  {
    id: 10,
    name: "Oranges Strawberry",
    category: "Air Buah",
    variations: [
      { type: "ice", ingredients: ["Oren 3 biji", "Strawberry Puree", "Orange Juice 200ml", "Ice"] },
    ],
  },
  {
    id: 11,
    name: "Apple Juice",
    category: "Air Buah",
    variations: [
      { type: "ice", ingredients: ["Apple Merah 2 biji", "Apple Hijau 1 biji", "Apple Juice 220ml", "Ice"] },
    ],
  },
  {
    id: 12,
    name: "Tembikai Lychee",
    category: "Air Buah",
    variations: [
      { type: "ice", ingredients: ["Blend Tembikai", "Lychee Syrup 50ml", "Buah Lychee 3½ biji", "Daun Pudina", "Ice"] },
    ],
  },
  // ── NON COFFEE ──
  {
    id: 13,
    name: "Teh O",
    category: "Non Coffee",
    variations: [
      { type: "ice", ingredients: ["Pati Teh 40ml", "Water 60ml", "Air Gula 50ml", "Ice"] },
      { type: "hot", ingredients: ["Pati Teh 40ml", "Hot Water 60ml", "Air Gula 50ml"] },
    ],
  },
  {
    id: 14,
    name: "Teh Tarik",
    category: "Non Coffee",
    variations: [
      { type: "ice", ingredients: ["Pati Teh 100ml", "Susu Pekat 40ml", "Susu Cair 50ml", "Whisk and Ice"] },
      { type: "hot", ingredients: ["Pati Teh 100ml", "Susu Pekat 40ml", "Susu Cair 50ml", "Steam Hot"] },
    ],
  },
  {
    id: 15,
    name: "Chocolate",
    category: "Non Coffee",
    variations: [
      { type: "both", ingredients: ["Cocoa Powder 15ml", "Milk 110ml", "Susu Pekat 30ml"] },
    ],
  },
  // ── MATCHA ──
  {
    id: 16,
    name: "Matcha Latte",
    category: "Matcha",
    variations: [
      {
        type: "ice",
        ingredients: [
          "Matcha Powder 5g",
          "Milk 60ml",
          "Whisk",
          "Vanilla Pump 20ml",
          "Milk 90ml",
          "Ice",
        ],
      },
    ],
  },
  {
    id: 17,
    name: "Strawberry Matcha Latte",
    category: "Matcha",
    variations: [
      {
        type: "ice",
        ingredients: [
          "Matcha Powder 5g",
          "Milk 60ml",
          "Whisk",
          "Strawberry Puree",
          "Vanilla Pump 20ml",
          "Milk 90ml",
          "Ice",
        ],
      },
    ],
  },
];

const TABS = ["Semua", "Coffee", "Air Buah", "Non Coffee", "Matcha"] as const;

/* ── Category Accent ───────────────────────────────────── */
const CATEGORY_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  Coffee:      { bg: "bg-amber-50",  text: "text-amber-800",  dot: "bg-amber-500" },
  "Air Buah":  { bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-400" },
  "Non Coffee":{ bg: "bg-teal-50",   text: "text-teal-700",   dot: "bg-teal-500" },
  Matcha:      { bg: "bg-green-50",  text: "text-green-800",  dot: "bg-green-500" },
};

/* ── Ingredient Icon ────────────────────────────────────── */
function ingredientIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes("espresso") || n.includes("coffee") || n.includes("kopi")) return "☕";
  if (n.includes("milk") || n.includes("susu")) return "🥛";
  if (n.includes("water") || n.includes("air gula") || n.includes("hot water")) return "💧";
  if (n.includes("ice")) return "🧊";
  if (n.includes("froth") || n.includes("steam") || n.includes("whisk")) return "🫧";
  if (n.includes("orange") || n.includes("oren") || n.includes("sunquick")) return "🍊";
  if (n.includes("strawberry")) return "🍓";
  if (n.includes("apple")) return "🍎";
  if (n.includes("tembikai") || n.includes("watermelon") || n.includes("blend tembikai")) return "🍉";
  if (n.includes("lychee")) return "🍈";
  if (n.includes("pudina") || n.includes("daun")) return "🌿";
  if (n.includes("cocoa") || n.includes("chocolate")) return "🍫";
  if (n.includes("vanilla") || n.includes("hazelnut") || n.includes("pump")) return "🍯";
  if (n.includes("matcha")) return "🍵";
  if (n.includes("teh") || n.includes("pati teh")) return "🫖";
  return "🧪";
}

/* ── Variation Badge ────────────────────────────────────── */
function VariationBadge({ type }: { type: string }) {
  if (type === "ice")
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">🧊 ICED</span>;
  if (type === "hot")
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-50 text-[#7F1D1D] border border-red-200">🔥 HOT</span>;
  if (type === "both")
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-gray-600 border border-gray-200">☀️ ALL TEMP</span>;
  return null;
}

/* ── Main Page ──────────────────────────────────────────── */
export default function SopPage() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("Semua");

  const filtered = useMemo(() =>
    recipes.filter(r => {
      const matchSearch = r.name.toLowerCase().includes(search.toLowerCase());
      const matchTab = activeTab === "Semua" || r.category === activeTab;
      return matchSearch && matchTab;
    }),
    [search, activeTab]
  );

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-20">
      {/* Header */}
      <div
        style={{ background: "#7F1D1D" }}
        className="px-4 pt-10 pb-6 shadow"
      >
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl">
                ☕
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Barista SOP</h1>
                <p className="text-red-200 text-xs">Panduan Resipi Minuman</p>
              </div>
            </div>
            <Link
              href="/pos"
              className="text-xs text-red-200 hover:text-white border border-red-400/40 rounded-lg px-3 py-1.5 transition-colors"
            >
              ← POS
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 -mt-3">
        {/* Search + Filter card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 mb-5 space-y-3">
          {/* Search */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            <input
              type="text"
              placeholder="Cari resipi..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-gray-100 rounded-xl text-sm outline-none focus:ring-2 transition-all"
              style={{ "--tw-ring-color": "#7F1D1D" } as React.CSSProperties}
            />
          </div>
          {/* Category tabs */}
          <div className="flex gap-2 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
            {TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
                style={
                  activeTab === tab
                    ? { background: "#7F1D1D", color: "#fff" }
                    : { background: "#f3f4f6", color: "#6b7280" }
                }
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Count */}
        <p className="text-xs text-gray-400 mb-3 px-1">{filtered.length} resipi</p>

        {/* Recipe cards */}
        <div className="space-y-3">
          {filtered.map(recipe => {
            const cat = CATEGORY_STYLE[recipe.category] ?? { bg: "bg-gray-50", text: "text-gray-600", dot: "bg-gray-400" };
            return (
              <div
                key={recipe.id}
                className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
              >
                {/* Card header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <div>
                    <h3 className="font-bold text-gray-900 text-base">{recipe.name}</h3>
                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide mt-0.5 ${cat.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${cat.dot}`} />
                      {recipe.category}
                    </span>
                  </div>
                </div>

                {/* Variations */}
                <div className="divide-y divide-gray-50">
                  {recipe.variations.map((v, idx) => (
                    <div key={idx} className="px-4 py-3">
                      {v.type !== "any" && (
                        <div className="mb-2.5">
                          <VariationBadge type={v.type} />
                        </div>
                      )}
                      <ol className="space-y-2">
                        {v.ingredients.map((ing, i) => (
                          <li key={i} className="flex items-center gap-3 text-sm text-gray-700">
                            <span
                              className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                              style={{ background: "#7F1D1D" }}
                            >
                              {i + 1}
                            </span>
                            <span className="text-base leading-none">{ingredientIcon(ing)}</span>
                            <span>{ing}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="text-center py-20 text-gray-400 text-sm">
              Tiada resipi dijumpai untuk &ldquo;{search}&rdquo;
            </div>
          )}
        </div>
      </div>

      <footer className="text-center text-gray-400 text-xs py-6 mt-4">
        Loka POS · Barista SOP
      </footer>
    </div>
  );
}
