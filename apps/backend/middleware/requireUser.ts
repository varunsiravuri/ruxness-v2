import type { Request, Response, NextFunction } from "express";
import { prisma } from "@ruxness/db";
import type { RedisClientType } from "redis";

export function makeRequireUser(redis: RedisClientType) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const sid = req.cookies?.ssid;
    if (!sid)
      return res.status(401).json({ ok: false, error: "Session nahi hai " });

    const email = await redis.get(`auth:sid:${sid}`);
    if (!email)
      return res.status(401).json({ ok: false, error: "Session nahi hai " });

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });
    if (!user)
      return res.status(401).json({ ok: false, error: "User missing" });

    (req as any).user = user;
    next();
  };
}
