"use client";

import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Eye, Trash2, UserX, UserCheck, Smartphone } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { AxiosError } from "axios";
import type { UseFormReturn } from "react-hook-form";
import { LimitedSelect as ReactSelect } from "@/components/ui/LimitedSelect";

import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DataTableCard } from "@/components/common/DataTableCard";
import {
  RowActions,
  RowActionsProvider,
  type RowAction,
} from "@/components/ui/RowActions";
import { CrudModal } from "@/components/common/CrudModal";
import { AccesMobile } from "./AccesMobile";
import { ConfirmModal } from "@/components/common/ConfirmModal";
import { FormField } from "@/components/ui/FormField";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/constants/permissions";
import { usersApi, User, UserRequest } from "@/lib/api/users";
import { SELECT_CONTROL_MIN_HEIGHT } from "@/components/ui/selectStyles";
import { INPUT_CLASS as inputClass } from "@/lib/ui/inputClass";
import { nomComplet } from "@/lib/utils";
import { MOT_DE_PASSE_MIN } from "@/lib/mot-de-passe";
import { ForceMotDePasse } from "@/components/ui/ForceMotDePasse";

// ---------------------------------------------------------------------------
// Zod — calque exact du formulaire Laravel users/create & users/edit :
// Nom, Prénoms, Email, Signature, Rôles (aucun mot de passe / commission /
// whatsapp / téléphone / branches côté formulaire).
// ---------------------------------------------------------------------------

const userSchema = z.object({
  firstname: z.string().min(1, "Les prénoms sont requis"),
  lastname: z.string().min(1, "Le nom est requis"),
  email: z.string().min(1, "L'email est requis").email("Email invalide"),
  roleIds: z.array(z.string()).optional(),
  /**
   * Mot de passe. Le champ manquait alors que le backend l'exige à la création
   * (UserServiceImpl : « Le mot de passe est obligatoire pour la création d'un
   * utilisateur. »), d'où l'échec systématique signalé en recette.
   * À la modification il reste vide : le changement passe par l'écran dédié.
   */
  password: z.string().optional(),
});

/**
 * Schéma de création : mot de passe obligatoire, au moins 12 caractères et sans
 * espace. On passe par `superRefine` plutôt que `extend` pour que le type
 * inféré reste celui de `userSchema` — les deux formulaires partagent le même
 * composant, un type divergent le casserait.
 */
const userCreateSchema = userSchema.superRefine((val, ctx) => {
  const mdp = val.password ?? "";
  if (mdp.length < MOT_DE_PASSE_MIN) {
    ctx.addIssue({
      code: "custom",
      path: ["password"],
      message: `Le mot de passe doit contenir au moins ${MOT_DE_PASSE_MIN} caractères`,
    });
  } else if (/\s/.test(mdp)) {
    ctx.addIssue({
      code: "custom",
      path: ["password"],
      message: "Le mot de passe ne doit pas contenir d'espace",
    });
  }
});

type UserFormValues = z.infer<typeof userSchema>;


const reactSelectStyles = {
  control: (base: Record<string, unknown>) => ({
    ...base,
    borderColor: "#d1d5db",
    borderRadius: "0.375rem",
    minHeight: `${SELECT_CONTROL_MIN_HEIGHT}px`,
    boxShadow: "none",
    "&:hover": { borderColor: "#d1d5db" },
  }),
  menu: (base: Record<string, unknown>) => ({ ...base, zIndex: 50 }),
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function UsersPage() {
  const { can } = usePermissions();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  /// Utilisateur dont on gère l'accès mobile, ou `null` si la fenêtre est fermée.
  const [accesMobile, setAccesMobile] = useState<User | null>(null);

  // Signature (data-URL) capturée depuis le champ fichier de chaque modale.
  const createSignatureRef = useRef<string | undefined>(undefined);
  const editSignatureRef = useRef<string | undefined>(undefined);

  const { data, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => usersApi.findAll({ size: 1000 }).then((r) => r.data),
  });

  const { data: rolesData } = useQuery({
    queryKey: ["roles"],
    queryFn: () => usersApi.getRoles().then((r) => r.data),
  });

  const users: User[] = useMemo(() => data?.content ?? [], [data?.content]);
  const roles = rolesData?.content ?? [];
  const roleOptions = roles.map((r) => ({ value: r.id, label: r.name }));

  const createMutation = useMutation({
    mutationFn: (payload: UserRequest) => usersApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Utilisateur créé");
      setCreateOpen(false);
      createForm.reset();
      createSignatureRef.current = undefined;
    },
    onError: (err: AxiosError) =>
      toast.error(
        (err.response?.data as { message?: string })?.message ?? "Une erreur est survenue"
      ),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<UserRequest> }) =>
      usersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Utilisateur modifié");
      setEditOpen(false);
      editSignatureRef.current = undefined;
    },
    onError: (err: AxiosError) =>
      toast.error(
        (err.response?.data as { message?: string })?.message ?? "Une erreur est survenue"
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => usersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Utilisateur supprimé");
      setDeleteOpen(false);
      setSelectedUser(null);
    },
    onError: (err: AxiosError) =>
      toast.error(
        (err.response?.data as { message?: string })?.message ?? "Une erreur est survenue"
      ),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: (id: string) => usersApi.toggleStatus(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Statut modifié");
    },
    onError: (err: AxiosError) =>
      toast.error(
        (err.response?.data as { message?: string })?.message ?? "Une erreur est survenue"
      ),
  });

  const createForm = useForm<UserFormValues>({
    resolver: zodResolver(userCreateSchema),
    defaultValues: { firstname: "", lastname: "", email: "", roleIds: [] },
  });

  const editForm = useForm<UserFormValues>({ resolver: zodResolver(userSchema) });

  function openCreate() {
    createForm.reset();
    createSignatureRef.current = undefined;
    setCreateOpen(true);
  }

  function openEdit(user: User) {
    setSelectedUser(user);
    editSignatureRef.current = undefined;
    editForm.reset({
      firstname: user.firstname,
      lastname: user.lastname,
      email: user.email,
      roleIds: (user.roles ?? []).map((r) => r.id),
    });
    setEditOpen(true);
  }

  function openDelete(user: User) {
    setSelectedUser(user);
    setDeleteOpen(true);
  }

  function onCreateSubmit(values: UserFormValues) {
    createMutation.mutate({
      firstname: values.firstname,
      lastname: values.lastname,
      email: values.email,
      // Le mot de passe n'était pas transmis : le backend rejetait la création.
      password: values.password,
      signature: createSignatureRef.current,
      roleIds: values.roleIds,
    });
  }

  function onEditSubmit(values: UserFormValues) {
    if (!selectedUser) return;
    updateMutation.mutate({
      id: selectedUser.id,
      data: {
        firstname: values.firstname,
        lastname: values.lastname,
        email: values.email,
        signature: editSignatureRef.current,
        roleIds: values.roleIds,
      },
    });
  }

  // ---- Colonnes (calque users/index Laravel : Nom, Email, Rôles, Actions) ----

  const columns: ColumnDef<User>[] = [
    {
      header: "Nom",
      id: "fullname",
      cell: ({ row }) => (
        <span className="font-medium text-gray-900">
          {nomComplet(row.original.lastname, row.original.firstname)}
        </span>
      ),
    },
    { header: "Email", accessorKey: "email" },
    {
      header: "Rôles",
      id: "roles",
      cell: ({ row }) => {
        const userRoles = row.original.roles ?? [];
        if (userRoles.length === 0) return <span className="text-gray-400 text-xs">Aucun</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {userRoles.map((role) => (
              <span key={role.id} className="inline-flex items-center rounded px-[.4em] py-[.25em] text-xs font-bold bg-blue-600 text-white">
                {role.name}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      // L'état existait déjà de bout en bout — `isActive` dans le DTO, dans le
      // type client, et dans l'action « Activer / Désactiver » — mais aucune
      // colonne ne le montrait. On pouvait donc basculer un compte sans jamais
      // voir son état, sinon en devinant depuis le libellé de l'action.
      header: "Statut",
      id: "statut",
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.isActive ? "ACTIF" : "INACTIF"}
          domain="general"
        />
      ),
    },
    {
      header: "Actions",
      id: "actions",
      cell: ({ row }) => {
        const utilisateur = row.original;
        const actions: RowAction[] = [];

        if (can(PERMISSIONS.EDIT_USERS)) {
          actions.push({
            label: "Voir / modifier",
            icon: <Eye className="h-4 w-4" />,
            variant: "view",
            onClick: () => openEdit(utilisateur),
          });
        }

        if (can(PERMISSIONS.EDIT_USERS)) {
          // Séparé de « Voir / modifier » : ouvrir un accès mobile engendre deux
          // secrets à transmettre séance tenante, ce qui n'a rien à voir avec la
          // retouche d'une fiche et ne doit pas s'y perdre.
          actions.push({
            label: "Accès mobile",
            icon: <Smartphone className="h-4 w-4" />,
            variant: "secondary",
            onClick: () => setAccesMobile(utilisateur),
          });
        }

        if (can(PERMISSIONS.DELETE_USERS)) {
          actions.push({
            label: "Supprimer",
            icon: <Trash2 className="h-4 w-4" />,
            variant: "delete",
            onClick: () => openDelete(utilisateur),
          });
        }

        if (can(PERMISSIONS.EDIT_USERS)) {
          // Le libellé dit l'ÉTAT VISÉ, pas l'état courant : « Désactiver »
          // pour un compte actif. Un bouton nommé « Inactif » sur un compte
          // actif se lit comme une étiquette de statut, pas comme une commande.
          actions.push({
            label: utilisateur.isActive ? "Désactiver" : "Activer",
            icon: utilisateur.isActive ? (
              <UserX className="h-4 w-4" />
            ) : (
              <UserCheck className="h-4 w-4" />
            ),
            variant: "secondary",
            onClick: () => toggleStatusMutation.mutate(utilisateur.id),
          });
        }

        return <RowActions actions={actions} />;
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Utilisateurs"
        action={
          can(PERMISSIONS.CREATE_USERS) ? (
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-[.15rem] bg-blue-600 px-[.9rem] py-[.45rem] text-[.9rem] font-normal text-white transition-[background-color,box-shadow] hover:shadow-[0_2px_6px_0_rgba(114,124,245,0.5)]"
            >
              Ajouter un nouveau utilisateur
            </button>
          ) : undefined
        }
      />

      {/* Jusqu'à trois actions : le tableau replie uniformément. */}
      <RowActionsProvider collapse>
        <DataTableCard title="Liste des utilisateurs" columns={columns} data={users} isLoading={isLoading} />
      </RowActionsProvider>

      {/* ---- Modal création ---- */}
      <CrudModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Ajouter un nouvel utilisateur"
        size="xl"
        onSubmit={() => createForm.handleSubmit(onCreateSubmit)()}
        submitLabel="Ajouter un nouvel utilisateur"
        isSubmitting={createMutation.isPending}
      >
        <UserForm
          withPassword
          form={createForm}
          roleOptions={roleOptions}
          onSignature={(d) => (createSignatureRef.current = d)}
        />
      </CrudModal>

      {/* ---- Modal édition ---- */}
      <CrudModal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        title="Modifier l'utilisateur"
        size="xl"
        onSubmit={() => editForm.handleSubmit(onEditSubmit)()}
        submitLabel="Mettre à jour"
        isSubmitting={updateMutation.isPending}
      >
        <UserForm
          form={editForm}
          roleOptions={roleOptions}
          onSignature={(d) => (editSignatureRef.current = d)}
        />
      </CrudModal>

      {/* ---- Modal confirmation suppression ---- */}
      <ConfirmModal
        isOpen={deleteOpen}
        onClose={() => {
          setDeleteOpen(false);
          setSelectedUser(null);
        }}
        onConfirm={() => {
          if (selectedUser) deleteMutation.mutate(selectedUser.id);
        }}
        title="Supprimer cet utilisateur"
        message={`Voulez-vous vraiment supprimer l'utilisateur "${nomComplet(selectedUser?.lastname, selectedUser?.firstname)}" ? Cette action est irréversible.`}
        confirmLabel="Supprimer"
        confirmVariant="danger"
        isLoading={deleteMutation.isPending}
      />

      {/* ---- Accès à l'application mobile ---- */}
      {accesMobile && (
        <AccesMobile
          utilisateur={accesMobile}
          onClose={() => setAccesMobile(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// UserForm — calque users/create & users/edit Laravel
// ---------------------------------------------------------------------------

interface Option {
  value: string;
  label: string;
}

interface UserFormProps {
  form: UseFormReturn<UserFormValues>;
  /** Affiche le champ mot de passe (création uniquement). */
  withPassword?: boolean;
  roleOptions: Option[];
  onSignature: (dataUrl: string | undefined) => void;
}

function UserForm({ form, roleOptions, onSignature, withPassword = false }: UserFormProps) {
  const {
    register,
    control,
    formState: { errors },
  } = form;
  const password = useWatch({ control, name: "password" }) ?? "";

  function handleSignatureFile(file?: File) {
    if (!file) {
      onSignature(undefined);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onSignature(reader.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      {/* Les deux champs étaient croisés : « Nom » écrivait dans `firstname` et
          « Prénoms » dans `lastname`. Partout ailleurs — l'entité User, le
          compte rendu imprimé, l'application mobile — `lastname` est le nom.
          Les personnes saisies ici depuis le 22 juillet 2026 ont donc leurs
          deux champs intervertis en base ; la correction ci-dessous ne vaut
          que pour les suivantes. */}
      <FormField label="Nom" required error={errors.lastname?.message}>
        <input type="text" {...register("lastname")} className={inputClass} />
      </FormField>

      <FormField label="Prénoms" required error={errors.firstname?.message}>
        <input type="text" {...register("firstname")} className={inputClass} />
      </FormField>

      <FormField label="Email" required error={errors.email?.message}>
        <input type="email" {...register("email")} placeholder="exemple@domaine.com" className={inputClass} />
      </FormField>

      {withPassword && (
        <FormField label="Mot de passe" required error={errors.password?.message}>
          <input
            type="password"
            autoComplete="new-password"
            {...register("password")}
            placeholder={`Au moins ${MOT_DE_PASSE_MIN} caractères, sans espace`}
            className={inputClass}
          />
          <ForceMotDePasse valeur={password} />
        </FormField>
      )}

      <FormField label="Signature">
        <input
          type="file"
          accept="image/*"
          onChange={(e) => handleSignatureFile(e.target.files?.[0])}
          className="block w-full text-sm text-gray-500 file:mr-4 file:rounded file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
        />
      </FormField>

      <FormField
        label="Roles"
        required
        error={(errors as { roleIds?: { message?: string } }).roleIds?.message}
      >
        <Controller
          name="roleIds"
          control={control}
          render={({ field }) => (
            <ReactSelect
              instanceId="user-roles"
              isMulti
              options={roleOptions}
              value={roleOptions.filter((o) => (field.value ?? []).includes(o.value))}
              onChange={(selected) => field.onChange(selected.map((s) => s.value))}
              placeholder="Sélectionner les roles"
              noOptionsMessage={() => "Ajouter un role"}
              classNamePrefix="react-select"
              styles={reactSelectStyles}
            />
          )}
        />
      </FormField>
    </div>
  );
}
