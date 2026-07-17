import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev-only. Lets the dev server accept HMR requests from the LAN address, so the
  // workspace can be opened on a phone for mobile QA. Has no effect on production.
  allowedDevOrigins: ["192.168.1.16", "172.29.144.1", "localhost", "127.0.0.1"],

  /**
   * Chromium is a ~50MB binary, not JavaScript. If the bundler traces and inlines it, the PDF
   * route either fails to build or ships a broken executable path at run time. Left external, both
   * packages are required from node_modules at run time, which is what they expect.
   */
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
};

export default nextConfig;
