import axios, {AxiosError, AxiosHeaders, type AxiosRequestConfig} from "axios";

import webConfig from "@/constants/common-env";
import {
    clearStoredAuthSession,
    getStoredAuthSession,
    isPublicAuthPath,
} from "@/store/auth";

export class HttpRequestError extends Error {
    failureLog?: string;

    constructor(message: string, options?: { failureLog?: string }) {
        super(message);
        this.name = "HttpRequestError";
        this.failureLog = options?.failureLog;
    }
}

type RequestConfig = AxiosRequestConfig & {
    redirectOnUnauthorized?: boolean;
};

const request = axios.create({
    baseURL: webConfig.apiUrl.replace(/\/$/, ""),
});

request.interceptors.request.use(async (config) => {
    const nextConfig = {...config};
    const session = await getStoredAuthSession();
    const headers = AxiosHeaders.from(nextConfig.headers || {});
    if (session?.token && !headers.get("Authorization")) {
        headers.set("Authorization", `Bearer ${session.token}`);
    }
    nextConfig.headers = headers;
    return nextConfig;
});

request.interceptors.response.use(
    (response) => response,
    async (error: AxiosError<{ detail?: { error?: string; failure_log?: string }; error?: string; message?: string; failure_log?: string }>) => {
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
        return Promise.reject(
            new HttpRequestError(message, {
                failureLog: payload?.detail?.failure_log || payload?.failure_log,
            }),
        );
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
