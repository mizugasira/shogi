import React, { useMemo, useState } from "react";

type RTCState = {
  pc: RTCPeerConnection | null;
  dc: RTCDataChannel | null;
  connected: boolean;
  isHost: boolean;
};

const STUN_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
};

function createPeer(isHost: boolean, onMessage: (data: any) => void) {
  const pc = new RTCPeerConnection(STUN_SERVERS);
  let dc: RTCDataChannel | null = null;

  if (isHost) {
    dc = pc.createDataChannel("shogi");
    dc.onopen = () => console.log("DC open");
    dc.onmessage = (e) => onMessage(JSON.parse(e.data));
  } else {
    pc.ondatachannel = (ev) => {
      dc = ev.channel;
      dc.onopen = () => console.log("DC open");
      dc.onmessage = (e) => onMessage(JSON.parse(e.data));
    };
  }
  return { pc, getDC: () => dc! };
}


/** ===== Types ===== **/
type Side = "black" | "white"; // black = 先手(上), white = 後手(下)
type PieceType = "K" | "R" | "B" | "G" | "S" | "N" | "L" | "P";

interface Piece {
  side: Side;
  type: PieceType;
}
interface Square {
  piece?: Piece | null;
}
type Board = Square[][];
type Hand = Record<Exclude<PieceType, "K">, number>;

type Coord = { r: number; c: number };
type Selected =
  | { kind: "board"; r: number; c: number }
  | { kind: "hand"; side: Side; piece: Exclude<PieceType, "K"> }
  | null;

/** ===== Constants ===== **/
const BOARD_SIZE = 9;

const KANJI: Record<PieceType, string> = {
  K: "玉",
  R: "飛",
  B: "角",
  G: "金",
  S: "銀",
  N: "桂",
  L: "香",
  P: "歩",
};

const emptyHand = (): Hand => ({ R: 0, B: 0, G: 0, S: 0, N: 0, L: 0, P: 0 });

/** ===== Setup ===== **/
function initialBoard(): Board {
  const emptyRow = (): Square[] =>
    Array.from({ length: BOARD_SIZE }, () => ({ piece: null }));
  const b: Board = Array.from({ length: BOARD_SIZE }, emptyRow);

  const place = (r: number, c: number, type: PieceType, side: Side) => {
    b[r][c].piece = { side, type };
  };

  // 先手
  place(0, 0, "L", "black");
  place(0, 1, "N", "black");
  place(0, 2, "S", "black");
  place(0, 3, "G", "black");
  place(0, 4, "K", "black");
  place(0, 5, "G", "black");
  place(0, 6, "S", "black");
  place(0, 7, "N", "black");
  place(0, 8, "L", "black");
  place(1, 1, "B", "black");
  place(1, 7, "R", "black");
  for (let c = 0; c < BOARD_SIZE; c++) place(2, c, "P", "black");

  // 後手
  place(8, 0, "L", "white");
  place(8, 1, "N", "white");
  place(8, 2, "S", "white");
  place(8, 3, "G", "white");
  place(8, 4, "K", "white");
  place(8, 5, "G", "white");
  place(8, 6, "S", "white");
  place(8, 7, "N", "white");
  place(8, 8, "L", "white");
  place(7, 7, "B", "white");
  place(7, 1, "R", "white");
  for (let c = 0; c < BOARD_SIZE; c++) place(6, c, "P", "white");

  return b;
}

/** ユーティリティ */
const inBounds = (r: number, c: number) =>
  r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;

const cloneBoard = (src: Board): Board =>
  src.map((row) =>
    row.map((cell) => ({ piece: cell.piece ? { ...cell.piece } : null }))
  );

/** ===== Moves ===== **/
function rayMoves(
  board: Board,
  r: number,
  c: number,
  deltas: [number, number][],
  side: Side
): [number, number][] {
  const res: [number, number][] = [];
  for (const [dr, dc] of deltas) {
    let nr = r + dr;
    let nc = c + dc;
    while (inBounds(nr, nc)) {
      const occ = board[nr][nc].piece;
      if (!occ) {
        res.push([nr, nc]);
      } else {
        if (occ.side !== side) res.push([nr, nc]);
        break;
      }
      nr += dr;
      nc += dc;
    }
  }
  return res;
}

function stepMoves(
  board: Board,
  r: number,
  c: number,
  deltas: [number, number][],
  side: Side
): [number, number][] {
  const res: [number, number][] = [];
  for (const [dr, dc] of deltas) {
    const nr = r + dr;
    const nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    const occ = board[nr][nc].piece;
    if (!occ || occ.side !== side) res.push([nr, nc]);
  }
  return res;
}

function legalMoves(board: Board, r: number, c: number): [number, number][] {
  const p = board[r][c].piece;
  if (!p) return [];
  const dir = p.side === "black" ? 1 : -1;

  switch (p.type) {
    case "K":
      return stepMoves(
        board,
        r,
        c,
        [
          [-1, -1],
          [-1, 0],
          [-1, 1],
          [0, -1],
          [0, 1],
          [1, -1],
          [1, 0],
          [1, 1],
        ],
        p.side
      );
    case "G":
      return stepMoves(
        board,
        r,
        c,
        dir === 1
          ? [
              [-1, 0],
              [0, -1],
              [0, 1],
              [1, -1],
              [1, 0],
              [1, 1],
            ]
          : [
              [1, 0],
              [0, -1],
              [0, 1],
              [-1, -1],
              [-1, 0],
              [-1, 1],
            ],
        p.side
      );
    case "S":
      return stepMoves(
        board,
        r,
        c,
        dir === 1
          ? [
              [1, -1],
              [1, 0],
              [1, 1],
              [-1, -1],
              [-1, 1],
            ]
          : [
              [-1, -1],
              [-1, 0],
              [-1, 1],
              [1, -1],
              [1, 1],
            ],
        p.side
      );
    case "N":
      return stepMoves(
        board,
        r,
        c,
        dir === 1 ? [[2, -1], [2, 1]] : [[-2, -1], [-2, 1]],
        p.side
      );
    case "L":
      return rayMoves(board, r, c, [[dir, 0]], p.side);
    case "P":
      return stepMoves(board, r, c, [[dir, 0]], p.side);
    case "B":
      return rayMoves(
        board,
        r,
        c,
        [
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ],
        p.side
      );
    case "R":
      return rayMoves(
        board,
        r,
        c,
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ],
        p.side
      );
    default:
      return [];
  }
}

function findKing(board: Board, side: Side): [number, number] | null {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const p = board[r][c].piece;
      if (p && p.side === side && p.type === "K") return [r, c];
    }
  }
  return null;
}

function isSquareAttacked(
  board: Board,
  bySide: Side,
  tr: number,
  tc: number
): boolean {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const p = board[r][c].piece;
      if (p && p.side === bySide) {
        const moves = legalMoves(board, r, c);
        if (moves.some(([mr, mc]) => mr === tr && mc === tc)) return true;
      }
    }
  }
  return false;
}

function hasPawnInFile(board: Board, side: Side, col: number): boolean {
  for (let r = 0; r < BOARD_SIZE; r++) {
    const p = board[r][col].piece;
    if (p && p.side === side && p.type === "P") return true;
  }
  return false;
}

/** ===== UI ===== **/
export default function ShogiApp() {
  const [board, setBoard] = useState<Board>(() => initialBoard());
  const [selected, setSelected] = useState<Selected>(null);
  const [turn, setTurn] = useState<Side>("black");
  const [enforceTurn, setEnforceTurn] = useState(true);
  const [handBlack, setHandBlack] = useState<Hand>(() => emptyHand());
  const [handWhite, setHandWhite] = useState<Hand>(() => emptyHand());
  const [winner, setWinner] = useState<Side | null>(null);

  // 既存の state 群の下あたりに追加
  const [rtc, setRtc] = useState<RTCState>({
    pc: null, dc: null, connected: false, isHost: false
  });
  const [localSDP, setLocalSDP] = useState<string>("");
  const [remoteSDP, setRemoteSDP] = useState<string>("");

  // 受信時：相手の指し手を盤に適用
  const applyRemoteAction = (a: any) => {
    if (winner) return; // 勝敗決定後は無視
    switch (a.t) {
      case "move": {
        const { from, to, took } = a;
        // 取った駒は手駒へ（先後逆になる点に注意）
        setBoard((prev) => {
          const next = cloneBoard(prev);
          const fromP = next[from.r][from.c].piece!;
          if (took && took !== "K") addToHand(fromP.side, took);
          if (took === "K") setWinner(fromP.side);
          next[to.r][to.c].piece = { ...fromP };
          next[from.r][from.c].piece = null;
          return next;
        });
        setSelected(null);
        if (!winner && enforceTurn) setTurn((t) => (t === "black" ? "white" : "black"));
        break;
      }
      case "drop": {
        const { side, piece, at } = a;
        setBoard((prev) => {
          const next = cloneBoard(prev);
          next[at.r][at.c].piece = { side, type: piece };
          return next;
        });
        removeFromHand(side, piece);
        setSelected(null);
        if (enforceTurn) setTurn((t) => (t === "black" ? "white" : "black"));
        break;
      }
      case "reset":
        reset();
        break;
      case "resign":
        setWinner(a.winner as Side);
        break;
    }
  };

  // 接続開始（ホスト or ゲスト）
  async function startHost() {
    const { pc, getDC } = createPeer(true, applyRemoteAction);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    setLocalSDP(JSON.stringify(offer));
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "connected") {
        setRtc({ pc, dc: getDC(), connected: true, isHost: true });
      }
    };
    setRtc((s) => ({ ...s, pc, isHost: true }));
  }

  async function acceptAsGuest() {
    const offer: RTCSessionDescriptionInit = JSON.parse(remoteSDP);
    const { pc, getDC } = createPeer(false, applyRemoteAction);
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    setLocalSDP(JSON.stringify(answer));
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "connected") {
        setRtc({ pc, dc: getDC(), connected: true, isHost: false });
      }
    };
    setRtc((s) => ({ ...s, pc, isHost: false }));
  }

  async function finishHost() {
    if (!rtc.pc) return;
    const answer: RTCSessionDescriptionInit = JSON.parse(remoteSDP);
    await rtc.pc.setRemoteDescription(answer);
  }


  const moves = useMemo(() => {
    if (!selected || selected.kind !== "board") return [] as [number, number][];
    return legalMoves(board, selected.r, selected.c);
  }, [selected, board]);

  const checkInfo = useMemo(() => {
    const kb = findKing(board, "black");
    const kw = findKing(board, "white");
    const blackInCheck = kb
      ? isSquareAttacked(board, "white", kb[0], kb[1])
      : false;
    const whiteInCheck = kw
      ? isSquareAttacked(board, "black", kw[0], kw[1])
      : false;
    return { blackInCheck, whiteInCheck };
  }, [board]);

  const isMoveTarget = (r: number, c: number) =>
    moves.some(([mr, mc]) => mr === r && mc === c);

  const getHand = (side: Side) => (side === "black" ? handBlack : handWhite);
  const setHand = (side: Side, updater: (h: Hand) => Hand) => {
    if (side === "black") setHandBlack((h) => updater({ ...h }));
    else setHandWhite((h) => updater({ ...h }));
  };
  const addToHand = (side: Side, type: PieceType) => {
    if (type === "K") return;
    setHand(side, (h) => ({
      ...h,
      [type]: (h[type as keyof Hand] as number) + 1,
    }) as Hand);
  };
  const removeFromHand = (side: Side, type: Exclude<PieceType, "K">) => {
    setHand(side, (h) => ({ ...h, [type]: Math.max(0, (h[type] ?? 0) - 1) }));
  };

  const handleSquareClick = (r: number, c: number) => {
    if (winner) return;

    const sq = board[r][c];

    // 手駒から打つ
    if (selected && selected.kind === "hand") {
      const dropSide = selected.side;
      if (enforceTurn && dropSide !== turn) return;
      if (sq.piece) return;

      // 打ち禁則
      const dir = dropSide === "black" ? 1 : -1;
      const type = selected.piece;
      if (type === "P") {
        if ((dir === 1 && r === 8) || (dir === -1 && r === 0)) return; // 最終段に打てない
        if (hasPawnInFile(board, dropSide, c)) return; // 二歩
      }
      if (type === "L") {
        if ((dir === 1 && r === 8) || (dir === -1 && r === 0)) return;
      }
      if (type === "N") {
        if ((dir === 1 && r >= 7) || (dir === -1 && r <= 1)) return;
      }

      setBoard((prev) => {
        const next = cloneBoard(prev);
        next[r][c].piece = { side: dropSide, type };
        return next;
      });
      removeFromHand(dropSide, type);
      setSelected(null);
      if (enforceTurn) setTurn((t) => (t === "black" ? "white" : "black"));
      return;
    }

    // 盤上の駒：選択
    if (!selected) {
      if (!sq.piece) return;
      if (enforceTurn && sq.piece.side !== turn) return;
      setSelected({ kind: "board", r, c });
      return;
    }

    // 盤上の駒：移動
    if (selected.kind === "board") {
      const selPiece = board[selected.r][selected.c].piece;
      if (!selPiece) {
        setSelected(null);
        return;
      }

      if (r === selected.r && c === selected.c) {
        setSelected(null);
        return;
      }

      if (sq.piece && sq.piece.side === selPiece.side) {
        if (!enforceTurn || sq.piece.side === turn)
          setSelected({ kind: "board", r, c });
        return;
      }

      if (isMoveTarget(r, c)) {
        const moverSide = selPiece.side;
        const destPiece = sq.piece;

        setBoard((prev) => {
          const next = cloneBoard(prev);

          if (destPiece) {
            if (destPiece.type === "K") {
              // 王を取った ⇒ 勝利
              setWinner(moverSide);
            } else {
              addToHand(moverSide, destPiece.type);
            }
          }

          next[r][c].piece = { ...selPiece };
          next[selected.r][selected.c].piece = null;
          return next;
        });

        setSelected(null);
        if (!winner && enforceTurn)
          setTurn((t) => (t === "black" ? "white" : "black"));
        return;
      }
    }
  };

  // 手駒クリック
  const handleHandClick = (side: Side, type: Exclude<PieceType, "K">) => {
    if (winner) return;
    if (enforceTurn && side !== turn) return;
    const hand = getHand(side);
    if ((hand[type] ?? 0) <= 0) return;

    setSelected((cur) =>
      cur && cur.kind === "hand" && cur.side === side && cur.piece === type
        ? null
        : { kind: "hand", side, piece: type }
    );
  };

  const reset = () => {
    setBoard(initialBoard());
    setSelected(null);
    setTurn("black");
    setHandBlack(emptyHand());
    setHandWhite(emptyHand());
    setWinner(null);
  };

  // 星（ほし）
  const isHoshi = (r: number, c: number) =>
    (r === 2 && c === 2) ||
    (r === 2 && c === 6) ||
    (r === 4 && c === 4) ||
    (r === 6 && c === 2) ||
    (r === 6 && c === 6);

  const CheckBanner = () => {
    if (winner) return null;
    if (checkInfo.blackInCheck)
      return <div className="text-red-600 font-bold">王手（先手玉）</div>;
    if (checkInfo.whiteInCheck)
      return <div className="text-red-600 font-bold">王手（後手玉）</div>;
    return null;
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">将棋アプリ（木目デザイン）</h1>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-2 rounded-2xl shadow text-sm hover:opacity-90 bg-amber-200 border border-amber-600"
            onClick={reset}
          >
            初期配置にリセット
          </button>
          <label className="text-sm flex items-center gap-2">
            <input
              type="checkbox"
              checked={enforceTurn}
              onChange={(e) => setEnforceTurn(e.target.checked)}
            />
            手番を交互に制限（先手→後手）
          </label>
        </div>
      </header>

      {/* P2P 接続（超簡易・手動シグナリング） */}
      <div className="mb-4 p-3 rounded-lg border">
        <div className="flex gap-2 flex-wrap items-center">
          <button className="px-3 py-1 rounded bg-blue-600 text-white" onClick={startHost} disabled={rtc.pc!==null}>
            ホスト開始（合言葉を作る）
          </button>
          <span className="text-sm opacity-80">/</span>
          <button className="px-3 py-1 rounded bg-emerald-600 text-white" onClick={acceptAsGuest} disabled={rtc.pc!==null}>
            ゲスト参加（ホストの文字列を貼る）
          </button>
          <span className={`text-sm ${rtc.connected?'text-emerald-700':'text-gray-500'}`}>
            状態：{rtc.connected ? "接続中" : "未接続"}
          </span>
        </div>

        <div className="mt-2 grid md:grid-cols-2 gap-2">
          <div>
            <div className="text-xs mb-1">①自分の文字列（相手に送る）</div>
            <textarea className="w-full h-24 p-2 border rounded text-xs" readOnly value={localSDP} />
          </div>
          <div>
            <div className="text-xs mb-1">②相手の文字列（ここに貼る）</div>
            <textarea className="w-full h-24 p-2 border rounded text-xs"
              value={remoteSDP} onChange={(e)=>setRemoteSDP(e.target.value)} />
            <div className="mt-2 flex gap-2">
              {/* ホストは最後に「相手（ゲスト）の文字列」を貼って「接続完了」 */}
              <button className="px-3 py-1 rounded bg-amber-600 text-white" onClick={finishHost} disabled={!rtc.isHost || rtc.connected}>
                （ホスト）接続完了
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-2 text-sm flex items-center gap-4">
        {winner ? (
          <span className="text-rose-700 font-bold">
            {winner === "black" ? "先手の勝ち" : "後手の勝ち"}
          </span>
        ) : enforceTurn ? (
          <span>
            現在の手番：
            <span className="font-semibold">
              {turn === "black" ? "先手" : "後手"}
            </span>
          </span>
        ) : (
          <span>自由移動モード（どちらの駒も移動可）</span>
        )}
        <CheckBanner />
      </div>

      {/* 先手の持ち駒 */}
      <HandView
        side="black"
        hand={handBlack}
        onClick={handleHandClick}
        active={enforceTurn ? turn === "black" : true}
        selected={
          selected && selected.kind === "hand" && selected.side === "black"
            ? selected.piece
            : null
        }
      />

      {/* Board */}
      <div
        className="inline-block rounded-[18px] p-3 shadow-xl border-4 border-amber-900"
        style={{
          background:
            "repeating-linear-gradient(90deg,#e9c88d,#e9c88d 12px,#e6c07a 12px,#e6c07a 24px)",
        }}
      >
        <div
          className="relative bg-amber-200 rounded-[12px] overflow-hidden"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${BOARD_SIZE}, 64px)`,
            gridTemplateRows: `repeat(${BOARD_SIZE}, 64px)`,
          }}
        >
          {board.map((row, r) =>
            row.map((sq, c) => {
              const sel =
                selected &&
                selected.kind === "board" &&
                selected.r === r &&
                selected.c === c;
              const moveTarget =
                selected && selected.kind === "board" && isMoveTarget(r, c);
              return (
                <button
                  key={`${r}-${c}`}
                  onClick={() => handleSquareClick(r, c)}
                  className={`relative w-16 h-16 flex items-center justify-center border border-amber-700/50 ${
                    sel
                      ? "ring-4 ring-blue-400"
                      : moveTarget
                      ? "ring-4 ring-green-400"
                      : ""
                  }`}
                >
                  {isHoshi(r, c) && (
                    <span
                      className="absolute w-2 h-2 bg-black rounded-full opacity-70"
                      style={{ pointerEvents: "none" }}
                    />
                  )}
                  {sq.piece && <PieceView piece={sq.piece} />}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* 後手の持ち駒 */}
      <HandView
        side="white"
        hand={handWhite}
        onClick={handleHandClick}
        active={enforceTurn ? turn === "white" : true}
        selected={
          selected && selected.kind === "hand" && selected.side === "white"
            ? selected.piece
            : null
        }
      />

      <p className="mt-4 text-sm text-gray-700">
        取った駒は自分の持ち駒に入り、持ち駒をクリック→盤の空マスで打てます。
        （成り・打ち歩詰めは未対応／二歩・行き場なし打ちは禁止）
      </p>
    </div>
  );
}

/** ===== Subcomponents ===== **/
function HandView({
  side,
  hand,
  onClick,
  active,
  selected,
}: {
  side: Side;
  hand: Hand;
  onClick: (side: Side, type: Exclude<PieceType, "K">) => void;
  active: boolean;
  selected: Exclude<PieceType, "K"> | null;
}) {
  const order: Exclude<PieceType, "K">[] = ["R", "B", "G", "S", "N", "L", "P"];
  return (
    <div className="my-2 flex items-center gap-2">
      <span className="text-sm w-10 text-right opacity-70">
        {side === "black" ? "先手" : "後手"}
      </span>
      <div className="flex flex-wrap gap-1">
        {order.map((t) => (
          <button
            key={t}
            onClick={() => onClick(side, t)}
            disabled={!active || (hand[t] ?? 0) === 0}
            className={`px-2 py-1 rounded-md border border-amber-700/60 shadow text-sm ${
              selected === t ? "ring-2 ring-blue-400" : ""
            } ${
              !active || (hand[t] ?? 0) === 0
                ? "opacity-50 cursor-not-allowed"
                : ""
            }`}
          >
            <span
              className={
                side === "black" ? "rotate-180 inline-block" : "inline-block"
              }
            >
              {KANJI[t]}
            </span>
            <span className="ml-1 text-xs">×{hand[t] ?? 0}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PieceView({ piece }: { piece: Piece }) {
  const label = KANJI[piece.type];
  const rotateClass = piece.side === "black" ? "rotate-180" : "";
  return (
    <div
      className={`relative w-12 h-12 ${rotateClass} drop-shadow`}
      title={`${piece.side === "black" ? "先手" : "後手"} ${label}`}
      style={{
        clipPath:
          "polygon(50% 0%, 88% 22%, 88% 92%, 12% 92%, 12% 22%)",
        background:
          "linear-gradient(180deg,#f9e3b0 0%,#f2cc7b 60%,#e6b96a 100%)",
        border: "1px solid #8b5e34",
        borderRadius: 6,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <span
        className="text-xl font-bold select-none"
        style={{ fontFamily: "'Noto Serif JP', serif" }}
      >
        {label}
      </span>
    </div>
  );
}
