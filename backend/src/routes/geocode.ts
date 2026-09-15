import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { geocodeAddress } from "../services/tmapClient";
import { getCached, setCached } from "../store/geocodeCache";

const router = Router();

/**
 * body: { addresses: string[] }
 * 개인정보 최소화: '주소 문자열'만 받는다. 고객명/연락처 필드는 절대 받지 않음.
 */
router.post("/", requireAuth, async (req, res) => {
  const addresses: unknown = req.body?.addresses;
  if (!Array.isArray(addresses) || addresses.length === 0) {
    return res.status(400).json({ error: "addresses 배열이 필요합니다." });
  }
  if (addresses.length > 200) {
    return res.status(400).json({ error: "한 번에 최대 200건까지 처리할 수 있습니다." });
  }

  try {
    const results = await Promise.all(
      addresses.map(async (raw) => {
        const address = String(raw ?? "").trim();
        if (!address) {
          return { address, ok: false, message: "빈 주소" };
        }
        const cached = getCached(address);
        if (cached) {
          return { address, ok: true, lat: cached.lat, lng: cached.lng, fromCache: true };
        }
        // geocodeAddress는 내부적으로 에러를 잡아 {ok:false} 형태로 반환하므로 여기서 throw될 일은
        // 거의 없지만, 한 건의 예외가 서버 전체(다른 가족의 요청)를 죽이지 않도록 한 번 더 방어한다.
        try {
          const result = await geocodeAddress(address);
          if (result.ok && result.lat !== undefined && result.lng !== undefined) {
            setCached(address, result.lat, result.lng);
          }
          return result;
        } catch (err: any) {
          return { address, ok: false, message: err?.message || "지오코딩 오류" };
        }
      })
    );
    res.json({ results });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "지오코딩 처리 중 오류가 발생했습니다." });
  }
});

export default router;
