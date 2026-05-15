import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
        paper_ids: [],
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
});
