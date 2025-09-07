export type Cmd =
  | {
      id: string;
      kind: "create-position";
      asset: string;
      type: "long" | "short";
      margin: number;
      leverage: number;
      slippage?: number;
    }
  | { id: string; kind: "close-position"; orderId: string }
  | { id: string; kind: "get-balance-usd" }
  | { id: string; kind: "get-balances" };

export type CreatePositionCmd = {
  asset: string;
  margin: number;
  leverage: number;
  type: "buy" | "sell";
};

export type ClosePositionCmd = {
  orderId: string;
};
export type Reply = any;
