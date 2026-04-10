import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  QrCode,
  ClipboardCheck,
  History,
  ArrowRight,
  Save,
  AlertCircle,
  RefreshCcw,
  FileSpreadsheet,
  Download,
  ArrowUpDown,
  Filter,
  ChevronUp,
  ChevronDown,
  Search,
  GitCompareArrows,
  BarChart3,
  Upload,
  CheckCircle2,
  PlusCircle,
  Repeat2,
} from 'lucide-react';
import { motion } from 'motion/react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useAppContext } from '../context/AppContext';
import {
  buildManualReconciliationResult,
  buildProcessedRows,
  clearReconciliationCurrentSession,
  compareTwoDayReconciliation,
  ComparisonHistoryItem,
  CrossDayComparedRow,
  CrossDayComparisonResult,
  deleteComparisonHistoryItem,
  deleteReconciliationImportHistory,
  exportCrossDayComparisonToExcel,
  exportProcessedRowsToExcel,
  getFuelPriceForDate,
  ImportedOrderRow,
  loadComparisonHistory,
  loadComparisonSession,
  loadReconciliationActiveTab,
  loadReconciliationCurrentSession,
  loadReconciliationImportHistory,
  parseImportedOrders,
  ProcessedOrderRow,
  ReconciliationImportHistoryItem,
  ReconciliationStatus,
  ReconciliationValidationSummary,
  saveComparisonHistory,
  saveComparisonSession,
  saveReconciliationActiveTab,
  saveReconciliationCurrentSession,
  saveReconciliationImportHistory,
  summarizeProcessedRows,
  validateImportedOrders,
} from '../lib/reconciliation';
import { formatIsoDateToVi, getVietnamTodayIsoDate, normalizeDateInput } from '../lib/fuelPrices';
import { logiStorage } from '../lib/storage';
import { ReconciliationLog } from '../types';
import jsQR from 'jsqr';
import Tesseract from 'tesseract.js';

type ReconciliationTab = 'scan' | 'excel' | 'compare' | 'analysis' | 'history';

const todayIso = () => getVietnamTodayIsoDate();
const getAutoExecutionDate = (savedExecutionDate?: string) => {
  const today = todayIso();
  if (!savedExecutionDate) return today;
  const normalizedSaved = normalizeDateInput(savedExecutionDate);
  if (!normalizedSaved) return today;
  return normalizedSaved < today ? today : normalizedSaved;
};

const statusClasses: Record<ReconciliationStatus, string> = {
  increase: 'bg-rose-100 text-rose-700',
  decrease: 'bg-emerald-100 text-emerald-700',
  same: 'bg-slate-100 text-slate-700',
  missing: 'bg-amber-100 text-amber-700'
};

export default function ReconciliationModule() {
  const { prices, tiers, reconLogs, setReconLogs, isAdminMode, userRole } = useAppContext();
  const canEdit = isAdminMode && userRole !== 'guest';
  const [activeTab, setActiveTab] = useState<ReconciliationTab>('scan');

  const [containerId, setContainerId] = useState('');
  const [containerType, setContainerType] = useState<'20F' | '40F' | '20E' | '40E' | 'bulk'>('20F');
  const [bookingDate, setBookingDate] = useState(todayIso());
  const [executionDate, setExecutionDate] = useState(todayIso());
  const [isDateFocused, setIsDateFocused] = useState(false);
  const [isExecutionDateFocused, setIsExecutionDateFocused] = useState(false);
  const [fuelPriceAtBooking, setFuelPriceAtBooking] = useState('');
  const [surchargeAtBooking, setSurchargeAtBooking] = useState('');

  const [result, setResult] = useState<Partial<ReconciliationLog> | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isExcelProcessing, setIsExcelProcessing] = useState(false);
  const [importedOrders, setImportedOrders] = useState<ImportedOrderRow[]>([]);
  const [processedOrders, setProcessedOrders] = useState<ProcessedOrderRow[]>([]);
  const [excelSourceName, setExcelSourceName] = useState('');
  const [importHistory, setImportHistory] = useState<ReconciliationImportHistoryItem[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [validationSummary, setValidationSummary] = useState<ReconciliationValidationSummary | null>(null);
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [containerSearch, setContainerSearch] = useState('');

  // === Cross-day comparison state ===
  const [compareFileARows, setCompareFileARows] = useState<ProcessedOrderRow[]>([]);
  const [compareFileBRows, setCompareFileBRows] = useState<ProcessedOrderRow[]>([]);
  const [compareFileAName, setCompareFileAName] = useState('');
  const [compareFileBName, setCompareFileBName] = useState('');
  const [compareDateA, setCompareDateA] = useState(todayIso());
  const [compareDateB, setCompareDateB] = useState(todayIso());
  const [isCompareDateAFocused, setIsCompareDateAFocused] = useState(false);
  const [isCompareDateBFocused, setIsCompareDateBFocused] = useState(false);
  const [comparisonResult, setComparisonResult] = useState<CrossDayComparisonResult | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [compareViewSection, setCompareViewSection] = useState<'duplicate' | 'new' | 'completed'>('duplicate');
  const [comparisonHistory, setComparisonHistory] = useState<ComparisonHistoryItem[]>([]);
  const compareFileARef = useRef<HTMLInputElement>(null);
  const compareFileBRef = useRef<HTMLInputElement>(null);

  const qrFileInputRef = useRef<HTMLInputElement>(null);
  const excelFileInputRef = useRef<HTMLInputElement>(null);

  const displayDate = (yyyyMMdd: string) => formatIsoDateToVi(yyyyMMdd);

  const getRowsAfterExecutionDate = (rows: ImportedOrderRow[], nextExecutionDate: string) => {
    const normalizedExecutionDate = normalizeDateInput(nextExecutionDate);
    if (!normalizedExecutionDate) return [];

    return rows.filter(row => {
      const normalizedBookingDate = normalizeDateInput(row.bookingDate);
      return Boolean(normalizedBookingDate && normalizedBookingDate > normalizedExecutionDate);
    });
  };

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(processedOrders.length / pageSize));
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, pageSize, processedOrders.length]);

  useEffect(() => {
    const savedHistory = loadReconciliationImportHistory();
    const savedSession = loadReconciliationCurrentSession();
    const savedTab = loadReconciliationActiveTab();

    setImportHistory(savedHistory);
    setComparisonHistory(loadComparisonHistory());

    // Restore comparison session
    const savedComparison = loadComparisonSession();
    if (savedComparison) {
      setComparisonResult(savedComparison.result);
      setCompareFileAName(savedComparison.fileAName);
      setCompareFileBName(savedComparison.fileBName);
      setCompareDateA(savedComparison.dateA);
      setCompareDateB(savedComparison.dateB);
      setCompareFileARows(savedComparison.result.fileA.totalRows > 0 ? [] : []);  // rows not stored, just metadata
      setCompareFileBRows(savedComparison.result.fileB.totalRows > 0 ? [] : []);
    }

    if (savedSession && savedSession.rows.length > 0) {
      const restoredExecutionDate = getAutoExecutionDate(savedSession.executionDate);
      setImportedOrders(savedSession.rows);
      setProcessedOrders(savedSession.rows);
      setExcelSourceName(savedSession.sourceFilename);
      setExecutionDate(restoredExecutionDate);
      setValidationSummary(validateImportedOrders(savedSession.rows, prices, tiers, restoredExecutionDate));
      setActiveTab(savedTab === 'history' || savedTab === 'excel' || savedTab === 'scan' || savedTab === 'compare' || savedTab === 'analysis' ? savedTab : 'excel');
      saveReconciliationCurrentSession({
        sourceFilename: savedSession.sourceFilename,
        executionDate: restoredExecutionDate,
        rows: savedSession.rows,
      });
      return;
    }

    if (savedHistory.length > 0) {
      const latestHistory = savedHistory[0];
      const restoredExecutionDate = getAutoExecutionDate(latestHistory.executionDate);
      setImportedOrders(latestHistory.rows);
      setProcessedOrders(latestHistory.rows);
      setExcelSourceName(latestHistory.sourceFilename);
      setExecutionDate(restoredExecutionDate);
      setValidationSummary(validateImportedOrders(latestHistory.rows, prices, tiers, restoredExecutionDate));
      setActiveTab(savedTab === 'history' || savedTab === 'excel' || savedTab === 'scan' || savedTab === 'compare' || savedTab === 'analysis' ? savedTab : 'excel');
      saveReconciliationCurrentSession({
        sourceFilename: latestHistory.sourceFilename,
        executionDate: restoredExecutionDate,
        rows: latestHistory.rows,
      });
      return;
    }

    if (savedTab === 'history' || savedTab === 'excel' || savedTab === 'scan' || savedTab === 'compare' || savedTab === 'analysis') {
      setActiveTab(savedTab);
    }
  }, []);

  useEffect(() => {
    saveReconciliationActiveTab(activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (importedOrders.length === 0) {
      setValidationSummary(null);
      setProcessedOrders([]);
      return;
    }

    if (prices.length === 0 || tiers.length === 0) {
      return;
    }

    const nextValidationSummary = validateImportedOrders(importedOrders, prices, tiers, executionDate);
    setValidationSummary(nextValidationSummary);

    if (nextValidationSummary.status === 'blocked') {
      setProcessedOrders([]);
      return;
    }

    setProcessedOrders(buildProcessedRows(importedOrders, prices, tiers, executionDate));
  }, [executionDate, importedOrders, prices, tiers]);

  const displayDateTime = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return displayDate(value);
    return parsed.toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  const processExcelRows = async (rows: ImportedOrderRow[], sourceFilename: string) => {
    if (!executionDate) {
      alert('Vui lòng chọn ngày thực hiện trước khi xuất Excel.');
      return false;
    }

    const nextValidationSummary = validateImportedOrders(rows, prices, tiers, executionDate);
    if (nextValidationSummary.status === 'blocked') {
      setImportedOrders(rows);
      setProcessedOrders([]);
      setExcelSourceName(sourceFilename);
      setCurrentPage(1);
      const previewIssues = nextValidationSummary.issues
        .slice(0, 3)
        .map(issue => `- Dòng ${issue.rowIndex}: ${issue.message}`)
        .join('\n');
      setValidationSummary(nextValidationSummary);
      alert(
        `Dữ liệu bị chặn xuất vì có ${nextValidationSummary.errorCount} lỗi kiểm soát.\n${previewIssues}` +
        `${nextValidationSummary.issues.length > 3 ? '\n- ...' : ''}`
      );
      return false;
    }

    const nextProcessedRows = buildProcessedRows(rows, prices, tiers, executionDate);
    setImportedOrders(rows);
    setProcessedOrders(nextProcessedRows);
    setExcelSourceName(sourceFilename);
    setCurrentPage(1);
    setValidationSummary(nextValidationSummary);
    saveReconciliationCurrentSession({
      sourceFilename,
      executionDate,
      rows: nextProcessedRows,
    });
    setImportHistory(saveReconciliationImportHistory({
      sourceFilename,
      executionDate,
      rows: nextProcessedRows,
    }));
    return true;
  };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (prices.length === 0 || tiers.length === 0) {
      alert('Chưa có đủ dữ liệu giá dầu hoặc bảng phụ thu để đối soát.');
      e.target.value = '';
      return;
    }

    setIsExcelProcessing(true);
    try {
      const buffer = await file.arrayBuffer();
      const parsedRows = parseImportedOrders(buffer);

      if (parsedRows.length === 0) {
        alert('File Excel không có dòng dữ liệu hợp lệ để đối soát.');
        return;
      }

      const imported = await processExcelRows(parsedRows, file.name);
      if (imported) {
        alert(`Đã import ${parsedRows.length} dòng dữ liệu hợp lệ và vượt qua kiểm tra nghiệp vụ. Bạn có thể xem trước trên web rồi bấm Xuất Excel.`);
      }
    } catch (error) {
      console.error('[Reconciliation Excel] Import error:', error);
      alert(`Không thể xử lý file Excel: ${(error as Error).message}`);
    } finally {
      setIsExcelProcessing(false);
      e.target.value = '';
    }
  };

  const handleReExportExcel = async () => {
    if (processedOrders.length === 0) {
      alert('Chưa có dữ liệu Excel để xuất.');
      return;
    }

    setIsExcelProcessing(true);
    try {
      const sourceName = excelSourceName || 'du_lieu_lenh.xlsx';
      const nextValidationSummary = validateImportedOrders(importedOrders, prices, tiers, executionDate);
      if (nextValidationSummary.status === 'blocked') {
        setValidationSummary(nextValidationSummary);
        const previewIssues = nextValidationSummary.issues
          .slice(0, 3)
          .map(issue => `- Dòng ${issue.rowIndex}: ${issue.message}`)
          .join('\n');
        alert(
          `Không thể xuất vì có ${nextValidationSummary.errorCount} lỗi kiểm soát.\n${previewIssues}` +
          `${nextValidationSummary.issues.length > 3 ? '\n- ...' : ''}`
        );
        return;
      }

      const latestRows = buildProcessedRows(importedOrders, prices, tiers, executionDate);
      setProcessedOrders(latestRows);
      setCurrentPage(1);
      setValidationSummary(nextValidationSummary);
      saveReconciliationCurrentSession({
        sourceFilename: sourceName,
        executionDate,
        rows: latestRows,
      });
      const savedName = await exportProcessedRowsToExcel(latestRows, sourceName, executionDate, nextValidationSummary);
      alert(`Đã xuất file ${savedName}.`);
    } catch (error) {
      console.error('[Reconciliation Excel] Export error:', error);
      alert(`Không thể xuất lại file Excel: ${(error as Error).message}`);
    } finally {
      setIsExcelProcessing(false);
    }
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
        if (!ctx) {
          setIsScanning(false);
          return;
        }

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        let hasJsonData = false;

        if (code) {
          try {
            const jsonStr = atob(code.data);
            const data = JSON.parse(jsonStr);
            setContainerId(data.containerId || '');
            setContainerType(data.containerType || '20F');
            setBookingDate(data.bookingDate || todayIso());
            setSurchargeAtBooking(data.surcharge?.toString() || '');
            setFuelPriceAtBooking(data.fuelPrice?.toString() || '');
            hasJsonData = true;
            alert('Quét mã QR chuẩn thành công!');
          } catch {
            try {
              const data = JSON.parse(code.data);
              setContainerId(data.containerId || '');
              setContainerType(data.containerType || '20F');
              setBookingDate(data.bookingDate || todayIso());
              setSurchargeAtBooking(data.surcharge?.toString() || '');
              setFuelPriceAtBooking(data.fuelPrice?.toString() || '');
              hasJsonData = true;
              alert('Quét mã QR chuẩn thành công!');
            } catch {
              // noop
            }
          }
        }

        if (!hasJsonData) {
          try {
            const { data: { text } } = await Tesseract.recognize(src, 'eng');
            const containerMatch = text.match(/[A-Za-z]{4}\s?\d{7}/);

            if (containerMatch) {
              setContainerId(containerMatch[0].replace(/\s/g, '').toUpperCase());
              alert('Đã nhận diện chữ ký Container từ ảnh. Vui lòng nhập thủ công chi tiết phụ thu gốc.');
            } else if (code?.data) {
              setContainerId(code.data.substring(0, 30));
              alert(`Không đọc được mã Container từ OCR. Đã lấy tạm dữ liệu QR: ${code.data.substring(0, 20)}...`);
            } else {
              alert('Không tìm thấy mã QR và OCR cũng không đọc được mã Container.');
            }
          } catch {
            alert('Lỗi khi chạy quét ảnh OCR.');
          }
        }

        setIsScanning(false);
        if (qrFileInputRef.current) qrFileInputRef.current.value = '';
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const handleCompare = () => {
    if (!containerId || !surchargeAtBooking) {
      alert('Vui lòng nhập đủ Mã Container và Phụ thu lúc làm lệnh.');
      return;
    }

    setResult(buildManualReconciliationResult({
      bookingDate,
      containerId,
      containerType,
      executionDate,
      fuelPriceAtBooking: Number(fuelPriceAtBooking) || undefined,
      prices,
      surchargeAtBooking: Number(surchargeAtBooking),
      tiers
    }));
  };

  const handleSave = async () => {
    if (!result) return;
    try {
      await logiStorage.saveReconLog(result as ReconciliationLog);
      const updated = await logiStorage.getReconLogs();
      setReconLogs(updated);
      alert('Đã lưu log đối soát thành công!');
      setResult(null);
      setContainerId('');
      setSurchargeAtBooking('');
      setFuelPriceAtBooking('');
    } catch {
      alert('Lỗi khi lưu log đối soát!');
    }
  };

  const executionFuelPrice = getFuelPriceForDate(prices, executionDate);
  const processedSummary = summarizeProcessedRows(processedOrders);

  // === Filter & Sort logic ===
  const uniqueBookingDates = useMemo(() => {
    const dateSet = new Set<string>();
    processedOrders.forEach(row => {
      const d = row.bookingDate;
      if (d) dateSet.add(d);
    });
    return [...dateSet].sort();
  }, [processedOrders]);

  const filteredOrders = useMemo(() => {
    let result = processedOrders;
    if (dateFilter !== 'all') {
      result = result.filter(row => row.bookingDate === dateFilter);
    }
    if (containerSearch.trim()) {
      const q = containerSearch.trim().toUpperCase();
      result = result.filter(row => row.containerNumber.toUpperCase().includes(q));
    }
    return result;
  }, [processedOrders, dateFilter, containerSearch]);

  const sortedOrders = useMemo(() => {
    const copy = [...filteredOrders];
    if (sortDirection === 'desc') copy.reverse();
    return copy;
  }, [filteredOrders, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedOrders.length / pageSize));
  const startIndex = sortedOrders.length === 0 ? 0 : (currentPage - 1) * pageSize;
  const paginatedOrders = sortedOrders.slice(startIndex, startIndex + pageSize);

  // Group rows by booking date for display headers
  const dateGroupFuelPrices = useMemo(() => {
    const map = new Map<string, number | null>();
    processedOrders.forEach(row => {
      if (row.bookingDate && !map.has(row.bookingDate)) {
        map.set(row.bookingDate, row.fuelPriceAtBooking);
      }
    });
    return map;
  }, [processedOrders]);

  const handleRestoreImportHistory = (item: ReconciliationImportHistoryItem) => {
    setImportedOrders(item.rows);
    setProcessedOrders(item.rows);
    setExcelSourceName(item.sourceFilename);
    setExecutionDate(item.executionDate);
    setCurrentPage(1);
    setActiveTab('excel');
    setValidationSummary(validateImportedOrders(item.rows, prices, tiers, item.executionDate));
    saveReconciliationCurrentSession({
      sourceFilename: item.sourceFilename,
      executionDate: item.executionDate,
      rows: item.rows,
    });
  };

  const handleDeleteImportHistory = (id: string) => {
    if (!window.confirm('Xóa bản ghi lịch sử import này?')) return;
    const nextHistory = deleteReconciliationImportHistory(id);
    setImportHistory(nextHistory);

    const currentSession = loadReconciliationCurrentSession();
    if (!currentSession) return;

    const matchedHistory = importHistory.find(item => item.id === id);
    if (
      matchedHistory &&
      currentSession.sourceFilename === matchedHistory.sourceFilename &&
      currentSession.executionDate === matchedHistory.executionDate &&
      currentSession.rows.length === matchedHistory.rows.length
    ) {
      if (nextHistory.length > 0) {
        const latestHistory = nextHistory[0];
        setImportedOrders(latestHistory.rows);
        setProcessedOrders(latestHistory.rows);
        setExcelSourceName(latestHistory.sourceFilename);
        setExecutionDate(latestHistory.executionDate);
        setCurrentPage(1);
        saveReconciliationCurrentSession({
          sourceFilename: latestHistory.sourceFilename,
          executionDate: latestHistory.executionDate,
          rows: latestHistory.rows,
        });
      } else {
        setImportedOrders([]);
        setProcessedOrders([]);
        setExcelSourceName('');
        setCurrentPage(1);
        setValidationSummary(null);
        clearReconciliationCurrentSession();
      }
    }
  };

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl lg:text-3xl font-black text-slate-800 tracking-tight uppercase">
          ĐỐI SOÁT PHỤ THU
        </h1>
        <p className="text-slate-500 font-medium">
          So sánh phụ thu theo ngày làm lệnh và ngày thực hiện.
        </p>
      </div>

      <div className="flex bg-slate-200/50 p-1.5 rounded-2xl max-w-4xl flex-wrap">
        <button
          onClick={() => setActiveTab('scan')}
          className={`flex-1 min-w-[140px] py-3 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === 'scan' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <ClipboardCheck className="w-4 h-4" />
          Mới / Đối soát
        </button>
        <button
          onClick={() => setActiveTab('excel')}
          className={`flex-1 min-w-[140px] py-3 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === 'excel' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          Import Excel
        </button>
        <button
          onClick={() => setActiveTab('compare')}
          className={`flex-1 min-w-[140px] py-3 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === 'compare' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <GitCompareArrows className="w-4 h-4" />
          So sánh 2 ngày
        </button>
        <button
          onClick={() => setActiveTab('analysis')}
          className={`flex-1 min-w-[140px] py-3 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === 'analysis' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <BarChart3 className="w-4 h-4" />
          Phân tích
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 min-w-[140px] py-3 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === 'history' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <History className="w-4 h-4" />
          Lịch sử Logs
        </button>
      </div>

      {activeTab === 'scan' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 p-6 lg:p-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-slate-800">Thông tin lệnh</h2>
              <div className="flex gap-2">
                <input type="file" ref={qrFileInputRef} onChange={handleScanFile} className="hidden" accept="image/*" />
                <button
                  onClick={() => qrFileInputRef.current?.click()}
                  disabled={isScanning}
                  className={`bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition ${isScanning ? 'opacity-50 cursor-not-allowed' : 'hover:bg-indigo-100'}`}
                >
                  {isScanning ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                  {isScanning ? 'Đang quét...' : 'Quét QR'}
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Mã Container</label>
                  <input type="text" value={containerId} onChange={e => setContainerId(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus:ring-4 focus:ring-indigo-500/10 font-bold" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Loại Cont</label>
                  <select value={containerType} onChange={e => setContainerType(e.target.value as '20F' | '40F' | '20E' | '40E' | 'bulk')} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus:ring-4 focus:ring-indigo-500/10 font-bold">
                    <option value="20F">20 Full</option>
                    <option value="40F">40 Full</option>
                    <option value="20E">20 Empty</option>
                    <option value="40E">40 Empty</option>
                    <option value="bulk">Hàng ngoài</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Ngày làm lệnh</label>
                  <input
                    type={isDateFocused ? 'date' : 'text'}
                    onFocus={() => setIsDateFocused(true)}
                    onBlur={() => setIsDateFocused(false)}
                    value={isDateFocused ? bookingDate : displayDate(bookingDate)}
                    onChange={e => setBookingDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus:ring-4 focus:ring-indigo-500/10 font-bold text-slate-700"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Ngày thực hiện / đối soát</label>
                  <input
                    type={isExecutionDateFocused ? 'date' : 'text'}
                    onFocus={() => setIsExecutionDateFocused(true)}
                    onBlur={() => setIsExecutionDateFocused(false)}
                    value={isExecutionDateFocused ? executionDate : displayDate(executionDate)}
                    onChange={e => setExecutionDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus:ring-4 focus:ring-indigo-500/10 font-bold text-slate-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Giá dầu DO lúc cấp (VND)</label>
                  <input type="number" value={fuelPriceAtBooking} onChange={e => setFuelPriceAtBooking(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus:ring-4 focus:ring-indigo-500/10 font-bold" />
                  <p className="text-[11px] text-slate-400 px-1">Để trống nếu muốn hệ thống tự dò theo ngày làm lệnh.</p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Giá dầu ngày thực hiện</label>
                  <div className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 font-black text-indigo-600">
                    {executionFuelPrice ? executionFuelPrice.toLocaleString('vi-VN') : 'Chưa có dữ liệu'}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Phụ thu lúc làm lệnh (VND)</label>
                <input type="number" value={surchargeAtBooking} onChange={e => setSurchargeAtBooking(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus:ring-4 focus:ring-indigo-500/10 font-bold text-indigo-600" />
              </div>

              <button onClick={handleCompare} className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-indigo-200 flex justify-center items-center gap-2">
                <RefreshCcw className="w-5 h-5" />
                So sánh đối soát
              </button>
            </div>
          </div>

          <div className="bg-slate-50 rounded-[2rem] border border-slate-200 p-6 lg:p-8 flex flex-col justify-center">
            {!result ? (
              <div className="text-center text-slate-400">
                <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium text-sm">Nhập thông tin và bấm So sánh để xem kết quả.</p>
              </div>
            ) : (
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="space-y-6">
                <div className="bg-white rounded-2xl p-4 shadow-sm grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Giá dầu ngày lệnh</p>
                    <p className="text-lg font-black text-slate-700">{result.fuelPriceAtBooking?.toLocaleString('vi-VN')} đ</p>
                    <p className="text-xs text-slate-400 mt-1">{displayDate(result.bookingDate || bookingDate)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Giá dầu ngày thực hiện</p>
                    <p className="text-lg font-black text-indigo-600">{result.fuelPriceNow?.toLocaleString('vi-VN')} đ</p>
                    <p className="text-xs text-slate-400 mt-1">{displayDate(result.checkDate || executionDate)}</p>
                  </div>
                </div>

                <div className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm">
                  <div className="text-center flex-1 border-r border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ban đầu</p>
                    <p className="text-lg font-black text-slate-700">{result.surchargeAtBooking?.toLocaleString('vi-VN')}</p>
                  </div>
                  <div className="px-4 text-slate-300">
                    <ArrowRight className="w-5 h-5" />
                  </div>
                  <div className="text-center flex-1 border-l border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ngày thực hiện</p>
                    <p className="text-lg font-black text-slate-800">{result.surchargeNow?.toLocaleString('vi-VN')}</p>
                  </div>
                </div>

                <div className="bg-white rounded-3xl p-6 text-center shadow-sm">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Chênh lệch</p>
                  <p className={`text-4xl font-black tracking-tight ${
                    result.status === 'increase' ? 'text-rose-500' :
                    result.status === 'decrease' ? 'text-emerald-500' :
                    'text-slate-500'
                  }`}>
                    {result.status === 'increase' && '+'}
                    {result.delta?.toLocaleString('vi-VN')} đ
                  </p>
                  <p className="text-sm font-bold text-slate-500 mt-2">
                    {result.status === 'increase' && 'Khách hàng cần đóng thêm phụ thu.'}
                    {result.status === 'decrease' && 'Phụ thu giảm, cần hoàn phần chênh lệch.'}
                    {result.status === 'same' && 'Phụ thu giữ nguyên.'}
                  </p>
                </div>

                <button onClick={handleSave} className="w-full bg-slate-800 hover:bg-slate-900 text-white py-4 rounded-2xl font-bold flex justify-center items-center gap-2">
                  <Save className="w-5 h-5" />
                  Lưu kết quả đối soát
                </button>
              </motion.div>
            )}
          </div>
        </motion.div>
      )}

      {activeTab === 'excel' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 p-6 lg:p-8">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Đối soát</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Import file <strong>Tồn lệnh chưa thực hiện xuất từ Vtos</strong>, hệ thống sẽ tách các cột chính, tính giá dầu và phụ thu theo ngày lệnh và ngày thực hiện rồi xuất ra file mới.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <input type="file" ref={excelFileInputRef} onChange={handleExcelImport} accept=".xlsx,.xls" className="hidden" />
                <input
                  type={isExecutionDateFocused ? 'date' : 'text'}
                  onFocus={() => setIsExecutionDateFocused(true)}
                  onBlur={() => setIsExecutionDateFocused(false)}
                  value={isExecutionDateFocused ? executionDate : displayDate(executionDate)}
                  onChange={e => setExecutionDate(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 font-bold text-slate-700"
                />
                <button
                  onClick={() => excelFileInputRef.current?.click()}
                  disabled={isExcelProcessing}
                  className={`bg-emerald-600 text-white px-5 py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition ${isExcelProcessing ? 'opacity-60 cursor-not-allowed' : 'hover:bg-emerald-700'}`}
                >
                  {isExcelProcessing ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                  {isExcelProcessing ? 'Đang xử lý...' : 'Import Excel'}
                </button>
                <button
                  onClick={handleReExportExcel}
                  disabled={isExcelProcessing || processedOrders.length === 0}
                  className={`px-5 py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition ${
                    isExcelProcessing || processedOrders.length === 0
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-slate-800 text-white hover:bg-slate-900'
                  }`}
                >
                  {isExcelProcessing ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Xuất Excel
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Quy tắc giá dầu</p>
                <p className="text-sm text-slate-600 mt-2">Đối soát theo khung phụ thu 08:00 giờ Việt Nam. Giá Petrolimex đổi trong đêm sẽ chỉ áp dụng cho phụ thu từ 08:00 ngày kế tiếp.</p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Quy tắc loại cont</p>
                <p className="text-sm text-slate-600 mt-2">20F, 40F, 20E, 40E.</p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">File đầu ra</p>
                <p className="text-sm text-slate-600 mt-2">Có các cột giá dầu ngày lệnh, giá dầu ngày thực hiện, phụ thu hai thời điểm, chênh lệch và trạng thái tô màu.</p>
              </div>
            </div>

            {validationSummary && (
              <div className={`mb-6 rounded-3xl border p-5 ${validationSummary.status === 'pass' ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                  <div>
                    <p className={`text-xs font-bold uppercase tracking-widest ${validationSummary.status === 'pass' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      Kiểm soát dữ liệu
                    </p>
                    <p className={`mt-2 text-sm font-bold ${validationSummary.status === 'pass' ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {validationSummary.status === 'pass'
                        ? `PASS - ${validationSummary.totalRows.toLocaleString('vi-VN')} dòng đã vượt qua kiểm tra nghiệp vụ`
                        : `BLOCKED - ${validationSummary.errorCount.toLocaleString('vi-VN')} lỗi cần xử lý trước khi xuất`}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Kiểm tra lúc {displayDateTime(validationSummary.checkedAt)} | Ngày thực hiện {displayDate(validationSummary.executionDate)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                    <span className="px-3 py-1 rounded-full bg-white/80 text-slate-700 border border-slate-200">
                      Tổng dòng {validationSummary.totalRows.toLocaleString('vi-VN')}
                    </span>
                    <span className={`px-3 py-1 rounded-full ${validationSummary.status === 'pass' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                      Lỗi {validationSummary.errorCount.toLocaleString('vi-VN')}
                    </span>
                    <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-700">
                      Cảnh báo {validationSummary.warningCount.toLocaleString('vi-VN')}
                    </span>
                  </div>
                </div>

                {validationSummary.issues.length > 0 && (
                  <div className="mt-4 rounded-2xl bg-white/80 border border-white px-4 py-3">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Lỗi nổi bật</p>
                    <div className="mt-3 space-y-2">
                      {validationSummary.issues.slice(0, 5).map(issue => (
                        <p key={`${issue.code}-${issue.rowIndex}-${issue.orderNo}-${issue.containerNumber}`} className="text-sm text-slate-700">
                          <span className="font-bold">Dòng {issue.rowIndex}:</span> {issue.message}
                        </p>
                      ))}
                      {validationSummary.issues.length > 5 && (
                        <p className="text-xs font-medium text-slate-500">
                          Còn {validationSummary.issues.length - 5} lỗi/cảnh báo khác. File export sẽ kèm sheet kiểm tra dữ liệu để audit.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {processedOrders.length > 0 ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                  <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tổng dòng dữ liệu</p>
                    <p className="text-2xl font-black text-slate-800 mt-2">{processedSummary.total}</p>
                  </div>
                  <div className="bg-rose-50 border border-rose-100 rounded-3xl p-5">
                    <p className="text-xs font-bold text-rose-400 uppercase tracking-widest">Tăng</p>
                    <p className="text-2xl font-black text-rose-600 mt-2">{processedSummary.increase}</p>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-100 rounded-3xl p-5">
                    <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Giảm</p>
                    <p className="text-2xl font-black text-emerald-600 mt-2">{processedSummary.decrease}</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Giữ nguyên</p>
                    <p className="text-2xl font-black text-slate-700 mt-2">{processedSummary.same}</p>
                  </div>
                  <div className="bg-amber-50 border border-amber-100 rounded-3xl p-5">
                    <p className="text-xs font-bold text-amber-500 uppercase tracking-widest">Thiếu dữ liệu</p>
                    <p className="text-2xl font-black text-amber-600 mt-2">{processedSummary.missing}</p>
                  </div>
                </div>

                {/* === Filter & Sort Toolbar === */}
                <div className="flex flex-wrap items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-slate-400" />
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Ngày lệnh:</label>
                    <select
                      value={dateFilter}
                      onChange={e => { setDateFilter(e.target.value); setCurrentPage(1); }}
                      className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 min-w-[160px]"
                    >
                      <option value="all">Tất cả ({processedOrders.length})</option>
                      {uniqueBookingDates.map(d => {
                        const count = processedOrders.filter(r => r.bookingDate === d).length;
                        const fuelPrice = dateGroupFuelPrices.get(d);
                        return (
                          <option key={d} value={d}>
                            {displayDate(d)} — {fuelPrice ? fuelPrice.toLocaleString('vi-VN') + 'đ' : '?'} ({count})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="w-px h-6 bg-slate-200 hidden sm:block" />
                  <button
                    onClick={() => { setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc'); setCurrentPage(1); }}
                    className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 transition"
                  >
                    <ArrowUpDown className="w-4 h-4" />
                    STT {sortDirection === 'asc' ? (
                      <><ChevronUp className="w-3 h-3" /> Tăng dần</>
                    ) : (
                      <><ChevronDown className="w-3 h-3" /> Giảm dần</>
                    )}
                  </button>
                  <div className="w-px h-6 bg-slate-200 hidden sm:block" />
                  <div className="flex items-center gap-2">
                    <Search className="w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={containerSearch}
                      onChange={e => { setContainerSearch(e.target.value); setCurrentPage(1); }}
                      placeholder="Tìm số container..."
                      className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 min-w-[180px] placeholder:font-medium placeholder:text-slate-400"
                    />
                  </div>
                  {(dateFilter !== 'all' || containerSearch.trim()) && (
                    <button
                      onClick={() => { setDateFilter('all'); setContainerSearch(''); setCurrentPage(1); }}
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition"
                    >
                      ✕ Bỏ lọc
                    </button>
                  )}
                  <div className="ml-auto text-xs text-slate-400 font-medium">
                    Hiển thị {sortedOrders.length} / {processedOrders.length} dòng
                  </div>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-3xl">
                  <table className="w-full min-w-[1100px] text-left border-collapse">
                    <thead className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      <tr>
                        <th className="px-4 py-3 border-b border-slate-200 text-center cursor-pointer select-none" onClick={() => { setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc'); setCurrentPage(1); }}>
                          STT {sortDirection === 'asc' ? '▲' : '▼'}
                        </th>
                        <th className="px-4 py-3 border-b border-slate-200">Số lệnh</th>
                        <th className="px-4 py-3 border-b border-slate-200">Container</th>
                        <th className="px-4 py-3 border-b border-slate-200">Loại</th>
                        <th className="px-4 py-3 border-b border-slate-200">Ngày làm Thủ tục</th>
                        <th className="px-4 py-3 border-b border-slate-200 text-right">Giá dầu ban đầu</th>
                        <th className="px-4 py-3 border-b border-slate-200 text-right">Giá dầu thực hiện </th>
                        <th className="px-4 py-3 border-b border-slate-200 text-right">Phụ thu ban đầu</th>
                        <th className="px-4 py-3 border-b border-slate-200 text-right">Phụ thu thực hiện</th>
                        <th className="px-4 py-3 border-b border-slate-200 text-right">Chênh lệch</th>
                        <th className="px-4 py-3 border-b border-slate-200 text-right">Phụ thu có VAT</th>
                        <th className="px-4 py-3 border-b border-slate-200 text-center">Điều chỉnh</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedOrders.map((row, index) => {
                        // Check if this row starts a new booking date group
                        const prevRow = index > 0 ? paginatedOrders[index - 1] : null;
                        const isNewDateGroup = !prevRow || prevRow.bookingDate !== row.bookingDate;
                        return (
                          <React.Fragment key={`${row.orderNo}-${row.containerNumber}-${index}`}>
                            {isNewDateGroup && row.bookingDate && (
                              <tr className="bg-indigo-50/70">
                                <td colSpan={12} className="px-4 py-2 border-b border-indigo-100">
                                  <div className="flex items-center gap-3">
                                    <span className="text-xs font-black text-indigo-700 uppercase tracking-widest">
                                      📅 Ngày lệnh: {displayDate(row.bookingDate)}
                                    </span>
                                    <span className="w-px h-4 bg-indigo-200" />
                                    <span className="text-xs font-bold text-indigo-500">
                                      Giá dầu: {row.fuelPriceAtBooking?.toLocaleString('vi-VN') ?? '—'} đ
                                    </span>
                                    <span className="text-[10px] text-indigo-400">
                                      ({processedOrders.filter(r => r.bookingDate === row.bookingDate).length} lệnh)
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            )}
                            <tr className="hover:bg-slate-50">
                              <td className="px-4 py-3 border-b border-slate-100 text-center text-xs font-bold text-slate-500">{startIndex + index + 1}</td>
                              <td className="px-4 py-3 border-b border-slate-100 text-xs font-bold text-slate-700">{row.orderNo}</td>
                              <td className="px-4 py-3 border-b border-slate-100 text-xs text-slate-600">
                                <p className="font-bold text-slate-700">{row.containerNumber}</p>
                                <p className="text-[10px] text-slate-400">{row.note || 'Không có ghi chú'}</p>
                              </td>
                              <td className="px-4 py-3 border-b border-slate-100 text-xs font-bold text-slate-600">{row.containerType ?? 'Không rõ'}</td>
                              <td className="px-4 py-3 border-b border-slate-100 text-xs text-slate-600">{row.bookingDateTimeDisplay || row.bookingDateDisplay}</td>
                              <td className="px-4 py-3 border-b border-slate-100 text-xs text-right font-bold text-slate-600">{row.fuelPriceAtBooking?.toLocaleString('vi-VN') ?? '-'}</td>
                              <td className="px-4 py-3 border-b border-slate-100 text-xs text-right font-bold text-slate-600">{row.fuelPriceAtExecution?.toLocaleString('vi-VN') ?? '-'}</td>
                              <td className="px-4 py-3 border-b border-slate-100 text-xs text-right font-bold text-slate-600">{row.surchargeAtBooking?.toLocaleString('vi-VN') ?? '-'}</td>
                              <td className="px-4 py-3 border-b border-slate-100 text-xs text-right font-bold text-indigo-600">{row.surchargeAtExecution?.toLocaleString('vi-VN') ?? '-'}</td>
                              <td className="px-4 py-3 border-b border-slate-100 text-xs text-right font-black">
                                <span className={
                                  row.status === 'increase' ? 'text-rose-600' :
                                  row.status === 'decrease' ? 'text-emerald-600' :
                                  row.status === 'same' ? 'text-slate-500' :
                                  'text-amber-600'
                                }>
                                  {row.delta === null ? '-' : `${row.delta > 0 ? '+' : ''}${row.delta.toLocaleString('vi-VN')}`}
                                </span>
                              </td>
                              <td className="px-4 py-3 border-b border-slate-100 text-xs text-right font-black text-indigo-700">
                                {row.delta === null ? '-' : Math.round(row.delta * 1.08).toLocaleString('vi-VN')}
                              </td>
                              <td className="px-4 py-3 border-b border-slate-100 text-center">
                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${statusClasses[row.status]}`}>
                                  {row.adjustmentLabel}
                                </span>
                              </td>
                            </tr>
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <p className="text-sm text-slate-500">
                    Trang <span className="font-bold text-slate-700">{currentPage}</span> / <span className="font-bold text-slate-700">{totalPages}</span> | Hiển thị <span className="font-bold text-slate-700">{sortedOrders.length === 0 ? 0 : startIndex + 1}-{Math.min(startIndex + pageSize, sortedOrders.length)}</span> / <span className="font-bold text-slate-700">{sortedOrders.length}</span>{dateFilter !== 'all' && <span className="text-indigo-500 font-bold"> (lọc từ {processedOrders.length})</span>}
                  </p>
                  <div className="flex flex-col sm:flex-row items-center gap-2">
                    <div className="flex items-center gap-3">
                      <label className="text-sm text-slate-500 font-medium">Mỗi trang</label>
                      <select
                        value={pageSize}
                        onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                        className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700"
                      >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </div>
                    <button
                      onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
                      disabled={currentPage === 1}
                      className={`px-4 py-2 rounded-xl text-sm font-bold transition ${currentPage === 1 ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                    >
                      Trang trước
                    </button>
                    <button
                      onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
                      disabled={currentPage === totalPages}
                      className={`px-4 py-2 rounded-xl text-sm font-bold transition ${currentPage === totalPages ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                    >
                      Trang sau
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 rounded-3xl p-8 border border-dashed border-slate-200 text-center text-slate-400">
                <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium text-sm">Import file Excel để xem trước kết quả. Sau đó bấm Xuất Excel để tự chọn nơi lưu file.</p>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {activeTab === 'compare' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 p-6 lg:p-8">
            <div className="mb-6">
              <h2 className="text-lg font-bold text-slate-800">So sánh Đối Soát giữa 2 ngày</h2>
              <p className="text-sm text-slate-500 mt-1">
                Import 2 file đối soát từ 2 ngày khác nhau để phát hiện cont <strong>trùng lặp</strong> (tồn cả 2 ngày), cont <strong>mới phát sinh</strong>, và cont <strong>đã hoàn thành</strong>.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* File A - Old day */}
              <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-blue-100 text-blue-700 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest">A — Ngày cũ</span>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Ngày thực hiện (A)</label>
                  <input
                    type={isCompareDateAFocused ? 'date' : 'text'}
                    onFocus={() => setIsCompareDateAFocused(true)}
                    onBlur={() => setIsCompareDateAFocused(false)}
                    value={isCompareDateAFocused ? compareDateA : displayDate(compareDateA)}
                    onChange={e => setCompareDateA(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 font-bold text-slate-700"
                  />
                </div>
                <input type="file" ref={compareFileARef} accept=".xlsx,.xls" className="hidden" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const buffer = await file.arrayBuffer();
                    const parsed = parseImportedOrders(buffer);
                    const processed = buildProcessedRows(parsed, prices, tiers, compareDateA);
                    setCompareFileARows(processed);
                    setCompareFileAName(file.name);
                  } catch (err) {
                    alert(`Lỗi đọc file A: ${(err as Error).message}`);
                  }
                  e.target.value = '';
                }} />
                <button
                  onClick={() => compareFileARef.current?.click()}
                  className="w-full bg-blue-600 text-white px-4 py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition"
                >
                  <Upload className="w-4 h-4" />
                  {compareFileAName ? `✓ ${compareFileAName}` : 'Chọn file ngày cũ (A)'}
                </button>
                {compareFileARows.length > 0 && (
                  <p className="text-xs text-blue-600 font-bold">✓ {compareFileARows.length} dòng đã load</p>
                )}
              </div>

              {/* File B - New day */}
              <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-emerald-100 text-emerald-700 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest">B — Ngày mới</span>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Ngày thực hiện (B)</label>
                  <input
                    type={isCompareDateBFocused ? 'date' : 'text'}
                    onFocus={() => setIsCompareDateBFocused(true)}
                    onBlur={() => setIsCompareDateBFocused(false)}
                    value={isCompareDateBFocused ? compareDateB : displayDate(compareDateB)}
                    onChange={e => setCompareDateB(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 font-bold text-slate-700"
                  />
                </div>
                <input type="file" ref={compareFileBRef} accept=".xlsx,.xls" className="hidden" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const buffer = await file.arrayBuffer();
                    const parsed = parseImportedOrders(buffer);
                    const processed = buildProcessedRows(parsed, prices, tiers, compareDateB);
                    setCompareFileBRows(processed);
                    setCompareFileBName(file.name);
                  } catch (err) {
                    alert(`Lỗi đọc file B: ${(err as Error).message}`);
                  }
                  e.target.value = '';
                }} />
                <button
                  onClick={() => compareFileBRef.current?.click()}
                  className="w-full bg-emerald-600 text-white px-4 py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-emerald-700 transition"
                >
                  <Upload className="w-4 h-4" />
                  {compareFileBName ? `✓ ${compareFileBName}` : 'Chọn file ngày mới (B)'}
                </button>
                {compareFileBRows.length > 0 && (
                  <p className="text-xs text-emerald-600 font-bold">✓ {compareFileBRows.length} dòng đã load</p>
                )}
              </div>
            </div>

            {/* Compare button */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => {
                  if (compareFileARows.length === 0 || compareFileBRows.length === 0) {
                    alert('Vui lòng import đủ 2 file trước khi so sánh.');
                    return;
                  }
                  setIsComparing(true);
                  setTimeout(() => {
                    const result = compareTwoDayReconciliation(
                      compareFileARows, compareFileBRows,
                      { name: compareFileAName, date: compareDateA },
                      { name: compareFileBName, date: compareDateB }
                    );
                    setComparisonResult(result);
                    setCompareViewSection('duplicate');
                    setIsComparing(false);
                    // Persist to localStorage
                    const sessionData = {
                      result,
                      fileAName: compareFileAName,
                      fileBName: compareFileBName,
                      dateA: compareDateA,
                      dateB: compareDateB,
                    };
                    saveComparisonSession(sessionData);
                    saveComparisonHistory(sessionData);
                    setComparisonHistory(loadComparisonHistory());
                  }, 100);
                }}
                disabled={isComparing || compareFileARows.length === 0 || compareFileBRows.length === 0}
                className={`flex-1 min-w-[200px] py-4 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition shadow-lg ${
                  isComparing || compareFileARows.length === 0 || compareFileBRows.length === 0
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-slate-100'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200'
                }`}
              >
                {isComparing ? <RefreshCcw className="w-5 h-5 animate-spin" /> : <GitCompareArrows className="w-5 h-5" />}
                {isComparing ? 'Đang so sánh...' : 'So sánh 2 ngày'}
              </button>
              {comparisonResult && (
                <button
                  onClick={async () => {
                    try {
                      const filename = await exportCrossDayComparisonToExcel(comparisonResult);
                      alert(`Đã xuất file ${filename}.`);
                    } catch (err) {
                      alert(`Lỗi xuất Excel: ${(err as Error).message}`);
                    }
                  }}
                  className="px-6 py-4 rounded-2xl text-sm font-bold bg-slate-800 text-white hover:bg-slate-900 flex items-center gap-2 transition"
                >
                  <Download className="w-4 h-4" />
                  Xuất Excel so sánh
                </button>
              )}
            </div>
          </div>

          {/* Comparison Results */}
          {comparisonResult && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              {/* Summary cards */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">File A (cũ)</p>
                  <p className="text-2xl font-black text-slate-800 mt-2">{comparisonResult.fileA.totalRows}</p>
                  <p className="text-[10px] text-slate-400 mt-1">{displayDate(comparisonResult.fileA.date)}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">File B (mới)</p>
                  <p className="text-2xl font-black text-slate-800 mt-2">{comparisonResult.fileB.totalRows}</p>
                  <p className="text-[10px] text-slate-400 mt-1">{displayDate(comparisonResult.fileB.date)}</p>
                </div>
                <button onClick={() => setCompareViewSection('duplicate')} className={`rounded-3xl p-5 text-left transition border ${compareViewSection === 'duplicate' ? 'bg-blue-100 border-blue-300 ring-2 ring-blue-400' : 'bg-blue-50 border-blue-100 hover:bg-blue-100'}`}>
                  <p className="text-xs font-bold text-blue-500 uppercase tracking-widest flex items-center gap-1"><Repeat2 className="w-3.5 h-3.5" /> Trùng lặp</p>
                  <p className="text-2xl font-black text-blue-700 mt-2">{comparisonResult.duplicateRows.length}</p>
                </button>
                <button onClick={() => setCompareViewSection('new')} className={`rounded-3xl p-5 text-left transition border ${compareViewSection === 'new' ? 'bg-emerald-100 border-emerald-300 ring-2 ring-emerald-400' : 'bg-emerald-50 border-emerald-100 hover:bg-emerald-100'}`}>
                  <p className="text-xs font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-1"><PlusCircle className="w-3.5 h-3.5" /> Mới phát sinh</p>
                  <p className="text-2xl font-black text-emerald-700 mt-2">{comparisonResult.newRows.length}</p>
                </button>
                <button onClick={() => setCompareViewSection('completed')} className={`rounded-3xl p-5 text-left transition border ${compareViewSection === 'completed' ? 'bg-amber-100 border-amber-300 ring-2 ring-amber-400' : 'bg-amber-50 border-amber-100 hover:bg-amber-100'}`}>
                  <p className="text-xs font-bold text-amber-500 uppercase tracking-widest flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Đã hoàn thành</p>
                  <p className="text-2xl font-black text-amber-700 mt-2">{comparisonResult.completedRows.length}</p>
                </button>
              </div>

              {/* Active section table */}
              {(() => {
                const sectionConfig = {
                  duplicate: { title: 'Container trùng lặp (tồn cả 2 ngày)', rows: comparisonResult.duplicateRows, color: 'blue' },
                  new: { title: 'Container mới phát sinh (chỉ ở ngày mới)', rows: comparisonResult.newRows, color: 'emerald' },
                  completed: { title: 'Container đã hoàn thành (chỉ ở ngày cũ)', rows: comparisonResult.completedRows, color: 'amber' },
                };
                const cfg = sectionConfig[compareViewSection];
                const rows = cfg.rows;
                return (
                  <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 p-6 lg:p-8">
                    <h3 className={`text-sm font-black uppercase tracking-widest mb-4 text-${cfg.color}-600`}>{cfg.title} — {rows.length} cont</h3>
                    {rows.length === 0 ? (
                      <div className="bg-slate-50 rounded-3xl p-8 border border-dashed border-slate-200 text-center text-slate-400">
                        <p className="font-medium text-sm">Không có container trong danh mục này.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto border border-slate-200 rounded-3xl">
                        <table className="w-full min-w-[900px] text-left border-collapse">
                          <thead className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                            <tr>
                              <th className="px-4 py-3 border-b border-slate-200 text-center">STT</th>
                              <th className="px-4 py-3 border-b border-slate-200">Container</th>
                              <th className="px-4 py-3 border-b border-slate-200">Số lệnh</th>
                              <th className="px-4 py-3 border-b border-slate-200">Loại</th>
                              <th className="px-4 py-3 border-b border-slate-200">Ngày lệnh</th>
                              {compareViewSection !== 'new' && (
                                <>
                                  <th className="px-4 py-3 border-b border-slate-200 text-right">Giá dầu (A)</th>
                                  <th className="px-4 py-3 border-b border-slate-200 text-right">Phụ thu (A)</th>
                                </>
                              )}
                              {compareViewSection !== 'completed' && (
                                <>
                                  <th className="px-4 py-3 border-b border-slate-200 text-right">Giá dầu (B)</th>
                                  <th className="px-4 py-3 border-b border-slate-200 text-right">Phụ thu (B)</th>
                                </>
                              )}
                              {compareViewSection === 'duplicate' && (
                                <th className="px-4 py-3 border-b border-slate-200 text-right">Chênh lệch phụ thu</th>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row, index) => (
                              <tr key={`${row.containerNumber}-${index}`} className="hover:bg-slate-50">
                                <td className="px-4 py-3 border-b border-slate-100 text-center text-xs font-bold text-slate-500">{index + 1}</td>
                                <td className="px-4 py-3 border-b border-slate-100">
                                  <p className="text-xs font-bold text-slate-700">{row.containerNumber}</p>
                                  <p className="text-[10px] text-slate-400">{row.note || '—'}</p>
                                </td>
                                <td className="px-4 py-3 border-b border-slate-100 text-xs font-bold text-slate-700">{row.orderNo}</td>
                                <td className="px-4 py-3 border-b border-slate-100 text-xs font-bold text-slate-600">{row.containerType ?? '—'}</td>
                                <td className="px-4 py-3 border-b border-slate-100 text-xs text-slate-600">{row.bookingDateDisplay}</td>
                                {compareViewSection !== 'new' && (
                                  <>
                                    <td className="px-4 py-3 border-b border-slate-100 text-xs text-right font-bold text-slate-600">{row.oldFuelPrice?.toLocaleString('vi-VN') ?? '—'}</td>
                                    <td className="px-4 py-3 border-b border-slate-100 text-xs text-right font-bold text-blue-600">{row.oldSurcharge?.toLocaleString('vi-VN') ?? '—'}</td>
                                  </>
                                )}
                                {compareViewSection !== 'completed' && (
                                  <>
                                    <td className="px-4 py-3 border-b border-slate-100 text-xs text-right font-bold text-slate-600">{row.newFuelPrice?.toLocaleString('vi-VN') ?? '—'}</td>
                                    <td className="px-4 py-3 border-b border-slate-100 text-xs text-right font-bold text-emerald-600">{row.newSurcharge?.toLocaleString('vi-VN') ?? '—'}</td>
                                  </>
                                )}
                                {compareViewSection === 'duplicate' && (
                                  <td className="px-4 py-3 border-b border-slate-100 text-xs text-right font-black">
                                    <span className={
                                      row.surchargeDelta === null ? 'text-slate-400' :
                                      row.surchargeDelta > 0 ? 'text-rose-600' :
                                      row.surchargeDelta < 0 ? 'text-emerald-600' :
                                      'text-slate-500'
                                    }>
                                      {row.surchargeDelta === null ? '—' : `${row.surchargeDelta > 0 ? '+' : ''}${row.surchargeDelta.toLocaleString('vi-VN')}`}
                                    </span>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })()}
            </motion.div>
          )}
        </motion.div>
      )}

      {activeTab === 'analysis' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* Analysis based on comparison result */}
          {comparisonResult ? (() => {
            const totalCompared = comparisonResult.duplicateRows.length + comparisonResult.newRows.length + comparisonResult.completedRows.length;
            const pieData = [
              { name: 'Trùng lặp', value: comparisonResult.duplicateRows.length, color: '#3B82F6' },
              { name: 'Mới phát sinh', value: comparisonResult.newRows.length, color: '#10B981' },
              { name: 'Đã hoàn thành', value: comparisonResult.completedRows.length, color: '#F59E0B' },
            ].filter(d => d.value > 0);

            // Surcharge delta distribution for duplicates
            const deltaDistribution: Record<string, number> = { 'Tăng': 0, 'Giảm': 0, 'Giữ nguyên': 0, 'Thiếu DL': 0 };
            comparisonResult.duplicateRows.forEach(row => {
              if (row.surchargeDelta === null) deltaDistribution['Thiếu DL']++;
              else if (row.surchargeDelta > 0) deltaDistribution['Tăng']++;
              else if (row.surchargeDelta < 0) deltaDistribution['Giảm']++;
              else deltaDistribution['Giữ nguyên']++;
            });
            const deltaBarData = [
              { name: 'Tăng', value: deltaDistribution['Tăng'], fill: '#F43F5E' },
              { name: 'Giảm', value: deltaDistribution['Giảm'], fill: '#10B981' },
              { name: 'Giữ nguyên', value: deltaDistribution['Giữ nguyên'], fill: '#94A3B8' },
              { name: 'Thiếu DL', value: deltaDistribution['Thiếu DL'], fill: '#F59E0B' },
            ].filter(d => d.value > 0);

            // Container type distribution across all compared
            const allRows = [...comparisonResult.duplicateRows, ...comparisonResult.newRows, ...comparisonResult.completedRows];
            const typeCount: Record<string, number> = {};
            allRows.forEach(row => {
              const t = row.containerType ?? 'Không rõ';
              typeCount[t] = (typeCount[t] || 0) + 1;
            });
            const typeColors = ['#6366F1', '#8B5CF6', '#EC4899', '#F97316', '#14B8A6'];
            const typeData = Object.entries(typeCount).map(([name, value], i) => ({
              name, value, color: typeColors[i % typeColors.length],
            }));

            // Total surcharge impact
            const totalSurchargeDelta = comparisonResult.duplicateRows.reduce((sum, r) => sum + (r.surchargeDelta ?? 0), 0);
            const totalDeltaVat = Math.round(totalSurchargeDelta * 1.08);

            return (
              <>
                {/* Summary metrics */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tổng cont so sánh</p>
                    <p className="text-3xl font-black text-slate-800 mt-3">{totalCompared.toLocaleString('vi-VN')}</p>
                  </div>
                  <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tỷ lệ tồn</p>
                    <p className="text-3xl font-black text-blue-600 mt-3">
                      {totalCompared > 0 ? ((comparisonResult.duplicateRows.length / totalCompared) * 100).toFixed(1) : '0'}%
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">{comparisonResult.duplicateRows.length} / {totalCompared} cont</p>
                  </div>
                  <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tổng Chênh lệch phụ thu</p>
                    <p className={`text-3xl font-black mt-3 ${totalSurchargeDelta > 0 ? 'text-rose-600' : totalSurchargeDelta < 0 ? 'text-emerald-600' : 'text-slate-600'}`}>
                      {totalSurchargeDelta > 0 ? '+' : ''}{totalSurchargeDelta.toLocaleString('vi-VN')}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">Chênh lệch tổng (cont trùng lặp)</p>
                  </div>
                  <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Chênh lệch có VAT (8%)</p>
                    <p className={`text-3xl font-black mt-3 ${totalDeltaVat > 0 ? 'text-rose-600' : totalDeltaVat < 0 ? 'text-emerald-600' : 'text-slate-600'}`}>
                      {totalDeltaVat > 0 ? '+' : ''}{totalDeltaVat.toLocaleString('vi-VN')}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">Tổng tiền VAT chênh lệch</p>
                  </div>
                </div>

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Pie: Distribution */}
                  <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-6">
                    <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4">Phân bổ Container</h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} innerRadius={50} paddingAngle={4} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                          {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                        <Tooltip formatter={(value: number) => value.toLocaleString('vi-VN')} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex justify-center gap-4 mt-2">
                      {pieData.map(d => (
                        <div key={d.name} className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                          {d.name}: {d.value}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Bar: Surcharge delta (duplicates) */}
                  <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-6">
                    <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4">Biến động phụ thu (cont trùng lặp)</h3>
                    {comparisonResult.duplicateRows.length > 0 ? (
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={deltaBarData} layout="vertical" margin={{ left: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                          <XAxis type="number" tick={{ fontSize: 11 }} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fontWeight: 700 }} width={80} />
                          <Tooltip formatter={(value: number) => value.toLocaleString('vi-VN') + ' cont'} />
                          <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={28}>
                            {deltaBarData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-[280px] text-slate-400 text-sm font-medium">
                        Không có cont trùng lặp để phân tích
                      </div>
                    )}
                  </div>

                  {/* Pie: Container type */}
                  <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-6">
                    <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4">Phân bổ theo loại Cont</h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie data={typeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} innerRadius={50} paddingAngle={4} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                          {typeData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                        <Tooltip formatter={(value: number) => value.toLocaleString('vi-VN')} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-wrap justify-center gap-3 mt-2">
                      {typeData.map(d => (
                        <div key={d.name} className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                          {d.name}: {d.value}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Summary: File comparison overview */}
                  <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-6">
                    <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4">Tổng quan so sánh</h3>
                    <div className="space-y-4">
                      <div className="bg-slate-50 rounded-2xl p-4">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">File ngày cũ (A)</p>
                        <p className="text-sm font-bold text-slate-700 mt-1">{comparisonResult.fileA.name}</p>
                        <p className="text-xs text-slate-500">{displayDate(comparisonResult.fileA.date)} — {comparisonResult.fileA.totalRows} cont</p>
                      </div>
                      <div className="flex items-center justify-center">
                        <ArrowRight className="w-5 h-5 text-slate-300" />
                      </div>
                      <div className="bg-slate-50 rounded-2xl p-4">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">File ngày mới (B)</p>
                        <p className="text-sm font-bold text-slate-700 mt-1">{comparisonResult.fileB.name}</p>
                        <p className="text-xs text-slate-500">{displayDate(comparisonResult.fileB.date)} — {comparisonResult.fileB.totalRows} cont</p>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-4">
                        <div className="bg-blue-50 rounded-2xl p-3 text-center">
                          <p className="text-lg font-black text-blue-700">{comparisonResult.duplicateRows.length}</p>
                          <p className="text-[10px] font-bold text-blue-500 uppercase">Trùng</p>
                        </div>
                        <div className="bg-emerald-50 rounded-2xl p-3 text-center">
                          <p className="text-lg font-black text-emerald-700">{comparisonResult.newRows.length}</p>
                          <p className="text-[10px] font-bold text-emerald-500 uppercase">Mới</p>
                        </div>
                        <div className="bg-amber-50 rounded-2xl p-3 text-center">
                          <p className="text-lg font-black text-amber-700">{comparisonResult.completedRows.length}</p>
                          <p className="text-[10px] font-bold text-amber-500 uppercase">Hoàn thành</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            );
          })() : (
            /* Fallback: analysis from current processedOrders */
            processedOrders.length > 0 ? (() => {
              const summary = summarizeProcessedRows(processedOrders);
              const statusPieData = [
                { name: 'Tăng', value: summary.increase, color: '#F43F5E' },
                { name: 'Giảm', value: summary.decrease, color: '#10B981' },
                { name: 'Giữ nguyên', value: summary.same, color: '#94A3B8' },
                { name: 'Thiếu DL', value: summary.missing, color: '#F59E0B' },
              ].filter(d => d.value > 0);

              const typeCount: Record<string, number> = {};
              processedOrders.forEach(r => {
                const t = r.containerType ?? 'Không rõ';
                typeCount[t] = (typeCount[t] || 0) + 1;
              });
              const typeColors = ['#6366F1', '#8B5CF6', '#EC4899', '#F97316', '#14B8A6'];
              const typeData = Object.entries(typeCount).map(([name, value], i) => ({
                name, value, color: typeColors[i % typeColors.length],
              }));

              const totalDelta = processedOrders.reduce((sum, r) => sum + (r.delta ?? 0), 0);
              const totalDeltaVat = Math.round(totalDelta * 1.08);

              // Date-group bar chart
              const dateGroupData = uniqueBookingDates.map(d => {
                const group = processedOrders.filter(r => r.bookingDate === d);
                return {
                  name: displayDate(d),
                  increase: group.filter(r => r.status === 'increase').length,
                  decrease: group.filter(r => r.status === 'decrease').length,
                  same: group.filter(r => r.status === 'same').length,
                };
              });

              return (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tổng dòng</p>
                      <p className="text-3xl font-black text-slate-800 mt-3">{summary.total.toLocaleString('vi-VN')}</p>
                    </div>
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
                      <p className="text-xs font-bold text-rose-400 uppercase tracking-widest">Tăng</p>
                      <p className="text-3xl font-black text-rose-600 mt-3">{summary.increase}</p>
                    </div>
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tổng chênh lệch phụ thu</p>
                      <p className={`text-3xl font-black mt-3 ${totalDelta > 0 ? 'text-rose-600' : totalDelta < 0 ? 'text-emerald-600' : 'text-slate-600'}`}>
                        {totalDelta > 0 ? '+' : ''}{totalDelta.toLocaleString('vi-VN')}
                      </p>
                    </div>
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Chênh lệch có VAT (8%)</p>
                      <p className={`text-3xl font-black mt-3 ${totalDeltaVat > 0 ? 'text-rose-600' : totalDeltaVat < 0 ? 'text-emerald-600' : 'text-slate-600'}`}>
                        {totalDeltaVat > 0 ? '+' : ''}{totalDeltaVat.toLocaleString('vi-VN')}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-6">
                      <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4">Phân bổ trạng thái</h3>
                      <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                          <Pie data={statusPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} innerRadius={50} paddingAngle={4} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                            {statusPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                          </Pie>
                          <Tooltip formatter={(value: number) => value.toLocaleString('vi-VN')} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-6">
                      <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4">Phân bổ theo loại Cont</h3>
                      <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                          <Pie data={typeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} innerRadius={50} paddingAngle={4} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                            {typeData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                          </Pie>
                          <Tooltip formatter={(value: number) => value.toLocaleString('vi-VN')} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    {dateGroupData.length > 1 && (
                      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-6 lg:col-span-2">
                        <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4">Trạng thái theo Ngày lệnh</h3>
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={dateGroupData} margin={{ left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="increase" name="Tăng" fill="#F43F5E" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="decrease" name="Giảm" fill="#10B981" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="same" name="Giữ nguyên" fill="#94A3B8" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                </>
              );
            })() : (
              <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 p-12 text-center">
                <BarChart3 className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                <h3 className="text-lg font-bold text-slate-700 mb-2">Chưa có dữ liệu phân tích</h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  Hãy <strong>Import Excel</strong> hoặc <strong>So sánh 2 ngày</strong> trước để có dữ liệu. Tab Phân tích sẽ tự động hiển thị biểu đồ từ dữ liệu hiện có.
                </p>
              </div>
            )
          )}
        </motion.div>
      )}

      {activeTab === 'history' && (

        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">
          <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-50 flex justify-between items-center">
              <h2 className="font-bold text-slate-800">Lịch sử Import Excel</h2>
            </div>
            <div className="overflow-x-auto pb-4">
              <div className="min-w-[900px] px-4">
                <table className="w-full text-left border-collapse border border-slate-200">
                  <thead className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    <tr>
                      <th className="px-4 py-3 border border-slate-200 text-center">STT</th>
                      <th className="px-4 py-3 border border-slate-200">File</th>
                      <th className="px-4 py-3 border border-slate-200 text-center">Ngày thực hiện</th>
                      <th className="px-4 py-3 border border-slate-200 text-center">Ngày lưu</th>
                      <th className="px-4 py-3 border border-slate-200 text-right">Tổng dòng</th>
                      <th className="px-4 py-3 border border-slate-200 text-center">Kết quả</th>
                      <th className="px-4 py-3 border border-slate-200 text-center">Tác vụ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importHistory.map((item, index) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 border border-slate-200 text-center text-xs font-bold text-slate-500">{index + 1}</td>
                        <td className="px-4 py-3 border border-slate-200">
                          <p className="font-bold text-slate-700 text-xs">{item.sourceFilename}</p>
                        </td>
                        <td className="px-4 py-3 border border-slate-200 text-center text-xs font-medium">{displayDate(item.executionDate)}</td>
                        <td className="px-4 py-3 border border-slate-200 text-center text-xs font-medium">{displayDateTime(item.createdAt)}</td>
                        <td className="px-4 py-3 border border-slate-200 text-right text-xs font-bold text-slate-700">{item.totalRows.toLocaleString('vi-VN')}</td>
                        <td className="px-4 py-3 border border-slate-200 text-center">
                          <div className="flex justify-center gap-1 text-[10px] font-bold">
                            <span className="bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full">Tăng {item.increaseCount}</span>
                            <span className="bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full">Giảm {item.decreaseCount}</span>
                            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">Giữ {item.sameCount}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 border border-slate-200 text-center">
                          <div className="flex justify-center gap-2">
                            <button onClick={() => handleRestoreImportHistory(item)} className="bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-xl text-[11px] font-bold hover:bg-indigo-100 transition">
                              Mở lại
                            </button>
                            <button onClick={() => handleDeleteImportHistory(item.id)} className="bg-rose-50 text-rose-600 px-3 py-1.5 rounded-xl text-[11px] font-bold hover:bg-rose-100 transition">
                              Xóa
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {importHistory.length === 0 && (
                      <tr>
                        <td colSpan={7} className="text-center py-8 text-slate-400 text-sm">Chưa có lịch sử import Excel.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden mt-6">
            <div className="p-6 border-b border-slate-50 flex justify-between items-center">
              <h2 className="font-bold text-slate-800">Lịch sử So sánh 2 ngày</h2>
            </div>
            <div className="overflow-x-auto pb-4">
              <div className="min-w-[900px] px-4">
                <table className="w-full text-left border-collapse border border-slate-200">
                  <thead className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    <tr>
                      <th className="px-4 py-3 border border-slate-200 text-center w-12">STT</th>
                      <th className="px-4 py-3 border border-slate-200">Thông tin File cũ (A)</th>
                      <th className="px-4 py-3 border border-slate-200">Thông tin File mới (B)</th>
                      <th className="px-4 py-3 border border-slate-200 text-center w-32">Ngày lưu</th>
                      <th className="px-4 py-3 border border-slate-200 text-center w-52">Kết quả</th>
                      <th className="px-4 py-3 border border-slate-200 text-center w-32">Tác vụ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonHistory.map((item, index) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 border border-slate-200 text-center text-xs font-bold text-slate-500">{index + 1}</td>
                        <td className="px-4 py-3 border border-slate-200">
                          <p className="font-bold text-slate-700 text-xs">{item.fileAName}</p>
                          <p className="text-[10px] text-slate-400">Ngày TT: {item.dateA} — {item.result?.fileA?.totalRows ?? 0} cont</p>
                        </td>
                        <td className="px-4 py-3 border border-slate-200">
                          <p className="font-bold text-slate-700 text-xs">{item.fileBName}</p>
                          <p className="text-[10px] text-slate-400">Ngày TT: {item.dateB} — {item.result?.fileB?.totalRows ?? 0} cont</p>
                        </td>
                        <td className="px-4 py-3 border border-slate-200 text-center text-[10px] font-medium text-slate-600">
                          {new Date(item.savedAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-3 border border-slate-200">
                          <div className="flex justify-center gap-1.5">
                            <span className="bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded text-[10px] font-bold border border-indigo-100">
                              Trùng {item.result?.duplicateRows?.length ?? 0}
                            </span>
                            <span className="bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded text-[10px] font-bold border border-emerald-100">
                              Mới {item.result?.newRows?.length ?? 0}
                            </span>
                            <span className="bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded text-[10px] font-bold border border-amber-100">
                              Xong {item.result?.completedRows?.length ?? 0}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 border border-slate-200 text-center">
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={() => {
                                setComparisonResult(item.result);
                                setCompareFileAName(item.fileAName);
                                setCompareFileBName(item.fileBName);
                                setCompareDateA(item.dateA);
                                setCompareDateB(item.dateB);
                                setCompareFileARows(item.result.fileA.totalRows > 0 ? [] : []);
                                setCompareFileBRows(item.result.fileB.totalRows > 0 ? [] : []);
                                setCompareViewSection('duplicate');
                                saveComparisonSession(item);
                                setActiveTab('compare');
                              }}
                              className="bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-xl text-[11px] font-bold hover:bg-indigo-100 transition"
                            >
                              Mở lại
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm('Bạn có chắc muốn xóa lịch sử so sánh này?')) {
                                  deleteComparisonHistoryItem(item.id);
                                  setComparisonHistory(loadComparisonHistory());
                                }
                              }}
                              className="bg-rose-50 text-rose-600 px-3 py-1.5 rounded-xl text-[11px] font-bold hover:bg-rose-100 transition"
                            >
                              Xóa
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {comparisonHistory.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-slate-400 text-sm">
                          Chưa có lịch sử so sánh 2 ngày.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-50 flex justify-between items-center">
              <h2 className="font-bold text-slate-800">Lịch sử Đối Soát</h2>
            </div>
            <div className="overflow-x-auto pb-4">
              <div className="min-w-[800px] px-4">
                <table className="w-full text-left border-collapse border border-slate-200">
                  <thead className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    <tr>
                      <th className="px-4 py-3 border border-slate-200 text-center">STT</th>
                      <th className="px-4 py-3 border border-slate-200">Container</th>
                      <th className="px-4 py-3 border border-slate-200 text-center">Ngày cấp lệnh</th>
                      <th className="px-4 py-3 border border-slate-200 text-right">Phụ thu cũ</th>
                      <th className="px-4 py-3 border border-slate-200 text-right">Phụ thu mới</th>
                      <th className="px-4 py-3 border border-slate-200 text-right">Chênh lệch</th>
                      <th className="px-4 py-3 border border-slate-200 text-center">KL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reconLogs.map((log, index) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 border border-slate-200 text-center text-xs font-bold text-slate-500">{index + 1}</td>
                        <td className="px-4 py-3 border border-slate-200">
                          <p className="font-bold text-slate-700 text-xs">{log.containerId}</p>
                          <p className="text-[10px] text-slate-400">{log.containerType}</p>
                        </td>
                        <td className="px-4 py-3 border border-slate-200 text-center text-xs font-medium">{displayDate(log.bookingDate)}</td>
                        <td className="px-4 py-3 border border-slate-200 text-right text-xs font-bold text-slate-500">{log.surchargeAtBooking.toLocaleString('vi-VN')}</td>
                        <td className="px-4 py-3 border border-slate-200 text-right text-xs font-bold text-indigo-600">{log.surchargeNow.toLocaleString('vi-VN')}</td>
                        <td className="px-4 py-3 border border-slate-200 text-right">
                          <span className={`text-xs font-black ${
                            log.status === 'increase' ? 'text-rose-500' :
                            log.status === 'decrease' ? 'text-emerald-500' :
                            'text-slate-400'
                          }`}>
                            {log.status === 'increase' && '+'}{log.delta.toLocaleString('vi-VN')}
                          </span>
                        </td>
                        <td className="px-4 py-3 border border-slate-200 text-center">
                          {log.status === 'increase' && <span className="bg-rose-100 text-rose-600 px-2 py-0.5 rounded text-[10px] font-bold">Thu bù</span>}
                          {log.status === 'decrease' && <span className="bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded text-[10px] font-bold">Hoàn tiền</span>}
                          {log.status === 'same' && <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold">Giữ nguyên</span>}
                        </td>
                      </tr>
                    ))}
                    {reconLogs.length === 0 && (
                      <tr>
                        <td colSpan={7} className="text-center py-8 text-slate-400 text-sm">Chưa có dữ liệu đối soát.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
