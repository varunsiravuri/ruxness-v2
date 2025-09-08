import { Router } from "express";
import { randomUUID } from "node:crypto";
import { prisma } from "@ruxness/db";
import { sendMagicLink } from "../lib/mail";
import type { RedisClientType } from "redis";

type Redis = RedisClientType;

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const COOKIE_NAME = process.env.COOKIE_NAME ?? "ssid";
const TOKEN_TTL_S = 5 * 60; 
const SESSION_TTL_S = 5 * 24 * 3600;

export function authRoutes(redis: Redis) {
  const r = Router();

  r.post("/magic", async (req, res, next) => {
    try {
      const email = String(req.body?.email ?? "")
        .trim()
        .toLowerCase();
      if (!email || !email.includes("@")) {
        return res.status(400).json({ ok: false, error: "invalid email" });
      }
      const token = randomUUID();
      await redis.setEx(`auth:token:${token}`, TOKEN_TTL_S, email);
      const url = `${APP_URL}/api/v1/auth/callback?token=${token}`;
      await sendMagicLink(email, url);
      res.json({ ok: true, dev_link: url });
    } catch (e) {
      console.error("[auth] sendMagicLink failed:", e);
      res.json({ ok: true});
    }
  });

  r.get("/callback", async (req, res) => {
    const token = String(req.query?.token ?? "");
    if (!token) return res.status(400).send("Token is Missing Bro");

    const email = await redis.get(`auth:token:${token}`);
    if (!email) return res.status(400).send("Link Expired Bhaiya");
    await redis.del(`auth:token:${token}`);
    
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, usdBalanceCents: 0 },
    });

    const sid = randomUUID();
    await redis.setEx(`auth:sid:${sid}`, SESSION_TTL_S, email);

    res.cookie(COOKIE_NAME, sid, {
      httpOnly: true,
      sameSite: "lax",
      secure: false, 
      maxAge: SESSION_TTL_S * 1000,
      path: "/",
    });

    res.status(200).send(`<html><body style="font-family:system-ui">
               <h3>Signed in</h3>
               <p>You Can Close this Bhaiya</p>
             </body></html>`);
  });

  return r;
}
