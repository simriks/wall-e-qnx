from flask import Flask, request, jsonify
from flask_cors import CORS
import subprocess
import time
import threading
import socket
import os

app = Flask(__name__)
CORS(app)

# --- QNX CAMERA CONFIGURATION ---
LAPTOP_IP = "10.37.117.213"  
LAPTOP_PORT = 5001  #
BMP_TEMP_PATH = "/tmp/camera_capture.bmp"
CAPTURE_RESOLUTION = "320x240"  

class QNXCameraController:
    def __init__(self):
        self.capturing = False
        self.capture_thread = None
        
    def start_capture(self):
        """Start continuous camera capture and transmission"""
        if not self.capturing:
            self.capturing = True
            self.capture_thread = threading.Thread(target=self._capture_loop, daemon=True)
            self.capture_thread.start()
            print(f"[QNX] Camera capture started - sending .bmp to {LAPTOP_IP}:{LAPTOP_PORT}")
            
    def stop_capture(self):
        """Stop camera capture"""
        self.capturing = False
        print("[QNX] Camera capture stopped")
        
    def _capture_loop(self):
        """Continuous capture and send loop"""
        while self.capturing:
            try:
                # STEP 1: Capture image using QNX sensor command
                # This uses the Pi Camera Module 3 via QNX's sensor driver
                result = subprocess.run([
                    'sensor_capture',  # QNX camera capture utility
                    '--device', 'camera1',
                    '--format', 'bmp',
                    '--resolution', CAPTURE_RESOLUTION,
                    '--output', BMP_TEMP_PATH
                ], capture_output=True, text=True, timeout=5)
                
                if result.returncode == 0:
                    # STEP 2: Send .bmp file to laptop
                    self._send_bmp_to_laptop(BMP_TEMP_PATH)
                    
                    # STEP 3: Clean up temp file
                    if os.path.exists(BMP_TEMP_PATH):
                        os.remove(BMP_TEMP_PATH)
                        
                else:
                    print(f"[QNX] Camera capture failed: {result.stderr}")
                    
            except subprocess.TimeoutExpired:
                print("[QNX] Camera capture timeout")
            except Exception as e:
                print(f"[QNX] Camera error: {e}")
                
            time.sleep(0.1)  # 10 FPS capture rate
    
    def _send_bmp_to_laptop(self, bmp_file_path):
        """Send .bmp file to laptop over TCP"""
        try:
            with open(bmp_file_path, 'rb') as f:
                bmp_data = f.read()
                
            # Create socket and send
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(2.0)  # 2 second timeout
            sock.connect((LAPTOP_IP, LAPTOP_PORT))
            
            # Send file size first (4 bytes)
            file_size = len(bmp_data)
            sock.sendall(file_size.to_bytes(4, byteorder='big'))
            
            # Send .bmp data
            sock.sendall(bmp_data)
            sock.close()
            
            print(f"[QNX] Sent .bmp ({file_size} bytes) to laptop")
            
        except Exception as e:
            print(f"[QNX] Failed to send .bmp: {e}")

# Global camera controller
camera = QNXCameraController()

# --- FLASK API ROUTES ---
@app.route('/camera/start', methods=['POST'])
def start_camera():
    """Start camera capture and transmission"""
    try:
        camera.start_capture()
        return jsonify({"status": "success", "message": "Camera started - sending .bmp to laptop"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})

@app.route('/camera/stop', methods=['POST'])
def stop_camera():
    """Stop camera capture"""
    camera.stop_capture()
    return jsonify({"status": "success", "message": "Camera stopped"})

@app.route('/camera/status', methods=['GET'])
def camera_status():
    """Get camera status"""
    return jsonify({
        "capturing": camera.capturing,
        "laptop_ip": LAPTOP_IP,
        "laptop_port": LAPTOP_PORT,
        "format": "bmp",
        "resolution": CAPTURE_RESOLUTION
    })

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "ok",
        "service": "qnx_camera_server",
        "timestamp": time.time()
    })

if __name__ == '__main__':
    print("[QNX] Camera Server - .bmp transmission to laptop")
    print(f"[QNX] Will send images to {LAPTOP_IP}:{LAPTOP_PORT}")
    app.run(host='0.0.0.0', port=5004, debug=False, threaded=True)