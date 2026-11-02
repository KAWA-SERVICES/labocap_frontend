import type { NextConfig } from "next";

/**
 * En-têtes de durcissement posés sur toutes les routes.
 *
 * La CSP n'est pas ici : elle a besoin d'un nonce par requête, que seul
 * src/proxy.ts peut produire (`headers()` est statique, évalué au build).
 */
const securityHeaders = [
  // Un an de HTTPS imposé, sous-domaines compris. Sans `preload` : l'inscription
  // sur la liste des navigateurs est quasi irréversible, à décider à part.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Inventaire (grep getUserMedia / mediaDevices / geolocation) : seul le
  // micro sert, à la dictée des comptes rendus (RichTextEditor), sur notre
  // propre origine — `self`, jamais un iframe tiers. Les « appels vocaux »
  // partent de l'API (OurVoice) ; la signature se dessine au canvas, pas à la
  // caméra : caméra et géolocalisation restent coupées. Le presse-papiers garde
  // sa valeur par défaut (`self`).
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
