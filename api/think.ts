// api/think.ts
import { think, unpack, type Board, type Hand, type PlyMove, type Side } from "../src/ai-core.js";

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

    // ---- 🔥 タイムアウト監視（例: 8秒で打ち切る） ----
    const timeoutMs = 8000;
    let timedOut = false;

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => {
        timedOut = true;
        reject(new Error("AI timeout"));
      }, timeoutMs)
    );

    const thinkPromise = (async () => {
      const packed = think(board, handBlack, handWhite, turn, timeMs ?? 1200);
      return packed;
    })();

    const packed = await Promise.race([thinkPromise, timeoutPromise]).catch(() => null);

    if (timedOut || !packed) {
      console.warn("⚠️ AI think() timed out or returned null");
      // フォールバック：最初に見つけた合法手を返す
      const fallback = findFirstLegalMove(board, turn);
      if (fallback) return res.json({ move: fallback, fallback: true });
      return res.status(200).json({ move: null, error: "timeout" });
    }

    const move = unpack(packed, board);
    res.json({ move: packed, ply: move });

  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
}

/** 最低限の合法手（AIが落ちたとき用） */
function findFirstLegalMove(board: Board, side: Side): string | null {
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      const p = board[r][c].piece;
      if (p && p.side === side) {
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [dr, dc] of dirs) {
          const tr = r + dr, tc = c + dc;
          if (tr >= 0 && tr < 9 && tc >= 0 && tc < 9 && !board[tr][tc].piece) {
            return `m:${r},${c},${tr},${tc},0`;
          }
        }
      }
    }
  }
  return null;
}
