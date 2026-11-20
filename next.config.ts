import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // the invoice PDF reads its fonts and logo from disk
  outputFileTracingIncludes: {
    "/admin/invoices/[id]/pdf": ["./src/assets/fonts/**", "./public/images/iconmark-pink.png"],
    "/admin/reports/[id]/pdf": ["./src/assets/fonts/**", "./public/images/iconmark-pink.png"],
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
