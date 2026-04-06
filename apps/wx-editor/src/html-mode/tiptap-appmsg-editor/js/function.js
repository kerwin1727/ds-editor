import Clipboard from "clipboard";
import editor from "./editor.js";
import { Dropdown } from "../plugins/dropdown/index.js";
import { Tabs } from "../plugins/tabs/index.js";
import { Modal } from "../plugins/modal/index.js";
import { createImageEditorWorkbench } from "@/components/html-mode/ImageEditorWorkbench";

const HTML_EDITOR_CONTENT_CACHE_KEY = "wx-editor:html-content:v1";
const HTML_EDITOR_CACHE_SAVE_DELAY = 320;
const RESOURCE_SAVE_TEMPLATE_EVENT = "wx-editor:resource-save-template-request";
let saveCacheTimer = null;
const TOAST_DURATION = 1800;
let toastHideTimer = null;
let toastCleanupTimer = null;
const TOAST_ICON_SVG = {
  info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="10" x2="12" y2="16"></line><circle cx="12" cy="7" r="1.2" fill="currentColor" stroke="none"></circle></svg>',
  success:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M7 12.5l3.2 3.2L17 9.6"></path></svg>',
  error:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M9 9l6 6M15 9l-6 6"></path></svg>',
};

function ensureToastContainer() {
  let container = document.querySelector(".wx-editor-toast-container");
  if (container instanceof HTMLElement) {
    return container;
  }
  container = document.createElement("div");
  container.className = "wx-editor-toast-container";
  document.body.appendChild(container);
  return container;
}

function showToast(message, type = "info") {
  const container = ensureToastContainer();
  let toast = container.querySelector(".wx-editor-toast");
  if (!(toast instanceof HTMLElement)) {
    toast = document.createElement("div");
    toast.className = "wx-editor-toast";
    container.appendChild(toast);
  }

  let icon = toast.querySelector(".wx-editor-toast-icon");
  if (!(icon instanceof HTMLElement)) {
    icon = document.createElement("span");
    icon.className = "wx-editor-toast-icon";
    toast.appendChild(icon);
  }

  let text = toast.querySelector(".wx-editor-toast-text");
  if (!(text instanceof HTMLElement)) {
    text = document.createElement("span");
    text.className = "wx-editor-toast-text";
    toast.appendChild(text);
  }

  icon.innerHTML = TOAST_ICON_SVG[type] || TOAST_ICON_SVG.info;
  text.textContent = message;
  toast.className = `wx-editor-toast is-${type}`;

  if (toastHideTimer) window.clearTimeout(toastHideTimer);
  if (toastCleanupTimer) window.clearTimeout(toastCleanupTimer);

  window.requestAnimationFrame(() => {
    toast.classList.add("is-visible");
  });

  toastHideTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
    toastCleanupTimer = window.setTimeout(() => {
      if (toast.parentElement === container) {
        container.removeChild(toast);
      }
    }, 220);
  }, TOAST_DURATION);
}

window.__WX_EDITOR_SHOW_TOAST__ = showToast;

function normalizeEditorHtml(html) {
  if (typeof html !== "string") return "";
  return html.trim();
}

function readCachedEditorHtml() {
  try {
    return normalizeEditorHtml(
      window.localStorage.getItem(HTML_EDITOR_CONTENT_CACHE_KEY) || ""
    );
  } catch (error) {
    console.warn("[html-editor] read cache failed", error);
    return "";
  }
}

function writeCachedEditorHtml(html) {
  try {
    const normalized = normalizeEditorHtml(html);
    if (!normalized) {
      window.localStorage.removeItem(HTML_EDITOR_CONTENT_CACHE_KEY);
      return;
    }
    window.localStorage.setItem(HTML_EDITOR_CONTENT_CACHE_KEY, normalized);
  } catch (error) {
    console.warn("[html-editor] write cache failed", error);
  }
}

function persistEditorContentNow() {
  if (!editor || editor.isDestroyed) return;
  writeCachedEditorHtml(editor.getHTML());
}

function schedulePersistEditorContent() {
  if (saveCacheTimer) {
    window.clearTimeout(saveCacheTimer);
  }
  saveCacheTimer = window.setTimeout(() => {
    saveCacheTimer = null;
    persistEditorContentNow();
  }, HTML_EDITOR_CACHE_SAVE_DELAY);
}

function restoreEditorContentFromCache() {
  const cachedHtml = readCachedEditorHtml();
  if (!cachedHtml) return;

  try {
    editor.commands.setContent(cachedHtml, false, {
      parseOptions: {
        preserveWhitespace: "full",
      },
    })
  } catch (error) {
    console.warn("[html-editor] restore cache failed", error);
  }
}

restoreEditorContentFromCache();
window.addEventListener("beforeunload", persistEditorContentNow);

const IMAGE_ACTION_ICON_SVG = {
  crop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3v12a3 3 0 0 0 3 3h12"></path><path d="M3 6h12a3 3 0 0 1 3 3v12"></path></svg>',
  replace:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h5l2-2h4l2 2h5v12H3z"></path><circle cx="12" cy="13" r="3"></circle></svg>',
  round:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="5"></rect><path d="M4 10h6V4"></path></svg>',
  tune:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="4" y1="6" x2="20" y2="6"></line><circle cx="10" cy="6" r="2"></circle><line x1="4" y1="12" x2="20" y2="12"></line><circle cx="15" cy="12" r="2"></circle><line x1="4" y1="18" x2="20" y2="18"></line><circle cx="8" cy="18" r="2"></circle></svg>',
  fit: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M7 12h10M12 7v10"></path></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.1 0l2.1-2.1a5 5 0 0 0-7.1-7.1L10.5 5.4"></path><path d="M14 11a5 5 0 0 0-7.1 0l-2.1 2.1a5 5 0 1 0 7.1 7.1l1.6-1.6"></path></svg>',
};
const IMAGE_CROP_RATIOS = [null, "1 / 1", "4 / 3", "16 / 9"];
const IMAGE_RADIUS_STEPS = [0, 8, 16, 24];
let imageToolbarRaf = null;
let pendingReplaceImagePos = null;

const imageReplaceInput = document.createElement("input");
imageReplaceInput.type = "file";
imageReplaceInput.accept = "image/*";
imageReplaceInput.style.display = "none";
document.body.appendChild(imageReplaceInput);

const imageActionToolbar = document.createElement("div");
imageActionToolbar.className = "wx-image-action-toolbar";
imageActionToolbar.style.display = "none";
document.body.appendChild(imageActionToolbar);

imageActionToolbar.addEventListener("mousedown", (event) => {
  event.preventDefault();
});

function resolveImageProxyUrlForEditor(sourceUrl) {
  if (!sourceUrl || typeof sourceUrl !== "string") {
    return "";
  }
  try {
    const config = JSON.parse(localStorage.getItem("wxProxyConfig") || "{}");
    const template = String(config?.imageProxyUrl || "").trim();
    if (!template || !template.includes("{url}")) {
      return "";
    }
    return template.replace("{url}", encodeURIComponent(sourceUrl));
  } catch (error) {
    console.warn("[html-editor] resolve image proxy failed", error);
    return "";
  }
}

const imageEditorWorkbench = createImageEditorWorkbench({
  presentation: "modal",
  getSelectedImageContext: () => resolveSelectedImageContext(),
  updateImageByPos: (imagePos, updater) => updateImageAttrsByPos(imagePos, updater),
  showToast,
  hideImageActionToolbar,
  scheduleImageActionToolbar,
  resolveImageProxyUrl: resolveImageProxyUrlForEditor,
});

function handleOpenImageEditorAction() {
  imageEditorWorkbench.open();
}
function styleTextToMap(styleText) {
  const styleMap = new Map();
  if (!styleText || typeof styleText !== "string") {
    return styleMap;
  }

  styleText
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      const [property, ...rest] = item.split(":");
      if (!property || !rest.length) return;
      styleMap.set(property.trim().toLowerCase(), rest.join(":").trim());
    });

  return styleMap;
}

function styleMapToText(styleMap) {
  return Array.from(styleMap.entries())
    .map(([property, value]) => `${property}: ${value}`)
    .join("; ");
}

function normalizeRatioToken(ratioValue) {
  if (!ratioValue || typeof ratioValue !== "string") return "";
  return ratioValue.replace(/\s+/g, "").replace(":", "/");
}

function getImageNodeAtPos(pos) {
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== "image") {
    return null;
  }
  return node;
}

function getImageLinkInfoAtPos(imagePos) {
  const doc = editor.state.doc;
  const safePos = Math.max(0, Math.min(imagePos, doc.content.size));
  const $pos = doc.resolve(safePos);

  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name === "imageLink") {
      return {
        node,
        pos: $pos.before(depth),
      };
    }
  }
  return null;
}

function getImageDomByPos(imagePos) {
  const nodeDom = editor.view.nodeDOM(imagePos);
  if (nodeDom instanceof HTMLImageElement) {
    return nodeDom;
  }
  if (nodeDom instanceof HTMLElement) {
    const image = nodeDom.querySelector("img");
    if (image instanceof HTMLImageElement) {
      return image;
    }
  }
  return null;
}

function resolveSelectedImageContext() {
  const { selection } = editor.state;
  let imagePos = null;
  let imageNode = null;

  if (selection?.node?.type?.name === "image") {
    imagePos = selection.from;
    imageNode = selection.node;
  } else {
    const { $from } = selection;
    const after = $from.nodeAfter;
    const before = $from.nodeBefore;

    if (after?.type?.name === "image") {
      imagePos = $from.pos;
      imageNode = after;
    } else if (before?.type?.name === "image") {
      imagePos = $from.pos - before.nodeSize;
      imageNode = before;
    }
  }

  if (typeof imagePos !== "number" || !imageNode) {
    return null;
  }

  return {
    imagePos,
    imageNode,
    imageDom: getImageDomByPos(imagePos),
    imageLink: getImageLinkInfoAtPos(imagePos),
  };
}

function updateImageAttrsByPos(imagePos, updater) {
  const imageNode = getImageNodeAtPos(imagePos);
  if (!imageNode) return false;

  const nextAttrs = { ...imageNode.attrs };
  const shouldContinue = updater(nextAttrs, imageNode);
  if (shouldContinue === false) return false;

  const tr = editor.state.tr.setNodeMarkup(
    imagePos,
    undefined,
    nextAttrs,
    imageNode.marks
  );
  editor.view.dispatch(tr);
  schedulePersistEditorContent();
  return true;
}

function hideImageActionToolbar() {
  imageActionToolbar.classList.remove("is-visible");
  imageActionToolbar.style.display = "none";
}

function scheduleImageActionToolbar() {
  if (imageToolbarRaf) {
    window.cancelAnimationFrame(imageToolbarRaf);
  }
  imageToolbarRaf = window.requestAnimationFrame(() => {
    imageToolbarRaf = null;
    const context = resolveSelectedImageContext();
    if (!context || !(context.imageDom instanceof HTMLImageElement)) {
      hideImageActionToolbar();
      return;
    }

    const imageRect = context.imageDom.getBoundingClientRect();
    if (imageRect.width < 2 || imageRect.height < 2) {
      hideImageActionToolbar();
      return;
    }

    imageActionToolbar.style.display = "flex";
    imageActionToolbar.classList.remove("is-visible");
    const toolbarRect = imageActionToolbar.getBoundingClientRect();

    const margin = 10;
    const minLeft = 12;
    const maxLeft = window.innerWidth - toolbarRect.width - 12;
    const rawLeft = imageRect.left + imageRect.width / 2 - toolbarRect.width / 2;
    const left = Math.max(minLeft, Math.min(maxLeft, rawLeft));
    const top = Math.max(12, imageRect.top - toolbarRect.height - margin);

    imageActionToolbar.style.left = `${Math.round(left)}px`;
    imageActionToolbar.style.top = `${Math.round(top)}px`;

    window.requestAnimationFrame(() => {
      imageActionToolbar.classList.add("is-visible");
    });
  });
}

function getNextCropRatio(currentRatio) {
  const currentToken = normalizeRatioToken(currentRatio);
  const currentIndex = IMAGE_CROP_RATIOS.findIndex(
    (ratio) => normalizeRatioToken(ratio) === currentToken
  );
  if (currentIndex < 0) {
    return IMAGE_CROP_RATIOS[1];
  }
  return IMAGE_CROP_RATIOS[(currentIndex + 1) % IMAGE_CROP_RATIOS.length];
}

function handleCropImageAction() {
  const context = resolveSelectedImageContext();
  if (!context) {
    showToast("请先选中图片", "error");
    return;
  }

  const currentStyle = styleTextToMap(context.imageNode.attrs.baseStyle || "");
  const nextRatio = getNextCropRatio(currentStyle.get("aspect-ratio"));
  const ok = updateImageAttrsByPos(context.imagePos, (attrs) => {
    const styleMap = styleTextToMap(attrs.baseStyle || "");
    if (nextRatio) {
      styleMap.set("aspect-ratio", nextRatio);
      styleMap.set("object-fit", "cover");
      styleMap.set("display", "block");
      styleMap.set("max-width", "100%");
      if (!styleMap.has("width")) {
        styleMap.set("width", "100%");
      }
    } else {
      styleMap.delete("aspect-ratio");
      styleMap.delete("object-fit");
      styleMap.set("height", "auto");
    }
    attrs.baseStyle = styleMapToText(styleMap);
  });

  if (ok) {
    showToast(
      nextRatio ? `剪裁比例：${nextRatio}` : "已恢复原图比例",
      "success"
    );
    scheduleImageActionToolbar();
  }
}

function handleRoundImageAction() {
  const context = resolveSelectedImageContext();
  if (!context) {
    showToast("请先选中图片", "error");
    return;
  }

  const styleMap = styleTextToMap(context.imageNode.attrs.baseStyle || "");
  const currentRadius = Number.parseInt(styleMap.get("border-radius") || "0", 10);
  const currentIndex = IMAGE_RADIUS_STEPS.indexOf(
    Number.isFinite(currentRadius) ? currentRadius : 0
  );
  const nextRadius =
    IMAGE_RADIUS_STEPS[
      (currentIndex + 1 + IMAGE_RADIUS_STEPS.length) %
        IMAGE_RADIUS_STEPS.length
    ];

  const ok = updateImageAttrsByPos(context.imagePos, (attrs) => {
    const nextStyleMap = styleTextToMap(attrs.baseStyle || "");
    if (nextRadius > 0) {
      nextStyleMap.set("border-radius", `${nextRadius}px`);
    } else {
      nextStyleMap.delete("border-radius");
    }
    attrs.baseStyle = styleMapToText(nextStyleMap);
  });

  if (ok) {
    showToast(
      nextRadius > 0 ? `图片圆角：${nextRadius}px` : "已取消图片圆角",
      "success"
    );
    scheduleImageActionToolbar();
  }
}

function handleFitImageAction() {
  const context = resolveSelectedImageContext();
  if (!context) {
    showToast("请先选中图片", "error");
    return;
  }

  const ok = updateImageAttrsByPos(context.imagePos, (attrs) => {
    const styleMap = styleTextToMap(attrs.baseStyle || "");
    styleMap.set("display", "block");
    styleMap.set("width", "100%");
    styleMap.set("max-width", "100%");
    styleMap.set("height", "auto");
    styleMap.set("margin-left", "auto");
    styleMap.set("margin-right", "auto");
    styleMap.delete("float");
    attrs.baseStyle = styleMapToText(styleMap);
  });

  if (ok) {
    showToast("已设置为自适应宽度", "success");
    scheduleImageActionToolbar();
  }
}

function normalizeLinkInput(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return "";
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    return new URL(withProtocol).toString();
  } catch (error) {
    return null;
  }
}

function handleImageLinkAction() {
  const context = resolveSelectedImageContext();
  if (!context) {
    showToast("请先选中图片", "error");
    return;
  }

  const currentHref = context.imageLink?.node?.attrs?.href || "";
  const rawHref = window.prompt(
    "设置图片超链接（留空可移除链接）",
    currentHref || "https://"
  );
  if (rawHref === null) return;

  const nextHref = normalizeLinkInput(rawHref);
  if (nextHref === null) {
    showToast("链接格式不正确", "error");
    return;
  }

  if (!nextHref) {
    if (!context.imageLink) {
      showToast("当前图片没有超链接", "info");
      return;
    }
    const replacementImage = editor.state.schema.nodes.image.create(
      context.imageNode.attrs,
      null,
      context.imageNode.marks
    );
    const tr = editor.state.tr.replaceWith(
      context.imageLink.pos,
      context.imageLink.pos + context.imageLink.node.nodeSize,
      replacementImage
    );
    editor.view.dispatch(tr);
    schedulePersistEditorContent();
    showToast("已移除图片超链接", "success");
    scheduleImageActionToolbar();
    return;
  }

  if (context.imageLink) {
    const prevAttrs = context.imageLink.node.attrs || {};
    const nextAttrs = {
      ...prevAttrs,
      href: nextHref,
      src: context.imageNode.attrs.src || prevAttrs.src || "",
      HTMLAttributes: {
        ...(prevAttrs.HTMLAttributes || {}),
        href: nextHref,
        target: "_blank",
        linktype: "image",
        tab: "innerlink",
      },
    };
    const tr = editor.state.tr.setNodeMarkup(
      context.imageLink.pos,
      undefined,
      nextAttrs,
      context.imageLink.node.marks
    );
    editor.view.dispatch(tr);
  } else {
    const imageContent = {
      type: "image",
      attrs: { ...context.imageNode.attrs },
    };
    const imageLinkContent = {
      type: "imageLink",
      attrs: {
        href: nextHref,
        src: context.imageNode.attrs.src || "",
        HTMLAttributes: {
          href: nextHref,
          target: "_blank",
          linktype: "image",
          tab: "innerlink",
        },
      },
      content: [imageContent],
    };
    editor
      .chain()
      .focus()
      .insertContentAt(
        {
          from: context.imagePos,
          to: context.imagePos + context.imageNode.nodeSize,
        },
        imageLinkContent
      )
      .run();
  }

  schedulePersistEditorContent();
  showToast("图片超链接已更新", "success");
  scheduleImageActionToolbar();
}

function triggerReplaceImageAction() {
  const context = resolveSelectedImageContext();
  if (!context) {
    showToast("请先选中图片", "error");
    return;
  }
  pendingReplaceImagePos = context.imagePos;
  imageReplaceInput.click();
}

imageReplaceInput.addEventListener("change", () => {
  const [file] = imageReplaceInput.files || [];
  const targetPos =
    typeof pendingReplaceImagePos === "number"
      ? pendingReplaceImagePos
      : resolveSelectedImageContext()?.imagePos;
  pendingReplaceImagePos = null;

  if (!file || typeof targetPos !== "number") {
    imageReplaceInput.value = "";
    return;
  }

  const fileReader = new FileReader();
  fileReader.onload = () => {
    if (fileReader.error || typeof fileReader.result !== "string") {
      showToast("图片替换失败", "error");
      imageReplaceInput.value = "";
      return;
    }

    const ok = updateImageAttrsByPos(targetPos, (attrs) => {
      attrs.src = fileReader.result;
    });

    if (ok) {
      showToast("图片已替换", "success");
      scheduleImageActionToolbar();
    } else {
      showToast("图片替换失败", "error");
    }
    imageReplaceInput.value = "";
  };
  fileReader.readAsDataURL(file);
});

function createImageActionButton(action, label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "wx-image-action-btn";
  button.dataset.action = action;
  button.setAttribute("title", label);
  button.innerHTML = `
    <span class="wx-image-action-btn-icon">${IMAGE_ACTION_ICON_SVG[action] || ""}</span>
    <span class="wx-image-action-btn-text">${label}</span>
  `;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return button;
}

imageActionToolbar.appendChild(
  createImageActionButton("crop", "剪裁", handleCropImageAction)
);
imageActionToolbar.appendChild(
  createImageActionButton("replace", "替换", triggerReplaceImageAction)
);
imageActionToolbar.appendChild(
  createImageActionButton("round", "圆角", handleRoundImageAction)
);
imageActionToolbar.appendChild(
  createImageActionButton("tune", "编辑", handleOpenImageEditorAction)
);
imageActionToolbar.appendChild(
  createImageActionButton("fit", "自适应", handleFitImageAction)
);
const imageActionSeparator = document.createElement("span");
imageActionSeparator.className = "wx-image-action-separator";
imageActionToolbar.appendChild(imageActionSeparator);
imageActionToolbar.appendChild(
  createImageActionButton("link", "超链接", handleImageLinkAction)
);

editor.on("selectionUpdate", scheduleImageActionToolbar);
editor.on("update", scheduleImageActionToolbar);
editor.on("focus", scheduleImageActionToolbar);
editor.on("blur", scheduleImageActionToolbar);
window.addEventListener("resize", () => {
  scheduleImageActionToolbar();
  imageEditorWorkbench.redrawIfOpen();
});
window.addEventListener("scroll", scheduleImageActionToolbar, true);

// 图片
const $imageDropdown = document.querySelector(".header .dropdown-image");
new Dropdown({
  el: $imageDropdown,
});
// 插入本地图片
const $image_uploader = document.querySelector("#image_uploader");
$image_uploader.addEventListener("change", (e) => {
  const [file] = $image_uploader.files;
  const fileReader = new FileReader();
  fileReader.onload = () => {
    if (fileReader.error) {
      console.warn(fileReader.error);
      window.alert("图片上传失败");
      return;
    }
    const dataString = fileReader.result;
    editor
      .chain()
      .focus()
      .setImage({
        src: dataString,
      })
      .run();
    $image_uploader.value = "";
  };
  fileReader.readAsDataURL(file);
});
// 插入链接图片
const $image_link = document.querySelector("#image_link");
$image_link.addEventListener("click", () => {
  const imageUrl = window.prompt("请输入图片链接", "");
  try {
    new URL(imageUrl);
    editor.chain().focus().setImage({ src: imageUrl }).run();
  } catch (error) {
    console.warn(error);
  }
});

// 视频
// 视频弹窗
const $uploadVideoBtn = document.querySelector(".header .module-item.video");
const videoModal = new Modal({ el: "#video_modal" });
$uploadVideoBtn.addEventListener("click", () => {
  videoModal.show();
});
const handleResetVideoModal = () => {
  $video_uploader.value = "";
  $video_filename.innerText = "";
  $video_link.value = "";
  videoUrl = "";
};
videoModal.on("save", () => {
  const activeName = videoModalTabs.activeName;
  if (activeName === "local") {
    if (!videoUrl) {
      window.alert("请先上传视频");
      return;
    }
    editor.chain().focus().setVideo({ src: videoUrl }).run();
  }
  if (activeName === "link") {
    if (!videoUrl) {
      window.alert("请先输入视频链接");
      return;
    }
    if (!videoUrl.match(/^(http|https):\/\/v\.qq\.com\/x\/cover\/.+$/)) {
      window.alert("仅支持腾讯视频链接");
      return;
    }
    // 解析出video id
    let videoId =
      videoUrl.match(/j_vid=(\w+)&?/)?.[1] || videoUrl.match(/\/(\w+).html/)[1];
    editor
      .chain()
      .focus()
      .setParagraph()
      .setIframe({
        src: `http://v.qq.com/txp/iframe/player.html?vid=${videoId}`,
        HTMLAttributes: {
          class: "video_iframe",
          style: `height: 325px;border-radius: 4px;pointer-events: none;`,
        },
      })
      .run();
  }
  videoModal.hide();
  handleResetVideoModal();
});
videoModal.on("close", () => {
  videoModalTabs.tabChange("local");
  handleResetVideoModal();
});
// 视频tabs
const $videoTabs = document.querySelector("#video_modal .tabs");
const videoModalTabs = new Tabs({
  el: $videoTabs,
  activated: "local",
});
videoModalTabs.on("change", handleResetVideoModal);
// 插入本地视频
let videoUrl = "";
const $video_uploader = document.querySelector("#video_uploader");
$video_uploader.addEventListener("change", (e) => {
  const [file] = $video_uploader.files;
  const fileReader = new FileReader();
  fileReader.onload = () => {
    if (fileReader.error) {
      console.warn(fileReader.error);
      window.alert("视频上传失败");
      return;
    }
    videoUrl = fileReader.result;
    $video_filename.innerText = file.name;
  };
  fileReader.readAsDataURL(file);
});
const $video_filename = document.querySelector("#video_uploader~.filename");
// 插入视频链接
const $video_link = document.querySelector("#video_link");
$video_link.addEventListener("change", (e) => {
  videoUrl = e.target.value;
});

// 超链接
// 超链接弹窗
const $insertLinkBtn = document.querySelector(".header .module-item.link");
const linkModal = new Modal({ el: "#link_modal" });
$insertLinkBtn.addEventListener("click", () => {
  linkModal.show();
});
const handleResetLinkModal = () => {
  linkTitle = "";
  $linkTitle.value = "";
  linkPicture = "";
  $linkPictureUploader.value = "";
  linkUrl = "";
  $linkUrl.value = "";
};
// 插入超链接tabs
const $linkTabs = document.querySelector("#link_modal .tabs");
const linkModalTabs = new Tabs({
  el: $linkTabs,
  activated: "text",
});
linkModal.on("save", () => {
  const activeName = linkModalTabs.activeName;
  if (!linkUrl) {
    window.alert("文章链接不可为空");
    return;
  }
  if (!linkUrl.match(/^(http|https):\/\/mp\.weixin\.qq\.com\/s\/.+$/)) {
    window.alert("仅支持公众号文章链接");
    return;
  }
  if (activeName === "text") {
    if (!linkTitle) {
      window.alert("链接标题不可为空");
      return;
    }
    let { state } = editor;
    let linkMark = state.schema.text(linkTitle, [
      state.schema.marks.link.create({
        href: linkUrl,
        HTMLAttributes: { _href: linkUrl },
      }),
    ]);
    const tr = state.tr.insert(state.selection.from, linkMark);
    editor.view.dispatch(tr);
  }
  if (activeName === "picture") {
    if (!linkPicture) {
      window.alert("请先选择链接图片");
      return;
    }
    editor
      .chain()
      .focus()
      .setImageLink({
        href: linkUrl,
        src: linkPicture,
        HTMLAttributes: {
          class: "h5_image_link",
          target: "_blank",
          linktype: "image",
          tab: "innerlink",
        },
      })
      .enter()
      .run();
  }
  linkModal.hide();
  handleResetLinkModal();
  console.log(editor.getHTML());
});
linkModal.on("close", () => {
  linkModalTabs.tabChange("text");
  handleResetLinkModal();
});
// 链接标题
let linkTitle = "";
const $linkTitle = document.querySelector("#link_modal .link-title");
$linkTitle.addEventListener("change", (e) => {
  linkTitle = e.target.value;
});
// 链接图片
let linkPicture = "";
const $linkPictureUploader = document.querySelector("#link_picture_uploader");
$linkPictureUploader.addEventListener("change", (e) => {
  const [file] = $linkPictureUploader.files;
  const fileReader = new FileReader();
  fileReader.onload = () => {
    if (fileReader.error) {
      console.warn(fileReader.error);
      window.alert("图片上传失败");
      return;
    }
    linkPicture = fileReader.result;
  };
  fileReader.readAsDataURL(file);
});
// 链接地址
let linkUrl = "";
const $linkUrl = document.querySelector("#link_modal .link-url");
$linkUrl.addEventListener("change", (e) => {
  linkUrl = e.target.value;
});

// 小程序
// 小程序弹窗
const $insertWeappBtn = document.querySelector(".header .module-item.weapp");
const weappModal = new Modal({ el: "#weapp_modal" });
$insertWeappBtn.addEventListener("click", () => {
  weappModal.show();
});
const handleResetWeappModal = () => {
  weappTitle = "";
  $weappTitle.value = "";
  weappPicture = "";
  $weappPictureUploader.value = "";
};
// 插入小程序tabs
const $weappTabs = document.querySelector("#weapp_modal .tabs");
const weappModalTabs = new Tabs({
  el: $weappTabs,
  activated: "text",
});
weappModal.on("save", () => {
  const activeName = weappModalTabs.activeName;
  if (!weappName) {
    window.alert("小程序名称不可为空");
    return;
  }
  if (!weappAppID) {
    window.alert("小程序AppID不可为空");
    return;
  }
  if (!weappPath) {
    window.alert("小程序页面路径不可为空");
    return;
  }
  if (activeName === "text") {
    if (!weappTitle) {
      window.alert("文字标题不可为空");
      return;
    }
    let { state } = editor;
    let weappMark = state.schema.text(weappTitle, [
      state.schema.marks.link.create({
        href: "",
        HTMLAttributes: {
          class: "weapp_text_link",
          "data-miniprogram-nickname": weappName,
          "data-miniprogram-appid": weappAppID,
          "data-miniprogram-path": weappPath,
          "data-miniprogram-type": "text",
          "data-miniprogram-servicetype": "",
          target: "",
        },
      }),
    ]);
    const tr = state.tr.insert(state.selection.from, weappMark);
    editor.view.dispatch(tr);
  }
  if (activeName === "picture") {
    if (!weappPicture) {
      window.alert("请先选择小程序图片");
      return;
    }
    editor
      .chain()
      .focus()
      .setImageLink({
        href: "",
        src: weappPicture,
        HTMLAttributes: {
          class: "weapp_image_link",
          "data-miniprogram-nickname": weappName,
          "data-miniprogram-appid": weappAppID,
          "data-miniprogram-path": weappPath,
          "data-miniprogram-type": "image",
          "data-miniprogram-servicetype": "",
          target: "",
        },
      })
      .enter()
      .run();
  }
  weappModal.hide();
  handleResetWeappModal();
  console.log(editor.getHTML());
});
weappModal.on("close", () => {
  weappModalTabs.tabChange("text");
  handleResetWeappModal();
});

// 小程序标题
let weappTitle = "";
const $weappTitle = document.querySelector("#weapp_modal .weapp-title");
$weappTitle.addEventListener("change", (e) => {
  weappTitle = e.target.value;
});
// 小程序图片
let weappPicture = "";
const $weappPictureUploader = document.querySelector("#weapp_picture_uploader");
$weappPictureUploader.addEventListener("change", (e) => {
  const [file] = $weappPictureUploader.files;
  const fileReader = new FileReader();
  fileReader.onload = () => {
    if (fileReader.error) {
      console.warn(fileReader.error);
      window.alert("图片上传失败");
      return;
    }
    weappPicture = fileReader.result;
  };
  fileReader.readAsDataURL(file);
});
// 小程序名称
let weappName = "";
const $weappName = document.querySelector("#weapp_modal .weapp-name");
$weappName.addEventListener("change", (e) => {
  weappName = e.target.value;
});
// 小程序AppID
let weappAppID = "";
const $weappAppID = document.querySelector("#weapp_modal .weapp-appid");
$weappAppID.addEventListener("change", (e) => {
  weappAppID = e.target.value;
});
// 小程序页面路径
let weappPath = "";
const $weappPath = document.querySelector("#weapp_modal .weapp-path");
$weappPath.addEventListener("change", (e) => {
  weappPath = e.target.value;
});

// 字数统计
const $wordCount = document.querySelector(".word-count");
editor.on("update", () => {
  const wordCount = editor.getText().length;
  $wordCount.innerText = wordCount;
  schedulePersistEditorContent();
});
persistEditorContentNow();

// 一键复制
const $btn_copy = document.querySelector(".btn-copy");
const copyClipboard = new Clipboard($btn_copy);
copyClipboard.on("success", function (e) {
  showToast("复制成功", "success");
  e.clearSelection(); // 清除默认选中复制内容
});
copyClipboard.on("error", function (e) {
  showToast("浏览器不支持按钮复制，请手动 Ctrl+C", "error");
  console.warn(e);
});

// 保存模板
const $btnSaveTemplate = document.querySelector(".btn-save-template");
$btnSaveTemplate?.addEventListener("click", () => {
  const html = String(editor.getHTML() || "").trim();
  if (!html || html === "<p></p>") {
    showToast("当前编辑区为空，无法保存模板", "error");
    return;
  }

  const plainText = String(editor.getText() || "").replace(/\s+/g, " ").trim();
  const title =
    plainText.slice(0, 36) || `模板 ${new Date().toLocaleString()}`;

  window.dispatchEvent(
    new CustomEvent(RESOURCE_SAVE_TEMPLATE_EVENT, {
      detail: {
        html,
        title,
        type: "template",
        summary: plainText.slice(0, 120),
      },
    })
  );
});

