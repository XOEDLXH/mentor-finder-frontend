export const isSafeRelativeRedirect = (value: unknown): value is string => {
    return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
};

export const resolveRedirectTarget = (
    redirectValue: unknown,
    fallback = "/",
) => {
    return isSafeRelativeRedirect(redirectValue) ? redirectValue : fallback;
};

export const buildRedirectHref = (
    basePath: string,
    redirectValue: unknown,
) => {
    const redirectTarget = resolveRedirectTarget(redirectValue, "");
    if (redirectTarget === "") {
        return basePath;
    }

    return `${basePath}?redirect=${encodeURIComponent(redirectTarget)}`;
};
