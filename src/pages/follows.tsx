import { CSSProperties, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useSelector } from "react-redux";

import FollowToggleButton from "../components/FollowToggleButton";
import Pagination from "../components/Pagination";
import { FAILURE_PREFIX } from "../constants/string";
import { RootState } from "../redux/store";
import { request } from "../utils/network";
import { FollowUserResult, SearchMentorResult } from "../utils/types";

interface FollowedMentorsResponse {
    mentors?: SearchMentorResult[];
}

interface FollowedUsersResponse {
    users?: FollowUserResult[];
}

interface FollowersResponse {
    users?: FollowUserResult[];
}

interface SearchUsersResponse {
    users?: FollowUserResult[];
}

interface FollowedMentorCardState extends SearchMentorResult {
    followed: boolean;
}

type FollowCategory = "mentor" | "user";
type FollowView = "following" | "followers";

const FOLLOWED_MENTOR_CARDS_PER_PAGE = 18;

const buildSearchLikeMentorFollowButtonStyle = (followed: boolean): CSSProperties => ({
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 72,
    minHeight: 28,
    border: "0 solid transparent",
    borderRadius: 6,
    padding: "0 12px",
    backgroundColor: followed ? "rgba(246, 248, 250, 0.96)" : "rgb(8, 109, 177)",
    color: followed ? "#000000" : "#ffffff",
    fontSize: 14,
    fontWeight: 500,
    lineHeight: 1,
    whiteSpace: "nowrap",
    overflow: "hidden",
    cursor: "pointer",
    boxShadow: "none",
    transition: "none",
    appearance: "none",
    opacity: 1,
});

const formatViewSwitchCount = (value: number) => {
    const safeValue = Math.max(0, Math.floor(value));

    if (safeValue < 1000) {
        return String(safeValue);
    }

    if (safeValue >= 99950) {
        return "99.9k";
    }

    return `${(safeValue / 1000).toFixed(1)}k`;
};

const FollowsPage = () => {
    const router = useRouter();
    const authToken = useSelector((state: RootState) => state.auth.token);
    const isLoggedIn = authToken.trim() !== "";

    const [mentors, setMentors] = useState<FollowedMentorCardState[]>([]);
    const [users, setUsers] = useState<FollowUserResult[]>([]);
    const [followers, setFollowers] = useState<FollowUserResult[]>([]);
    const [userSearchKeyword, setUserSearchKeyword] = useState("");
    const [userSearchResults, setUserSearchResults] = useState<FollowUserResult[]>([]);
    const [userSearchLoading, setUserSearchLoading] = useState(false);
    const [activeView, setActiveView] = useState<FollowView>("following");
    const [activeCategory, setActiveCategory] = useState<FollowCategory>("mentor");
    const [mentorCurrentPage, setMentorCurrentPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [actionMentorId, setActionMentorId] = useState<number | undefined>(undefined);
    const [actionUserId, setActionUserId] = useState<number | undefined>(undefined);
    const [errorMessage, setErrorMessage] = useState("");

    const fetchFollows = useCallback(async () => {
        if (!isLoggedIn) {
            setMentors([]);
            setUsers([]);
            setFollowers([]);
            return;
        }

        setLoading(true);
        setErrorMessage("");

        try {
            const [mentorRes, userRes, followerRes] = await Promise.all([
                request<FollowedMentorsResponse>("/api/follow/mentors", "GET", true),
                request<FollowedUsersResponse>("/api/follow/users", "GET", true),
                request<FollowersResponse>("/api/follow/followers", "GET", true),
            ]);
            setMentors(
                Array.isArray(mentorRes.mentors)
                    ? mentorRes.mentors.map((mentor) => ({
                        ...mentor,
                        followed: true,
                    }))
                    : [],
            );
            setUsers(Array.isArray(userRes.users) ? userRes.users : []);
            setFollowers(Array.isArray(followerRes.users) ? followerRes.users : []);
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

    const toggleUserFollow = async (targetUser: FollowUserResult) => {
        const targetUserId = targetUser.id;
        setActionUserId(targetUserId);
        setErrorMessage("");

        try {
            const res = await request<{ followed?: boolean }>(
                `/api/follow/users/${targetUserId}`,
                targetUser.followed ? "DELETE" : "POST",
                true,
            );
            const followed = Boolean(res.followed);
            const updateUser = (item: FollowUserResult) => (
                item.id === targetUserId ? { ...item, followed } : item
            );
            setUsers((currentUsers) => {
                const updatedUsers = currentUsers.map(updateUser);
                if (updatedUsers.some((item) => item.id === targetUserId)) {
                    return updatedUsers;
                }
                return followed ? [{ ...targetUser, followed }, ...updatedUsers] : updatedUsers;
            });
            setUserSearchResults((currentUsers) => currentUsers.map(updateUser));
            setFollowers((currentUsers) => currentUsers.map(updateUser));
        }
        catch (err) {
            setErrorMessage(FAILURE_PREFIX + String(err));
        }
        finally {
            setActionUserId(undefined);
        }
    };

    const searchUsers = async () => {
        const keyword = userSearchKeyword.trim();
        if (keyword === "") {
            setUserSearchResults([]);
            return;
        }

        setUserSearchLoading(true);
        setErrorMessage("");

        try {
            const res = await request<SearchUsersResponse>(
                `/api/search/users?keyword=${encodeURIComponent(keyword)}`,
                "GET",
                true,
            );
            setUserSearchResults(Array.isArray(res.users) ? res.users : []);
        }
        catch (err) {
            setUserSearchResults([]);
            setErrorMessage(FAILURE_PREFIX + String(err));
        }
        finally {
            setUserSearchLoading(false);
        }
    };

    const openUserProfile = (userId: number) => {
        void router.push(`/users/${userId}`);
    };

    const renderUserCard = (user: FollowUserResult, keyPrefix: string) => (
        <div
            className="userCard"
            key={`${keyPrefix}-${user.id}`}
            role="button"
            tabIndex={0}
            aria-label={`进入${user.realName || user.username}用户主页`}
            onClick={() => openUserProfile(user.id)}
            onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openUserProfile(user.id);
                }
            }}
        >
            <div className="userAvatar" aria-hidden="true">
                {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt="" />
                ) : (
                    <span>{user.username.slice(0, 1).toUpperCase()}</span>
                )}
            </div>
            <div className="userText">
                <h4>{user.realName || user.username}</h4>
                <p>{user.username} · {user.role}</p>
                <p>{user.signature || "暂无签名"}</p>
            </div>
            <div className="userFollowButtonShell" onClick={(event) => event.stopPropagation()}>
                <FollowToggleButton
                    className="followToggleButton"
                    followed={user.followed}
                    loading={actionUserId === user.id}
                    onClick={() => void toggleUserFollow(user)}
                />
            </div>
        </div>
    );

    const followedUserIds = new Set(
        users.filter((user) => user.followed).map((user) => user.id),
    );
    const followingCount = mentors.filter((mentor) => mentor.followed).length + users.filter((user) => user.followed).length;
    const visibleUserSearchResults = userSearchResults.filter((user) => (
        !user.followed && !followedUserIds.has(user.id)
    ));
    const mentorTotalPages = Math.max(1, Math.ceil(mentors.length / FOLLOWED_MENTOR_CARDS_PER_PAGE));
    const safeMentorCurrentPage = Math.min(mentorCurrentPage, mentorTotalPages);
    const mentorPageStartIndex = (safeMentorCurrentPage - 1) * FOLLOWED_MENTOR_CARDS_PER_PAGE;
    const paginatedMentors = mentors.slice(
        mentorPageStartIndex,
        mentorPageStartIndex + FOLLOWED_MENTOR_CARDS_PER_PAGE,
    );

    useEffect(() => {
        void fetchFollows();
    }, [fetchFollows]);

    useEffect(() => {
        if (mentorCurrentPage > mentorTotalPages) {
            setMentorCurrentPage(mentorTotalPages);
        }
    }, [mentorCurrentPage, mentorTotalPages]);

    if (!isLoggedIn) {
        return (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 960 }}>
                <p>请先登录后查看关注列表。</p>
            </div>
        );
    }

        return (
            <div className="followsPage">
                <div className="pageHeader">
                    <h2 className="pageTitle">{activeView === "following" ? "我的关注" : "我的粉丝"}</h2>
                    <div className="viewSwitchGroup" role="group" aria-label="关注页面切换">
                        <div className="viewSwitch">
                            <span
                                className={activeView === "following" ? "viewSwitchThumb" : "viewSwitchThumb viewSwitchThumbFollowers"}
                                aria-hidden="true"
                            />
                            <button
                                className={activeView === "following" ? "searchSegmentButton viewSwitchButton viewSwitchButtonActive" : "searchSegmentButton viewSwitchButton"}
                                type="button"
                                aria-pressed={activeView === "following"}
                                onClick={() => setActiveView("following")}
                            >
                                <span className="viewSwitchButtonLabel">我的关注</span>
                                <span className="viewSwitchButtonCount" aria-hidden="true">
                                    {formatViewSwitchCount(followingCount)}
                                </span>
                            </button>
                            <button
                                className={activeView === "followers" ? "searchSegmentButton viewSwitchButton viewSwitchButtonActive" : "searchSegmentButton viewSwitchButton"}
                                type="button"
                                aria-pressed={activeView === "followers"}
                                onClick={() => setActiveView("followers")}
                            >
                                <span className="viewSwitchButtonLabel">我的粉丝</span>
                                <span className="viewSwitchButtonCount" aria-hidden="true">
                                    {formatViewSwitchCount(followers.length)}
                                </span>
                            </button>
                        </div>
                    </div>
                </div>

            {activeView === "following" ? (
            <div className="content">
                <aside className="sidebar" aria-label="关注筛选">
                    <button
                        className={activeCategory === "mentor" ? "filterButton filterButtonActive" : "filterButton"}
                        type="button"
                        onClick={() => setActiveCategory("mentor")}
                    >
                        导师（{mentors.filter((mentor) => mentor.followed).length}）
                    </button>
                    <button
                        className={activeCategory === "user" ? "filterButton filterButtonActive" : "filterButton"}
                        type="button"
                        onClick={() => setActiveCategory("user")}
                    >
                        用户（{users.filter((user) => user.followed).length}）
                    </button>
                </aside>

                <main className="main">
                    {loading && <p>加载中...</p>}
                    {errorMessage !== "" && <p style={{ color: "#c62828" }}>{errorMessage}</p>}

                    {activeCategory === "mentor" && !loading && mentors.length === 0 && errorMessage === "" && (
                        <p>暂无关注导师</p>
                    )}

                    {activeCategory === "mentor" && (
                        <div className="mentorSection">
                            <div className="mentorGrid">
                                {paginatedMentors.map((mentor) => (
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
                                        <div className="mentorCardHeader" data-testid={`mentor-card-header-${mentor.id}`}>
                                            <h3 className="mentorName">
                                                {mentor.Chinese_name}
                                                {mentor.is_private && (
                                                    <span className="privateBadge">我的私有导师</span>
                                                )}
                                            </h3>
                                            <div className="followButtonShell" onClick={(event) => event.stopPropagation()}>
                                                <FollowToggleButton
                                                    className="followToggleButton"
                                                    followed={mentor.followed}
                                                    followedLabel="已关注"
                                                    loading={actionMentorId === mentor.id}
                                                    onClick={() => void toggleFollow(mentor)}
                                                    style={buildSearchLikeMentorFollowButtonStyle(mentor.followed)}
                                                />
                                            </div>
                                        </div>
                                        {mentor.English_name && (
                                            <p className="mentorMeta">英文名：{mentor.English_name}</p>
                                        )}
                                        <p className="mentorMeta">研究方向：{mentor.research_direction || "暂无研究方向"}</p>
                                        <p className="mentorMeta">邮箱：{mentor.email || "暂无邮箱"}</p>
                                    </div>
                                ))}
                            </div>

                            {mentors.length > 0 && (
                                <div className="mentorPagination">
                                    <Pagination
                                        currentPage={safeMentorCurrentPage}
                                        totalPages={mentorTotalPages}
                                        loading={loading}
                                        centered
                                        controlHeight={33.77}
                                        jumpInputWidth={120}
                                        activePageHighlightColor="rgb(8, 109, 177)"
                                        onPageChange={(newPage) => setMentorCurrentPage(newPage)}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {activeCategory === "user" && (
                    <section className="userFollowSection" aria-label="关注用户">
                        <section className="userSearchSection" aria-label="搜索关注用户">
                            <div className="sectionHeader">
                                <h3>关注用户</h3>
                            </div>

                            <div className="userSearch">
                                <input
                                    type="text"
                                    value={userSearchKeyword}
                                    placeholder="搜索用户名、姓名或邮箱"
                                    onChange={(event) => setUserSearchKeyword(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                            void searchUsers();
                                        }
                                    }}
                                />
                                <button type="button" onClick={() => void searchUsers()} disabled={userSearchLoading}>
                                    {userSearchLoading ? "搜索中..." : "搜索用户"}
                                </button>
                            </div>

                            {visibleUserSearchResults.length > 0 && (
                                <div className="userList" aria-label="用户搜索结果">
                                    {visibleUserSearchResults.map((user) => renderUserCard(user, "search"))}
                                </div>
                            )}
                        </section>

                        <section className="followedUserSection" aria-label="已关注用户区块">
                            <div className="sectionHeader">
                                <h3>已关注用户</h3>
                                <span>{users.filter((user) => user.followed).length}</span>
                            </div>

                            {!loading && users.length === 0 ? (
                                <p>暂无关注用户</p>
                            ) : (
                                <div className="userList" aria-label="已关注用户">
                                    {users.map((user) => renderUserCard(user, "followed"))}
                                </div>
                            )}
                        </section>
                    </section>
                    )}
                </main>
            </div>
            ) : (
                <main className="followersMain" aria-label="我的粉丝">
                    {loading && <p>加载中...</p>}
                    {errorMessage !== "" && <p style={{ color: "#c62828" }}>{errorMessage}</p>}

                    {!loading && followers.length === 0 && errorMessage === "" ? (
                        <p>暂无粉丝</p>
                    ) : (
                        <div className="userList" aria-label="关注自己的用户">
                            {followers.map((user) => renderUserCard(user, "follower"))}
                        </div>
                    )}
                </main>
            )}

            <style jsx>{`
                :global(.appMain:has(.followsPage)) {
                    width: min(1510px, calc(100% - 32px));
                }

                .followsPage {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    width: 100%;
                    max-width: 1477px;
                }

                .pageHeader {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 16px;
                }

                .pageTitle {
                    margin: 0;
                }

                .viewSwitchGroup {
                    min-width: 260px;
                }

                .viewSwitch {
                    position: relative;
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    align-items: stretch;
                    width: 100%;
                    height: 44px;
                    border: 1px solid #d0d7de;
                    border-radius: 16px;
                    background: rgba(246, 248, 250, 0.96);
                    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72), 0 1px 2px rgba(15, 23, 42, 0.04);
                    overflow: hidden;
                }

                .viewSwitchThumb {
                    position: absolute;
                    top: 2px;
                    bottom: 2px;
                    left: 2px;
                    width: calc((100% - 4px) / 2);
                    border-radius: 14px;
                    background: rgb(8, 109, 177);
                    border: 1px solid rgb(8, 109, 177);
                    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.18);
                    transform: translateX(0);
                    transition: transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
                    will-change: transform;
                }

                .viewSwitchThumbFollowers {
                    transform: translateX(100%);
                }

                .viewSwitchButton {
                    position: relative;
                    z-index: 1;
                    display: inline-flex;
                    min-height: 44px;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    border: 0;
                    border-radius: 16px;
                    background: transparent;
                    box-shadow: none;
                    color: #59636e;
                    padding: 0 16px;
                    font-size: 16px;
                    font-weight: 600;
                    appearance: none;
                    -webkit-appearance: none;
                    transition: color 180ms ease;
                }

                .viewSwitchButtonLabel,
                .viewSwitchButtonCount {
                    color: inherit;
                }

                .viewSwitchButtonCount {
                    display: inline-flex;
                    min-width: 5ch;
                    justify-content: flex-end;
                    font-size: 14px;
                    font-weight: 700;
                    font-variant-numeric: tabular-nums;
                }

                .viewSwitchButtonActive {
                    font-weight: 700;
                    color: #fff;
                }

                .viewSwitchButton:hover,
                .viewSwitchButton:focus-visible {
                    box-shadow: none;
                    transform: none;
                }

                .viewSwitchButton:focus-visible {
                    outline: 2px solid rgba(8, 109, 177, 0.35);
                    outline-offset: 2px;
                }

                .content {
                    display: grid;
                    grid-template-columns: 160px 1fr;
                    gap: 18px;
                    align-items: start;
                }

                .sidebar {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
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

                .filterButtonActive {
                    border-color: #0969da;
                    background: #eef6ff;
                    color: #0969da;
                }

                .main {
                    min-width: 0;
                }

                .followersMain {
                    min-width: 0;
                }

                .mentorSection {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .mentorGrid {
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    gap: 12px;
                }

                .mentorPagination {
                    display: flex;
                    justify-content: center;
                }

                .userFollowSection {
                    display: flex;
                    flex-direction: column;
                    gap: 18px;
                }

                .userSearchSection,
                .followedUserSection {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .followedUserSection {
                    border-top: 1px solid #d0d7de;
                    padding-top: 16px;
                }

                .sectionHeader {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                }

                .sectionHeader h3 {
                    margin: 0;
                    font-size: 18px;
                }

                .sectionHeader span {
                    border: 1px solid #d0d7de;
                    border-radius: 999px;
                    padding: 4px 10px;
                    color: #57606a;
                    font-size: 13px;
                    font-weight: 700;
                }

                .userSearch {
                    display: flex;
                    gap: 8px;
                }

                .userSearch input {
                    min-width: 0;
                    flex: 1;
                    border: 1px solid #d0d7de;
                    border-radius: 6px;
                    padding: 10px 12px;
                }

                .userSearch button {
                    border: 1px solid #222;
                    border-radius: 6px;
                    background: #fff;
                    padding: 10px 14px;
                    font-weight: 700;
                }

                .userList {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }

                .userCard {
                    display: grid;
                    grid-template-columns: 44px minmax(0, 1fr) auto;
                    gap: 12px;
                    align-items: center;
                    border: 1px solid #d0d7de;
                    border-radius: 8px;
                    padding: 12px;
                    background: #fff;
                    cursor: pointer;
                    transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
                }

                .userCard:hover,
                .userCard:focus {
                    border-color: #8c959f;
                    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
                    outline: none;
                    transform: translateY(-1px);
                }

                .userAvatar,
                .userAvatar img {
                    width: 44px;
                    height: 44px;
                    border-radius: 50%;
                }

                .userAvatar {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    overflow: hidden;
                    background: #eef6ff;
                    color: #0969da;
                    font-weight: 800;
                }

                .userAvatar img {
                    display: block;
                    object-fit: cover;
                }

                .userText {
                    min-width: 0;
                }

                .userText h4,
                .userText p {
                    overflow: hidden;
                    margin: 0;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .userText h4 {
                    font-size: 16px;
                }

                .userText p {
                    color: #57606a;
                    font-size: 13px;
                }

                .userFollowButtonShell {
                    justify-self: end;
                }

                .mentorCard {
                    min-height: 158px;
                    padding: 14px;
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

                .mentorCardHeader {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 12px;
                    margin-bottom: 8px;
                }

                .followButtonShell {
                    flex-shrink: 0;
                }

                .followToggleButton {
                    position: relative;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    min-width: 72px;
                    min-height: 28px;
                    border: 0 solid transparent;
                    border-radius: 6px;
                    background: rgb(8, 109, 177);
                    color: #ffffff;
                    padding: 0 12px;
                    font-size: 14px;
                    font-weight: 500;
                    line-height: 1;
                    white-space: nowrap;
                    overflow: hidden;
                    cursor: pointer;
                    box-shadow: none;
                    transition: none;
                    appearance: none;
                    opacity: 1;
                }

                .followToggleButton span {
                    color: inherit;
                }

                .followToggleButton:hover:not(:disabled),
                .followToggleButton:focus-visible {
                    transform: none;
                    box-shadow: none;
                }

                .followToggleButton:focus-visible {
                    outline: 2px solid rgba(8, 109, 177, 0.35);
                    outline-offset: 2px;
                }

                .followToggleButton:disabled {
                    opacity: 1;
                    cursor: not-allowed;
                }

                :global(.followToggleButtonOverlay) {
                    position: absolute;
                    inset: 0;
                    background: rgba(255, 255, 255, 0.55);
                }

                .mentorName {
                    margin: 0;
                    font-size: 18px;
                    line-height: 1.35;
                }

                .privateBadge {
                    margin-left: 8px;
                    font-size: 12px;
                    color: #555;
                    font-weight: 400;
                }

                .mentorMeta {
                    margin: 4px 0 0;
                    color: #333;
                    line-height: 1.45;
                    overflow-wrap: anywhere;
                    word-break: break-word;
                }

                @media (max-width: 720px) {
                    .pageHeader {
                        align-items: stretch;
                        flex-direction: column;
                    }

                    .viewSwitch {
                        width: 100%;
                        min-width: 0;
                    }

                    .content {
                        grid-template-columns: 1fr;
                    }

                    .mentorGrid {
                        grid-template-columns: 1fr;
                    }

                    .userCard {
                        grid-template-columns: 40px minmax(0, 1fr);
                    }

                    .userFollowButtonShell {
                        grid-column: 1 / -1;
                        justify-self: start;
                    }
                }
            `}</style>
        </div>
    );
};

export default FollowsPage;
