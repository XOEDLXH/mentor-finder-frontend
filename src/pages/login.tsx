import { FormEvent, RefCallback, useRef, useState } from "react";
import { FAILURE_PREFIX, LOGIN_FAILED } from "../constants/string";
import { useRouter } from "next/router";
import { setName, setRole, setToken, setUserId } from "../redux/auth";
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
    const [loginErrorMessage, setLoginErrorMessage] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const userNameInputRef = useRef<HTMLInputElement | undefined>(undefined);
    const passwordInputRef = useRef<HTMLInputElement | undefined>(undefined);

    const router = useRouter();
    const dispatch = useDispatch();
    const redirectTarget = resolveRedirectTarget(router.query.redirect);
    const bindUserNameInputRef: RefCallback<HTMLInputElement> = (node) => {
        userNameInputRef.current = node ?? undefined;
    };
    const bindPasswordInputRef: RefCallback<HTMLInputElement> = (node) => {
        passwordInputRef.current = node ?? undefined;
    };

    const submitLogin = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        login();
    };

    const login = () => {
        if (userName.trim() === "") {
            userNameInputRef.current?.focus();
            return;
        }

        if (password === "") {
            passwordInputRef.current?.focus();
            return;
        }

        setLoginErrorMessage("");
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
                    dispatch(setUserId(typeof res.userId === "number" ? res.userId : undefined));

                    dispatch(setName(userName));

                    router.push(redirectTarget);
                }
                else {
                    setLoginErrorMessage(LOGIN_FAILED);
                }
            })
            .catch((err) => setLoginErrorMessage(FAILURE_PREFIX + String(err)))
            .finally(() => setSubmitting(false));
    };

    return (
        <section className="loginAuthPage" aria-label="Sign in page">
            <button
                type="button"
                className="loginAuthBrand"
                aria-label="Go to home page"
                onClick={() => void router.push("/")}
            >
                <img
                    src="/mentorfinder-logo-1.svg"
                    alt=""
                    className="loginAuthBrandLogo"
                />
            </button>

            <h1 className="loginAuthTitle">Sign in to MentorFinder</h1>

            <form className="loginAuthForm" onSubmit={submitLogin}>
                <label className="loginAuthField">
                    <span className="loginAuthLabel">Username or email address</span>
                    <input
                        ref={bindUserNameInputRef}
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
                        ref={bindPasswordInputRef}
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                </label>

                {loginErrorMessage !== "" && (
                    <p className="loginAuthError">{loginErrorMessage}</p>
                )}

                <button
                    type="submit"
                    className="loginAuthSubmit"
                    disabled={submitting}
                >
                    {submitting ? "Signing in..." : "Sign in"}
                </button>
            </form>

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
                <a
                    href={buildRedirectHref("/register", router.query.redirect)}
                    className="loginAuthInlineLink"
                    onClick={(event) => {
                        event.preventDefault();
                        if (submitting) {
                            return;
                        }
                        void router.push(buildRedirectHref("/register", router.query.redirect));
                    }}
                >
                    Create an account
                </a>
            </p>
        </section>
    );
};

export default LoginScreen;
