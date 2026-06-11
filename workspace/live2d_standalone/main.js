const statusEl = document.getElementById("status");
const modelSelect = document.getElementById("model-select");
const loadButton = document.getElementById("load-btn");
const stageEl = document.getElementById("stage");

const app = new PIXI.Application({
  resizeTo: stageEl,
  backgroundAlpha: 0,
  antialias: true,
});
stageEl.appendChild(app.view);

let currentModel = null;

function setStatus(message) {
  statusEl.textContent = message;
}

function getLive2DModelClass() {
  const candidates = [
    window.PIXI?.live2d?.Live2DModel,
    window.Live2DModel,
    window.PIXI?.Live2DModel,
    window.live2d?.Live2DModel,
  ];

  for (const candidate of candidates) {
    if (candidate && typeof candidate.from === "function") {
      return candidate;
    }
  }

  throw new Error(
    "Live2D runtime is not available. Check pixi-live2d-display script loading."
  );
}

async function fetchModels() {
  const resp = await fetch("/api/models");
  if (!resp.ok) {
    throw new Error(`モデル一覧の取得に失敗しました: ${resp.status}`);
  }

  const payload = await resp.json();
  if (!payload.models || payload.models.length === 0) {
    throw new Error("model3.json が見つかりませんでした");
  }

  return payload.models;
}

async function loadModel(modelPath) {
  setStatus(`読み込み中: ${modelPath}`);

  if (currentModel) {
    app.stage.removeChild(currentModel);
    currentModel.destroy();
    currentModel = null;
  }

  const Live2DModel = getLive2DModelClass();
  const model = await Live2DModel.from(modelPath);

  model.anchor.set(0.5, 0.5);
  const scaleByHeight = app.renderer.height / model.height;
  const scaleByWidth = app.renderer.width / model.width;
  const fitScale = Math.min(scaleByHeight, scaleByWidth) * 0.92;
  model.scale.set(fitScale);

  model.x = app.renderer.width * 0.5;
  model.y = app.renderer.height * 0.54;

  model.interactive = true;
  model.buttonMode = true;
  model.on("pointerdown", () => {
    model.motion("TapBody");
  });

  app.stage.addChild(model);
  currentModel = model;
  setStatus(`表示中: ${modelPath}`);
}

function installResizeHandler() {
  window.addEventListener("resize", () => {
    if (!currentModel) {
      return;
    }

    const scaleByHeight = app.renderer.height / currentModel.height;
    const scaleByWidth = app.renderer.width / currentModel.width;
    const fitScale = Math.min(scaleByHeight, scaleByWidth) * 0.92;

    currentModel.scale.set(fitScale);
    currentModel.x = app.renderer.width * 0.5;
    currentModel.y = app.renderer.height * 0.54;
  });
}

async function bootstrap() {
  try {
    const models = await fetchModels();

    models.forEach((model, index) => {
      const option = document.createElement("option");
      option.value = model.path;
      option.textContent = `${model.name} (${model.folder})`;
      if (index === 0) {
        option.selected = true;
      }
      modelSelect.appendChild(option);
    });

    loadButton.addEventListener("click", async () => {
      try {
        await loadModel(modelSelect.value);
      } catch (error) {
        setStatus(`エラー: ${error.message}`);
      }
    });

    installResizeHandler();
    await loadModel(modelSelect.value);
  } catch (error) {
    setStatus(`初期化失敗: ${error.message}`);
  }
}

bootstrap();
