# Rol ve Yetki Matrisi

Kaynak: [`src/lib/rbac.ts`](../src/lib/rbac.ts). Yetki kontrolü daima backend'de yapılır. Sistem yöneticisi tüm yetkilere sahiptir.

| Rol | Talep | RFQ | Sipariş | Mal Kabul | Kalite | Fatura | Tedarikçi | Katalog | Sözleşme | Bütçe | Rapor | Yönetim |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Sistem Yöneticisi | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Şirket Yöneticisi | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Talep Sahibi | Oluştur | – | – | – | – | – | – | Gör | – | – | – | – |
| Departman Amiri | Onayla | Gör | – | – | – | – | – | Gör | – | – | Gör | – |
| Teknik Onaycı | Onayla | Gör | – | – | – | – | – | Gör | – | – | – | – |
| Bütçe Onaycısı | Onayla | – | Onayla | – | – | – | – | – | – | Gör | Gör | – |
| Finans Onaycısı | Gör | – | Onayla | – | – | Onayla | – | – | – | Gör | Gör | – |
| Satınalma Uzmanı | Ata | Oluştur/Gönder/Değerlendir | Oluştur/Gönder | – | – | – | Oluştur/Düzenle | Gör | Gör | – | Gör | – |
| Satınalma Müdürü | Onayla/Ata | +Karar | +Onayla | – | – | – | +Onayla/Banka | Yönet | Yönet | Gör | Gör | – |
| Kalite Kullanıcısı | – | – | – | Gör | Denetle | – | Gör | – | – | – | Gör | – |
| Depo Kullanıcısı | – | – | Gör | Oluştur | – | – | – | – | – | – | – | – |
| Muhasebe Kullanıcısı | – | – | Gör | – | – | Oluştur/Eşleştir | Gör | – | – | – | Gör | – |
| Denetçi | Gör | Gör | Gör | – | – | Gör | Gör | – | Gör | Gör | Gör | Denetim |
| Görüntüleyici | Gör | Gör | Gör | – | – | – | Gör | Gör | – | – | Gör | – |
| Tedarikçi Yöneticisi/Kullanıcısı | Tedarikçi portalı (magic-link / ayrı yüzey) |

## Kayıt bazlı kapsam (row-level)

`UserScope` ile bir kullanıcı yalnızca yetkili olduğu **şirket / tesis / departman / proje / maliyet merkezi** kayıtlarını görebilir. Kapsam tanımlı değilse tenant genelinde erişim (yetkiler dahilinde) varsayılır. `src/lib/auth/context.ts → userInScope()`.

## Görevler ayrılığı & vekâlet

- **Görevler ayrılığı:** `ApprovalStep.enforceSegregation` ile kişi kendi oluşturduğu belgeyi onaylayamaz.
- **Vekâlet:** `Delegation` tablosu; onaycı, izinli tarih aralığında yetkisini başka kullanıcıya devreder. Vekâletle yapılan işlemler `ApprovalAction.actedOnBehalfOf` ile loglanır.
