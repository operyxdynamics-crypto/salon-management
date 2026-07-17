"use client";

import { Clock, Package, Star } from "lucide-react";
import { inr } from "@/lib/format";

/**
 * The item tile.
 *
 * The single most-touched control in the product - reception hits it eighty times a day - so
 * everything about it is optimised for the tap, not for the layout.
 *
 * Two decisions worth defending:
 *
 * 1. **The stepper lives on the tile.** Quantity used to hide in a line editor behind the cart. If
 *    you cannot see it, you do not know it is there. An un-added item shows a full-width "Add"
 *    button rather than a "+", because a "+" on an empty card asks you to understand state.
 *
 * 2. **A service and a product are not the same thing.** A service's quantity means "how many
 *    times"; a product's means "how many units", and it can run out. Showing both as a bare "x2"
 *    hides the one that can actually be oversold.
 */

export type TileService = {
  id: string;
  name: string;
  price: number;
  durationMinutes: number;
};

export type TileProduct = {
  id: string;
  name: string;
  price: number;
  brandName: string | null;
  unit: string;
  available: number;
};

/**
 * The action row: one 36px-tall control, always the same size whether it says "Add" or shows a
 * stepper. The tile must not change height when something is added to it - a grid that reflows
 * under your finger is how you tap the wrong thing.
 *
 * Add is green, remove is red: opposite acts, and at speed the colour is read long before the
 * glyph is.
 */
function Stepper({ quantity, onAdd, onRemove, canAdd }: {
  quantity: number;
  onAdd: () => void;
  onRemove: () => void;
  canAdd: boolean;
}) {
  return <div className="mt-2.5 flex h-9 items-stretch overflow-hidden rounded-lg border border-[#E3E6EC]" onClick={(event) => event.stopPropagation()}>
    <button
      type="button"
      onClick={onRemove}
      aria-label="One less"
      className="grid w-9 shrink-0 place-items-center bg-[#FDECEC] text-lg font-bold leading-none text-[#C4403E] transition hover:bg-[#F9DAD9] active:scale-95"
    >−</button>
    <span className="grid flex-1 place-items-center bg-white text-[15px] font-bold tabular-nums text-[#1F2937]">{quantity}</span>
    <button
      type="button"
      onClick={onAdd}
      disabled={!canAdd}
      aria-label="One more"
      className="grid w-9 shrink-0 place-items-center bg-[#12916C] text-lg font-bold leading-none text-white transition hover:bg-[#0B6B4F] active:scale-95 disabled:opacity-40"
    >+</button>
  </div>;
}

function AddButton({ onClick, label = "Add", disabled }: { onClick: () => void; label?: string; disabled?: boolean }) {
  return <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="mt-2.5 h-9 w-full rounded-lg border border-[#A9DFCB] bg-[#E9F7F1] text-[13px] font-bold text-[#0B6B4F] transition hover:bg-[#D6F0E5] active:scale-[0.98] disabled:cursor-not-allowed disabled:border-[#E3E6EC] disabled:bg-[#F6F7FA] disabled:text-[#A8AEBC]"
  >{label}</button>;
}

/**
 * Every tile is the same height whatever its content, and the action row never changes size when
 * something is added. A grid that reflows under your finger is how you tap the wrong thing.
 */
const TILE = "flex h-[128px] flex-col justify-between rounded-xl border p-3 text-left transition";

export function ServiceTile({ service, quantity, isFavourite, onAdd, onRemove }: {
  service: TileService;
  quantity: number;
  isFavourite: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const inCart = quantity > 0;
  return <div className={`${TILE} ${inCart ? "border-[#5B2A86] bg-[#F6F2FB]" : "border-[#E3E6EC] bg-white hover:border-[#D2D6DF]"}`}>
    <div className="min-w-0">
      <p className="flex items-start gap-1 text-[14px] font-bold leading-snug text-[#1F2937]">
        {isFavourite && <Star size={11} className="mt-1 shrink-0 fill-[#B57900] text-[#B57900]" />}
        <span className="line-clamp-2">{service.name}</span>
      </p>
      {/* Price and duration on one line, never wrapping. The price is what the eye is hunting for. */}
      <p className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-[13px]">
        <span className="font-bold tabular-nums text-[#1F2937]">{inr.format(service.price)}</span>
        <span className="flex items-center gap-0.5 text-[#9CA3AF]"><Clock size={10} />{service.durationMinutes}m</span>
      </p>
    </div>

    {inCart
      ? <Stepper quantity={quantity} onAdd={onAdd} onRemove={onRemove} canAdd />
      : <AddButton onClick={onAdd} />}
  </div>;
}

export function ProductTile({ product, quantity, onAdd, onRemove }: {
  product: TileProduct;
  quantity: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const inCart = quantity > 0;
  const remaining = product.available - quantity;
  const soldOut = remaining <= 0 && !inCart;
  const lastOne = remaining <= 0 && inCart;

  return <div className={`${TILE} ${soldOut ? "border-[#E3E6EC] bg-[#F6F7FA]" : inCart ? "border-[#5B2A86] bg-[#F6F2FB]" : "border-[#E3E6EC] bg-white hover:border-[#D2D6DF]"}`}>
    <div className="min-w-0">
      <p className={`line-clamp-2 text-[14px] font-bold leading-snug ${soldOut ? "text-[#A8AEBC]" : "text-[#1F2937]"}`}>{product.name}</p>

      <p className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-[13px]">
        <span className={`font-bold tabular-nums ${soldOut ? "text-[#A8AEBC]" : "text-[#1F2937]"}`}>{inr.format(product.price)}</span>
        {/* Brand - which the old POS could not show, because it did not exist as data. */}
        {product.brandName && <span className="truncate text-[#9CA3AF]">{product.brandName}</span>}
      </p>

      <p className={`mt-0.5 flex items-center gap-1 whitespace-nowrap text-[11px] font-bold ${soldOut ? "text-[#C4403E]" : remaining <= 3 ? "text-[#B57900]" : "text-[#9CA3AF]"}`}>
        <Package size={10} className="shrink-0" />
        {soldOut ? "None left" : lastOne ? "Last one" : `${remaining} left`}
      </p>
    </div>

    {soldOut
      ? <AddButton onClick={onAdd} label="Out of stock" disabled />
      : inCart
        ? <Stepper quantity={quantity} onAdd={onAdd} onRemove={onRemove} canAdd={remaining > 0} />
        : <AddButton onClick={onAdd} />}
  </div>;
}

/**
 * How a cart line reads out loud.
 *
 * Not "Hair spa x 2" but "2 times · with Priya". Not "Shampoo x 2" but "2 bottles · 200ml each".
 * Not a fake discount equal to the price, but "Free with her package". Reception should be able to
 * read the bill back to the customer without translating anything.
 */
export function cartLineSubtitle(line: {
  type: "SERVICE" | "PRODUCT";
  quantity: number;
  packagePurchaseId?: string;
  staffName?: string | null;
  unit?: string | null;
  brandName?: string | null;
}) {
  if (line.packagePurchaseId) return "Free with their package";

  if (line.type === "SERVICE") {
    const times = line.quantity === 1 ? "once" : `${line.quantity} times`;
    return line.staffName ? `${times} · with ${line.staffName}` : times;
  }

  const unit = (line.unit || "").trim();
  const noun = line.quantity === 1 ? "item" : "items";
  const count = unit ? `${line.quantity} × ${unit}` : `${line.quantity} ${noun}`;
  return line.brandName ? `${count} · ${line.brandName}` : count;
}
