import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";

import LatexText from "../components/LatexText";
import { FAILURE_PREFIX } from "../constants/string";
import { request } from "../utils/network";
import {
    TimelineDirectionSummary,
    TimelineDirectionsResponse,
    TimelinePaper,
    TimelinePapersResponse,
} from "../utils/types";

const INITIAL_BATCH_SIZE = 6;
const WINDOW_BATCH_SIZE = 5;
const DEFAULT_TIMELINE_LIMIT = 20;
const DIRECTION_SKELETON_COUNT = 8;
const INITIAL_FEED_PREVIEW_COUNT = 4;
const LOAD_MORE_PREVIEW_COUNT = 1;
const MIN_INITIAL_SKELETON_MS = 800;
const INITIAL_SKELETON_FADE_MS = 180;
export const APPEND_SCROLL_ADJUSTMENT_RATIO = 0.002;
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

type TimelineLoadMode = "replace" | "prepend" | "append";
type ScrollAdjustment =
    | { type: "prepend"; addedIds: number[]; direction: "up" | "down"; }
    | { type: "append-anchor"; firstNewPaperId?: number; anchorTop: number; direction: "up" | "down"; }
    | undefined;

const createSkeletonKeys = (count: number, prefix: string) => (
    Array.from({ length: count }, (_, idx) => `${prefix}-${idx}`)
);

const createPreviewBarStyle = (
    width: number | string,
    height: number,
    extraStyles: Record<string, string | number> = {},
) => ({
    display: "block",
    width,
    height,
    borderRadius: 999,
    background: "linear-gradient(90deg, #e3e9f0 0%, #edf2f7 40%, #ffffff 50%, #edf2f7 60%, #e3e9f0 100%)",
    backgroundSize: "200% 100%",
    animation: "timelinePreviewBarShimmer 1.15s ease-in-out infinite",
    position: "relative" as const,
    overflow: "hidden" as const,
    ...extraStyles,
});

const TIMELINE_SKELETON_BLUEPRINTS = [
    {
        eyebrow: "88px",
        title: "74%",
        tags: ["54px", "72px", "62px"],
        meta: ["44%", "33%"],
        paragraph: ["100%", "96%", "84%", "58%"],
    },
    {
        eyebrow: "96px",
        title: "81%",
        tags: ["60px", "68px"],
        meta: ["48%", "29%"],
        paragraph: ["98%", "90%", "72%"],
    },
    {
        eyebrow: "78px",
        title: "69%",
        tags: ["48px", "76px", "58px"],
        meta: ["42%", "38%"],
        paragraph: ["100%", "94%", "88%", "50%"],
    },
] as const;

const TimelinePage = () => {
    const router = useRouter();
    const [directions, setDirections] = useState<TimelineDirectionSummary[]>([]);
    const [activeDirection, setActiveDirection] = useState("");
    const [papers, setPapers] = useState<TimelinePaper[]>([]);
    const [windowStartOffset, setWindowStartOffset] = useState(0);
    const [totalPapers, setTotalPapers] = useState(0);
    const [hasMoreBefore, setHasMoreBefore] = useState(false);
    const [hasMoreAfter, setHasMoreAfter] = useState(false);
    const [loadingDirections, setLoadingDirections] = useState(true);
    const [loadingInitial, setLoadingInitial] = useState(false);
    const [loadingPrevious, setLoadingPrevious] = useState(false);
    const [, setLoadingNext] = useState(false);
    const [hasResolvedInitialFeed, setHasResolvedInitialFeed] = useState(false);
    const [showInitialSkeleton, setShowInitialSkeleton] = useState(false);
    const [feedRevealKey, setFeedRevealKey] = useState(0);
    const [errorMessage, setErrorMessage] = useState("");
    const feedViewportRef = useRef<HTMLDivElement | undefined>(undefined);
    const paperRefs = useRef<Record<number, HTMLElement | undefined>>({});
    const papersRef = useRef<TimelinePaper[]>([]);
    const windowStartOffsetRef = useRef(0);
    const hasMoreBeforeRef = useRef(false);
    const hasMoreAfterRef = useRef(false);
    const activeDirectionRef = useRef("");
    const directionGenerationRef = useRef(0);
    const pendingScrollAdjustmentRef = useRef<ScrollAdjustment>(undefined);
    const initialSkeletonStartedAtRef = useRef(0);
    const initialSkeletonTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const inFlightRef = useRef({
        replace: false,
        prepend: false,
        append: false,
    });
    const scrollDirectionRef = useRef<"up" | "down">("down");
    const lastFeedScrollTopRef = useRef(0);
    const skipNextScrollEventRef = useRef(false);
    const lastRealPaperBottomRef = useRef(0);
    const loadMoreThresholdConsumedRef = useRef(false);

    useEffect(() => {
        papersRef.current = papers;
    }, [papers]);

    useEffect(() => {
        windowStartOffsetRef.current = windowStartOffset;
    }, [windowStartOffset]);

    useEffect(() => {
        hasMoreBeforeRef.current = hasMoreBefore;
    }, [hasMoreBefore]);

    useEffect(() => {
        hasMoreAfterRef.current = hasMoreAfter;
    }, [hasMoreAfter]);

    useEffect(() => {
        activeDirectionRef.current = activeDirection;
    }, [activeDirection]);

    useEffect(() => () => {
        if (initialSkeletonTimerRef.current !== undefined) {
            clearTimeout(initialSkeletonTimerRef.current);
        }
    }, []);

    const buildTimelinePdfUrl = (arxivUrl?: string) => {
        if (typeof arxivUrl !== "string" || arxivUrl.trim() === "" || !arxivUrl.includes("/abs/")) {
            return "";
        }

        return arxivUrl.replace("/abs/", "/pdf/");
    };

    const parseTimelineSubjects = (subjects?: string) => {
        if (typeof subjects !== "string" || subjects.trim() === "") {
            return [];
        }

        return subjects
            .split(",")
            .map((subject) => subject.trim())
            .filter((subject) => subject !== "");
    };

    const renderPaperAuthors = (paper: TimelinePaper) => {
        const names = (paper.author_names || "").split(/[,，、]/).map((name) => name.trim()).filter(Boolean);
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
                    <span key={`${paper.id}-${name}-${idx}`}>
                        <a
                            href={`/mentors/${mentorId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="timelineMentorLink"
                        >
                            <img
                                src="/favicon_tsinghua.ico"
                                alt="清华导师"
                                className="timelineMentorIcon"
                            />
                            {name}
                        </a>
                        {separator}
                    </span>
                );
            }

            return (
                <span key={`${paper.id}-${name}-${idx}`}>
                    {name}
                    {separator}
                </span>
            );
        });
    };

    const setLoadingFlag = (mode: TimelineLoadMode, loading: boolean) => {
        if (mode === "replace") {
            setLoadingInitial(loading);
            return;
        }

        if (mode === "prepend") {
            setLoadingPrevious(loading);
            return;
        }

        setLoadingNext(loading);
    };

    const clearInitialSkeletonTimer = () => {
        if (initialSkeletonTimerRef.current !== undefined) {
            clearTimeout(initialSkeletonTimerRef.current);
            initialSkeletonTimerRef.current = undefined;
        }
    };

    const startInitialSkeletonPhase = () => {
        clearInitialSkeletonTimer();
        initialSkeletonStartedAtRef.current = Date.now();
        setShowInitialSkeleton(true);
    };

    const finishInitialSkeletonPhase = (mode: TimelineLoadMode, generation: number) => {
        if (mode !== "replace") {
            return;
        }

        clearInitialSkeletonTimer();
        const elapsed = Date.now() - initialSkeletonStartedAtRef.current;
        const remaining = Math.max(MIN_INITIAL_SKELETON_MS - elapsed, 0);
        const finalize = () => {
            if (generation !== directionGenerationRef.current) {
                return;
            }

            setShowInitialSkeleton(false);
            setFeedRevealKey((current) => current + 1);
        };

        if (remaining === 0) {
            finalize();
            return;
        }

        initialSkeletonTimerRef.current = setTimeout(() => {
            initialSkeletonTimerRef.current = undefined;
            finalize();
        }, remaining);
    };

    const hasAnyFeedLoadInFlight = () => (
        inFlightRef.current.replace || inFlightRef.current.prepend || inFlightRef.current.append
    );

    const applyFeedResponse = (response: TimelinePapersResponse, mode: TimelineLoadMode) => {
        const normalizedOffset = Math.max(0, Number(response.offset) || 0);
        const normalizedLimit = Math.max(1, Number(response.limit) || DEFAULT_TIMELINE_LIMIT);
        const nextPapers = Array.isArray(response.papers) ? response.papers : [];
        const nextTotal = Number(response.total_papers) > 0 ? Number(response.total_papers) : 0;

        setTotalPapers(nextTotal);

        if (mode === "replace") {
            pendingScrollAdjustmentRef.current = undefined;
            setPapers(nextPapers);
            setWindowStartOffset(normalizedOffset);
            setHasMoreBefore(Boolean(response.has_previous));
            setHasMoreAfter(Boolean(response.has_next));
            return;
        }

        const currentPapers = papersRef.current;
        const currentStartOffset = windowStartOffsetRef.current;
        const existingIds = new Set(currentPapers.map((paper) => paper.id));

        if (mode === "append") {
            const uniqueIncoming = nextPapers.filter((paper) => !existingIds.has(paper.id));
            const mergedPapers = [...currentPapers, ...uniqueIncoming];

            pendingScrollAdjustmentRef.current = uniqueIncoming.length > 0 && pendingScrollAdjustmentRef.current?.type === "append-anchor"
                ? {
                    ...pendingScrollAdjustmentRef.current,
                    firstNewPaperId: uniqueIncoming[0]?.id,
                }
                : pendingScrollAdjustmentRef.current;

            setPapers(mergedPapers);
            setWindowStartOffset(currentStartOffset);
            setHasMoreBefore(Boolean(response.has_previous) || currentStartOffset > 0);
            setHasMoreAfter(Boolean(response.has_next));
            return;
        }

        const uniqueIncoming = nextPapers.filter((paper) => !existingIds.has(paper.id));
        const mergedPapers = [...uniqueIncoming, ...currentPapers];

        pendingScrollAdjustmentRef.current = uniqueIncoming.length > 0
            ? {
                type: "prepend",
                addedIds: uniqueIncoming.map((paper) => paper.id),
                direction: "up",
            }
            : undefined;

        setPapers(mergedPapers);
        setWindowStartOffset(normalizedOffset);
        setHasMoreBefore(Boolean(response.has_previous));
        setHasMoreAfter(Boolean(response.has_next) || hasMoreAfterRef.current || normalizedLimit < currentPapers.length);
    };

    const fetchTimelineSlice = async (
        direction: string,
        offset: number,
        limit: number,
        mode: TimelineLoadMode,
        generation: number,
    ) => {
        if (hasAnyFeedLoadInFlight()) {
            return;
        }

        inFlightRef.current[mode] = true;
        setLoadingFlag(mode, true);
        setErrorMessage("");
        if (mode === "replace") {
            startInitialSkeletonPhase();
        }

        try {
            const query = new URLSearchParams({
                direction,
                offset: String(offset),
                limit: String(limit),
            }).toString();
            const response = await request<TimelinePapersResponse>(`/api/timeline?${query}`, "GET", false);

            if (generation !== directionGenerationRef.current || activeDirectionRef.current !== direction) {
                return;
            }

            applyFeedResponse(response, mode);
        }
        catch (err) {
            if (generation !== directionGenerationRef.current || activeDirectionRef.current !== direction) {
                return;
            }

            if (mode === "replace") {
                setPapers([]);
                setWindowStartOffset(0);
                setTotalPapers(0);
                setHasMoreBefore(false);
                setHasMoreAfter(false);
            }

            setErrorMessage(FAILURE_PREFIX + String(err));
        }
        finally {
            inFlightRef.current[mode] = false;
            if (generation === directionGenerationRef.current) {
                setLoadingFlag(mode, false);
                if (mode === "replace") {
                    setHasResolvedInitialFeed(true);
                }
            }
            finishInitialSkeletonPhase(mode, generation);
        }
    };

    useEffect(() => {
        const fetchDirectionOverview = async () => {
            setLoadingDirections(true);
            setHasResolvedInitialFeed(false);
            setErrorMessage("");

            try {
                const res = await request<TimelineDirectionsResponse>("/api/timeline", "GET", false);
                const nextDirections = Array.isArray(res.directions) ? res.directions : [];

                setDirections(nextDirections);
                setActiveDirection((currentDirection) => {
                    if (currentDirection !== "" && nextDirections.some((group) => group.direction === currentDirection)) {
                        return currentDirection;
                    }

                    if (res.default_direction !== "" && nextDirections.some((group) => group.direction === res.default_direction)) {
                        return res.default_direction;
                    }

                    return nextDirections[0]?.direction || "";
                });
            }
            catch (err) {
                setDirections([]);
                setPapers([]);
                setActiveDirection("");
                setTotalPapers(0);
                setWindowStartOffset(0);
                setHasMoreBefore(false);
                setHasMoreAfter(false);
                setErrorMessage(FAILURE_PREFIX + String(err));
            }
            finally {
                setLoadingDirections(false);
            }
        };

        void fetchDirectionOverview();
    }, []);

    useEffect(() => {
        if (activeDirection === "") {
            clearInitialSkeletonTimer();
            setShowInitialSkeleton(false);
            setPapers([]);
            setTotalPapers(0);
            setWindowStartOffset(0);
            setHasMoreBefore(false);
            setHasMoreAfter(false);
            setHasResolvedInitialFeed(false);
            return;
        }

        directionGenerationRef.current += 1;
        const generation = directionGenerationRef.current;
        clearInitialSkeletonTimer();
        inFlightRef.current = {
            replace: false,
            prepend: false,
            append: false,
        };
        pendingScrollAdjustmentRef.current = undefined;
        setLoadingPrevious(false);
        setLoadingNext(false);
        setHasResolvedInitialFeed(false);
        setShowInitialSkeleton(true);
        setPapers([]);
        setWindowStartOffset(0);
        setTotalPapers(0);
        setHasMoreBefore(false);
        setHasMoreAfter(false);
        papersRef.current = [];
        windowStartOffsetRef.current = 0;
        hasMoreBeforeRef.current = false;
        hasMoreAfterRef.current = false;
        lastFeedScrollTopRef.current = 0;
        scrollDirectionRef.current = "down";
        if (feedViewportRef.current !== undefined) {
            feedViewportRef.current.scrollTop = 0;
        }
        void fetchTimelineSlice(activeDirection, 0, INITIAL_BATCH_SIZE, "replace", generation);
    }, [activeDirection]);

    const activeDirectionSummary = useMemo(
        () => directions.find((group) => group.direction === activeDirection),
        [activeDirection, directions],
    );

    const visibleStart = papers.length > 0 ? windowStartOffset + 1 : 0;
    const visibleEnd = papers.length > 0 ? windowStartOffset + papers.length : 0;

    const loadPreviousBatch = () => {
        if (
            activeDirectionRef.current === ""
            || !hasMoreBeforeRef.current
            || hasAnyFeedLoadInFlight()
            || windowStartOffsetRef.current <= 0
        ) {
            return;
        }

        const limit = Math.min(WINDOW_BATCH_SIZE, windowStartOffsetRef.current);
        const offset = Math.max(0, windowStartOffsetRef.current - limit);
        void fetchTimelineSlice(activeDirectionRef.current, offset, limit, "prepend", directionGenerationRef.current);
    };

    const getFeedViewportBottom = () => {
        const viewport = feedViewportRef.current;
        if (viewport === undefined) {
            return 0;
        }

        return viewport.getBoundingClientRect().bottom;
    };

    const getFirstLoadMorePreviewTop = () => {
        const firstPreview = feedViewportRef.current?.querySelector<HTMLElement>("[data-load-more-preview-first='true']");
        if (!firstPreview) {
            return Number.POSITIVE_INFINITY;
        }

        return firstPreview.getBoundingClientRect().top;
    };

    const loadNextBatch = () => {
        if (
            activeDirectionRef.current === ""
            || !hasMoreAfterRef.current
            || hasAnyFeedLoadInFlight()
        ) {
            return;
        }

        const lastPaper = papersRef.current[papersRef.current.length - 1];
        const anchorTop = lastPaper !== undefined ? (paperRefs.current[lastPaper.id]?.offsetTop || 0) : 0;
        if (anchorTop > 0) {
            pendingScrollAdjustmentRef.current = {
                type: "append-anchor",
                anchorTop,
                direction: "down",
            };
        }

        void fetchTimelineSlice(
            activeDirectionRef.current,
            windowStartOffsetRef.current + papersRef.current.length,
            WINDOW_BATCH_SIZE,
            "append",
            directionGenerationRef.current,
        );
    };

    const maybeLoadNextFromViewport = () => {
        if (
            !hasMoreAfterRef.current
            || hasAnyFeedLoadInFlight()
            || loadMoreThresholdConsumedRef.current
        ) {
            return;
        }

        const viewportBottom = lastRealPaperBottomRef.current || getFeedViewportBottom();
        if (viewportBottom <= 0) {
            return;
        }

        const firstPreviewTop = getFirstLoadMorePreviewTop();
        if (firstPreviewTop <= viewportBottom) {
            loadMoreThresholdConsumedRef.current = true;
            loadNextBatch();
        }
    };

    const handleFeedViewportScroll = () => {
        const viewport = feedViewportRef.current;
        if (viewport === undefined) {
            return;
        }

        const currentTop = viewport.scrollTop;
        const previousTop = lastFeedScrollTopRef.current;

        if (skipNextScrollEventRef.current) {
            skipNextScrollEventRef.current = false;
            lastFeedScrollTopRef.current = currentTop;
            return;
        }

        if (currentTop !== previousTop) {
            scrollDirectionRef.current = currentTop > previousTop ? "down" : "up";
        }

        lastFeedScrollTopRef.current = currentTop;

        if (currentTop <= 0) {
            if (previousTop > 0 && scrollDirectionRef.current === "up") {
                loadPreviousBatch();
            }
            return;
        }

        maybeLoadNextFromViewport();
    };

    useIsomorphicLayoutEffect(() => {
        const pendingAdjustment = pendingScrollAdjustmentRef.current;
        const viewport = feedViewportRef.current;
        if (viewport === undefined) {
            return;
        }

        if (pendingAdjustment?.type === "prepend") {
            const addedHeight = pendingAdjustment.addedIds.reduce((sum, id) => (
                sum + (paperRefs.current[id]?.offsetHeight || 0)
            ), 0);

            if (addedHeight > 0) {
                skipNextScrollEventRef.current = true;
                viewport.scrollTop += addedHeight;
                lastFeedScrollTopRef.current = viewport.scrollTop;
                scrollDirectionRef.current = pendingAdjustment.direction;
            }
        }

        if (pendingAdjustment?.type === "append-anchor") {
            const targetId = pendingAdjustment.firstNewPaperId;
            const targetElement = targetId !== undefined ? paperRefs.current[targetId] : undefined;

            if (targetElement !== undefined) {
                const delta = targetElement.offsetTop - pendingAdjustment.anchorTop;
                const adjustedDelta = delta * APPEND_SCROLL_ADJUSTMENT_RATIO;

                if (adjustedDelta !== 0) {
                    skipNextScrollEventRef.current = true;
                    viewport.scrollTop += adjustedDelta;
                    lastFeedScrollTopRef.current = viewport.scrollTop;
                    scrollDirectionRef.current = pendingAdjustment.direction;
                }
            }
        }

        pendingScrollAdjustmentRef.current = undefined;
        lastRealPaperBottomRef.current = getFeedViewportBottom();
        loadMoreThresholdConsumedRef.current = false;
    }, [papers]);

    const renderSkeletonStack = (count: number, position: "top" | "initial" | "bottom") => (
        <div
            className={`timelineSkeletonStack timelineSkeletonStack${position[0].toUpperCase()}${position.slice(1)}`}
            data-testid={`timeline-skeleton-${position}`}
        >
            {createSkeletonKeys(count, position).map((key, idx) => {
                const blueprint = TIMELINE_SKELETON_BLUEPRINTS[idx % TIMELINE_SKELETON_BLUEPRINTS.length];

                return (
                    <article key={key} className="timelineSkeletonCard" aria-hidden="true">
                        <div className="timelineSkeletonHeaderRow">
                            <div
                                className="timelineSkeletonBlock timelineSkeletonLine timelineSkeletonLineEyebrow"
                                style={{ width: blueprint.eyebrow }}
                            />
                            <div className="timelineSkeletonChipRow">
                                {blueprint.tags.map((width, tagIdx) => (
                                    <span
                                        key={`${key}-tag-${tagIdx}`}
                                        className="timelineSkeletonBlock timelineSkeletonTag"
                                        style={{ width }}
                                    />
                                ))}
                            </div>
                        </div>
                        <div
                            className="timelineSkeletonBlock timelineSkeletonLine timelineSkeletonLineTitle"
                            style={{ width: blueprint.title }}
                        />
                        <div className="timelineSkeletonMetaRows">
                            {blueprint.meta.map((width, metaIdx) => (
                                <div key={`${key}-meta-${metaIdx}`} className="timelineSkeletonMetaRow">
                                    <span className="timelineSkeletonBlock timelineSkeletonMetaLabel" />
                                    <span
                                        className="timelineSkeletonBlock timelineSkeletonLine timelineSkeletonLineMeta"
                                        style={{ width }}
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="timelineSkeletonParagraph">
                            {blueprint.paragraph.map((width, lineIdx) => (
                                <div
                                    key={`${key}-line-${lineIdx}`}
                                    className="timelineSkeletonBlock timelineSkeletonLine timelineSkeletonLineParagraph"
                                    style={{ width }}
                                />
                            ))}
                        </div>
                    </article>
                );
            })}
        </div>
    );

    const renderDirectionSkeletonList = () => (
        <div
            className="timelineDirectionSkeletonList"
            data-testid="timeline-direction-skeletons"
            style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                width: "100%",
            }}
        >
            {createSkeletonKeys(DIRECTION_SKELETON_COUNT, "direction").map((key) => (
                <button
                    key={key}
                    type="button"
                    className="timelineDirectionButton timelineDirectionLoadingCard"
                    aria-hidden="true"
                    tabIndex={-1}
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        width: "100%",
                        minHeight: 98,
                        padding: "10px 12px",
                        border: "1px solid #ccc",
                        borderRadius: 6,
                        background: "#fff",
                        boxSizing: "border-box",
                        position: "relative",
                        overflow: "hidden",
                        gap: 8,
                        cursor: "default",
                        pointerEvents: "none",
                        opacity: 1,
                    }}
                >
                    <span
                        className="timelineDirectionLoadingBar timelineDirectionLoadingBarPrimary"
                        aria-hidden="true"
                        style={{
                            display: "block",
                            width: "82%",
                            height: 18,
                            marginTop: 2,
                            flex: "0 0 auto",
                            borderRadius: 999,
                            background: "#e3e9f0",
                            position: "relative",
                            overflow: "hidden",
                            zIndex: 1,
                        }}
                    />
                    <span
                        className="timelineDirectionLoadingBar timelineDirectionLoadingBarSecondary"
                        aria-hidden="true"
                        style={{
                            display: "block",
                            width: "36%",
                            height: 12,
                            marginTop: "auto",
                            flex: "0 0 auto",
                            borderRadius: 999,
                            background: "#e3e9f0",
                            position: "relative",
                            overflow: "hidden",
                            zIndex: 1,
                        }}
                    />
                </button>
            ))}
        </div>
    );

    const renderFeedHeaderSkeleton = () => (
        <div
            className="timelineFeedHeader timelineFeedHeaderSkeleton"
            data-testid="timeline-feed-header-skeleton"
            style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 16,
                padding: "18px 20px",
                minHeight: 92,
                width: "100%",
                border: "1px solid #d8dee6",
                borderRadius: 20,
                background: "#ffffff",
                boxSizing: "border-box",
            }}
        >
            <div
                className="timelineFeedHeaderPrimarySkeleton"
                aria-hidden="true"
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    flex: 1,
                    minWidth: 0,
                }}
            >
                <span
                    className="timelineFeedHeaderLoadingBar timelineFeedHeaderLoadingBarPrimary"
                    style={{
                        display: "block",
                        width: "min(360px, 62%)",
                        height: 24,
                        borderRadius: 999,
                        background: "#e3e9f0",
                        position: "relative",
                        overflow: "hidden",
                    }}
                />
                <span
                    className="timelineFeedHeaderLoadingBar timelineFeedHeaderLoadingBarSecondary"
                    style={{
                        display: "block",
                        width: "min(240px, 38%)",
                        height: 14,
                        borderRadius: 999,
                        background: "#e3e9f0",
                        position: "relative",
                        overflow: "hidden",
                    }}
                />
            </div>
            <div
                className="timelineFeedHeaderSecondarySkeleton"
                aria-hidden="true"
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    alignItems: "flex-end",
                    flex: "0 0 auto",
                }}
            >
                <span className="timelineSkeletonBlock timelineFeedHeaderSkeletonStat" />
                <span className="timelineSkeletonBlock timelineFeedHeaderSkeletonStat timelineFeedHeaderSkeletonStatShort" />
            </div>
        </div>
    );

    const renderFeedPreviewCards = ({
        count = INITIAL_FEED_PREVIEW_COUNT,
        keyPrefix = "feed-preview",
        stackClassName = "timelineFeedPreviewStack",
        testId = "timeline-feed-preview-skeletons",
    }: {
        count?: number;
        keyPrefix?: string;
        stackClassName?: string;
        testId?: string;
    } = {}) => (
        <div
            className={stackClassName}
            data-testid={testId}
            style={{
                display: "flex",
                flexDirection: "column",
                gap: 18,
                width: "100%",
            }}
        >
            {createSkeletonKeys(count, keyPrefix).map((key, idx) => (
                <article
                    key={key}
                    className="timelineFeedPreviewCard"
                    aria-hidden="true"
                    data-load-more-preview-first={keyPrefix === "feed-load-more" && idx === 0 ? "true" : undefined}
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 16,
                        minHeight: 182,
                        padding: "18px 16px 20px",
                        border: "1px solid #d8dee8",
                        borderRadius: 14,
                        background: "#fff",
                        width: "100%",
                        boxSizing: "border-box",
                    }}
                >
                    <div
                        className="timelineFeedPreviewHeaderRow"
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                        }}
                    >
                        <span
                            className="timelineDirectionLoadingBar timelineFeedPreviewBar timelineFeedPreviewBarDate"
                            style={createPreviewBarStyle(92, 14)}
                        />
                        <div
                            className="timelineFeedPreviewTagRow"
                            style={{
                                display: "inline-flex",
                                gap: 8,
                                flexWrap: "wrap",
                            }}
                        >
                            <span
                                className="timelineDirectionLoadingBar timelineFeedPreviewBar timelineFeedPreviewBarTag"
                                style={createPreviewBarStyle(56, 22, { borderRadius: 8 })}
                            />
                            <span
                                className="timelineDirectionLoadingBar timelineFeedPreviewBar timelineFeedPreviewBarTag"
                                style={createPreviewBarStyle(54, 22, { borderRadius: 8 })}
                            />
                            <span
                                className="timelineDirectionLoadingBar timelineFeedPreviewBar timelineFeedPreviewBarTag timelineFeedPreviewBarTagWide"
                                style={createPreviewBarStyle(72, 22, { borderRadius: 8 })}
                            />
                        </div>
                    </div>
                    <span
                        className="timelineDirectionLoadingBar timelineFeedPreviewBar timelineFeedPreviewBarTitle"
                        style={createPreviewBarStyle("72%", 28)}
                    />
                    <div
                        className="timelineFeedPreviewMetaRow"
                        style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 12,
                        }}
                    >
                        <span
                            className="timelineDirectionLoadingBar timelineFeedPreviewBar timelineFeedPreviewBarLabel"
                            style={createPreviewBarStyle(44, 14, { flex: "0 0 auto" })}
                        />
                        <span
                            className="timelineDirectionLoadingBar timelineFeedPreviewBar timelineFeedPreviewBarMeta"
                            style={createPreviewBarStyle("37%", 14, { marginTop: 1 })}
                        />
                    </div>
                    <div
                        className="timelineFeedPreviewMetaRow"
                        style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 12,
                        }}
                    >
                        <span
                            className="timelineDirectionLoadingBar timelineFeedPreviewBar timelineFeedPreviewBarLabel"
                            style={createPreviewBarStyle(44, 14, { flex: "0 0 auto" })}
                        />
                        <div
                            className="timelineFeedPreviewParagraph"
                            style={{
                                display: "flex",
                                flex: 1,
                                flexDirection: "column",
                                gap: 10,
                            }}
                        >
                            <span
                                className="timelineDirectionLoadingBar timelineFeedPreviewBar timelineFeedPreviewBarParagraph timelineFeedPreviewBarParagraphFull"
                                style={createPreviewBarStyle("100%", 14)}
                            />
                            <span
                                className="timelineDirectionLoadingBar timelineFeedPreviewBar timelineFeedPreviewBarParagraph timelineFeedPreviewBarParagraphFull"
                                style={createPreviewBarStyle("100%", 14)}
                            />
                            <span
                                className="timelineDirectionLoadingBar timelineFeedPreviewBar timelineFeedPreviewBarParagraph timelineFeedPreviewBarParagraphShort"
                                style={createPreviewBarStyle("68%", 14)}
                            />
                        </div>
                    </div>
                </article>
            ))}
        </div>
    );

    const shouldRenderTimelineShell = loadingDirections || directions.length > 0;
    const shouldRenderDirectionSkeletons = loadingDirections && directions.length === 0;
    const shouldRenderFeedHeaderSkeleton = shouldRenderDirectionSkeletons || activeDirection === "";
    const shouldRenderInitialFeedSkeleton = (
        shouldRenderDirectionSkeletons
        || showInitialSkeleton
        || (!hasResolvedInitialFeed && papers.length === 0)
    );
    const shouldRenderFeedPreviewSkeletons = shouldRenderInitialFeedSkeleton;
    const shouldRenderFeedStatsSkeleton = !shouldRenderFeedHeaderSkeleton && shouldRenderInitialFeedSkeleton;
    const shouldRenderResolvedFeed = !shouldRenderInitialFeedSkeleton && papers.length > 0;
    const shouldRenderEmptyFeedState = !shouldRenderInitialFeedSkeleton && !loadingInitial && hasResolvedInitialFeed && papers.length === 0;
    const shouldRenderLoadMorePreview = shouldRenderResolvedFeed && hasMoreAfter;
    const shouldRenderFeedHint = shouldRenderResolvedFeed && !hasMoreAfter;

    useEffect(() => {
        if (!shouldRenderLoadMorePreview || loadingInitial || hasAnyFeedLoadInFlight()) {
            return;
        }

        const frameId = window.requestAnimationFrame(() => {
            maybeLoadNextFromViewport();
        });

        return () => {
            window.cancelAnimationFrame(frameId);
        };
    }, [loadingInitial, papers, shouldRenderLoadMorePreview]);

    return (
        <div className="timelinePageShell">
            <div className="timelinePageHeader">
                <div>
                    <h2 style={{ margin: "0 0 8px" }}>论文时间线</h2>
                    <p style={{ margin: 0 }}>按研究方向查看最新论文动态，像内容 feed 一样连续向下浏览与回看。</p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => router.push("/")}>返回首页</button>
                    <button onClick={() => router.push("/search")}>去检索</button>
                </div>
            </div>

            {!loadingDirections && errorMessage !== "" && (
                <div className="timelineErrorBanner">
                    {errorMessage}
                </div>
            )}

            {shouldRenderTimelineShell && (
                <div className="timelineContentLayout">
                    <aside className="timelineDirectionsPanel">
                        <h3 className="timelineDirectionsPanelTitle">研究方向</h3>
                        {shouldRenderDirectionSkeletons ? (
                            renderDirectionSkeletonList()
                        ) : (
                            <div className="timelineDirectionList" aria-label="研究方向列表">
                                {directions.map((group) => (
                                    <button
                                        key={group.direction}
                                        onClick={() => {
                                            if (group.direction === activeDirection) {
                                            if (feedViewportRef.current !== undefined) {
                                                lastFeedScrollTopRef.current = 0;
                                                scrollDirectionRef.current = "down";
                                                feedViewportRef.current.scrollTop = 0;
                                                }
                                                return;
                                            }

                                            scrollDirectionRef.current = "down";
                                            setActiveDirection(group.direction);
                                        }}
                                        className={`timelineDirectionButton${group.direction === activeDirection ? " timelineDirectionButtonActive" : ""}`}
                                    >
                                        <div style={{ fontWeight: 600 }}>{group.direction}</div>
                                        <div className="timelineDirectionCount">{group.paper_count} 篇论文</div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </aside>

                    <section className="timelineMainPanel">
                        {shouldRenderFeedHeaderSkeleton ? (
                            renderFeedHeaderSkeleton()
                        ) : (
                            <div className="timelineFeedHeader">
                                <div>
                                    <h3 style={{ margin: "0 0 6px" }}>{activeDirection || "未选择研究方向"}</h3>
                                    <p className="timelineFeedSummaryText">
                                        {activeDirectionSummary ? `${activeDirectionSummary.paper_count} 篇归档论文` : "按时间倒序浏览最新论文"}
                                    </p>
                                </div>
                                <div className="timelineFeedStats">
                                    {shouldRenderFeedStatsSkeleton ? (
                                        <div className="timelineFeedStatsSkeleton" aria-hidden="true">
                                            <span className="timelineSkeletonBlock timelineFeedStatsSkeletonLine" />
                                            <span className="timelineSkeletonBlock timelineFeedStatsSkeletonLine timelineFeedStatsSkeletonLineWide" />
                                        </div>
                                    ) : (
                                        <>
                                            <span>共 {totalPapers} 篇</span>
                                            <span>{papers.length > 0 ? `当前显示第 ${visibleStart}-${visibleEnd} 篇` : "等待加载"}</span>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                        {shouldRenderFeedPreviewSkeletons && renderFeedPreviewCards()}
                        <div
                            ref={(element) => {
                                feedViewportRef.current = element ?? undefined;
                            }}
                            className="timelineFeedViewport"
                            data-testid="timeline-feed-viewport"
                            onScroll={handleFeedViewportScroll}
                        >
                            {!loadingInitial && loadingPrevious && renderSkeletonStack(WINDOW_BATCH_SIZE, "top")}

                            {shouldRenderResolvedFeed && (
                                <div className="timelineFeedList timelineFeedListReveal" key={feedRevealKey}>
                                    {papers.map((paper) => {
                                        const subjectTags = parseTimelineSubjects(paper.subjects);

                                        return (
                                            <article
                                                key={paper.id}
                                                ref={(element) => {
                                                    paperRefs.current[paper.id] = element ?? undefined;
                                                }}
                                                className="timelineFeedCard"
                                                data-testid={`timeline-paper-${paper.id}`}
                                            >
                                                <div className="timelinePaperHeaderRow">
                                                    <div className="timelinePaperDate">
                                                        {paper.publish_date || "未知日期"}
                                                    </div>
                                                    {paper.arxiv_url && (
                                                        <div className="timelinePaperLinks" aria-label="论文外部链接">
                                                            <span>[</span>
                                                            <a href={paper.arxiv_url} target="_blank" rel="noreferrer">
                                                                arxiv
                                                            </a>
                                                            <span>, </span>
                                                            <a href={buildTimelinePdfUrl(paper.arxiv_url)} target="_blank" rel="noreferrer">
                                                                pdf
                                                            </a>
                                                            <span>]</span>
                                                        </div>
                                                    )}
                                                    {subjectTags.length > 0 && (
                                                        <div className="timelineSubjectTags" aria-label="论文学科分类">
                                                            {subjectTags.map((subject) => (
                                                                <span key={subject} className="timelineSubjectTag">
                                                                    {subject}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                <h4 className="timelinePaperTitle">
                                                    <LatexText text={paper.title} forceInlineMath />
                                                </h4>
                                                <div className="timelineMetaRow">
                                                    <span className="timelineMetaLabel">作者：</span>
                                                    <div className="timelineMetaContent">
                                                        {renderPaperAuthors(paper)}
                                                    </div>
                                                </div>
                                                <div className="timelineMetaRow">
                                                    <span className="timelineMetaLabel">摘要：</span>
                                                    <div className="timelineMetaContent timelineAbstractContent">
                                                        <LatexText text={paper.tldr || paper.abstract || "暂无摘要"} />
                                                    </div>
                                                </div>
                                            </article>
                                        );
                                    })}

                                    {shouldRenderLoadMorePreview && renderFeedPreviewCards({
                                        count: LOAD_MORE_PREVIEW_COUNT,
                                        keyPrefix: "feed-load-more",
                                        testId: "timeline-feed-load-more-preview",
                                        stackClassName: "timelineFeedPreviewStack timelineFeedPreviewStackLoadMore",
                                    })}
                                </div>
                            )}

                            {shouldRenderEmptyFeedState && (
                                <div className="timelineEmptyState">
                                    当前研究方向下暂无论文数据。
                                </div>
                            )}

                            {shouldRenderFeedHint && (
                                <div className="timelineFeedHint">
                                    {hasMoreBefore
                                        ? "已到当前方向末尾；向上滑到顶部会立即补回更早加载过的论文。"
                                        : "这个方向的论文已经浏览到底。"}
                                </div>
                            )}
                        </div>
                    </section>
                </div>
            )}

            {!loadingDirections && errorMessage === "" && directions.length === 0 && (
                <div style={{ padding: 12, border: "1px dashed #ccc" }}>
                    暂无时间线数据。
                </div>
            )}

            <style jsx>{`
                .timelinePageShell {
                    --timeline-sticky-top: 64px;
                    --timeline-surface: #ffffff;
                    --timeline-surface-muted: #f6f8fb;
                    --timeline-border: #d8dee6;
                    --timeline-text-muted: #687384;
                    --timeline-accent: #0c63a6;
                    --timeline-accent-soft: #ebf5ff;
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                    max-width: 1160px;
                    height: calc(100vh - 158px);
                    overflow: hidden;
                }

                .timelinePageHeader {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 16px;
                }

                .timelineContentLayout {
                    display: grid;
                    grid-template-columns: 240px minmax(0, 1fr);
                    gap: 24px;
                    align-items: stretch;
                    flex: 1;
                    min-height: 0;
                    overflow: hidden;
                }

                .timelineDirectionsPanel {
                    display: flex;
                    flex-direction: column;
                    gap: 14px;
                    border: 1px solid var(--timeline-border);
                    border-radius: 20px;
                    padding: 18px 16px;
                    background: var(--timeline-surface);
                    box-shadow: none;
                    position: static;
                    align-self: stretch;
                    height: 100%;
                    max-height: none;
                    overflow-y: auto;
                    overscroll-behavior: contain;
                }

                .timelineDirectionsPanelTitle {
                    margin: 0;
                }

                .timelineDirectionList {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }

                .timelineDirectionButton {
                    text-align: left;
                    padding: 10px 12px;
                    border-radius: 6px;
                    border: 1px solid #ccc;
                    background: #fff;
                    cursor: pointer;
                    transition: border-color 0.16s ease, background-color 0.16s ease;
                }

                .timelineDirectionButton:hover,
                .timelineDirectionButton:focus-visible {
                    border-color: #0d6efd;
                    background: #ffffff;
                    outline: none;
                }

                .timelineDirectionButtonActive {
                    border-color: #0d6efd;
                    background: #e7f1ff;
                    box-shadow: none;
                }

                .timelineDirectionCount {
                    margin-top: 4px;
                    font-size: 12px;
                    color: #666;
                }

                .timelineMainPanel {
                    display: flex;
                    flex-direction: column;
                    gap: 14px;
                    min-height: 0;
                    height: 100%;
                    overflow: hidden;
                }

                .timelineFeedHeader {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    gap: 16px;
                    padding: 18px 20px;
                    border: 1px solid var(--timeline-border);
                    border-radius: 20px;
                    background: #ffffff;
                    box-shadow: none;
                }

                .timelineFeedSummaryText {
                    margin: 0;
                    color: var(--timeline-text-muted);
                    font-size: 14px;
                }

                .timelineFeedStats {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    align-items: flex-end;
                    color: var(--timeline-text-muted);
                    font-size: 13px;
                    white-space: nowrap;
                }

                .timelineFeedStatsSkeleton {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    align-items: flex-end;
                    min-width: 132px;
                }

                .timelineFeedStatsSkeletonLine {
                    display: block;
                    width: 72px;
                    height: 12px;
                    border-radius: 999px;
                }

                .timelineFeedStatsSkeletonLineWide {
                    width: 112px;
                }

                .timelineFeedViewport {
                    flex: 1;
                    min-height: 0;
                    overflow-y: auto;
                    overscroll-behavior: contain;
                    padding-right: 4px;
                }

                .timelineFeedList,
                .timelineSkeletonStack {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }

                .timelineFeedPreviewStack {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }

                .timelineFeedPreviewStackLoadMore {
                    width: 100%;
                }

                .timelineFeedPreviewCard {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                    min-height: 182px;
                    padding: 18px 16px 20px;
                    border: 1px solid #d8dee8;
                    border-radius: 14px;
                    background: #fff;
                    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
                }

                .timelineFeedPreviewHeaderRow {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                }

                .timelineFeedPreviewTagRow {
                    display: inline-flex;
                    gap: 8px;
                    flex-wrap: wrap;
                }

                .timelineFeedPreviewMetaRow {
                    display: flex;
                    align-items: flex-start;
                    gap: 12px;
                }

                .timelineFeedPreviewParagraph {
                    display: flex;
                    flex: 1;
                    flex-direction: column;
                    gap: 10px;
                }

                .timelineFeedPreviewBar {
                    display: block;
                    position: relative;
                    overflow: hidden;
                    border-radius: 999px;
                    background: #e3e9f0;
                    animation: timelineSkeletonPulse 1.6s ease-in-out infinite;
                }

                .timelineFeedPreviewBar::after {
                    content: "";
                    position: absolute;
                    top: 0;
                    bottom: 0;
                    left: -60%;
                    width: 60%;
                    transform: translateX(-100%);
                    background: linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.92) 50%, rgba(255, 255, 255, 0) 100%);
                    animation: timelineSkeletonShimmer 1.15s ease-in-out infinite;
                    will-change: transform;
                }

                .timelineFeedPreviewBarDate {
                    width: 92px;
                    height: 14px;
                }

                .timelineFeedPreviewBarTag {
                    width: 54px;
                    height: 22px;
                    border-radius: 6px;
                }

                .timelineFeedPreviewBarTagWide {
                    width: 72px;
                }

                .timelineFeedPreviewBarTitle {
                    width: 74%;
                    height: 26px;
                }

                .timelineFeedPreviewBarLabel {
                    width: 44px;
                    height: 14px;
                    flex: 0 0 auto;
                }

                .timelineFeedPreviewBarMeta {
                    width: 38%;
                    height: 14px;
                    margin-top: 1px;
                }

                .timelineFeedPreviewBarParagraph {
                    height: 13px;
                }

                .timelineFeedPreviewBarParagraphFull {
                    width: 100%;
                }

                .timelineFeedPreviewBarParagraphShort {
                    width: 68%;
                }

                .timelineFeedListReveal {
                    animation: timelineFeedFadeIn ${INITIAL_SKELETON_FADE_MS}ms ease-out;
                }

                .timelineFeedCard,
                .timelineSkeletonCard {
                    border: 1px solid #ccc;
                    border-radius: 8px;
                    padding: 16px;
                    background: #fff;
                    box-shadow: none;
                }

                .timelineFeedCard {
                    transition: none;
                }

                .timelineFeedCard:hover {
                    transform: none;
                    box-shadow: none;
                }

                .timelinePaperTitle {
                    margin: 0 0 10px;
                    font-size: 18px;
                    line-height: 1.45;
                    color: #1f2328;
                }

                .timelinePaperHeaderRow {
                    display: flex;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 10px;
                    margin-bottom: 8px;
                    font-size: 13px;
                    color: #666;
                }

                .timelinePaperDate {
                    color: var(--timeline-text-muted);
                }

                .timelinePaperLinks {
                    color: rgb(45, 45, 45);
                    font-size: 14px;
                    line-height: 1.4;
                }

                .timelinePaperLinks a,
                :global(a.timelineMentorLink) {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    height: 20px;
                    color: var(--timeline-accent);
                    text-decoration: none;
                    transition: color 0.16s ease, border-color 0.16s ease;
                    border-bottom: 1px dashed transparent;
                    line-height: 1;
                    vertical-align: middle;
                }

                .timelinePaperLinks a:hover,
                .timelinePaperLinks a:focus-visible,
                :global(a.timelineMentorLink:hover),
                :global(a.timelineMentorLink:focus-visible) {
                    color: rgb(45, 45, 45);
                    border-bottom-color: rgb(45, 45, 45);
                    outline: none;
                }

                .timelineSubjectTags {
                    display: inline-flex;
                    flex-wrap: wrap;
                    gap: 10px;
                }

                .timelineSubjectTag {
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

                :global(img.timelineMentorIcon) {
                    width: 14px;
                    height: 14px;
                    object-fit: contain;
                    display: block;
                    flex: 0 0 auto;
                }

                .timelineMetaRow {
                    font-size: 14px;
                    line-height: 1.6;
                }

                .timelineMetaLabel,
                .timelineMetaContent {
                    font-size: 14px;
                }

                .timelineMetaLabel {
                    color: #1f2328;
                    font-weight: 600;
                }

                .timelineMetaContent {
                    color: #3f4854;
                }

                .timelineSkeletonCard {
                    overflow: hidden;
                    position: relative;
                    background: #fff;
                    padding: 18px 20px;
                }

                .timelineSkeletonBlock {
                    position: relative;
                    overflow: hidden;
                    background: #e3e9f0;
                    animation: timelineSkeletonPulse 1.6s ease-in-out infinite;
                }

                .timelineSkeletonBlock::after {
                    content: "";
                    position: absolute;
                    top: 0;
                    bottom: 0;
                    left: -60%;
                    width: 60%;
                    transform: translateX(-100%);
                    background: linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.92) 50%, rgba(255, 255, 255, 0) 100%);
                    animation: timelineSkeletonShimmer 1.15s ease-in-out infinite;
                    will-change: transform;
                }

                .timelineSkeletonLine,
                .timelineSkeletonTag {
                    display: block;
                    border-radius: 999px;
                }

                .timelineSkeletonLine {
                    height: 12px;
                }

                .timelineSkeletonHeaderRow {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                    margin-bottom: 18px;
                }

                .timelineSkeletonChipRow {
                    display: inline-flex;
                    flex-wrap: wrap;
                    justify-content: flex-end;
                    gap: 8px;
                    flex: 1;
                }

                .timelineSkeletonLineEyebrow {
                    height: 11px;
                    border-radius: 999px;
                    flex: 0 0 auto;
                }

                .timelineSkeletonLineTitle {
                    height: 22px;
                    border-radius: 999px;
                    margin-bottom: 18px;
                }

                .timelineSkeletonMetaRows {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    margin-bottom: 18px;
                }

                .timelineSkeletonMetaRow {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .timelineSkeletonTag {
                    height: 22px;
                    border-radius: 999px;
                }

                .timelineSkeletonMetaLabel {
                    width: 42px;
                    height: 12px;
                    border-radius: 999px;
                    flex: 0 0 auto;
                }

                .timelineSkeletonLineMeta {
                    height: 12px;
                    border-radius: 999px;
                    flex: 0 0 auto;
                }

                .timelineSkeletonParagraph {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }

                .timelineSkeletonLineParagraph {
                    height: 11px;
                    border-radius: 999px;
                }

                .timelineDirectionSkeletonList {
                    width: 100%;
                }

                .timelineDirectionLoadingCard {
                    cursor: default;
                    pointer-events: none;
                    opacity: 1;
                }

                .timelineDirectionLoadingBar {
                    display: block;
                    border-radius: 999px;
                    position: relative;
                    z-index: 1;
                    animation: timelineSkeletonPulse 1.6s ease-in-out infinite;
                }

                .timelineDirectionLoadingBar::after {
                    content: "";
                    position: absolute;
                    top: 0;
                    bottom: 0;
                    left: -60%;
                    width: 60%;
                    transform: translateX(-100%);
                    background: linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.92) 50%, rgba(255, 255, 255, 0) 100%);
                    animation: timelineSkeletonShimmer 1.15s ease-in-out infinite;
                    will-change: transform;
                }

                .timelineFeedHeaderLoadingBar {
                    display: block;
                    border-radius: 999px;
                    position: relative;
                    animation: timelineSkeletonPulse 1.6s ease-in-out infinite;
                }

                .timelineFeedHeaderLoadingBar::after {
                    content: "";
                    position: absolute;
                    top: 0;
                    bottom: 0;
                    left: -60%;
                    width: 60%;
                    transform: translateX(-100%);
                    background: linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.92) 50%, rgba(255, 255, 255, 0) 100%);
                    animation: timelineSkeletonShimmer 1.15s ease-in-out infinite;
                    will-change: transform;
                }

                .timelineFeedHeaderSkeleton {
                    align-items: center;
                }

                .timelineFeedHeaderPrimarySkeleton,
                .timelineFeedHeaderSecondarySkeleton {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }

                .timelineFeedHeaderPrimarySkeleton {
                    flex: 1;
                    min-width: 0;
                }

                .timelineFeedHeaderSecondarySkeleton {
                    align-items: flex-end;
                    flex: 0 0 auto;
                }

                .timelineFeedHeaderSkeletonTitle {
                    display: block;
                    width: min(240px, 56%);
                    height: 24px;
                    border-radius: 999px;
                }

                .timelineFeedHeaderSkeletonSummary {
                    display: block;
                    width: min(320px, 74%);
                    height: 14px;
                    border-radius: 999px;
                }

                .timelineFeedHeaderSkeletonStat {
                    display: block;
                    width: 96px;
                    height: 12px;
                    border-radius: 999px;
                }

                .timelineFeedHeaderSkeletonStatShort {
                    width: 132px;
                }

                .timelineEmptyState,
                .timelineErrorBanner,
                .timelineFeedHint {
                    padding: 14px 16px;
                    border-radius: 16px;
                }

                .timelineEmptyState {
                    border: 1px dashed var(--timeline-border);
                    background: var(--timeline-surface-muted);
                    color: var(--timeline-text-muted);
                }

                .timelineErrorBanner {
                    border: 1px solid #f1aeb5;
                    background-color: #f8d7da;
                }

                .timelineFeedHint {
                    text-align: center;
                    color: var(--timeline-text-muted);
                    font-size: 13px;
                    margin-top: 14px;
                }

                @keyframes timelineSkeletonShimmer {
                    from {
                        transform: translateX(-100%);
                    }

                    to {
                        transform: translateX(260%);
                    }
                }

                @keyframes timelineSkeletonPulse {
                    0%,
                    100% {
                        background-color: #e3e9f0;
                    }

                    50% {
                        background-color: #d7e0ea;
                    }
                }

                @keyframes timelinePreviewBarShimmer {
                    from {
                        background-position: 200% 0;
                    }

                    to {
                        background-position: -200% 0;
                    }
                }

                @keyframes timelineFeedFadeIn {
                    from {
                        opacity: 0;
                        transform: translateY(4px);
                    }

                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                @media (max-width: 900px) {
                    .timelinePageHeader {
                        flex-direction: column;
                        align-items: stretch;
                    }

                    .timelinePageShell {
                        height: calc(100vh - 158px);
                    }

                    .timelineContentLayout {
                        grid-template-columns: minmax(0, 1fr);
                        grid-template-rows: auto minmax(0, 1fr);
                    }

                    .timelineDirectionsPanel,
                    .timelineMainPanel {
                        min-height: 0;
                    }

                    .timelineDirectionsPanel {
                        padding: 14px;
                        height: auto;
                        overflow-y: hidden;
                    }

                    .timelineDirectionList {
                        flex-direction: row;
                        overflow-x: auto;
                        padding-bottom: 2px;
                    }

                    .timelineDirectionButton {
                        flex: 0 0 220px;
                    }

                    .timelineDirectionLoadingCard {
                        flex: 0 0 220px;
                    }

                    .timelineFeedHeader {
                        flex-direction: column;
                        align-items: stretch;
                    }

                    .timelineFeedStats {
                        align-items: flex-start;
                        white-space: normal;
                    }

                    .timelineFeedStatsSkeleton {
                        align-items: flex-start;
                    }

                    .timelineFeedHeaderSecondarySkeleton {
                        align-items: flex-start;
                    }

                    .timelineFeedViewport {
                        padding-right: 0;
                    }
                }

                @media (max-width: 720px) {
                    .timelineSkeletonHeaderRow {
                        flex-direction: column;
                        align-items: flex-start;
                    }

                    .timelineSkeletonChipRow {
                        justify-content: flex-start;
                    }

                    .timelineFeedHeaderSkeletonTitle,
                    .timelineFeedHeaderSkeletonSummary,
                    .timelineFeedHeaderSkeletonStat,
                    .timelineFeedHeaderSkeletonStatShort {
                        width: 100%;
                    }
                }
            `}</style>
        </div>
    );
};

export default TimelinePage;
