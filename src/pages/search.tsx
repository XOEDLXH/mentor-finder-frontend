import { KeyboardEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useSelector } from "react-redux";

import { FAILURE_PREFIX } from "../constants/string";
import { NetworkError, NetworkErrorType, request } from "../utils/network";
import { RootState } from "../redux/store";
import { PrivateMentorResult, SearchMentorResult, SearchPaperResult } from "../utils/types";

type SearchMode = "mentor" | "paper";
type SearchMatchMode = "exact" | "fuzzy";
type MentorResultFilter = "all" | "mine" | "public";

const SearchScreen = () => {
    const router = useRouter();
    const authToken = useSelector((state: RootState) => state.auth.token);
    const authRole = useSelector((state: RootState) => state.auth.role);
    const isLoggedIn = authToken.trim() !== "";
    const isAdmin = authRole === "admin";

    const [mode, setMode] = useState<SearchMode>("mentor");
    const [matchMode, setMatchMode] = useState<SearchMatchMode>("exact");
    const [keyword, setKeyword] = useState("");
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [mentors, setMentors] = useState<SearchMentorResult[]>([]);
    const [papers, setPapers] = useState<SearchPaperResult[]>([]);
    const [adminSaving, setAdminSaving] = useState(false);
    const [adminMessage, setAdminMessage] = useState("");
    const [privateMentors, setPrivateMentors] = useState<PrivateMentorResult[]>([]);
    const [mentorResultFilter, setMentorResultFilter] = useState<MentorResultFilter>("all");

    const [mentorEditingId, setMentorEditingId] = useState<number | undefined>(undefined);
    const [mentorDraft, setMentorDraft] = useState({
        Chinese_name: "",
        English_name: "",
        research_direction: "",
        email: "",
        profile: "",
    });

    const [paperEditingId, setPaperEditingId] = useState<number | undefined>(undefined);
    const [paperDraft, setPaperDraft] = useState({
        title: "",
        abstract: "",
        publish_date: "",
        author_names: "",
    });

    const resetResults = () => {
        setErrorMessage("");
        setMentors([]);
        setPapers([]);
    };

    const isNetworkErrorInstance = (err: unknown): err is NetworkError => {
        return typeof NetworkError === "function" && err instanceof NetworkError;
    };

    const switchMode = (nextMode: SearchMode) => {
        setMode(nextMode);
        setHasSearched(false);
        resetResults();
        setAdminMessage("");
        if (nextMode === "paper") {
            setMentorResultFilter("all");
        }

        setMentorEditingId(undefined);
        setMentorDraft({
            Chinese_name: "",
            English_name: "",
            research_direction: "",
            email: "",
            profile: "",
        });

        setPaperEditingId(undefined);
        setPaperDraft({
            title: "",
            abstract: "",
            publish_date: "",
            author_names: "",
        });
    };

    const formatAdminError = (err: unknown) => {
        if (isNetworkErrorInstance(err)) {
            if (err.type === NetworkErrorType.UNAUTHORIZED) {
                return "请先登录管理员账号";
            }

            if (err.type === NetworkErrorType.REJECTED) {
                return "仅管理员可以执行该操作";
            }

            return String(err);
        }

        return FAILURE_PREFIX + String(err);
    };

    const fetchMyPrivateMentors = useCallback(async () => {
        if (!isLoggedIn) {
            setPrivateMentors([]);
            return;
        }

        try {
            const res = await request("/api/dataset/mentors/mine", "GET", true);
            const mentorList = Array.isArray(res.mentors) ? (res.mentors as PrivateMentorResult[]) : [];
            setPrivateMentors(mentorList.filter((mentor) => Array.isArray(mentor.paper_ids)));
        }
        catch {
            setPrivateMentors([]);
        }
    }, [isLoggedIn]);

    useEffect(() => {
        void fetchMyPrivateMentors();
    }, [fetchMyPrivateMentors]);

    const privateMentorIdSet = useMemo(() => {
        return new Set(privateMentors.map((mentor) => mentor.id));
    }, [privateMentors]);

    const mentorResultMineCount = useMemo(() => {
        return mentors.filter((mentor) => privateMentorIdSet.has(mentor.id)).length;
    }, [mentors, privateMentorIdSet]);

    const visibleMentorResults = useMemo(() => {
        if (mentorResultFilter === "mine") {
            return mentors.filter((mentor) => privateMentorIdSet.has(mentor.id));
        }

        if (mentorResultFilter === "public") {
            return mentors.filter((mentor) => !privateMentorIdSet.has(mentor.id));
        }

        return mentors;
    }, [mentors, mentorResultFilter, privateMentorIdSet]);

    const search = async (overrideKeyword?: string) => {
        const trimmedKeyword = (overrideKeyword ?? keyword).trim();
        if (trimmedKeyword === "") {
            return;
        }

        setLoading(true);
        setHasSearched(true);
        setErrorMessage("");

        try {
            const query = `keyword=${encodeURIComponent(trimmedKeyword)}&search_mode=${matchMode}`;

            if (mode === "mentor") {
                const res = await request(
                    `/api/search/mentors?${query}`,
                    "GET",
                    isLoggedIn,
                );
                setMentors(res.mentors as SearchMentorResult[]);
                setPapers([]);
            }
            else {
                const res = await request(
                    `/api/search/papers?${query}`,
                    "GET",
                    isLoggedIn,
                );
                setPapers(res.papers as SearchPaperResult[]);
                setMentors([]);
            }
        }
        catch (err) {
            resetResults();
            setErrorMessage(FAILURE_PREFIX + String(err));
        }
        finally {
            setLoading(false);
        }
    };

    const handleEnter = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
            void search();
        }
    };

    const saveMentor = async () => {
        const chineseName = mentorDraft.Chinese_name.trim();
        const researchDirection = mentorDraft.research_direction.trim();

        if (chineseName === "" || researchDirection === "") {
            setAdminMessage("导师中文名和研究方向不能为空");
            return;
        }

        setAdminSaving(true);
        setAdminMessage("");

        try {
            const method = mentorEditingId === undefined ? "POST" : "PUT";
            const url = mentorEditingId === undefined
                ? "/api/dataset/mentors"
                : `/api/dataset/mentors/${mentorEditingId}`;

            await request(url, method, true, {
                Chinese_name: chineseName,
                English_name: mentorDraft.English_name.trim(),
                research_direction: researchDirection,
                email: mentorDraft.email.trim(),
                profile: mentorDraft.profile.trim(),
            });

            setAdminMessage(mentorEditingId === undefined ? "导师新增成功" : "导师修改成功");
            setMentorEditingId(undefined);
            setMentorDraft({
                Chinese_name: "",
                English_name: "",
                research_direction: "",
                email: "",
                profile: "",
            });

            if (mode === "mentor" && keyword.trim() !== "") {
                await search();
            }
        }
        catch (err) {
            setAdminMessage(formatAdminError(err));
        }
        finally {
            setAdminSaving(false);
        }
    };

    const removeMentor = async (mentorId: number) => {
        if (!globalThis.confirm("确认删除该导师？")) {
            return;
        }

        setAdminSaving(true);
        setAdminMessage("");

        try {
            await request(`/api/dataset/mentors/${mentorId}`, "DELETE", true);
            setAdminMessage("导师删除成功");

            if (mode === "mentor" && keyword.trim() !== "") {
                await search();
            }
        }
        catch (err) {
            setAdminMessage(formatAdminError(err));
        }
        finally {
            setAdminSaving(false);
        }
    };

    const savePaper = async () => {
        const title = paperDraft.title.trim();

        if (title === "") {
            setAdminMessage("论文标题不能为空");
            return;
        }

        setAdminSaving(true);
        setAdminMessage("");

        try {
            const method = paperEditingId === undefined ? "POST" : "PUT";
            const url = paperEditingId === undefined
                ? "/api/dataset/papers"
                : `/api/dataset/papers/${paperEditingId}`;

            await request(url, method, true, {
                title,
                abstract: paperDraft.abstract.trim(),
                publish_date: paperDraft.publish_date.trim(),
                author_names: paperDraft.author_names.trim(),
            });

            setAdminMessage(paperEditingId === undefined ? "论文新增成功" : "论文修改成功");
            setPaperEditingId(undefined);
            setPaperDraft({
                title: "",
                abstract: "",
                publish_date: "",
                author_names: "",
            });

            if (mode === "paper" && keyword.trim() !== "") {
                await search();
            }
        }
        catch (err) {
            setAdminMessage(formatAdminError(err));
        }
        finally {
            setAdminSaving(false);
        }
    };

    const removePaper = async (paperId: number) => {
        if (!globalThis.confirm("确认删除该论文？")) {
            return;
        }

        setAdminSaving(true);
        setAdminMessage("");

        try {
            await request(`/api/dataset/papers/${paperId}`, "DELETE", true);
            setAdminMessage("论文删除成功");

            if (mode === "paper" && keyword.trim() !== "") {
                await search();
            }
        }
        catch (err) {
            setAdminMessage(formatAdminError(err));
        }
        finally {
            setAdminSaving(false);
        }
    };

    const beginEditMentor = (mentor: SearchMentorResult) => {
        setMode("mentor");
        setMentorEditingId(mentor.id);
        setMentorDraft({
            Chinese_name: mentor.Chinese_name || "",
            English_name: mentor.English_name || "",
            research_direction: mentor.research_direction || "",
            email: mentor.email || "",
            profile: mentor.profile || "",
        });
        setAdminMessage("");
    };

    const beginEditPaper = (paper: SearchPaperResult) => {
        setMode("paper");
        setPaperEditingId(paper.id);
        setPaperDraft({
            title: paper.title || "",
            abstract: paper.abstract || "",
            publish_date: paper.publish_date || "",
            author_names: paper.author_names || "",
        });
        setAdminMessage("");
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 720 }}>
            <h2>信息检索</h2>
            <p>输入关键词，按导师姓名或论文相关信息进行搜索。</p>

            <div>
                <button onClick={() => router.push("/")}>
                    返回主页
                </button>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
                <button
                    onClick={() => switchMode("mentor")}
                    disabled={mode === "mentor"}
                >
                    搜人
                </button>
                <button
                    onClick={() => switchMode("paper")}
                    disabled={mode === "paper"}
                >
                    搜论文
                </button>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
                <button
                    onClick={() => setMatchMode("exact")}
                    disabled={matchMode === "exact"}
                >
                    精确搜索
                </button>
                <button
                    onClick={() => setMatchMode("fuzzy")}
                    disabled={matchMode === "fuzzy"}
                >
                    模糊搜索
                </button>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
                <input
                    type="text"
                    value={keyword}
                    placeholder={mode === "mentor" ? "输入导师姓名" : "输入论文题目、研究方向或导师姓名"}
                    onChange={(e) => setKeyword(e.target.value)}
                    onKeyDown={handleEnter}
                    style={{ flex: 1 }}
                />
                <button onClick={() => void search()} disabled={keyword.trim() === "" || loading}>
                    {loading ? "搜索中..." : "搜索"}
                </button>
            </div>

            {isAdmin && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, border: "1px solid #ccc", borderRadius: 6, padding: 12 }}>
                    <h3 style={{ margin: 0 }}>管理员操作</h3>
                    <p style={{ margin: 0 }}>
                        当前模式：{mode === "mentor" ? "导师" : "论文"}，可执行新增、修改、删除。
                    </p>

                    {mode === "mentor" ? (
                        <>
                            <input
                                type="text"
                                placeholder="导师中文名"
                                value={mentorDraft.Chinese_name}
                                onChange={(e) => setMentorDraft((prev) => ({ ...prev, Chinese_name: e.target.value }))}
                            />
                            <input
                                type="text"
                                placeholder="导师英文名（可选）"
                                value={mentorDraft.English_name}
                                onChange={(e) => setMentorDraft((prev) => ({ ...prev, English_name: e.target.value }))}
                            />
                            <input
                                type="text"
                                placeholder="研究方向"
                                value={mentorDraft.research_direction}
                                onChange={(e) => setMentorDraft((prev) => ({ ...prev, research_direction: e.target.value }))}
                            />
                            <input
                                type="text"
                                placeholder="邮箱（可选）"
                                value={mentorDraft.email}
                                onChange={(e) => setMentorDraft((prev) => ({ ...prev, email: e.target.value }))}
                            />
                            <input
                                type="text"
                                placeholder="导师画像（可选）"
                                value={mentorDraft.profile}
                                onChange={(e) => setMentorDraft((prev) => ({ ...prev, profile: e.target.value }))}
                            />
                            <div style={{ display: "flex", gap: 8 }}>
                                <button onClick={() => void saveMentor()} disabled={adminSaving}>
                                    {mentorEditingId === undefined ? "新增导师" : "保存导师修改"}
                                </button>
                                {mentorEditingId !== undefined && (
                                    <button
                                        onClick={() => {
                                            setMentorEditingId(undefined);
                                            setMentorDraft({
                                                Chinese_name: "",
                                                English_name: "",
                                                research_direction: "",
                                                email: "",
                                                profile: "",
                                            });
                                        }}
                                        disabled={adminSaving}
                                    >
                                        取消编辑
                                    </button>
                                )}
                            </div>
                        </>
                    ) : (
                        <>
                            <input
                                type="text"
                                placeholder="论文标题"
                                value={paperDraft.title}
                                onChange={(e) => setPaperDraft((prev) => ({ ...prev, title: e.target.value }))}
                            />
                            <input
                                type="date"
                                value={paperDraft.publish_date}
                                onChange={(e) => setPaperDraft((prev) => ({ ...prev, publish_date: e.target.value }))}
                            />
                            <input
                                type="text"
                                placeholder="作者名单（逗号分隔）"
                                value={paperDraft.author_names}
                                onChange={(e) => setPaperDraft((prev) => ({ ...prev, author_names: e.target.value }))}
                            />
                            <textarea
                                placeholder="摘要（可选）"
                                value={paperDraft.abstract}
                                onChange={(e) => setPaperDraft((prev) => ({ ...prev, abstract: e.target.value }))}
                                style={{ minHeight: 80 }}
                            />
                            <div style={{ display: "flex", gap: 8 }}>
                                <button onClick={() => void savePaper()} disabled={adminSaving}>
                                    {paperEditingId === undefined ? "新增论文" : "保存论文修改"}
                                </button>
                                {paperEditingId !== undefined && (
                                    <button
                                        onClick={() => {
                                            setPaperEditingId(undefined);
                                            setPaperDraft({
                                                title: "",
                                                abstract: "",
                                                publish_date: "",
                                                author_names: "",
                                            });
                                        }}
                                        disabled={adminSaving}
                                    >
                                        取消编辑
                                    </button>
                                )}
                            </div>
                        </>
                    )}

                    {adminMessage !== "" && (
                        <p style={{ margin: 0 }}>{adminMessage}</p>
                    )}
                </div>
            )}

            {errorMessage !== "" && (
                <div style={{ padding: 12, border: "1px solid #f1aeb5", backgroundColor: "#f8d7da" }}>
                    {errorMessage}
                </div>
            )}

            {mode === "mentor" && mentors.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                            onClick={() => setMentorResultFilter("all")}
                            disabled={mentorResultFilter === "all"}
                        >
                            全部导师（{mentors.length}）
                        </button>
                        <button
                            onClick={() => setMentorResultFilter("mine")}
                            disabled={mentorResultFilter === "mine"}
                        >
                            仅我的私有导师（{mentorResultMineCount}）
                        </button>
                        <button
                            onClick={() => setMentorResultFilter("public")}
                            disabled={mentorResultFilter === "public"}
                        >
                            仅公共导师（{mentors.length - mentorResultMineCount}）
                        </button>
                    </div>

                    {visibleMentorResults.length === 0 && (
                        <div style={{ padding: 12, border: "1px dashed #ccc" }}>
                            当前筛选条件下没有导师结果。
                        </div>
                    )}

                    {visibleMentorResults.map((mentor) => (
                        <div
                            key={mentor.id}
                            style={{ padding: 12, border: "1px solid #ccc", borderRadius: 6 }}
                        >
                            <h3 style={{ margin: "0 0 8px" }}>
                                {mentor.Chinese_name}
                                {privateMentorIdSet.has(mentor.id) && (
                                    <span style={{ marginLeft: 8, fontSize: 12, color: "#555" }}>我的私有导师</span>
                                )}
                            </h3>
                            {mentor.English_name && (
                                <p style={{ margin: "4px 0" }}>英文名：{mentor.English_name}</p>
                            )}
                            <p style={{ margin: "4px 0" }}>
                                研究方向：{mentor.research_direction || "暂无研究方向"}
                            </p>
                            <p style={{ margin: "4px 0" }}>邮箱：{mentor.email || "暂无邮箱"}</p>
                            <p style={{ margin: "4px 0" }}>导师画像：{mentor.profile || "暂无导师画像"}</p>
                            <p style={{ margin: "8px 0 4px" }}>相关论文：</p>
                            <ul style={{ margin: 0, paddingLeft: 20 }}>
                                {mentor.paperTitles.map((title) => (
                                    <li key={title}>{title}</li>
                                ))}
                            </ul>
                            {isAdmin && (
                                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                    <button onClick={() => beginEditMentor(mentor)} disabled={adminSaving}>修改导师</button>
                                    <button onClick={() => void removeMentor(mentor.id)} disabled={adminSaving}>删除导师</button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {mode === "paper" && papers.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {papers.map((paper) => (
                        <div
                            key={paper.id}
                            style={{ padding: 12, border: "1px solid #ccc", borderRadius: 6 }}
                        >
                            <h3 style={{ margin: "0 0 8px" }}>{paper.title}</h3>
                            <p style={{ margin: "4px 0" }}>发表日期：{paper.publish_date || "未知"}</p>
                            <p style={{ margin: "4px 0" }}>学科/分类：{paper.subjects || "暂无分类"}</p>
                            <p style={{ margin: "4px 0" }}>导师：{paper.mentorNames.join("、") || "未知"}</p>
                            <p style={{ margin: "4px 0" }}>摘要：{paper.abstract || "暂无摘要"}</p>
                            {isAdmin && (
                                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                    <button onClick={() => beginEditPaper(paper)} disabled={adminSaving}>修改论文</button>
                                    <button onClick={() => void removePaper(paper.id)} disabled={adminSaving}>删除论文</button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {hasSearched && !loading && errorMessage === "" && mode === "mentor" && mentors.length === 0 && (
                <div style={{ padding: 12, border: "1px dashed #ccc" }}>
                    未找到匹配的导师结果（当前为{matchMode === "exact" ? "精确" : "模糊"}搜索）。
                </div>
            )}

            {hasSearched && !loading && errorMessage === "" && mode === "paper" && papers.length === 0 && (
                <div style={{ padding: 12, border: "1px dashed #ccc" }}>
                    未找到匹配的论文结果（当前为{matchMode === "exact" ? "精确" : "模糊"}搜索）。
                </div>
            )}
        </div>
    );
};

export default SearchScreen;
