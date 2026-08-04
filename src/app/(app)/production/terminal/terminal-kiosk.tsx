"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { ScanLine, UserCheck, Plus, AlertTriangle, LogOut, Pause, Play, RotateCcw } from "lucide-react";
import {
  resolveOperator, resolveWorkOrder, startSession, recordCoil, recordScrap, setSessionStatus, checkOut,
  type OperatorInfo, type SessionInfo,
} from "../actions";
import { LOG_STATUS_BADGE } from "../constants";

type Station = { id: string; code: string; name: string };
const STATION_KEY = "prod.terminal.stationId";

export function TerminalKiosk({ stations }: { stations: Station[] }) {
  const [stationId, setStationId] = useState<string>(stations[0]?.id ?? "");
  const [operator, setOperator] = useState<OperatorInfo | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [scan, setScan] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const station = stations.find((s) => s.id === stationId) ?? null;

  // İstasyon seçimini hatırla (kiosk fiziksel olarak bir istasyonda durur).
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(STATION_KEY) : null;
    if (saved && stations.some((s) => s.id === saved)) setStationId(saved);
  }, [stations]);
  useEffect(() => { if (stationId) window.localStorage.setItem(STATION_KEY, stationId); }, [stationId]);

  // Barkod okuyucu klavye taklidi eder → giriş her zaman odakta olsun.
  const focusInput = useCallback(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { if (!session) focusInput(); }, [operator, session, stationId, focusInput]);

  function flashMsg(m: string) { setFlash(m); window.setTimeout(() => setFlash(""), 1500); }

  async function onScan(e: React.FormEvent) {
    e.preventDefault();
    const value = scan.trim();
    if (!value || busy) return;
    setBusy(true); setError("");
    try {
      if (!operator) {
        const r = await resolveOperator(value);
        if (!r.ok) { setError(r.error); return; }
        setOperator(r.data);
        flashMsg(`Hoş geldin, ${r.data.name}`);
      } else if (!session) {
        if (!stationId) { setError("Önce istasyon seçin."); return; }
        const wo = await resolveWorkOrder(value);
        if (!wo.ok) { setError(wo.error); return; }
        const s = await startSession({ stationId, operatorId: operator.id, workOrderId: wo.data.id, barcode: value });
        if (!s.ok) { setError(s.error); return; }
        setSession(s.data);
        flashMsg(`İş emri açıldı: ${s.data.workOrderNumber}`);
      }
      setScan("");
    } finally {
      setBusy(false);
      setTimeout(focusInput, 0);
    }
  }

  async function act(fn: () => Promise<{ ok: true; data: SessionInfo } | { ok: false; error: string }>, msg?: string) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const r = await fn();
      if (!r.ok) { setError(r.error); return; }
      setSession(r.data);
      if (msg) flashMsg(msg);
    } finally { setBusy(false); }
  }

  function endSession() {
    setSession(null);
    setScan("");
    setTimeout(focusInput, 0);
  }

  function resetAll() { setSession(null); setOperator(null); setScan(""); setError(""); setTimeout(focusInput, 0); }

  const badge = session ? LOG_STATUS_BADGE[session.status] ?? LOG_STATUS_BADGE.ACTIVE! : null;

  return (
    <div className="mx-auto max-w-3xl">
      {/* İstasyon seçici */}
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
        <ScanLine className="size-6 text-primary" />
        <div className="flex-1">
          <label className="text-xs font-medium text-muted-foreground">Bu Terminalin İstasyonu</label>
          <select
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
            disabled={Boolean(session)}
            className="mt-0.5 block h-11 w-full rounded-md border bg-background px-3 text-base font-semibold disabled:opacity-60"
          >
            {stations.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
          </select>
        </div>
        {operator && (
          <button onClick={resetAll} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm hover:bg-accent" title="Operatör değiştir / sıfırla">
            <RotateCcw className="size-4" /> Sıfırla
          </button>
        )}
      </div>

      {/* Adım göstergesi */}
      <div className="mb-4 flex items-center gap-2 text-sm">
        <Step n={1} label="Operatör" done={Boolean(operator)} active={!operator} />
        <div className="h-px flex-1 bg-border" />
        <Step n={2} label="İş Emri" done={Boolean(session)} active={Boolean(operator) && !session} />
        <div className="h-px flex-1 bg-border" />
        <Step n={3} label="Üretim" done={false} active={Boolean(session)} />
      </div>

      {error && <p className="mb-4 rounded-lg bg-destructive/10 px-4 py-3 text-center text-base font-medium text-destructive">{error}</p>}
      {flash && <p className="mb-4 rounded-lg bg-green-500/10 px-4 py-3 text-center text-base font-medium text-green-600">{flash}</p>}

      {/* Operatör kartı */}
      {operator && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border bg-primary/5 p-4">
          <UserCheck className="size-8 text-primary" />
          <div>
            <div className="text-lg font-semibold">{operator.name}</div>
            <div className="text-sm text-muted-foreground">{operator.badgeCode} · {operator.title ?? "Operatör"}{operator.line ? ` · ${operator.line}` : ""}</div>
          </div>
        </div>
      )}

      {/* Barkod giriş alanı (Adım 1 & 2) */}
      {!session && (
        <form onSubmit={onScan} className="rounded-xl border bg-card p-6 text-center">
          <p className="mb-3 text-lg font-medium">
            {!operator ? "Operatör Rozetini Okutun veya Enter'a Basın" : "İş Emri / Bobin Barkodunu Okutun"}
          </p>
          <input
            ref={inputRef}
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            autoFocus
            disabled={busy}
            inputMode="text"
            placeholder={!operator ? "EMP-101" : "WO-2026-0001"}
            className="mx-auto block h-16 w-full max-w-md rounded-lg border-2 border-primary/40 bg-background px-4 text-center text-3xl font-bold tracking-wider outline-none focus:border-primary"
          />
          <div className="mt-4 flex justify-center gap-2">
            <button type="submit" disabled={busy || !scan.trim()} className="rounded-lg bg-primary px-8 py-3 text-lg font-semibold text-primary-foreground disabled:opacity-50">
              {busy ? "…" : "Onayla"}
            </button>
            {scan && <button type="button" onClick={() => setScan("")} className="rounded-lg border px-6 py-3 text-lg hover:bg-accent">Temizle</button>}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Barkod okuyucu çalışmıyorsa değeri klavye/numpad ile yazıp Enter'a basın.</p>
        </form>
      )}

      {/* Üretim işlemleri (Adım 3) */}
      {session && (
        <div className="rounded-xl border bg-card p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm text-muted-foreground">İş Emri</div>
              <div className="text-2xl font-bold">{session.workOrderNumber}</div>
              <div className="text-sm text-muted-foreground">İstasyon: {session.stationCode} · {session.stationName}</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Toplam Tamamlanan</div>
              <div className="text-2xl font-bold tabular-nums">{session.completedCoils}<span className="text-base font-normal text-muted-foreground">/{session.targetCoils}</span></div>
              <div className="text-sm">{badge?.dot} {badge?.label}</div>
            </div>
          </div>

          {/* Bu oturum sayaçları */}
          <div className="mb-5 grid grid-cols-2 gap-3">
            <div className="rounded-lg border bg-green-500/5 p-4 text-center">
              <div className="text-sm text-muted-foreground">Bu Oturum — Üretim</div>
              <div className="text-4xl font-bold tabular-nums text-green-600">{session.producedQty}</div>
            </div>
            <div className="rounded-lg border bg-amber-500/5 p-4 text-center">
              <div className="text-sm text-muted-foreground">Bu Oturum — Fire</div>
              <div className="text-4xl font-bold tabular-nums text-amber-600">{session.scrapQty}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => act(() => recordCoil(session.logId, 1), "+1 bobin")} disabled={busy || session.status === "PAUSED"} className="col-span-2 flex items-center justify-center gap-2 rounded-lg bg-green-600 py-5 text-2xl font-bold text-white disabled:opacity-50">
              <Plus className="size-7" /> Bobin Tamamlandı (+1)
            </button>
            <button onClick={() => act(() => recordScrap(session.logId, 1), "fire +1")} disabled={busy} className="flex items-center justify-center gap-2 rounded-lg bg-amber-500 py-4 text-lg font-semibold text-white disabled:opacity-50">
              <AlertTriangle className="size-5" /> Fire / Hata (+1)
            </button>
            {session.status === "PAUSED" ? (
              <button onClick={() => act(() => setSessionStatus(session.logId, "ACTIVE"), "devam")} disabled={busy} className="flex items-center justify-center gap-2 rounded-lg bg-primary py-4 text-lg font-semibold text-primary-foreground disabled:opacity-50">
                <Play className="size-5" /> Devam Et
              </button>
            ) : (
              <button onClick={() => act(() => setSessionStatus(session.logId, "PAUSED"), "mola")} disabled={busy} className="flex items-center justify-center gap-2 rounded-lg border py-4 text-lg font-semibold hover:bg-accent disabled:opacity-50">
                <Pause className="size-5" /> Mola
              </button>
            )}
            <button onClick={async () => { await act(() => checkOut(session.logId)); endSession(); }} disabled={busy} className="col-span-2 flex items-center justify-center gap-2 rounded-lg bg-destructive py-4 text-lg font-semibold text-white disabled:opacity-50">
              <LogOut className="size-5" /> Tamamla / Çıkış Yap
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Step({ n, label, done, active }: { n: number; label: string; done: boolean; active: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${active ? "text-primary" : done ? "text-green-600" : "text-muted-foreground"}`}>
      <span className={`flex size-7 items-center justify-center rounded-full border-2 text-sm font-bold ${active ? "border-primary" : done ? "border-green-600 bg-green-600 text-white" : "border-muted-foreground/40"}`}>{done ? "✓" : n}</span>
      <span className="font-medium">{label}</span>
    </div>
  );
}
