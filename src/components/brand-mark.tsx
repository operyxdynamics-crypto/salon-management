import Image from "next/image";

const brandName = "Operyx";
const brandTagline = "Operations. Automated.";

/**
 * The wordmark is live text, not part of the image - which is why it disappeared in dark mode: it
 * was pinned to near-black and only turned white if a caller remembered to pass `light`. Nothing
 * told it the theme had changed, so it rendered black on a black background.
 *
 * It now reads the same semantic tokens as the rest of the app, which already flip under
 * [data-theme="dark"]. `light` stays for the one case tokens cannot know about: the mark sitting on
 * a coloured surface (the purple login panel) where the text must be white in either theme.
 */
export function BrandMark({ compact = false, light = false }: { compact?: boolean; light?: boolean }) {
  return (
    <span className="flex items-center gap-3">
      {/* The mark itself is purple on transparent, so it keeps a light chip in both themes - purple
          on a dark surface is too low-contrast to read at 36px. */}
      <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-[#E8EAF0] bg-white shadow-sm">
        <Image src="/operyx-mark-2026.png" alt={`${brandName} mark`} width={40} height={40} className="size-9 object-contain" priority />
      </span>
      {!compact && <span className="grid leading-none">
        <span className={`text-lg font-bold tracking-tight ${light ? "text-white" : "text-[var(--text-primary)]"}`}>{brandName}</span>
        <span className={`mt-0.5 text-[11px] font-medium ${light ? "text-white/70" : "text-[var(--text-secondary)]"}`}>{brandTagline}</span>
      </span>}
    </span>
  );
}

export { brandName, brandTagline };
