import { Router } from "express";

const router = Router();

router.post("/login", (req, res) => {
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
