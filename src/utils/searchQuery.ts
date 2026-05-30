// Shared search-query model and helpers for the global search page.
// These functions keep URL parsing and URL generation consistent across
// mentor search, paper search, sorting, pagination, and visibility filters.

export type SearchMode = "mentor" | "paper";
export type SearchMatchMode = "exact" | "fuzzy";
export type SearchPaperSortMode = "default" | "early" | "late";
export type SearchMentorVisibility = "all" | "mine" | "public";

// Canonical in-memory representation of the search page state mirrored in the URL.
export interface SearchQueryState {
    keyword: string;
    mode: SearchMode;
    searchMode: SearchMatchMode;
    sortMode: SearchPaperSortMode;
    page: number;
    visibility: SearchMentorVisibility;
}

export const DEFAULT_SEARCH_QUERY_STATE: SearchQueryState = {
    keyword: "",
    mode: "mentor",
    searchMode: "fuzzy",
    sortMode: "default",
    page: 1,
    visibility: "all",
};

// Type guards used when decoding URL query strings from untrusted sources.
const isSafeSearchMode = (value: unknown): value is SearchMode => {
    return value === "mentor" || value === "paper";
};

const isSafeMatchMode = (value: unknown): value is SearchMatchMode => {
    return value === "exact" || value === "fuzzy";
};

const isSafeSortMode = (value: unknown): value is SearchPaperSortMode => {
    return value === "default" || value === "early" || value === "late";
};

const isSafeMentorVisibility = (value: unknown): value is SearchMentorVisibility => {
    return value === "all" || value === "mine" || value === "public";
};

// Normalize a Next.js query field into a single string value.
// Arrays are reduced to their first item, and missing values become "".
const normalizeQueryValue = (value: string | string[] | undefined) => {
    if (typeof value === "string") {
        return value;
    }

    if (Array.isArray(value) && value.length > 0) {
        return value[0];
    }

    return "";
};

// Parse page numbers defensively so invalid values fall back to page 1.
const parsePositivePage = (value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) {
        return 1;
    }

    return Math.floor(parsed);
};

// Parse the router query into a validated search state object.
// Unknown or invalid query values are replaced with safe defaults so the page
// can rehydrate its UI without trusting raw URL parameters blindly.
export const parseSearchQuery = (
    query: Record<string, string | string[] | undefined>,
) => {
    const rawKeyword = normalizeQueryValue(query.keyword);
    const rawMode = normalizeQueryValue(query.mode);
    const rawSearchMode = normalizeQueryValue(query.search_mode);
    const rawSortMode = normalizeQueryValue(query.sort_mode);
    const rawPage = normalizeQueryValue(query.page);
    const rawVisibility = normalizeQueryValue(query.visibility);

    const hasAnySearchParam =
        rawKeyword !== "" ||
        rawMode !== "" ||
        rawSearchMode !== "" ||
        rawSortMode !== "" ||
        rawPage !== "" ||
        rawVisibility !== "";

    return {
        hasAnySearchParam,
        state: {
            keyword: rawKeyword,
            mode: isSafeSearchMode(rawMode) ? rawMode : DEFAULT_SEARCH_QUERY_STATE.mode,
            searchMode: isSafeMatchMode(rawSearchMode) ? rawSearchMode : DEFAULT_SEARCH_QUERY_STATE.searchMode,
            sortMode: isSafeSortMode(rawSortMode) ? rawSortMode : DEFAULT_SEARCH_QUERY_STATE.sortMode,
            page: rawPage === "" ? DEFAULT_SEARCH_QUERY_STATE.page : parsePositivePage(rawPage),
            visibility: isSafeMentorVisibility(rawVisibility) ? rawVisibility : DEFAULT_SEARCH_QUERY_STATE.visibility,
        } satisfies SearchQueryState,
    };
};

// Build the canonical `/search?...` URL for the current search state.
// Only mode-relevant optional parameters are emitted:
// - paper mode emits sort_mode;
// - mentor mode emits visibility when it is not "all";
// - page is omitted for the first page.
export const buildSearchUrl = (state: SearchQueryState) => {
    const params = new URLSearchParams();

    params.set("keyword", state.keyword);
    params.set("mode", state.mode);
    params.set("search_mode", state.searchMode);

    if (state.mode === "paper") {
        params.set("sort_mode", state.sortMode);
    }
    else if (state.visibility !== "all") {
        params.set("visibility", state.visibility);
    }

    if (state.page > 1) {
        params.set("page", String(state.page));
    }

    return `/search?${params.toString()}`;
};

// Convenience helper for the top navigation global search box, which always
// opens a fuzzy paper search in a new tab.
export const buildGlobalPaperSearchUrl = (keyword: string) => {
    return buildSearchUrl({
        keyword: keyword.trim(),
        mode: "paper",
        searchMode: "fuzzy",
        sortMode: "default",
        page: 1,
        visibility: "all",
    });
};
