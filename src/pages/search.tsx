import { KeyboardEvent, useCallback, useEffect, useMemo, useState } from "react";
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
    SearchMode,
    SearchPaperSortMode,
} from "../utils/searchQuery";
import { PrivateMentorResult, SearchMentorResult, SearchPaperResult } from "../utils/types";
type MentorResultFilter = "all" | "mine" | "public";

const PROFILE_PREVIEW_LENGTH = 100;     // 导师画像预览长度
const PAPER_TITLES_PREVIEW_COUNT = 7;   // 导师相关论文标题预览数量，超过后显示“查看更多”按钮展开完整列表

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

interface SearchOptions {
    keyword?: string;
    mode?: SearchMode;
    searchMode?: SearchMatchMode;
    sortMode?: SearchPaperSortMode;
    page?: number;
    shouldSyncUrl?: boolean;
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

const SearchScreen = () => {
    const router = useRouter();
    const authToken = useSelector((state: RootState) => state.auth.token);
    const authRole = useSelector((state: RootState) => state.auth.role);
    const isLoggedIn = authToken.trim() !== "";
    const isAdmin = authRole === "admin";

    const [mode, setMode] = useState<SearchMode>("mentor");
    const [matchMode, setMatchMode] = useState<SearchMatchMode>("exact");
    const [paperSortMode, setPaperSortMode] = useState<SearchPaperSortMode>("default");
    const [keyword, setKeyword] = useState("");
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [mentors, setMentors] = useState<SearchMentorResult[]>([]);
    const [papers, setPapers] = useState<SearchPaperResult[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalResults, setTotalResults] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [hasPreviousPage, setHasPreviousPage] = useState(false);
    const [hasNextPage, setHasNextPage] = useState(false);
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
    const [didInitFromQuery, setDidInitFromQuery] = useState(false);

    const resetResults = () => {
        setErrorMessage("");
        setMentors([]);
        setPapers([]);
        setExpandedMentorIds(new Set());
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

    const syncSearchUrl = (
        nextKeyword: string,
        nextMode: SearchMode,
        nextSearchMode: SearchMatchMode,
        nextSortMode: SearchPaperSortMode,
        nextPage: number,
    ) => {
        void router.replace(
            buildSearchUrl({
                keyword: nextKeyword,
                mode: nextMode,
                searchMode: nextSearchMode,
                sortMode: nextSortMode,
                page: nextPage,
            }),
            undefined,
            { shallow: true },
        );
    };

    const switchMode = (nextMode: SearchMode) => {
        const trimmedKeyword = keyword.trim();

        setMode(nextMode);
        if (trimmedKeyword === "") {
            setHasSearched(false);
        }
        resetResults();
        setAdminMessage("");
        if (nextMode === "paper") {
            setMentorResultFilter("all");
        }

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

        if (trimmedKeyword === "") {
            void search({
                keyword: "",
                mode: nextMode,
                sortMode: paperSortMode,
                page: 1,
                shouldSyncUrl: true,
            });
            return;
        }

        if (hasSearched) {
            void search({
                mode: nextMode,
                page: 1,
                shouldSyncUrl: true,
            });
        }
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

    const privateMentorIdSet = useMemo(() => {
        return new Set(privateMentors.map((mentor) => mentor.id));
    }, [privateMentors]);

    const mentorResultTotalMineCount = useMemo(() => {
        const kw = keyword.trim().toLowerCase();
        if (kw === "") {
            return privateMentors.length;
        }
        if (matchMode === "exact") {
            return privateMentors.filter((m) =>
                m.Chinese_name.toLowerCase() === kw ||
                (m.English_name || "").toLowerCase() === kw ||
                (m.research_direction || "").toLowerCase() === kw ||
                (m.profile || "").toLowerCase() === kw
            ).length;
        }
        return privateMentors.filter((m) =>
            m.Chinese_name.toLowerCase().includes(kw) ||
            (m.English_name || "").toLowerCase().includes(kw) ||
            (m.research_direction || "").toLowerCase().includes(kw) ||
            (m.profile || "").toLowerCase().includes(kw)
        ).length;
    }, [privateMentors, keyword, matchMode]);

    const visibleMentorResults = useMemo(() => {
        if (mentorResultFilter === "mine") {
            return mentors.filter((mentor) => privateMentorIdSet.has(mentor.id));
        }

        if (mentorResultFilter === "public") {
            return mentors.filter((mentor) => !privateMentorIdSet.has(mentor.id));
        }

        return mentors;
    }, [mentors, mentorResultFilter, privateMentorIdSet]);

    const search = async ({
        keyword: overrideKeyword,
        mode: overrideMode,
        searchMode: overrideSearchMode,
        sortMode: overrideSortMode,
        page: overridePage,
        shouldSyncUrl = true,
    }: SearchOptions = {}) => {
        const trimmedKeyword = (overrideKeyword ?? keyword).trim();
        const resolvedMode = overrideMode ?? mode;
        const resolvedSearchMode = overrideSearchMode ?? matchMode;
        const resolvedPaperSortMode = overrideSortMode ?? paperSortMode;
        const requestedPage = Math.max(1, overridePage ?? 1);
        const pageQuery = requestedPage > 1 ? `&page=${requestedPage}` : "";

        setKeyword(trimmedKeyword);
        setMode(resolvedMode);
        setMatchMode(resolvedSearchMode);
        setPaperSortMode(resolvedPaperSortMode);
        setLoading(true);
        setHasSearched(true);
        setErrorMessage("");

        if (shouldSyncUrl) {
            syncSearchUrl(
                trimmedKeyword,
                resolvedMode,
                resolvedSearchMode,
                resolvedPaperSortMode,
                requestedPage,
            );
        }

        try {
            const query = `keyword=${encodeURIComponent(trimmedKeyword)}&search_mode=${resolvedSearchMode}`;

            if (resolvedMode === "mentor") {
                const res = await request<SearchMentorsResponse>(
                    `/api/search/mentors?${query}${pageQuery}`,
                    "GET",
                    isLoggedIn,
                );
                const mentorItems = Array.isArray(res.mentors) ? res.mentors : [];
                setMentors(mentorItems);
                setPapers([]);
                applyPagination(res, mentorItems.length, requestedPage);
            }
            else {
                const res = await request<SearchPapersResponse>(
                    `/api/search/papers?${query}&sort_mode=${resolvedPaperSortMode}${pageQuery}`,
                    "GET",
                    isLoggedIn,
                );
                const paperItems = Array.isArray(res.papers) ? res.papers : [];
                setPapers(paperItems);
                setMentors([]);
                applyPagination(res, paperItems.length, requestedPage);
            }
        }
        catch (err) {
            resetResults();
            setErrorMessage(FAILURE_PREFIX + String(err));
        }
        finally {
            setLoading(false);
        }
    };

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
            void search({ page: 1, shouldSyncUrl: true });
            setPrivateMentorMsg("私有导师添加成功");
        }
        catch (err) {
            if (isNetworkErrorInstance(err)) {
                setPrivateMentorMsg(String(err));
            }
            else {
                setPrivateMentorMsg(FAILURE_PREFIX + String(err));
            }
        }
        finally {
            setPrivateMentorSaving(false);
        }
    }, [customMentorChineseName, customMentorEnglishName, privateMentors.length, fetchMyPrivateMentors, search]);

    useEffect(() => {
        if (!router.isReady || didInitFromQuery) {
            return;
        }

        const { hasAnySearchParam, state } = parseSearchQuery(router.query);
        setDidInitFromQuery(true);

        if (hasAnySearchParam) {
            void search({
                keyword: state.keyword,
                mode: state.mode,
                searchMode: state.searchMode,
                sortMode: state.sortMode,
                page: state.page,
                shouldSyncUrl: false,
            });
            return;
        }

        void search({
            keyword: DEFAULT_SEARCH_QUERY_STATE.keyword,
            mode: DEFAULT_SEARCH_QUERY_STATE.mode,
            searchMode: DEFAULT_SEARCH_QUERY_STATE.searchMode,
            sortMode: DEFAULT_SEARCH_QUERY_STATE.sortMode,
            page: DEFAULT_SEARCH_QUERY_STATE.page,
            shouldSyncUrl: false,
        });
    }, [didInitFromQuery, router.isReady, router.query]);

    const changePaperSortMode = (nextSortMode: SearchPaperSortMode) => {
        if (paperSortMode === nextSortMode) {
            return;
        }

        setPaperSortMode(nextSortMode);

        if (mode === "paper" && hasSearched) {
            void search({
                sortMode: nextSortMode,
                page: 1,
                shouldSyncUrl: true,
            });
        }
    };

    const changeMatchMode = (nextMatchMode: SearchMatchMode) => {
        if (matchMode === nextMatchMode) {
            return;
        }

        setMatchMode(nextMatchMode);

        if (hasSearched) {
            void search({
                searchMode: nextMatchMode,
                page: 1,
                shouldSyncUrl: true,
            });
        }
    };

    const gotoPreviousPage = () => {
        if (loading || !hasPreviousPage) {
            return;
        }
        void search({
            page: currentPage - 1,
            shouldSyncUrl: true,
        });
    };

    const gotoNextPage = () => {
        if (loading || !hasNextPage) {
            return;
        }
        void search({
            page: currentPage + 1,
            shouldSyncUrl: true,
        });
    };

    const handleEnter = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
            void search({
                page: 1,
                shouldSyncUrl: true,
            });
        }
    };

    const clearKeyword = () => {
        setKeyword("");
        void search({
            keyword: "",
            page: 1,
            shouldSyncUrl: true,
        });
    };

    const searchPaperByTitle = (paperTitle: string) => {
        setMode("paper");
        setMatchMode("exact");
        setKeyword(paperTitle);
        setPaperSortMode("default");
        void search({
            keyword: paperTitle,
            sortMode: "default",
            page: 1,
            mode: "paper",
            searchMode: "exact",
        });
    };

    const searchMentorByName = (mentorName: string) => {
        setMode("mentor");
        setMatchMode("exact");
        setKeyword(mentorName);
        void search({
            keyword: mentorName,
            page: 1,
            mode: "mentor",
            searchMode: "exact",
        });
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
                await search();
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

            if (mode === "mentor" && hasSearched) {
                await search();
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
                await search();
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
                await search();
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

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 720 }}>
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
            <h2>信息检索</h2>
            <p>输入关键词，按导师姓名或论文相关信息进行搜索。</p>

            <div>
                <button onClick={() => router.push("/")}>
                    返回主页
                </button>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
                <button
                    onClick={() => switchMode("mentor")}
                    disabled={mode === "mentor"}
                >
                    搜人
                </button>
                <button
                    onClick={() => switchMode("paper")}
                    disabled={mode === "paper"}
                >
                    搜论文
                </button>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
                <button
                    onClick={() => changeMatchMode("exact")}
                    disabled={matchMode === "exact"}
                >
                    精确搜索
                </button>
                <button
                    onClick={() => changeMatchMode("fuzzy")}
                    disabled={matchMode === "fuzzy"}
                >
                    模糊搜索
                </button>
            </div>

            {mode === "paper" && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                        onClick={() => changePaperSortMode("default")}
                        disabled={paperSortMode === "default"}
                    >
                        默认排序
                    </button>
                    <button
                        onClick={() => changePaperSortMode("early")}
                        disabled={paperSortMode === "early"}
                    >
                        发表时间从早到晚
                    </button>
                    <button
                        onClick={() => changePaperSortMode("late")}
                        disabled={paperSortMode === "late"}
                    >
                        发表时间从晚到早
                    </button>
                </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
                <input
                    type="text"
                    value={keyword}
                    placeholder={mode === "mentor" ? "输入导师姓名或研究方向" : (matchMode === "fuzzy" ? "输入论文题目、导师姓名或导师研究方向" : "输入论文题目、论文分类、导师姓名或导师研究方向")}
                    onChange={(e) => setKeyword(e.target.value)}
                    onKeyDown={handleEnter}
                    style={{ flex: 1 }}
                />
                <button onClick={clearKeyword} disabled={keyword.trim() === "" || loading}>
                    清空
                </button>
                <button onClick={() => void search()} disabled={keyword.trim() === "" || loading}>
                    {loading ? "搜索中..." : "搜索"}
                </button>
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

            {mode === "mentor" && mentors.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                            onClick={() => setMentorResultFilter("all")}
                            disabled={mentorResultFilter === "all"}
                        >
                            全部导师（{totalResults}）
                        </button>
                        <button
                            onClick={() => setMentorResultFilter("mine")}
                            disabled={mentorResultFilter === "mine"}
                        >
                            仅我的私有导师（{mentorResultTotalMineCount}）
                        </button>
                        <button
                            onClick={() => setMentorResultFilter("public")}
                            disabled={mentorResultFilter === "public"}
                        >
                            仅公共导师（{Math.max(0, totalResults - mentorResultTotalMineCount)}）
                        </button>
                    </div>

                    {mentorResultFilter === "mine" && (
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
                                    {privateMentorMsg !== "" && <span>{privateMentorMsg}</span>}
                                </>
                            )}
                        </div>
                    )}

                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                            padding: 12,
                            border: "1px solid #ccc",
                            borderRadius: 6,
                            flexWrap: "wrap",
                        }}
                    >
                        <span>共 {totalResults} 条结果，第 {currentPage} / {Math.max(totalPages, 1)} 页</span>
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            loading={loading}
                            onPageChange={(newPage) => { void search({ page: newPage, shouldSyncUrl: true }); }}
                        />
                    </div>

                    {visibleMentorResults.length === 0 && (
                        <div style={{ padding: 12, border: "1px dashed #ccc" }}>
                            当前筛选条件下没有导师结果。
                        </div>
                    )}

                    {visibleMentorResults.map((mentor) => {
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
                            style={{ padding: 12, border: "1px solid #ccc", borderRadius: 6 }}
                        >
                            <h3 style={{ margin: "0 0 8px" }}>
                                {mentor.Chinese_name}
                                {privateMentorIdSet.has(mentor.id) && (
                                    <span style={{ marginLeft: 8, fontSize: 12, color: "#555" }}>我的私有导师</span>
                                )}
                            </h3>
                            {mentor.English_name && (
                                <p style={{ margin: "4px 0" }}>英文名：{mentor.English_name}</p>
                            )}
                            <p style={{ margin: "4px 0" }}>
                                研究方向：{mentor.research_direction || "暂无研究方向"}
                            </p>
                            <p style={{ margin: "4px 0" }}>邮箱：{mentor.email || "暂无邮箱"}</p>
                            <p style={{ margin: "4px 0" }}>导师画像：{isExpanded ? profileText : profilePreview}</p>
                            <button onClick={() => router.push(`/mentors/${mentor.id}`)}>
                                查看导师主页
                            </button>
                            <p style={{ margin: "8px 0 4px" }}>相关论文：</p>
                            <ul style={{ margin: 0, paddingLeft: 20 }}>
                                {visiblePaperTitles.map((title) => (
                                    <li key={title}>
                                        <button
                                            type="button"
                                            onClick={() => searchPaperByTitle(title)}
                                            style={{
                                                border: "none",
                                                background: "transparent",
                                                padding: 0,
                                                color: "#0070f3",
                                                textDecoration: "underline",
                                                cursor: "pointer",
                                                font: "inherit",
                                            }}
                                        >
                                            {title}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                            {hasMoreDetails && (
                                <button
                                    onClick={() => toggleMentorExpand(mentor.id)}
                                    style={{ marginTop: 8 }}
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
                        onPageChange={(newPage) => { void search({ page: newPage, shouldSyncUrl: true }); }}
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
                            border: "1px solid #ccc",
                            borderRadius: 6,
                            flexWrap: "wrap",
                        }}
                    >
                        <span>共 {totalResults} 条结果，第 {currentPage} / {Math.max(totalPages, 1)} 页</span>
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            loading={loading}
                            onPageChange={(newPage) => { void search({ page: newPage, shouldSyncUrl: true }); }}
                        />
                    </div>

                    {papers.map((paper) => (
                        <div
                            key={paper.id}
                            style={{ padding: 12, border: "1px solid #ccc", borderRadius: 6 }}
                        >
                            <h3 style={{ margin: "0 0 8px" }}>
                                <LatexText text={paper.title} forceInlineMath />
                            </h3>
                            <p style={{ margin: "4px 0" }}>
                                arXiv：
                                {paper.arxiv_id && paper.arxiv_url ? (
                                    <a href={paper.arxiv_url} target="_blank" rel="noopener noreferrer" style={{ color: "#0070f3", textDecoration: "underline" }}>
                                        {paper.arxiv_id}
                                    </a>
                                ) : (paper.arxiv_id || "暂无")}
                            </p>
                            <p style={{ margin: "4px 0" }}>发表日期：{paper.publish_date || "未知"}</p>
                            <p style={{ margin: "4px 0" }}>学科/分类：{paper.subjects || "暂无分类"}</p>
                            <p style={{ margin: "4px 0" }}>
                                作者：{
                                    (() => {
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
                                                            style={{
                                                                border: "none",
                                                                background: "transparent",
                                                                padding: 0,
                                                                color: "#0070f3",
                                                                textDecoration: "underline",
                                                                cursor: "pointer",
                                                                font: "inherit",
                                                            }}
                                                        >
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
                                    })()
                                }
                            </p>
                            <div className="searchPaperAbstractRow">
                                <span className="searchPaperAbstractLabel">摘要：</span>
                                <div className="searchPaperAbstractContent">
                                    <LatexText text={paper.abstract || "暂无摘要"} />
                                </div>
                            </div>
                            {isAdmin && (
                                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                    <button onClick={() => beginEditPaper(paper)} disabled={adminSaving}>修改论文</button>
                                    <button onClick={() => openDeletePaperDialog(paper)} disabled={adminSaving}>删除论文</button>
                                </div>
                            )}
                        </div>
                    ))}

                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        loading={loading}
                        onPageChange={(newPage) => { void search({ page: newPage, shouldSyncUrl: true }); }}
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
        </div>
    );
};

export default SearchScreen;
