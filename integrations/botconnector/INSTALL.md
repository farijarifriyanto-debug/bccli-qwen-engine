# BCCLI — instalasi pengguna (npm)

BCCLI adalah **satu aplikasi CLI**. Pengguna tidak perlu membuat launcher sendiri, menginstal versi kedua, mengunduh arsip GitHub, atau menggunakan folder terisolasi. Folder terisolasi hanya dipakai pengembang untuk menguji paket tanpa mengganggu instalasi yang sudah ada.

## Instalasi normal (Windows, Linux, macOS)

Pastikan Node.js versi yang kompatibel dan `npm` telah terpasang. Gunakan Node.js 22.23.4 atau lebih baru pada lini 22 untuk Windows; pada lini Windows Node.js 24, gunakan 24.22.1 atau lebih baru. Engine mengharuskan Node.js >=22. Pada Linux, Node.js 22.23.2 dan 24.20.0 telah diuji dengan RC.4. Jika memakai NVM, pilih versi Node.js yang akan digunakan sebelum instalasi karena setiap versi NVM menyimpan paket globalnya secara terpisah.

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

**BCCLI RC.4 belum dapat menyimpan API key BotConnector baru langsung dari menu startup.** Untuk BotConnector Cloud, pengguna perlu login `bc-cloud` dari versi BCCLI lama *jika memang sudah memilikinya*, atau menyediakan variabel lingkungan `BOTCONNECTOR_API_KEY`. Jangan memasang versi lama hanya untuk menghindari proses onboarding; perbaikan login terintegrasi masih diperlukan pada versi berikutnya.

Provider pihak ketiga tersedia dalam menu. Penyimpanan API key melalui menu didukung di Windows (DPAPI). Pada Linux/macOS, gunakan variabel lingkungan provider seperti `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`, `GROQ_API_KEY`, atau `XAI_API_KEY`. Jangan menaruh API key dalam repository, tangkapan layar, atau log.

## Versi dan batasan rilis

- Pada 30 Oktober 2026, `@botconnector/bccli@next` adalah **0.5.0-rc.4**.
- `@botconnector/bccli@latest` tetap **0.4.17** (stabil); memakai `npm install -g @botconnector/bccli` tanpa `@next` tidak memasang RC.4.
- Ini prerelease CLI. Kompatibilitas SDK `dist/sdk.js` dari rilis lama belum tersedia dan sejumlah perintah upstream belum diekspos; jangan mempromosikannya sebagai rilis stabil.
- Uninstall standar: `npm uninstall -g @botconnector/bccli`.
- Dependensi `@qwen-code/qwen-code@0.26.3` adalah engine internal BCCLI, bukan aplikasi BCCLI kedua. Lisensi dan atribusi upstream tetap dipertahankan.

Paket dan checksum resmi: https://github.com/farijarifriyanto-debug/bccli-qwen-engine/releases/tag/bccli-v0.5.0-rc.4
