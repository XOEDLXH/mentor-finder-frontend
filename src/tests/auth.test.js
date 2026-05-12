import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRouter } from "next/router";
import { useDispatch } from "react-redux";
import {
    LOGIN_FAILED,
    LOGIN_SUCCESS_PREFIX,
    REGISTER_EMAIL_INVALID,
    REGISTER_PASSWORD_MISMATCH,
    REGISTER_PASSWORD_WEAK,
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
    const mockRouter = {
        push: mockPush,
        query: {},
    };

    beforeEach(() => {
        mockPush.mockReset();
        mockDispatch.mockReset();
        mockRouter.query = {};

        useRouter.mockReturnValue(mockRouter);
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

        fireEvent.change(screen.getByPlaceholderText("Username or email address"), { target: { value: "alice" } });
        fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "abc12345" } });
        fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

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

    it("keeps sign in enabled and focuses username when both fields are empty", () => {
        render(<LoginScreen />);

        const userNameInput = screen.getByPlaceholderText("Username or email address");
        const signInButton = screen.getByRole("button", { name: "Sign in" });

        expect(signInButton).toBeEnabled();
        fireEvent.click(signInButton);

        expect(userNameInput).toHaveFocus();
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("focuses password when username is filled but password is missing", () => {
        render(<LoginScreen />);

        const userNameInput = screen.getByPlaceholderText("Username or email address");
        const passwordInput = screen.getByPlaceholderText("Password");

        fireEvent.change(userNameInput, { target: { value: "alice" } });
        fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

        expect(passwordInput).toHaveFocus();
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("redirects to the requested relative path after successful login", async () => {
        mockRouter.query = {
            redirect: "/profile",
        };
        globalThis.fetch.mockResolvedValue({
            json: jest.fn().mockResolvedValue({ code: 0, token: "jwt-token", role: "student" }),
        });

        render(<LoginScreen />);

        fireEvent.change(screen.getByPlaceholderText("Username or email address"), { target: { value: "alice" } });
        fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "abc12345" } });
        fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

        await waitFor(() => {
            expect(mockPush).toHaveBeenCalledWith("/profile");
        });
    });

    it("falls back to home after successful login when redirect is unsafe", async () => {
        mockRouter.query = {
            redirect: "https://evil.example.com",
        };
        globalThis.fetch.mockResolvedValue({
            json: jest.fn().mockResolvedValue({ code: 0, token: "jwt-token", role: "student" }),
        });

        render(<LoginScreen />);

        fireEvent.change(screen.getByPlaceholderText("Username or email address"), { target: { value: "alice" } });
        fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "abc12345" } });
        fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

        await waitFor(() => {
            expect(mockPush).toHaveBeenCalledWith("/");
        });
    });

    it("alerts failure and stays on page when login fails", async () => {
        globalThis.fetch.mockResolvedValue({
            json: jest.fn().mockResolvedValue({ code: 1 }),
        });

        render(<LoginScreen />);

        fireEvent.change(screen.getByPlaceholderText("Username or email address"), { target: { value: "alice" } });
        fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "abc12345" } });
        fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

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

        fireEvent.change(screen.getByPlaceholderText("Username or email address"), { target: { value: "banned_user" } });
        fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "abc12345" } });
        fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

        await waitFor(() => {
            expect(globalThis.alert).toHaveBeenCalledWith("User is banned");
        });

        expect(mockPush).not.toHaveBeenCalled();
    });

    it("does not crash when login response body is empty", async () => {
        globalThis.fetch.mockResolvedValue({
            text: jest.fn().mockResolvedValue(""),
        });

        render(<LoginScreen />);

        fireEvent.change(screen.getByPlaceholderText("Username or email address"), { target: { value: "alice" } });
        fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "abc12345" } });
        fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

        await waitFor(() => {
            expect(globalThis.alert).toHaveBeenCalledWith(LOGIN_FAILED);
        });

        expect(mockPush).not.toHaveBeenCalled();
        expect(mockDispatch).not.toHaveBeenCalled();
    });

    it("shows stable message when login response is non-json text", async () => {
        globalThis.fetch.mockResolvedValue({
            text: jest.fn().mockResolvedValue("<html>502 Bad Gateway</html>"),
        });

        render(<LoginScreen />);

        fireEvent.change(screen.getByPlaceholderText("Username or email address"), { target: { value: "alice" } });
        fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "abc12345" } });
        fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

        await waitFor(() => {
            expect(globalThis.alert).toHaveBeenCalledWith("<html>502 Bad Gateway</html>");
        });

        expect(mockPush).not.toHaveBeenCalled();
        expect(mockDispatch).not.toHaveBeenCalled();
    });

    it("renders the MentorFinder login shell and placeholder actions", () => {
        render(<LoginScreen />);

        expect(screen.getByRole("heading", { name: "Sign in to MentorFinder" })).toBeInTheDocument();
        expect(screen.getByText("MF")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
        expect(screen.getByRole("button", { name: "Continue with TsinghuaID" })).toBeDisabled();
        expect(screen.getByText("New to MentorFinder?")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Create an account" })).toBeInTheDocument();
        expect(screen.queryByText("Continue with Apple")).not.toBeInTheDocument();
        expect(screen.queryByText("Sign in with a passkey")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "返回首页" })).not.toBeInTheDocument();
    });

    it("navigates to register page when clicking account creation link", () => {
        render(<LoginScreen />);

        fireEvent.click(screen.getByRole("link", { name: "Create an account" }));

        expect(mockPush).toHaveBeenCalledWith("/register");
    });

    it("preserves redirect when navigating from login to register", () => {
        mockRouter.query = {
            redirect: "/follows",
        };

        render(<LoginScreen />);

        fireEvent.click(screen.getByRole("link", { name: "Create an account" }));

        expect(mockPush).toHaveBeenCalledWith("/register?redirect=%2Ffollows");
    });
});

describe("RegisterScreen", () => {
    const mockPush = jest.fn();
    const mockDispatch = jest.fn();
    const mockRouter = {
        push: mockPush,
        query: {},
    };

    beforeEach(() => {
        mockPush.mockReset();
        mockDispatch.mockReset();
        mockRouter.query = {};

        useRouter.mockReturnValue(mockRouter);
        useDispatch.mockReturnValue(mockDispatch);

        globalThis.fetch = jest.fn();
        jest.spyOn(globalThis, "alert").mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("keeps create account enabled and focuses email when the form is empty", () => {
        render(<RegisterScreen />);

        const emailInput = screen.getByPlaceholderText("Email");
        const createAccountButton = screen.getByRole("button", { name: "Create account" });

        expect(createAccountButton).toBeEnabled();
        fireEvent.click(createAccountButton);

        expect(emailInput).toHaveFocus();
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("focuses password when email is filled but password is missing", () => {
        render(<RegisterScreen />);

        const emailInput = screen.getByPlaceholderText("Email");
        const passwordInput = screen.getByPlaceholderText("Password");

        fireEvent.change(emailInput, { target: { value: "alice@example.com" } });
        fireEvent.click(screen.getByRole("button", { name: "Create account" }));

        expect(passwordInput).toHaveFocus();
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("focuses confirm password when password is filled but confirmation is missing", () => {
        render(<RegisterScreen />);

        fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "alice@example.com" } });
        fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "abc12345" } });
        fireEvent.click(screen.getByRole("button", { name: "Create account" }));

        expect(screen.getByPlaceholderText("Confirm your password")).toHaveFocus();
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("focuses username when other fields are valid but username is missing", () => {
        render(<RegisterScreen />);

        fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "alice@example.com" } });
        fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "abc12345" } });
        fireEvent.change(screen.getByPlaceholderText("Confirm your password"), { target: { value: "abc12345" } });
        fireEvent.click(screen.getByRole("button", { name: "Create account" }));

        expect(screen.getByPlaceholderText("Username")).toHaveFocus();
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("shows weak-password hint after password input is blurred", () => {
        render(<RegisterScreen />);

        const passwordInput = screen.getByPlaceholderText("Password");

        fireEvent.change(passwordInput, { target: { value: "abc12" } });
        expect(screen.queryByText(REGISTER_PASSWORD_WEAK)).not.toBeInTheDocument();

        fireEvent.blur(passwordInput);

        expect(screen.getByText(REGISTER_PASSWORD_WEAK)).toBeInTheDocument();
    });

    it("prioritizes mismatch hint over weak-password hint", () => {
        render(<RegisterScreen />);

        const passwordInput = screen.getByPlaceholderText("Password");
        const confirmPasswordInput = screen.getByPlaceholderText("Confirm your password");

        fireEvent.change(passwordInput, { target: { value: "abc12" } });
        fireEvent.blur(passwordInput);

        fireEvent.change(confirmPasswordInput, { target: { value: "zzz" } });
        fireEvent.blur(confirmPasswordInput);

        expect(screen.getByText(REGISTER_PASSWORD_MISMATCH)).toBeInTheDocument();
        expect(screen.queryByText(REGISTER_PASSWORD_WEAK)).not.toBeInTheDocument();
    });

    it("shows invalid-email hint after email input is blurred", () => {
        render(<RegisterScreen />);

        const emailInput = screen.getByPlaceholderText("Email");

        fireEvent.change(emailInput, { target: { value: "invalid" } });
        fireEvent.blur(emailInput);

        expect(screen.getByText(REGISTER_EMAIL_INVALID)).toBeInTheDocument();
    });

    it("shows invalid-username hint after username input is blurred", () => {
        render(<RegisterScreen />);

        const usernameInput = screen.getByPlaceholderText("Username");

        fireEvent.change(usernameInput, { target: { value: "bad user!" } });
        fireEvent.blur(usernameInput);

        expect(screen.getByText(REGISTER_USERNAME_INVALID)).toBeInTheDocument();
    });

    it("dispatches auth info and navigates home when register succeeds", async () => {
        globalThis.fetch.mockResolvedValue({
            json: jest.fn().mockResolvedValue({ code: 0, token: "register-token", role: "student" }),
        });

        render(<RegisterScreen />);

        fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "alice@example.com" } });
        fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "abc12345" } });
        fireEvent.change(screen.getByPlaceholderText("Confirm your password"), { target: { value: "abc12345" } });
        fireEvent.change(screen.getByPlaceholderText("Username"), { target: { value: " alice " } });

        fireEvent.click(screen.getByRole("button", { name: "Create account" }));

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
            expect(mockPush).toHaveBeenCalledWith("/");
        });
        expect(globalThis.alert).not.toHaveBeenCalled();
    });

    it("still navigates home after successful register when redirect is present", async () => {
        mockRouter.query = {
            redirect: "/follows",
        };
        globalThis.fetch.mockResolvedValue({
            json: jest.fn().mockResolvedValue({ code: 0, token: "register-token", role: "student" }),
        });

        render(<RegisterScreen />);

        fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "alice@example.com" } });
        fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "abc12345" } });
        fireEvent.change(screen.getByPlaceholderText("Confirm your password"), { target: { value: "abc12345" } });
        fireEvent.change(screen.getByPlaceholderText("Username"), { target: { value: "alice" } });
        fireEvent.click(screen.getByRole("button", { name: "Create account" }));

        await waitFor(() => {
            expect(mockPush).toHaveBeenCalledWith("/");
        });
    });

    it("falls back to home after successful register when redirect is unsafe", async () => {
        mockRouter.query = {
            redirect: "//evil.example.com",
        };
        globalThis.fetch.mockResolvedValue({
            json: jest.fn().mockResolvedValue({ code: 0, token: "register-token", role: "student" }),
        });

        render(<RegisterScreen />);

        fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "alice@example.com" } });
        fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "abc12345" } });
        fireEvent.change(screen.getByPlaceholderText("Confirm your password"), { target: { value: "abc12345" } });
        fireEvent.change(screen.getByPlaceholderText("Username"), { target: { value: "alice" } });
        fireEvent.click(screen.getByRole("button", { name: "Create account" }));

        await waitFor(() => {
            expect(mockPush).toHaveBeenCalledWith("/");
        });
    });

    it("does not crash when register response body is empty", async () => {
        globalThis.fetch.mockResolvedValue({
            text: jest.fn().mockResolvedValue(""),
        });

        render(<RegisterScreen />);

        fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "alice@example.com" } });
        fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "abc12345" } });
        fireEvent.change(screen.getByPlaceholderText("Confirm your password"), { target: { value: "abc12345" } });
        fireEvent.change(screen.getByPlaceholderText("Username"), { target: { value: "alice" } });
        fireEvent.click(screen.getByRole("button", { name: "Create account" }));

        await waitFor(() => {
            expect(screen.getByText("注册失败")).toBeInTheDocument();
        });

        expect(mockPush).not.toHaveBeenCalled();
        expect(mockDispatch).not.toHaveBeenCalled();
    });

    it("shows stable message when register response is non-json text", async () => {
        globalThis.fetch.mockResolvedValue({
            text: jest.fn().mockResolvedValue("<html>502 Bad Gateway</html>"),
        });

        render(<RegisterScreen />);

        fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "alice@example.com" } });
        fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "abc12345" } });
        fireEvent.change(screen.getByPlaceholderText("Confirm your password"), { target: { value: "abc12345" } });
        fireEvent.change(screen.getByPlaceholderText("Username"), { target: { value: "alice" } });
        fireEvent.click(screen.getByRole("button", { name: "Create account" }));

        await waitFor(() => {
            expect(screen.getByText("注册失败")).toBeInTheDocument();
        });

        expect(mockPush).not.toHaveBeenCalled();
        expect(mockDispatch).not.toHaveBeenCalled();
    });

    it("renders the MentorFinder signup shell and marketing content", () => {
        render(<RegisterScreen />);

        expect(screen.getByRole("heading", { name: "Sign up for MentorFinder" })).toBeInTheDocument();
        expect(screen.getByText("Already have an account?")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Sign in →" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Continue with TsinghuaID" })).toBeDisabled();
        expect(screen.getByText("Create your account")).toBeInTheDocument();
        expect(screen.getByText("Explore MentorFinder's unique features for both students and teachers")).toBeInTheDocument();
        expect(screen.getByText("See what's included")).toBeInTheDocument();
        expect(screen.queryByText("Continue with Apple")).not.toBeInTheDocument();
        expect(screen.queryByText("Your Country/Region")).not.toBeInTheDocument();
        expect(screen.queryByText("Email preferences")).not.toBeInTheDocument();
    });

    it("toggles the marketing feature list", () => {
        jest.useFakeTimers();
        try {
            render(<RegisterScreen />);

            const toggleButton = screen.getByText("See what's included").closest("summary");
            expect(screen.queryByText("Discover mentors by research interests")).not.toBeInTheDocument();
            expect(toggleButton).not.toBeNull();

            fireEvent.click(toggleButton);
            expect(toggleButton).toHaveAttribute("aria-expanded", "true");
            expect(screen.getByText("Discover mentors by research interests")).toBeInTheDocument();
            expect(screen.getByText("Track papers on a living timeline")).toBeInTheDocument();

            fireEvent.click(toggleButton);
            expect(toggleButton).toHaveAttribute("aria-expanded", "false");
            expect(screen.getByText("Discover mentors by research interests")).toBeInTheDocument();

            act(() => {
                jest.advanceTimersByTime(500);
            });
            expect(screen.queryByText("Discover mentors by research interests")).not.toBeInTheDocument();
        }
        finally {
            jest.useRealTimers();
        }
    });

    it("navigates to login page when clicking sign-in link", () => {
        render(<RegisterScreen />);

        fireEvent.click(screen.getByRole("link", { name: "Sign in →" }));

        expect(mockPush).toHaveBeenCalledWith("/login");
    });

    it("preserves redirect when navigating from register to login", () => {
        mockRouter.query = {
            redirect: "/profile",
        };

        render(<RegisterScreen />);

        fireEvent.click(screen.getByRole("link", { name: "Sign in →" }));

        expect(mockPush).toHaveBeenCalledWith("/login?redirect=%2Fprofile");
    });
});
