import React, { useState, useRef } from 'react';
import { QrCode, ClipboardCheck, History, ArrowRight, Save, AlertCircle, RefreshCcw } from 'lucide-react';
import { motion } from 'motion/react';
import { useAppContext } from '../context/AppContext';
import { logiStorage } from '../lib/storage';
import { ReconciliationLog } from '../types';
import jsQR from 'jsqr';
import Tesseract from 'tesseract.js';
import * as S from '../styles/ReconciliationModule.styles';

export default function ReconciliationModule() {
  const { prices, tiers, bulkTiers, reconLogs, setReconLogs, isAdminMode, userRole } = useAppContext();
  const canEdit = isAdminMode && userRole !== 'guest';
  const [activeTab, setActiveTab] = useState<'scan' | 'history'>('scan');

  // Input states
  const [containerId, setContainerId] = useState('');
  const [containerType, setContainerType] = useState<'20F' | '40F' | '20E' | '40E' | 'bulk'>('20F');
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().split('T')[0]);
  const [isDateFocused, setIsDateFocused] = useState(false);
  const [fuelPriceAtBooking, setFuelPriceAtBooking] = useState('');
  const [surchargeAtBooking, setSurchargeAtBooking] = useState('');

  const displayDate = (yyyyMMdd: string) => {
    if (!yyyyMMdd || yyyyMMdd.length !== 10) return yyyyMMdd;
    const [y, m, d] = yyyyMMdd.split('-');
    return `${d}/${m}/${y}`;
  };

  // Result state
  const [result, setResult] = useState<Partial<ReconciliationLog> | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to find the effective fuel price (published > latest)
  const getLatestFuelPrice = () => {
    const dieselPrices = prices.filter(p => p.fuelType === "Dầu DO 0,05S-II");
    if (dieselPrices.length === 0) return 0;
    const published = dieselPrices.find(p => p.isPublished);
    if (published) return published.priceV1;
    const latest = dieselPrices.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    return latest.priceV1;
  };

  const getSurchargeFromPrice = (price: number, type: string) => {
    if (type === 'bulk') {
      const activeBulkTier = bulkTiers.find(t => price >= t.minPrice && price <= t.maxPrice);
      // Bulk is percentage, we would need base fee. We might simplify bulk for now or return 0, assuming we deal with containers
      return 0; 
    }
    const activeTier = tiers.find(t => price >= t.minPrice && price <= t.maxPrice);
    if (!activeTier) return 0;
    if (type === '20F') return activeTier.surcharge20F;
    if (type === '40F') return activeTier.surcharge40F;
    if (type === '20E') return activeTier.surcharge20E;
    if (type === '40E') return activeTier.surcharge40E;
    return 0;
  };

  const handleScanFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { setIsScanning(false); return; }
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        
        let hasJsonData = false;
        
        // Cố gắng đọc QR Code trước
        if (code) {
          try {
            const jsonStr = atob(code.data);
            const data = JSON.parse(jsonStr);
            setContainerId(data.containerId || '');
            setContainerType(data.containerType || '20F');
            setBookingDate(data.bookingDate || new Date().toISOString().split('T')[0]);
            setSurchargeAtBooking(data.surcharge?.toString() || '');
            setFuelPriceAtBooking(data.fuelPrice?.toString() || '');
            hasJsonData = true;
            alert("Quét mã QR chuẩn thành công!");
          } catch (err) {
            try {
               const data = JSON.parse(code.data);
               setContainerId(data.containerId || '');
               setContainerType(data.containerType || '20F');
               setBookingDate(data.bookingDate || new Date().toISOString().split('T')[0]);
               setSurchargeAtBooking(data.surcharge?.toString() || '');
               setFuelPriceAtBooking(data.fuelPrice?.toString() || '');
               hasJsonData = true;
               alert("Quét mã QR chuẩn thành công!");
            } catch {
               // QR là text nguyên thuỷ, sẽ dùng OCR quét toàn bộ hình
            }
          }
        }

        // Nếu không có dữ liệu JSON từ QR, khởi chạy quét OCR đọc chữ trên ảnh
        if (!hasJsonData) {
           try {
               const { data: { text } } = await Tesseract.recognize(src, 'eng');
               const containerMatch = text.match(/[A-Za-z]{4}\s?\d{7}/);
               
               if (containerMatch) {
                 setContainerId(containerMatch[0].replace(/\s/g, '').toUpperCase());
                 alert("Đã nhận diện chữ ký Container từ ảnh (AI OCR)! Vui lòng nhập thủ công chi tiết phụ thu gốc.");
               } else {
                 if (code && code.data) {
                    setContainerId(code.data.substring(0, 30));
                    alert(`Không đọc được mã Container bằng mắt AI. Đã xài tạm mã thô từ QR: ${code.data.substring(0, 20)}...`);
                 } else {
                    alert("Không tìm thấy mã QR và máy quét AI cũng không đọc được Mã Container nào trên giấy.");
                 }
               }
           } catch {
               alert("Lỗi khi chạy quét ảnh AI OCR.");
           }
        }
        
        setIsScanning(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const handleCompare = () => {
    if (!containerId || !surchargeAtBooking) {
      alert("Vui lòng nhập đủ Mã Container và Phụ thu lúc làm lệnh.");
      return;
    }

    const currentFuelPrice = getLatestFuelPrice();
    const surchargeNow = getSurchargeFromPrice(currentFuelPrice, containerType);
    const sBooking = Number(surchargeAtBooking);
    const fBooking = Number(fuelPriceAtBooking) || 0;
    const delta = surchargeNow - sBooking;

    let status: 'increase' | 'decrease' | 'same' = 'same';
    if (delta > 0) status = 'increase';
    if (delta < 0) status = 'decrease';

    setResult({
      id: `RECON_${Date.now()}`,
      containerId,
      containerType,
      bookingDate,
      checkDate: new Date().toISOString().split('T')[0],
      fuelPriceAtBooking: fBooking,
      fuelPriceNow: currentFuelPrice,
      surchargeAtBooking: sBooking,
      surchargeNow,
      delta,
      status,
      createdAt: new Date().toISOString(),
    });
  };

  const handleSave = async () => {
    if (!result) return;
    try {
      await logiStorage.saveReconLog(result as ReconciliationLog);
      const updated = await logiStorage.getReconLogs();
      setReconLogs(updated);
      alert("Đã lưu log đối soát thành công!");
      setResult(null);
      setContainerId('');
      setSurchargeAtBooking('');
      setFuelPriceAtBooking('');
    } catch(e) {
      alert("Lỗi khi lưu log đối soát!");
    }
  };

  return (
    <div className={S.wrapper}>
      <div className={S.headerCol}>
        <h1 className={S.title}>ĐỐI SOÁT PHỤ THU</h1>
        <p className={S.subtitle}>So sánh phụ thu tại thời điểm cấp lệnh và thời điểm thực tế xe vào cổng.</p>
      </div>

      <div className={S.tabBar}>
        <button onClick={() => setActiveTab('scan')} className={S.tabBtn(activeTab === 'scan')}>
          <ClipboardCheck className="w-4 h-4" /> Mới / Đối soát
        </button>
        <button onClick={() => setActiveTab('history')} className={S.tabBtn(activeTab === 'history')}>
          <History className="w-4 h-4" /> Lịch sử Logs
        </button>
      </div>

      {activeTab === 'scan' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={S.scanGrid}>
          <div className={S.formCard}>
            <div className={S.formHeader}>
              <h2 className={S.formTitle}>Thông tin lệnh</h2>
              <div className={S.scanBtnRow}>
                <input type="file" ref={fileInputRef} onChange={handleScanFile} className="hidden" accept="image/*" />
                <button onClick={() => fileInputRef.current?.click()} disabled={!canEdit || isScanning} className={S.scanBtn(isScanning)} style={!canEdit ? {opacity:0.5, cursor:'not-allowed'} : {}}>
                  {isScanning ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                  {isScanning ? 'Đang quét...' : 'Quét QR'}
                </button>
              </div>
            </div>

            <div className={S.fieldsWrapper}>
              <div className={S.fieldRow2}>
                <div className={S.fieldGroup}>
                  <label className={S.label}>Mã Container</label>
                  <input type="text" value={containerId} onChange={e => setContainerId(e.target.value)} className={S.input} />
                </div>
                <div className={S.fieldGroup}>
                  <label className={S.label}>Loại Cont</label>
                  <select value={containerType} onChange={e => setContainerType(e.target.value as any)} className={S.selectInput}>
                    <option value="20F">20 Full</option>
                    <option value="40F">40 Full</option>
                    <option value="20E">20 Empty</option>
                    <option value="40E">40 Empty</option>
                    <option value="bulk">Hàng ngoài</option>
                  </select>
                </div>
              </div>

              <div className={S.fieldRow2}>
                <div className={S.fieldGroup}>
                  <label className={S.label}>Thời điểm cấp lệnh</label>
                  <input
                    type={isDateFocused ? "date" : "text"}
                    onFocus={() => setIsDateFocused(true)}
                    onBlur={() => setIsDateFocused(false)}
                    value={isDateFocused ? bookingDate : displayDate(bookingDate)}
                    onChange={e => setBookingDate(e.target.value)}
                    className={S.inputDate}
                  />
                </div>
                <div className={S.fieldGroup}>
                  <label className={S.label}>Giá dầu DO lúc cấp (VND)</label>
                  <input type="number" value={fuelPriceAtBooking} onChange={e => setFuelPriceAtBooking(e.target.value)} className={S.input} />
                </div>
              </div>

              <div className={S.fieldGroup}>
                <label className={S.label}>Phụ thu lúc cấp lệnh (VND)</label>
                <input type="number" value={surchargeAtBooking} onChange={e => setSurchargeAtBooking(e.target.value)} className={S.inputHighlight} />
              </div>

              <button onClick={handleCompare} disabled={!canEdit} className={S.compareBtn} style={!canEdit ? {opacity:0.5, cursor:'not-allowed'} : {}}>
                <RefreshCcw className="w-5 h-5" /> So sánh đối soát
              </button>
            </div>
          </div>

          <div className={S.resultPanel}>
            {!result ? (
              <div className={S.emptyResult}>
                <AlertCircle className={S.emptyIcon} />
                <p className={S.emptyText}>Nhập thông tin và bấm So sánh để xem kết quả.</p>
              </div>
            ) : (
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={S.resultSpace}>
                <div className={S.comparisonCard}>
                  <div className={S.comparisonSideLeft}>
                    <p className={S.comparisonLabel}>Ban đầu</p>
                    <p className={S.comparisonValueOld}>{result.surchargeAtBooking?.toLocaleString()}</p>
                  </div>
                  <div className={S.comparisonArrow}><ArrowRight className="w-5 h-5" /></div>
                  <div className={S.comparisonSideRight}>
                    <p className={S.comparisonLabel}>Hiện tại</p>
                    <p className={S.comparisonValueNew}>{result.surchargeNow?.toLocaleString()}</p>
                  </div>
                </div>

                <div className={S.deltaCard}>
                  <p className={S.deltaLabel}>Chênh lệch</p>
                  <p className={S.deltaValue(result.status || 'same')}>
                    {result.status === 'increase' && '+'}{result.delta?.toLocaleString()} đ
                  </p>
                  <p className={S.deltaNote}>
                    {result.status === 'increase' && 'Khách hàng đóng thêm tiền phụ thu.'}
                    {result.status === 'decrease' && 'Cảng hoàn trả tiền chênh lệch phụ thu.'}
                    {result.status === 'same' && 'Phụ thu không thay đổi. Có thể tác nghiệp.'}
                  </p>
                </div>

                <button onClick={handleSave} disabled={!canEdit} className={S.saveBtn} style={!canEdit ? {opacity:0.5, cursor:'not-allowed'} : {}}>
                  <Save className="w-5 h-5" /> Lưu kết quả đối soát
                </button>
              </motion.div>
            )}
          </div>
        </motion.div>
      )}

      {activeTab === 'history' && (
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className={S.historyCard}>
          <div className={S.historyHeader}>
            <h2 className={S.historyTitle}>Lịch sử Đối Soát</h2>
          </div>
          <div className={S.historyScroll}>
            <div className={S.historyInner}>
              <table className={S.historyTable}>
                <thead className={S.historyThead}>
                  <tr>
                    <th className={S.historyTh}>Container</th>
                    <th className={S.historyThCenter}>Ngày cấp lệnh</th>
                    <th className={S.historyThRight}>Phụ thu cũ</th>
                    <th className={S.historyThRight}>Phụ thu mới</th>
                    <th className={S.historyThRight}>Chênh lệch</th>
                    <th className={S.historyThCenter}>KL</th>
                  </tr>
                </thead>
                <tbody>
                  {reconLogs.map(log => (
                    <tr key={log.id} className={S.historyRow}>
                      <td className={S.historyTd}>
                        <p className={S.historyContId}>{log.containerId}</p>
                        <p className={S.historyContType}>{log.containerType}</p>
                      </td>
                      <td className={S.historyTdCenter}>{new Date(log.bookingDate).toLocaleDateString()}</td>
                      <td className={S.historyTdRight}>{log.surchargeAtBooking.toLocaleString()}</td>
                      <td className={S.historyTdRightIndigo}>{log.surchargeNow.toLocaleString()}</td>
                      <td className={S.historyTdRightDelta}>
                        <span className={S.deltaChip(log.status)}>
                          {log.status === 'increase' && '+'}{log.delta.toLocaleString()}
                        </span>
                      </td>
                      <td className={S.historyTdCenterAction}>
                        {log.status === 'increase' && <span className={S.statusChipIncrease}>Thu bù</span>}
                        {log.status === 'decrease' && <span className={S.statusChipDecrease}>Hoàn tiền</span>}
                        {log.status === 'same' && <span className={S.statusChipSame}>Giữ nguyên</span>}
                      </td>
                    </tr>
                  ))}
                  {reconLogs.length === 0 && (
                    <tr><td colSpan={6} className={S.historyEmpty}>Chưa có dữ liệu đối soát.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
