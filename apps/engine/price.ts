import { createClient } from "redis";

export function makeGetPrice(redisUrl: string) {
  const r = createClient({ url: redisUrl });
  let ready = false;
  async function ensure() {
    if (!ready) {
      await r.connect();
      ready = true;
    }
  }

  return async function getPrice(asset: string): Promise<number> {
    await ensure();
    const h = await r.hGetAll(`px:${asset.toUpperCase()}`);
    if (!h?.price || !h?.decimal) {
      throw new Error(`price not available for ${asset} (px:${asset})`);
    }
    const p = Number(h.price);
    const d = Number(h.decimal);
    return p / Math.pow(10, d);
  };
}
