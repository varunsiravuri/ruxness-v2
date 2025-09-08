import type { Request, Response, NextFunction } from "express";
import { prisma } from "@ruxness/db";

function getCookie(req: Request, name: string) {
  const raw = req.headers.cookie || "";
  const m = raw
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="));
  return m ? decodeURIComponent(m.split("=").slice(1).join("=")) : undefined;
}

type Redis = ReturnType<typeof import("../lib/bus").makeBus>["redis"];
const COOKIE_NAME = process.env.COOKIE_NAME ?? "ssid";

export function makeRequireUser(redis: Redis) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sid = getCookie(req, COOKIE_NAME);
      if (!sid) return res.status(401).json({ ok: false, error: "Session nahi hai " });

      const email = await redis.get(`auth:sid:${sid}`);
      if (!email)
        return res.status(401).json({ ok: false, error: "Expire Date done" });

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user)
        return res.status(401).json({ ok: false, error: "User Idhar Nahi hai" });

      (req as any).user = { id: user.id, email: user.email };
      next();
    } catch (e: any) {
      res.status(401).json({ ok: false, error: "UN- Authorizeddd" });
    }
  };
}
