import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    const followedUser = {
        id: 21,
        username: "followed_user",
        realName: "关注用户",
        role: "student",
        signature: "我关注的人",
        followed: true,
    };
    const followedSubject = {
        subject: "cs.AI",
        subjectName: "人工智能",
        paperCount: 2,
        recentPapers: [],
    };
    const availableSubject = {
        subject: "cs.LG",
        subjectName: "机器学习",
        paperCount: 5,
        followed: false,
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
        jest.useRealTimers();
        mockPush.mockReset();
        request.mockReset();
        useRouter.mockReturnValue({
            push: mockPush,
            query: { id: "7" },
        });
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    const finishFollowSkeleton = async () => {
        await act(async () => {
            jest.advanceTimersByTime(800);
        });
    };

    it("loads only followed mentors on initial follows page entry", async () => {
        request.mockImplementation(async (url) => {
            if (url === "/api/follow/mentors") {
                return { mentors: [mentor] };
            }

            return {};
        });

        renderWithStore(<FollowsPage />);

        await screen.findByRole("heading", { name: "张三" });
        expect(request).toHaveBeenCalledWith("/api/follow/mentors", "GET", true);
        expect(request).not.toHaveBeenCalledWith("/api/follow/users", "GET", true);
        expect(request).not.toHaveBeenCalledWith("/api/follow/subjects", "GET", true);
        expect(request).not.toHaveBeenCalledWith("/api/follow/followers", "GET", true);
    });

    it("lazy loads followed users with a skeleton when the user tab is first opened", async () => {
        jest.useFakeTimers();
        const userDeferred = createDeferred();
        request.mockImplementation((url) => {
            if (url === "/api/follow/mentors") {
                return Promise.resolve({ mentors: [mentor] });
            }

            if (url === "/api/follow/users") {
                return userDeferred.promise;
            }

            return Promise.resolve({});
        });

        renderWithStore(<FollowsPage />);

        await finishFollowSkeleton();
        await screen.findByRole("heading", { name: "张三" });
        fireEvent.click(screen.getByRole("button", { name: "用户（0）" }));

        expect(await screen.findByTestId("follow-user-skeleton")).toBeInTheDocument();
        expect(request).toHaveBeenCalledWith("/api/follow/users", "GET", true);
        expect(request).not.toHaveBeenCalledWith("/api/follow/subjects", "GET", true);
        expect(request).not.toHaveBeenCalledWith("/api/follow/followers", "GET", true);

        await act(async () => {
            userDeferred.resolve({ users: [followedUser] });
        });

        expect(screen.getByTestId("follow-user-skeleton")).toBeInTheDocument();
        await finishFollowSkeleton();
        await screen.findByText("我关注的人");
        expect(screen.queryByTestId("follow-user-skeleton")).not.toBeInTheDocument();
    });

    it("lazy loads followed subjects with a skeleton when the subject tab is first opened", async () => {
        jest.useFakeTimers();
        const subjectDeferred = createDeferred();
        request.mockImplementation((url) => {
            if (url === "/api/follow/mentors") {
                return Promise.resolve({ mentors: [mentor] });
            }

            if (url === "/api/follow/subjects") {
                return subjectDeferred.promise;
            }

            return Promise.resolve({});
        });

        renderWithStore(<FollowsPage />);

        await finishFollowSkeleton();
        await screen.findByRole("heading", { name: "张三" });
        fireEvent.click(screen.getByRole("button", { name: "板块（0）" }));

        expect(await screen.findByTestId("follow-subject-skeleton")).toBeInTheDocument();
        expect(request).toHaveBeenCalledWith("/api/follow/subjects", "GET", true);
        expect(request).not.toHaveBeenCalledWith("/api/follow/users", "GET", true);
        expect(request).not.toHaveBeenCalledWith("/api/follow/followers", "GET", true);

        await act(async () => {
            subjectDeferred.resolve({
                subjects: [followedSubject],
                availableSubjects: [availableSubject],
            });
        });

        expect(screen.getByTestId("follow-subject-skeleton")).toBeInTheDocument();
        await finishFollowSkeleton();
        await screen.findByRole("heading", { name: "人工智能" });
        expect(screen.queryByTestId("follow-subject-skeleton")).not.toBeInTheDocument();
    });

    it("lazy loads followers with a skeleton when the fans view is first opened", async () => {
        jest.useFakeTimers();
        const followerDeferred = createDeferred();
        request.mockImplementation((url) => {
            if (url === "/api/follow/mentors") {
                return Promise.resolve({ mentors: [mentor] });
            }

            if (url === "/api/follow/followers") {
                return followerDeferred.promise;
            }

            return Promise.resolve({});
        });

        renderWithStore(<FollowsPage />);

        await finishFollowSkeleton();
        await screen.findByRole("heading", { name: "张三" });
        const viewSwitch = screen.getByRole("group", { name: "关注页面切换" });
        fireEvent.click(within(viewSwitch).getByRole("button", { name: /我的粉丝/ }));

        expect(await screen.findByTestId("follow-follower-skeleton")).toBeInTheDocument();
        expect(request).toHaveBeenCalledWith("/api/follow/followers", "GET", true);
        expect(request).not.toHaveBeenCalledWith("/api/follow/users", "GET", true);
        expect(request).not.toHaveBeenCalledWith("/api/follow/subjects", "GET", true);

        await act(async () => {
            followerDeferred.resolve({ users: [follower] });
        });

        expect(screen.getByTestId("follow-follower-skeleton")).toBeInTheDocument();
        await finishFollowSkeleton();
        await screen.findByRole("heading", { name: "粉丝用户" });
        expect(screen.queryByTestId("follow-follower-skeleton")).not.toBeInTheDocument();
    });

    it("does not refetch a lazily loaded tab when revisiting it", async () => {
        request.mockImplementation(async (url) => {
            if (url === "/api/follow/mentors") {
                return { mentors: [mentor] };
            }

            if (url === "/api/follow/users") {
                return { users: [followedUser] };
            }

            return {};
        });

        renderWithStore(<FollowsPage />);

        await screen.findByRole("heading", { name: "张三" });
        fireEvent.click(screen.getByRole("button", { name: "用户（0）" }));
        await screen.findByRole("heading", { name: "关注用户" });
        fireEvent.click(screen.getByRole("button", { name: "导师（1）" }));
        fireEvent.click(screen.getByRole("button", { name: "用户（1）" }));

        await waitFor(() => {
            const userRequests = request.mock.calls.filter(([url, method]) => (
                url === "/api/follow/users" && method === "GET"
            ));
            expect(userRequests).toHaveLength(1);
        });
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
        const mentorCardHeader = screen.getByTestId("mentor-card-header-7");
        expect(within(mentorCardHeader).getByRole("heading", { name: "张三" })).toBeInTheDocument();
        expect(within(mentorCardHeader).getByRole("button", { name: "已关注" })).toBeInTheDocument();

        const followButton = screen.getByRole("button", { name: "已关注" });
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
        fireEvent.click(screen.getByRole("button", { name: "已关注" }));

        await waitFor(() => {
            expect(screen.getByRole("button", { name: "关注" })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole("button", { name: "关注" }));

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith("/api/follow/mentors/7", "POST", true);
        });
        expect(screen.getByRole("button", { name: "已关注" })).toBeInTheDocument();
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
        const followButton = screen.getByRole("button", { name: "已关注" });
        fireEvent.click(followButton);

        expect(followButton).toBeDisabled();
        expect(within(followButton).getByText("已关注")).toBeInTheDocument();
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

        const viewSwitch = await screen.findByRole("group", { name: "关注页面切换" });
        fireEvent.click(within(viewSwitch).getByRole("button", { name: /我的粉丝/ }));

        expect(screen.getByRole("heading", { name: "我的粉丝" })).toBeInTheDocument();
        expect(await screen.findByRole("heading", { name: "粉丝用户" })).toBeInTheDocument();
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
            expect(screen.getByRole("button", { name: "已关注" })).toBeEnabled();
        });

        fireEvent.click(screen.getByRole("button", { name: "已关注" }));

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
            expect(screen.getByRole("button", { name: "已关注" })).toBeEnabled();
        });
    });

    it("paginates followed mentor cards at the bottom with 18 cards per page", async () => {
        const mentorList = Array.from({ length: 19 }, (_, index) => ({
            ...mentor,
            id: index + 1,
            Chinese_name: `导师${index + 1}`,
            English_name: `Mentor ${index + 1}`,
            email: `mentor${index + 1}@example.com`,
        }));

        request.mockImplementation(async (url) => {
            if (url === "/api/follow/mentors") {
                return { mentors: mentorList };
            }

            if (url === "/api/follow/users" || url === "/api/follow/followers") {
                return { users: [] };
            }

            return {};
        });

        renderWithStore(<FollowsPage />);

        await screen.findByRole("heading", { name: "导师1" });
        expect(screen.getAllByTestId(/mentor-card-header-/)).toHaveLength(18);
        expect(screen.queryByRole("heading", { name: "导师19" })).not.toBeInTheDocument();
        expect(screen.getAllByRole("button", { name: "跳转" })).toHaveLength(1);

        fireEvent.click(screen.getByRole("button", { name: "2" }));

        await screen.findByRole("heading", { name: "导师19" });
        expect(screen.getAllByTestId(/mentor-card-header-/)).toHaveLength(1);
        expect(screen.queryByRole("heading", { name: "导师1" })).not.toBeInTheDocument();
    });
});
