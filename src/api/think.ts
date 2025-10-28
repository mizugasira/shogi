// api/think.ts
// 重要ポイント: "../src/ai-core.js"（.js 拡張子を明記）
import {
  think,
  unpack,
  type Board,
  type Hand,
  type PlyMove,
  type Side
} from "../src/ai-core.js";

// 必要最小限の CORS（必要に応じて Origin を絞ってOK）
const allowCORS = (res: any) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
};

export default async function handler(req: any, res: any) {
  allowCORS(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const { board, handBlack, handWhite, turn, timeMs } = req.body as {
      board: Board; handBlack: Hand; handWhite: Hand; turn: Side; timeMs?: number;
    };

    // AI 探索（packed 文字列を返す）
    const packed = think(board, handBlack, handWhite, turn, timeMs ?? 1200);

    // 参考：その場で完全手に展開したい場合は server 側で unpack も可能
    let ply: PlyMove | null = null;
    if (packed) ply = unpack(packed, board) as PlyMove;

    // クライアント側がどちらでも扱えるように両方返す
    res.status(200).json({ move: packed, ply });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
}
