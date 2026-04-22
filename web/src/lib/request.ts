import axios, {AxiosError, type AxiosRequestConfig} from "axios";

import webConfig from "@/constants/common-env";
import {
    clearStoredAuthSession,
    getStoredAuthSession,
    isPublicAuthPath,
} from "@/store/auth";

type RequestConfig = AxiosRequestConfig & {
    redirectOnUnauthorized?: boolean;
};

const request = axios.create({
    baseURL: webConfig.apiUrl.replace(/\/$/, ""),
});

request.interceptors.request.use(async (config) => {
    const nextConfig = {...config};
    const session = await getStoredAuthSession();
    const headers = {...(nextConfig.headers || {})} as Record<string, string>;
    if (session?.token && !headers.Authorization) {
        headers.Authorization = `Bearer ${session.token}`;
    }
    nextConfig.headers = headers;
    return nextConfig;
});

request.interceptors.response.use(
    (response) => response,
    async (error: AxiosError<{ detail?: { error?: string }; error?: string; message?: string }>) => {
        const status = error.response?.status;
        const shouldRedirect = (error.config as RequestConfig | undefined)?.redirectOnUnauthorized !== false;
        if (status === 401 && shouldRedirect && typeof window !== "undefined") {
            const session = await getStoredAuthSession();
            const pathname = window.location.pathname;
            const redirectTo = pathname.startsWith("/accounts") || pathname.startsWith("/settings") || pathname.startsWith("/admin")
                ? "/admin/login"
                : session?.role === "admin"
                    ? "/admin/login"
                    : "/login";

            if (!isPublicAuthPath(pathname)) {
                await clearStoredAuthSession();
                window.location.replace(redirectTo);
                // Return a never-resolving promise to prevent further error handling
                // while the browser navigates away
                return new Promise(() => {});
            }
        }

        const payload = error.response?.data;
        const message =
            payload?.detail?.error ||
            payload?.error ||
            payload?.message ||
            error.message ||
            `请求失败 (${status || 500})`;
        return Promise.reject(new Error(message));
    },
);

type RequestOptions = {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    redirectOnUnauthorized?: boolean;
};

export async function httpRequest<T>(path: string, options: RequestOptions = {}) {
    const {method = "GET", body, headers, redirectOnUnauthorized = true} = options;
    const config: RequestConfig = {
        url: path,
        method,
        data: body,
        headers,
        redirectOnUnauthorized,
    };
    const response = await request.request<T>(config);
    return response.data;
}
