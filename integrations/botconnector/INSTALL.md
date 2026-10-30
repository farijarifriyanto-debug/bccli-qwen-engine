# BCCLI — instalasi pengguna (npm)

BCCLI adalah **satu aplikasi CLI**. Pengguna tidak perlu membuat launcher sendiri, menginstal versi kedua, mengunduh arsip GitHub, atau menggunakan folder terisolasi. Folder terisolasi hanya dipakai pengembang untuk menguji paket tanpa mengganggu instalasi yang sudah ada.

## Instalasi normal (Windows, Linux, macOS)

Pastikan Node.js versi yang kompatibel dan `npm` telah terpasang. Gunakan Node.js 22.23.4 atau lebih baru pada lini 22 untuk Windows; pada lini Windows Node.js 24, gunakan 24.22.1 atau lebih baru. Engine mengharuskan Node.js >=22. Pada Linux, Node.js 22.23.2 dan 24.20.0 telah diuji dengan RC.4; RC.5 membutuhkan hasil CI tersendiri. Jika memakai NVM, pilih versi Node.js yang akan digunakan sebelum instalasi karena setiap versi NVM menyimpan paket globalnya secara terpisah.

```sh
npm install -g @botconnector/bccli@next
bccli
```

Perintah yang sama memperbarui versi global yang sudah ada **pada prefix npm aktif**. Setelah instalasi tidak ada langkah `--prefix`, symlink manual, atau perintah `bccli-preview` / `bccli-legacy`.

```sh
bccli --version
bccli auth status
bccli --choose
```

`bccli` langsung membuka chat menggunakan provider dan model aktif jika kredensial sudah tersedia. `--choose` hanya untuk mengganti provider/model. Model saat ini diperiksa terhadap daftar model provider. Peringatan instalasi tentang skrip `@qwen-code/audio-capture` adalah dependensi audio opsional, bukan kegagalan instalasi atau alasan mengaktifkan skrip tanpa kebutuhan.

## Autentikasi pertama kali

**Windows:** BCCLI menerima API key BotConnector Cloud langsung dari terminal saat pertama dijalankan. Pilih BotConnector Cloud pada menu `bccli` atau gunakan `bccli --choose`; untuk mengganti key, pilih `1!`. Alternatifnya, jalankan `bccli provider add botconnector`. Input key disembunyikan dan disimpan terenkripsi dengan Windows DPAPI. Pada menu, katalog model diperiksa sebelum key baru ditulis. Key lama tetap aman jika validasi gagal. Credential `bc-cloud` lama tetap menjadi fallback tanpa migrasi otomatis.

**Linux/macOS:** untuk Cloud, gunakan `BOTCONNECTOR_API_KEY` sebagai variabel lingkungan. Persistensi terenkripsi lintas platform belum didukung.

Provider pihak ketiga tersedia dalam menu. Penyimpanan API key melalui menu didukung di Windows (DPAPI). Pada Linux/macOS, gunakan variabel lingkungan provider seperti `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`, `GROQ_API_KEY`, atau `XAI_API_KEY`. Jangan menaruh API key dalam repository, tangkapan layar, atau log.

## Versi dan batasan rilis

- Setelah publikasi RC.5 dan verifikasi registry, `@botconnector/bccli@next` ditargetkan **0.5.0-rc.5**. Sebelum itu, periksa dist-tag dengan `npm view @botconnector/bccli dist-tags`.
- `@botconnector/bccli@latest` tetap **0.4.17** (stabil); memakai `npm install -g @botconnector/bccli` tanpa `@next` tidak memasang RC.5.
- Ini prerelease CLI. Kompatibilitas SDK `dist/sdk.js` dari rilis lama belum tersedia dan sejumlah perintah upstream belum diekspos; jangan mempromosikannya sebagai rilis stabil.
- Uninstall standar: `npm uninstall -g @botconnector/bccli`.
- Dependensi `@qwen-code/qwen-code@0.26.3` adalah engine internal BCCLI, bukan aplikasi BCCLI kedua. Lisensi dan atribusi upstream tetap dipertahankan.

Paket dan checksum resmi: https://github.com/farijarifriyanto-debug/bccli-runtime/releases/tag/bccli-v0.5.0-rc.5
