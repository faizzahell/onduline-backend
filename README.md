# OFDA Portal — Backend

API backend untuk OFDA Portal (PT Onduline Indonesia). Aplikasi multi-company
dengan RBAC, menjalankan beberapa modul:

- **OCR Purchase Invoice (OBM)** — unggah invoice vendor, ekstraksi otomatis
  dengan Google Gemini, review manual, 3-way match, lalu submit ke Business
  Central.
- **Expense Management** — pencatatan expense (manual atau lewat OCR struk),
  klaim per periode, rantai approval berbasis rule, petty cash, cash advance,
  dan laporan expense (rekap per karyawan + dashboard & grafik untuk admin).

Dibangun dengan NestJS 12 (ESM), Prisma 7 + PostgreSQL, dan BullMQ + Redis.

## Prasyarat

- Node.js 22+
- PostgreSQL 14+
- Redis 6+
- API key Google Gemini (hanya untuk fitur OCR)

## Setup

```bash
npm install
cp .env.example .env     # lalu isi DATABASE_URL, JWT_SECRET, GEMINI_API_KEY

npm run db:generate      # WAJIB: client Prisma digenerate ke src/generated/prisma
npm run db:migrate:deploy
npm run db:seed

npm run start:dev        # http://localhost:3000/api, Swagger di /api/docs
```

Catatan penting soal tiga perintah database di atas:

- **`npm run db:generate`** menjalankan `prisma generate`. Client Prisma
  digenerate ke `src/generated/prisma` dan **tidak di-commit**, jadi perintah
  ini wajib dijalankan setelah `npm install`, setelah setiap kali menarik
  perubahan pada `prisma/schema.prisma`, dan setiap kali `db:migrate` membuat
  migration baru (kalau client belum ikut tergenerate). Tanpa ini, typecheck
  dan runtime akan gagal karena tipe/field terbaru belum ada.
- **`npm run db:migrate:deploy`** menerapkan semua migration yang ada di
  `prisma/migrations` ke database tanpa membuat migration baru. Ini perintah
  yang dipakai saat setup awal dan di CI/produksi. Untuk membuat migration baru
  selama pengembangan, pakai `npm run db:migrate` (lihat tabel di bawah).
- **`npm run db:seed`** mengisi **hanya** RBAC (role + permission) dan **satu
  akun super administrator** dari `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` di
  `.env`. Seed tidak membuat company, master data, atau user lain — semuanya
  dibuat saat runtime oleh super administrator lewat aplikasi.

> **Langkah lanjutan setelah seed.** Login sebagai super administrator, lalu
> buat company pertama dari menu **Settings**, buat user, dan — bila ingin
> memakai OCR expense — aktifkan OCR expense untuk company tersebut. Sebelum
> company dibuat, sebagian besar modul belum bisa dipakai.

`JWT_SECRET` harus minimal 32 karakter; aplikasi menolak start bila lebih
pendek. Buat dengan `openssl rand -base64 48`.

Konfigurasi Prisma (lokasi schema, path migration, dan perintah seed) ada di
`prisma.config.ts`. `DATABASE_URL` dibaca dari `.env` lewat `dotenv`.

## Perintah

| Perintah                      | Keterangan                                          |
| ----------------------------- | --------------------------------------------------- |
| `npm run start:dev`         | Development server dengan watch                     |
| `npm run build`             | Compile ke `dist/`                                |
| `npm run typecheck`         | Typecheck tanpa emit                                |
| `npm test`                  | Unit test (Vitest)                                  |
| `npm run test:e2e`          | Test e2e HTTP                                       |
| `npm run lint`              | oxlint                                              |
| `npm run format`            | Prettier                                            |
| `npm run db:generate`       | Generate client Prisma ke `src/generated/prisma`  |
| `npm run db:migrate`        | Buat dan terapkan migration baru (development)      |
| `npm run db:migrate:deploy` | Terapkan migration yang ada (setup/CI/produksi)     |
| `npm run db:seed`           | Seed role, permission, dan satu super administrator |
| `npm run db:studio`         | Prisma Studio                                       |

## Arsitektur

```
src/
├── common/            Infrastruktur bersama, sebagian besar @Global()
│   ├── company/       Konteks company aktif per-request
│   ├── decorators/    @Permissions(), @CurrentUser(), @CurrentCompany()
│   ├── guards/        JwtAuthGuard, PermissionsGuard, CompanyAccessGuard
│   ├── numbering/     Penomoran dokumen (nomor klaim, batch, dll.)
│   ├── prisma/        PrismaService dan client untuk skrip
│   ├── queue/         Koneksi BullMQ dan konstanta queue
│   ├── storage/       Penyimpanan berkas (invoice & struk) di disk lokal
│   └── health/        GET /api/health
├── config/            Validasi environment dengan zod
├── generated/prisma/  Client Prisma hasil generate (tidak di-commit)
└── modules/
    ├── auth/              Login, refresh token, GET /auth/me
    ├── rbac/              Resolusi role dan permission
    ├── users/             CRUD user dan penugasan role
    ├── companies/         CRUD company + toggle fitur (mis. OCR expense)
    ├── business-central/  Antarmuka BC (saat ini klien tiruan)
    ├── ocr-invoice/       Invoice, job OCR, resolusi PO, submit BC
    ├── approval/          Rule approval dan materialisasi step per dokumen
    ├── expense-master/    Master data expense: karyawan, kategori, dimensi BC
    ├── expense/           Expense entry, OCR struk, dan klaim expense
    ├── petty-cash/        Batch petty cash
    ├── cash-advance/      Cash advance
    └── expense-reports/   Rekap expense form, nominatif entertainment, dashboard
```

## Alur OCR Purchase Invoice

1. `POST /api/ocr/invoices` membuat invoice kosong berstatus `UPLOADED`.
2. `POST /api/ocr/invoices/:id/files` menyimpan berkas (PDF/JPEG/PNG, maks
   10 MB) ke `storage/invoices/<invoiceId>/`, membuat `InvoiceFile` dan
   `OCRJob` dalam satu transaksi, lalu mengantrekan job ke queue
   `ocr-processing`.
3. `OcrProcessor` memanggil provider ekstraksi, menulis header dan baris item
   invoice, lalu menandai job `COMPLETED`. Status invoice menjadi `EXTRACTED`.
4. Reviewer mengoreksi lewat `PATCH /api/ocr/invoices/:id`, menautkan PO lewat
   `POST /:id/bind-po`, lalu menaikkan status lewat `PUT /:id/validate`
   (`VALIDATED` → `MATCHED`).
5. `POST /:id/submit-bc` mengirim invoice yang sudah `MATCHED` ke Business
   Central.

Transisi status dijaga oleh state machine di
`src/modules/ocr-invoice/invoice-status.ts`. Invoice yang sudah `SUBMITTED`
atau `POSTED` terkunci dan tidak bisa diubah.

## Alur Expense

1. Karyawan mencatat expense lewat `POST /api/expense/entries`, baik manual
   maupun dari hasil OCR struk. Entry dari OCR bisa disimpan sebagai **draft**
   (status `DRAFT`) meski datanya belum lengkap, lalu dilengkapi dan ditandai
   siap lewat `PUT /api/expense/entries/:id/verify` (status `VERIFIED`). Hanya
   entry `VERIFIED` yang bisa diklaim.
2. Entry yang belum terikat klaim masuk ke daftar **Unclaimed**. Klaim dibuat
   per periode lewat `POST /api/expense/claims`, hanya menyapu entry
   `VERIFIED` di periode tersebut.
3. Klaim melewati rantai approval yang dibentuk dari `ApprovalRule` yang cocok
   (per divisi/level) dan dimaterialisasi menjadi step saat submit:
   `SUBMITTED → ACCRUED → UNDER_REVIEW → APPROVED → POSTED`. Step review
   berbasis org-chart (HOD/regional manager) di-skip otomatis bila data org
   belum terisi, sehingga submit tidak terblokir.
4. **Laporan expense** hanya menghitung klaim yang **sudah di-approve** oleh
   EXPENSE_APPROVER (status `APPROVED`/`POSTED`), bukan saat baru disubmit.
   Rekap expense form per karyawan tetap menampilkan seluruh entry miliknya
   sebagai lembar kerja pribadi.

## RBAC

`PermissionsGuard` membaca metadata `@Permissions()` dengan semantik
**any-of**: user cukup punya salah satu permission yang didaftarkan. Role
`ADMINISTRATOR` selalu lolos. `CompanyAccessGuard` memastikan user hanya
mengakses data company yang menjadi haknya.

Role yang di-seed: `SUPER_ADMINISTRATOR`, `ADMINISTRATOR`, `PURCHASER`,
`WAREHOUSE`, `FINANCE`, `EMPLOYEE`, `EXPENSE_APPROVER`, dan `HR`, masing-masing
dengan kumpulan permission `ocr:*`, `expense:*`, dan `pettycash:*`. Hanya
`SUPER_ADMINISTRATOR` yang bisa membuat company dan mengaktifkan OCR expense
per company (lewat bypass di `RbacService`); permission `company:manage` dan
`company:switch` sengaja tidak diberikan ke role mana pun. Definisi otoritatif
ada di `prisma/seed/rbac.seed.ts`.

Setiap permission yang di-seed dipakai oleh setidaknya satu endpoint. Saat
menambah permission baru, pasang juga `@Permissions()`-nya di controller.

## Autentikasi

- Access token JWT berumur pendek (`JWT_EXPIRES_IN`, default `15m`).
- Refresh token acak 64 karakter, disimpan sebagai hash SHA-256 di tabel
  `RefreshToken`, dengan rotasi: token lama dicabut setiap kali dipakai.
- `GET /api/auth/me` mengembalikan role dan permission terkini sehingga
  perubahan hak akses tidak perlu menunggu token kedaluwarsa.
- Mengganti password atau menonaktifkan user otomatis mencabut semua refresh
  token milik user tersebut.

## Berkas unggahan

Direktori `storage/` tidak dipublikasikan sebagai static asset. Berkas hanya
bisa diambil lewat endpoint download yang dilindungi guard (mis.
`GET /api/ocr/invoices/:id/files/:fileId/download` dan
`GET /api/expense/entries/attachments/:attachmentId/download`), dan
`StorageService` menolak storage key yang keluar dari direktori storage.

## Business Central

Integrasi BC belum aktif. `BusinessCentralModule` saat ini mendaftarkan
`MockBusinessCentralClient` yang mengembalikan purchase order contoh dan nomor
invoice tiruan, serta mencatat peringatan saat start. Response yang memuat data
ini menyertakan flag `mocked: true` sehingga UI bisa memberi tahu pengguna.

Untuk menyambung ke BC sungguhan: implementasikan `BusinessCentralClient`, lalu
ganti provider `BUSINESS_CENTRAL_CLIENT` di `business-central.module.ts`.

## Modul yang belum dibangun

Business Partner Portal, Sales Exception Approval, dan Rebate Management belum
ada di backend. Menu-nya di frontend mengarah ke halaman "dalam pengembangan".
Buat modulnya dengan `npx nest g module <nama>` saat pengerjaannya dimulai.
