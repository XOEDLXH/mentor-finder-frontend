import { useState } from "react";
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

const USERNAME_REGEX = /^[A-Za-z0-9_-]+$/;
const EMAIL_REGEX = /^[\w.%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

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

    const router = useRouter();
    const dispatch = useDispatch();

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

        if (password !== confirmPassword) {
            alert(REGISTER_PASSWORD_MISMATCH);
            return;
        }

        if (normalizedUserName === "" || !USERNAME_REGEX.test(normalizedUserName)) {
            setUserNameBlurred(true);
            return;
        }

        if (isPasswordWeak) {
            setPasswordBlurred(true);
            return;
        }

        if (isEmailInvalid) {
            setEmailBlurred(true);
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
            .then((res) => res.json())
            .then((res) => {
                if (Number(res.code) === 0 && typeof res.token === "string") {
                    dispatch(setToken(res.token));
                    dispatch(setRole(typeof res.role === "string" ? res.role : "student"));
                    dispatch(setName(normalizedUserName));
                    alert(REGISTER_SUCCESS_PREFIX + normalizedUserName);
                    router.push("/");
                }
                else {
                    setRegisterErrorMessage(REGISTER_FAILED);
                }
            })
            .catch((err) => setRegisterErrorMessage(FAILURE_PREFIX + err))
            .finally(() => setSubmitting(false));
    };

    return (
        <>
            <h4> 注册 </h4>
            <input
                type="text"
                placeholder="用户名"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                onBlur={() => setUserNameBlurred(true)}
            />
            <input
                type="password"
                placeholder="密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setPasswordBlurred(true)}
            />
            <input
                type="password"
                placeholder="确认密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onBlur={() => setConfirmPasswordBlurred(true)}
            />
            <input
                type="text"
                inputMode="email"
                autoComplete="email"
                placeholder="邮箱"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setEmailBlurred(true)}
            />
            {shouldShowPasswordMismatchHint && (
                <p style={{ color: "#c62828", margin: 0 }}>{REGISTER_PASSWORD_MISMATCH}</p>
            )}
            {userNameBlurred && isUserNameInvalid && (
                <p style={{ color: "#c62828", margin: 0 }}>{REGISTER_USERNAME_INVALID}</p>
            )}
            {shouldShowPasswordWeakHint && (
                <p style={{ color: "#c62828", margin: 0 }}>{REGISTER_PASSWORD_WEAK}</p>
            )}
            {emailBlurred && isEmailInvalid && (
                <p style={{ color: "#c62828", margin: 0 }}>{REGISTER_EMAIL_INVALID}</p>
            )}
            {registerErrorMessage !== "" && (
                <p style={{ color: "#c62828", margin: 0 }}>{registerErrorMessage}</p>
            )}
            <div style={{ display: "flex", flexDirection: "row", gap: 8 }}>
                <button
                    onClick={register}
                    disabled={
                        submitting ||
                        normalizedUserName === "" ||
                        isUserNameInvalid ||
                        password === "" ||
                        isPasswordWeak ||
                        confirmPassword === "" ||
                        password !== confirmPassword ||
                        email === "" ||
                        isEmailInvalid
                    }
                >
                    {submitting ? "提交中..." : "注册"}
                </button>
                <button onClick={() => router.push("/login")} disabled={submitting}>
                    前往登录页面
                </button>
                <button onClick={() => router.push("/")} disabled={submitting}>
                    返回首页
                </button>
            </div>
        </>
    );
};

export default RegisterScreen;