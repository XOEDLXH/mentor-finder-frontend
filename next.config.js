/** @type {import('next').NextConfig} */
const backendBaseUrl = process.env.NODE_ENV !== "production"
    ? "http://127.0.0.1:8000"
    : (process.env.BACKEND_URL || "https://backend-mentorfinder.app.spring26a.secoder.net");

const nextConfig = {
    output: "standalone",
    reactStrictMode: false, /* @note: To prevent duplicated call of useEffect */
    // swcMinify: true,

    async rewrites() {
        return [{
            source: "/api/:path*",
            destination: `${backendBaseUrl}/:path*`,
        }];
    }
};

// eslint-disable-next-line no-undef
module.exports = nextConfig;
