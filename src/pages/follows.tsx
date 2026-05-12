import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useSelector } from "react-redux";

import FollowToggleButton from "../components/FollowToggleButton";
import { FAILURE_PREFIX } from "../constants/string";
import { RootState } from "../redux/store";
import { request } from "../utils/network";
import { SearchMentorResult } from "../utils/types";

interface FollowedMentorsResponse {
    mentors?: SearchMentorResult[];
}

interface FollowedMentorCardState extends SearchMentorResult {
    followed: boolean;
}

const FollowsPage = () => {
    const router = useRouter();
    const authToken = useSelector((state: RootState) => state.auth.token);
    const isLoggedIn = authToken.trim() !== "";

    const [mentors, setMentors] = useState<FollowedMentorCardState[]>([]);
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
            setMentors(
                Array.isArray(res.mentors)
                    ? res.mentors.map((mentor) => ({
                        ...mentor,
                        followed: true,
                    }))
                    : [],
            );
        }
        catch (err) {
            setErrorMessage(FAILURE_PREFIX + String(err));
        }
        finally {
            setLoading(false);
        }
    }, [isLoggedIn]);

    const toggleFollow = async (mentor: FollowedMentorCardState) => {
        const mentorId = mentor.id;
        setActionMentorId(mentorId);
        setErrorMessage("");

        try {
            const res = await request<{ followed?: boolean }>(
                `/api/follow/mentors/${mentorId}`,
                mentor.followed ? "DELETE" : "POST",
                true,
            );
            setMentors((currentMentors) => currentMentors.map((item) => (
                item.id === mentorId
                    ? {
                        ...item,
                        followed: Boolean(res.followed),
                    }
                    : item
            )));
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
                <p>请先登录后查看关注列表。</p>
            </div>
        );
    }

        return (
            <div className="followsPage">
                <h2 className="pageTitle">我的关注</h2>

            <div className="content">
                <aside className="sidebar" aria-label="关注筛选">
                    <button className="filterButton" type="button">
                        全部（{mentors.filter((mentor) => mentor.followed).length}）
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
                                <div className="followButtonShell" onClick={(event) => event.stopPropagation()}>
                                    <FollowToggleButton
                                        className="followToggleButton"
                                        followed={mentor.followed}
                                        loading={actionMentorId === mentor.id}
                                        onClick={() => void toggleFollow(mentor)}
                                    />
                                </div>

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
                    padding: 14px 14px 14px 14px;
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

                .followButtonShell {
                    position: absolute;
                    top: 8px;
                    right: 8px;
                }

                .followToggleButton {
                    position: relative;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    min-width: 92px;
                    min-height: 36px;
                    border: 1px solid #ddd;
                    border-radius: 999px;
                    background: #fff;
                    color: #1f2328;
                    padding: 0 16px;
                    font-weight: 600;
                    overflow: hidden;
                }

                .followToggleButton:hover,
                .followToggleButton:focus {
                    background: #f6f8fa;
                    outline: none;
                }

                :global(.followToggleButtonOverlay) {
                    position: absolute;
                    inset: 0;
                    background: rgba(255, 255, 255, 0.55);
                }

                .mentorName {
                    margin: 52px 0 8px;
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
