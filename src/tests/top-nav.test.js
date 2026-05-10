import { fireEvent, render, screen, within } from "@testing-library/react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";

import TopNav from "../components/TopNav";
import { resetAuth } from "../redux/auth";

jest.mock("next/router", () => ({
    useRouter: jest.fn(),
}));

jest.mock("react-redux", () => ({
    useDispatch: jest.fn(),
    useSelector: jest.fn(),
}));

describe("TopNav", () => {
    const mockPush = jest.fn();
    const mockDispatch = jest.fn();
    const mockRouter = {
        pathname: "/",
        asPath: "/",
        query: {},
        push: mockPush,
    };
    let mockAuthState = {
        token: "",
        name: "",
        role: "",
    };

    const renderTopNav = () => {
        return render(<TopNav />);
    };

    beforeEach(() => {
        mockPush.mockReset();
        mockDispatch.mockReset();
        mockRouter.pathname = "/";
        mockRouter.asPath = "/";
        mockRouter.query = {};
        mockAuthState = {
            token: "",
            name: "",
            role: "",
        };

        useRouter.mockReturnValue(mockRouter);
        useDispatch.mockReturnValue(mockDispatch);
        useSelector.mockImplementation((selector) => selector({ auth: mockAuthState }));
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("shows search, Sign in and Sign up for unauthenticated users", () => {
        renderTopNav();

        expect(screen.getByRole("textbox", { name: "Search or jump to" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Sign up" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /alice/i })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Admin" })).not.toBeInTheDocument();
    });

    it("redirects unauthenticated users to login when they click follows", () => {
        renderTopNav();

        fireEvent.click(screen.getByRole("button", { name: "Follows" }));

        expect(mockPush).toHaveBeenCalledWith("/login?redirect=%2Ffollows");
    });

    it("redirects unauthenticated users to login when they click profile", () => {
        renderTopNav();

        fireEvent.click(screen.getByRole("button", { name: "Profile" }));

        expect(mockPush).toHaveBeenCalledWith("/login?redirect=%2Fprofile");
    });

    it("routes to search page from the top search input", () => {
        renderTopNav();

        fireEvent.click(screen.getByRole("textbox", { name: "Search or jump to" }));

        expect(mockPush).toHaveBeenCalledWith("/search");
    });

    it("shows avatar menu instead of auth buttons for logged-in users", () => {
        mockAuthState = {
            token: "jwt-token",
            name: "alice",
            role: "student",
        };

        renderTopNav();

        expect(screen.queryByRole("button", { name: "Sign in" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Sign up" })).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: /alice/i })).toBeInTheDocument();
    });

    it("shows profile, follows and sign out in the avatar menu for students", () => {
        mockAuthState = {
            token: "jwt-token",
            name: "alice",
            role: "student",
        };

        renderTopNav();

        fireEvent.click(screen.getByRole("button", { name: /alice/i }));

        const menu = screen.getByRole("menu", { name: "Account menu" });
        expect(within(menu).getByRole("button", { name: "Profile" })).toBeInTheDocument();
        expect(within(menu).getByRole("button", { name: "Follows" })).toBeInTheDocument();
        expect(within(menu).getByRole("button", { name: "Sign out" })).toBeInTheDocument();
        expect(within(menu).queryByRole("button", { name: "Admin" })).not.toBeInTheDocument();
    });

    it("shows admin entry in navigation and avatar menu for administrators", () => {
        mockAuthState = {
            token: "jwt-token",
            name: "ada",
            role: "admin",
        };

        renderTopNav();

        expect(screen.getByRole("button", { name: "Admin" })).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /ada/i }));

        const menu = screen.getByRole("menu", { name: "Account menu" });
        expect(within(menu).getByRole("button", { name: "Admin" })).toBeInTheDocument();
    });

    it("toggles avatar menu expanded state and closes it with Escape", () => {
        mockAuthState = {
            token: "jwt-token",
            name: "alice",
            role: "student",
        };

        renderTopNav();

        const avatarButton = screen.getByRole("button", { name: /alice/i });
        expect(avatarButton).toHaveAttribute("aria-expanded", "false");

        fireEvent.click(avatarButton);
        expect(avatarButton).toHaveAttribute("aria-expanded", "true");
        expect(screen.getByRole("menu", { name: "Account menu" })).toBeInTheDocument();

        fireEvent.keyDown(window, { key: "Escape" });
        expect(avatarButton).toHaveAttribute("aria-expanded", "false");
        expect(screen.queryByRole("menu", { name: "Account menu" })).not.toBeInTheDocument();
    });

    it("closes avatar menu after choosing a menu item", () => {
        mockAuthState = {
            token: "jwt-token",
            name: "alice",
            role: "student",
        };

        renderTopNav();

        fireEvent.click(screen.getByRole("button", { name: /alice/i }));
        const menu = screen.getByRole("menu", { name: "Account menu" });
        fireEvent.click(within(menu).getByRole("button", { name: "Profile" }));

        expect(mockPush).toHaveBeenCalledWith("/profile");
        expect(screen.queryByRole("menu", { name: "Account menu" })).not.toBeInTheDocument();
    });

    it("dispatches resetAuth and returns home when signing out", () => {
        mockAuthState = {
            token: "jwt-token",
            name: "alice",
            role: "student",
        };

        renderTopNav();

        fireEvent.click(screen.getByRole("button", { name: /alice/i }));
        fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

        expect(mockDispatch).toHaveBeenCalledWith(resetAuth());
        expect(mockPush).toHaveBeenCalledWith("/");
    });

    it("toggles mobile navigation expanded state and closes it with Escape", () => {
        renderTopNav();

        const menuToggle = screen.getByRole("button", { name: "Open navigation menu" });
        expect(menuToggle).toHaveAttribute("aria-expanded", "false");

        fireEvent.click(menuToggle);
        expect(menuToggle).toHaveAttribute("aria-expanded", "true");
        expect(screen.getByRole("navigation", { name: "Mobile primary navigation" })).toBeInTheDocument();

        fireEvent.keyDown(window, { key: "Escape" });
        expect(menuToggle).toHaveAttribute("aria-expanded", "false");
        expect(screen.queryByRole("navigation", { name: "Mobile primary navigation" })).not.toBeInTheDocument();
    });

    it("opens mobile navigation and keeps restricted redirect behavior there", () => {
        renderTopNav();

        fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));

        const mobileNav = screen.getByRole("navigation", { name: "Mobile primary navigation" });
        fireEvent.click(within(mobileNav).getByRole("button", { name: "Follows" }));

        expect(mockPush).toHaveBeenCalledWith("/login?redirect=%2Ffollows");
        expect(screen.queryByRole("navigation", { name: "Mobile primary navigation" })).not.toBeInTheDocument();
    });

    it("closes mobile navigation after choosing a public route", () => {
        renderTopNav();

        fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));
        const mobileNav = screen.getByRole("navigation", { name: "Mobile primary navigation" });

        fireEvent.click(within(mobileNav).getByRole("button", { name: "Search" }));

        expect(mockPush).toHaveBeenCalledWith("/search");
        expect(screen.queryByRole("navigation", { name: "Mobile primary navigation" })).not.toBeInTheDocument();
    });
});
