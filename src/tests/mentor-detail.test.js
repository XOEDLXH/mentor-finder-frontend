import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { useRouter } from "next/router";

import authReducer from "../redux/auth";
import { request } from "../utils/network";
import MentorDetailPage from "../pages/mentors/[id]";

jest.mock("next/router", () => ({
    useRouter: jest.fn(),
}));

jest.mock("../utils/network", () => ({
    request: jest.fn(),
}));

describe("MentorDetailPage search return", () => {
    const mockPush = jest.fn();
    const mockBack = jest.fn();
    const mentor = {
        id: 88,
        Chinese_name: "测试导师",
        English_name: "Test Mentor",
        research_direction: "知识工程",
        email: "test@example.com",
        profile: "导师画像",
        is_private: false,
        paper_ids: [{
            id: 1,
            title: "Test Paper With Link",
            author_names: "测试导师",
            arxiv_id: "1234.5678",
            arxiv_url: "https://arxiv.org/abs/1234.5678",
        }, {
            id: 2,
            title: "Test Paper Without Link",
            author_names: "测试导师",
        }],
    };

    const renderWithStore = () => {
        const store = configureStore({
            reducer: {
                auth: authReducer,
            },
            preloadedState: {
                auth: {
                    name: "student_user",
                    token: "mock-token",
                    role: "student",
                },
            },
        });

        return render(
            <Provider store={store}>
                <MentorDetailPage />
            </Provider>,
        );
    };

    beforeEach(() => {
        mockPush.mockReset();
        mockBack.mockReset();
        request.mockReset();
        window.sessionStorage.clear();
        window.history.replaceState({ key: "mentor-entry-88" }, "", "/mentors/88");

        useRouter.mockReturnValue({
            push: mockPush,
            back: mockBack,
            query: { id: "88" },
        });

        request.mockImplementation(async (url, method) => {
            if (url === "/api/dataset/mentors/88" && method === "GET") {
                return { mentor };
            }

            if (url === "/api/follow/mentors" && method === "GET") {
                return { mentors: [] };
            }

            return {};
        });

        mockPush.mockImplementation(async () => true);
        mockBack.mockImplementation(async () => true);
    });

    it("uses router.back when returning to search with a valid search-origin marker", async () => {
        window.sessionStorage.setItem("search-mentor-return-marker", JSON.stringify({
            mentorId: 88,
            sourceEntryKey: "search-entry-1",
            targetEntryKey: "mentor-entry-88",
            sourcePath: "/search",
        }));

        renderWithStore();

        await screen.findByRole("heading", { name: "测试导师" });
        fireEvent.click(screen.getByRole("button", { name: "返回检索" }));

        await waitFor(() => {
            expect(mockBack).toHaveBeenCalledTimes(1);
        });
        expect(mockPush).not.toHaveBeenCalledWith("/search");
    });

    it("falls back to /search when no valid search-origin marker exists", async () => {
        renderWithStore();

        await screen.findByRole("heading", { name: "测试导师" });
        fireEvent.click(screen.getByRole("button", { name: "返回检索" }));

        await waitFor(() => {
            expect(mockPush).toHaveBeenCalledWith("/search");
        });
        expect(mockBack).not.toHaveBeenCalled();
    });

    it("renders related papers with arxiv links and plain-text fallback", async () => {
        renderWithStore();

        await screen.findByRole("heading", { name: "测试导师" });

        const sidebar = screen.getByRole("complementary", { name: "导师信息" });
        expect(within(sidebar).getByText("导师信息")).toBeInTheDocument();
        expect(within(sidebar).getByText("英文名")).toBeInTheDocument();
        expect(within(sidebar).getByText("研究方向")).toBeInTheDocument();
        expect(within(sidebar).getByText("邮箱")).toBeInTheDocument();
        expect(within(sidebar).getByText("Test Mentor")).toBeInTheDocument();
        expect(within(sidebar).getByText("知识工程")).toBeInTheDocument();
        expect(within(sidebar).getByText("test@example.com")).toBeInTheDocument();
        expect(sidebar.querySelector('img[src="/English_Name.ico"]')).not.toBeNull();
        expect(sidebar.querySelector('img[src="/Reseach_Direction.ico"]')).not.toBeNull();
        expect(sidebar.querySelector('img[src="/Email.ico"]')).not.toBeNull();

        expect(screen.queryByText("英文名：Test Mentor")).not.toBeInTheDocument();
        expect(screen.queryByText("研究方向：知识工程")).not.toBeInTheDocument();
        expect(screen.queryByText("邮箱：test@example.com")).not.toBeInTheDocument();

        expect(screen.getByText("相关论文：")).toBeInTheDocument();
        expect(screen.queryByText("关联论文：")).not.toBeInTheDocument();

        const linkedPaper = screen.getByRole("link", { name: /Test Paper With Link/ });
        expect(linkedPaper).toHaveAttribute("href", "https://arxiv.org/abs/1234.5678");
        expect(linkedPaper).toHaveAttribute("target", "_blank");
        expect(linkedPaper).toHaveAttribute("rel", "noreferrer");

        const linkedPaperIcon = linkedPaper.querySelector("img");
        expect(linkedPaperIcon).not.toBeNull();
        expect(linkedPaperIcon).toHaveAttribute("src", "/arxiv.ico");

        expect(screen.getByText("Test Paper Without Link")).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: /Test Paper Without Link/ })).not.toBeInTheDocument();
    });

    it("renders empty related-paper state when the mentor has no papers", async () => {
        request.mockImplementation(async (url, method) => {
            if (url === "/api/dataset/mentors/88" && method === "GET") {
                return {
                    mentor: {
                        ...mentor,
                        paper_ids: [],
                    },
                };
            }

            if (url === "/api/follow/mentors" && method === "GET") {
                return { mentors: [] };
            }

            return {};
        });

        renderWithStore();

        await screen.findByRole("heading", { name: "测试导师" });
        expect(screen.getByText("暂无相关论文")).toBeInTheDocument();
    });

    it("shows fallback text when the english name is missing in the sidebar", async () => {
        request.mockImplementation(async (url, method) => {
            if (url === "/api/dataset/mentors/88" && method === "GET") {
                return {
                    mentor: {
                        ...mentor,
                        English_name: "",
                    },
                };
            }

            if (url === "/api/follow/mentors" && method === "GET") {
                return { mentors: [] };
            }

            return {};
        });

        renderWithStore();

        await screen.findByRole("heading", { name: "测试导师" });
        const sidebar = screen.getByRole("complementary", { name: "导师信息" });
        expect(within(sidebar).getByText("暂无英文名")).toBeInTheDocument();
    });
});
