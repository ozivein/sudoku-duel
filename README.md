# ⚡ Sudoku Duel

> **Hızlı, Rekabetçi ve Gerçek Zamanlı Sudoku Düellosu!**  
> Match Masters dinamiklerini klasik Sudoku mantığıyla buluşturan, mobil öncelikli web oyunu prototipi.

---

## 🎮 Oyun Özellikleri

- **Ortak 9x9 Sudoku Tahtası:** Her iki oyuncu aynı tahta üzerinde eşzamanlı yarışır.
- **8 Dakikalık Maç Formatı:** Maç süresi 480 saniye; son 60 saniyede uyarı, son 10 saniyede geri sayım sesleri ve görsel efektler.
- **5 Saniyelik Hamle Süresi:** Bir kare seçildiğinde karar vermek için 5 saniye başlar.
- **Combo & Puanlama:**
  - Doğru hamleler ardışık combo oluşturur (+10, +15, +20, +25...).
  - Yanlış hamle -5 puan cezası verir ve combo'yu sıfırlar (kalkan yoksa).
  - 3x3 bölgedeki boş hücreleri ilk tamamlayan tarafa **+100 Puan Bölge Hakimiyeti Bonusu** verilir.
- **Karşı Hamle (Counter-Snipe):** Rakibin odaklandığı hücreyi ondan önce kaparak puanını çalma şansı.

---

## ⚡ 7 Özel Güç Sistemi (3'lü Deste Seçimi)

Maç başlamadan önce 7 güç arasından 3 tanesi seçilerek desteye eklenir:

| Güç | Bekleme Süresi | Etki |
|---|:---:|---|
| **⚡ Hız Patlaması** | 25 sn | 6 saniye boyunca doğru cevaplardan kazanılan puanlar %50 artar. |
| **🛡️ Hata Kalkanı** | 30 sn | Bir sonraki yanlış cevapta -5 puan cezasını ve combo kaybını engeller. |
| **🔍 Dedektif** | 20 sn | Seçili boş hücreye gelebilecek geçerli Sudoku aday rakamlarını hesaplar ve gösterir. |
| **🔥 Combo Kurtarıcı** | 30 sn | Yanlış cevap verildiğinde combo sıfırlanmak yerine sadece 1 kademe düşer. |
| **👑 Bölge Avcısı** | 40 sn | Tamamlanan sonraki 3x3 bölge için +100 yerine +150 bonus kazandırır. |
| **❄️ Buz Darbesi** | 35 sn | Rakibin tahtasını 5 saniyeliğine tamamen dondurur ve görmesini engeller. |
| **🌀 Tahta Karıştırıcı** | 35 sn | Rakibin tahtasındaki rakamları ve hücreleri 5 saniye boyunca sürekli karıştırarak kafa karıştırır. |

---

## 🕹️ Oyun Modları

1. **🤖 Tek Oyunculu (AI Bot):**
   - Skora göre temposunu ayarlayan, hatalar yapabilen ve güçleri taktiksel olarak kullanan bot rakip.
2. **🌐 Gerçek Zamanlı Çok Oyunculu (Multiplayer):**
   - 4 haneli oda koduyla (Host / Join) iki oyuncunun aynı anda oynaması.
   - P2P / Broadcast senkronizasyonu ile deterministik maç otoritesi.

---

## 🛠️ Teknolojiler

- **React 18** + **TypeScript**
- **Vite** (Hızlı derleme ve geliştirme ortamı)
- **Lucide React** (Modern SVG ikon seti)
- **Web Audio API** (Sentezlenmiş dinamik ses efektleri)
- **CSS3 Animations & Mobile-First Responsive Design** (320px ekranlarda dahi sorunsuz deneyim)

---

## 🚀 Kurulum ve Çalıştırma

Projeyi yerel ortamınızda çalıştırmak için:

```bash
# Bağımlılıkları yükleyin
npm install

# Geliştirme sunucusunu başlatın
npm run dev

# Üretim sürümünü derleyin
npm run build
```

---

## 📱 Mobil Uyumluluk

Oyun mouse ve dokunmatik (touch) ekranları tam olarak destekler, dikey ve yatay ekran boyutlarına duyarlı olarak ölçeklenir.
