import { Router } from "express";
import { randomUUID } from "crypto";
import { Resend } from "resend";
import { prisma } from "@ruxness/db";

export function authRoutes(redis: any) {
  const r = Router();
  const resend = new Resend(process.env.RESEND_API_KEY!);

  r.post("/magic", async (req, res, next) => {
    try {
      const email = String(req.body?.email ?? "")
        .trim()
        .toLowerCase();
      if (!email.includes("@"))
        return res.status(400).json({ error: "invalid email" });

      const token = randomUUID();
      await redis.setEx(`auth:token:${token}`, 300, email);
      const link = `${process.env.APP_URL}/api/v1/auth/callback?token=${token}`;

      await resend.emails.send({
        from: "onboarding@resend.dev",
        to: email,
        subject: "Sign in",
        html: `<a href="${link}">Click to sign in</a>`,
      });

      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  r.get("/callback", async (req, res) => {
    const token = String(req.query?.token ?? "");
    const email = await redis.get(`auth:token:${token}`);
    if (!email) return res.status(400).send("Invalid or expired link");

    await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, usdBalanceCents: 0 },
    });

    const sid = randomUUID();
    await redis.setEx(`auth:sid:${sid}`, 2 * 86400, email);

    res.cookie("ssid", sid, { httpOnly: true, sameSite: "lax" });
    res.send("Signed in ✔️");
  });

  return r;
}
