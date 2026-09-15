import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { optimizeThreeWays } from "../services/tmapClient";

const router = Router();

/**
 * body: {
 *   start: { name: string, lat: number, lng: number },
 *   waypoints: [{ id: string, lat: number, lng: number }, ...]
 * }
 * 개인정보 최소화: 좌표 + 임시 id만 받는다. 고객명/연락처는 절대 받지 않음
 * (id는 프론트에서 결과를 다시 이름과 매칭시키기 위한 임시 키일 뿐).
 */
router.post("/", requireAuth, async (req, res) => {
  const { start, waypoints } = req.body || {};

  if (
    !start ||
    typeof start.lat !== "number" ||
    typeof start.lng !== "number"
  ) {
    return res.status(400).json({ error: "start(lat,lng)가 필요합니다." });
  }
  if (!Array.isArray(waypoints) || waypoints.length === 0) {
    return res.status(400).json({ error: "waypoints 배열이 필요합니다." });
  }
  for (const w of waypoints) {
    if (!w || typeof w.id !== "string" || typeof w.lat !== "number" || typeof w.lng !== "number") {
      return res.status(400).json({ error: "waypoints의 각 항목은 {id, lat, lng} 형식이어야 합니다." });
    }
  }

  try {
    const results = await optimizeThreeWays(
      { name: start.name || "출발지", lat: start.lat, lng: start.lng },
      waypoints
    );
    res.json({ results });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "경로 최적화 실패" });
  }
});

export default router;
