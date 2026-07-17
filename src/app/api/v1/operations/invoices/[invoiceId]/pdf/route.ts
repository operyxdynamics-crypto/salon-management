import { renderInvoiceDocument, type PaperSize } from "@/lib/invoice-document";
import { loadInvoiceDocumentData } from "@/lib/invoice-pdf-data";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";

/**
 * The invoice as a real PDF file.
 *
 * Rendered from the same HTML the print window uses, so there is exactly one invoice design: a
 * second renderer would drift, and the two would quietly disagree about a legal document. Headless
 * Chromium keeps the text selectable and searchable - a rasterised screenshot would be neither,
 * which matters when an auditor wants to find a GSTIN.
 */

// Chromium cannot run on the edge runtime, and the render needs a moment on a cold start.
export const runtime = "nodejs";
export const maxDuration = 60;

const PAPERS: PaperSize[] = ["A4", "A5"];

async function launchBrowser() {
  const puppeteer = await import("puppeteer-core");

  // In production the bundled Chromium build ships with the function. Locally there is no such
  // binary, so use the Chrome already installed on the machine.
  if (process.env.NODE_ENV === "production") {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  return puppeteer.launch({
    channel: process.env.CHROME_CHANNEL as "chrome" | undefined ?? "chrome",
    executablePath: process.env.CHROME_PATH || undefined,
    headless: true,
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  try {
    const url = new URL(request.url);
    const branchId = url.searchParams.get("branchId") ?? "all";
    const paperParam = (url.searchParams.get("paper") ?? "A4").toUpperCase() as PaperSize;
    if (!PAPERS.includes(paperParam)) throw new OperationsError("VALIDATION", "Paper must be A4 or A5", 400);
    // `inline` previews in a browser tab; the default attaches, which is what Download wants.
    const disposition = url.searchParams.get("disposition") === "inline" ? "inline" : "attachment";

    const context = await requireOperationsContext("report:read", { branchId, allowAll: true });
    const branchIds = context.branch ? [context.branch.id] : context.branches.map((branch) => branch.id);
    const invoice = await loadInvoiceDocumentData(
      (await params).invoiceId,
      branchIds,
      context.tenant.legalName ?? context.tenant.name,
    );
    if (!invoice) throw new OperationsError("NOT_FOUND", "Invoice not found", 404);

    const html = renderInvoiceDocument(invoice, paperParam);

    const browser = await launchBrowser();
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load" });
      // The document embeds a webfont. Wait for the font set rather than for network silence: it is
      // the actual condition we care about, and a PDF rendered a moment early falls back to Georgia.
      await page.evaluate(async () => { await document.fonts.ready; });
      const pdf = await page.pdf({
        // The stylesheet already declares `@page { size: A5 landscape }` and its margins. Preferring
        // it keeps paper decisions in one place instead of split between CSS and this call.
        preferCSSPageSize: true,
        printBackground: true,
      });

      const filename = `${invoice.number.replace(/[^A-Za-z0-9]+/g, "-")}-${paperParam}.pdf`;
      return new Response(pdf as unknown as BodyInit, {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `${disposition}; filename="${filename}"`,
          "cache-control": "private, no-store",
        },
      });
    } finally {
      await browser.close();
    }
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
