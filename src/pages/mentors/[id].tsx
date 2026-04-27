import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useSelector } from "react-redux";

import { FAILURE_PREFIX } from "../../constants/string";
import { RootState } from "../../redux/store";
import { request } from "../../utils/network";
import { MentorDetail, SearchMentorResult } from "../../utils/types";

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

    useEffect(() => {
        if (typeof id !== "string") {
            return;
        }

        const fetchMentor = async () => {
            setLoading(true);
            setErrorMessage("");

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
                    <button onClick={() => void toggleFollow()} disabled={followLoading}>
                        {followLoading ? "处理中..." : followed ? "取消关注" : "关注导师"}
                    </button>
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
            </div>
        </div>
    );
};

export default MentorDetailPage;
