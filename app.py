from flask import Flask, render_template, request, jsonify, send_from_directory
from ultralytics import YOLO
import os
import random
import cv2
import numpy as np
import base64

app = Flask(__name__)

# Modelin yüklenmesi
model_path = os.path.join(os.path.dirname(__file__), 'models', 'best.pt')
model = YOLO(model_path)

IMAGES_DIR = os.path.join(os.path.dirname(__file__), 'data', 'images')

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/images/<path:filename>')
def serve_image(filename):
    return send_from_directory(IMAGES_DIR, filename)

@app.route('/api/images')
def list_images():
    valid_extensions = ('.jpg', '.jpeg', '.png')
    try:
        all_images = [f for f in os.listdir(IMAGES_DIR) if f.lower().endswith(valid_extensions)]
        sampled = random.sample(all_images, min(20, len(all_images)))
        return jsonify(sampled)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/predict', methods=['POST'])
def predict():
    if 'file' not in request.files:
        return jsonify({'error': 'Dosya bulunamadı'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Dosya seçilmedi'}), 400
    
    try:
        # Resmi numpy dizisine çevirme
        filestr = file.read()
        npimg = np.frombuffer(filestr, np.uint8)
        img = cv2.imdecode(npimg, cv2.IMREAD_COLOR)
        
        # YOLO tahmini
        conf = float(request.form.get('conf', 0.25))
        results = model(img, conf=conf)
        res_plotted = results[0].plot()
        
        # Tespit edilen nesneleri topla
        detections = []
        for box in results[0].boxes:
            cls_id = int(box.cls[0])
            cls_name = model.names[cls_id]
            confidence = float(box.conf[0])
            detections.append({'class': cls_name, 'conf': round(confidence, 2)})
        
        # JPEG olarak kodlayıp Base64 formatına çevirme
        _, buffer = cv2.imencode('.jpg', res_plotted)
        img_b64 = base64.b64encode(buffer).decode('utf-8')
        
        return jsonify({'image': f'data:image/jpeg;base64,{img_b64}', 'detections': detections})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
