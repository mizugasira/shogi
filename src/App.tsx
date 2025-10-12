import React, { useMemo, useRef, useState } from "react";

/** ===== Types ===== **/
type Side = "black" | "white";              // 先手 / 後手
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

/** ===== Constants / Labels ===== **/
const BOARD_SIZE = 9;
// ラベル（簡易）：成銀=「全」、成桂=「圭」、成香=「杏」、と金=「と」、龍王=「龍」、龍馬=「馬」
const KANJI: Record<PieceType, string> = {
  K: "玉", R: "飛", B: "角", G: "金", S: "銀", N: "桂", L: "香", P: "歩",
  PR: "龍", PB: "馬", PS: "全", PN: "圭", PL: "杏", PP: "と",
};
const emptyHand = (): Hand => ({ R: 0, B: 0, G: 0, S: 0, N: 0, L: 0, P: 0 });

/** ===== Promotion helpers ===== **/
const promotableBase: Record<BasePiece, boolean> = { K:false, G:false, R:true, B:true, S:true, N:true, L:true, P:true };
const promoteMap: Record<BasePiece, PromotedPiece | null> = { K:null, G:null, R:"PR", B:"PB", S:"PS", N:"PN", L:"PL", P:"PP" };
const demoteMap: Record<PieceType, BasePiece> = {
  K:"K", R:"R", B:"B", G:"G", S:"S", N:"N", L:"L", P:"P",
  PR:"R", PB:"B", PS:"S", PN:"N", PL:"L", PP:"P",
};
const isPromoted = (t:PieceType): t is PromotedPiece => ["PR","PB","PS","PN","PL","PP"].includes(t as any);
const isPromotableType = (t:PieceType) => !isPromoted(t) && promotableBase[t as BasePiece];
const toPromoted = (t:BasePiece): PieceType => promoteMap[t] ?? t;
const toDemotedBase = (t:PieceType): BasePiece => demoteMap[t];

// 敵陣判定（3段）
const inEnemyZone = (side:Side, r:number) => side==="black" ? r>=6 : r<=2;
// 侵入（敵陣外→敵陣内）
const enteredZoneByMove = (side:Side, fromR:number, toR:number) =>
  !inEnemyZone(side, fromR) && inEnemyZone(side, toR);
// 敵陣に関与（開始 or 終了が敵陣内）＝一般的な「成れる」条件
const involvesEnemyZone = (side:Side, fromR:number, toR:number) =>
  inEnemyZone(side, fromR) || inEnemyZone(side, toR);

// 強制成り判定（行き場なしルールの簡易版）
const isForcedPromotion = (side:Side, pieceType:PieceType, toR:number) => {
  const t = isPromoted(pieceType) ? demoteMap[pieceType] : pieceType;
  if (t === "P" || t === "L") {
    return (side === "black" && toR === 8) || (side === "white" && toR === 0);
  }
  if (t === "N") {
    return (side === "black" && (toR >= 7)) || (side === "white" && (toR <= 1));
  }
  return false;
};

/** ===== Initial Setup（★飛車と角の位置を修正：入れ替え） ===== **/
function initialBoard(): Board {
  const emptyRow = (): Square[] => Array.from({ length: BOARD_SIZE }, () => ({ piece: null }));
  const b: Board = Array.from({ length: BOARD_SIZE }, emptyRow);
  const place = (r: number, c: number, type: BasePiece, side: Side) => { b[r][c].piece = { side, type }; };

  // 先手：飛(1,1)・角(1,7)
  place(0,0,"L","black"); place(0,1,"N","black"); place(0,2,"S","black"); place(0,3,"G","black"); place(0,4,"K","black"); place(0,5,"G","black"); place(0,6,"S","black"); place(0,7,"N","black"); place(0,8,"L","black");
  place(1,1,"R","black"); place(1,7,"B","black");
  for (let c=0;c<BOARD_SIZE;c++) place(2,c,"P","black");

  // 後手：飛(7,7)・角(7,1)
  place(8,0,"L","white"); place(8,1,"N","white"); place(8,2,"S","white"); place(8,3,"G","white"); place(8,4,"K","white"); place(8,5,"G","white"); place(8,6,"S","white"); place(8,7,"N","white"); place(8,8,"L","white");
  place(7,7,"R","white"); place(7,1,"B","white");
  for (let c=0;c<BOARD_SIZE;c++) place(6,c,"P","white");

  return b;
}

/** ===== Utils ===== **/
const inBounds = (r:number,c:number)=> r>=0 && r<BOARD_SIZE && c>=0 && c<BOARD_SIZE;
const cloneBoard = (src:Board):Board => src.map(row=>row.map(cell=>({piece: cell.piece?{...cell.piece}:null})));

/** ===== Moves ===== **/
function rayMoves(board:Board,r:number,c:number,deltas:[number,number][],side:Side):[number,number][]{
  const res:[number,number][]=[];
  for(const[dr,dc] of deltas){
    let nr=r+dr,nc=c+dc;
    while(inBounds(nr,nc)){
      const occ=board[nr][nc].piece;
      if(!occ) res.push([nr,nc]);
      else { if(occ.side!==side) res.push([nr,nc]); break; }
      nr+=dr; nc+=dc;
    }
  }
  return res;
}
function stepMoves(board:Board,r:number,c:number,deltas:[number,number][],side:Side):[number,number][]{
  const res:[number,number][]=[];
  for(const[dr,dc] of deltas){
    const nr=r+dr,nc=c+dc; if(!inBounds(nr,nc)) continue;
    const occ=board[nr][nc].piece; if(!occ || occ.side!==side) res.push([nr,nc]);
  }
  return res;
}
function goldLike(board:Board,r:number,c:number,side:Side){
  const dir = side==="black"?1:-1;
  return stepMoves(board,r,c, dir===1 ? [[-1,0],[0,-1],[0,1],[1,-1],[1,0],[1,1]] : [[1,0],[0,-1],[0,1],[-1,-1],[-1,0],[-1,1]], side);
}
function legalMoves(board:Board,r:number,c:number):[number,number][]{
  const p=board[r][c].piece; if(!p) return [];
  const side=p.side;
  const dir = side==="black"?1:-1;
  const t = p.type;
  if(isPromoted(t)){
    if(t==="PR"){ return [...rayMoves(board,r,c,[[1,0],[-1,0],[0,1],[0,-1]],side), ...stepMoves(board,r,c,[[1,1],[1,-1],[-1,1],[-1,-1]],side)]; }
    if(t==="PB"){ return [...rayMoves(board,r,c,[[1,1],[1,-1],[-1,1],[-1,-1]],side), ...stepMoves(board,r,c,[[1,0],[-1,0],[0,1],[0,-1]],side)]; }
    return goldLike(board,r,c,side); // PS/PN/PL/PP
  }
  switch(t){
    case "K": return stepMoves(board,r,c,[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]],side);
    case "G": return goldLike(board,r,c,side);
    case "S": return stepMoves(board,r,c, dir===1 ? [[1,-1],[1,0],[1,1],[-1,-1],[-1,1]] : [[-1,-1],[-1,0],[-1,1],[1,-1],[1,1]], side);
    case "N": return stepMoves(board,r,c, dir===1 ? [[2,-1],[2,1]] : [[-2,-1],[-2,1]], side);
    case "L": return rayMoves(board,r,c,[[dir,0]],side);
    case "P": return stepMoves(board,r,c,[[dir,0]],side);
    case "B": return rayMoves(board,r,c,[[1,1],[1,-1],[-1,1],[-1,-1]],side);
    case "R": return rayMoves(board,r,c,[[1,0],[-1,0],[0,1],[0,-1]],side);
    default: return [];
  }
}
function findKing(board:Board, side:Side):[number,number]|null{
  for(let r=0;r<BOARD_SIZE;r++) for(let c=0;c<BOARD_SIZE;c++){
    const p=board[r][c].piece; if(p && p.side===side && demoteMap[p.type]==="K") return [r,c];
  }
  return null;
}
function isSquareAttacked(board:Board, bySide:Side, tr:number, tc:number):boolean{
  for(let r=0;r<BOARD_SIZE;r++) for(let c=0;c<BOARD_SIZE;c++){
    const p=board[r][c].piece; if(p && p.side===bySide){
      const moves=legalMoves(board,r,c); if(moves.some(([mr,mc])=>mr===tr && mc===tc)) return true;
    }
  }
  return false;
}
function hasPawnInFile(board:Board, side:Side, col:number):boolean{
  for(let r=0;r<BOARD_SIZE;r++){ const p=board[r][col].piece; if(p && p.side===side && demoteMap[p.type]==="P") return true; }
  return false;
}

/** ===== WebRTC (P2P) ===== **/
type RTCState = { pc: RTCPeerConnection|null; dc: RTCDataChannel|null; connected:boolean; isHost:boolean };
const STUN_SERVERS: RTCConfiguration = { iceServers:[{ urls:["stun:stun.l.google.com:19302"] }] };
async function waitForIceGathering(pc:RTCPeerConnection):Promise<void>{
  if(pc.iceGatheringState==="complete") return;
  await new Promise<void>(resolve=>{
    const onChange=()=>{ if(pc.iceGatheringState==="complete"){ pc.removeEventListener("icegatheringstatechange",onChange); resolve(); } };
    pc.addEventListener("icegatheringstatechange",onChange);
    setTimeout(()=>resolve(),2000);
  });
}

/** ===== UI ===== **/
export default function ShogiApp(){
  const [board,setBoard] = useState<Board>(()=>initialBoard());
  const [selected,setSelected] = useState<Selected>(null);
  const [turn,setTurn] = useState<Side>("black");
  const [handBlack,setHandBlack] = useState<Hand>(()=>emptyHand());
  const [handWhite,setHandWhite] = useState<Hand>(()=>emptyHand());
  const [winner,setWinner] = useState<Side|null>(null);

  // 成り確認
  const [promoAsk,setPromoAsk] = useState<null | {
    from:{r:number;c:number}, to:{r:number;c:number},
    mover: Piece, took: Piece | null
  }>(null);

  // P2P
  const [rtc,setRtc] = useState<RTCState>({ pc:null, dc:null, connected:false, isHost:false });
  const [localSDP,setLocalSDP] = useState<string>("");
  const [remoteSDP,setRemoteSDP] = useState<string>("");

  // 自分の陣営（未接続時は "any"）
  const [mySide,setMySide] = useState<Side | "any">("any");

  // DataChannel
  const dcRef = useRef<RTCDataChannel|null>(null);
  const send = (payload:any)=>{
    const dc = dcRef.current;
    if(dc && dc.readyState==="open") dc.send(JSON.stringify(payload));
  };

  // 接続状態と操作許可
  const isP2P = dcRef.current?.readyState === "open";
  const canActThisTurn = (side: Side) => !isP2P ? true : (mySide !== "any" && mySide === side && turn === side);
  const viewerIsBlack = isP2P && mySide === "black";

  // 盤面派生
  const moves = useMemo(()=> (selected && selected.kind==="board") ? legalMoves(board, selected.r, selected.c) : [], [selected,board]);
  const checkInfo = useMemo(()=>{
    const kb=findKing(board,"black"); const kw=findKing(board,"white");
    const blackInCheck = kb ? isSquareAttacked(board,"white",kb[0],kb[1]) : false;
    const whiteInCheck = kw ? isSquareAttacked(board,"black",kw[0],kw[1]) : false;
    return { blackInCheck, whiteInCheck };
  },[board]);
  const isMoveTarget = (r:number,c:number)=> moves.some(([mr,mc])=>mr===r && mc===c);
  const getHand = (side:Side)=> side==="black"?handBlack:handWhite;
  const setHand = (side:Side, updater:(h:Hand)=>Hand)=>{
    if(side==="black") setHandBlack(prev=>updater({...prev}));
    else setHandWhite(prev=>updater({...prev}));
  };
  const addToHand = (side:Side, type:Exclude<BasePiece,"K">)=>{
    setHand(side,(h)=>({ ...h, [type]: (h[type] ?? 0) + 1 }));
  };
  const removeFromHand = (side:Side, type:Exclude<BasePiece,"K">)=>{
    setHand(side,(h)=>({ ...h, [type]: Math.max(0,(h[type] ?? 0) - 1) }));
  };

  // リモート適用
  const applyRemoteAction = (a:any)=>{
    if(winner) return;
    switch(a.t){
      case "move":{
        const {from,to,took, promote} = a as {from:{r:number;c:number}; to:{r:number;c:number}; took:PieceType|null; promote?:boolean};
        setBoard(prev=>{
          const next=cloneBoard(prev);
          const mover=next[from.r][from.c].piece!;
          // 取る（受信側で1回だけ加算）
          if(took){
            const base = toDemotedBase(took);
            if(base==="K"){ setWinner(mover.side); }
            else addToHand(mover.side, base as Exclude<BasePiece,"K">);
          }
          const afterType = (promote && isPromotableType(mover.type)) ? toPromoted(mover.type as BasePiece) : mover.type;
          next[to.r][to.c].piece={ side:mover.side, type:afterType };
          next[from.r][from.c].piece=null;
          return next;
        });
        setSelected(null);
        setPromoAsk(null);
        setTurn(t=> (t==="black"?"white":"black"));
        break;
      }
      case "drop":{
        const {side,piece,at} = a as {side:Side; piece:Exclude<BasePiece,"K">; at:{r:number;c:number}};
        setBoard(prev=>{ const next=cloneBoard(prev); next[at.r][at.c].piece={side,type:piece}; return next; });
        removeFromHand(side,piece);
        setSelected(null);
        setPromoAsk(null);
        setTurn(t=> (t==="black"?"white":"black"));
        break;
      }
      case "reset": reset(false); break; // 相手からのリセットは接続状態は維持
      case "resign": setWinner(a.winner as Side); break;
    }
  };

  /** ===== P2P 接続 ===== */
  async function startHost(){
    if(rtc.pc) return;
    const pc = new RTCPeerConnection(STUN_SERVERS);
    const dc = pc.createDataChannel("shogi");
    dcRef.current = dc;
    dc.onopen = ()=>{ setRtc({ pc, dc, connected:true, isHost:true }); setMySide("black"); };
    dc.onmessage = (e)=> applyRemoteAction(JSON.parse(e.data));
    const offer = await pc.createOffer(); await pc.setLocalDescription(offer); await waitForIceGathering(pc);
    setLocalSDP(JSON.stringify(pc.localDescription)); setRtc(s=>({ ...s, pc, isHost:true }));
  }
  async function acceptAsGuest(){
    if(rtc.pc) return;
    if(!remoteSDP) return;
    const offer:RTCSessionDescriptionInit = JSON.parse(remoteSDP);
    if(offer.type!=="offer"){ alert("ゲストはホストの offer を貼ってください"); return; }
    const pc = new RTCPeerConnection(STUN_SERVERS);
    pc.ondatachannel = (ev)=>{
      const dc = ev.channel; dcRef.current = dc;
      dc.onopen = ()=>{ setRtc({ pc, dc, connected:true, isHost:false }); setMySide("white"); };
      dc.onmessage = (e)=> applyRemoteAction(JSON.parse(e.data));
    };
    if(pc.signalingState!=="stable"){ alert(`状態が不正: ${pc.signalingState}`); return; }
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer(); await pc.setLocalDescription(answer); await waitForIceGathering(pc);
    setLocalSDP(JSON.stringify(pc.localDescription)); setRtc(s=>({ ...s, pc, isHost:false }));
  }
  async function finishHost(){
    if(!rtc.pc) return;
    if(!rtc.isHost){ alert("ホストのみ実行可"); return; }
    if(!remoteSDP){ alert("ゲストの answer を貼ってください"); return; }
    const answer:RTCSessionDescriptionInit = JSON.parse(remoteSDP);
    if(answer.type!=="answer"){ alert("ここは answer を貼ります（offer ではありません）"); return; }
    if(rtc.pc.signalingState!=="have-local-offer"){ alert(`今は受け付けできません: ${rtc.pc.signalingState}`); return; }
    try{ await rtc.pc.setRemoteDescription(answer); }catch{ alert("setRemoteDescription 失敗。やり直してください。"); }
  }
  const resetP2P=()=>{
    try{ rtc.pc?.close(); }catch{}
    dcRef.current=null;
    setRtc({ pc:null, dc:null, connected:false, isHost:false });
    setLocalSDP(""); setRemoteSDP("");
    setMySide("any");
  };

  /** ===== 成り確定（ダイアログの応答を反映） ===== */
  const applyMoveWithOptionalPromotion = (from:{r:number;c:number}, to:{r:number;c:number}, mover:Piece, took:Piece|null, promote:boolean)=>{
    // 取る（送信側で1回だけ加算）
    if(took){
      const base = toDemotedBase(took.type);
      if(base==="K"){ setWinner(mover.side); }
      else addToHand(mover.side, base as Exclude<BasePiece,"K">);
    }
    // 盤面更新
    setBoard(prev=>{
      const next=cloneBoard(prev);
      const afterType = (promote && isPromotableType(mover.type)) ? toPromoted(mover.type as BasePiece) : mover.type;
      next[to.r][to.c].piece = { side:mover.side, type:afterType };
      next[from.r][from.c].piece = null;
      return next;
    });
    setSelected(null);
    setPromoAsk(null);
    setTurn(t=> (t==="black"?"white":"black"));
    // P2P送信
    send({ t:"move", from, to, took: took ? took.type : null, promote });
  };

  /** ===== クリック処理 ===== */
  const handleSquareClick = (r:number,c:number)=>{
    if(winner) return;
    const sq = board[r][c];

    // --- 手駒 → 盤（打ち） ---
    if(selected && selected.kind==="hand"){
      const dropSide = selected.side;
      if(isP2P && !canActThisTurn(dropSide)) return;
      if(sq.piece) return;
      const dir = dropSide==="black"?1:-1;
      const type = selected.piece;

      // 打ちの禁則
      if(type==="P"){
        if((dir===1 && r===8) || (dir===-1 && r===0)) return; // 最終段に打てない
        if(hasPawnInFile(board,dropSide,c)) return;           // 二歩
      }
      if(type==="L"){ if((dir===1 && r===8) || (dir===-1 && r===0)) return; }
      if(type==="N"){ if((dir===1 && r>=7) || (dir===-1 && r<=1)) return; }

      setBoard(prev=>{ const next=cloneBoard(prev); next[r][c].piece={ side:dropSide, type }; return next; });
      removeFromHand(dropSide,type);
      setSelected(null);
      setPromoAsk(null);

      // 打った直後は成れない
      send({ t:"drop", side:dropSide, piece:type, at:{r,c} });
      setTurn(t=> (t==="black"?"white":"black"));
      return;
    }

    // --- 盤上：選択 ---
    if(!selected){
      if(!sq.piece) return;
      if(isP2P){
        if(mySide!=="any" && sq.piece.side!==mySide) return;
        if(mySide!=="any" && turn!==mySide) return;
      }
      setSelected({ kind:"board", r, c });
      return;
    }

    // --- 盤上：移動 ---
    if(selected.kind==="board"){
      const selPiece = board[selected.r][selected.c].piece;
      if(!selPiece){ setSelected(null); return; }
      if(isP2P){
        if(mySide!=="any" && selPiece.side!==mySide) return;
        if(mySide!=="any" && turn!==mySide) return;
      }

      if(r===selected.r && c===selected.c){ setSelected(null); return; }

      if(sq.piece && sq.piece.side===selPiece.side){
        if(!isP2P || (mySide!=="any" && sq.piece.side===mySide)) setSelected({ kind:"board", r, c });
        return;
      }

      if(isMoveTarget(r,c)){
        const moverSide = selPiece.side;
        const destPiece = board[r][c].piece;

        // 成りの可否：敵陣へ侵入 or 敵陣からの移動（一般的な成り条件）
        const canPromoteBasic = isPromotableType(selPiece.type) && involvesEnemyZone(moverSide, selected.r, r);

        // 強制成り：P/L 最終段、N 最終段・一つ手前へ
        const mustPromote = isPromotableType(selPiece.type) && isForcedPromotion(moverSide, selPiece.type, r);

        if(mustPromote){
          // 強制で即成り
          applyMoveWithOptionalPromotion({r:selected.r,c:selected.c},{r,c}, selPiece, destPiece ?? null, true);
          return;
        }

        if(canPromoteBasic){
          // 成り選択
          setPromoAsk({ from:{r:selected.r,c:selected.c}, to:{r,c}, mover:{...selPiece}, took: destPiece ? {...destPiece} : null });
          return;
        }

        // 成りなし通常移動
        // 取った駒は送信側で1回だけ加算
        if(destPiece){
          const base = toDemotedBase(destPiece.type);
          if(base==="K"){ setWinner(moverSide); }
          else addToHand(moverSide, base as Exclude<BasePiece,"K">);
        }
        setBoard(prev=>{
          const next=cloneBoard(prev);
          next[r][c].piece={ ...selPiece };
          next[selected.r][selected.c].piece=null;
          return next;
        });

        send({ t:"move", from:{ r:selected.r, c:selected.c }, to:{ r, c }, took: destPiece?destPiece.type:null, promote:false });
        setSelected(null);
        setPromoAsk(null);
        if(!winner) setTurn(t=> (t==="black"?"white":"black"));
        return;
      }
    }
  };

  // 手駒クリック
  const handleHandClick = (side:Side, type:Exclude<BasePiece,"K">)=>{
    if(winner) return;
    if(isP2P && !canActThisTurn(side)) return;
    const hand = getHand(side);
    if((hand[type]??0)<=0) return;
    setSelected(cur => (cur && cur.kind==="hand" && cur.side===side && cur.piece===type) ? null : { kind:"hand", side, piece:type });
    setPromoAsk(null);
  };

  /** ===== 補助操作 ===== */
  const reset = (broadcast=true)=>{
    setBoard(initialBoard());
    setSelected(null);
    setTurn("black");
    setHandBlack(emptyHand());
    setHandWhite(emptyHand());
    setWinner(null);
    setPromoAsk(null);
    // 接続状態・席は維持（P2P継続のまま）
    if(broadcast) send({ t:"reset" });
  };
  const resign = ()=>{
    if(winner) return;
    const w:Side = turn==="black" ? "white" : "black";
    setWinner(w);
    send({ t:"resign", winner:w });
  };

  // 星（ほし）
  const isHoshi = (r:number,c:number)=> (r===2&&c===2)||(r===2&&c===6)||(r===4&&c===4)||(r===6&&c===2)||(r===6&&c===6);

  const CheckBanner = ()=>{
    if(winner) return null;
    if(checkInfo.blackInCheck) return <div className="text-red-600 font-bold">王手（先手玉）</div>;
    if(checkInfo.whiteInCheck) return <div className="text-red-600 font-bold">王手（後手玉）</div>;
    return null;
  };

  /** ===== レイアウト：自分の駒を常に手前に ===== */
  const topSide: Side = isP2P ? (viewerIsBlack ? "white" : "black") : "black";
  const bottomSide: Side = topSide === "black" ? "white" : "black";

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">将棋アプリ（木目デザイン / P2P対戦・成り対応）</h1>
        <div className="flex items-center gap-2">
          <button className="px-3 py-2 rounded-2xl shadow text-sm hover:opacity-90 bg-amber-200 border border-amber-600" onClick={()=>reset(true)}>初期配置にリセット</button>
          <button className="px-3 py-2 rounded-2xl shadow text-sm hover:opacity-90 bg-rose-200 border border-rose-600" onClick={resign} disabled={!!winner}>投了</button>
          <button className="px-3 py-2 rounded-2xl shadow text-sm hover:opacity-90 bg-gray-200 border" onClick={resetP2P}>接続リセット</button>
        </div>
      </header>

      {/* P2P 接続（手動シグナリング） */}
      <P2PPanel
        isP2P={isP2P}
        rtc={rtc}
        localSDP={localSDP}
        remoteSDP={remoteSDP}
        setRemoteSDP={setRemoteSDP}
        startHost={startHost}
        acceptAsGuest={acceptAsGuest}
        finishHost={finishHost}
        mySide={mySide}
      />

      <div className="mb-2 text-sm flex items-center gap-4">
        {winner ? (
          <span className="text-rose-700 font-bold">{winner==="black"?"先手の勝ち":"後手の勝ち"}</span>
        ) : (
          <>
            <span>現在の手番：<span className="font-semibold">{turn==="black"?"先手":"後手"}</span></span>
            <CheckBanner />
          </>
        )}
      </div>

      {/* 上段：相手側（視点に応じて入れ替え） */}
      <HandView
        side={topSide}
        hand={topSide==="black"?handBlack:handWhite}
        onClick={handleHandClick}
        active={!isP2P ? (turn===topSide) : canActThisTurn(topSide)}
        selected={ selected && selected.kind==="hand" && selected.side===topSide ? selected.piece : null }
        viewerIsBlack={viewerIsBlack}
      />

      {/* Board（先手視点のとき盤を180°回転） */}
      <div className="inline-block rounded-[18px] p-3 shadow-xl border-4 border-amber-900" style={{ background:"repeating-linear-gradient(90deg,#e9c88d,#e9c88d 12px,#e6c07a 12px,#e6c07a 24px)" }}>
        <div className={`relative bg-amber-200 rounded-[12px] overflow-hidden ${viewerIsBlack ? "rotate-180" : ""}`}
             style={{ display:"grid", gridTemplateColumns:`repeat(${BOARD_SIZE}, 64px)`, gridTemplateRows:`repeat(${BOARD_SIZE}, 64px)` }}>
          {board.map((row,r)=>row.map((sq,c)=>{
            const sel = selected && selected.kind==="board" && selected.r===r && selected.c===c;
            const moveTarget = selected && selected.kind==="board" && isMoveTarget(r,c);
            return (
              <button key={`${r}-${c}`} onClick={()=>handleSquareClick(r,c)}
                className={`relative w-16 h-16 flex items-center justify-center border border-amber-700/50 ${ sel ? "ring-4 ring-blue-400" : moveTarget ? "ring-4 ring-green-400" : "" }`}>
                {isHoshi(r,c) && (<span className="absolute w-2 h-2 bg-black rounded-full opacity-70" style={{pointerEvents:"none"}} />)}
                {sq.piece && <PieceView piece={sq.piece} />}
              </button>
            );
          }))}
        </div>
      </div>

      {/* 下段：自分側 */}
      <HandView
        side={bottomSide}
        hand={bottomSide==="black"?handBlack:handWhite}
        onClick={handleHandClick}
        active={!isP2P ? (turn===bottomSide) : canActThisTurn(bottomSide)}
        selected={ selected && selected.kind==="hand" && selected.side===bottomSide ? selected.piece : null }
        viewerIsBlack={viewerIsBlack}
      />

      {/* 成りダイアログ */}
      {promoAsk && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-4 w-80 shadow-xl">
            <div className="text-lg font-bold mb-2">成りますか？</div>
            <div className="text-sm mb-4">
              {KANJI[promoAsk.mover.type]}（{promoAsk.mover.side==="black"?"先手":"後手"}）が敵陣に関与する移動です。
            </div>
            <div className="flex gap-2 justify-end">
              <button
                className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
                onClick={()=>applyMoveWithOptionalPromotion(promoAsk.from, promoAsk.to, promoAsk.mover, promoAsk.took, false)}
              >成らない</button>
              <button
                className="px-3 py-1 rounded bg-amber-600 text-white hover:opacity-90"
                onClick={()=>applyMoveWithOptionalPromotion(promoAsk.from, promoAsk.to, promoAsk.mover, promoAsk.took, true)}
              >成る</button>
            </div>
          </div>
        </div>
      )}

      <p className="mt-4 text-sm text-gray-700">
        成り：敵陣（3段）へ侵入／敵陣からの移動／敵陣内での移動で選択可。<br/>
        強制成り：歩・香の最終段、桂の最終段/一段手前。打った直後は成れません。<br/>
        取った駒は不成化して自分の持ち駒に入ります（二歩・行き場なし打ちは禁止）。
      </p>
    </div>
  );
}

/** ===== Subcomponents ===== **/
function P2PPanel({
  isP2P, rtc, localSDP, remoteSDP, setRemoteSDP,
  startHost, acceptAsGuest, finishHost, mySide
}: any){
  return (
    <div className="mb-4 p-3 rounded-lg border">
      <div className="flex gap-2 flex-wrap items-center">
        <button className="px-3 py-1 rounded bg-blue-600 text-white" onClick={startHost} disabled={rtc.pc!==null}>ホスト開始（合言葉を作る）</button>
        <span className="text-sm opacity-80">/</span>
        <button className="px-3 py-1 rounded bg-emerald-600 text-white" onClick={acceptAsGuest} disabled={rtc.pc!==null}>ゲスト参加（ホストの文字列を貼る）</button>
        <span className={`text-sm ${ isP2P ? "text-emerald-700" : "text-gray-500" }`}>状態：{ isP2P ? "接続中" : "未接続" }</span>
        {isP2P && <span className="text-sm">あなた：<b>{mySide==="black"?"先手":"後手"}</b></span>}
      </div>
      <div className="mt-2 grid md:grid-cols-2 gap-2">
        <div>
          <div className="text-xs mb-1">①自分の文字列（相手に送る）</div>
          <textarea className="w-full h-24 p-2 border rounded text-xs" readOnly value={localSDP} />
        </div>
        <div>
          <div className="text-xs mb-1">②相手の文字列（ここに貼る）</div>
          <textarea className="w-full h-24 p-2 border rounded text-xs" value={remoteSDP} onChange={(e)=>setRemoteSDP(e.target.value)} />
          <div className="mt-2 flex gap-2">
            <button className="px-3 py-1 rounded bg-amber-600 text-white" onClick={finishHost} disabled={!rtc.isHost || isP2P}>（ホスト）接続完了</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function HandView({
  side, hand, onClick, active, selected, viewerIsBlack
}: {
  side: Side;
  hand: Hand;
  onClick:(side:Side,type:Exclude<BasePiece,"K">)=>void;
  active:boolean;
  selected:Exclude<BasePiece,"K">|null;
  viewerIsBlack:boolean;
}){
  const order:Exclude<BasePiece,"K">[]=["R","B","G","S","N","L","P"];
  // 持ち駒の文字向き：プレイヤー視点で自然に見えるように（盤と同様のルール）
  const labelRotateClass = (s: Side) => {
    const shouldRotate = viewerIsBlack ? s === "white" : s === "black";
    return shouldRotate ? "rotate-180 inline-block" : "inline-block";
  };
  return (
    <div className="my-2 flex items-center gap-2">
      <span className="text-sm w-10 text-right opacity-70">{side==="black"?"先手":"後手"}</span>
      <div className="flex flex-wrap gap-1">
        {order.map((t)=>(
          <button key={t} onClick={()=>onClick(side,t)} disabled={!active || (hand[t]??0)===0}
            className={`px-2 py-1 rounded-md border border-amber-700/60 shadow text-sm ${selected===t?"ring-2 ring-blue-400":""} ${!active || (hand[t]??0)===0 ? "opacity-50 cursor-not-allowed":""}`}>
            <span className={labelRotateClass(side)}>{KANJI[t]}</span>
            <span className="ml-1 text-xs">×{hand[t]??0}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PieceView({ piece }: { piece: Piece }){
  const label = KANJI[piece.type];
  // 駒は常に先手=180°（盤の回転と合成して常に正しい向き）
  const rotateClass = piece.side === "black" ? "rotate-180" : "";
  return (
    <div className={`relative w-12 h-12 ${rotateClass} drop-shadow`}
      title={`${piece.side==="black"?"先手":"後手"} ${label}`}
      style={{
        clipPath:"polygon(50% 0%, 88% 22%, 88% 92%, 12% 92%, 12% 22%)",
        background:"linear-gradient(180deg,#f9e3b0 0%,#f2cc7b 60%,#e6b96a 100%)",
        border:"1px solid #8b5e34",
        borderRadius:6,
        display:"flex",
        alignItems:"center",
        justifyContent:"center"
      }}>
      <span className="text-xl font-bold select-none" style={{ fontFamily:"'Noto Serif JP', serif" }}>{label}</span>
    </div>
  );
}
