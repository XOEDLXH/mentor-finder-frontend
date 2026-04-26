import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

import { FAILURE_PREFIX } from "../constants/string";
import { request } from "../utils/network";
import { TimelineGroup } from "../utils/types";

interface TimelineResponse {
    timeline: TimelineGroup[];
}

const TimelinePage = () => {
    const router = useRouter();
    const [timeline, setTimeline] = useState<TimelineGroup[]>([]);
    const [activeDirection, setActiveDirection] = useState("");
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState("");

    useEffect(() => {
        const fetchTimeline = async () => {
            setLoading(true);
            setErrorMessage("");

            try {
                const res = await request<TimelineResponse>("/api/timeline", "GET", false);
                const nextTimeline = res.timeline || [];

                setTimeline(nextTimeline);
                setActiveDirection((currentDirection) => {
                    if (currentDirection !== "" && nextTimeline.some((group) => group.direction === currentDirection)) {
                        return currentDirection;
                    }

                    return nextTimeline[0]?.direction || "";
                });
            }
            catch (err) {
                setTimeline([]);
                setActiveDirection("");
                setErrorMessage(FAILURE_PREFIX + String(err));
            }
            finally {
                setLoading(false);
            }
        };

        void fetchTimeline();
    }, []);

    const activeGroup = useMemo(
        () => timeline.find((group) => group.direction === activeDirection),
        [activeDirection, timeline],
    );

    const panelHeight = "calc(100vh - 220px)";

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1080 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                    <h2 style={{ margin: "0 0 8px" }}>论文时间线</h2>
                    <p style={{ margin: 0 }}>按研究方向查看论文动态，默认展示对应方向下按时间倒序排列的论文。</p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => router.push("/")}>返回首页</button>
                    <button onClick={() => router.push("/search")}>去检索</button>
                </div>
            </div>

            {loading && (
                <div style={{ padding: 12, border: "1px dashed #ccc" }}>
                    正在加载时间线数据...
                </div>
            )}

            {!loading && errorMessage !== "" && (
                <div style={{ padding: 12, border: "1px solid #f1aeb5", backgroundColor: "#f8d7da" }}>
                    {errorMessage}
                </div>
            )}

            {!loading && errorMessage === "" && timeline.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "240px minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
                    <aside
                        style={{
                            border: "1px solid #ccc",
                            borderRadius: 8,
                            padding: 12,
                            maxHeight: panelHeight,
                            overflowY: "auto",
                            overscrollBehavior: "contain",
                        }}
                    >
                        <h3 style={{ marginTop: 0 }}>研究方向</h3>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {timeline.map((group) => (
                                <button
                                    key={group.direction}
                                    onClick={() => setActiveDirection(group.direction)}
                                    style={{
                                        textAlign: "left",
                                        padding: "10px 12px",
                                        borderRadius: 6,
                                        border: group.direction === activeDirection ? "1px solid #0d6efd" : "1px solid #ccc",
                                        backgroundColor: group.direction === activeDirection ? "#e7f1ff" : "#fff",
                                        cursor: "pointer",
                                    }}
                                >
                                    <div style={{ fontWeight: 600 }}>{group.direction}</div>
                                    <div style={{ fontSize: 12, color: "#666" }}>{group.papers.length} 篇论文</div>
                                </button>
                            ))}
                        </div>
                    </aside>

                    <section
                        style={{
                            borderLeft: "2px solid #d0d7de",
                            paddingLeft: 20,
                            maxHeight: panelHeight,
                            overflowY: "auto",
                            overscrollBehavior: "contain",
                            paddingRight: 8,
                        }}
                    >
                        <h3 style={{ marginTop: 0 }}>{activeGroup?.direction || "未选择研究方向"}</h3>

                        {activeGroup && activeGroup.papers.length > 0 ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                {activeGroup.papers.map((paper) => (
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
                                        <div
                                            style={{
                                                position: "absolute",
                                                left: -28,
                                                top: 20,
                                                width: 12,
                                                height: 12,
                                                borderRadius: "50%",
                                                backgroundColor: "#0d6efd",
                                            }}
                                        />
                                        <div style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>
                                            {paper.publish_date || "未知日期"}
                                        </div>
                                        <h4 style={{ margin: "0 0 8px" }}>
                                            {paper.arxiv_url ? (
                                                <a
                                                    href={paper.arxiv_url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    style={{ color: "#0d6efd", textDecoration: "underline" }}
                                                >
                                                    {paper.title}
                                                </a>
                                            ) : paper.title}
                                        </h4>
                                        <p style={{ margin: "0 0 8px" }}>作者：{paper.author_names || "未知"}</p>
                                        <p style={{ margin: 0, lineHeight: 1.6 }}>
                                            摘要：{paper.tldr || paper.abstract || "暂无摘要"}
                                        </p>
                                    </article>
                                ))}
                            </div>
                        ) : (
                            <div style={{ padding: 12, border: "1px dashed #ccc" }}>
                                当前研究方向下暂无论文数据。
                            </div>
                        )}
                    </section>
                </div>
            )}

            {!loading && errorMessage === "" && timeline.length === 0 && (
                <div style={{ padding: 12, border: "1px dashed #ccc" }}>
                    暂无时间线数据。
                </div>
            )}
        </div>
    );
};

export default TimelinePage;
