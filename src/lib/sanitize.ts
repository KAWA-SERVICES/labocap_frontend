import DOMPurify from "dompurify";

/**
 * Nettoyage de tout HTML venant de l'API avant injection dans le DOM
 * (`dangerouslySetInnerHTML`, `innerHTML`). Point de passage unique : ne jamais
 * injecter sans passer ici.
 *
 * - "html" : compte rendu saisi dans l'éditeur (mise en forme, listes, liens,
 *   images). `<script>`, gestionnaires `on*` et URL `javascript:` sont retirés.
 * - "svg"  : signature vectorielle. Le profil SVG de DOMPurify n'autorise ni
 *   `<script>`, ni `<foreignObject>`, ni les attributs `on*`, ni
 *   `href="javascript:"` ; `FORBID_TAGS` le redit explicitement pour qu'un
 *   changement de profil ne les réintroduise pas en silence.
 */
export function sanitize(dirty: string, profile: "html" | "svg" = "html"): string {
  // Sans DOM (rendu serveur), DOMPurify ne sait pas nettoyer : on ne rend rien
  // plutôt que du HTML brut. Les deux appelants sont de toute façon client-only.
  if (!DOMPurify.isSupported) return "";
  return profile === "svg"
    ? DOMPurify.sanitize(dirty, {
        USE_PROFILES: { svg: true, svgFilters: true },
        FORBID_TAGS: ["script", "foreignObject"],
      })
    : DOMPurify.sanitize(dirty, { USE_PROFILES: { html: true } });
}
