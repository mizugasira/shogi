# 🧩 Shogi AI Web App

将棋AIを搭載したWebアプリケーションです。  
フロントエンドはReact（TypeScript）で実装し、サーバー側ではNode/Express上でAIエンジン（`ai-core.ts`）が動作します。  
Vercelにデプロイして、オンラインでも思考サーバーを呼び出せます。

---

## 📁 プロジェクト構成

```
shogi-app/
├─ src/                  # フロントエンド（React + TypeScript）
│  ├─ App.tsx            # 将棋盤・UIのメイン画面
│  ├─ ai-core.ts         # 将棋AIのロジック（αβ探索＋静止探索）
│  ├─ index.tsx          # Reactエントリーポイント
│  ├─ index.css
│  └─ ...
│
├─ server/
│  └─ express.ts         # Node.js + Express APIサーバー
│
├─ api/
│  └─ think.ts           # Vercel用APIルート（AIのエンドポイント）
│
├─ package.json
├─ tsconfig.json
├─ vercel.json           # デプロイ設定
└─ README.md
```

---

## 🧠 機能概要

| 機能 | 内容 |
|------|------|
| 将棋盤UI | Reactで描画、手を指すと自動でAI応答 |
| AI思考 | `ai-core.ts` にてαβ探索・静止探索・トランスポジションテーブル搭載 |
| 通信方式 | `/api/think` 経由でAIサーバーと通信（ローカル or Vercel） |
| デプロイ | フロントはGitHub Pages、AIはVercel Functionsで稼働 |
| タイムアウト対応 | 処理時間超過時は安全にnullレスポンスを返却 |

---

## ⚙️ 環境構築（ローカル実行）

### 1️⃣ 必要環境

- Node.js v18以上（推奨 v20）
- npm v8以上
- Git（任意）

---

### 2️⃣ クローン

```bash
git clone https://github.com/mizugasira/shogi.git
cd shogi
```

---

### 3️⃣ 依存関係のインストール

```bash
npm install
```

---

### 4️⃣ 開発サーバーの起動

フロントとAIサーバーを同時に起動します。

```bash
npm run dev
```

または個別に起動：

```bash
# フロントエンド (http://localhost:3000)
npm start

# サーバー側AI (http://localhost:3001)
npm run start:server
```

---

### 5️⃣ ブラウザで確認

```
http://localhost:3000/shogi
```

AIが動作していれば、手を指したあと自動的に応答します。

---

## 🌐 デプロイ（Vercel）

### 1️⃣ Vercelに接続

[Vercel](https://vercel.com/) にアクセスし、GitHub連携を行います。

### 2️⃣ プロジェクトをインポート

リポジトリを選択してインポートします。

### 3️⃣ 設定ファイル

`vercel.json` があることを確認してください。

```json
{
  "functions": {
    "api/think.ts": {
      "runtime": "nodejs20"
    }
  }
}
```

### 4️⃣ 自動デプロイ設定

VercelのDashboard → Deployments → Git Integration から  
「**Automatic Deployments → Enabled**」にします。

これで、GitHubにプッシュするたび自動反映されます。

---

## 🧩 API概要

### エンドポイント
```
POST /api/think
```

### Request Body
```json
{
  "board": [[{ "piece": { "side": "black", "type": "P" } }, ...]],
  "handBlack": { "P": 0, "R": 0, "B": 0 },
  "handWhite": { "P": 0, "R": 0, "B": 0 },
  "turn": "black",
  "timeMs": 2000
}
```

### Response
```json
{
  "move": "m:6,6,6,5,0",
  "ply": {
    "kind": "move",
    "side": "black",
    "from": { "r": 6, "c": 6 },
    "to": { "r": 6, "c": 5 },
    "took": null,
    "promote": false
  }
}
```

---

## 🚀 高速化ポイント（AI最適化済み）

- 探索時間上限を自動制御（平均2秒以内に応答）
- トランスポジションテーブルで局面キャッシュ
- αβ探索 + 静止探索 + 枝刈り
- タイムアウト対策付き Promise.race による安全返却

---

## ⚡ トラブルシューティング

| 症状 | 対処法 |
|------|---------|
| `react-scripts not found` | `npm install` を再実行 |
| `net::ERR_CONNECTION_REFUSED` | `npm run start:server` が起動しているか確認 |
| `405 Method Not Allowed` | `/api/think` がPOST専用であるためGETリクエストを確認 |
| `FUNCTION_INVOCATION_TIMEOUT` | `ai-core.ts` の探索時間を短くする（例: MAX_DEPTH=6） |

---

## 🧩 ライセンス

このプロジェクトはMITライセンスで公開されています。  
研究・学習・個人利用目的で自由に改変可能です。

---

## 🧠 補足（将棋ウォーズ級への拡張構想）

将来的に以下のような改良を加えることで、さらに強力かつ高速化できます：

- NNUE評価関数（ニューラルネット評価の導入）
- WebWorkerによる並列探索
- LMR / NullMove / Aspiration Window の強化
- WASM化（ブラウザでの高速思考）

---

### 🧩 作者

**mizu**  
AI × 将棋 × Webアプリを組み合わせた技術実験プロジェクトです。  
質問・改善提案はお気軽にどうぞ。
