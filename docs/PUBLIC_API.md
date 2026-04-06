# API Công Khai — Giá Dầu & Bậc Phụ Thu

> **Base URL**: `https://<your-domain>/api/public`
>
> Tất cả endpoint đều **không cần đăng nhập** (public), trả về JSON.
> Phù hợp để website bên thứ ba gọi AJAX / `fetch()` lấy dữ liệu.

---

## Mục lục

| # | Endpoint                            | Mô tả                                      |
|---|-------------------------------------|---------------------------------------------|
| 1 | `GET /api/public/fuel-prices`       | Danh sách giá dầu (nhiều ngày)              |
| 2 | `GET /api/public/fuel-prices/latest`| Giá dầu mới nhất                            |
| 3 | `GET /api/public/surcharge-tiers`   | Bảng bậc phụ thu container                  |
| 4 | `GET /api/public/surcharge-tiers/bulk` | Bảng bậc phụ thu hàng rời               |
| 5 | `GET /api/public/surcharge-summary` | Tổng hợp: giá + bậc đang áp dụng           |

---

## 1. Danh sách giá dầu

```
GET /api/public/fuel-prices?limit=30
```

| Param   | Kiểu   | Mặc định | Mô tả                          |
|---------|--------|----------|---------------------------------|
| `limit` | number | 30       | Số ngày trả về (tối đa 365)    |

**Response `200`**:

```json
{
  "success": true,
  "count": 3,
  "data": [
    {
      "id": 10,
      "date": "2026-04-06",
      "effectiveAt": "2026-04-06T08:00:00+07:00",
      "fuelType": "Dầu DO 0,05S-II",
      "priceV1": 16850,
      "isPublished": true
    },
    {
      "id": 9,
      "date": "2026-04-05",
      "effectiveAt": "2026-04-05T08:00:00+07:00",
      "fuelType": "Dầu DO 0,05S-II",
      "priceV1": 16700,
      "isPublished": false
    }
  ]
}
```

---

## 2. Giá dầu mới nhất

```
GET /api/public/fuel-prices/latest
```

Ưu tiên trả về giá đã **ghim** (`isPublished = true`). Nếu không có giá ghim, trả giá mới nhất.

**Response `200`**:

```json
{
  "success": true,
  "data": {
    "id": 10,
    "date": "2026-04-06",
    "effectiveAt": "2026-04-06T08:00:00+07:00",
    "fuelType": "Dầu DO 0,05S-II",
    "priceV1": 16850,
    "isPublished": true
  }
}
```

**Response `404`** (chưa có dữ liệu):

```json
{
  "success": false,
  "message": "Chưa có dữ liệu giá dầu"
}
```

---

## 3. Bảng bậc phụ thu container

```
GET /api/public/surcharge-tiers
```

**Response `200`**:

```json
{
  "success": true,
  "count": 5,
  "data": [
    {
      "id": 1,
      "minPrice": 11000,
      "maxPrice": 13000,
      "surcharge20F": 0,
      "surcharge40F": 0,
      "surcharge20E": 0,
      "surcharge40E": 0
    },
    {
      "id": 2,
      "minPrice": 13001,
      "maxPrice": 15000,
      "surcharge20F": 200000,
      "surcharge40F": 400000,
      "surcharge20E": 100000,
      "surcharge40E": 200000
    }
  ]
}
```

| Trường          | Mô tả                                |
|-----------------|---------------------------------------|
| `minPrice`      | Giá dầu tối thiểu của bậc (VNĐ/lít) |
| `maxPrice`      | Giá dầu tối đa của bậc (VNĐ/lít)    |
| `surcharge20F`  | Phụ thu container 20' Full (VNĐ)     |
| `surcharge40F`  | Phụ thu container 40' Full (VNĐ)     |
| `surcharge20E`  | Phụ thu container 20' Empty (VNĐ)    |
| `surcharge40E`  | Phụ thu container 40' Empty (VNĐ)    |

---

## 4. Bảng bậc phụ thu hàng rời

```
GET /api/public/surcharge-tiers/bulk
```

**Response `200`**:

```json
{
  "success": true,
  "count": 3,
  "data": [
    {
      "id": 1,
      "minPrice": 11000,
      "maxPrice": 13000,
      "percentSurcharge": 0
    },
    {
      "id": 2,
      "minPrice": 13001,
      "maxPrice": 15000,
      "percentSurcharge": 3.5
    }
  ]
}
```

| Trường             | Mô tả                                |
|--------------------|---------------------------------------|
| `percentSurcharge` | Phần trăm phụ thu (%) áp dụng        |

---

## 5. Tổng hợp — Giá + Bậc đang áp dụng

```
GET /api/public/surcharge-summary
```

Trả về **tất cả thông tin** trong 1 request: giá dầu hiện tại, bậc phụ thu đang áp dụng, và toàn bộ bảng bậc.

**Response `200`**:

```json
{
  "success": true,
  "data": {
    "currentFuelPrice": {
      "id": 10,
      "date": "2026-04-06",
      "effectiveAt": "2026-04-06T08:00:00+07:00",
      "fuelType": "Dầu DO 0,05S-II",
      "priceV1": 16850,
      "isPublished": true
    },
    "activeContainerTier": {
      "id": 3,
      "minPrice": 15001,
      "maxPrice": 17000,
      "surcharge20F": 400000,
      "surcharge40F": 800000,
      "surcharge20E": 200000,
      "surcharge40E": 400000
    },
    "activeBulkTier": {
      "id": 3,
      "minPrice": 15001,
      "maxPrice": 17000,
      "percentSurcharge": 5.0
    },
    "containerTiers": [ "..." ],
    "bulkTiers": [ "..." ]
  }
}
```

| Trường                | Mô tả                                                      |
|-----------------------|-------------------------------------------------------------|
| `currentFuelPrice`    | Giá dầu hiện tại (hoặc `null` nếu chưa có)                |
| `activeContainerTier` | Bậc phụ thu container đang áp dụng (hoặc `null`)          |
| `activeBulkTier`      | Bậc phụ thu hàng rời đang áp dụng (hoặc `null`)           |
| `containerTiers`      | Toàn bộ bảng bậc phụ thu container                         |
| `bulkTiers`           | Toàn bộ bảng bậc phụ thu hàng rời                          |

---

## Ví dụ tích hợp

### JavaScript (Fetch API)

```javascript
// Lấy tổng hợp giá dầu + phụ thu
const res = await fetch('https://your-domain.com/api/public/surcharge-summary');
const { success, data } = await res.json();

if (success) {
  console.log('Giá dầu hiện tại:', data.currentFuelPrice.priceV1, 'VNĐ/lít');
  console.log('Phụ thu 20F:', data.activeContainerTier?.surcharge20F, 'VNĐ');
  console.log('Phụ thu hàng rời:', data.activeBulkTier?.percentSurcharge, '%');
}
```

### cURL

```bash
# Giá dầu mới nhất
curl https://your-domain.com/api/public/fuel-prices/latest

# Danh sách giá 7 ngày gần nhất
curl "https://your-domain.com/api/public/fuel-prices?limit=7"

# Bảng phụ thu container
curl https://your-domain.com/api/public/surcharge-tiers

# Bảng phụ thu hàng rời
curl https://your-domain.com/api/public/surcharge-tiers/bulk

# Tổng hợp tất cả
curl https://your-domain.com/api/public/surcharge-summary
```

### PHP

```php
$json = file_get_contents('https://your-domain.com/api/public/surcharge-summary');
$result = json_decode($json, true);

if ($result['success']) {
    $price = $result['data']['currentFuelPrice']['priceV1'];
    $surcharge20F = $result['data']['activeContainerTier']['surcharge20F'] ?? 0;
    echo "Giá dầu: {$price} VNĐ — Phụ thu 20F: {$surcharge20F} VNĐ";
}
```

---

## CORS

API đã bật **CORS** cho tất cả origin (`*`), nên website bất kỳ đều có thể gọi trực tiếp từ trình duyệt.

## Lưu ý

- Dữ liệu giá dầu được đồng bộ tự động từ Petrolimex mỗi sáng 6:00 (giờ VN).
- Giá có trạng thái `isPublished = true` là giá admin đã xác nhận ghim lên trang chủ.
- Nếu không có giá ghim, hệ thống sẽ trả về giá mới nhất theo ngày.
- Đơn vị giá dầu: **VNĐ/lít**. Đơn vị phụ thu container: **VNĐ/cont**. Phụ thu hàng rời: **%**.
