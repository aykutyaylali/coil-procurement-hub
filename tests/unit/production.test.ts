import { describe, it, expect } from "vitest";
import {
  elapsedMinutes, liveStatus, scrapRatePct, activeOperatorCount, activeLines,
  producedSince, stationProgress, lineSummary, woProgressPct,
  type ProdLogRow, type WorkOrderRow, type StationRow,
} from "@/domain/production";

const log = (p: Partial<ProdLogRow>): ProdLogRow => ({
  operatorId: "o1", stationId: "s1", workOrderId: "w1", producedQty: 0, scrapQty: 0,
  status: "ACTIVE", checkInAt: new Date("2026-08-05T08:00:00Z"), checkOutAt: null, ...p,
});
const wo = (p: Partial<WorkOrderRow>): WorkOrderRow => ({ id: "w1", line: "LINE-2", targetCoils: 10, completedCoils: 0, status: "IN_PROGRESS", ...p });

describe("elapsedMinutes", () => {
  it("tam dakika hesaplar, negatifte 0", () => {
    expect(elapsedMinutes(new Date("2026-08-05T08:00:00Z"), new Date("2026-08-05T09:30:00Z"))).toBe(90);
    expect(elapsedMinutes(new Date("2026-08-05T09:00:00Z"), new Date("2026-08-05T08:00:00Z"))).toBe(0);
  });
});

describe("liveStatus", () => {
  it("çıkış varsa DONE", () => expect(liveStatus({ status: "ACTIVE", checkOutAt: new Date() })).toBe("DONE"));
  it("PAUSED korunur", () => expect(liveStatus({ status: "PAUSED", checkOutAt: null })).toBe("PAUSED"));
  it("aksi halde ACTIVE", () => expect(liveStatus({ status: "ACTIVE", checkOutAt: null })).toBe("ACTIVE"));
});

describe("scrapRatePct", () => {
  it("fire oranını yüzde (1 ondalık) verir", () => {
    const logs = [log({ producedQty: 95, scrapQty: 5 })];
    expect(scrapRatePct(logs)).toBe(5); // 5/100
  });
  it("üretim yoksa 0", () => expect(scrapRatePct([])).toBe(0));
});

describe("activeOperatorCount", () => {
  it("açık oturumdaki benzersiz operatörleri sayar", () => {
    const logs = [
      log({ operatorId: "a", checkOutAt: null }),
      log({ operatorId: "a", checkOutAt: null }),
      log({ operatorId: "b", checkOutAt: new Date() }), // kapalı -> sayılmaz
      log({ operatorId: "c", status: "PAUSED", checkOutAt: null }),
    ];
    expect(activeOperatorCount(logs)).toBe(2); // a + c
  });
});

describe("activeLines", () => {
  it("yalnız IN_PROGRESS iş emri hatlarını verir", () => {
    const wos = [wo({ line: "LINE-2" }), wo({ line: "LINE-4" }), wo({ line: "LINE-9", status: "PLANNED" })];
    expect(activeLines(wos)).toEqual(["LINE-2", "LINE-4"]);
  });
});

describe("producedSince", () => {
  it("verilen andan sonraki check-in'lerin üretimini toplar", () => {
    const since = new Date("2026-08-05T00:00:00Z");
    const logs = [
      log({ producedQty: 10, checkInAt: new Date("2026-08-05T08:00:00Z") }),
      log({ producedQty: 7, checkInAt: new Date("2026-08-04T23:00:00Z") }), // dün -> hariç
    ];
    expect(producedSince(logs, since)).toBe(10);
  });
});

describe("stationProgress", () => {
  it("istasyon bazlı üretilen/hedef ve % verir", () => {
    const stations: StationRow[] = [
      { id: "s1", code: "LO", name: "Loading", sequence: 1 },
      { id: "s2", code: "PRO", name: "Profiling", sequence: 2 },
    ];
    const logs = [
      log({ stationId: "s1", producedQty: 5 }),
      log({ stationId: "s1", producedQty: 3 }),
      log({ stationId: "s2", producedQty: 2 }),
    ];
    const res = stationProgress(wo({ targetCoils: 10 }), logs, stations);
    expect(res[0]).toMatchObject({ code: "LO", produced: 8, target: 10, pct: 80 });
    expect(res[1]).toMatchObject({ code: "PRO", produced: 2, pct: 20 });
  });
});

describe("lineSummary & woProgressPct", () => {
  it("hat bazlı toplar", () => {
    const wos = [wo({ line: "LINE-2", targetCoils: 10, completedCoils: 5 }), wo({ id: "w2", line: "LINE-2", targetCoils: 10, completedCoils: 5 })];
    const res = lineSummary(wos);
    expect(res[0]).toMatchObject({ line: "LINE-2", target: 20, completed: 10, pct: 50, activeWos: 2 });
  });
  it("iş emri % (100 üstü kırpılır)", () => {
    expect(woProgressPct({ targetCoils: 10, completedCoils: 5 })).toBe(50);
    expect(woProgressPct({ targetCoils: 10, completedCoils: 15 })).toBe(100);
    expect(woProgressPct({ targetCoils: 0, completedCoils: 5 })).toBe(0);
  });
});
