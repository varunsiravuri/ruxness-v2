import WebSocket from "ws";
import Redis from 'ioredis';

const WS_URL = "wss://ws.backpack.exchange/";
const ws = new WebSocket(WS_URL);
const STREAM_KEY = process.env.STREAM_KEY ?? "prices:updates";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6380";
const redis = new Redis(REDIS_URL);

const MARKETS = [
  { ex: "BTC_USDC_PERP", asset: "BTC", d: 4 },
  { ex: "ETH_USDC_PERP", asset: "ETH", d: 4 },
  { ex: "SOL_USDC_PERP", asset: "SOL", d: 6 },
];

type Rec = { bid: number; ask: number; ts: number };
const latest: Record<string, Rec | undefined> = {};
const track = new Set<string>();
let peek = 2;

ws.addEventListener("open", () => {
  const params = MARKETS.map((m) => `bookTicker.${m.ex}`);
  ws.send(
    JSON.stringify({
      method: "SUBSCRIBE",
      params,
      id: 1,
    })
  );
  console.log("[open] subscribed:", params.join(", "));
});

ws.addEventListener("message", (ev) => {
  const raw =
    typeof ev.data === "string"
      ? ev.data
      : ev.data instanceof ArrayBuffer
        ? new TextDecoder().decode(ev.data)
        : String(ev.data);
  if (peek > 0) {
    console.log("[raw]", raw.toString());
    peek--;
  }
  try {
    const m = JSON.parse(raw);
    const d = m?.data;
    if (!d?.s || !d?.a || !d?.b) return;
    const sym = String(d.s).toUpperCase();
    const meta = MARKETS.find((x) => x.ex === sym);
    if (!meta) return;
    latest[meta.asset] = {
      bid: +d.b,
      ask: +d.a,
      ts: d.ts ?? Date.now(),
    };
    track.add(meta.asset);
  } catch {}
});

ws.addEventListener("error", (e) => console.error("[ws:error]", e));

ws.addEventListener("close", (e) => console.warn("[ws:close]", e.code, e.reason));


setInterval(async () => {
  if (track.size === 0) return;
  const out = {
    price_updates: [] as Array<{
      asset: string;
      price: number;
      decimal: number;
    }>,
  };
  const pipe = redis.pipeline();
  for (const a of track) {
    const r = latest[a]!;
    const d = MARKETS.find((x) => x.asset === a)!.d;
    const mid = (r.bid + r.ask) / 2;
    const ts = Date.now();
    out.price_updates.push({
      asset: a,
      price: Math.round(mid * 10 ** d),
      decimal: d,
    });
    const key = `px:${a}`;
    pipe.hset(key, {
      price: Math.round(mid * 10 ** d),
      decimal: d,
      ts: String(ts),
    });

    pipe.expire(key, 60);

  }
  track.clear();
  pipe.xadd(STREAM_KEY, "*", "payload", JSON.stringify(out));
  
  try {
    await pipe.exec();
  } catch (err) {
    console.error("[poller] pipeline error", err);
  }
}, 100);
