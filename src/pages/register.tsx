import { useRef, useState } from "react";
import {
    FAILURE_PREFIX,
    REGISTER_EMAIL_INVALID,
    REGISTER_FAILED,
    REGISTER_PASSWORD_MISMATCH,
    REGISTER_PASSWORD_WEAK,
    REGISTER_SUCCESS_PREFIX,
    REGISTER_USERNAME_INVALID,
} from "../constants/string";
import { useRouter } from "next/router";
import { setName, setRole, setToken } from "../redux/auth";
import { useDispatch } from "react-redux";
import { buildRedirectHref, resolveRedirectTarget } from "../utils/authRedirect";

const USERNAME_REGEX = /^[\w-]+$/;
const EMAIL_REGEX = /^[\w.%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

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

const RegisterScreen = () => {
    const [userName, setUserName] = useState("");
    const [userNameBlurred, setUserNameBlurred] = useState(false);
    const [password, setPassword] = useState("");
    const [passwordBlurred, setPasswordBlurred] = useState(false);
    const [confirmPassword, setConfirmPassword] = useState("");
    const [confirmPasswordBlurred, setConfirmPasswordBlurred] = useState(false);
    const [email, setEmail] = useState("");
    const [emailBlurred, setEmailBlurred] = useState(false);
    const [registerErrorMessage, setRegisterErrorMessage] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [featureListOpen, setFeatureListOpen] = useState(false);
    const emailInputRef = useRef<HTMLInputElement | null>(null);
    const passwordInputRef = useRef<HTMLInputElement | null>(null);
    const confirmPasswordInputRef = useRef<HTMLInputElement | null>(null);
    const userNameInputRef = useRef<HTMLInputElement | null>(null);

    const router = useRouter();
    const dispatch = useDispatch();
    const redirectTarget = resolveRedirectTarget(router.query.redirect);

    const featureItems = [
        {
            title: "Discover mentors by research interests",
            description: "Search mentors and papers together to quickly narrow down the right academic fit.",
        },
        {
            title: "Track papers on a living timeline",
            description: "Follow publication activity across directions and stay aligned with new research momentum.",
        },
        {
            title: "Save and manage followed mentors",
            description: "Keep a focused shortlist of mentors you want to revisit, compare, and contact later.",
        },
        {
            title: "Build a personal academic profile",
            description: "Show research experience, honors, and projects in one place for future mentor interactions.",
        },
        {
            title: "Add private mentors and request verification",
            description: "Maintain your own mentor library and support mentor identity workflows when needed.",
        },
    ];

    const isPasswordStrong = (passwordToCheck: string) => {
        if (passwordToCheck.length < 8) {
            return false;
        }

        let hasLetter = false;
        let hasDigit = false;

        for (const char of passwordToCheck) {
            if (char >= "0" && char <= "9") {
                hasDigit = true;
            }

            if (char.toLowerCase() !== char.toUpperCase()) {
                hasLetter = true;
            }

            if (hasLetter && hasDigit) {
                return true;
            }
        }

        return false;
    };

    const normalizedUserName = userName.trim();
    const isUserNameInvalid = userName !== "" && !USERNAME_REGEX.test(normalizedUserName);

    const isPasswordWeak = password !== "" && !isPasswordStrong(password);
    const shouldShowPasswordMismatchHint =
        confirmPasswordBlurred && confirmPassword !== "" && password !== confirmPassword;
    const shouldShowPasswordWeakHint = passwordBlurred && isPasswordWeak && !shouldShowPasswordMismatchHint;

    const isEmailValid = (emailToCheck: string) => {
        return EMAIL_REGEX.test(emailToCheck.trim());
    };

    const isEmailInvalid = email !== "" && !isEmailValid(email);

    const register = () => {
        setRegisterErrorMessage("");

        if (email.trim() === "" || !isEmailValid(email)) {
            setEmailBlurred(true);
            emailInputRef.current?.focus();
            return;
        }

        if (password === "" || !isPasswordStrong(password)) {
            setPasswordBlurred(true);
            passwordInputRef.current?.focus();
            return;
        }

        if (password !== confirmPassword) {
            setConfirmPasswordBlurred(true);
            confirmPasswordInputRef.current?.focus();
            alert(REGISTER_PASSWORD_MISMATCH);
            return;
        }

        if (confirmPassword === "") {
            setConfirmPasswordBlurred(true);
            confirmPasswordInputRef.current?.focus();
            return;
        }

        if (normalizedUserName === "" || !USERNAME_REGEX.test(normalizedUserName)) {
            setUserNameBlurred(true);
            userNameInputRef.current?.focus();
            return;
        }

        setSubmitting(true);
        fetch("/api/register", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                username: normalizedUserName,
                password,
                email: email.trim(),
            }),
        })
            .then((res) => parseJsonSafely(res))
            .then((res) => {
                if (Number(res.code) === 0 && typeof res.token === "string") {
                    dispatch(setToken(res.token));
                    dispatch(setRole(typeof res.role === "string" ? res.role : "student"));
                    dispatch(setName(normalizedUserName));
                    alert(REGISTER_SUCCESS_PREFIX + normalizedUserName);
                    router.push(redirectTarget);
                }
                else {
                    setRegisterErrorMessage(REGISTER_FAILED);
                }
            })
            .catch((err) => setRegisterErrorMessage(FAILURE_PREFIX + err))
            .finally(() => setSubmitting(false));
    };

    return (
        <section className="registerAuthPage" aria-label="Sign up page">
            <aside className="registerAuthMarketing" aria-label="MentorFinder feature overview">
                <div className="registerAuthMarketingContent">
                    <h1 className="registerAuthMarketingTitle">Create your account</h1>
                    <p className="registerAuthMarketingCopy">
                        Explore MentorFinder's unique features for both students and teachers
                    </p>
                    <button
                        type="button"
                        className="registerAuthMarketingToggle"
                        aria-expanded={featureListOpen}
                        onClick={() => setFeatureListOpen((open) => !open)}
                    >
                        <span>See what&apos;s included</span>
                        <span className={featureListOpen ? "registerAuthChevron registerAuthChevronOpen" : "registerAuthChevron"}>⌄</span>
                    </button>

                    {featureListOpen && (
                        <ul className="registerAuthFeatureList">
                            {featureItems.map((item) => (
                                <li key={item.title} className="registerAuthFeatureItem">
                                    <span className="registerAuthFeatureCheck" aria-hidden="true">✓</span>
                                    <div>
                                        <p className="registerAuthFeatureTitle">{item.title}</p>
                                        <p className="registerAuthFeatureDescription">{item.description}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div className="registerAuthVisual" aria-hidden="true">
                    <span className="registerAuthStar registerAuthStarA" />
                    <span className="registerAuthStar registerAuthStarB" />
                    <span className="registerAuthStar registerAuthStarC" />
                    <span className="registerAuthOrb registerAuthOrbA" />
                    <span className="registerAuthOrb registerAuthOrbB" />
                    <span className="registerAuthOrb registerAuthOrbC" />
                    <span className="registerAuthGlow" />
                </div>
            </aside>

            <div className="registerAuthPanel">
                <div className="registerAuthTopLink">
                    <span>Already have an account?</span>
                    <a
                        href={buildRedirectHref("/login", router.query.redirect)}
                        className="registerAuthTopLinkAnchor"
                        onClick={(event) => {
                            event.preventDefault();
                            void router.push(buildRedirectHref("/login", router.query.redirect));
                        }}
                    >
                        Sign in →
                    </a>
                </div>

                <div className="registerAuthFormWrap">
                    <h2 className="registerAuthFormTitle">Sign up for MentorFinder</h2>

                    <button
                        type="button"
                        className="registerAuthSocialButton"
                        disabled
                        aria-label="Continue with TsinghuaID"
                    >
                        Continue with TsinghuaID
                    </button>

                    <div className="registerAuthDivider" aria-hidden="true">
                        <span>or</span>
                    </div>

                    <label className="registerAuthField">
                        <span className="registerAuthLabel">Email</span>
                        <input
                            ref={emailInputRef}
                            type="text"
                            inputMode="email"
                            autoComplete="email"
                            placeholder="Email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            onBlur={() => setEmailBlurred(true)}
                        />
                    </label>
                    {emailBlurred && isEmailInvalid && (
                        <p className="registerAuthError">{REGISTER_EMAIL_INVALID}</p>
                    )}

                    <label className="registerAuthField">
                        <span className="registerAuthLabel">Password</span>
                        <input
                            ref={passwordInputRef}
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onBlur={() => setPasswordBlurred(true)}
                        />
                    </label>
                    <p className="registerAuthHelper">
                        Password must be at least 8 characters and include both letters and numbers.
                    </p>
                    {shouldShowPasswordWeakHint && (
                        <p className="registerAuthError">{REGISTER_PASSWORD_WEAK}</p>
                    )}

                    <label className="registerAuthField">
                        <span className="registerAuthLabel">Confirm your password</span>
                        <input
                            ref={confirmPasswordInputRef}
                            type="password"
                            placeholder="Confirm your password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            onBlur={() => setConfirmPasswordBlurred(true)}
                        />
                    </label>
                    {shouldShowPasswordMismatchHint && (
                        <p className="registerAuthError">{REGISTER_PASSWORD_MISMATCH}</p>
                    )}

                    <label className="registerAuthField">
                        <span className="registerAuthLabel">Username</span>
                        <input
                            ref={userNameInputRef}
                            type="text"
                            placeholder="Username"
                            value={userName}
                            onChange={(e) => setUserName(e.target.value)}
                            onBlur={() => setUserNameBlurred(true)}
                        />
                    </label>
                    <p className="registerAuthHelper">
                        Username may only contain letters, numbers, underscores, and hyphens.
                    </p>
                    {userNameBlurred && isUserNameInvalid && (
                        <p className="registerAuthError">{REGISTER_USERNAME_INVALID}</p>
                    )}

                    {registerErrorMessage !== "" && (
                        <p className="registerAuthError">{registerErrorMessage}</p>
                    )}

                    <button
                        className="registerAuthSubmit"
                        onClick={register}
                        disabled={submitting}
                    >
                        {submitting ? "Creating account..." : "Create account"}
                    </button>
                </div>
            </div>
        </section>
    );
};

export default RegisterScreen;
