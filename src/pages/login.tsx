import { useState } from "react";
import { FAILURE_PREFIX, LOGIN_FAILED, LOGIN_SUCCESS_PREFIX } from "../constants/string";
import { useRouter } from "next/router";
import { setName, setRole, setToken } from "../redux/auth";
import { useDispatch } from "react-redux";
import { buildRedirectHref, resolveRedirectTarget } from "../utils/authRedirect";

const parseJsonSafely = async (response: Response) => {
    if (typeof response.text === "function") {
        const rawText = await response.text();
        if (rawText.trim() === "") {
            return {};
        }

        try {
            return JSON.parse(rawText) as Record<string, unknown>;
        }
        catch {
            return {
                info: rawText,
            };
        }
    }

    if (typeof response.json === "function") {
        try {
            return await response.json() as Record<string, unknown>;
        }
        catch {
            return {};
        }
    }

    return {};
};

const LoginScreen = () => {
    const [userName, setUserName] = useState("");
    const [password, setPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const router = useRouter();
    const dispatch = useDispatch();
    const redirectTarget = resolveRedirectTarget(router.query.redirect);

    const login = () => {
        setSubmitting(true);
        fetch("/api/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                username: userName,
                password,
            }),
        })
            .then((res) => parseJsonSafely(res))
            .then((res) => {
                if (Number(res.code) === 0 && typeof res.token === "string") {
                    dispatch(setToken(res.token));
                    dispatch(setRole(typeof res.role === "string" ? res.role : ""));

                    dispatch(setName(userName));
                    alert(LOGIN_SUCCESS_PREFIX + userName);

                    router.push(redirectTarget);
                }
                else {
                    alert(typeof res.info === "string" && res.info !== "" ? res.info : LOGIN_FAILED);
                }
            })
            .catch((err) => alert(FAILURE_PREFIX + err))
            .finally(() => setSubmitting(false));
    };

    return (
        <>
            <h4> 登录 </h4>
            <input
                type="text"
                placeholder="用户名"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
            />
            <input
                type="password"
                placeholder="密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
            />
            <div style={{ display: "flex", flexDirection: "row", gap: 8 }}>
                <button onClick={login} disabled={submitting || userName === "" || password === ""}>
                    {submitting ? "提交中..." : "登录"}
                </button>
                <button onClick={() => router.push(buildRedirectHref("/register", router.query.redirect))} disabled={submitting}>
                    前往注册页面
                </button>
                <button onClick={() => router.push("/")} disabled={submitting}>
                    返回首页
                </button>
            </div>
        </>
    );
};

export default LoginScreen;
