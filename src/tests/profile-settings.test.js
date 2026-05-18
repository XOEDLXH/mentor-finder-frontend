import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";

import ProfileSettingsPage from "../pages/profile-settings";
import { setAvatarUrl } from "../redux/auth";
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
});
