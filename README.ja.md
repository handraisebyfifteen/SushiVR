# Sushi VR

寿司をテーマにした WebXR アプリです（開発中）。
Meta Quest などの VR ヘッドセットのブラウザで URL を開くだけで、インストールなしで遊べることを目指しています。

> 開発中です。現在は何もない部屋だけがあり、寿司カウンターとハンドトラッキングでの握り操作をこれから作ります。

English version: [README.md](README.md)

## 動かし方

Node.js 22.12 以上が必要です（[`.nvmrc`](.nvmrc) 参照）。

```sh
npm install
npm run dev
```

開発用のブラウザが起動します。VR ヘッドセットがなくても、内蔵のエミュレーター（IWER）でパソコン上から VR 操作を試せます。
ブラウザ内の Runtime / Editor の切り替えで、アプリの実行画面とシーン編集画面を行き来できます。

本番用ファイルの作成:

```sh
npm run build   # dist/ に出力
```

## 構成

| パス | 内容 |
| --- | --- |
| `iwsdk.config.json` | プロジェクト設定（使うシーン・アセット・XR 機能など） |
| `src/index.ts` | アプリの起点。`World.create()` とシステムの登録 |
| `src/assets.ts` | アセット（3D モデル・音など）の一覧 |
| `src/components.ts` | コンポーネントの一覧 |
| `src/scene-assets/` | コードで作る 3D モデル |
| `public/scenes/` | シーンの配置データ（JSON） |
| `public/ui/` | UI パネル（`.uikitml`） |

## 制作ルール

- アプリ内の文字はすべて英語
- 実在の企業名・ブランド名・商品名は使わない
- 外部の 3D モデル・画像・音・フォントは使わず、図形をコードで作る
- Meta Quest 実機で 60fps 以上を目標にする
- 使用素材はすべて [CREDITS.md](CREDITS.md) に記録する

## 使用技術

- [IWSDK (Immersive Web SDK)](https://iwsdk.dev) — Meta による WebXR 開発フレームワーク
- Three.js / Vite / TypeScript

## ライセンス

[MIT](LICENSE)。IWSDK のテンプレートから生成されたファイルには Meta Platforms, Inc. の著作権表示が含まれています。

---

by fifteen
