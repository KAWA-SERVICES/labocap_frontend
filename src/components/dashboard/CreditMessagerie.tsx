"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { toast } from "sonner";
import { Download, History, Loader2, MessageSquareText, Wallet } from "lucide-react";

import { CrudModal } from "@/components/common/CrudModal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { NativeSelect } from "@/components/ui/NativeSelect";
import { SidePanel } from "@/components/ui/SidePanel";
import { Skeleton } from "@/components/ui/Skeleton";
import { TextInput } from "@/components/ui/TextInput";
import { dashboardApi, type CreditMessagerie as Credit, type NouvelleRecharge } from "@/lib/api/dashboard";
import { getApiErrorMessage } from "@/lib/api/errorMessages";
import type { ApiError } from "@/types/api";
import {
  RACCOURCIS_MONTANT,
  RESEAUX,
  erreurMontant,
  erreurTelephone,
  formatDuree,
  libelleOffre,
  moisProposes,
  montantForfait,
  derniersMois,
  detailMouvement,
  libelleAutonomie,
  libelleMois,
  libelleMouvement,
  mouvementsCsv,
  totauxMois,
} from "@/lib/creditMessagerie";
import { cn, formatCFA, formatDate, formatDateTime } from "@/lib/utils";

const CLE = ["dashboard", "credit-messagerie"] as const;

/**
 * Tuile « Crédit SMS et appels » : solde prépayé tenu par FluidChat,
 * consommation du mois et recharge Mobile Money. Le paiement se valide sur le
 * téléphone du payeur ; la recharge est ensuite sondée toutes les 5 s (rythme
 * conseillé par FluidChat) jusqu'à son issue, y compris après un rechargement
 * de la page (`rechargeEnCours`).
 */
export function CreditMessagerie() {
  const queryClient = useQueryClient();
  const [ouverte, setOuverte] = useState(false);
  const [historique, setHistorique] = useState(false);
  const [suivie, setSuivie] = useState<number | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: CLE,
    queryFn: () => dashboardApi.getCreditMessagerie().then((r) => r.data),
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const enCours = suivie ?? data?.rechargeEnCours?.id ?? null;

  const { data: recharge } = useQuery({
    queryKey: [...CLE, "recharge", enCours],
    // L'issue est traitée ici, à la réception, plutôt que dans un effet : une
    // seule notification par recharge, sans rendu en cascade.
    queryFn: async () => {
      const r = (await dashboardApi.getRecharge(enCours as number)).data;
      if (r.statut !== "pending") {
        if (r.statut === "paid") toast.success("Recharge confirmée : votre crédit est à jour.");
        else toast.error(`Recharge échouée${r.motifEchec ? ` : ${r.motifEchec}` : "."}`);
        setSuivie(null);
        queryClient.invalidateQueries({ queryKey: CLE });
      }
      return r;
    },
    enabled: enCours !== null,
    refetchInterval: (q) => (q.state.data?.statut === "pending" || !q.state.data ? 5000 : false),
  });

  if (isError) return null;

  const enAttente = enCours !== null && recharge?.statut !== "paid" && recharge?.statut !== "failed";

  return (
    <div className="hyper-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-gray-800">Crédit SMS et appels</h2>
        {data && data.plan !== "none" && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon={<History className="h-3.5 w-3.5" />}
              onClick={() => setHistorique(true)}
            >
              Voir l&apos;historique
            </Button>
            <Button
              size="sm"
              icon={<Wallet className="h-3.5 w-3.5" />}
              onClick={() => setOuverte(true)}
              disabled={enAttente}
            >
              Recharger
            </Button>
          </div>
        )}
      </div>

      {isLoading || !data ? (
        <div className="p-5">
          <Skeleton className="h-7 w-1/3" />
        </div>
      ) : data.plan === "none" ? (
        <p className="px-5 py-4 text-[.9rem] text-gray-500">
          Crédit non activé — contactez KAWA SERVICES.
        </p>
      ) : (
        <Contenu credit={data} enAttente={enAttente} />
      )}

      {data && data.plan !== "none" && ouverte && (
        <ModaleRecharge
          credit={data}
          onClose={() => setOuverte(false)}
          onLancee={(id) => {
            setOuverte(false);
            setSuivie(id);
          }}
        />
      )}
      <HistoriqueCredit open={historique} onClose={() => setHistorique(false)} />
    </div>
  );
}

function Contenu({ credit, enAttente }: { credit: Credit; enAttente: boolean }) {
  const { mois, prix } = credit;
  const illimite = credit.plan === "unlimited";
  return (
    <div className="grid grid-cols-1 gap-px bg-gray-100 md:grid-cols-3">
      <div className="bg-white p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[.8125rem] font-medium text-gray-500">{libelleOffre(credit.plan)}</p>
          {credit.bas && <Badge variant="warning">{credit.epuise ? "Épuisé" : "Solde bas"}</Badge>}
        </div>
        <p
          className={cn(
            "mt-2 text-[1.75rem] font-semibold leading-none tracking-[-0.02em]",
            credit.bas ? "text-red-600" : "text-gray-900",
          )}
        >
          {illimite
            ? credit.illimiteJusquAu
              ? `Illimité jusqu'au ${formatDate(credit.illimiteJusquAu)}`
              : "Forfait non payé"
            : `${formatCFA(credit.soldeFcfa ?? 0)} F`}
        </p>
        {!illimite && credit.autonomieJours != null && (
          <p className={cn("mt-2 text-xs", credit.bas ? "text-red-600" : "text-gray-500")}>
            {libelleAutonomie(credit.autonomieJours)}
          </p>
        )}
        {enAttente && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-blue-600" role="status">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Recharge en cours — validez le paiement sur le téléphone
          </p>
        )}
      </div>
      <div className="bg-white p-5">
        <p className="text-[.8125rem] font-medium text-gray-500">Ce mois-ci</p>
        <p className="mt-2 text-[.9rem] text-gray-700">
          <MessageSquareText className="mr-1 inline h-4 w-4 text-gray-400" aria-hidden />
          SMS : {mois.sms.toLocaleString("fr-FR")} envois · {mois.smsParts.toLocaleString("fr-FR")} unités
          {!illimite && <> · {formatCFA(mois.smsFcfa)} F</>}
        </p>
        <p className="mt-1 text-[.9rem] text-gray-700">
          Appels : {formatDuree(mois.appelSecondes)}
          {!illimite && <> · {formatCFA(mois.appelFcfa)} F</>}
        </p>
      </div>
      <div className="bg-white p-5">
        <p className="text-[.8125rem] font-medium text-gray-500">Tarifs</p>
        {illimite ? (
          <p className="mt-2 text-[.9rem] text-gray-700">
            {formatCFA(prix.forfaitMoisFcfa)} F par mois, SMS et appels illimités
          </p>
        ) : (
          <>
            <p className="mt-2 text-[.9rem] text-gray-700">{formatCFA(prix.smsPartFcfa)} F par unité SMS (160 caractères)</p>
            <p className="mt-1 text-[.9rem] text-gray-700">{formatCFA(prix.appelSecondeFcfa)} F par seconde d&apos;appel</p>
          </>
        )}
      </div>
    </div>
  );
}

function ModaleRecharge({
  credit,
  onClose,
  onLancee,
}: {
  credit: Credit;
  onClose: () => void;
  onLancee: (id: number) => void;
}) {
  const forfait = credit.plan === "unlimited";
  const durees = moisProposes(credit.illimiteJusquAu);
  const [montant, setMontant] = useState("5000");
  const [mois, setMois] = useState(durees[0]);
  const [reseau, setReseau] = useState<NouvelleRecharge["reseau"]>("MTN");
  const [telephone, setTelephone] = useState("");
  const [tente, setTente] = useState(false);

  const montantNombre = Number(montant);
  const errMontant = forfait ? null : erreurMontant(montantNombre);
  const errTel = erreurTelephone(telephone);
  const total = forfait ? montantForfait(mois, credit.prix.forfaitMoisFcfa) : montantNombre;

  const lancer = useMutation({
    mutationFn: () =>
      dashboardApi
        .rechargerCredit({
          ...(forfait ? { mois } : { montantFcfa: montantNombre }),
          reseau,
          telephone,
        })
        .then((r) => r.data),
    onSuccess: (r) => {
      toast.info("Validez le paiement sur votre téléphone.");
      onLancee(r.id);
    },
    onError: (err: AxiosError<ApiError>) =>
      toast.error(getApiErrorMessage(err, "La recharge n'a pas pu être lancée.")),
  });

  return (
    <CrudModal
      isOpen
      onClose={onClose}
      title="Recharger le crédit SMS et appels"
      submitLabel={`Payer ${formatCFA(total || 0)} F`}
      isSubmitting={lancer.isPending}
      onSubmit={() => {
        setTente(true);
        if (errMontant || errTel) return;
        return lancer.mutateAsync().catch(() => undefined);
      }}
    >
      <div className="space-y-5">
        {forfait ? (
          <FormField label="Durée du forfait" required hint={credit.illimiteJusquAu ? undefined : "Engagement de 3 mois minimum au premier achat."}>
            <NativeSelect
              value={mois}
              onChange={(e) => setMois(Number(e.target.value))}
              aria-label="Durée du forfait"
            >
              {durees.map((m) => (
                <option key={m} value={m}>
                  {m} mois — {formatCFA(montantForfait(m, credit.prix.forfaitMoisFcfa))} F
                </option>
              ))}
            </NativeSelect>
          </FormField>
        ) : (
          <FormField label="Montant (F CFA)" required error={tente ? errMontant ?? undefined : undefined}>
            <TextInput
              inputMode="numeric"
              value={montant}
              onChange={(e) => setMontant(e.target.value.replace(/\D/g, ""))}
              error={tente && !!errMontant}
              aria-label="Montant en F CFA"
            />
            <div className="flex flex-wrap gap-2 pt-1">
              {RACCOURCIS_MONTANT.map((v) => (
                <Button key={v} type="button" size="sm" variant="secondary" onClick={() => setMontant(String(v))}>
                  {formatCFA(v)} F
                </Button>
              ))}
            </div>
          </FormField>
        )}
        <FormField label="Réseau" required>
          <NativeSelect
            value={reseau}
            onChange={(e) => setReseau(e.target.value as NouvelleRecharge["reseau"])}
            aria-label="Réseau Mobile Money"
          >
            {RESEAUX.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField
          label="Numéro Mobile Money"
          required
          error={tente ? errTel ?? undefined : undefined}
          hint="Le paiement est à valider sur ce téléphone."
        >
          <TextInput
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="01 97 00 00 01"
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            error={tente && !!errTel}
            aria-label="Numéro Mobile Money"
          />
        </FormField>
      </div>
    </CrudModal>
  );
}

/**
 * Registre du crédit, mois par mois : chaque recharge, SMS, appel ou
 * ajustement, avec le solde après lui — de quoi comprendre la facturation.
 */
function HistoriqueCredit({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mois = derniersMois(new Date());
  const [choisi, setChoisi] = useState(mois[0]);
  const { data: lignes, isLoading, isError } = useQuery({
    queryKey: ["dashboard", "credit-messagerie", "mouvements", choisi],
    queryFn: () => dashboardApi.getMouvementsCredit(choisi).then((r) => r.data),
    enabled: open,
  });
  const totaux = totauxMois(lignes ?? []);

  const exporter = () => {
    const url = URL.createObjectURL(new Blob([mouvementsCsv(lignes ?? [])], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `credit-sms-appels-${choisi}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title="Historique du crédit"
      subtitle="SMS, appels, recharges et ajustements"
      footer={
        <Button
          variant="secondary"
          icon={<Download className="h-3.5 w-3.5" />}
          onClick={exporter}
          disabled={!lignes || lignes.length === 0}
        >
          Exporter en CSV
        </Button>
      }
    >
      <div className="space-y-4">
        <FormField label="Mois">
          <NativeSelect value={choisi} onChange={(e) => setChoisi(e.target.value)} aria-label="Mois">
            {mois.map((m) => (
              <option key={m} value={m}>
                {libelleMois(m)}
              </option>
            ))}
          </NativeSelect>
        </FormField>

        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : isError ? (
          <p role="alert" className="text-sm text-red-600">
            Historique indisponible pour le moment.
          </p>
        ) : !lignes || lignes.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun mouvement ce mois-ci.</p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-3 rounded-[var(--radius-control)] bg-gray-50 p-3 text-sm">
              <div>
                <dt className="text-gray-500">Consommé et retiré</dt>
                <dd className="font-semibold text-gray-900">{formatCFA(totaux.debits)} F</dd>
              </div>
              <div>
                <dt className="text-gray-500">Rechargé et crédité</dt>
                <dd className="font-semibold text-gray-900">{formatCFA(totaux.credits)} F</dd>
              </div>
            </dl>
            <ul className="divide-y divide-gray-100">
              {lignes.map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800">{libelleMouvement(l.type)}</p>
                    <p className="text-xs text-gray-500">
                      {formatDateTime(l.le)}
                      {detailMouvement(l) && <> · {detailMouvement(l)}</>}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={cn("font-semibold tabular-nums", l.montantFcfa < 0 ? "text-red-600" : "text-emerald-700")}>
                      {l.montantFcfa > 0 ? "+" : l.montantFcfa < 0 ? "−" : ""}
                      {formatCFA(Math.abs(l.montantFcfa))} F
                    </p>
                    <p className="text-xs tabular-nums text-gray-500">Solde {formatCFA(l.soldeApres)} F</p>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </SidePanel>
  );
}
