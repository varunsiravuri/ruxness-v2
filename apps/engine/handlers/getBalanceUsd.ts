import type { GetUserBalCmd } from "../types";

type EngineState = {
  balances: Record<string, { balance: number; decimal: number }>;
};

export async function getBalanceUsd(
  cmd: GetUserBalCmd,
  state: EngineState
): Promise<{ balance: number; decimal: number }> {
  const userId = String(cmd.userId ?? "");
  if (!userId) throw new Error("userId required");

  const entry = state.balances[userId];
  if (!entry) {
    return { balance: 0, decimal: 2 };
  }
  return { balance: entry.balance, decimal: entry.decimal };
}
