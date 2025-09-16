import subprocess
import time
import sys

def start_service(script_name, port, service_name):
    """Start a service script"""
    try:
        print(f"[QNX] Starting {service_name}...")
        process = subprocess.Popen([sys.executable, script_name])
        time.sleep(2)  # Give service time to start
        print(f"[QNX] {service_name} started on port {port}")
        return process
    except Exception as e:
        print(f"[QNX] Failed to start {service_name}: {e}")
        return None

def main():
    print("=" * 50)
    print("[QNX] Freenove Tank Robot - QNX Control System")
    print("[QNX] Camera → .bmp transmission")
    print("[QNX] Robot → Command execution only")
    print("[QNX] AI/YOLO → Runs on laptop")
    print("=" * 50)
    
    services = []
    
    # Start camera server
    camera_process = start_service('camera_server.py', 5004, 'Camera Server')
    if camera_process:
        services.append(camera_process)
    
    # Start robot controller
    robot_process = start_service('robot_controller.py', 5001, 'Robot Controller')
    if robot_process:
        services.append(robot_process)
    
    print(f"[QNX] All services started. {len(services)} processes running.")
    print("[QNX] Pi is ready to receive commands from laptop")
    print("[QNX] Press Ctrl+C to shutdown all services")
    
    try:
        # Keep main process alive
        while True:
            time.sleep(1)
            
    except KeyboardInterrupt:
        print("[QNX] Shutting down all services...")
        for process in services:
            process.terminate()
        print("[QNX] All services stopped.")

if __name__ == '__main__':
    main()