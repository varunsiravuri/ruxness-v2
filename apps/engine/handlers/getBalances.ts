import type { GetUserBalCmd } from "../types";

type OpenOrder = {
  id: string;
  asset: string;
  side: "long" | "short";
  margin: number;
  leverage: number;
  quantity: number;
  openPrice: number;
  closePrice?: number;
  pnl?: number;
  liquidated?: boolean;
};

type EngineState = {
  balances: Record<string, { balance: number; decimal: number }>;
  openOrders: Record<string, OpenOrder[]>;
};

const ALWAYS_EMIT_SYMS = ["BTC", "ETH", "SOL"];

export async function getBalances(
  cmd: GetUserBalCmd,
  state: EngineState
): Promise<Record<string, { balance: number; decimals: number }>> {
  const userId = String(cmd.userId ?? "");
  if (!userId) throw new Error("userId required");

  const out: Record<string, { balance: number; decimals: number }> = {};
  for (const sym of ALWAYS_EMIT_SYMS) {
    out[sym] = { balance: 0, decimals: sym === "SOL" ? 6 : 4 };
  }
  const orders = state.openOrders[userId] ?? [];
  for (const o of orders) {
    const sym = o.asset.toUpperCase();
    if (!out[sym]) out[sym] = { balance: 0, decimals: 4 };
    out[sym].balance += o.margin;
  }

  return out;
}
