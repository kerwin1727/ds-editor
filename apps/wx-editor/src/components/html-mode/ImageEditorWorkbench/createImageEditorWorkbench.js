const IMAGE_FILTER_CONFIG = {
  brightness: { min: -100, max: 100, unit: "%" },
  contrast: { min: -100, max: 100, unit: "%" },
  saturation: { min: -100, max: 100, unit: "%" },
  hue: { min: -180, max: 180, unit: "°" },
  sepia: { min: 0, max: 100, unit: "%" },
};

const IMAGE_FILTER_DEFAULTS = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  sepia: 0,
};

const IMAGE_FILTER_PRESETS = {
  origin: { ...IMAGE_FILTER_DEFAULTS },
  vintage: { brightness: 6, contrast: -8, saturation: -22, hue: -12, sepia: 46 },
  retro: { brightness: 2, contrast: 8, saturation: -10, hue: 6, sepia: 22 },
  mono: { brightness: 4, contrast: 14, saturation: -100, hue: 0, sepia: 0 },
  cool: { brightness: 0, contrast: 6, saturation: 10, hue: 14, sepia: 0 },
};

const IMAGE_EDIT_HISTORY_LIMIT = 80;
const IMAGE_CROP_MIN_SIZE = 42;
const HISTORY_ICON_SVG = {
  undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 10H4V5"></path><path d="M4 10c1.8-2.6 4.8-4.2 8.2-4.2 5.4 0 9.8 4.4 9.8 9.8s-4.4 9.8-9.8 9.8c-3 0-5.6-1.3-7.4-3.4"></path></svg>',
  redo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 10h5V5"></path><path d="M20 10c-1.8-2.6-4.8-4.2-8.2-4.2C6.4 5.8 2 10.2 2 15.6s4.4 9.8 9.8 9.8c3 0 5.6-1.3 7.4-3.4"></path></svg>',
};

function ensureFn(name, fn) {
  if (typeof fn !== "function") {
    throw new Error(`[image-editor-workbench] "${name}" callback is required`);
  }
}

export function createImageEditorWorkbench(options = {}) {
  const {
    presentation = "modal",
    mountTarget = document.body,
    getSelectedImageContext,
    updateImageByPos,
    showToast,
    hideImageActionToolbar,
    scheduleImageActionToolbar,
    resolveImageProxyUrl,
  } = options;

  ensureFn("getSelectedImageContext", getSelectedImageContext);
  ensureFn("updateImageByPos", updateImageByPos);
  ensureFn("showToast", showToast);
  ensureFn("hideImageActionToolbar", hideImageActionToolbar);
  ensureFn("scheduleImageActionToolbar", scheduleImageActionToolbar);

  const isModal = presentation !== "embedded";

  const root = document.createElement("div");
  root.className = `wx-image-edit-modal${isModal ? "" : " is-embedded"}`;
  root.innerHTML = `
    <div class="wx-image-edit-dialog" role="dialog" aria-modal="${isModal ? "true" : "false"}" aria-label="图片编辑器">
      <div class="wx-image-edit-header">
        <div class="wx-image-edit-title">图片编辑</div>
        <button type="button" class="wx-image-edit-close" aria-label="关闭">×</button>
      </div>
      <div class="wx-image-edit-toolbar">
        <button type="button" class="wx-image-edit-preset is-active" data-preset="origin">原图</button>
        <button type="button" class="wx-image-edit-preset" data-preset="vintage">复古</button>
        <button type="button" class="wx-image-edit-preset" data-preset="retro">电影</button>
        <button type="button" class="wx-image-edit-preset" data-preset="mono">黑白</button>
        <button type="button" class="wx-image-edit-preset" data-preset="cool">冷调</button>
        <div class="wx-image-edit-toolbar-spacer"></div>
        <div class="wx-image-edit-history" role="group" aria-label="编辑历史">
          <button type="button" class="wx-image-edit-history-btn wx-image-edit-history-undo" title="撤销" aria-label="撤销">
            <span class="wx-image-edit-history-icon">${HISTORY_ICON_SVG.undo}</span>
            <span class="wx-image-edit-history-text">撤销</span>
          </button>
          <button type="button" class="wx-image-edit-history-btn wx-image-edit-history-redo" title="重做" aria-label="重做">
            <span class="wx-image-edit-history-icon">${HISTORY_ICON_SVG.redo}</span>
            <span class="wx-image-edit-history-text">重做</span>
          </button>
        </div>
      </div>
      <div class="wx-image-edit-body">
        <div class="wx-image-edit-stage">
          <div class="wx-image-edit-canvas-wrap">
            <canvas class="wx-image-edit-canvas"></canvas>
            <div class="wx-image-crop-box">
              <div class="wx-image-crop-handle"></div>
            </div>
          </div>
          <div class="wx-image-edit-loading">图片加载中...</div>
        </div>
        <div class="wx-image-edit-panel">
          <div class="wx-image-edit-crop-tools">
            <div class="wx-image-edit-tip">拖动裁剪框可移动，拖右下角可缩放</div>
            <button type="button" class="wx-image-edit-reset-crop">重置裁剪</button>
          </div>
          <div class="wx-image-edit-row">
            <label class="wx-image-edit-label">亮度</label>
            <input class="wx-image-edit-range" type="range" data-filter="brightness" min="-100" max="100" step="1" value="0" />
            <span class="wx-image-edit-value" data-value="brightness">0%</span>
          </div>
          <div class="wx-image-edit-row">
            <label class="wx-image-edit-label">对比</label>
            <input class="wx-image-edit-range" type="range" data-filter="contrast" min="-100" max="100" step="1" value="0" />
            <span class="wx-image-edit-value" data-value="contrast">0%</span>
          </div>
          <div class="wx-image-edit-row">
            <label class="wx-image-edit-label">饱和</label>
            <input class="wx-image-edit-range" type="range" data-filter="saturation" min="-100" max="100" step="1" value="0" />
            <span class="wx-image-edit-value" data-value="saturation">0%</span>
          </div>
          <div class="wx-image-edit-row">
            <label class="wx-image-edit-label">色调</label>
            <input class="wx-image-edit-range" type="range" data-filter="hue" min="-180" max="180" step="1" value="0" />
            <span class="wx-image-edit-value" data-value="hue">0°</span>
          </div>
          <div class="wx-image-edit-row">
            <label class="wx-image-edit-label">褪色</label>
            <input class="wx-image-edit-range" type="range" data-filter="sepia" min="0" max="100" step="1" value="0" />
            <span class="wx-image-edit-value" data-value="sepia">0%</span>
          </div>
        </div>
      </div>
      <div class="wx-image-edit-footer">
        <button type="button" class="wx-image-edit-btn wx-image-edit-cancel">取消</button>
        <button type="button" class="wx-image-edit-btn wx-image-edit-apply">确认替换</button>
      </div>
    </div>
  `;

  mountTarget.appendChild(root);
  root.setAttribute("aria-hidden", "true");

  const imageEditCanvas = root.querySelector(".wx-image-edit-canvas");
  const imageEditCanvasWrap = root.querySelector(".wx-image-edit-canvas-wrap");
  const imageCropBox = root.querySelector(".wx-image-crop-box");
  const imageCropHandle = root.querySelector(".wx-image-crop-handle");
  const imageEditStage = root.querySelector(".wx-image-edit-stage");
  const imageEditLoading = root.querySelector(".wx-image-edit-loading");
  const imageEditCloseButton = root.querySelector(".wx-image-edit-close");
  const imageEditCancelButton = root.querySelector(".wx-image-edit-cancel");
  const imageEditApplyButton = root.querySelector(".wx-image-edit-apply");
  const imageEditResetCropButton = root.querySelector(".wx-image-edit-reset-crop");
  const imageEditPresetButtons = Array.from(root.querySelectorAll(".wx-image-edit-preset"));
  const imageEditUndoButton = root.querySelector(".wx-image-edit-history-undo");
  const imageEditRedoButton = root.querySelector(".wx-image-edit-history-redo");
  const imageEditFilterInputs = new Map();
  const imageEditFilterValues = new Map();

  root.querySelectorAll(".wx-image-edit-range").forEach((input) => {
    const filterName = input.getAttribute("data-filter");
    if (!filterName) return;
    imageEditFilterInputs.set(filterName, input);
  });

  root.querySelectorAll(".wx-image-edit-value").forEach((valueElement) => {
    const filterName = valueElement.getAttribute("data-value");
    if (!filterName) return;
    imageEditFilterValues.set(filterName, valueElement);
  });

  let imageEditSource = null;
  let imageEditTargetPos = null;
  let imageEditLoadingState = false;
  const imageEditFilters = { ...IMAGE_FILTER_DEFAULTS };
  let imageCropRect = null;
  let imageCropDragState = null;
  let imageEditRenderSize = { width: 0, height: 0 };
  let imageEditActivePreset = "origin";
  let imageEditHistory = [];
  let imageEditHistoryIndex = -1;
  let imageEditHistoryRestoring = false;
  let imageEditSourceObjectUrl = "";
  let imageEditOpenToken = 0;

  function revokeImageEditSourceObjectUrl() {
    if (!imageEditSourceObjectUrl) return;
    URL.revokeObjectURL(imageEditSourceObjectUrl);
    imageEditSourceObjectUrl = "";
  }

  function createImageLoadError(reason) {
    const error = new Error(reason || "image-load-failed");
    error.reason = reason || "image-load-failed";
    return error;
  }

  function isDataLikeImageSource(src) {
    return (
      typeof src === "string" &&
      (src.startsWith("data:") || src.startsWith("blob:"))
    );
  }

  function isHttpImageSource(src) {
    return typeof src === "string" && /^https?:\/\//i.test(src);
  }

  function toAbsoluteImageUrl(src) {
    try {
      return new URL(src, window.location.href).href;
    } catch (error) {
      return src;
    }
  }

  function loadImageElement(src, options = {}) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      if (options.crossOrigin) {
        image.crossOrigin = options.crossOrigin;
      }
      image.onload = () => resolve(image);
      image.onerror = () =>
        reject(createImageLoadError(options.reason || "image-load-failed"));
      image.src = src;
    });
  }

  function canExportImageSource(image) {
    try {
      const testCanvas = document.createElement("canvas");
      testCanvas.width = 1;
      testCanvas.height = 1;
      const context = testCanvas.getContext("2d");
      if (!context) return false;
      context.drawImage(image, 0, 0, 1, 1);
      testCanvas.toDataURL("image/png");
      return true;
    } catch (error) {
      return false;
    }
  }

  async function tryLoadImageWithCors(src) {
    const image = await loadImageElement(src, {
      crossOrigin: "anonymous",
      reason: "cors-load-failed",
    });
    if (!canExportImageSource(image)) {
      throw createImageLoadError("canvas-tainted");
    }
    return image;
  }

  async function tryLoadImageFromBlob(src) {
    const response = await fetch(src, { mode: "cors" });
    if (!response.ok) {
      throw createImageLoadError("fetch-failed");
    }
    const blob = await response.blob();
    if (!(blob instanceof Blob) || blob.size <= 0) {
      throw createImageLoadError("blob-empty");
    }
    revokeImageEditSourceObjectUrl();
    imageEditSourceObjectUrl = URL.createObjectURL(blob);
    return loadImageElement(imageEditSourceObjectUrl, {
      reason: "blob-load-failed",
    });
  }

  async function resolveImageForEditing(src) {
    if (!src || typeof src !== "string") {
      throw createImageLoadError("image-src-invalid");
    }

    const normalizedSrc = toAbsoluteImageUrl(src);
    revokeImageEditSourceObjectUrl();

    if (isDataLikeImageSource(normalizedSrc)) {
      return loadImageElement(normalizedSrc, { reason: "image-load-failed" });
    }

    if (!isHttpImageSource(normalizedSrc)) {
      return loadImageElement(normalizedSrc, { reason: "image-load-failed" });
    }

    try {
      return await tryLoadImageWithCors(normalizedSrc);
    } catch (error) {}

    try {
      return await tryLoadImageFromBlob(normalizedSrc);
    } catch (error) {}

    if (typeof resolveImageProxyUrl === "function") {
      const proxyUrl = resolveImageProxyUrl(normalizedSrc);
      if (proxyUrl && proxyUrl !== normalizedSrc) {
        try {
          return await tryLoadImageFromBlob(proxyUrl);
        } catch (error) {}

        try {
          return await tryLoadImageWithCors(proxyUrl);
        } catch (error) {}
      }
    }

    throw createImageLoadError("cross-origin-blocked");
  }

  function sanitizeImageFilterValue(filterName, value) {
    const config = IMAGE_FILTER_CONFIG[filterName];
    const numeric = Number(value);
    if (!config || !Number.isFinite(numeric)) {
      return IMAGE_FILTER_DEFAULTS[filterName] || 0;
    }
    return Math.max(config.min, Math.min(config.max, Math.round(numeric)));
  }

  function formatImageFilterValue(filterName, value) {
    const config = IMAGE_FILTER_CONFIG[filterName];
    return `${value}${config?.unit || ""}`;
  }

  function getImageFilterCssText() {
    return [
      `brightness(${100 + imageEditFilters.brightness}%)`,
      `contrast(${100 + imageEditFilters.contrast}%)`,
      `saturate(${100 + imageEditFilters.saturation}%)`,
      `hue-rotate(${imageEditFilters.hue}deg)`,
      `sepia(${imageEditFilters.sepia}%)`,
    ].join(" ");
  }

  function setImagePresetActive(presetName) {
    imageEditActivePreset = typeof presetName === "string" ? presetName : "";
    imageEditPresetButtons.forEach((button) => {
      button.classList.toggle(
        "is-active",
        button.getAttribute("data-preset") === imageEditActivePreset
      );
    });
  }

  function syncImageEditControls() {
    Object.keys(IMAGE_FILTER_CONFIG).forEach((filterName) => {
      const value = imageEditFilters[filterName];
      const input = imageEditFilterInputs.get(filterName);
      if (input instanceof HTMLInputElement) {
        input.value = String(value);
      }
      const valueElement = imageEditFilterValues.get(filterName);
      if (valueElement instanceof HTMLElement) {
        valueElement.textContent = formatImageFilterValue(filterName, value);
      }
    });
  }

  function applyImageFilterPreset(presetName) {
    const preset = IMAGE_FILTER_PRESETS[presetName];
    if (!preset) return;
    Object.keys(IMAGE_FILTER_CONFIG).forEach((filterName) => {
      imageEditFilters[filterName] = sanitizeImageFilterValue(
        filterName,
        preset[filterName]
      );
    });
    syncImageEditControls();
    setImagePresetActive(presetName);
  }

  function cloneImageCropRect(rect) {
    if (!rect) return null;
    return {
      x: Number(rect.x) || 0,
      y: Number(rect.y) || 0,
      width: Number(rect.width) || 0,
      height: Number(rect.height) || 0,
    };
  }

  function isSameImageCropRect(rectA, rectB) {
    if (!rectA && !rectB) return true;
    if (!rectA || !rectB) return false;
    return (
      Math.abs(rectA.x - rectB.x) < 0.5 &&
      Math.abs(rectA.y - rectB.y) < 0.5 &&
      Math.abs(rectA.width - rectB.width) < 0.5 &&
      Math.abs(rectA.height - rectB.height) < 0.5
    );
  }

  function isSameImageFilterState(filtersA, filtersB) {
    return Object.keys(IMAGE_FILTER_CONFIG).every(
      (filterName) => filtersA?.[filterName] === filtersB?.[filterName]
    );
  }

  function canUndoImageEditHistory() {
    return imageEditHistoryIndex > 0;
  }

  function canRedoImageEditHistory() {
    return (
      imageEditHistoryIndex >= 0 &&
      imageEditHistoryIndex < imageEditHistory.length - 1
    );
  }

  function syncImageEditHistoryButtons() {
    const baseDisabled =
      imageEditLoadingState || !(imageEditSource instanceof HTMLImageElement);

    if (imageEditUndoButton instanceof HTMLButtonElement) {
      imageEditUndoButton.disabled = baseDisabled || !canUndoImageEditHistory();
    }
    if (imageEditRedoButton instanceof HTMLButtonElement) {
      imageEditRedoButton.disabled = baseDisabled || !canRedoImageEditHistory();
    }
  }

  function createImageEditSnapshot() {
    const filters = {};
    Object.keys(IMAGE_FILTER_CONFIG).forEach((filterName) => {
      filters[filterName] = sanitizeImageFilterValue(
        filterName,
        imageEditFilters[filterName]
      );
    });
    return {
      filters,
      cropRect: cloneImageCropRect(imageCropRect),
      presetName: imageEditActivePreset || "",
    };
  }

  function resetImageEditHistory() {
    imageEditHistory = [createImageEditSnapshot()];
    imageEditHistoryIndex = 0;
    syncImageEditHistoryButtons();
  }

  function pushImageEditHistory() {
    if (imageEditHistoryRestoring) return;

    const nextSnapshot = createImageEditSnapshot();
    const currentSnapshot = imageEditHistory[imageEditHistoryIndex];
    if (
      currentSnapshot &&
      isSameImageFilterState(currentSnapshot.filters, nextSnapshot.filters) &&
      isSameImageCropRect(currentSnapshot.cropRect, nextSnapshot.cropRect) &&
      (currentSnapshot.presetName || "") === (nextSnapshot.presetName || "")
    ) {
      syncImageEditHistoryButtons();
      return;
    }

    if (imageEditHistoryIndex < imageEditHistory.length - 1) {
      imageEditHistory = imageEditHistory.slice(0, imageEditHistoryIndex + 1);
    }

    imageEditHistory.push(nextSnapshot);
    if (imageEditHistory.length > IMAGE_EDIT_HISTORY_LIMIT) {
      imageEditHistory.shift();
    }
    imageEditHistoryIndex = imageEditHistory.length - 1;
    syncImageEditHistoryButtons();
  }

  function applyImageEditSnapshot(snapshot) {
    if (!snapshot) return;
    Object.keys(IMAGE_FILTER_CONFIG).forEach((filterName) => {
      imageEditFilters[filterName] = sanitizeImageFilterValue(
        filterName,
        snapshot.filters?.[filterName]
      );
    });
    imageCropRect = cloneImageCropRect(snapshot.cropRect);
    syncImageEditControls();
    setImagePresetActive(snapshot.presetName || "");
    drawImageEditPreview();
    syncImageEditHistoryButtons();
  }

  function undoImageEditHistory() {
    if (!canUndoImageEditHistory()) return;
    imageEditHistoryIndex -= 1;
    imageEditHistoryRestoring = true;
    applyImageEditSnapshot(imageEditHistory[imageEditHistoryIndex]);
    imageEditHistoryRestoring = false;
  }

  function redoImageEditHistory() {
    if (!canRedoImageEditHistory()) return;
    imageEditHistoryIndex += 1;
    imageEditHistoryRestoring = true;
    applyImageEditSnapshot(imageEditHistory[imageEditHistoryIndex]);
    imageEditHistoryRestoring = false;
  }

  function clampImageCropRect(rect, maxWidth, maxHeight) {
    if (!rect) return null;
    const width = Math.max(
      IMAGE_CROP_MIN_SIZE,
      Math.min(maxWidth, Number(rect.width) || IMAGE_CROP_MIN_SIZE)
    );
    const height = Math.max(
      IMAGE_CROP_MIN_SIZE,
      Math.min(maxHeight, Number(rect.height) || IMAGE_CROP_MIN_SIZE)
    );
    const x = Math.max(0, Math.min(maxWidth - width, Number(rect.x) || 0));
    const y = Math.max(0, Math.min(maxHeight - height, Number(rect.y) || 0));
    return { x, y, width, height };
  }

  function updateImageCropOverlay() {
    if (!(imageCropBox instanceof HTMLElement)) return;
    if (
      imageEditLoadingState ||
      !imageCropRect ||
      imageEditRenderSize.width <= 0 ||
      imageEditRenderSize.height <= 0
    ) {
      imageCropBox.style.display = "none";
      return;
    }

    imageCropBox.style.display = "block";
    imageCropBox.style.left = `${Math.round(imageCropRect.x)}px`;
    imageCropBox.style.top = `${Math.round(imageCropRect.y)}px`;
    imageCropBox.style.width = `${Math.round(imageCropRect.width)}px`;
    imageCropBox.style.height = `${Math.round(imageCropRect.height)}px`;
  }

  function resetImageCropRect() {
    const { width, height } = imageEditRenderSize;
    if (width <= 0 || height <= 0) {
      imageCropRect = null;
      updateImageCropOverlay();
      return;
    }
    imageCropRect = clampImageCropRect(
      { x: 0, y: 0, width, height },
      width,
      height
    );
    updateImageCropOverlay();
  }

  function syncImageCropRectWithCanvas(nextWidth, nextHeight) {
    const prevWidth = imageEditRenderSize.width;
    const prevHeight = imageEditRenderSize.height;
    imageEditRenderSize = { width: nextWidth, height: nextHeight };

    if (nextWidth <= 0 || nextHeight <= 0) {
      imageCropRect = null;
      updateImageCropOverlay();
      return;
    }

    if (!imageCropRect || prevWidth <= 0 || prevHeight <= 0) {
      resetImageCropRect();
      return;
    }

    const scaleX = nextWidth / prevWidth;
    const scaleY = nextHeight / prevHeight;
    imageCropRect = clampImageCropRect(
      {
        x: imageCropRect.x * scaleX,
        y: imageCropRect.y * scaleY,
        width: imageCropRect.width * scaleX,
        height: imageCropRect.height * scaleY,
      },
      nextWidth,
      nextHeight
    );
    updateImageCropOverlay();
  }

  function getImageEditCanvasPoint(clientX, clientY) {
    if (!(imageEditCanvas instanceof HTMLCanvasElement)) return null;
    const rect = imageEditCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  function stopImageCropDrag() {
    if (!imageCropDragState) return;
    const dragState = imageCropDragState;
    imageCropDragState = null;
    window.removeEventListener("mousemove", onImageCropDragMove);
    window.removeEventListener("mouseup", stopImageCropDrag);
    if (dragState.hasChanged) {
      pushImageEditHistory();
    }
  }

  function onImageCropDragMove(event) {
    if (!imageCropDragState || !imageCropRect) return;
    const pointer = getImageEditCanvasPoint(event.clientX, event.clientY);
    if (!pointer) return;
    event.preventDefault();

    const { mode, startPoint, startRect } = imageCropDragState;
    const deltaX = pointer.x - startPoint.x;
    const deltaY = pointer.y - startPoint.y;
    const maxWidth = imageEditRenderSize.width;
    const maxHeight = imageEditRenderSize.height;

    if (mode === "move") {
      imageCropRect = clampImageCropRect(
        {
          x: startRect.x + deltaX,
          y: startRect.y + deltaY,
          width: startRect.width,
          height: startRect.height,
        },
        maxWidth,
        maxHeight
      );
    } else {
      const width = Math.max(
        IMAGE_CROP_MIN_SIZE,
        Math.min(maxWidth - startRect.x, startRect.width + deltaX)
      );
      const height = Math.max(
        IMAGE_CROP_MIN_SIZE,
        Math.min(maxHeight - startRect.y, startRect.height + deltaY)
      );
      imageCropRect = clampImageCropRect(
        {
          x: startRect.x,
          y: startRect.y,
          width,
          height,
        },
        maxWidth,
        maxHeight
      );
    }

    imageCropDragState.hasChanged = !isSameImageCropRect(imageCropRect, startRect);
    drawImageEditPreview();
  }

  function startImageCropDrag(event, mode) {
    if (event.button !== 0 || !imageCropRect) return;
    const point = getImageEditCanvasPoint(event.clientX, event.clientY);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();

    imageCropDragState = {
      mode,
      startPoint: point,
      startRect: { ...imageCropRect },
      hasChanged: false,
    };
    window.addEventListener("mousemove", onImageCropDragMove);
    window.addEventListener("mouseup", stopImageCropDrag);
  }

  function drawImageEditPreview() {
    if (
      !(imageEditSource instanceof HTMLImageElement) ||
      !(imageEditCanvas instanceof HTMLCanvasElement) ||
      !(imageEditStage instanceof HTMLElement)
    ) {
      return;
    }

    const sourceWidth = imageEditSource.naturalWidth || imageEditSource.width;
    const sourceHeight = imageEditSource.naturalHeight || imageEditSource.height;
    if (!sourceWidth || !sourceHeight) return;

    const stageRect = imageEditStage.getBoundingClientRect();
    const maxWidth = Math.max(280, stageRect.width - 40);
    const maxHeight = Math.max(220, stageRect.height - 40);
    const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, 1);
    const canvasWidth = Math.max(1, Math.round(sourceWidth * scale));
    const canvasHeight = Math.max(1, Math.round(sourceHeight * scale));

    if (imageEditCanvasWrap instanceof HTMLElement) {
      imageEditCanvasWrap.style.width = `${canvasWidth}px`;
      imageEditCanvasWrap.style.height = `${canvasHeight}px`;
    }

    imageEditCanvas.width = canvasWidth;
    imageEditCanvas.height = canvasHeight;
    imageEditCanvas.style.width = `${canvasWidth}px`;
    imageEditCanvas.style.height = `${canvasHeight}px`;
    syncImageCropRectWithCanvas(canvasWidth, canvasHeight);

    const context = imageEditCanvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvasWidth, canvasHeight);
    context.filter = getImageFilterCssText();
    context.drawImage(imageEditSource, 0, 0, canvasWidth, canvasHeight);
    context.filter = "none";

    if (imageCropRect && imageCropRect.width > 0 && imageCropRect.height > 0) {
      const cropLeft = Math.max(0, Math.min(canvasWidth, imageCropRect.x));
      const cropTop = Math.max(0, Math.min(canvasHeight, imageCropRect.y));
      const cropRight = Math.max(
        cropLeft,
        Math.min(canvasWidth, cropLeft + imageCropRect.width)
      );
      const cropBottom = Math.max(
        cropTop,
        Math.min(canvasHeight, cropTop + imageCropRect.height)
      );

      context.save();
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvasWidth, cropTop);
      context.fillRect(0, cropBottom, canvasWidth, canvasHeight - cropBottom);
      context.fillRect(0, cropTop, cropLeft, cropBottom - cropTop);
      context.fillRect(
        cropRight,
        cropTop,
        canvasWidth - cropRight,
        cropBottom - cropTop
      );
      context.restore();
    }

    updateImageCropOverlay();
  }

  function setImageEditLoading(loading) {
    imageEditLoadingState = loading;
    root.classList.toggle("is-loading", loading);
    if (loading) {
      stopImageCropDrag();
    }
    if (imageEditApplyButton instanceof HTMLButtonElement) {
      imageEditApplyButton.disabled = loading;
    }
    if (imageEditLoading instanceof HTMLElement) {
      imageEditLoading.style.display = loading ? "flex" : "none";
    }
    updateImageCropOverlay();
    syncImageEditHistoryButtons();
  }

  function close() {
    stopImageCropDrag();
    root.classList.remove("is-open");
    root.setAttribute("aria-hidden", "true");
    imageEditOpenToken += 1;
    imageEditHistory = [];
    imageEditHistoryIndex = -1;
    imageEditSource = null;
    imageEditTargetPos = null;
    revokeImageEditSourceObjectUrl();
    setImageEditLoading(false);
    syncImageEditHistoryButtons();
    window.requestAnimationFrame(() => {
      scheduleImageActionToolbar();
    });
  }

  function open(contextOverride) {
    const context = contextOverride || getSelectedImageContext();
    if (!context) {
      showToast("请先选中图片", "error");
      return false;
    }

    const src = context.imageNode?.attrs?.src;
    if (!src) {
      showToast("图片地址无效", "error");
      return false;
    }

    imageEditTargetPos = context.imagePos;
    imageEditSource = null;
    imageCropRect = null;
    imageEditRenderSize = { width: 0, height: 0 };
    imageEditHistory = [];
    imageEditHistoryIndex = -1;
    applyImageFilterPreset("origin");
    root.classList.add("is-open");
    root.setAttribute("aria-hidden", "false");
    setImageEditLoading(true);

    const openToken = imageEditOpenToken + 1;
    imageEditOpenToken = openToken;

    resolveImageForEditing(src)
      .then((image) => {
        if (openToken !== imageEditOpenToken) return;
        imageEditSource = image;
        setImageEditLoading(false);
        drawImageEditPreview();
        resetImageEditHistory();
      })
      .catch((error) => {
        if (openToken !== imageEditOpenToken) return;
        setImageEditLoading(false);
        if (error?.reason === "cross-origin-blocked") {
          showToast("图片被跨域策略拦截，请在微信配置里设置图片代理 URL", "error");
        } else {
          showToast("图片加载失败", "error");
        }
        close();
      });
    return true;
  }

  function apply() {
    if (!(imageEditSource instanceof HTMLImageElement)) {
      showToast("图片尚未加载完成", "error");
      return;
    }
    if (typeof imageEditTargetPos !== "number") {
      showToast("未找到目标图片", "error");
      return;
    }

    const sourceWidth = imageEditSource.naturalWidth || imageEditSource.width;
    const sourceHeight = imageEditSource.naturalHeight || imageEditSource.height;

    let cropX = 0;
    let cropY = 0;
    let cropWidth = sourceWidth;
    let cropHeight = sourceHeight;

    if (
      imageCropRect &&
      imageEditRenderSize.width > 0 &&
      imageEditRenderSize.height > 0
    ) {
      const scaleX = sourceWidth / imageEditRenderSize.width;
      const scaleY = sourceHeight / imageEditRenderSize.height;
      cropX = Math.max(0, Math.floor(imageCropRect.x * scaleX));
      cropY = Math.max(0, Math.floor(imageCropRect.y * scaleY));
      cropWidth = Math.max(1, Math.floor(imageCropRect.width * scaleX));
      cropHeight = Math.max(1, Math.floor(imageCropRect.height * scaleY));

      if (cropX + cropWidth > sourceWidth) cropWidth = sourceWidth - cropX;
      if (cropY + cropHeight > sourceHeight) cropHeight = sourceHeight - cropY;
    }

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = Math.max(1, cropWidth);
    exportCanvas.height = Math.max(1, cropHeight);
    const exportContext = exportCanvas.getContext("2d");
    if (!exportContext) {
      showToast("无法初始化图片编辑器", "error");
      return;
    }

    exportContext.filter = getImageFilterCssText();
    exportContext.drawImage(
      imageEditSource,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      exportCanvas.width,
      exportCanvas.height
    );
    exportContext.filter = "none";

    let nextSrc = "";
    try {
      nextSrc = exportCanvas.toDataURL("image/png", 0.95);
    } catch (error) {
      showToast("该图片受跨域限制，无法导出，请先替换成本地图片", "error");
      return;
    }

    const ok = updateImageByPos(imageEditTargetPos, (attrs) => {
      attrs.src = nextSrc;
    });

    if (ok) {
      showToast("图片编辑已应用", "success");
      close();
      scheduleImageActionToolbar();
    } else {
      showToast("图片替换失败", "error");
    }
  }

  function isOpen() {
    return root.classList.contains("is-open");
  }

  function redrawIfOpen() {
    if (isOpen()) {
      drawImageEditPreview();
    }
  }

  function onKeydown(event) {
    if (!isOpen()) return;
    if (event.key === "Escape") {
      close();
      return;
    }
    if (event.altKey) return;
    if (!(event.metaKey || event.ctrlKey)) return;

    const lowerKey = String(event.key || "").toLowerCase();
    if (lowerKey === "z" && !event.shiftKey) {
      event.preventDefault();
      undoImageEditHistory();
      return;
    }
    if (lowerKey === "y" || (lowerKey === "z" && event.shiftKey)) {
      event.preventDefault();
      redoImageEditHistory();
    }
  }

  imageEditPresetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const presetName = button.getAttribute("data-preset");
      if (!presetName) return;
      applyImageFilterPreset(presetName);
      drawImageEditPreview();
      pushImageEditHistory();
    });
  });

  imageEditFilterInputs.forEach((input, filterName) => {
    input.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      imageEditFilters[filterName] = sanitizeImageFilterValue(
        filterName,
        target.value
      );
      syncImageEditControls();
      setImagePresetActive("");
      drawImageEditPreview();
    });
    input.addEventListener("change", () => {
      pushImageEditHistory();
    });
  });

  if (imageCropBox instanceof HTMLElement) {
    imageCropBox.addEventListener("mousedown", (event) =>
      startImageCropDrag(event, "move")
    );
  }

  if (imageCropHandle instanceof HTMLElement) {
    imageCropHandle.addEventListener("mousedown", (event) =>
      startImageCropDrag(event, "resize")
    );
  }

  if (imageEditResetCropButton instanceof HTMLButtonElement) {
    imageEditResetCropButton.addEventListener("click", () => {
      resetImageCropRect();
      drawImageEditPreview();
      pushImageEditHistory();
      showToast("裁剪已重置", "info");
    });
  }

  if (imageEditUndoButton instanceof HTMLButtonElement) {
    imageEditUndoButton.addEventListener("click", undoImageEditHistory);
  }

  if (imageEditRedoButton instanceof HTMLButtonElement) {
    imageEditRedoButton.addEventListener("click", redoImageEditHistory);
  }

  if (imageEditCloseButton instanceof HTMLButtonElement) {
    imageEditCloseButton.addEventListener("click", close);
  }

  if (imageEditCancelButton instanceof HTMLButtonElement) {
    imageEditCancelButton.addEventListener("click", close);
  }

  if (imageEditApplyButton instanceof HTMLButtonElement) {
    imageEditApplyButton.addEventListener("click", apply);
  }

  root.addEventListener("click", (event) => {
    if (isModal && event.target === root) {
      close();
    }
  });

  window.addEventListener("keydown", onKeydown);

  return {
    element: root,
    open,
    close,
    apply,
    isOpen,
    redrawIfOpen,
    destroy() {
      stopImageCropDrag();
      imageEditOpenToken += 1;
      revokeImageEditSourceObjectUrl();
      window.removeEventListener("keydown", onKeydown);
      root.remove();
    },
  };
}

