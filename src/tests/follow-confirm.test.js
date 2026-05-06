import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

    it("does not unfollow from follows page when confirmation is canceled", async () => {
        request.mockResolvedValue({ mentors: [mentor] });
        jest.spyOn(globalThis, "confirm").mockReturnValue(false);

        renderWithStore(<FollowsPage />);

        await screen.findByRole("heading", { name: "张三" });
        fireEvent.click(screen.getByRole("button", { name: "张三更多操作" }));
        fireEvent.click(screen.getByRole("button", { name: "取消关注" }));

        expect(globalThis.confirm).toHaveBeenCalledWith("确定要取消关注张三吗？");
        expect(request).not.toHaveBeenCalledWith("/api/follow/mentors/7", "DELETE", true);
    });

    it("unfollows from follows page after confirmation", async () => {
        request.mockImplementation(async (url, method) => {
            if (url === "/api/follow/mentors/7" && method === "DELETE") {
                return { followed: false };
            }

            return { mentors: [mentor] };
        });
        jest.spyOn(globalThis, "confirm").mockReturnValue(true);

        renderWithStore(<FollowsPage />);

        await screen.findByRole("heading", { name: "张三" });
        fireEvent.click(screen.getByRole("button", { name: "张三更多操作" }));
        fireEvent.click(screen.getByRole("button", { name: "取消关注" }));

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith("/api/follow/mentors/7", "DELETE", true);
        });
    });

    it("does not unfollow from mentor detail page when confirmation is canceled", async () => {
        request.mockImplementation(async (url) => {
            if (url === "/api/dataset/mentors/7") {
                return { mentor };
            }

            if (url === "/api/follow/mentors") {
                return { mentors: [mentor] };
            }

            return {};
        });
        jest.spyOn(globalThis, "confirm").mockReturnValue(false);

        renderWithStore(<MentorDetailPage />);

        await screen.findByRole("heading", { name: "张三" });
        await waitFor(() => {
            expect(screen.getByRole("button", { name: "取消关注" })).toBeInTheDocument();
        });
        fireEvent.click(screen.getByRole("button", { name: "取消关注" }));

        expect(globalThis.confirm).toHaveBeenCalledWith("确定要取消关注张三吗？");
        expect(request).not.toHaveBeenCalledWith("/api/follow/mentors/7", "DELETE", true);
    });

    it("unfollows from mentor detail page after confirmation", async () => {
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
        jest.spyOn(globalThis, "confirm").mockReturnValue(true);

        renderWithStore(<MentorDetailPage />);

        await screen.findByRole("heading", { name: "张三" });
        await waitFor(() => {
            expect(screen.getByRole("button", { name: "取消关注" })).toBeInTheDocument();
        });
        fireEvent.click(screen.getByRole("button", { name: "取消关注" }));

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith("/api/follow/mentors/7", "DELETE", true);
        });
    });
});
