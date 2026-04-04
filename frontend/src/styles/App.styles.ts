import { modalBackdrop, modalClose, labelXs, input } from './shared';

// ─── Root Layout ────────────────────────────────────────────────────────────
export const root = "flex h-screen bg-slate-50 overflow-hidden font-sans";
export const mainColumn = "flex-1 flex flex-col min-w-0 overflow-hidden";
export const mainContent = "flex-1 overflow-y-auto bg-slate-50/50";

// ─── Mobile Header ──────────────────────────────────────────────────────────
export const mobileHeader =
  "bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between z-30 sticky top-0";
export const mobileHeaderLeft = "flex items-center gap-2";
export const hamburgerBtn = "p-2 text-slate-500 hover:bg-slate-100 rounded-lg";
export const hamburgerLines = "w-6 h-5 flex flex-col justify-between";
export const hamburgerLine = "w-full h-0.5 bg-slate-600 rounded-full";
export const mobileTitle = "font-bold text-slate-800 uppercase tracking-tight text-sm";
export const adminBadge = "px-2.5 py-1.5 bg-indigo-50 text-indigo-600 text-xs font-bold rounded-lg uppercase";
export const headerBtn = "cursor-pointer font-semibold border-none rounded-lg px-3 py-1.5 text-xs flex items-center gap-1.5 transition-colors";
export const logoutBtn = "bg-red-600 hover:bg-red-700 text-white";
export const loginBtn = "bg-orange-600 hover:bg-orange-700 text-white";
export const fullscreenBtn = "bg-slate-800 hover:bg-indigo-600 text-white p-1.5 rounded-lg transition-colors";
export const fullscreenIcon = "w-4 h-4";

// ─── Loading / Error ────────────────────────────────────────────────────────
export const loadingWrapper = "flex flex-col items-center justify-center h-full gap-4";
export const loadingIcon = "w-12 h-12 text-indigo-600 animate-spin";
export const loadingText = "text-slate-500 font-bold animate-pulse uppercase tracking-widest text-xs";
export const errorWrapper = "flex flex-col items-center justify-center h-full gap-4";
export const errorIcon = "w-12 h-12 text-rose-500";
export const errorText = "text-slate-500 font-bold";

// ─── Login Modal ────────────────────────────────────────────────────────────
export const loginBackdrop = modalBackdrop;
export const loginPanel = "bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden";
export const loginHeader = "px-5 py-3 flex items-center justify-between border-b border-slate-200";
export const loginHeaderLeft = "flex items-center gap-2";
export const loginIconBox = "bg-indigo-100 text-indigo-600 p-2 rounded-md";
export const loginTitle = "font-bold text-slate-800 tracking-tight";
export const loginCloseBtn = "text-slate-400 hover:text-slate-600";
export const loginForm = "p-5 space-y-3";
export const loginError =
  "bg-rose-50 text-rose-600 text-xs font-bold p-2.5 rounded-lg flex items-center gap-2";
export const loginFieldGroup = "space-y-1";
export const loginLabel = labelXs;
export const loginInput = input;
export const loginSubmit =
  "w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-lg mt-3 transition-all shadow-sm";
