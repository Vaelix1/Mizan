# Mizan

TOGÜ **Muhasebe ve Vergi Uygulamaları** (ön lisans) programına yeni başlayan öğrenci için ilk dönem çalışma kiti.
Ad, muhasebedeki borç = alacak kontrol tablosundan (mizan) ve "denge" anlamından geliyor.

Tek dosya (`index.html`): bağımlılık yok, derleme yok, internetsiz çalışır. Çift tıklayınca da açılır, GitHub Pages'te de yayımlanır.

## Bölümler

| Sekme | İçerik |
|---|---|
| Bu hafta | Bugünün tarihine göre dönem ve hafta, Genel Muhasebe I konusu, yaklaşan tarihler |
| Genel Muhasebe I | 14 haftalık plan, kazanımlar, haftanın hesapları, değerlendirme |
| Hesap planı | İlk dönemde geçen 50 hesap: kod çözümleme, artış tarafı, düzenleyici hesaplar |
| Yevmiye alıştırması | ABC Ticaret, açılış + 8 işlem; anında denetim ve mizan |
| Not ve KDV | Geçmek için gereken final notu, harf notları, KDV dahil/hariç hesabı |
| Takvim | Güz, bahar ve yaz okulu tarihleri; kontrol listesi |
| Diğer dersler | Genel İşletme, Ticari Matematik, Mikro Ekonomi, Temel Hukuk, ENF100, yabancı dil |
| Kaynaklar | Her kaynak için "ne için / ne için değil" |

## Dosyalar

```
index.html                          uygulamanın tamamı
tools/takvim_kontrol.py             TOGÜ takvim sayfasını denetler (yalnızca standart kütüphane)
tools/takvim-durum.json             sitedeki yılların PDF durumu (Last-Modified, ETag)
.github/workflows/takvim-kontrol.yml  haftalık denetim; gerekirse issue açar
.nojekyll                           GitHub Pages dosyaları olduğu gibi sunsun
```

## GitHub Pages'te yayımlamak

1. GitHub'da `Mizan` adlı boş bir depo oluştur (README ekleme).
2. Üst klasördeki `2-Mizan-GitHuba-Gonder.bat` dosyasını çalıştır.
3. Depoda **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
4. Birkaç dakika sonra site `https://<kullanıcı-adı>.github.io/Mizan/` adresinde açılır.
5. **Actions** sekmesinde "Takvim kontrolü" iş akışını bir kez elle çalıştır (Run workflow) ve yeşil tik aldığını gör.

## Takvim kendiliğinden güncellenir mi?

**Kısmen.** Ölçülen durum (24 Eylül 2026):

- **Site kendini ayarlar.** Takvim `TAKVIMLER` nesnesinde eğitim yılı başına bir kayıt olarak durur. Sayfa her açılışta bugünün tarihine uyan yılı seçer; güz ve bahar haftalarını, ara sınav, final, bütünleme ve bayram haftalarını tanır. Eklenmiş son yılın süresi dolduğunda eski tarihleri göstermek yerine "Takvim güncel değil" uyarısı verir. Sayfa açık kalırken gün değişirse yeniden hesaplar.
- **Tarayıcı TOGÜ'den takvim çekemez.** `ogr.gop.edu.tr`, `Access-Control-Allow-Origin` başlığı göndermiyor; GitHub Pages'teki bir sayfanın oradan veri okuması tarayıcı tarafından engellenir.
- **PDF'ten otomatik tarih yazılmaz.** TOGÜ PDF'lerinin fontları bozuk kodlanmış; çözülen metin okunur ama düzeni her yıl değişebilir. Yanlış bir sınav tarihi yayımlamak, eski tarihi uyarıyla göstermekten daha zararlı.
- **Yeni yıl kendiliğinden fark edilir.** `takvim-kontrol.yml` her pazartesi TOGÜ'nün takvim sayfasını okur. Sayfada sitede olmayan bir yıl ("2027-2028 Eğitim Öğretim Yılı Akademik Takvimleri") ya da mevcut yılın PDF'inde değişiklik (Last-Modified/ETag) görürse, PDF'in çözülmüş ilk sayfasını içeren bir **issue** açar. Aynı başlıkta açık issue varsa yenisini açmaz.
- GitHub, 60 gün boyunca hiç commit almayan depolarda zamanlanmış iş akışlarını durdurur. Durursa **Actions → Takvim kontrolü → Enable workflow**.

### Takvimi güncellemek (issue geldiğinde, yılda bir)

1. Issue'daki PDF'in ilk sayfasını (ön lisans ve lisans genel takvimi) aç.
2. `index.html` → `TAKVIMLER` içine yeni yılı ekle: `start`/`end`, güz ve bahar için ders haftalarının pazartesileri (`weeks`, ara sınav ve bayram haftaları atlanır, 14 hafta), `midterm`, `finals`, `makeup`, `breaks` ve `events`. Kontrol: 14. haftanın cuması, takvimdeki "Derslerin bitimi" tarihine denk gelmeli.
3. Yeni yılın PDF'i için `SOURCES` içine bir kayıt ekle ve yılın `src` alanını ona bağla.
4. Tarihleri dene: tarayıcı konsolunda `localStorage.setItem('mizan_tarih', '2027-11-18')`, sayfayı yenile (başlıkta "Deneme tarihi etkin" görünür). Bitince `localStorage.removeItem('mizan_tarih')`.
5. `python tools/takvim_kontrol.py --kaydet` çalıştır, `index.html` ve `tools/takvim-durum.json` ile birlikte commit et, issue'yu kapat.

Program kılavuzları (haftalık konular) için otomatik denetim yok; yeni izlence yayımlanınca `CAMPUS.*.weeks` elle güncellenir.

## Kararlar

- **Kampüs katmanı.** Program TOGÜ'de birden fazla MYO'da var. Kampüse göre değişen bilgiler (ders kodu, not dağılımı, haftalık sıra, kaynak kitap, hesap→hafta eşlemesi) `CAMPUS` nesnesinde tutulur. Şu an: Tokat merkez ve Niksar.
- **KDV güncel oranla.** Tokat 2025-2026 kılavuzundaki çözümlü örnek %18 ve %8 kullanıyor; 7346 sayılı Cumhurbaşkanı Kararı ile 10.07.2023'ten beri %20 ve %10. Alıştırmalar %20 ile yeniden çözüldü; denetim eski oranı ayrıca yakalar. Kırtasiye kalemi, oranı kesin olan temizlik malzemesiyle değiştirildi.
- **Tarih ve konu ayrı kaynaktan.** Konu sırası 2025-2026 kılavuzundan, hafta tarihleri akademik takvimden hesaplanır; arayüz bunu açıkça söyler.
- **Hesap adı.** Kılavuzun cevap anahtarındaki "780 Faiz Giderleri", hesap planındaki adıyla (780 Finansman Giderleri) yazıldı.
- **Saklama** `localStorage`, `mizan_` önekli: `campus`, `done`, `exIndex`, `checks` (anahtar `yıl:olay`, böylece yeni yılda kutular sıfırdan başlar), `tarih` (yalnızca deneme). Hepsi `try/catch` içinde; bozuk kayıt yok sayılır.

## Doğrulanmış bilgiler (24 Eylül 2026)

- 1. yarıyıl dersleri ve saatleri: Tokat kılavuzu s. 9, Niksar kılavuzu s. 8.
- Geçme: başarı notu ≥ 60, final/bütünleme ≥ 50 (yönetmelik m. 29). Ara sınav %40 + final %60 (m. 28). Devam: teorik %70, uygulama %80 (m. 25).
- 2026-2027: güz dersleri 21 Eyl, ara sınav 14–22 Kas, final 3–12 Oca, bütünleme 16–23 Oca; bahar dersleri 1 Şub, bayram haftaları 8–14 Mar ve 17–23 May, ara sınav 3–11 Nis, derslerin bitimi 28 May, final 31 May–10 Haz, bütünleme 15–23 Haz 2027.
- Hesap adları muhasebetr.com listesiyle karşılaştırıldı; resmî metin RG 21447 (26.12.1992).
- Bütün dış bağlantılar HTTP 200 döndürdü. resmigazete.gov.tr ve mevzuat.gov.tr tarayıcı dışı isteklere yavaş yanıt verir; tarayıcı kimliğiyle (`User-Agent`) denetlendi.

## Doğrulama

Test paketi yok. Değişiklikten sonra:

1. `python -m http.server 8765` ile aç, konsolda hata olmadığını gör.
2. Yevmiye alıştırmasının dokuz kaydını çözümüyle gir: hepsi kabul edilmeli, mizan 266.000 = 266.000 denk çıkmalı.
3. Deneme tarihiyle güz haftası, ara sınav, bayram, bahar ve takvim sonrası bir gün dene.
4. `python tools/takvim_kontrol.py` → "Değişiklik yok" (çıkış 0). `--yillar 2025-2026` ile yeni yıl benzetimi → çıkış 10 ve rapor.

## TOGÜ PDF'lerini okumak

Kılavuzlar Word 2013 çıktısı; bazı gömülü fontlarda ToUnicode tablosu yok.
- Arial/Times alt kümeleri 2 baytlık glif numarası taşır: ASCII için `karakter = glif + 29`; Türkçe: 213 ı, 247 ğ, 248 İ, 249 Ş, 250 ş, 100 Ç, 111 ç, 103 Ö, 124 ö, 104 Ü, 129 ü.
- Calibri tabanlı parçalarda rakamlar `í î ï ð ñ ò ó ô õ ì` = `1 2 3 4 5 6 7 8 9 0` olarak görünür.
- `tools/takvim_kontrol.py` içindeki `pdf_metni()` ikisini de uygular.

## Sonraki adım

Bu kit, AcademicSÆ mimarisindeki ayrı uygulamanın ilk modülü olacak: sözlük/quiz/kart, hesap planının tamamı, Genel Muhasebe II, PWA.
