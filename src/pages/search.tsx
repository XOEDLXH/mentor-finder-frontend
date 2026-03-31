import { KeyboardEvent, useState } from "react";
import { useRouter } from "next/router";

import { FAILURE_PREFIX } from "../constants/string";
import { request } from "../utils/network";
import { SearchMentorResult, SearchPaperResult } from "../utils/types";

type SearchMode = "mentor" | "paper";

const SearchScreen = () => {
    const router = useRouter();
    const [mode, setMode] = useState<SearchMode>("mentor");
    const [keyword, setKeyword] = useState("");
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [mentors, setMentors] = useState<SearchMentorResult[]>([]);
    const [papers, setPapers] = useState<SearchPaperResult[]>([]);

    const resetResults = () => {
        setErrorMessage("");
        setMentors([]);
        setPapers([]);
    };

    const switchMode = (nextMode: SearchMode) => {
        setMode(nextMode);
        setHasSearched(false);
        resetResults();
    };

    const search = async () => {
        const trimmedKeyword = keyword.trim();
        if (trimmedKeyword === "") {
            return;
        }

        setLoading(true);
        setHasSearched(true);
        setErrorMessage("");

        try {
            if (mode === "mentor") {
                const res = await request(
                    `/api/search/mentors?keyword=${encodeURIComponent(trimmedKeyword)}`,
                    "GET",
                    false,
                );
                setMentors(res.mentors as SearchMentorResult[]);
                setPapers([]);
            }
            else {
                const res = await request(
                    `/api/search/papers?keyword=${encodeURIComponent(trimmedKeyword)}`,
                    "GET",
                    false,
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

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 720 }}>
            <h2>信息检索</h2>
            <p>输入关键词，按导师姓名或论文相关信息进行搜索。</p>

            <div>
                <button onClick={() => router.push("/")}>
                    返回首页
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

            {errorMessage !== "" && (
                <div style={{ padding: 12, border: "1px solid #f1aeb5", backgroundColor: "#f8d7da" }}>
                    {errorMessage}
                </div>
            )}

            {mode === "mentor" && mentors.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {mentors.map((mentor) => (
                        <div
                            key={mentor.id}
                            style={{ padding: 12, border: "1px solid #ccc", borderRadius: 6 }}
                        >
                            <h3 style={{ margin: "0 0 8px" }}>{mentor.name}</h3>
                            <p style={{ margin: "4px 0" }}>
                                研究方向：{mentor.researchDirection || mentor.research_direction || "暂无研究方向"}
                            </p>
                            <p style={{ margin: "4px 0" }}>邮箱：{mentor.email || "暂无邮箱"}</p>
                            <p style={{ margin: "4px 0" }}>导师画像：{mentor.profile || "暂无导师画像"}</p>
                            <p style={{ margin: "8px 0 4px" }}>相关论文：</p>
                            <ul style={{ margin: 0, paddingLeft: 20 }}>
                                {mentor.paperTitles.map((title) => (
                                    <li key={title}>{title}</li>
                                ))}
                            </ul>
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
                            <p style={{ margin: "4px 0" }}>发表日期：{paper.publishDate || paper.publish_date || "未知"}</p>
                            <p style={{ margin: "4px 0" }}>导师：{paper.mentorNames.join("、") || "未知"}</p>
                            <p style={{ margin: "4px 0" }}>摘要：{paper.abstract || "暂无摘要"}</p>
                        </div>
                    ))}
                </div>
            )}

            {hasSearched && !loading && errorMessage === "" && mode === "mentor" && mentors.length === 0 && (
                <div style={{ padding: 12, border: "1px dashed #ccc" }}>
                    未找到匹配的导师结果。
                </div>
            )}

            {hasSearched && !loading && errorMessage === "" && mode === "paper" && papers.length === 0 && (
                <div style={{ padding: 12, border: "1px dashed #ccc" }}>
                    未找到匹配的论文结果。
                </div>
            )}
        </div>
    );
};

export default SearchScreen;
