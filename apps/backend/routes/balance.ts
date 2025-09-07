import { Router } from "express";

type Bus = ReturnType<typeof import("../lib/bus").makeBus>;

export function balanceRoutes(bus: Bus) {
  const r = Router();

  //balnce  in  usd 
  r.get("/usd", async (_req, res) => {
    try {
      const reply = await bus.send("get-balance-usd", {});
      return res.json({ balance: reply.balance });

    } catch {
      return res.status(504).json({ error: "engine timeout" });
    }
  });
  // get all blncs
  const allBalances = async (_req: any, res: any) => {
    try {
      const reply = await bus.send("get-balances", {});
      return res.json(reply);

    } catch {
      return res.status(504).json({ error: "engine timeout" });
    }
  };

  r.get("", allBalances);

  return r;
}
