import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";

import ProfileSettingsPage from "../pages/profile-settings";
import { setAvatarUrl, setName, setToken } from "../redux/auth";
import { request } from "../utils/network";

jest.mock("next/router", () => ({
    useRouter: jest.fn(),
}));

jest.mock("react-redux", () => ({
    useDispatch: jest.fn(),
    useSelector: jest.fn(),
}));

jest.mock("../utils/network", () => ({
    request: jest.fn(),
    NetworkError: class NetworkError extends Error {},
    NetworkErrorType: {
        UNAUTHORIZED: "UNAUTHORIZED",
    },
}));

describe("ProfileSettingsPage", () => {
    const mockPush = jest.fn();
    const mockRouter = {
        push: mockPush,
    };
    const mockDispatch = jest.fn();
    const mockAuthState = {
        token: "jwt-token",
        name: "alice",
        userId: 42,
    };

    beforeEach(() => {
        mockPush.mockReset();
        mockDispatch.mockReset();
        useRouter.mockReturnValue(mockRouter);
        useDispatch.mockReturnValue(mockDispatch);
        useSelector.mockImplementation((selector) => selector({ auth: mockAuthState }));
        request.mockResolvedValue({
            profile: {
                avatarUrl: "",
                signature: "",
                showPersonalIntro: true,
                showResearchExperience: true,
                showHonors: true,
                showProjectExperience: true,
            },
        });
        globalThis.fetch = jest.fn();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("uploads a local avatar image and updates the preview", async () => {
        globalThis.fetch.mockResolvedValue({
            json: jest.fn().mockResolvedValue({
                code: 0,
                avatarUrl: "/media/avatars/user-42.png",
                profile: {
                    avatarUrl: "/media/avatars/user-42.png",
                    signature: "",
                    showPersonalIntro: true,
                    showResearchExperience: true,
                    showHonors: true,
                    showProjectExperience: true,
                },
            }),
        });

        render(<ProfileSettingsPage />);

        const input = await screen.findByLabelText("上传本地头像");
        const image = new File(["avatar"], "avatar.png", { type: "image/png" });
        fireEvent.change(input, { target: { files: [image] } });

        await waitFor(() => {
            expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        });

        expect(globalThis.fetch).toHaveBeenCalledWith("/api/profile/avatar", expect.objectContaining({
            method: "POST",
            headers: {
                Authorization: "Bearer jwt-token",
            },
        }));
        expect(await screen.findByAltText("头像预览")).toHaveAttribute(
            "src",
            "/media/avatars/user-42.png",
        );
        expect(mockDispatch).toHaveBeenCalledWith(setAvatarUrl("/media/avatars/user-42.png"));
        expect(screen.getByText("头像上传成功")).toBeInTheDocument();
    });

    it("rejects a non-image avatar file before upload", async () => {
        render(<ProfileSettingsPage />);

        const input = await screen.findByLabelText("上传本地头像");
        const textFile = new File(["not image"], "avatar.txt", { type: "text/plain" });
        fireEvent.change(input, { target: { files: [textFile] } });

        expect(screen.getByText("请选择图片文件作为头像")).toBeInTheDocument();
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("pre-fills the username input with the current username", async () => {
        render(<ProfileSettingsPage />);

        const usernameInput = await screen.findByLabelText("用户名");
        expect(usernameInput).toHaveValue("alice");
        expect(screen.getByRole("button", { name: "修改用户名" })).toBeDisabled();
    });

    it("updates the username and refreshes the stored credentials when available", async () => {
        globalThis.fetch.mockResolvedValue({
            json: jest.fn().mockResolvedValue({
                code: 0,
                username: "alice_new",
                token: "new-jwt-token",
            }),
        });

        render(<ProfileSettingsPage />);

        const usernameInput = await screen.findByLabelText("用户名");
        fireEvent.change(usernameInput, { target: { value: "alice_new" } });
        fireEvent.click(screen.getByRole("button", { name: "修改用户名" }));

        await waitFor(() => {
            expect(globalThis.fetch).toHaveBeenCalledWith("/api/profile/username", expect.objectContaining({
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: "Bearer jwt-token",
                },
                body: JSON.stringify({ username: "alice_new" }),
            }));
        });

        expect(mockDispatch).toHaveBeenCalledWith(setToken("new-jwt-token"));
        expect(mockDispatch).toHaveBeenCalledWith(setName("alice_new"));
        expect(await screen.findByText("用户名修改成功")).toBeInTheDocument();
    });

    it("shows a duplicate-username hint when the name is already taken", async () => {
        globalThis.fetch.mockResolvedValue({
            json: jest.fn().mockResolvedValue({
                code: 3,
                info: "Username already exists",
            }),
        });

        render(<ProfileSettingsPage />);

        const usernameInput = await screen.findByLabelText("用户名");
        fireEvent.change(usernameInput, { target: { value: "taken_name" } });
        fireEvent.click(screen.getByRole("button", { name: "修改用户名" }));

        expect(await screen.findByText("该用户名已被占用，请更换其他用户名")).toBeInTheDocument();
        expect(mockDispatch).not.toHaveBeenCalledWith(setName("taken_name"));
    });
});
