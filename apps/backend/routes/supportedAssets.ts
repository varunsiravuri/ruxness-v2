import { Router } from "express";

export function supportedAssetsRoutes() {
  const r = Router();

  // spprt assets 
  r.get("/supportedAssets", (_req, res) => {
    res.json({
      assets: [
        { symbol: "BTC", name: "Bitcoin" },
        { symbol: "ETH", name: "Ethereum" },
        { symbol: "SOL", name: "Solana" },
      ],
    });
  });

  return r;
}
