"use client";
import { useState, useMemo } from "react";
import type { BidContext } from "@/domain/bidding";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { add, lineNet, lineTax, formatMoney } from "@/lib/money";
import { submitBidAction, submitBidByBuyerAction } from "./actions";
import type { Locale } from "@/lib/i18n";

const S = {
  tr: {
    terms: "Teklif Koşulları",
    currency: "Varsayılan Para Birimi",
    lineCurrency: "Para Br.",
    paymentDays: "Ödeme Vadesi",
    cash: "Peşin",
    days: "gün",
    incoterm: "Incoterm",
    items: "Kalemler",
    item: "Kalem",
    qty: "Miktar",
    quote: "Teklif",
    quoting: "Veriyorum",
    unitPrice: "Birim Fiyat",
    disc: "İsk.%",
    vat: "KDV%",
    lead: "Termin (gün)",
    lineTotal: "Satır Toplam",
    brand: "Marka/model (ops.)",
    freight: "Navlun / Nakliye Tutarı",
    notes: "Açıklama / Notlar",
    notesPh: "Teklifinizle ilgili notlar",
    grand: "Toplam Teklif (KDV + navlun dahil)",
    saveDraft: "Taslak Kaydet",
    submit: "Teklifi Gönder",
    confirmTitle: "Teklifi Onaylayın",
    confirmBody1: "için toplam",
    confirmBody2: "tutarında teklifinizi göndermek üzeresiniz. Gönderdikten sonra satınalma ekibi teklifinizi görüntüleyebilecek.",
    cancel: "Vazgeç",
    confirm: "Onayla ve Gönder",
    sending: "Gönderiliyor...",
    doneTitle: "Teklifiniz alınmıştır",
    doneBody: "için teklifiniz kaydedildi. Satınalma ekibi bilgilendirildi.",
    status: "Durum",
    close: "Bu sayfayı kapatabilirsiniz.",
  },
  en: {
    terms: "Quotation Terms",
    currency: "Default Currency",
    lineCurrency: "Curr.",
    paymentDays: "Payment Term",
    cash: "Advance/Cash",
    days: "days",
    incoterm: "Incoterm",
    items: "Items",
    item: "Item",
    qty: "Qty",
    quote: "Quote",
    quoting: "Quoting",
    unitPrice: "Unit Price",
    disc: "Disc.%",
    vat: "VAT%",
    lead: "Lead (days)",
    lineTotal: "Line Total",
    brand: "Brand/model (opt.)",
    freight: "Freight / Shipping Amount",
    notes: "Notes",
    notesPh: "Notes about your quotation",
    grand: "Total Quotation (incl. VAT + freight)",
    saveDraft: "Save Draft",
    submit: "Submit Quotation",
    confirmTitle: "Confirm Quotation",
    confirmBody1: "for a total of",
    confirmBody2: "you are about to submit your quotation. After submission the procurement team can view it.",
    cancel: "Cancel",
    confirm: "Confirm & Submit",
    sending: "Sending...",
    doneTitle: "Your quotation has been received",
    doneBody: "your quotation has been saved. The procurement team has been notified.",
    status: "Status",
    close: "You may close this page.",
  },
} as const;

// Türkiye'de geçerli KDV oranları (manuel giriş yerine seçim)
const VAT_RATES = ["0", "1", "10", "20"];

interface LineState {
  willQuote: boolean;
  unitPrice: string;
  discountPct: string;
  taxRate: string;
  brand: string;
  leadTimeDays: string;
  note: string;
  currency: string;
}

export function BidForm({ ctx, token, locale = "tr", preview = false, buyerRfqSupplierId }: { ctx: BidContext; token: string; locale?: Locale; preview?: boolean; buyerRfqSupplierId?: string }) {
  const s = S[locale];
  // Para birimi artık KALEM BAZLI girilir (üstte "varsayılan" alanı yok).
  // Navlunun kendi para birimi vardır; teklifin ana PB'si kalemlerden türetilir.
  const defaultCurrency = ctx.existingBid?.currency ?? ctx.currencyOptions[0] ?? "TRY";
  const [freightCurrency, setFreightCurrency] = useState(defaultCurrency);
  const [note, setNote] = useState(ctx.existingBid?.note ?? "");
  // Ödeme vadesi: mevcut teklif > tedarikçinin kayıtlı vadesi > boş (otomatik gelir)
  const [paymentTermDays, setPaymentTermDays] = useState(
    ctx.existingBid?.paymentTermDays != null ? String(ctx.existingBid.paymentTermDays) : ctx.supplierPaymentTermDays != null ? String(ctx.supplierPaymentTermDays) : "",
  );
  const [incoterm, setIncoterm] = useState(ctx.existingBid?.incoterm ?? "");
  const [freight, setFreight] = useState("0");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<null | { status: string; total: string }>(null);

  const [lines, setLines] = useState<Record<string, LineState>>(() => {
    const init: Record<string, LineState> = {};
    for (const l of ctx.lines) {
      const ex = ctx.existingBid?.lines[l.id];
      init[l.id] = {
        willQuote: ex?.willQuote ?? true,
        unitPrice: ex?.unitPrice ?? "0",
        discountPct: ex?.discountPct ?? "0",
        // İthalat/ihracatta KDV genelde 0; yurt içinde 20 varsayılan
        taxRate: ex?.taxRate ?? (ctx.operationType === "DOMESTIC_PURCHASE" ? "20" : "0"),
        brand: ex?.brand ?? "",
        leadTimeDays: ex?.leadTimeDays ?? "",
        note: ex?.note ?? "",
        currency: ex?.currency ?? defaultCurrency,
      };
    }
    return init;
  });

  function update(id: string, patch: Partial<LineState>) {
    setLines((prev) => ({ ...prev, [id]: { ...prev[id]!, ...patch } }));
  }

  // Para birimine göre gruplu toplam (kalemler farklı PB olabilir). Navlun kendi PB'sine eklenir.
  const totalsByCurrency = useMemo(() => {
    const map: Record<string, ReturnType<typeof add>> = {};
    for (const l of ctx.lines) {
      const ls = lines[l.id]!;
      if (!ls.willQuote) continue;
      const cur = ls.currency || defaultCurrency;
      const net = lineNet(l.quantity, ls.unitPrice, ls.discountPct);
      const withTax = add(net, lineTax(net, ls.taxRate));
      map[cur] = add(map[cur] ?? add(0), withTax);
    }
    if (Number(freight || "0") > 0) {
      map[freightCurrency] = add(map[freightCurrency] ?? add(0), freight || "0");
    }
    return map;
  }, [lines, freight, ctx.lines, freightCurrency, defaultCurrency]);
  const totalCurrencies = Object.keys(totalsByCurrency);
  // Teklifin ana para birimi: en büyük tutarlı PB (yoksa navlun PB'si).
  const primaryCurrency = useMemo(() => {
    let best = freightCurrency;
    let bestVal = -1;
    for (const [cur, val] of Object.entries(totalsByCurrency)) {
      const n = Number(val.toString());
      if (n > bestVal) { bestVal = n; best = cur; }
    }
    return best;
  }, [totalsByCurrency, freightCurrency]);

  async function save(submit: boolean) {
    setError("");
    setSubmitting(true);
    const payload = {
      currency: primaryCurrency,
      note: note || undefined,
      paymentTermDays: paymentTermDays ? parseInt(paymentTermDays, 10) : undefined,
      incoterm: incoterm || undefined,
      freightAmount: freight || "0",
      submit,
      lines: ctx.lines.map((l) => ({
        rfqLineId: l.id,
        willQuote: lines[l.id]!.willQuote,
        unitPrice: lines[l.id]!.unitPrice || "0",
        discountPct: lines[l.id]!.discountPct || "0",
        taxRate: lines[l.id]!.taxRate || "0",
        brand: lines[l.id]!.brand || undefined,
        leadTimeDays: lines[l.id]!.leadTimeDays || undefined,
        note: lines[l.id]!.note || undefined,
        currency: lines[l.id]!.currency || defaultCurrency,
      })),
    };
    const res = buyerRfqSupplierId
      ? await submitBidByBuyerAction(buyerRfqSupplierId, payload)
      : await submitBidAction({ token, ...payload });
    setSubmitting(false);
    setConfirming(false);
    if (!res.ok) setError(res.error);
    else setDone({ status: res.data.status, total: res.data.total });
  }

  if (done) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-success/15 text-2xl text-success">
            ✓
          </div>
          <h2 className="text-lg font-semibold">{s.doneTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {ctx.rfqNumber} {s.doneBody}
          </p>
          <p className="mt-3 text-sm">
            {s.status}: <span className="font-medium">{done.status}</span>
          </p>
          <p className="text-xs text-muted-foreground">{s.close}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{s.terms}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{s.paymentDays}</Label>
            <Select value={paymentTermDays} onChange={(e) => setPaymentTermDays(e.target.value)}>
              {paymentTermDays === "" && <option value="">—</option>}
              {[...new Set(["0", "30", "45", "60", "90", paymentTermDays].filter((v) => v !== ""))].sort((a, b) => Number(a) - Number(b)).map((d) => (
                <option key={d} value={d}>{d === "0" ? s.cash : `${d} ${s.days}`}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{s.incoterm}</Label>
            <Input value={incoterm} onChange={(e) => setIncoterm(e.target.value)} placeholder="EXW, DAP" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{s.items}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>{s.item}</TH>
                <TH className="text-right">{s.qty}</TH>
                <TH>{s.quote}</TH>
                <TH className="text-right">{s.unitPrice}</TH>
                <TH>{s.lineCurrency}</TH>
                <TH className="text-right">{s.disc}</TH>
                <TH className="text-right">{s.vat}</TH>
                <TH>{s.lead}</TH>
                <TH className="text-right">{s.lineTotal}</TH>
              </TR>
            </THead>
            <TBody>
              {ctx.lines.map((l) => {
                const ls = lines[l.id]!;
                const net = lineNet(l.quantity, ls.unitPrice, ls.discountPct);
                const withTax = add(net, lineTax(net, ls.taxRate));
                return (
                  <TR key={l.id}>
                    <TD>
                      <div className="font-medium">{l.description}</div>
                      {l.specs && <div className="text-xs text-muted-foreground">{l.specs}</div>}
                      <Input
                        className="mt-1 h-7 text-xs"
                        placeholder={s.brand}
                        value={ls.brand}
                        onChange={(e) => update(l.id, { brand: e.target.value })}
                      />
                    </TD>
                    <TD className="text-right">
                      {l.quantity} {l.uom ?? ""}
                    </TD>
                    <TD>
                      <label className="flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={ls.willQuote}
                          onChange={(e) => update(l.id, { willQuote: e.target.checked })}
                        />
                        {s.quoting}
                      </label>
                    </TD>
                    <TD>
                      <Input
                        className="h-8 w-28 text-right"
                        disabled={!ls.willQuote}
                        value={ls.unitPrice}
                        onChange={(e) => update(l.id, { unitPrice: e.target.value })}
                      />
                    </TD>
                    <TD>
                      <Select
                        className="h-8 w-20"
                        disabled={!ls.willQuote}
                        value={ls.currency}
                        onChange={(e) => update(l.id, { currency: e.target.value })}
                      >
                        {ctx.currencyOptions.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </Select>
                    </TD>
                    <TD>
                      <Input
                        className="h-8 w-16 text-right"
                        disabled={!ls.willQuote}
                        value={ls.discountPct}
                        onChange={(e) => update(l.id, { discountPct: e.target.value })}
                      />
                    </TD>
                    <TD>
                      <Select
                        className="h-8 w-20"
                        disabled={!ls.willQuote}
                        value={ls.taxRate}
                        onChange={(e) => update(l.id, { taxRate: e.target.value })}
                      >
                        {[...new Set([...VAT_RATES, ls.taxRate])].map((r) => (
                          <option key={r} value={r}>%{r}</option>
                        ))}
                      </Select>
                    </TD>
                    <TD>
                      <Input
                        className="h-8 w-20"
                        disabled={!ls.willQuote}
                        value={ls.leadTimeDays}
                        onChange={(e) => update(l.id, { leadTimeDays: e.target.value })}
                      />
                    </TD>
                    <TD className="text-right font-medium">
                      {ls.willQuote ? formatMoney(withTax, ls.currency) : "-"}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{s.freight}</Label>
            <div className="flex gap-2">
              <Input value={freight} onChange={(e) => setFreight(e.target.value)} className="flex-1" />
              <Select className="w-20" value={freightCurrency} onChange={(e) => setFreightCurrency(e.target.value)}>
                {ctx.currencyOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{s.notes}</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={s.notesPh} />
          </div>
        </CardContent>
      </Card>

      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <div className="flex items-center justify-between rounded-lg border bg-white p-4 dark:bg-slate-900">
        <div>
          <div className="text-xs text-muted-foreground">{s.grand}</div>
          {totalCurrencies.length === 0 ? (
            <div className="text-2xl font-bold">{formatMoney("0", primaryCurrency)}</div>
          ) : (
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              {totalCurrencies.map((cur) => (
                <span key={cur} className="text-2xl font-bold">
                  {formatMoney(totalsByCurrency[cur]!, cur)}
                </span>
              ))}
            </div>
          )}
          {totalCurrencies.length > 1 && (
            <div className="mt-1 text-xs text-muted-foreground">
              Kalemler farklı para birimlerinde; toplamlar para birimine göre ayrı gösterilir.
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {preview ? (
            <span className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              Önizleme — bu sayfa tedarikçinin gördüğü haldir; gönderim kapalıdır.
            </span>
          ) : (
            <>
              <Button variant="outline" onClick={() => save(false)} disabled={submitting}>
                {s.saveDraft}
              </Button>
              <Button onClick={() => setConfirming(true)} disabled={submitting}>
                {s.submit}
              </Button>
            </>
          )}
        </div>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>{s.confirmTitle}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">
                {ctx.rfqNumber} {s.confirmBody1}{" "}
                <b>{totalCurrencies.length ? totalCurrencies.map((c) => formatMoney(totalsByCurrency[c]!, c)).join(" + ") : formatMoney("0", primaryCurrency)}</b>{" "}
                {s.confirmBody2}
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirming(false)} disabled={submitting}>
                  {s.cancel}
                </Button>
                <Button onClick={() => save(true)} disabled={submitting}>
                  {submitting ? s.sending : s.confirm}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
