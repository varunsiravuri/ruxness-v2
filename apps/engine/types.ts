export type Side = "long" | "short";

export type PriceUpdate = {
  asset: string; 
  price: number; 
  decimal: number;
};

export type StreamPriceBatch = {
  price_updates: PriceUpdate[];
};

export type Bal = { balance: number; decimal: number };
export type Px = { mid: number; decimal: number; ts: number };

export type OpenOrder = {
  id: string;
  userId: string;
  asset: string;
  side: Side;
  leverage: number;
  margin: number; 
  quantity: number; 
  openPrice: number;
  closePrice?: number; 
  pnl?: number;
  liquidated?: boolean;
  decimal: number;
};

export type CreateCmd = {
  kind: "trade-open";
  id: string; 
  userId: string;
  asset: string;
  type: Side; 
  margin: number; 
  leverage: number;
  slippage?: number; 
  expectedPrice?: number;
};

export type CloseCmd = {
  kind: "trade-close";
  id: string;
  userId: string;
  orderId: string;
};

export type GetUserBalCmd = {
  kind: "get-user-bal";
  id: string;
  userId: string;
};
