import jwt from "jsonwebtoken";

const TOKEN_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "30d";
const JWT_SECRET =
  process.env.JWT_SECRET || "wx-editor-resource-jwt-secret-change-me";

function signUserToken(user) {
  return jwt.sign(
    {
      uid: user.id,
      username: user.username,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRES_IN }
  );
}

function parseTokenFromHeader(authHeader = "") {
  const value = String(authHeader || "");
  if (!value.toLowerCase().startsWith("bearer ")) return "";
  return value.slice(7).trim();
}

function verifyToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

function getUserFromRequest(req) {
  const token = parseTokenFromHeader(req?.headers?.authorization);
  return verifyToken(token);
}

function authRequired(req, res, next) {
  const claims = getUserFromRequest(req);
  if (!claims) {
    res.status(401).json({ message: "未登录或登录已过期" });
    return;
  }
  req.auth = claims;
  next();
}

function isAdmin(claims) {
  return claims?.role === "super_admin";
}

export { signUserToken, parseTokenFromHeader, verifyToken, getUserFromRequest, authRequired, isAdmin };
