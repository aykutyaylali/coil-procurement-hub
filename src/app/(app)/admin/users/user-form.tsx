"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { createUser, updateUser } from "./actions";

export interface UserInitial {
  id?: string;
  name: string;
  email: string;
  title: string;
  phone: string;
  locale: "tr" | "en";
  departmentId: string;
  managerId: string;
  roleKeys: string[];
  isActive: boolean;
}

const empty: UserInitial = { name: "", email: "", title: "", phone: "", locale: "tr", departmentId: "", managerId: "", roleKeys: [], isActive: true };

export function UserForm({
  roles,
  departments,
  managers,
  initial,
  editMode,
}: {
  roles: { key: string; label: string }[];
  departments: { id: string; name: string }[];
  managers: { id: string; name: string }[];
  initial?: UserInitial;
  editMode?: boolean;
}) {
  const router = useRouter();
  const [f, setF] = useState<UserInitial>(initial ?? empty);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<UserInitial>) => setF((p) => ({ ...p, ...patch }));
  const toggleRole = (k: string) => set({ roleKeys: f.roleKeys.includes(k) ? f.roleKeys.filter((x) => x !== k) : [...f.roleKeys, k] });

  async function submit() {
    setBusy(true); setError("");
    const payload = { ...f, departmentId: f.departmentId || undefined, managerId: f.managerId || undefined };
    const res = editMode && f.id
      ? await updateUser({ ...payload, id: f.id, password: password || undefined })
      : await createUser({ ...payload, password });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    router.push("/admin/users");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Kullanıcı Bilgileri</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Ad Soyad *</Label><Input value={f.name} onChange={(e) => set({ name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>E-posta *</Label><Input type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} disabled={editMode} /></div>
          <div className="space-y-1.5"><Label>Ünvan</Label><Input value={f.title} onChange={(e) => set({ title: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Telefon</Label><Input value={f.phone} onChange={(e) => set({ phone: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Departman</Label>
            <Select value={f.departmentId} onChange={(e) => set({ departmentId: e.target.value })}>
              <option value="">— Yok —</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Yönetici (amir)</Label>
            <Select value={f.managerId} onChange={(e) => set({ managerId: e.target.value })}>
              <option value="">— Yok —</option>
              {managers.filter((m) => m.id !== f.id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Dil</Label>
            <Select value={f.locale} onChange={(e) => set({ locale: e.target.value as "tr" | "en" })}><option value="tr">Türkçe</option><option value="en">English</option></Select>
          </div>
          <div className="space-y-1.5"><Label>{editMode ? "Yeni Parola (boş = değişmez)" : "Parola *"}</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={editMode ? "••••••••" : "En az 8 karakter"} />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.isActive} onChange={(e) => set({ isActive: e.target.checked })} /> Aktif</label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Roller (RBAC)</CardTitle></CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((r) => (
            <label key={r.key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={f.roleKeys.includes(r.key)} onChange={() => toggleRole(r.key)} /> {r.label}
            </label>
          ))}
        </CardContent>
      </Card>

      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()} disabled={busy}>İptal</Button>
        <Button onClick={submit} disabled={busy}>{busy ? "Kaydediliyor..." : editMode ? "Güncelle" : "Kullanıcı Oluştur"}</Button>
      </div>
    </div>
  );
}
