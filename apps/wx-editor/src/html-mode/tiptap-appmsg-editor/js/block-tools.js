import { Fragment } from "@tiptap/pm/model";
import editor from "./editor.js";

const GROUP_FLAG_KEY = "--wx-group";
const GROUP_NAME_KEY = "--wx-group-name";
const GROUP_COLLAPSED_KEY = "--wx-group-collapsed";
const DEFAULT_GROUP_NAME_PREFIX = "组合块";
const FINE_MODE_GUARD_STORAGE_KEY = "wx-editor:fine-block-mode-guard";
const FINE_MODE_STRUCTURE_GUARD_STORAGE_KEY =
  "wx-editor:fine-block-structure-guard";
const MIN_SECTION_WIDTH = 160;
const ADVANCED_MODE_EVENT = "wx-editor:advanced-block-tools-toggle";
const ADVANCED_MODE_FLAG_KEY = "__WX_EDITOR_ADVANCED_BLOCK_TOOLS__";
const RESOURCE_UPLOAD_REQUEST_EVENT = "wx-editor:resource-upload-request";

const editorElement = editor.options.element;
const editorRoot = editor.view?.dom;

if (!editorElement || !editorRoot) {
  console.warn("[block-tools] editor root not found");
} else {
  const selectedIndexes = new Set();
  let anchorIndex = null;
  let dragState = null;
  let dropIndex = null;
  let dropAxis = "y";
  let lassoState = null;
  let resizeState = null;
  let advancedEnabled = window[ADVANCED_MODE_FLAG_KEY] === true;
  let fineModeEnabled = false;
  let fineSelectionPath = null;
  let fineSelectionDom = null;
  let fineParentGroupDom = null;
  let groupDropTargetIndex = null;
  let lastContextMenuPayload = null;

  const groupButton = document.querySelector("#toolbar .block-group-trigger");
  const ungroupButton = document.querySelector(
    "#toolbar .block-ungroup-trigger"
  );
  const groupNameButton = document.querySelector(
    "#toolbar .block-group-name-trigger"
  );
  const groupCollapseButton = document.querySelector(
    "#toolbar .block-group-collapse-trigger"
  );
  const fineModeButton = document.querySelector(
    "#toolbar .block-fine-mode-trigger"
  );
  const moveUpButton = document.querySelector("#toolbar .block-move-up-trigger");
  const moveDownButton = document.querySelector(
    "#toolbar .block-move-down-trigger"
  );
  const alignLeftButton = document.querySelector(
    "#toolbar .block-align-left-trigger"
  );
  const alignCenterButton = document.querySelector(
    "#toolbar .block-align-center-trigger"
  );
  const alignRightButton = document.querySelector(
    "#toolbar .block-align-right-trigger"
  );
  const distributeVerticalButton = document.querySelector(
    "#toolbar .block-distribute-vertical-trigger"
  );
  const equalWidthButton = document.querySelector(
    "#toolbar .block-equal-width-trigger"
  );
  const resetLayoutButton = document.querySelector(
    "#toolbar .block-reset-layout-trigger"
  );
  const duplicateButton = document.querySelector(
    "#toolbar .block-duplicate-trigger"
  );
  const deleteButton = document.querySelector("#toolbar .block-delete-trigger");
  const blockToolsGroup = document.querySelector("#toolbar .block-tools-group");
  let selectionCountBadge = null;
  let shortcutHint = null;

  const selectionLayer = document.createElement("div");
  selectionLayer.className = "block-selection-layer";
  selectionLayer.style.display = "none";

  const selectionMoveHandle = document.createElement("button");
  selectionMoveHandle.type = "button";
  selectionMoveHandle.className = "block-selection-move-handle";
  selectionMoveHandle.setAttribute("aria-label", "拖拽排序");
  selectionMoveHandle.setAttribute("title", "拖拽排序");
  selectionMoveHandle.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6H16"/><path d="M8 12H16"/><path d="M8 18H16"/></svg>';
  selectionMoveHandle.style.display = "none";
  selectionLayer.appendChild(selectionMoveHandle);

  const resizeHandle = document.createElement("div");
  resizeHandle.className = "block-selection-resize-handle";
  selectionLayer.appendChild(resizeHandle);

  const dropIndicator = document.createElement("div");
  dropIndicator.className = "block-drop-indicator";
  dropIndicator.style.display = "none";

  const lassoBox = document.createElement("div");
  lassoBox.className = "block-lasso-box";
  lassoBox.style.display = "none";

  const fineSelectionLayer = document.createElement("div");
  fineSelectionLayer.className = "block-fine-selection-layer";
  fineSelectionLayer.style.display = "none";

  const fineParentGroupLayer = document.createElement("div");
  fineParentGroupLayer.className = "block-fine-parent-group-layer";
  fineParentGroupLayer.style.display = "none";

  const groupDropTargetLayer = document.createElement("div");
  groupDropTargetLayer.className = "block-group-drop-target-layer";
  groupDropTargetLayer.style.display = "none";

  const fineSelectionMoveHandle = document.createElement("button");
  fineSelectionMoveHandle.type = "button";
  fineSelectionMoveHandle.className = "block-fine-selection-move-handle";
  fineSelectionMoveHandle.setAttribute("aria-label", "拖拽排序");
  fineSelectionMoveHandle.setAttribute("title", "拖拽排序");
  fineSelectionMoveHandle.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6H16"/><path d="M8 12H16"/><path d="M8 18H16"/></svg>';
  fineSelectionMoveHandle.style.display = "none";
  fineSelectionLayer.appendChild(fineSelectionMoveHandle);

  const selectionContextMenu = document.createElement("div");
  selectionContextMenu.className = "wx-block-context-menu";
  selectionContextMenu.style.display = "none";
  selectionContextMenu.innerHTML = `
    <button type="button" class="wx-block-context-menu-item" data-action="upload-resource">
      <span class="wx-block-context-menu-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M12 4v10M8 8l4-4 4 4M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"></path></svg>
      </span>
      <span class="wx-block-context-menu-label">上传到资源库</span>
    </button>
  `;

  editorElement.appendChild(selectionLayer);
  editorElement.appendChild(dropIndicator);
  editorElement.appendChild(lassoBox);
  editorElement.appendChild(fineParentGroupLayer);
  editorElement.appendChild(groupDropTargetLayer);
  editorElement.appendChild(fineSelectionLayer);
  document.body.appendChild(selectionContextMenu);

  function ensureToolsMeta() {
    if (!blockToolsGroup || selectionCountBadge || shortcutHint) return;
    const meta = document.createElement("div");
    meta.className = "block-tools-meta";

    selectionCountBadge = document.createElement("span");
    selectionCountBadge.className = "block-selection-count";
    selectionCountBadge.textContent = "已选 0";

    shortcutHint = document.createElement("span");
    shortcutHint.className = "block-shortcut-hint";
    shortcutHint.textContent = "Alt+拖拽框选";

    meta.appendChild(selectionCountBadge);
    meta.appendChild(shortcutHint);
    blockToolsGroup.appendChild(meta);
  }

  function setButtonsDisabled(disabled) {
    if (moveUpButton) moveUpButton.disabled = disabled;
    if (moveDownButton) moveDownButton.disabled = disabled;
    if (alignLeftButton) alignLeftButton.disabled = disabled;
    if (alignCenterButton) alignCenterButton.disabled = disabled;
    if (alignRightButton) alignRightButton.disabled = disabled;
    if (distributeVerticalButton) distributeVerticalButton.disabled = disabled;
    if (equalWidthButton) equalWidthButton.disabled = disabled;
    if (resetLayoutButton) resetLayoutButton.disabled = disabled;
    if (duplicateButton) duplicateButton.disabled = disabled;
    if (deleteButton) deleteButton.disabled = disabled;
    if (groupButton) groupButton.disabled = disabled;
    if (ungroupButton) ungroupButton.disabled = disabled;
    if (groupNameButton) groupNameButton.disabled = disabled;
    if (groupCollapseButton) groupCollapseButton.disabled = disabled;
    if (fineModeButton) fineModeButton.disabled = disabled;
  }

  function clearSelectionArtifacts() {
    getTopLevelDomBlocks().forEach((block) => {
      block.classList.remove(
        "block-selected",
        "block-drag-source",
        "block-group-drop-target"
      );
      block.removeAttribute("draggable");
    });

    selectionLayer.style.display = "none";
    selectionMoveHandle.style.display = "none";
    resizeHandle.style.display = "none";
    dropIndicator.style.display = "none";
    lassoBox.style.display = "none";
    fineParentGroupLayer.style.display = "none";
    groupDropTargetLayer.style.display = "none";
    fineSelectionLayer.style.display = "none";
    fineSelectionMoveHandle.style.display = "none";
    if (fineSelectionDom instanceof HTMLElement) {
      fineSelectionDom.removeAttribute("data-wx-fine-selected");
      fineSelectionDom = null;
    }
    if (fineParentGroupDom instanceof HTMLElement) {
      fineParentGroupDom.removeAttribute("data-wx-fine-parent-group");
      fineParentGroupDom = null;
    }
    hideSelectionContextMenu();
    groupDropTargetIndex = null;
    editorRoot.classList.remove("is-block-dragging", "is-block-resizing");
  }

  function setAdvancedEnabled(enabled) {
    advancedEnabled = !!enabled;
    window[ADVANCED_MODE_FLAG_KEY] = advancedEnabled;
    editorRoot.classList.toggle("is-block-tools-enabled", advancedEnabled);
    editorRoot.classList.toggle("is-fine-mode", advancedEnabled && fineModeEnabled);

    if (blockToolsGroup) {
      blockToolsGroup.style.display = advancedEnabled ? "flex" : "none";
    }

    if (!advancedEnabled) {
      setFineModeEnabled(false, { force: true });
      if (resizeState?.targetBlock) {
        resizeState.targetBlock.style.width = "";
        resizeState.targetBlock.style.maxWidth = "";
      }
      selectedIndexes.clear();
      anchorIndex = null;
      dragState = null;
      dropIndex = null;
      dropAxis = "y";
      lassoState = null;
      resizeState = null;
      clearSelectionArtifacts();
      applyGroupPresentation();
      setButtonsDisabled(true);
      return;
    }

    normalizeSelectionRange();
    applySelectionClasses();
    applyGroupPresentation();
    renderFineSelectionLayer();
  }

  function getTopLevelNodes() {
    const nodes = [];
    editor.state.doc.forEach((node, offset, index) => {
      nodes.push({ node, offset, index });
    });
    return nodes;
  }

  function getTopLevelDomBlocks() {
    return Array.from(editorRoot.children).filter(
      (element) => element instanceof HTMLElement
    );
  }

  function toast(message, type = "info") {
    const showToast = window.__WX_EDITOR_SHOW_TOAST__;
    if (typeof showToast === "function") {
      showToast(message, type);
    }
  }

  function hideSelectionContextMenu() {
    selectionContextMenu.style.display = "none";
    selectionContextMenu.classList.remove("is-open");
    lastContextMenuPayload = null;
  }

  function showSelectionContextMenu(clientX, clientY, payload) {
    lastContextMenuPayload = payload || null;
    selectionContextMenu.style.display = "block";
    selectionContextMenu.classList.remove("is-open");

    const menuRect = selectionContextMenu.getBoundingClientRect();
    const maxLeft = Math.max(12, window.innerWidth - menuRect.width - 12);
    const maxTop = Math.max(12, window.innerHeight - menuRect.height - 12);
    const left = Math.max(12, Math.min(maxLeft, clientX));
    const top = Math.max(12, Math.min(maxTop, clientY));

    selectionContextMenu.style.left = `${Math.round(left)}px`;
    selectionContextMenu.style.top = `${Math.round(top)}px`;

    window.requestAnimationFrame(() => {
      selectionContextMenu.classList.add("is-open");
    });
  }

  function normalizeResourceTitle(value, fallback = "选中资源") {
    const normalized = String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 40);
    return normalized || fallback;
  }

  function extractPayloadFromSelection() {
    if (fineModeEnabled) {
      const context = getFineSelectionContext();
      if (!context) return null;
      const dom = getDomByPath(context.path);
      if (!(dom instanceof HTMLElement)) return null;

      const html = dom.outerHTML || "";
      const text = String(dom.innerText || "").replace(/\s+/g, " ").trim();
      if (!html.trim()) return null;

      return {
        html,
        title: normalizeResourceTitle(text, "细粒度块资源"),
        type: text.length > 28 ? "graphic" : "title",
        summary: text.slice(0, 120),
      };
    }

    const selected = getSortedSelectedIndexes();
    if (!selected.length) return null;

    const blocks = getTopLevelDomBlocks();
    const htmlParts = [];
    let firstText = "";

    selected.forEach((index) => {
      const block = blocks[index];
      if (!(block instanceof HTMLElement)) return;
      htmlParts.push(block.outerHTML);
      if (!firstText) {
        firstText = String(block.innerText || "").replace(/\s+/g, " ").trim();
      }
    });

    const html = htmlParts.join("\n");
    if (!html.trim()) return null;

    const guessedType =
      selected.length > 1 ? "template" : firstText.length > 28 ? "graphic" : "title";

    return {
      html,
      title: normalizeResourceTitle(firstText, `选中块 ${selected[0] + 1}`),
      type: guessedType,
      summary: firstText.slice(0, 120),
    };
  }

  function getSortedSelectedIndexes() {
    return Array.from(selectedIndexes).sort((a, b) => a - b);
  }

  function isContiguous(indices) {
    if (indices.length <= 1) return true;
    for (let i = 1; i < indices.length; i += 1) {
      if (indices[i] - indices[i - 1] !== 1) {
        return false;
      }
    }
    return true;
  }

  function styleTextToMap(styleText) {
    const styleMap = new Map();
    if (!styleText) return styleMap;
    styleText
      .split(";")
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .forEach((chunk) => {
        const sep = chunk.indexOf(":");
        if (sep === -1) return;
        const key = chunk.slice(0, sep).trim().toLowerCase();
        const value = chunk.slice(sep + 1).trim();
        if (!key) return;
        styleMap.set(key, value);
      });
    return styleMap;
  }

  function styleMapToText(styleMap) {
    return Array.from(styleMap.entries())
      .map(([key, value]) => `${key}: ${value}`)
      .join("; ");
  }

  function normalizeGroupName(value) {
    const nextValue = String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 24);
    return nextValue || `${DEFAULT_GROUP_NAME_PREFIX}`;
  }

  function encodeGroupName(value) {
    return encodeURIComponent(normalizeGroupName(value));
  }

  function decodeGroupName(value) {
    if (!value) return "";
    try {
      return decodeURIComponent(value);
    } catch (error) {
      return String(value);
    }
  }

  function getNextDefaultGroupName(blocks = getTopLevelNodes()) {
    const groupCount = blocks.reduce((count, item) => {
      return count + (isGroupSectionNode(item?.node) ? 1 : 0);
    }, 0);
    return `${DEFAULT_GROUP_NAME_PREFIX} ${groupCount + 1}`;
  }

  function getGroupMeta(node, fallbackName = "") {
    if (!isGroupSectionNode(node)) return null;
    const styleMap = styleTextToMap(node.attrs?.style || "");
    const decodedName = decodeGroupName(styleMap.get(GROUP_NAME_KEY));
    const name = normalizeGroupName(decodedName || fallbackName);
    return {
      name,
      collapsed: styleMap.get(GROUP_COLLAPSED_KEY) === "1",
    };
  }

  function applyGroupPresentation() {
    const blocks = getTopLevelDomBlocks();
    const nodes = getTopLevelNodes();

    blocks.forEach((block, index) => {
      const item = nodes[index];
      const meta = getGroupMeta(item?.node, `${DEFAULT_GROUP_NAME_PREFIX} ${index + 1}`);
      if (!meta) {
        block.removeAttribute("data-wx-group");
        block.removeAttribute("data-wx-group-name");
        block.removeAttribute("data-wx-group-collapsed");
        return;
      }

      block.setAttribute("data-wx-group", "1");
      block.setAttribute("data-wx-group-name", meta.name);
      block.setAttribute(
        "data-wx-group-collapsed",
        meta.collapsed ? "1" : "0"
      );
    });
  }

  function getNodeByPath(path, rootNode = editor.state.doc) {
    if (!Array.isArray(path) || path.length === 0) return null;
    let current = rootNode;
    for (const index of path) {
      if (
        !current ||
        typeof index !== "number" ||
        index < 0 ||
        index >= current.childCount
      ) {
        return null;
      }
      current = current.child(index);
    }
    return current;
  }

  function replaceNodeAtPath(rootNode, path, nextNode) {
    if (!rootNode || !Array.isArray(path) || !path.length || !nextNode) {
      return null;
    }

    const [head, ...rest] = path;
    if (head < 0 || head >= rootNode.childCount) return null;

    const currentChild = rootNode.child(head);
    const nextChild =
      rest.length > 0
        ? replaceNodeAtPath(currentChild, rest, nextNode)
        : nextNode;

    if (!nextChild) return null;
    if (nextChild === currentChild) return rootNode;

    const nextContent = rootNode.content.replaceChild(head, nextChild);
    return rootNode.copy(nextContent);
  }

  function getDomByPath(path) {
    if (!Array.isArray(path) || !path.length) return null;
    let current = editorRoot;

    for (const index of path) {
      if (!(current instanceof HTMLElement) || !current.children[index]) {
        return null;
      }
      current = current.children[index];
    }

    return current instanceof HTMLElement ? current : null;
  }

  function getNodePathFromElement(element) {
    if (!(element instanceof HTMLElement) || !editorRoot.contains(element)) {
      return null;
    }

    const path = [];
    let current = element;

    while (current && current !== editorRoot) {
      const parent = current.parentElement;
      if (!parent) return null;
      const index = Array.from(parent.children).indexOf(current);
      if (index < 0) return null;
      path.unshift(index);
      current = parent;
    }

    return current === editorRoot ? path : null;
  }

  function getSectionPathFromTarget(target) {
    if (!(target instanceof HTMLElement)) return null;
    const section = target.closest("section");
    if (!(section instanceof HTMLElement) || !editorRoot.contains(section)) {
      return null;
    }

    const path = getNodePathFromElement(section);
    const node = getNodeByPath(path);
    if (!node || node.type.name !== "section") return null;
    return path;
  }

  function expandMarginShorthand(value) {
    if (!value) return null;
    const normalized = value.trim().replace(/\s+/g, " ");
    if (!normalized || normalized.includes("(") || normalized.includes(",")) {
      return null;
    }

    const parts = normalized.split(" ").filter(Boolean);
    if (!parts.length || parts.length > 4) return null;

    if (parts.length === 1) {
      const [all] = parts;
      return { top: all, right: all, bottom: all, left: all };
    }
    if (parts.length === 2) {
      const [vertical, horizontal] = parts;
      return {
        top: vertical,
        right: horizontal,
        bottom: vertical,
        left: horizontal,
      };
    }
    if (parts.length === 3) {
      const [top, horizontal, bottom] = parts;
      return {
        top,
        right: horizontal,
        bottom,
        left: horizontal,
      };
    }

    const [top, right, bottom, left] = parts;
    return { top, right, bottom, left };
  }

  function normalizeMarginForHorizontalAlign(styleMap) {
    const marginValue = styleMap.get("margin");
    if (!marginValue) return;

    const expandedMargin = expandMarginShorthand(marginValue);
    if (!expandedMargin) return;

    styleMap.delete("margin");

    if (!styleMap.has("margin-top")) {
      styleMap.set("margin-top", expandedMargin.top);
    }
    if (!styleMap.has("margin-bottom")) {
      styleMap.set("margin-bottom", expandedMargin.bottom);
    }
  }

  function selectedNodesAreAllSections(selected, blocks = getTopLevelNodes()) {
    if (!selected.length) return false;
    return selected.every((index) => {
      const item = blocks[index];
      return !!item && item.node.type.name === "section";
    });
  }

  function isGroupSectionNode(node) {
    if (!node || node.type.name !== "section") return false;
    const styleMap = styleTextToMap(node.attrs?.style || "");
    return styleMap.get(GROUP_FLAG_KEY) === "1";
  }

  function normalizeSelectionRange() {
    const total = getTopLevelNodes().length;
    const nextIndexes = getSortedSelectedIndexes().filter(
      (index) => index >= 0 && index < total
    );

    if (nextIndexes.length !== selectedIndexes.size) {
      selectedIndexes.clear();
      nextIndexes.forEach((index) => selectedIndexes.add(index));
    }

    if (anchorIndex !== null && (anchorIndex < 0 || anchorIndex >= total)) {
      anchorIndex = nextIndexes.length ? nextIndexes[nextIndexes.length - 1] : null;
    }

    if (fineSelectionPath) {
      const node = getNodeByPath(fineSelectionPath);
      if (!node || node.type.name !== "section") {
        fineSelectionPath = null;
      }
    }
  }

  function getFineSelectedNode() {
    if (!fineModeEnabled || !fineSelectionPath) return null;
    const node = getNodeByPath(fineSelectionPath);
    if (!node || node.type.name !== "section") return null;
    return node;
  }

  function getFineSelectionContext() {
    if (!fineModeEnabled || !Array.isArray(fineSelectionPath)) return null;
    if (fineSelectionPath.length <= 1) return null;

    const node = getFineSelectedNode();
    if (!node) return null;

    const parentPath = fineSelectionPath.slice(0, -1);
    const indexInParent = fineSelectionPath[fineSelectionPath.length - 1];
    const parentNode = getNodeByPath(parentPath);

    if (
      !parentNode ||
      typeof indexInParent !== "number" ||
      indexInParent < 0 ||
      indexInParent >= parentNode.childCount
    ) {
      return null;
    }

    return {
      path: [...fineSelectionPath],
      node,
      parentPath,
      parentNode,
      indexInParent,
    };
  }

  function getNearestParentGroupPath(path) {
    if (!Array.isArray(path) || path.length <= 1) return null;

    for (let depth = path.length - 1; depth >= 1; depth -= 1) {
      const candidatePath = path.slice(0, depth);
      const candidateNode = getNodeByPath(candidatePath);
      if (isGroupSectionNode(candidateNode)) {
        return candidatePath;
      }
    }

    return null;
  }

  function clearFineParentGroupHighlight() {
    fineParentGroupLayer.style.display = "none";
    if (fineParentGroupDom instanceof HTMLElement) {
      fineParentGroupDom.removeAttribute("data-wx-fine-parent-group");
      fineParentGroupDom = null;
    }
  }

  function renderFineParentGroupLayer() {
    if (!advancedEnabled || !fineModeEnabled || !fineSelectionPath) {
      clearFineParentGroupHighlight();
      return;
    }

    const parentGroupPath = getNearestParentGroupPath(fineSelectionPath);
    if (!parentGroupPath) {
      clearFineParentGroupHighlight();
      return;
    }

    const parentGroupElement = getDomByPath(parentGroupPath);
    if (!(parentGroupElement instanceof HTMLElement)) {
      clearFineParentGroupHighlight();
      return;
    }

    if (
      fineParentGroupDom instanceof HTMLElement &&
      fineParentGroupDom !== parentGroupElement
    ) {
      fineParentGroupDom.removeAttribute("data-wx-fine-parent-group");
    }
    fineParentGroupDom = parentGroupElement;
    fineParentGroupDom.setAttribute("data-wx-fine-parent-group", "1");

    const editorRect = editorElement.getBoundingClientRect();
    const parentRect = parentGroupElement.getBoundingClientRect();
    fineParentGroupLayer.style.display = "block";
    fineParentGroupLayer.style.left = `${parentRect.left - editorRect.left}px`;
    fineParentGroupLayer.style.top = `${parentRect.top - editorRect.top}px`;
    fineParentGroupLayer.style.width = `${Math.max(1, parentRect.width)}px`;
    fineParentGroupLayer.style.height = `${Math.max(1, parentRect.height)}px`;
  }

  function renderFineSelectionLayer() {
    if (!advancedEnabled || !fineModeEnabled || !fineSelectionPath) {
      fineSelectionLayer.style.display = "none";
      fineSelectionMoveHandle.style.display = "none";
      clearFineParentGroupHighlight();
      if (fineSelectionDom instanceof HTMLElement) {
        fineSelectionDom.removeAttribute("data-wx-fine-selected");
        fineSelectionDom = null;
      }
      return;
    }

    const node = getFineSelectedNode();
    const target = getDomByPath(fineSelectionPath);
    if (!node || !target) {
      fineSelectionLayer.style.display = "none";
      fineSelectionMoveHandle.style.display = "none";
      clearFineParentGroupHighlight();
      if (fineSelectionDom instanceof HTMLElement) {
        fineSelectionDom.removeAttribute("data-wx-fine-selected");
        fineSelectionDom = null;
      }
      return;
    }

    if (fineSelectionDom instanceof HTMLElement && fineSelectionDom !== target) {
      fineSelectionDom.removeAttribute("data-wx-fine-selected");
    }

    fineSelectionDom = target;
    fineSelectionDom.setAttribute("data-wx-fine-selected", "1");

    const editorRect = editorElement.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();

    fineSelectionLayer.style.display = "block";
    fineSelectionLayer.style.left = `${targetRect.left - editorRect.left}px`;
    fineSelectionLayer.style.top = `${targetRect.top - editorRect.top}px`;
    fineSelectionLayer.style.width = `${Math.max(1, targetRect.width)}px`;
    fineSelectionLayer.style.height = `${Math.max(1, targetRect.height)}px`;
    fineSelectionMoveHandle.style.display = "flex";
    renderFineParentGroupLayer();
  }

  function setFineSelectedPath(path) {
    if (!fineModeEnabled) {
      fineSelectionPath = null;
      renderFineSelectionLayer();
      return;
    }

    if (!Array.isArray(path) || !path.length) {
      fineSelectionPath = null;
      renderFineSelectionLayer();
      syncActionButtons();
      return;
    }

    const node = getNodeByPath(path);
    if (!node || node.type.name !== "section") {
      fineSelectionPath = null;
      renderFineSelectionLayer();
      syncActionButtons();
      return;
    }

    fineSelectionPath = [...path];
    renderFineSelectionLayer();
    syncActionButtons();
  }

  function ensureFineModeGuard() {
    if (typeof window === "undefined") return true;

    const checked = window.localStorage.getItem(FINE_MODE_GUARD_STORAGE_KEY);
    if (checked === "1") return true;

    const accepted = window.confirm(
      "细粒度模式将允许修改非顶层区块样式，可能破坏模板结构。风险保护已启用：禁用拖拽与组合，结构移动/复制需二次确认。确认开启？"
    );

    if (accepted) {
      window.localStorage.setItem(FINE_MODE_GUARD_STORAGE_KEY, "1");
    }

    return accepted;
  }

  function ensureFineStructureGuard(actionLabel = "该结构操作") {
    if (typeof window === "undefined") return true;

    const checked = window.localStorage.getItem(
      FINE_MODE_STRUCTURE_GUARD_STORAGE_KEY
    );
    if (checked === "1") return true;

    const accepted = window.confirm(
      `${actionLabel} 会修改模板内部层级结构，存在破版风险。确认继续并记住该确认？`
    );

    if (accepted) {
      window.localStorage.setItem(FINE_MODE_STRUCTURE_GUARD_STORAGE_KEY, "1");
    }

    return accepted;
  }

  function setFineModeEnabled(enabled, options = {}) {
    const nextEnabled = !!enabled;
    const force = !!options.force;

    if (nextEnabled && !advancedEnabled) return false;
    if (nextEnabled === fineModeEnabled) return true;

    if (nextEnabled && !force && !ensureFineModeGuard()) {
      return false;
    }

    fineModeEnabled = nextEnabled;
    editorRoot.classList.toggle("is-fine-mode", fineModeEnabled);

    if (!fineModeEnabled) {
      setFineSelectedPath(null);
      if (fineModeButton) {
        fineModeButton.classList.remove("is-active", "is-fine-mode-enabled");
      }
      syncActionButtons();
      return true;
    }

    selectedIndexes.clear();
    anchorIndex = null;
    dragState = null;
    dropIndex = null;
    dropAxis = "y";
    lassoState = null;
    if (resizeState?.targetBlock) {
      resizeState.targetBlock.style.width = "";
      resizeState.targetBlock.style.maxWidth = "";
    }
    resizeState = null;
    clearDragState();
    setFineSelectedPath(null);
    applySelectionClasses();
    syncActionButtons();
    return true;
  }

  function syncSelectionMeta(selected) {
    if (!selectionCountBadge || !shortcutHint) return;
    if (!advancedEnabled) {
      selectionCountBadge.textContent = "已选 0";
      selectionCountBadge.classList.remove("is-active");
      shortcutHint.textContent = "高阶功能已关闭";
      return;
    }

    if (fineModeEnabled) {
      const hasFineSelection = !!getFineSelectedNode();
      selectionCountBadge.textContent = hasFineSelection ? "细选 1" : "细选 0";
      selectionCountBadge.classList.toggle("is-active", hasFineSelection);
      if (!hasFineSelection) {
        shortcutHint.textContent =
          "细粒度模式：Alt+点击非顶层区块";
      } else {
        shortcutHint.textContent =
          "拖入块中间自动组合，拖入边缘排序，Alt+↑/↓移动";
      }
      return;
    }

    const count = selected.length;
    const hasSelection = count > 0;

    selectionCountBadge.textContent = `已选 ${count}`;
    selectionCountBadge.classList.toggle("is-active", hasSelection);

    if (!hasSelection) {
      shortcutHint.textContent = "Alt+拖拽框选";
      return;
    }

    if (count === 1) {
      shortcutHint.textContent =
        "拖入块中间自动组合，拖入边缘排序，Alt+↑/↓移动";
      return;
    }

    shortcutHint.textContent = "Alt+W等宽，Alt+0重置，Ctrl/Cmd+G组合";
  }

  function syncActionButtons() {
    if (!advancedEnabled) {
      setButtonsDisabled(true);
      syncSelectionMeta([]);
      return;
    }

    const selected = getSortedSelectedIndexes();
    const blocks = getTopLevelNodes();
    const total = blocks.length;
    const fineNode = getFineSelectedNode();
    const fineContext = getFineSelectionContext();
    const hasFineSelection = !!fineNode;
    const hasSelection = selected.length > 0;
    const minSelected = hasSelection ? selected[0] : -1;
    const maxSelected = hasSelection ? selected[selected.length - 1] : -1;
    const canGroup =
      !fineModeEnabled && selected.length >= 2 && isContiguous(selected);
    const canUngroup =
      !fineModeEnabled &&
      selected.length === 1 &&
      !!blocks[selected[0]] &&
      isGroupSectionNode(blocks[selected[0]].node);
    const canAlignBlocks = fineModeEnabled
      ? hasFineSelection
      : selectedNodesAreAllSections(selected, blocks);
    const canDistributeVertically =
      !fineModeEnabled &&
      canAlignBlocks &&
      selected.length >= 3 &&
      isContiguous(selected);
    const canEqualWidth = fineModeEnabled
      ? hasFineSelection
      : canAlignBlocks && selected.length >= 2;
    const canResetLayout = canAlignBlocks;
    const canFineMoveUp =
      !!fineContext && fineContext.indexInParent > 0;
    const canFineMoveDown =
      !!fineContext &&
      fineContext.indexInParent < fineContext.parentNode.childCount - 1;
    const canMoveUp = fineModeEnabled
      ? canFineMoveUp
      : hasSelection && minSelected > 0;
    const canMoveDown = fineModeEnabled
      ? canFineMoveDown
      : hasSelection && maxSelected < total - 1;
    const canDuplicate = fineModeEnabled ? !!fineContext : hasSelection;
    const canDelete = !fineModeEnabled && hasSelection;
    const canRenameGroup = canUngroup;
    const canToggleGroupCollapse = canUngroup;
    const selectedGroupMeta = canUngroup
      ? getGroupMeta(
          blocks[selected[0]]?.node,
          `${DEFAULT_GROUP_NAME_PREFIX} ${selected[0] + 1}`
        )
      : null;

    if (moveUpButton) {
      moveUpButton.disabled = !canMoveUp;
    }
    if (moveDownButton) {
      moveDownButton.disabled = !canMoveDown;
    }
    if (alignLeftButton) {
      alignLeftButton.disabled = !canAlignBlocks;
    }
    if (alignCenterButton) {
      alignCenterButton.disabled = !canAlignBlocks;
    }
    if (alignRightButton) {
      alignRightButton.disabled = !canAlignBlocks;
    }
    if (distributeVerticalButton) {
      distributeVerticalButton.disabled = !canDistributeVertically;
    }
    if (equalWidthButton) {
      equalWidthButton.disabled = !canEqualWidth;
    }
    if (resetLayoutButton) {
      resetLayoutButton.disabled = !canResetLayout;
    }
    if (duplicateButton) {
      duplicateButton.disabled = !canDuplicate;
    }
    if (deleteButton) {
      deleteButton.disabled = !canDelete;
    }

    if (groupButton) {
      groupButton.disabled = !canGroup;
    }
    if (ungroupButton) {
      ungroupButton.disabled = !canUngroup;
    }
    if (groupNameButton) {
      groupNameButton.disabled = !canRenameGroup;
    }
    if (groupCollapseButton) {
      groupCollapseButton.disabled = !canToggleGroupCollapse;
      groupCollapseButton.classList.toggle(
        "is-active",
        !!selectedGroupMeta?.collapsed
      );
    }
    if (fineModeButton) {
      fineModeButton.disabled = false;
      fineModeButton.classList.toggle("is-active", fineModeEnabled);
      fineModeButton.classList.toggle("is-fine-mode-enabled", fineModeEnabled);
    }

    syncSelectionMeta(selected);
  }

  function renderSelectionLayer() {
    if (!advancedEnabled || fineModeEnabled) {
      selectionLayer.style.display = "none";
      selectionMoveHandle.style.display = "none";
      resizeHandle.style.display = "none";
      return;
    }

    const selected = getSortedSelectedIndexes();
    if (!selected.length) {
      selectionLayer.style.display = "none";
      selectionMoveHandle.style.display = "none";
      resizeHandle.style.display = "none";
      return;
    }

    const blocks = getTopLevelDomBlocks();
    const selectedBlocks = selected.map((index) => blocks[index]).filter(Boolean);
    if (!selectedBlocks.length) {
      selectionLayer.style.display = "none";
      selectionMoveHandle.style.display = "none";
      resizeHandle.style.display = "none";
      return;
    }

    const editorRect = editorElement.getBoundingClientRect();
    let left = Number.POSITIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;

    selectedBlocks.forEach((block) => {
      const rect = block.getBoundingClientRect();
      left = Math.min(left, rect.left);
      top = Math.min(top, rect.top);
      right = Math.max(right, rect.right);
      bottom = Math.max(bottom, rect.bottom);
    });

    selectionLayer.style.display = "block";
    selectionLayer.style.left = `${left - editorRect.left}px`;
    selectionLayer.style.top = `${top - editorRect.top}px`;
    selectionLayer.style.width = `${Math.max(1, right - left)}px`;
    selectionLayer.style.height = `${Math.max(1, bottom - top)}px`;
    selectionMoveHandle.style.display = "flex";

    const nodes = getTopLevelNodes();
    const canResize =
      !fineModeEnabled &&
      selected.length === 1 &&
      !!nodes[selected[0]] &&
      nodes[selected[0]].node.type.name === "section";
    resizeHandle.style.display = canResize ? "block" : "none";
  }

  function applySelectionClasses() {
    if (!advancedEnabled) {
      clearSelectionArtifacts();
      applyGroupPresentation();
      renderFineSelectionLayer();
      syncActionButtons();
      return;
    }

    const selected = getSortedSelectedIndexes();
    const blocks = getTopLevelDomBlocks();

    blocks.forEach((block, index) => {
      const active = selectedIndexes.has(index);
      block.classList.toggle("block-selected", active);
      if (active && !fineModeEnabled) {
        block.setAttribute("draggable", "true");
      } else {
        block.removeAttribute("draggable");
        block.classList.remove("block-drag-source");
      }
    });

    renderSelectionLayer();
    applyGroupPresentation();
    renderFineSelectionLayer();
    syncActionButtons();
  }

  function setSelected(indexes, options = {}) {
    const total = getTopLevelNodes().length;
    const unique = Array.from(new Set(indexes))
      .filter((index) => index >= 0 && index < total)
      .sort((a, b) => a - b);

    selectedIndexes.clear();
    unique.forEach((index) => selectedIndexes.add(index));

    if (typeof options.anchorIndex === "number") {
      anchorIndex = options.anchorIndex;
    } else if (!unique.length) {
      anchorIndex = null;
    } else {
      anchorIndex = unique[unique.length - 1];
    }

    applySelectionClasses();
  }

  function replaceTopLevelContent(nextNodes, nextSelected = []) {
    if (!nextNodes.length) return;

    const tr = editor.state.tr.replaceWith(
      0,
      editor.state.doc.content.size,
      Fragment.fromArray(nextNodes)
    );
    editor.view.dispatch(tr);

    window.requestAnimationFrame(() => {
      setSelected(nextSelected, {
        anchorIndex: nextSelected.length ? nextSelected[nextSelected.length - 1] : null,
      });
    });
  }

  function updateSectionsStyleBatch(styleUpdaters, nextSelected = []) {
    if (!styleUpdaters || styleUpdaters.size === 0) return;

    const blocks = getTopLevelNodes();
    let hasChanges = false;

    const nextNodes = blocks.map((item, index) => {
      const styleUpdater = styleUpdaters.get(index);
      if (!styleUpdater || item.node.type.name !== "section") {
        return item.node;
      }

      const styleMap = styleTextToMap(item.node.attrs?.style || "");
      const prevStyle = styleMapToText(styleMap);
      styleUpdater(styleMap);
      const nextStyle = styleMapToText(styleMap);

      if (nextStyle === prevStyle) {
        return item.node;
      }

      hasChanges = true;
      return item.node.type.create(
        { ...item.node.attrs, style: nextStyle || null },
        item.node.content,
        item.node.marks
      );
    });

    if (!hasChanges) return;
    replaceTopLevelContent(nextNodes, nextSelected);
  }

  function updateSectionStyle(index, styleUpdater) {
    const styleUpdaters = new Map();
    styleUpdaters.set(index, styleUpdater);
    updateSectionsStyleBatch(styleUpdaters, [index]);
  }

  function updateSectionStyleByPath(path, styleUpdater) {
    const targetNode = getNodeByPath(path);
    if (!targetNode || targetNode.type.name !== "section") return;

    const styleMap = styleTextToMap(targetNode.attrs?.style || "");
    const prevStyle = styleMapToText(styleMap);
    styleUpdater(styleMap);
    const nextStyle = styleMapToText(styleMap);
    if (nextStyle === prevStyle) return;

    const nextNode = targetNode.type.create(
      { ...targetNode.attrs, style: nextStyle || null },
      targetNode.content,
      targetNode.marks
    );

    const nextDoc = replaceNodeAtPath(editor.state.doc, path, nextNode);
    if (!nextDoc) return;

    const nextTopLevelNodes = [];
    nextDoc.forEach((node) => nextTopLevelNodes.push(node));
    const keepSelected = getSortedSelectedIndexes();
    replaceTopLevelContent(nextTopLevelNodes, keepSelected);

    window.requestAnimationFrame(() => {
      if (fineModeEnabled) {
        setFineSelectedPath(path);
      }
    });
  }

  function cloneTopLevelNode(node) {
    return node.type.create(node.attrs, node.content, node.marks);
  }

  function alignSelectedBlocks(alignType) {
    if (fineModeEnabled) {
      const path = fineSelectionPath;
      if (!path || path.length <= 1) return;
      updateSectionStyleByPath(path, (styleMap) => {
        normalizeMarginForHorizontalAlign(styleMap);
        if (alignType === "left") {
          styleMap.set("margin-left", "0px");
          styleMap.set("margin-right", "auto");
          return;
        }
        if (alignType === "center") {
          styleMap.set("margin-left", "auto");
          styleMap.set("margin-right", "auto");
          return;
        }
        if (alignType === "right") {
          styleMap.set("margin-left", "auto");
          styleMap.set("margin-right", "0px");
        }
      });
      return;
    }

    const selected = getSortedSelectedIndexes();
    if (!selected.length) return;

    const blocks = getTopLevelNodes();
    if (!selectedNodesAreAllSections(selected, blocks)) return;

    const styleUpdaters = new Map();
    selected.forEach((index) => {
      styleUpdaters.set(index, (styleMap) => {
        normalizeMarginForHorizontalAlign(styleMap);

        if (alignType === "left") {
          styleMap.set("margin-left", "0px");
          styleMap.set("margin-right", "auto");
          return;
        }

        if (alignType === "center") {
          styleMap.set("margin-left", "auto");
          styleMap.set("margin-right", "auto");
          return;
        }

        if (alignType === "right") {
          styleMap.set("margin-left", "auto");
          styleMap.set("margin-right", "0px");
        }
      });
    });

    updateSectionsStyleBatch(styleUpdaters, selected);
  }

  function roundTo2(value) {
    return Math.round(value * 100) / 100;
  }

  function distributeSelectedVertically() {
    if (fineModeEnabled) return;

    const selected = getSortedSelectedIndexes();
    if (selected.length < 3 || !isContiguous(selected)) return;

    const blocks = getTopLevelNodes();
    if (!selectedNodesAreAllSections(selected, blocks)) return;

    const domBlocks = getTopLevelDomBlocks();
    const selectedDomBlocks = selected.map((index) => domBlocks[index]).filter(Boolean);
    if (selectedDomBlocks.length !== selected.length) return;

    const blockRects = selectedDomBlocks.map((element) => element.getBoundingClientRect());
    const gaps = [];
    for (let i = 1; i < blockRects.length; i += 1) {
      gaps.push(blockRects[i].top - blockRects[i - 1].bottom);
    }

    const totalGap = gaps.reduce((sum, gap) => sum + gap, 0);
    const averageGap = totalGap / gaps.length;
    if (!Number.isFinite(averageGap)) return;

    const styleUpdaters = new Map();

    for (let i = 1; i < selected.length; i += 1) {
      const selectedIndex = selected[i];
      const selectedElement = selectedDomBlocks[i];
      const currentGap = gaps[i - 1];
      const delta = averageGap - currentGap;
      if (Math.abs(delta) < 0.1) continue;

      const computed = window.getComputedStyle(selectedElement);
      const currentMarginTop = Number.parseFloat(computed.marginTop);
      const safeMarginTop = Number.isFinite(currentMarginTop) ? currentMarginTop : 0;
      const nextMarginTop = roundTo2(safeMarginTop + delta);

      styleUpdaters.set(selectedIndex, (styleMap) => {
        normalizeMarginForHorizontalAlign(styleMap);
        styleMap.set("margin-top", `${nextMarginTop}px`);
      });
    }

    if (styleUpdaters.size === 0) return;
    updateSectionsStyleBatch(styleUpdaters, selected);
  }

  function equalizeSelectedWidths() {
    if (fineModeEnabled) {
      const path = fineSelectionPath;
      if (!path || path.length <= 1) return;
      const target = getDomByPath(path);
      if (!target) return;

      const parentWidth = target.parentElement
        ? target.parentElement.getBoundingClientRect().width
        : editorRoot.getBoundingClientRect().width;
      const currentWidth = target.getBoundingClientRect().width;
      const nextWidth = Math.round(
        Math.max(MIN_SECTION_WIDTH, Math.min(parentWidth, currentWidth))
      );

      updateSectionStyleByPath(path, (styleMap) => {
        styleMap.set("width", `${nextWidth}px`);
        styleMap.set("max-width", "100%");
      });
      return;
    }

    const selected = getSortedSelectedIndexes();
    if (selected.length < 2) return;

    const blocks = getTopLevelNodes();
    if (!selectedNodesAreAllSections(selected, blocks)) return;

    const domBlocks = getTopLevelDomBlocks();
    const firstBlock = domBlocks[selected[0]];
    if (!firstBlock) return;

    const rootWidth = editorRoot.getBoundingClientRect().width;
    const firstWidth = firstBlock.getBoundingClientRect().width;
    const nextWidth = Math.round(
      Math.max(MIN_SECTION_WIDTH, Math.min(rootWidth, firstWidth))
    );

    const styleUpdaters = new Map();
    selected.forEach((index) => {
      styleUpdaters.set(index, (styleMap) => {
        styleMap.set("width", `${nextWidth}px`);
        styleMap.set("max-width", "100%");
      });
    });

    updateSectionsStyleBatch(styleUpdaters, selected);
  }

  function resetSelectedLayoutStyles() {
    if (fineModeEnabled) {
      const path = fineSelectionPath;
      if (!path || path.length <= 1) return;
      updateSectionStyleByPath(path, (styleMap) => {
        styleMap.delete("width");
        styleMap.delete("max-width");
        styleMap.delete("margin-left");
        styleMap.delete("margin-right");
        styleMap.delete("margin-top");
      });
      return;
    }

    const selected = getSortedSelectedIndexes();
    if (!selected.length) return;

    const blocks = getTopLevelNodes();
    if (!selectedNodesAreAllSections(selected, blocks)) return;

    const styleUpdaters = new Map();
    selected.forEach((index) => {
      styleUpdaters.set(index, (styleMap) => {
        styleMap.delete("width");
        styleMap.delete("max-width");
        styleMap.delete("margin-left");
        styleMap.delete("margin-right");
        styleMap.delete("margin-top");
      });
    });

    updateSectionsStyleBatch(styleUpdaters, selected);
  }

  function replaceFineParentChildren(parentPath, nextChildren, nextPath) {
    const parentNode = getNodeByPath(parentPath);
    if (!parentNode || !Array.isArray(nextChildren) || !nextChildren.length) {
      return;
    }

    const nextParentNode = parentNode.type.create(
      parentNode.attrs,
      Fragment.fromArray(nextChildren),
      parentNode.marks
    );

    const nextDoc = replaceNodeAtPath(editor.state.doc, parentPath, nextParentNode);
    if (!nextDoc) return;

    const nextTopLevelNodes = [];
    nextDoc.forEach((node) => nextTopLevelNodes.push(node));
    replaceTopLevelContent(nextTopLevelNodes, []);

    window.requestAnimationFrame(() => {
      if (fineModeEnabled) {
        setFineSelectedPath(nextPath || null);
      }
    });
  }

  function reorderFineSelectedByDropIndex(targetIndex) {
    if (!fineModeEnabled) return;

    const context = getFineSelectionContext();
    if (!context) return;

    const { parentPath, parentNode, indexInParent } = context;
    const boundedTarget = Math.max(0, Math.min(parentNode.childCount, targetIndex));
    const removedBeforeDrop = indexInParent < boundedTarget ? 1 : 0;
    const insertIndex = Math.max(
      0,
      Math.min(parentNode.childCount - 1, boundedTarget - removedBeforeDrop)
    );
    if (insertIndex === indexInParent) return;

    if (!ensureFineStructureGuard("细粒度拖拽排序")) return;

    const children = [];
    parentNode.content.forEach((child) => children.push(child));
    const movingNode = children[indexInParent];
    children.splice(indexInParent, 1);
    children.splice(insertIndex, 0, movingNode);

    replaceFineParentChildren(parentPath, children, [...parentPath, insertIndex]);
  }

  function moveFineSelectedByOffset(offset) {
    if (!fineModeEnabled) return;
    if (offset !== -1 && offset !== 1) return;

    const context = getFineSelectionContext();
    if (!context) return;

    const { parentPath, parentNode, indexInParent } = context;
    const nextIndex = indexInParent + offset;
    if (nextIndex < 0 || nextIndex >= parentNode.childCount) return;

    if (!ensureFineStructureGuard("细粒度块移动")) return;

    const children = [];
    parentNode.content.forEach((child) => children.push(child));
    const temp = children[indexInParent];
    children[indexInParent] = children[nextIndex];
    children[nextIndex] = temp;

    replaceFineParentChildren(parentPath, children, [...parentPath, nextIndex]);
  }

  function duplicateFineSelectedBlock() {
    if (!fineModeEnabled) return;

    const context = getFineSelectionContext();
    if (!context) return;

    const { parentPath, parentNode, node, indexInParent } = context;
    if (!ensureFineStructureGuard("细粒度块复制")) return;

    const children = [];
    parentNode.content.forEach((child) => children.push(child));
    const copy = cloneTopLevelNode(node);
    const insertIndex = indexInParent + 1;
    children.splice(insertIndex, 0, copy);

    replaceFineParentChildren(parentPath, children, [...parentPath, insertIndex]);
  }

  function moveSelectedByOffset(offset) {
    if (fineModeEnabled) {
      moveFineSelectedByOffset(offset);
      return;
    }
    if (offset !== -1 && offset !== 1) return;

    const selected = getSortedSelectedIndexes();
    if (!selected.length) return;

    const blocks = getTopLevelNodes();
    const nodes = blocks.map((item) => item.node);
    const selectedSet = new Set(selected);

    if (offset === -1) {
      for (let i = 0; i < nodes.length; i += 1) {
        if (selectedSet.has(i) && i > 0 && !selectedSet.has(i - 1)) {
          const temp = nodes[i - 1];
          nodes[i - 1] = nodes[i];
          nodes[i] = temp;
        }
      }
    } else {
      for (let i = nodes.length - 1; i >= 0; i -= 1) {
        if (selectedSet.has(i) && i < nodes.length - 1 && !selectedSet.has(i + 1)) {
          const temp = nodes[i + 1];
          nodes[i + 1] = nodes[i];
          nodes[i] = temp;
        }
      }
    }

    const selectedNodes = new Set(selected.map((index) => blocks[index].node));
    const nextSelected = [];
    nodes.forEach((node, index) => {
      if (selectedNodes.has(node)) {
        nextSelected.push(index);
      }
    });

    const unchanged = nodes.every((node, index) => node === blocks[index].node);
    if (unchanged) return;

    replaceTopLevelContent(nodes, nextSelected);
  }

  function duplicateSelectedBlocks() {
    if (fineModeEnabled) {
      duplicateFineSelectedBlock();
      return;
    }
    const selected = getSortedSelectedIndexes();
    if (!selected.length) return;

    const selectedSet = new Set(selected);
    const blocks = getTopLevelNodes();
    const nextNodes = [];
    const duplicatedNodes = [];

    blocks.forEach((item, index) => {
      nextNodes.push(item.node);
      if (selectedSet.has(index)) {
        const copy = cloneTopLevelNode(item.node);
        nextNodes.push(copy);
        duplicatedNodes.push(copy);
      }
    });

    const duplicatedSet = new Set(duplicatedNodes);
    const nextSelected = [];
    nextNodes.forEach((node, index) => {
      if (duplicatedSet.has(node)) {
        nextSelected.push(index);
      }
    });

    replaceTopLevelContent(nextNodes, nextSelected);
  }

  function deleteSelectedBlocks() {
    if (fineModeEnabled) return;
    const selected = getSortedSelectedIndexes();
    if (!selected.length) return;

    const selectedSet = new Set(selected);
    const blocks = getTopLevelNodes();
    const nextNodes = blocks
      .filter((_, index) => !selectedSet.has(index))
      .map((item) => item.node);

    if (!nextNodes.length) {
      const paragraphType = editor.state.schema.nodes.paragraph;
      if (!paragraphType) return;
      replaceTopLevelContent([paragraphType.create()], [0]);
      return;
    }

    const fallbackIndex = Math.min(selected[0], nextNodes.length - 1);
    replaceTopLevelContent(nextNodes, [fallbackIndex]);
  }

  function reorderSelectedBlocks(targetIndex) {
    if (fineModeEnabled) return;
    const selected = getSortedSelectedIndexes();
    if (!selected.length) return;

    const blocks = getTopLevelNodes();
    const moving = selected.map((index) => blocks[index]).filter(Boolean);
    if (!moving.length) return;

    const remaining = blocks.filter((_, index) => !selectedIndexes.has(index));
    const removedBeforeDrop = selected.filter((index) => index < targetIndex).length;
    const insertIndex = Math.max(
      0,
      Math.min(remaining.length, targetIndex - removedBeforeDrop)
    );

    const reordered = [
      ...remaining.slice(0, insertIndex),
      ...moving,
      ...remaining.slice(insertIndex),
    ].map((item) => item.node);

    const unchanged = reordered.every((node, index) => node === blocks[index].node);
    if (unchanged) return;

    const nextSelected = Array.from({ length: moving.length }, (_, order) => insertIndex + order);
    replaceTopLevelContent(reordered, nextSelected);
  }

  function groupSelectedWithTarget(targetIndex) {
    if (fineModeEnabled) return;

    const selected = getSortedSelectedIndexes();
    if (!selected.length) return;
    if (selected.includes(targetIndex)) return;

    const blocks = getTopLevelNodes();
    if (targetIndex < 0 || targetIndex >= blocks.length) return;

    const sectionType = editor.state.schema.nodes.section;
    if (!sectionType) {
      window.alert("当前编辑器不支持 section 组合");
      return;
    }

    const movingNodes = selected.map((index) => blocks[index]?.node).filter(Boolean);
    if (!movingNodes.length) return;

    const selectedSet = new Set(selected);
    const remaining = blocks.filter((_, index) => !selectedSet.has(index));
    const removedBeforeTarget = selected.filter((index) => index < targetIndex).length;
    const adjustedTargetIndex = targetIndex - removedBeforeTarget;
    if (adjustedTargetIndex < 0 || adjustedTargetIndex >= remaining.length) return;

    const targetItem = remaining[adjustedTargetIndex];
    const groupChildren = [targetItem.node, ...movingNodes];
    if (groupChildren.length < 2) return;

    const defaultName = getNextDefaultGroupName(blocks);
    const groupStyleMap = new Map([
      [GROUP_FLAG_KEY, "1"],
      [GROUP_NAME_KEY, encodeGroupName(defaultName)],
      [GROUP_COLLAPSED_KEY, "0"],
    ]);
    const groupStyle = styleMapToText(groupStyleMap);
    const groupNode = sectionType.create({ style: groupStyle }, groupChildren);

    const nextNodes = [
      ...remaining.slice(0, adjustedTargetIndex).map((item) => item.node),
      groupNode,
      ...remaining.slice(adjustedTargetIndex + 1).map((item) => item.node),
    ];

    replaceTopLevelContent(nextNodes, [adjustedTargetIndex]);
  }

  function groupSelectedBlocks() {
    if (fineModeEnabled) return;
    const selected = getSortedSelectedIndexes();
    if (selected.length < 2 || !isContiguous(selected)) return;

    const blocks = getTopLevelNodes();
    const sectionType = editor.state.schema.nodes.section;
    if (!sectionType) {
      window.alert("当前编辑器不支持 section 组合");
      return;
    }

    const start = selected[0];
    const end = selected[selected.length - 1];
    const children = selected.map((index) => blocks[index]?.node).filter(Boolean);
    if (children.length < 2) return;

    const defaultName = getNextDefaultGroupName(blocks);
    const groupStyleMap = new Map([
      [GROUP_FLAG_KEY, "1"],
      [GROUP_NAME_KEY, encodeGroupName(defaultName)],
      [GROUP_COLLAPSED_KEY, "0"],
    ]);
    const groupStyle = styleMapToText(groupStyleMap);
    const groupNode = sectionType.create({ style: groupStyle }, children);

    const nextNodes = [
      ...blocks.slice(0, start).map((item) => item.node),
      groupNode,
      ...blocks.slice(end + 1).map((item) => item.node),
    ];

    replaceTopLevelContent(nextNodes, [start]);
  }

  function ungroupSelectedBlock() {
    if (fineModeEnabled) return;
    const selected = getSortedSelectedIndexes();
    if (selected.length !== 1) return;

    const blocks = getTopLevelNodes();
    const selectedItem = blocks[selected[0]];
    if (!selectedItem || !isGroupSectionNode(selectedItem.node)) return;

    const children = [];
    selectedItem.node.content.forEach((child) => {
      children.push(child);
    });
    if (!children.length) return;

    const index = selected[0];
    const nextNodes = [
      ...blocks.slice(0, index).map((item) => item.node),
      ...children,
      ...blocks.slice(index + 1).map((item) => item.node),
    ];

    const nextSelected = children.map((_, offset) => index + offset);
    replaceTopLevelContent(nextNodes, nextSelected);
  }

  function renameSelectedGroup() {
    if (fineModeEnabled) return;
    const selected = getSortedSelectedIndexes();
    if (selected.length !== 1) return;

    const blocks = getTopLevelNodes();
    const index = selected[0];
    const selectedItem = blocks[index];
    if (!selectedItem || !isGroupSectionNode(selectedItem.node)) return;

    const currentMeta = getGroupMeta(
      selectedItem.node,
      `${DEFAULT_GROUP_NAME_PREFIX} ${index + 1}`
    );
    const nextName = window.prompt(
      "请输入组合块名称（最多 24 字）",
      currentMeta?.name || `${DEFAULT_GROUP_NAME_PREFIX} ${index + 1}`
    );
    if (nextName === null) return;
    const normalizedName =
      String(nextName).trim() || `${DEFAULT_GROUP_NAME_PREFIX} ${index + 1}`;

    updateSectionStyle(index, (styleMap) => {
      styleMap.set(GROUP_FLAG_KEY, "1");
      styleMap.set(GROUP_NAME_KEY, encodeGroupName(normalizedName));
      if (!styleMap.has(GROUP_COLLAPSED_KEY)) {
        styleMap.set(GROUP_COLLAPSED_KEY, "0");
      }
    });
  }

  function toggleSelectedGroupCollapse() {
    if (fineModeEnabled) return;
    const selected = getSortedSelectedIndexes();
    if (selected.length !== 1) return;

    const blocks = getTopLevelNodes();
    const index = selected[0];
    const selectedItem = blocks[index];
    if (!selectedItem || !isGroupSectionNode(selectedItem.node)) return;

    const meta = getGroupMeta(
      selectedItem.node,
      `${DEFAULT_GROUP_NAME_PREFIX} ${index + 1}`
    );
    const nextCollapsed = meta?.collapsed ? "0" : "1";

    updateSectionStyle(index, (styleMap) => {
      styleMap.set(GROUP_FLAG_KEY, "1");
      styleMap.set(
        GROUP_NAME_KEY,
        encodeGroupName(meta?.name || `${DEFAULT_GROUP_NAME_PREFIX} ${index + 1}`)
      );
      styleMap.set(GROUP_COLLAPSED_KEY, nextCollapsed);
    });
  }

  function getTopLevelBlockElement(target) {
    if (!(target instanceof HTMLElement)) return null;
    let current = target;

    while (current && current.parentElement && current.parentElement !== editorRoot) {
      current = current.parentElement;
    }

    if (current && current.parentElement === editorRoot) {
      return current;
    }
    return null;
  }

  function getElementsPrimaryAxis(elements, parentElement) {
    if (!elements.length) return "y";

    if (parentElement instanceof HTMLElement) {
      const parentStyle = window.getComputedStyle(parentElement);
      if (parentStyle.display.includes("flex")) {
        return parentStyle.flexDirection.startsWith("row") ? "x" : "y";
      }
    }

    if (elements.length < 2) return "y";

    const firstRect = elements[0].getBoundingClientRect();
    const lastRect = elements[elements.length - 1].getBoundingClientRect();
    const firstCenterX = firstRect.left + firstRect.width / 2;
    const firstCenterY = firstRect.top + firstRect.height / 2;
    const lastCenterX = lastRect.left + lastRect.width / 2;
    const lastCenterY = lastRect.top + lastRect.height / 2;
    const spreadX = Math.abs(lastCenterX - firstCenterX);
    const spreadY = Math.abs(lastCenterY - firstCenterY);

    return spreadX > spreadY * 1.1 ? "x" : "y";
  }

  function resolveDropTargetByElements(
    elements,
    parentElement,
    clientX,
    clientY
  ) {
    if (!elements.length) {
      return { index: 0, axis: "y" };
    }

    const axis = getElementsPrimaryAxis(elements, parentElement);

    for (let index = 0; index < elements.length; index += 1) {
      const rect = elements[index].getBoundingClientRect();
      const shouldInsertBefore =
        axis === "x"
          ? clientX < rect.left + rect.width / 2
          : clientY < rect.top + rect.height / 2;
      if (shouldInsertBefore) {
        return { index, axis };
      }
    }

    return { index: elements.length, axis };
  }

  function resolveDropIndex(clientX, clientY) {
    const blocks = getTopLevelDomBlocks();
    return resolveDropTargetByElements(blocks, editorRoot, clientX, clientY);
  }

  function renderDropIndicator(index, axis = "y") {
    const blocks = getTopLevelDomBlocks();
    if (!blocks.length) {
      dropIndicator.style.display = "none";
      return;
    }

    const editorRect = editorElement.getBoundingClientRect();
    const rootRect = editorRoot.getBoundingClientRect();

    dropIndicator.style.display = "block";

    if (axis === "x") {
      const left =
        index < blocks.length
          ? blocks[index].getBoundingClientRect().left
          : blocks[blocks.length - 1].getBoundingClientRect().right;
      dropIndicator.style.left = `${left - editorRect.left}px`;
      dropIndicator.style.top = `${rootRect.top - editorRect.top}px`;
      dropIndicator.style.width = "2px";
      dropIndicator.style.height = `${Math.max(2, rootRect.height)}px`;
      dropIndicator.style.background =
        "linear-gradient(180deg, rgba(7, 193, 96, 0), #07c160, rgba(7, 193, 96, 0))";
      return;
    }

    const top =
      index < blocks.length
        ? blocks[index].getBoundingClientRect().top
        : blocks[blocks.length - 1].getBoundingClientRect().bottom;
    dropIndicator.style.left = `${rootRect.left - editorRect.left}px`;
    dropIndicator.style.top = `${top - editorRect.top}px`;
    dropIndicator.style.width = `${rootRect.width}px`;
    dropIndicator.style.height = "2px";
    dropIndicator.style.background =
      "linear-gradient(90deg, rgba(7, 193, 96, 0), #07c160, rgba(7, 193, 96, 0))";
  }

  function getTopLevelBlockAtPoint(clientX, clientY) {
    const blocks = getTopLevelDomBlocks();
    for (let index = 0; index < blocks.length; index += 1) {
      const rect = blocks[index].getBoundingClientRect();
      if (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      ) {
        return { index, element: blocks[index], rect };
      }
    }
    return null;
  }

  function isPointNearRectEdge(rect, clientX, clientY) {
    const minSize = Math.min(rect.width, rect.height);
    const edgeSize = Math.max(10, Math.min(20, minSize * 0.16));
    return (
      clientX - rect.left <= edgeSize ||
      rect.right - clientX <= edgeSize ||
      clientY - rect.top <= edgeSize ||
      rect.bottom - clientY <= edgeSize
    );
  }

  function clearGroupDropTargetPreview() {
    const blocks = getTopLevelDomBlocks();
    blocks.forEach((block) => block.classList.remove("block-group-drop-target"));
    groupDropTargetLayer.style.display = "none";
    groupDropTargetIndex = null;
  }

  function setGroupDropTargetPreview(index) {
    const blocks = getTopLevelDomBlocks();
    let targetBlock = null;
    blocks.forEach((block, blockIndex) => {
      const isTarget = blockIndex === index;
      block.classList.toggle("block-group-drop-target", isTarget);
      if (isTarget) {
        targetBlock = block;
      }
    });

    if (targetBlock instanceof HTMLElement) {
      const editorRect = editorElement.getBoundingClientRect();
      const targetRect = targetBlock.getBoundingClientRect();
      groupDropTargetLayer.style.display = "block";
      groupDropTargetLayer.style.left = `${targetRect.left - editorRect.left}px`;
      groupDropTargetLayer.style.top = `${targetRect.top - editorRect.top}px`;
      groupDropTargetLayer.style.width = `${Math.max(1, targetRect.width)}px`;
      groupDropTargetLayer.style.height = `${Math.max(1, targetRect.height)}px`;
    } else {
      groupDropTargetLayer.style.display = "none";
    }
    groupDropTargetIndex = index;
  }

  function resolveTopLevelDragIntent(clientX, clientY, selected) {
    const selectedSet = new Set(selected);
    const hoverInfo = getTopLevelBlockAtPoint(clientX, clientY);

    if (
      hoverInfo &&
      !selectedSet.has(hoverInfo.index) &&
      !isPointNearRectEdge(hoverInfo.rect, clientX, clientY)
    ) {
      return { type: "group", targetIndex: hoverInfo.index };
    }

    const sortTarget = resolveDropIndex(clientX, clientY);
    return { type: "sort", index: sortTarget.index, axis: sortTarget.axis };
  }

  function clearDragState() {
    dragState = null;
    dropIndex = null;
    dropAxis = "y";
    dropIndicator.style.display = "none";
    clearGroupDropTargetPreview();
    editorRoot.classList.remove("is-block-dragging");
    editorRoot.querySelectorAll(".block-drag-source").forEach((element) => {
      if (element instanceof HTMLElement) {
        element.classList.remove("block-drag-source");
      }
    });
  }

  function resolveFineDropIndex(parentPath, clientX, clientY) {
    const parentElement = getDomByPath(parentPath);
    if (!(parentElement instanceof HTMLElement)) {
      return { index: 0, axis: "y" };
    }

    const siblingElements = Array.from(parentElement.children).filter(
      (element) => element instanceof HTMLElement
    );
    return resolveDropTargetByElements(
      siblingElements,
      parentElement,
      clientX,
      clientY
    );
  }

  function renderFineDropIndicator(parentPath, index, axis = "y") {
    const parentElement = getDomByPath(parentPath);
    if (!(parentElement instanceof HTMLElement)) {
      dropIndicator.style.display = "none";
      return;
    }

    const siblingElements = Array.from(parentElement.children).filter(
      (element) => element instanceof HTMLElement
    );
    if (!siblingElements.length) {
      dropIndicator.style.display = "none";
      return;
    }

    const editorRect = editorElement.getBoundingClientRect();
    const parentRect = parentElement.getBoundingClientRect();

    dropIndicator.style.display = "block";

    if (axis === "x") {
      const left =
        index < siblingElements.length
          ? siblingElements[index].getBoundingClientRect().left
          : siblingElements[siblingElements.length - 1].getBoundingClientRect()
              .right;
      dropIndicator.style.left = `${left - editorRect.left}px`;
      dropIndicator.style.top = `${parentRect.top - editorRect.top}px`;
      dropIndicator.style.width = "2px";
      dropIndicator.style.height = `${Math.max(2, parentRect.height)}px`;
      dropIndicator.style.background =
        "linear-gradient(180deg, rgba(7, 193, 96, 0), #07c160, rgba(7, 193, 96, 0))";
      return;
    }

    const top =
      index < siblingElements.length
        ? siblingElements[index].getBoundingClientRect().top
        : siblingElements[siblingElements.length - 1].getBoundingClientRect()
            .bottom;
    dropIndicator.style.left = `${parentRect.left - editorRect.left}px`;
    dropIndicator.style.top = `${top - editorRect.top}px`;
    dropIndicator.style.width = `${parentRect.width}px`;
    dropIndicator.style.height = "2px";
    dropIndicator.style.background =
      "linear-gradient(90deg, rgba(7, 193, 96, 0), #07c160, rgba(7, 193, 96, 0))";
  }

  function rectIntersects(rectA, rectB) {
    return !(
      rectA.right < rectB.left ||
      rectA.left > rectB.right ||
      rectA.bottom < rectB.top ||
      rectA.top > rectB.bottom
    );
  }

  function normalizeRect(startPoint, endPoint) {
    return {
      left: Math.min(startPoint.x, endPoint.x),
      top: Math.min(startPoint.y, endPoint.y),
      right: Math.max(startPoint.x, endPoint.x),
      bottom: Math.max(startPoint.y, endPoint.y),
    };
  }

  function getPointRelativeToEditor(clientX, clientY) {
    const rect = editorElement.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  function isPointOnLayerBorder(layerElement, clientX, clientY, borderSize = 10) {
    if (!(layerElement instanceof HTMLElement)) return false;
    if (layerElement.style.display === "none") return false;

    const rect = layerElement.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      return false;
    }

    const safeBorder = Math.max(4, borderSize);
    const insideInnerArea =
      clientX > rect.left + safeBorder &&
      clientX < rect.right - safeBorder &&
      clientY > rect.top + safeBorder &&
      clientY < rect.bottom - safeBorder;

    return !insideInnerArea;
  }

  function startLassoSelection(event) {
    const startPoint = getPointRelativeToEditor(event.clientX, event.clientY);
    lassoState = { startPoint };
    lassoBox.style.display = "block";
    lassoBox.style.left = `${startPoint.x}px`;
    lassoBox.style.top = `${startPoint.y}px`;
    lassoBox.style.width = "0px";
    lassoBox.style.height = "0px";

    const onMouseMove = (moveEvent) => {
      if (!lassoState) return;
      const current = getPointRelativeToEditor(moveEvent.clientX, moveEvent.clientY);
      const boxRect = normalizeRect(lassoState.startPoint, current);

      lassoBox.style.left = `${boxRect.left}px`;
      lassoBox.style.top = `${boxRect.top}px`;
      lassoBox.style.width = `${Math.max(1, boxRect.right - boxRect.left)}px`;
      lassoBox.style.height = `${Math.max(1, boxRect.bottom - boxRect.top)}px`;

      const editorRect = editorElement.getBoundingClientRect();
      const blocks = getTopLevelDomBlocks();
      const nextSelected = [];

      blocks.forEach((block, index) => {
        const rect = block.getBoundingClientRect();
        const blockRect = {
          left: rect.left - editorRect.left,
          right: rect.right - editorRect.left,
          top: rect.top - editorRect.top,
          bottom: rect.bottom - editorRect.top,
        };
        if (rectIntersects(blockRect, boxRect)) {
          nextSelected.push(index);
        }
      });

      setSelected(nextSelected, {
        anchorIndex: nextSelected.length
          ? nextSelected[nextSelected.length - 1]
          : null,
      });
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      lassoState = null;
      lassoBox.style.display = "none";
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function startTopSelectionLayerDrag(event) {
    const selected = getSortedSelectedIndexes();
    if (!selected.length) return;

    dragState = {
      mode: "top-layer",
      selected,
    };
    dropIndex = null;
    dropAxis = "y";
    clearGroupDropTargetPreview();
    editorRoot.classList.add("is-block-dragging");

    const blocks = getTopLevelDomBlocks();
    selected.forEach((index) => {
      const block = blocks[index];
      if (block) {
        block.classList.add("block-drag-source");
      }
    });

    const onMouseMove = (moveEvent) => {
      if (!dragState || dragState.mode !== "top-layer") return;
      moveEvent.preventDefault();
      const intent = resolveTopLevelDragIntent(
        moveEvent.clientX,
        moveEvent.clientY,
        dragState.selected
      );

      if (intent.type === "group") {
        dropIndicator.style.display = "none";
        dropIndex = null;
        dropAxis = "y";
        if (groupDropTargetIndex !== intent.targetIndex) {
          setGroupDropTargetPreview(intent.targetIndex);
        }
        return;
      }

      if (groupDropTargetIndex !== null) {
        clearGroupDropTargetPreview();
      }

      if (intent.index !== dropIndex || intent.axis !== dropAxis) {
        dropIndex = intent.index;
        dropAxis = intent.axis;
        renderDropIndicator(dropIndex, dropAxis);
      }
    };

    const onMouseUp = (upEvent) => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);

      if (!dragState || dragState.mode !== "top-layer") {
        clearDragState();
        return;
      }

      const finalIntent =
        groupDropTargetIndex !== null
          ? { type: "group", targetIndex: groupDropTargetIndex }
          : dropIndex === null
          ? (() => {
              const sortTarget = resolveDropIndex(upEvent.clientX, upEvent.clientY);
              return { type: "sort", index: sortTarget.index };
            })()
          : { type: "sort", index: dropIndex };

      clearDragState();
      if (finalIntent.type === "group") {
        groupSelectedWithTarget(finalIntent.targetIndex);
      } else {
        reorderSelectedBlocks(finalIntent.index);
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function startFineSelectionLayerDrag(event) {
    const context = getFineSelectionContext();
    if (!context) return;

    dragState = {
      mode: "fine-layer",
      parentPath: [...context.parentPath],
    };
    dropIndex = null;
    dropAxis = "y";
    clearGroupDropTargetPreview();
    editorRoot.classList.add("is-block-dragging");
    if (fineSelectionDom instanceof HTMLElement) {
      fineSelectionDom.classList.add("block-drag-source");
    }

    const onMouseMove = (moveEvent) => {
      if (!dragState || dragState.mode !== "fine-layer") return;
      moveEvent.preventDefault();
      const nextDrop = resolveFineDropIndex(
        dragState.parentPath,
        moveEvent.clientX,
        moveEvent.clientY
      );
      if (nextDrop.index !== dropIndex || nextDrop.axis !== dropAxis) {
        dropIndex = nextDrop.index;
        dropAxis = nextDrop.axis;
        renderFineDropIndicator(dragState.parentPath, dropIndex, dropAxis);
      }
    };

    const onMouseUp = (upEvent) => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);

      if (!dragState || dragState.mode !== "fine-layer") {
        clearDragState();
        return;
      }

      const finalDrop =
        dropIndex === null
          ? resolveFineDropIndex(
              dragState.parentPath,
              upEvent.clientX,
              upEvent.clientY
            )
          : { index: dropIndex, axis: dropAxis };

      clearDragState();
      reorderFineSelectedByDropIndex(finalDrop.index);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function startResizeSection(event) {
    const selected = getSortedSelectedIndexes();
    if (selected.length !== 1) return;
    const index = selected[0];

    const nodes = getTopLevelNodes();
    const node = nodes[index]?.node;
    if (!node || node.type.name !== "section") return;

    const blocks = getTopLevelDomBlocks();
    const targetBlock = blocks[index];
    if (!targetBlock) return;

    const editorRect = editorRoot.getBoundingClientRect();
    const blockRect = targetBlock.getBoundingClientRect();

    resizeState = {
      index,
      startX: event.clientX,
      startWidth: blockRect.width,
      maxWidth: editorRect.width,
      targetBlock,
      previewWidth: blockRect.width,
    };

    editorRoot.classList.add("is-block-resizing");

    const onMouseMove = (moveEvent) => {
      if (!resizeState) return;
      const deltaX = moveEvent.clientX - resizeState.startX;
      const width = Math.max(
        MIN_SECTION_WIDTH,
        Math.min(resizeState.maxWidth, resizeState.startWidth + deltaX)
      );
      resizeState.previewWidth = width;
      resizeState.targetBlock.style.width = `${Math.round(width)}px`;
      resizeState.targetBlock.style.maxWidth = "100%";
      renderSelectionLayer();
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      editorRoot.classList.remove("is-block-resizing");

      if (!resizeState) return;
      const { index: resizeIndex, previewWidth } = resizeState;
      resizeState.targetBlock.style.width = "";
      resizeState.targetBlock.style.maxWidth = "";
      resizeState = null;

      updateSectionStyle(resizeIndex, (styleMap) => {
        styleMap.set("width", `${Math.round(previewWidth)}px`);
        styleMap.set("max-width", "100%");
      });
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function targetIsWithinCurrentSelection(target) {
    if (!(target instanceof HTMLElement)) return false;

    if (fineModeEnabled) {
      const context = getFineSelectionContext();
      if (!context) return false;
      const fineDom = getDomByPath(context.path);
      return fineDom instanceof HTMLElement && fineDom.contains(target);
    }

    if (!selectedIndexes.size) return false;
    const topLevelBlock = getTopLevelBlockElement(target);
    if (!(topLevelBlock instanceof HTMLElement)) return false;
    const blocks = getTopLevelDomBlocks();
    const index = blocks.indexOf(topLevelBlock);
    return index >= 0 && selectedIndexes.has(index);
  }

  function handleContextMenu(event) {
    if (!advancedEnabled) return;
    if (!targetIsWithinCurrentSelection(event.target)) {
      hideSelectionContextMenu();
      return;
    }

    const payload = extractPayloadFromSelection();
    if (!payload) {
      hideSelectionContextMenu();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    showSelectionContextMenu(event.clientX, event.clientY, payload);
  }

  function handleGlobalPointerDown(event) {
    const target = event.target instanceof Node ? event.target : null;
    if (target && selectionContextMenu.contains(target)) return;
    hideSelectionContextMenu();
  }

  function handleClick(event) {
    if (!advancedEnabled) return;

    if (fineModeEnabled) {
      if (event.altKey) {
        const sectionPath = getSectionPathFromTarget(event.target);
        if (sectionPath && sectionPath.length > 1) {
          event.preventDefault();
          event.stopPropagation();
          setFineSelectedPath(sectionPath);
          return;
        }

        setFineSelectedPath(null);
      }
      return;
    }

    const block = getTopLevelBlockElement(event.target);
    if (!block) {
      if (!event.ctrlKey && !event.metaKey && !event.shiftKey) {
        setSelected([]);
      }
      return;
    }

    const blocks = getTopLevelDomBlocks();
    const index = blocks.indexOf(block);
    if (index < 0) return;

    if (event.shiftKey && anchorIndex !== null) {
      const start = Math.min(anchorIndex, index);
      const end = Math.max(anchorIndex, index);
      const range = [];
      for (let i = start; i <= end; i += 1) {
        range.push(i);
      }
      setSelected(range, { anchorIndex: index });
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      const next = getSortedSelectedIndexes();
      if (selectedIndexes.has(index)) {
        setSelected(next.filter((item) => item !== index), {
          anchorIndex: anchorIndex,
        });
      } else {
        setSelected([...next, index], { anchorIndex: index });
      }
      return;
    }

    setSelected([index], { anchorIndex: index });
  }

  function handleMouseDown(event) {
    if (!advancedEnabled) return;
    if (event.button !== 0) return;
    const downTarget = event.target instanceof Node ? event.target : null;

    if (!fineModeEnabled && event.target === resizeHandle) {
      event.preventDefault();
      event.stopPropagation();
      startResizeSection(event);
      return;
    }

    if (
      !fineModeEnabled &&
      selectedIndexes.size > 0 &&
      downTarget &&
      selectionMoveHandle.contains(downTarget)
    ) {
      event.preventDefault();
      event.stopPropagation();
      startTopSelectionLayerDrag(event);
      return;
    }

    if (
      fineModeEnabled &&
      !!getFineSelectionContext() &&
      downTarget &&
      fineSelectionMoveHandle.contains(downTarget)
    ) {
      event.preventDefault();
      event.stopPropagation();
      startFineSelectionLayerDrag(event);
      return;
    }

    if (
      !fineModeEnabled &&
      selectedIndexes.size > 0 &&
      isPointOnLayerBorder(selectionLayer, event.clientX, event.clientY)
    ) {
      event.preventDefault();
      event.stopPropagation();
      startTopSelectionLayerDrag(event);
      return;
    }

    if (
      fineModeEnabled &&
      !!getFineSelectionContext() &&
      isPointOnLayerBorder(fineSelectionLayer, event.clientX, event.clientY)
    ) {
      event.preventDefault();
      event.stopPropagation();
      startFineSelectionLayerDrag(event);
      return;
    }

    if (fineModeEnabled) return;

    if (event.target === editorRoot || event.altKey) {
      event.preventDefault();
      startLassoSelection(event);
    }
  }

  function handleDragStart(event) {
    if (!advancedEnabled) return;
    if (fineModeEnabled) return;
    if (dragState?.mode === "top-layer" || dragState?.mode === "fine-layer") {
      event.preventDefault();
      return;
    }

    const block = getTopLevelBlockElement(event.target);
    if (!block) return;

    const blocks = getTopLevelDomBlocks();
    const index = blocks.indexOf(block);
    if (index < 0) return;

    if (!selectedIndexes.has(index)) {
      setSelected([index], { anchorIndex: index });
    }

    dragState = {
      selected: getSortedSelectedIndexes(),
    };
    clearGroupDropTargetPreview();
    block.classList.add("block-drag-source");
    editorRoot.classList.add("is-block-dragging");

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", "block-sort");
      event.dataTransfer.dropEffect = "move";
    }
  }

  function handleDragOver(event) {
    if (!advancedEnabled) return;
    if (fineModeEnabled) return;
    if (!dragState) return;
    event.preventDefault();
    const selected = Array.isArray(dragState.selected)
      ? dragState.selected
      : getSortedSelectedIndexes();
    const intent = resolveTopLevelDragIntent(
      event.clientX,
      event.clientY,
      selected
    );

    if (intent.type === "group") {
      dropIndicator.style.display = "none";
      dropIndex = null;
      dropAxis = "y";
      if (groupDropTargetIndex !== intent.targetIndex) {
        setGroupDropTargetPreview(intent.targetIndex);
      }
    } else {
      if (groupDropTargetIndex !== null) {
        clearGroupDropTargetPreview();
      }
      if (intent.index !== dropIndex || intent.axis !== dropAxis) {
        dropIndex = intent.index;
        dropAxis = intent.axis;
        renderDropIndicator(dropIndex, dropAxis);
      }
    }
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  }

  function handleDrop(event) {
    if (!advancedEnabled) return;
    if (fineModeEnabled) return;
    if (!dragState) return;
    event.preventDefault();

    const finalIntent =
      groupDropTargetIndex !== null
        ? { type: "group", targetIndex: groupDropTargetIndex }
        : dropIndex === null
        ? (() => {
            const sortTarget = resolveDropIndex(event.clientX, event.clientY);
            return { type: "sort", index: sortTarget.index };
          })()
        : { type: "sort", index: dropIndex };

    clearDragState();
    if (finalIntent.type === "group") {
      groupSelectedWithTarget(finalIntent.targetIndex);
    } else {
      reorderSelectedBlocks(finalIntent.index);
    }
  }

  function handleDragEnd() {
    if (!advancedEnabled) return;
    if (fineModeEnabled) return;
    clearDragState();
  }

  function handleKeyDown(event) {
    if (!advancedEnabled) return;
    if (event.key === "Escape") {
      hideSelectionContextMenu();
    }

    const useCommand = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    const target = event.target;
    const isEditableTarget =
      target instanceof HTMLElement &&
      !!target.closest("[contenteditable='true']");
    const hasRangeSelection = !editor.state.selection.empty;
    const hasTextCursor = !!editor.state.selection.$cursor;
    const isEditingText = isEditableTarget && (hasRangeSelection || hasTextCursor);
    const hasFineSelection = !!getFineSelectedNode();
    const hasBlockSelection = selectedIndexes.size > 0;

    if (key === "escape" && (hasBlockSelection || hasFineSelection)) {
      event.preventDefault();
      setSelected([]);
      setFineSelectedPath(null);
      return;
    }

    if (
      event.altKey &&
      !useCommand &&
      (key === "arrowup" || key === "arrowdown")
    ) {
      if (fineModeEnabled && !hasFineSelection) return;
      if (!fineModeEnabled && !hasBlockSelection) return;
      if (isEditingText) return;
      event.preventDefault();
      moveSelectedByOffset(key === "arrowup" ? -1 : 1);
      return;
    }

    if (event.altKey && !useCommand && (hasBlockSelection || hasFineSelection)) {
      if (isEditingText) return;
      if (key === "l") {
        event.preventDefault();
        alignSelectedBlocks("left");
        return;
      }
      if (key === "c") {
        event.preventDefault();
        alignSelectedBlocks("center");
        return;
      }
      if (key === "r") {
        event.preventDefault();
        alignSelectedBlocks("right");
        return;
      }
      if (key === "v") {
        if (fineModeEnabled) return;
        event.preventDefault();
        distributeSelectedVertically();
        return;
      }
      if (key === "w") {
        event.preventDefault();
        equalizeSelectedWidths();
        return;
      }
      if (key === "0") {
        event.preventDefault();
        resetSelectedLayoutStyles();
        return;
      }
    }

    if (fineModeEnabled) {
      if (
        (useCommand && key === "g") ||
        key === "delete" ||
        key === "backspace" ||
        (event.altKey && key === "v")
      ) {
        if (!isEditingText) {
          event.preventDefault();
        }
        return;
      }

      if (useCommand && event.shiftKey && key === "d" && hasFineSelection) {
        if (isEditingText) return;
        event.preventDefault();
        duplicateSelectedBlocks();
        return;
      }
      return;
    }

    if (useCommand && event.shiftKey && key === "a") {
      const total = getTopLevelNodes().length;
      if (!total) return;
      event.preventDefault();
      setSelected(Array.from({ length: total }, (_, index) => index), {
        anchorIndex: total - 1,
      });
      return;
    }

    if (useCommand && key === "g" && hasBlockSelection) {
      event.preventDefault();
      if (event.shiftKey) {
        ungroupSelectedBlock();
      } else {
        groupSelectedBlocks();
      }
      return;
    }

    if (useCommand && event.shiftKey && key === "d" && hasBlockSelection) {
      event.preventDefault();
      duplicateSelectedBlocks();
      return;
    }

    if ((key === "delete" || key === "backspace") && hasBlockSelection) {
      if (isEditingText) {
        return;
      }

      event.preventDefault();
      deleteSelectedBlocks();
    }
  }

  function handleAdvancedModeToggle(event) {
    const enabled = !!event?.detail?.enabled;
    if (enabled === advancedEnabled) return;
    setAdvancedEnabled(enabled);
  }

  selectionContextMenu.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  selectionContextMenu.addEventListener("click", (event) => {
    const actionButton =
      event.target instanceof Element
        ? event.target.closest("[data-action]")
        : null;
    if (!actionButton) return;

    const action = actionButton.dataset.action;
    if (action === "upload-resource") {
      const payload = lastContextMenuPayload || extractPayloadFromSelection();
      if (!payload) {
        toast("未找到可上传的选中内容", "error");
      } else {
        window.dispatchEvent(
          new CustomEvent(RESOURCE_UPLOAD_REQUEST_EVENT, {
            detail: payload,
          })
        );
      }
    }

    hideSelectionContextMenu();
  });

  if (moveUpButton) {
    moveUpButton.addEventListener("click", () => {
      if (!advancedEnabled) return;
      moveSelectedByOffset(-1);
    });
  }

  if (moveDownButton) {
    moveDownButton.addEventListener("click", () => {
      if (!advancedEnabled) return;
      moveSelectedByOffset(1);
    });
  }

  if (alignLeftButton) {
    alignLeftButton.addEventListener("click", () => {
      if (!advancedEnabled) return;
      alignSelectedBlocks("left");
    });
  }

  if (alignCenterButton) {
    alignCenterButton.addEventListener("click", () => {
      if (!advancedEnabled) return;
      alignSelectedBlocks("center");
    });
  }

  if (alignRightButton) {
    alignRightButton.addEventListener("click", () => {
      if (!advancedEnabled) return;
      alignSelectedBlocks("right");
    });
  }

  if (distributeVerticalButton) {
    distributeVerticalButton.addEventListener("click", () => {
      if (!advancedEnabled) return;
      distributeSelectedVertically();
    });
  }

  if (equalWidthButton) {
    equalWidthButton.addEventListener("click", () => {
      if (!advancedEnabled) return;
      equalizeSelectedWidths();
    });
  }

  if (resetLayoutButton) {
    resetLayoutButton.addEventListener("click", () => {
      if (!advancedEnabled) return;
      resetSelectedLayoutStyles();
    });
  }

  if (duplicateButton) {
    duplicateButton.addEventListener("click", () => {
      if (!advancedEnabled) return;
      duplicateSelectedBlocks();
    });
  }

  if (deleteButton) {
    deleteButton.addEventListener("click", () => {
      if (!advancedEnabled) return;
      deleteSelectedBlocks();
    });
  }

  if (groupButton) {
    groupButton.addEventListener("click", () => {
      if (!advancedEnabled) return;
      groupSelectedBlocks();
    });
  }

  if (ungroupButton) {
    ungroupButton.addEventListener("click", () => {
      if (!advancedEnabled) return;
      ungroupSelectedBlock();
    });
  }

  if (groupNameButton) {
    groupNameButton.addEventListener("click", () => {
      if (!advancedEnabled) return;
      renameSelectedGroup();
    });
  }

  if (groupCollapseButton) {
    groupCollapseButton.addEventListener("click", () => {
      if (!advancedEnabled) return;
      toggleSelectedGroupCollapse();
    });
  }

  if (fineModeButton) {
    fineModeButton.addEventListener("click", () => {
      if (!advancedEnabled) return;
      setFineModeEnabled(!fineModeEnabled);
    });
  }

  editorRoot.addEventListener("click", handleClick);
  editorElement.addEventListener("mousedown", handleMouseDown);
  editorElement.addEventListener("contextmenu", handleContextMenu);
  editorRoot.addEventListener("dragstart", handleDragStart);
  editorRoot.addEventListener("dragover", handleDragOver);
  editorRoot.addEventListener("drop", handleDrop);
  editorRoot.addEventListener("dragend", handleDragEnd);
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("mousedown", handleGlobalPointerDown);
  window.addEventListener("scroll", hideSelectionContextMenu, true);
  window.addEventListener(ADVANCED_MODE_EVENT, handleAdvancedModeToggle);
  window.addEventListener("resize", () => {
    hideSelectionContextMenu();
    renderSelectionLayer();
    renderFineSelectionLayer();
  });

  const editorWrapper = editorElement.closest(".editor-wrapper");
  if (editorWrapper instanceof HTMLElement) {
    editorWrapper.addEventListener(
      "scroll",
      () => {
        renderSelectionLayer();
        renderFineSelectionLayer();
      },
      { passive: true }
    );
  }

  if (typeof ResizeObserver !== "undefined") {
    const layoutObserver = new ResizeObserver(() => {
      renderSelectionLayer();
      renderFineSelectionLayer();
    });
    layoutObserver.observe(editorRoot);
  }

  editor.on("update", () => {
    normalizeSelectionRange();
    applySelectionClasses();
  });

  editor.on("selectionUpdate", () => {
    normalizeSelectionRange();
    renderSelectionLayer();
    renderFineSelectionLayer();
    syncActionButtons();
  });

  ensureToolsMeta();
  setAdvancedEnabled(advancedEnabled);
}
