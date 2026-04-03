import React, { useMemo } from 'react';
import { Minimize, Fuel, TrendingUp, TrendingDown, Clock } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { Tier } from '../types';

function findContainerTierIndex(price: number, tiers: Tier[]): number {
  const sorted = [...tiers].sort((a, b) => a.minPrice - b.minPrice);
  for (let i = 0; i < sorted.length; i++) {
    if (price >= sorted[i].minPrice && price <= sorted[i].maxPrice) return i + 1;
  }
  return sorted.length;
}

function fmt(n: number): string {
  return n.toLocaleString('vi-VN');
}

interface Props {
  onExit: () => void;
}

const FullscreenOverlay: React.FC<Props> = ({ onExit }) => {
  const { prices, tiers, bulkTiers } = useAppContext();

  const sortedPrices = useMemo(
    () => [...prices].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [prices],
  );

  const latestPrice = sortedPrices.length > 0 ? sortedPrices[sortedPrices.length - 1] : null;
  const publishedPrice = prices.find(p => p.isPublished) ?? latestPrice;
  const currentPriceValue = publishedPrice?.priceV1 ?? 0;

  const publishedIdx = publishedPrice ? sortedPrices.findIndex(p => p.id === publishedPrice.id) : -1;
  const prevPrice = publishedIdx > 0 ? sortedPrices[publishedIdx - 1] : null;

  const sortedTiers = useMemo(() => [...tiers].sort((a, b) => a.minPrice - b.minPrice), [tiers]);
  const tierIndex = findContainerTierIndex(currentPriceValue, sortedTiers);
  const currentTier = sortedTiers[tierIndex - 1] ?? null;

  const sortedBulkTiers = useMemo(() => [...bulkTiers].sort((a, b) => a.minPrice - b.minPrice), [bulkTiers]);
  const activeBulk = sortedBulkTiers.find(
    (t) => currentPriceValue >= t.minPrice && currentPriceValue <= t.maxPrice,
  );
  const bulkTierIndex = activeBulk ? sortedBulkTiers.indexOf(activeBulk) + 1 : 0;

  const priceDelta = publishedPrice && prevPrice ? publishedPrice.priceV1 - prevPrice.priceV1 : 0;
  const isUp = priceDelta > 0;
  const isDown = priceDelta < 0;

  const dateStr = publishedPrice
    ? new Date(publishedPrice.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';

  return (
    <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-[#0a1628] via-[#0d2137] to-[#091a2a] text-white flex flex-col select-none">

      {/* ─── Header bar ─── */}
      <header className="flex items-center justify-between px-6 py-3 bg-black/20 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <Fuel className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-black tracking-tight uppercase">Cảng Sài Gòn — Tân Thuận Terminal</h1>
            <p className="text-[10px] text-white/40 font-bold tracking-widest uppercase">Hệ thống phụ thu nhiên liệu • QĐ 209/QĐ-CSG</p>
          </div>
        </div>
        <button
          onClick={onExit}
          className="flex items-center gap-2 bg-white/10 hover:bg-rose-600 text-white font-bold text-sm px-4 py-2 rounded-lg transition-all"
        >
          <Minimize className="w-4 h-4" />
          Thoát
        </button>
      </header>

      {/* ─── Main content: fill remaining space ─── */}
      <div className="flex-1 flex flex-col px-6 pt-4 pb-2 gap-4 min-h-0">

        {/* Row 1: Fuel price hero + tier badge — compact, centered */}
        <div className="shrink-0 bg-gradient-to-br from-[#0d3b66] to-[#0a2a4a] rounded-2xl px-8 py-4 flex items-center justify-center gap-12 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10 flex items-center gap-8">
            <div className="text-center">
              <p className="text-white/50 font-bold text-xs uppercase tracking-widest mb-1">Giá Dầu DO 0,05S-II</p>
              <div className="flex items-baseline justify-center gap-2">
                <span className="text-5xl font-black tracking-tight">{publishedPrice ? fmt(publishedPrice.priceV1) : '—'}</span>
                <span className="text-white/40 font-bold text-base">VND/Lít</span>
              </div>
            </div>
            <div className="w-px h-12 bg-white/10" />
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 text-white/40" />
              <span className="font-bold text-white/60 text-sm">{dateStr}</span>
            </div>
            {priceDelta !== 0 && (
              <>
                <div className="w-px h-12 bg-white/10" />
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-sm ${isUp ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                  {isUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  <span>{isUp ? '+' : ''}{fmt(priceDelta)} đ</span>
                </div>
              </>
            )}
            <div className="w-px h-12 bg-white/10" />
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-14 h-16 bg-amber-500/10 border-2 border-amber-400 rounded-xl flex items-center justify-center">
                  <span className="text-3xl font-black text-amber-400">{tierIndex}</span>
                </div>
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full animate-pulse" />
              </div>
              <div>
                <p className="text-white/40 font-bold text-[10px] uppercase tracking-widest">Bậc Phụ Thu</p>
                <p className="text-white/60 font-bold text-xs">
                  {currentTier ? `${fmt(currentTier.minPrice)} – ${currentTier.maxPrice >= 99999 ? 'Trở lên' : fmt(currentTier.maxPrice)}` : '—'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Row 2+3: Surcharge tables stacked — fill remaining vertical space */}
        <div className="flex flex-col gap-4 flex-1 min-h-0">
          {/* Container surcharge — top row */}
          <div className="flex-1 bg-white/5 backdrop-blur border border-white/10 rounded-2xl flex flex-col overflow-hidden min-h-0">
            <div className="px-6 py-2 border-b border-white/10 flex items-center gap-2 shrink-0">
              <div className="bg-indigo-500/20 p-1.5 rounded-md"><Fuel className="w-4 h-4 text-indigo-400" /></div>
              <h3 className="font-bold text-lg">Hàng Container — Bậc {tierIndex}</h3>
            </div>
            <div className="flex-1 flex flex-col justify-center px-8 py-3">
              {currentTier ? (
                <>
                  <div className="grid grid-cols-4 gap-6 mb-3">
                    <div className="text-center">
                      <p className="inline-flex items-center px-3 py-1 rounded-full bg-indigo-400/15 border border-indigo-300/30 text-indigo-100 text-sm font-extrabold uppercase tracking-widest mb-2 shadow-[0_0_20px_rgba(129,140,248,0.25)]">20 Full</p>
                      <p className="text-5xl 2xl:text-6xl font-black text-indigo-400 leading-none">{fmt(currentTier.surcharge20F)}</p>
                      <p className="text-white/30 text-sm font-bold mt-1">VND</p>
                    </div>
                    <div className="text-center">
                      <p className="inline-flex items-center px-3 py-1 rounded-full bg-indigo-400/15 border border-indigo-300/30 text-indigo-100 text-sm font-extrabold uppercase tracking-widest mb-2 shadow-[0_0_20px_rgba(129,140,248,0.25)]">40 Full</p>
                      <p className="text-5xl 2xl:text-6xl font-black text-indigo-400 leading-none">{fmt(currentTier.surcharge40F)}</p>
                      <p className="text-white/30 text-sm font-bold mt-1">VND</p>
                    </div>
                    <div className="text-center">
                      <p className="inline-flex items-center px-3 py-1 rounded-full bg-emerald-400/15 border border-emerald-300/30 text-emerald-100 text-sm font-extrabold uppercase tracking-widest mb-2 shadow-[0_0_20px_rgba(52,211,153,0.25)]">20 Empty</p>
                      <p className="text-5xl 2xl:text-6xl font-black text-emerald-400 leading-none">{fmt(currentTier.surcharge20E)}</p>
                      <p className="text-white/30 text-sm font-bold mt-1">VND</p>
                    </div>
                    <div className="text-center">
                      <p className="inline-flex items-center px-3 py-1 rounded-full bg-emerald-400/15 border border-emerald-300/30 text-emerald-100 text-sm font-extrabold uppercase tracking-widest mb-2 shadow-[0_0_20px_rgba(52,211,153,0.25)]">40 Empty</p>
                      <p className="text-5xl 2xl:text-6xl font-black text-emerald-400 leading-none">{fmt(currentTier.surcharge40E)}</p>
                      <p className="text-white/30 text-sm font-bold mt-1">VND</p>
                    </div>
                  </div>
                  <div className="border-t border-white/10 pt-2 text-center">
                    <span className="text-white/30 text-sm font-bold">Khoảng giá DO: </span>
                    <span className="text-white/60 text-sm font-bold">{fmt(currentTier.minPrice)} – {currentTier.maxPrice >= 99999 ? 'Trở lên' : fmt(currentTier.maxPrice)} VND</span>
                  </div>
                </>
              ) : (
                <p className="text-white/30 font-bold text-center">Không có dữ liệu bậc phụ thu</p>
              )}
            </div>
          </div>

          {/* Bulk cargo surcharge — bottom row */}
          <div className="flex-1 bg-white/5 backdrop-blur border border-white/10 rounded-2xl flex flex-col overflow-hidden min-h-0">
            <div className="px-6 py-2 border-b border-white/10 flex items-center gap-2 shrink-0">
              <div className="bg-emerald-500/20 p-1.5 rounded-md"><Fuel className="w-4 h-4 text-emerald-400" /></div>
              <h3 className="font-bold text-lg">Hàng Ngoài Container — Bậc {bulkTierIndex}</h3>
            </div>
            <div className="flex-1 flex items-center justify-center px-8 py-3">
              {activeBulk ? (
                <div className="flex items-center gap-12">
                  <div className="text-center">
                    <p className="text-white/30 text-sm font-bold uppercase tracking-widest mb-2">Mức phụ thu</p>
                    <div>
                      <span className="text-7xl 2xl:text-8xl font-black text-emerald-400 leading-none">{Number(activeBulk.percentSurcharge).toFixed(0)}</span>
                      <span className="text-3xl 2xl:text-4xl font-black text-emerald-400/70 ml-0.5 align-top">.{Number(activeBulk.percentSurcharge).toFixed(2).split('.')[1]}</span>
                      <span className="text-3xl 2xl:text-4xl font-black text-emerald-400/50 ml-1">%</span>
                    </div>
                  </div>
                  <div className="w-px h-16 bg-white/10" />
                  <div className="text-center">
                    <span className="text-white/30 text-sm font-bold">Khoảng giá DO: </span>
                    <span className="text-white/60 text-sm font-bold">{fmt(activeBulk.minPrice)} – {activeBulk.maxPrice >= 99999 ? 'Trở lên' : fmt(activeBulk.maxPrice)} VND</span>
                  </div>
                </div>
              ) : (
                <p className="text-white/30 font-bold">Không có dữ liệu bậc phụ thu</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer note */}
        <div className="shrink-0 text-center pb-1">
          <p className="text-white/15 text-[10px] font-bold tracking-widest uppercase">
            Quyết định số 209/QĐ-CSG ngày 24/03/2026 • Áp dụng từ 01/04/2026 • ESC để thoát
          </p>
        </div>
      </div>
    </div>
  );
};

export default FullscreenOverlay;
