import Head from "next/head";
import "../styles/globals.css";
import type { AppProps } from "next/app";
import store, { RootState } from "../redux/store";
import { hydrateAuth, loadAuthFromStorage, resetAuth } from "../redux/auth";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { Provider, useSelector, useDispatch } from "react-redux";

// eslint-disable-next-line @typescript-eslint/naming-convention
const App = ({ Component, pageProps }: AppProps) => {
    const router = useRouter();
    const dispatch = useDispatch();
    const auth = useSelector((state: RootState) => state.auth);
    const isAuthPage = router.pathname === "/login" || router.pathname === "/register";
    const isFollowsPage = router.pathname === "/follows";

    useEffect(() => {
        dispatch(hydrateAuth(loadAuthFromStorage()));
    }, [dispatch]);

    return (
        <>
            <Head>
                <title>找导师</title>
            </Head>
            <div className={isFollowsPage ? "appShell appShellFollows" : "appShell"}>
                <Component {...pageProps} />
                {!isAuthPage && (auth.token ? (
                    <div className="authControls">
                        <p className="authName">用户名：{auth.name}</p>
                        {auth.role === "admin" && (
                            <button onClick={() => router.push("/admin-users")}>
                                进入用户管理
                            </button>
                        )}
                        <button onClick={() => dispatch(resetAuth())}>
                            登出
                        </button>
                    </div>
                ) : (
                    <div className="authControls">
                        <button onClick={() => router.push("/login")}>登录</button>
                        <button onClick={() => router.push("/register")}>注册</button>
                    </div>
                ))}

                <style jsx>{`
                    .appShell {
                        padding: 12px;
                    }

                    .authControls {
                        display: flex;
                        flex-direction: row;
                        gap: 8px;
                        align-items: center;
                        flex-wrap: wrap;
                    }

                    .authName {
                        margin: 0;
                    }

                    .appShellFollows {
                        position: relative;
                        padding-top: 92px;
                    }

                    .appShellFollows .authControls {
                        position: absolute;
                        top: 32px;
                        right: 12px;
                        max-width: 260px;
                        justify-content: flex-end;
                    }

                    .appShellFollows .authControls button:last-child {
                        flex-basis: 100%;
                        margin-left: auto;
                    }

                    @media (max-width: 720px) {
                        .appShellFollows {
                            padding-top: 116px;
                        }
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
