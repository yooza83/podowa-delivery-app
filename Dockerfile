# ── 1단계: 프론트엔드 빌드 ─────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
# TMap 지도 표시용 키(공개용). 클라우드 배포 시 frontend/.env 파일을 커밋하는 대신
# 빌드 인자로 넘긴다 — 호스팅 플랫폼의 "Build Arguments/Args" 설정에 지정하면 된다
# (예: docker build --build-arg VITE_TMAP_JS_APP_KEY=xxx).
ARG VITE_TMAP_JS_APP_KEY
ENV VITE_TMAP_JS_APP_KEY=$VITE_TMAP_JS_APP_KEY
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── 2단계: 백엔드 빌드(TypeScript → JS) ──────────────────
FROM node:20-alpine AS backend-build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# ── 3단계: 실행 이미지 (프론트 정적파일 + 백엔드가 함께 서빙) ─
FROM node:20-alpine
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY --from=backend-build /app/backend/dist ./dist
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

CMD ["node", "dist/server.js"]
