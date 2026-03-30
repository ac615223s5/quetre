FROM node:25-trixie-slim
WORKDIR /app

COPY . /app
RUN apt update && apt install -y ca-certificates
RUN npm i -g pnpm
RUN pnpm install

EXPOSE 3000

CMD ["pnpm", "start"]