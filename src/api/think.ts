// api/think.ts
import { think, unpack, type Board, type Hand, type PlyMove, type Side } from "../ai-core.js";

// CORS を必要最小限に（必要に応じて origin を絞ってください）
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

    // 探索はパックドムーブを返す
    const packed = think(board, handBlack, handWhite, turn, timeMs ?? 1200);
    // 参考：完全な PlyMove を返したい場合はサーバ側で unpack して返せます
    let move: PlyMove | null = null;
    if (packed) move = unpack(packed, board) as PlyMove;

    // クライアントでは packed を解釈するので両方返します
    res.json({ move: packed, ply: move });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
}
