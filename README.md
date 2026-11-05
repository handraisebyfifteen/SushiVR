# Sushi VR

寿司をテーマにした WebXR アプリです（開発中）。
Meta Quest などの VR ヘッドセットのブラウザで URL を開くだけで、インストールなしで遊べることを目指しています。

> 現在はプロジェクトの土台のみで、IWSDK のスターターサンプル（ロボットとウェルカムパネル）が入っています。

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

## スターターサンプルについて

ロボットは押すと音が鳴り、プレイヤーの方を向きます。左右の台には、つかんで動かせるピースと回せるリングがあります。
サンプルを削除する手順は IWSDK のガイドを参照してください。

- 最小構成のシーン: https://iwsdk.dev/guides/01b-minimal-scene.html
- エミュレーター（IWER）の操作方法: https://iwsdk.dev/guides/02-testing-experience.html#iwer-controls

## 使用技術

- [IWSDK (Immersive Web SDK)](https://iwsdk.dev) — Meta による WebXR 開発フレームワーク
- Three.js / Vite / TypeScript

## ライセンス

[MIT](LICENSE)。IWSDK のテンプレートから生成されたファイルには Meta Platforms, Inc. の著作権表示が含まれています。

---

by fifteen
