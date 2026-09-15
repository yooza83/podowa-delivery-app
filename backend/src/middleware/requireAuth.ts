import { Request, Response, NextFunction } from "express";

declare module "express-session" {
  interface SessionData {
    authed?: boolean;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session?.authed) {
    return next();
  }
  return res.status(401).json({ error: "로그인이 필요합니다." });
}
