# OFDA Portal — Backend

API backend untuk OFDA Portal (PT Onduline Indonesia). Modul yang berjalan saat
ini adalah **OCR Purchase Invoice** untuk OBM: unggah invoice vendor, ekstraksi
otomatis dengan Google Gemini, review manual, 3-way match, lalu submit ke
Business Central.

Dibangun dengan NestJS 12 (ESM), Prisma 7 + PostgreSQL, dan BullMQ + Redis.

## Prasyarat

- Node.js 22+
- PostgreSQL 14+
- Redis 6+
- API key Google Gemini

## Setup

```bash
npm install
cp .env.example .env     # lalu isi DATABASE_URL, JWT_SECRET, GEMINI_API_KEY

npm run db:generate      # client Prisma tidak di-commit, jadi wajib digenerate
npm run db:migrate:deploy
npm run db:seed

npm run start:dev        # http://localhost:3000/api, Swagger di /api/docs
```

`JWT_SECRET` harus minimal 32 karakter; aplikasi menolak start bila lebih
pendek. Buat dengan `openssl rand -base64 48`.

> **Database yang sudah ada.** Jika sebelumnya skema dibuat lewat `prisma db
> push`, kolom `Invoice.poNumber`, `validatedById`, dan `validatedAt` mungkin
> sudah ada sehingga `db:migrate:deploy` akan gagal. Tandai migration-nya
> sebagai sudah diterapkan:
> ```bash
> npx prisma migrate resolve --applied 20261025000100_add_invoice_po_and_validation
> ```

## Perintah

| Perintah | Keterangan |
| --- | --- |
| `npm run start:dev` | Development server dengan watch |
| `npm run build` | Compile ke `dist/` |
| `npm run typecheck` | Typecheck tanpa emit |
| `npm test` | Unit test (Vitest) |
| `npm run test:e2e` | Test e2e HTTP |
| `npm run lint` | oxlint |
| `npm run format` | Prettier |
| `npm run db:migrate` | Buat dan terapkan migration baru |
| `npm run db:seed` | Seed role, permission, dan akun administrator |
| `npm run db:studio` | Prisma Studio |

## Arsitektur

```
src/
├── common/            Infrastruktur bersama, semuanya @Global()
│   ├── decorators/    @Permissions(), @CurrentUser()
│   ├── guards/        JwtAuthGuard, PermissionsGuard
│   ├── prisma/        PrismaService dan client untuk skrip
│   ├── queue/         Koneksi BullMQ dan konstanta queue
│   ├── storage/       Penyimpanan berkas invoice di disk lokal
│   └── health/        GET /api/health
├── config/            Validasi environment dengan zod
└── modules/
    ├── auth/              Login, refresh token, GET /auth/me
    ├── rbac/              Resolusi role dan permission
    ├── users/             CRUD user dan penugasan role
    ├── business-central/  Antarmuka BC (saat ini klien tiruan)
    └── ocr-invoice/       Invoice, job OCR, resolusi PO, submit BC
```

## Alur OCR

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

## RBAC

`PermissionsGuard` membaca metadata `@Permissions()` dengan semantik
**any-of**: user cukup punya salah satu permission yang didaftarkan. Role
`ADMINISTRATOR` selalu lolos.

| Role | Permission |
| --- | --- |
| `ADMINISTRATOR` | semua |
| `PURCHASER` | `ocr:upload`, `ocr:view`, `ocr:match`, `ocr:resolve_po`, `ocr:submit_bc` |
| `WAREHOUSE` | `ocr:grn_view` |
| `FINANCE` | `ocr:view`, `ocr:review`, `ocr:assign_gl`, `ocr:post_bc`, `ocr:submit_bc` |

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

## Berkas invoice

Direktori `storage/` tidak dipublikasikan sebagai static asset. Berkas hanya
bisa diambil lewat `GET /api/ocr/invoices/:id/files/:fileId/download` yang
dilindungi guard, dan `StorageService` menolak storage key yang keluar dari
direktori storage.

## Business Central

Integrasi BC belum aktif. `BusinessCentralModule` saat ini mendaftarkan
`MockBusinessCentralClient` yang mengembalikan purchase order contoh dan nomor
invoice tiruan, serta mencatat peringatan saat start. Response yang memuat data
ini menyertakan flag `mocked: true` sehingga UI bisa memberi tahu pengguna.

Untuk menyambung ke BC sungguhan: implementasikan `BusinessCentralClient`, lalu
ganti provider `BUSINESS_CENTRAL_CLIENT` di `business-central.module.ts`.

## Modul yang belum dibangun

Business Partner Portal, Expense Management, Sales Exception Approval, dan
Rebate Management belum ada di backend. Menu-nya di frontend mengarah ke
halaman "dalam pengembangan". Buat modulnya dengan
`npx nest g module <nama>` saat pengerjaannya dimulai.
