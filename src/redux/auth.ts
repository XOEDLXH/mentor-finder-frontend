import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface AuthState {
    token: string;
    name: string;
    role: string;
    userId: number | undefined;
}

const initialState: AuthState = {
    token: "",
    name: "",
    role: "",
    userId: undefined,
};

const AUTH_STORAGE_KEY = "mentorfinder_auth";

const saveAuthToStorage = (state: AuthState) => {
    if (typeof window === "undefined") {
        return;
    }

    if (state.token === "" && state.name === "" && state.role === "" && state.userId === undefined) {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
        return;
    }

    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state));
};

export const loadAuthFromStorage = (): AuthState => {
    if (typeof window === "undefined") {
        return initialState;
    }

    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY) ?? "";
    if (raw === "") {
        return initialState;
    }

    try {
        const parsed = JSON.parse(raw) as Partial<AuthState>;
        return {
            token: typeof parsed.token === "string" ? parsed.token : "",
            name: typeof parsed.name === "string" ? parsed.name : "",
            role: typeof parsed.role === "string" ? parsed.role : "",
            userId: typeof parsed.userId === "number" ? parsed.userId : undefined,
        };
    }
    catch {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
        return initialState;
    }
};

/**
 * @todo [Step 4] 请在下述一处代码缺失部分以正确设置 JWT 信息
 */
export const authSlice = createSlice({
    name: "auth",
    initialState,
    reducers: {
        hydrateAuth: (state, action: PayloadAction<AuthState>) => {
            state.token = action.payload.token;
            state.name = action.payload.name;
            state.role = action.payload.role;
            state.userId = action.payload.userId;
        },
        setToken: (state, action: PayloadAction<string>) => {
            state.token = action.payload;
            saveAuthToStorage({ token: state.token, name: state.name, role: state.role, userId: state.userId });
        },
        setName: (state, action: PayloadAction<string>) => {
            state.name = action.payload;
            saveAuthToStorage({ token: state.token, name: state.name, role: state.role, userId: state.userId });
        },
        setRole: (state, action: PayloadAction<string>) => {
            state.role = action.payload;
            saveAuthToStorage({ token: state.token, name: state.name, role: state.role, userId: state.userId });
        },
        setUserId: (state, action: PayloadAction<number | undefined>) => {
            state.userId = action.payload;
            saveAuthToStorage({ token: state.token, name: state.name, role: state.role, userId: state.userId });
        },
        resetAuth: (state) => {
            state.token = "";
            state.name = "";
            state.role = "";
            state.userId = undefined;
            saveAuthToStorage({ token: state.token, name: state.name, role: state.role, userId: state.userId });
        },
    },
});

export const { hydrateAuth, setToken, setName, setRole, setUserId, resetAuth } = authSlice.actions;
export default authSlice.reducer;
