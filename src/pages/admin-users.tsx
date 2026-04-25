import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useSelector } from "react-redux";

import { FAILURE_PREFIX } from "../constants/string";
import { RootState } from "../redux/store";
import { NetworkError, NetworkErrorType, request } from "../utils/network";
import { AdminUserResult, SearchMentorResult } from "../utils/types";

type UserRole = "student" | "mentor" | "admin" | "banned";
type UserRoleFilter = "" | UserRole;

const AdminUsersPage = () => {
    const router = useRouter();
    const token = useSelector((state: RootState) => state.auth.token);
    const role = useSelector((state: RootState) => state.auth.role);
    const isAdmin = token.trim() !== "" && role === "admin";

    const [loadingUsers, setLoadingUsers] = useState(false);
    const [savingUserId, setSavingUserId] = useState<number | undefined>(undefined);
    const [errorMessage, setErrorMessage] = useState("");
    const [successMessage, setSuccessMessage] = useState("");
    const [searchKeyword, setSearchKeyword] = useState("");
    const [roleFilter, setRoleFilter] = useState<UserRoleFilter>("");
    const [users, setUsers] = useState<AdminUserResult[]>([]);
    const [currentUserId, setCurrentUserId] = useState<number | undefined>(undefined);
    const [mentorSearchKeyword, setMentorSearchKeyword] = useState("");
    const [mentorSearchLoading, setMentorSearchLoading] = useState(false);
    const [mentorSearchResults, setMentorSearchResults] = useState<SearchMentorResult[]>([]);

    const [draftRoleByUserId, setDraftRoleByUserId] = useState<Record<number, UserRole>>({});
    const [draftMentorIdByUserId, setDraftMentorIdByUserId] = useState<Record<number, string>>({});

    const formatError = (err: unknown) => {
        if (err instanceof NetworkError) {
            if (err.type === NetworkErrorType.UNAUTHORIZED) {
                return "请先登录管理员账号";
            }
            if (err.type === NetworkErrorType.REJECTED) {
                return "当前账号无权限执行该操作";
            }
            return String(err);
        }
        return FAILURE_PREFIX + String(err);
    };

    const syncDrafts = (nextUsers: AdminUserResult[]) => {
        const nextRoleDrafts: Record<number, UserRole> = {};
        const nextMentorDrafts: Record<number, string> = {};
        for (const user of nextUsers) {
            nextRoleDrafts[user.id] = user.role as UserRole;
            nextMentorDrafts[user.id] = user.mentorProfile ? String(user.mentorProfile.id) : "";
        }
        setDraftRoleByUserId(nextRoleDrafts);
        setDraftMentorIdByUserId(nextMentorDrafts);
    };

    const fetchUsers = async (keyword?: string, nextRoleFilter?: UserRoleFilter) => {
        if (!isAdmin) {
            return;
        }

        setLoadingUsers(true);
        setErrorMessage("");

        try {
            const trimmedKeyword = (keyword ?? searchKeyword).trim();
            const resolvedRoleFilter = nextRoleFilter ?? roleFilter;
            const queryParams = new URLSearchParams();
            if (trimmedKeyword !== "") {
                queryParams.set("keyword", trimmedKeyword);
            }
            if (resolvedRoleFilter !== "") {
                queryParams.set("role", resolvedRoleFilter);
            }
            const query = queryParams.toString() === "" ? "" : `?${queryParams.toString()}`;
            const res = await request(`/api/management/users${query}`, "GET", true);
            const nextUsers = Array.isArray(res.users) ? (res.users as AdminUserResult[]) : [];
            setUsers(nextUsers);
            setCurrentUserId(typeof res.currentUserId === "number" ? res.currentUserId : undefined);
            syncDrafts(nextUsers);
        }
        catch (err) {
            setUsers([]);
            setErrorMessage(formatError(err));
        }
        finally {
            setLoadingUsers(false);
        }
    };

    useEffect(() => {
        void fetchUsers("");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAdmin]);

    const publicMentorSearchResults = useMemo(() => {
        return mentorSearchResults.filter((mentor) => !mentor.is_private);
    }, [mentorSearchResults]);

    const searchPublicMentors = async () => {
        const trimmedKeyword = mentorSearchKeyword.trim();
        if (trimmedKeyword === "") {
            setMentorSearchResults([]);
            return;
        }

        setMentorSearchLoading(true);
        setErrorMessage("");

        try {
            const res = await request(
                `/api/search/mentors?keyword=${encodeURIComponent(trimmedKeyword)}&search_mode=fuzzy`,
                "GET",
                true,
            );
            const nextMentors = Array.isArray(res.mentors) ? (res.mentors as SearchMentorResult[]) : [];
            setMentorSearchResults(nextMentors);
        }
        catch (err) {
            setMentorSearchResults([]);
            setErrorMessage(formatError(err));
        }
        finally {
            setMentorSearchLoading(false);
        }
    };

    const saveUser = async (user: AdminUserResult) => {
        const nextRole = draftRoleByUserId[user.id] || (user.role as UserRole);
        const nextMentorId = (draftMentorIdByUserId[user.id] || "").trim();
        const payload: { role: UserRole; mentorId?: number } = {
            role: nextRole,
        };

        if (nextRole === "mentor" && nextMentorId !== "") {
            payload.mentorId = Number(nextMentorId);
        }

        setSavingUserId(user.id);
        setErrorMessage("");
        setSuccessMessage("");

        try {
            const res = await request(`/api/management/users/${user.id}`, "PUT", true, payload);
            const updatedUser = res.user as AdminUserResult;
            const nextUsers = users.map((currentUser) => currentUser.id === user.id ? updatedUser : currentUser);
            setUsers(nextUsers);
            syncDrafts(nextUsers);
            setSuccessMessage(`已更新用户 ${updatedUser.username}`);
        }
        catch (err) {
            setErrorMessage(formatError(err));
        }
        finally {
            setSavingUserId(undefined);
        }
    };

    if (!isAdmin) {
        return (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 760 }}>
                <h2>用户管理</h2>
                <p>仅管理员可以访问该页面。</p>
                <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => router.push("/")}>返回首页</button>
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 980 }}>
            <h2>用户管理</h2>
            <p>管理员可统一管理用户角色，并将 `mentor` 角色绑定到公共导师数据库中的导师记录。</p>

            <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => router.push("/")}>返回首页</button>
                <button onClick={() => router.push("/search")}>去检索</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, border: "1px solid #ccc", borderRadius: 6, padding: 12 }}>
                <h3 style={{ margin: 0 }}>用户筛选</h3>
                <div style={{ display: "flex", gap: 8 }}>
                    <input
                        type="text"
                        value={searchKeyword}
                        placeholder="按用户名、邮箱或真实姓名搜索"
                        onChange={(e) => setSearchKeyword(e.target.value)}
                        style={{ flex: 1 }}
                    />
                    <select
                        value={roleFilter}
                        onChange={(e) => setRoleFilter(e.target.value as UserRoleFilter)}
                        style={{ width: 180 }}
                    >
                        <option value="">全部角色</option>
                        <option value="student">student</option>
                        <option value="mentor">mentor</option>
                        <option value="admin">admin</option>
                        <option value="banned">banned</option>
                    </select>
                    <button onClick={() => void fetchUsers()} disabled={loadingUsers}>
                        {loadingUsers ? "搜索中..." : "搜索用户"}
                    </button>
                </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, border: "1px solid #ccc", borderRadius: 6, padding: 12 }}>
                <h3 style={{ margin: 0 }}>公共导师检索</h3>
                <div style={{ display: "flex", gap: 8 }}>
                    <input
                        type="text"
                        value={mentorSearchKeyword}
                        placeholder="搜索公共导师，便于绑定 mentor 角色"
                        onChange={(e) => setMentorSearchKeyword(e.target.value)}
                        style={{ flex: 1 }}
                    />
                    <button onClick={() => void searchPublicMentors()} disabled={mentorSearchLoading}>
                        {mentorSearchLoading ? "搜索中..." : "搜索导师"}
                    </button>
                </div>

                {publicMentorSearchResults.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {publicMentorSearchResults.map((mentor) => (
                            <div key={mentor.id} style={{ padding: 10, border: "1px solid #ddd", borderRadius: 6 }}>
                                <p style={{ margin: "0 0 4px" }}>
                                    {mentor.Chinese_name}
                                    {mentor.English_name ? ` / ${mentor.English_name}` : ""}
                                </p>
                                <p style={{ margin: 0 }}>ID: {mentor.id}，方向：{mentor.research_direction || "暂无研究方向"}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {errorMessage !== "" && (
                <div style={{ padding: 12, border: "1px solid #f1aeb5", backgroundColor: "#f8d7da" }}>
                    {errorMessage}
                </div>
            )}

            {successMessage !== "" && (
                <div style={{ padding: 12, border: "1px solid #badbcc", backgroundColor: "#d1e7dd" }}>
                    {successMessage}
                </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {users.map((user) => {
                    const draftRole = draftRoleByUserId[user.id] || (user.role as UserRole);
                    const draftMentorId = draftMentorIdByUserId[user.id] || "";
                    const isSaving = savingUserId === user.id;

                    return (
                        <div key={user.id} style={{ padding: 12, border: "1px solid #ccc", borderRadius: 6 }}>
                            <h3 style={{ margin: "0 0 8px" }}>
                                {user.username}
                                {currentUserId === user.id && (
                                    <span style={{ marginLeft: 8, fontSize: 12, color: "#555" }}>当前登录管理员</span>
                                )}
                            </h3>
                            <p style={{ margin: "4px 0" }}>邮箱：{user.email}</p>
                            <p style={{ margin: "4px 0" }}>当前角色：{user.role}</p>
                            <p style={{ margin: "4px 0" }}>
                                当前绑定公共导师：
                                {user.mentorProfile ? `${user.mentorProfile.Chinese_name} (ID: ${user.mentorProfile.id})` : "未绑定"}
                            </p>

                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                                <select
                                    value={draftRole}
                                    onChange={(e) => {
                                        const nextRole = e.target.value as UserRole;
                                        setDraftRoleByUserId((prev) => ({ ...prev, [user.id]: nextRole }));
                                        if (nextRole !== "mentor") {
                                            setDraftMentorIdByUserId((prev) => ({ ...prev, [user.id]: "" }));
                                        }
                                    }}
                                    disabled={isSaving}
                                >
                                    <option value="student">student</option>
                                    <option value="mentor">mentor</option>
                                    <option value="admin">admin</option>
                                    <option value="banned">banned</option>
                                </select>

                                <input
                                    type="number"
                                    value={draftMentorId}
                                    placeholder="公共导师 ID（mentor 必填）"
                                    onChange={(e) => setDraftMentorIdByUserId((prev) => ({ ...prev, [user.id]: e.target.value }))}
                                    disabled={isSaving || draftRole !== "mentor"}
                                    style={{ width: 220 }}
                                />

                                <button
                                    onClick={() => void saveUser(user)}
                                    disabled={isSaving || (draftRole === "mentor" && draftMentorId.trim() === "")}
                                >
                                    {isSaving ? "保存中..." : "保存角色与绑定"}
                                </button>
                            </div>
                        </div>
                    );
                })}

                {!loadingUsers && users.length === 0 && (
                    <div style={{ padding: 12, border: "1px dashed #ccc" }}>
                        当前没有可显示的用户。
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminUsersPage;
