import express from "express";
import path from "path";
import cors from "cors";
import { initDB } from "./db.js";
import { PORT } from "./config.js";
import authRouter from "./routes/auth.js";
import crudRouter from "./routes/crud.js";
import syncRouter from "./routes/sync.js";
import { cronSync } from "./scrapers/petrolimex.js";
import { getVietnamDateTimeParts } from "./utils/vietnamTime.js";

const app = express();
app.use(cors());
app.use(express.json());

const FRONTEND_DIR = path.join(import.meta.dirname, "..", "frontend");

// Serve legacy bao-gia static app
const quotationAppPath = path.join(FRONTEND_DIR, "public", "bao-gia");
app.use("/bao-gia", express.static(quotationAppPath));

// Mount routers
app.use("/api/auth",  authRouter);
app.use("/api",       crudRouter);
app.use("/api",       syncRouter);

// ─── Daily 7:00 AM (Vietnam time) Scheduler ─────────────────────────────────
function startDailyScheduler() {
  const SYNC_HOUR = 6;   // 6:00 sáng giờ Việt Nam
  const SYNC_MINUTE = 0;

  function scheduleNext() {
    const now = new Date();
    const vn = getVietnamDateTimeParts(now);

    // Build target 07:00:00 today in UTC+7
    const pad = (n: number) => String(n).padStart(2, "0");
    let target = new Date(
      `${vn.year}-${pad(vn.month)}-${pad(vn.day)}T${pad(SYNC_HOUR)}:${pad(SYNC_MINUTE)}:00+07:00`
    );

    // If target is already past, schedule for tomorrow
    if (target.getTime() <= now.getTime()) {
      target = new Date(target.getTime() + 24 * 60 * 60 * 1000);
    }

    const delay = target.getTime() - now.getTime();
    const nextStr = target.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
    console.log(`[Scheduler] ⏰ Đồng bộ giá tiếp theo lúc ${nextStr} (sau ${Math.round(delay / 60000)} phút)`);

    setTimeout(async () => {
      await cronSync();
      scheduleNext();
    }, delay);
  }

  scheduleNext();
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────
async function bootstrap() {
  // 1. Init database (PostgreSQL hoặc In-Memory tùy công tắc trong db.ts)
  await initDB();

  // 2. Seed default data (chỉ chạy khi dùng PostgreSQL — memory mode đã seed sẵn)
  try {
    const { ensureSeeded } = await import("./seed.js");
    await ensureSeeded();
  } catch (e: any) {
    console.log("[DB] ⚙️ Bỏ qua seed (đang dùng in-memory mode):", e.message?.slice(0, 80));
  }

  // 3. Start daily price sync scheduler
  startDailyScheduler();

  // 4. Dev or production mode
  if (process.env.NODE_ENV !== "production") {
    const viteModule = await import("vite");
    const vite = await viteModule.createServer({
      root: FRONTEND_DIR,
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`[DEV] Server running on http://localhost:${PORT}`);
    });
  } else {
    const distPath = path.join(FRONTEND_DIR, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      if (req.path.startsWith("/api")) return;
      res.sendFile(path.join(distPath, "index.html"));
    });
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`[PRODUCTION] Server running on http://localhost:${PORT}`);
    });
  }
}

bootstrap().catch((err) => {
  console.error("[FATAL] Server failed to start:", err);
  process.exit(1);
});
