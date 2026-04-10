// ═══════════════════════════════════════════════════════════════════════════════
// 🔀 CÔNG TẮC CHẾ ĐỘ DATABASE
// ── Muốn dùng PostgreSQL → import từ "./db-postgres.js"  ──
// ── Muốn test local       → import từ "./db-memory.js"   ──
// ═══════════════════════════════════════════════════════════════════════════════

export {
  query,
  queryOne,
  execute,
  withTransaction,
  getAllPrices,
  replacePrices,
  getAllTiers,
  replaceTiers,
  getAllBulkTiers,
  replaceBulkTiers,
  getAllCustomers,
  replaceCustomers,
  getAllServices,
  replaceServices,
  getAllQuotations,
  replaceQuotations,
  getAllReconLogs,
  replaceReconLogs,
  getAllRegistrationServices,
  replaceRegistrationServices,
  getAllRegistrations,
  replaceRegistrations,
  getAllAuditLogs,
  insertAuditLog,
  getConfig,
  setConfig,
  findUserByUsername,
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  initDB,
  TABLE_GETTERS,
  TABLE_SETTERS,
  pool,
//} from "./db-memory.js";   // ← BẬT DÒNG NÀY ĐỂ TEST LOCAL (không cần PostgreSQL)
} from "./db-postgres.js";   // ← PRODUCTION: dùng PostgreSQL để dữ liệu không mất khi restart
