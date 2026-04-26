/**
 * @note 本文件是一个网络请求 wrapper 示例，其作用是将所有网络请求汇总到一个函数内处理
 *       我们推荐你在大作业中也尝试写一个网络请求 wrapper，本文件可以用作参考
 */

import store from "../redux/store";

export enum NetworkErrorType {
    UNAUTHORIZED,
    REJECTED,
    CORRUPTED_RESPONSE,
    UNKNOWN_ERROR,
}

export class NetworkError extends Error {
    type: NetworkErrorType;
    message: string;

    constructor(
        _type: NetworkErrorType,
        _message: string,
    ) {
        super(_message);

        this.type = _type;
        this.message = _message;
    }

    toString(): string { return this.message; }
    valueOf(): string { return this.message; }
}

export const request = async <T extends object = Record<string, unknown>>(
    url: string,
    method: "GET" | "POST" | "PUT" | "DELETE",
    needAuth: boolean,
    body?: object,
): Promise<T> => {
    const headers: Record<string, string> = {};

    if (body !== undefined) {
        headers["Content-Type"] = "application/json";
    }

    if (needAuth) {
        const token = store.getState().auth.token;

        if (token !== "") {
            headers.Authorization = `Bearer ${token}`;
        }
    }

    const response = await fetch(url, {
        method,
        body: body && JSON.stringify(body),
        headers,
    });

    const contentType = response.headers.get("content-type") || "";
    const rawBody = await response.text();
    let data: Record<string, unknown>;
    try {
        data = JSON.parse(rawBody);
    }
    catch {
        if (response.status === 200) {
            throw new NetworkError(
                NetworkErrorType.CORRUPTED_RESPONSE,
                `[${response.status}] Non-JSON response from ${url}, content-type=${contentType}, body=${rawBody.slice(0, 120)}`,
            );
        }

        throw new NetworkError(
            NetworkErrorType.UNKNOWN_ERROR,
            `[${response.status}] ${rawBody === "" ? "Empty response body" : rawBody}`,
        );
    }

    const code = Number(data.code);
    const info = String(data.info ?? "Unknown error");

    // HTTP status 401
    if (response.status === 401 && code === 2) {
        throw new NetworkError(
            NetworkErrorType.UNAUTHORIZED,
            "[401] " + info,
        );
    }
    else if (response.status === 401) {
        throw new NetworkError(
            NetworkErrorType.CORRUPTED_RESPONSE,
            "[401] " + info,
        );
    }

    // HTTP status 403
    if (response.status === 403 && code === 3) {
        throw new NetworkError(
            NetworkErrorType.REJECTED,
            "[403] " + info,
        );
    }
    else if (response.status === 403) {
        throw new NetworkError(
            NetworkErrorType.CORRUPTED_RESPONSE,
            "[403] " + info,
        );
    }

    // HTTP status 200
    if (response.status === 200 && code === 0) {
        return { ...data, code: undefined } as T;
    }
    else if (response.status === 200) {
        throw new NetworkError(
            NetworkErrorType.CORRUPTED_RESPONSE,
            "[200] " + info,
        );
    }

    /**
     * @note 这里的错误处理显然是粗糙的，根据 HTTP status 和 code 的不同应该有更精细的处理
     *       在大作业中，可以尝试编写更为精细的错误处理代码以理清网络请求逻辑
     */
    throw new NetworkError(
        NetworkErrorType.UNKNOWN_ERROR,
        `[${response.status}] ` + info,
    );
};
