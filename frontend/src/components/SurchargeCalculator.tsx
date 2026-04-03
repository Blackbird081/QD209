import React, { useState } from 'react';
import { Droplet, Plus, List, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { useAppContext } from '../context/AppContext';
import { logiStorage } from '../lib/storage';
import { FuelPrice } from '../types';
import * as S from '../styles/SurchargeCalculator.styles';
import { motionFadeUp } from '../styles/shared';

interface SurchargeCalculatorProps {
  onAddToQuotation: (surcharge: { amount: number; quantity: number; cargoType: string }) => void;
}

const SurchargeCalculator: React.FC<SurchargeCalculatorProps> = ({ onAddToQuotation }) => {
  const { prices, setPrices, tiers, setTiers, bulkTiers, setBulkTiers, isAdminMode, userRole } = useAppContext();
  const canEdit = isAdminMode && userRole !== 'guest';

  const onDeleteTier = async (id: string) => {
    const list = tiers.filter(t => t.id !== id);
    await logiStorage.setTiers(list);
    setTiers(list);
  };
  const onDeleteBulkTier = async (id: string) => {
    const list = bulkTiers.filter(t => t.id !== id);
    await logiStorage.setBulkTiers(list);
    setBulkTiers(list);
  };

  const [cargoType, setCargoType] = useState<"container" | "bulk">("container");
  const [operationMethod, setOperationMethod] = useState<string>("");
  const [baseFee, setBaseFee] = useState<string>("");
  const [contType, setContType] = useState<"20F" | "40F" | "20E" | "40E">("20F");
  const [quantity, setQuantity] = useState<string>("1");

  const fuelTypes = ["Dầu DO 0,05S-II"];
  // Respect published price if one is pinned, otherwise use the first (newest) price for each fuel type
  const latestPrices = fuelTypes.map(type => {
    const published = prices.find(p => p.fuelType === type && p.isPublished);
    return published ?? prices.find(p => p.fuelType === type);
  }).filter(Boolean) as FuelPrice[];

  const currentDiesel = latestPrices.find(p => p.fuelType === "Dầu DO 0,05S-II");
  const currentDieselPrice = currentDiesel ? currentDiesel.priceV1 : 0;

  const activeTierIndex = tiers.findIndex(t => currentDieselPrice >= t.minPrice && currentDieselPrice <= t.maxPrice);
  const activeTier = activeTierIndex !== -1 ? tiers[activeTierIndex] : undefined;

  const activeBulkTierIndex = bulkTiers.findIndex(t => currentDieselPrice >= t.minPrice && currentDieselPrice <= t.maxPrice);
  const activeBulkTier = activeBulkTierIndex !== -1 ? bulkTiers[activeBulkTierIndex] : undefined;

  const calculateTotal = () => {
    const fee = parseFloat(baseFee) || 0;
    const qty = parseInt(quantity) || 1;
    let surcharge = 0;
    if (cargoType === "container") {
      if (activeTier) {
        if (contType === "20F") surcharge = activeTier.surcharge20F;
        else if (contType === "40F") surcharge = activeTier.surcharge40F;
        else if (contType === "20E") surcharge = activeTier.surcharge20E;
        else if (contType === "40E") surcharge = activeTier.surcharge40E;
      }
    } else if (cargoType === "bulk" && activeBulkTier) {
      surcharge = fee * (activeBulkTier.percentSurcharge / 100);
    }
    const surchargeTotal = surcharge * qty;
    const vatAmount = surchargeTotal * 0.08;
    return { baseTotal: fee * qty, surchargeTotal, surchargePerUnit: surcharge, vatAmount, grandTotal: (fee * qty) + surchargeTotal + vatAmount };
  };

  const totals = calculateTotal();

  const handleSubmit = () => {
    if (totals.surchargeTotal === 0) return;
    const finalSurchargePerUnit = Math.round(totals.surchargePerUnit * 1.08);
    localStorage.setItem('pending_do_surcharge', JSON.stringify({
      amount: finalSurchargePerUnit, quantity: parseInt(quantity) || 1, cargoType, contType, timestamp: Date.now()
    }));
    onAddToQuotation({ amount: finalSurchargePerUnit, quantity: parseInt(quantity) || 1, cargoType });
  };

  return (
    <div className={S.wrapper}>
      <div className={S.headerCol}>
        <h1 className={S.title}> PHỤ THU GIÁ DỊCH VỤ</h1>
        <p className={S.subtitle}>
          Hệ thống tự động áp dụng bậc phụ thu dựa trên giá Dầu DO 0,05S-II hiện tại.
          <br />
          <strong className={S.subtitleBold}>Quyết định số 209/QĐ-CSG ngày 24/03/2026. Áp dụng từ ngày 01/04/2026</strong>
        </p>
      </div>

      {/* Current Prices Cards */}
      <section className={S.pricesGrid}>
        {latestPrices.map((price, index) => {
          const isActive = price.fuelType === "Dầu DO 0,05S-II";
          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              className={cn(S.priceCardBase, isActive ? S.priceCardActive : S.priceCardIdle)}
            >
              <div className={S.priceCardHeader}>
                <p className={S.priceCardLabel}>{price.fuelType}</p>
                {isActive && <span className={S.priceCardBadge}>Active</span>}
              </div>
              <div className={S.priceCardValueRow}>
                <span className={isActive ? S.priceCardValueActive : S.priceCardValueIdle}>
                  {price.priceV1.toLocaleString()}
                </span>
                <span className={S.priceCardUnit}>VND</span>
              </div>
            </motion.div>
          );
        })}
      </section>

      {/* Calculator */}
      <div className={S.calcPanel}>
        <div className={S.calcGrid}>
          <div className={S.calcLeft}>
            <div className={S.toggleWrapper}>
              <button onClick={() => setCargoType("container")} className={S.toggleBtn(cargoType === "container")}>Hàng Container</button>
              <button onClick={() => setCargoType("bulk")} className={S.toggleBtn(cargoType === "bulk")}>Hàng ngoài container</button>
            </div>

            <div className={S.fieldsGroup}>
              {cargoType === "bulk" && (
                <div className={S.fieldGroup}>
                  <label className={S.label}>Phương án thực hiện</label>
                  <input type="text" value={operationMethod} onChange={(e) => setOperationMethod(e.target.value)} placeholder="VD: Bốc xếp sắt thép" className={S.input} />
                </div>
              )}
              <div className={S.fieldGroup}>
                <label className={S.label}>Đơn giá cơ sở (VND/{cargoType === "container" ? "Cont" : "Đơn vị"})</label>
                <input type="number" value={baseFee} onChange={(e) => setBaseFee(e.target.value)} placeholder="VD: 500000" className={S.input} />
              </div>
              <div className={S.fieldRow}>
                {cargoType === "container" && (
                  <div className={S.fieldGroup}>
                    <label className={S.label}>Loại Container</label>
                    <select value={contType} onChange={(e) => setContType(e.target.value as any)} className={S.selectInput}>
                      <option value="20F">20 Full</option>
                      <option value="40F">40 Full</option>
                      <option value="20E">20 Empty</option>
                      <option value="40E">40 Empty</option>
                    </select>
                  </div>
                )}
                <div className={cargoType === "bulk" ? "col-span-2" : ""}>
                  <div className={S.fieldGroup}>
                    <label className={S.label}>Số lượng</label>
                    <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={S.selectInput} />
                  </div>
                </div>
              </div>
            </div>

            <div className={S.infoBox}>
              <div className={S.infoIconBox}><Droplet className="w-6 h-6" /></div>
              <div>
                <p className={S.infoLabel}>Cơ sở tính phụ thu</p>
                <p className={S.infoText}>Giá Dầu DO 0,05S-II: <span className="font-bold">{currentDieselPrice.toLocaleString()} VND</span></p>
                {cargoType === "container" ? (
                  activeTier ? (
                    <p className={S.infoTier}>Áp dụng: <span className={S.infoTierValue}>Bậc {activeTierIndex + 1} ({activeTier.minPrice.toLocaleString()} - {activeTier.maxPrice.toLocaleString()} VND)</span></p>
                  ) : (
                    <p className={S.infoEmpty}>Không nằm trong bậc phụ thu nào.</p>
                  )
                ) : (
                  activeBulkTier ? (
                    <p className={S.infoTier}>
                      Áp dụng: <span className={S.infoTierValue}>Bậc {activeBulkTierIndex + 1} ({activeBulkTier.minPrice.toLocaleString()} - {activeBulkTier.maxPrice.toLocaleString()} VND)</span>
                      <br />Mức phụ thu: <span className={S.infoTierValue}>{activeBulkTier.percentSurcharge}%</span>
                    </p>
                  ) : (
                    <p className={S.infoEmpty}>Không nằm trong bậc phụ thu nào.</p>
                  )
                )}
              </div>
            </div>
          </div>

          {/* Result Panel */}
          <div className={S.resultPanel}>
            <div className={S.resultLabel}>Kết quả tính toán</div>
            <div className={S.resultValueBlock}>
              <AnimatePresence mode="wait">
                <motion.h3 key={totals.grandTotal} {...motionFadeUp} className={S.resultValue}>
                  {totals.grandTotal.toLocaleString()}
                </motion.h3>
              </AnimatePresence>
              <p className={S.resultCurrency}>Việt Nam Đồng</p>
              <p className={S.resultVatNote}>* Giá trên đã bao gồm 8% VAT</p>
            </div>

            <div className={S.breakdownWrapper}>
              {cargoType === "bulk" && operationMethod && (
                <div className={S.breakdownRow}><span>Phương án</span><span className={S.breakdownMethod}>{operationMethod}</span></div>
              )}
              <div className={S.breakdownRow}>
                <span>Phí cơ sở ({quantity} x {parseFloat(baseFee || "0").toLocaleString()})</span>
                <span className={S.breakdownValue}>{totals.baseTotal.toLocaleString()}</span>
              </div>
              <div className={S.breakdownRow}>
                <span>Phụ thu nhiên liệu ({quantity} x {totals.surchargePerUnit.toLocaleString()})</span>
                <span className={S.breakdownSurcharge}>+{totals.surchargeTotal.toLocaleString()}</span>
              </div>
              <div className={S.breakdownRow}>
                <span>Thuế VAT phụ thu (8%)</span>
                <span className={S.breakdownVat}>+{totals.vatAmount.toLocaleString()}</span>
              </div>
            </div>

            <button onClick={handleSubmit} disabled={!canEdit || totals.surchargeTotal === 0} className={S.submitBtn} style={!canEdit ? {opacity:0.5, cursor:'not-allowed'} : {}}>
              <Plus className="w-6 h-6" /> Thêm vào Báo giá
            </button>
          </div>
        </div>
      </div>

      {/* Data Tables */}
      <div className={S.tablesGrid}>
        <section className={S.tierSection}>
          <div className={S.tierHeader}>
            <div className={S.tierHeaderLeft}>
              <div className={S.tierHeaderIcon}><List className="w-5 h-5" /></div>
              <h2 className={S.tierHeaderTitle}>Hàng Container</h2>
            </div>
          </div>
          <div className={S.tierScrollWrapper}>
            <div className={S.tierTableInner}>
              <table className={S.tierTable}>
                <thead>
                  <tr className={S.tierThead}>
                    <th className={S.tierThCenter}>STT</th>
                    <th className={S.tierTh}>Khoảng Giá DO</th>
                    <th className={S.tierThRight}>20F</th>
                    <th className={S.tierThRight}>40F</th>
                    <th className={S.tierThRight}>20E</th>
                    <th className={S.tierThRight}>40E</th>
                    {canEdit && <th className={cn(S.tierTh, "text-center")}>Xóa</th>}
                  </tr>
                </thead>
                <tbody>
                  {tiers.map((tier, i) => (
                    <tr key={i} className={cn("group transition-all", activeTier?.id === tier.id ? S.tierRowActive : S.tierRowIdle)}>
                      <td className={S.tierTdCenter}>{i + 1}</td>
                      <td className={S.tierTdName}>{tier.minPrice.toLocaleString()} - {tier.maxPrice > 90000 ? 'Trở lên' : tier.maxPrice.toLocaleString()}</td>
                      <td className={S.tierTdValue}>{tier.surcharge20F.toLocaleString()}</td>
                      <td className={S.tierTdValue}>{tier.surcharge40F.toLocaleString()}</td>
                      <td className={S.tierTdValue}>{tier.surcharge20E.toLocaleString()}</td>
                      <td className={S.tierTdValue}>{tier.surcharge40E.toLocaleString()}</td>
                      {canEdit && (
                        <td className={S.tierTdDelete}>
                          <button onClick={() => onDeleteTier(tier.id)} className={S.deleteBtn}><Trash2 className={S.deleteIcon} /></button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className={S.bulkSection}>
          <div className={S.tierHeader}>
            <div className={S.tierHeaderLeft}>
              <div className={S.tierHeaderIcon}><List className="w-5 h-5" /></div>
              <h2 className={S.tierHeaderTitle}>Hàng ngoài container</h2>
            </div>
          </div>
          <div className={S.tierScrollWrapper}>
            <div className={S.bulkTableInner}>
              <table className={S.tierTable}>
                <thead>
                  <tr className={S.tierThead}>
                    <th className={S.tierThCenter}>STT</th>
                    <th className={S.tierTh}>Khoảng Giá DO</th>
                    <th className={S.tierThRight}>Mức Phụ Thu (%)</th>
                    {canEdit && <th className={cn(S.tierTh, "text-center")}>Xóa</th>}
                  </tr>
                </thead>
                <tbody>
                  {bulkTiers.map((tier, i) => (
                    <tr key={i} className={cn("group transition-all", activeBulkTier?.id === tier.id ? S.tierRowActive : S.tierRowIdle)}>
                      <td className={S.tierTdCenter}>{i + 1}</td>
                      <td className={S.tierTdName}>{tier.minPrice.toLocaleString()} - {tier.maxPrice > 90000 ? 'Trở lên' : tier.maxPrice.toLocaleString()}</td>
                      <td className={S.tierTdPercent}>{tier.percentSurcharge}%</td>
                      {canEdit && (
                        <td className={S.tierTdDelete}>
                          <button onClick={() => onDeleteBulkTier(tier.id)} className={S.deleteBtn}><Trash2 className={S.deleteIcon} /></button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default SurchargeCalculator;
