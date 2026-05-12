import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useSelector } from "react-redux";

import FollowToggleButton from "../../components/FollowToggleButton";
import { FAILURE_PREFIX } from "../../constants/string";
import { RootState } from "../../redux/store";
import { request } from "../../utils/network";
import {
    MentorDetail,
    MentorRecentDirectionAnalysisResponse,
    SearchMentorResult,
} from "../../utils/types";

const MentorDetailPage = () => {
    const router = useRouter();
    const { id } = router.query;
    const authToken = useSelector((state: RootState) => state.auth.token);
    const authRole = useSelector((state: RootState) => state.auth.role);
    const isLoggedIn = authToken.trim() !== "";
    const canFollow = isLoggedIn && authRole === "student";

    const [mentor, setMentor] = useState<MentorDetail | undefined>(undefined);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [followed, setFollowed] = useState(false);
    const [followLoading, setFollowLoading] = useState(false);
    const [analysisLoading, setAnalysisLoading] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<MentorRecentDirectionAnalysisResponse | undefined>(undefined);

    useEffect(() => {
        if (typeof id !== "string") {
            return;
        }

        const fetchMentor = async () => {
            setLoading(true);
            setErrorMessage("");
            setAnalysisResult(undefined);

            try {
                const res = await request<{ mentor?: MentorDetail }>(
                    `/api/dataset/mentors/${id}`,
                    "GET",
                    isLoggedIn,
                );
                setMentor(res.mentor);
            }
            catch (err) {
                setErrorMessage(FAILURE_PREFIX + String(err));
            }
            finally {
                setLoading(false);
            }
        };

        void fetchMentor();
    }, [id, isLoggedIn]);

    useEffect(() => {
        if (!canFollow || typeof id !== "string") {
            setFollowed(false);
            return;
        }

        const fetchFollowedMentors = async () => {
            try {
                const res = await request<{ mentors?: SearchMentorResult[] }>(
                    "/api/follow/mentors",
                    "GET",
                    true,
                );
                const followedMentors = Array.isArray(res.mentors) ? res.mentors : [];
                setFollowed(followedMentors.some((item) => item.id === Number(id)));
            }
            catch {
                setFollowed(false);
            }
        };

        void fetchFollowedMentors();
    }, [canFollow, id]);

    const toggleFollow = async () => {
        if (typeof id !== "string") {
            return;
        }

        setFollowLoading(true);
        setErrorMessage("");

        try {
            const res = await request<{ followed?: boolean }>(
                `/api/follow/mentors/${id}`,
                followed ? "DELETE" : "POST",
                true,
            );
            setFollowed(Boolean(res.followed));
        }
        catch (err) {
            setErrorMessage(FAILURE_PREFIX + String(err));
        }
        finally {
            setFollowLoading(false);
        }
    };

    const analyzeRecentDirection = async () => {
        if (typeof id !== "string") {
            return;
        }

        setAnalysisLoading(true);
        setErrorMessage("");

        try {
            const res = await request<MentorRecentDirectionAnalysisResponse>(
                `/api/dataset/mentors/${id}/recent-direction-analysis`,
                "POST",
                isLoggedIn,
            );
            setAnalysisResult(res);
        }
        catch (err) {
            setErrorMessage(FAILURE_PREFIX + String(err));
        }
        finally {
            setAnalysisLoading(false);
        }
    };

    if (loading) {
        return <p>加载中...</p>;
    }

    if (errorMessage !== "") {
        return (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 720 }}>
                <button onClick={() => router.push("/search")}>返回检索</button>
                <p style={{ color: "#c62828" }}>{errorMessage}</p>
            </div>
        );
    }

    if (mentor === undefined) {
        return (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 720 }}>
                <button onClick={() => router.push("/search")}>返回检索</button>
                <p>暂无导师信息</p>
            </div>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 720 }}>
            <button onClick={() => router.push("/search")}>返回检索</button>

            <div style={{ padding: 12, border: "1px solid #ccc", borderRadius: 6 }}>
                <h2 style={{ margin: "0 0 8px" }}>{mentor.Chinese_name}</h2>

                {mentor.is_private && (
                    <p style={{ margin: "4px 0", color: "#555" }}>我的私有导师</p>
                )}

                {canFollow && (
                    <FollowToggleButton
                        followed={followed}
                        loading={followLoading}
                        onClick={() => void toggleFollow()}
                        style={{
                            position: "relative",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            minWidth: 92,
                            minHeight: 36,
                            border: "1px solid #d0d7de",
                            borderRadius: 999,
                            background: "#fff",
                            color: "#1f2328",
                            padding: "0 16px",
                            fontWeight: 600,
                            overflow: "hidden",
                        }}
                    />
                )}


                {mentor.English_name && (
                    <p style={{ margin: "4px 0" }}>英文名：{mentor.English_name}</p>
                )}

                <p style={{ margin: "4px 0" }}>
                    研究方向：{mentor.research_direction || "暂无研究方向"}
                </p>

                <p style={{ margin: "4px 0" }}>
                    邮箱：{mentor.email || "暂无邮箱"}
                </p>

                <p style={{ margin: "4px 0" }}>
                    导师画像：{mentor.profile || "暂无导师画像"}
                </p>

                <p style={{ margin: "8px 0 4px" }}>关联论文：</p>
                {mentor.paper_ids.length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                        {mentor.paper_ids.map((paper) => (
                            <li key={paper.id}>
                                {paper.title}
                                {paper.publish_date ? `（${paper.publish_date}）` : ""}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p style={{ margin: "4px 0" }}>暂无关联论文</p>
                )}
                
                <div style={{ marginTop: 8 }}>
                    <button onClick={() => void analyzeRecentDirection()} disabled={analysisLoading}>
                        {analysisLoading ? "AI正在分析近一年论文，请稍候..." : "AI分析最近研究方向"}
                    </button>
                </div>

                {(analysisLoading || analysisResult !== undefined) && (
                    <div style={{ marginTop: 16, padding: 12, border: "1px solid #ddd", borderRadius: 6, backgroundColor: "#fafafa" }}>
                        <h3 style={{ margin: "0 0 8px" }}>最近研究方向分析</h3>
                        {analysisLoading && (
                            <p style={{ margin: 0 }}>正在读取该导师近一年论文的题目和摘要并生成总结，请稍候...</p>
                        )}
                        {!analysisLoading && analysisResult !== undefined && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                <p style={{ margin: 0, color: "#666" }}>
                                    近一年论文数：{analysisResult.paperCount} ｜ 生成方式：{analysisResult.generatedBy}
                                </p>
                                <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                                    {analysisResult.analysis}
                                </p>
                                {analysisResult.papers.length > 0 && (
                                    <div>
                                        <p style={{ margin: "4px 0" }}>本次分析使用的论文：</p>
                                        <ul style={{ margin: 0, paddingLeft: 20 }}>
                                            {analysisResult.papers.map((paper) => (
                                                <li key={paper.id}>
                                                    {paper.title}
                                                    {paper.publish_date ? `（${paper.publish_date}）` : ""}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default MentorDetailPage;
