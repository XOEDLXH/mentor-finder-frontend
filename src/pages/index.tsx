import { RootState } from "../redux/store";
import { useSelector } from "react-redux";
import { useEffect, useRef, useState } from "react";
import LatexText from "../components/LatexText";
import { request } from "../utils/network";
import {
    WeeklyPushHistoryResponse,
    WeeklyPushItem,
    WeeklyPushPaper,
    WeeklyPushSubjectGroup,
    WeeklyPushResponse,
} from "../utils/types";

const GENERATED_BY_LABELS: Record<string, string> = {
    rule: "规则摘要",
    "thucs-openai": "AI摘要",
};
const WEEKLY_PUSH_PAPERS_PER_VIEW = 2;
const WEEKLY_PUSH_CAROUSEL_GAP = 12;

const formatGeneratedBy = (generatedBy: string) => GENERATED_BY_LABELS[generatedBy] || generatedBy;

const getErrorMessage = (error: unknown) => {
    if (error instanceof Error && error.message.trim() !== "") {
        return error.message;
    }
    return "个性周报生成失败，请稍后重试。";
};

const fetchPersonalizedWeeklyPush = async (weekStart?: string) => {
    const query = weekStart
        ? `?week_start=${encodeURIComponent(weekStart)}`
        : "";
    return request<WeeklyPushResponse>(
        `/api/dataset/weekly-push/personalized${query}`,
        "GET",
        true,
    );
};

const fetchPersonalizedWeeklyPushHistory = async () => (
    request<WeeklyPushHistoryResponse>(
        "/api/dataset/weekly-push/personalized/history",
        "GET",
        true,
    )
);

const syncWeeklyPushCarouselControls = (
    viewport: HTMLDivElement,
    setCanScrollPrev: (value: boolean) => void,
    setCanScrollNext: (value: boolean) => void,
) => {
    const maxScrollLeft = Math.max(viewport.scrollWidth - viewport.clientWidth, 0);
    setCanScrollPrev(viewport.scrollLeft > 4);
    setCanScrollNext(viewport.scrollLeft < maxScrollLeft - 4);
};

const getWeeklyPushCarouselScrollStep = (viewport: HTMLDivElement) => {
    const firstCard = viewport.querySelector<HTMLElement>("[data-weekly-push-paper-card='true']") ?? undefined;
    if (firstCard !== undefined) {
        return firstCard.offsetWidth + WEEKLY_PUSH_CAROUSEL_GAP;
    }
    return viewport.clientWidth / WEEKLY_PUSH_PAPERS_PER_VIEW;
};

interface WeeklyPushPaperListProps {
    papers: WeeklyPushPaper[];
    emptyText: string;
    showMentorNames?: boolean;
}

const WeeklyPushPaperList = ({
    papers,
    emptyText,
    showMentorNames = false,
}: WeeklyPushPaperListProps) => {
    const viewportRef = useRef<HTMLDivElement | undefined>(undefined);
    const [canScrollPrev, setCanScrollPrev] = useState(false);
    const [canScrollNext, setCanScrollNext] = useState(
        papers.length > WEEKLY_PUSH_PAPERS_PER_VIEW,
    );

    const scrollCarousel = (direction: -1 | 1) => {
        const viewport = viewportRef.current;
        if (viewport === undefined) {
            return;
        }

        const nextLeft = viewport.scrollLeft + direction * getWeeklyPushCarouselScrollStep(viewport);
        if (typeof viewport.scrollBy === "function") {
            viewport.scrollBy({
                left: direction * getWeeklyPushCarouselScrollStep(viewport),
                behavior: "smooth",
            });
            return;
        }

        viewport.scrollLeft = nextLeft;
        syncWeeklyPushCarouselControls(viewport, setCanScrollPrev, setCanScrollNext);
    };

    const handleViewportScroll = () => {
        const viewport = viewportRef.current;
        if (viewport === undefined) {
            return;
        }
        syncWeeklyPushCarouselControls(viewport, setCanScrollPrev, setCanScrollNext);
    };

    useEffect(() => {
        const viewport = viewportRef.current;
        if (viewport === undefined) {
            return;
        }

        if (typeof viewport.scrollTo === "function") {
            viewport.scrollTo({ left: 0, behavior: "auto" });
        }
        else {
            viewport.scrollLeft = 0;
        }
        syncWeeklyPushCarouselControls(viewport, setCanScrollPrev, setCanScrollNext);
    }, [papers]);

    useEffect(() => {
        if (typeof window === "undefined") {
            return undefined;
        }

        const handleResize = () => {
            const viewport = viewportRef.current;
            if (viewport === undefined) {
                return;
            }
            syncWeeklyPushCarouselControls(viewport, setCanScrollPrev, setCanScrollNext);
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    if (papers.length === 0) {
        return <div style={{ color: "#666" }}>{emptyText}</div>;
    }

    return (
        <div className="homeWeeklyPaperCarouselShell">
            {papers.length > WEEKLY_PUSH_PAPERS_PER_VIEW && (
                <div className="homeWeeklyPaperCarouselControls">
                    <button
                        type="button"
                        className="homeWeeklyPaperCarouselButton"
                        onClick={() => scrollCarousel(-1)}
                        disabled={!canScrollPrev}
                    >
                        上一篇
                    </button>
                    <button
                        type="button"
                        className="homeWeeklyPaperCarouselButton"
                        onClick={() => scrollCarousel(1)}
                        disabled={!canScrollNext}
                    >
                        下一篇
                    </button>
                </div>
            )}
            <div
                ref={(node) => {
                    viewportRef.current = node ?? undefined;
                }}
                className="homeWeeklyPaperCarouselViewport"
                onScroll={handleViewportScroll}
            >
                <div className="homeWeeklyPaperCarouselTrack">
                    {papers.map((paper) => (
                        <article
                            key={paper.id}
                            data-weekly-push-paper-card="true"
                            className="homeWeeklyPaperCarouselCard"
                        >
                            <div style={{ border: "1px solid #eee", borderRadius: 6, padding: 10, backgroundColor: "#fff", minHeight: "100%" }}>
                                <div style={{ fontWeight: 600 }}>
                                    {paper.arxivUrl ? (
                                        <a href={paper.arxivUrl} target="_blank" rel="noreferrer">
                                            <LatexText text={paper.title} forceInlineMath />
                                        </a>
                                    ) : (
                                        <LatexText text={paper.title} forceInlineMath />
                                    )}
                                </div>
                                <div className="homeWeeklyPaperMeta">
                                    <div className="homeWeeklyPaperAuthors">
                                        作者：{paper.authorNames || "未知"}
                                    </div>
                                    <div className="homeWeeklyPaperDate">
                                        {paper.publishDate || "未知日期"}
                                    </div>
                                </div>
                                {showMentorNames && paper.mentorNames && paper.mentorNames.length > 0 && (
                                    <div style={{ fontSize: 13, color: "#0f5c4d", marginTop: 4 }}>
                                        关联导师：{paper.mentorNames.join("、")}
                                    </div>
                                )}
                                <div className="homeWeeklyPaperAbstractRow">
                                    <div className="homeWeeklyPaperAbstractContent">
                                        <LatexText text={paper.tldr || paper.abstract || "暂无摘要"} />
                                    </div>
                                </div>
                            </div>
                        </article>
                    ))}
                </div>
            </div>
        </div>
    );
};

interface WeeklyPushSubjectGroupsProps {
    groups: WeeklyPushSubjectGroup[];
}

const WeeklyPushSubjectGroups = ({ groups }: WeeklyPushSubjectGroupsProps) => {
    if (groups.length === 0) {
        return (
            <div className="homePersonalizedPlaceholder">
                你关注的板块本周暂无新增论文。
            </div>
        );
    }

    return (
        <div className="homeSubjectGroupStack">
            {groups.map((group) => (
                <section className="homeSubjectGroupCard" key={group.subject}>
                    <div className="homeSubjectGroupHeader">
                        <h4>{group.subject}</h4>
                        <span>{group.paperCount} 篇</span>
                    </div>
                    <div className="homeSubjectPaperList">
                        {group.papers.map((paper) => (
                            <article className="homeSubjectPaperItem" key={`${group.subject}-${paper.id}`}>
                                <div className="homeSubjectPaperTitle">
                                    <LatexText text={paper.title} forceInlineMath />
                                </div>
                                <div className="homeSubjectPaperMeta">
                                    作者：{paper.authorNames || "未知"} ｜ {paper.publishDate || "未知日期"} ｜ 分类：{paper.subjects.join(", ") || group.subject}
                                </div>
                                <div className="homePersonalizedLatexText">
                                    <LatexText text={paper.abstractPreview || "暂无摘要"} />
                                </div>
                            </article>
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
};

interface WeeklyPushDetailCardProps {
    push: WeeklyPushItem;
    emptyPaperText: string;
    showMentorNames?: boolean;
    showPersonalizedSummary?: boolean;
    metaItems?: string[];
}

const WeeklyPushDetailCard = ({
    push,
    emptyPaperText,
    showMentorNames = false,
    showPersonalizedSummary = false,
    metaItems = [],
}: WeeklyPushDetailCardProps) => {
    const distinctAiSummary = push.aiSummary.trim() !== "" && push.aiSummary !== push.fixedSummary;
    const resolvedMetaItems = [
        `周期：${push.weekStart} ~ ${push.weekEnd}`,
        `论文数：${push.paperCount}`,
        ...metaItems,
        `生成方式：${formatGeneratedBy(push.generatedBy)}`,
    ];

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontWeight: 600 }}>{push.title}</div>
            <div style={{ fontSize: 13, color: "#666" }}>{resolvedMetaItems.join(" ｜ ")}</div>
            {showPersonalizedSummary ? (
                <div className="homePersonalizedSummaryStack">
                    {distinctAiSummary ? (
                        <>
                            <div className="homePersonalizedSummaryBlock">
                                <div className="homePersonalizedSummaryLabel">周概览</div>
                                <div className="homePersonalizedLatexText">
                                    <LatexText text={push.fixedSummary} />
                                </div>
                            </div>
                            <div className="homePersonalizedSummaryBlock homePersonalizedSummaryBlockAccent">
                                <div className="homePersonalizedSummaryLabel">AI总结</div>
                                <div className="homePersonalizedLatexText">
                                    <LatexText text={push.aiSummary} />
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="homePersonalizedSummaryBlock">
                            <div className="homePersonalizedSummaryLabel">摘要结果</div>
                            <div className="homePersonalizedLatexText">
                                <LatexText text={push.content} />
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{push.content}</div>
            )}
            <div>
                <h4 style={{ margin: "12px 0 8px" }}>本周论文</h4>
                <WeeklyPushPaperList
                    papers={push.papers}
                    emptyText={emptyPaperText}
                    showMentorNames={showMentorNames}
                />
            </div>
            {showPersonalizedSummary && (
                <div>
                    <h4 style={{ margin: "12px 0 8px" }}>关注板块动态</h4>
                    <WeeklyPushSubjectGroups groups={push.subjectGroups || []} />
                </div>
            )}
        </div>
    );
};

const HomeScreen = () => {
    const auth = useSelector((state: RootState) => state.auth);
    const isLoggedIn = auth.token !== "";
    const [weeklyPush, setWeeklyPush] = useState<WeeklyPushItem | undefined>(undefined);
    const [weeklyPushHistory, setWeeklyPushHistory] = useState<WeeklyPushHistoryResponse["history"]>([]);
    const [selectedWeekStart, setSelectedWeekStart] = useState("");
    const [personalizedWeeklyPush, setPersonalizedWeeklyPush] = useState<WeeklyPushItem | undefined>(undefined);
    const [personalizedWeeklyPushHistory, setPersonalizedWeeklyPushHistory] = useState<WeeklyPushHistoryResponse["history"]>([]);
    const [selectedPersonalizedWeekStart, setSelectedPersonalizedWeekStart] = useState("");
    const [isGeneratingPersonalized, setIsGeneratingPersonalized] = useState(false);
    const [personalizedError, setPersonalizedError] = useState("");

    useEffect(() => {
        const loadWeeklyPush = async () => {
            try {
                const [latestRes, historyRes] = await Promise.all([
                    request<WeeklyPushResponse>("/api/dataset/weekly-push/latest", "GET", false),
                    request<WeeklyPushHistoryResponse>("/api/dataset/weekly-push/history", "GET", false),
                ]);

                setWeeklyPushHistory(historyRes.history || []);
                setWeeklyPush(latestRes.weeklyPush);
                setSelectedWeekStart(latestRes.weeklyPush?.weekStart || historyRes.history[0]?.weekStart || "");
            }
            catch {
                setWeeklyPush(undefined);
                setWeeklyPushHistory([]);
                setSelectedWeekStart("");
            }
        };

        void loadWeeklyPush();
    }, []);

    useEffect(() => {
        if (selectedWeekStart === "") {
            return;
        }

        const loadSelectedPush = async () => {
            try {
                const res = await request<WeeklyPushResponse>(
                    `/api/dataset/weekly-push/latest?week_start=${encodeURIComponent(selectedWeekStart)}`,
                    "GET",
                    false,
                );
                setWeeklyPush(res.weeklyPush);
            }
            catch {
                setWeeklyPush(undefined);
            }
        };

        void loadSelectedPush();
    }, [selectedWeekStart]);

    useEffect(() => {
        if (!isLoggedIn) {
            setPersonalizedWeeklyPush(undefined);
            setPersonalizedWeeklyPushHistory([]);
            setSelectedPersonalizedWeekStart("");
            setPersonalizedError("");
            return;
        }

        const loadStoredPersonalizedPush = async () => {
            try {
                const [latestRes, historyRes] = await Promise.all([
                    fetchPersonalizedWeeklyPush(),
                    fetchPersonalizedWeeklyPushHistory(),
                ]);
                const history = historyRes.history || [];
                const latestPush = latestRes.weeklyPush;

                setPersonalizedWeeklyPushHistory(history);
                setPersonalizedWeeklyPush(latestPush);
                setSelectedPersonalizedWeekStart(
                    latestPush?.weekStart || history[0]?.weekStart || "",
                );
                setPersonalizedError("");
            }
            catch {
                setPersonalizedWeeklyPush(undefined);
                setPersonalizedWeeklyPushHistory([]);
                setSelectedPersonalizedWeekStart("");
            }
        };

        void loadStoredPersonalizedPush();
    }, [isLoggedIn]);

    useEffect(() => {
        if (!isLoggedIn || selectedPersonalizedWeekStart === "") {
            return;
        }

        const loadSelectedPersonalizedPush = async () => {
            try {
                const res = await fetchPersonalizedWeeklyPush(selectedPersonalizedWeekStart);
                setPersonalizedWeeklyPush(res.weeklyPush);
                setPersonalizedError("");
            }
            catch {
                setPersonalizedWeeklyPush(undefined);
            }
        };

        void loadSelectedPersonalizedPush();
    }, [isLoggedIn, selectedPersonalizedWeekStart]);

    const handleGeneratePersonalizedPush = async () => {
        setIsGeneratingPersonalized(true);
        setPersonalizedError("");

        try {
            const res = await request<WeeklyPushResponse>(
                "/api/dataset/weekly-push/personalized",
                "POST",
                true,
            );
            const generatedPush = res.weeklyPush;
            setPersonalizedWeeklyPush(generatedPush);
            setSelectedPersonalizedWeekStart(generatedPush?.weekStart || "");

            try {
                const historyRes = await fetchPersonalizedWeeklyPushHistory();
                setPersonalizedWeeklyPushHistory(historyRes.history || []);
            }
            catch {
                // Keep the freshly generated result visible even if history refresh fails.
            }
        }
        catch (error) {
            setPersonalizedError(getErrorMessage(error));
        }
        finally {
            setIsGeneratingPersonalized(false);
        }
    };

    return (
        <div className="homePageShell">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <h2 style={{ margin: 0 }}>每周论文动态汇总</h2>
            </div>

            <div className="homePageLayout">
                <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
                    <section className="homePersonalizedPanel">
                        <div className="homePersonalizedPanelHeader">
                            <div>
                                <h3 style={{ margin: 0 }}>个性周报</h3>
                                <p className="homePersonalizedPanelHint">
                                    根据你关注的导师、私有导师和板块，本周即时生成专属周报，并结合 AI 做摘要整理。
                                </p>
                            </div>
                            {isLoggedIn && (
                                <button
                                    type="button"
                                    onClick={handleGeneratePersonalizedPush}
                                    disabled={isGeneratingPersonalized}
                                    className="homePersonalizedButton"
                                >
                                    {isGeneratingPersonalized
                                        ? "正在生成..."
                                        : personalizedWeeklyPush
                                            ? "重新生成个性周报"
                                            : "生成个性周报"}
                                </button>
                            )}
                        </div>

                        {!isLoggedIn && (
                            <div className="homePersonalizedPlaceholder">
                                登录后即可基于你关注的导师和板块生成专属周报。
                            </div>
                        )}

                        {isLoggedIn && isGeneratingPersonalized && (
                            <div className="homePersonalizedStatusCard">
                                正在整理你关注导师和板块本周的新增论文，并生成 AI 总结，请稍候。
                            </div>
                        )}

                        {isLoggedIn && personalizedError !== "" && (
                            <div className="homePersonalizedErrorCard">{personalizedError}</div>
                        )}

                        {isLoggedIn && personalizedWeeklyPush && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                <div className="homePersonalizedStats">
                                    <div className="homePersonalizedStatItem">
                                        <span>关注导师</span>
                                        <strong>{personalizedWeeklyPush.trackedMentorCount ?? 0}</strong>
                                    </div>
                                    <div className="homePersonalizedStatItem">
                                        <span>命中导师</span>
                                        <strong>{personalizedWeeklyPush.activeMentorCount ?? 0}</strong>
                                    </div>
                                    <div className="homePersonalizedStatItem">
                                        <span>关注板块</span>
                                        <strong>{personalizedWeeklyPush.trackedSubjectCount ?? 0}</strong>
                                    </div>
                                    <div className="homePersonalizedStatItem">
                                        <span>命中板块</span>
                                        <strong>{personalizedWeeklyPush.activeSubjectCount ?? 0}</strong>
                                    </div>
                                    <div className="homePersonalizedStatItem">
                                        <span>新增论文</span>
                                        <strong>{personalizedWeeklyPush.paperCount}</strong>
                                    </div>
                                </div>

                                <WeeklyPushDetailCard
                                    push={personalizedWeeklyPush}
                                    emptyPaperText="你关注的导师本周暂无新增论文明细。"
                                    showMentorNames
                                    showPersonalizedSummary
                                    metaItems={[
                                        `关注导师：${personalizedWeeklyPush.trackedMentorCount ?? 0} 位`,
                                        `命中导师：${personalizedWeeklyPush.activeMentorCount ?? 0} 位`,
                                        `关注板块：${personalizedWeeklyPush.trackedSubjectCount ?? 0} 个`,
                                        `命中板块：${personalizedWeeklyPush.activeSubjectCount ?? 0} 个`,
                                    ]}
                                />
                            </div>
                        )}

                        {isLoggedIn && personalizedWeeklyPushHistory.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                <h4 style={{ margin: "4px 0 0" }}>往期个性周报</h4>
                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    {personalizedWeeklyPushHistory.map((item) => (
                                        <button
                                            key={`personalized-${item.weekStart}`}
                                            type="button"
                                            onClick={() => setSelectedPersonalizedWeekStart(item.weekStart)}
                                            style={{
                                                textAlign: "left",
                                                padding: 10,
                                                borderRadius: 6,
                                                border: selectedPersonalizedWeekStart === item.weekStart ? "1px solid #0d6efd" : "1px solid #ccc",
                                                backgroundColor: selectedPersonalizedWeekStart === item.weekStart ? "#e7f1ff" : "#fff",
                                                cursor: "pointer",
                                            }}
                                        >
                                            <div style={{ fontWeight: 600 }}>{item.title}</div>
                                            <div style={{ fontSize: 13, color: "#666" }}>
                                                {item.weekStart} ~ {item.weekEnd} ｜ {item.paperCount} 篇 ｜ {formatGeneratedBy(item.generatedBy)}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {isLoggedIn && !isGeneratingPersonalized && personalizedWeeklyPush === undefined && (
                            <div className="homePersonalizedPlaceholder">
                                点击上方按钮后，会按你当前关注的导师和板块即时生成一份专属周报。
                            </div>
                        )}
                    </section>

                    <section style={{ marginTop: 12, border: "1px solid #ddd", borderRadius: 8, padding: 12, backgroundColor: "#fff" }}>
                        <h3 style={{ margin: "0 0 8px" }}>每周论文推送</h3>
                        {weeklyPush ? (
                            <WeeklyPushDetailCard
                                push={weeklyPush}
                                emptyPaperText="本周暂无论文明细。"
                            />
                        ) : (
                            <div style={{ color: "#666" }}>暂无周推送，请等待定时任务生成。</div>
                        )}
                    </section>

                    {weeklyPushHistory.length > 0 && (
                        <section style={{ marginTop: 12, border: "1px solid #ddd", borderRadius: 8, padding: 12, backgroundColor: "#fff" }}>
                            <h3 style={{ margin: "0 0 8px" }}>往期周报</h3>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                {weeklyPushHistory.map((item) => (
                                    <button
                                        key={item.weekStart}
                                        onClick={() => setSelectedWeekStart(item.weekStart)}
                                        style={{
                                            textAlign: "left",
                                            padding: 10,
                                            borderRadius: 6,
                                            border: selectedWeekStart === item.weekStart ? "1px solid #0d6efd" : "1px solid #ccc",
                                            backgroundColor: selectedWeekStart === item.weekStart ? "#e7f1ff" : "#fff",
                                            cursor: "pointer",
                                        }}
                                    >
                                        <div style={{ fontWeight: 600 }}>{item.title}</div>
                                        <div style={{ fontSize: 13, color: "#666" }}>
                                            {item.weekStart} ~ {item.weekEnd} ｜ {item.paperCount} 篇 ｜ {formatGeneratedBy(item.generatedBy)}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            </div>
        </div>
    );
};

export default HomeScreen;
