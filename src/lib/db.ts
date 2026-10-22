import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  throw new Error("Missing MONGODB_URI in .env.local");
}

// Next.js dev mode reloads modules on every save.
// Cache the connection on globalThis so we don't open a new one each time.
type Cache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
const g = globalThis as unknown as { _mongoose?: Cache };
const cache: Cache = g._mongoose ?? (g._mongoose = { conn: null, promise: null });

export async function connectDB() {
  if (cache.conn) return cache.conn;
  if (!cache.promise) {
    cache.promise = mongoose.connect(MONGODB_URI!, { bufferCommands: false });
  }
  try {
    cache.conn = await cache.promise;
  } catch (err) {
    cache.promise = null; // allow retry on next call
    throw err;
  }
  return cache.conn;
}
