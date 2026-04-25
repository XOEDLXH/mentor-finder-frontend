import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRouter } from "next/router";
import { useDispatch } from "react-redux";
import {
    LOGIN_FAILED,
    LOGIN_SUCCESS_PREFIX,
    REGISTER_EMAIL_INVALID,
    REGISTER_PASSWORD_MISMATCH,
    REGISTER_PASSWORD_WEAK,
    REGISTER_SUCCESS_PREFIX,
    REGISTER_USERNAME_INVALID,
} from "../constants/string";
import LoginScreen from "../pages/login";
import RegisterScreen from "../pages/register";
import authReducer, { resetAuth, setName, setRole, setToken } from "../redux/auth";

jest.mock("next/router", () => ({
    useRouter: jest.fn(),
}));

jest.mock("react-redux", () => ({
    useDispatch: jest.fn(),
}));

describe("auth reducer", () => {
    it("returns initial state for unknown action", () => {
        const state = authReducer(undefined, { type: "unknown/action" });

        expect(state).toEqual({
            token: "",
            name: "",
            role: "",
        });
    });

    it("sets token and user name", () => {
        let state = authReducer(undefined, { type: "unknown/action" });

        state = authReducer(state, setToken("jwt-token"));
        state = authReducer(state, setName("alice"));
        state = authReducer(state, setRole("student"));

        expect(state).toEqual({
            token: "jwt-token",
            name: "alice",
            role: "student",
        });
    });

    it("resets auth state", () => {
        const stateWithAuth = {
            token: "jwt-token",
            name: "alice",
            role: "admin",
        };

        const state = authReducer(stateWithAuth, resetAuth());

        expect(state).toEqual({
            token: "",
            name: "",
            role: "",
        });
    });
});

describe("LoginScreen", () => {
    const mockPush = jest.fn();
    const mockDispatch = jest.fn();

    beforeEach(() => {
        mockPush.mockReset();
        mockDispatch.mockReset();

        useRouter.mockReturnValue({
            push: mockPush,
        });
        useDispatch.mockReturnValue(mockDispatch);

        globalThis.fetch = jest.fn();
        jest.spyOn(globalThis, "alert").mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("dispatches auth info and navigates home when login succeeds", async () => {
        globalThis.fetch.mockResolvedValue({
            json: jest.fn().mockResolvedValue({ code: 0, token: "jwt-token", role: "admin" }),
        });

        render(<LoginScreen />);

        fireEvent.change(screen.getByPlaceholderText("用户名"), { target: { value: "alice" } });
        fireEvent.change(screen.getByPlaceholderText("密码"), { target: { value: "abc12345" } });
        fireEvent.click(screen.getByRole("button", { name: "登录" }));

        await waitFor(() => {
            expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        });

        expect(globalThis.fetch).toHaveBeenCalledWith("/api/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                username: "alice",
                password: "abc12345",
            }),
        });

        await waitFor(() => {
            expect(mockDispatch).toHaveBeenCalledWith(setToken("jwt-token"));
            expect(mockDispatch).toHaveBeenCalledWith(setRole("admin"));
            expect(mockDispatch).toHaveBeenCalledWith(setName("alice"));
            expect(globalThis.alert).toHaveBeenCalledWith(LOGIN_SUCCESS_PREFIX + "alice");
            expect(mockPush).toHaveBeenCalledWith("/");
        });
    });

    it("alerts failure and stays on page when login fails", async () => {
        globalThis.fetch.mockResolvedValue({
            json: jest.fn().mockResolvedValue({ code: 1 }),
        });

        render(<LoginScreen />);

        fireEvent.change(screen.getByPlaceholderText("用户名"), { target: { value: "alice" } });
        fireEvent.change(screen.getByPlaceholderText("密码"), { target: { value: "abc12345" } });
        fireEvent.click(screen.getByRole("button", { name: "登录" }));

        await waitFor(() => {
            expect(globalThis.alert).toHaveBeenCalledWith(LOGIN_FAILED);
        });

        expect(mockPush).not.toHaveBeenCalled();
    });

    it("shows backend ban message when login is rejected for banned user", async () => {
        globalThis.fetch.mockResolvedValue({
            json: jest.fn().mockResolvedValue({ code: 3, info: "User is banned" }),
        });

        render(<LoginScreen />);

        fireEvent.change(screen.getByPlaceholderText("用户名"), { target: { value: "banned_user" } });
        fireEvent.change(screen.getByPlaceholderText("密码"), { target: { value: "abc12345" } });
        fireEvent.click(screen.getByRole("button", { name: "登录" }));

        await waitFor(() => {
            expect(globalThis.alert).toHaveBeenCalledWith("User is banned");
        });

        expect(mockPush).not.toHaveBeenCalled();
    });

    it("navigates to register page when clicking secondary button", () => {
        render(<LoginScreen />);

        fireEvent.click(screen.getByRole("button", { name: "前往注册页面" }));

        expect(mockPush).toHaveBeenCalledWith("/register");
    });

    it("navigates to home page when clicking back-home button", () => {
        render(<LoginScreen />);

        fireEvent.click(screen.getByRole("button", { name: "返回首页" }));

        expect(mockPush).toHaveBeenCalledWith("/");
    });
});

describe("RegisterScreen", () => {
    const mockPush = jest.fn();
    const mockDispatch = jest.fn();

    beforeEach(() => {
        mockPush.mockReset();
        mockDispatch.mockReset();

        useRouter.mockReturnValue({
            push: mockPush,
        });
        useDispatch.mockReturnValue(mockDispatch);

        globalThis.fetch = jest.fn();
        jest.spyOn(globalThis, "alert").mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("shows weak-password hint after password input is blurred", () => {
        render(<RegisterScreen />);

        const passwordInput = screen.getByPlaceholderText("密码");

        fireEvent.change(passwordInput, { target: { value: "abc12" } });
        expect(screen.queryByText(REGISTER_PASSWORD_WEAK)).not.toBeInTheDocument();

        fireEvent.blur(passwordInput);

        expect(screen.getByText(REGISTER_PASSWORD_WEAK)).toBeInTheDocument();
    });

    it("prioritizes mismatch hint over weak-password hint", () => {
        render(<RegisterScreen />);

        const passwordInput = screen.getByPlaceholderText("密码");
        const confirmPasswordInput = screen.getByPlaceholderText("确认密码");

        fireEvent.change(passwordInput, { target: { value: "abc12" } });
        fireEvent.blur(passwordInput);

        fireEvent.change(confirmPasswordInput, { target: { value: "zzz" } });
        fireEvent.blur(confirmPasswordInput);

        expect(screen.getByText(REGISTER_PASSWORD_MISMATCH)).toBeInTheDocument();
        expect(screen.queryByText(REGISTER_PASSWORD_WEAK)).not.toBeInTheDocument();
    });

    it("shows invalid-email hint after email input is blurred", () => {
        render(<RegisterScreen />);

        const emailInput = screen.getByPlaceholderText("邮箱");

        fireEvent.change(emailInput, { target: { value: "invalid" } });
        fireEvent.blur(emailInput);

        expect(screen.getByText(REGISTER_EMAIL_INVALID)).toBeInTheDocument();
    });

    it("shows invalid-username hint after username input is blurred", () => {
        render(<RegisterScreen />);

        const usernameInput = screen.getByPlaceholderText("用户名");

        fireEvent.change(usernameInput, { target: { value: "bad user!" } });
        fireEvent.blur(usernameInput);

        expect(screen.getByText(REGISTER_USERNAME_INVALID)).toBeInTheDocument();
    });

    it("dispatches auth info and navigates home when register succeeds", async () => {
        globalThis.fetch.mockResolvedValue({
            json: jest.fn().mockResolvedValue({ code: 0, token: "register-token", role: "student" }),
        });

        render(<RegisterScreen />);

        fireEvent.change(screen.getByPlaceholderText("用户名"), { target: { value: " alice " } });
        fireEvent.change(screen.getByPlaceholderText("密码"), { target: { value: "abc12345" } });
        fireEvent.change(screen.getByPlaceholderText("确认密码"), { target: { value: "abc12345" } });
        fireEvent.change(screen.getByPlaceholderText("邮箱"), { target: { value: "alice@example.com" } });

        fireEvent.click(screen.getByRole("button", { name: "注册" }));

        await waitFor(() => {
            expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        });

        expect(globalThis.fetch).toHaveBeenCalledWith("/api/register", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                username: "alice",
                password: "abc12345",
                email: "alice@example.com",
            }),
        });

        await waitFor(() => {
            expect(mockDispatch).toHaveBeenCalledWith(setToken("register-token"));
            expect(mockDispatch).toHaveBeenCalledWith(setRole("student"));
            expect(mockDispatch).toHaveBeenCalledWith(setName("alice"));
            expect(globalThis.alert).toHaveBeenCalledWith(REGISTER_SUCCESS_PREFIX + "alice");
            expect(mockPush).toHaveBeenCalledWith("/");
        });
    });

    it("navigates to login page when clicking secondary button", () => {
        render(<RegisterScreen />);

        fireEvent.click(screen.getByRole("button", { name: "前往登录页面" }));

        expect(mockPush).toHaveBeenCalledWith("/login");
    });

    it("navigates to home page when clicking back-home button", () => {
        render(<RegisterScreen />);

        fireEvent.click(screen.getByRole("button", { name: "返回首页" }));

        expect(mockPush).toHaveBeenCalledWith("/");
    });
});
