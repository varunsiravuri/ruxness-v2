import { Router } from "express";

type Bus = ReturnType<typeof import("../lib/bus").makeBus>;

export function balanceRoutes(bus: Bus) {
  const r = Router();

  r.get("/usd", async (_req, res) => {
    try {
      const userId = (_req as any).user?.id;
      const reply = await bus.send("get-balance-usd", {userId});
      return res.json({ balance: reply.balance ?? 0 });

    } catch {
      return res.status(504).json({ error: "engine timeout" });
    }
  });

  const allBalances = async (_req: any, res: any) => {
    try {
      const userId = (_req as any).user?.id;
      const reply = await bus.send("get-balances", { userId });
      return res.json(reply);

    } catch {
      return res.status(504).json({ error: "engine timeout" });
    }
  };

  r.get("", allBalances);

  return r;
}
