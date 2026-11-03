/**
 * Crédit SMS et appels du laboratoire (portefeuille prépayé tenu par FluidChat,
 * relayé par l'API sous `/dashboard/credit-messagerie`).
 *
 * Bornes reprises du serveur : une recharge Mobile Money va de 1 000 à
 * 2 000 000 F (plafond du collecteur), et le premier achat du forfait illimité
 * engage sur 3 mois au moins (offre KS-OFFRE-2026-10-SMS).
 */

export type PlanCredit = "none" | "unit" | "unlimited";

export const MONTANT_MIN = 1_000;
export const MONTANT_MAX = 2_000_000;
export const RACCOURCIS_MONTANT = [5_000, 10_000, 25_000] as const;
export const MOIS_FORFAIT = [1, 3, 6, 12] as const;
export const ENGAGEMENT_MIN_MOIS = 3;
export const RESEAUX = [
  { value: "MTN", label: "MTN" },
  { value: "MOOV", label: "Moov" },
  { value: "CELTIIS", label: "Celtiis" },
] as const;

export function libelleOffre(plan: PlanCredit): string {
  if (plan === "unit") return "À l'unité";
  if (plan === "unlimited") return "Forfait illimité";
  return "Non activé";
}

/** `null` si le montant est accepté, sinon le message à afficher. */
export function erreurMontant(montant: number): string | null {
  if (!Number.isInteger(montant) || montant < MONTANT_MIN || montant > MONTANT_MAX) {
    return "Entre 1 000 et 2 000 000 F, sans décimales.";
  }
  return null;
}

/** Durées proposées : le premier achat (aucune échéance encore) engage sur 3 mois. */
export function moisProposes(illimiteJusquAu: string | null): number[] {
  return MOIS_FORFAIT.filter((m) => illimiteJusquAu !== null || m >= ENGAGEMENT_MIN_MOIS);
}

export function montantForfait(mois: number, prixMois: number): number {
  return mois * prixMois;
}

/** 75 → « 1:15 » ; au-delà d'une heure, « 1:02:05 ». */
export function formatDuree(secondes: number): string {
  const s = Math.max(0, Math.floor(secondes));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

/** Numéro Mobile Money béninois : 8 chiffres (ancien) ou 10 (01…), indicatif facultatif. */
export function erreurTelephone(telephone: string): string | null {
  const chiffres = telephone.replace(/[\s.+-]/g, "").replace(/^00/, "");
  const local = chiffres.startsWith("229") ? chiffres.slice(3) : chiffres;
  return /^(01)?\d{8}$/.test(local) ? null : "Numéro Mobile Money béninois attendu (ex. 01 97 00 00 01).";
}

/** Ligne du registre du crédit (`/dashboard/credit-messagerie/mouvements`). */
export interface MouvementCredit {
  id: number;
  /** topup, plan, sms, call, refund, manual */
  type: string;
  montantFcfa: number;
  /** Unités d'un SMS (160 caractères chacune), secondes d'un appel, mois d'un forfait. */
  unites: number;
  note: string;
  soldeApres: number;
  le: string;
}

const TYPES: Record<string, string> = {
  topup: "Recharge",
  plan: "Forfait",
  sms: "SMS",
  call: "Appel",
  refund: "Remboursement",
  manual: "Ajustement",
};

export function libelleMouvement(type: string): string {
  return TYPES[type] ?? type;
}

/** « 2 unités », « 0:45 », « 3 mois », ou la note d'un ajustement. */
export function detailMouvement(m: MouvementCredit): string {
  if (m.type === "sms") return `${m.unites} unité${m.unites > 1 ? "s" : ""}${m.note ? ` · ${m.note}` : ""}`;
  if (m.type === "call") return `${formatDuree(m.unites)}${m.note ? ` · ${m.note}` : ""}`;
  if (m.type === "plan") return `${m.unites} mois`;
  return m.note;
}

/** « 2026-11 » pour le mois en cours puis les 11 précédents. */
export function derniersMois(aujourdhui: Date, n = 12): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth() - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

/** « 2026-11 » → « novembre 2026 ». */
export function libelleMois(mois: string): string {
  const [a, m] = mois.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(a, m - 1, 1));
}

/** Débits et crédits du mois, recharges et ajustements compris. */
export function totauxMois(lignes: MouvementCredit[]): { debits: number; credits: number } {
  return lignes.reduce(
    (t, l) => (l.montantFcfa < 0 ? { ...t, debits: t.debits - l.montantFcfa } : { ...t, credits: t.credits + l.montantFcfa }),
    { debits: 0, credits: 0 },
  );
}

/**
 * CSV pour Excel : séparateur « ; » (Excel en français), BOM UTF-8 pour les
 * accents, champs entre guillemets dès qu'ils contiennent « ; », « " » ou un
 * saut de ligne.
 */
export function mouvementsCsv(lignes: MouvementCredit[]): string {
  const champ = (v: string | number) => {
    const s = String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const tete = ["Date", "Type", "Détail", "Montant (F CFA)", "Solde après (F CFA)"];
  const corps = lignes.map((l) =>
    [l.le, libelleMouvement(l.type), detailMouvement(l), l.montantFcfa, l.soldeApres].map(champ).join(";"),
  );
  return "﻿" + [tete.join(";"), ...corps].join("\r\n");
}
