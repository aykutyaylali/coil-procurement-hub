import { add, d, div, mul, toStr } from "@/lib/money";

/**
 * Landed cost (ithalat toplam maliyeti) dağıtımı.
 * Her masraf kalemi, seçilen yönteme (miktar/ağırlık/hacim/değer) göre
 * sipariş satırlarına dağıtılır. Saf fonksiyon — test edilebilir.
 */
export interface AllocLine {
  id: string;
  quantity: string;
  weight?: string | null;
  volume?: string | null;
  lineTotal: string; // net değer
}

export interface CostItem {
  amount: string;
  allocationMethod: "QUANTITY" | "WEIGHT" | "VOLUME" | "VALUE";
}

export interface AllocationResult {
  perLine: Record<string, string>; // lineId -> dağıtılan tutar
  total: string;
}

function basisValue(line: AllocLine, method: CostItem["allocationMethod"]): string {
  switch (method) {
    case "QUANTITY":
      return line.quantity;
    case "WEIGHT":
      return line.weight ?? "0";
    case "VOLUME":
      return line.volume ?? "0";
    case "VALUE":
    default:
      return line.lineTotal;
  }
}

export function allocateLandedCost(lines: AllocLine[], costs: CostItem[]): AllocationResult {
  const perLine: Record<string, string> = {};
  for (const l of lines) perLine[l.id] = "0";

  let total = add(0);
  for (const cost of costs) {
    total = add(total, cost.amount);
    const basisTotal = add(...lines.map((l) => basisValue(l, cost.allocationMethod)));
    if (d(basisTotal).isZero()) {
      // Baz sıfırsa eşit dağıt
      const share = div(cost.amount, lines.length || 1);
      for (const l of lines) perLine[l.id] = toStr(add(perLine[l.id], share), 4);
      continue;
    }
    for (const l of lines) {
      const weight = div(basisValue(l, cost.allocationMethod), basisTotal);
      const share = mul(cost.amount, weight);
      perLine[l.id] = toStr(add(perLine[l.id], share), 4);
    }
  }

  return { perLine, total: toStr(total, 2) };
}
