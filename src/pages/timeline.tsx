import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

import LatexText from "../components/LatexText";
import Pagination from "../components/Pagination";
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

    return (
        <div className="timelinePageShell">
            <div className="timelinePageHeader">
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
                <div className="timelineContentLayout">
                    <aside
                        className="timelineDirectionsPanel"
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
                        className="timelineMainPanel"
                    >
                        <h3 style={{ marginTop: 0 }}>{activeDirection || "未选择研究方向"}</h3>
                        {activeDirectionSummary && (
                            <>
                                <p style={{ marginTop: 0, color: "#666" }}>
                                    共 {totalPapers} 篇，第 {page} / {Math.max(totalPages, 1)} 页
                                </p>
                                <div style={{ marginBottom: 16 }}>
                                    <Pagination
                                        currentPage={page}
                                        totalPages={totalPages}
                                        loading={loadingPapers}
                                        centered
                                        controlHeight={33.77}
                                        jumpInputWidth={120}
                                        activePageHighlightColor="rgb(8, 109, 177)"
                                        onPageChange={setPage}
                                    />
                                </div>
                            </>
                        )}

                        {loadingPapers && (
                            <div style={{ padding: 12, border: "1px dashed #ccc", marginBottom: 12 }}>
                                正在加载论文列表...
                            </div>
                        )}

                        {!loadingPapers && papers.length > 0 ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                {papers.map((paper) => {
                                    const subjectTags = parseTimelineSubjects(paper.subjects);

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
                                        <h4 style={{ margin: "0 0 8px", fontSize: "17.5px" }}>
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

                                <Pagination
                                    currentPage={page}
                                    totalPages={totalPages}
                                    loading={loadingPapers}
                                    centered
                                    controlHeight={33.77}
                                    jumpInputWidth={120}
                                    activePageHighlightColor="rgb(8, 109, 177)"
                                    onPageChange={setPage}
                                />
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

            <style jsx>{`
                .timelinePageShell {
                    --timeline-sticky-top: 64px;
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                    max-width: 1080px;
                    min-height: calc(100vh - 158px);
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
                    gap: 16px;
                    align-items: start;
                    flex: 1;
                    min-height: 0;
                }

                .timelineDirectionsPanel {
                    border: 1px solid transparent;
                    border-radius: 8px;
                    padding: 12px;
                    position: sticky;
                    top: var(--timeline-sticky-top);
                    align-self: start;
                    max-height: calc((100vh - var(--timeline-sticky-top) - 16px) * 1.2);
                    overflow-y: auto;
                    overscroll-behavior: contain;
                }

                .timelineMainPanel {
                    border-left: 2px solid #d0d7de;
                    padding-left: 20px;
                    padding-right: 8px;
                    min-height: 100%;
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
                    color: #666;
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
                    color: rgb(8, 109, 177);
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

                @media (max-width: 900px) {
                    .timelinePageHeader {
                        flex-direction: column;
                        align-items: stretch;
                    }

                    .timelineContentLayout {
                        grid-template-columns: minmax(0, 1fr);
                    }

                    .timelineDirectionsPanel,
                    .timelineMainPanel {
                        max-height: none;
                        min-height: 0;
                    }

                    .timelineDirectionsPanel {
                        position: static;
                        top: auto;
                    }
                }
            `}</style>
        </div>
    );
};

export default TimelinePage;
