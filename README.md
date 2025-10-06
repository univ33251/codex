# iPad Annotation Suite

フロントエンドとバックエンドで構成された、iPadOS + Apple Pencil 向けの円形注釈アプリです。画像データは大学サーバーなどのマウント済みストレージからバックエンド経由で配信され、フロントエンドは直接参照しません。

## ディレクトリ構成

```
frontend/  # React + Vite + Konva ベースの UI
server/    # Express + TypeScript バックエンド
```

## 前提

- Node.js 18 以上
- 大学サーバー上の画像ストレージを `/mnt/images` などにマウント済みであること
- アノテーション JSON 保存用ディレクトリに書き込み権限があること

## セットアップ

### 共通

1. リポジトリ直下で `.env` を作成し、サーバー設定を記述します。

```bash
cp server/.env.example server/.env
# 必要に応じて編集
```

`IMAGE_ROOT` と `ANNOTATION_ROOT` を大学サーバーのマウントパスに合わせて変更してください。読み取り専用モードにしたい場合は `READ_ONLY=true` を指定します。

### バックエンド

```bash
cd server
npm install
npm run dev
```

`http://localhost:4000/healthz` が `{ "ok": true }` を返せば起動完了です。

### フロントエンド

別ターミナルで:

```bash
cd frontend
npm install
npm run dev
```

Vite の開発サーバーが `http://localhost:5173` で立ち上がり、API リクエストはポート `4000` へプロキシされます。

## トラブルシューティング

### npm install で 403 Forbidden が返る

キャンパスネットワークや CI 環境では、npm の公式レジストリへのアクセスが制限されている場合があります。`npm install` 実行時に
`403 Forbidden` が発生する場合は以下を確認してください。

1. 利用可能なレジストリ URL を設定する

   大学が提供する社内レジストリがある場合はそちらを利用し、なければ npm 公式レジストリを明示します。

   ```bash
   npm config set registry https://registry.npmjs.org/
   ```

2. 認証が必要なレジストリではトークンを設定する

   学内レジストリが Basic 認証やトークンを要求する場合は `.npmrc` に資格情報を追加します。

   ```bash
   npm config set //registry.example.ac.jp/:_authToken "<your-token>"
   ```

3. プロキシ経由が必要な場合

   社内プロキシを経由する場合は以下を設定します。

   ```bash
   npm config set proxy http://proxy.example.ac.jp:8080
   npm config set https-proxy http://proxy.example.ac.jp:8080
   ```

上記を設定したのち、`npm cache clean --force` を実行してから再度 `npm install` を試してください。

## 動作ポイント

- Konva を利用したレイヤー構成キャンバスで、Apple Pencil / タッチ操作を優先します。
- ツールバーから色切替、レイヤー作成・切替、Undo/Redo（将来拡張）に備えたフックを用意。
- レイヤー／円のリストから該当オブジェクトへフォーカス可能。
- 次画像／前画像ボタンで移動すると同時に隣接画像をプリフェッチし、切替直後に描画できます。
- アノテーションは画像単位の JSON で保存され、正規化座標 (0〜1) を使用。
- `POST /api/annotations/:imageId` と `POST /api/annotations/:imageId/autosave` で原子的に保存し、再読み込み時に復元されます。

## 簡易 E2E テスト手順

1. バックエンドをローカルのモック画像で起動（`server/mock-data/images` に数枚の JPEG/PNG を配置してください）。
2. フロントエンドを起動して `http://localhost:5173` を iPad Safari から開きます。
3. Apple Pencil で円を描画し、レイヤーを切り替えながら色を変更します。
4. 「次へ」「前へ」で画像を切替え、プリフェッチが効いていることを確認します。
5. ページをリロードして、直前に保存した注釈が再表示されることを確認します。
6. バックエンドの `server/mock-data/annotations` に JSON が保存されていることを確認します。

## CSV エクスポートについて

サーバー側で注釈 JSON を読み込み、任意のバッチ処理で `image_id, layer, id, color, center_x, center_y, radius, label` の CSV を出力できます。将来的に専用エンドポイントを追加する場合は `AnnotationService` を拡張してください。

## 認証ミドルウェア差し替え

`server/src/middleware/auth.ts` の `attachAuth` を学内 SSO に合わせて差し替えることで、ユーザー情報を統一的に扱えます。実装は単純な関数なので、SSO トークン検証などを追加しても他の箇所への影響は最小限です。
