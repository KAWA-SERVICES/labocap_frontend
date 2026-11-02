/**
 * Mise en forme des résultats d'outils de l'assistant.
 *
 * <p>Les outils renvoient du JSON libre : on n'écrit pas une carte par outil.
 * Un tableau d'objets devient un tableau, des compteurs deviennent des tuiles,
 * le reste n'est pas affiché — le texte de l'assistant le résume déjà.</p>
 */

export interface Cellule {
  texte: string;
  lien?: string;
}

export interface FormeDonnees {
  tuiles: { libelle: string; valeur: string }[];
  colonnes: string[];
  lignes: Cellule[][];
}

const MAX_COLONNES = 6;
const MAX_LIGNES = 20;
const DATE_ISO = /^\d{4}-\d{2}-\d{2}(T[\d:.]+)?/;

/** Lien vers la fiche quand l'objet porte un identifiant reconnu. */
function lienDe(o: Record<string, unknown>): string | undefined {
  const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
  const rapport = uuid(o.reportId);
  if (rapport) return `/reports/${rapport}`;
  const demande = uuid(o.testOrderId);
  if (demande) return `/test-orders/${demande}`;
  return undefined;
}

const masquee = (cle: string) => cle === "id" || /Id$/.test(cle) || cle === "ui";

export function humaniser(cle: string): string {
  const mots = cle
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .trim();
  return mots.charAt(0).toUpperCase() + mots.slice(1);
}

export function formaterValeur(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Oui" : "Non";
  if (typeof v === "number") return v.toLocaleString("fr-FR");
  if (typeof v === "string" && DATE_ISO.test(v)) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) {
      return v.length > 10
        ? d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })
        : d.toLocaleDateString("fr-FR");
    }
  }
  if (typeof v === "object") return "—";
  return String(v);
}

const estObjet = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function tableau(liste: Record<string, unknown>[]): Pick<FormeDonnees, "colonnes" | "lignes"> {
  const cles: string[] = [];
  for (const o of liste) {
    for (const k of Object.keys(o)) {
      if (!masquee(k) && !cles.includes(k) && typeof o[k] !== "object") cles.push(k);
    }
  }
  const colonnes = cles.slice(0, MAX_COLONNES);
  // Le lien se pose sur la colonne « code » si elle existe, sinon la première.
  const colLien = Math.max(0, colonnes.indexOf("code"));
  const lignes = liste.slice(0, MAX_LIGNES).map((o) => {
    const lien = lienDe(o);
    return colonnes.map((k, i) => ({ texte: formaterValeur(o[k]), lien: i === colLien ? lien : undefined }));
  });
  return { colonnes: colonnes.map(humaniser), lignes };
}

/** `null` quand il n'y a rien d'utile à montrer en plus du texte. */
export function formeDesDonnees(donnees: unknown): FormeDonnees | null {
  const vide: FormeDonnees = { tuiles: [], colonnes: [], lignes: [] };
  if (Array.isArray(donnees)) {
    const objets = donnees.filter(estObjet);
    return objets.length ? { ...vide, ...tableau(objets) } : null;
  }
  if (!estObjet(donnees)) return null;

  const tuiles = Object.entries(donnees)
    .filter(([k, v]) => typeof v === "number" && !masquee(k))
    .map(([k, v]) => ({ libelle: humaniser(k), valeur: formaterValeur(v) }));
  const liste = Object.values(donnees).find(
    (v): v is Record<string, unknown>[] => Array.isArray(v) && v.length > 0 && v.every(estObjet),
  );
  const forme = { ...vide, tuiles, ...(liste ? tableau(liste) : {}) };
  return forme.tuiles.length || forme.lignes.length ? forme : null;
}

/** Seule navigation qu'un résultat d'outil peut demander : ouvrir un compte rendu. */
export function cheminAutorise(ui: unknown): string | null {
  if (!estObjet(ui) || typeof ui.naviguer !== "string") return null;
  return /^\/reports\/[0-9a-f-]{36}$/i.test(ui.naviguer) ? ui.naviguer : null;
}
