# Live2D Standalone Demo (Python)

このディレクトリは、既存の Open-LLM-VTuber サーバーと独立して動く Live2D ブラウザ表示デモです。

## 1. 起動

プロジェクトルートで実行:

```bash
uv run python workspace/live2d_standalone/server.py --host 127.0.0.1 --port 8765
```

または Python 単体:

```bash
python workspace/live2d_standalone/server.py --host 127.0.0.1 --port 8765
```

## 2. ブラウザで開く

```text
http://127.0.0.1:8765
```

## 3. できること

- `model_dict.json` に定義されたモデルを自動表示
- モデル配下の `model3.json` から expression / motion を検出してボタンを自動生成
- 表情ボタンで `emotionMap` に応じた expression を切り替え
- アクションボタンで検出された motion group と個別 motion を再生
- モデルをクリックすると tap 用アクションを再生（設定がある場合）

## 4. 設定の再生成

モデル配下のファイル構成を反映して `model_dict.json` を更新するには、次を実行します。

```bash
python workspace/live2d_standalone/sync_model_dict.py
```

## 注意

- `pixi.js` と `pixi-live2d-display` は CDN から読み込みます。
- 完全オフライン化したい場合は、上記2ライブラリをローカル配置してください。
