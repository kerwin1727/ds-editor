import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = process.env.DB_DIR
  ? path.resolve(process.env.DB_DIR)
  : path.resolve(__dirname, "../data");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbFilePath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(dataDir, "wx-editor-resource.json");

function createEmptyData() {
  return {
    users: [],
    resources: [],
    favorites: [],
  };
}

function readDbFile() {
  if (!fs.existsSync(dbFilePath)) {
    return createEmptyData();
  }

  try {
    const raw = fs.readFileSync(dbFilePath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      resources: Array.isArray(parsed.resources) ? parsed.resources : [],
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
    };
  } catch (error) {
    return createEmptyData();
  }
}

const data = readDbFile();

function saveDbFile() {
  fs.writeFileSync(dbFilePath, JSON.stringify(data, null, 2), "utf8");
}

function getNextId(collectionName) {
  const collection = data[collectionName];
  if (!Array.isArray(collection) || !collection.length) return 1;
  const maxId = collection.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0);
  return maxId + 1;
}

function seedSuperAdmin() {
  const existing = data.users.find((item) => item.username === "admin");
  if (existing) return;

  data.users.push({
    id: getNextId("users"),
    username: "admin",
    passwordHash: bcrypt.hashSync("kerwin", 10),
    role: "super_admin",
    createdAt: new Date().toISOString(),
  });
}

seedSuperAdmin();
saveDbFile();

export { data, saveDbFile, getNextId, dbFilePath };
