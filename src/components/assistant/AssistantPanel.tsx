"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, CircleAlert, Loader2, Lock, ThumbsDown, ThumbsUp, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS, type Permission } from "@/lib/constants/permissions";
import { useAssistantStore } from "@/stores/assistant.store";
import {
  assistantApi,
  ErreurAssistant,
  type Confirmation,
  type Transcription,
} from "@/lib/api/assistant";
import type { EvenementSse } from "@/lib/assistant-sse";
import { cheminAutorise, formeDesDonnees } from "./donnees";

// ─── État du service ────────────────────────────────────────────────────────

/** L'assistant est-il configuré ? Partagé par la barre du haut et le panneau. */
export function useEtatAssistant() {
  const { can } = usePermissions();
  const autorise = can(PERMISSIONS.VIEW_ASSISTANT) || can(PERMISSIONS.MANAGE_ASSISTANT);
  return useQuery({
    queryKey: ["assistant", "etat"],
    queryFn: assistantApi.etat,
    enabled: autorise,
    staleTime: 5 * 60_000,
  });
}

// ─── Fil de la conversation ─────────────────────────────────────────────────

type Element =
  | { kind: "user"; texte: string }
  | { kind: "assistant"; texte: string; seq?: number; avis?: 1 | -1 | null }
  | { kind: "outil"; callId: string; libelle: string; ok?: boolean; donnees?: unknown }
  | { kind: "confirmation"; conf: Confirmation; issue?: "acceptee" | "refusee" }
  | { kind: "info"; ton: "warning" | "danger"; texte: string; reessayer?: boolean };

/** Libellés de repli quand l'historique ne porte que le nom technique de l'outil. */
const LIBELLES_OUTILS: Record<string, string> = {
  file_resume: "Votre file consultée",
  file_priorite: "Votre file triée par priorité",
  demande_chercher: "Demandes d'examen consultées",
  demande_historique: "Historique de la demande consulté",
  medecins_lister: "Médecins consultés",
  demande_affecter_au_medecin: "Affectation de la demande",
  patient_chercher: "Patients consultés",
  patient_historique: "Dossier patient consulté",
  compte_rendu_etat: "Compte rendu consulté",
  compte_rendu_ouvrir: "Ouverture du compte rendu",
  compte_rendu_rechercher: "Recherche dans les comptes rendus",
  signaler_besoin: "Besoin noté pour l'équipe",
  factures_impayees: "Factures impayées consultées",
  facture_detail: "Facture consultée",
  recette_du_jour: "Recette du jour consultée",
};
const libelleOutil = (nom: string) => LIBELLES_OUTILS[nom] ?? "Données consultées";

function depuisTranscription(t: Transcription): Element[] {
  const elements: Element[] = [];
  for (const m of t.messages) {
    for (const b of m.blocs) {
      if (b.type === "text" && b.texte) {
        elements.push(
          m.role === "user" ? { kind: "user", texte: b.texte } : { kind: "assistant", texte: b.texte, seq: m.seq, avis: m.avis ?? null },
        );
      } else if (b.type === "tool_use") {
        elements.push({ kind: "outil", callId: b.id, libelle: libelleOutil(b.nom) });
      } else if (b.type === "tool_result") {
        const i = elements.findIndex((e) => e.kind === "outil" && e.callId === b.callId);
        if (i >= 0) elements[i] = { ...(elements[i] as Extract<Element, { kind: "outil" }>), ok: !b.erreur, donnees: b.contenu };
      }
    }
  }
  // Un appel d'écriture sans résultat est celui qui attend la confirmation :
  // la carte le remplace.
  if (t.enAttente) {
    const attente = t.enAttente;
    const sans = elements.filter((e) => !(e.kind === "outil" && e.callId === attente.callId));
    sans.push({ kind: "confirmation", conf: attente });
    return sans;
  }
  return elements;
}

// ─── Suggestions ────────────────────────────────────────────────────────────

interface Suggestion {
  libelle: string;
  /** Envoyé tel quel ; sinon placé dans la zone de saisie, à compléter. */
  message?: string;
  amorce?: string;
}
interface Groupe {
  titre: string;
  permissions: Permission[];
  items: Suggestion[];
}

const GROUPES: Groupe[] = [
  {
    titre: "Ma file",
    permissions: [PERMISSIONS.VIEW_TEST_ORDER_ASSIGNMENTS],
    items: [
      { libelle: "Ma file", message: "Où en est ma file ? Combien de dossiers me reste-t-il ?" },
      { libelle: "Que traiter en premier ?", message: "Par quels dossiers je commence ?" },
    ],
  },
  {
    titre: "Demandes d'examen",
    permissions: [PERMISSIONS.VIEW_TEST_ORDERS],
    items: [
      { libelle: "Urgences non affectées", message: "Quelles demandes urgentes ne sont pas encore affectées ?" },
      { libelle: "Où en est une demande ?", amorce: "Où en est la demande " },
    ],
  },
  {
    titre: "Comptes rendus",
    permissions: [PERMISSIONS.VIEW_REPORTS],
    items: [
      { libelle: "En attente de validation", message: "Quels comptes rendus sont en attente de validation ?" },
      { libelle: "Rendus en retard", message: "Quels dossiers dépassent le délai sans compte rendu ?" },
      { libelle: "Chercher un mot dans les CR", amorce: "Les comptes rendus qui contiennent " },
    ],
  },
  {
    titre: "Caisse et factures",
    permissions: [PERMISSIONS.VIEW_INVOICES, PERMISSIONS.VIEW_CASHBOX, PERMISSIONS.VIEW_CASHBOX_DAILIES],
    items: [
      { libelle: "Recette du jour", message: "Quelle est la recette de la caisse aujourd'hui ?" },
      { libelle: "Factures impayées du mois", message: "Quelles factures du mois sont impayées ?" },
    ],
  },
  {
    titre: "Patients",
    permissions: [PERMISSIONS.VIEW_PATIENTS],
    items: [
      { libelle: "Retrouver un patient", amorce: "Retrouve le patient " },
      { libelle: "Historique d'un patient", amorce: "Est-ce que ce patient est déjà venu chez nous : " },
    ],
  },
];

// ─── Panneau ────────────────────────────────────────────────────────────────

/**
 * Panneau de l'assistant, docké à droite du contenu.
 *
 * <p>Monté dans la coque du tableau de bord et non dans une page : il survit à
 * la navigation, ce qui permet à l'assistant d'ouvrir un compte rendu à gauche
 * sans perdre la conversation. Sous 640 px il prend tout l'écran.</p>
 */
export function AssistantPanel() {
  const { ouvert, fermer, conversationId, setConversationId } = useAssistantStore();
  const { can, canAny } = usePermissions();
  const router = useRouter();
  const { data: etat } = useEtatAssistant();

  const [elements, setElements] = useState<Element[]>([]);
  const [saisie, setSaisie] = useState("");
  const [phase, setPhase] = useState<"recherche" | "ecriture" | null>(null);
  const [enAttente, setEnAttente] = useState<Confirmation | null>(null);
  const [dernierMessage, setDernierMessage] = useState<string | null>(null);
  const fil = useRef<HTMLDivElement>(null);
  const annulation = useRef<AbortController | null>(null);

  const autorise = can(PERMISSIONS.VIEW_ASSISTANT);
  const actif = etat?.actif === true;

  // Recharge la conversation persistée à l'ouverture.
  useEffect(() => {
    if (!ouvert || !actif || !conversationId || elements.length) return;
    let vivant = true;
    assistantApi
      .messages(conversationId)
      .then((t) => {
        if (!vivant) return;
        setElements(depuisTranscription(t));
        setEnAttente(t.enAttente);
      })
      .catch(() => vivant && setConversationId(null)); // autre compte, autre agence, purgée
    return () => {
      vivant = false;
    };
  }, [ouvert, actif, conversationId, elements.length, setConversationId]);

  useEffect(() => {
    fil.current?.scrollTo({ top: fil.current.scrollHeight });
  }, [elements, phase]);

  useEffect(() => () => annulation.current?.abort(), []);

  if (!ouvert || !(autorise || can(PERMISSIONS.MANAGE_ASSISTANT))) return null;

  const occupe = phase !== null;

  const surEvenement = ({ event, data }: EvenementSse) => {
    const d = (data ?? {}) as Record<string, unknown>;
    switch (event) {
      case "token":
        setPhase("ecriture");
        setElements((els) => {
          const dernier = els[els.length - 1];
          if (dernier?.kind === "assistant") {
            return [...els.slice(0, -1), { ...dernier, texte: dernier.texte + String(d.texte ?? "") }];
          }
          return [...els, { kind: "assistant", texte: String(d.texte ?? "") }];
        });
        break;
      case "tool_call":
        setPhase("recherche");
        setElements((els) => [
          ...els,
          {
            kind: "outil",
            callId: String(d.callId),
            libelle: typeof d.libelle === "string" && d.libelle ? d.libelle : libelleOutil(String(d.outil)),
          },
        ]);
        break;
      case "tool_result": {
        setElements((els) =>
          els.map((e) => (e.kind === "outil" && e.callId === d.callId ? { ...e, ok: d.ok === true, donnees: d.donnees } : e)),
        );
        const chemin = cheminAutorise(d.ui);
        if (chemin) router.push(chemin);
        break;
      }
      case "confirmation_required": {
        const conf = d as unknown as Confirmation;
        setEnAttente(conf);
        setElements((els) => [...els, { kind: "confirmation", conf }]);
        break;
      }
      case "done": {
        const seq = typeof d.seq === "number" ? d.seq : undefined;
        if (seq === undefined) break;
        setElements((els) => {
          const i = els.length - 1;
          const dernier = els[i];
          return dernier?.kind === "assistant" ? [...els.slice(0, i), { ...dernier, seq, avis: null }] : els;
        });
        break;
      }
      case "budget_exceeded":
        setElements((els) => [
          ...els,
          {
            kind: "info",
            ton: "warning",
            texte:
              "Le quota mensuel de l'assistant est atteint. Il redeviendra disponible le 1er du mois prochain, ou dès qu'un administrateur relève le quota.",
          },
        ]);
        break;
      case "error":
        setElements((els) => [
          ...els,
          {
            kind: "info",
            ton: "danger",
            texte:
              typeof d.message === "string" && d.message
                ? d.message
                : "La réponse a été interrompue. Ce qui était déjà affiché est conservé.",
            reessayer: true,
          },
        ]);
        break;
    }
  };

  /** Lance un flux et rend la main quoi qu'il arrive. */
  const executer = async (lancer: (signal: AbortSignal) => Promise<void>) => {
    annulation.current?.abort();
    const ctrl = new AbortController();
    annulation.current = ctrl;
    setPhase("recherche");
    try {
      await lancer(ctrl.signal);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      const texte =
        e instanceof ErreurAssistant ? e.message : "La réponse a été interrompue. Ce qui était déjà affiché est conservé.";
      setElements((els) => [...els, { kind: "info", ton: "danger", texte, reessayer: !(e instanceof ErreurAssistant) || e.statut >= 500 }]);
    } finally {
      if (annulation.current === ctrl) setPhase(null);
    }
  };

  const envoyer = async (texte: string) => {
    const propre = texte.trim();
    if (!propre || occupe || enAttente) return;
    setSaisie("");
    setDernierMessage(propre);
    setElements((els) => [...els.filter((e) => !(e.kind === "info" && e.reessayer)), { kind: "user", texte: propre }]);
    await executer(async (signal) => {
      let id = conversationId;
      if (!id) {
        id = (await assistantApi.creerConversation()).id;
        setConversationId(id);
      }
      await assistantApi.envoyer(id, propre, surEvenement, signal);
    });
  };

  const repondre = async (accepter: boolean) => {
    if (!enAttente || !conversationId || occupe) return;
    const conf = enAttente;
    setEnAttente(null);
    setElements((els) =>
      els.map((e) => (e.kind === "confirmation" && e.conf.callId === conf.callId ? { ...e, issue: accepter ? "acceptee" : "refusee" } : e)),
    );
    await executer((signal) => assistantApi.confirmer(conversationId, conf.callId, accepter, surEvenement, signal));
  };

  const nouvelle = () => {
    annulation.current?.abort();
    setConversationId(null);
    setElements([]);
    setEnAttente(null);
    setPhase(null);
    setSaisie("");
  };

  const groupes = GROUPES.filter((g) => canAny(...g.permissions));

  return (
    <aside
      aria-label="Assistant IA"
      className={cn(
        "z-[60] flex flex-col bg-white print:hidden",
        "fixed inset-0 sm:static sm:inset-auto sm:w-[440px] sm:shrink-0 sm:border-l sm:border-gray-200 sm:shadow-[var(--elevation-overlay)]",
      )}
    >
      {/* En-tête */}
      <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-gray-900">Assistant IA</p>
          {actif ? (
            <p className="flex items-center gap-1 text-xs text-gray-500">
              <Lock className="h-3 w-3" aria-hidden="true" />
              Noms et numéros masqués avant envoi
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {actif && autorise ? (
            <Button variant="secondary" size="sm" onClick={nouvelle} disabled={occupe}>
              Nouvelle conversation
            </Button>
          ) : null}
          <button
            type="button"
            onClick={fermer}
            aria-label="Fermer l'assistant"
            className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!actif ? (
        <NonConfigure gestionnaire={can(PERMISSIONS.MANAGE_ASSISTANT)} chargement={!etat} />
      ) : (
        <>
          <div ref={fil} className="flex-1 space-y-3.5 overflow-y-auto px-4 py-4 text-sm leading-relaxed text-gray-800">
            {elements.length === 0 ? (
              <Suggestions
                groupes={groupes}
                choisir={(s) => (s.message ? envoyer(s.message) : setSaisie(s.amorce ?? ""))}
              />
            ) : (
              elements.map((e, i) => (
                <ElementDuFil
                  key={i}
                  element={e}
                  repondre={repondre}
                  occupe={occupe}
                  reessayer={() => dernierMessage && envoyer(dernierMessage)}
                  noter={
                    e.kind === "assistant" && e.seq !== undefined && conversationId && (i === elements.length - 1 || elements[i + 1].kind === "user")
                      ? (avis, commentaire) => {
                          const seq = e.seq as number;
                          setElements((els) => els.map((x) => (x.kind === "assistant" && x.seq === seq ? { ...x, avis: avis || null } : x)));
                          assistantApi.donnerAvis(conversationId, seq, avis, commentaire).catch(() => undefined);
                        }
                      : undefined
                  }
                />
              ))
            )}
            {phase ? (
              <p className="flex items-center gap-2 text-xs text-gray-500" role="status">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                {phase === "recherche" ? "Recherche…" : "Rédaction…"}
              </p>
            ) : null}
          </div>

          <form
            className="flex items-end gap-2 border-t border-gray-200 px-4 py-3"
            onSubmit={(ev) => {
              ev.preventDefault();
              void envoyer(saisie);
            }}
          >
            <label htmlFor="assistant-saisie" className="sr-only">
              Votre message
            </label>
            <textarea
              id="assistant-saisie"
              rows={2}
              value={saisie}
              onChange={(ev) => setSaisie(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" && !ev.shiftKey) {
                  ev.preventDefault();
                  void envoyer(saisie);
                }
              }}
              disabled={!!enAttente}
              placeholder={enAttente ? "Confirmez ou refusez l'action avant de continuer" : "Écrivez votre question…"}
              className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-[3px] focus:ring-blue-500/15 disabled:bg-gray-100"
            />
            <Button type="submit" disabled={!saisie.trim() || occupe || !!enAttente} className="h-11">
              Envoyer
            </Button>
          </form>
        </>
      )}
    </aside>
  );
}

function NonConfigure({ gestionnaire, chargement }: { gestionnaire: boolean; chargement: boolean }) {
  if (chargement) {
    return (
      <p className="flex items-center gap-2 p-4 text-sm text-gray-500" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Chargement…
      </p>
    );
  }
  return (
    <div className="space-y-2.5 p-4 text-sm">
      <p className="font-semibold text-gray-900">L&apos;assistant n&apos;est pas encore configuré</p>
      {gestionnaire ? (
        <>
          <p className="text-gray-500">Choisissez un fournisseur et saisissez sa clé API pour l&apos;activer.</p>
          <Link
            href="/settings/assistant"
            className="inline-flex rounded-[var(--radius-control)] bg-blue-600 px-3.5 py-2.5 text-white hover:bg-blue-700"
          >
            Configurer l&apos;assistant
          </Link>
        </>
      ) : (
        <p className="text-gray-500">Un administrateur doit l&apos;activer.</p>
      )}
    </div>
  );
}

function Suggestions({ groupes, choisir }: { groupes: Groupe[]; choisir: (s: Suggestion) => void }) {
  return (
    <div className="space-y-4.5 py-2">
      <p className="text-center text-[1.0625rem] font-semibold text-gray-900">Que voulez-vous savoir ?</p>
      {groupes.map((g) => (
        <div key={g.titre} className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{g.titre}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {g.items.map((s) => (
              <button
                key={s.libelle}
                type="button"
                onClick={() => choisir(s)}
                className="min-h-11 rounded-[var(--radius-control)] bg-gray-100 px-2.5 py-2 text-left text-[13px] text-gray-900 hover:bg-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
              >
                {s.libelle}
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="text-center text-xs text-gray-500">Seules les suggestions que vos droits permettent sont affichées.</p>
    </div>
  );
}

function ElementDuFil({
  element: e,
  repondre,
  occupe,
  reessayer,
  noter,
}: {
  element: Element;
  repondre: (accepter: boolean) => void;
  occupe: boolean;
  reessayer: () => void;
  noter?: (avis: -1 | 0 | 1, commentaire?: string) => void;
}) {
  switch (e.kind) {
    case "user":
      return (
        <div className="ml-auto max-w-[80%] whitespace-pre-wrap rounded-xl rounded-br-sm bg-blue-600 px-3 py-2.5 text-white">
          {e.texte}
        </div>
      );
    case "assistant":
      return (
        <div className="space-y-1">
          <p className="whitespace-pre-wrap">{e.texte}</p>
          {noter ? <Avis avis={e.avis ?? null} noter={noter} /> : null}
        </div>
      );
    case "outil":
      return <ResultatOutil element={e} />;
    case "confirmation":
      return <CarteConfirmation conf={e.conf} issue={e.issue} repondre={repondre} occupe={occupe} />;
    case "info":
      return (
        <div
          className={cn(
            "space-y-2 rounded-lg border p-2.5",
            e.ton === "warning" ? "border-orange-300 bg-orange-50" : "border-red-300 bg-red-50",
          )}
          role="alert"
        >
          <p>{e.texte}</p>
          {e.reessayer ? (
            <Button variant="secondary" size="sm" onClick={reessayer}>
              Réessayer
            </Button>
          ) : null}
        </div>
      );
  }
}

function ResultatOutil({ element: e }: { element: Extract<Element, { kind: "outil" }> }) {
  const forme = e.ok ? formeDesDonnees(e.donnees) : null;
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs text-gray-500">
        {e.ok === undefined ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : e.ok ? (
          <Check className="h-3.5 w-3.5 text-green-700" aria-hidden="true" />
        ) : (
          <CircleAlert className="h-3.5 w-3.5 text-red-700" aria-hidden="true" />
        )}
        {e.libelle}
      </p>
      {forme?.tuiles.length ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {forme.tuiles.map((t) => (
            <div key={t.libelle} className="rounded-lg bg-gray-100 p-2 text-center">
              <p className="text-lg font-semibold text-gray-900">{t.valeur}</p>
              <p className="text-[11px] text-gray-500">{t.libelle}</p>
            </div>
          ))}
        </div>
      ) : null}
      {forme?.lignes.length ? (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-[13px]">
            <thead className="bg-gray-100 text-left text-[11px] font-semibold uppercase text-gray-500">
              <tr>
                {forme.colonnes.map((c) => (
                  <th key={c} scope="col" className="px-2.5 py-2 font-semibold">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {forme.lignes.map((l, i) => (
                <tr key={i} className="border-t border-gray-100">
                  {l.map((c, j) => (
                    <td key={j} className="px-2.5 py-2">
                      {c.lien ? (
                        <Link href={c.lien} className="text-blue-600 hover:underline">
                          {c.texte}
                        </Link>
                      ) : (
                        c.texte
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function CarteConfirmation({
  conf,
  issue,
  repondre,
  occupe,
}: {
  conf: Confirmation;
  issue?: "acceptee" | "refusee";
  repondre: (accepter: boolean) => void;
  occupe: boolean;
}) {
  if (issue) {
    return (
      <div className="rounded-lg border border-gray-200 p-2.5 text-gray-500">
        À confirmer : {conf.resume} —{" "}
        <strong className="text-gray-900">{issue === "acceptee" ? "Confirmée" : "Refusée"}</strong>
      </div>
    );
  }
  return (
    <div className="space-y-2.5 rounded-xl border border-orange-300 bg-orange-50 p-3">
      <p className="flex items-center gap-1.5 font-semibold text-gray-900">
        <AlertTriangle className="h-4 w-4 text-orange-700" aria-hidden="true" />
        À confirmer : {conf.resume}
      </p>
      {conf.details.length ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg bg-white px-2.5 py-2 text-[13px]">
          {conf.details.map((d) => (
            <div key={d.libelle} className="contents">
              <dt className="text-gray-500">{d.libelle}</dt>
              <dd className="text-right font-semibold">{d.valeur}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <p className="text-xs text-gray-500">Rien n&apos;est enregistré tant que vous n&apos;avez pas confirmé.</p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => repondre(false)} disabled={occupe}>
          Refuser
        </Button>
        <Button onClick={() => repondre(true)} disabled={occupe}>
          Confirmer
        </Button>
      </div>
    </div>
  );
}

/** 👍 / 👎 sous la dernière réponse d'un tour ; un 👎 propose un commentaire facultatif. */
function Avis({ avis, noter }: { avis: 1 | -1 | null; noter: (avis: -1 | 0 | 1, commentaire?: string) => void }) {
  const [commenter, setCommenter] = useState(false);
  const [texte, setTexte] = useState("");
  const bouton = (actif: boolean) =>
    cn(
      "flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40",
      actif ? "bg-gray-200 text-gray-900" : "text-gray-400 hover:bg-gray-100 hover:text-gray-700",
    );
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <button type="button" aria-label="Réponse utile" aria-pressed={avis === 1} className={bouton(avis === 1)}
          onClick={() => { setCommenter(false); noter(avis === 1 ? 0 : 1); }}>
          <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button type="button" aria-label="Réponse pas utile" aria-pressed={avis === -1} className={bouton(avis === -1)}
          onClick={() => { if (avis === -1) { setCommenter(false); noter(0); } else { noter(-1); setCommenter(true); } }}>
          <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      {commenter ? (
        <form
          className="flex gap-2"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (texte.trim()) noter(-1, texte.trim());
            setCommenter(false);
          }}
        >
          <label htmlFor="assistant-avis" className="sr-only">Ce qui n&apos;allait pas</label>
          <input
            id="assistant-avis"
            maxLength={500}
            value={texte}
            onChange={(ev) => setTexte(ev.target.value)}
            placeholder="Ce qui n'allait pas (facultatif)"
            className="flex-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-[13px] focus:border-blue-500 focus:outline-none focus:ring-[3px] focus:ring-blue-500/15"
          />
          <Button type="submit" variant="secondary" size="sm">Envoyer</Button>
        </form>
      ) : null}
    </div>
  );
}
