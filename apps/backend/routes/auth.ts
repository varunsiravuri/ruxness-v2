import { Router } from "express";
import { randomUUID } from "node:crypto";
import { prisma } from "@ruxness/db";
import { sendMagicLink } from "../lib/mail";
import type { RedisClientType } from "redis";

type Redis = RedisClientType;

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const COOKIE_NAME = process.env.COOKIE_NAME ?? "ssid";
const TOKEN_TTL_S = 10 * 60;
<<<<<<< HEAD
const SESSION_TTL_S = 10 * 24 * 3600;
=======
const SESSION_TTL_S = 5 * 24 * 3600;
>>>>>>> 0f6789623b3999f4abbdb26c3318ffb023ff4853

export function authRoutes(redis: Redis) {
  const r = Router();
  r.post("/magic", async (req, res) => {
    const email = String(req.body?.email ?? "")
      .trim()
      .toLowerCase();
    if (!email || !email.includes("@")) {
      return res.status(400).json({ ok: false, error: "invalid email" });
    }

    const token = randomUUID();
    await redis.setEx(`auth:token:${token}`, TOKEN_TTL_S, email);
    const url = `${APP_URL}/api/v1/auth/callback?token=${token}`;
<<<<<<< HEAD
    console.log("[magic] about to respond", { email, url });
=======

>>>>>>> 0f6789623b3999f4abbdb26c3318ffb023ff4853
    res.json({ ok: true, dev_link: url });

    const send = sendMagicLink(email, url);
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("send timeout")), 3000)
    );
    Promise.race([send, timeout])
      .then(() => console.log("[mail] queued"))
      .catch((e) => console.warn("[mail] sendMagicLink failed:", e));
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
      create: { email, name: email.split("@")[0], usdBalanceCents: 0 , password: null },
    });

    const sid = randomUUID();
    await redis.setEx(`auth:sid:${sid}`, SESSION_TTL_S, email);
    console.log("[auth] wrote session", `auth:sid:${sid}`, "->", email);

    res.cookie(COOKIE_NAME, sid, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: SESSION_TTL_S * 1000,
      path: "/",
    });

<<<<<<< HEAD
    res.redirect("http://localhost:3200/marketplace");
=======
    res.status(200).send(`<html><body style="font-family:system-ui">
               <h3>Signed in</h3>
               <p>You Can Close this Bro</p>
             </body></html>`);
>>>>>>> 0f6789623b3999f4abbdb26c3318ffb023ff4853
  });
  r.post("/testinner", (req, res) => res.json({ postInner: true }));

  r.get("/testinner", (_req, res) => res.json({ inner: true }));

  return r;
}
