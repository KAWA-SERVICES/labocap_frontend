import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { clearSelectedBranch, getSelectedBranchId } from "@/lib/branch-cookie";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api/v1";

/**
 * Origine du backend (sans le suffixe `/api/v1`), pour construire les URL
 * absolues de fichiers servis par le backend (ex. galerie d'images). Un chemin
 * relatif `/api/v1/files/...` viserait sinon le serveur Next (port du front) → 404.
 */
export const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, "");

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

/**
 * Pose l'en-tête `X-Branch-Id` (branche active) sur chaque requête — équivalent
 * stateless du `selected_branch_id` de session de Laravel. Le backend le revalide
 * contre `branch_user` et isole la donnée sur cette branche.
 */
apiClient.interceptors.request.use((config) => {
  const branchId = getSelectedBranchId();
  if (branchId) {
    config.headers.set("X-Branch-Id", branchId);
  }
  return config;
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

function processQueue(error: AxiosError | null) {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(undefined);
    }
  });
  failedQueue = [];
}

apiClient.interceptors.response.use(
  (response) => {
    if (response.data && typeof response.data === "object" && "data" in response.data && "success" in response.data) {
      response.data = response.data.data;
    }
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // 428 = branche non sélectionnée ou accès révoqué (analogue de la redirection
    // vers `select.branch` du middleware `BranchRequired` de Laravel). On efface la
    // branche courante et on renvoie vers l'écran de sélection.
    if (error.response?.status === 428) {
      clearSelectedBranch();
      if (
        typeof window !== "undefined" &&
        !window.location.pathname.startsWith("/select-branch")
      ) {
        window.location.href = "/select-branch";
      }
      return Promise.reject(error);
    }

    // Endpoints d'authentification qui ne doivent JAMAIS déclencher un refresh
    // (un 401 y est une vraie erreur d'identifiants, et /auth/refresh éviterait
    // une boucle infinie). /auth/me en est volontairement exclu : un access
    // token expiré doit pouvoir être rafraîchi puis la requête rejouée.
    const noRefreshPaths = [
      "/auth/login",
      "/auth/refresh",
      "/auth/2fa",
      "/auth/logout",
      "/auth/forgot-password",
      "/auth/reset-password",
      "/auth/resend-2fa",
    ];
    const skipRefresh = noRefreshPaths.some((p) =>
      originalRequest.url?.includes(p)
    );

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !skipRefresh
    ) {
      if (isRefreshing) {
        // Marque la requête en attente pour éviter qu'elle relance un cycle
        // de refresh si elle re-renvoie un 401 après rejeu.
        originalRequest._retry = true;
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => apiClient(originalRequest))
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        await apiClient.post("/auth/refresh");
        processQueue(null);
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as AxiosError);
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
