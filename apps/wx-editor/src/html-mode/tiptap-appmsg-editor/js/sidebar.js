import { Tabs } from "../plugins/tabs";
import editor from "./editor";
import customTemplate from "../templates/custom.html?raw";
import noTemplate from "../templates/No.html?raw";
import titleTemplate from "../templates/title.html?raw";
import textTemplate from "../templates/text.html?raw";
import graphicTemplate from "../templates/graphic.html?raw";
import fullTemplate from "../templates/template.html?raw";

const RESOURCE_UPLOAD_REQUEST_EVENT = "wx-editor:resource-upload-request";
const RESOURCE_SAVE_TEMPLATE_EVENT = "wx-editor:resource-save-template-request";
const RESOURCE_AUTH_TOKEN_KEY = "wx-editor:resource-auth-token";
const RESOURCE_AUTH_USER_KEY = "wx-editor:resource-auth-user";
const RESOURCE_API_BASE_STORAGE_KEY = "wx-editor:resource-api-base";
const DEFAULT_RESOURCE_API_BASE = "/wx-editor-api";

const RESOURCE_TYPE_LABEL_MAP = {
  title: "标题",
  graphic: "图文",
  template: "模板",
  section: "片段",
  other: "其他",
};

const graphicList = [
  customTemplate,
  noTemplate,
  titleTemplate,
  textTemplate,
  graphicTemplate,
  fullTemplate,
];

const $sidebarTabs = document.querySelector(".sidebar .tabs");
const tabs = new Tabs({ el: $sidebarTabs, activated: "graphic" });

const resourceElements = {
  panel: document.querySelector(".resource-library"),
  list: document.querySelector(".resource-list"),
  empty: document.querySelector(".resource-empty"),
  searchInput: document.querySelector(".resource-search-input"),
  typeSelect: document.querySelector(".resource-type-select"),
  refreshButton: document.querySelector(".resource-refresh-btn"),
  scopeButtons: Array.from(document.querySelectorAll(".resource-scope-tabs .scope-btn")),
  authStatus: document.querySelector(".resource-auth-status"),
  loginButton: document.querySelector(".resource-login-btn"),
  logoutButton: document.querySelector(".resource-logout-btn"),
};

const resourceState = {
  scope: "public",
  keyword: "",
  type: "all",
  page: 1,
  pageSize: 20,
  loading: false,
  requestId: 0,
  itemsMap: new Map(),
  authToken: "",
  authUser: null,
};

let searchTimer = null;
let pendingAfterLoginAction = null;
let pendingUploadPayload = null;
let uploadModal = null;

renderGraphicList();
rehydrateAuth();
bindResourceLibraryEvents();
tabs.on("change", () => {
  if (tabs.activeName === "resource") {
    loadResourceList();
  }
});

function notify(message, type = "info") {
  const showToast = window.__WX_EDITOR_SHOW_TOAST__;
  if (typeof showToast === "function") {
    showToast(message, type);
    return;
  }
  if (type === "error") {
    console.error(message);
  } else {
    console.log(message);
  }
}

function getResourceApiBase() {
  const fromWindow = String(window.__WX_EDITOR_RESOURCE_API_BASE__ || "").trim();
  const fromStorage = String(
    window.localStorage.getItem(RESOURCE_API_BASE_STORAGE_KEY) || ""
  ).trim();
  const base = fromWindow || fromStorage || DEFAULT_RESOURCE_API_BASE;
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

async function apiRequest(path, options = {}) {
  const { method = "GET", body, auth = false } = options;
  const headers = {
    "Content-Type": "application/json",
  };

  if (auth && resourceState.authToken) {
    headers.Authorization = `Bearer ${resourceState.authToken}`;
  }

  const response = await fetch(`${getResourceApiBase()}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && auth) {
      clearAuthState();
    }
    const error = new Error(payload?.message || `请求失败（${response.status}）`);
    error.status = response.status;
    throw error;
  }

  return payload;
}

function renderGraphicList() {
  const $graphicList = document.querySelector(".sidebar .graphic-list");
  if (!$graphicList) return;

  $graphicList.innerHTML = "";
  graphicList.forEach((html) => {
    const item = document.createElement("div");
    item.className = "graphic-item";
    item.innerHTML = html;
    item.addEventListener("click", () => handleInsert(html));
    $graphicList.appendChild(item);
  });
}

function handleInsert(html) {
  const normalizedHtml = normalizeTemplateAlignment(html);
  editor
    .chain()
    .focus()
    .insertContent(normalizedHtml, {
      parseOptions: {
        preserveWhitespace: false,
      },
    })
    .run();
}

function normalizeTemplateAlignment(html) {
  const container = document.createElement("div");
  container.innerHTML = html;

  const centeredSections = container.querySelectorAll(
    'section[style*="text-align: center"], section[align="center"], section[align="middle"]'
  );

  centeredSections.forEach((section) => {
    section.querySelectorAll("p[style]").forEach((p) => {
      const styleText = p.getAttribute("style") || "";
      const cleanedStyle = styleText
        .split(";")
        .map((item) => item.trim())
        .filter(Boolean)
        .filter((item) => !item.toLowerCase().startsWith("text-align"))
        .join("; ");

      if (cleanedStyle) {
        p.setAttribute("style", cleanedStyle);
      } else {
        p.removeAttribute("style");
      }
    });
  });

  return container.innerHTML;
}

function readJsonStorage(key, fallbackValue) {
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallbackValue;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return fallbackValue;
  }
}

function rehydrateAuth() {
  resourceState.authToken = String(
    window.localStorage.getItem(RESOURCE_AUTH_TOKEN_KEY) || ""
  ).trim();
  resourceState.authUser = readJsonStorage(RESOURCE_AUTH_USER_KEY, null);
  syncAuthStatusView();

  if (!resourceState.authToken) return;

  apiRequest("/api/auth/me", { auth: true })
    .then((user) => {
      setAuthState(resourceState.authToken, user);
    })
    .catch(() => {
      clearAuthState();
    });
}

function setAuthState(token, user) {
  resourceState.authToken = token;
  resourceState.authUser = user;
  window.localStorage.setItem(RESOURCE_AUTH_TOKEN_KEY, token);
  window.localStorage.setItem(RESOURCE_AUTH_USER_KEY, JSON.stringify(user));
  syncAuthStatusView();
}

function clearAuthState() {
  resourceState.authToken = "";
  resourceState.authUser = null;
  window.localStorage.removeItem(RESOURCE_AUTH_TOKEN_KEY);
  window.localStorage.removeItem(RESOURCE_AUTH_USER_KEY);
  syncAuthStatusView();
}

function syncAuthStatusView() {
  if (!resourceElements.authStatus) return;
  const isLoggedIn = !!resourceState.authToken;
  const username = resourceState.authUser?.username || "";
  resourceElements.authStatus.textContent = isLoggedIn
    ? `当前用户：${username}`
    : "未登录";
  if (resourceElements.loginButton) {
    resourceElements.loginButton.style.display = isLoggedIn ? "none" : "inline-flex";
  }
  if (resourceElements.logoutButton) {
    resourceElements.logoutButton.style.display = isLoggedIn ? "inline-flex" : "none";
  }
}

function escapeHtml(rawText) {
  return String(rawText || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function htmlToPlainText(html) {
  const container = document.createElement("div");
  container.innerHTML = String(html || "");
  return String(container.textContent || "").replace(/\s+/g, " ").trim();
}

function getResourceTypeLabel(type) {
  const key = String(type || "").trim().toLowerCase();
  return RESOURCE_TYPE_LABEL_MAP[key] || RESOURCE_TYPE_LABEL_MAP.other;
}

function formatResourceSummary(item) {
  const summary = String(item.summary || "").trim();
  if (summary) {
    return summary.slice(0, 120);
  }
  return htmlToPlainText(item.contentHtml).slice(0, 120) || "暂无描述";
}

function renderResourceList(items) {
  const $list = resourceElements.list;
  if (!$list) return;

  resourceState.itemsMap = new Map(items.map((item) => [item.id, item]));
  if (!items.length) {
    $list.innerHTML = "";
    if (resourceElements.empty) {
      resourceElements.empty.style.display = "block";
    }
    return;
  }

  if (resourceElements.empty) {
    resourceElements.empty.style.display = "none";
  }

  const currentUserId = resourceState.authUser?.id || null;
  const cardsHtml = items
    .map((item) => {
      const ownResource = currentUserId && Number(item.ownerId) === Number(currentUserId);
      const summary = escapeHtml(formatResourceSummary(item));
      const title = escapeHtml(item.title || "未命名资源");
      const ownerName = escapeHtml(item.ownerName || "未知作者");
      const typeLabel = escapeHtml(getResourceTypeLabel(item.type));

      return `
        <div class="resource-card" data-id="${item.id}">
          <div class="resource-card-header">
            <div class="resource-card-title" title="${title}">${title}</div>
            <div class="resource-card-badges">
              <span class="resource-badge resource-type-badge">${typeLabel}</span>
              ${item.isPublic ? '<span class="resource-badge">公开</span>' : '<span class="resource-badge is-private">私有</span>'}
            </div>
          </div>
          <div class="resource-card-summary">${summary}</div>
          <div class="resource-card-meta">
            <span>作者：${ownerName}</span>
            <span>${new Date(item.updatedAt || item.createdAt).toLocaleDateString()}</span>
          </div>
          <div class="resource-card-actions">
            <button type="button" class="resource-action-btn is-primary" data-action="apply">应用</button>
            <button type="button" class="resource-action-btn" data-action="favorite">${
              item.isFavorite ? "取消收藏" : "收藏"
            }</button>
            ${
              ownResource
                ? '<button type="button" class="resource-action-btn" data-action="edit">编辑</button><button type="button" class="resource-action-btn is-danger" data-action="delete">删除</button>'
                : ""
            }
          </div>
        </div>
      `;
    })
    .join("");

  $list.innerHTML = cardsHtml;
}

function setScope(scopeName) {
  resourceState.scope = scopeName;
  resourceState.page = 1;
  resourceElements.scopeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.scope === scopeName);
  });
}

async function loadResourceList() {
  if (!resourceElements.list || !resourceElements.panel) return;

  const requestId = ++resourceState.requestId;
  resourceState.loading = true;
  resourceElements.panel.classList.add("is-loading");

  const params = new URLSearchParams({
    scope: resourceState.scope,
    search: resourceState.keyword,
    type: resourceState.type,
    page: String(resourceState.page),
    pageSize: String(resourceState.pageSize),
  });

  try {
    const data = await apiRequest(`/api/resources?${params.toString()}`, {
      auth: resourceState.scope === "mine" || resourceState.scope === "favorite",
    });
    if (requestId !== resourceState.requestId) return;
    renderResourceList(Array.isArray(data.items) ? data.items : []);
  } catch (error) {
    if (requestId !== resourceState.requestId) return;
    renderResourceList([]);
    notify(error.message || "资源加载失败", "error");
  } finally {
    if (requestId === resourceState.requestId) {
      resourceElements.panel.classList.remove("is-loading");
      resourceState.loading = false;
    }
  }
}

function ensureUploadDialog() {
  if (uploadModal) return;
  uploadModal = document.createElement("div");
  uploadModal.className = "wx-resource-modal";
  uploadModal.innerHTML = `
    <div class="wx-resource-modal-mask" data-close="upload"></div>
    <div class="wx-resource-modal-panel">
      <div class="wx-resource-modal-header">
        <div class="wx-resource-modal-title">上传到资源库</div>
        <button type="button" class="wx-resource-close-btn" data-close="upload">×</button>
      </div>
      <div class="wx-resource-modal-body">
        <label class="wx-resource-form-item">
          <span>资源标题</span>
          <input type="text" class="wx-resource-upload-title" placeholder="请输入资源标题" />
        </label>
        <label class="wx-resource-form-item">
          <span>资源类型</span>
          <select class="wx-resource-upload-type">
            <option value="title">标题</option>
            <option value="graphic">图文</option>
            <option value="template">模板</option>
            <option value="section">片段</option>
            <option value="other">其他</option>
          </select>
        </label>
        <label class="wx-resource-form-item">
          <span>资源描述</span>
          <input type="text" class="wx-resource-upload-summary" placeholder="可选，方便后续搜索" />
        </label>
        <label class="wx-resource-inline-checkbox">
          <input type="checkbox" class="wx-resource-upload-public" checked />
          <span>公开到公共资源库</span>
        </label>
        <div class="wx-resource-upload-preview"></div>
      </div>
      <div class="wx-resource-modal-footer">
        <button type="button" class="wx-resource-btn" data-close="upload">取消</button>
        <button type="button" class="wx-resource-btn is-primary wx-resource-upload-submit">确认上传</button>
      </div>
    </div>
  `;
  document.body.appendChild(uploadModal);
  bindUploadDialogEvents();
}

function bindUploadDialogEvents() {
  if (!uploadModal || uploadModal.dataset.bound === "1") return;
  uploadModal.dataset.bound = "1";

  uploadModal.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const closeTrigger = target.closest("[data-close='upload']");
    if (closeTrigger) {
      closeModal(uploadModal);
    }
  });

  const uploadButton = uploadModal.querySelector(".wx-resource-upload-submit");
  uploadButton?.addEventListener("click", async () => {
    if (!pendingUploadPayload?.html) {
      notify("没有可上传的资源内容", "error");
      return;
    }
    const titleInput = uploadModal.querySelector(".wx-resource-upload-title");
    const typeInput = uploadModal.querySelector(".wx-resource-upload-type");
    const summaryInput = uploadModal.querySelector(".wx-resource-upload-summary");
    const publicInput = uploadModal.querySelector(".wx-resource-upload-public");

    const title = String(titleInput?.value || "").trim();
    const type = String(typeInput?.value || "other").trim();
    const summary = String(summaryInput?.value || "").trim();
    const isPublic = !!publicInput?.checked;

    if (!title) {
      notify("请填写资源标题", "error");
      return;
    }

    try {
      await apiRequest("/api/resources", {
        method: "POST",
        auth: true,
        body: {
          title,
          type,
          summary,
          isPublic,
          contentHtml: pendingUploadPayload.html,
        },
      });

      closeModal(uploadModal);
      pendingUploadPayload = null;
      notify("资源上传成功", "success");
      tabs.tabChange("resource");
      setScope("mine");
      loadResourceList();
    } catch (error) {
      notify(error.message || "资源上传失败", "error");
    }
  });
}

function openModal(modal) {
  if (!(modal instanceof HTMLElement)) return;
  modal.classList.add("is-open");
}

function closeModal(modal) {
  if (!(modal instanceof HTMLElement)) return;
  modal.classList.remove("is-open");
}

async function openLoginDialog(afterLogin) {
  pendingAfterLoginAction = typeof afterLogin === "function" ? afterLogin : null;

  const openLogin = window.__WX_EDITOR_OPEN_RESOURCE_LOGIN__;
  if (typeof openLogin !== "function") {
    notify("登录组件尚未就绪，请刷新页面后重试", "error");
    pendingAfterLoginAction = null;
    return;
  }

  try {
    const result = await openLogin();
    if (!result?.token || !result?.user) {
      pendingAfterLoginAction = null;
      return;
    }

    setAuthState(result.token, result.user);
    notify("登录成功", "success");

    if (typeof pendingAfterLoginAction === "function") {
      const action = pendingAfterLoginAction;
      pendingAfterLoginAction = null;
      action();
    }

    if (tabs.activeName === "resource") {
      loadResourceList();
    }
  } catch (error) {
    notify(error?.message || "登录失败", "error");
    pendingAfterLoginAction = null;
  }
}

function ensureLoginThen(afterLogin) {
  if (resourceState.authToken && resourceState.authUser) {
    afterLogin();
    return;
  }
  openLoginDialog(afterLogin);
}

function openUploadDialog(payload) {
  ensureUploadDialog();
  pendingUploadPayload = payload;

  const titleInput = uploadModal.querySelector(".wx-resource-upload-title");
  const typeInput = uploadModal.querySelector(".wx-resource-upload-type");
  const summaryInput = uploadModal.querySelector(".wx-resource-upload-summary");
  const preview = uploadModal.querySelector(".wx-resource-upload-preview");
  const publicInput = uploadModal.querySelector(".wx-resource-upload-public");

  titleInput.value =
    String(payload.title || "").trim() || `资源 ${new Date().toLocaleString()}`;
  typeInput.value = RESOURCE_TYPE_LABEL_MAP[payload.type] ? payload.type : "other";
  summaryInput.value = String(payload.summary || "").trim();
  publicInput.checked = true;

  const plainText = htmlToPlainText(payload.html).slice(0, 240);
  preview.textContent = plainText || "暂无预览文本";
  openModal(uploadModal);
}

function normalizeUploadPayload(inputPayload, fallbackType = "section") {
  const html = String(inputPayload?.html || "").trim();
  if (!html) return null;
  const title = String(inputPayload?.title || "").trim();
  const summary = String(inputPayload?.summary || "").trim();
  const type = String(inputPayload?.type || fallbackType).trim().toLowerCase();
  return {
    html,
    title: title || htmlToPlainText(html).slice(0, 36) || "未命名资源",
    summary,
    type: RESOURCE_TYPE_LABEL_MAP[type] ? type : "other",
  };
}

function applyResourceToEditor(item) {
  const resourceHtml = String(item.contentHtml || "").trim();
  if (!resourceHtml) {
    notify("资源内容为空，无法应用", "error");
    return;
  }

  const normalizedHtml = normalizeTemplateAlignment(resourceHtml);
  if (item.type === "template") {
    editor.commands.clearContent();
  }

  editor
    .chain()
    .focus()
    .insertContent(normalizedHtml, {
      parseOptions: {
        preserveWhitespace: false,
      },
    })
    .run();

  notify("资源已应用到编辑区", "success");
}

async function toggleFavorite(item) {
  ensureLoginThen(async () => {
    try {
      if (item.isFavorite) {
        await apiRequest(`/api/resources/${item.id}/favorite`, {
          method: "DELETE",
          auth: true,
        });
      } else {
        await apiRequest(`/api/resources/${item.id}/favorite`, {
          method: "POST",
          auth: true,
        });
      }
      loadResourceList();
    } catch (error) {
      notify(error.message || "收藏操作失败", "error");
    }
  });
}

async function editResource(item) {
  ensureLoginThen(async () => {
    const nextTitle = window.prompt("请输入新的资源标题", item.title || "");
    if (nextTitle === null) return;
    const normalizedTitle = String(nextTitle || "").trim();
    if (!normalizedTitle) {
      notify("标题不能为空", "error");
      return;
    }

    try {
      await apiRequest(`/api/resources/${item.id}`, {
        method: "PUT",
        auth: true,
        body: {
          title: normalizedTitle,
          summary: item.summary || "",
          type: item.type,
          isPublic: item.isPublic,
          contentHtml: item.contentHtml,
        },
      });
      notify("资源已更新", "success");
      loadResourceList();
    } catch (error) {
      notify(error.message || "资源更新失败", "error");
    }
  });
}

async function deleteResource(item) {
  ensureLoginThen(async () => {
    const confirmed = window.confirm(`确认删除资源「${item.title}」吗？`);
    if (!confirmed) return;
    try {
      await apiRequest(`/api/resources/${item.id}`, {
        method: "DELETE",
        auth: true,
      });
      notify("资源已删除", "success");
      loadResourceList();
    } catch (error) {
      notify(error.message || "资源删除失败", "error");
    }
  });
}

function bindResourceLibraryEvents() {
  if (!resourceElements.panel) return;

  resourceElements.loginButton?.addEventListener("click", () => {
    openLoginDialog(() => loadResourceList());
  });

  resourceElements.logoutButton?.addEventListener("click", () => {
    clearAuthState();
    notify("已退出登录", "success");
    if (resourceState.scope !== "public") {
      setScope("public");
    }
    loadResourceList();
  });

  resourceElements.refreshButton?.addEventListener("click", () => {
    loadResourceList();
  });

  resourceElements.typeSelect?.addEventListener("change", (event) => {
    resourceState.type = String(event.target.value || "all");
    resourceState.page = 1;
    loadResourceList();
  });

  resourceElements.searchInput?.addEventListener("input", (event) => {
    resourceState.keyword = String(event.target.value || "").trim();
    resourceState.page = 1;
    if (searchTimer) {
      window.clearTimeout(searchTimer);
    }
    searchTimer = window.setTimeout(() => {
      loadResourceList();
    }, 280);
  });

  resourceElements.scopeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const scope = button.dataset.scope || "public";
      if ((scope === "mine" || scope === "favorite") && !resourceState.authToken) {
        openLoginDialog(() => {
          setScope(scope);
          loadResourceList();
        });
        return;
      }
      setScope(scope);
      loadResourceList();
    });
  });

  resourceElements.list?.addEventListener("click", (event) => {
    const actionButton =
      event.target instanceof Element
        ? event.target.closest("[data-action]")
        : null;
    if (!actionButton) return;
    const action = actionButton.dataset.action || "";
    const card = actionButton.closest(".resource-card");
    const resourceId = Number.parseInt(card?.dataset.id || "", 10);
    if (!Number.isFinite(resourceId)) return;
    const item = resourceState.itemsMap.get(resourceId);
    if (!item) return;

    if (action === "apply") {
      applyResourceToEditor(item);
      return;
    }
    if (action === "favorite") {
      toggleFavorite(item);
      return;
    }
    if (action === "edit") {
      editResource(item);
      return;
    }
    if (action === "delete") {
      deleteResource(item);
    }
  });

  window.addEventListener(RESOURCE_UPLOAD_REQUEST_EVENT, (event) => {
    const payload = normalizeUploadPayload(event.detail, "section");
    if (!payload) {
      notify("未检测到可上传的选中内容", "error");
      return;
    }
    ensureLoginThen(() => openUploadDialog(payload));
  });

  window.addEventListener(RESOURCE_SAVE_TEMPLATE_EVENT, (event) => {
    const payload = normalizeUploadPayload(event.detail, "template");
    if (!payload) {
      notify("当前内容为空，无法保存模板", "error");
      return;
    }
    payload.type = "template";
    ensureLoginThen(() => openUploadDialog(payload));
  });
}
