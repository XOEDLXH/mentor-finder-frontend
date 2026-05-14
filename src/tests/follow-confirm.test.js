import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { useRouter } from "next/router";

import authReducer from "../redux/auth";
import { request } from "../utils/network";
import FollowsPage from "../pages/follows";
import MentorDetailPage from "../pages/mentors/[id]";

jest.mock("next/router", () => ({
    useRouter: jest.fn(),
}));

jest.mock("../utils/network", () => ({
    request: jest.fn(),
}));

describe("follow confirmation", () => {
    const mockPush = jest.fn();
    const mentor = {
        id: 7,
        Chinese_name: "张三",
        English_name: "Zhang San",
        research_direction: "机器学习",
        email: "zhangsan@example.com",
        profile: "导师画像",
        is_private: false,
        paper_ids: [],
    };
    const follower = {
        id: 12,
        username: "fan_user",
        realName: "粉丝用户",
        role: "student",
        signature: "关注了我",
        followed: false,
    };

    const renderWithStore = (ui) => {
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

        render(<Provider store={store}>{ui}</Provider>);
    };

    beforeEach(() => {
        mockPush.mockReset();
        request.mockReset();
        useRouter.mockReturnValue({
            push: mockPush,
            query: { id: "7" },
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("shows direct unfollow buttons on follows page and updates card state without refetching the list", async () => {
        request.mockImplementation(async (url, method) => {
            if (url === "/api/follow/mentors/7" && method === "DELETE") {
                return { followed: false };
            }

            return { mentors: [mentor] };
        });

        renderWithStore(<FollowsPage />);

        await screen.findByRole("heading", { name: "张三" });
        expect(screen.getByRole("button", { name: "导师（1）" })).toBeInTheDocument();

        const followButton = screen.getByRole("button", { name: "取消关注" });
        fireEvent.click(followButton);

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith("/api/follow/mentors/7", "DELETE", true);
        });
        expect(screen.getByRole("button", { name: "关注" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "导师（0）" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "张三" })).toBeInTheDocument();
    });

    it("refollows a kept mentor card on follows page without reloading layout", async () => {
        request.mockImplementation(async (url, method) => {
            if (url === "/api/follow/mentors/7" && method === "DELETE") {
                return { followed: false };
            }

            if (url === "/api/follow/mentors/7" && method === "POST") {
                return { followed: true };
            }

            return { mentors: [mentor] };
        });

        renderWithStore(<FollowsPage />);

        await screen.findByRole("heading", { name: "张三" });
        fireEvent.click(screen.getByRole("button", { name: "取消关注" }));

        await waitFor(() => {
            expect(screen.getByRole("button", { name: "关注" })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole("button", { name: "关注" }));

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith("/api/follow/mentors/7", "POST", true);
        });
        expect(screen.getByRole("button", { name: "取消关注" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "导师（1）" })).toBeInTheDocument();
    });

    it("disables the follows page button and keeps its label while request is pending", async () => {
        let resolveFollow;
        request.mockImplementation((url, method) => {
            if (url === "/api/follow/mentors/7" && method === "DELETE") {
                return new Promise((resolve) => {
                    resolveFollow = resolve;
                });
            }

            return Promise.resolve({ mentors: [mentor] });
        });

        renderWithStore(<FollowsPage />);

        await screen.findByRole("heading", { name: "张三" });
        const followButton = screen.getByRole("button", { name: "取消关注" });
        fireEvent.click(followButton);

        expect(followButton).toBeDisabled();
        expect(within(followButton).getByText("取消关注")).toBeInTheDocument();
        expect(followButton.querySelector(".followToggleButtonOverlay")).not.toBeNull();

        resolveFollow?.({ followed: false });

        await waitFor(() => {
            expect(screen.getByRole("button", { name: "关注" })).toBeEnabled();
        });
    });

    it("shows followers in the fans tab", async () => {
        request.mockImplementation(async (url) => {
            if (url === "/api/follow/mentors") {
                return { mentors: [] };
            }

            if (url === "/api/follow/users") {
                return { users: [] };
            }

            if (url === "/api/follow/followers") {
                return { users: [follower] };
            }

            return {};
        });

        renderWithStore(<FollowsPage />);

        await screen.findByRole("button", { name: "我的粉丝 1" });
        fireEvent.click(screen.getByRole("button", { name: "我的粉丝 1" }));

        expect(screen.getByRole("heading", { name: "我的粉丝" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "粉丝用户" })).toBeInTheDocument();
        expect(screen.getByText("关注了我")).toBeInTheDocument();
        expect(request).toHaveBeenCalledWith("/api/follow/followers", "GET", true);
    });

    it("directly unfollows from mentor detail page without confirmation", async () => {
        request.mockImplementation(async (url, method) => {
            if (url === "/api/dataset/mentors/7") {
                return { mentor };
            }

            if (url === "/api/follow/mentors" && method === "GET") {
                return { mentors: [mentor] };
            }

            if (url === "/api/follow/mentors/7" && method === "DELETE") {
                return { followed: false };
            }

            return {};
        });

        renderWithStore(<MentorDetailPage />);

        await screen.findByRole("heading", { name: "张三" });
        await waitFor(() => {
            expect(screen.getByRole("button", { name: "取消关注" })).toBeEnabled();
        });

        fireEvent.click(screen.getByRole("button", { name: "取消关注" }));

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith("/api/follow/mentors/7", "DELETE", true);
        });
        expect(screen.getByRole("button", { name: "关注" })).toBeInTheDocument();
    });

    it("shows loading overlay state while follow request is pending on mentor detail page", async () => {
        let resolveFollow;
        request.mockImplementation((url, method) => {
            if (url === "/api/dataset/mentors/7") {
                return Promise.resolve({ mentor });
            }

            if (url === "/api/follow/mentors" && method === "GET") {
                return Promise.resolve({ mentors: [] });
            }

            if (url === "/api/follow/mentors/7" && method === "POST") {
                return new Promise((resolve) => {
                    resolveFollow = resolve;
                });
            }

            return Promise.resolve({});
        });

        renderWithStore(<MentorDetailPage />);

        await screen.findByRole("heading", { name: "张三" });
        const followButton = await screen.findByRole("button", { name: "关注" });

        fireEvent.click(followButton);

        expect(followButton).toBeDisabled();
        expect(within(followButton).getByText("关注")).toBeInTheDocument();
        expect(followButton.querySelector(".followToggleButtonOverlay")).not.toBeNull();

        resolveFollow?.({ followed: true });

        await waitFor(() => {
            expect(screen.getByRole("button", { name: "取消关注" })).toBeEnabled();
        });
    });
});
