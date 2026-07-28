import { describe, it, expect } from "vitest";
import {
  parseReqApprovalPolicy,
  mergeReqApprovalPolicy,
  requiresApproval,
  DEFAULT_REQ_APPROVAL_POLICY,
} from "@/domain/approval-policy";

describe("talep onay politikası (satınalma belirler)", () => {
  it("ayar yoksa varsayılan: talep onaya gitmez (NEVER)", () => {
    expect(parseReqApprovalPolicy(null)).toEqual(DEFAULT_REQ_APPROVAL_POLICY);
    expect(DEFAULT_REQ_APPROVAL_POLICY.mode).toBe("NEVER");
    expect(requiresApproval("50000", parseReqApprovalPolicy("{}"))).toBe(false);
  });

  it("NEVER: hiçbir talep onaya gitmez", () => {
    const p = parseReqApprovalPolicy(JSON.stringify({ reqApproval: { mode: "NEVER", threshold: "0" } }));
    expect(requiresApproval("1000000", p)).toBe(false);
    expect(requiresApproval("0", p)).toBe(false);
  });

  it("THRESHOLD: eşik ve üzeri onaya gider, altı doğrudan onaylanır", () => {
    const p = parseReqApprovalPolicy(JSON.stringify({ reqApproval: { mode: "THRESHOLD", threshold: "10000" } }));
    expect(requiresApproval("9999.99", p)).toBe(false);
    expect(requiresApproval("10000", p)).toBe(true);
    expect(requiresApproval("25000", p)).toBe(true);
  });

  it("mergeReqApprovalPolicy diğer ayarları korur", () => {
    const merged = mergeReqApprovalPolicy(JSON.stringify({ theme: "dark" }), { mode: "THRESHOLD", threshold: "5000" });
    const obj = JSON.parse(merged);
    expect(obj.theme).toBe("dark");
    expect(obj.reqApproval).toEqual({ mode: "THRESHOLD", threshold: "5000" });
  });

  it("bozuk JSON güvenle varsayılana düşer", () => {
    expect(parseReqApprovalPolicy("{bozuk")).toEqual(DEFAULT_REQ_APPROVAL_POLICY);
  });
});
