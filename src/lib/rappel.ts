import type { BadgeVariant } from "@/components/ui/Badge";

/**
 * Issue du rappel automatique d'un patient (`IssueRappel` côté API), calculée
 * une fois à partir du retour FluidChat et stockée : le Suivi, le tableau de
 * bord et le bandeau lisent la même valeur.
 */
export type IssueRappel =
  | "EN_COURS"
  | "JOINT"
  | "PARTIEL"
  | "SANS_REPONSE"
  | "INJOIGNABLE"
  | "SANS_NUMERO"
  | "ANNULE";

/** Filtre `rappel` du Suivi : patients non joints, ni informés ni venus chercher le résultat. */
export const A_RAPPELER = "A_RAPPELER";

/** Ordre d'affichage : ce qui demande une action vient après ce qui s'est bien passé. */
export const ISSUES_RAPPEL: { value: IssueRappel; label: string; variant: BadgeVariant }[] = [
  { value: "EN_COURS", label: "En cours", variant: "info" },
  { value: "JOINT", label: "Joint", variant: "success" },
  { value: "PARTIEL", label: "Écoute partielle", variant: "warning" },
  { value: "SANS_REPONSE", label: "Sans réponse", variant: "warning" },
  { value: "INJOIGNABLE", label: "Injoignable", variant: "danger" },
  { value: "SANS_NUMERO", label: "Sans numéro", variant: "danger" },
  { value: "ANNULE", label: "Annulé", variant: "secondary" },
];

/** Libellé et teinte du badge ; `null` : aucun rappel n'est encore parti. */
export function badgeRappel(issue: IssueRappel | null | undefined): {
  label: string;
  variant: BadgeVariant;
} {
  return (
    ISSUES_RAPPEL.find((i) => i.value === issue) ?? {
      label: "En attente",
      variant: "secondary",
    }
  );
}

/** « 2 tentatives · 40 % écouté · 27/10/2026 14:05 » — parties absentes omises. */
export function detailRappel(row: {
  rappelTentatives?: number | null;
  rappelPctEcoute?: number | null;
  rappelDate?: string | null;
}): string {
  const parts: string[] = [];
  if (row.rappelTentatives != null)
    parts.push(`${row.rappelTentatives} tentative${row.rappelTentatives > 1 ? "s" : ""}`);
  if (row.rappelPctEcoute != null) parts.push(`${row.rappelPctEcoute} % écouté`);
  if (row.rappelDate) {
    const d = new Date(row.rappelDate);
    if (!Number.isNaN(d.getTime()))
      parts.push(
        d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }),
      );
  }
  return parts.join(" · ");
}

/** Réglages manquants signalés par `/dashboard/rappels` (`reglagesManquants`). */
const REGLAGES_MANQUANTS: Record<string, string> = {
  fluidchat_api: "service d'appel non configuré sur le serveur",
  fluidchat_audio_fr: "audio français",
  fluidchat_audio_fon: "audio fon",
  fluidchat_audio_en: "audio anglais",
  fluidchat_audio_bip: "audio du bip",
};

/**
 * « audio fon, audio du bip non renseignés » ; le service d'appel, lui, se dit
 * à part (affaire d'administrateur technique, pas de Paramètres). Clé inconnue : affichée telle quelle.
 */
export function libelleReglagesManquants(cles: string[]): string {
  const audios = cles.filter((c) => c !== "fluidchat_api").map((c) => REGLAGES_MANQUANTS[c] ?? c);
  const parts: string[] = [];
  if (cles.includes("fluidchat_api")) parts.push(REGLAGES_MANQUANTS.fluidchat_api);
  if (audios.length)
    parts.push(`${audios.join(", ")} non renseigné${audios.length > 1 ? "s" : ""}`);
  return parts.join(" ; ");
}

/** Jours d'appel, convention FluidChat : 0 = dimanche … 6 = samedi. Affichés du lundi au dimanche. */
export const JOURS_RAPPEL = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mer" },
  { value: 4, label: "Jeu" },
  { value: 5, label: "Ven" },
  { value: 6, label: "Sam" },
  { value: 0, label: "Dim" },
];

/** « 1,2,3,4,5 » → {1,2,3,4,5} ; valeurs hors 0–6 ignorées. */
export function lireJours(value: string): Set<number> {
  return new Set(
    value
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^[0-6]$/.test(s))
      .map(Number),
  );
}

/** {5,1,3} → « 1,3,5 », la forme lue par l'API. */
export function ecrireJours(jours: Set<number>): string {
  return Array.from(jours)
    .sort((a, b) => a - b)
    .join(",");
}

type ReleveAppel = { issue: IssueRappel | null; result: string | null; attempts: number | null };

/**
 * Appel en attente de sa plage (soir, week-end) : FluidChat le garde `EN_COURS`
 * sans résultat ni tentative.
 */
export function estProgramme(releve: ReleveAppel | undefined): boolean {
  return (
    releve?.issue === "EN_COURS" && releve.result == null && (releve.attempts ?? 0) === 0
  );
}

/**
 * Cadence du suivi en direct d'un appel : 5 s tant qu'il sonne, 60 s s'il attend
 * sa plage, arrêt dès qu'il a une issue. Avant le premier relevé : 5 s.
 */
export function intervalleSuiviAppel(releve: ReleveAppel | undefined): number | false {
  if (!releve) return 5_000;
  if (releve.issue !== "EN_COURS") return false;
  return estProgramme(releve) ? 60_000 : 5_000;
}
