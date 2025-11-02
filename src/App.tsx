import React, { useCallback, useEffect, useRef, useState } from "react";

/** ====== 型・定数 ====== */
type Side = "black" | "white";
type BasePiece = "K" | "R" | "B" | "G" | "S" | "N" | "L" | "P";
type PromotedPiece = "PR" | "PB" | "PS" | "PN" | "PL" | "PP";
type PieceType = BasePiece | PromotedPiece;
interface Piece { side: Side; type: PieceType; }
interface Square { piece?: Piece | null; }
type Board = Square[][];
type Hand = Record<Exclude<BasePiece, "K">, number>;
type Selected =
  | { kind: "board"; r: number; c: number }
  | { kind: "hand"; side: Side; piece: Exclude<BasePiece, "K"> }
  | null;
type PlyMove =
  | { kind: "move"; side: Side; from: { r: number; c: number }; to: { r: number; c: number }; took: Piece | null; promote: boolean }
  | { kind: "drop"; side: Side; piece: Exclude<BasePiece, "K">; at: { r: number; c: number } };

const BOARD_SIZE = 9;
const KANJI: Record<PieceType, string> = {
  K: "玉", R: "飛", B: "角", G: "金", S: "銀", N: "桂", L: "香", P: "歩",
  PR: "龍", PB: "馬", PS: "全", PN: "圭", PL: "杏", PP: "と",
};
const emptyHand = (): Hand => ({ R: 0, B: 0, G: 0, S: 0, N: 0, L: 0, P: 0 });

const promotableBase: Record<BasePiece, boolean> = { K: false, G: false, R: true, B: true, S: true, N: true, L: true, P: true };
const promoteMap: Record<BasePiece, PromotedPiece | null> = { K: null, G: null, R: "PR", B: "PB", S: "PS", N: "PN", L: "PL", P: "PP" };
const demoteMap: Record<PieceType, BasePiece> = {
  K: "K", R: "R", B: "B", G: "G", S: "S", N: "N", L: "L", P: "P",
  PR: "R", PB: "B", PS: "S", PN: "N", PL: "L", PP: "P",
};
const isPromoted = (t: PieceType): t is PromotedPiece => ["PR", "PB", "PS", "PN", "PL", "PP"].includes(t as any);
const isPromotableType = (t: PieceType) => !isPromoted(t) && promotableBase[t as BasePiece];
const toPromoted = (t: BasePiece): PieceType => promoteMap[t] ?? t;
const toDemotedBase = (t: PieceType): BasePiece => demoteMap[t];

const inBounds = (r: number, c: number) => r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
const cloneBoard = (src: Board): Board => src.map(row => row.map(cell => ({ piece: cell.piece ? { ...cell.piece } : null })));
const isHoshi = (r: number, c: number) =>
  (r === 2 && c === 2) || (r === 2 && c === 6) || (r === 4 && c === 4) || (r === 6 && c === 2) || (r === 6 && c === 6);

/** ====== 初期配置（公式どおり：先手2段目右=飛、左=角） ====== */
function initialBoard(): Board {
  const emptyRow = (): Square[] => Array.from({ length: BOARD_SIZE }, () => ({ piece: null }));
  const b: Board = Array.from({ length: BOARD_SIZE }, emptyRow);
  const place = (r: number, c: number, type: BasePiece, side: Side) => { b[r][c].piece = { side, type }; };

  // 先手（上段）
  place(0, 0, "L", "black"); place(0, 1, "N", "black"); place(0, 2, "S", "black"); place(0, 3, "G", "black"); place(0, 4, "K", "black"); place(0, 5, "G", "black"); place(0, 6, "S", "black"); place(0, 7, "N", "black"); place(0, 8, "L", "black");
  place(1, 1, "R", "black"); place(1, 7, "B", "black");
  for (let c = 0; c < BOARD_SIZE; c++) place(2, c, "P", "black");

  // 後手（下段）
  place(8, 0, "L", "white"); place(8, 1, "N", "white"); place(8, 2, "S", "white"); place(8, 3, "G", "white"); place(8, 4, "K", "white"); place(8, 5, "G", "white"); place(8, 6, "S", "white"); place(8, 7, "N", "white"); place(8, 8, "L", "white");
  place(7, 7, "R", "white"); place(7, 1, "B", "white");
  for (let c = 0; c < BOARD_SIZE; c++) place(6, c, "P", "white");

  return b;
}

/** ====== 合法手 ====== */
function legalMoves(board: Board, r: number, c: number): [number, number][] {
  const p = board[r][c].piece; if (!p) return [];
  const side = p.side; const dir = side === "black" ? 1 : -1; const t = p.type;
  const rayMoves = (d: [number, number][]) => {
    const res: [number, number][] = []; for (const [dr, dc] of d) { let nr = r + dr, nc = c + dc; while (inBounds(nr, nc)) { const o = board[nr][nc].piece; if (!o) res.push([nr, nc]); else { if (o.side !== side) res.push([nr, nc]); break; } nr += dr; nc += dc; } } return res;
  };
  const stepMoves = (d: [number, number][]) => {
    const res: [number, number][] = []; for (const [dr, dc] of d) { const nr = r + dr, nc = c + dc; if (!inBounds(nr, nc)) continue; const o = board[nr][nc].piece; if (!o || o.side !== side) res.push([nr, nc]); } return res;
  };
  const goldLike = (s: Side) => stepMoves(s === "black" ? [[-1, 0], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]] : [[1, 0], [0, -1], [0, 1], [-1, -1], [-1, 0], [-1, 1]]);
  if (isPromoted(t)) {
    if (t === "PR") { return [...rayMoves([[1, 0], [-1, 0], [0, 1], [0, -1]]), ...stepMoves([[1, 1], [1, -1], [-1, 1], [-1, -1]])]; }
    if (t === "PB") { return [...rayMoves([[1, 1], [1, -1], [-1, 1], [-1, -1]]), ...stepMoves([[1, 0], [-1, 0], [0, 1], [0, -1]])]; }
    return goldLike(side);
  }
  switch (t) {
    case "K": return stepMoves([[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]);
    case "G": return goldLike(side);
    case "S": return stepMoves(side === "black" ? [[1, -1], [1, 0], [1, 1], [-1, -1], [-1, 1]] : [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 1]]);
    case "N": return stepMoves(side === "black" ? [[2, -1], [2, 1]] : [[-2, -1], [-2, 1]]);
    case "L": return rayMoves([[dir, 0]]);
    case "P": return stepMoves([[dir, 0]]);
    case "B": return rayMoves([[1, 1], [1, -1], [-1, 1], [-1, -1]]);
    case "R": return rayMoves([[1, 0], [-1, 0], [0, 1], [0, -1]]);
    default: return [];
  }
}
function findKing(board: Board, side: Side): [number, number] | null {
  for (let r = 0; r < BOARD_SIZE; r++) for (let c = 0; c < BOARD_SIZE; c++) {
    const p = board[r][c].piece; if (p && p.side === side && demoteMap[p.type] === "K") return [r, c];
  }
  return null;
}
function isSquareAttacked(board: Board, bySide: Side, tr: number, tc: number): boolean {
  for (let r = 0; r < BOARD_SIZE; r++) for (let c = 0; c < BOARD_SIZE; c++) {
    const p = board[r][c].piece; if (p && p.side === bySide) {
      const moves = legalMoves(board, r, c); if (moves.some(([mr, mc]) => mr === tr && mc === tc)) return true;
    }
  }
  return false;
}
function hasPawnInFile(board: Board, side: Side, col: number): boolean {
  for (let r = 0; r < BOARD_SIZE; r++) { const p = board[r][col].piece; if (p && p.side === side && demoteMap[p.type] === "P") return true; }
  return false;
}
const involvesEnemyZone = (side: Side, fromR: number, toR: number) =>
  (side === "black" ? (fromR >= 6 || toR >= 6) : (fromR <= 2 || toR <= 2));
const isForcedPromotion = (side: Side, pieceType: PieceType, toR: number) => {
  const t = isPromoted(pieceType) ? demoteMap[pieceType] : pieceType;
  if (t === "P" || t === "L") return (side === "black" && toR === 8) || (side === "white" && toR === 0);
  if (t === "N") return (side === "black" && (toR >= 7)) || (side === "white" && (toR <= 1));
  return false;
};

/** ====== P2P（手動シグナリング） ====== */
type WireMsg =
  | { type: "hello"; role: "host" | "guest" }
  | { type: "syncAll"; board: Board; handBlack: Hand; handWhite: Hand; turn: Side; winner: Side | null; history: PlyMove[] }
  | { type: "move"; payload: PlyMove }
  | { type: "reset" };

export default function ShogiApp() {
  // 盤面状態
  const [board, setBoard] = useState<Board>(() => initialBoard());
  const [selected, setSelected] = useState<Selected>(null);
  const [turn, setTurn] = useState<Side>("black");
  const [handBlack, setHandBlack] = useState<Hand>(() => emptyHand());
  const [handWhite, setHandWhite] = useState<Hand>(() => emptyHand());
  const [winner, setWinner] = useState<Side | null>(null);
  const [history, setHistory] = useState<PlyMove[]>([]);
  const [promoAsk, setPromoAsk] = useState<null | { from: { r: number; c: number }, to: { r: number; c: number }, mover: Piece, took: Piece | null }>(null);

  // 表示サイズ
  const [cellPx] = useState<number>(56);

  // AI（サーバー呼び出し）
  const [aiEnabled, setAiEnabled] = useState<boolean>(false);
  const [useServerAI] = useState<boolean>(true);
  const AI_ENDPOINT = process.env.REACT_APP_AI_ENDPOINT ?? ""; // 例: https://<your-vercel-app>.vercel.app/api/think

  const apiBase =
    process.env.NODE_ENV === "production"
      ? "https://shogi-6izo.vercel.app/"  // ← あなたの Vercel API のURL
      : "http://localhost:3001";

  // P2P
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const [isHost, setIsHost] = useState<boolean>(false);
  const [p2pConnected, setP2pConnected] = useState<boolean>(false);
  const [localSDP, setLocalSDP] = useState<string>("");
  const [remoteSDP, setRemoteSDP] = useState<string>("");

  // SDP 開閉
  const [openSDP, setOpenSDP] = useState<boolean>(false);

  // 自分の陣営（P2P接続時は固定。非接続時はAI=黒・ローカル=白）
  const viewerBottomSide: Side = p2pConnected ? (isHost ? "black" : "white") : (aiEnabled ? "black" : "white");
  const viewerIsBlack = viewerBottomSide === "black";

  const visToModel = useCallback((vr: number, vc: number) => {
    return viewerIsBlack ? { r: (BOARD_SIZE - 1 - vr), c: (BOARD_SIZE - 1 - vc) } : { r: vr, c: vc };
  }, [viewerIsBlack]);
  const modelToVis = useCallback((r: number, c: number) => {
    return viewerIsBlack ? { vr: (BOARD_SIZE - 1 - r), vc: (BOARD_SIZE - 1 - c) } : { vr: r, vc: c };
  }, [viewerIsBlack]);

  // 操作権
  const mySide: Side | "any" = p2pConnected ? (isHost ? "black" : "white") : (aiEnabled ? "black" : "any");
  const canActThisTurn = (side: Side) => {
    if (p2pConnected) return mySide !== "any" && mySide === side && turn === side && !winner;
    if (aiEnabled) return side === "black" && turn === "black" && !winner;
    return !winner;
  };

  // 手駒操作
  const getHand = (side: Side) => side === "black" ? handBlack : handWhite;
  const setHand = (side: Side, updater: (h: Hand) => Hand) => {
    if (side === "black") setHandBlack(prev => updater({ ...prev }));
    else setHandWhite(prev => updater({ ...prev }));
  };
  const addToHand = (side: Side, type: Exclude<BasePiece, "K">) => setHand(side, (h) => ({ ...h, [type]: (h[type] ?? 0) + 1 }));
  const removeFromHand = (side: Side, type: Exclude<BasePiece, "K">) => setHand(side, (h) => ({ ...h, [type]: Math.max(0, (h[type] ?? 0) - 1) }));

  // 送受信
  const sendWire = (msg: WireMsg) => {
    const dc = dcRef.current;
    if (dc && dc.readyState === "open") {
      try { dc.send(JSON.stringify(msg)); } catch { }
    }
  };
  const syncAll = () => {
    sendWire({ type: "syncAll", board, handBlack, handWhite, turn, winner, history });
  };

  // P2P 初期化
  const makePC = () => {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    pc.onicecandidate = () => setLocalSDP(JSON.stringify(pc.localDescription));
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") { setP2pConnected(true); setAiEnabled(false); }
      if (["disconnected", "failed", "closed"].includes(pc.connectionState)) { setP2pConnected(false); }
    };
    pc.ondatachannel = (ev) => {
      const dc = ev.channel;
      dcRef.current = dc;
      dc.onopen = () => { setP2pConnected(true); sendWire({ type: "hello", role: isHost ? "host" : "guest" }); syncAll(); };
      dc.onclose = () => setP2pConnected(false);
      dc.onmessage = (e) => onWire(JSON.parse(e.data));
    };
    pcRef.current = pc;
    return pc;
  };
  const createHost = async () => {
    setIsHost(true);
    const pc = makePC();
    const dc = pc.createDataChannel("shogi");
    dcRef.current = dc;
    dc.onopen = () => { setP2pConnected(true); sendWire({ type: "hello", role: "host" }); syncAll(); };
    dc.onclose = () => setP2pConnected(false);
    dc.onmessage = (e) => onWire(JSON.parse(e.data));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    setLocalSDP(JSON.stringify(pc.localDescription));
  };
  const acceptGuest = async () => {
    const pc = pcRef.current ?? makePC();
    const desc = JSON.parse(remoteSDP);
    await pc.setRemoteDescription(desc);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    setLocalSDP(JSON.stringify(pc.localDescription));
  };
  const acceptHost = async () => {
    setIsHost(false);
    const pc = makePC();
    const desc = JSON.parse(remoteSDP);
    await pc.setRemoteDescription(desc);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    setLocalSDP(JSON.stringify(pc.localDescription));
  };
  const setRemote = async () => {
    const pc = pcRef.current; if (!pc) return;
    if (!remoteSDP) return;
    await pc.setRemoteDescription(JSON.parse(remoteSDP));
  };
  const onWire = (msg: WireMsg) => {
    if (msg.type === "hello") { return; }
    if (msg.type === "syncAll") {
      setBoard(cloneBoard(msg.board));
      setHandBlack({ ...msg.handBlack });
      setHandWhite({ ...msg.handWhite });
      setTurn(msg.turn);
      setWinner(msg.winner);
      setHistory([...msg.history]);
      setSelected(null); setPromoAsk(null);
      return;
    }
    if (msg.type === "reset") {
      doReset(false);
      return;
    }
    if (msg.type === "move") {
      applyPly(msg.payload, false);
      return;
    }
  };

  /** ====== 共通：指し手適用 ====== */
  const applyPly = (ply: PlyMove, broadcast: boolean) => {
    if (ply.kind === "drop") {
      setBoard(prev => { const next = cloneBoard(prev); next[ply.at.r][ply.at.c].piece = { side: ply.side, type: ply.piece }; return next; });
      removeFromHand(ply.side, ply.piece);
      setHistory(h => [...h, ply]);
      setSelected(null); setPromoAsk(null);
      if (!winner) setTurn(t => (t === "black" ? "white" : "black"));
    } else {
      const destPiece = board[ply.to.r][ply.to.c].piece || null;
      if (destPiece) {
        const base = toDemotedBase(destPiece.type);
        if (base === "K") { setWinner(ply.side); }
        else addToHand(ply.side, base as Exclude<BasePiece, "K">);
      }
      setBoard(prev => {
        const next = cloneBoard(prev);
        const mover = next[ply.from.r][ply.from.c].piece!;
        const afterType = (ply.promote && isPromotableType(mover.type)) ? toPromoted(mover.type as BasePiece) : mover.type;
        next[ply.to.r][ply.to.c].piece = { side: ply.side, type: afterType };
        next[ply.from.r][ply.from.c].piece = null;
        return next;
      });
      setHistory(h => [...h, { ...ply, took: destPiece }]);
      setSelected(null); setPromoAsk(null);
      if (!winner) setTurn(t => (t === "black" ? "white" : "black"));
    }
    if (broadcast) sendWire({ type: "move", payload: ply });
  };

  /** ====== サーバーAI：pack形式 or JSON形式の指し手をunpack ====== */
  function unpackFromServer(packed: any): PlyMove | null {
    try {
      // サーバーがJSON形式で返す場合
      if (typeof packed === "object" && packed !== null) {
        if (packed.kind === "move") {
          return {
            kind: "move",
            side: packed.side,
            from: packed.from,
            to: packed.to,
            took: packed.took ?? null,
            promote: packed.promote ?? false,
          };
        } else if (packed.kind === "drop") {
          return {
            kind: "drop",
            side: packed.side,
            piece: packed.piece,
            at: packed.at,
          };
        }
      }

      // 旧フォーマット（"m:..." や "d:..."）
      if (typeof packed === "string") {
        if (packed.startsWith("d:")) {
          const rest = packed.split(":")[1];
          const [pc, r, c] = rest.split(",");
          return { kind: "drop", side: "white", piece: pc as any, at: { r: Number(r), c: Number(c) } };
        } else if (packed.startsWith("m:")) {
          const rest = packed.split(":")[1];
          const [frS, fcS, trS, tcS, pS] = rest.split(",");
          const fr = Number(frS), fc = Number(fcS), tr = Number(trS), tc = Number(tcS);
          const p = Number(pS);
          return { kind: "move", side: "white", from: { r: fr, c: fc }, to: { r: tr, c: tc }, took: null, promote: !!p };
        }
      }
    } catch (e) {
      console.error("unpackFromServer error:", e);
    }
    return null;
  }

  /** ====== クリック処理 ====== */
  const handleSquareClick = (vr: number, vc: number) => {
    const { r, c } = visToModel(vr, vc);
    if (winner) return;
    const sq = board[r][c];

    // 手駒 → 打つ
    if (selected && selected.kind === "hand") {
      const dropSide = selected.side;
      if (!canActThisTurn(dropSide)) return;
      if (sq.piece) return;
      const type = selected.piece;

      if (type === "P") {
        if ((dropSide === "black" && r === 8) || (dropSide === "white" && r === 0)) return;
        if (hasPawnInFile(board, dropSide, c)) return;
      }
      if (type === "L") { if ((dropSide === "black" && r === 8) || (dropSide === "white" && r === 0)) return; }
      if (type === "N") { if ((dropSide === "black" && r >= 7) || (dropSide === "white" && r <= 1)) return; }

      const ply: PlyMove = { kind: "drop", side: dropSide, piece: type, at: { r, c } };
      applyPly(ply, true);
      return;
    }

    // 盤上：選択
    if (!selected) {
      if (!sq.piece) return;
      if (!canActThisTurn(sq.piece.side)) return;
      setSelected({ kind: "board", r, c });
      return;
    }

    // 盤上：移動
    if (selected.kind === "board") {
      const selPos = selected;
      const selPiece = board[selPos.r][selPos.c].piece;
      if (!selPiece) { setSelected(null); return; }
      if (!canActThisTurn(selPiece.side)) return;

      if (r === selPos.r && c === selPos.c) { setSelected(null); return; }
      if (sq.piece && sq.piece.side === selPiece.side) { setSelected({ kind: "board", r, c }); return; }

      const moveTargets = legalMoves(board, selPos.r, selPos.c);
      if (moveTargets.some(([mr, mc]) => mr === r && mc === c)) {
        const moverSide = selPiece.side;
        const destPiece = board[r][c].piece;

        const canPromoteBasic = isPromotableType(selPiece.type) && involvesEnemyZone(moverSide, selPos.r, r);
        const mustPromote = isPromotableType(selPiece.type) && isForcedPromotion(moverSide, selPiece.type, r);
        const commit = (promote: boolean) => {
          const ply: PlyMove = { kind: "move", side: moverSide, from: { r: selPos.r, c: selPos.c }, to: { r, c }, took: destPiece ?? null, promote };
          applyPly(ply, true);
        };
        if (mustPromote) { commit(true); return; }
        if (canPromoteBasic) {
          setPromoAsk({ from: { r: selPos.r, c: selPos.c }, to: { r, c }, mover: { ...selPiece }, took: destPiece ? { ...destPiece } : null });
          return;
        }
        commit(false);
      }
    }
  };

  /** ====== 成りダイアログ ====== */
  const onChoosePromote = (doPromote: boolean) => {
    if (!promoAsk) return;
    const { from, to, mover, took } = promoAsk;
    setPromoAsk(null);
    const ply: PlyMove = { kind: "move", side: mover.side, from, to, took, promote: doPromote };
    applyPly(ply, true);
  };

  /** ====== リセット ====== */
  const doReset = (broadcast: boolean) => {
    setBoard(initialBoard());
    setSelected(null);
    setTurn("black");
    setHandBlack(emptyHand());
    setHandWhite(emptyHand());
    setWinner(null);
    setPromoAsk(null);
    setHistory([]);
    if (broadcast) sendWire({ type: "reset" });
  };

  /** ====== サーバーAI呼び出し ====== */
  useEffect(() => {
    if (!aiEnabled || !useServerAI) return;
    if (p2pConnected || winner) return;
    if (turn !== "white") return;
    if (!AI_ENDPOINT) return;

    const id = setTimeout(async () => {
      try {
        const resp = await fetch(`${apiBase}/api/think`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ board, handBlack, handWhite, turn: "white", history, timeMs: 1500 })
        });
        const data = await resp.json();
        if (data?.move) {
          const ply = unpackFromServer(data.move);
          if (ply) applyPly(ply, true);
        } else {
          console.warn("AI応答が無効です:", data);
          setTurn(t => (t === "black" ? "white" : "black"));
        }
      } catch (e) {
        console.error("AI server error:", e);
        setTurn(t => (t === "black" ? "white" : "black"));
      }
    }, 120);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiEnabled, useServerAI, p2pConnected, winner, turn, board, handBlack, handWhite, history, AI_ENDPOINT]);

  /** ====== UI ====== */
  const kb = findKing(board, "black"); const kw = findKing(board, "white");

  return (
    <div className="p-3 max-w-[1024px] mx-auto">
      <header className="mb-3 flex flex-wrap gap-2 items-center justify-between">
        <h1 className="text-xl font-bold">将棋（P2P対戦・自分が手前表示・成り/持ち駒同期）</h1>
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" checked={aiEnabled} onChange={() => setAiEnabled(v => !v)} disabled={p2pConnected} />
            <span>AIモード（AI=後手／サーバー実行）</span>
          </label>
          <button className="px-3 py-2 rounded-2xl shadow text-sm hover:opacity-90 bg-amber-200 border border-amber-600" onClick={() => doReset(true)}>初期配置にリセット</button>
        </div>
      </header>

      {/* P2P パネル（開閉式） */}
      <section className="mb-3 p-3 rounded border">
        <div className="flex items-center justify-between">
          <div className="text-sm">
            <b>オンライン対戦（同一PCの別ウィンドウでもOK）</b><br />
            Hostは先手／Guestは後手。SDPをコピペして接続します。
          </div>
          <button className="px-2 py-1 text-sm rounded border bg-gray-100 hover:bg-gray-200"
            onClick={() => setOpenSDP(o => !o)}>
            {openSDP ? "SDPエリアを閉じる" : "SDPエリアを開く"}
          </button>
        </div>

        {openSDP && (
          <div className="mt-3 flex flex-col md:flex-row gap-3">
            <div className="flex-1">
              <div className="flex gap-2 mb-2">
                <button className="px-3 py-1 rounded bg-blue-600 text-white" onClick={createHost} disabled={pcRef.current !== null}>Host: Offer作成</button>
                <button className="px-3 py-1 rounded bg-green-700 text-white" onClick={acceptGuest} disabled={!remoteSDP}>Host: Remote(Answer)反映</button>
                <span className="text-sm">{p2pConnected ? "接続中" : "未接続"}</span>
              </div>
              <div className="text-xs mb-1">Local SDP（コピーして相手へ渡す）</div>
              <textarea className="w-full h-24 p-1 border rounded text-xs" readOnly value={localSDP} />
            </div>
            <div className="flex-1">
              <div className="flex gap-2 mb-2">
                <button className="px-3 py-1 rounded bg-purple-600 text-white" onClick={acceptHost}>Guest: Offer読込→Answer生成</button>
                <button className="px-3 py-1 rounded bg-emerald-700 text-white" onClick={setRemote} disabled={!remoteSDP}>Guest: Remote(Offer/Answer)反映</button>
              </div>
              <div className="text-xs mb-1">Remote SDP（相手のSDPを貼り付け）</div>
              <textarea className="w-full h-24 p-1 border rounded text-xs" value={remoteSDP} onChange={e => setRemoteSDP(e.target.value)} />
            </div>
          </div>
        )}
      </section>

      <div className="mb-2 text-sm flex flex-wrap items-center gap-3">
        {winner ? (
          <span className="text-rose-700 font-bold">{winner === "black" ? "先手の勝ち" : "後手の勝ち"}</span>
        ) : (
          <>
            <span>現在の手番：<span className="font-semibold">{turn === "black" ? "先手" : "後手"}</span></span>
            <>
              {(!winner && kb && isSquareAttacked(board, "white", kb[0], kb[1])) && <span className="text-red-600 font-bold">王手（先手玉）</span>}
              {(!winner && kw && isSquareAttacked(board, "black", kw[0], kw[1])) && <span className="text-red-600 font-bold">王手（後手玉）</span>}
            </>
            {p2pConnected && <span className="text-xs px-2 py-1 rounded bg-emerald-100 border">オンライン中：あなたは {isHost ? "先手(Host)" : "後手(Guest)"}</span>}
            {aiEnabled && !p2pConnected && <span className="text-xs px-2 py-1 rounded bg-indigo-100 border">AI対戦中（AI=後手／サーバー）</span>}
            <span className="text-xs px-2 py-1 rounded bg-gray-100 border">表示：あなたが手前（{viewerIsBlack ? "黒" : "白"} 視点）</span>
          </>
        )}
      </div>

      {/* 盤面 */}
      <div className="inline-block rounded-[18px] shadow-xl border-4 border-amber-900 p-3 bg-amber-200">
        <div className="grid grid-cols-9">
          {Array.from({ length: BOARD_SIZE }).map((_, vr) => (
            Array.from({ length: BOARD_SIZE }).map((__, vc) => {
              const { r, c } = visToModel(vr, vc);
              const sq = board[r][c];
              const sel = (selected && selected.kind === "board" && selected.r === r && selected.c === c);
              const moveTargets = (selected && selected.kind === "board") ? legalMoves(board, selected.r, selected.c) : [];
              const moveTarget = (selected && selected.kind === "board") ? moveTargets.some(([mr, mc]) => mr === r && mc === c) : false;

              return (
                <button key={`${vr}-${vc}`} onClick={() => handleSquareClick(vr, vc)}
                  className={`relative w-14 h-14 flex items-center justify-center border border-amber-700/50 ${sel ? "ring-4 ring-blue-400" : moveTarget ? "ring-4 ring-green-400" : ""}`}>
                  {isHoshi(r, c) && (<span className="absolute w-2 h-2 bg-black rounded-full opacity-70" style={{ pointerEvents: "none" }} />)}
                  {sq.piece && <PieceView piece={sq.piece} size={cellPx} viewerBottom={viewerBottomSide} />}
                </button>
              );
            })
          ))}
        </div>
      </div>

      {/* 手駒 */}
      <HandsPane
        handWhite={handWhite}
        handBlack={handBlack}
        onClick={(side, type) => {
          if (!canActThisTurn(side)) return;
          const hand = getHand(side);
          if ((hand[type] ?? 0) <= 0) return;
          setSelected(cur => (cur && cur.kind === "hand" && cur.side === side && cur.piece === type ? null : { kind: "hand", side, piece: type }));
        }}
        selected={selected}
      />

      {/* 成りダイアログ */}
      {promoAsk && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[50]">
          <div className="bg-white rounded-lg p-4 w-80 max-w-[90vw] shadow-xl">
            <div className="text-lg font-bold mb-2">成りますか？</div>
            <div className="text-sm mb-4">
              {KANJI[promoAsk.mover.type]}（{promoAsk.mover.side === "black" ? "先手" : "後手"}）が敵陣に関与する移動です。
            </div>
            <div className="flex gap-2 justify-end">
              <button className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300" onClick={() => onChoosePromote(false)}>成らない</button>
              <button className="px-3 py-1 rounded bg-amber-600 text-white hover:opacity-90" onClick={() => onChoosePromote(true)}>成る</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** ====== 手駒 UI ====== */
function HandsPane({
  handWhite, handBlack, onClick, selected
}: {
  handWhite: Hand; handBlack: Hand;
  onClick: (side: Side, type: Exclude<BasePiece, "K">) => void;
  selected: Selected;
}) {
  const row = (side: Side, hand: Hand) => (
    <div className="flex items-center gap-2 my-1">
      <div className="w-12 text-center text-xs">{side === "black" ? "先手" : "後手"}</div>
      {(["R", "B", "G", "S", "N", "L", "P"] as Exclude<BasePiece, "K">[]).map(t => {
        const cnt = hand[t] ?? 0;
        const sel = selected && selected.kind === "hand" && selected.side === side && selected.piece === t;
        return (
          <button key={`${side}-${t}`} className={`px-2 py-1 rounded border ${sel ? "ring-2 ring-blue-500" : ""}`} onClick={() => onClick(side, t)}>
            <span className="mr-1">{KANJI[t]}</span>
            <span className="text-xs">×{cnt}</span>
          </button>
        );
      })}
    </div>
  );
  return (
    <div className="mt-3 p-2 rounded border bg-white">
      {row("white", handWhite)}
      {row("black", handBlack)}
    </div>
  );
}

/** ====== 駒表示（自分の駒は正位置／相手は反転） ====== */
function PieceView({ piece, size = 56, viewerBottom }: { piece: Piece; size?: number; viewerBottom: Side }) {
  const label = KANJI[piece.type];
  const rotateClass = (piece.side === viewerBottom) ? "" : "rotate-180";
  const font = Math.max(14, Math.floor(size * 0.45));
  return (
    <div className={`relative drop-shadow ${rotateClass}`}
      title={`${piece.side === "black" ? "先手" : "後手"} ${label}`}
      style={{
        width: size, height: size,
        clipPath: "polygon(50% 0%, 88% 22%, 88% 92%, 12% 92%, 12% 22%)",
        background: "linear-gradient(180deg,#f9e3b0 0%,#f2cc7b 60%,#e6b96a 100%)",
        border: "1px solid #8b5e34", borderRadius: 6,
        display: "flex", alignItems: "center", justifyContent: "center"
      }}>
      <span className="font-bold select-none" style={{ fontSize: font, fontFamily: "'Noto Serif JP', serif" }}>{label}</span>
    </div>
  );
}
