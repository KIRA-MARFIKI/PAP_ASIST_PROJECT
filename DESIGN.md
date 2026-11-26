# Desain Sistem PaP Asist

## Identitas Visual & Aset Merek
- Susunan identitas merek utama pada beranda, header hasil pencarian, dan halaman error menampilkan logo sayap Honda `public/honda-7.webp` tepat di atas logo judul `public/PAP1.webp`.
- Favicon tab browser dan apple-touch-icon menggunakan `public/PAP_nonbackground.webp` (latar transparan agar tajam di tab browser terang maupun gelap).
- Watermark proteksi merek di seluruh antarmuka, modal, panel, kartu hasil, dan hasil tangkapan/unduhan menggunakan `public/PAP10.webp`.

## Tema & Tipografi
- Tema terang berlatar putih bersih (`#FFFFFF`), teks utama `#18181B`, abu netral (`#F4F4F5`, `#E4E4E7`, `#71717A`).
- Satu warna aksen: merah Honda (`#CC0000`) untuk tombol aktif, badge notifikasi, tab terpilih, dan indikator fokus.
- Font: `Plus Jakarta Sans` dengan `font-variant-numeric: tabular-nums` untuk kode part, harga, jumlah stok, dan penghitung digit PIN.
- Radius: kolom pencarian bulat penuh (`9999px`), kartu dan tombol lain `8px`. Bayangan hanya pada dropdown dan panel melayang. Tanpa glow, glassmorphism, gradien, grid latar, atau emoji.

## Watermark Proteksi Merek (`PAP10.webp`) & Atribusi Harga
- Penggunaan watermark `public/PAP10.webp` di seluruh antarmuka (latar global, panel mengambang, modal, kartu hasil, preview kamera, Admin Asist, Upload Data Baru, dan Riwayat Upload) serta pada setiap gambar hasil tangkapan kamera atau unduhan/ekspor adalah kebutuhan proteksi merek eksplisit dari pemilik proyek.
- Opasitas watermark pada permukaan terang dikalibrasi rendah (`0.06` sampai `0.08` dengan `mix-blend-multiply`) sehingga seluruh teks utama tetap memenuhi rasio kontras WCAG AA (`>= 4.5:1`).
- Setiap harga yang berasal dari referensi katalog Honda Cengkareng wajib menampilkan label atribusi eksplisit `"Harga dari katalog hondacengkareng.com"` agar tidak tertukar dengan harga resmi gudang Menara Agung Padang Panjang.
- Seluruh fitur ekspor/unduhan di masa depan (CSV, PDF, maupun laporan gambar) wajib merujuk ke utilitas terpusat di `src/utils/watermark.ts`.

## Aksesibilitas Kontrol Ikon
- Semua tombol ikon wajib berupa native `<button type="button">` dengan `cursor-pointer` (atau `cursor-not-allowed` saat nonaktif), target sentuh minimum `44x44px`, `aria-label` berbahasa Indonesia, `title` tooltip, serta `aria-hidden="true"` pada SVG ikon.
- Teks tetap ditampilkan pada kontrol yang berpotensi ambigu bila hanya berupa ikon: label tab (`Semua`, `Fast Moving`, `Slow Moving`), tombol submit form utama, dan label status (`Tersedia`, `Kritis`, `Tidak Tersedia`, `Belum Diatur`, `Berhasil`, `Sebagian Gagal`, `Gagal`).

## Ikon yang Diizinkan (Lucide, `strokeWidth={1.75}`)
- `Search`: ikon cari di sisi kiri kolom pencarian.
- `Paperclip`: ikon klip di sisi kanan kolom pencarian untuk mengunggah foto dari perangkat.
- `Camera`: ikon kamera di sisi kanan kolom pencarian untuk membuka viewfinder kamera langsung.
- `SwitchCamera`: tombol ganti kamera depan/belakang pada `CameraModal` saat perangkat memiliki lebih dari satu kamera.
- `Table`: tombol pembuka panel Daftar Part di pojok kanan atas.
- `Lock`: tombol Login Admin Gudang saat belum masuk.
- `ShieldCheck`: tombol pembuka ruang kerja Admin Asist saat admin sudah masuk.
- `Bell`: tombol notifikasi stok menipis di pojok kanan atas.
- `LogOut`: tombol keluar sesi admin pada header Admin Asist dan modal akun.
- `Upload`: tombol pembuka modal Upload Data Baru di header Admin Asist.
- `FileClock`: tombol pembuka panel Riwayat Upload di header Admin Asist.
- `CloudDownload`: tombol sinkronisasi batch harga referensi Honda Cengkareng dan alias AI (10 part/batch) di header Admin Asist.
- `KeyRound`: tombol pembuka modal ubah kredensial admin (email, password, PIN 12 digit) di header Admin Asist.
- `Pencil`: tombol aksi edit cepat satu baris part di tabel Admin Asist.
- `Download`: tombol unduh template CSV gudang pada modal Upload Data Baru.
- `History`: ikon item riwayat pencarian di dropdown riwayat.
- `Trash2`: tombol hapus riwayat pencarian.
- `X`: tombol tutup modal/panel, hapus teks pencarian, dan hapus thumbnail foto terpilih.
- `RefreshCw`: tombol muat ulang kode captcha acak pada modal Login.
- `Eye` / `EyeOff`: toggle tampilkan/sembunyikan password dan PIN 12 digit pada modal Login dan Ubah Kredensial.
- `ChevronDown` / `ChevronUp`: toggle buka/tutup detail baris gagal pada Riwayat Upload.
