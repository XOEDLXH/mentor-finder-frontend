export interface PendingMentorSearchReturn {
    mentorId: number;
    sourceEntryKey: string;
    targetEntryKey: string;
    sourcePath: "/search";
}

const SEARCH_RETURN_MARKER_STORAGE_KEY = "search-mentor-return-marker";

const normalizePendingMentorSearchReturn = (
    value: Partial<PendingMentorSearchReturn> | undefined,
) => {
    const mentorId = Number(value?.mentorId);
    const sourceEntryKey = typeof value?.sourceEntryKey === "string"
        ? value.sourceEntryKey.trim()
        : "";
    const targetEntryKey = typeof value?.targetEntryKey === "string"
        ? value.targetEntryKey.trim()
        : "";

    if (
        !Number.isInteger(mentorId) ||
        mentorId <= 0 ||
        sourceEntryKey === "" ||
        targetEntryKey === "" ||
        value?.sourcePath !== "/search"
    ) {
        return undefined;
    }

    return {
        mentorId,
        sourceEntryKey,
        targetEntryKey,
        sourcePath: "/search",
    } satisfies PendingMentorSearchReturn;
};

export const readPendingMentorSearchReturn = () => {
    if (typeof window === "undefined") {
        return undefined;
    }

    try {
        const rawValue = window.sessionStorage.getItem(SEARCH_RETURN_MARKER_STORAGE_KEY);
        if (typeof rawValue !== "string") {
            return undefined;
        }

        const parsedValue = JSON.parse(rawValue) as Partial<PendingMentorSearchReturn>;
        return normalizePendingMentorSearchReturn(parsedValue);
    }
    catch {
        return undefined;
    }
};

export const writePendingMentorSearchReturn = (value: PendingMentorSearchReturn) => {
    if (typeof window === "undefined") {
        return;
    }

    const normalizedValue = normalizePendingMentorSearchReturn(value);
    if (normalizedValue === undefined) {
        clearPendingMentorSearchReturn();
        return;
    }

    try {
        window.sessionStorage.setItem(
            SEARCH_RETURN_MARKER_STORAGE_KEY,
            JSON.stringify(normalizedValue),
        );
    }
    catch {
        // Ignore sessionStorage failures and keep navigation functional.
    }
};

export const clearPendingMentorSearchReturn = () => {
    if (typeof window === "undefined") {
        return;
    }

    try {
        window.sessionStorage.removeItem(SEARCH_RETURN_MARKER_STORAGE_KEY);
    }
    catch {
        // Ignore sessionStorage failures and keep navigation functional.
    }
};
