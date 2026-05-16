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
const MAX_RENDERED_PAPERS = 20;
const DEFAULT_TIMELINE_LIMIT = 20;
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

type TimelineLoadMode = "replace" | "prepend" | "append";
type ScrollAdjustment =
    | { type: "prepend"; addedIds: number[]; direction: "up" | "down"; }
    | { type: "append-trim"; removedHeight: number; direction: "up" | "down"; }
    | undefined;

const createSkeletonKeys = (count: number, prefix: string) => (
    Array.from({ length: count }, (_, idx) => `${prefix}-${idx}`)
);

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
    const [loadingNext, setLoadingNext] = useState(false);
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
    const inFlightRef = useRef({
        replace: false,
        prepend: false,
        append: false,
    });
    const scrollDirectionRef = useRef<"up" | "down">("down");
    const lastFeedScrollTopRef = useRef(0);
    const skipNextScrollEventRef = useRef(false);

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
            const overflow = Math.max(mergedPapers.length - MAX_RENDERED_PAPERS, 0);
            const trimmedHead = overflow > 0 ? mergedPapers.slice(0, overflow) : [];
            const removedHeight = trimmedHead.reduce((sum, paper) => (
                sum + (paperRefs.current[paper.id]?.offsetHeight || 0)
            ), 0);
            const visiblePapers = overflow > 0 ? mergedPapers.slice(overflow) : mergedPapers;
            const nextStartOffset = currentStartOffset + trimmedHead.length;

            pendingScrollAdjustmentRef.current = removedHeight > 0
                ? { type: "append-trim", removedHeight, direction: "down" }
                : undefined;

            setPapers(visiblePapers);
            setWindowStartOffset(nextStartOffset);
            setHasMoreBefore(Boolean(response.has_previous) || nextStartOffset > 0);
            setHasMoreAfter(Boolean(response.has_next));
            return;
        }

        const uniqueIncoming = nextPapers.filter((paper) => !existingIds.has(paper.id));
        const mergedPapers = [...uniqueIncoming, ...currentPapers];
        const overflow = Math.max(mergedPapers.length - MAX_RENDERED_PAPERS, 0);
        const visiblePapers = overflow > 0 ? mergedPapers.slice(0, mergedPapers.length - overflow) : mergedPapers;

        pendingScrollAdjustmentRef.current = uniqueIncoming.length > 0
            ? {
                type: "prepend",
                addedIds: uniqueIncoming.map((paper) => paper.id),
                direction: "up",
            }
            : undefined;

        setPapers(visiblePapers);
        setWindowStartOffset(normalizedOffset);
        setHasMoreBefore(Boolean(response.has_previous));
        setHasMoreAfter(Boolean(response.has_next) || hasMoreAfterRef.current || overflow > 0 || normalizedLimit < currentPapers.length);
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
            }
        }
    };

    useEffect(() => {
        const fetchDirectionOverview = async () => {
            setLoadingDirections(true);
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
            setPapers([]);
            setTotalPapers(0);
            setWindowStartOffset(0);
            setHasMoreBefore(false);
            setHasMoreAfter(false);
            return;
        }

        directionGenerationRef.current += 1;
        const generation = directionGenerationRef.current;
        inFlightRef.current = {
            replace: false,
            prepend: false,
            append: false,
        };
        pendingScrollAdjustmentRef.current = undefined;
        setLoadingPrevious(false);
        setLoadingNext(false);
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

    const loadNextBatch = () => {
        if (
            activeDirectionRef.current === ""
            || !hasMoreAfterRef.current
            || hasAnyFeedLoadInFlight()
        ) {
            return;
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
        const viewport = feedViewportRef.current;
        if (
            viewport === undefined
            || !hasMoreAfterRef.current
            || hasAnyFeedLoadInFlight()
            || scrollDirectionRef.current !== "down"
        ) {
            return;
        }

        if (viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 160) {
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
        if (pendingAdjustment === undefined || viewport === undefined) {
            return;
        }

        pendingScrollAdjustmentRef.current = undefined;

        if (pendingAdjustment.type === "prepend") {
            const addedHeight = pendingAdjustment.addedIds.reduce((sum, id) => (
                sum + (paperRefs.current[id]?.offsetHeight || 0)
            ), 0);

            if (addedHeight > 0) {
                skipNextScrollEventRef.current = true;
                viewport.scrollTop += addedHeight;
                lastFeedScrollTopRef.current = viewport.scrollTop;
                scrollDirectionRef.current = pendingAdjustment.direction;
            }

            return;
        }

        if (pendingAdjustment.removedHeight > 0) {
            skipNextScrollEventRef.current = true;
            viewport.scrollTop = Math.max(0, viewport.scrollTop - pendingAdjustment.removedHeight);
            lastFeedScrollTopRef.current = viewport.scrollTop;
            scrollDirectionRef.current = pendingAdjustment.direction;
        }
    }, [papers]);

    const renderSkeletonStack = (count: number, position: "top" | "initial" | "bottom") => (
        <div
            className={`timelineSkeletonStack timelineSkeletonStack${position[0].toUpperCase()}${position.slice(1)}`}
            data-testid={`timeline-skeleton-${position}`}
        >
            {createSkeletonKeys(count, position).map((key) => (
                <article key={key} className="timelineSkeletonCard" aria-hidden="true">
                    <div className="timelineSkeletonLine timelineSkeletonLineSm" />
                    <div className="timelineSkeletonLine timelineSkeletonLineLg" />
                    <div className="timelineSkeletonTagRow">
                        <span className="timelineSkeletonTag" />
                        <span className="timelineSkeletonTag" />
                    </div>
                    <div className="timelineSkeletonMeta">
                        <div className="timelineSkeletonLine timelineSkeletonLineMd" />
                        <div className="timelineSkeletonLine timelineSkeletonLineMd" />
                    </div>
                    <div className="timelineSkeletonParagraph">
                        <div className="timelineSkeletonLine timelineSkeletonLineFull" />
                        <div className="timelineSkeletonLine timelineSkeletonLineFull" />
                        <div className="timelineSkeletonLine timelineSkeletonLineShort" />
                    </div>
                </article>
            ))}
        </div>
    );

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

            {loadingDirections && (
                <div style={{ padding: 12, border: "1px dashed #ccc" }}>
                    正在加载时间线方向...
                </div>
            )}

            {!loadingDirections && errorMessage !== "" && (
                <div className="timelineErrorBanner">
                    {errorMessage}
                </div>
            )}

            {!loadingDirections && directions.length > 0 && (
                <div className="timelineContentLayout">
                    <aside className="timelineDirectionsPanel">
                        <h3 style={{ marginTop: 0 }}>研究方向</h3>
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
                    </aside>

                    <section className="timelineMainPanel">
                        <div className="timelineFeedHeader">
                            <div>
                                <h3 style={{ margin: "0 0 6px" }}>{activeDirection || "未选择研究方向"}</h3>
                                <p className="timelineFeedSummaryText">
                                    {activeDirectionSummary ? `${activeDirectionSummary.paper_count} 篇归档论文` : "按时间倒序浏览最新论文"}
                                </p>
                            </div>
                            <div className="timelineFeedStats">
                                <span>共 {totalPapers} 篇</span>
                                <span>{papers.length > 0 ? `当前显示第 ${visibleStart}-${visibleEnd} 篇` : "等待加载"}</span>
                            </div>
                        </div>
                        <div
                            ref={(element) => {
                                feedViewportRef.current = element ?? undefined;
                            }}
                            className="timelineFeedViewport"
                            data-testid="timeline-feed-viewport"
                            onScroll={handleFeedViewportScroll}
                        >
                            {loadingInitial && papers.length === 0 && renderSkeletonStack(INITIAL_BATCH_SIZE, "initial")}
                            {!loadingInitial && loadingPrevious && renderSkeletonStack(WINDOW_BATCH_SIZE, "top")}

                            {!loadingInitial && papers.length > 0 && (
                                <div className="timelineFeedList">
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
                                </div>
                            )}

                            {!loadingInitial && papers.length === 0 && (
                                <div className="timelineEmptyState">
                                    当前研究方向下暂无论文数据。
                                </div>
                            )}

                            {!loadingInitial && loadingNext && renderSkeletonStack(WINDOW_BATCH_SIZE, "bottom")}

                            {!loadingInitial && papers.length > 0 && (
                                <div className="timelineFeedHint">
                                    {hasMoreBefore || hasMoreAfter
                                        ? "继续滚动以加载更多；向上滑到顶部会立即补回更早加载过的论文。"
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
                    border: 1px solid transparent;
                    border-radius: 8px;
                    padding: 12px;
                    background: transparent;
                    box-shadow: none;
                    position: static;
                    align-self: stretch;
                    height: 100%;
                    max-height: none;
                    overflow-y: auto;
                    overscroll-behavior: contain;
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
                    background:
                        linear-gradient(90deg, rgba(240, 244, 248, 0.9) 0%, rgba(227, 233, 240, 0.95) 50%, rgba(240, 244, 248, 0.9) 100%);
                    background-size: 200% 100%;
                    animation: timelineSkeletonShimmer 1.4s linear infinite;
                }

                .timelineSkeletonLine,
                .timelineSkeletonTag {
                    display: block;
                    border-radius: 999px;
                    background: rgba(255, 255, 255, 0.86);
                }

                .timelineSkeletonLine {
                    height: 12px;
                }

                .timelineSkeletonLineSm {
                    width: 96px;
                    margin-bottom: 16px;
                }

                .timelineSkeletonLineLg {
                    width: 72%;
                    height: 20px;
                    margin-bottom: 18px;
                }

                .timelineSkeletonLineMd {
                    width: 52%;
                }

                .timelineSkeletonLineFull {
                    width: 100%;
                }

                .timelineSkeletonLineShort {
                    width: 64%;
                }

                .timelineSkeletonTagRow {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 18px;
                }

                .timelineSkeletonTag {
                    width: 64px;
                    height: 22px;
                }

                .timelineSkeletonMeta,
                .timelineSkeletonParagraph {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .timelineSkeletonMeta {
                    margin-bottom: 18px;
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
                    0% {
                        background-position: 200% 0;
                    }

                    100% {
                        background-position: -200% 0;
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

                    .timelineFeedHeader {
                        flex-direction: column;
                        align-items: stretch;
                    }

                    .timelineFeedStats {
                        align-items: flex-start;
                        white-space: normal;
                    }

                    .timelineFeedViewport {
                        padding-right: 0;
                    }
                }
            `}</style>
        </div>
    );
};

export default TimelinePage;
