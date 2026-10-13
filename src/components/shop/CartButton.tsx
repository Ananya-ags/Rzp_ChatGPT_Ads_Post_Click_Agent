"use client";
/**
 * Add to bag; once the item is in the bag it becomes a − qty + stepper (used for every Add button).
 * `max` is min(stock, 15 per order). At the limit + is disabled and the reason shows:
 * "Out of stock" when stock runs out, "Max 15 per order" when the per-order cap is hit.
 */
import { addToCart, setQty, useDemoState } from "@/lib/state";
import { MAX_PER_SKU } from "@/lib/view";

type Props = { sku: string; max: number; limitReason: "stock" | "order"; label?: string; size?: "sm" | "md" | "lg" | "touch"; className?: string };

const SIZES = {
  sm: { box: "h-8 text-[12px]", btn: "w-8 text-[15px]", note: "text-[10.5px]" },
  md: { box: "h-8 text-[12.5px] min-w-[96px]", btn: "w-8 text-[15px]", note: "text-[10.5px]" },
  lg: { box: "h-12 text-[14px]", btn: "w-12 text-[18px]", note: "" },
  touch: { box: "h-11 text-[12.5px]", btn: "w-9 text-[16px]", note: "text-[10.5px]" }, // chat cards: 44px tall
};

export default function CartButton({ sku, max, limitReason, label = "Add", size = "sm", className = "" }: Props) {
  const [state] = useDemoState();
  const qty = state.cart.find((l) => l.sku === sku)?.qty ?? 0;
  const s = SIZES[size];
  const atLimit = qty >= max;
  const limitText = limitReason === "stock" ? "Out of stock" : `Max ${MAX_PER_SKU} per order`;

  if (max <= 0) {
    return (
      <button disabled className={`rounded-full bg-line px-3 font-medium text-muted ${s.box} ${className}`}>
        Out of stock
      </button>
    );
  }
  if (qty === 0) {
    return (
      <button onClick={() => addToCart(sku, max)} className={`rounded-full bg-ink px-3 font-medium text-ivory active:scale-[0.98] ${s.box} ${className}`}>
        {label}
      </button>
    );
  }
  const stepper = (
    <div className={`flex items-center justify-between rounded-full border border-ink bg-white font-medium text-ink ${s.box} ${size === "lg" ? className : "w-full"}`} role="group" aria-label="Quantity in bag">
      <button onClick={() => setQty(sku, qty - 1, max)} className={`grid h-full place-items-center rounded-l-full active:bg-sand ${s.btn}`} aria-label={qty === 1 ? "Remove from bag" : "Decrease quantity"}>
        −
      </button>
      <span className="tabular-nums" aria-live="polite">
        {size === "lg" ? (atLimit ? `${qty} · ${limitText}` : `${qty} in bag`) : qty}
      </span>
      <button
        onClick={() => setQty(sku, qty + 1, max)}
        disabled={atLimit}
        className={`grid h-full place-items-center rounded-r-full active:bg-sand disabled:opacity-30 ${s.btn}`}
        aria-label={atLimit ? limitText : "Increase quantity"}
      >
        +
      </button>
    </div>
  );
  if (size === "lg") return stepper;
  return (
    <div className={`flex flex-col items-center gap-0.5 ${className}`}>
      {stepper}
      {atLimit && <span className={`font-medium ${limitReason === "stock" ? "text-danger" : "text-muted"} ${s.note}`}>{limitText}</span>}
    </div>
  );
}
