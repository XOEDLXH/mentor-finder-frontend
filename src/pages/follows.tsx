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
    const [openMenuMentorId, setOpenMenuMentorId] = useState<number | undefined>(undefined);
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
        setOpenMenuMentorId(undefined);
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
            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 960 }}>
                <button onClick={() => router.push("/")}>返回主页</button>
                <p>请先登录后查看关注列表。</p>
            </div>
        );
    }

    return (
        <div className="followsPage">
            <button className="backButton" onClick={() => router.push("/")}>返回主页</button>
            <h2 className="pageTitle">我的关注</h2>

            <div className="content">
                <aside className="sidebar" aria-label="关注筛选">
                    <button className="filterButton" type="button">
                        全部（{mentors.length}）
                    </button>
                </aside>

                <main className="main">
                    {loading && <p>加载中...</p>}
                    {errorMessage !== "" && <p style={{ color: "#c62828" }}>{errorMessage}</p>}

                    {!loading && mentors.length === 0 && errorMessage === "" && (
                        <p>暂无关注导师</p>
                    )}

                    <div className="mentorGrid">
                        {mentors.map((mentor) => (
                            <div
                                key={mentor.id}
                                className="mentorCard"
                                role="button"
                                tabIndex={0}
                                aria-label={`进入${mentor.Chinese_name}导师主页`}
                                onClick={() => router.push(`/mentors/${mentor.id}`)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        void router.push(`/mentors/${mentor.id}`);
                                    }
                                }}
                            >
                                <button
                                    className="menuButton"
                                    type="button"
                                    aria-label={`${mentor.Chinese_name}更多操作`}
                                    aria-expanded={openMenuMentorId === mentor.id}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        setOpenMenuMentorId((currentId) => (
                                            currentId === mentor.id ? undefined : mentor.id
                                        ));
                                    }}
                                >
                                    ···
                                </button>

                                {openMenuMentorId === mentor.id && (
                                    <div className="menu" onClick={(event) => event.stopPropagation()}>
                                        <button
                                            className="unfollowButton"
                                            type="button"
                                            onClick={() => void unfollow(mentor)}
                                            disabled={actionMentorId === mentor.id}
                                        >
                                            {actionMentorId === mentor.id ? "处理中..." : "取消关注"}
                                        </button>
                                    </div>
                                )}

                                <h3 className="mentorName">
                                    {mentor.Chinese_name}
                                    {mentor.is_private && (
                                        <span className="privateBadge">我的私有导师</span>
                                    )}
                                </h3>
                                {mentor.English_name && (
                                    <p className="mentorMeta">英文名：{mentor.English_name}</p>
                                )}
                                <p className="mentorMeta">研究方向：{mentor.research_direction || "暂无研究方向"}</p>
                                <p className="mentorMeta">邮箱：{mentor.email || "暂无邮箱"}</p>
                            </div>
                        ))}
                    </div>
                </main>
            </div>

            <style jsx>{`
                .followsPage {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    max-width: 1040px;
                }

                .backButton {
                    align-self: flex-start;
                }

                .pageTitle {
                    margin: 0;
                }

                .content {
                    display: grid;
                    grid-template-columns: 160px 1fr;
                    gap: 18px;
                    align-items: start;
                }

                .sidebar {
                    border: 1px solid #ddd;
                    border-radius: 8px;
                    padding: 8px;
                }

                .filterButton {
                    width: 100%;
                    border: 1px solid #222;
                    border-radius: 6px;
                    background: #f7f7f7;
                    padding: 10px 12px;
                    font-weight: 600;
                    text-align: left;
                }

                .main {
                    min-width: 0;
                }

                .mentorGrid {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 12px;
                }

                .mentorCard {
                    position: relative;
                    min-height: 158px;
                    padding: 14px 44px 14px 14px;
                    border: 1px solid #ccc;
                    border-radius: 8px;
                    cursor: pointer;
                    background: #fff;
                    transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
                }

                .mentorCard:hover,
                .mentorCard:focus {
                    border-color: #666;
                    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
                    outline: none;
                    transform: translateY(-1px);
                }

                .menuButton {
                    position: absolute;
                    top: 8px;
                    right: 8px;
                    width: 30px;
                    height: 30px;
                    border: none;
                    border-radius: 50%;
                    background: transparent;
                    cursor: pointer;
                    font-size: 18px;
                    line-height: 1;
                }

                .menuButton:hover,
                .menuButton:focus {
                    background: #f1f1f1;
                    outline: none;
                }

                .menu {
                    position: absolute;
                    top: 40px;
                    right: 8px;
                    z-index: 2;
                    min-width: 112px;
                    padding: 6px;
                    border: 1px solid #ddd;
                    border-radius: 8px;
                    background: #fff;
                    box-shadow: 0 8px 22px rgba(0, 0, 0, 0.12);
                }

                .unfollowButton {
                    width: 100%;
                    border: none;
                    border-radius: 6px;
                    background: transparent;
                    color: #c62828;
                    cursor: pointer;
                    padding: 8px 10px;
                    text-align: left;
                    font-weight: 600;
                }

                .unfollowButton:hover,
                .unfollowButton:focus {
                    background: #fff1f1;
                    outline: none;
                }

                .mentorName {
                    margin: 0 0 8px;
                    font-size: 18px;
                }

                .privateBadge {
                    margin-left: 8px;
                    font-size: 12px;
                    color: #555;
                    font-weight: 400;
                }

                .mentorMeta {
                    margin: 4px 0;
                    color: #333;
                    line-height: 1.45;
                }

                @media (max-width: 720px) {
                    .content {
                        grid-template-columns: 1fr;
                    }

                    .mentorGrid {
                        grid-template-columns: 1fr;
                    }
                }
            `}</style>
        </div>
    );
};

export default FollowsPage;
