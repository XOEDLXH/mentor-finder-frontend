import authReducer, { resetAuth, setName, setToken } from "../redux/auth";

describe("auth reducer", () => {
    it("returns initial state for unknown action", () => {
        const state = authReducer(undefined, { type: "unknown/action" });

        expect(state).toEqual({
            token: "",
            name: "",
        });
    });

    it("sets token and user name", () => {
        let state = authReducer(undefined, { type: "unknown/action" });

        state = authReducer(state, setToken("jwt-token"));
        state = authReducer(state, setName("alice"));

        expect(state).toEqual({
            token: "jwt-token",
            name: "alice",
        });
    });

    it("resets auth state", () => {
        const stateWithAuth = {
            token: "jwt-token",
            name: "alice",
        };

        const state = authReducer(stateWithAuth, resetAuth());

        expect(state).toEqual({
            token: "",
            name: "",
        });
    });
});
