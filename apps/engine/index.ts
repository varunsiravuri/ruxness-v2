import { Engine } from "./engineClass";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6380";
const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017";
const DB_NAME = process.env.DB_NAME ?? "ruxness";

async function main() {
  const engine = new Engine(REDIS_URL, MONGO_URI, DB_NAME);
  await engine.start();
}

main().catch((e) => {
  console.error("[engine] fatal", e);
  process.exit(1);
});
