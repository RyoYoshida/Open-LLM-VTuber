const statusEl = document.getElementById("status");
const modelSelect = document.getElementById("model-select");
const loadButton = document.getElementById("load-btn");
const expressionButtonsEl = document.getElementById("expression-buttons");
const motionButtonsEl = document.getElementById("motion-buttons");
const validationEl = document.getElementById("validation");
const stageEl = document.getElementById("stage");

const app = new PIXI.Application({
  resizeTo: stageEl,
  backgroundAlpha: 0,
  antialias: true,
});
stageEl.appendChild(app.view);

let currentModel = null;
let currentConfig = null;
let currentModelSettings = null;
let currentActionTapGroup = null;

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

async function fetchModelSettings(modelPath) {
  const resp = await fetch(modelPath);
  if (!resp.ok) {
    throw new Error(`model3.json の取得に失敗しました: ${resp.status}`);
  }

  return resp.json();
}

function clearControlButtons() {
  expressionButtonsEl.replaceChildren();
  motionButtonsEl.replaceChildren();
  validationEl.textContent = "";
}

function createControlButton(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function getExpressionEntries(config, settings) {
  return config?.availableExpressions ?? settings?.FileReferences?.Expressions ?? [];
}

function getMotionGroups(config, settings) {
  return Object.keys(config?.availableMotions ?? settings?.FileReferences?.Motions ?? {});
}

function getMotionItems(groupName, config, settings) {
  const motions = config?.availableMotions ?? settings?.FileReferences?.Motions ?? {};
  return motions?.[groupName] ?? [];
}

function pickTapMotionGroup(config, settings) {
  const groups = getMotionGroups(config, settings);
  const preferredNames = ["TapBody", "tap_body", "Tap", "tap"];

  for (const name of preferredNames) {
    if (groups.includes(name)) {
      return name;
    }
  }

  const idleGroup = currentConfig?.idleMotionGroupName ?? "Idle";
  const nonIdleGroups = groups.filter((group) => group !== idleGroup);
  return nonIdleGroups[0] ?? groups[0] ?? null;
}

function getDefaultMotionGroup(config, settings) {
  const groups = getMotionGroups(config, settings);
  return groups.includes("") ? "" : groups[0] ?? null;
}

function labelMotionGroup(group) {
  if (group === "") {
    return "default / tap";
  }

  return group;
}

function validateModelBindings(config, settings) {
  const messages = [];
  const expressions = getExpressionEntries(config, settings);
  const expressionCount = expressions.length;
  const defaultMotionGroup = getDefaultMotionGroup(config, settings);
  const motionGroups = getMotionGroups(config, settings);

  const validExpressions = [];
  const invalidExpressions = [];
  for (const [emotionName, expressionIndex] of Object.entries(config?.emotionMap ?? {})) {
    if (Number.isInteger(expressionIndex) && expressionIndex >= 0 && expressionIndex < expressionCount) {
      validExpressions.push([emotionName, expressionIndex]);
    } else {
      invalidExpressions.push(`${emotionName} -> ${expressionIndex}`);
    }
  }

  const tapEntries = [];
  const invalidTaps = [];
  for (const [hitArea, motions] of Object.entries(config?.tapMotions ?? {})) {
    const motionIndex = Object.values(motions ?? {}).find((value) => Number.isInteger(value));
    const motionCount =
      defaultMotionGroup !== null
        ? settings?.FileReferences?.Motions?.[defaultMotionGroup]?.length ?? 0
        : 0;

    if (defaultMotionGroup !== null && Number.isInteger(motionIndex) && motionIndex < motionCount) {
      tapEntries.push([hitArea, motionIndex]);
    } else {
      invalidTaps.push(`${hitArea} -> ${motionIndex ?? "none"}`);
    }
  }

  const declaredIdleGroup = config?.idleMotionGroupName ?? "Idle";
  if (!motionGroups.includes(declaredIdleGroup)) {
    messages.push(`idleMotionGroupName '${declaredIdleGroup}' is not present in model3.json`);
  }

  if (invalidExpressions.length > 0) {
    messages.push(`invalid expressions: ${invalidExpressions.join(", ")}`);
  }

  if (invalidTaps.length > 0) {
    messages.push(`invalid tap actions: ${invalidTaps.join(", ")}`);
  }

  if (messages.length === 0) {
    messages.push(
      `validation ok: ${validExpressions.length} mapped expressions, ${tapEntries.length} tap actions, ${motionGroups.length} motion groups, ${expressionCount} expressions in model`
    );
  }

  return { validExpressions, tapEntries, messages };
}

function refreshControls(model, config, settings) {
  clearControlButtons();

  const validation = validateModelBindings(config, settings);
  validationEl.textContent = validation.messages.join("\n");

  const expressionEntries = getExpressionEntries(config, settings);
  if (expressionEntries.length > 0) {
    expressionButtonsEl.appendChild(
      createControlButton("random expression", () => {
        void model.expression();
      })
    );

    for (const [emotionName, expressionIndex] of Object.entries(config?.emotionMap ?? {})) {
      if (!Number.isInteger(expressionIndex)) {
        continue;
      }

      expressionButtonsEl.appendChild(
        createControlButton(`emotion: ${emotionName}`, () => {
          void model.expression(expressionIndex);
        })
      );
    }

    for (const expression of expressionEntries) {
      const expressionName = expression?.name ?? expression?.Name ?? "expression";
      const expressionIndex = expression?.index ?? expressionEntries.indexOf(expression);
      expressionButtonsEl.appendChild(
        createControlButton(`file: ${expressionName}`, () => {
          void model.expression(expressionIndex);
        })
      );
    }
  }

  const motionGroups = getMotionGroups(config, settings);
  currentActionTapGroup = pickTapMotionGroup(config, settings);

  if (motionGroups.includes(currentConfig?.idleMotionGroupName ?? "Idle")) {
    motionButtonsEl.appendChild(
      createControlButton("idle", () => {
        void model.motion(currentConfig?.idleMotionGroupName ?? "Idle");
      })
    );
  }

  for (const groupName of motionGroups) {
    const motionItems = getMotionItems(groupName, config, settings);
    motionButtonsEl.appendChild(
      createControlButton(`group: ${labelMotionGroup(groupName)}`, () => {
        void model.motion(groupName);
      })
    );

    motionItems.forEach((motionItem, index) => {
      const motionLabel = motionItem?.name ?? motionItem?.File ?? `motion ${index + 1}`;
      motionButtonsEl.appendChild(
        createControlButton(`${labelMotionGroup(groupName)} #${index + 1}: ${motionLabel}`, () => {
          void model.motion(groupName, index);
        })
      );
    });
  }

  for (const [hitArea, motionIndex] of validation.tapEntries) {
    motionButtonsEl.appendChild(
      createControlButton(`hit: ${hitArea}`, () => {
        if (!currentActionTapGroup) {
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
  currentModelSettings = await fetchModelSettings(modelPath);

  applyModelTransform(model, currentConfig);

  model.interactive = true;
  model.buttonMode = true;
  model.cursor = "pointer";
  model.on("pointerdown", (event) => {
    const globalPoint = event?.global;
    if (globalPoint) {
      const hitAreas = model.hitTest(globalPoint.x, globalPoint.y);
      if (hitAreas.length > 0) {
        model.emit("hit", hitAreas);
        return;
      }
    }

    if (currentActionTapGroup) {
      void model.motion(currentActionTapGroup);
    }
  });

  registerHitMotionHandlers(model, currentConfig);

  app.stage.addChild(model);
  currentModel = model;
  refreshControls(model, currentConfig, currentModelSettings);
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
    validationEl.textContent = "";
  }
}

bootstrap();
