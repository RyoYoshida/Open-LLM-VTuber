const statusEl = document.getElementById("status");
const modelSelect = document.getElementById("model-select");
const loadButton = document.getElementById("load-btn");
const expressionButtonsEl = document.getElementById("expression-buttons");
const motionButtonsEl = document.getElementById("motion-buttons");
const stageEl = document.getElementById("stage");

const app = new PIXI.Application({
  resizeTo: stageEl,
  backgroundAlpha: 0,
  antialias: true,
});
stageEl.appendChild(app.view);

let currentModel = null;
let currentConfig = null;
let currentActionTapGroup = null;
let currentMotionGroups = [];

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
  const resp = await fetch("/api/model-configs");
  if (!resp.ok) {
    throw new Error(`モデル一覧の取得に失敗しました: ${resp.status}`);
  }

  const payload = await resp.json();
  if (!payload.models || payload.models.length === 0) {
    throw new Error("モデル設定が見つかりませんでした");
  }

  return payload.models;
}

function clearControlButtons() {
  expressionButtonsEl.replaceChildren();
  motionButtonsEl.replaceChildren();
}

function createControlButton(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function getMotionGroups(model) {
  return Object.keys(model.internalModel.motionManager?.definitions ?? {});
}

function pickTapMotionGroup(model) {
  const groups = getMotionGroups(model);
  const preferredNames = ["TapBody", "tap_body", "Tap", "tap"];

  for (const name of preferredNames) {
    if (groups.includes(name)) {
      return name;
    }
  }

  const idleGroup = model.internalModel.motionManager?.groups?.idle;
  const nonIdleGroups = groups.filter((group) => group !== idleGroup);
  return nonIdleGroups[0] ?? groups[0] ?? null;
}

function refreshControls(model, config) {
  clearControlButtons();

  const emotionMap = config?.emotionMap ?? {};
  const emotionEntries = Object.entries(emotionMap);
  if (emotionEntries.length > 0) {
    expressionButtonsEl.appendChild(
      createControlButton("random", () => {
        void model.expression();
      })
    );

    for (const [emotionName, expressionIndex] of emotionEntries) {
      expressionButtonsEl.appendChild(
        createControlButton(emotionName, () => {
          void model.expression(expressionIndex);
        })
      );
    }
  }

  currentMotionGroups = getMotionGroups(model);
  currentActionTapGroup = pickTapMotionGroup(model);

  for (const group of currentMotionGroups) {
    motionButtonsEl.appendChild(
      createControlButton(group, () => {
        void model.motion(group);
      })
    );
  }

  const tapMotions = config?.tapMotions ?? {};
  for (const [hitArea, motions] of Object.entries(tapMotions)) {
    const indices = Object.values(motions ?? {}).filter((value) => Number.isInteger(value));
    const motionIndex = indices[0];
    motionButtonsEl.appendChild(
      createControlButton(`${hitArea} tap`, () => {
        if (currentActionTapGroup === null || motionIndex === undefined) {
          setStatus(`アクション未設定: ${hitArea}`);
          return;
        }

        void model.motion(currentActionTapGroup, motionIndex);
      })
    );
  }
}

function applyModelTransform(model, config) {
  const scaleFactor = Number(config?.kScale ?? 1);
  const xOffset = Number(config?.initialXshift ?? 0);
  const yOffset = Number(config?.initialYshift ?? 0);
  const xPosition = Number(config?.kXOffset ?? 0);

  model.anchor.set(0.5, 0.5);

  const scaleByHeight = app.renderer.height / model.height;
  const scaleByWidth = app.renderer.width / model.width;
  const fitScale = Math.min(scaleByHeight, scaleByWidth) * 0.92 * scaleFactor;
  model.scale.set(fitScale);

  model.x = app.renderer.width * 0.5 + xOffset + xPosition * 0.001;
  model.y = app.renderer.height * 0.54 + yOffset;
}

function registerHitMotionHandlers(model, config) {
  const tapMotions = config?.tapMotions ?? {};
  model.removeAllListeners("hit");
  model.on("hit", (hitAreas) => {
    if (!currentActionTapGroup) {
      return;
    }

    for (const hitArea of hitAreas) {
      const motionDefinitions = tapMotions[hitArea];
      const motionIndex =
        motionDefinitions &&
        Object.values(motionDefinitions).find((value) => Number.isInteger(value));

      if (motionIndex !== undefined) {
        void model.motion(currentActionTapGroup, motionIndex);
        return;
      }
    }

    void model.motion(currentActionTapGroup);
  });
}

async function loadModel(modelPath) {
  setStatus(`読み込み中: ${modelPath}`);

  if (currentModel) {
    app.stage.removeChild(currentModel);
    currentModel.destroy();
    currentModel = null;
  }

  const Live2DModel = getLive2DModelClass();
  const idleMotionGroup = currentConfig?.idleMotionGroupName;
  const model = await Live2DModel.from(modelPath, idleMotionGroup ? { idleMotionGroup } : {});

  applyModelTransform(model, currentConfig);

  model.interactive = true;
  model.buttonMode = true;
  model.cursor = "pointer";
  model.on("pointerdown", () => {
    if (currentActionTapGroup) {
      void model.motion(currentActionTapGroup);
    }
  });

  registerHitMotionHandlers(model, currentConfig);

  app.stage.addChild(model);
  currentModel = model;
  refreshControls(model, currentConfig);
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
      option.value = model.url;
      option.textContent = `${model.name} (${model.url})`;
      if (index === 0) {
        option.selected = true;
      }
      modelSelect.appendChild(option);
    });

    currentConfig = models[0];

    loadButton.addEventListener("click", async () => {
      try {
        currentConfig = models.find((model) => model.url === modelSelect.value) ?? models[0];
        await loadModel(modelSelect.value);
      } catch (error) {
        setStatus(`エラー: ${error.message}`);
      }
    });

    installResizeHandler();
    await loadModel(modelSelect.value);
  } catch (error) {
    clearControlButtons();
    setStatus(`初期化失敗: ${error.message}`);
  }
}

bootstrap();
