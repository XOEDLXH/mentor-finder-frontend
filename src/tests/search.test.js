import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

    const mockPrivateMentor2 = {
        id: 102,
        Chinese_name: "赵六",
        English_name: "Zhao Liu",
        research_direction: "数据库系统",
        email: "zhaoliu@example.com",
        profile: "私有导师测试数据2",
        is_private: true,
        paper_ids: [],
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

        useRouter.mockReturnValue({
            push: mockPush,
        });
    });

    it("shows admin operation panel only for admin role", async () => {
        renderWithStore("alice", "admin");
        await waitForMineRequest();

        expect(screen.getByRole("heading", { name: "管理员操作" })).toBeInTheDocument();
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

        fireEvent.change(screen.getByPlaceholderText("输入导师姓名"), {
            target: { value: "张三" },
        });
        fireEvent.click(screen.getByRole("button", { name: "搜索" }));

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/mentors?keyword=%E5%BC%A0%E4%B8%89",
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
                        mentorNames: ["李四", "张三"],
                    }],
                };
            }

            return {};
        });

        renderWithStore();
        await waitForMineRequest();

        fireEvent.click(screen.getByRole("button", { name: "搜论文" }));
        fireEvent.change(screen.getByPlaceholderText("输入论文题目、研究方向或导师姓名"), {
            target: { value: "李四" },
        });
        fireEvent.click(screen.getByRole("button", { name: "搜索" }));

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/papers?keyword=%E6%9D%8E%E5%9B%9B",
                "GET",
                true,
            );
        });

        expect(screen.getByRole("heading", { name: "大语言模型在问答系统中的应用" })).toBeInTheDocument();
        expect(screen.getByText("发表日期：2024-06-15")).toBeInTheDocument();
        expect(screen.getByText("导师：李四、张三")).toBeInTheDocument();
        expect(screen.getByText("摘要：本文介绍大语言模型在智能问答中的实践。")).toBeInTheDocument();
        expect(screen.queryByText("作者：李四,张三")).not.toBeInTheDocument();
    });

    it("renders private mentor list from mine api", async () => {
        request.mockImplementation(async (url) => {
            if (url === "/api/dataset/mentors/mine") {
                return { mentors: [mockPrivateMentor] };
            }

            return {};
        });

        renderWithStore();
        await waitForMineRequest();

        expect(await screen.findByText("王五")).toBeInTheDocument();
        expect(screen.getByText("私有")).toBeInTheDocument();
        expect(screen.getByText("RL Paper")).toBeInTheDocument();
    });

    it("sends add private mentor request", async () => {
        request.mockImplementation(async (url, method) => {
            if (url === "/api/dataset/mentors/mine") {
                return { mentors: [] };
            }

            if (url === "/api/dataset/mentors/custom" && method === "POST") {
                return {
                    mentor: {
                        ...mockPrivateMentor,
                    },
                };
            }

            return {};
        });

        renderWithStore();
        await waitForMineRequest();

        fireEvent.change(screen.getByPlaceholderText("导师中文名（可选）"), {
            target: { value: "王五" },
        });
        await waitFor(() => {
            expect(screen.getByRole("button", { name: "添加私有导师" })).toBeEnabled();
        });
        fireEvent.click(screen.getByRole("button", { name: "添加私有导师" }));

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/dataset/mentors/custom",
                "POST",
                true,
                {
                    Chinese_name: "王五",
                    English_name: "",
                },
            );
        });

        await waitFor(() => {
            expect(screen.getByPlaceholderText("导师中文名（可选）")).toHaveValue("");
        });
    });

    it("filters private mentor list by keyword", async () => {
        request.mockImplementation(async (url) => {
            if (url === "/api/dataset/mentors/mine") {
                return { mentors: [mockPrivateMentor, mockPrivateMentor2] };
            }

            return {};
        });

        renderWithStore();
        await waitForMineRequest();

        expect(screen.getByText("王五")).toBeInTheDocument();
        expect(screen.getByText("赵六")).toBeInTheDocument();

        fireEvent.change(screen.getByPlaceholderText("筛选我的私有导师（姓名/方向）"), {
            target: { value: "强化" },
        });

        expect(screen.getByText("王五")).toBeInTheDocument();
        expect(screen.queryByText("赵六")).not.toBeInTheDocument();
    });

    it("deletes private mentor from private panel", async () => {
        const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
        let deleted = false;

        request.mockImplementation(async (url, method) => {
            if (url === "/api/dataset/mentors/mine") {
                return { mentors: deleted ? [] : [mockPrivateMentor] };
            }

            if (url === "/api/dataset/mentors/101" && method === "DELETE") {
                deleted = true;
                return {};
            }

            return {};
        });

        renderWithStore();
        await waitForMineRequest();

        expect(screen.getByText("王五")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "删除私有导师" }));

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/dataset/mentors/101",
                "DELETE",
                true,
            );
        });

        await waitFor(() => {
            expect(screen.queryByText("王五")).not.toBeInTheDocument();
            expect(screen.getByText("私有导师删除成功")).toBeInTheDocument();
        });

        confirmSpy.mockRestore();
    });

    it("searches private mentor by quick action", async () => {
        request.mockImplementation(async (url) => {
            if (url === "/api/dataset/mentors/mine") {
                return { mentors: [mockPrivateMentor] };
            }

            if (url === "/api/search/mentors?keyword=%E7%8E%8B%E4%BA%94") {
                return {
                    mentors: [{
                        id: 101,
                        Chinese_name: "王五",
                        English_name: "Wang Wu",
                        research_direction: "强化学习",
                        email: "wangwu@example.com",
                        profile: "私有导师测试数据",
                        paperTitles: ["RL Paper"],
                    }],
                };
            }

            return {};
        });

        renderWithStore();
        await waitForMineRequest();

        fireEvent.click(screen.getByRole("button", { name: "搜索该导师" }));

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/mentors?keyword=%E7%8E%8B%E4%BA%94",
                "GET",
                true,
            );
        });

        expect(screen.getByDisplayValue("王五")).toBeInTheDocument();
        expect(screen.getAllByText("我的私有导师").length).toBeGreaterThan(0);
    });

    it("filters and sorts private mentors by category and rule", async () => {
        request.mockImplementation(async (url) => {
            if (url === "/api/dataset/mentors/mine") {
                return { mentors: [mockPrivateMentor, mockPrivateMentor2] };
            }

            return {};
        });

        renderWithStore();
        await waitForMineRequest();

        fireEvent.change(screen.getByLabelText("私有导师分类"), {
            target: { value: "withPapers" },
        });

        await waitFor(() => {
            expect(screen.getByText("王五")).toBeInTheDocument();
            expect(screen.queryByText("赵六")).not.toBeInTheDocument();
        });

        fireEvent.change(screen.getByLabelText("私有导师分类"), {
            target: { value: "all" },
        });

        fireEvent.change(screen.getByLabelText("私有导师排序"), {
            target: { value: "paperCountDesc" },
        });

        await waitFor(() => {
            const mentorHeadings = screen.getAllByRole("heading", { level: 4 });
            expect(mentorHeadings[0]).toHaveTextContent("王五");
        });
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

        fireEvent.change(screen.getByPlaceholderText("输入导师姓名"), {
            target: { value: "导师" },
        });
        fireEvent.click(screen.getByRole("button", { name: "搜索" }));

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
});
