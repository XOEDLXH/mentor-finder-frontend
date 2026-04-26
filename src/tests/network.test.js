import { NetworkError, NetworkErrorType, request } from "../utils/network";

const mockGetState = jest.fn();

jest.mock("../redux/store", () => ({
    __esModule: true,
    default: {
        getState: () => mockGetState(),
    },
}));

const getFetchMock = () => globalThis.fetch;
const createJsonResponse = (status, payload) => ({
    status,
    headers: {
        get: jest.fn((key) => (key === "content-type" ? "application/json" : undefined)),
    },
    text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
});

describe("request", () => {
    beforeEach(() => {
        mockGetState.mockReset();
        mockGetState.mockReturnValue({
            auth: {
                token: "",
                name: "",
            },
        });

        globalThis.fetch = jest.fn();
    });

    it("adds auth and content-type headers for authenticated POST request", async () => {
        mockGetState.mockReturnValue({
            auth: {
                token: "token-1",
                name: "alice",
            },
        });

        getFetchMock().mockResolvedValue({
            ...createJsonResponse(200, { code: 0, data: "ok" }),
        });

        const result = await request("/api/example", "POST", true, { value: 1 });

        expect(result).toEqual({
            code: undefined,
            data: "ok",
        });

        const options = getFetchMock().mock.calls[0][1];
        const headers = options.headers;

        expect(options.method).toBe("POST");
        expect(options.body).toBe(JSON.stringify({ value: 1 }));
        expect(headers["Content-Type"]).toBe("application/json");
        expect(headers.Authorization).toBe("Bearer token-1");
    });

    it("does not add authorization header when token is empty", async () => {
        getFetchMock().mockResolvedValue({
            ...createJsonResponse(200, { code: 0, data: "ok" }),
        });

        await request("/api/public", "GET", true);

        const options = getFetchMock().mock.calls[0][1];
        const headers = options.headers;

        expect(headers.Authorization).toBeUndefined();
    });

    it("throws unauthorized network error for 401 + code=2", async () => {
        getFetchMock().mockResolvedValue({
            ...createJsonResponse(401, { code: 2, info: "expired" }),
        });

        const pending = request("/api/private", "GET", true);

        await expect(pending).rejects.toBeInstanceOf(NetworkError);
        await expect(pending).rejects.toMatchObject({
            type: NetworkErrorType.UNAUTHORIZED,
            message: "[401] expired",
        });
    });

    it("throws corrupted response for 200 + non-zero code", async () => {
        getFetchMock().mockResolvedValue({
            ...createJsonResponse(200, { code: 9, info: "bad payload" }),
        });

        await expect(request("/api/example", "GET", false)).rejects.toMatchObject({
            type: NetworkErrorType.CORRUPTED_RESPONSE,
            message: "[200] bad payload",
        });
    });

    it("throws stable error for empty response body instead of crashing on json parse", async () => {
        getFetchMock().mockResolvedValue({
            status: 502,
            headers: {
                get: () => "text/plain",
            },
            text: jest.fn().mockResolvedValue(""),
        });

        await expect(request("/api/example", "GET", false)).rejects.toMatchObject({
            type: NetworkErrorType.UNKNOWN_ERROR,
            message: "[502] Empty response body",
        });
    });

    it("throws stable error for non-json response body", async () => {
        getFetchMock().mockResolvedValue({
            status: 502,
            headers: {
                get: () => "text/html",
            },
            text: jest.fn().mockResolvedValue("<html>Bad Gateway</html>"),
        });

        await expect(request("/api/example", "GET", false)).rejects.toMatchObject({
            type: NetworkErrorType.UNKNOWN_ERROR,
            message: "[502] <html>Bad Gateway</html>",
        });
    });
});
