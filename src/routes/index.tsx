import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ScanPOS — Barcode Point of Sale" },
      { name: "description", content: "Fast point of sale: scan barcodes to add products and variants to the cart instantly." },
      { property: "og:title", content: "ScanPOS — Barcode Point of Sale" },
      { property: "og:description", content: "Scan barcodes to add products to the cart instantly." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: POS,
});

type Variant = { id: string; name: string; price: number; barcode?: string };
type Product = { id: string; name: string; variants: Variant[] };
type Line = { variantId: string; qty: number };

const uid = () => Math.random().toString(36).slice(2, 10);
const mk = (name: string, vs: [string, number][]): Product => ({
  id: uid(),
  name,
  variants: vs.map(([n, p]) => ({ id: uid(), name: n, price: p })),
});

const SEED: Product[] = [
  mk("Mineral Water", [["500ml", 10], ["1L", 20], ["2L", 35]]),
  mk("Coca-Cola", [["250ml Can", 40], ["750ml", 45], ["2L", 95]]),
  mk("Lays Chips", [["Classic Salted", 20], ["Magic Masala", 20], ["Cream & Onion", 20]]),
  mk("Dairy Milk Chocolate", [["Small", 10], ["Medium", 45], ["Silk", 90]]),
  mk("Amul Milk", [["500ml", 28], ["1L", 54]]),
  mk("Basmati Rice", [["1kg", 120], ["5kg", 560]]),
  mk("Colgate Toothpaste", [["100g", 55], ["200g", 99]]),
  mk("Dove Soap", [["75g", 45], ["Pack of 3", 125]]),
  mk("Parle-G Biscuits", [["Small", 5], ["Family Pack", 50]]),
  mk("Tata Tea", [["250g", 140], ["500g", 270], ["1kg", 520]]),
];

function useStored<T>(key: string, init: T) {
  const [v, setV] = useState<T>(init);
  const loaded = useRef(false);
  useEffect(() => {
    const s = localStorage.getItem(key);
    if (s) setV(JSON.parse(s));
    loaded.current = true;
  }, [key]);
  useEffect(() => {
    if (loaded.current) localStorage.setItem(key, JSON.stringify(v));
  }, [key, v]);
  return [v, setV] as const;
}

const money = (n: number) => "₹" + n.toFixed(2);

function POS() {
  const [products, setProducts] = useStored<Product[]>("pos-products-v2", SEED);
  const [cart, setCart] = useState<Line[]>([]);
  const [tab, setTab] = useState<"sell" | "products">("sell");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [form, setForm] = useState({ product: "", variant: "", price: "" });
  // Add-barcode window
  const [modal, setModal] = useState(false);
  const [detected, setDetected] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [modalManual, setModalManual] = useState("");

  const buf = useRef({ s: "", t: 0 });
  const state = useRef({ products, tab, modal });
  state.current = { products, tab, modal };

  const allVariants = useMemo(
    () => products.flatMap((p) => p.variants.map((v) => ({ p, v }))),
    [products],
  );

  const notify = (text: string, ok: boolean) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 2000);
  };

  const scan = (code: string) => {
    code = code.trim();
    if (!code) return;
    const { products, tab, modal } = state.current;
    if (modal) {
      setDetected(code);
      const hit = products.flatMap((p) => p.variants).find((v) => v.barcode === code);
      setPick(hit?.id ?? null);
      return;
    }
    if (tab !== "sell") return;
    for (const p of products) {
      const v = p.variants.find((x) => x.barcode === code);
      if (v) {
        setCart((c) => {
          const i = c.findIndex((l) => l.variantId === v.id);
          if (i < 0) return [{ variantId: v.id, qty: 1 }, ...c];
          return c.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
        });
        setFlash(v.id + ":" + Date.now());
        return notify(`Added ${p.name} — ${v.name}`, true);
      }
    }
    notify(`Unknown barcode ${code}`, false);
  };

  // Barcode scanners type fast and end with Enter — capture globally.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return;
      const now = Date.now();
      if (now - buf.current.t > 60) buf.current.s = "";
      buf.current.t = now;
      if (e.key === "Enter") {
        if (buf.current.s.length >= 3) scan(buf.current.s);
        buf.current.s = "";
      } else if (e.key.length === 1) buf.current.s += e.key;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const lines = useMemo(
    () =>
      cart
        .map((l) => ({ ...l, hit: allVariants.find((x) => x.v.id === l.variantId)! }))
        .filter((l) => l.hit),
    [cart, allVariants],
  );
  const total = lines.reduce((s, l) => s + l.hit.v.price * l.qty, 0);
  const setQty = (id: string, q: number) =>
    setCart((c) => (q <= 0 ? c.filter((l) => l.variantId !== id) : c.map((l) => (l.variantId === id ? { ...l, qty: q } : l))));

  const openModal = () => {
    setModal(true);
    setDetected(null);
    setPick(null);
    setSearch("");
    setModalManual("");
    (document.activeElement as HTMLElement | null)?.blur();
  };

  const saveBarcode = () => {
    if (!detected || !pick) return;
    setProducts((ps) =>
      ps.map((p) => ({
        ...p,
        variants: p.variants.map((v) =>
          v.id === pick ? { ...v, barcode: detected } : v.barcode === detected ? { ...v, barcode: undefined } : v,
        ),
      })),
    );
    const hit = allVariants.find((x) => x.v.id === pick);
    notify(`Barcode saved to ${hit?.p.name} — ${hit?.v.name}`, true);
    setDetected(null);
    setPick(null);
    setSearch("");
  };

  const removeBarcode = (vid: string) =>
    setProducts((ps) => ps.map((p) => ({ ...p, variants: p.variants.map((v) => (v.id === vid ? { ...v, barcode: undefined } : v)) })));

  const saveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const price = parseFloat(form.price);
    const pn = form.product.trim();
    const vn = form.variant.trim() || "Standard";
    if (!pn || isNaN(price)) return notify("Enter product name and price", false);
    setProducts((ps) => {
      const ex = ps.find((p) => p.name.toLowerCase() === pn.toLowerCase());
      const v = { id: uid(), name: vn, price };
      if (ex) return ps.map((p) => (p === ex ? { ...p, variants: [...p.variants, v] } : p));
      return [{ id: uid(), name: pn, variants: [v] }, ...ps];
    });
    setForm({ product: pn, variant: "", price: "" });
    notify(`Saved ${pn} — ${vn}`, true);
  };

  const input = "w-full rounded-md border border-input bg-muted px-3 py-2 outline-none focus:ring-2 focus:ring-ring";
  const filtered = allVariants.filter(({ p, v }) =>
    (p.name + " " + v.name).toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="min-h-screen p-4 md:p-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">
          Scan<span className="text-primary">POS</span>
        </h1>
        <div className="flex gap-2">
          <button onClick={openModal} className="rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary">
            + Add barcode
          </button>
          <nav className="flex gap-1 rounded-lg bg-card p-1">
            {(["sell", "products"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-4 py-2 text-sm font-medium capitalize ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {t}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {msg && (
        <div className={`fixed right-4 top-4 z-50 rounded-md px-4 py-3 font-medium shadow-lg ${msg.ok ? "bg-primary text-primary-foreground" : "bg-destructive text-destructive-foreground"}`}>
          {msg.text}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-border bg-card p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Add barcode</h2>
              <button onClick={() => setModal(false)} className="text-muted-foreground">✕</button>
            </div>

            {!detected ? (
              <div className="py-8 text-center">
                <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-primary">
                  <span className="h-3 w-3 animate-pulse rounded-full bg-primary" />
                </div>
                <p className="font-medium">Waiting for barcode…</p>
                <p className="mb-6 text-sm text-muted-foreground">Scan an item with your scanner now.</p>
                <form
                  onSubmit={(e) => { e.preventDefault(); scan(modalManual); setModalManual(""); }}
                  className="mx-auto max-w-xs"
                >
                  <input className={input + " font-mono text-center"} placeholder="Or type barcode + Enter" value={modalManual} onChange={(e) => setModalManual(e.target.value)} />
                </form>
              </div>
            ) : (
              <>
                <div className="mb-3 rounded-lg bg-muted p-3">
                  <div className="text-xs text-muted-foreground">Detected barcode</div>
                  <div className="font-mono text-lg font-semibold">{detected}</div>
                </div>
                <input className={input + " mb-3"} placeholder="Search product or variant" value={search} onChange={(e) => setSearch(e.target.value)} />
                <ul className="mb-4 flex-1 divide-y divide-border overflow-y-auto">
                  {filtered.map(({ p, v }) => (
                    <li key={v.id}>
                      <button
                        onClick={() => setPick(v.id)}
                        className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left ${pick === v.id ? "bg-primary/15 ring-1 ring-primary" : ""}`}
                      >
                        <div className="flex-1">
                          <div className="font-medium">{p.name} <span className="text-muted-foreground">— {v.name}</span></div>
                          <div className="font-mono text-xs text-muted-foreground">{v.barcode ?? "No barcode"}</div>
                        </div>
                        <div className="font-mono text-sm">{money(v.price)}</div>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <button onClick={() => { setDetected(null); setPick(null); }} className="flex-1 rounded-lg bg-secondary py-2.5 text-sm">
                    Scan again
                  </button>
                  <button disabled={!pick} onClick={saveBarcode} className="flex-1 rounded-lg bg-primary py-2.5 font-semibold text-primary-foreground disabled:opacity-40">
                    Save
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {tab === "sell" ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <section className="rounded-xl bg-card p-4">
            <div className="mb-4 flex items-center gap-3 rounded-lg border border-dashed border-primary/50 p-3 text-sm text-muted-foreground">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
              Scanner ready — scan any barcode to add it to the cart.
            </div>
            <form onSubmit={(e) => { e.preventDefault(); scan(manual); setManual(""); }} className="mb-4 flex gap-2">
              <input className={input + " font-mono"} placeholder="Or type barcode + Enter" value={manual} onChange={(e) => setManual(e.target.value)} />
            </form>
            {lines.length === 0 ? (
              <p className="py-16 text-center text-muted-foreground">Cart is empty</p>
            ) : (
              <ul className="divide-y divide-border">
                {lines.map(({ variantId, qty, hit }) => {
                  const f = flash?.startsWith(variantId + ":");
                  return (
                    <li key={variantId + (f ? flash : "")} className={`flex items-center gap-3 rounded-md px-2 py-3 ${f ? "animate-flash" : ""}`}>
                      <div className="flex-1">
                        <div className="font-medium">{hit.p.name} <span className="text-muted-foreground">— {hit.v.name}</span></div>
                        <div className="font-mono text-xs text-muted-foreground">{hit.v.barcode} · {money(hit.v.price)}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button className="h-8 w-8 rounded-md bg-secondary" onClick={() => setQty(variantId, qty - 1)}>−</button>
                        <span className="w-8 text-center font-mono">{qty}</span>
                        <button className="h-8 w-8 rounded-md bg-secondary" onClick={() => setQty(variantId, qty + 1)}>+</button>
                      </div>
                      <div className="w-24 text-right font-mono font-semibold">{money(hit.v.price * qty)}</div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <aside className="h-fit rounded-xl bg-card p-6">
            <div className="text-sm text-muted-foreground">Items</div>
            <div className="mb-4 font-mono text-lg">{lines.reduce((s, l) => s + l.qty, 0)}</div>
            <div className="text-sm text-muted-foreground">Total</div>
            <div className="mb-6 font-mono text-4xl font-bold text-primary">{money(total)}</div>
            <button
              disabled={!lines.length}
              onClick={() => { notify(`Paid ${money(total)}`, true); setCart([]); }}
              className="w-full rounded-lg bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-40"
            >
              Checkout
            </button>
            <button disabled={!lines.length} onClick={() => setCart([])} className="mt-2 w-full rounded-lg py-2 text-sm text-muted-foreground disabled:opacity-40">
              Clear cart
            </button>
          </aside>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <form onSubmit={saveProduct} className="h-fit space-y-3 rounded-xl bg-card p-5">
            <h2 className="font-semibold">Add product / variant</h2>
            <p className="text-xs text-muted-foreground">Use an existing product name to add a new variant to it.</p>
            <input className={input} placeholder="Product name" value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} />
            <input className={input} placeholder="Variant (e.g. 1L, Large)" value={form.variant} onChange={(e) => setForm({ ...form, variant: e.target.value })} />
            <input className={input} type="number" step="0.01" placeholder="Price" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            <button className="w-full rounded-lg bg-primary py-2.5 font-semibold text-primary-foreground">Save</button>
          </form>
          <section className="space-y-3">
            <h2 className="font-semibold">{products.length} products · {allVariants.length} variants</h2>
            {products.map((p) => (
              <div key={p.id} className="rounded-xl bg-card p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="font-semibold">{p.name}</div>
                  <button onClick={() => setProducts((ps) => ps.filter((x) => x.id !== p.id))} className="text-sm text-destructive">Delete</button>
                </div>
                <ul className="divide-y divide-border">
                  {p.variants.map((v) => (
                    <li key={v.id} className="flex items-center gap-3 py-2 text-sm">
                      <div className="flex-1">{v.name}</div>
                      <div className={`font-mono text-xs ${v.barcode ? "" : "text-muted-foreground"}`}>
                        {v.barcode ?? "No barcode"}
                        {v.barcode && <button onClick={() => removeBarcode(v.id)} className="ml-2 text-destructive">✕</button>}
                      </div>
                      <div className="w-20 text-right font-mono">{money(v.price)}</div>
                      <button
                        onClick={() => setProducts((ps) => ps.map((x) => (x.id === p.id ? { ...x, variants: x.variants.filter((y) => y.id !== v.id) } : x)).filter((x) => x.variants.length))}
                        className="text-xs text-muted-foreground"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
