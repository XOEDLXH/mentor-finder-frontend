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

    useEffect(() => {
        dispatch(hydrateAuth(loadAuthFromStorage()));
    }, [dispatch]);

    return (
        <>
            <Head>
                <title>找导师</title>
            </Head>
            <div style={{ padding: 12 }}>
                <Component {...pageProps} />
                {!isAuthPage && (auth.token ? (
                    <>
                        <p>已登录，用户名：{auth.name}</p>
                        <button onClick={() => dispatch(resetAuth())}>
                            登出
                        </button>
                    </>
                ) : (
                    <div style={{ display: "flex", flexDirection: "row", gap: 8 }}>
                        <button onClick={() => router.push("/login")}>登录</button>
                        <button onClick={() => router.push("/register")}>注册</button>
                    </div>
                ))}
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
