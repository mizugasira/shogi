// server/express.ts
import express from "express";
import cors from "cors";
import type { Request, Response } from "express";

// グローバル例外ハンドラ（エラー内容を明確に出力）
process.on("uncaughtException", (err) => {
  console.error("💥 Uncaught Exception:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("💥 Unhandled Rejection:", reason);
});

// フロントで使っている ai-core.ts をそのままサーバーで使用
// 👉 ESMでは「.js」拡張子で指定する必要があります
import { think, unpack, type InputState } from "../src/ai-core";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.post("/api/think", (req: Request, res: Response) => {
  try {
    const body = req.body as InputState & { timeMs?: number };
    // 必須チェック（最低限）
    if (!body || !body.board || !body.handBlack || !body.handWhite || !body.turn) {
      return res.status(400).json({ error: "invalid body" });
    }

    const packed = think(
      body.board,
      body.handBlack,
      body.handWhite,
      body.turn,
      body.timeMs ?? 1500
    );

    if (!packed) return res.json({ move: null });

    const move = unpack(packed, body.board);
    // AI は常に後手（white）想定：unpackはside:"white"で返す実装
    return res.json({ move });
  } catch (e: any) {
    console.error("💥 Error in /api/think:", e);
    return res.status(500).json({ error: String(e?.message ?? e) });
  }
});

// ポートは 3001 に固定
const PORT = Number(process.env.PORT ?? 3001);
app.listen(PORT, () => {
  console.log(`✅ AI server listening on http://127.0.0.1:${PORT}`);
});
