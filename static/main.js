document.addEventListener('DOMContentLoaded', () => {
    // Slider Güncellemesi
    const confSlider = document.getElementById('conf-slider');
    const confVal = document.getElementById('conf-val');
    let currentConf = parseInt(confSlider.value) / 100;
    
    confSlider.addEventListener('input', (e) => {
        confVal.textContent = e.target.value + '%';
        currentConf = e.target.value / 100;
    });

    // Tab geçişleri
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-tab');
            
            // Tüm sekmeleri inaktif yap
            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));
            
            // Seçileni aktif yap
            btn.classList.add('active');
            document.getElementById(targetId).classList.add('active');

            // Kamera modu kapandığında yayını durdur, açıldığında başlat
            if (targetId === 'camera') {
                startCamera();
            } else {
                stopCamera();
            }
        });
    });

    // Sonuç kapatma
    document.getElementById('close-result').addEventListener('click', () => {
        document.getElementById('result-area').style.display = 'none';
        // Scroll back up gently
        window.scrollTo({top: 0, behavior: 'smooth'});
    });

    // ------ Örnekler Modu ------
    const refreshBtn = document.getElementById('refresh-examples');
    const gallery = document.getElementById('example-gallery');

    function loadExamples() {
        gallery.innerHTML = '<div class="loader">Yükleniyor...</div>';
        fetch('/api/images')
            .then(res => res.json())
            .then(data => {
                if (data.error) throw new Error(data.error);
                gallery.innerHTML = '';
                data.forEach(filename => {
                    const img = document.createElement('img');
                    img.src = `/images/${filename}`;
                    img.classList.add('gallery-item');
                    img.loading = 'lazy';
                    img.addEventListener('click', () => processImageFromURL(img.src, filename));
                    gallery.appendChild(img);
                });
            })
            .catch(err => {
                gallery.innerHTML = `<div style="color:#ff4444">Hata: ${err.message}</div>`;
            });
    }

    refreshBtn.addEventListener('click', loadExamples);
    // İlk Yükleme
    loadExamples();

    // ------ Dosya Yükleme Modu ------
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');

    // Sürükle Bırak Olayları
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
    });

    dropZone.addEventListener('drop', handleDrop, false);
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files), false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    }

    function handleFiles(files) {
        if (files && files.length > 0) {
            const file = files[0];
            if (file.type.startsWith('image/')) {
                processFile(file);
            } else {
                alert('Lütfen sadece resim dosyası yükleyin (PNG, JPG).');
            }
        }
    }

    // ------ Kamera Modu ------
    const video = document.getElementById('webcam');
    const canvas = document.getElementById('canvas');
    const captureBtn = document.getElementById('capture-btn');
    let stream = null;

    async function startCamera() {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: true });
                video.srcObject = stream;
            } catch (err) {
                console.error("Kamera açılamadı:", err);
                alert("Kamera izni reddedildi veya bulunamadı.");
            }
        }
    }

    function stopCamera() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            video.srcObject = null;
            stream = null;
        }
    }

    captureBtn.addEventListener('click', () => {
        if (!stream) return;
        // Video boyutlarını canvas'a aktar
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob((blob) => {
            if(blob) {
                const file = new File([blob], "camera_capture.jpg", { type: "image/jpeg" });
                processFile(file);
            }
        }, 'image/jpeg', 0.9);
    });

    // ------ Genel İşlemler (API Çağrıları) ------

    async function processImageFromURL(url, filename) {
        showLoader();
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const file = new File([blob], filename, { type: blob.type });
            await sendToAPI(file);
        } catch (e) {
            hideLoader();
            alert("Resim yüklenirken hata oluştu.");
        }
    }

    async function processFile(file) {
        showLoader();
        await sendToAPI(file);
    }

    async function sendToAPI(file) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('conf', currentConf);

        try {
            const res = await fetch('/api/predict', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            // Sonucu Göster
            document.getElementById('result-image').src = data.image;

            // Tespit Tag'lerini Oluştur
            const tagsContainer = document.getElementById('detection-tags');
            tagsContainer.innerHTML = '';
            if (data.detections && data.detections.length > 0) {
                data.detections.forEach(det => {
                    const span = document.createElement('span');
                    span.className = 'tag';
                    span.textContent = `${det.class} (${Math.round(det.conf * 100)}%)`;
                    tagsContainer.appendChild(span);
                });
            } else {
                tagsContainer.innerHTML = '<span class="tag" style="color:var(--text-muted); border-color: rgba(255,255,255,0.1)">Nesne bulunamadı</span>';
            }

            // İndirme Butonu
            const dlBtn = document.getElementById('download-btn');
            dlBtn.onclick = () => {
                const a = document.createElement('a');
                a.href = data.image;
                a.download = `yolo_analizi_${Date.now()}.jpg`;
                a.click();
            };

            document.getElementById('result-area').style.display = 'block';
            
            // Scroll to the result area smoothly
            document.getElementById('result-area').scrollIntoView({ behavior: 'smooth', block: 'start' });

        } catch (err) {
            alert('Hata: ' + err.message);
        } finally {
            hideLoader();
        }
    }

    function showLoader() {
        document.getElementById('result-area').style.display = 'block';
        document.getElementById('result-image').src = '';
        document.getElementById('analyze-loader').style.display = 'flex';
        document.getElementById('result-area').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function hideLoader() {
        document.getElementById('analyze-loader').style.display = 'none';
    }
});
