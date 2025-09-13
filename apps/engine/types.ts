export type Side = "long" | "short";

export type CreatePositionCmd = {
  userId: string;
  asset: string;
  type: Side; 
  margin: number; 
  leverage: number; 
  slippage?: number; 
};

export type ClosePositionCmd = {
  userId: string;
  orderId: string;
};

export type GetUserBalCmd = {
  userId: string;
};

export type PriceUpdate = {
  symbol: string; 
  bid: number; 
  ask: number;
  decimal: number;
  ts: number;
};

export type OpenOrder = {
  id: string;
  userId: string;
  asset: string;
  type: Side;
  margin: number;
  leverage: number;
  qty: number;
  openPrice: number;
  liquidated?: boolean;
  pnl?: number;
  closePrice?: number | null;
};

export type Bal = { balance: number; decimal: number };

export type EngineReply =
  | { ok: true; orderId: string }
  | { ok: true; pnl: number; balance_usd?: number }
  | Record<string, { balance: number; decimals: number }>
  | { balance: number }
  | { ok: false; error: string };
