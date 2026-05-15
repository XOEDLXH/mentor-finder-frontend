import Link from "next/link";
import { KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useSelector } from "react-redux";

import LatexText from "../components/LatexText";
import Pagination from "../components/Pagination";
import { FAILURE_PREFIX } from "../constants/string";
import { NetworkError, NetworkErrorType, request } from "../utils/network";
import { RootState } from "../redux/store";
import {
    buildSearchUrl,
    DEFAULT_SEARCH_QUERY_STATE,
    parseSearchQuery,
    SearchMatchMode,
    SearchMentorVisibility,
    SearchMode,
    SearchPaperSortMode,
    SearchQueryState,
} from "../utils/searchQuery";
import { PrivateMentorResult, SearchMentorResult, SearchPaperResult } from "../utils/types";
type MentorResultFilter = SearchMentorVisibility;

const PROFILE_PREVIEW_LENGTH = 100;     // 导师画像预览长度
const PAPER_TITLES_PREVIEW_COUNT = 7;   // 导师相关论文标题预览数量，超过后显示“查看更多”按钮展开完整列表
const SEARCH_VIEW_STATE_STORAGE_PREFIX = "search-view-state:";
const INITIAL_HISTORY_ENTRY_KEY = "search-entry-initial";

interface PrivateMentorsResponse {
    mentors?: PrivateMentorResult[];
}

interface SearchMentorsResponse {
    mentors?: SearchMentorResult[];
    page?: number;
    page_size?: number;
    total?: number;
    total_pages?: number;
    has_previous?: boolean;
    has_next?: boolean;
}

interface SearchPapersResponse {
    papers?: SearchPaperResult[];
    page?: number;
    page_size?: number;
    total?: number;
    total_pages?: number;
    has_previous?: boolean;
    has_next?: boolean;
}

interface SearchNavigationOptions {
    keyword?: string;
    mode?: SearchMode;
    searchMode?: SearchMatchMode;
    sortMode?: SearchPaperSortMode;
    page?: number;
    visibility?: MentorResultFilter;
}

interface MentorDeleteTarget {
    id: number;
    Chinese_name: string;
    English_name?: string;
    research_direction: string;
    email?: string;
}

interface PaperDeleteTarget {
    id: number;
    title: string;
    publish_date?: string;
    subjects?: string;
    mentorNames: string[];
}

interface SegmentedOption<TValue extends string> {
    label: string;
    value: TValue;
}

interface SearchHistoryViewState {
    scrollY: number;
    expandedMentorIds: number[];
}

type SearchNavigationIntent = "init" | "push" | "pop" | "refresh";

let pendingSearchPopRestore:
    | {
        entryKey: string;
    }
    | undefined;

const buildTimelineLikePdfUrl = (arxivUrl?: string) => {
    if (typeof arxivUrl !== "string" || arxivUrl.trim() === "" || !arxivUrl.includes("/abs/")) {
        return "";
    }

    return arxivUrl.replace("/abs/", "/pdf/");
};

const parseTimelineLikeSubjects = (subjects?: string) => {
    if (typeof subjects !== "string" || subjects.trim() === "") {
        return [];
    }

    return subjects
        .split(",")
        .map((subject) => subject.trim())
        .filter((subject) => subject !== "");
};

const SEARCH_MODE_OPTIONS: SegmentedOption<SearchMode>[] = [
    { label: "搜人", value: "mentor" },
    { label: "搜论文", value: "paper" },
];

const MATCH_MODE_OPTIONS: SegmentedOption<SearchMatchMode>[] = [
    { label: "模糊", value: "fuzzy" },
    { label: "精确", value: "exact" },
];

const PAPER_SORT_OPTIONS: SegmentedOption<SearchPaperSortMode>[] = [
    { label: "默认", value: "default" },
    { label: "最早", value: "early" },
    { label: "最晚", value: "late" },
];

const MENTOR_FILTER_OPTIONS: SegmentedOption<MentorResultFilter>[] = [
    { label: "全部", value: "all" },
    { label: "私有", value: "mine" },
    { label: "公共", value: "public" },
];

const SearchScreen = () => {
    const router = useRouter();
    const authToken = useSelector((state: RootState) => state.auth.token);
    const authRole = useSelector((state: RootState) => state.auth.role);
    const isLoggedIn = authToken.trim() !== "";
    const isAdmin = authRole === "admin";

    const [mode, setMode] = useState<SearchMode>("mentor");
    const [matchMode, setMatchMode] = useState<SearchMatchMode>("fuzzy");
    const [paperSortMode, setPaperSortMode] = useState<SearchPaperSortMode>("default");
    const [keyword, setKeyword] = useState("");
    const [appliedKeyword, setAppliedKeyword] = useState("");
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [mentors, setMentors] = useState<SearchMentorResult[]>([]);
    const [papers, setPapers] = useState<SearchPaperResult[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalResults, setTotalResults] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [_hasPreviousPage, setHasPreviousPage] = useState(false);
    const [_hasNextPage, setHasNextPage] = useState(false);
    const [adminSaving, setAdminSaving] = useState(false);
    const [adminMessage, setAdminMessage] = useState("");
    const [mentorDeleteTarget, setMentorDeleteTarget] = useState<MentorDeleteTarget | undefined>(undefined);
    const [mentorDeleteSubmitting, setMentorDeleteSubmitting] = useState(false);
    const [paperDeleteTarget, setPaperDeleteTarget] = useState<PaperDeleteTarget | undefined>(undefined);
    const [paperDeleteSubmitting, setPaperDeleteSubmitting] = useState(false);
    const [privateMentors, setPrivateMentors] = useState<PrivateMentorResult[]>([]);
    const [mentorResultFilter, setMentorResultFilter] = useState<MentorResultFilter>("all");
    const [expandedMentorIds, setExpandedMentorIds] = useState<Set<number>>(new Set());
    const [privateMentorSaving, setPrivateMentorSaving] = useState(false);
    const [privateMentorMsg, setPrivateMentorMsg] = useState("");
    const [customMentorChineseName, setCustomMentorChineseName] = useState("");
    const [customMentorEnglishName, setCustomMentorEnglishName] = useState("");
    const [showSearchLogicHelp, setShowSearchLogicHelp] = useState(false);

    const [mentorEditingId, setMentorEditingId] = useState<number | undefined>(undefined);
    const [mentorDraft, setMentorDraft] = useState({
        Chinese_name: "",
        English_name: "",
        research_direction: "",
        email: "",
        profile: "",
    });

    const [paperEditingId, setPaperEditingId] = useState<number | undefined>(undefined);
    const [paperDraft, setPaperDraft] = useState({
        title: "",
        abstract: "",
        publish_date: "",
        author_names: "",
    });
    const [activeSearchState, setActiveSearchState] = useState<SearchQueryState>(DEFAULT_SEARCH_QUERY_STATE);

    const activeSearchStateRef = useRef<SearchQueryState>(DEFAULT_SEARCH_QUERY_STATE);
    const expandedMentorIdsRef = useRef<Set<number>>(new Set());
    const navigationIntentRef = useRef<SearchNavigationIntent>("init");
    const hasLoadedRouteStateRef = useRef(false);
    const pendingPushRestoreRef = useRef<{ targetEntryKey?: string }>({});
    const blockAutoPersistRef = useRef(false);

    const resetResults = (clearExpandedMentors = true) => {
        setErrorMessage("");
        setMentors([]);
        setPapers([]);
        if (clearExpandedMentors) {
            setExpandedMentorIds(new Set());
        }
        setCurrentPage(1);
        setTotalResults(0);
        setTotalPages(0);
        setHasPreviousPage(false);
        setHasNextPage(false);
    };

    const applyPagination = (
        paginationData: {
            page?: number;
            total?: number;
            total_pages?: number;
            has_previous?: boolean;
            has_next?: boolean;
        },
        fallbackCount: number,
        requestedPage: number,
    ) => {
        const resolvedPage = Number(paginationData.page);
        const normalizedPage = Number.isFinite(resolvedPage) && resolvedPage > 0
            ? resolvedPage
            : requestedPage;
        setCurrentPage(normalizedPage);

        const resolvedTotal = Number(paginationData.total);
        const normalizedTotal = Number.isFinite(resolvedTotal) && resolvedTotal >= 0
            ? resolvedTotal
            : fallbackCount;
        setTotalResults(normalizedTotal);

        const resolvedTotalPages = Number(paginationData.total_pages);
        const fallbackTotalPages = normalizedTotal > 0 ? 1 : 0;
        const normalizedTotalPages = Number.isFinite(resolvedTotalPages) && resolvedTotalPages >= 0
            ? resolvedTotalPages
            : fallbackTotalPages;
        setTotalPages(normalizedTotalPages);

        setHasPreviousPage(Boolean(paginationData.has_previous));
        setHasNextPage(Boolean(paginationData.has_next));
    };

    const isNetworkErrorInstance = (err: unknown): err is NetworkError => {
        return typeof NetworkError === "function" && err instanceof NetworkError;
    };

    const getHistoryEntryKey = () => {
        if (typeof window === "undefined") {
            return INITIAL_HISTORY_ENTRY_KEY;
        }

        const historyState = window.history.state as { key?: unknown } | undefined;
        const historyKey = historyState?.key;
        if (typeof historyKey === "string" && historyKey.trim() !== "") {
            return historyKey;
        }

        return INITIAL_HISTORY_ENTRY_KEY;
    };

    const readHistoryViewState = (entryKey: string) => {
        if (typeof window === "undefined") {
            return undefined;
        }

        try {
            const rawValue = window.sessionStorage.getItem(`${SEARCH_VIEW_STATE_STORAGE_PREFIX}${entryKey}`);
            if (typeof rawValue !== "string") {
                return undefined;
            }

            const parsedValue = JSON.parse(rawValue) as Partial<SearchHistoryViewState>;
            const expandedIds = Array.isArray(parsedValue.expandedMentorIds)
                ? parsedValue.expandedMentorIds
                    .map((value) => Number(value))
                    .filter((value) => Number.isInteger(value) && value > 0)
                : [];

            return {
                scrollY: Number.isFinite(parsedValue.scrollY) ? Number(parsedValue.scrollY) : 0,
                expandedMentorIds: expandedIds,
            } satisfies SearchHistoryViewState;
        }
        catch {
            return undefined;
        }
    };

    const writeHistoryViewState = (entryKey: string, viewState: SearchHistoryViewState) => {
        if (typeof window === "undefined") {
            return;
        }

        try {
            window.sessionStorage.setItem(
                `${SEARCH_VIEW_STATE_STORAGE_PREFIX}${entryKey}`,
                JSON.stringify(viewState),
            );
        }
        catch {
            // Ignore sessionStorage failures and keep search functional.
        }
    };

    const persistCurrentViewState = useCallback((entryKey = getHistoryEntryKey(), force = false) => {
        if (typeof window === "undefined") {
            return;
        }

        if (!force && blockAutoPersistRef.current) {
            return;
        }

        const nextViewState = {
            scrollY: Number.isFinite(window.scrollY) ? window.scrollY : 0,
            expandedMentorIds: Array.from(expandedMentorIdsRef.current),
        };
        writeHistoryViewState(entryKey, {
            scrollY: nextViewState.scrollY,
            expandedMentorIds: nextViewState.expandedMentorIds,
        });
    }, []);

    const scrollWindowTo = useCallback((scrollY: number) => {
        if (typeof window === "undefined") {
            return;
        }

        try {
            window.scrollTo({ left: 0, top: scrollY, behavior: "auto" });
        }
        catch {
            try {
                window.scrollTo(0, scrollY);
            }
            catch {
                // Ignore scroll failures in tests or non-browser environments.
            }
        }
    }, []);

    const scheduleAfterPaint = useCallback((callback: () => void) => {
        if (typeof window === "undefined") {
            callback();
            return;
        }

        const schedule = window.requestAnimationFrame
            ? window.requestAnimationFrame.bind(window)
            : (fn: FrameRequestCallback) => window.setTimeout(() => fn(Date.now()), 16);

        schedule(() => {
            schedule(() => callback());
        });
    }, []);

    const areSearchStatesEqual = useCallback((left: SearchQueryState, right: SearchQueryState) => {
        return left.keyword === right.keyword &&
            left.mode === right.mode &&
            left.searchMode === right.searchMode &&
            left.sortMode === right.sortMode &&
            left.page === right.page &&
            left.visibility === right.visibility;
    }, []);

    const resolveSearchState = useCallback((
        overrides: SearchNavigationOptions = {},
        baseState: SearchQueryState = activeSearchStateRef.current,
    ) => {
        const nextMode = overrides.mode ?? baseState.mode;
        const nextKeyword = (overrides.keyword ?? baseState.keyword).trim();
        const nextPageRaw = overrides.page ?? baseState.page;
        const nextPage = Number.isFinite(nextPageRaw) && nextPageRaw > 0 ? Math.floor(nextPageRaw) : 1;
        const nextSortMode = overrides.sortMode ?? baseState.sortMode;
        const nextSearchMode = overrides.searchMode ?? baseState.searchMode;
        const nextVisibility = nextMode === "mentor"
            ? (overrides.visibility ?? (baseState.mode === "mentor" ? baseState.visibility : "all"))
            : "all";

        return {
            keyword: nextKeyword,
            mode: nextMode,
            searchMode: nextSearchMode,
            sortMode: nextSortMode,
            page: nextPage,
            visibility: nextVisibility,
        } satisfies SearchQueryState;
    }, []);

    const resetAdminEditorState = useCallback(() => {
        setAdminMessage("");
        setMentorEditingId(undefined);
        setMentorDraft({
            Chinese_name: "",
            English_name: "",
            research_direction: "",
            email: "",
            profile: "",
        });
        setPaperEditingId(undefined);
        setPaperDraft({
            title: "",
            abstract: "",
            publish_date: "",
            author_names: "",
        });
    }, []);

    const resetTransientUiState = useCallback(() => {
        resetAdminEditorState();
        setMentorDeleteTarget(undefined);
        setMentorDeleteSubmitting(false);
        setPaperDeleteTarget(undefined);
        setPaperDeleteSubmitting(false);
    }, [resetAdminEditorState]);

    const buildMentorSearchRequestUrl = useCallback((state: SearchQueryState) => {
        const query = `keyword=${encodeURIComponent(state.keyword)}&search_mode=${state.searchMode}`;
        const pageQuery = state.page > 1 ? `&page=${state.page}` : "";
        const visibilityQuery = state.visibility !== "all" ? `&visibility=${state.visibility}` : "";

        return `/api/search/mentors?${query}${pageQuery}${visibilityQuery}`;
    }, []);

    const buildPaperSearchRequestUrl = useCallback((state: SearchQueryState) => {
        const query = `keyword=${encodeURIComponent(state.keyword)}&search_mode=${state.searchMode}`;
        const pageQuery = state.page > 1 ? `&page=${state.page}` : "";

        return `/api/search/papers?${query}&sort_mode=${state.sortMode}${pageQuery}`;
    }, []);

    const applyLoadedViewState = useCallback((state: SearchQueryState, intent: SearchNavigationIntent) => {
        if (intent === "push") {
            const targetEntryKey = pendingPushRestoreRef.current.targetEntryKey ?? getHistoryEntryKey();
            setExpandedMentorIds(new Set());
            writeHistoryViewState(targetEntryKey, {
                scrollY: 0,
                expandedMentorIds: [],
            });
            scheduleAfterPaint(() => {
                scrollWindowTo(0);
                scheduleAfterPaint(() => {
                    blockAutoPersistRef.current = false;
                });
            });
            pendingPushRestoreRef.current = {};
            return;
        }

        if (intent === "pop") {
            const entryKey = pendingSearchPopRestore?.entryKey ?? getHistoryEntryKey();
            const savedViewState = readHistoryViewState(entryKey);
            const restoredExpandedIds = state.mode === "mentor"
                ? new Set(savedViewState?.expandedMentorIds ?? [])
                : new Set<number>();
            setExpandedMentorIds(restoredExpandedIds);
            scheduleAfterPaint(() => {
                scrollWindowTo(savedViewState?.scrollY ?? 0);
                scheduleAfterPaint(() => {
                    blockAutoPersistRef.current = false;
                    persistCurrentViewState(entryKey, true);
                    pendingSearchPopRestore = undefined;
                });
            });
            return;
        }

        blockAutoPersistRef.current = false;
        if (state.mode !== "mentor" && expandedMentorIdsRef.current.size > 0) {
            setExpandedMentorIds(new Set());
        }
    }, [persistCurrentViewState, scheduleAfterPaint, scrollWindowTo]);

    const loadSearchState = useCallback(async (
        state: SearchQueryState,
        intent: SearchNavigationIntent,
    ) => {
        activeSearchStateRef.current = state;
        if (intent !== "refresh") {
            resetTransientUiState();
        }
        setActiveSearchState(state);
        setMode(state.mode);
        setMatchMode(state.searchMode);
        setPaperSortMode(state.sortMode);
        setMentorResultFilter(state.visibility);
        setKeyword(state.keyword);
        setLoading(true);
        setHasSearched(true);
        setErrorMessage("");

        try {
            if (state.mode === "mentor") {
                const res = await request<SearchMentorsResponse>(
                    buildMentorSearchRequestUrl(state),
                    "GET",
                    isLoggedIn,
                );
                const mentorItems = Array.isArray(res.mentors) ? res.mentors : [];
                setAppliedKeyword(state.keyword);
                setMentors(mentorItems);
                setPapers([]);
                applyPagination(res, mentorItems.length, state.page);
            }
            else {
                const res = await request<SearchPapersResponse>(
                    buildPaperSearchRequestUrl(state),
                    "GET",
                    isLoggedIn,
                );
                const paperItems = Array.isArray(res.papers) ? res.papers : [];
                setAppliedKeyword(state.keyword);
                setPapers(paperItems);
                setMentors([]);
                applyPagination(res, paperItems.length, state.page);
            }
        }
        catch (err) {
            setAppliedKeyword(state.keyword);
            resetResults(intent !== "pop");
            setErrorMessage(FAILURE_PREFIX + String(err));
        }
        finally {
            setLoading(false);
            applyLoadedViewState(state, intent);
            navigationIntentRef.current = "init";
        }
    }, [applyLoadedViewState, buildMentorSearchRequestUrl, buildPaperSearchRequestUrl, isLoggedIn, resetTransientUiState]);

    const refreshCurrentSearch = useCallback(async (state = activeSearchStateRef.current) => {
        navigationIntentRef.current = "refresh";
        await loadSearchState(state, "refresh");
    }, [loadSearchState]);

    const navigateToSearchState = useCallback(async (nextState: SearchQueryState) => {
        const currentState = activeSearchStateRef.current;

        if (areSearchStatesEqual(nextState, currentState)) {
            await refreshCurrentSearch(nextState);
            return;
        }

        pendingSearchPopRestore = undefined;
        expandedMentorIdsRef.current = new Set(expandedMentorIds);
        const sourceEntryKey = getHistoryEntryKey();
        persistCurrentViewState(sourceEntryKey, true);
        blockAutoPersistRef.current = true;
        navigationIntentRef.current = "push";
        const targetUrl = buildSearchUrl(nextState);
        await router.push(
            targetUrl,
            undefined,
            { shallow: true, scroll: false },
        );
        pendingPushRestoreRef.current = {
            targetEntryKey: getHistoryEntryKey(),
        };

        if (!areSearchStatesEqual(activeSearchStateRef.current, nextState)) {
            await loadSearchState(nextState, "push");
        }
    }, [areSearchStatesEqual, expandedMentorIds, loadSearchState, persistCurrentViewState, refreshCurrentSearch, router]);

    const switchMode = (nextMode: SearchMode) => {
        if (nextMode === mode) {
            return;
        }

        resetAdminEditorState();

        void navigateToSearchState(resolveSearchState({
            keyword,
            mode: nextMode,
            page: 1,
            visibility: "all",
        }));
    };

    const formatAdminError = (err: unknown) => {
        if (isNetworkErrorInstance(err)) {
            if (err.type === NetworkErrorType.UNAUTHORIZED) {
                return "请先登录管理员账号";
            }

            if (err.type === NetworkErrorType.REJECTED) {
                return "仅管理员可以执行该操作";
            }

            return String(err);
        }

        return FAILURE_PREFIX + String(err);
    };

    const fetchMyPrivateMentors = useCallback(async () => {
        if (!isLoggedIn) {
            setPrivateMentors([]);
            return;
        }

        try {
            const res = await request<PrivateMentorsResponse>("/api/dataset/mentors/mine", "GET", true);
            const mentorList = Array.isArray(res.mentors) ? res.mentors : [];
            setPrivateMentors(mentorList.filter((mentor) => Array.isArray(mentor.paper_ids)));
        }
        catch {
            setPrivateMentors([]);
        }
    }, [isLoggedIn]);

    useEffect(() => {
        void fetchMyPrivateMentors();
    }, [fetchMyPrivateMentors]);

    useEffect(() => {
        activeSearchStateRef.current = activeSearchState;
    }, [activeSearchState]);

    useEffect(() => {
        expandedMentorIdsRef.current = expandedMentorIds;
    }, [expandedMentorIds]);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        const markPendingPopRestore = (entryKey: string) => {
            blockAutoPersistRef.current = true;
            pendingSearchPopRestore = {
                entryKey,
            };
            navigationIntentRef.current = "pop";
        };

        const handlePopState = () => {
            if (pendingSearchPopRestore !== undefined) {
                return;
            }

            markPendingPopRestore(getHistoryEntryKey());
        };

        const hasBeforePopState = typeof router.beforePopState === "function";
        if (hasBeforePopState) {
            router.beforePopState((state) => {
                const stateLike = state as { key?: unknown; as?: unknown; url?: unknown } | undefined;
                const entryKey = typeof stateLike?.key === "string" && stateLike.key.trim() !== ""
                    ? stateLike.key
                    : getHistoryEntryKey();
                markPendingPopRestore(entryKey);
                return true;
            });
        }

        window.addEventListener("popstate", handlePopState);
        return () => {
            if (hasBeforePopState) {
                router.beforePopState(() => true);
            }
            window.removeEventListener("popstate", handlePopState);
        };
    }, [router]);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        const handleScroll = () => {
            persistCurrentViewState();
        };

        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => {
            window.removeEventListener("scroll", handleScroll);
        };
    }, [persistCurrentViewState]);

    useEffect(() => {
        persistCurrentViewState();
    }, [expandedMentorIds, persistCurrentViewState]);

    const privateMentorIdSet = useMemo(() => {
        return new Set(privateMentors.map((mentor) => mentor.id));
    }, [privateMentors]);

    const thirdSegmentOptions = mode === "paper" ? PAPER_SORT_OPTIONS : MENTOR_FILTER_OPTIONS;
    const thirdSegmentValue = mode === "paper" ? paperSortMode : mentorResultFilter;
    const trimmedAppliedKeyword = appliedKeyword.trim();
    const isEmptySearch = trimmedAppliedKeyword === "";
    const searchHeadingText = isEmptySearch
        ? `Search in ${totalResults} entrys:`
        : `Showing ${totalResults} results for all: ${trimmedAppliedKeyword}`;

    const addPrivateMentorInSearch = useCallback(async () => {
        const chineseName = customMentorChineseName.trim();
        const englishName = customMentorEnglishName.trim();

        if (chineseName === "" && englishName === "") {
            setPrivateMentorMsg("中文名和英文名至少填写一个");
            return;
        }

        if (privateMentors.length >= 10) {
            setPrivateMentorMsg("私有导师最多添加 10 位，请先删除后再添加");
            return;
        }

        setPrivateMentorSaving(true);
        setPrivateMentorMsg("");

        try {
            await request("/api/dataset/mentors/custom", "POST", true, {
                Chinese_name: chineseName,
                English_name: englishName,
            });
            setCustomMentorChineseName("");
            setCustomMentorEnglishName("");
            await fetchMyPrivateMentors();
            await refreshCurrentSearch(resolveSearchState({ page: 1 }));
            setPrivateMentorMsg("私有导师添加成功");
        }
        catch (err) {
            if (isNetworkErrorInstance(err)) {
                const rawMsg = String(err);
                if (rawMsg.includes("Mentor already exists")) {
                    setPrivateMentorMsg("该导师已在你的私有导师列表中，请勿重复添加");
                }
                else if (rawMsg.includes("Private mentor limit reached")) {
                    setPrivateMentorMsg("私有导师数量已达上限（10位），请先删除部分私有导师后再添加");
                }
                else {
                    setPrivateMentorMsg(rawMsg);
                }
            }
            else {
                setPrivateMentorMsg(FAILURE_PREFIX + String(err));
            }
        }
        finally {
            setPrivateMentorSaving(false);
        }
    }, [customMentorChineseName, customMentorEnglishName, fetchMyPrivateMentors, privateMentors.length, refreshCurrentSearch, resolveSearchState]);

    useEffect(() => {
        if (!router.isReady) {
            return;
        }

        const { hasAnySearchParam, state } = parseSearchQuery(router.query);
        const nextRouteState = hasAnySearchParam ? state : DEFAULT_SEARCH_QUERY_STATE;
        const nextIntent = pendingSearchPopRestore !== undefined
            ? "pop"
            : (hasLoadedRouteStateRef.current ? navigationIntentRef.current : "init");

        if (hasLoadedRouteStateRef.current && areSearchStatesEqual(nextRouteState, activeSearchStateRef.current)) {
            navigationIntentRef.current = "init";
            return;
        }

        hasLoadedRouteStateRef.current = true;
        void loadSearchState(nextRouteState, nextIntent);
    }, [areSearchStatesEqual, loadSearchState, router.isReady, router.query]);

    const changePaperSortMode = (nextSortMode: SearchPaperSortMode) => {
        if (paperSortMode === nextSortMode) {
            return;
        }

        if (!hasSearched || mode !== "paper") {
            setPaperSortMode(nextSortMode);
            return;
        }

        void navigateToSearchState(resolveSearchState({
            keyword,
            sortMode: nextSortMode,
            page: 1,
        }));
    };

    const changeMatchMode = (nextMatchMode: SearchMatchMode) => {
        if (matchMode === nextMatchMode) {
            return;
        }

        if (!hasSearched) {
            setMatchMode(nextMatchMode);
            return;
        }

        void navigateToSearchState(resolveSearchState({
            keyword,
            searchMode: nextMatchMode,
            page: 1,
        }));
    };

    const handleEnter = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
            void navigateToSearchState(resolveSearchState({
                keyword,
                page: 1,
            }));
        }
    };

    const clearKeyword = () => {
        setKeyword("");
        void navigateToSearchState(resolveSearchState({
            keyword: "",
            page: 1,
        }));
    };

    const searchPaperByTitle = (paperTitle: string) => {
        setMode("paper");
        setMatchMode("exact");
        setKeyword(paperTitle);
        setPaperSortMode("default");
        void navigateToSearchState(resolveSearchState({
            keyword: paperTitle,
            sortMode: "default",
            page: 1,
            mode: "paper",
            searchMode: "exact",
            visibility: "all",
        }, DEFAULT_SEARCH_QUERY_STATE));
    };

    const searchMentorByName = (mentorName: string) => {
        setMode("mentor");
        setMatchMode("exact");
        setKeyword(mentorName);
        void navigateToSearchState(resolveSearchState({
            keyword: mentorName,
            page: 1,
            mode: "mentor",
            searchMode: "exact",
            visibility: "all",
        }, DEFAULT_SEARCH_QUERY_STATE));
    };

    const toggleMentorExpand = (mentorId: number) => {
        setExpandedMentorIds((prev) => {
            const next = new Set(prev);
            if (next.has(mentorId)) {
                next.delete(mentorId);
            }
            else {
                next.add(mentorId);
            }
            expandedMentorIdsRef.current = next;
            writeHistoryViewState(getHistoryEntryKey(), {
                scrollY: typeof window === "undefined" || !Number.isFinite(window.scrollY) ? 0 : window.scrollY,
                expandedMentorIds: Array.from(next),
            });
            return next;
        });
    };

    const saveMentor = async () => {
        const chineseName = mentorDraft.Chinese_name.trim();
        const researchDirection = mentorDraft.research_direction.trim();

        if (chineseName === "" || researchDirection === "") {
            setAdminMessage("导师中文名和研究方向不能为空");
            return;
        }

        setAdminSaving(true);
        setAdminMessage("");

        try {
            const method = mentorEditingId === undefined ? "POST" : "PUT";
            const url = mentorEditingId === undefined
                ? "/api/dataset/mentors"
                : `/api/dataset/mentors/${mentorEditingId}`;

            await request(url, method, true, {
                Chinese_name: chineseName,
                English_name: mentorDraft.English_name.trim(),
                research_direction: researchDirection,
                email: mentorDraft.email.trim(),
                profile: mentorDraft.profile.trim(),
            });

            setAdminMessage(mentorEditingId === undefined ? "导师新增成功" : "导师修改成功");
            setMentorEditingId(undefined);
            setMentorDraft({
                Chinese_name: "",
                English_name: "",
                research_direction: "",
                email: "",
                profile: "",
            });

            if (mode === "mentor" && hasSearched) {
                await refreshCurrentSearch();
            }
        }
        catch (err) {
            setAdminMessage(formatAdminError(err));
        }
        finally {
            setAdminSaving(false);
        }
    };

    const openDeleteMentorDialog = (mentor: SearchMentorResult) => {
        setMentorDeleteTarget({
            id: mentor.id,
            Chinese_name: mentor.Chinese_name,
            English_name: mentor.English_name,
            research_direction: mentor.research_direction,
            email: mentor.email,
        });
    };

    const closeDeleteMentorDialog = () => {
        if (mentorDeleteSubmitting) {
            return;
        }

        setMentorDeleteTarget(undefined);
    };

    const confirmDeleteMentor = async () => {
        if (mentorDeleteTarget === undefined) {
            return;
        }

        setAdminSaving(true);
        setMentorDeleteSubmitting(true);
        setAdminMessage("");

        try {
            await request(`/api/dataset/mentors/${mentorDeleteTarget.id}`, "DELETE", true);
            setAdminMessage("导师删除成功");
            setMentorDeleteTarget(undefined);
            await fetchMyPrivateMentors();

            if (mode === "mentor" && hasSearched) {
                await refreshCurrentSearch();
            }
        }
        catch (err) {
            setAdminMessage(formatAdminError(err));
        }
        finally {
            setAdminSaving(false);
            setMentorDeleteSubmitting(false);
        }
    };

    const openDeletePaperDialog = (paper: SearchPaperResult) => {
        setPaperDeleteTarget({
            id: paper.id,
            title: paper.title,
            publish_date: paper.publish_date,
            subjects: paper.subjects,
            mentorNames: Array.isArray(paper.mentorNames) ? paper.mentorNames : [],
        });
    };

    const closeDeletePaperDialog = () => {
        if (paperDeleteSubmitting) {
            return;
        }

        setPaperDeleteTarget(undefined);
    };

    const confirmDeletePaper = async () => {
        if (paperDeleteTarget === undefined) {
            return;
        }

        setAdminSaving(true);
        setPaperDeleteSubmitting(true);
        setAdminMessage("");

        try {
            await request(`/api/dataset/papers/${paperDeleteTarget.id}`, "DELETE", true);
            setAdminMessage("论文删除成功");
            setPaperDeleteTarget(undefined);

            if (mode === "paper" && hasSearched) {
                await refreshCurrentSearch();
            }
        }
        catch (err) {
            setAdminMessage(formatAdminError(err));
        }
        finally {
            setAdminSaving(false);
            setPaperDeleteSubmitting(false);
        }
    };

    const savePaper = async () => {
        const title = paperDraft.title.trim();

        if (title === "") {
            setAdminMessage("论文标题不能为空");
            return;
        }

        setAdminSaving(true);
        setAdminMessage("");

        try {
            const method = paperEditingId === undefined ? "POST" : "PUT";
            const url = paperEditingId === undefined
                ? "/api/dataset/papers"
                : `/api/dataset/papers/${paperEditingId}`;

            await request(url, method, true, {
                title,
                abstract: paperDraft.abstract.trim(),
                publish_date: paperDraft.publish_date.trim(),
                author_names: paperDraft.author_names.trim(),
            });

            setAdminMessage(paperEditingId === undefined ? "论文新增成功" : "论文修改成功");
            setPaperEditingId(undefined);
            setPaperDraft({
                title: "",
                abstract: "",
                publish_date: "",
                author_names: "",
            });

            if (mode === "paper" && hasSearched) {
                await refreshCurrentSearch();
            }
        }
        catch (err) {
            setAdminMessage(formatAdminError(err));
        }
        finally {
            setAdminSaving(false);
        }
    };

    const beginEditMentor = (mentor: SearchMentorResult) => {
        setMode("mentor");
        setMentorEditingId(mentor.id);
        setMentorDraft({
            Chinese_name: mentor.Chinese_name || "",
            English_name: mentor.English_name || "",
            research_direction: mentor.research_direction || "",
            email: mentor.email || "",
            profile: mentor.profile || "",
        });
        setAdminMessage("");
    };

    const beginEditPaper = (paper: SearchPaperResult) => {
        setMode("paper");
        setPaperEditingId(paper.id);
        setPaperDraft({
            title: paper.title || "",
            abstract: paper.abstract || "",
            publish_date: paper.publish_date || "",
            author_names: paper.author_names || "",
        });
        setAdminMessage("");
    };

    const renderSegmentedControl = <TValue extends string>(
        label: string,
        options: SegmentedOption<TValue>[],
        activeValue: TValue,
        onSelect: (value: TValue) => void,
    ) => {
        const activeIndex = Math.max(0, options.findIndex((option) => option.value === activeValue));
        const groupFlex = options.length;
        const groupMinWidth = options.length === 2 ? 180 : 270;

        return (
            <div
                className="searchSegmentGroup"
                role="group"
                aria-label={label}
                style={{
                    minWidth: groupMinWidth,
                    flex: `${groupFlex} 0 0`,
                    flexShrink: 0,
                }}
            >
                <div
                    className="searchSegmentTrack"
                    style={{
                        position: "relative",
                        display: "grid",
                        gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
                        alignItems: "stretch",
                        width: "100%",
                        height: 25,
                        border: "1px solid #d0d7de",
                        borderRadius: 10,
                        background: "rgba(246, 248, 250, 0.96)",
                        boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.72), 0 1px 2px rgba(15, 23, 42, 0.04)",
                        overflow: "hidden",
                    }}
                >
                    <span
                        className="searchSegmentThumb"
                        aria-hidden="true"
                        style={{
                            position: "absolute",
                            top: 1,
                            bottom: 1,
                            left: 1,
                            width: `calc((100% - 2px) / ${options.length})`,
                            borderRadius: 9,
                            background: "rgb(8, 109, 177)",
                            border: "1px solid rgb(8, 109, 177)",
                            boxShadow: "0 10px 24px rgba(15, 23, 42, 0.18)",
                            transform: `translateX(${activeIndex * 100}%)`,
                            transition: "transform 240ms cubic-bezier(0.22, 1, 0.36, 1)",
                            willChange: "transform",
                        }}
                    />
                    {options.map((option) => {
                        const isActive = option.value === activeValue;

                        return (
                            <button
                                key={option.value}
                                type="button"
                                className={`searchSegmentButton${isActive ? " searchSegmentButtonActive" : ""}`}
                                aria-pressed={isActive}
                                onClick={() => onSelect(option.value)}
                                style={{
                                    position: "relative",
                                    zIndex: 1,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    minWidth: 0,
                                    minHeight: 25,
                                    border: "none",
                                    borderRadius: 10,
                                    background: "transparent",
                                    boxShadow: "none",
                                    color: isActive ? "#ffffff" : "#59636e",
                                    fontSize: 14,
                                    fontWeight: isActive ? 700 : 600,
                                    padding: "0 14px",
                                    appearance: "none",
                                    WebkitAppearance: "none",
                                    transition: "color 180ms ease",
                                }}
                            >
                                <span className="searchSegmentButtonLabel">{option.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 794, margin: "0 auto", padding: "0 12px", boxSizing: "border-box" }}>
            {mentorDeleteTarget !== undefined && (
                <div
                    aria-label="删除导师确认弹窗遮罩"
                    role="presentation"
                    onClick={closeDeleteMentorDialog}
                    style={{
                        position: "fixed",
                        inset: 0,
                        zIndex: 1100,
                        background: "rgba(15, 23, 42, 0.42)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 20,
                    }}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="delete-mentor-dialog-title"
                        onClick={(event) => event.stopPropagation()}
                        style={{
                            width: "min(100%, 480px)",
                            borderRadius: 20,
                            background: "#ffffff",
                            border: "1px solid #d0d7de",
                            boxShadow: "0 24px 64px rgba(15, 23, 42, 0.24)",
                            padding: 24,
                            display: "flex",
                            flexDirection: "column",
                            gap: 14,
                        }}
                    >
                        <h3 id="delete-mentor-dialog-title" style={{ margin: 0, color: "#1f2328" }}>
                            确认删除导师
                        </h3>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, color: "#1f2328" }}>
                            <p style={{ margin: 0 }}>
                                中文名：{mentorDeleteTarget.Chinese_name}
                            </p>
                            <p style={{ margin: 0 }}>
                                英文名：{mentorDeleteTarget.English_name?.trim() || "暂无英文名"}
                            </p>
                            <p style={{ margin: 0 }}>
                                研究方向：{mentorDeleteTarget.research_direction?.trim() || "暂无研究方向"}
                            </p>
                            <p style={{ margin: 0 }}>
                                邮箱：{mentorDeleteTarget.email?.trim() || "暂无邮箱"}
                            </p>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            <button
                                type="button"
                                onClick={() => void confirmDeleteMentor()}
                                disabled={mentorDeleteSubmitting}
                                style={{
                                    position: "relative",
                                    width: "100%",
                                    minHeight: 44,
                                    borderRadius: 12,
                                    border: mentorDeleteSubmitting ? "none" : "1px solid #cf222e",
                                    background: mentorDeleteSubmitting ? "#cf222e" : "#ffffff",
                                    color: mentorDeleteSubmitting ? "#ffffff" : "#cf222e",
                                    fontWeight: 700,
                                    overflow: "hidden",
                                    transition: "background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease",
                                }}
                                onMouseEnter={(event) => {
                                    if (mentorDeleteSubmitting) {
                                        return;
                                    }

                                    event.currentTarget.style.background = "#cf222e";
                                    event.currentTarget.style.color = "#ffffff";
                                    event.currentTarget.style.border = "none";
                                }}
                                onMouseLeave={(event) => {
                                    if (mentorDeleteSubmitting) {
                                        return;
                                    }

                                    event.currentTarget.style.background = "#ffffff";
                                    event.currentTarget.style.color = "#cf222e";
                                    event.currentTarget.style.border = "1px solid #cf222e";
                                }}
                            >
                                <span>确认删除</span>
                                {mentorDeleteSubmitting && (
                                    <span
                                        aria-hidden="true"
                                        style={{
                                            position: "absolute",
                                            inset: 0,
                                            background: "rgba(255, 255, 255, 0.55)",
                                        }}
                                    />
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={closeDeleteMentorDialog}
                                disabled={mentorDeleteSubmitting}
                                style={{
                                    width: "100%",
                                    minHeight: 44,
                                    borderRadius: 12,
                                    border: "1px solid rgb(209, 217, 224)",
                                    background: "rgb(246, 248, 250)",
                                    color: "rgb(37, 41, 46)",
                                    fontWeight: 600,
                                    boxShadow: "none",
                                }}
                            >
                                取消
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {paperDeleteTarget !== undefined && (
                <div
                    aria-label="删除论文确认弹窗遮罩"
                    role="presentation"
                    onClick={closeDeletePaperDialog}
                    style={{
                        position: "fixed",
                        inset: 0,
                        zIndex: 1100,
                        background: "rgba(15, 23, 42, 0.42)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 20,
                    }}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="delete-paper-dialog-title"
                        onClick={(event) => event.stopPropagation()}
                        style={{
                            width: "min(100%, 480px)",
                            borderRadius: 20,
                            background: "#ffffff",
                            border: "1px solid #d0d7de",
                            boxShadow: "0 24px 64px rgba(15, 23, 42, 0.24)",
                            padding: 24,
                            display: "flex",
                            flexDirection: "column",
                            gap: 14,
                        }}
                    >
                        <h3 id="delete-paper-dialog-title" style={{ margin: 0, color: "#1f2328" }}>
                            确认删除论文
                        </h3>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, color: "#1f2328" }}>
                            <p style={{ margin: 0 }}>
                                标题：{paperDeleteTarget.title}
                            </p>
                            <p style={{ margin: 0 }}>
                                发表日期：{paperDeleteTarget.publish_date?.trim() || "未知"}
                            </p>
                            <p style={{ margin: 0 }}>
                                导师：{paperDeleteTarget.mentorNames.length > 0 ? paperDeleteTarget.mentorNames.join("、") : "未知导师"}
                            </p>
                            <p style={{ margin: 0 }}>
                                分类：{paperDeleteTarget.subjects?.trim() || "暂无分类"}
                            </p>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            <button
                                type="button"
                                onClick={() => void confirmDeletePaper()}
                                disabled={paperDeleteSubmitting}
                                style={{
                                    position: "relative",
                                    width: "100%",
                                    minHeight: 44,
                                    borderRadius: 12,
                                    border: paperDeleteSubmitting ? "none" : "1px solid #cf222e",
                                    background: paperDeleteSubmitting ? "#cf222e" : "#ffffff",
                                    color: paperDeleteSubmitting ? "#ffffff" : "#cf222e",
                                    fontWeight: 700,
                                    overflow: "hidden",
                                    transition: "background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease",
                                }}
                                onMouseEnter={(event) => {
                                    if (paperDeleteSubmitting) {
                                        return;
                                    }

                                    event.currentTarget.style.background = "#cf222e";
                                    event.currentTarget.style.color = "#ffffff";
                                    event.currentTarget.style.border = "none";
                                }}
                                onMouseLeave={(event) => {
                                    if (paperDeleteSubmitting) {
                                        return;
                                    }

                                    event.currentTarget.style.background = "#ffffff";
                                    event.currentTarget.style.color = "#cf222e";
                                    event.currentTarget.style.border = "1px solid #cf222e";
                                }}
                            >
                                <span>确认删除</span>
                                {paperDeleteSubmitting && (
                                    <span
                                        aria-hidden="true"
                                        style={{
                                            position: "absolute",
                                            inset: 0,
                                            background: "rgba(255, 255, 255, 0.55)",
                                        }}
                                    />
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={closeDeletePaperDialog}
                                disabled={paperDeleteSubmitting}
                                style={{
                                    width: "100%",
                                    minHeight: 44,
                                    borderRadius: 12,
                                    border: "1px solid rgb(209, 217, 224)",
                                    background: "rgb(246, 248, 250)",
                                    color: "rgb(37, 41, 46)",
                                    fontWeight: 600,
                                    boxShadow: "none",
                                }}
                            >
                                取消
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <h2
                title={searchHeadingText}
                style={isEmptySearch ? undefined : {
                    maxWidth: 654,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                }}
            >
                {searchHeadingText}
            </h2>

            <div style={{ position: "relative", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <div
                    style={{ position: "relative", flexShrink: 0 }}
                    onMouseEnter={() => setShowSearchLogicHelp(true)}
                    onMouseLeave={() => setShowSearchLogicHelp(false)}
                    onFocus={() => setShowSearchLogicHelp(true)}
                    onBlur={() => setShowSearchLogicHelp(false)}
                >
                    <span
                        aria-label="搜索逻辑说明"
                        tabIndex={0}
                        style={{
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            border: "1px solid #8c959f",
                            color: "#57606a",
                            background: "#ffffff",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 15,
                            fontWeight: 700,
                            lineHeight: 1,
                            flexShrink: 0,
                            cursor: "help",
                            userSelect: "none",
                            outline: "none",
                        }}
                    >
                        ?
                    </span>
                    {showSearchLogicHelp && (
                        <div
                            aria-hidden="true"
                            style={{
                                position: "absolute",
                                left: -20,
                                top: "100%",
                                width: "clamp(280px, 58vw, 380px)",
                                height: 12,
                                background: "transparent",
                                pointerEvents: "auto",
                                zIndex: 19,
                            }}
                        />
                    )}
                    <div
                        role="tooltip"
                        aria-hidden={!showSearchLogicHelp}
                        onMouseEnter={() => setShowSearchLogicHelp(true)}
                        onMouseLeave={() => setShowSearchLogicHelp(false)}
                        style={{
                            position: "absolute",
                            left: -20,
                            top: "calc(100% + 12px)",
                            width: "clamp(280px, 58vw, 380px)",
                            maxWidth: "calc(100vw - 24px)",
                            padding: 14,
                            borderRadius: 14,
                            border: "1px solid #d0d7de",
                            background: "#ffffff",
                            color: "#24292f",
                            boxShadow: "0 18px 42px rgba(15, 23, 42, 0.18)",
                            fontSize: 13,
                            lineHeight: 1.55,
                            zIndex: 20,
                            pointerEvents: showSearchLogicHelp ? "auto" : "none",
                            opacity: showSearchLogicHelp ? 1 : 0,
                            transform: showSearchLogicHelp ? "translateY(0)" : "translateY(4px)",
                            transition: "opacity 160ms ease, transform 160ms ease",
                            whiteSpace: "normal",
                        }}
                    >
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: "#1f2328" }}>搜索语法提示</span>
                                <span style={{ fontSize: 12, color: "#57606a" }}>支持逻辑运算和括号组合，适合做更精确的检索。</span>
                            </div>

                            <div style={{ display: "grid", gap: 8 }}>
                                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                                    <span style={{ minWidth: 54, fontWeight: 700, color: "#0969da" }}>AND</span>
                                    <span style={{ color: "#24292f" }}>使用 <strong>&amp;&amp;</strong>、<strong>&amp;</strong> 或 <strong>且</strong>，表示“同时满足”。</span>
                                </div>
                                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                                    <span style={{ minWidth: 54, fontWeight: 700, color: "#0969da" }}>OR</span>
                                    <span style={{ color: "#24292f" }}>使用 <strong>||</strong>、<strong>|</strong> 或 <strong>或</strong>，表示“满足其一”。</span>
                                </div>
                                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                                    <span style={{ minWidth: 54, fontWeight: 700, color: "#0969da" }}>括号</span>
                                    <span style={{ color: "#24292f" }}>例如 <strong>(A || B) &amp;&amp; C</strong>，可调整优先级。</span>
                                </div>
                            </div>

                            <div style={{ padding: "10px 12px", borderRadius: 12, background: "#f6f8fa", border: "1px solid #d0d7de" }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: "#1f2328", marginBottom: 8 }}>注意</div>
                                <div style={{ display: "grid", gap: 8, color: "#57606a", fontSize: 12, lineHeight: 1.5 }}>
                                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                                        <span style={{ color: "#0969da", fontWeight: 700, minWidth: 14 }}>1.</span>
                                        <span>AND 的优先级高于 OR</span>
                                    </div>
                                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                                        <span style={{ color: "#0969da", fontWeight: 700, minWidth: 14 }}>2.</span>
                                        <span>若括号不匹配，系统会将括号视作关键词的一部分处理</span>
                                    </div>
                                </div>
                                {/* <div style={{ marginTop: 8, color: "#57606a", fontSize: 12 }}>
                                    {SEARCH_LOGIC_HELP_TEXT}
                                </div> */}
                            </div>
                        </div>
                        <span
                            aria-hidden="true"
                            style={{
                                position: "absolute",
                                left: 23,
                                top: -6,
                                width: 12,
                                height: 12,
                                background: "#ffffff",
                                borderLeft: "1px solid #d0d7de",
                                borderTop: "1px solid #d0d7de",
                                transform: "rotate(45deg)",
                                boxShadow: "-3px -3px 8px rgba(15, 23, 42, 0.04)",
                            }}
                        />
                    </div>
                </div>
                <input
                    type="text"
                    value={keyword}
                    placeholder={mode === "mentor" ? "输入导师姓名或研究方向" : (matchMode === "fuzzy" ? "输入论文题目、导师姓名或导师研究方向" : "输入论文题目、论文分类、导师姓名或导师研究方向")}
                    onChange={(e) => setKeyword(e.target.value)}
                    onKeyDown={handleEnter}
                    style={{ flex: "1 1 260px", minWidth: 0 }}
                />
                <button onClick={clearKeyword} disabled={keyword.trim() === "" || loading} style={{ flexShrink: 0 }}>
                    清空
                </button>
                <button
                    onClick={() => {
                        void navigateToSearchState(resolveSearchState({
                            keyword,
                            page: 1,
                        }));
                    }}
                    disabled={keyword.trim() === "" || loading}
                    style={{ flexShrink: 0 }}
                >
                    搜索
                </button>
            </div>

            <div className="searchSegmentRow" aria-label="搜索选项分段控件" style={{ flexWrap: "wrap" }}>
                {renderSegmentedControl("搜索类型", SEARCH_MODE_OPTIONS, mode, switchMode)}
                {renderSegmentedControl("匹配方式", MATCH_MODE_OPTIONS, matchMode, changeMatchMode)}
                {renderSegmentedControl(
                    mode === "paper" ? "论文排序" : "导师筛选",
                    thirdSegmentOptions,
                    thirdSegmentValue,
                    (value) => {
                        if (mode === "paper") {
                            changePaperSortMode(value as SearchPaperSortMode);
                            return;
                        }

                        const nextVisibility = value as MentorResultFilter;
                        if (!hasSearched) {
                            setMentorResultFilter(nextVisibility);
                            return;
                        }

                        void navigateToSearchState(resolveSearchState({
                            keyword,
                            visibility: nextVisibility,
                            page: 1,
                        }));
                    },
                )}
            </div>

            {isAdmin && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, border: "1px solid #ccc", borderRadius: 6, padding: 12 }}>
                    <h3 style={{ margin: 0 }}>管理员操作</h3>
                    <p style={{ margin: 0 }}>
                        当前模式：{mode === "mentor" ? "导师" : "论文"}，可执行新增、修改、删除。
                    </p>

                    {mode === "mentor" ? (
                        <>
                            <input
                                type="text"
                                placeholder="导师中文名"
                                value={mentorDraft.Chinese_name}
                                onChange={(e) => setMentorDraft((prev) => ({ ...prev, Chinese_name: e.target.value }))}
                            />
                            <input
                                type="text"
                                placeholder="导师英文名（可选）"
                                value={mentorDraft.English_name}
                                onChange={(e) => setMentorDraft((prev) => ({ ...prev, English_name: e.target.value }))}
                            />
                            <input
                                type="text"
                                placeholder="研究方向"
                                value={mentorDraft.research_direction}
                                onChange={(e) => setMentorDraft((prev) => ({ ...prev, research_direction: e.target.value }))}
                            />
                            <input
                                type="text"
                                placeholder="邮箱（可选）"
                                value={mentorDraft.email}
                                onChange={(e) => setMentorDraft((prev) => ({ ...prev, email: e.target.value }))}
                            />
                            <input
                                type="text"
                                placeholder="导师画像（可选）"
                                value={mentorDraft.profile}
                                onChange={(e) => setMentorDraft((prev) => ({ ...prev, profile: e.target.value }))}
                            />
                            <div style={{ display: "flex", gap: 8 }}>
                                <button onClick={() => void saveMentor()} disabled={adminSaving}>
                                    {mentorEditingId === undefined ? "新增导师" : "保存导师修改"}
                                </button>
                                {mentorEditingId !== undefined && (
                                    <button
                                        onClick={() => {
                                            setMentorEditingId(undefined);
                                            setMentorDraft({
                                                Chinese_name: "",
                                                English_name: "",
                                                research_direction: "",
                                                email: "",
                                                profile: "",
                                            });
                                        }}
                                        disabled={adminSaving}
                                    >
                                        取消编辑
                                    </button>
                                )}
                            </div>
                        </>
                    ) : (
                        <>
                            <input
                                type="text"
                                placeholder="论文标题"
                                value={paperDraft.title}
                                onChange={(e) => setPaperDraft((prev) => ({ ...prev, title: e.target.value }))}
                            />
                            <input
                                type="date"
                                value={paperDraft.publish_date}
                                onChange={(e) => setPaperDraft((prev) => ({ ...prev, publish_date: e.target.value }))}
                            />
                            <input
                                type="text"
                                placeholder="作者名单（逗号分隔）"
                                value={paperDraft.author_names}
                                onChange={(e) => setPaperDraft((prev) => ({ ...prev, author_names: e.target.value }))}
                            />
                            <textarea
                                placeholder="摘要（可选）"
                                value={paperDraft.abstract}
                                onChange={(e) => setPaperDraft((prev) => ({ ...prev, abstract: e.target.value }))}
                                style={{ minHeight: 80 }}
                            />
                            <div style={{ display: "flex", gap: 8 }}>
                                <button onClick={() => void savePaper()} disabled={adminSaving}>
                                    {paperEditingId === undefined ? "新增论文" : "保存论文修改"}
                                </button>
                                {paperEditingId !== undefined && (
                                    <button
                                        onClick={() => {
                                            setPaperEditingId(undefined);
                                            setPaperDraft({
                                                title: "",
                                                abstract: "",
                                                publish_date: "",
                                                author_names: "",
                                            });
                                        }}
                                        disabled={adminSaving}
                                    >
                                        取消编辑
                                    </button>
                                )}
                            </div>
                        </>
                    )}

                    {adminMessage !== "" && (
                        <p style={{ margin: 0 }}>{adminMessage}</p>
                    )}
                </div>
            )}

            {errorMessage !== "" && (
                <div style={{ padding: 12, border: "1px solid #f1aeb5", backgroundColor: "#f8d7da" }}>
                    {errorMessage}
                </div>
            )}

            {mode === "mentor" && mentorResultFilter === "mine" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, border: "1px solid #ccc", borderRadius: 6, padding: 12 }}>
                    {!isLoggedIn ? (
                        <span>仅登录用户才能添加私有导师</span>
                    ) : (
                        <>
                            <div style={{ display: "flex", gap: 8 }}>
                                <input
                                    type="text"
                                    placeholder="导师中文名（可选）"
                                    value={customMentorChineseName}
                                    onChange={(e) => setCustomMentorChineseName(e.target.value)}
                                    disabled={privateMentorSaving}
                                    style={{ flex: 1 }}
                                />
                                <input
                                    type="text"
                                    placeholder="导师英文名（可选）"
                                    value={customMentorEnglishName}
                                    onChange={(e) => setCustomMentorEnglishName(e.target.value)}
                                    disabled={privateMentorSaving}
                                    style={{ flex: 1 }}
                                />
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                                <button
                                    onClick={() => void addPrivateMentorInSearch()}
                                    disabled={
                                        privateMentorSaving ||
                                        privateMentors.length >= 10 ||
                                        (customMentorChineseName.trim() === "" && customMentorEnglishName.trim() === "")
                                    }
                                >
                                    {privateMentorSaving ? "添加中..." : "添加私有导师"}
                                </button>
                            </div>
                            {privateMentors.length >= 10 && (
                                <p style={{ margin: 0, color: "#cf222e", fontSize: 13 }}>私有导师数量已达上限（10位），请先删除部分私有导师后再添加。</p>
                            )}
                            {privateMentorMsg !== "" && (
                                <p
                                    style={{
                                        margin: 0,
                                        fontSize: 13,
                                        color: privateMentorMsg === "私有导师添加成功" ? undefined : "#cf222e",
                                    }}
                                >
                                    {privateMentorMsg}
                                </p>
                            )}
                        </>
                    )}
                </div>
            )}

            {mode === "mentor" && mentors.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                            padding: 12,
                            flexWrap: "wrap",
                        }}
                    >
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            loading={loading}
                            centered
                            controlHeight={33.77}
                            jumpInputWidth={120}
                            activePageHighlightColor="rgb(8, 109, 177)"
                            onPageChange={(newPage) => {
                                void navigateToSearchState(resolveSearchState({ page: newPage }));
                            }}
                        />
                    </div>

                    {mentors.length === 0 && (
                        <div style={{ padding: 12, border: "1px dashed #ccc" }}>
                            当前筛选条件下没有导师结果。
                        </div>
                    )}

                    {mentors.map((mentor) => {
                        const isExpanded = expandedMentorIds.has(mentor.id);
                        const profileText = mentor.profile || "暂无导师画像";
                        const profilePreview = profileText.length > PROFILE_PREVIEW_LENGTH
                            ? `${profileText.slice(0, PROFILE_PREVIEW_LENGTH)}...`
                            : profileText;
                        const visiblePaperTitles = isExpanded
                            ? mentor.paperTitles
                            : mentor.paperTitles.slice(0, PAPER_TITLES_PREVIEW_COUNT);
                        const hasMoreDetails = profileText.length > PROFILE_PREVIEW_LENGTH || mentor.paperTitles.length > PAPER_TITLES_PREVIEW_COUNT;

                        return (
                        <div
                            key={mentor.id}
                            style={{ position: "relative", padding: 12, border: "1px solid #ccc", borderRadius: 6 }}
                        >
                            {isLoggedIn && privateMentorIdSet.has(mentor.id) && (
                                <button
                                    onClick={() => openDeleteMentorDialog(mentor)}
                                    disabled={adminSaving}
                                    style={{
                                        position: "absolute",
                                        top: 8,
                                        right: 8,
                                        border: "1px solid #cf222e",
                                        borderRadius: 8,
                                        background: "#ffffff",
                                        color: "#cf222e",
                                        fontWeight: 600,
                                        padding: "4px 12px",
                                    }}
                                >
                                    删除
                                </button>
                            )}
                            <h3 style={{ margin: "0 0 8px", fontSize: "20px" }}>
                                <Link href={`/mentors/${mentor.id}`} className="searchMentorNameLink">
                                    {mentor.Chinese_name}
                                </Link>
                                {privateMentorIdSet.has(mentor.id) && (
                                    <span aria-hidden="true" style={{ marginLeft: 8, fontSize: 12, color: "#555" }}>我的私有导师</span>
                                )}
                            </h3>
                            {mentor.English_name && (
                                <p className="searchMentorMetaRow">
                                    <img
                                        src="/English_Name.ico"
                                        alt=""
                                        aria-hidden="true"
                                        className="searchMentorMetaIcon"
                                    />
                                    <span className="searchMentorMetaSrOnly">英文名</span>
                                    <span className="searchMentorMetaText">{mentor.English_name}</span>
                                </p>
                            )}
                            <p className="searchMentorMetaRow">
                                <img
                                    src="/Reseach_Direction.ico"
                                    alt=""
                                    aria-hidden="true"
                                    className="searchMentorMetaIcon"
                                />
                                <span className="searchMentorMetaSrOnly">研究方向</span>
                                <span className="searchMentorMetaText">{mentor.research_direction || "暂无研究方向"}</span>
                            </p>
                            <p className="searchMentorMetaRow">
                                <img
                                    src="/Email.ico"
                                    alt=""
                                    aria-hidden="true"
                                    className="searchMentorMetaIcon"
                                />
                                <span className="searchMentorMetaSrOnly">邮箱</span>
                                <span className="searchMentorMetaText">{mentor.email || "暂无邮箱"}</span>
                            </p>
                            <p className="searchMentorMetaRow">
                                <img
                                    src="/Mentor_Profile.ico"
                                    alt=""
                                    aria-hidden="true"
                                    className="searchMentorMetaIcon"
                                />
                                <span className="searchMentorMetaSrOnly">导师画像</span>
                                <span className="searchMentorMetaText">{isExpanded ? profileText : profilePreview}</span>
                            </p>
                            <p style={{ margin: "8px 0 4px", fontSize: "14px" }}>相关论文：</p>
                            <ul style={{ margin: 0, paddingLeft: 0, fontSize: "14px", listStyle: "none" }}>
                                {visiblePaperTitles.map((title) => (
                                    <li key={title}>
                                        <button
                                            type="button"
                                            onClick={() => searchPaperByTitle(title)}
                                            className="searchMentorPaperLinkButton"
                                        >
                                            <img
                                                src="/arxiv.ico"
                                                alt=""
                                                aria-hidden="true"
                                                className="searchMentorPaperLinkIcon"
                                            />
                                            <span className="searchMentorPaperLinkText">
                                                <LatexText text={title} forceInlineMath />
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                            {hasMoreDetails && (
                                <button
                                    onClick={() => toggleMentorExpand(mentor.id)}
                                    style={{ marginTop: 8, fontSize: "14px" }}
                                >
                                    {isExpanded ? "收起" : "查看更多"}
                                </button>
                            )}
                            {isAdmin && (
                                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                    <button onClick={() => beginEditMentor(mentor)} disabled={adminSaving}>修改导师</button>
                                    <button onClick={() => openDeleteMentorDialog(mentor)} disabled={adminSaving}>删除导师</button>
                                </div>
                            )}
                        </div>
                        );
                    })}

                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        loading={loading}
                        centered
                        controlHeight={33.77}
                        jumpInputWidth={120}
                        activePageHighlightColor="rgb(8, 109, 177)"
                        onPageChange={(newPage) => {
                            void navigateToSearchState(resolveSearchState({ page: newPage }));
                        }}
                    />
                </div>
            )}

            {mode === "paper" && papers.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                            padding: 12,
                            flexWrap: "wrap",
                        }}
                    >
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            loading={loading}
                            centered
                            controlHeight={33.77}
                            jumpInputWidth={120}
                            activePageHighlightColor="rgb(8, 109, 177)"
                            onPageChange={(newPage) => {
                                void navigateToSearchState(resolveSearchState({ page: newPage }));
                            }}
                        />
                    </div>

                    {papers.map((paper) => {
                        const subjectTags = parseTimelineLikeSubjects(paper.subjects);

                        return (
                            <article
                                key={paper.id}
                                style={{
                                    position: "relative",
                                    padding: 16,
                                    border: "1px solid #ccc",
                                    borderRadius: 8,
                                    backgroundColor: "#fff",
                                }}
                            >
                                <div className="searchTimelinePaperHeaderRow">
                                    <div className="searchTimelinePaperDate">
                                        {paper.publish_date || "未知日期"}
                                    </div>
                                    {paper.arxiv_url && (
                                        <div className="searchTimelinePaperLinks" aria-label="论文外部链接">
                                            <span>[</span>
                                            <a href={paper.arxiv_url} target="_blank" rel="noreferrer">
                                                arxiv
                                            </a>
                                            <span>, </span>
                                            <a href={buildTimelineLikePdfUrl(paper.arxiv_url)} target="_blank" rel="noreferrer">
                                                pdf
                                            </a>
                                            <span>]</span>
                                        </div>
                                    )}
                                    {subjectTags.length > 0 && (
                                        <div className="searchTimelineSubjectTags" aria-label="论文学科分类">
                                            {subjectTags.map((subject) => (
                                                <span key={subject} className="searchTimelineSubjectTag">
                                                    {subject}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <h3 style={{ margin: "0 0 8px", fontSize: "17.5px" }}>
                                    <LatexText text={paper.title} forceInlineMath />
                                </h3>
                                <div className="timelineMetaRow">
                                    <span className="timelineMetaLabel">作者：</span>
                                    <div className="timelineMetaContent">
                                        {(() => {
                                            const names = (paper.author_names || "").split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
                                            const mentorIds = Array.isArray(paper.mentor_ids) ? paper.mentor_ids : [];
                                            if (names.length === 0) {
                                                return "未知";
                                            }

                                            return names.map((name, idx) => {
                                                const mentorId = mentorIds[idx];
                                                const isMentor = typeof mentorId === "number" && mentorId > 0;
                                                const separator = idx === names.length - 1 ? "" : "、";
                                                if (isMentor) {
                                                    return (
                                                        <span key={`${name}-${idx}`}>
                                                            <button
                                                                type="button"
                                                                onClick={() => searchMentorByName(name)}
                                                                className="searchTimelineMentorButton"
                                                            >
                                                                <img
                                                                    src="/favicon_tsinghua.ico"
                                                                    alt="清华导师"
                                                                    className="searchTimelineMentorIcon"
                                                                />
                                                                {name}
                                                            </button>
                                                            {separator}
                                                        </span>
                                                    );
                                                }

                                                return (
                                                    <span key={`${name}-${idx}`}>
                                                        {name}
                                                        {separator}
                                                    </span>
                                                );
                                            });
                                        })()}
                                    </div>
                                </div>
                                <div className="timelineMetaRow">
                                    <span className="timelineMetaLabel">摘要：</span>
                                    <div className="timelineMetaContent timelineAbstractContent searchPaperAbstractContent">
                                        <LatexText text={paper.abstract || "暂无摘要"} />
                                    </div>
                                </div>
                                {isAdmin && (
                                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                        <button onClick={() => beginEditPaper(paper)} disabled={adminSaving}>修改论文</button>
                                        <button onClick={() => openDeletePaperDialog(paper)} disabled={adminSaving}>删除论文</button>
                                    </div>
                                )}
                            </article>
                        );
                    })}

                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        loading={loading}
                        centered
                        controlHeight={33.77}
                        jumpInputWidth={120}
                        activePageHighlightColor="rgb(8, 109, 177)"
                        onPageChange={(newPage) => {
                            void navigateToSearchState(resolveSearchState({ page: newPage }));
                        }}
                    />
                </div>
            )}

            {hasSearched && !loading && errorMessage === "" && mode === "mentor" && mentors.length === 0 && (
                <div style={{ padding: 12, border: "1px dashed #ccc" }}>
                    未找到匹配的导师结果（当前为{matchMode === "exact" ? "精确" : "模糊"}搜索）。
                </div>
            )}

            {hasSearched && !loading && errorMessage === "" && mode === "paper" && papers.length === 0 && (
                <div style={{ padding: 12, border: "1px dashed #ccc" }}>
                    未找到匹配的论文结果（当前为{matchMode === "exact" ? "精确" : "模糊"}搜索）。
                </div>
            )}

            <style jsx>{`
                .searchSegmentRow {
                    display: flex;
                    gap: 12px;
                    width: 100%;
                    overflow-x: auto;
                    padding: 4px 2px 8px;
                    scrollbar-width: thin;
                    -webkit-overflow-scrolling: touch;
                }

                .searchSegmentGroup {
                    min-width: 0;
                }

                .searchSegmentButton {
                    transform: none;
                }

                .searchSegmentButton:focus-visible {
                    outline: 2px solid rgba(47, 129, 247, 0.35);
                    outline-offset: -2px;
                }

                .searchSegmentButtonLabel {
                    display: block;
                    width: 100%;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                :global(a.searchMentorNameLink) {
                    color: #000000;
                    text-decoration: none;
                    transition: color 0.16s ease;
                }

                :global(a.searchMentorNameLink:hover),
                :global(a.searchMentorNameLink:focus-visible) {
                    color: rgb(8, 109, 177);
                    text-decoration: none;
                    outline: none;
                }

                .searchMentorMetaRow {
                    display: flex;
                    align-items: flex-start;
                    gap: 6px;
                    margin: 4px 0;
                    font-size: 14px;
                }

                .searchMentorMetaIcon {
                    width: 16px;
                    height: 16px;
                    object-fit: contain;
                    display: block;
                    flex: 0 0 auto;
                    margin-top: 1px;
                }

                .searchMentorMetaText {
                    min-width: 0;
                    white-space: normal;
                    word-break: break-word;
                }

                .searchMentorMetaSrOnly {
                    position: absolute;
                    width: 1px;
                    height: 1px;
                    padding: 0;
                    margin: -1px;
                    overflow: hidden;
                    clip: rect(0, 0, 0, 0);
                    white-space: nowrap;
                    border: 0;
                }

                .searchTimelinePaperHeaderRow {
                    display: flex;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 10px;
                    margin-bottom: 8px;
                    font-size: 13px;
                    color: #666;
                }

                .searchTimelinePaperDate {
                    color: #666;
                }

                .searchTimelinePaperLinks {
                    color: rgb(45, 45, 45);
                    font-size: 14px;
                    line-height: 1.4;
                }

                .searchTimelinePaperLinks a {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    height: 20px;
                    color: rgb(8, 109, 177);
                    text-decoration: none;
                    transition: color 0.16s ease, border-color 0.16s ease;
                    border-bottom: 1px dashed transparent;
                    line-height: 1;
                    vertical-align: middle;
                }

                .searchTimelinePaperLinks a:hover,
                .searchTimelinePaperLinks a:focus-visible,
                :global(button.searchTimelineMentorButton:hover),
                :global(button.searchTimelineMentorButton:focus-visible) {
                    color: rgb(45, 45, 45);
                    border-bottom-color: rgb(45, 45, 45);
                    outline: none;
                }

                .searchTimelineSubjectTags {
                    display: inline-flex;
                    flex-wrap: wrap;
                    gap: 10px;
                }

                .searchTimelineSubjectTag {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    box-sizing: border-box;
                    min-height: 17.5px;
                    padding: 0 8.925px;
                    border-radius: 4px;
                    background-color: rgb(8, 109, 177);
                    color: rgb(255, 255, 255);
                    font-size: 11.9px;
                    font-style: normal;
                    font-weight: 400;
                    line-height: 17.85px;
                    text-rendering: optimizelegibility;
                    white-space: nowrap;
                }

                :global(.timelineMetaRow) {
                    font-size: 14px;
                }

                :global(.timelineMetaLabel),
                :global(.timelineMetaContent) {
                    font-size: 14px;
                }

                :global(button.searchTimelineMentorButton) {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    height: 20px;
                    border: none;
                    background: transparent;
                    padding: 0;
                    color: rgb(8, 109, 177);
                    text-decoration: none;
                    transition: color 0.16s ease, border-color 0.16s ease;
                    border-bottom: 1px dashed transparent;
                    line-height: 1;
                    vertical-align: middle;
                    cursor: pointer;
                    font: inherit;
                }

                :global(button.searchMentorPaperLinkButton) {
                    display: inline-flex;
                    align-items: flex-start;
                    gap: 6px;
                    border: none;
                    background: transparent;
                    padding: 0;
                    color: rgb(8, 109, 177);
                    transition: color 0.16s ease;
                    cursor: pointer;
                    font: inherit;
                    text-align: left;
                    white-space: normal;
                }

                :global(button.searchMentorPaperLinkButton:hover),
                :global(button.searchMentorPaperLinkButton:focus-visible) {
                    color: rgb(45, 45, 45);
                    outline: none;
                }

                :global(span.searchMentorPaperLinkText) {
                    color: inherit;
                    text-decoration: none;
                    text-decoration-thickness: 1px;
                    text-underline-offset: 2px;
                    text-decoration-color: transparent;
                    transition: text-decoration-color 0.16s ease;
                }

                :global(button.searchMentorPaperLinkButton:hover span.searchMentorPaperLinkText),
                :global(button.searchMentorPaperLinkButton:focus-visible span.searchMentorPaperLinkText) {
                    text-decoration-line: underline;
                    text-decoration-style: dashed;
                    text-decoration-color: currentColor;
                }

                :global(img.searchTimelineMentorIcon) {
                    width: 14px;
                    height: 14px;
                    object-fit: contain;
                    display: block;
                    flex: 0 0 auto;
                }

                :global(img.searchMentorPaperLinkIcon) {
                    width: 16px;
                    height: 16px;
                    object-fit: contain;
                    display: block;
                    flex: 0 0 auto;
                    margin-top: 1px;
                }

                @media (max-width: 820px) {
                    .searchSegmentRow {
                        width: calc(100% + 4px);
                    }
                }
            `}</style>
        </div>
    );
};

export default SearchScreen;
