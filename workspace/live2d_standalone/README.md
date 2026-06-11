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
- 表情ボタンで `emotionMap` に応じた expression を切り替え
- アクションボタンで検出された motion group を再生
- モデルをクリックすると tap 用アクションを再生（設定がある場合）

## 注意

- `pixi.js` と `pixi-live2d-display` は CDN から読み込みます。
- 完全オフライン化したい場合は、上記2ライブラリをローカル配置してください。
