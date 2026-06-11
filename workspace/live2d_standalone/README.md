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

- `live2d-models/` 配下の `*.model3.json` を自動検出
- モデル選択と表示
- クリックで `TapBody` モーションを再生（存在する場合）

## 注意

- `pixi.js` と `pixi-live2d-display` は CDN から読み込みます。
- 完全オフライン化したい場合は、上記2ライブラリをローカル配置してください。
