import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import express from "express";
import session from "express-session";
import cors from "cors";

dotenv.config();

import authRoutes from "./routes/auth";
import configRoutes from "./routes/config";
import geocodeRoutes from "./routes/geocode";
import optimizeRoutes from "./routes/optimize";
import { sweepExpired } from "./store/geocodeCache";

// 마지막 안전장치: 코드 어딘가에서 놓친 Promise rejection이 있어도(Node 기본 동작은 프로세스 종료)
// 가족이 함께 쓰는 서버가 전체 다운되지 않도록 로그만 남기고 계속 실행한다.
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

const app = express();
const PORT = Number(process.env.PORT || 4000);
const isProd = process.env.NODE_ENV === "production";
// HTTPS 뒤에 배포했다면 true(기본값)로 두세요. 예외적으로 HTTP로만 서비스해야 한다면
// .env에 COOKIE_SECURE=0을 추가하세요(이 경우 로그인 쿠키가 암호화되지 않은 채로 오가니 주의).
const cookieSecure = process.env.COOKIE_SECURE === "0" ? false : isProd;

app.use(express.json({ limit: "2mb" }));

if (!isProd) {
  // 개발 중에는 프론트(vite dev server, 보통 5173포트)가 다른 포트에서 돌므로 CORS 허용
  app.use(
    cors({
      origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/],
      credentials: true,
    })
  );
}

app.set("trust proxy", 1);
app.use(
  session({
    name: "podowa.sid",
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: cookieSecure,
      maxAge: 1000 * 60 * 60 * 12, // 12시간
    },
  })
);

app.use("/api/auth", authRoutes);
app.use("/api/config", configRoutes);
app.use("/api/geocode", geocodeRoutes);
app.use("/api/optimize", optimizeRoutes);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// 방어적 안전장치: 라우트 어딘가에서 놓친 에러가 있어도 JSON 500으로 응답하고
// 프로세스 전체(=다른 가족이 쓰는 서버)가 죽지 않도록 한다.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[unhandled route error]", err);
  if (res.headersSent) return;
  res.status(500).json({ error: "서버 오류가 발생했습니다." });
});

// 빌드된 프론트 정적 파일 서빙 (frontend/dist → backend가 함께 서빙)
const frontendDist = path.join(__dirname, "..", "..", "frontend", "dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

// TMap 데이터 보관 정책(24시간 이내) 준수를 위한 주기적 캐시 청소
setInterval(() => {
  const removed = sweepExpired();
  if (removed > 0) console.log(`[geocodeCache] 만료 항목 ${removed}건 폐기`);
}, 30 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`포도와농장 배송앱 서버 실행 중: http://localhost:${PORT}`);
});
