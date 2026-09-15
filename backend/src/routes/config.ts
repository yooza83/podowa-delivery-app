import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();

/**
 * 프론트엔드가 필요로 하는 '공개용' 정보만 반환.
 * TMap JS 지도 키는 여기서 내려주지 않는다 — frontend/.env의 VITE_TMAP_JS_APP_KEY로
 * 빌드 타임에 이미 index.html에 심어져 있다(동적 script 삽입 시 SDK 내부의
 * document.write가 브라우저에 막히는 문제 때문에 정적 태그로 로드해야 함).
 * TMAP_REST_APP_KEY(지오코딩/경로최적화용 비밀 키)는 여기 절대 포함하지 않는다.
 */
router.get("/", requireAuth, (_req, res) => {
  res.json({
    farmName: process.env.FARM_NAME || "농장",
    farmAddress: process.env.FARM_ADDRESS || "",
  });
});

export default router;
