import Image from "next/image";

const brandName = "Neel Bridal Studio";

export function BrandMark({ compact = false, light = false }: { compact?: boolean; light?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-black ring-1 ring-[#d7b35d]/70">
        <Image src="/neel-bridal-studio-logo.png" alt={`${brandName} logo`} width={40} height={40} className="size-10 object-cover" priority />
      </span>
      {!compact && <span className={`font-serif text-2xl font-semibold tracking-tight ${light ? "text-white" : "text-[#252320]"}`}>{brandName}</span>}
    </span>
  );
}

export { brandName };
