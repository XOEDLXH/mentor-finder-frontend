import Head from "next/head";
import "../styles/globals.css";
import "katex/dist/katex.min.css";
import type { AppProps } from "next/app";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { Provider, useDispatch } from "react-redux";

import TopNav from "../components/TopNav";
import { hydrateAuth, loadAuthFromStorage } from "../redux/auth";
import store from "../redux/store";

// eslint-disable-next-line @typescript-eslint/naming-convention
const App = ({ Component, pageProps }: AppProps) => {
    const dispatch = useDispatch();
    const router = useRouter();
    const isAuthPage = router.pathname === "/login" || router.pathname === "/register" || router.pathname === "/reset-password";

    useEffect(() => {
        dispatch(hydrateAuth(loadAuthFromStorage()));
    }, [dispatch]);

    return (
        <>
            <Head>
                <title>找导师</title>
            </Head>
            <div className={isAuthPage ? "appChrome appChromeAuth" : "appChrome"}>
                {!isAuthPage && <TopNav />}
                <main className={isAuthPage ? "appMain appMainAuth" : "appMain"}>
                    <Component {...pageProps} />
                </main>
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
