import Image from "next/image";

const brandName = "Operyx";
const brandTagline = "Operations. Automated.";

export function BrandMark({ compact = false, light = false }: { compact?: boolean; light?: boolean }) {
  return (
    <span className="flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-[#E8EAF0] bg-white shadow-sm">
        <Image src="/operyx-mark-2026.png" alt={`${brandName} mark`} width={40} height={40} className="size-9 object-contain" priority />
      </span>
      {!compact && <span className="grid leading-none">
        <span className={`text-lg font-bold tracking-tight ${light ? "text-white" : "text-[#171717]"}`}>{brandName}</span>
        <span className={`mt-0.5 text-[11px] font-medium ${light ? "text-white/70" : "text-[#6B7280]"}`}>{brandTagline}</span>
      </span>}
    </span>
  );
}

export { brandName, brandTagline };
