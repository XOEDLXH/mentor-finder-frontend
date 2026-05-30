import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    const mockBack = jest.fn();
    let beforePopStateHandler = () => true;
    let historyKeyCounter = 0;
    const mockRouter = {
        push: mockPush,
        replace: mockReplace,
        back: mockBack,
        beforePopState: jest.fn((handler) => {
            beforePopStateHandler = handler;
        }),
        query: {},
        isReady: true,
    };

    const syncHistoryState = (key = `test-history-${historyKeyCounter++}`) => {
        window.history.replaceState({ key }, "", "/search");
        return key;
    };

    const applyUrlToRouter = (url) => {
        const parsedUrl = new URL(url, "http://localhost");
        const nextQuery = {};

        parsedUrl.searchParams.forEach((value, key) => {
            nextQuery[key] = value;
        });

        mockRouter.query = nextQuery;
    };

    const createDeferred = () => {
        let resolve;
        let reject;
        const promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        });
        return { promise, resolve, reject };
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

        return render(
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

    const waitForSearchSkeletonsToFinish = async () => {
        await waitFor(() => {
            expect(screen.queryByTestId("search-mentor-skeleton")).not.toBeInTheDocument();
            expect(screen.queryByTestId("search-paper-skeleton")).not.toBeInTheDocument();
        });
    };

    const waitForMentorResultHeading = async (name) => {
        await waitForSearchSkeletonsToFinish();
        return screen.findByRole("heading", { name, level: 3 });
    };

    beforeEach(() => {
        mockPush.mockReset();
        mockReplace.mockReset();
        mockBack.mockReset();
        mockRouter.beforePopState.mockClear();
        request.mockReset();
        historyKeyCounter = 0;
        beforePopStateHandler = () => true;

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
        mockPush.mockImplementation(async (url) => {
            const nextPath = String(url);
            if (nextPath.startsWith("/search")) {
                syncHistoryState();
                applyUrlToRouter(nextPath);
                return true;
            }

            const nextHistoryKey = `test-history-${historyKeyCounter++}`;
            window.history.replaceState({ key: nextHistoryKey }, "", nextPath);
            applyUrlToRouter(url);
            return true;
        });
        mockReplace.mockImplementation(async (url) => {
            applyUrlToRouter(url);
            return true;
        });
        mockBack.mockImplementation(async () => true);
        syncHistoryState("test-history-initial");
        useRouter.mockReturnValue(mockRouter);
        window.sessionStorage.clear();
        window.scrollTo = jest.fn((optionsOrX, y) => {
            const nextScrollY = typeof optionsOrX === "object" && optionsOrX !== undefined
                ? Number(optionsOrX.top ?? 0)
                : Number(y ?? 0);

            Object.defineProperty(window, "scrollY", {
                value: Number.isFinite(nextScrollY) ? nextScrollY : 0,
                writable: true,
                configurable: true,
            });
        });
        window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(0), 0);
    });

    it("shows admin operation panel only for admin role", async () => {
        renderWithStore("alice", "admin");
        await waitForMineRequest();

        expect(screen.getByRole("heading", { name: "管理员操作" })).toBeInTheDocument();
    });

    it("does not render private mentor management module in search page", async () => {
        const view = renderWithStore();
        await waitForMineRequest();

        expect(screen.getByRole("heading", { name: "Search in 0 entrys:" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "返回主页" })).not.toBeInTheDocument();
        expect(screen.getByRole("group", { name: "搜索类型" })).toBeInTheDocument();
        expect(screen.getByRole("group", { name: "匹配方式" })).toBeInTheDocument();
        expect(screen.getByRole("group", { name: "导师筛选" })).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "我的私有导师" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "添加私有导师" })).not.toBeInTheDocument();
        expect(screen.queryByPlaceholderText("导师中文名（可选）")).not.toBeInTheDocument();
    });

    it("opens a centered delete mentor dialog with mentor details for admins", async () => {
        request.mockImplementation(async (url) => {
            if (url === "/api/dataset/mentors/mine") {
                return { mentors: [] };
            }

            if (url === "/api/search/mentors?keyword=%E5%BC%A0%E4%B8%89&search_mode=fuzzy") {
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
        fireEvent.click(screen.getByRole("button", { name: "搜索" }));

        await waitForMentorResultHeading("张三");
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

            if (url === "/api/search/mentors?keyword=%E5%BC%A0%E4%B8%89&search_mode=fuzzy") {
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
        fireEvent.click(screen.getByRole("button", { name: "搜索" }));

        await waitForMentorResultHeading("张三");
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

            if (url === "/api/search/mentors?keyword=%E5%BC%A0%E4%B8%89&search_mode=fuzzy") {
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
        fireEvent.click(screen.getByRole("button", { name: "搜索" }));

        await waitForMentorResultHeading("张三");
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

            if (url === "/api/search/mentors?keyword=%E5%BC%A0%E4%B8%89&search_mode=fuzzy") {
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
        fireEvent.click(screen.getByRole("button", { name: "搜索" }));

        await waitForMentorResultHeading("张三");
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
        const view = renderWithStore();
        await waitForMineRequest();

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/mentors?keyword=&search_mode=fuzzy",
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
                        mentor_ids: [5, 6],
                    }],
                };
            }

            return {};
        });

        const view = renderWithStore();
        await waitForMineRequest();

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/papers?keyword=%E5%A4%A7%E6%A8%A1%E5%9E%8B&search_mode=fuzzy&sort_mode=default",
                "GET",
                true,
            );
        });
        await waitForSearchSkeletonsToFinish();

        expect(screen.getByRole("heading", { name: "Showing 1 results for all: 大模型" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "搜论文" })).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByRole("button", { name: "模糊" })).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByRole("button", { name: "默认" })).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByDisplayValue("大模型")).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "大语言模型在问答系统中的应用" })).toBeInTheDocument();
        expect(mockPush).not.toHaveBeenCalled();
    });

    it("falls back to default values when URL query is invalid", async () => {
        mockRouter.query = {
            keyword: "图神经网络",
            mode: "invalid-mode",
            search_mode: "bad-mode",
            sort_mode: "bad-sort",
            page: "0",
        };

        const view = renderWithStore();
        await waitForMineRequest();

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/mentors?keyword=%E5%9B%BE%E7%A5%9E%E7%BB%8F%E7%BD%91%E7%BB%9C&search_mode=fuzzy",
                "GET",
                true,
            );
        });

        expect(screen.getByRole("button", { name: "搜人" })).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByRole("button", { name: "模糊" })).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByRole("button", { name: "全部" })).toHaveAttribute("aria-pressed", "true");
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

        const { container } = renderWithStore();
        await waitForMineRequest();

        fireEvent.change(screen.getByPlaceholderText("输入导师姓名或研究方向"), {
            target: { value: "张三" },
        });
        fireEvent.click(screen.getByRole("button", { name: "搜索" }));

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/mentors?keyword=%E5%BC%A0%E4%B8%89&search_mode=fuzzy",
                "GET",
                true,
            );
        });
        await waitForSearchSkeletonsToFinish();

        expect(screen.getByRole("heading", { name: "张三" })).toBeInTheDocument();
        expect(screen.getByText("Zhang San")).toBeInTheDocument();
        expect(screen.getByText("机器学习")).toBeInTheDocument();
        expect(screen.getByText("zhangsan@example.com")).toBeInTheDocument();
        expect(screen.getByText("主要研究机器学习与数据挖掘。")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "机器学习方法研究" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "大语言模型在问答系统中的应用" })).toBeInTheDocument();
        expect(container.querySelector('img.searchMentorMetaIcon[src="/English_Name.ico"]')).not.toBeNull();
        expect(container.querySelector('img.searchMentorMetaIcon[src="/Reseach_Direction.ico"]')).not.toBeNull();
        expect(container.querySelector('img.searchMentorMetaIcon[src="/Email.ico"]')).not.toBeNull();
        expect(container.querySelector('img.searchMentorMetaIcon[src="/Mentor_Profile.ico"]')).not.toBeNull();
        expect(container.querySelectorAll('img.searchMentorPaperLinkIcon[src="/arxiv.ico"]')).toHaveLength(2);
    });

    it("searches papers exactly when clicking mentor related paper title", async () => {
        request.mockImplementation(async (url) => {
            if (url === "/api/dataset/mentors/mine") {
                return { mentors: [] };
            }

            if (url === "/api/search/mentors?keyword=%E5%BC%A0%E4%B8%89&search_mode=fuzzy") {
                return {
                    mentors: [{
                        id: 1,
                        Chinese_name: "张三",
                        English_name: "Zhang San",
                        research_direction: "机器学习",
                        email: "zhangsan@example.com",
                        profile: "主要研究机器学习与数据挖掘。",
                        paperTitles: ["机器学习方法研究"],
                    }],
                };
            }

            if (url === "/api/search/papers?keyword=%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0%E6%96%B9%E6%B3%95%E7%A0%94%E7%A9%B6&search_mode=exact&sort_mode=default") {
                return {
                    papers: [{
                        id: 2,
                        title: "机器学习方法研究",
                        abstract: "本文讨论常见机器学习方法及其应用场景。",
                        publish_date: "2024-05-01",
                        author_names: "张三",
                        subjects: "cs.LG, cs.AI",
                        arxiv_id: "2402.00002",
                        arxiv_url: "https://arxiv.org/abs/2402.00002",
                        mentorNames: ["张三"],
                    }],
                };
            }

            return {};
        });

        const { container } = renderWithStore();
        await waitForMineRequest();

        fireEvent.change(screen.getByPlaceholderText("输入导师姓名或研究方向"), {
            target: { value: "张三" },
        });
        fireEvent.click(screen.getByRole("button", { name: "搜索" }));

        await waitFor(() => {
            expect(screen.getByRole("button", { name: "机器学习方法研究" })).toBeInTheDocument();
        });

        expect(container.querySelector('img.searchMentorPaperLinkIcon[src="/arxiv.ico"]')).not.toBeNull();

        fireEvent.click(screen.getByRole("button", { name: "机器学习方法研究" }));

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/papers?keyword=%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0%E6%96%B9%E6%B3%95%E7%A0%94%E7%A9%B6&search_mode=exact&sort_mode=default",
                "GET",
                true,
            );
        });
        await waitForSearchSkeletonsToFinish();

        expect(screen.getByRole("heading", { name: "机器学习方法研究" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "arxiv" })).toHaveAttribute("href", "https://arxiv.org/abs/2402.00002");
    });

    it("renders inline LaTeX in mentor related paper titles", async () => {
        request.mockImplementation(async (url) => {
            if (url === "/api/dataset/mentors/mine") {
                return { mentors: [] };
            }

            if (String(url).startsWith("/api/search/mentors")) {
                return {
                    mentors: [{
                        id: 3,
                        Chinese_name: "李四",
                        English_name: "Li Si",
                        research_direction: "神经网络",
                        email: "lisi@example.com",
                        profile: "研究带有公式标题的论文。",
                        paperTitles: ["GeS$^\\text{2}$mS-T: Multi-Dimensional Grouping for Ultra-High Energy Efficiency in Spiking Transformer"],
                    }],
                };
            }

            return {};
        });

        const { container } = renderWithStore();
        await waitForMineRequest();

        fireEvent.change(screen.getByPlaceholderText("输入导师姓名或研究方向"), {
            target: { value: "李四" },
        });
        fireEvent.click(screen.getByText("搜索"));

        await waitForSearchSkeletonsToFinish();
        await waitFor(() => {
            expect(screen.getByText(/Multi-Dimensional Grouping for Ultra-High Energy Efficiency in Spiking Transformer/)).toBeInTheDocument();
        });

        expect(container.querySelector(".searchMentorPaperLinkText .katex")).not.toBeNull();
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

        const view = renderWithStore();
        await waitForMineRequest();

        fireEvent.change(screen.getByPlaceholderText("输入导师姓名或研究方向"), {
            target: { value: "测试" },
        });
        fireEvent.click(screen.getByRole("button", { name: "搜索" }));

        await waitForMentorResultHeading("测试导师");

        expect(screen.queryByText(longProfile)).not.toBeInTheDocument();
        expect(screen.queryByText("论文12")).not.toBeInTheDocument();
        expect(screen.getByTestId("mentor-profile-toggle-88")).toHaveTextContent("展开");
        expect(screen.getByTestId("mentor-paper-toggle-88")).toHaveTextContent("展开");
        expect(screen.getByTestId("mentor-homepage-button-88")).toHaveTextContent("前往主页");

        fireEvent.click(screen.getByTestId("mentor-profile-toggle-88"));

        await waitFor(() => {
            expect(screen.getByText(longProfile)).toBeInTheDocument();
            expect(screen.queryByText("论文12")).not.toBeInTheDocument();
            expect(screen.getByTestId("mentor-profile-toggle-88")).toHaveTextContent("收起");
            expect(screen.getByTestId("mentor-homepage-button-88")).toHaveTextContent("前往主页");
        });

        fireEvent.click(screen.getByTestId("mentor-profile-toggle-88"));

        await waitFor(() => {
            expect(screen.queryByText(longProfile)).not.toBeInTheDocument();
            expect(screen.getByTestId("mentor-profile-toggle-88")).toHaveTextContent("展开");
        });

        fireEvent.click(screen.getByTestId("mentor-homepage-button-88"));

        await waitFor(() => {
            expect(mockPush).toHaveBeenCalledWith("/mentors/88");
        });
    });

    it("shows mentor homepage button for short profiles without expand toggle", async () => {
        request.mockImplementation(async (url) => {
            if (url === "/api/dataset/mentors/mine") {
                return { mentors: [] };
            }

            if (String(url).startsWith("/api/search/mentors")) {
                return {
                    mentors: [{
                        id: 66,
                        Chinese_name: "短画像导师",
                        English_name: "Short Profile Mentor",
                        research_direction: "计算机视觉",
                        email: "short@example.com",
                        profile: "简短导师画像",
                        paperTitles: [],
                    }],
                };
            }

            return {};
        });

        renderWithStore();
        await waitForMineRequest();

        fireEvent.change(screen.getByPlaceholderText("输入导师姓名或研究方向"), {
            target: { value: "短画像" },
        });
        fireEvent.click(screen.getByRole("button", { name: "搜索" }));

        await waitFor(() => {
            expect(screen.getByRole("heading", { name: "短画像导师" })).toBeInTheDocument();
        });

        expect(screen.queryByTestId("mentor-profile-toggle-66")).not.toBeInTheDocument();
        expect(screen.getByTestId("mentor-homepage-button-66")).toHaveTextContent("前往主页");

        fireEvent.click(screen.getByTestId("mentor-homepage-button-66"));

        await waitFor(() => {
            expect(mockPush).toHaveBeenCalledWith("/mentors/66");
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
                        mentor_ids: [5, 6],
                    }],
                };
            }

            return {};
        });

        const view = renderWithStore();
        await waitForMineRequest();

        fireEvent.click(screen.getByRole("button", { name: "搜论文" }));
        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/papers?keyword=&search_mode=fuzzy&sort_mode=default",
                "GET",
                true,
            );
        });
        fireEvent.change(screen.getByPlaceholderText("输入论文题目、导师姓名或导师研究方向"), {
            target: { value: "李四" },
        });
        fireEvent.click(screen.getByRole("button", { name: "搜索" }));

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/papers?keyword=%E6%9D%8E%E5%9B%9B&search_mode=fuzzy&sort_mode=default",
                "GET",
                true,
            );
        });
        await waitForSearchSkeletonsToFinish();

        expect(screen.getByRole("heading", { name: "大语言模型在问答系统中的应用" })).toBeInTheDocument();
        expect(screen.getByText("2024-06-15")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "arxiv" })).toHaveAttribute("href", "https://arxiv.org/abs/2401.00001");
        expect(screen.getByRole("link", { name: "pdf" })).toHaveAttribute("href", "https://arxiv.org/pdf/2401.00001");
        expect(screen.getByText("cs.CL")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /李四/ })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /张三/ })).toBeInTheDocument();
        expect(screen.getByText("摘要：")).toBeInTheDocument();
        expect(screen.getByText("本文介绍大语言模型在智能问答中的实践。").closest(".searchPaperAbstractContent")).not.toBeNull();
        expect(screen.getByText("作者：").closest(".timelineMetaRow")).not.toBeNull();
        expect(screen.getAllByAltText("清华导师").length).toBe(2);
        // 作者列表现在会把数据库中存在的导师名字渲染为可点击按钮
    });

    it("renders the search mentor follow button in bilibili style and toggles between follow states", async () => {
        request.mockImplementation(async (url, method) => {
            if (url === "/api/dataset/mentors/mine") {
                return { mentors: [] };
            }

            if (url === "/api/follow/mentors") {
                return { mentors: [] };
            }

            if (url === "/api/search/mentors?keyword=&search_mode=fuzzy") {
                return { mentors: [] };
            }

            if (url === "/api/search/mentors?keyword=%E5%BC%A0%E4%B8%89&search_mode=fuzzy") {
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

            if (url === "/api/follow/mentors/1" && method === "POST") {
                return { followed: true };
            }

            if (url === "/api/follow/mentors/1" && method === "DELETE") {
                return { followed: false };
            }

            return {};
        });

        renderWithStore();
        await waitForMineRequest();

        fireEvent.change(screen.getByPlaceholderText("输入导师姓名或研究方向"), {
            target: { value: "张三" },
        });
        fireEvent.click(screen.getByRole("button", { name: "搜索" }));

        const followButton = await screen.findByRole("button", { name: "关注" });
        expect(followButton).toHaveStyle({
            backgroundColor: "rgb(8, 109, 177)",
            color: "rgb(255, 255, 255)",
            fontSize: "14px",
            border: "0px solid transparent",
        });

        fireEvent.click(followButton);

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith("/api/follow/mentors/1", "POST", true);
        });

        const followedButton = await screen.findByRole("button", { name: "已关注" });
        expect(followedButton).toHaveStyle({
            backgroundColor: "rgba(246, 248, 250, 0.96)",
            color: "rgb(0, 0, 0)",
            fontSize: "14px",
            border: "0px solid transparent",
        });

        fireEvent.click(followedButton);

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith("/api/follow/mentors/1", "DELETE", true);
        });

        expect(await screen.findByRole("button", { name: "关注" })).toBeInTheDocument();
    });

    it("renders inline LaTeX in paper search result abstracts", async () => {
        request.mockImplementation(async (url) => {
            if (url === "/api/dataset/mentors/mine") {
                return { mentors: [] };
            }

            if (String(url).startsWith("/api/search/papers")) {
                return {
                    papers: [{
                        id: 2,
                        title: "Compression Paper",
                        abstract: "sequence length, but performing semantic-level compression through a specific ratio $k$}. This $O(n/k)$ path remains effective.",
                        publish_date: "2026-05-01",
                        subjects: "cs.LG",
                        arxiv_id: "2501.00001",
                        arxiv_url: "https://arxiv.org/abs/2501.00001",
                        mentorNames: ["李四"],
                    }],
                };
            }

            if (String(url).startsWith("/api/search/mentors")) {
                return { mentors: [] };
            }

            return {};
        });

        const { container } = renderWithStore();
        await waitForMineRequest();

        fireEvent.click(screen.getByRole("button", { name: "搜论文" }));
        fireEvent.change(screen.getByPlaceholderText("输入论文题目、导师姓名或导师研究方向"), {
            target: { value: "压缩" },
        });
        fireEvent.click(screen.getByRole("button", { name: "搜索" }));

        await screen.findByRole("heading", { name: "Compression Paper" });

        expect(screen.getByText(/sequence length, but performing semantic-level compression through a specific ratio/i)).toBeInTheDocument();
        expect(screen.getByText(/This/i)).toBeInTheDocument();
        expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(2);
        expect(screen.queryByText(/\$k\$/)).not.toBeInTheDocument();
        expect(screen.queryByText(/\$O\(n\/k\)\$/)).not.toBeInTheDocument();
    });

    it("renders inline LaTeX in paper search result titles while keeping the arXiv link", async () => {
        request.mockImplementation(async (url) => {
            if (url === "/api/dataset/mentors/mine") {
                return { mentors: [] };
            }

            if (String(url).startsWith("/api/search/papers")) {
                return {
                    papers: [{
                        id: 4,
                        title: "Compression $x^2$ Paper",
                        abstract: "摘要保持纯文本。",
                        publish_date: "2026-05-03",
                        subjects: "cs.LG",
                        arxiv_id: "2501.00003",
                        arxiv_url: "https://arxiv.org/abs/2501.00003",
                        mentorNames: ["李四"],
                    }],
                };
            }

            if (String(url).startsWith("/api/search/mentors")) {
                return { mentors: [] };
            }

            return {};
        });

        const { container } = renderWithStore();
        await waitForMineRequest();

        fireEvent.click(screen.getByRole("button", { name: "搜论文" }));
        fireEvent.change(screen.getByPlaceholderText("输入论文题目、导师姓名或导师研究方向"), {
            target: { value: "标题公式" },
        });
        fireEvent.click(screen.getByRole("button", { name: "搜索" }));

        await screen.findByText(/Compression/i);

        const titleHeading = container.querySelector("h3");
        const arxivLink = screen.getByRole("link", { name: "arxiv" });
        expect(titleHeading?.querySelector(".katex")).not.toBeNull();
        expect(arxivLink).toHaveAttribute("href", "https://arxiv.org/abs/2501.00003");
        expect(screen.queryByText(/\$x\^2\$/)).not.toBeInTheDocument();
    });

    it("renders block LaTeX in paper search result abstracts", async () => {
        request.mockImplementation(async (url) => {
            if (url === "/api/dataset/mentors/mine") {
                return { mentors: [] };
            }

            if (String(url).startsWith("/api/search/papers")) {
                return {
                    papers: [{
                        id: 3,
                        title: "Block Formula Paper",
                        abstract: "核心结论如下：$$E=mc^2$$并且后续仍成立。",
                        publish_date: "2026-05-02",
                        subjects: "cs.AI",
                        arxiv_id: "2501.00002",
                        arxiv_url: "https://arxiv.org/abs/2501.00002",
                        mentorNames: ["张三"],
                    }],
                };
            }

            if (String(url).startsWith("/api/search/mentors")) {
                return { mentors: [] };
            }

            return {};
        });

        const { container } = renderWithStore();
        await waitForMineRequest();

        fireEvent.click(screen.getByRole("button", { name: "搜论文" }));
        fireEvent.change(screen.getByPlaceholderText("输入论文题目、导师姓名或导师研究方向"), {
            target: { value: "块公式" },
        });
        fireEvent.click(screen.getByRole("button", { name: "搜索" }));

        await screen.findByRole("heading", { name: "Block Formula Paper" });

        expect(container.querySelector(".searchPaperAbstractContent .latexTextDisplay")).not.toBeNull();
        expect(container.querySelector(".katex-display")).not.toBeNull();
    });

    it("renders block-delimited LaTeX inline in paper search result titles", async () => {
        request.mockImplementation(async (url) => {
            if (url === "/api/dataset/mentors/mine") {
                return { mentors: [] };
            }

            if (String(url).startsWith("/api/search/papers")) {
                return {
                    papers: [{
                        id: 5,
                        title: "Block $$E=mc^2$$ Title",
                        abstract: "摘要保持纯文本。",
                        publish_date: "2026-05-04",
                        subjects: "cs.AI",
                        arxiv_id: "2501.00004",
                        arxiv_url: "https://arxiv.org/abs/2501.00004",
                        mentorNames: ["张三"],
                    }],
                };
            }

            if (String(url).startsWith("/api/search/mentors")) {
                return { mentors: [] };
            }

            return {};
        });

        const { container } = renderWithStore();
        await waitForMineRequest();

        fireEvent.click(screen.getByRole("button", { name: "搜论文" }));
        fireEvent.change(screen.getByPlaceholderText("输入论文题目、导师姓名或导师研究方向"), {
            target: { value: "块标题公式" },
        });
        fireEvent.click(screen.getByRole("button", { name: "搜索" }));

        await screen.findByText(/Block/i);

        const titleHeading = container.querySelector("h3");
        const arxivLink = screen.getByRole("link", { name: "arxiv" });
        expect(titleHeading?.querySelector(".katex")).not.toBeNull();
        expect(titleHeading?.querySelector(".latexTextDisplay")).toBeNull();
        expect(arxivLink).toHaveAttribute("href", "https://arxiv.org/abs/2501.00004");
        expect(screen.queryByText(/\$\$E=mc\^2\$\$/)).not.toBeInTheDocument();
    });

    it("opens a centered delete paper dialog with paper details for admins", async () => {
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
                        publish_date: "",
                        author_names: "李四,张三",
                        subjects: "",
                        mentorNames: [],
                    }],
                };
            }

            return {};
        });

        renderWithStore("alice", "admin");
        await waitForMineRequest();

        fireEvent.click(screen.getByRole("button", { name: "搜论文" }));
        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/papers?keyword=&search_mode=fuzzy&sort_mode=default",
                "GET",
                true,
            );
        });

        await screen.findByRole("heading", { name: "大语言模型在问答系统中的应用" });
        fireEvent.click(screen.getByRole("button", { name: "删除论文" }));

        const dialog = screen.getByRole("dialog", { name: "确认删除论文" });
        expect(dialog).toBeInTheDocument();
        expect(within(dialog).getByText("标题：大语言模型在问答系统中的应用")).toBeInTheDocument();
        expect(within(dialog).getByText("发表日期：未知")).toBeInTheDocument();
        expect(within(dialog).getByText("导师：未知导师")).toBeInTheDocument();
        expect(within(dialog).getByText("分类：暂无分类")).toBeInTheDocument();
        expect(request).not.toHaveBeenCalledWith("/api/dataset/papers/2", "DELETE", true);
    });

    it("closes the delete paper dialog when clicking cancel without deleting", async () => {
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
                        mentorNames: ["李四", "张三"],
                    }],
                };
            }

            return {};
        });

        renderWithStore("alice", "admin");
        await waitForMineRequest();

        fireEvent.click(screen.getByRole("button", { name: "搜论文" }));
        await screen.findByRole("heading", { name: "大语言模型在问答系统中的应用" });
        fireEvent.click(screen.getByRole("button", { name: "删除论文" }));
        fireEvent.click(screen.getByRole("button", { name: "取消" }));

        await waitFor(() => {
            expect(screen.queryByRole("dialog", { name: "确认删除论文" })).not.toBeInTheDocument();
        });
        expect(request).not.toHaveBeenCalledWith("/api/dataset/papers/2", "DELETE", true);
    });

    it("deletes paper after confirmation, shows loading state, and refreshes search results", async () => {
        let deleted = false;
        let resolveDelete;
        request.mockImplementation((url, method) => {
            if (url === "/api/dataset/mentors/mine") {
                return Promise.resolve({ mentors: [] });
            }

            if (url === "/api/dataset/papers/2" && method === "DELETE") {
                return new Promise((resolve) => {
                    resolveDelete = () => {
                        deleted = true;
                        resolve({});
                    };
                });
            }

            if (String(url).startsWith("/api/search/papers")) {
                return Promise.resolve({
                    papers: deleted ? [] : [{
                        id: 2,
                        title: "大语言模型在问答系统中的应用",
                        abstract: "本文介绍大语言模型在智能问答中的实践。",
                        publish_date: "2024-06-15",
                        author_names: "李四,张三",
                        subjects: "cs.CL",
                        mentorNames: ["李四", "张三"],
                    }],
                });
            }

            return Promise.resolve({});
        });

        renderWithStore("alice", "admin");
        await waitForMineRequest();

        fireEvent.click(screen.getByRole("button", { name: "搜论文" }));
        await screen.findByRole("heading", { name: "大语言模型在问答系统中的应用" });
        fireEvent.click(screen.getByRole("button", { name: "删除论文" }));

        const confirmDeleteButton = screen.getByRole("button", { name: "确认删除" });
        fireEvent.click(confirmDeleteButton);

        expect(confirmDeleteButton).toBeDisabled();
        expect(confirmDeleteButton.querySelector("span[aria-hidden='true']")).not.toBeNull();
        expect(request).toHaveBeenCalledWith("/api/dataset/papers/2", "DELETE", true);

        resolveDelete();

        await waitFor(() => {
            expect(screen.queryByRole("dialog", { name: "确认删除论文" })).not.toBeInTheDocument();
        });
        await waitFor(() => {
            expect(screen.queryByRole("heading", { name: "大语言模型在问答系统中的应用" })).not.toBeInTheDocument();
        });
        expect(screen.getByText("论文删除成功")).toBeInTheDocument();
    });

    it("filters mentor search results by mine and public categories", async () => {
        const privateMentorData = {
            id: 101,
            Chinese_name: "王五",
            English_name: "Wang Wu",
            research_direction: "强化学习",
            email: "wangwu@example.com",
            profile: "私有导师测试数据",
            paperTitles: ["RL Paper"],
        };
        const publicMentorData = {
            id: 301,
            Chinese_name: "李雷",
            English_name: "Li Lei",
            research_direction: "知识图谱",
            email: "lilei@example.com",
            profile: "公共导师测试数据",
            paperTitles: ["KG Paper"],
        };

        request.mockImplementation(async (url) => {
            const urlStr = String(url);

            if (urlStr === "/api/dataset/mentors/mine") {
                return { mentors: [mockPrivateMentor] };
            }

            if (urlStr.startsWith("/api/search/mentors")) {
                if (urlStr.includes("visibility=mine")) {
                    return { mentors: [privateMentorData], total: 1, total_pages: 1 };
                }
                if (urlStr.includes("visibility=public")) {
                    return { mentors: [publicMentorData], total: 1, total_pages: 1 };
                }
                return {
                    mentors: [privateMentorData, publicMentorData],
                    total: 2,
                    total_pages: 1,
                };
            }

            return {};
        });

        const view = renderWithStore();
        await waitForMineRequest();

        fireEvent.change(screen.getByPlaceholderText("输入导师姓名或研究方向"), {
            target: { value: "导师" },
        });
        fireEvent.click(screen.getByRole("button", { name: "搜索" }));

        await waitFor(() => {
            expect(screen.getByRole("heading", { name: "李雷", level: 3 })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole("button", { name: "私有" }));

        await waitFor(() => {
            expect(screen.queryByRole("heading", { name: "李雷", level: 3 })).not.toBeInTheDocument();
            expect(screen.getByRole("heading", { name: /王五/, level: 3 })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole("button", { name: "公共" }));

        await waitFor(() => {
            expect(screen.getByRole("heading", { name: "李雷", level: 3 })).toBeInTheDocument();
        });
    });

    it("encodes mentor visibility in the URL and restores it from router query changes", async () => {
        const privateMentorData = {
            id: 101,
            Chinese_name: "王五",
            English_name: "Wang Wu",
            research_direction: "强化学习",
            email: "wangwu@example.com",
            profile: "私有导师测试数据",
            paperTitles: ["RL Paper"],
        };
        const publicMentorData = {
            id: 301,
            Chinese_name: "李雷",
            English_name: "Li Lei",
            research_direction: "知识图谱",
            email: "lilei@example.com",
            profile: "公共导师测试数据",
            paperTitles: ["KG Paper"],
        };

        request.mockImplementation(async (url) => {
            const urlStr = String(url);

            if (urlStr === "/api/dataset/mentors/mine") {
                return { mentors: [mockPrivateMentor] };
            }

            if (urlStr === "/api/search/mentors?keyword=%E5%AF%BC%E5%B8%88&search_mode=fuzzy") {
                return { mentors: [privateMentorData, publicMentorData], total: 2, total_pages: 1 };
            }

            if (urlStr === "/api/search/mentors?keyword=%E5%AF%BC%E5%B8%88&search_mode=fuzzy&visibility=mine") {
                return { mentors: [privateMentorData], total: 1, total_pages: 1 };
            }

            if (urlStr === "/api/search/mentors?keyword=%E5%AF%BC%E5%B8%88&search_mode=fuzzy&visibility=public") {
                return { mentors: [publicMentorData], total: 1, total_pages: 1 };
            }

            return {};
        });

        const view = renderWithStore();
        await waitForMineRequest();

        fireEvent.change(screen.getByPlaceholderText("输入导师姓名或研究方向"), {
            target: { value: "导师" },
        });
        fireEvent.click(screen.getByRole("button", { name: "搜索" }));

        await waitFor(() => {
            expect(screen.getByRole("heading", { name: "李雷", level: 3 })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole("button", { name: "私有" }));

        await waitFor(() => {
            expect(mockPush).toHaveBeenCalledWith(
                "/search?keyword=%E5%AF%BC%E5%B8%88&mode=mentor&search_mode=fuzzy&visibility=mine",
                undefined,
                { shallow: true, scroll: false },
            );
            expect(screen.getByRole("button", { name: "私有" })).toHaveAttribute("aria-pressed", "true");
            expect(screen.getByRole("heading", { name: "王五", level: 3 })).toBeInTheDocument();
        });

        act(() => {
            mockRouter.query = {
                keyword: "导师",
                mode: "mentor",
                search_mode: "fuzzy",
                visibility: "public",
            };
        });

        view.rerender(
            <Provider store={configureStore({
                reducer: {
                    auth: authReducer,
                },
                preloadedState: {
                    auth: {
                        name: "student",
                        token: "mock-token",
                        role: "student",
                    },
                },
            })}>
                <SearchScreen />
            </Provider>,
        );
        await waitForMineRequest();

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/mentors?keyword=%E5%AF%BC%E5%B8%88&search_mode=fuzzy&visibility=public",
                "GET",
                true,
            );
            expect(screen.getByRole("button", { name: "公共" })).toHaveAttribute("aria-pressed", "true");
            expect(screen.getByRole("heading", { name: "李雷", level: 3 })).toBeInTheDocument();
        });
    });

    it("re-fetches and restores search state when router query changes after initial render", async () => {
        request.mockImplementation(async (url) => {
            if (url === "/api/dataset/mentors/mine") {
                return { mentors: [] };
            }

            if (url === "/api/search/mentors?keyword=&search_mode=fuzzy") {
                return { mentors: [] };
            }

            if (url === "/api/search/papers?keyword=%E5%A4%A7%E6%A8%A1%E5%9E%8B&search_mode=exact&sort_mode=late&page=3") {
                return {
                    papers: [{
                        id: 2,
                        title: "第三页论文",
                        abstract: "用于测试 query 变化恢复。",
                        publish_date: "2026-01-03",
                        author_names: "李四",
                        subjects: "cs.CL",
                        mentorNames: ["李四"],
                    }],
                    page: 3,
                    total: 9,
                    total_pages: 3,
                    has_previous: true,
                    has_next: false,
                };
            }

            return {};
        });

        const view = renderWithStore();
        await waitForMineRequest();

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/mentors?keyword=&search_mode=fuzzy",
                "GET",
                true,
            );
        });

        act(() => {
            mockRouter.query = {
                keyword: "大模型",
                mode: "paper",
                search_mode: "exact",
                sort_mode: "late",
                page: "3",
            };
            view.rerender(
                <Provider store={configureStore({
                    reducer: { auth: authReducer },
                    preloadedState: {
                        auth: {
                            name: "student",
                            token: "mock-token",
                            role: "student",
                        },
                    },
                })}>
                    <SearchScreen />
                </Provider>,
            );
        });

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/papers?keyword=%E5%A4%A7%E6%A8%A1%E5%9E%8B&search_mode=exact&sort_mode=late&page=3",
                "GET",
                true,
            );
        });
        await waitForSearchSkeletonsToFinish();

        expect(screen.getByRole("button", { name: "搜论文" })).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByRole("button", { name: "精确" })).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByRole("button", { name: "最晚" })).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByDisplayValue("大模型")).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "第三页论文" })).toBeInTheDocument();
    });

    it("restores scroll position and expanded mentor cards on browser back", async () => {
        const longProfile = "这是一段用于测试默认折叠展示的导师画像内容。".repeat(10);
        const longPaperTitles = Array.from({ length: 12 }, (_, index) => `论文${index + 1}`);

        request.mockImplementation(async (url) => {
            const urlStr = String(url);

            if (urlStr === "/api/dataset/mentors/mine") {
                return { mentors: [] };
            }

            if (urlStr === "/api/search/mentors?keyword=%E6%B5%8B%E8%AF%95&search_mode=fuzzy") {
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
                    total: 1,
                    total_pages: 1,
                };
            }

            if (urlStr === "/api/search/papers?keyword=%E8%AE%BA%E6%96%8712&search_mode=exact&sort_mode=default") {
                return {
                    papers: [{
                        id: 12,
                        title: "论文12",
                        abstract: "跳转后的论文结果。",
                        publish_date: "2026-05-01",
                        author_names: "测试导师",
                        subjects: "cs.AI",
                        mentorNames: ["测试导师"],
                    }],
                    total: 1,
                    total_pages: 1,
                };
            }

            return {};
        });

        const view = renderWithStore();
        await waitForMineRequest();

        fireEvent.change(screen.getByPlaceholderText("输入导师姓名或研究方向"), {
            target: { value: "测试" },
        });
        fireEvent.click(screen.getByRole("button", { name: "搜索" }));

        await waitFor(() => {
            expect(screen.getByRole("heading", { name: "测试导师", level: 3 })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId("mentor-profile-toggle-88"));
        await waitFor(() => {
            expect(screen.getByText(longProfile)).toBeInTheDocument();
            expect(screen.queryByText("论文12")).not.toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId("mentor-profile-toggle-88"));
        await waitFor(() => {
            expect(screen.queryByText(longProfile)).not.toBeInTheDocument();
            expect(screen.getByTestId("mentor-profile-toggle-88")).toHaveTextContent("展开");
        });

        fireEvent.click(screen.getByTestId("mentor-paper-toggle-88"));
        await waitFor(() => {
            expect(screen.getByText("论文12")).toBeInTheDocument();
            expect(screen.getByTestId("mentor-paper-toggle-88")).toHaveTextContent("收起");
        });

        Object.defineProperty(window, "scrollY", {
            value: 460,
            writable: true,
            configurable: true,
        });
        fireEvent.scroll(window);

        fireEvent.click(screen.getByRole("button", { name: "论文12" }));

        await waitFor(() => {
            expect(mockPush).toHaveBeenCalledWith(
                "/search?keyword=%E8%AE%BA%E6%96%8712&mode=paper&search_mode=exact&sort_mode=default",
                undefined,
                { shallow: true, scroll: false },
            );
            expect(screen.getByRole("heading", { name: "论文12" })).toBeInTheDocument();
        });

        act(() => {
            mockRouter.query = {
                keyword: "测试",
                mode: "mentor",
                search_mode: "fuzzy",
            };
            window.history.replaceState({ key: "test-history-0" }, "", "/search?keyword=%E6%B5%8B%E8%AF%95&mode=mentor&search_mode=fuzzy");
            beforePopStateHandler({
                key: "test-history-0",
                as: "/search?keyword=%E6%B5%8B%E8%AF%95&mode=mentor&search_mode=fuzzy",
                url: "/search?keyword=%E6%B5%8B%E8%AF%95&mode=mentor&search_mode=fuzzy",
            });
            window.dispatchEvent(new PopStateEvent("popstate"));
            view.rerender(
                <Provider store={configureStore({
                    reducer: { auth: authReducer },
                    preloadedState: {
                        auth: {
                            name: "student",
                            token: "mock-token",
                            role: "student",
                        },
                    },
                })}>
                    <SearchScreen />
                </Provider>,
            );
        });

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/mentors?keyword=%E6%B5%8B%E8%AF%95&search_mode=fuzzy",
                "GET",
                true,
            );
        });
        await waitForSearchSkeletonsToFinish();

        expect(screen.getByRole("heading", { name: "测试导师", level: 3 })).toBeInTheDocument();
        await waitFor(() => {
            expect(window.scrollTo).toHaveBeenCalled();
        });
        expect(window.scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 460, behavior: "auto" });
    });

    it("stores push target scroll state under the new history key without overwriting the mentor result entry", async () => {
        const longProfile = "这是一段用于测试默认折叠展示的导师画像内容。".repeat(10);
        const longPaperTitles = Array.from({ length: 12 }, (_, index) => `论文${index + 1}`);

        request.mockImplementation(async (url) => {
            const urlStr = String(url);

            if (urlStr === "/api/dataset/mentors/mine") {
                return { mentors: [] };
            }

            if (urlStr === "/api/search/mentors?keyword=%E6%B5%8B%E8%AF%95&search_mode=fuzzy") {
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
                    total: 1,
                    total_pages: 1,
                };
            }

            if (urlStr === "/api/search/papers?keyword=%E8%AE%BA%E6%96%8712&search_mode=exact&sort_mode=default") {
                return {
                    papers: [{
                        id: 12,
                        title: "论文12",
                        abstract: "跳转后的论文结果。",
                        publish_date: "2026-05-01",
                        author_names: "测试导师",
                        subjects: "cs.AI",
                        mentorNames: ["测试导师"],
                    }],
                    total: 1,
                    total_pages: 1,
                };
            }

            return {};
        });

        renderWithStore();
        await waitForMineRequest();

        fireEvent.change(screen.getByPlaceholderText("输入导师姓名或研究方向"), {
            target: { value: "测试" },
        });
        fireEvent.click(screen.getByRole("button", { name: "搜索" }));

        await waitFor(() => {
            expect(screen.getByRole("heading", { name: "测试导师", level: 3 })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId("mentor-profile-toggle-88"));
        await waitFor(() => {
            expect(screen.getByText(longProfile)).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId("mentor-paper-toggle-88"));
        await waitFor(() => {
            expect(screen.getByRole("button", { name: "论文12" })).toBeInTheDocument();
        });

        const expandedSourceEntryKey = window.history.state.key;
        const expandedSourceViewState = JSON.parse(
            window.sessionStorage.getItem(`search-view-state:${expandedSourceEntryKey}`),
        );
        expect(expandedSourceViewState.expandedProfileMentorIds).toEqual([88]);
        expect(expandedSourceViewState.expandedPaperMentorIds).toEqual([88]);

        Object.defineProperty(window, "scrollY", {
            value: 460,
            writable: true,
            configurable: true,
        });
        fireEvent.scroll(window);

        const sourceEntryKey = window.history.state.key;
        fireEvent.click(screen.getByRole("button", { name: "论文12" }));

        await waitFor(() => {
            expect(screen.getByRole("heading", { name: "论文12" })).toBeInTheDocument();
        });

        const targetEntryKey = window.history.state.key;
        expect(targetEntryKey).not.toBe(sourceEntryKey);

        const sourceViewState = JSON.parse(window.sessionStorage.getItem(`search-view-state:${sourceEntryKey}`));
        const targetViewState = JSON.parse(window.sessionStorage.getItem(`search-view-state:${targetEntryKey}`));

        expect(sourceViewState.scrollY).toBe(460);
        expect(targetViewState.scrollY).toBe(0);
        expect(targetViewState.expandedProfileMentorIds).toEqual([]);
        expect(targetViewState.expandedPaperMentorIds).toEqual([]);
    });

    it("does not overwrite the saved mentor scroll state when the browser resets scroll before pop restore", async () => {
        const longProfile = "这是一段用于测试默认折叠展示的导师画像内容。".repeat(10);
        const longPaperTitles = Array.from({ length: 12 }, (_, index) => `论文${index + 1}`);

        request.mockImplementation(async (url) => {
            const urlStr = String(url);

            if (urlStr === "/api/dataset/mentors/mine") {
                return { mentors: [] };
            }

            if (urlStr === "/api/search/mentors?keyword=%E6%B5%8B%E8%AF%95&search_mode=fuzzy") {
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
                    total: 1,
                    total_pages: 1,
                };
            }

            if (urlStr === "/api/search/papers?keyword=%E8%AE%BA%E6%96%8712&search_mode=exact&sort_mode=default") {
                return {
                    papers: [{
                        id: 12,
                        title: "论文12",
                        abstract: "跳转后的论文结果。",
                        publish_date: "2026-05-01",
                        author_names: "测试导师",
                        subjects: "cs.AI",
                        mentorNames: ["测试导师"],
                    }],
                    total: 1,
                    total_pages: 1,
                };
            }

            return {};
        });

        const view = renderWithStore();
        await waitForMineRequest();

        fireEvent.change(screen.getByPlaceholderText("输入导师姓名或研究方向"), {
            target: { value: "测试" },
        });
        fireEvent.click(screen.getByRole("button", { name: "搜索" }));

        await waitFor(() => {
            expect(screen.getByRole("heading", { name: "测试导师", level: 3 })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId("mentor-profile-toggle-88"));
        await waitFor(() => {
            expect(screen.getByTestId("mentor-profile-toggle-88")).toHaveTextContent("收起");
            expect(screen.getByText(longProfile)).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId("mentor-profile-toggle-88"));
        await waitFor(() => {
            expect(screen.queryByText(longProfile)).not.toBeInTheDocument();
            expect(screen.getByTestId("mentor-profile-toggle-88")).toHaveTextContent("展开");
        });

        fireEvent.click(screen.getByTestId("mentor-paper-toggle-88"));
        await waitFor(() => {
            expect(screen.getByRole("button", { name: "论文12" })).toBeInTheDocument();
        });

        Object.defineProperty(window, "scrollY", {
            value: 13,
            writable: true,
            configurable: true,
        });
        fireEvent.scroll(window);
        const mentorEntryKey = window.history.state.key;

        fireEvent.click(screen.getByRole("button", { name: "论文12" }));

        await waitFor(() => {
            expect(screen.getByRole("heading", { name: "论文12" })).toBeInTheDocument();
        });

        Object.defineProperty(window, "scrollY", {
            value: 0,
            writable: true,
            configurable: true,
        });
        fireEvent.scroll(window);

        act(() => {
            mockRouter.query = {
                keyword: "测试",
                mode: "mentor",
                search_mode: "fuzzy",
            };
            window.history.replaceState({ key: mentorEntryKey }, "", "/search?keyword=%E6%B5%8B%E8%AF%95&mode=mentor&search_mode=fuzzy");
            beforePopStateHandler({
                key: mentorEntryKey,
                as: "/search?keyword=%E6%B5%8B%E8%AF%95&mode=mentor&search_mode=fuzzy",
                url: "/search?keyword=%E6%B5%8B%E8%AF%95&mode=mentor&search_mode=fuzzy",
            });
            window.dispatchEvent(new PopStateEvent("popstate"));
            fireEvent.scroll(window);
            view.rerender(
                <Provider store={configureStore({
                    reducer: { auth: authReducer },
                    preloadedState: {
                        auth: {
                            name: "student",
                            token: "mock-token",
                            role: "student",
                        },
                    },
                })}>
                    <SearchScreen />
                </Provider>,
            );
        });

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/mentors?keyword=%E6%B5%8B%E8%AF%95&search_mode=fuzzy",
                "GET",
                true,
            );
        });

        const savedMentorViewState = JSON.parse(window.sessionStorage.getItem(`search-view-state:${mentorEntryKey}`));
        expect(savedMentorViewState.scrollY).toBe(13);

        await waitFor(() => {
            expect(window.scrollTo).toHaveBeenCalledWith({ left: 0, top: 13, behavior: "auto" });
        });
    });

    it("restores scroll position and expanded mentor cards after visiting mentor homepage with the homepage button", async () => {
        const longProfile = "这是一段用于测试默认折叠展示的导师画像内容。".repeat(10);
        const longPaperTitles = Array.from({ length: 12 }, (_, index) => `论文${index + 1}`);

        request.mockImplementation(async (url) => {
            const urlStr = String(url);

            if (urlStr === "/api/dataset/mentors/mine") {
                return { mentors: [] };
            }

            if (urlStr === "/api/search/mentors?keyword=%E6%B5%8B%E8%AF%95&search_mode=fuzzy") {
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
                    total: 1,
                    total_pages: 1,
                };
            }

            return {};
        });

        const view = renderWithStore();
        await waitForMineRequest();

        fireEvent.change(screen.getByPlaceholderText("输入导师姓名或研究方向"), {
            target: { value: "测试" },
        });
        fireEvent.click(screen.getByRole("button", { name: "搜索" }));

        await waitFor(() => {
            expect(screen.getByRole("heading", { name: "测试导师", level: 3 })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId("mentor-profile-toggle-88"));
        fireEvent.click(screen.getByTestId("mentor-paper-toggle-88"));

        await waitFor(() => {
            expect(screen.getByText(longProfile)).toBeInTheDocument();
            expect(screen.getByRole("button", { name: "论文12" })).toBeInTheDocument();
        });

        Object.defineProperty(window, "scrollY", {
            value: 460,
            writable: true,
            configurable: true,
        });
        fireEvent.scroll(window);
        const mentorSearchEntryKey = window.history.state.key;

        fireEvent.click(screen.getByTestId("mentor-homepage-button-88"));

        await waitFor(() => {
            expect(mockPush).toHaveBeenCalledWith("/mentors/88");
        });

        act(() => {
            mockRouter.query = {
                keyword: "测试",
                mode: "mentor",
                search_mode: "fuzzy",
            };
            window.history.replaceState({ key: mentorSearchEntryKey }, "", "/search?keyword=%E6%B5%8B%E8%AF%95&mode=mentor&search_mode=fuzzy");
            view.unmount();
        });

        renderWithStore();

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/mentors?keyword=%E6%B5%8B%E8%AF%95&search_mode=fuzzy",
                "GET",
                true,
            );
        });
        await waitForSearchSkeletonsToFinish();

        await waitFor(() => {
            expect(window.scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 460, behavior: "auto" });
        });
        expect(screen.getByText(longProfile)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "论文12" })).toBeInTheDocument();
    });

    it("restores scroll position and expanded mentor cards after visiting mentor homepage from the mentor name link", async () => {
        const longProfile = "这是一段用于测试默认折叠展示的导师画像内容。".repeat(10);
        const longPaperTitles = Array.from({ length: 12 }, (_, index) => `论文${index + 1}`);

        request.mockImplementation(async (url) => {
            const urlStr = String(url);

            if (urlStr === "/api/dataset/mentors/mine") {
                return { mentors: [] };
            }

            if (urlStr === "/api/search/mentors?keyword=%E6%B5%8B%E8%AF%95&search_mode=fuzzy") {
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
                    total: 1,
                    total_pages: 1,
                };
            }

            return {};
        });

        const view = renderWithStore();
        await waitForMineRequest();

        fireEvent.change(screen.getByPlaceholderText("输入导师姓名或研究方向"), {
            target: { value: "测试" },
        });
        fireEvent.click(screen.getByRole("button", { name: "搜索" }));

        await waitFor(() => {
            expect(screen.getByRole("heading", { name: "测试导师", level: 3 })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId("mentor-profile-toggle-88"));
        fireEvent.click(screen.getByTestId("mentor-paper-toggle-88"));

        await waitFor(() => {
            expect(screen.getByText(longProfile)).toBeInTheDocument();
            expect(screen.getByRole("button", { name: "论文12" })).toBeInTheDocument();
        });

        Object.defineProperty(window, "scrollY", {
            value: 320,
            writable: true,
            configurable: true,
        });
        fireEvent.scroll(window);
        const mentorSearchEntryKey = window.history.state.key;

        fireEvent.click(screen.getByRole("link", { name: "测试导师" }));

        await waitFor(() => {
            expect(mockPush).toHaveBeenCalledWith("/mentors/88");
        });

        act(() => {
            mockRouter.query = {
                keyword: "测试",
                mode: "mentor",
                search_mode: "fuzzy",
            };
            window.history.replaceState({ key: mentorSearchEntryKey }, "", "/search?keyword=%E6%B5%8B%E8%AF%95&mode=mentor&search_mode=fuzzy");
            view.unmount();
        });

        renderWithStore();

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/mentors?keyword=%E6%B5%8B%E8%AF%95&search_mode=fuzzy",
                "GET",
                true,
            );
        });
        await waitForSearchSkeletonsToFinish();

        await waitFor(() => {
            expect(window.scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 320, behavior: "auto" });
        });
        expect(screen.getByText(longProfile)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "论文12" })).toBeInTheDocument();
    });

    it("stores mentor homepage navigation return markers without overwriting the mentor result entry", async () => {
        const longProfile = "这是一段用于测试默认折叠展示的导师画像内容。".repeat(10);
        const longPaperTitles = Array.from({ length: 12 }, (_, index) => `论文${index + 1}`);

        request.mockImplementation(async (url) => {
            const urlStr = String(url);

            if (urlStr === "/api/dataset/mentors/mine") {
                return { mentors: [] };
            }

            if (urlStr === "/api/search/mentors?keyword=%E6%B5%8B%E8%AF%95&search_mode=fuzzy") {
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
                    total: 1,
                    total_pages: 1,
                };
            }

            return {};
        });

        renderWithStore();
        await waitForMineRequest();

        fireEvent.change(screen.getByPlaceholderText("输入导师姓名或研究方向"), {
            target: { value: "测试" },
        });
        fireEvent.click(screen.getByRole("button", { name: "搜索" }));

        await waitFor(() => {
            expect(screen.getByRole("heading", { name: "测试导师", level: 3 })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId("mentor-profile-toggle-88"));
        fireEvent.click(screen.getByTestId("mentor-paper-toggle-88"));

        await waitFor(() => {
            expect(screen.getByText(longProfile)).toBeInTheDocument();
            expect(screen.getByRole("button", { name: "论文12" })).toBeInTheDocument();
        });

        Object.defineProperty(window, "scrollY", {
            value: 215,
            writable: true,
            configurable: true,
        });
        fireEvent.scroll(window);

        const sourceEntryKey = window.history.state.key;
        fireEvent.click(screen.getByTestId("mentor-homepage-button-88"));

        await waitFor(() => {
            expect(mockPush).toHaveBeenCalledWith("/mentors/88");
        });

        const targetEntryKey = window.history.state.key;
        expect(targetEntryKey).not.toBe(sourceEntryKey);

        const sourceViewState = JSON.parse(window.sessionStorage.getItem(`search-view-state:${sourceEntryKey}`));
        expect(sourceViewState.scrollY).toBe(215);
        expect(sourceViewState.expandedProfileMentorIds).toEqual([88]);
        expect(sourceViewState.expandedPaperMentorIds).toEqual([88]);

        const returnMarker = JSON.parse(window.sessionStorage.getItem("search-mentor-return-marker"));
        expect(returnMarker).toMatchObject({
            mentorId: 88,
            sourceEntryKey,
            targetEntryKey,
            sourcePath: "/search",
        });
    });

    it("clicking a mentor author in paper result triggers exact mentor search", async () => {
        request.mockImplementation(async (url) => {
            if (url === "/api/dataset/mentors/mine") {
                return { mentors: [] };
            }

            if (String(url).startsWith("/api/search/papers")) {
                return {
                    papers: [{
                        id: 9,
                        title: "作者可点击测试",
                        abstract: "",
                        publish_date: "2025-12-12",
                        author_names: "李四,赵云",
                        subjects: "cs.AI",
                        arxiv_id: "2501.00009",
                        arxiv_url: "https://arxiv.org/abs/2501.00009",
                        mentorNames: ["李四"],
                        mentor_ids: [5, 0],
                    }],
                };
            }

            if (String(url).startsWith("/api/search/mentors?keyword=%E6%9D%8E%E5%9B%9B")) {
                return {
                    mentors: [{
                        id: 5,
                        Chinese_name: "李四",
                        research_direction: "AI",
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
                "/api/search/papers?keyword=&search_mode=fuzzy&sort_mode=default",
                "GET",
                true,
            );
        });

        // 点击显示的作者李四（数据库中存在的导师）
        await waitFor(() => {
            expect(screen.getByRole("heading", { name: "作者可点击测试" })).toBeInTheDocument();
        });

        expect(screen.getByText("赵云")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "赵云" })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /李四/ }));

        await waitFor(() => {
            expect(mockPush).toHaveBeenCalledWith(
                "/search?keyword=%E6%9D%8E%E5%9B%9B&mode=mentor&search_mode=exact",
                undefined,
                { shallow: true, scroll: false },
            );
        });

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/mentors?keyword=%E6%9D%8E%E5%9B%9B&search_mode=exact",
                "GET",
                true,
            );
        });
    });

    it("sends exact mode when toggled from the default fuzzy mode", async () => {
        renderWithStore();
        await waitForMineRequest();

        fireEvent.change(screen.getByPlaceholderText("输入导师姓名或研究方向"), {
            target: { value: "张" },
        });
        fireEvent.click(screen.getByRole("button", { name: "精确" }));

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/mentors?keyword=%E5%BC%A0&search_mode=exact",
                "GET",
                true,
            );
        });

        expect(mockPush).toHaveBeenCalledWith(
            "/search?keyword=%E5%BC%A0&mode=mentor&search_mode=exact",
            undefined,
            { shallow: true, scroll: false },
        );
    });

    it("auto loads all results when switching mode with empty keyword", async () => {
        request.mockImplementation(async (url) => {
            if (url === "/api/dataset/mentors/mine") {
                return { mentors: [] };
            }

            if (url === "/api/search/papers?keyword=&search_mode=fuzzy&sort_mode=default") {
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

            if (url === "/api/search/mentors?keyword=&search_mode=fuzzy") {
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
                "/api/search/papers?keyword=&search_mode=fuzzy&sort_mode=default",
                "GET",
                true,
            );
            expect(screen.getByRole("heading", { name: "All Papers" })).toBeInTheDocument();
        });
        expect(screen.queryByText("Showing 1 results for all")).not.toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Search in 1 entrys:" })).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "搜人" }));

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/mentors?keyword=&search_mode=fuzzy",
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
                "/api/search/papers?keyword=&search_mode=fuzzy&sort_mode=default",
                "GET",
                true,
            );
        });
        fireEvent.change(screen.getByPlaceholderText("输入论文题目、导师姓名或导师研究方向"), {
            target: { value: "机器学习" },
        });
        fireEvent.click(screen.getByRole("button", { name: "搜索" }));

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/papers?keyword=%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0&search_mode=fuzzy&sort_mode=default",
                "GET",
                true,
            );
        });

        fireEvent.click(screen.getByRole("button", { name: "最晚" }));

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/papers?keyword=%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0&search_mode=fuzzy&sort_mode=late",
                "GET",
                true,
            );
        });

        expect(mockPush).toHaveBeenCalledWith(
            "/search?keyword=%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0&mode=paper&search_mode=fuzzy&sort_mode=late",
            undefined,
            { shallow: true, scroll: false },
        );
    });

    it("supports mentor result pagination", async () => {
        request.mockImplementation(async (url) => {
            if (url === "/api/dataset/mentors/mine") {
                return { mentors: [] };
            }

            if (url === "/api/search/mentors?keyword=%E5%BC%A0&search_mode=fuzzy") {
                return {
                    page: 1,
                    total: 6,
                    total_pages: 6,
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

            if (url === "/api/search/mentors?keyword=%E5%BC%A0&search_mode=fuzzy&page=2") {
                return {
                    page: 2,
                    total: 6,
                    total_pages: 6,
                    has_previous: true,
                    has_next: true,
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
        fireEvent.click(screen.getByRole("button", { name: "搜索" }));

        await waitFor(() => {
            expect(screen.getByRole("heading", { name: "Showing 6 results for all: 张" })).toBeInTheDocument();
            expect(screen.getByRole("heading", { name: "张三", level: 3 })).toBeInTheDocument();
        });

        expect(screen.getByRole("link", { name: "张三" })).toHaveAttribute("href", "/mentors/1");
        expect(screen.queryByRole("button", { name: "查看导师主页" })).not.toBeInTheDocument();
        expect(document.querySelector('img.searchMentorMetaIcon[src="/Mentor_Profile.ico"]')).not.toBeNull();

        ["1", "2", "3", "4", "5"].forEach((pageLabel) => {
            expect(screen.getAllByRole("button", { name: pageLabel }).length).toBeGreaterThan(0);
        });

        fireEvent.click(screen.getAllByRole("button", { name: "下一页" })[0]);

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/mentors?keyword=%E5%BC%A0&search_mode=fuzzy&page=2",
                "GET",
                true,
            );
        });

        await waitFor(() => {
            expect(screen.getByRole("heading", { name: "Showing 6 results for all: 张" })).toBeInTheDocument();
            expect(screen.getByRole("heading", { name: "张六", level: 3 })).toBeInTheDocument();
        });

        expect(screen.getByRole("link", { name: "张六" })).toHaveAttribute("href", "/mentors/2");
        expect(screen.queryByRole("button", { name: "查看导师主页" })).not.toBeInTheDocument();

        expect(mockPush).toHaveBeenCalledWith(
            "/search?keyword=%E5%BC%A0&mode=mentor&search_mode=fuzzy&page=2",
            undefined,
            { shallow: true, scroll: false },
        );
    });

    it("clears keyword and auto searches when clicking clear button", async () => {
        renderWithStore();
        await waitForMineRequest();

        const input = screen.getByPlaceholderText("输入导师姓名或研究方向");
        fireEvent.change(input, { target: { value: "张三" } });
        expect(input).toHaveValue("张三");

        request.mockClear();

        fireEvent.click(screen.getByRole("button", { name: "清空" }));

        expect(input).toHaveValue("");

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/mentors?keyword=&search_mode=fuzzy",
                "GET",
                true,
            );
        });

        expect(screen.getByRole("heading", { name: "Search in 0 entrys:" })).toBeInTheDocument();
    });

    it("stores the full summary string in the title attribute for long keywords", async () => {
        const longKeyword = "超长搜索关键词".repeat(12);
        request.mockImplementation(async (url) => {
            if (url === "/api/dataset/mentors/mine") {
                return { mentors: [] };
            }

            if (String(url).startsWith("/api/search/mentors")) {
                return {
                    mentors: [{
                        id: 1,
                        Chinese_name: "长关键词导师",
                        research_direction: "测试",
                        email: "",
                        profile: "",
                        paperTitles: [],
                    }],
                    total: 1,
                    total_pages: 1,
                };
            }

            return {};
        });

        renderWithStore();
        await waitForMineRequest();

        fireEvent.change(screen.getByPlaceholderText("输入导师姓名或研究方向"), {
            target: { value: longKeyword },
        });
        fireEvent.click(screen.getByRole("button", { name: "搜索" }));

        const expectedSummary = `Showing 1 results for all: ${longKeyword}`;
        await waitFor(() => {
            expect(screen.getByRole("heading", { name: expectedSummary })).toHaveAttribute("title", expectedSummary);
        });
    });

    it("renders mentor skeletons while mentor search is pending", async () => {
        const mentorDeferred = createDeferred();
        request.mockImplementation(async (url) => {
            if (url === "/api/dataset/mentors/mine") {
                return { mentors: [] };
            }

            if (url === "/api/search/mentors?keyword=%E5%BC%A0%E4%B8%89&search_mode=fuzzy") {
                return mentorDeferred.promise;
            }

            if (String(url).startsWith("/api/search/mentors")) {
                return { mentors: [] };
            }

            return {};
        });

        renderWithStore();
        await waitForMineRequest();

        fireEvent.change(screen.getByPlaceholderText("输入导师姓名或研究方向"), {
            target: { value: "张三" },
        });
        fireEvent.click(screen.getByRole("button", { name: "搜索" }));

        expect(await screen.findByTestId("search-mentor-skeleton")).toBeInTheDocument();
        expect(screen.queryByText("未找到匹配的导师结果（当前为模糊搜索）。")).not.toBeInTheDocument();

        await act(async () => {
            mentorDeferred.resolve({
                mentors: [{
                    id: 1,
                    Chinese_name: "张三",
                    English_name: "Zhang San",
                    research_direction: "机器学习",
                    email: "zhangsan@example.com",
                    profile: "导师画像",
                    paperTitles: ["论文1"],
                }],
                total: 1,
                total_pages: 1,
            });
        });

        await waitFor(() => {
            expect(screen.queryByTestId("search-mentor-skeleton")).not.toBeInTheDocument();
        });
        expect(screen.getByRole("heading", { name: "张三", level: 3 })).toBeInTheDocument();
    });

    it("renders paper skeletons while paper search is pending", async () => {
        const paperDeferred = createDeferred();
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
                return paperDeferred.promise;
            }

            if (String(url).startsWith("/api/search/mentors")) {
                return { mentors: [] };
            }

            if (String(url).startsWith("/api/search/papers")) {
                return { papers: [] };
            }

            return {};
        });

        renderWithStore();
        await waitForMineRequest();

        expect(await screen.findByTestId("search-paper-skeleton")).toBeInTheDocument();
        expect(screen.queryByText("未找到匹配的论文结果（当前为模糊搜索）。")).not.toBeInTheDocument();

        await act(async () => {
            paperDeferred.resolve({
                papers: [{
                    id: 11,
                    title: "大模型论文",
                    abstract: "论文摘要。",
                    publish_date: "2026-01-01",
                    author_names: "张三",
                    subjects: "cs.CL",
                    mentorNames: ["张三"],
                }],
                total: 1,
                total_pages: 1,
            });
        });

        await waitFor(() => {
            expect(screen.queryByTestId("search-paper-skeleton")).not.toBeInTheDocument();
        });
        expect(screen.getByRole("heading", { name: "大模型论文" })).toBeInTheDocument();
    });

    it("replaces old mentor results with skeletons while paginating", async () => {
        const pageTwoDeferred = createDeferred();
        request.mockImplementation(async (url) => {
            if (url === "/api/dataset/mentors/mine") {
                return { mentors: [] };
            }

            if (url === "/api/search/mentors?keyword=%E5%BC%A0&search_mode=fuzzy") {
                return {
                    page: 1,
                    total: 2,
                    total_pages: 2,
                    has_previous: false,
                    has_next: true,
                    mentors: [{
                        id: 1,
                        Chinese_name: "第一页导师",
                        English_name: "",
                        research_direction: "机器学习",
                        email: "",
                        profile: "",
                        paperTitles: [],
                    }],
                };
            }

            if (url === "/api/search/mentors?keyword=%E5%BC%A0&search_mode=fuzzy&page=2") {
                return pageTwoDeferred.promise;
            }

            if (String(url).startsWith("/api/search/mentors")) {
                return { mentors: [] };
            }

            return {};
        });

        renderWithStore();
        await waitForMineRequest();

        fireEvent.change(screen.getByPlaceholderText("输入导师姓名或研究方向"), {
            target: { value: "张" },
        });
        fireEvent.click(screen.getByRole("button", { name: "搜索" }));

        await screen.findByRole("heading", { name: "第一页导师", level: 3 });
        fireEvent.click(screen.getAllByRole("button", { name: "下一页" })[0]);

        expect(await screen.findByTestId("search-mentor-skeleton")).toBeInTheDocument();
        expect(screen.getAllByRole("button", { name: "首页" }).length).toBeGreaterThan(0);
        expect(screen.getAllByRole("button", { name: "上一页" }).length).toBeGreaterThan(0);
        expect(screen.getAllByRole("button", { name: "下一页" }).length).toBeGreaterThan(0);
        expect(screen.getAllByRole("button", { name: "尾页" }).length).toBeGreaterThan(0);
        expect(screen.queryByRole("heading", { name: "第一页导师", level: 3 })).not.toBeInTheDocument();

        await act(async () => {
            pageTwoDeferred.resolve({
                page: 2,
                total: 2,
                total_pages: 2,
                has_previous: true,
                has_next: false,
                mentors: [{
                    id: 2,
                    Chinese_name: "第二页导师",
                    English_name: "",
                    research_direction: "自然语言处理",
                    email: "",
                    profile: "",
                    paperTitles: [],
                }],
            });
        });

        await waitFor(() => {
            expect(screen.queryByTestId("search-mentor-skeleton")).not.toBeInTheDocument();
        });
        expect(screen.getByRole("heading", { name: "第二页导师", level: 3 })).toBeInTheDocument();
    });
});
