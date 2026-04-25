import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { useRouter } from "next/router";

import authReducer from "../redux/auth";
import { request } from "../utils/network";
import AdminUsersPage from "../pages/admin-users";

jest.mock("next/router", () => ({
    useRouter: jest.fn(),
}));

jest.mock("../utils/network", () => ({
    request: jest.fn(),
    NetworkError: class MockNetworkError extends Error {},
    NetworkErrorType: {
        UNAUTHORIZED: 0,
        REJECTED: 1,
        CORRUPTED_RESPONSE: 2,
        UNKNOWN_ERROR: 3,
    },
}));

describe("AdminUsersPage", () => {
    const mockPush = jest.fn();

    const renderWithStore = (role = "admin") => {
        const store = configureStore({
            reducer: {
                auth: authReducer,
            },
            preloadedState: {
                auth: {
                    name: "admin_user",
                    token: "mock-token",
                    role,
                },
            },
        });

        render(
            <Provider store={store}>
                <AdminUsersPage />
            </Provider>,
        );
    };

    beforeEach(() => {
        mockPush.mockReset();
        request.mockReset();
        useRouter.mockReturnValue({
            push: mockPush,
        });

        request.mockImplementation(async (url) => {
            if (String(url).startsWith("/api/management/users")) {
                return {
                    currentUserId: 1,
                    users: [{
                        id: 1,
                        username: "admin_user",
                        email: "admin@example.com",
                        role: "admin",
                        isBoundToMentor: false,
                        mentorProfile: null,
                    }, {
                        id: 2,
                        username: "student_user",
                        email: "student@example.com",
                        role: "student",
                        isBoundToMentor: false,
                        mentorProfile: null,
                    }],
                };
            }

            if (String(url).startsWith("/api/search/mentors")) {
                return {
                    mentors: [{
                        id: 101,
                        Chinese_name: "张三",
                        English_name: "Zhang San",
                        research_direction: "机器学习",
                        email: "zhangsan@example.com",
                        profile: "公共导师",
                        paperTitles: [],
                        is_private: false,
                    }],
                };
            }

            return {};
        });
    });

    it("blocks non-admin users from viewing the page", () => {
        renderWithStore("student");

        expect(screen.getByText("仅管理员可以访问该页面。")).toBeInTheDocument();
    });

    it("loads users for admin and can search public mentors", async () => {
        renderWithStore("admin");

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith("/api/management/users", "GET", true);
        });

        expect(screen.getByText("student_user")).toBeInTheDocument();

        fireEvent.change(screen.getByPlaceholderText("搜索公共导师，便于绑定 mentor 角色"), {
            target: { value: "张三" },
        });
        fireEvent.click(screen.getByRole("button", { name: "搜索导师" }));

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/mentors?keyword=%E5%BC%A0%E4%B8%89&search_mode=fuzzy",
                "GET",
                true,
            );
        });

        expect(screen.getByText(/ID: 101/)).toBeInTheDocument();
    });

    it("sends keyword when searching users", async () => {
        renderWithStore("admin");

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith("/api/management/users", "GET", true);
        });

        fireEvent.change(screen.getByPlaceholderText("按用户名、邮箱或真实姓名搜索"), {
            target: { value: "student@example.com" },
        });
        fireEvent.click(screen.getByRole("button", { name: "搜索用户" }));

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/management/users?keyword=student%40example.com",
                "GET",
                true,
            );
        });
    });

    it("sends role filter when filtering users", async () => {
        renderWithStore("admin");

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith("/api/management/users", "GET", true);
        });

        fireEvent.change(screen.getByDisplayValue("全部角色"), {
            target: { value: "banned" },
        });
        fireEvent.click(screen.getByRole("button", { name: "搜索用户" }));

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/management/users?role=banned",
                "GET",
                true,
            );
        });
    });
});
