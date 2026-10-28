"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Building2,
  Mail,
  Smartphone,
  FileText,
  Landmark,
  CreditCard,
  Receipt,
  Upload,
  X,
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  Settings as SettingsIcon,
  Image as ImageIcon,
  PhoneCall,
} from "lucide-react";

import { PageHeader } from "@/components/ui/PageHeader";
import { NativeSelect } from "@/components/ui/NativeSelect";
import { CrudModal } from "@/components/common/CrudModal";
import { ConfirmModal } from "@/components/common/ConfirmModal";
import { PermissionGate } from "@/components/common/PermissionGate";
import {
  TableLengthControl,
  TablePaginationFooter,
  useTablePagination,
} from "@/components/common/TablePagination";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/constants/permissions";
import { DEFAULT_REPORT_FOOTER } from "@/lib/constants/report";
import {
  settingAppsApi,
  settingsStoreApi,
  SETTINGS_STORE_KEYS,
} from "@/lib/api/appSettings";
import { banksApi, type Bank, type BankRequest } from "@/lib/api/banks";
import {
  titleReportsApi,
  type TitleReport,
  type TitleReportRequest,
} from "@/lib/api/reportSettings";
import {
  settingInvoicesApi,
  type SettingInvoice,
} from "@/lib/api/settingInvoices";
import { INPUT_CLASS as inputClass } from "@/lib/ui/inputClass";
import { JOURS_RAPPEL, ecrireJours, lireJours } from "@/lib/rappel";

// ---------------------------------------------------------------------------
// Style partagé
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Définition des champs clé/valeur (fidèle aux onglets Laravel)
// ---------------------------------------------------------------------------

type FieldDef = {
  key: string;
  label: string;
  type?: "text" | "email" | "textarea" | "password" | "number" | "time" | "url" | "select" | "image";
  full?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  center?: boolean;
  /** Texte d'aide affiché sous le champ (jetons disponibles, contraintes…). */
  help?: string;
};

// Onglet Général → sous-onglet « Général »
const GENERAL_FIELDS: FieldDef[] = [
  { key: "app_name", label: "Nom du laboratoire", full: true, placeholder: "Ex : Laboratoire d'anatomopathologie" },
  { key: "devise", label: "Devise", placeholder: "Ex : FCFA" },
  { key: "phone", label: "Téléphone", placeholder: "97000000" },
  { key: "email", label: "Email", type: "email", placeholder: "contact@laboratoire.bj" },
  { key: "web_site", label: "Site web", placeholder: "https://…" },
  { key: "whatsapp_number", label: "Numéro WhatsApp", placeholder: "97000000" },
  { key: "ifu", label: "IFU", placeholder: "Identifiant Fiscal Unique" },
  { key: "rccm", label: "RCCM", placeholder: "Registre du commerce" },
  { key: "adress", label: "Adresse", full: true, placeholder: "Adresse du laboratoire" },
  { key: "footer", label: "Pied de page", type: "textarea", full: true },
];

// Onglet Général → sous-onglet « Logos »
const LOGO_FIELDS: FieldDef[] = [
  { key: "logo", label: "Logo" },
  { key: "favicon", label: "Favicon" },
  { key: "logo_white", label: "Logo (version blanche)" },
];

// Onglet Email (SMTP)
const EMAIL_FIELDS: FieldDef[] = [
  { key: "email_host", label: "Hôte SMTP", placeholder: "smtp.exemple.com" },
  { key: "email_port", label: "Port SMTP", placeholder: "587" },
  { key: "username", label: "Nom d'utilisateur", placeholder: "utilisateur SMTP" },
  { key: "password", label: "Mot de passe", type: "password", placeholder: "••••••••" },
  {
    key: "encryption",
    label: "Chiffrement",
    type: "select",
    options: [
      { value: "", label: "Aucun" },
      { value: "tls", label: "TLS" },
      { value: "ssl", label: "SSL" },
    ],
  },
  { key: "from_adresse", label: "Adresse d'expédition", type: "email", placeholder: "no-reply@laboratoire.bj" },
  { key: "from_name", label: "Nom d'expéditeur", placeholder: "Nom du laboratoire" },
  { key: "email_technician", label: "Email du technicien", type: "email", placeholder: "technicien@laboratoire.bj" },
];

const EMAIL_SERVICES = [
  { value: "remboursement", label: "Remboursement" },
  { value: "boncaisse", label: "Bon de caisse" },
  { value: "ticket", label: "Ticket" },
  { value: "conge", label: "Congé" },
];

// Onglet Communication Mobile (SMS + OurVoice)
const SMS_FIELDS: FieldDef[] = [
  { key: "api_sms", label: "Clé API SMS", placeholder: "clé API du fournisseur SMS" },
  { key: "link_api_sms", label: "Lien API SMS", placeholder: "https://…" },
  { key: "key_ourvoice", label: "Clé OurVoice", type: "password", placeholder: "clé API OurVoice" },
  { key: "link_ourvoice_call", label: "Lien appel OurVoice", placeholder: "https://api.getourvoice.com/v1/calls" },
  { key: "link_ourvoice_sms", label: "Lien SMS OurVoice", placeholder: "https://api.getourvoice.com/v1/messages" },
  {
    key: "sms_resultat_body",
    label: "SMS « résultat disponible »",
    type: "textarea",
    full: true,
    placeholder:
      "Envoyé au patient à la validation de son compte rendu. Laisser vide pour utiliser le message par défaut.",
    help: "Envoyé automatiquement au patient dès la validation de son compte rendu. Laisser vide conserve le message par défaut.",
  },
  {
    key: "sms_facture_body",
    label: "SMS « facture disponible »",
    type: "textarea",
    full: true,
    placeholder:
      "Envoyé au client à la normalisation de sa facture. Laisser vide pour utiliser le message par défaut.",
    help: "Envoyé automatiquement à la normalisation de la facture. Jetons remplacés à l'envoi : {code} = numéro de la facture, {lien} = lien de téléchargement. Au-delà de 160 caractères, l'opérateur facture plusieurs SMS.",
  },
];

// Onglet Compte rendu → sous-onglet « Général » (réplique exacte du formulaire
// Laravel settings/app/setting #general3 : footer, revue, entête (fichier),
// préfixe, afficher la signature).
const REPORT_FIELDS: FieldDef[] = [
  { key: "report_footer", label: "Pied de page du rapport", type: "textarea", full: true, placeholder: "Pied de page du rapport", center: true },
  { key: "report_review_title", label: "Revue du rapport", placeholder: "Revue du rapport" },
  { key: "entete", label: "Entete", type: "image", full: true },
  {
    key: "prefixe_code_demande_examen",
    label: "Prefixe code demande d'examen",
    placeholder: "Prefixe code demande d'examen",
  },
  {
    key: "show_signator_invoice",
    label: "Afficher la signature *",
    type: "select",
    options: [
      { value: "OUI", label: "OUI" },
      { value: "NON", label: "NON" },
    ],
  },
];

// Onglet Rappel des patients — lus par l'API (`ReglagesDeRappel`, `SmsTemplates`).
// Une clé vide ou illisible y retombe sur le défaut : rien ici ne peut bloquer
// les rappels ni faire sonner un téléphone hors de la plage réglementaire.
const RAPPEL_FIELDS: FieldDef[] = [
  {
    key: "rappel_delai_heures",
    label: "Délai après validation (heures)",
    type: "number",
    help: "Temps laissé entre la validation du compte rendu et l'appel automatique du patient.",
  },
  {
    key: "rappel_numero",
    label: "Numéro qui appellera",
    placeholder: "Ex : 0197000000",
    help: "Affiché dans le SMS de facture pour que le patient l'enregistre et décroche à l'appel.",
  },
  { key: "rappel_heure_debut", label: "Appels à partir de", type: "time" },
  { key: "rappel_heure_fin", label: "Appels jusqu'à", type: "time" },
];

// Pas d'audio par défaut côté API : une clé vide, c'est aucun appel pour ce cas.
const AUDIO_PLACEHOLDER = "https://…/message.mp3";
const RAPPEL_AUDIO_FIELDS: FieldDef[] = [
  { key: "fluidchat_audio_fr", label: "Audio du rappel — français", type: "url", placeholder: AUDIO_PLACEHOLDER, help: "Vide : aucun appel pour les patients de langue française." },
  { key: "fluidchat_audio_fon", label: "Audio du rappel — fon", type: "url", placeholder: AUDIO_PLACEHOLDER, help: "Vide : aucun appel pour les patients de langue fon." },
  { key: "fluidchat_audio_en", label: "Audio du rappel — anglais", type: "url", placeholder: AUDIO_PLACEHOLDER, help: "Vide : aucun appel pour les patients de langue anglaise." },
  { key: "fluidchat_audio_bip", label: "Audio si le patient décroche au bip de facture", type: "url", placeholder: AUDIO_PLACEHOLDER, help: "Vide : aucun bip à la facture." },
];

const RAPPEL_TAB = "rappel";

// Valeurs par défaut proposées quand aucune valeur n'est encore enregistrée.
// Celles du rappel sont les défauts de l'API : les afficher dit ce qui s'applique.
const FIELD_DEFAULTS: Record<string, string> = {
  report_footer: DEFAULT_REPORT_FOOTER,
  rappel_delai_heures: "24",
  rappel_heure_debut: "08:00",
  rappel_heure_fin: "18:00",
  rappel_jours: "1,2,3,4,5",
};

// Toutes les clés « texte » gérées par la page (pour le chargement initial)
const ALL_KV_FIELDS = [
  ...GENERAL_FIELDS,
  ...LOGO_FIELDS,
  ...EMAIL_FIELDS,
  ...SMS_FIELDS,
  ...REPORT_FIELDS,
  ...RAPPEL_FIELDS,
  ...RAPPEL_AUDIO_FIELDS,
  { key: "rappel_jours" } as FieldDef,
  { key: "token_payment" } as FieldDef,
  { key: "services" } as FieldDef,
];

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

type TabKey =
  | "general"
  | "email"
  | "sms"
  | "rappel"
  | "report"
  | "banks"
  | "payment"
  | "invoice";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "general", label: "Général", icon: <Building2 className="h-4 w-4" /> },
  { key: "email", label: "Email", icon: <Mail className="h-4 w-4" /> },
  { key: "sms", label: "Communication Mobile", icon: <Smartphone className="h-4 w-4" /> },
  { key: "rappel", label: "Rappel des patients", icon: <PhoneCall className="h-4 w-4" /> },
  { key: "report", label: "Compte rendu", icon: <FileText className="h-4 w-4" /> },
  { key: "banks", label: "Banques", icon: <Landmark className="h-4 w-4" /> },
  { key: "payment", label: "Paramètres de paiements", icon: <CreditCard className="h-4 w-4" /> },
  { key: "invoice", label: "Paramètres de factures", icon: <Receipt className="h-4 w-4" /> },
];

// ===========================================================================
// Page
// ===========================================================================

export default function SettingsPage() {
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const canManage = can(PERMISSIONS.MANAGE_SETTINGS);

  // `?tab=rappel` : lien direct du bandeau « Rappel automatique incomplet ».
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TabKey>(() =>
    searchParams.get("tab") === RAPPEL_TAB ? RAPPEL_TAB : "general",
  );
  const [generalSub, setGeneralSub] = useState<"general" | "logos">("general");
  const [reportSub, setReportSub] = useState<"general" | "titles">("general");

  // État local des valeurs clé/valeur (chargé depuis les deux stores).
  const [values, setValues] = useState<Record<string, string>>({});

  const { isLoading } = useQuery({
    queryKey: ["all-settings"],
    queryFn: async () => {
      const [apps, store] = await Promise.all([
        settingAppsApi.getAll(),
        settingsStoreApi.getAll(),
      ]);
      const merged = { ...apps, ...store };
      const next: Record<string, string> = {};
      for (const f of ALL_KV_FIELDS)
        next[f.key] = merged[f.key] || FIELD_DEFAULTS[f.key] || "";
      setValues(next);
      return merged;
    },
  });

  const setValue = (key: string, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  // Sauvegarde d'un ensemble de clés (route chaque clé vers le bon store).
  const saveMutation = useMutation({
    mutationFn: async (keys: string[]) => {
      await Promise.all(
        keys.map((key) => {
          const value = values[key] ?? "";
          return SETTINGS_STORE_KEYS.has(key)
            ? settingsStoreApi.upsert(key, value)
            : settingAppsApi.upsert(key, value);
        })
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-settings"] });
      // `app-settings` alimente toute la coque de l'appli (logo de la sidebar,
      // favicon, titre de l'onglet, pied de page). Son cache dure 5 min : sans
      // cette invalidation, une valeur enregistrée ici n'apparaissait qu'après
      // un rechargement complet — l'utilisateur croyait la sauvegarde perdue.
      queryClient.invalidateQueries({ queryKey: ["app-settings"] });
      // Un audio renseigné peut lever le bandeau « Rappel automatique incomplet ».
      queryClient.invalidateQueries({ queryKey: ["dashboard", "rappels"] });
      toast.success("Paramètres sauvegardés");
    },
    onError: () => toast.error("Erreur lors de la sauvegarde"),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Paramètres" />
        <div className="flex items-center justify-center py-20">
          <Spinner />
        </div>
      </div>
    );
  }

  return (
    <PermissionGate permission={PERMISSIONS.VIEW_SETTINGS}>
      <div className="space-y-6">
        <PageHeader
          title="Paramètres"
          subtitle="Configuration du laboratoire, des logos, des e-mails et des documents."
        />

        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Menu latéral (comme Laravel) */}
          <nav className="w-full flex-shrink-0 lg:w-72">
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center gap-2.5 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-white px-4 py-3.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
                  <SettingsIcon className="h-4 w-4" />
                </span>
                <span className="text-sm font-semibold text-gray-800">
                  Paramètres système
                </span>
              </div>
              <div className="p-2">
                {TABS.map((t) => {
                  const activeTab = tab === t.key;
                  return (
                    <button
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-all ${
                        activeTab
                          ? "bg-blue-600 text-white shadow-sm shadow-blue-600/20"
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors ${
                          activeTab
                            ? "bg-white/20 text-white"
                            : "bg-gray-100 text-gray-500 group-hover:bg-white group-hover:text-blue-600"
                        }`}
                      >
                        {t.icon}
                      </span>
                      <span className="flex-1 truncate">{t.label}</span>
                      <ChevronRight
                        className={`h-4 w-4 flex-shrink-0 transition-opacity ${
                          activeTab ? "opacity-90" : "opacity-0 group-hover:opacity-40"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          </nav>

          {/* Contenu */}
          <div className="min-w-0 flex-1">
            {/* ---- Général ---- */}
            {tab === "general" && (
              <Card
                title="Général"
                subtitle="Informations générales du laboratoire affichées sur les documents."
              >
                <SubTabs
                  active={generalSub}
                  onChange={(v) => setGeneralSub(v as "general" | "logos")}
                  tabs={[
                    { key: "general", label: "Général" },
                    { key: "logos", label: "Logos" },
                  ]}
                />
                {generalSub === "general" ? (
                  <>
                    <FieldsGrid
                      fields={GENERAL_FIELDS}
                      values={values}
                      onChange={setValue}
                      disabled={!canManage}
                    />
                    <SaveBar
                      show={canManage}
                      pending={saveMutation.isPending}
                      onSave={() =>
                        saveMutation.mutate(GENERAL_FIELDS.map((f) => f.key))
                      }
                    />
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      {LOGO_FIELDS.map((f) => (
                        <ImageField
                          key={f.key}
                          label={f.label}
                          value={values[f.key] ?? ""}
                          onChange={(v) => setValue(f.key, v)}
                          disabled={!canManage}
                        />
                      ))}
                    </div>
                    <SaveBar
                      show={canManage}
                      pending={saveMutation.isPending}
                      onSave={() =>
                        saveMutation.mutate(LOGO_FIELDS.map((f) => f.key))
                      }
                    />
                  </>
                )}
              </Card>
            )}

            {/* ---- Email ---- */}
            {tab === "email" && (
              <Card
                title="Email"
                subtitle="Configuration du serveur d'envoi d'e-mails (SMTP) et des notifications."
              >
                <FieldsGrid
                  fields={EMAIL_FIELDS}
                  values={values}
                  onChange={setValue}
                  disabled={!canManage}
                />
                <div className="mt-4">
                  <p className="mb-2 text-sm font-medium text-gray-700">
                    Services notifiés par email
                  </p>
                  <ServicesCheckboxes
                    value={values["services"] ?? ""}
                    onChange={(v) => setValue("services", v)}
                    disabled={!canManage}
                  />
                </div>
                <SaveBar
                  show={canManage}
                  pending={saveMutation.isPending}
                  onSave={() =>
                    saveMutation.mutate([
                      ...EMAIL_FIELDS.map((f) => f.key),
                      "services",
                    ])
                  }
                />
              </Card>
            )}

            {/* ---- Communication Mobile ---- */}
            {tab === "sms" && (
              <Card
                title="Communication Mobile"
                subtitle="Passerelles SMS et notifications vocales/SMS OurVoice."
              >
                <FieldsGrid
                  fields={SMS_FIELDS}
                  values={values}
                  onChange={setValue}
                  disabled={!canManage}
                />
                <SaveBar
                  show={canManage}
                  pending={saveMutation.isPending}
                  onSave={() => saveMutation.mutate(SMS_FIELDS.map((f) => f.key))}
                />
              </Card>
            )}

            {/* ---- Rappel des patients (appel automatique FluidChat) ---- */}
            {tab === "rappel" && (
              <Card
                title="Rappel des patients"
                subtitle="Appel automatique du patient quand son résultat est disponible : délai, plage d'appel et messages vocaux."
              >
                <p className="mb-4 text-xs text-gray-500">
                  Réglages communs au laboratoire : la dernière valeur enregistrée, depuis
                  n&apos;importe quelle agence, s&apos;applique partout.
                </p>
                <FieldsGrid
                  fields={RAPPEL_FIELDS}
                  values={values}
                  onChange={setValue}
                  disabled={!canManage}
                />
                <div className="mt-4">
                  <p className="mb-2 text-sm font-medium text-gray-700">Jours d&apos;appel</p>
                  <JoursCheckboxes
                    value={values["rappel_jours"] ?? ""}
                    onChange={(v) => setValue("rappel_jours", v)}
                    disabled={!canManage}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Aucun jour coché : du lundi au vendredi.
                  </p>
                </div>
                <div className="mt-6 border-t border-gray-100 pt-5">
                  <p className="text-sm font-medium text-gray-700">Messages vocaux</p>
                  <p className="mb-4 mt-1 text-xs text-gray-500">
                    Liens vers un fichier audio mp3, joués à l&apos;appel du patient selon sa
                    langue, ou s&apos;il décroche pendant le bip de la facture.
                  </p>
                  <FieldsGrid
                    fields={RAPPEL_AUDIO_FIELDS}
                    values={values}
                    onChange={setValue}
                    disabled={!canManage}
                  />
                </div>
                <SaveBar
                  show={canManage}
                  pending={saveMutation.isPending}
                  onSave={() =>
                    saveMutation.mutate([
                      ...RAPPEL_FIELDS.map((f) => f.key),
                      ...RAPPEL_AUDIO_FIELDS.map((f) => f.key),
                      "rappel_jours",
                    ])
                  }
                />
              </Card>
            )}

            {/* ---- Compte rendu (onglets Laravel : Général + Titre) ---- */}
            {tab === "report" && (
              <Card
                title="Compte rendu"
                subtitle="En-tête, pied de page, préfixe des demandes et titres de compte rendu."
              >
                <SubTabs
                  active={reportSub}
                  onChange={(v) => setReportSub(v as "general" | "titles")}
                  tabs={[
                    { key: "general", label: "Général" },
                    { key: "titles", label: "Titre" },
                  ]}
                />
                {reportSub === "general" ? (
                  <>
                    <FieldsGrid
                      fields={REPORT_FIELDS}
                      values={values}
                      onChange={setValue}
                      disabled={!canManage}
                    />
                    <SaveBar
                      show={canManage}
                      pending={saveMutation.isPending}
                      onSave={() =>
                        saveMutation.mutate(REPORT_FIELDS.map((f) => f.key))
                      }
                    />
                  </>
                ) : (
                  <TitleReportsSection canManage={canManage} />
                )}
              </Card>
            )}

            {/* ---- Banques ---- */}
            {tab === "banks" && (
              <Card title="Banques" subtitle="Comptes bancaires du laboratoire.">
                <BanksSection />
              </Card>
            )}

            {/* ---- Paramètres de paiements ---- */}
            {tab === "payment" && (
              <Card
                title="Paramètres de paiements"
                subtitle="Token d'accès à la plateforme de paiement MECeF."
              >
                <FieldsGrid
                  fields={[
                    {
                      key: "token_payment",
                      label: "Token de paiement MECeF",
                      type: "password",
                      full: true,
                      placeholder: "token_xxxxxxxxxxxxx",
                    },
                  ]}
                  values={values}
                  onChange={setValue}
                  disabled={!canManage}
                />
                <SaveBar
                  show={canManage}
                  pending={saveMutation.isPending}
                  onSave={() => saveMutation.mutate(["token_payment"])}
                />
              </Card>
            )}

            {/* ---- Paramètres de factures ---- */}
            {tab === "invoice" && (
              <Card
                title="Paramètres de factures"
                subtitle="Configuration MECeF (IFU, token, activation) appliquée aux factures."
              >
                <InvoiceSettingsSection canManage={canManage} />
              </Card>
            )}
          </div>
        </div>
      </div>
    </PermissionGate>
  );
}

// ===========================================================================
// Sous-composants de présentation
// ===========================================================================

function Spinner({ className = "h-6 w-6 text-blue-600" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 bg-gradient-to-r from-gray-50/80 to-white px-6 py-5">
        <h2 className="text-lg font-semibold tracking-tight text-gray-900">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function SubTabs({
  active,
  onChange,
  tabs,
}: {
  active: string;
  onChange: (v: string) => void;
  tabs: { key: string; label: string }[];
}) {
  return (
    <div className="mb-6 inline-flex gap-1 rounded-xl bg-gray-100 p-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`rounded-lg px-4 py-1.5 text-[.9rem] font-medium transition-all ${
            active === t.key
              ? "bg-white text-blue-700 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function FieldsGrid({
  fields,
  values,
  onChange,
  disabled,
}: {
  fields: FieldDef[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {fields.map((f) =>
        f.type === "image" ? (
          <div key={f.key} className={f.full ? "sm:col-span-2" : ""}>
            <ImageField
              label={f.label}
              value={values[f.key] ?? ""}
              onChange={(v) => onChange(f.key, v)}
              disabled={disabled}
            />
          </div>
        ) : (
        <div
          key={f.key}
          className={`flex flex-col gap-1 ${f.full ? "sm:col-span-2" : ""}`}
        >
          <label className="text-sm font-medium text-gray-700">{f.label}</label>
          {f.type === "textarea" ? (
            <textarea
              rows={4}
              value={values[f.key] ?? ""}
              onChange={(e) => onChange(f.key, e.target.value)}
              placeholder={f.placeholder}
              disabled={disabled}
              className={`${inputClass} resize-none ${f.center ? "text-center" : ""}`}
            />
          ) : f.type === "select" ? (
            <NativeSelect
              value={values[f.key] ?? ""}
              onChange={(e) => onChange(f.key, e.target.value)}
              disabled={disabled}
            >
              {(f.options ?? []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          ) : (
            <input
              type={f.type ?? "text"}
              value={values[f.key] ?? ""}
              onChange={(e) => onChange(f.key, e.target.value)}
              placeholder={f.placeholder}
              disabled={disabled}
              className={inputClass}
            />
          )}
          {f.help ? (
            <p className="text-xs text-gray-500">{f.help}</p>
          ) : null}
        </div>
        )
      )}
    </div>
  );
}

function ServicesCheckboxes({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const selected = useMemo(
    () => new Set(value.split(",").map((s) => s.trim()).filter(Boolean)),
    [value]
  );
  const toggle = (v: string) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(Array.from(next).join(","));
  };
  return (
    <div className="flex flex-wrap gap-2">
      {EMAIL_SERVICES.map((s) => {
        const on = selected.has(s.value);
        return (
          <label
            key={s.value}
            className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[.9rem] transition-colors ${
              on
                ? "border-blue-300 bg-blue-50 text-blue-700"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
          >
            <input
              type="checkbox"
              checked={on}
              onChange={() => toggle(s.value)}
              disabled={disabled}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            {s.label}
          </label>
        );
      })}
    </div>
  );
}

function JoursCheckboxes({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const selected = lireJours(value);
  const toggle = (jour: number) => {
    const next = new Set(selected);
    if (next.has(jour)) next.delete(jour);
    else next.add(jour);
    onChange(ecrireJours(next));
  };
  return (
    <div className="flex flex-wrap gap-2">
      {JOURS_RAPPEL.map((j) => {
        const on = selected.has(j.value);
        return (
          <label
            key={j.value}
            className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[.9rem] transition-colors ${
              on
                ? "border-blue-300 bg-blue-50 text-blue-700"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
          >
            <input
              type="checkbox"
              checked={on}
              onChange={() => toggle(j.value)}
              disabled={disabled}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            {j.label}
          </label>
        );
      })}
    </div>
  );
}

function ImageField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  }
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-4 transition-colors hover:border-gray-300">
      <span className="w-full text-center text-sm font-semibold text-gray-700">
        {label}
      </span>
      {value ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt={label}
            className="h-24 w-24 rounded-xl border border-gray-200 bg-white object-contain p-1.5 shadow-sm"
          />
          {!disabled && (
            <button
              type="button"
              onClick={() => {
                onChange("");
                if (inputRef.current) inputRef.current.value = "";
              }}
              className="absolute -right-2 -top-2 rounded-full border border-white bg-red-500 p-1 text-white shadow-sm transition-colors hover:bg-red-600"
              aria-label="Supprimer"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      ) : (
        <div className="flex h-24 w-24 items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white">
          <ImageIcon className="h-8 w-8 text-gray-300" />
        </div>
      )}
      {!disabled && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            onChange={handleFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
          >
            <Upload className="h-3.5 w-3.5" />
            {value ? "Changer" : "Choisir un fichier"}
          </button>
        </>
      )}
    </div>
  );
}

function SaveBar({
  show,
  pending,
  onSave,
}: {
  show: boolean;
  pending: boolean;
  onSave: () => void;
}) {
  if (!show) return null;
  return (
    <div className="-mx-6 -mb-6 mt-6 flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50/70 px-6 py-4">
      <button
        type="button"
        onClick={onSave}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition-all hover:bg-blue-700 hover:shadow-md hover:shadow-blue-600/25 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending && <Spinner className="h-4 w-4 text-white" />}
        Sauvegarder
      </button>
    </div>
  );
}

// ===========================================================================
// Banques (CRUD)
// ===========================================================================

function BanksSection() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Bank | null>(null);
  const [deleting, setDeleting] = useState<Bank | null>(null);
  const [form, setForm] = useState<BankRequest>({ name: "", accountNumber: "", description: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["banks", "settings"],
    queryFn: () => banksApi.findAll({ size: 100 }).then((r) => r.data),
  });
  const banks = data?.content ?? [];
  const banksPagination = useTablePagination(banks);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["banks", "settings"] });

  const createMut = useMutation({
    mutationFn: (d: BankRequest) => banksApi.create(d),
    onSuccess: () => {
      invalidate();
      toast.success("Banque ajoutée");
      setCreateOpen(false);
    },
    onError: () => toast.error("Erreur lors de l'ajout"),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: string; d: BankRequest }) => banksApi.update(id, d),
    onSuccess: () => {
      invalidate();
      toast.success("Banque modifiée");
      setEditing(null);
    },
    onError: () => toast.error("Erreur lors de la modification"),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => banksApi.delete(id),
    onSuccess: () => {
      invalidate();
      toast.success("Banque supprimée");
      setDeleting(null);
    },
    onError: () => toast.error("Erreur lors de la suppression"),
  });

  const openCreate = () => {
    setForm({ name: "", accountNumber: "", description: "" });
    setCreateOpen(true);
  };
  const openEdit = (b: Bank) => {
    setForm({ name: b.name, accountNumber: b.accountNumber ?? "", description: b.description ?? "" });
    setEditing(b);
  };

  const bankForm = (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">
          Nom <span className="text-red-500">*</span>
        </label>
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">Numéro de compte</label>
        <input
          value={form.accountNumber}
          onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">Description</label>
        <textarea
          rows={2}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className={`${inputClass} resize-none`}
        />
      </div>
    </div>
  );

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <PermissionGate permission={PERMISSIONS.CREATE_BANKS}>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition-all hover:bg-blue-700 hover:shadow-md"
          >
            <Plus className="h-4 w-4" />
            Ajouter une banque
          </button>
        </PermissionGate>
      </div>

      <TableLengthControl pagination={banksPagination} />
      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
            <tr>
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3">Numéro de compte</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                  Chargement…
                </td>
              </tr>
            ) : banks.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                  Aucune banque enregistrée.
                </td>
              </tr>
            ) : (
              banksPagination.pageRows.map((b) => (
                <tr key={b.id} className="transition-colors hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{b.name}</td>
                  <td className="px-4 py-3 text-gray-600">{b.accountNumber || "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{b.description || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <PermissionGate permission={PERMISSIONS.EDIT_BANKS}>
                        <button
                          type="button"
                          onClick={() => openEdit(b)}
                          className="rounded bg-blue-600 p-1.5 text-white transition-colors hover:bg-blue-700"
                          aria-label="Modifier"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </PermissionGate>
                      <PermissionGate permission={PERMISSIONS.DELETE_BANKS}>
                        <button
                          type="button"
                          onClick={() => setDeleting(b)}
                          className="rounded bg-red-600 p-1.5 text-white transition-colors hover:bg-red-700"
                          aria-label="Supprimer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </PermissionGate>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <TablePaginationFooter pagination={banksPagination} />

      <CrudModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Ajouter une banque"
        onSubmit={() => createMut.mutate(form)}
        submitLabel="Ajouter"
        isSubmitting={createMut.isPending}
      >
        {bankForm}
      </CrudModal>

      <CrudModal
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title="Modifier la banque"
        onSubmit={() => editing && updateMut.mutate({ id: editing.id, d: form })}
        submitLabel="Enregistrer"
        isSubmitting={updateMut.isPending}
      >
        {bankForm}
      </CrudModal>

      <ConfirmModal
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMut.mutate(deleting.id)}
        title="Supprimer cette banque"
        message={deleting ? `Voulez-vous vraiment supprimer « ${deleting.name} » ?` : ""}
        confirmLabel="Supprimer"
        confirmVariant="danger"
        isLoading={deleteMut.isPending}
      />
    </div>
  );
}

// ===========================================================================
// Titres de compte rendu (CRUD)
// ===========================================================================

function TitleReportsSection({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<TitleReport | null>(null);
  const [deleting, setDeleting] = useState<TitleReport | null>(null);
  const [form, setForm] = useState<TitleReportRequest>({ name: "", isDefault: false });

  const { data, isLoading } = useQuery({
    queryKey: ["title-reports", "settings"],
    queryFn: () => titleReportsApi.findAll({ size: 100 }).then((r) => r.data),
  });
  const titles = data?.content ?? [];
  const titlesPagination = useTablePagination(titles);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["title-reports", "settings"] });

  const createMut = useMutation({
    mutationFn: (d: TitleReportRequest) => titleReportsApi.create(d),
    onSuccess: () => {
      invalidate();
      toast.success("Titre ajouté");
      setCreateOpen(false);
    },
    onError: () => toast.error("Erreur lors de l'ajout"),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: string; d: TitleReportRequest }) =>
      titleReportsApi.update(id, d),
    onSuccess: () => {
      invalidate();
      toast.success("Titre modifié");
      setEditing(null);
    },
    onError: () => toast.error("Erreur lors de la modification"),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => titleReportsApi.delete(id),
    onSuccess: () => {
      invalidate();
      toast.success("Titre supprimé");
      setDeleting(null);
    },
    onError: () => toast.error("Erreur lors de la suppression"),
  });

  const openCreate = () => {
    setForm({ name: "", isDefault: false });
    setCreateOpen(true);
  };
  const openEdit = (t: TitleReport) => {
    setForm({ name: t.name, isDefault: t.isDefault });
    setEditing(t);
  };

  const titleForm = (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">
          Titre <span className="text-red-500">*</span>
        </label>
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value.toUpperCase() })}
          className={`${inputClass} uppercase`}
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">Par défaut</label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={!!form.isDefault}
            onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          {form.isDefault ? "oui" : "non"}
        </label>
      </div>
    </div>
  );

  return (
    <div>
      {canManage && (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition-all hover:bg-blue-700 hover:shadow-md"
          >
            <Plus className="h-4 w-4" />
            Ajouter un nouveau titre
          </button>
        </div>
      )}

      <TableLengthControl pagination={titlesPagination} />
      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
            <tr>
              <th className="px-4 py-3">Titre</th>
              <th className="px-4 py-3">Par défaut</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-400">
                  Chargement…
                </td>
              </tr>
            ) : titles.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-400">
                  Aucun titre enregistré.
                </td>
              </tr>
            ) : (
              titlesPagination.pageRows.map((t) => (
                <tr key={t.id} className="transition-colors hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{t.name}</td>
                  <td className="px-4 py-3">
                    {t.isDefault ? (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        Oui
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {canManage && (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(t)}
                          className="rounded bg-blue-600 p-1.5 text-white transition-colors hover:bg-blue-700"
                          aria-label="Modifier"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(t)}
                          className="rounded bg-red-600 p-1.5 text-white transition-colors hover:bg-red-700"
                          aria-label="Supprimer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <TablePaginationFooter pagination={titlesPagination} />

      <CrudModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Ajouter un nouveau titre"
        onSubmit={() => createMut.mutate(form)}
        submitLabel="Ajouter un nouveau titre"
        isSubmitting={createMut.isPending}
      >
        <div className="mb-3 text-right text-xs text-gray-500">
          <span className="text-red-500">*</span> champs obligatoires
        </div>
        {titleForm}
      </CrudModal>

      <CrudModal
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title="Modifier le titre"
        onSubmit={() => editing && updateMut.mutate({ id: editing.id, d: form })}
        submitLabel="Mettre à jour"
        isSubmitting={updateMut.isPending}
      >
        {titleForm}
      </CrudModal>

      <ConfirmModal
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMut.mutate(deleting.id)}
        title="Supprimer ce titre"
        message={deleting ? `Voulez-vous vraiment supprimer « ${deleting.name} » ?` : ""}
        confirmLabel="Supprimer"
        confirmVariant="danger"
        isLoading={deleteMut.isPending}
      />
    </div>
  );
}

// ===========================================================================
// Paramètres de factures (MECeF)
// ===========================================================================

function InvoiceSettingsSection({ canManage }: { canManage: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ["setting-invoices"],
    queryFn: () => settingInvoicesApi.findAll({ size: 1 }).then((r) => r.data),
  });
  const setting: SettingInvoice | undefined = data?.content?.[0];

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (!setting) {
    return (
      <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
        Aucune configuration MECeF n&apos;existe encore pour cette agence. Elle doit
        être initialisée côté serveur avant de pouvoir être modifiée ici.
      </div>
    );
  }

  // `key` : une configuration différente remonte le formulaire et réinitialise
  // ses champs, sans effet de synchronisation.
  return (
    <InvoiceSettingsForm
      key={setting.id}
      setting={setting}
      canManage={canManage}
    />
  );
}

function InvoiceSettingsForm({
  setting,
  canManage,
}: {
  setting: SettingInvoice;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [ifu, setIfu] = useState(setting.ifu ?? "");
  const [token, setToken] = useState(setting.token ?? "");
  const [status, setStatus] = useState(!!setting.status);

  const updateMut = useMutation({
    mutationFn: () =>
      settingInvoicesApi.update(setting.id, { ifu, token, status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["setting-invoices"] });
      toast.success("Configuration MECeF mise à jour");
    },
    onError: () => toast.error("Erreur lors de la mise à jour"),
  });

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">
          IFU (Identifiant Fiscal Unique)
        </label>
        <input
          value={ifu}
          onChange={(e) => setIfu(e.target.value)}
          disabled={!canManage}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">Token MECeF</label>
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          disabled={!canManage}
          className={inputClass}
        />
      </div>
      <label
        className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors sm:col-span-2 ${
          status ? "border-blue-300 bg-blue-50" : "border-gray-200 bg-white"
        } ${!canManage ? "opacity-60" : "cursor-pointer hover:bg-gray-50"}`}
      >
        <input
          type="checkbox"
          checked={status}
          onChange={(e) => setStatus(e.target.checked)}
          disabled={!canManage}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="font-medium text-gray-700">
          Activer la synchronisation MECeF
        </span>
      </label>
      <div className="sm:col-span-2">
        <SaveBar
          show={canManage}
          pending={updateMut.isPending}
          onSave={() => updateMut.mutate()}
        />
      </div>
    </div>
  );
}
