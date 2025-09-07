import { createClient, type RedisClientType } from "redis";

export const CALLBACK_QUEUE = "callback-queue";

type Resolve = (v: any) => void;

type SubscriberOpts = {
  url?: string;
};

export class RedisSubscriber {
  private client: RedisClientType;
  private resolvers: Map<string, Resolve> = new Map();

  constructor(opts: SubscriberOpts = {}) {
    this.client = createClient({
      url: opts.url ?? "redis://localhost:6380",
    });
    this.client
      .connect()
      .then(() => this.runLoop())
      .catch(console.error);
  }

  async quit() {
    try {
      await this.client.quit();
    } catch {}
  }

  private async runLoop() {
    let lastId = "$";

    for (;;) {
      try {
        const resp = await this.client.xRead(
          [{ key: CALLBACK_QUEUE, id: lastId }],
          { BLOCK: 0, COUNT: 10 }
        );
        if (!resp) continue;

        const stream = resp[0];
        for (const msg of stream.messages) {
          lastId = msg.id;
          const raw = (msg.message as any).message ?? msg.message;
          let payload: any = null;
          try {
            payload = typeof raw === "string" ? JSON.parse(raw) : raw;
          } catch {
            payload = msg.message;
          }

          const id = payload?.id;
          const resolve = id ? this.resolvers.get(id) : undefined;

          if (resolve) {
            this.resolvers.delete(id);
            resolve(payload);
          } else {
          }
        }
      } catch (e) {
        console.error("[subscriber] read error:", e);
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  }

  waitForMessage(id: string, timeoutMs = 0): Promise<any> {
    return new Promise((resolve, reject) => {
      this.resolvers.set(id, resolve);

      if (timeoutMs > 0) {
        const t = setTimeout(() => {
          if (this.resolvers.has(id)) {
            this.resolvers.delete(id);
            reject(new Error("timeout"));
          }
        }, timeoutMs);
        
        const originalResolve = resolve;
        this.resolvers.set(id, (value: any) => {
          clearTimeout(t);
          originalResolve(value);
        });
      }
    });
  }
}
