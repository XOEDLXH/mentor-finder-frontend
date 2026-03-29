import { useState } from "react";

type SearchMode = "mentor" | "paper";

const SearchScreen = () => {
    const [mode, setMode] = useState<SearchMode>("mentor");
    const [keyword, setKeyword] = useState("");

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 720 }}>
            <h2>信息检索</h2>
            <p>输入关键词，按导师姓名或论文相关信息进行搜索。</p>

            <div style={{ display: "flex", gap: 8 }}>
                <button
                    onClick={() => setMode("mentor")}
                    disabled={mode === "mentor"}
                >
                    搜人
                </button>
                <button
                    onClick={() => setMode("paper")}
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
                    style={{ flex: 1 }}
                />
                <button disabled={keyword.trim() === ""}>
                    搜索
                </button>
            </div>

            <div style={{ padding: 12, border: "1px solid #ccc" }}>
                <p>当前模式：{mode === "mentor" ? "搜人" : "搜论文"}</p>
                <p>当前关键词：{keyword === "" ? "尚未输入" : keyword}</p>
                <p>下一步我们会在这里接入搜索请求和结果列表。</p>
            </div>
        </div>
    );
};

export default SearchScreen;
