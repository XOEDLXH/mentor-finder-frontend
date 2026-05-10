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
        <section className="loginAuthPage" aria-label="Sign in page">
            <div className="loginAuthBrand" aria-hidden="true">
                <div className="loginAuthBrandMark">MF</div>
            </div>

            <h1 className="loginAuthTitle">Sign in to MentorFinder</h1>

            <div className="loginAuthCard">
                <label className="loginAuthField">
                    <span className="loginAuthLabel">Username or email address</span>
                    <input
                        type="text"
                        placeholder="Username or email address"
                        value={userName}
                        onChange={(e) => setUserName(e.target.value)}
                    />
                </label>

                <label className="loginAuthField">
                    <div className="loginAuthPasswordRow">
                        <span className="loginAuthLabel">Password</span>
                    </div>
                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                </label>

                <button
                    className="loginAuthSubmit"
                    onClick={login}
                    disabled={submitting || userName === "" || password === ""}
                >
                    {submitting ? "Signing in..." : "Sign in"}
                </button>
            </div>

            <div className="loginAuthDivider" aria-hidden="true">
                <span>or</span>
            </div>

            <button
                type="button"
                className="loginAuthSecondary"
                disabled
                aria-label="Continue with TsinghuaID"
            >
                Continue with TsinghuaID
            </button>

            <p className="loginAuthSignup">
                New to MentorFinder?{" "}
                <button
                    type="button"
                    className="loginAuthInlineLink"
                    onClick={() => router.push(buildRedirectHref("/register", router.query.redirect))}
                    disabled={submitting}
                >
                    Create an account
                </button>
            </p>
        </section>
    );
};

export default LoginScreen;
