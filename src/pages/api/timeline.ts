import type { NextApiRequest, NextApiResponse } from "next";

const BACKEND_BASE_URL = process.env.NODE_ENV !== "production"
    ? "http://127.0.0.1:8000"
    : process.env.BACKEND_URL || "http://backend.MentorFinder.secoder.local"; // 修改默认值为内部域名

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // 加上这一行调试信息，在 Secoder 日志里就能看到它到底在请求谁
    console.log(`[Proxy] Requesting backend: ${BACKEND_BASE_URL}/timeline/`);
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ code: -3, info: "Method Not Allowed" });
    }

    try {
        const response = await fetch(`${BACKEND_BASE_URL}/timeline/`, {
            method: "GET",
            headers: {
                Accept: "application/json",
            },
        });

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
            const text = await response.text();
            return res.status(502).json({
                code: -1,
                info: `Expected JSON from backend timeline API, got: ${text.slice(0, 120)}`,
            });
        }

        const data = await response.json();
        return res.status(response.status).json(data);
    }
    catch (error) {
        return res.status(502).json({
            code: -1,
            info: `Timeline proxy failed: ${String(error)}`,
        });
    }
}
