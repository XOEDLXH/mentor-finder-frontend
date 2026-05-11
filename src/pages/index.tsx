import { RootState } from "../redux/store";
import { useSelector } from "react-redux";
import { useEffect, useState } from "react";
import { request } from "../utils/network";
import {
    WeeklyPushHistoryResponse,
    WeeklyPushItem,
    WeeklyPushResponse,
} from "../utils/types";

const HomeScreen = () => {
    const userName = useSelector((state: RootState) => state.auth.name);
    const [weeklyPush, setWeeklyPush] = useState<WeeklyPushItem | null>(null);
    const [weeklyPushHistory, setWeeklyPushHistory] = useState<WeeklyPushHistoryResponse["history"]>([]);
    const [selectedWeekStart, setSelectedWeekStart] = useState("");

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
                setWeeklyPush(null);
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
                setWeeklyPush(null);
            }
        };

        void loadSelectedPush();
    }, [selectedWeekStart]);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 720 }}>
            <h2>找导师</h2>
            <p>每周论文动态汇总。</p>
            {userName !== "" && <p>欢迎回来，{userName}</p>}
            <section style={{ marginTop: 12, border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
                <h3 style={{ margin: "0 0 8px" }}>每周论文推送</h3>
                {weeklyPush ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <div style={{ fontWeight: 600 }}>{weeklyPush.title}</div>
                        <div style={{ fontSize: 13, color: "#666" }}>
                            周期：{weeklyPush.weekStart} ~ {weeklyPush.weekEnd} ｜ 论文数：{weeklyPush.paperCount} ｜ 生成方式：{weeklyPush.generatedBy}
                        </div>
                        <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{weeklyPush.content}</div>
                        <div>
                            <h4 style={{ margin: "12px 0 8px" }}>本周论文</h4>
                            {weeklyPush.papers.length > 0 ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    {weeklyPush.papers.map((paper) => (
                                        <div key={paper.id} style={{ border: "1px solid #eee", borderRadius: 6, padding: 10 }}>
                                            <div style={{ fontWeight: 600 }}>
                                                {paper.arxivUrl ? (
                                                    <a href={paper.arxivUrl} target="_blank" rel="noreferrer">
                                                        {paper.title}
                                                    </a>
                                                ) : (
                                                    paper.title
                                                )}
                                            </div>
                                            <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
                                                作者：{paper.authorNames || "未知"} ｜ {paper.publishDate || "未知日期"}
                                            </div>
                                            <div style={{ marginTop: 6, lineHeight: 1.5 }}>
                                                {paper.tldr || paper.abstract || "暂无摘要"}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ color: "#666" }}>本周暂无论文明细。</div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div style={{ color: "#666" }}>暂无周推送，请等待定时任务生成。</div>
                )}
            </section>
            {weeklyPushHistory.length > 0 && (
                <section style={{ marginTop: 12, border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
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
                                    {item.weekStart} ~ {item.weekEnd} ｜ {item.paperCount} 篇 ｜ {item.generatedBy}
                                </div>
                            </button>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
};

export default HomeScreen;
