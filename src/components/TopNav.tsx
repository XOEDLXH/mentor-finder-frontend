import { KeyboardEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";

import { resetAuth } from "../redux/auth";
import { RootState } from "../redux/store";
import { buildRedirectHref, isSafeRelativeRedirect } from "../utils/authRedirect";
import { buildGlobalPaperSearchUrl } from "../utils/searchQuery";

interface NavItem {
    label: string;
    href: string;
    requiresAuth?: boolean;
    adminOnly?: boolean;
    activeMatch: (pathname: string) => boolean;
}

const NAV_ITEMS: NavItem[] = [
    {
        label: "Home",
        href: "/",
        activeMatch: (pathname) => pathname === "/",
    },
    {
        label: "Search",
        href: "/search",
        activeMatch: (pathname) => pathname === "/search" || pathname.startsWith("/mentors/"),
    },
    {
        label: "Timeline",
        href: "/timeline",
        activeMatch: (pathname) => pathname === "/timeline",
    },
    {
        label: "Follows",
        href: "/follows",
        requiresAuth: true,
        activeMatch: (pathname) => pathname === "/follows",
    },
    {
        label: "Profile",
        href: "/profile",
        requiresAuth: true,
        activeMatch: (pathname) => pathname === "/profile" || pathname === "/private-mentor",
    },
    {
        label: "Admin",
        href: "/admin-users",
        requiresAuth: true,
        adminOnly: true,
        activeMatch: (pathname) => pathname === "/admin-users",
    },
];

const TopNav = () => {
    const router = useRouter();
    const dispatch = useDispatch();
    const auth = useSelector((state: RootState) => state.auth);

    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
    const [searchKeyword, setSearchKeyword] = useState("");

    const isLoggedIn = auth.token.trim() !== "";
    const isAdmin = auth.role === "admin";
    const currentPath = typeof router.asPath === "string" && router.asPath !== "" ? router.asPath : "/";
    const currentRedirect = typeof router.query.redirect === "string" ? router.query.redirect : "";

    const visibleNavItems = useMemo(() => {
        return NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);
    }, [isAdmin]);

    useEffect(() => {
        setMobileMenuOpen(false);
        setAvatarMenuOpen(false);
    }, [currentPath]);

    useEffect(() => {
        const handleEscape = (event: globalThis.KeyboardEvent) => {
            if (event.key === "Escape") {
                setMobileMenuOpen(false);
                setAvatarMenuOpen(false);
            }
        };

        window.addEventListener("keydown", handleEscape);
        return () => window.removeEventListener("keydown", handleEscape);
    }, []);

    const goto = (href: string, requiresAuth = false) => {
        const targetHref = requiresAuth && !isLoggedIn
            ? buildRedirectHref("/login", href)
            : href;

        setMobileMenuOpen(false);
        setAvatarMenuOpen(false);
        void router.push(targetHref);
    };

    const gotoAuthPage = (basePath: "/login" | "/register") => {
        const nextHref = isSafeRelativeRedirect(currentRedirect)
            ? buildRedirectHref(basePath, currentRedirect)
            : basePath;

        setMobileMenuOpen(false);
        setAvatarMenuOpen(false);
        void router.push(nextHref);
    };

    const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
            event.preventDefault();
            const trimmedKeyword = searchKeyword.trim();
            if (trimmedKeyword === "") {
                return;
            }

            window.open(
                buildGlobalPaperSearchUrl(trimmedKeyword),
                "_blank",
                "noopener,noreferrer",
            );
        }
    };

    const handleSignOut = () => {
        dispatch(resetAuth());
        setMobileMenuOpen(false);
        setAvatarMenuOpen(false);
        void router.push("/");
    };

    const avatarLabel = auth.name.trim() === ""
        ? "U"
        : auth.name.trim().slice(0, 1).toUpperCase();

    return (
        <header className="topNav">
            <div className="topNavInner">
                <div className="topNavLeft">
                    <button
                        type="button"
                        className="topNavBrand"
                        onClick={() => goto("/")}
                        aria-label="Go to home"
                    >
                        <span className="topNavBrandBadge" aria-hidden="true">MF</span>
                        <span className="topNavBrandText">MentorFinder</span>
                    </button>

                    <nav className="topNavLinks" aria-label="Primary">
                        {visibleNavItems.map((item) => (
                            <button
                                key={item.href}
                                type="button"
                                className={item.activeMatch(router.pathname) ? "topNavLink topNavLinkActive" : "topNavLink"}
                                onClick={() => goto(item.href, Boolean(item.requiresAuth))}
                            >
                                {item.label}
                            </button>
                        ))}
                    </nav>
                </div>

                <div className="topNavRight">
                    <div className="topNavSearchShell">
                        <span className="topNavSearchIcon" aria-hidden="true">
                            <svg
                                data-component="Octicon"
                                focusable="false"
                                className="octicon octicon-search"
                                viewBox="0 0 16 16"
                                width="16"
                                height="16"
                                fill="currentColor"
                                display="inline-block"
                                overflow="visible"
                                style={{ verticalAlign: "text-bottom" }}
                            >
                                <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z" />
                            </svg>
                        </span>
                        <input
                            type="text"
                            className="topNavSearch"
                            placeholder="Search or jump to..."
                            aria-label="Search or jump to"
                            value={searchKeyword}
                            onChange={(event) => setSearchKeyword(event.target.value)}
                            onKeyDown={handleSearchKeyDown}
                        />
                    </div>

                    {!isLoggedIn ? (
                        <div className="topNavDesktopAuth">
                            <button type="button" className="topNavAuthLink" onClick={() => gotoAuthPage("/login")}>
                                Sign in
                            </button>
                            <button type="button" className="topNavAuthPrimary" onClick={() => gotoAuthPage("/register")}>
                                Sign up
                            </button>
                        </div>
                    ) : (
                        <div className="topNavAvatarArea">
                            <button
                                type="button"
                                className="topNavAvatarButton"
                                aria-haspopup="menu"
                                aria-expanded={avatarMenuOpen}
                                onClick={() => setAvatarMenuOpen((open) => !open)}
                            >
                                <span className="topNavAvatarCircle" aria-hidden="true">{avatarLabel}</span>
                                <span className="topNavAvatarName">{auth.name || "Account"}</span>
                            </button>

                            {avatarMenuOpen && (
                                <div className="topNavAvatarMenu" role="menu" aria-label="Account menu">
                                    <button type="button" className="topNavMenuItem" onClick={() => goto("/profile", true)}>
                                        Profile
                                    </button>
                                    <button type="button" className="topNavMenuItem" onClick={() => goto("/follows", true)}>
                                        Follows
                                    </button>
                                    {isAdmin && (
                                        <button type="button" className="topNavMenuItem" onClick={() => goto("/admin-users", true)}>
                                            Admin
                                        </button>
                                    )}
                                    <button type="button" className="topNavMenuItem topNavMenuItemDanger" onClick={handleSignOut}>
                                        Sign out
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    <button
                        type="button"
                        className="topNavMobileToggle"
                        aria-label="Open navigation menu"
                        aria-expanded={mobileMenuOpen}
                        onClick={() => setMobileMenuOpen((open) => !open)}
                    >
                        <span />
                        <span />
                        <span />
                    </button>
                </div>
            </div>

            {mobileMenuOpen && (
                <div className="topNavMobilePanel">
                    <nav className="topNavMobileLinks" aria-label="Mobile primary navigation">
                        {visibleNavItems.map((item) => (
                            <button
                                key={`mobile-${item.href}`}
                                type="button"
                                className={item.activeMatch(router.pathname) ? "topNavMobileLink topNavMobileLinkActive" : "topNavMobileLink"}
                                onClick={() => goto(item.href, Boolean(item.requiresAuth))}
                            >
                                {item.label}
                            </button>
                        ))}
                    </nav>

                    {!isLoggedIn ? (
                        <div className="topNavMobileAuth">
                            <button type="button" className="topNavMobileLink" onClick={() => gotoAuthPage("/login")}>
                                Sign in
                            </button>
                            <button type="button" className="topNavMobileLink topNavMobileLinkPrimary" onClick={() => gotoAuthPage("/register")}>
                                Sign up
                            </button>
                        </div>
                    ) : (
                        <div className="topNavMobileAccount">
                            <div className="topNavMobileAccountLabel">
                                Signed in as <strong>{auth.name || "Account"}</strong>
                            </div>
                            <button type="button" className="topNavMobileLink" onClick={() => goto("/profile", true)}>
                                Profile
                            </button>
                            <button type="button" className="topNavMobileLink" onClick={() => goto("/follows", true)}>
                                Follows
                            </button>
                            {isAdmin && (
                                <button type="button" className="topNavMobileLink" onClick={() => goto("/admin-users", true)}>
                                    Admin
                                </button>
                            )}
                            <button type="button" className="topNavMobileLink topNavMobileLinkDanger" onClick={handleSignOut}>
                                Sign out
                            </button>
                        </div>
                    )}
                </div>
            )}
        </header>
    );
};

export default TopNav;
