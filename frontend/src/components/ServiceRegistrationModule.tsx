import React, { useState, useEffect, useRef, useCallback } from 'react';
import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.min.css';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { logiStorage } from '../lib/storage';
import { useAppContext } from '../context/AppContext';
import { RegistrationServiceItem, RegistrationLineItem, RegistrationHistoryItem } from '../types';
import * as S from '../styles/ServiceRegistrationModule.styles';

const cBtnStyle = (bg: string, disabled = false): React.CSSProperties => ({ background: bg, color: '#fff', border: 'none', borderRadius: 5, padding: '7px 10px', fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 13, width: '100%', transition: 'opacity 0.2s', opacity: disabled ? 0.5 : 1 });

const T: any = {
  vi: {
    title: 'Đăng ký dịch vụ', sub: 'Phát triển bởi: Tiền/Cảng Tân Thuận', history: 'Lịch sử', lang: 'EN / VI',
    info: 'Thông tin chung', act: 'Xem trước',
    no: 'Số đăng ký', date: 'Ngày đăng ký', cus: 'Tên khách hàng', addr: 'Địa chỉ', phone: 'Điện thoại', wdate: 'Thời gian cập cảng', ldate: 'Thời gian rời cảng', cty: 'Phương tiện',
    cg: 'Hàng hóa', cgo: 'Nhập loại hàng', nts: 'Ghi chú',
    ph: 'Phương án', sz: 'Size', sl: 'SL', tl: 'Manifest', ttl: 'Total', sr: '- Chọn phương án -', add: '+ Thêm dòng',
    new: 'Tạo mới', sav: 'Lưu', upd: 'Cập nhật', pdf: 'In / Xuất PDF', pw: 'Bản xem trước (A4)',
    warn: 'Trống', pdt: 'ĐĂNG KÝ DỊCH VỤ',
    notesHeader: 'Lưu ý:',
    note1: 'Chúng tôi ghi nhận theo thông tin khách hàng cung cấp, vui lòng kiểm tra lại phương án.',
    note2: 'Khi thay đổi kế hoạch làm hàng: vui lòng liên hệ, báo lại thời gian mới để chúng tôi chuẩn bị phương tiện, thiết bị...',
    note3: 'Đối với phương án đóng/rút/sang container, chúng tôi không chịu trách nhiệm việc tháo gỡ, chằng buộc hàng hoá, cũng như các hư hỏng bên trong container như xước, gãy ván sàn...',
    note4: 'Nếu hàng hoá thực tế khác thông tin ban đầu hoặc ngoài khả năng đáp ứng của thiết bị tại Cảng. Phương án làm hàng sẽ được điều chỉnh theo hiện trường.',
    unitTons: 'tấn',
    unitItem: 'ĐVT',
    stt: 'STT',
  },
  en: {
    title: 'Service Registration', sub: 'Developed by: Tien/Tan Thuan', history: 'History', lang: 'EN / VI',
    info: 'General Info', act: 'Preview',
    no: 'Reg No.', date: 'Date', cus: 'Customer Name', addr: 'Address', phone: 'Phone', wdate: 'ETA', ldate: 'ETD', cty: 'Transport Type',
    cg: 'Cargo Type', cgo: 'Other Cargo', nts: 'Notes',
    ph: 'Service', sz: 'Size', sl: 'Qty', tl: 'Manifest Wt', ttl: 'Total Wt', sr: '- Select -', add: '+ Add Row',
    new: 'New', sav: 'Save', upd: 'Update', pdf: 'Print/PDF', pw: 'A4 Preview',
    warn: 'Empty', pdt: 'SERVICE REGISTRATION',
    notesHeader: 'Notes:',
    note1: 'We record the information based on the details provided by the customer; please review the handling plan carefully.',
    note2: 'If there are any changes to the work schedule, please contact us to provide the new time so we can prepare the necessary vehicles and equipment.',
    note3: 'For stuffing/unstuffing services, we are not responsible for lashing/unlashing or securing/unsecuring cargo, nor for any internal container damages such as scratches, broken floorboards, etc.',
    note4: 'If the actual cargo differs from the initial information or exceeds the handling capacity of the Port’s equipment, the cargo handling plan will be adjusted according to on-site conditions.',
    unitTons: 'tons',
    unitItem: 'Unit',
    stt: 'No.',
  }
};

export default function ServiceRegistrationModule() {
  const { isAdminMode, userRole } = useAppContext();
  const canEdit = isAdminMode && userRole !== 'guest';

  const [lang, setLang] = useState<'vi'|'en'>('vi');
  const t = T[lang];
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const [services, setServices] = useState<RegistrationServiceItem[]>([]);
  const [historyItems, setHistoryItems] = useState<RegistrationHistoryItem[]>([]);
  const [logoBase64, setLogoBase64] = useState('');

  const [regNo, setRegNo] = useState('');
  const [regDate, setRegDate] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [workingDate, setWorkingDate] = useState('');
  const [leaveDate, setLeaveDate] = useState('');
  const [cargoType, setCargoType] = useState('Phân bón');
  const [cargoTypeOther, setCargoTypeOther] = useState('');
  const [containerType, setContainerType] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<any[]>([{ id: `RI-${Date.now()}`, serviceName: '', size: "20'", quantity: 1, tlManifest: '' }]);

  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  
  const [serviceForm, setServiceForm] = useState({ name: '', unit: 'cont' });
  const [editServiceId, setEditServiceId] = useState<string | null>(null);

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceForm.name.trim()) return;
    const s: RegistrationServiceItem = {
      id: editServiceId || Date.now().toString(),
      name: serviceForm.name,
      unit: serviceForm.unit || 'cont'
    };
    let newServices;
    if (editServiceId) {
      newServices = services.map(x => x.id === editServiceId ? s : x);
    } else {
      newServices = [...services, s];
    }
    setServices(newServices);
    localStorage.setItem(`logipro_registration_tariff_${lang}`, JSON.stringify(newServices));
    setServiceForm({ name: '', unit: 'cont' });
    setEditServiceId(null);
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target!.result as ArrayBuffer), { type: 'array' });
        const json: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        const newList = json.map(r => {
          let name = '', unit = 'cont';
          for(const k in r) {
            const kl = k.toLowerCase().trim();
            if (kl === 'name' || kl.includes('tên') || kl.includes('dịch vụ')) name = String(r[k]||'');
            if (kl === 'unit' || kl.includes('đvt') || kl.includes('đơn vị')) unit = String(r[k]||'cont');
          }
          if(!name) name = String(r['Tên Dịch vụ'] || r['Name'] || r['Tên'] || '');
          if(unit === 'cont') unit = String(r['Đơn vị tính'] || r['Unit'] || r['ĐVT'] || 'cont');
          return { id: Math.random().toString(36).substr(2, 9), name: name.trim(), unit: unit.trim() };
        }).filter(x => x.name);
        
        if (newList.length === 0) return alert('Không tìm thấy dữ liệu hợp lệ (Cột: Tên Dịch Vụ, Đơn Vị Tính)');
        if (confirm(`Tìm thấy ${newList.length} phương án. Xóa toàn bộ hiển thị cũ và thay thế bằng File Excel này?`)) {
          setServices(newList);
          localStorage.setItem(`logipro_registration_tariff_${lang}`, JSON.stringify(newList));
          alert('Import thành công! Dữ liệu đã lưu cục bộ trên máy của bạn.');
        }
      } catch (err) { alert('Lỗi định dạng tệp Excel: ' + (err as Error).message); }
      finally { e.target.value = ''; }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleExportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(services.map(s => ({ 'Tên Dịch vụ': s.name, 'Đơn vị tính': s.unit })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Services');
    XLSX.writeFile(wb, 'Danh_muc_dich_vu.xlsx');
  };

  const handleExportHistory = () => {
    const ws = XLSX.utils.json_to_sheet(historyItems.map(h => ({
      'Ngày ĐK': new Date(h.registrationDate).toLocaleDateString('vi-VN'),
      'Số phiếu': h.registrationNumber,
      'Khách hàng': h.customerName,
      'Ngày làm hàng': new Date(h.workingDate).toLocaleDateString('vi-VN'),
      'Hàng hóa': h.cargoType,
      'Loại Cont': h.containerType
    })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'History');
    XLSX.writeFile(wb, 'Lich_su_dang_ky.xlsx');
  };
  
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const a4Ref = useRef<HTMLDivElement>(null);

  const PRE_CARGO = ['Phân bón', 'Vải cuộn', 'Nông sản', 'Pallet Hạt nhựa', 'Gạch', 'Tôn cuộn', 'Cao su', 'Sứ vệ sinh', 'Container rỗng', 'Container hàng', 'Phương án khác'];

  const CARGO_MAP: Record<string, { vi: string, en: string }> = {
    'Phân bón': { vi: 'Phân bón', en: 'Fertilizer' },
    'Vải cuộn': { vi: 'Vải cuộn', en: 'Fabric Rolls' },
    'Nông sản': { vi: 'Nông sản', en: 'Agricultural Products' },
    'Pallet Hạt nhựa': { vi: 'Pallet Hạt nhựa', en: 'Plastic Resin Pallets' },
    'Gạch': { vi: 'Gạch', en: 'Bricks' },
    'Tôn cuộn': { vi: 'Tôn cuộn', en: 'Steel Coils' },
    'Cao su': { vi: 'Cao su', en: 'Rubber' },
    'Sứ vệ sinh': { vi: 'Sứ vệ sinh', en: 'Ceramic Sanitary Ware' },
    'Container rỗng': { vi: 'Container rỗng', en: 'Empty container' },
    'Container hàng': { vi: 'Container hàng', en: 'Laden container' },
    'Phương án khác': { vi: 'Phương án khác', en: 'Other Cargo' }
  };

  const VEHICLE_MAP: Record<string, { vi: string, en: string }> = {
    'Xe': { vi: 'Xe', en: 'Truck' },
    'Ghe': { vi: 'Ghe', en: 'Wooden boat' },
    'Salan': { vi: 'Sà lan', en: 'Barge' }
  };

  const regDateRef = useRef<HTMLInputElement>(null);
  const workDateRef = useRef<HTMLInputElement>(null);
  const leaveDateRef = useRef<HTMLInputElement>(null);
  const fpRegDate = useRef<flatpickr.Instance | null>(null);
  const fpWorkDate = useRef<flatpickr.Instance | null>(null);
  const fpLeaveDate = useRef<flatpickr.Instance | null>(null);

  const initFlatpickr = useCallback(() => {
    const fpConfig: flatpickr.Options.Options = {
      enableTime: true,
      time_24hr: true,
      dateFormat: 'd/m/Y H:i',
      defaultDate: new Date(),
    };
    if (regDateRef.current) {
      fpRegDate.current = flatpickr(regDateRef.current, {
        ...fpConfig,
        onChange: (_, dateStr) => setRegDate(dateStr),
      });
      setRegDate(fpRegDate.current.formatDate(new Date(), 'd/m/Y H:i'));
    }
    if (workDateRef.current) {
      fpWorkDate.current = flatpickr(workDateRef.current, {
        ...fpConfig,
        onChange: (_, dateStr) => setWorkingDate(dateStr),
      });
      setWorkingDate(fpWorkDate.current.formatDate(new Date(), 'd/m/Y H:i'));
    }
    if (leaveDateRef.current) {
      fpLeaveDate.current = flatpickr(leaveDateRef.current, {
        ...fpConfig,
        onChange: (_, dateStr) => setLeaveDate(dateStr),
      });
      setLeaveDate(fpLeaveDate.current.formatDate(new Date(), 'd/m/Y H:i'));
    }
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    const img = new Image(); img.crossOrigin = 'anonymous'; img.src = base + '/assets/logo.png?t=' + Date.now();
    img.onload = () => {
      const cvs = document.createElement('canvas'); cvs.width = img.naturalWidth || img.width; cvs.height = img.naturalHeight || img.height;
      const ctx = cvs.getContext('2d'); if (ctx) { ctx.drawImage(img, 0, 0); setLogoBase64(cvs.toDataURL('image/png')); }
    };
    setRegNo(peekRegNo());
    initFlatpickr();
    return () => {
      window.removeEventListener('resize', handleResize);
      fpRegDate.current?.destroy();
      fpWorkDate.current?.destroy();
      fpLeaveDate.current?.destroy();
    };
  }, []);

  useEffect(() => {
    loadData(lang);
  }, [lang]);

  const loadData = async (currentLang: 'vi' | 'en') => {
    const key = `logipro_registration_tariff_${currentLang}`;
    const local = localStorage.getItem(key);
    if (!local) {
      const def = currentLang === 'vi' ? [
        { id: '1', name: 'Vận chuyển cont nội bộ Cảng', unit: 'cont' },
        { id: '2', name: 'Đóng hàng cont => xe', unit: 'cont' },
        { id: '3', name: 'Rút hàng xe => cont', unit: 'cont' },
        { id: '4', name: 'Đóng hàng từ Sà lan => Container', unit: 'cont' },
        { id: '5', name: 'Rút hàng từ Container => Sà lan (cont)', unit: 'cont' },
      ] : [
        { id: '1', name: 'Internal container transport', unit: 'cont' },
        { id: '2', name: 'Stuffing from container to truck', unit: 'cont' },
        { id: '3', name: 'Unstuffing from truck to container', unit: 'cont' },
        { id: '4', name: 'Stuffing cargo from Barge -> Container', unit: 'cont' },
        { id: '5', name: 'Unstuffing cargo from Container => Barge (cont)', unit: 'cont' },
      ];
      setServices(def);
      localStorage.setItem(key, JSON.stringify(def));
    } else {
      setServices(JSON.parse(local));
    }
    setHistoryItems(await logiStorage.getRegistrations());
  };

  const formatNow = () => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  const peekRegNo = () => {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const counterKey = `logipro_dk_daily_counter_${dd}${mm}`;
    const next = parseInt(localStorage.getItem(counterKey) || '0', 10) + 1;
    return `ĐK${dd}${mm}-${String(next).padStart(3, '0')}`;
  };

  const advanceRegNo = () => {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const counterKey = `logipro_dk_daily_counter_${dd}${mm}`;
    const next = parseInt(localStorage.getItem(counterKey) || '0', 10) + 1;
    localStorage.setItem(counterKey, String(next));
    return `ĐK${dd}${mm}-${String(next).padStart(3, '0')}`;
  };

  const generateNewRegNo = () => {
    advanceRegNo();
    setRegNo(peekRegNo());
    const now = new Date();
    const nowStr = formatNow();
    setRegDate(nowStr); setWorkingDate(nowStr); setLeaveDate(nowStr);
    if (fpRegDate.current) { fpRegDate.current.setDate(now, false); }
    if (fpWorkDate.current) { fpWorkDate.current.setDate(now, false); }
    if (fpLeaveDate.current) { fpLeaveDate.current.setDate(now, false); }
    setCustomerName(''); setCustomerAddress(''); setCustomerPhone(''); setCargoType('Phân bón'); setCargoTypeOther(''); setContainerType(''); setNotes('');
    setItems([{ id: `RI-${Date.now()}`, serviceName: '', size: "20'", quantity: 1, tlManifest: '' }]);
    setPreviewImg(null);
  };

  const handleSave = async () => {
    if (!regNo || !customerName) return alert(t.warn);
    const reg: RegistrationHistoryItem = {
      id: `REG-${regNo}`, registrationNumber: regNo, registrationDate: regDate, customerName, customerAddress, customerPhone,
      workingDate, leaveDate, cargoType: cargoType === 'Phương án khác' ? cargoTypeOther : cargoType, containerType, customerNotes: notes,
      items: items.filter(x => x.serviceName).map(x => ({
        ...x,
        quantity: parseInt(x.quantity) || 0,
        tlManifest: parseFloat(x.tlManifest) || 0,
      })),
      createdAt: new Date().toISOString()
    };
    await logiStorage.saveRegistration(reg); setHistoryItems([...historyItems, reg]); alert("Done");
    advanceRegNo();
    setRegNo(peekRegNo());
  };

  const handleUpdate = async () => {
    if (!a4Ref.current) return;
    setIsRendering(true);
    try {
      const canvas = await html2canvas(a4Ref.current, { scale: 1.5, useCORS: true, logging: false });
      setPreviewImg(canvas.toDataURL('image/jpeg', 0.85));
    } finally { setIsRendering(false); }
  };

  const handleExportPdf = async () => {
    if (!a4Ref.current) return;
    setIsRendering(true);
    try {
      const canvas = await html2canvas(a4Ref.current, { scale: 1.5, useCORS: true });
      const imgData = canvas.toDataURL('image/jpeg', 0.85);
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      pdf.addImage(imgData, 'JPEG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight(), undefined, 'FAST');
      pdf.save(`DKDV_${regNo}.pdf`);
    } finally { setIsRendering(false); }
  };

  return (
    <div style={S.root(isMobile)}>
      
      {/* HEADER */}
      <div style={S.header}>
        <div>
          <h1 style={S.headerTitle}>{t.title}</h1>
          <p style={S.headerSub}>{t.sub}</p>
        </div>
        <div style={S.headerActions}>
          <button onClick={() => setIsServiceModalOpen(true)} style={S.cBtn('#6c757d')}>📋 {lang==='vi'?'Dịch vụ':'Services'}</button>
          <button onClick={() => setIsHistoryModalOpen(true)} style={S.cBtn('#fd7e14')}>{t.history}</button>
          <button onClick={() => setLang(l => l==='vi'?'en':'vi')} style={S.cBtn('#6f42c1')}>{t.lang}</button>
        </div>
      </div>

      <div className="responsive-grid" style={S.mainGrid(isMobile)}>
        
        {/* LEFT FORM */}
        <div style={S.formCard}>
          <h2 style={S.sectionTitle}>{t.info}</h2>
          
          <div style={S.fieldRow2}>
            <div><div style={S.cLabel}>{t.no}</div><input style={S.cInput} value={regNo} onChange={e=>setRegNo(e.target.value)} /></div>
            <div><div style={S.cLabel}>{t.date}</div><input ref={regDateRef} style={S.cInput} type="text" value={regDate} readOnly placeholder="dd/mm/yyyy HH:mm" /></div>
          </div>
          <div style={S.fieldRowSingle}><div style={S.cLabel}>{t.cus}</div><input style={S.cInput} value={customerName} onChange={e=>setCustomerName(e.target.value)} /></div>
          <div style={S.fieldRow2}>
            <div><div style={S.cLabel}>{t.addr}</div><input style={S.cInput} value={customerAddress} onChange={e=>setCustomerAddress(e.target.value)} /></div>
            <div><div style={S.cLabel}>{t.phone}</div><input style={S.cInput} value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)} /></div>
          </div>
          <div style={S.fieldRow2}>
            <div><div style={S.cLabel}>{t.wdate}</div><input ref={workDateRef} style={S.cInput} type="text" value={workingDate} readOnly placeholder="dd/mm/yyyy HH:mm" /></div>
            <div><div style={S.cLabel}>{t.ldate}</div><input ref={leaveDateRef} style={S.cInput} type="text" value={leaveDate} readOnly placeholder="dd/mm/yyyy HH:mm" /></div>
          </div>
          <div style={S.fieldRow2}>
            <div>
              <div style={S.cLabel}>{t.cty}</div>
              <select style={S.cInput} value={containerType} onChange={e=>setContainerType(e.target.value)}>
                <option value="">----</option>
                {Object.keys(VEHICLE_MAP).map(k => (
                  <option key={k} value={k}>{VEHICLE_MAP[k][lang]}</option>
                ))}
              </select>
            </div>
            <div>
              <div style={S.cLabel}>{t.cg}</div>
              <select style={S.cInput} value={cargoType} onChange={e=>setCargoType(e.target.value)}>
                {PRE_CARGO.map(c => {
                  const label = CARGO_MAP[c]?.[lang] || c;
                  return <option key={c} value={c}>{label}</option>;
                })}
              </select>
            </div>
          </div>
          {cargoType === 'Phương án khác' ? (
            <div style={S.fieldRowSingle}><div style={S.cLabel}>{t.cgo}</div><input style={S.cInput} value={cargoTypeOther} onChange={e=>setCargoTypeOther(e.target.value)} /></div>
          ) : null}
          <div style={S.fieldRowNotes}><div style={S.cLabel}>{t.nts}</div><input style={S.cInput} value={notes} onChange={e=>setNotes(e.target.value)} /></div>

          {/* TABLE */}
          <div style={S.tableScroll}>
            <table style={S.table}>
              <thead>
                <tr style={S.theadRow}>
                  <th style={{...S.cTh, textAlign: 'center', minWidth: 220}}>{t.ph}</th>
                  <th style={{...S.cTh, width: 60, textAlign: 'center'}}>{t.sz}</th>
                  <th style={{...S.cTh, width: 60, textAlign: 'center'}}>{t.sl}</th>
                  <th style={{...S.cTh, width: 75, textAlign: 'center'}}>{t.tl}</th>
                  <th style={{...S.cTh, width: 75, textAlign: 'center'}}>{t.ttl}</th>
                  <th style={{...S.cTh, width: 28}}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const s = services.find(x => x.name === it.serviceName);
                  return (
                  <tr key={it.id}>
                    <td style={S.cTd}>
                      <select style={{...S.cInput, padding: '3px 6px', fontSize: 12, width: '100%', textOverflow: 'ellipsis'}} value={it.serviceName} onChange={e => { const nm = [...items]; nm[idx].serviceName = e.target.value; setItems(nm); }}>
                        <option value="">{t.sr}</option>
                        {services.map(s => <option key={s.id} value={s.name}>{s.name} ({s.unit})</option>)}
                      </select>
                    </td>
                    <td style={S.cTd}>
                      <select style={{...S.cInput, padding: '3px 6px', fontSize: 12, textAlign: 'center'}} value={it.size} onChange={e => { const nm = [...items]; nm[idx].size = e.target.value; setItems(nm); }}>
                        {["20'", "40'", "45'"].map(sz => <option key={sz} value={sz}>{sz}</option>)}
                      </select>
                    </td>
                    <td style={S.cTd}>
                      <input style={{...S.cInput, padding: '3px 4px', fontSize: 12, textAlign:'center'}} type="number" min="1" value={it.quantity} onChange={e => { const val = e.target.value; const nm = [...items]; nm[idx].quantity = val === '' ? '' : parseInt(val) || 0; setItems(nm); }} />
                    </td>
                    <td style={S.cTd}>
                      <input style={{...S.cInput, padding: '3px 4px', fontSize: 12, textAlign:'center'}} type="number" min="0" step="1" value={it.tlManifest} onChange={e => { const val = e.target.value; const nm = [...items]; nm[idx].tlManifest = val === '' ? '' : parseFloat(val) || 0; setItems(nm); }} />
                    </td>
                    <td style={{...S.cTd, textAlign: 'center', fontWeight: 'bold', fontSize: 12}}>
                      {((parseFloat(it.quantity) || 0) * (parseFloat(it.tlManifest) || 0)).toLocaleString()}
                    </td>
                    <td style={{...S.cTd, textAlign:'center'}}>
                      <button onClick={()=>setItems(items.filter((_,i)=>i!==idx))} disabled={!canEdit} style={{...S.removeRowBtn, ...(canEdit ? {} : {opacity:0.5, cursor:'not-allowed'})}}>×</button>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
          <button onClick={()=>setItems([...items, {id:`RI-${Date.now()}`, serviceName:'', size:"20'", quantity:1, tlManifest:''}])} disabled={!canEdit} style={{...S.addRowBtn, ...(canEdit ? {} : {opacity:0.5, cursor:'not-allowed'})}}>{t.add}</button>
        </div>

        {/* RIGHT PANEL */}
        <div>
          <div style={S.rightCard}>
            <h2 style={S.sectionTitle}>{t.act}</h2>
            
            <div style={S.actionGrid}>
               <button onClick={generateNewRegNo} disabled={!canEdit} style={cBtnStyle('#6c757d', !canEdit)}>{t.new}</button>
               <button onClick={handleSave} disabled={!canEdit} style={cBtnStyle('#4361ee', !canEdit)}>{t.sav}</button>
               <button onClick={handleUpdate} disabled={!canEdit || isRendering} style={cBtnStyle('#28a745', !canEdit)}>{isRendering ? '...' : t.upd}</button>
               <button onClick={handleExportPdf} disabled={!canEdit || isRendering} style={cBtnStyle('#dc3545', !canEdit)}>{t.pdf}</button>
            </div>

            {previewImg ? (
              <div style={S.previewBorder}>
                <img src={previewImg} alt="Preview" style={S.previewImg} />
              </div>
            ) : (
              <div style={S.previewPlaceholder}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14,2 14,8 20,8" /></svg>
                <span style={S.previewLabel}>{t.pw}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* HIDDEN A4 FOR HTML2CANVAS */}
      <div style={S.hiddenWrapper}>
        <div ref={a4Ref} style={S.a4Page}>
           <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  {logoBase64 && <img src={logoBase64} alt="CSG" style={{ width: 80, height: 80, objectFit: 'contain' }} />}
                  <div style={{ marginLeft: 10 }}>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 'bold' }}>TTĐH KHAI THÁC TÂN THUẬN</h3>
                      <p style={{ margin: '4px 0 0', fontSize: 13 }}>Điện thoại: 0901 196 093</p>
                      <p style={{ margin: '4px 0 0', fontSize: 13 }}>Địa chỉ: 18B Lưu Trọng Lư, Tân Thuận, HCM</p>
                      <p style={{ margin: '4px 0 0', fontSize: 13 }}>Email: doc.tt@saigonport.vn</p>
                  </div>
              </div>
              <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <p style={{ margin: 0, fontSize: 14 }}>{lang === 'vi' ? 'Số:' : 'No.:'} <span style={{ color: '#000' }}>{regNo}</span></p>
                  <p style={{ margin: '6px 0 0', fontSize: 14 }}><strong>{lang === 'vi' ? 'Ngày' : 'Date'}:</strong> {regDate || '...'}</p>
              </div>
           </div>
           <h1 style={{ textAlign: 'center', fontSize: 22, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 20 }}>{t.pdt}</h1>
           <table style={{ width: '100%', fontSize: 13, marginBottom: 20 }}>
              <tbody>
                <tr><td style={{ width: '130px', whiteSpace: 'nowrap', fontWeight: 'bold', padding: '4px 0' }}>{t.cus}:</td><td style={{ padding: '4px 0' }}>{customerName||'...'}</td></tr>
                <tr><td style={{ whiteSpace: 'nowrap', fontWeight: 'bold', padding: '4px 0' }}>{t.addr}:</td><td style={{ padding: '4px 0' }}>{customerAddress||'...'}</td></tr>
                <tr><td style={{ whiteSpace: 'nowrap', fontWeight: 'bold', padding: '4px 0' }}>{t.phone}:</td><td style={{ padding: '4px 0' }}>{customerPhone||'...'}</td></tr>
                <tr><td style={{ whiteSpace: 'nowrap', fontWeight: 'bold', padding: '4px 0' }}>{t.wdate}:</td><td style={{ padding: '4px 0', fontWeight: 'bold', color: '#d32f2f' }}>{workingDate || '...'}</td></tr>
                <tr><td style={{ whiteSpace: 'nowrap', fontWeight: 'bold', padding: '4px 0' }}>{t.ldate}:</td><td style={{ padding: '4px 0', fontWeight: 'bold', color: '#d32f2f' }}>{leaveDate || '...'}</td></tr>
                <tr><td style={{ whiteSpace: 'nowrap', fontWeight: 'bold', padding: '4px 0' }}>{t.cg}:</td><td style={{ padding: '4px 0' }}>{cargoType==='Phương án khác'?cargoTypeOther:(CARGO_MAP[cargoType]?.[lang]||cargoType)}</td></tr>
                <tr><td style={{ whiteSpace: 'nowrap', fontWeight: 'bold', padding: '4px 0' }}>{t.cty}:</td><td style={{ padding: '4px 0' }}>{VEHICLE_MAP[containerType]?.[lang]||'----'}</td></tr>
              </tbody>
           </table>
           <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 20 }}>
              <thead style={{ background: '#f2f2f2' }}>
                <tr>
                   <th style={{ border: '1px solid #333', padding: 8, width: '5%' }}>{t.stt}</th><th style={{ border: '1px solid #333', padding: 8, textAlign: 'center', width: '35%' }}>{t.ph}</th>
                   <th style={{ border: '1px solid #333', padding: 8 }}>{t.sz}</th><th style={{ border: '1px solid #333', padding: 8 }}>{t.unitItem}</th>
                   <th style={{ border: '1px solid #333', padding: 8 }}>{t.sl}</th>
                   <th style={{ border: '1px solid #333', padding: 8 }}>{t.unitItem}</th><th style={{ border: '1px solid #333', padding: 8 }}>{t.tl}</th><th style={{ border: '1px solid #333', padding: 8 }}>{t.ttl} ({t.unitTons})</th>
                </tr>
              </thead>
              <tbody>
                {items.filter(x => x.serviceName).map((item, idx) => {
                   const s = services.find(x => x.name === item.serviceName);
                   return (
                     <tr key={idx}>
                       <td style={{ border: '1px solid #333', padding: 8, textAlign: 'center' }}>{idx + 1}</td>
                       <td style={{ border: '1px solid #333', padding: 8, fontWeight: 'bold' }}>{item.serviceName}</td>
                       <td style={{ border: '1px solid #333', padding: 8, textAlign: 'center' }}>{item.size}</td><td style={{ border: '1px solid #333', padding: 8, textAlign: 'center' }}>{s?s.unit:'-'}</td>
                       <td style={{ border: '1px solid #333', padding: 8, textAlign: 'center', fontWeight: 'bold', color: '#d32f2f' }}>{item.quantity}</td>
                       <td style={{ border: '1px solid #333', padding: 8, textAlign: 'center' }}>{t.unitTons}</td>
                       <td style={{ border: '1px solid #333', padding: 8, textAlign: 'center' }}>{item.tlManifest || ''}</td>
                       <td style={{ border: '1px solid #333', padding: 8, textAlign: 'center', fontWeight: 'bold' }}>{((parseFloat(item.quantity) || 0) * (parseFloat(item.tlManifest) || 0)).toLocaleString()}</td>
                     </tr>
                   )
                })}
              </tbody>
           </table>
           <div style={{ background: '#f9f9f9', border: '1px solid #ccc', padding: 12, fontSize: 12 }}>
               <p style={{ margin: '0 0 6px 0', fontWeight: 'bold', textDecoration: 'underline' }}>{t.notesHeader}</p>
               <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', lineHeight: 1.6 }}>
                 <li style={{ marginBottom: 4, display: 'flex', gap: 6 }}><span style={{ color: '#28a745' }}>✔</span><span>{t.note1}</span></li>
                 <li style={{ marginBottom: 4, display: 'flex', gap: 6 }}><span style={{ color: '#28a745' }}>✔</span><span>{t.note2}</span></li>
                 <li style={{ marginBottom: 4, display: 'flex', gap: 6 }}><span style={{ color: '#28a745' }}>✔</span><span>{t.note3}</span></li>
                 <li style={{ display: 'flex', gap: 6 }}><span style={{ color: '#28a745' }}>✔</span><span>{t.note4}</span></li>
               </ul>
            </div>
        </div>
      </div>

      {/* ALL MODALS (Service + History) */}
      {isServiceModalOpen && (
        <div style={S.modalBackdrop}>
          <div style={S.modalBox(700)}>
            <div style={S.modalHeader}>
              <h3 style={S.modalTitle}>Quản lý Dịch vụ (Phương án)</h3>
              <button onClick={() => setIsServiceModalOpen(false)} style={S.modalClose}>X</button>
            </div>
            <div style={S.modalActionsRow}>
              <label style={S.importBtn}>
                Import Excel <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImportExcel} />
              </label>
              <button onClick={handleExportExcel} style={S.exportBtn}>Export Excel</button>
            </div>
            <form onSubmit={handleSaveService} style={S.serviceForm}>
              <div style={S.serviceFormName}><div style={S.cLabel}>Tên Dịch vụ</div><input style={S.cInput} value={serviceForm.name} onChange={e=>setServiceForm({...serviceForm, name: e.target.value})} required /></div>
              <div style={S.serviceFormUnit}><div style={S.cLabel}>Đơn vị tính</div><input style={S.cInput} value={serviceForm.unit} onChange={e=>setServiceForm({...serviceForm, unit: e.target.value})} required /></div>
              <button type="submit" style={S.saveBtn}>Lưu</button>
              {editServiceId && <button type="button" onClick={()=>{setEditServiceId(null); setServiceForm({name:'', unit:'cont'});}} style={S.cancelBtn}>Hủy</button>}
            </form>
            <div style={{ overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ background: '#e9ecef' }}><th style={S.cTh}>Tên Dịch vụ</th><th style={{...S.cTh, textAlign: 'center'}}>Đơn vị tính</th><th style={{...S.cTh, textAlign: 'center'}}>Hành động</th></tr></thead>
                <tbody>
                  {services.map(s => (
                    <tr key={s.id}>
                      <td style={S.cTd}>{s.name}</td>
                      <td style={{...S.cTd, textAlign: 'center'}}>{s.unit}</td>
                      <td style={{...S.cTd, textAlign: 'center'}}>
                        <button onClick={()=>{setEditServiceId(s.id); setServiceForm({name: s.name, unit: s.unit});}} style={S.editBtn}>Xem</button>
                        <button onClick={()=>{if(confirm('Xóa?')){ const newList = services.filter(x=>x.id!==s.id); setServices(newList); localStorage.setItem(`logipro_registration_tariff_${lang}`, JSON.stringify(newList)); }}} style={S.deleteBtn}>Xóa</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {isHistoryModalOpen && (
        <div style={S.modalBackdrop}>
          <div style={S.modalBox(800)}>
            <div style={S.modalHeader}>
              <h3 style={S.modalTitle}>Lịch sử Đăng ký Dịch vụ</h3>
              <button onClick={() => setIsHistoryModalOpen(false)} style={S.modalClose}>X</button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
              <button onClick={handleExportHistory} style={S.historyExportBtn}>Xuất Lịch sử ra Excel</button>
            </div>
            <div style={{ overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ background: '#e9ecef' }}><th style={S.cTh}>Ngày ĐK</th><th style={S.cTh}>Số đăng ký</th><th style={S.cTh}>Khách hàng</th><th style={S.cTh}>Ngày dự kiến làm hàng</th><th style={{...S.cTh, textAlign: 'center'}}>Hành động</th></tr></thead>
                <tbody>
                  {[...historyItems].reverse().map(h => (
                    <tr key={h.id}>
                      <td style={S.cTd}>{new Date(h.registrationDate).toLocaleDateString('vi-VN')}</td>
                      <td style={{...S.cTd, color: '#4361ee', fontWeight: 'bold'}}>{h.registrationNumber}</td>
                      <td style={S.cTd}>{h.customerName}</td>
                      <td style={S.cTd}>{new Date(h.workingDate).toLocaleDateString('vi-VN')}</td>
                      <td style={{...S.cTd, textAlign: 'center'}}>
                        <button onClick={()=>{setRegNo(h.registrationNumber); setCustomerName(h.customerName); setCustomerAddress(h.customerAddress); setCustomerPhone(h.customerPhone); setCargoType(PRE_CARGO.includes(h.cargoType)?h.cargoType:''); setContainerType(h.containerType); setWorkingDate(h.workingDate||''); setLeaveDate(h.leaveDate||''); setItems(h.items||[]); setIsHistoryModalOpen(false);}} style={S.historyViewBtn}>Xem lại</button>
                      </td>
                    </tr>
                  ))}
                  {historyItems.length === 0 && <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: '#6c757d' }}>Không tìm thấy dữ liệu.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
