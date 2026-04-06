import { Router } from "express";
import { query } from "../db.js";

const router = Router();

// ─── GET /api/public/fuel-prices ─────────────────────────────────────────────
// Trả về danh sách giá dầu (mặc định 30 ngày gần nhất)
router.get("/fuel-prices", async (_req, res) => {
  try {
    const limit = Math.min(Math.max(Number(_req.query.limit) || 30, 1), 365);

    const rows = await query(
      `SELECT id, date, effective_at AS "effectiveAt",
              fuel_type AS "fuelType", price_v1 AS "priceV1",
              is_published AS "isPublished"
       FROM fuel_prices
       ORDER BY date DESC
       LIMIT $1`,
      [limit],
    );

    res.json({ success: true, count: rows.length, data: rows });
  } catch (err: any) {
    console.error("[Public API] fuel-prices error:", err.message);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

// ─── GET /api/public/fuel-prices/latest ──────────────────────────────────────
// Trả về giá dầu mới nhất (ưu tiên giá đã ghim, nếu không thì giá mới nhất)
router.get("/fuel-prices/latest", async (_req, res) => {
  try {
    // Ưu tiên giá đã ghim (is_published = true)
    let row = await query(
      `SELECT id, date, effective_at AS "effectiveAt",
              fuel_type AS "fuelType", price_v1 AS "priceV1",
              is_published AS "isPublished"
       FROM fuel_prices
       WHERE is_published = true
       ORDER BY date DESC
       LIMIT 1`,
    );

    // Nếu không có giá ghim → lấy giá mới nhất
    if (row.length === 0) {
      row = await query(
        `SELECT id, date, effective_at AS "effectiveAt",
                fuel_type AS "fuelType", price_v1 AS "priceV1",
                is_published AS "isPublished"
         FROM fuel_prices
         ORDER BY date DESC
         LIMIT 1`,
      );
    }

    if (row.length === 0) {
      return res.status(404).json({ success: false, message: "Chưa có dữ liệu giá dầu" });
    }

    res.json({ success: true, data: row[0] });
  } catch (err: any) {
    console.error("[Public API] fuel-prices/latest error:", err.message);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

// ─── GET /api/public/surcharge-tiers ─────────────────────────────────────────
// Trả về bảng bậc phụ thu container
router.get("/surcharge-tiers", async (_req, res) => {
  try {
    const rows = await query(
      `SELECT id, min_price AS "minPrice", max_price AS "maxPrice",
              surcharge_20f AS "surcharge20F", surcharge_40f AS "surcharge40F",
              surcharge_20e AS "surcharge20E", surcharge_40e AS "surcharge40E"
       FROM tiers
       ORDER BY min_price`,
    );

    res.json({ success: true, count: rows.length, data: rows });
  } catch (err: any) {
    console.error("[Public API] surcharge-tiers error:", err.message);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

// ─── GET /api/public/surcharge-tiers/bulk ────────────────────────────────────
// Trả về bảng bậc phụ thu hàng rời
router.get("/surcharge-tiers/bulk", async (_req, res) => {
  try {
    const rows = await query(
      `SELECT id, min_price AS "minPrice", max_price AS "maxPrice",
              percent_surcharge AS "percentSurcharge"
       FROM bulk_tiers
       ORDER BY min_price`,
    );

    res.json({ success: true, count: rows.length, data: rows });
  } catch (err: any) {
    console.error("[Public API] surcharge-tiers/bulk error:", err.message);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

// ─── GET /api/public/surcharge-summary ───────────────────────────────────────
// Trả về tổng hợp: giá dầu hiện tại + bậc phụ thu áp dụng + bảng bậc đầy đủ
router.get("/surcharge-summary", async (_req, res) => {
  try {
    // 1. Giá dầu hiện tại (ưu tiên ghim)
    let priceRows = await query(
      `SELECT id, date, effective_at AS "effectiveAt",
              fuel_type AS "fuelType", price_v1 AS "priceV1",
              is_published AS "isPublished"
       FROM fuel_prices
       WHERE is_published = true
       ORDER BY date DESC LIMIT 1`,
    );
    if (priceRows.length === 0) {
      priceRows = await query(
        `SELECT id, date, effective_at AS "effectiveAt",
                fuel_type AS "fuelType", price_v1 AS "priceV1",
                is_published AS "isPublished"
         FROM fuel_prices ORDER BY date DESC LIMIT 1`,
      );
    }

    const currentPrice = priceRows[0] ?? null;
    const priceValue = currentPrice ? Number(currentPrice.priceV1) : null;

    // 2. Bậc phụ thu container
    const containerTiers = await query(
      `SELECT id, min_price AS "minPrice", max_price AS "maxPrice",
              surcharge_20f AS "surcharge20F", surcharge_40f AS "surcharge40F",
              surcharge_20e AS "surcharge20E", surcharge_40e AS "surcharge40E"
       FROM tiers ORDER BY min_price`,
    );

    // 3. Bậc phụ thu hàng rời
    const bulkTiers = await query(
      `SELECT id, min_price AS "minPrice", max_price AS "maxPrice",
              percent_surcharge AS "percentSurcharge"
       FROM bulk_tiers ORDER BY min_price`,
    );

    // 4. Tìm bậc container đang áp dụng
    let activeContainerTier = null;
    if (priceValue !== null) {
      activeContainerTier =
        containerTiers.find(
          (t: any) => priceValue >= Number(t.minPrice) && priceValue <= Number(t.maxPrice),
        ) ?? null;
    }

    // 5. Tìm bậc hàng rời đang áp dụng
    let activeBulkTier = null;
    if (priceValue !== null) {
      activeBulkTier =
        bulkTiers.find(
          (t: any) => priceValue >= Number(t.minPrice) && priceValue <= Number(t.maxPrice),
        ) ?? null;
    }

    res.json({
      success: true,
      data: {
        currentFuelPrice: currentPrice,
        activeContainerTier,
        activeBulkTier,
        containerTiers,
        bulkTiers,
      },
    });
  } catch (err: any) {
    console.error("[Public API] surcharge-summary error:", err.message);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

export default router;
