import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRouter } from "next/router";
import { Provider } from "react-redux";

import UserHomePage from "../pages/user-home";
import authReducer from "../redux/auth";
import { request } from "../utils/network";

jest.mock("next/router", () => ({
    useRouter: jest.fn(),
}));

jest.mock("../utils/network", () => ({
    request: jest.fn(),
    NetworkError: class NetworkError extends Error {},
    NetworkErrorType: {
        UNAUTHORIZED: 0,
    },
}));

const renderWithAuth = (auth = { token: "mock-token", name: "alice", role: "student" }) => {
    const store = configureStore({
        reducer: {
            auth: authReducer,
        },
        preloadedState: {
            auth,
        },
    });

    return render(
        <Provider store={store}>
            <UserHomePage />
        </Provider>,
    );
};

describe("UserHomePage", () => {
    const mockPush = jest.fn();

    beforeEach(() => {
        mockPush.mockReset();
        request.mockReset();
        useRouter.mockReturnValue({
            push: mockPush,
        });
    });

    it("shows the current user's profile experiences", async () => {
        request.mockResolvedValue({
            profile: {
                avatarUrl: "https://example.com/avatar.png",
                signature: "保持好奇",
                personalIntro: "关注人机交互与数据挖掘",
                researchExperience: "参与知识图谱实验室课题",
                honors: "国家奖学金",
                projectExperience: "导师匹配系统前端开发",
                showPersonalIntro: true,
                showResearchExperience: true,
                showHonors: false,
                showProjectExperience: true,
                updatedAt: "2026-05-09 12:00",
            },
        });

        renderWithAuth();

        expect(request).toHaveBeenCalledWith("/api/profile/me", "GET", true);

        await waitFor(() => {
            expect(screen.getByRole("img", { name: "用户头像" })).toHaveAttribute("src", "https://example.com/avatar.png");
            expect(screen.getByText("保持好奇")).toBeInTheDocument();
            expect(screen.getByText("关注人机交互与数据挖掘")).toBeInTheDocument();
            expect(screen.getByText("参与知识图谱实验室课题")).toBeInTheDocument();
            expect(screen.getByText("导师匹配系统前端开发")).toBeInTheDocument();
        });

        expect(screen.queryByText("国家奖学金")).not.toBeInTheDocument();
        expect(screen.getByText("最近更新：2026-05-09 12:00")).toBeInTheDocument();
    });

    it("navigates to profile settings page from settings", async () => {
        request.mockResolvedValue({ profile: {} });

        renderWithAuth();

        await waitFor(() => {
            expect(screen.getAllByText("暂无填写")).toHaveLength(4);
        });

        fireEvent.click(screen.getByRole("button", { name: "个人设置" }));

        expect(mockPush).toHaveBeenCalledWith("/profile-settings");
    });
});
