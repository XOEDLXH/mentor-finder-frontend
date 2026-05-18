import { CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useSelector } from "react-redux";

import FollowToggleButton from "../components/FollowToggleButton";
import LatexText from "../components/LatexText";
import Pagination from "../components/Pagination";
import { FAILURE_PREFIX } from "../constants/string";
import { RootState } from "../redux/store";
import { request } from "../utils/network";
import { FollowUserResult, SearchMentorResult, TimelinePaper } from "../utils/types";

interface FollowedMentorsResponse {
    mentors?: SearchMentorResult[];
}

interface FollowedUsersResponse {
    users?: FollowUserResult[];
}

interface FollowersResponse {
    users?: FollowUserResult[];
}

interface FollowedSubjectResult {
    subject: string;
    subjectName?: string;
    paperCount: number;
    recentPapers: TimelinePaper[];
}

interface AvailableSubjectResult {
    subject: string;
    subjectName?: string;
    paperCount: number;
    followed: boolean;
}

interface FollowedSubjectsResponse {
    subjects?: FollowedSubjectResult[];
    availableSubjects?: AvailableSubjectResult[];
}

interface SearchUsersResponse {
    users?: FollowUserResult[];
}

interface FollowedMentorCardState extends SearchMentorResult {
    followed: boolean;
}

type FollowCategory = "mentor" | "user" | "subject";
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
    const [subjects, setSubjects] = useState<FollowedSubjectResult[]>([]);
    const [availableSubjects, setAvailableSubjects] = useState<AvailableSubjectResult[]>([]);
    const [subjectSearchKeyword, setSubjectSearchKeyword] = useState("");
    const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());
    const [userSearchKeyword, setUserSearchKeyword] = useState("");
    const [userSearchResults, setUserSearchResults] = useState<FollowUserResult[]>([]);
    const [userSearchLoading, setUserSearchLoading] = useState(false);
    const [activeView, setActiveView] = useState<FollowView>("following");
    const [activeCategory, setActiveCategory] = useState<FollowCategory>("mentor");
    const [mentorCurrentPage, setMentorCurrentPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [actionMentorId, setActionMentorId] = useState<number | undefined>(undefined);
    const [actionUserId, setActionUserId] = useState<number | undefined>(undefined);
    const [actionSubject, setActionSubject] = useState<string | undefined>(undefined);
    const [errorMessage, setErrorMessage] = useState("");

    const fetchFollows = useCallback(async () => {
        if (!isLoggedIn) {
            setMentors([]);
            setUsers([]);
            setFollowers([]);
            setSubjects([]);
            setAvailableSubjects([]);
            return;
        }

        setLoading(true);
        setErrorMessage("");

        try {
            const [mentorRes, userRes, followerRes, subjectRes] = await Promise.all([
                request<FollowedMentorsResponse>("/api/follow/mentors", "GET", true),
                request<FollowedUsersResponse>("/api/follow/users", "GET", true),
                request<FollowersResponse>("/api/follow/followers", "GET", true),
                request<FollowedSubjectsResponse>("/api/follow/subjects", "GET", true),
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
            setSubjects(Array.isArray(subjectRes.subjects) ? subjectRes.subjects : []);
            setAvailableSubjects(Array.isArray(subjectRes.availableSubjects) ? subjectRes.availableSubjects : []);
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

    const toggleSubjectFollow = async (targetSubject: string, followed: boolean) => {
        setActionSubject(targetSubject);
        setErrorMessage("");

        try {
            const res = await request<{ followed?: boolean; subject?: FollowedSubjectResult | string }>(
                `/api/follow/subjects/${encodeURIComponent(targetSubject)}`,
                followed ? "DELETE" : "POST",
                true,
            );
            const nextFollowed = Boolean(res.followed);

            setAvailableSubjects((currentSubjects) => currentSubjects.map((item) => (
                item.subject === targetSubject ? { ...item, followed: nextFollowed } : item
            )));

            if (nextFollowed && typeof res.subject === "object" && Boolean(res.subject)) {
                setSubjects((currentSubjects) => {
                    if (currentSubjects.some((item) => item.subject === targetSubject)) {
                        return currentSubjects;
                    }
                    return [res.subject as FollowedSubjectResult, ...currentSubjects];
                });
            }
            else {
                setSubjects((currentSubjects) => currentSubjects.filter((item) => item.subject !== targetSubject));
                setExpandedSubjects((currentSubjects) => {
                    const nextSubjects = new Set(currentSubjects);
                    nextSubjects.delete(targetSubject);
                    return nextSubjects;
                });
            }
        }
        catch (err) {
            setErrorMessage(FAILURE_PREFIX + String(err));
        }
        finally {
            setActionSubject(undefined);
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

    const buildPaperPdfUrl = (arxivUrl?: string) => {
        if (typeof arxivUrl !== "string" || arxivUrl.trim() === "" || !arxivUrl.includes("/abs/")) {
            return "";
        }

        return arxivUrl.replace("/abs/", "/pdf/");
    };

    const toggleSubjectExpand = (subject: string) => {
        setExpandedSubjects((currentSubjects) => {
            const nextSubjects = new Set(currentSubjects);
            if (nextSubjects.has(subject)) {
                nextSubjects.delete(subject);
            }
            else {
                nextSubjects.add(subject);
            }
            return nextSubjects;
        });
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
            <div className="userCardProfile">
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
    const followedSubjectSet = useMemo(
        () => new Set(subjects.map((subject) => subject.subject)),
        [subjects],
    );
    const filteredAvailableSubjects = useMemo(() => {
        const keyword = subjectSearchKeyword.trim().toLowerCase();
        return availableSubjects.filter((subject) => {
            if (subject.followed || followedSubjectSet.has(subject.subject)) {
                return false;
            }
            if (keyword === "") {
                return true;
            }
            return subject.subject.toLowerCase().includes(keyword)
                || (subject.subjectName || subject.subject).toLowerCase().includes(keyword);
        });
    }, [availableSubjects, followedSubjectSet, subjectSearchKeyword]);
    const followingCount = mentors.filter((mentor) => mentor.followed).length
        + users.filter((user) => user.followed).length
        + subjects.length;
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
                    <button
                        className={activeCategory === "subject" ? "filterButton filterButtonActive" : "filterButton"}
                        type="button"
                        onClick={() => setActiveCategory("subject")}
                    >
                        板块（{subjects.length}）
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

                    {activeCategory === "subject" && (
                    <section className="subjectFollowSection" aria-label="关注板块">
                        <section className="subjectSearchSection" aria-label="搜索关注板块">
                            <div className="sectionHeader">
                                <h3>关注板块</h3>
                            </div>

                            <div className="userSearch">
                                <input
                                    type="text"
                                    value={subjectSearchKeyword}
                                    placeholder="搜索板块名称或代码，例如 人工智能 / cs.AI"
                                    onChange={(event) => setSubjectSearchKeyword(event.target.value)}
                                />
                            </div>

                            {filteredAvailableSubjects.length > 0 && (
                                <div className="subjectChipGrid" aria-label="可关注板块">
                                    {filteredAvailableSubjects.slice(0, 24).map((subject) => (
                                        <button
                                            key={subject.subject}
                                            className="subjectChip"
                                            type="button"
                                            disabled={actionSubject === subject.subject}
                                            onClick={() => void toggleSubjectFollow(subject.subject, false)}
                                        >
                                            <span>{subject.subjectName || subject.subject}</span>
                                            <small>{subject.paperCount} 篇</small>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </section>

                        <section className="followedSubjectSection" aria-label="已关注板块区块">
                            <div className="sectionHeader">
                                <h3>已关注板块</h3>
                                <span>{subjects.length}</span>
                            </div>

                            {!loading && subjects.length === 0 ? (
                                <p>暂无关注板块</p>
                            ) : (
                                <div className="subjectList" aria-label="已关注板块">
                                    {subjects.map((subject) => (
                                        <article className="subjectCard" key={subject.subject}>
                                            <div className="subjectCardHeader">
                                                <div>
                                                    <h4>{subject.subjectName || subject.subject}</h4>
                                                    <p>{subject.paperCount} 篇论文</p>
                                                </div>
                                                <div className="subjectActionGroup">
                                                    <button
                                                        className="subjectExpandButton"
                                                        type="button"
                                                        onClick={() => toggleSubjectExpand(subject.subject)}
                                                    >
                                                        {expandedSubjects.has(subject.subject) ? "收起论文" : "展开论文"}
                                                    </button>
                                                    <button
                                                        className="subjectUnfollowButton"
                                                        type="button"
                                                        disabled={actionSubject === subject.subject}
                                                        onClick={() => void toggleSubjectFollow(subject.subject, true)}
                                                    >
                                                        {actionSubject === subject.subject ? "处理中..." : "取消关注"}
                                                    </button>
                                                </div>
                                            </div>

                                            {expandedSubjects.has(subject.subject) && subject.recentPapers.length === 0 && (
                                                <p className="subjectEmptyText">该板块暂无论文。</p>
                                            )}

                                            {expandedSubjects.has(subject.subject) && subject.recentPapers.length > 0 && (
                                                <div className="subjectPaperList">
                                                    {subject.recentPapers.map((paper) => {
                                                        const pdfUrl = buildPaperPdfUrl(paper.arxiv_url);
                                                        return (
                                                            <div className="subjectPaperItem" key={paper.id}>
                                                                <div className="subjectPaperTitle">
                                                                    <LatexText text={paper.title} forceInlineMath />
                                                                </div>
                                                                <div className="subjectPaperMeta">
                                                                    <span>{paper.publish_date || "未知日期"}</span>
                                                                    <span>{paper.author_names || "未知作者"}</span>
                                                                    {paper.arxiv_url && (
                                                                        <a href={paper.arxiv_url} target="_blank" rel="noreferrer">
                                                                            arXiv
                                                                        </a>
                                                                    )}
                                                                    {pdfUrl !== "" && (
                                                                        <a href={pdfUrl} target="_blank" rel="noreferrer">
                                                                            PDF
                                                                        </a>
                                                                    )}
                                                                </div>
                                                                <p className="subjectPaperAbstract">
                                                                    {paper.tldr || paper.abstract || "暂无摘要"}
                                                                </p>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </article>
                                    ))}
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

                :global(.userFollowSection) {
                    display: flex;
                    flex-direction: column;
                    gap: 18px;
                }

                :global(.subjectFollowSection) {
                    display: flex;
                    flex-direction: column;
                    gap: 18px;
                }

                :global(.userSearchSection),
                :global(.followedUserSection),
                :global(.subjectSearchSection),
                :global(.followedSubjectSection) {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                :global(.followedUserSection),
                :global(.followedSubjectSection) {
                    border-top: 1px solid #d0d7de;
                    padding-top: 16px;
                }

                :global(.sectionHeader) {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                }

                :global(.sectionHeader h3) {
                    margin: 0;
                    font-size: 18px;
                }

                :global(.sectionHeader span) {
                    border: 1px solid #d0d7de;
                    border-radius: 999px;
                    padding: 4px 10px;
                    color: #57606a;
                    font-size: 13px;
                    font-weight: 700;
                }

                :global(.userSearch) {
                    display: flex;
                    gap: 8px;
                    align-items: stretch;
                }

                :global(.userSearch input) {
                    min-width: 0;
                    flex: 1;
                    border: 1px solid #d0d7de;
                    border-radius: 6px;
                    padding: 10px 12px;
                }

                :global(.userSearch button) {
                    flex: 0 0 auto;
                    border: 1px solid #222;
                    border-radius: 6px;
                    background: #fff;
                    padding: 10px 14px;
                    font-weight: 700;
                }

                :global(.userList) {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }

                :global(.subjectChipGrid) {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(176px, 1fr));
                    gap: 8px;
                }

                :global(.subjectChip) {
                    display: flex;
                    min-height: 54px;
                    align-items: center;
                    justify-content: space-between;
                    gap: 8px;
                    border: 1px solid #d0d7de;
                    border-radius: 8px;
                    background: #fff;
                    padding: 10px 12px;
                    color: #1f2328;
                    font-weight: 700;
                }

                :global(.subjectChip small) {
                    color: #57606a;
                    font-size: 12px;
                    font-weight: 600;
                    white-space: nowrap;
                }

                :global(.subjectChip:hover:not(:disabled)),
                :global(.subjectChip:focus-visible) {
                    border-color: #0969da;
                    color: #0969da;
                    outline: none;
                }

                :global(.subjectList) {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                :global(.subjectCard) {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    border: 1px solid #d0d7de;
                    border-radius: 8px;
                    background: #fff;
                    padding: 14px;
                }

                :global(.subjectCardHeader) {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 12px;
                }

                :global(.subjectActionGroup) {
                    display: inline-flex;
                    flex: 0 0 auto;
                    gap: 8px;
                    align-items: center;
                    flex-wrap: wrap;
                    justify-content: flex-end;
                }

                :global(.subjectCardHeader h4),
                :global(.subjectCardHeader p) {
                    margin: 0;
                }

                :global(.subjectCardHeader h4) {
                    font-size: 18px;
                }

                :global(.subjectCardHeader p) {
                    margin-top: 4px;
                    color: #57606a;
                    font-size: 13px;
                }

                :global(.subjectExpandButton),
                :global(.subjectUnfollowButton) {
                    border: 1px solid #d0d7de;
                    border-radius: 6px;
                    background: #f6f8fa;
                    padding: 8px 10px;
                    color: #1f2328;
                    font-weight: 700;
                }

                :global(.subjectExpandButton) {
                    border-color: rgb(8, 109, 177);
                    background: #fff;
                    color: rgb(8, 109, 177);
                }

                :global(.subjectPaperList) {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }

                :global(.subjectPaperItem) {
                    border-top: 1px solid #d8dee4;
                    padding-top: 10px;
                }

                :global(.subjectPaperTitle) {
                    color: #1f2328;
                    font-weight: 700;
                    line-height: 1.45;
                }

                :global(.subjectPaperMeta) {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                    margin-top: 4px;
                    color: #57606a;
                    font-size: 13px;
                }

                :global(.subjectPaperMeta a) {
                    color: rgb(8, 109, 177);
                    text-decoration: none;
                }

                :global(.subjectPaperAbstract),
                :global(.subjectEmptyText) {
                    margin: 6px 0 0;
                    color: #3f4650;
                    line-height: 1.55;
                }

                :global(.subjectPaperAbstract) {
                    display: -webkit-box;
                    overflow: hidden;
                    -webkit-box-orient: vertical;
                    -webkit-line-clamp: 3;
                }

                :global(.userCard) {
                    display: flex;
                    gap: 12px;
                    align-items: center;
                    justify-content: space-between;
                    border: 1px solid #d0d7de;
                    border-radius: 8px;
                    padding: 12px;
                    background: #fff;
                    cursor: pointer;
                    transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
                }

                :global(.userCard:hover),
                :global(.userCard:focus) {
                    border-color: #8c959f;
                    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
                    outline: none;
                    transform: translateY(-1px);
                }

                :global(.userCardProfile) {
                    display: grid;
                    grid-template-columns: 44px minmax(0, 1fr);
                    gap: 12px;
                    align-items: center;
                    min-width: 0;
                    flex: 1 1 auto;
                }

                :global(.userAvatar),
                :global(.userAvatar img) {
                    width: 44px;
                    height: 44px;
                    border-radius: 50%;
                }

                :global(.userAvatar) {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    overflow: hidden;
                    background: #eef6ff;
                    color: #0969da;
                    font-weight: 800;
                }

                :global(.userAvatar img) {
                    display: block;
                    object-fit: cover;
                }

                :global(.userText) {
                    min-width: 0;
                }

                :global(.userText h4),
                :global(.userText p) {
                    overflow: hidden;
                    margin: 0;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                :global(.userText h4) {
                    font-size: 16px;
                }

                :global(.userText p) {
                    color: #57606a;
                    font-size: 13px;
                }

                :global(.userFollowButtonShell) {
                    display: flex;
                    flex: 0 0 auto;
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

                    :global(.userSearch) {
                        flex-direction: column;
                    }

                    :global(.userSearch button) {
                        width: 100%;
                    }

                    :global(.userCard) {
                        align-items: flex-start;
                        flex-direction: column;
                    }

                    :global(.userCardProfile) {
                        grid-template-columns: 40px minmax(0, 1fr);
                        width: 100%;
                    }

                    :global(.userAvatar),
                    :global(.userAvatar img) {
                        width: 40px;
                        height: 40px;
                    }

                    :global(.userFollowButtonShell) {
                        justify-content: flex-start;
                        width: 100%;
                    }
                }
            `}</style>
        </div>
    );
};

export default FollowsPage;
