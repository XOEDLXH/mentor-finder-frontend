import Head from "next/head";
import "../styles/globals.css";
import type { AppProps } from "next/app";
import store, { RootState } from "../redux/store";
import { hydrateAuth, loadAuthFromStorage, resetAuth } from "../redux/auth";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Provider, useSelector, useDispatch } from "react-redux";

// eslint-disable-next-line @typescript-eslint/naming-convention
const App = ({ Component, pageProps }: AppProps) => {
    const router = useRouter();
    const dispatch = useDispatch();
    const auth = useSelector((state: RootState) => state.auth);
    const isAuthPage = router.pathname === "/login" || router.pathname === "/register";
    const shouldShowHomeButton = router.pathname !== "/" && !isAuthPage;
    const shouldShowUserMenu = shouldShowHomeButton && auth.token !== "";
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

    useEffect(() => {
        dispatch(hydrateAuth(loadAuthFromStorage()));
    }, [dispatch]);

    useEffect(() => {
        setIsUserMenuOpen(false);
    }, [router.pathname]);

    return (
        <>
            <Head>
                <title>找导师</title>
            </Head>
            <div className={shouldShowHomeButton ? "appShell appShellWithTopBar" : "appShell"}>
                <Component {...pageProps} />
                {shouldShowHomeButton && (
                    <button
                        className="homeButton"
                        type="button"
                        onClick={() => void router.push("/")}
                    >
                        首页
                    </button>
                )}
                {shouldShowUserMenu && (
                    <div className="userMenu">
                        <button
                            className="avatarButton"
                            type="button"
                            aria-label="打开用户菜单"
                            aria-expanded={isUserMenuOpen}
                            onClick={() => setIsUserMenuOpen((open) => !open)}
                        >
                            <span className="avatarIcon" aria-hidden="true" />
                        </button>

                        {isUserMenuOpen && (
                            <div className="userMenuPanel">
                                <p className="userName">用户名：{auth.name}</p>
                                <button
                                    type="button"
                                    onClick={() => void router.push("/user-home")}
                                >
                                    个人中心
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        dispatch(resetAuth());
                                        setIsUserMenuOpen(false);
                                    }}
                                >
                                    退出登录
                                </button>
                            </div>
                        )}
                    </div>
                )}

                <style jsx>{`
                    .appShell {
                        padding: 12px;
                    }

                    .appShellWithTopBar {
                        position: relative;
                        padding-top: 72px;
                    }

                    .homeButton {
                        position: absolute;
                        top: 24px;
                        left: 12px;
                        padding: 8px 16px;
                        font-size: 16px;
                    }

                    .userMenu {
                        position: absolute;
                        top: 24px;
                        right: 12px;
                        z-index: 10;
                    }

                    .avatarButton {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        width: 42px;
                        height: 42px;
                        border: 2px solid rgba(255, 255, 255, 0.95);
                        border-radius: 50%;
                        background:
                            linear-gradient(135deg, transparent 0 18%, #5ba8e6 18% 30%, transparent 30% 100%),
                            linear-gradient(45deg, #f7fbff 0 25%, transparent 25% 50%, #76b9ec 50% 74%, transparent 74% 100%),
                            #d9eefc;
                        box-shadow: 0 1px 6px rgba(0, 0, 0, 0.2);
                        cursor: pointer;
                    }

                    .avatarButton:hover,
                    .avatarButton:focus {
                        border-color: #5ba8e6;
                        outline: none;
                    }

                    .avatarIcon {
                        display: none;
                    }

                    .userMenuPanel {
                        position: absolute;
                        top: 50px;
                        right: 0;
                        display: flex;
                        flex-direction: column;
                        gap: 8px;
                        min-width: 150px;
                        padding: 10px;
                        border: 1px solid #ddd;
                        border-radius: 8px;
                        background: #fff;
                        box-shadow: 0 8px 22px rgba(0, 0, 0, 0.12);
                    }

                    .userName {
                        margin: 0 0 2px;
                        white-space: nowrap;
                    }
                `}</style>
            </div>
        </>
    );
};

export default function AppWrapper(props: AppProps) {
    return (
        <Provider store={store}>
            <App {...props} />
        </Provider>
    );
}
