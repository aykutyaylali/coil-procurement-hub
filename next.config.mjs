/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Standalone çıktısı YALNIZCA Docker/deploy build'inde (NEXT_OUTPUT_STANDALONE=true).
  // Lokal `npm run prod` (next start) normal çıktı kullanır; aksi halde standalone ile
  // `next start` statik dosyaları sunamaz (chunk'lar 400 → "client-side exception").
  output: process.env.NEXT_OUTPUT_STANDALONE === "true" ? "standalone" : undefined,
  // pdfkit'i webpack ile paketleme; runtime'da node_modules'tan yÃ¼kle
  serverExternalPackages: ["pdfkit"],
  eslint: {
    // Lint is run explicitly in CI via `npm run lint`; do not block production builds on it.
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
        ],
      },
    ];
  },
};

export default nextConfig;
