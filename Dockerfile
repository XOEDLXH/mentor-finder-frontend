FROM node:22 AS builder

WORKDIR /build

ENV BACKEND_URL https://backend-mentorfinder.app.spring26a.secoder.net

RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml ./

RUN pnpm config set registry https://registry.npmmirror.com

RUN pnpm install

COPY . .

RUN pnpm build

FROM node:22 AS runner

WORKDIR /app

COPY --from=builder /build/.next/standalone .

COPY --from=builder /build/.next/static .next/static

COPY --from=builder /build/public public

ENV PORT 80

EXPOSE 80

CMD ["node", "server.js"]
