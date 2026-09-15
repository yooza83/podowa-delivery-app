import { Router } from "express";
import rateLimit from "express-rate-limit";

const router = Router();

// 인터넷에 공개된 서버이므로 비밀번호 무작위 대입 공격을 막기 위한 시도 횟수 제한.
// IP당 15분에 10번까지만 로그인 시도 허용.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "로그인 시도가 너무 많습니다. 15분 후 다시 시도해 주세요." },
});

router.post("/login", loginLimiter, (req, res) => {
  const { password } = req.body || {};
  const shared = process.env.SHARED_PASSWORD || "";

  if (!shared) {
    return res
      .status(500)
      .json({ error: "서버에 SHARED_PASSWORD가 설정되지 않았습니다." });
  }
  if (password !== shared) {
    return res.status(401).json({ error: "비밀번호가 올바르지 않습니다." });
  }
  req.session.authed = true;
  res.json({ ok: true });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get("/me", (req, res) => {
  res.json({ authed: Boolean(req.session?.authed) });
});

export default router;
