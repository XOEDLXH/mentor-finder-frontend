import { RootState } from "../redux/store";
import { useSelector } from "react-redux";
import { useEffect, useState } from "react";
import LatexText from "../components/LatexText";
import { request } from "../utils/network";
import {
    WeeklyPushHistoryResponse,
    WeeklyPushItem,
    WeeklyPushPaper,
    WeeklyPushResponse,
} from "../utils/types";

const GENERATED_BY_LABELS: Record<string, string> = {
    rule: "规则摘要",
    "thucs-openai": "AI摘要",
};

const formatGeneratedBy = (generatedBy: string) => GENERATED_BY_LABELS[generatedBy] || generatedBy;

const getErrorMessage = (error: unknown) => {
    if (error instanceof Error && error.message.trim() !== "") {
        return error.message;
    }
    return "个性周报生成失败，请稍后重试。";
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
    if (papers.length === 0) {
        return <div style={{ color: "#666" }}>{emptyText}</div>;
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {papers.map((paper) => (
                <div key={paper.id} style={{ border: "1px solid #eee", borderRadius: 6, padding: 10, backgroundColor: "#fff" }}>
                    <div style={{ fontWeight: 600 }}>
                        {paper.arxivUrl ? (
                            <a href={paper.arxivUrl} target="_blank" rel="noreferrer">
                                <LatexText text={paper.title} forceInlineMath />
                            </a>
                        ) : (
                            <LatexText text={paper.title} forceInlineMath />
                        )}
                    </div>
                    <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
                        作者：{paper.authorNames || "未知"} ｜ {paper.publishDate || "未知日期"}
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
                                <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{push.fixedSummary}</div>
                            </div>
                            <div className="homePersonalizedSummaryBlock homePersonalizedSummaryBlockAccent">
                                <div className="homePersonalizedSummaryLabel">AI总结</div>
                                <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{push.aiSummary}</div>
                            </div>
                        </>
                    ) : (
                        <div className="homePersonalizedSummaryBlock">
                            <div className="homePersonalizedSummaryLabel">摘要结果</div>
                            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{push.content}</div>
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
        </div>
    );
};

const HomeScreen = () => {
    const auth = useSelector((state: RootState) => state.auth);
    const userName = auth.name;
    const isLoggedIn = auth.token !== "";
    const [weeklyPush, setWeeklyPush] = useState<WeeklyPushItem | undefined>(undefined);
    const [weeklyPushHistory, setWeeklyPushHistory] = useState<WeeklyPushHistoryResponse["history"]>([]);
    const [selectedWeekStart, setSelectedWeekStart] = useState("");
    const [personalizedWeeklyPush, setPersonalizedWeeklyPush] = useState<WeeklyPushItem | undefined>(undefined);
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

    const handleGeneratePersonalizedPush = async () => {
        setIsGeneratingPersonalized(true);
        setPersonalizedError("");

        try {
            const res = await request<WeeklyPushResponse>(
                "/api/dataset/weekly-push/personalized",
                "POST",
                true,
            );
            setPersonalizedWeeklyPush(res.weeklyPush);
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
                <h2 style={{ margin: 0 }}>找导师</h2>
                <p style={{ margin: 0 }}>每周论文动态汇总。</p>
                {userName !== "" && <p style={{ margin: 0 }}>欢迎回来，{userName}</p>}
            </div>

            <div className="homePageLayout">
                <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
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

                <aside className="homePageSidebar">
                    <section className="homePersonalizedPanel">
                        <div className="homePersonalizedPanelHeader">
                            <div>
                                <h3 style={{ margin: 0 }}>个性周报</h3>
                                <p className="homePersonalizedPanelHint">
                                    根据你关注的导师和私有导师，本周即时生成专属周报，并结合 AI 做摘要整理。
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
                                登录后即可基于你关注的导师生成专属周报。
                            </div>
                        )}

                        {isLoggedIn && isGeneratingPersonalized && (
                            <div className="homePersonalizedStatusCard">
                                正在整理你关注导师本周的新增论文，并生成 AI 总结，请稍候。
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
                                    ]}
                                />
                            </div>
                        )}

                        {isLoggedIn && !isGeneratingPersonalized && personalizedWeeklyPush === undefined && (
                            <div className="homePersonalizedPlaceholder">
                                点击上方按钮后，会按你当前关注的导师即时生成一份专属周报。
                            </div>
                        )}
                    </section>
                </aside>
            </div>
        </div>
    );
};

export default HomeScreen;
