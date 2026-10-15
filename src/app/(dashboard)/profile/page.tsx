"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Save, UserCircle } from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";
import { useAuthStore } from "@/stores/auth.store";
import { authApi } from "@/lib/api/auth";
import { AuthentificationParApplication } from "./AuthentificationParApplication";
import { meApi } from "@/lib/api/me";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { motDePasseSchema } from "@/lib/mot-de-passe";
import { ForceMotDePasse } from "@/components/ui/ForceMotDePasse";

// ── Schemas Zod ──────────────────────────────────────────────────────────────

const profileSchema = z.object({
  firstname: z.string().min(1, "Le prénom est requis"),
  lastname: z.string().min(1, "Le nom est requis"),
});

// Calque `profile/index.blade.php` : Ancien / Nouveau / Confirmer. Le minimum
// de 12 caractères suit la politique de mot de passe de l'API.
const passwordSchema = z
  .object({
    oldpassword: z.string().min(1, "L'ancien mot de passe est requis"),
    newpassword: motDePasseSchema,
    password_confirmation: z.string().min(1, "La confirmation est requise"),
  })
  .refine((v) => v.newpassword === v.password_confirmation, {
    message: "Les mots de passe ne correspondent pas",
    path: ["password_confirmation"],
  });

type ProfileFormValues = z.infer<typeof profileSchema>;
type PasswordFormValues = z.infer<typeof passwordSchema>;

function apiMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: string } } })?.response
    ?.data?.message;
  return message ?? fallback;
}

export default function ProfilePage() {
  const { user, setUser } = useAuthStore();

  /**
   * Relit la fiche après un changement d'authentification.
   *
   * L'état de l'application vit côté serveur ; sans cette relecture, activer
   * puis regarder l'écran montrerait encore « Activer », et l'on croirait que
   * rien ne s'est passé.
   */
  const rafraichirProfil = async () => {
    try {
      const reponse = await authApi.me();
      setUser(reponse.data);
    } catch {
      // Sans importance : le prochain chargement de page rétablira l'affichage.
    }
  };

  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(
    user?.signature ?? null
  );

  // ── Formulaire INFORMATIONS DE BASE ─────────────────────────────────────────
  const {
    register: registerProfile,
    handleSubmit: handleSubmitProfile,
    formState: { errors: profileErrors, isSubmitting: isProfileSubmitting },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { firstname: user?.firstname ?? "", lastname: user?.lastname ?? "" },
  });

  const onSubmitProfile = async (values: ProfileFormValues) => {
    if (!user) return;
    try {
      const body: Parameters<typeof meApi.updateProfile>[0] = {
        firstname: values.firstname,
        lastname: values.lastname,
      };
      if (signatureFile) {
        body.signature = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(signatureFile);
        });
      }
      const response = await meApi.updateProfile(body);
      setUser(response.data);
      toast.success("Profil mis à jour avec succès");
    } catch (err) {
      toast.error(apiMessage(err, "Erreur lors de la mise à jour du profil"));
    }
  };

  // ── Formulaire MOT DE PASSE ─────────────────────────────────────────────────
  const {
    register: registerPassword,
    handleSubmit: handleSubmitPassword,
    reset: resetPassword,
    control: controlPassword,
    formState: { errors: passwordErrors, isSubmitting: isPasswordSubmitting },
  } = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { oldpassword: "", newpassword: "", password_confirmation: "" },
  });
  const newpassword = useWatch({ control: controlPassword, name: "newpassword" });

  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const onSubmitPassword = async (values: PasswordFormValues) => {
    try {
      await meApi.updatePassword({
        currentPassword: values.oldpassword,
        newPassword: values.newpassword,
      });
      resetPassword({ oldpassword: "", newpassword: "", password_confirmation: "" });
      toast.success("Mot de passe mis à jour avec succès");
    } catch (err) {
      toast.error(apiMessage(err, "Erreur lors du changement de mot de passe"));
    }
  };

  const handleSignatureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSignatureFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setSignaturePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  if (!user) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500">
        Chargement du profil…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Mon compte" />

      {/* Grille 8/4 comme Laravel (col-xl-8 / col-xl-4), gouttière 1.5rem */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* ============ INFORMATIONS DE BASE (gauche, large) ============ */}
        <div className="lg:col-span-8">
          <div className="hyper-card">
            <div className="hyper-card-body">
              <form onSubmit={handleSubmitProfile(onSubmitProfile)} noValidate>
                <h5 className="hyper-card-heading">
                  <UserCircle className="h-[1.1em] w-[1.1em]" />
                  Informations de base
                </h5>

                {/* Nom */}
                <div className="hyper-field">
                  <label className="hyper-form-label">
                    Nom<span className="text-red-600">*</span>
                  </label>
                  <input type="text" {...registerProfile("lastname")} className="hyper-form-control" />
                  {profileErrors.lastname && (
                    <p className="mt-1 text-xs text-red-600">{profileErrors.lastname.message}</p>
                  )}
                </div>

                {/* Prénom */}
                <div className="hyper-field">
                  <label className="hyper-form-label">
                    Prénom<span className="text-red-600">*</span>
                  </label>
                  <input type="text" {...registerProfile("firstname")} className="hyper-form-control" />
                  {profileErrors.firstname && (
                    <p className="mt-1 text-xs text-red-600">{profileErrors.firstname.message}</p>
                  )}
                </div>

                {/* Signature — boîte Dropify (rayures animées au survol) */}
                <div className="hyper-field">
                  <label className="hyper-form-label">Signature</label>
                  <label htmlFor="signature-upload" className="hyper-dropify">
                    {signaturePreview ? (
                      <Image
                        src={signaturePreview}
                        alt="Signature"
                        width={320}
                        height={120}
                        className="max-h-[150px] object-contain"
                        unoptimized
                      />
                    ) : (
                      <span className="text-[14px] leading-[22px] text-gray-600">
                        Glisser-déposer un fichier ici ou cliquer
                      </span>
                    )}
                    <input
                      id="signature-upload"
                      type="file"
                      accept="image/png,image/jpeg,image/jpg"
                      onChange={handleSignatureChange}
                      className="sr-only"
                    />
                  </label>
                </div>

                {/* E-mail (lecture seule) */}
                <div className="hyper-field">
                  <label className="hyper-form-label">E-mail</label>
                  <input type="email" value={user.email} readOnly className="hyper-form-control" />
                </div>

                <div className="text-right">
                  <Button
                    type="submit"
                    loading={isProfileSubmitting}
                    icon={<Save className="h-[1em] w-[1em]" />}
                    className="hyper-btn hyper-btn-success mt-2"
                  >
                    Mettre à jour
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* ============ MOT DE PASSE (droite, étroite) ============ */}
        <div className="lg:col-span-4">
          <div className="hyper-card">
            <div className="hyper-card-body">
              <form onSubmit={handleSubmitPassword(onSubmitPassword)} noValidate>
                <h5 className="hyper-card-heading">
                  <UserCircle className="h-[1.1em] w-[1.1em]" />
                  Mot de passe
                </h5>

                <PasswordField
                  label="Ancien Mot de passe"
                  show={showOld}
                  onToggle={() => setShowOld((v) => !v)}
                  autoComplete="current-password"
                  register={registerPassword("oldpassword")}
                  error={passwordErrors.oldpassword?.message}
                />
                <PasswordField
                  label="Nouveau Mot de passe"
                  show={showNew}
                  onToggle={() => setShowNew((v) => !v)}
                  autoComplete="new-password"
                  register={registerPassword("newpassword")}
                  error={passwordErrors.newpassword?.message}
                />
                <ForceMotDePasse valeur={newpassword} />
                <PasswordField
                  label="Confirmez le mot de passe"
                  show={showConfirm}
                  onToggle={() => setShowConfirm((v) => !v)}
                  autoComplete="new-password"
                  register={registerPassword("password_confirmation")}
                  error={passwordErrors.password_confirmation?.message}
                />

                <div className="text-right">
                  <Button
                    type="submit"
                    loading={isPasswordSubmitting}
                    icon={<Save className="h-[1em] w-[1em]" />}
                    className="hyper-btn hyper-btn-success mt-2"
                  >
                    Mettre à jour
                  </Button>
                </div>
              </form>
            </div>

            {/*
              Sous le mot de passe, dans la même colonne : les deux relèvent de
              la même question — comment on prouve qu'on est soi.
            */}
            <div className="mt-4">
              <AuthentificationParApplication
                actif={user.twoFactorEnabled ?? false}
                onChangement={rafraichirProfil}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Champ mot de passe avec œil (input-group-merge Hyper) ──────────────────────

function PasswordField({
  label,
  show,
  onToggle,
  autoComplete,
  register,
  error,
}: {
  label: string;
  show: boolean;
  onToggle: () => void;
  autoComplete: string;
  register: ReturnType<ReturnType<typeof useForm<PasswordFormValues>>["register"]>;
  error?: string;
}) {
  return (
    <div className="hyper-field">
      <label className="hyper-form-label">{label}</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          {...register}
          className="hyper-form-control pr-10"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={onToggle}
          className="absolute right-0 top-0 flex h-full items-center px-3 text-gray-600"
          aria-label={show ? "Masquer" : "Afficher"}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
