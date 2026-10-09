import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ScanPOS — Barcode Point of Sale" },
      { name: "description", content: "Fast point of sale: scan barcodes to add products to the cart instantly." },
      { property: "og:title", content: "ScanPOS — Barcode Point of Sale" },
      { property: "og:description", content: "Scan barcodes to add products to the cart instantly." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: POS,
});

type Product = { barcode: string; name: string; price: number };
type Line = { barcode: string; qty: number };

const SEED: Product[] = [
  { barcode: "8901234567890", name: "Mineral Water 1L", price: 20 },
  { barcode: "8900000000017", name: "Chocolate Bar", price: 45 },
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
  const [products, setProducts] = useStored<Product[]>("pos-products", SEED);
  const [cart, setCart] = useState<Line[]>([]);
  const [tab, setTab] = useState<"sell" | "products">("sell");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [form, setForm] = useState({ barcode: "", name: "", price: "" });
  const [manual, setManual] = useState("");
  const buf = useRef({ s: "", t: 0 });
  const nameRef = useRef<HTMLInputElement>(null);
  const productsRef = useRef(products);
  productsRef.current = products;
  const tabRef = useRef(tab);
  tabRef.current = tab;

  const notify = (text: string, ok: boolean) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 2000);
  };

  const scan = (code: string) => {
    code = code.trim();
    if (!code) return;
    if (tabRef.current === "products") {
      setForm((f) => ({ ...f, barcode: code }));
      setTimeout(() => nameRef.current?.focus(), 0);
      return;
    }
    const p = productsRef.current.find((x) => x.barcode === code);
    if (!p) return notify(`Unknown barcode ${code}`, false);
    setCart((c) => {
      const i = c.findIndex((l) => l.barcode === code);
      if (i < 0) return [{ barcode: code, qty: 1 }, ...c];
      return c.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
    });
    setFlash(code + Date.now());
    notify(`Added ${p.name}`, true);
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
    () => cart.map((l) => ({ ...l, p: products.find((p) => p.barcode === l.barcode)! })).filter((l) => l.p),
    [cart, products],
  );
  const total = lines.reduce((s, l) => s + l.p.price * l.qty, 0);
  const setQty = (b: string, q: number) =>
    setCart((c) => (q <= 0 ? c.filter((l) => l.barcode !== b) : c.map((l) => (l.barcode === b ? { ...l, qty: q } : l))));

  const saveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const price = parseFloat(form.price);
    if (!form.barcode.trim() || !form.name.trim() || isNaN(price)) return notify("Fill all fields", false);
    const p = { barcode: form.barcode.trim(), name: form.name.trim(), price };
    setProducts((ps) => [p, ...ps.filter((x) => x.barcode !== p.barcode)]);
    setForm({ barcode: "", name: "", price: "" });
    notify(`Saved ${p.name}`, true);
  };

  const input = "w-full rounded-md border border-input bg-muted px-3 py-2 outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="min-h-screen p-4 md:p-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">
          Scan<span className="text-primary">POS</span>
        </h1>
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
      </header>

      {msg && (
        <div className={`fixed right-4 top-4 z-10 rounded-md px-4 py-3 font-medium shadow-lg ${msg.ok ? "bg-primary text-primary-foreground" : "bg-destructive text-destructive-foreground"}`}>
          {msg.text}
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
                {lines.map((l) => (
                  <li key={l.barcode + (flash?.startsWith(l.barcode) ? flash : "")} className={`flex items-center gap-3 rounded-md px-2 py-3 ${flash?.startsWith(l.barcode) ? "animate-flash" : ""}`}>
                    <div className="flex-1">
                      <div className="font-medium">{l.p.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{l.barcode} · {money(l.p.price)}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button className="h-8 w-8 rounded-md bg-secondary" onClick={() => setQty(l.barcode, l.qty - 1)}>−</button>
                      <span className="w-8 text-center font-mono">{l.qty}</span>
                      <button className="h-8 w-8 rounded-md bg-secondary" onClick={() => setQty(l.barcode, l.qty + 1)}>+</button>
                    </div>
                    <div className="w-24 text-right font-mono font-semibold">{money(l.p.price * l.qty)}</div>
                  </li>
                ))}
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
            <h2 className="font-semibold">Add product</h2>
            <p className="text-xs text-muted-foreground">Scan a barcode to fill it in automatically.</p>
            <input className={input + " font-mono"} placeholder="Barcode" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); nameRef.current?.focus(); } }} />
            <input ref={nameRef} className={input} placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className={input} type="number" step="0.01" placeholder="Price" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            <button className="w-full rounded-lg bg-primary py-2.5 font-semibold text-primary-foreground">Save product</button>
          </form>
          <section className="rounded-xl bg-card p-4">
            <h2 className="mb-2 font-semibold">{products.length} products</h2>
            <ul className="divide-y divide-border">
              {products.map((p) => (
                <li key={p.barcode} className="flex items-center gap-3 py-3">
                  <div className="flex-1">
                    <div className="font-medium">{p.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{p.barcode}</div>
                  </div>
                  <div className="font-mono">{money(p.price)}</div>
                  <button onClick={() => setForm({ barcode: p.barcode, name: p.name, price: String(p.price) })} className="text-sm text-accent">Edit</button>
                  <button onClick={() => setProducts((ps) => ps.filter((x) => x.barcode !== p.barcode))} className="text-sm text-destructive">Delete</button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
