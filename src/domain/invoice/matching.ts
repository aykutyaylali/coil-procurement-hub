import { d, add, sub, mul, div, lineNet, lineTax, toStr, gt } from "@/lib/money";

/**
 * ÃœÃ§lÃ¼ eÅŸleÅŸtirme (POâ€“Mal Kabulâ€“Fatura) motoru. Saf ve test edilebilir.
 * Her satÄ±r iÃ§in miktar/fiyat/vergi farkÄ± ve tolerans sonucu hesaplanÄ±r.
 */
export interface MatchInputLine {
  orderLineId: string;
  description: string;
  orderedQty: string;
  orderedPrice: string;
  receivedQty: string;
  prevInvoicedQty: string;
  thisQty: string;
  thisPrice: string;
  taxRate: string;
}

export interface Tolerances {
  qtyPct: string;
  pricePct: string;
  amountAbs: string;
}

export interface MatchLineResult {
  orderLineId: string;
  description: string;
  orderedQty: string;
  orderedPrice: string;
  receivedQty: string;
  prevInvoicedQty: string;
  thisQty: string;
  thisPrice: string;
  qtyDiff: string; // (prevInvoiced + thisQty) - receivedQty
  priceDiff: string; // thisPrice - orderedPrice
  lineNet: string;
  lineTax: string;
  status: "MATCHED" | "OVER_INVOICED" | "PRICE_VARIANCE" | "NOT_RECEIVED";
  withinTolerance: boolean;
  reasons: string[];
}

export interface MatchResult {
  lines: MatchLineResult[];
  passed: boolean;
  netTotal: string;
  taxTotal: string;
  grandTotal: string;
  blockedReasons: string[];
}

function pctExceeds(value: string, base: string, tolPct: string): boolean {
  const allowed = d(base).abs().times(d(tolPct).dividedBy(100));
  return gt(d(value).abs().toString(), allowed.toString());
}

export function matchInvoice(lines: MatchInputLine[], tol: Tolerances): MatchResult {
  const results: MatchLineResult[] = [];
  let netTotal = add(0), taxTotal = add(0);
  const blockedReasons: string[] = [];

  for (const l of lines) {
    const reasons: string[] = [];
    const totalInvoiced = add(l.prevInvoicedQty, l.thisQty);
    const qtyDiff = sub(totalInvoiced, l.receivedQty); // >0 => fazla faturalanmÄ±ÅŸ
    const priceDiff = sub(l.thisPrice, l.orderedPrice);
    const net = lineNet(l.thisQty, l.thisPrice);
    const tax = lineTax(net, l.taxRate);
    netTotal = add(netTotal, net);
    taxTotal = add(taxTotal, tax);

    let status: MatchLineResult["status"] = "MATCHED";
    let within = true;

    // Mal kabul yok (en yÃ¼ksek Ã¶ncelik)
    if (!gt(l.receivedQty, "0")) {
      status = "NOT_RECEIVED";
      within = false;
      reasons.push("Bu satÄ±r iÃ§in mal kabul yapÄ±lmamÄ±ÅŸ");
    } else {
      // Fazla faturalama (miktar toleransÄ± aÅŸÄ±mÄ±)
      const qtyAllowed = mul(l.receivedQty, add(1, div(tol.qtyPct, 100)));
      if (gt(totalInvoiced.toString(), qtyAllowed.toString())) {
        status = "OVER_INVOICED";
        within = false;
        reasons.push(`Faturalanan miktar mal kabulÃ¼ aÅŸÄ±yor (tolerans %${tol.qtyPct})`);
      }
    }

    // Fiyat sapmasÄ±
    if (pctExceeds(priceDiff.toString(), l.orderedPrice, tol.pricePct)) {
      if (status === "MATCHED") status = "PRICE_VARIANCE";
      within = false;
      reasons.push(`Birim fiyat sipariÅŸten sapÄ±yor (tolerans %${tol.pricePct})`);
    }

    if (!within) blockedReasons.push(`${l.description}: ${reasons.join(", ")}`);

    results.push({
      orderLineId: l.orderLineId,
      description: l.description,
      orderedQty: toStr(l.orderedQty, 4),
      orderedPrice: toStr(l.orderedPrice, 4),
      receivedQty: toStr(l.receivedQty, 4),
      prevInvoicedQty: toStr(l.prevInvoicedQty, 4),
      thisQty: toStr(l.thisQty, 4),
      thisPrice: toStr(l.thisPrice, 4),
      qtyDiff: toStr(qtyDiff, 4),
      priceDiff: toStr(priceDiff, 4),
      lineNet: toStr(net, 2),
      lineTax: toStr(tax, 2),
      status,
      withinTolerance: within,
      reasons,
    });
  }

  return {
    lines: results,
    passed: blockedReasons.length === 0,
    netTotal: toStr(netTotal, 2),
    taxTotal: toStr(taxTotal, 2),
    grandTotal: toStr(add(netTotal, taxTotal), 2),
    blockedReasons,
  };
}
