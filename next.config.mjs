/** @type {import('next').NextConfig} */
const securityHeaders = [
  // Arch-P2: Basis-Security-Header (CSP bewusst report-frei/minimal, da Tiptap/Recharts Inline-Styles nutzen)
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=(), usb=()" }, // Mikrofon erlaubt (Voice)
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig = {
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  // ESLint-Warnungen (z. B. ungenutzte Importe) sollen den Build nicht blockieren.
  // TypeScript-Fehler bleiben aktiv (kein ignoreBuildErrors).
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};
export default nextConfig;
