import { useState } from "react";
import { FAILURE_PREFIX, LOGIN_FAILED, LOGIN_SUCCESS_PREFIX } from "../constants/string";
import { useRouter } from "next/router";
import { setName, setToken } from "../redux/auth";
import { useDispatch } from "react-redux";

const LoginScreen = () => {
    const [userName, setUserName] = useState("");
    const [password, setPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const router = useRouter();
    const dispatch = useDispatch();

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
            .then((res) => res.json())
            .then((res) => {
                if (Number(res.code) === 0 && typeof res.token === "string") {
                    dispatch(setToken(res.token));

                    dispatch(setName(userName));
                    alert(LOGIN_SUCCESS_PREFIX + userName);

                    router.push("/");
                }
                else {
                    alert(LOGIN_FAILED);
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
                <button onClick={() => router.push("/register")} disabled={submitting}>
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
