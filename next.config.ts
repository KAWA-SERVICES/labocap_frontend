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
  // Inventaire (grep getUserMedia / mediaDevices / geolocation : aucun usage) :
  // les « appels vocaux » et notes partent de l'API (OurVoice), jamais du micro
  // du navigateur ; la signature se dessine au canvas, pas à la caméra. On coupe
  // donc les trois. Le presse-papiers (navigator.clipboard, accès mobile) garde
  // sa valeur par défaut (`self`).
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
