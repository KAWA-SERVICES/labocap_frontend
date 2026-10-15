import { create } from "zustand";
import { persist } from "zustand/middleware";
import { User } from "@/types/auth";

// Un Super Admin a tous les droits, quel que soit le détail des permissions
// seedées : il court-circuite tous les contrôles (UI). Détection FR + EN sur
// le nom comme sur le slug du rôle.
export const isSuperAdmin = (user: User | null): boolean =>
  (user?.roles ?? []).some((r) => {
    const tokens = `${r.name ?? ""} ${r.slug ?? ""}`.toLowerCase();
    return tokens.includes("super-admin") || tokens.includes("super admin");
  });

interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User) => void;
  clearAuth: () => void;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (...permissions: string[]) => boolean;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      setUser: (user) => {
        // Le backend retourne roles[].permissions[] sous forme d'objets {id,name,slug}
        // On aplatit en tableau de slugs pour que hasPermission() fonctionne
        const extractSlug = (p: unknown): string =>
          typeof p === "string" ? p : (p as { slug: string }).slug;

        let permissions =
          user.permissions?.length
            ? user.permissions
            : [
                ...new Set(
                  user.roles?.flatMap((role) =>
                    (role.permissions ?? []).map(extractSlug)
                  ) ?? []
                ),
              ];

        let roles = user.roles ?? [];

        // Fusion défensive : certaines réponses renvoient un `user` partiel —
        //  - PUT /users/{id} : sans `roles` NI `permissions` ;
        //  - GET /auth/me au montage / mise à jour de profil : avec des `roles`
        //    mais dont les `permissions` ne sont pas (re)chargées.
        // Dans tous ces cas, ne JAMAIS écraser par du vide les permissions/rôles
        // déjà chargés du même utilisateur connecté — sinon la sidebar et les
        // PermissionGate se vident à tort. On préserve chaque liste INDÉPENDAMMENT
        // (une réponse peut ramener des rôles sans leurs permissions).
        const existing = get().user;
        if (existing && (!existing.id || !user.id || existing.id === user.id)) {
          if (permissions.length === 0 && (existing.permissions?.length ?? 0) > 0) {
            permissions = existing.permissions ?? [];
          }
          if (roles.length === 0 && (existing.roles?.length ?? 0) > 0) {
            roles = existing.roles ?? [];
          }
        }

        set({
          user: { ...user, permissions, roles },
          isAuthenticated: true,
        });
      },
      clearAuth: () => set({ user: null, isAuthenticated: false }),
      hasPermission: (permission) => {
        const { user } = get();
        if (isSuperAdmin(user)) return true;
        return user?.permissions?.includes(permission) ?? false;
      },
      hasAnyPermission: (...permissions) => {
        const { user } = get();
        if (isSuperAdmin(user)) return true;
        return permissions.some((p) => user?.permissions?.includes(p) ?? false);
      },
    }),
    {
      name: "auth-storage",
      // Ne jamais stocker les tokens JWT ici — ils sont dans les cookies HttpOnly
      // Le localStorage est lisible par tout script de la page : on n'y garde
      // que ce qui sert au rendu avant revalidation par /auth/me (AuthGuard),
      // ni la signature (image) ni le téléphone. `undefined` disparaît à la
      // sérialisation JSON.
      partialize: (state) => ({
        user: state.user && { ...state.user, signature: undefined, phone: undefined },
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
