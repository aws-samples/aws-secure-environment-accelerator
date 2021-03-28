FROM node:12.21-slim as builder
RUN npm install --global pnpm

RUN mkdir /app
ADD ./package.json /app/package.json
ADD ./pnpm-lock.yaml /app/pnpm-lock.yaml
ADD ./pnpm-workspace.yaml /app/pnpm-workspace.yaml
ADD ./reference-artifacts /app/reference-artifacts
ADD ./src /app/src
WORKDIR /app
RUN pnpm install --unsafe-perm --frozen-lockfile

FROM node:12.21-slim
RUN mkdir /app
COPY --from=builder /app /app
WORKDIR /app/src/deployments/cdk
ENTRYPOINT ["sh","codebuild-deploy.sh"]