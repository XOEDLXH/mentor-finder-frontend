import { useState } from "react";
import {
    FAILURE_PREFIX,
    REGISTER_FAILED,
    REGISTER_PASSWORD_MISMATCH,
    REGISTER_SUCCESS_PREFIX,
} from "../constants/string";
import { useRouter } from "next/router";
import { setName, setToken } from "../redux/auth";
import { useDispatch } from "react-redux";

const RegisterScreen = () => {
    const [userName, setUserName] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [confirmPasswordBlurred, setConfirmPasswordBlurred] = useState(false);
    const [email, setEmail] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const router = useRouter();
    const dispatch = useDispatch();

    const register = () => {
        if (password !== confirmPassword) {
            alert(REGISTER_PASSWORD_MISMATCH);
            return;
        }

        setSubmitting(true);
        fetch("/api/register", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                username: userName,
                password,
                email,
            }),
        })
            .then((res) => res.json())
            .then((res) => {
                if (Number(res.code) === 0 && typeof res.token === "string") {
                    dispatch(setToken(res.token));
                    dispatch(setName(userName));
                    alert(REGISTER_SUCCESS_PREFIX + userName);
                    router.push("/");
                }
                else {
                    alert(REGISTER_FAILED);
                }
            })
            .catch((err) => alert(FAILURE_PREFIX + err))
            .finally(() => setSubmitting(false));
    };

    return (
        <>
            <h4> Register </h4>
            <input
                type="text"
                placeholder="User name"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
            />
            <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
            />
            <input
                type="password"
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onBlur={() => setConfirmPasswordBlurred(true)}
            />
            <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
            />
            {confirmPasswordBlurred && confirmPassword !== "" && password !== confirmPassword && (
                <p style={{ color: "#c62828", margin: 0 }}>{REGISTER_PASSWORD_MISMATCH}</p>
            )}
            <div style={{ display: "flex", flexDirection: "row", gap: 8 }}>
                <button
                    onClick={register}
                    disabled={
                        submitting ||
                        userName === "" ||
                        password === "" ||
                        confirmPassword === "" ||
                        password !== confirmPassword ||
                        email === ""
                    }
                >
                    {submitting ? "Submitting..." : "Register"}
                </button>
                <button onClick={() => router.push("/login")} disabled={submitting}>
                    Go to login
                </button>
            </div>
        </>
    );
};

export default RegisterScreen;