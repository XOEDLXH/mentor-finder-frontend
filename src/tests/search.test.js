import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { useRouter } from "next/router";
import { request } from "../utils/network";
import authReducer from "../redux/auth";
import SearchScreen from "../pages/search";

jest.mock("next/router", () => ({
    useRouter: jest.fn(),
}));

jest.mock("../utils/network", () => ({
    request: jest.fn(),
}));

describe("SearchScreen", () => {
    const mockPush = jest.fn();
    const mockReplace = jest.fn();
    const mockRouter = {
        push: mockPush,
        replace: mockReplace,
        query: {},
        isReady: true,
    };

    const mockPrivateMentor = {
        id: 101,
        Chinese_name: "王五",
        English_name: "Wang Wu",
        research_direction: "强化学习",
        email: "wangwu@example.com",
        profile: "私有导师测试数据",
        is_private: true,
        paper_ids: [{
            id: 1001,
            title: "RL Paper",
            abstract: "",
            publish_date: "2026-01-01",
            author_names: "王五",
        }],
    };

    const renderWithStore = (name = "student", role = "student") => {
        const store = configureStore({
            reducer: {
                auth: authReducer,
            },
            preloadedState: {
                auth: {
                    name,
                    token: "mock-token",
                    role,
                },
            },
        });

        render(
            <Provider store={store}>
                <SearchScreen />
            </Provider>,
        );
    };

    const waitForMineRequest = async () => {
        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/dataset/mentors/mine",
                "GET",
                true,
            );
        });
    };

    beforeEach(() => {
        mockPush.mockReset();
        mockReplace.mockReset();
        request.mockReset();

        request.mockImplementation(async (url) => {
            if (url === "/api/dataset/mentors/mine") {
                return { mentors: [] };
            }

            if (String(url).startsWith("/api/search/mentors")) {
                return { mentors: [] };
            }

            if (String(url).startsWith("/api/search/papers")) {
                return { papers: [] };
            }

            return {};
        });

        mockRouter.query = {};
        useRouter.mockReturnValue(mockRouter);
    });

    it("shows admin operation panel only for admin role", async () => {
        renderWithStore("alice", "admin");
        await waitForMineRequest();

        expect(screen.getByRole("heading", { name: "管理员操作" })).toBeInTheDocument();
    });

    it("does not render private mentor management module in search page", async () => {
        renderWithStore();
        await waitForMineRequest();

        expect(screen.queryByRole("heading", { name: "我的私有导师" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "添加私有导师" })).not.toBeInTheDocument();
        expect(screen.queryByPlaceholderText("导师中文名（可选）")).not.toBeInTheDocument();
    });

    it("opens a centered delete mentor dialog with mentor details for admins", async () => {
        request.mockImplementation(async (url) => {
            if (url === "/api/dataset/mentors/mine") {
                return { mentors: [] };
            }

            if (String(url).startsWith("/api/search/mentors")) {
                return {
                    mentors: [{
                        id: 1,
                        Chinese_name: "张三",
                        research_direction: "机器学习",
                        email: "",
                        profile: "主要研究机器学习。",
                        paperTitles: [],
                    }],
                };
            }

            return {};
        });

        renderWithStore("alice", "admin");
        await waitForMineRequest();

        fireEvent.change(screen.getByPlaceholderText("输入导师姓名或研究方向"), {
            target: { value: "张三" },
        });
        fireEvent.click(screen.getByRole("button", { name: /^搜索(中\.\.\.)?$/ }));

        await screen.findByRole("heading", { name: "张三" });
        fireEvent.click(screen.getByRole("button", { name: "删除导师" }));

        const dialog = screen.getByRole("dialog", { name: "确认删除导师" });
        expect(dialog).toBeInTheDocument();
        expect(within(dialog).getByText("中文名：张三")).toBeInTheDocument();
        expect(within(dialog).getByText("英文名：暂无英文名")).toBeInTheDocument();
        expect(within(dialog).getByText("研究方向：机器学习")).toBeInTheDocument();
        expect(within(dialog).getByText("邮箱：暂无邮箱")).toBeInTheDocument();
        expect(request).not.toHaveBeenCalledWith("/api/dataset/mentors/1", "DELETE", true);
    });

    it("closes the delete mentor dialog when clicking the overlay", async () => {
        request.mockImplementation(async (url) => {
            if (url === "/api/dataset/mentors/mine") {
                return { mentors: [] };
            }

            if (String(url).startsWith("/api/search/mentors")) {
                return {
                    mentors: [{
                        id: 1,
                        Chinese_name: "张三",
                        English_name: "Zhang San",
                        research_direction: "机器学习",
                        email: "zhangsan@example.com",
                        profile: "主要研究机器学习。",
                        paperTitles: [],
                    }],
                };
            }

            return {};
        });

        renderWithStore("alice", "admin");
        await waitForMineRequest();

        fireEvent.change(screen.getByPlaceholderText("输入导师姓名或研究方向"), {
            target: { value: "张三" },
        });
        fireEvent.click(screen.getByRole("button", { name: /^搜索(中\.\.\.)?$/ }));

        await screen.findByRole("heading", { name: "张三" });
        fireEvent.click(screen.getByRole("button", { name: "删除导师" }));
        fireEvent.click(screen.getByLabelText("删除导师确认弹窗遮罩"));

        await waitFor(() => {
            expect(screen.queryByRole("dialog", { name: "确认删除导师" })).not.toBeInTheDocument();
        });
    });

    it("closes the delete mentor dialog when clicking cancel without deleting", async () => {
        request.mockImplementation(async (url) => {
            if (url === "/api/dataset/mentors/mine") {
                return { mentors: [] };
            }

            if (String(url).startsWith("/api/search/mentors")) {
                return {
                    mentors: [{
                        id: 1,
                        Chinese_name: "张三",
                        English_name: "Zhang San",
                        research_direction: "机器学习",
                        email: "zhangsan@example.com",
                        profile: "主要研究机器学习。",
                        paperTitles: [],
                    }],
                };
            }

            return {};
        });

        renderWithStore("alice", "admin");
        await waitForMineRequest();

        fireEvent.change(screen.getByPlaceholderText("输入导师姓名或研究方向"), {
            target: { value: "张三" },
        });
        fireEvent.click(screen.getByRole("button", { name: /^搜索(中\.\.\.)?$/ }));

        await screen.findByRole("heading", { name: "张三" });
        fireEvent.click(screen.getByRole("button", { name: "删除导师" }));
        fireEvent.click(screen.getByRole("button", { name: "取消" }));

        await waitFor(() => {
            expect(screen.queryByRole("dialog", { name: "确认删除导师" })).not.toBeInTheDocument();
        });
        expect(request).not.toHaveBeenCalledWith("/api/dataset/mentors/1", "DELETE", true);
    });

    it("deletes mentor after confirmation, shows loading state, and refreshes search results", async () => {
        let deleted = false;
        let resolveDelete;
        request.mockImplementation((url, method) => {
            if (url === "/api/dataset/mentors/mine") {
                return Promise.resolve({ mentors: [] });
            }

            if (url === "/api/dataset/mentors/1" && method === "DELETE") {
                return new Promise((resolve) => {
                    resolveDelete = () => {
                        deleted = true;
                        resolve({});
                    };
                });
            }

            if (String(url).startsWith("/api/search/mentors")) {
                return Promise.resolve({
                    mentors: deleted ? [] : [{
                        id: 1,
                        Chinese_name: "张三",
                        English_name: "Zhang San",
                        research_direction: "机器学习",
                        email: "zhangsan@example.com",
                        profile: "主要研究机器学习。",
                        paperTitles: [],
                    }],
                });
            }

            return Promise.resolve({});
        });

        renderWithStore("alice", "admin");
        await waitForMineRequest();

        fireEvent.change(screen.getByPlaceholderText("输入导师姓名或研究方向"), {
            target: { value: "张三" },
        });
        fireEvent.click(screen.getByRole("button", { name: /^搜索(中\.\.\.)?$/ }));

        await screen.findByRole("heading", { name: "张三" });
        fireEvent.click(screen.getByRole("button", { name: "删除导师" }));

        const confirmDeleteButton = screen.getByRole("button", { name: "确认删除" });
        fireEvent.click(confirmDeleteButton);

        expect(confirmDeleteButton).toBeDisabled();
        expect(confirmDeleteButton.querySelector("span[aria-hidden='true']")).not.toBeNull();
        expect(request).toHaveBeenCalledWith("/api/dataset/mentors/1", "DELETE", true);

        resolveDelete();

        await waitFor(() => {
            expect(screen.queryByRole("dialog", { name: "确认删除导师" })).not.toBeInTheDocument();
        });
        await waitFor(() => {
            expect(screen.queryByRole("heading", { name: "张三" })).not.toBeInTheDocument();
        });
        expect(screen.getByText("导师删除成功")).toBeInTheDocument();
    });

    it("auto loads all mentors when entering search page with empty keyword", async () => {
        renderWithStore();
        await waitForMineRequest();

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/mentors?keyword=&search_mode=exact",
                "GET",
                true,
            );
        });
    });

    it("initializes from URL query and auto loads paper fuzzy search results", async () => {
        mockRouter.query = {
            keyword: "大模型",
            mode: "paper",
            search_mode: "fuzzy",
            sort_mode: "default",
        };

        request.mockImplementation(async (url) => {
            if (url === "/api/dataset/mentors/mine") {
                return { mentors: [] };
            }

            if (url === "/api/search/papers?keyword=%E5%A4%A7%E6%A8%A1%E5%9E%8B&search_mode=fuzzy&sort_mode=default") {
                return {
                    papers: [{
                        id: 2,
                        title: "大语言模型在问答系统中的应用",
                        abstract: "本文介绍大语言模型在智能问答中的实践。",
                        publish_date: "2024-06-15",
                        author_names: "李四,张三",
                        subjects: "cs.CL",
                        arxiv_id: "2401.00001",
                        arxiv_url: "https://arxiv.org/abs/2401.00001",
                        mentorNames: ["李四", "张三"],
                    }],
                };
            }

            return {};
        });

        renderWithStore();
        await waitForMineRequest();

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/papers?keyword=%E5%A4%A7%E6%A8%A1%E5%9E%8B&search_mode=fuzzy&sort_mode=default",
                "GET",
                true,
            );
        });

        expect(screen.getByRole("button", { name: "搜论文" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "模糊搜索" })).toBeDisabled();
        expect(screen.getByDisplayValue("大模型")).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "大语言模型在问答系统中的应用" })).toBeInTheDocument();
        expect(mockReplace).not.toHaveBeenCalled();
    });

    it("falls back to default values when URL query is invalid", async () => {
        mockRouter.query = {
            keyword: "图神经网络",
            mode: "invalid-mode",
            search_mode: "bad-mode",
            sort_mode: "bad-sort",
            page: "0",
        };

        renderWithStore();
        await waitForMineRequest();

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/mentors?keyword=%E5%9B%BE%E7%A5%9E%E7%BB%8F%E7%BD%91%E7%BB%9C&search_mode=exact",
                "GET",
                true,
            );
        });

        expect(screen.getByRole("button", { name: "搜人" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "精确搜索" })).toBeDisabled();
        expect(screen.getByDisplayValue("图神经网络")).toBeInTheDocument();
    });

    it("renders mentor results using backend response fields", async () => {
        request.mockImplementation(async (url) => {
            if (url === "/api/dataset/mentors/mine") {
                return { mentors: [] };
            }

            if (String(url).startsWith("/api/search/mentors")) {
                return {
                    mentors: [{
                        id: 1,
                        Chinese_name: "张三",
                        English_name: "Zhang San",
                        research_direction: "机器学习",
                        email: "zhangsan@example.com",
                        profile: "主要研究机器学习与数据挖掘。",
                        paperTitles: ["机器学习方法研究", "大语言模型在问答系统中的应用"],
                    }],
                };
            }

            return {};
        });

        renderWithStore();
        await waitForMineRequest();

        fireEvent.change(screen.getByPlaceholderText("输入导师姓名或研究方向"), {
            target: { value: "张三" },
        });
        fireEvent.click(screen.getByRole("button", { name: /^搜索(中\.\.\.)?$/ }));

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/mentors?keyword=%E5%BC%A0%E4%B8%89&search_mode=exact",
                "GET",
                true,
            );
        });

        expect(screen.getByRole("heading", { name: "张三" })).toBeInTheDocument();
        expect(screen.getByText("英文名：Zhang San")).toBeInTheDocument();
        expect(screen.getByText("研究方向：机器学习")).toBeInTheDocument();
        expect(screen.getByText("邮箱：zhangsan@example.com")).toBeInTheDocument();
        expect(screen.getByText("导师画像：主要研究机器学习与数据挖掘。")).toBeInTheDocument();
        expect(screen.getByText("机器学习方法研究")).toBeInTheDocument();
        expect(screen.getByText("大语言模型在问答系统中的应用")).toBeInTheDocument();
    });

    it("shows collapsed mentor info by default and expands on demand", async () => {
        const longProfile = "这是一段用于测试默认折叠展示的导师画像内容。".repeat(10);
        const longPaperTitles = Array.from({ length: 12 }, (_, index) => `论文${index + 1}`);

        request.mockImplementation(async (url) => {
            if (url === "/api/dataset/mentors/mine") {
                return { mentors: [] };
            }

            if (String(url).startsWith("/api/search/mentors")) {
                return {
                    mentors: [{
                        id: 88,
                        Chinese_name: "测试导师",
                        English_name: "Test Mentor",
                        research_direction: "知识工程",
                        email: "test@example.com",
                        profile: longProfile,
                        paperTitles: longPaperTitles,
                    }],
                };
            }

            return {};
        });

        renderWithStore();
        await waitForMineRequest();

        fireEvent.change(screen.getByPlaceholderText("输入导师姓名或研究方向"), {
            target: { value: "测试" },
        });
        fireEvent.click(screen.getByRole("button", { name: /^搜索(中\.\.\.)?$/ }));

        await waitFor(() => {
            expect(screen.getByRole("heading", { name: "测试导师" })).toBeInTheDocument();
        });

        expect(screen.queryByText(`导师画像：${longProfile}`)).not.toBeInTheDocument();
        expect(screen.queryByText("论文12")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "查看更多" })).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "查看更多" }));

        await waitFor(() => {
            expect(screen.getByText(`导师画像：${longProfile}`)).toBeInTheDocument();
            expect(screen.getByText("论文12")).toBeInTheDocument();
            expect(screen.getByRole("button", { name: "收起" })).toBeInTheDocument();
        });
    });

    it("renders paper results using backend response fields", async () => {
        request.mockImplementation(async (url) => {
            if (url === "/api/dataset/mentors/mine") {
                return { mentors: [] };
            }

            if (String(url).startsWith("/api/search/papers")) {
                return {
                    papers: [{
                        id: 2,
                        title: "大语言模型在问答系统中的应用",
                        abstract: "本文介绍大语言模型在智能问答中的实践。",
                        publish_date: "2024-06-15",
                        author_names: "李四,张三",
                        subjects: "cs.CL",
                        arxiv_id: "2401.00001",
                        arxiv_url: "https://arxiv.org/abs/2401.00001",
                        mentorNames: ["李四", "张三"],
                    }],
                };
            }

            return {};
        });

        renderWithStore();
        await waitForMineRequest();

        fireEvent.click(screen.getByRole("button", { name: "搜论文" }));
        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/papers?keyword=&search_mode=exact&sort_mode=default",
                "GET",
                true,
            );
        });
        fireEvent.change(screen.getByPlaceholderText("输入论文题目、论文分类、导师姓名或导师研究方向"), {
            target: { value: "李四" },
        });
        fireEvent.click(screen.getByRole("button", { name: /^搜索(中\.\.\.)?$/ }));

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/papers?keyword=%E6%9D%8E%E5%9B%9B&search_mode=exact&sort_mode=default",
                "GET",
                true,
            );
        });

        expect(screen.getByRole("heading", { name: "大语言模型在问答系统中的应用" })).toBeInTheDocument();
        expect(screen.getByText("arXiv：")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "2401.00001" })).toHaveAttribute("href", "https://arxiv.org/abs/2401.00001");
        expect(screen.getByText("发表日期：2024-06-15")).toBeInTheDocument();
        expect(screen.getByText("学科/分类：cs.CL")).toBeInTheDocument();
        expect(screen.getByText("导师：李四、张三")).toBeInTheDocument();
        expect(screen.getByText("摘要：本文介绍大语言模型在智能问答中的实践。")).toBeInTheDocument();
        expect(screen.queryByText("作者：李四,张三")).not.toBeInTheDocument();
    });

    it("filters mentor search results by mine and public categories", async () => {
        request.mockImplementation(async (url) => {
            if (url === "/api/dataset/mentors/mine") {
                return { mentors: [mockPrivateMentor] };
            }

            if (String(url).startsWith("/api/search/mentors")) {
                return {
                    mentors: [
                        {
                            id: 101,
                            Chinese_name: "王五",
                            English_name: "Wang Wu",
                            research_direction: "强化学习",
                            email: "wangwu@example.com",
                            profile: "私有导师测试数据",
                            paperTitles: ["RL Paper"],
                        },
                        {
                            id: 301,
                            Chinese_name: "李雷",
                            English_name: "Li Lei",
                            research_direction: "知识图谱",
                            email: "lilei@example.com",
                            profile: "公共导师测试数据",
                            paperTitles: ["KG Paper"],
                        },
                    ],
                };
            }

            return {};
        });

        renderWithStore();
        await waitForMineRequest();

        fireEvent.change(screen.getByPlaceholderText("输入导师姓名或研究方向"), {
            target: { value: "导师" },
        });
        fireEvent.click(screen.getByRole("button", { name: /^搜索(中\.\.\.)?$/ }));

        await waitFor(() => {
            expect(screen.getByRole("heading", { name: "李雷", level: 3 })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole("button", { name: "仅我的私有导师（1）" }));

        await waitFor(() => {
            expect(screen.queryByRole("heading", { name: "李雷", level: 3 })).not.toBeInTheDocument();
            expect(screen.getByRole("heading", { name: /王五/, level: 3 })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole("button", { name: "仅公共导师（1）" }));

        await waitFor(() => {
            expect(screen.getByRole("heading", { name: "李雷", level: 3 })).toBeInTheDocument();
        });
    });

    it("sends fuzzy mode when toggled", async () => {
        renderWithStore();
        await waitForMineRequest();

        fireEvent.change(screen.getByPlaceholderText("输入导师姓名或研究方向"), {
            target: { value: "张" },
        });
        fireEvent.click(screen.getByRole("button", { name: "模糊搜索" }));

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/mentors?keyword=%E5%BC%A0&search_mode=fuzzy",
                "GET",
                true,
            );
        });

        expect(mockReplace).toHaveBeenCalledWith(
            "/search?keyword=%E5%BC%A0&mode=mentor&search_mode=fuzzy",
            undefined,
            { shallow: true },
        );
    });

    it("auto loads all results when switching mode with empty keyword", async () => {
        request.mockImplementation(async (url) => {
            if (url === "/api/dataset/mentors/mine") {
                return { mentors: [] };
            }

            if (url === "/api/search/papers?keyword=&search_mode=exact&sort_mode=default") {
                return {
                    papers: [{
                        id: 21,
                        title: "All Papers",
                        abstract: "",
                        publish_date: "2024-01-01",
                        author_names: "A",
                        subjects: "cs.AI",
                        mentorNames: [],
                    }],
                };
            }

            if (url === "/api/search/mentors?keyword=&search_mode=exact") {
                return {
                    mentors: [{
                        id: 11,
                        Chinese_name: "全部导师",
                        English_name: "",
                        research_direction: "",
                        email: "",
                        profile: "",
                        paperTitles: [],
                    }],
                };
            }

            return {};
        });

        renderWithStore();
        await waitForMineRequest();

        fireEvent.click(screen.getByRole("button", { name: "搜论文" }));

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/papers?keyword=&search_mode=exact&sort_mode=default",
                "GET",
                true,
            );
            expect(screen.getByRole("heading", { name: "All Papers" })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole("button", { name: "搜人" }));

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/mentors?keyword=&search_mode=exact",
                "GET",
                true,
            );
            expect(screen.getByRole("heading", { name: "全部导师" })).toBeInTheDocument();
        });
    });

    it("sends paper sort mode and re-searches when sort toggled", async () => {
        renderWithStore();
        await waitForMineRequest();

        fireEvent.click(screen.getByRole("button", { name: "搜论文" }));
        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/papers?keyword=&search_mode=exact&sort_mode=default",
                "GET",
                true,
            );
        });
        fireEvent.change(screen.getByPlaceholderText("输入论文题目、论文分类、导师姓名或导师研究方向"), {
            target: { value: "机器学习" },
        });
        fireEvent.click(screen.getByRole("button", { name: /^搜索(中\.\.\.)?$/ }));

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/papers?keyword=%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0&search_mode=exact&sort_mode=default",
                "GET",
                true,
            );
        });

        fireEvent.click(screen.getByRole("button", { name: "发表时间从晚到早" }));

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/papers?keyword=%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0&search_mode=exact&sort_mode=late",
                "GET",
                true,
            );
        });

        expect(mockReplace).toHaveBeenCalledWith(
            "/search?keyword=%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0&mode=paper&search_mode=exact&sort_mode=late",
            undefined,
            { shallow: true },
        );
    });

    it("supports mentor result pagination", async () => {
        request.mockImplementation(async (url) => {
            if (url === "/api/dataset/mentors/mine") {
                return { mentors: [] };
            }

            if (url === "/api/search/mentors?keyword=%E5%BC%A0&search_mode=exact") {
                return {
                    page: 1,
                    total: 2,
                    total_pages: 2,
                    has_previous: false,
                    has_next: true,
                    mentors: [
                        {
                            id: 1,
                            Chinese_name: "张三",
                            English_name: "Zhang San",
                            research_direction: "机器学习",
                            email: "zhangsan@example.com",
                            profile: "第一页导师",
                            paperTitles: ["论文1"],
                        },
                    ],
                };
            }

            if (url === "/api/search/mentors?keyword=%E5%BC%A0&search_mode=exact&page=2") {
                return {
                    page: 2,
                    total: 2,
                    total_pages: 2,
                    has_previous: true,
                    has_next: false,
                    mentors: [
                        {
                            id: 2,
                            Chinese_name: "张六",
                            English_name: "Zhang Liu",
                            research_direction: "机器学习工程",
                            email: "zhangliu@example.com",
                            profile: "第二页导师",
                            paperTitles: ["论文2"],
                        },
                    ],
                };
            }

            return {};
        });

        renderWithStore();
        await waitForMineRequest();

        fireEvent.change(screen.getByPlaceholderText("输入导师姓名或研究方向"), {
            target: { value: "张" },
        });
        fireEvent.click(screen.getByRole("button", { name: /^搜索(中\.\.\.)?$/ }));

        await waitFor(() => {
            expect(screen.getByText("共 2 条结果，第 1 / 2 页")).toBeInTheDocument();
            expect(screen.getByRole("heading", { name: "张三", level: 3 })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole("button", { name: "下一页" }));

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/mentors?keyword=%E5%BC%A0&search_mode=exact&page=2",
                "GET",
                true,
            );
        });

        await waitFor(() => {
            expect(screen.getByText("共 2 条结果，第 2 / 2 页")).toBeInTheDocument();
            expect(screen.getByRole("heading", { name: "张六", level: 3 })).toBeInTheDocument();
        });

        expect(mockReplace).toHaveBeenCalledWith(
            "/search?keyword=%E5%BC%A0&mode=mentor&search_mode=exact&page=2",
            undefined,
            { shallow: true },
        );
    });
});
