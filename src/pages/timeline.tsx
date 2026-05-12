import { useEffect, useMemo, useState } from "react";
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

//论文时间线页
const TimelinePage = () => {
    const router = useRouter();
    const [directions, setDirections] = useState<TimelineDirectionSummary[]>([]);
    const [activeDirection, setActiveDirection] = useState("");
    const [papers, setPapers] = useState<TimelinePaper[]>([]);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [totalPapers, setTotalPapers] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [loadingDirections, setLoadingDirections] = useState(true);
    const [loadingPapers, setLoadingPapers] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    useEffect(() => {
        const fetchDirectionOverview = async () => {
            setLoadingDirections(true);
            setErrorMessage("");

            try {
                const res = await request<TimelineDirectionsResponse>("/api/timeline", "GET", false);
                const nextDirections = Array.isArray(res.directions) ? res.directions : [];
                const safePageSize = Number(res.page_size_default) > 0 ? Number(res.page_size_default) : 20;

                setDirections(nextDirections);
                setPageSize(safePageSize);
                setPage(1);
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
                setTotalPages(0);
                setTotalPapers(0);
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
            setTotalPages(0);
            setTotalPapers(0);
            return;
        }

        const fetchDirectionPapers = async () => {
            setLoadingPapers(true);
            setErrorMessage("");

            try {
                const query = new URLSearchParams({
                    direction: activeDirection,
                    page: String(page),
                    page_size: String(pageSize),
                }).toString();
                const res = await request<TimelinePapersResponse>(`/api/timeline?${query}`, "GET", false);

                setPapers(Array.isArray(res.papers) ? res.papers : []);
                setTotalPages(Number(res.total_pages) > 0 ? Number(res.total_pages) : 0);
                setTotalPapers(Number(res.total_papers) > 0 ? Number(res.total_papers) : 0);

                const resolvedPage = Number(res.page);
                if (resolvedPage > 0 && resolvedPage !== page) {
                    setPage(resolvedPage);
                }
            }
            catch (err) {
                setPapers([]);
                setTotalPages(0);
                setTotalPapers(0);
                setErrorMessage(FAILURE_PREFIX + String(err));
            }
            finally {
                setLoadingPapers(false);
            }
        };

        void fetchDirectionPapers();
    }, [activeDirection, page, pageSize]);

    const activeDirectionSummary = useMemo(
        () => directions.find((group) => group.direction === activeDirection),
        [activeDirection, directions],
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

            {loadingDirections && (
                <div style={{ padding: 12, border: "1px dashed #ccc" }}>
                    正在加载时间线方向...
                </div>
            )}

            {!loadingDirections && errorMessage !== "" && (
                <div style={{ padding: 12, border: "1px solid #f1aeb5", backgroundColor: "#f8d7da" }}>
                    {errorMessage}
                </div>
            )}

            {!loadingDirections && errorMessage === "" && directions.length > 0 && (
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
                            {directions.map((group) => (
                                <button
                                    key={group.direction}
                                    onClick={() => {
                                        setActiveDirection(group.direction);
                                        setPage(1);
                                    }}
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
                                        <div style={{ fontSize: 12, color: "#666" }}>{group.paper_count} 篇论文</div>
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
                        <h3 style={{ marginTop: 0 }}>{activeDirection || "未选择研究方向"}</h3>
                        {activeDirectionSummary && (
                            <p style={{ marginTop: 0, color: "#666" }}>
                                共 {totalPapers} 篇，第 {page} / {Math.max(totalPages, 1)} 页
                            </p>
                        )}

                        {loadingPapers && (
                            <div style={{ padding: 12, border: "1px dashed #ccc", marginBottom: 12 }}>
                                正在加载论文列表...
                            </div>
                        )}

                        {!loadingPapers && papers.length > 0 ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                {papers.map((paper) => (
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
                                        <div className="timelineAbstract">
                                            <span className="timelineAbstractLabel">摘要：</span>
                                            <div className="timelineAbstractContent">
                                                <LatexText text={paper.tldr || paper.abstract || "暂无摘要"} />
                                            </div>
                                        </div>
                                    </article>
                                ))}

                                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                    <button
                                        onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
                                        disabled={loadingPapers || page <= 1}
                                    >
                                        上一页
                                    </button>
                                    <button
                                        onClick={() => setPage((currentPage) => currentPage + 1)}
                                        disabled={loadingPapers || totalPages === 0 || page >= totalPages}
                                    >
                                        下一页
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ padding: 12, border: "1px dashed #ccc" }}>
                                当前研究方向下暂无论文数据。
                            </div>
                        )}
                    </section>
                </div>
            )}

            {!loadingDirections && errorMessage === "" && directions.length === 0 && (
                <div style={{ padding: 12, border: "1px dashed #ccc" }}>
                    暂无时间线数据。
                </div>
            )}
        </div>
    );
};

export default TimelinePage;
