import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useSelector } from "react-redux";

import { FAILURE_PREFIX } from "../constants/string";
import { RootState } from "../redux/store";
import { request } from "../utils/network";
import { SearchMentorResult } from "../utils/types";

interface FollowedMentorsResponse {
    mentors?: SearchMentorResult[];
}

const FollowsPage = () => {
    const router = useRouter();
    const authToken = useSelector((state: RootState) => state.auth.token);
    const isLoggedIn = authToken.trim() !== "";

    const [mentors, setMentors] = useState<SearchMentorResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [actionMentorId, setActionMentorId] = useState<number | undefined>(undefined);
    const [errorMessage, setErrorMessage] = useState("");

    const fetchFollows = useCallback(async () => {
        if (!isLoggedIn) {
            setMentors([]);
            return;
        }

        setLoading(true);
        setErrorMessage("");

        try {
            const res = await request<FollowedMentorsResponse>("/api/follow/mentors", "GET", true);
            setMentors(Array.isArray(res.mentors) ? res.mentors : []);
        }
        catch (err) {
            setErrorMessage(FAILURE_PREFIX + String(err));
        }
        finally {
            setLoading(false);
        }
    }, [isLoggedIn]);

    const unfollow = async (mentor: SearchMentorResult) => {
        if (!window.confirm(`确定要取消关注${mentor.Chinese_name}吗？`)) {
            return;
        }

        const mentorId = mentor.id;
        setActionMentorId(mentorId);
        setErrorMessage("");

        try {
            await request(`/api/follow/mentors/${mentorId}`, "DELETE", true);
            await fetchFollows();
        }
        catch (err) {
            setErrorMessage(FAILURE_PREFIX + String(err));
        }
        finally {
            setActionMentorId(undefined);
        }
    };

    useEffect(() => {
        void fetchFollows();
    }, [fetchFollows]);

    if (!isLoggedIn) {
        return (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 720 }}>
                <button onClick={() => router.push("/")}>返回主页</button>
                <p>请先登录后查看关注列表。</p>
            </div>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 720 }}>
            <button onClick={() => router.push("/")}>返回主页</button>
            <h2>我的关注</h2>

            {loading && <p>加载中...</p>}
            {errorMessage !== "" && <p style={{ color: "#c62828" }}>{errorMessage}</p>}

            {!loading && mentors.length === 0 && errorMessage === "" && (
                <p>暂无关注导师</p>
            )}

            {mentors.map((mentor) => (
                <div key={mentor.id} style={{ padding: 12, border: "1px solid #ccc", borderRadius: 6 }}>
                    <h3 style={{ margin: "0 0 8px" }}>
                        {mentor.Chinese_name}
                        {mentor.is_private && (
                            <span style={{ marginLeft: 8, fontSize: 12, color: "#555" }}>我的私有导师</span>
                        )}
                    </h3>
                    {mentor.English_name && (
                        <p style={{ margin: "4px 0" }}>英文名：{mentor.English_name}</p>
                    )}
                    <p style={{ margin: "4px 0" }}>研究方向：{mentor.research_direction || "暂无研究方向"}</p>
                    <p style={{ margin: "4px 0" }}>邮箱：{mentor.email || "暂无邮箱"}</p>
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button onClick={() => router.push(`/mentors/${mentor.id}`)}>
                            查看导师主页
                        </button>
                        <button
                            onClick={() => void unfollow(mentor)}
                            disabled={actionMentorId === mentor.id}
                        >
                            {actionMentorId === mentor.id ? "处理中..." : "取消关注"}
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default FollowsPage;
