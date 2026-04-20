import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useSelector } from "react-redux";

import { FAILURE_PREFIX } from "../constants/string";
import { RootState } from "../redux/store";
import { NetworkError, NetworkErrorType, request } from "../utils/network";
import { PrivateMentorResult } from "../utils/types";

type PrivateMentorCategory = "all" | "withPapers" | "withoutPapers" | "withEmail";
type PrivateMentorSort = "latest" | "nameAsc" | "paperCountDesc";

const PrivateMentorScreen = () => {
    const router = useRouter();
    const token = useSelector((state: RootState) => state.auth.token);
    const isLoggedIn = token.trim() !== "";

    const [privateMentorSaving, setPrivateMentorSaving] = useState(false);
    const [privateMentorLoading, setPrivateMentorLoading] = useState(false);
    const [privateMentorMessage, setPrivateMentorMessage] = useState("");
    const [privateMentorFilter, setPrivateMentorFilter] = useState("");
    const [privateMentorCategory, setPrivateMentorCategory] = useState<PrivateMentorCategory>("all");
    const [privateMentorSort, setPrivateMentorSort] = useState<PrivateMentorSort>("latest");
    const [privateMentorDeletingId, setPrivateMentorDeletingId] = useState<number | undefined>(undefined);
    const [privateMentors, setPrivateMentors] = useState<PrivateMentorResult[]>([]);

    const [customMentorDraft, setCustomMentorDraft] = useState({
        Chinese_name: "",
        English_name: "",
    });

    const isNetworkErrorInstance = (err: unknown): err is NetworkError => {
        return typeof NetworkError === "function" && err instanceof NetworkError;
    };

    const formatPrivateMentorError = useCallback((err: unknown) => {
        if (isNetworkErrorInstance(err)) {
            if (err.type === NetworkErrorType.UNAUTHORIZED) {
                return "请先登录后再管理私有导师";
            }

            if (err.type === NetworkErrorType.REJECTED) {
                return "当前账号无权限创建私有导师";
            }

            return String(err);
        }

        return FAILURE_PREFIX + String(err);
    }, []);

    const fetchMyPrivateMentors = useCallback(async () => {
        if (!isLoggedIn) {
            setPrivateMentors([]);
            setPrivateMentorMessage("登录后可添加和查看私有导师");
            return;
        }

        setPrivateMentorLoading(true);

        try {
            const res = await request("/api/dataset/mentors/mine", "GET", true);
            const mentorList = Array.isArray(res.mentors) ? (res.mentors as PrivateMentorResult[]) : [];
            setPrivateMentors(mentorList.filter((mentor) => Array.isArray(mentor.paper_ids)));
            setPrivateMentorMessage("");
        }
        catch (err) {
            setPrivateMentorMessage(formatPrivateMentorError(err));
        }
        finally {
            setPrivateMentorLoading(false);
        }
    }, [formatPrivateMentorError, isLoggedIn]);

    useEffect(() => {
        void fetchMyPrivateMentors();
    }, [fetchMyPrivateMentors]);

    const displayedPrivateMentors = useMemo(() => {
        const keyword = privateMentorFilter.trim().toLowerCase();

        const filtered = privateMentors.filter((mentor) => {
            const matchKeyword = keyword === "" ||
                mentor.Chinese_name.toLowerCase().includes(keyword) ||
                String(mentor.English_name || "").toLowerCase().includes(keyword) ||
                String(mentor.research_direction || "").toLowerCase().includes(keyword);

            if (!matchKeyword) {
                return false;
            }

            if (privateMentorCategory === "withPapers") {
                return (mentor.paper_ids || []).length > 0;
            }

            if (privateMentorCategory === "withoutPapers") {
                return (mentor.paper_ids || []).length === 0;
            }

            if (privateMentorCategory === "withEmail") {
                return String(mentor.email || "").trim() !== "";
            }

            return true;
        });

        const sorted = [...filtered];

        if (privateMentorSort === "nameAsc") {
            sorted.sort((a, b) => {
                return a.Chinese_name.localeCompare(b.Chinese_name, "zh-CN");
            });
        }
        else if (privateMentorSort === "paperCountDesc") {
            sorted.sort((a, b) => {
                return (b.paper_ids || []).length - (a.paper_ids || []).length;
            });
        }
        else {
            sorted.sort((a, b) => {
                return b.id - a.id;
            });
        }

        return sorted;
    }, [privateMentorCategory, privateMentorFilter, privateMentorSort, privateMentors]);

    const addPrivateMentor = async () => {
        const chineseName = customMentorDraft.Chinese_name.trim();
        const englishName = customMentorDraft.English_name.trim();

        if (chineseName === "" && englishName === "") {
            setPrivateMentorMessage("中文名和英文名至少填写一个");
            return;
        }

        setPrivateMentorSaving(true);
        setPrivateMentorMessage("");

        try {
            await request("/api/dataset/mentors/custom", "POST", true, {
                Chinese_name: chineseName,
                English_name: englishName,
            });

            setCustomMentorDraft({ Chinese_name: "", English_name: "" });
            await fetchMyPrivateMentors();
            setPrivateMentorMessage("私有导师添加成功");
        }
        catch (err) {
            setPrivateMentorMessage(formatPrivateMentorError(err));
        }
        finally {
            setPrivateMentorSaving(false);
        }
    };

    const removePrivateMentor = async (mentorId: number) => {
        if (!globalThis.confirm("确认删除这个私有导师？")) {
            return;
        }

        setPrivateMentorDeletingId(mentorId);
        setPrivateMentorMessage("");

        try {
            await request(`/api/dataset/mentors/${mentorId}`, "DELETE", true);
            await fetchMyPrivateMentors();
            setPrivateMentorMessage("私有导师删除成功");
        }
        catch (err) {
            setPrivateMentorMessage(formatPrivateMentorError(err));
        }
        finally {
            setPrivateMentorDeletingId(undefined);
        }
    };

    if (!isLoggedIn) {
        return (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 760 }}>
                <h2>添加个人导师</h2>
                <p>请先登录后再添加个人导师。</p>
                <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => router.push("/login")}>去登录</button>
                    <button onClick={() => router.push("/profile")}>返回个人主页</button>
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 760 }}>
            <h2>添加个人导师</h2>
            <p>输入中文名或英文名后，系统将自动调用爬虫抓取导师信息并保存到你的私有库。</p>

            <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => router.push("/profile")}>返回个人主页</button>
                <button onClick={() => router.push("/search")}>去检索</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, border: "1px solid #ccc", borderRadius: 6, padding: 12 }}>
                <input
                    type="text"
                    placeholder="筛选我的私有导师（姓名/方向）"
                    value={privateMentorFilter}
                    onChange={(e) => setPrivateMentorFilter(e.target.value)}
                    disabled={privateMentorLoading || privateMentorSaving}
                />
                <div style={{ display: "flex", gap: 8 }}>
                    <select
                        id="private-mentor-category"
                        aria-label="私有导师分类"
                        value={privateMentorCategory}
                        onChange={(e) => setPrivateMentorCategory(e.target.value as PrivateMentorCategory)}
                        disabled={privateMentorLoading || privateMentorSaving}
                    >
                        <option value="all">全部导师</option>
                        <option value="withPapers">有论文</option>
                        <option value="withoutPapers">无论文</option>
                        <option value="withEmail">有邮箱</option>
                    </select>
                    <select
                        id="private-mentor-sort"
                        aria-label="私有导师排序"
                        value={privateMentorSort}
                        onChange={(e) => setPrivateMentorSort(e.target.value as PrivateMentorSort)}
                        disabled={privateMentorLoading || privateMentorSaving}
                    >
                        <option value="latest">按添加顺序</option>
                        <option value="nameAsc">按姓名</option>
                        <option value="paperCountDesc">按论文数量</option>
                    </select>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <input
                        type="text"
                        placeholder="导师中文名（可选）"
                        value={customMentorDraft.Chinese_name}
                        onChange={(e) => setCustomMentorDraft((prev) => ({ ...prev, Chinese_name: e.target.value }))}
                        disabled={privateMentorSaving || privateMentorLoading}
                        style={{ flex: 1 }}
                    />
                    <input
                        type="text"
                        placeholder="导师英文名（可选）"
                        value={customMentorDraft.English_name}
                        onChange={(e) => setCustomMentorDraft((prev) => ({ ...prev, English_name: e.target.value }))}
                        disabled={privateMentorSaving || privateMentorLoading}
                        style={{ flex: 1 }}
                    />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button
                        onClick={() => void addPrivateMentor()}
                        disabled={
                            privateMentorSaving ||
                            privateMentorLoading ||
                            (customMentorDraft.Chinese_name.trim() === "" && customMentorDraft.English_name.trim() === "")
                        }
                    >
                        {privateMentorSaving ? "爬取中..." : "添加私有导师"}
                    </button>
                    <button
                        onClick={() => void fetchMyPrivateMentors()}
                        disabled={privateMentorSaving || privateMentorLoading}
                    >
                        {privateMentorLoading ? "刷新中..." : "刷新我的列表"}
                    </button>
                </div>

                {privateMentorMessage !== "" && <p style={{ margin: 0 }}>{privateMentorMessage}</p>}

                <p style={{ margin: 0 }}>
                    共 {privateMentors.length} 位私有导师，当前显示 {displayedPrivateMentors.length} 位。
                </p>

                {privateMentors.length === 0 && !privateMentorLoading && (
                    <div style={{ padding: 12, border: "1px dashed #ccc" }}>
                        你还没有私有导师，添加后将只对你可见。
                    </div>
                )}

                {privateMentors.length > 0 && displayedPrivateMentors.length === 0 && (
                    <div style={{ padding: 12, border: "1px dashed #ccc" }}>
                        当前筛选条件下没有匹配的私有导师。
                    </div>
                )}

                {privateMentors.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {displayedPrivateMentors.map((mentor) => (
                            <div key={mentor.id} style={{ padding: 10, border: "1px solid #ddd", borderRadius: 6 }}>
                                <h4 style={{ margin: "0 0 6px" }}>
                                    {mentor.Chinese_name}
                                    <span style={{ marginLeft: 8, fontSize: 12, color: "#555" }}>
                                        {mentor.is_private ? "私有" : "公共"}
                                    </span>
                                </h4>
                                {mentor.English_name && <p style={{ margin: "4px 0" }}>英文名：{mentor.English_name}</p>}
                                <p style={{ margin: "4px 0" }}>研究方向：{mentor.research_direction || "暂无研究方向"}</p>
                                <p style={{ margin: "4px 0" }}>邮箱：{mentor.email || "暂无邮箱"}</p>
                                <p style={{ margin: "4px 0" }}>导师画像：{mentor.profile || "暂无导师画像"}</p>
                                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                    <button
                                        onClick={() => void removePrivateMentor(mentor.id)}
                                        disabled={privateMentorSaving || privateMentorLoading || privateMentorDeletingId !== undefined}
                                    >
                                        {privateMentorDeletingId === mentor.id ? "删除中..." : "删除私有导师"}
                                    </button>
                                </div>

                                <p style={{ margin: "6px 0 4px" }}>相关论文：</p>
                                {(mentor.paper_ids || []).length === 0 ? (
                                    <p style={{ margin: 0 }}>暂无关联论文</p>
                                ) : (
                                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                                        {(mentor.paper_ids || []).map((paper) => (
                                            <li key={paper.id}>{paper.title}</li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PrivateMentorScreen;
