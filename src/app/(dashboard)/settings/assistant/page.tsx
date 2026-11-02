"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader } from "@/components/ui/PageHeader";
import { FormField } from "@/components/ui/FormField";
import { FormToggle } from "@/components/ui/FormToggle";
import { NativeSelect } from "@/components/ui/NativeSelect";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/common/ConfirmModal";
import { PermissionGate } from "@/components/common/PermissionGate";
import { PERMISSIONS } from "@/lib/constants/permissions";
import { INPUT_CLASS as inputClass } from "@/lib/ui/inputClass";
import {
  ErreurAssistant,
  assistantApi,
  type Fournisseur,
  type RapportAssistant,
  type ReglagesAssistant,
} from "@/lib/api/assistant";
import { translateApiError } from "@/lib/api/errorMessages";

/** Modèles proposés ; le champ reste libre pour un modèle plus récent. */
const MODELES: Record<Fournisseur, string[]> = {
  ANTHROPIC: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"],
  OPENAI: [],
};

type Formulaire = Omit<ReglagesAssistant, "cleApiConfiguree" | "consommeCeMois">;

function messageDErreur(e: unknown): string {
  const m = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
  if (m) return translateApiError(m) ?? m;
  if (e instanceof ErreurAssistant) return e.message;
  return "Les réglages n'ont pas pu être enregistrés.";
}

export default function ReglagesAssistantPage() {
  return (
    <PermissionGate permission={PERMISSIONS.MANAGE_ASSISTANT} fallback={<p className="text-sm text-gray-500">Vous n&apos;avez pas accès à cette page.</p>}>
      <Reglages />
    </PermissionGate>
  );
}

function Reglages() {
  const { data, isLoading } = useQuery({ queryKey: ["assistant", "reglages"], queryFn: assistantApi.reglages });
  if (isLoading || !data) {
    return <p className="text-sm text-gray-500">Chargement…</p>;
  }
  return <FormulaireReglages data={data} />;
}

function FormulaireReglages({ data }: { data: ReglagesAssistant }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Formulaire>({
    actif: data.actif,
    fournisseur: data.fournisseur,
    modele: data.modele,
    caviardage: data.caviardage,
    quotaMensuelJetons: data.quotaMensuelJetons,
  });
  const [cleApi, setCleApi] = useState("");
  const [remplacerCle, setRemplacerCle] = useState(false);
  const [confirmerMasquage, setConfirmerMasquage] = useState(false);

  const enregistrer = useMutation({
    mutationFn: () =>
      assistantApi.enregistrerReglages({ ...form, ...(cleApi.trim() ? { cleApi: cleApi.trim() } : {}) }),
    onSuccess: () => {
      toast.success("Réglages de l'assistant enregistrés");
      setCleApi("");
      setRemplacerCle(false);
      queryClient.invalidateQueries({ queryKey: ["assistant"] });
    },
    onError: (e) => toast.error(messageDErreur(e)),
  });

  const maj = (patch: Partial<Formulaire>) => setForm({ ...form, ...patch });
  const saisirCle = !data.cleApiConfiguree || remplacerCle;
  const quota = form.quotaMensuelJetons;
  const part = quota ? Math.min(100, Math.round((data.consommeCeMois / quota) * 100)) : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Assistant IA"
        subtitle="Réservé aux comptes qui ont le droit « Configurer l'assistant IA ». Les réglages valent pour tout le laboratoire."
        breadcrumbs={[{ label: "Paramètres", href: "/settings" }, { label: "Assistant IA" }]}
      />

      <form
        className="space-y-5"
        onSubmit={(ev) => {
          ev.preventDefault();
          enregistrer.mutate();
        }}
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="space-y-4 rounded-[var(--radius-surface)] bg-white p-5 shadow-[var(--elevation-flat)]">
            <h2 className="text-base font-semibold text-gray-900">Fournisseur</h2>
            <FormToggle label="Activer l'assistant" checked={form.actif} onChange={(v) => maj({ actif: v })} />
            <FormField label="Fournisseur">
              <NativeSelect
                value={form.fournisseur}
                onChange={(ev) => maj({ fournisseur: ev.target.value as Fournisseur, modele: MODELES[ev.target.value as Fournisseur][0] ?? "" })}
              >
                <option value="ANTHROPIC">Anthropic (Claude)</option>
                <option value="OPENAI">OpenAI</option>
              </NativeSelect>
            </FormField>
            <FormField label="Modèle" required>
              <input
                className={inputClass}
                list="assistant-modeles"
                value={form.modele}
                onChange={(ev) => maj({ modele: ev.target.value })}
                required
              />
              <datalist id="assistant-modeles">
                {MODELES[form.fournisseur].map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </FormField>
            <FormField
              label="Clé API"
              hint={
                saisirCle
                  ? "Chiffrée à l'enregistrement. Elle ne sera plus jamais réaffichée."
                  : "Clé enregistrée, chiffrée. Elle n'est jamais réaffichée."
              }
            >
              {saisirCle ? (
                <input
                  type="password"
                  autoComplete="off"
                  className={inputClass}
                  value={cleApi}
                  onChange={(ev) => setCleApi(ev.target.value)}
                  required={!data.cleApiConfiguree}
                />
              ) : (
                <div className="flex gap-2">
                  <input type="password" value="••••••••••••" disabled className={inputClass} aria-label="Clé API enregistrée" />
                  <Button variant="secondary" onClick={() => setRemplacerCle(true)}>
                    Remplacer
                  </Button>
                </div>
              )}
            </FormField>
          </section>

          <section className="space-y-4 rounded-[var(--radius-surface)] bg-white p-5 shadow-[var(--elevation-flat)]">
            <h2 className="text-base font-semibold text-gray-900">Protection des données</h2>
            <FormToggle
              label="Masquer les noms, téléphones et identifiants avant envoi"
              checked={form.caviardage}
              onChange={(v) => (v ? maj({ caviardage: true }) : setConfirmerMasquage(true))}
              hint="Activé : le fournisseur reçoit des jetons à la place des noms, téléphones et identifiants ; le texte libre des comptes rendus n'est jamais envoyé."
            />
            {!form.caviardage ? (
              <p className="rounded-lg border border-orange-300 bg-orange-50 p-2.5 text-[13px]">
                Masquage désactivé : les données patient partent en clair vers le fournisseur.
              </p>
            ) : null}

            <h2 className="pt-2 text-base font-semibold text-gray-900">Budget</h2>
            <FormField label="Quota mensuel (jetons)" hint="Laisser vide pour ne pas plafonner.">
              <input
                type="number"
                min={0}
                step={1000}
                className={inputClass}
                value={quota ?? ""}
                onChange={(ev) => maj({ quotaMensuelJetons: ev.target.value === "" ? null : Number(ev.target.value) })}
              />
            </FormField>
            <div className="space-y-1">
              <p className="text-[13px] text-gray-500">
                Consommé ce mois-ci : {data.consommeCeMois.toLocaleString("fr-FR")} jetons
                {quota ? ` sur ${quota.toLocaleString("fr-FR")}` : ""}
              </p>
              {part !== null ? (
                <div className="h-2 rounded bg-gray-200" role="progressbar" aria-valuenow={part} aria-valuemin={0} aria-valuemax={100} aria-label="Part du quota consommée">
                  <div className="h-2 rounded bg-blue-600" style={{ width: `${part}%` }} />
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <div className="flex justify-end">
          <Button type="submit" loading={enregistrer.isPending}>
            Enregistrer
          </Button>
        </div>
      </form>

      <RapportAmelioration />

      <ConfirmModal
        isOpen={confirmerMasquage}
        onClose={() => setConfirmerMasquage(false)}
        onConfirm={() => {
          maj({ caviardage: false });
          setConfirmerMasquage(false);
        }}
        title="Désactiver le masquage ?"
        message="Si vous le désactivez, les données patient partent en clair vers le fournisseur. Le changement prend effet à l'enregistrement."
        confirmLabel="Désactiver le masquage"
      />
    </div>
  );
}

const RAISONS: Record<string, string> = {
  outil_manquant: "outil manquant",
  donnee_absente: "donnée absente",
  droit_manquant: "droit manquant",
  autre: "autre",
};

const dateFr = (iso: string) => new Date(iso).toLocaleDateString("fr-FR");

/**
 * Le rapport d'amélioration : généré chaque lundi pour l'agence, ou à la demande.
 * Il propose ; rien ne change dans l'assistant sans décision humaine.
 */
function RapportAmelioration() {
  const queryClient = useQueryClient();
  const { data: rapports, isLoading } = useQuery({ queryKey: ["assistant", "rapports"], queryFn: assistantApi.rapports });
  const [choisi, setChoisi] = useState<string | null>(null);
  const generer = useMutation({
    mutationFn: assistantApi.genererRapport,
    onSuccess: (r) => {
      setChoisi(r.id);
      queryClient.invalidateQueries({ queryKey: ["assistant", "rapports"] });
    },
    onError: (e) => toast.error(messageDErreur(e)),
  });
  const rapport: RapportAssistant | undefined = rapports?.find((r) => r.id === choisi) ?? rapports?.[0];

  return (
    <section className="space-y-4 rounded-[var(--radius-surface)] bg-white p-5 shadow-[var(--elevation-flat)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Rapport d&apos;amélioration</h2>
          <p className="text-[13px] text-gray-500">
            Chaque lundi, pour votre agence : ce que l&apos;assistant n&apos;a pas su faire et ce qu&apos;il faudrait faire évoluer.
            Les données sont masquées ; rien ne change sans votre décision.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {rapports && rapports.length > 1 ? (
            <NativeSelect aria-label="Rapport affiché" value={rapport?.id} onChange={(ev) => setChoisi(ev.target.value)}>
              {rapports.map((r) => (
                <option key={r.id} value={r.id}>
                  Semaine du {dateFr(r.debut)}
                </option>
              ))}
            </NativeSelect>
          ) : null}
          <Button variant="secondary" onClick={() => generer.mutate()} loading={generer.isPending}>
            Générer maintenant
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : !rapport ? (
        <p className="text-sm text-gray-500">Aucun rapport pour l&apos;instant. Le premier sera généré lundi, ou maintenant avec le bouton.</p>
      ) : (
        <div className="space-y-4 text-sm">
          <p className="text-[13px] text-gray-500">
            Du {dateFr(rapport.debut)} au {dateFr(rapport.fin)} — {rapport.statistiques.questions} questions,{" "}
            {rapport.statistiques.utilisateurs} utilisateurs, {rapport.statistiques.avisPositifs} 👍 /{" "}
            {rapport.statistiques.avisNegatifs} 👎, {rapport.statistiques.jetons.toLocaleString("fr-FR")} jetons
          </p>
          {rapport.synthese ? (
            <div className="whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-gray-800">{rapport.synthese}</div>
          ) : null}
          {rapport.statistiques.besoins.length ? (
            <div className="space-y-1">
              <h3 className="text-[13px] font-semibold text-gray-900">Besoins signalés ({rapport.statistiques.besoins.length})</h3>
              <ul className="list-disc space-y-0.5 pl-5 text-[13px]">
                {rapport.statistiques.besoins.map((b, i) => (
                  <li key={i}>
                    {b.demande} <span className="text-gray-500">— {RAISONS[b.raison] ?? b.raison}, le {dateFr(b.le)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {rapport.statistiques.outils.length ? (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-[13px]">
                <thead className="bg-gray-100 text-left text-[11px] font-semibold uppercase text-gray-500">
                  <tr>
                    <th scope="col" className="px-2.5 py-2">Outil</th>
                    <th scope="col" className="px-2.5 py-2 text-right">Réussis</th>
                    <th scope="col" className="px-2.5 py-2 text-right">Échecs</th>
                    <th scope="col" className="px-2.5 py-2 text-right">Refusés</th>
                  </tr>
                </thead>
                <tbody>
                  {rapport.statistiques.outils.map((o) => (
                    <tr key={o.outil} className="border-t border-gray-100">
                      <td className="px-2.5 py-2">{o.libelle}</td>
                      <td className="px-2.5 py-2 text-right">{o.succes ?? 0}</td>
                      <td className="px-2.5 py-2 text-right">{o.echec ?? 0}</td>
                      <td className="px-2.5 py-2 text-right">{o.refuse ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {rapport.statistiques.outilsJamaisUtilises.length ? (
            <p className="text-[13px] text-gray-500">
              Jamais utilisés cette semaine : {rapport.statistiques.outilsJamaisUtilises.join(", ")}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

