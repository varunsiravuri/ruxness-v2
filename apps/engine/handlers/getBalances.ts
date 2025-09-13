import type { GetUserBalCmd } from "../types";

type OpenOrder = {
  id: string;
  asset: string;
  margin: number; 
  type: "long" | "short";
};

type EngineState = {
  openOrders: Record<string, OpenOrder[]>;
};

const DEFAULT_DECIMALS = 4; 
const ALWAYS_EMIT_SYMS = ["BTC", "ETH", "SOL"]; 
export async function getBalances(
  cmd: GetUserBalCmd,
  state: EngineState
): Promise<Record<string, { balance: number; decimals: number }>> {
  const userId = String(cmd.userId ?? "");
  if (!userId) throw new Error("userId required");

  const orders = state.openOrders[userId] ?? [];
  const out: Record<string, { balance: number; decimals: number }> = {};

  for (const o of orders) {
    const sym = String(o.asset).toUpperCase();
    if (!out[sym]) out[sym] = { balance: 0, decimals: DEFAULT_DECIMALS };
    out[sym].balance += (o.type === "long" ? 1 : -1) * o.margin;
  }

  for (const sym of ALWAYS_EMIT_SYMS) {
    if (!out[sym]) out[sym] = { balance: 0, decimals: DEFAULT_DECIMALS };
  }

  return out;
}
