FROM node:25-trixie-slim
WORKDIR /app

COPY . /app
RUN apt update && apt install -y ca-certificates
# pnpm 8 matches the committed lockfile format(lockfileVersion 6.0); newer
# majors rewrite it and break `--frozen-lockfile`.
RUN npm i -g pnpm@8
RUN pnpm install --frozen-lockfile

EXPOSE 3000

CMD ["pnpm", "start"]