// src/ai-core.ts
// 依存なし。Node/Edge/ブラウザで動く純粋関数のみ。
const BOARD_SIZE = 9;
const promotableBase = { K: false, G: false, R: true, B: true, S: true, N: true, L: true, P: true };
const promoteMap = { K: null, G: null, R: "PR", B: "PB", S: "PS", N: "PN", L: "PL", P: "PP" };
const demoteMap = {
    K: "K", R: "R", B: "B", G: "G", S: "S", N: "N", L: "L", P: "P",
    PR: "R", PB: "B", PS: "S", PN: "N", PL: "L", PP: "P",
};
const isPromoted = (t) => ["PR", "PB", "PS", "PN", "PL", "PP"].includes(t);
const isPromotableType = (t) => !isPromoted(t) && promotableBase[t];
const toPromoted = (t) => promoteMap[t] ?? t;
const toDemotedBase = (t) => demoteMap[t];
const inBounds = (r, c) => r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
const cloneBoard = (src) => src.map(row => row.map(cell => ({ piece: cell.piece ? { ...cell.piece } : null })));
function findKing(board, side) {
    for (let r = 0; r < BOARD_SIZE; r++)
        for (let c = 0; c < BOARD_SIZE; c++) {
            const p = board[r][c].piece;
            if (p && p.side === side && demoteMap[p.type] === "K")
                return [r, c];
        }
    return null;
}
function hasPawnInFile(board, side, col) {
    for (let r = 0; r < BOARD_SIZE; r++) {
        const p = board[r][col].piece;
        if (p && p.side === side && demoteMap[p.type] === "P")
            return true;
    }
    return false;
}
function rayMoves(board, r, c, deltas, side) {
    const res = [];
    for (const [dr, dc] of deltas) {
        let nr = r + dr, nc = c + dc;
        while (inBounds(nr, nc)) {
            const occ = board[nr][nc].piece;
            if (!occ)
                res.push([nr, nc]);
            else {
                if (occ.side !== side)
                    res.push([nr, nc]);
                break;
            }
            nr += dr;
            nc += dc;
        }
    }
    return res;
}
function stepMoves(board, r, c, deltas, side) {
    const res = [];
    for (const [dr, dc] of deltas) {
        const nr = r + dr, nc = c + dc;
        if (!inBounds(nr, nc))
            continue;
        const occ = board[nr][nc].piece;
        if (!occ || occ.side !== side)
            res.push([nr, nc]);
    }
    return res;
}
function goldLike(board, r, c, side) {
    const dir = side === "black" ? 1 : -1;
    return stepMoves(board, r, c, dir === 1 ? [[-1, 0], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]] : [[1, 0], [0, -1], [0, 1], [-1, -1], [-1, 0], [-1, 1]], side);
}
function legalMoves(board, r, c) {
    const p = board[r][c].piece;
    if (!p)
        return [];
    const side = p.side;
    const dir = side === "black" ? 1 : -1;
    const t = p.type;
    if (isPromoted(t)) {
        if (t === "PR") {
            return [...rayMoves(board, r, c, [[1, 0], [-1, 0], [0, 1], [0, -1]], side), ...stepMoves(board, r, c, [[1, 1], [1, -1], [-1, 1], [-1, -1]], side)];
        }
        if (t === "PB") {
            return [...rayMoves(board, r, c, [[1, 1], [1, -1], [-1, 1], [-1, -1]], side), ...stepMoves(board, r, c, [[1, 0], [-1, 0], [0, 1], [0, -1]], side)];
        }
        return goldLike(board, r, c, side);
    }
    switch (t) {
        case "K": return stepMoves(board, r, c, [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]], side);
        case "G": return goldLike(board, r, c, side);
        case "S": return stepMoves(board, r, c, dir === 1 ? [[1, -1], [1, 0], [1, 1], [-1, -1], [-1, 1]] : [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 1]], side);
        case "N": return stepMoves(board, r, c, dir === 1 ? [[2, -1], [2, 1]] : [[-2, -1], [-2, 1]], side);
        case "L": return rayMoves(board, r, c, [[dir, 0]], side);
        case "P": return stepMoves(board, r, c, [[dir, 0]], side);
        case "B": return rayMoves(board, r, c, [[1, 1], [1, -1], [-1, 1], [-1, -1]], side);
        case "R": return rayMoves(board, r, c, [[1, 0], [-1, 0], [0, 1], [0, -1]], side);
        default: return [];
    }
}
const inEnemyZone = (side, r) => side === "black" ? r >= 6 : r <= 2;
const involvesEnemyZone = (side, fromR, toR) => inEnemyZone(side, fromR) || inEnemyZone(side, toR);
const isForcedPromotion = (side, pieceType, toR) => {
    const t = isPromoted(pieceType) ? demoteMap[pieceType] : pieceType;
    if (t === "P" || t === "L") {
        return (side === "black" && toR === 8) || (side === "white" && toR === 0);
    }
    if (t === "N") {
        return (side === "black" && (toR >= 7)) || (side === "white" && (toR <= 1));
    }
    return false;
};
// SEE 風簡易
const pieceValue = { P: 100, L: 330, N: 320, S: 450, G: 500, B: 850, R: 1000, K: 10000 };
function seeGain(bd, from, to) {
    const victim = bd[to.r][to.c].piece;
    if (!victim)
        return 0;
    const v = pieceValue[demoteMap[victim.type]];
    const attacker = bd[from.r][from.c].piece;
    const a = pieceValue[demoteMap[attacker.type]];
    return v - Math.floor(a * 0.7);
}
function applyOneMove(bd, hB, hW, side, m) {
    const nextB = cloneBoard(bd);
    const nextHB = { ...hB };
    const nextHW = { ...hW };
    let win = null;
    if (m.kind === "drop") {
        nextB[m.at.r][m.at.c].piece = { side, type: m.piece };
        (side === "black" ? nextHB : nextHW)[m.piece] = Math.max(0, ((side === "black" ? nextHB : nextHW)[m.piece] ?? 0) - 1);
    }
    else {
        const mover = nextB[m.from.r][m.from.c].piece;
        if (m.took) {
            const base = demoteMap[m.took.type];
            if (base === "K") {
                win = side;
            }
            else {
                const handSide = side === "black" ? nextHB : nextHW;
                handSide[base] = (handSide[base] ?? 0) + 1;
            }
        }
        const afterType = (m.promote && isPromotableType(mover.type)) ? toPromoted(mover.type) : mover.type;
        nextB[m.to.r][m.to.c].piece = { side, type: afterType };
        nextB[m.from.r][m.from.c].piece = null;
    }
    return { bd: nextB, hB: nextHB, hW: nextHW, winner: win };
}
function enumerateMovesGeneric(curBoard, handB, handW, side) {
    const res = [];
    for (let r = 0; r < BOARD_SIZE; r++)
        for (let c = 0; c < BOARD_SIZE; c++) {
            const p = curBoard[r][c].piece;
            if (!p || p.side !== side)
                continue;
            const mv = legalMoves(curBoard, r, c);
            mv.forEach(([tr, tc]) => {
                const dest = curBoard[tr][tc].piece || null;
                const must = isPromotableType(p.type) && isForcedPromotion(side, p.type, tr);
                const canBasic = isPromotableType(p.type) && involvesEnemyZone(side, r, tr);
                if (must) {
                    res.push({ kind: "move", from: { r, c }, to: { r: tr, c: tc }, took: dest, promote: true });
                }
                else if (canBasic) {
                    res.push({ kind: "move", from: { r, c }, to: { r: tr, c: tc }, took: dest, promote: true });
                    res.push({ kind: "move", from: { r, c }, to: { r: tr, c: tc }, took: dest, promote: false });
                }
                else {
                    res.push({ kind: "move", from: { r, c }, to: { r: tr, c: tc }, took: dest, promote: false });
                }
            });
        }
    const hand = side === "black" ? handB : handW;
    const canDrop = (t, rr, cc) => {
        if (curBoard[rr][cc].piece)
            return false;
        if (t === "P") {
            if ((side === "black" && rr === 8) || (side === "white" && rr === 0))
                return false;
            if (hasPawnInFile(curBoard, side, cc))
                return false;
        }
        if (t === "L") {
            if ((side === "black" && rr === 8) || (side === "white" && rr === 0))
                return false;
        }
        if (t === "N") {
            if ((side === "black" && rr >= 7) || (side === "white" && rr <= 1))
                return false;
        }
        return true;
    };
    ["R", "B", "G", "S", "N", "L", "P"].forEach(t => {
        const n = hand[t] ?? 0;
        if (n <= 0)
            return;
        for (let r = 0; r < BOARD_SIZE; r++)
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (canDrop(t, r, c))
                    res.push({ kind: "drop", piece: t, at: { r, c } });
            }
    });
    return res;
}
// 評価（簡略：駒価値＋位置＋機動力＋玉周囲）
function evaluateBoard(bd, hB, hW) {
    let score = 0, mobW = 0, mobB = 0, shieldW = 0, shieldB = 0;
    for (let r = 0; r < BOARD_SIZE; r++)
        for (let c = 0; c < BOARD_SIZE; c++) {
            const p = bd[r][c].piece;
            if (!p)
                continue;
            const base = demoteMap[p.type];
            let v = pieceValue[base];
            if (isPromoted(p.type))
                v += 30;
            const ms = legalMoves(bd, r, c).length;
            if (p.side === "white")
                mobW += ms;
            else
                mobB += ms;
            if (base === "K") {
                for (let dr = -1; dr <= 1; dr++)
                    for (let dc = -1; dc <= 1; dc++) {
                        const nr = r + dr, nc = c + dc;
                        if (!inBounds(nr, nc))
                            continue;
                        const q = bd[nr][nc].piece;
                        if (!q)
                            continue;
                        if (q.side === p.side) {
                            if (p.side === "white")
                                shieldW += 4;
                            else
                                shieldB += 4;
                        }
                    }
            }
            // 段ボーナス
            v += (p.side === "white" ? (8 - r) : r) * 1.5;
            score += (p.side === "white" ? v : -v);
        }
    score += (mobility(bd, "white") - mobility(bd, "black")) * 2;
    score += (shieldW - shieldB) * 1.5;
    ["R", "B", "G", "S", "N", "L", "P"].forEach(t => {
        score += (hW[t] ?? 0) * pieceValue[t] * 0.9;
        score -= (hB[t] ?? 0) * pieceValue[t] * 0.9;
    });
    return score;
    function mobility(bd2, s) {
        let m = 0;
        for (let r = 0; r < 9; r++)
            for (let c = 0; c < 9; c++) {
                const p = bd2[r][c].piece;
                if (p && p.side === s)
                    m += legalMoves(bd2, r, c).length;
            }
        return m;
    }
}
// Zobrist / 置換表（軽量）
class Zobrist {
    pieceIndex(side, type) {
        const types = ["K", "R", "B", "G", "S", "N", "L", "P", "PR", "PB", "PS", "PN", "PL", "PP"];
        const s = side === "black" ? 0 : 1;
        const t = types.indexOf(type);
        return s * 14 + t;
    }
    constructor() {
        const rnd = (seed) => { let x = seed >>> 0; return () => (x ^= x << 13, x ^= x >>> 17, x ^= x << 5) >>> 0; };
        const r = rnd(0x9e3779b9);
        this.psq = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => Array.from({ length: 28 }, () => r())));
        this.hand = [0, 1].map(() => Array.from({ length: 7 }, () => Array.from({ length: 9 }, () => r())));
        this.turn = r();
    }
}
class TransTable {
    constructor() {
        this.map = new Map();
        this.tick = 1;
    }
    get(key) { return this.map.get(key); }
    set(e) { this.map.set(e.key, e); }
    age() {
        this.tick++;
        if (this.tick % 64 === 0 && this.map.size > 50000) {
            for (const [k, v] of Array.from(this.map.entries())) {
                if (this.tick - v.age > 128)
                    this.map.delete(k);
            }
        }
    }
    clear() { this.map.clear(); this.tick = 1; }
    now() { return this.tick; }
}
function keyBoard(board, handB, handW, side, zob) {
    let k = 0;
    for (let r = 0; r < BOARD_SIZE; r++)
        for (let c = 0; c < BOARD_SIZE; c++) {
            const p = board[r][c].piece;
            if (!p)
                continue;
            const pi = zob.pieceIndex(p.side, p.type);
            k ^= zob.psq[r][c][pi];
        }
    ["R", "B", "G", "S", "N", "L", "P"].forEach((t, i) => {
        const nb = Math.min(8, handB[t] ?? 0);
        const nw = Math.min(8, handW[t] ?? 0);
        for (let n = 0; n < nb; n++)
            k ^= zob.hand[0][i][n];
        for (let n = 0; n < nw; n++)
            k ^= zob.hand[1][i][n];
    });
    if (side === "white")
        k ^= zob.turn;
    return k >>> 0;
}
function pack(m) {
    return m.kind === "drop"
        ? `d:${m.piece},${m.at.r},${m.at.c}`
        : `m:${m.from.r},${m.from.c},${m.to.r},${m.to.c},${m.promote ? "1" : "0"}`;
}
export function unpack(s, bd) {
    if (s[0] === "d") {
        const rest = s.split(":")[1];
        const [pc, r, c] = rest.split(",");
        return { kind: "drop", side: "white", piece: pc, at: { r: Number(r), c: Number(c) } };
    }
    else {
        const rest = s.split(":")[1];
        const [frS, fcS, trS, tcS, pS] = rest.split(",");
        const fr = Number(frS), fc = Number(fcS), tr = Number(trS), tc = Number(tcS);
        const p = Number(pS);
        const took = bd[tr][tc].piece ?? null;
        return { kind: "move", side: "white", from: { r: fr, c: fc }, to: { r: tr, c: tc }, took, promote: !!p };
    }
}
function orderMoves(bd, side, list, depth, hist, killers, pv, ttBest) {
    const ks = killers[depth] ?? [];
    const scored = list.map(m => {
        const pm = pack(m);
        let s = 0;
        if (pv && pm === pv)
            s += 1000000;
        if (ttBest && pm === ttBest)
            s += 500000;
        if (m.kind === "move") {
            if (m.took)
                s += pieceValue[demoteMap[m.took.type]] * 100;
            if (m.promote)
                s += 200;
            if (m.took) {
                s += seeGain(bd, m.from, m.to);
            }
            s += (hist[histKey(side, m.from, m.to)] ?? 0);
        }
        else {
            s += 50;
        }
        if (ks.includes(pm))
            s += 10000;
        return { m, s };
    });
    scored.sort((a, b) => b.s - a.s);
    return scored.map(x => x.m);
}
function histKey(side, f, t) { return `${side}-${f.r}${f.c}-${t.r}${t.c}`; }
function quiescence(bd, hB, hW, side, alpha, beta) {
    const stand = evaluateBoard(bd, hB, hW) * (side === "white" ? 1 : -1);
    if (stand >= beta)
        return beta;
    if (stand > alpha)
        alpha = stand;
    const moves = enumerateMovesGeneric(bd, hB, hW, side).filter(m => m.kind === "move" && (m.took || m.promote));
    if (moves.length > 40) {
        moves.sort((a, b) => {
            const ga = a.kind === "move" ? seeGain(bd, a.from, a.to) : 0;
            const gb = b.kind === "move" ? seeGain(bd, b.from, b.to) : 0;
            return gb - ga;
        });
        moves.length = 40;
    }
    for (const m of moves) {
        const { bd: nb, hB: nhB, hW: nhW, winner: w } = applyOneMove(bd, hB, hW, side, m);
        const score = w ? 999999 : -quiescence(nb, nhB, nhW, side === "black" ? "white" : "black", -beta, -alpha);
        if (score >= beta)
            return beta;
        if (score > alpha)
            alpha = score;
    }
    return alpha;
}
export function think(board, handBlack, handWhite, side, timeMs) {
    const zob = new Zobrist();
    const tt = new TransTable();
    const killers = {};
    const history = {};
    const start = Date.now();
    const MAX_DEPTH = 8;
    let depth = 1;
    let aspiration = 50;
    let windowAlpha = -1e9, windowBeta = 1e9;
    // ★ 追加: ルート合法手を取得してフォールバックを確保
    const rootMoves = enumerateMovesGeneric(board, handBlack, handWhite, side);
    if (rootMoves.length === 0)
        return null; // 詰み
    let best = pack(rootMoves[0]); // ←最低限の一手
    let bestScore = -1e9;
    while (depth <= MAX_DEPTH) {
        const remain = timeMs - (Date.now() - start);
        // ★ 変更: 深さ1だけは必ず走らせる。以降は残り時間が乏しければ終了
        if (depth > 1 && remain < 120)
            break;
        const key = keyBoard(board, handBlack, handWhite, side, zob);
        const { score, move } = search(board, handBlack, handWhite, side, depth, windowAlpha, windowBeta, key, 0, start, timeMs, tt, killers, history, zob, best ?? undefined);
        if (score <= windowAlpha) {
            windowAlpha -= aspiration;
            windowBeta = score + aspiration;
            continue;
        }
        if (score >= windowBeta) {
            windowBeta += aspiration;
            windowAlpha = score - aspiration;
            continue;
        }
        if (move) {
            best = move;
            bestScore = score;
        }
        depth++;
        aspiration = Math.max(30, Math.floor(aspiration * 0.9));
        windowAlpha = bestScore - aspiration;
        windowBeta = bestScore + aspiration;
        if (Date.now() - start > timeMs)
            break;
    }
    return best;
}
function addHistory(history, side, f, t, depth) {
    const k = histKey(side, f, t);
    const cur = history[k] ?? 0;
    history[k] = cur + depth * depth;
}
function pushKiller(killers, depth, pm) {
    const ks = killers[depth] ?? (killers[depth] = []);
    if (!ks.some(x => x === pm))
        ks.unshift(pm);
    if (ks.length > 2)
        ks.pop();
}
function search(bd, hB, hW, side, depth, alpha, beta, key, ply, start, limitMs, tt, killers, history, zob, pv) {
    if (Date.now() - start > limitMs)
        return { score: alpha, move: null };
    const myK = findKing(bd, side);
    const opK = findKing(bd, side === "black" ? "white" : "black");
    if (!myK)
        return { score: -999999 + ply, move: null };
    if (!opK)
        return { score: 999999 - ply, move: null };
    const tte = tt.get(key);
    if (tte && tte.depth >= depth) {
        if (tte.flag === 0)
            return { score: tte.score, move: tte.best ?? null };
        if (tte.flag === 1 && tte.score <= alpha)
            return { score: alpha, move: tte.best ?? null };
        if (tte.flag === 2 && tte.score >= beta)
            return { score: beta, move: tte.best ?? null };
    }
    if (depth <= 0) {
        const qs = quiescence(bd, hB, hW, side, alpha, beta);
        return { score: qs, move: null };
    }
    // 王手判定: 自玉に利きが通っていれば inCheck = true
    const [kr, kc] = myK;
    let inCheck = false;
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            const p = bd[r][c].piece;
            if (!p || p.side === side)
                continue;
            const moves = legalMoves(bd, r, c);
            if (moves.some(([tr, tc]) => tr === kr && tc === kc)) {
                inCheck = true;
                break;
            }
        }
        if (inCheck)
            break;
    }
    // Null Move Pruning: 王手されておらず深さがある程度ある場合のみ
    if (depth >= 3 && !inCheck) {
        const nullDepth = depth - 3 - 1;
        const nullScore = -search(bd, hB, hW, side === "black" ? "white" : "black", nullDepth, -beta, -beta + 1, key, ply + 1, start, limitMs, tt, killers, history, zob).score;
        // β以上なら枝刈り（これ以上探索しなくて良い）
        if (nullScore >= beta) {
            return { score: beta, move: null };
        }
    }
    let bestMove = null;
    let a = alpha;
    const b = beta;
    const raw = enumerateMovesGeneric(bd, hB, hW, side);
    if (raw.length === 0) {
        const sc = evaluateBoard(bd, hB, hW) * (side === "white" ? 1 : -1) - 200;
        return { score: sc, move: null };
    }
    const ordered = orderMoves(bd, side, raw, ply, history, killers, pv, tte?.best);
    for (let i = 0; i < ordered.length; i++) {
        const m = ordered[i];
        const pm = pack(m);
        const { bd: nb, hB: nhB, hW: nhW, winner: w } = applyOneMove(bd, hB, hW, side, m);
        let sc;
        if (w) {
            sc = 999999 - ply;
        }
        else {
            let tscore;
            if (i === 0) {
                tscore = -search(nb, nhB, nhW, side === "black" ? "white" : "black", depth - 1, -b, -a, keyBoard(nb, nhB, nhW, side === "black" ? "white" : "black", zob), ply + 1, start, limitMs, tt, killers, history, zob).score;
            }
            else {
                tscore = -search(nb, nhB, nhW, side === "black" ? "white" : "black", depth - 1, -(a + 1), -a, keyBoard(nb, nhB, nhW, side === "black" ? "white" : "black", zob), ply + 1, start, limitMs, tt, killers, history, zob).score;
                if (tscore > a && tscore < b) {
                    tscore = -search(nb, nhB, nhW, side === "black" ? "white" : "black", depth - 1, -b, -a, keyBoard(nb, nhB, nhW, side === "black" ? "white" : "black", zob), ply + 1, start, limitMs, tt, killers, history, zob, pm).score;
                }
            }
            sc = tscore;
        }
        if (sc > a) {
            a = sc;
            bestMove = pm;
            if (a >= b) {
                if (m.kind === "move")
                    addHistory(history, side, m.from, m.to, depth);
                pushKiller(killers, ply, pm);
                break;
            }
        }
    }
    const entry = { key, depth, score: a, flag: 0, best: bestMove ?? undefined, age: tt.now() };
    if (a <= alpha)
        entry.flag = 1;
    else if (a >= beta)
        entry.flag = 2;
    tt.set(entry);
    return { score: a, move: bestMove };
}
