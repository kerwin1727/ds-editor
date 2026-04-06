import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import { data, dbFilePath, getNextId, saveDbFile } from "./db.js";
import {
  authRequired,
  getUserFromRequest,
  isAdmin,
  signUserToken,
} from "./auth.js";

const app = express();
const port = Number(process.env.PORT || 3210);
const host = process.env.HOST || "0.0.0.0";

const RESOURCE_TYPES = new Set([
  "title",
  "graphic",
  "template",
  "section",
  "other",
]);

app.use(cors({ origin: true }));
app.use(express.json({ limit: "8mb" }));

function normalizeBoolean(value, fallback = true) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    if (value === "1" || value.toLowerCase() === "true") return true;
    if (value === "0" || value.toLowerCase() === "false") return false;
  }
  return fallback;
}

function normalizeType(rawType) {
  const type = String(rawType || "").trim().toLowerCase();
  if (!type || type === "all") return "other";
  return RESOURCE_TYPES.has(type) ? type : "other";
}

function pickPublicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
  };
}

function assertCanWriteResource(claims, resource) {
  if (!resource) return false;
  return isAdmin(claims) || Number(resource.ownerId) === Number(claims.uid);
}

function getOwnerNameById(ownerId) {
  return data.users.find((item) => Number(item.id) === Number(ownerId))?.username || "";
}

function hasFavorite(userId, resourceId) {
  return data.favorites.some(
    (item) => Number(item.userId) === Number(userId) && Number(item.resourceId) === Number(resourceId)
  );
}

function toResourceSummary(item, currentUserId = -1) {
  if (!item) return null;
  return {
    id: item.id,
    title: item.title,
    type: item.type,
    summary: item.summary || "",
    contentHtml: item.contentHtml,
    ownerId: item.ownerId,
    ownerName: getOwnerNameById(item.ownerId),
    isPublic: !!item.isPublic,
    isFavorite: hasFavorite(currentUserId, item.id),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "wx-editor-backend",
    storage: dbFilePath,
    time: new Date().toISOString(),
  });
});

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  const normalizedUsername = String(username || "").trim();
  const normalizedPassword = String(password || "");

  if (!normalizedUsername || !normalizedPassword) {
    return res.status(400).json({ message: "用户名和密码不能为空" });
  }

  const user = data.users.find((item) => item.username === normalizedUsername);
  if (!user || !bcrypt.compareSync(normalizedPassword, user.passwordHash)) {
    return res.status(401).json({ message: "用户名或密码错误" });
  }

  const token = signUserToken(user);
  res.json({
    token,
    user: pickPublicUser(user),
  });
});

app.get("/api/auth/me", authRequired, (req, res) => {
  const user = data.users.find((item) => Number(item.id) === Number(req.auth.uid));
  if (!user) {
    return res.status(404).json({ message: "用户不存在" });
  }
  res.json(pickPublicUser(user));
});

app.get("/api/resources", (req, res) => {
  const claims = getUserFromRequest(req);
  const {
    scope = "public",
    search = "",
    type = "all",
    page = 1,
    pageSize = 20,
  } = req.query || {};

  const normalizedScope = String(scope || "public").toLowerCase();
  const normalizedSearch = String(search || "").trim().toLowerCase();
  const normalizedType = String(type || "all").trim().toLowerCase();
  const safePage = Math.max(1, Number.parseInt(String(page), 10) || 1);
  const safePageSize = Math.min(
    60,
    Math.max(1, Number.parseInt(String(pageSize), 10) || 20)
  );

  if ((normalizedScope === "mine" || normalizedScope === "favorite") && !claims) {
    return res.status(401).json({ message: "请先登录后查看该资源范围" });
  }

  let items = [...data.resources];

  if (normalizedScope === "mine") {
    items = items.filter((item) => Number(item.ownerId) === Number(claims.uid));
  } else if (normalizedScope === "favorite") {
    const favoriteIds = new Set(
      data.favorites
        .filter((item) => Number(item.userId) === Number(claims.uid))
        .map((item) => Number(item.resourceId))
    );
    items = items.filter((item) => favoriteIds.has(Number(item.id)));
  } else {
    items = items.filter((item) => item.isPublic);
  }

  if (normalizedType && normalizedType !== "all") {
    items = items.filter((item) => item.type === normalizeType(normalizedType));
  }

  if (normalizedSearch) {
    items = items.filter((item) => {
      const fullText = `${item.title} ${item.summary || ""} ${item.contentHtml || ""}`.toLowerCase();
      return fullText.includes(normalizedSearch);
    });
  }

  items.sort((a, b) => {
    const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return timeB - timeA || Number(b.id) - Number(a.id);
  });

  const total = items.length;
  const offset = (safePage - 1) * safePageSize;
  const pagedItems = items.slice(offset, offset + safePageSize);
  const currentUserId = claims?.uid || -1;

  res.json({
    items: pagedItems.map((item) => toResourceSummary(item, currentUserId)),
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      total,
    },
  });
});

app.post("/api/resources", authRequired, (req, res) => {
  const { title, type, contentHtml, summary = "", isPublic = true } = req.body || {};
  const normalizedTitle = String(title || "").trim().slice(0, 120);
  const normalizedContentHtml = String(contentHtml || "").trim();

  if (!normalizedTitle) {
    return res.status(400).json({ message: "标题不能为空" });
  }
  if (!normalizedContentHtml) {
    return res.status(400).json({ message: "资源内容不能为空" });
  }

  const now = new Date().toISOString();
  const item = {
    id: getNextId("resources"),
    title: normalizedTitle,
    type: normalizeType(type),
    contentHtml: normalizedContentHtml,
    summary: String(summary || "").trim().slice(0, 240),
    ownerId: req.auth.uid,
    isPublic: normalizeBoolean(isPublic, true),
    createdAt: now,
    updatedAt: now,
  };

  data.resources.push(item);
  saveDbFile();
  res.status(201).json({ item: toResourceSummary(item, req.auth.uid) });
});

app.put("/api/resources/:id", authRequired, (req, res) => {
  const id = Number.parseInt(String(req.params?.id), 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ message: "资源 ID 不合法" });
  }

  const resource = data.resources.find((item) => Number(item.id) === id);
  if (!resource) {
    return res.status(404).json({ message: "资源不存在" });
  }
  if (!assertCanWriteResource(req.auth, resource)) {
    return res.status(403).json({ message: "没有权限修改该资源" });
  }

  const patch = req.body || {};
  const nextTitle = String(patch.title ?? resource.title).trim().slice(0, 120);
  const nextContentHtml = String(patch.contentHtml ?? resource.contentHtml).trim();
  if (!nextTitle) {
    return res.status(400).json({ message: "标题不能为空" });
  }
  if (!nextContentHtml) {
    return res.status(400).json({ message: "资源内容不能为空" });
  }

  resource.title = nextTitle;
  resource.type = normalizeType(patch.type ?? resource.type);
  resource.summary = String(patch.summary ?? resource.summary ?? "")
    .trim()
    .slice(0, 240);
  resource.contentHtml = nextContentHtml;
  resource.isPublic = normalizeBoolean(patch.isPublic, resource.isPublic);
  resource.updatedAt = new Date().toISOString();

  saveDbFile();
  res.json({ item: toResourceSummary(resource, req.auth.uid) });
});

app.delete("/api/resources/:id", authRequired, (req, res) => {
  const id = Number.parseInt(String(req.params?.id), 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ message: "资源 ID 不合法" });
  }

  const resource = data.resources.find((item) => Number(item.id) === id);
  if (!resource) {
    return res.status(404).json({ message: "资源不存在" });
  }
  if (!assertCanWriteResource(req.auth, resource)) {
    return res.status(403).json({ message: "没有权限删除该资源" });
  }

  data.resources = data.resources.filter((item) => Number(item.id) !== id);
  data.favorites = data.favorites.filter((item) => Number(item.resourceId) !== id);
  saveDbFile();
  res.json({ ok: true });
});

app.post("/api/resources/:id/favorite", authRequired, (req, res) => {
  const id = Number.parseInt(String(req.params?.id), 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ message: "资源 ID 不合法" });
  }

  const exists = data.resources.some((item) => Number(item.id) === id);
  if (!exists) {
    return res.status(404).json({ message: "资源不存在" });
  }

  if (!hasFavorite(req.auth.uid, id)) {
    data.favorites.push({
      userId: req.auth.uid,
      resourceId: id,
      createdAt: new Date().toISOString(),
    });
    saveDbFile();
  }

  res.json({ ok: true, isFavorite: true });
});

app.delete("/api/resources/:id/favorite", authRequired, (req, res) => {
  const id = Number.parseInt(String(req.params?.id), 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ message: "资源 ID 不合法" });
  }

  const previousSize = data.favorites.length;
  data.favorites = data.favorites.filter(
    (item) =>
      !(
        Number(item.userId) === Number(req.auth.uid) &&
        Number(item.resourceId) === Number(id)
      )
  );
  if (data.favorites.length !== previousSize) {
    saveDbFile();
  }

  res.json({ ok: true, isFavorite: false });
});

app.get("/api/meta/resource-types", (req, res) => {
  res.json({
    items: [
      { id: "title", label: "标题" },
      { id: "graphic", label: "图文" },
      { id: "template", label: "模板" },
      { id: "section", label: "片段" },
      { id: "other", label: "其他" },
    ],
  });
});

app.use((error, req, res, next) => {
  console.error("[wx-editor-backend] error:", error);
  if (res.headersSent) {
    next(error);
    return;
  }
  res.status(500).json({ message: "服务器异常", detail: error?.message || "" });
});

app.listen(port, host, () => {
  console.log(`[wx-editor-backend] running at http://${host}:${port}`);
  console.log(`[wx-editor-backend] storage: ${dbFilePath}`);
  console.log("[wx-editor-backend] super admin => username: admin, password: kerwin");
});
