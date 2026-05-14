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
    visibility?: string;
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
    const [hasPreviousPage, setHasPreviousPage] = useState(false);
    const [hasNextPage, setHasNextPage] = useState(false);
    const [adminSaving, setAdminSaving] = useState(false);
    const [adminMessage, setAdminMessage] = useState("");
    const [mentorDeleteTarget, setMentorDeleteTarget] = useState<MentorDeleteTarget | undefined>(undefined);
    const [mentorDeleteSubmitting, setMentorDeleteSubmitting] = useState(false);
    const [paperDeleteTarget, setPaperDeleteTarget] = useState<PaperDeleteTarget | undefined>(undefined);
    const [paperDeleteSubmitting, setPaperDeleteSubmitting] = useState(false);
    const [allMentorsTotal, setAllMentorsTotal] = useState(0);
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

    useEffect(() => {
        if (!hasSearched || mode !== "mentor") {
            return;
        }
        void search({
            page: 1,
            shouldSyncUrl: false,
            visibility: mentorResultFilter,
        });
    }, [mentorResultFilter]);

    const privateMentorIdSet = useMemo(() => {
        return new Set(privateMentors.map((mentor) => mentor.id));
    }, [privateMentors]);

    const mentorResultTotalMineCount = privateMentors.length;
    const thirdSegmentOptions = mode === "paper" ? PAPER_SORT_OPTIONS : MENTOR_FILTER_OPTIONS;
    const thirdSegmentValue = mode === "paper" ? paperSortMode : mentorResultFilter;
    const trimmedAppliedKeyword = appliedKeyword.trim();
    const isEmptySearch = trimmedAppliedKeyword === "";
    const searchHeadingText = isEmptySearch
        ? `Search in ${totalResults} entrys:`
        : `Showing ${totalResults} results for all: ${trimmedAppliedKeyword}`;

    const search = async ({
        keyword: overrideKeyword,
        mode: overrideMode,
        searchMode: overrideSearchMode,
        sortMode: overrideSortMode,
        page: overridePage,
        shouldSyncUrl = true,
        visibility: overrideVisibility,
    }: SearchOptions = {}) => {
        const trimmedKeyword = (overrideKeyword ?? keyword).trim();
        const resolvedMode = overrideMode ?? mode;
        const resolvedSearchMode = overrideSearchMode ?? matchMode;
        const resolvedPaperSortMode = overrideSortMode ?? paperSortMode;
        const requestedPage = Math.max(1, overridePage ?? 1);
        const resolvedVisibility = overrideVisibility ?? (resolvedMode === "mentor" ? mentorResultFilter : "all");
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
                const visibilityQuery = resolvedVisibility !== "all" ? `&visibility=${resolvedVisibility}` : "";
                const res = await request<SearchMentorsResponse>(
                    `/api/search/mentors?${query}${pageQuery}${visibilityQuery}`,
                    "GET",
                    isLoggedIn,
                );
                const mentorItems = Array.isArray(res.mentors) ? res.mentors : [];
                setAppliedKeyword(trimmedKeyword);
                setMentors(mentorItems);
                setPapers([]);
                applyPagination(res, mentorItems.length, requestedPage);
                if (resolvedVisibility === "all") {
                    setAllMentorsTotal(res.total ?? mentorItems.length);
                }
            }
            else {
                const res = await request<SearchPapersResponse>(
                    `/api/search/papers?${query}&sort_mode=${resolvedPaperSortMode}${pageQuery}`,
                    "GET",
                    isLoggedIn,
                );
                const paperItems = Array.isArray(res.papers) ? res.papers : [];
                setAppliedKeyword(trimmedKeyword);
                setPapers(paperItems);
                setMentors([]);
                applyPagination(res, paperItems.length, requestedPage);
            }
        }
        catch (err) {
            setAppliedKeyword(trimmedKeyword);
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
            await fetchMyPrivateMentors();

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
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 794, margin: "0 auto" }}>
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
                    搜索
                </button>
            </div>

            <div className="searchSegmentRow" aria-label="搜索选项分段控件">
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

                        setMentorResultFilter(value as MentorResultFilter);
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

            {mode === "mentor" && mentors.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
                                    {privateMentors.length >= 10 && (
                                        <p style={{ margin: 0, color: "#cf222e", fontSize: 13 }}>私有导师数量已达上限（10位），请先删除部分私有导师后再添加。</p>
                                    )}
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
                            flexWrap: "wrap",
                        }}
                    >
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            loading={loading}
                            showPrevious={false}
                            nextLabel="Next"
                            centered
                            controlHeight={33.77}
                            jumpInputWidth={120}
                            activePageHighlightColor="rgb(8, 109, 177)"
                            onPageChange={(newPage) => { void search({ page: newPage, shouldSyncUrl: true }); }}
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
                            <h3 style={{ margin: "0 0 8px", fontSize: "17.5px" }}>
                                {mentor.Chinese_name}
                                {privateMentorIdSet.has(mentor.id) && (
                                    <span style={{ marginLeft: 8, fontSize: 12, color: "#555" }}>我的私有导师</span>
                                )}
                            </h3>
                            {mentor.English_name && (
                                <p style={{ margin: "4px 0", fontSize: "14px" }}>英文名：{mentor.English_name}</p>
                            )}
                            <p style={{ margin: "4px 0", fontSize: "14px" }}>
                                研究方向：{mentor.research_direction || "暂无研究方向"}
                            </p>
                            <p style={{ margin: "4px 0", fontSize: "14px" }}>邮箱：{mentor.email || "暂无邮箱"}</p>
                            <p style={{ margin: "4px 0", fontSize: "14px" }}>导师画像：{isExpanded ? profileText : profilePreview}</p>
                            <button onClick={() => router.push(`/mentors/${mentor.id}`)} style={{ fontSize: "14px" }}>
                                查看导师主页
                            </button>
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
                                            {title}
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
                        showPrevious={false}
                        nextLabel="Next"
                        centered
                        controlHeight={33.77}
                        jumpInputWidth={120}
                        activePageHighlightColor="rgb(8, 109, 177)"
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
                            flexWrap: "wrap",
                        }}
                    >
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            loading={loading}
                            showPrevious={false}
                            nextLabel="Next"
                            centered
                            controlHeight={33.77}
                            jumpInputWidth={120}
                            activePageHighlightColor="rgb(8, 109, 177)"
                            onPageChange={(newPage) => { void search({ page: newPage, shouldSyncUrl: true }); }}
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
                        showPrevious={false}
                        nextLabel="Next"
                        centered
                        controlHeight={33.77}
                        jumpInputWidth={120}
                        activePageHighlightColor="rgb(8, 109, 177)"
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
                    text-decoration: none;
                    transition: color 0.16s ease, border-color 0.16s ease;
                    border-bottom: 1px dashed transparent;
                    cursor: pointer;
                    font: inherit;
                    text-align: left;
                    white-space: normal;
                }

                :global(button.searchMentorPaperLinkButton:hover),
                :global(button.searchMentorPaperLinkButton:focus-visible) {
                    color: rgb(45, 45, 45);
                    border-bottom-color: rgb(45, 45, 45);
                    outline: none;
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
