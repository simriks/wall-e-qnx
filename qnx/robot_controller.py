import subprocess
import time
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# --- QNX MOTOR CONTROL CONFIGURATION ---
LEFT_MOTOR_PIN1 = 16   # Left motor direction pin 1
LEFT_MOTOR_PIN2 = 18   # Left motor direction pin 2
LEFT_MOTOR_PWM = 12    # Left motor PWM pin

RIGHT_MOTOR_PIN1 = 15  # Right motor direction pin 1
RIGHT_MOTOR_PIN2 = 13  # Right motor direction pin 2
RIGHT_MOTOR_PWM = 14   # Right motor PWM pin

class QNXTankMotor:
    def __init__(self):
        self.setup_gpio()
        print("[QNX] Tank motor controller initialized")
    
    def setup_gpio(self):
        """Initialize GPIO pins using QNX gpio utilities"""
        try:
            # Setup direction pins as outputs
            for pin in [LEFT_MOTOR_PIN1, LEFT_MOTOR_PIN2, RIGHT_MOTOR_PIN1, RIGHT_MOTOR_PIN2]:
                subprocess.run(['gpio-bcm2711', 'set', str(pin), 'op'], check=True)
                subprocess.run(['gpio-bcm2711', 'clear', str(pin)], check=True)
            
            # Setup PWM pins
            subprocess.run(['gpio-bcm2711', 'set', str(LEFT_MOTOR_PWM), 'a0'], check=True)
            subprocess.run(['gpio-bcm2711', 'set', str(RIGHT_MOTOR_PWM), 'a0'], check=True)
            
            print("[QNX] GPIO pins initialized for tank motors")
            
        except subprocess.CalledProcessError as e:
            print(f"[QNX] GPIO setup failed: {e}")
    
    def set_motor_speeds(self, left_speed, right_speed):
        """Set motor speeds (-100 to 100 scale)"""
        try:
            # Left motor control
            if left_speed > 0:
                subprocess.run(['gpio-bcm2711', 'set', str(LEFT_MOTOR_PIN1)], check=True)
                subprocess.run(['gpio-bcm2711', 'clear', str(LEFT_MOTOR_PIN2)], check=True)
            elif left_speed < 0:
                subprocess.run(['gpio-bcm2711', 'clear', str(LEFT_MOTOR_PIN1)], check=True)
                subprocess.run(['gpio-bcm2711', 'set', str(LEFT_MOTOR_PIN2)], check=True)
            else:
                subprocess.run(['gpio-bcm2711', 'clear', str(LEFT_MOTOR_PIN1)], check=True)
                subprocess.run(['gpio-bcm2711', 'clear', str(LEFT_MOTOR_PIN2)], check=True)
            
            # Right motor control
            if right_speed > 0:
                subprocess.run(['gpio-bcm2711', 'set', str(RIGHT_MOTOR_PIN1)], check=True)
                subprocess.run(['gpio-bcm2711', 'clear', str(RIGHT_MOTOR_PIN2)], check=True)
            elif right_speed < 0:
                subprocess.run(['gpio-bcm2711', 'clear', str(RIGHT_MOTOR_PIN1)], check=True)
                subprocess.run(['gpio-bcm2711', 'set', str(RIGHT_MOTOR_PIN2)], check=True)
            else:
                subprocess.run(['gpio-bcm2711', 'clear', str(RIGHT_MOTOR_PIN1)], check=True)
                subprocess.run(['gpio-bcm2711', 'clear', str(RIGHT_MOTOR_PIN2)], check=True)
            
            # Set PWM values (0-1023 scale for QNX)
            left_pwm = int(abs(left_speed) * 10.23)  # Convert -100/100 to 0-1023
            right_pwm = int(abs(right_speed) * 10.23)
            
            subprocess.run(['gpio-bcm2711', 'pwm', str(LEFT_MOTOR_PWM), str(left_pwm)], check=True)
            subprocess.run(['gpio-bcm2711', 'pwm', str(RIGHT_MOTOR_PWM), str(right_pwm)], check=True)
            
            print(f"[QNX] Motors set: left={left_speed}%, right={right_speed}%")
            
        except subprocess.CalledProcessError as e:
            print(f"[QNX] Motor control failed: {e}")
    
    def stop_all(self):
        """Stop both motors"""
        self.set_motor_speeds(0, 0)
        print("[QNX] All motors stopped")
    
    def close(self):
        """Clean shutdown"""
        self.stop_all()
        print("[QNX] Motor controller closed")

# Initialize tank motor controller
tank = QNXTankMotor()

# --- FLASK API ROUTES ---
@app.route('/robot/move', methods=['POST'])
def robot_move():
    """Execute movement command from laptop"""
    try:
        data = request.json
        action = data.get('action', 'stop')
        duration = float(data.get('duration', 1.0))
        speed = int(data.get('speed', 50))  # Default speed 50%
        
        print(f"[QNX] Executing: {action} at {speed}% for {duration}s")
        
        # Execute movement based on action
        if action == 'forward':
            tank.set_motor_speeds(speed, speed)
        elif action == 'backward':
            tank.set_motor_speeds(-speed, -speed)
        elif action == 'left':
            tank.set_motor_speeds(-speed, speed)
        elif action == 'right':
            tank.set_motor_speeds(speed, -speed)
        elif action == 'stop':
            tank.stop_all()
            return jsonify({"status": "success", "action": action})
        else:
            return jsonify({"status": "error", "message": f"Unknown action: {action}"})
        
        # Wait for duration, then stop
        if action != 'stop' and duration > 0:
            time.sleep(duration)
            tank.stop_all()
        
        return jsonify({
            "status": "success",
            "action": action,
            "speed": speed,
            "duration": duration
        })
        
    except Exception as e:
        print(f"[QNX] Movement error: {e}")
        tank.stop_all()  # Safety stop on error
        return jsonify({"status": "error", "message": str(e)})

@app.route('/robot/stop', methods=['POST'])
def robot_stop():
    """Emergency stop"""
    tank.stop_all()
    return jsonify({"status": "success", "message": "Emergency stop executed"})

@app.route('/robot/status', methods=['GET'])
def robot_status():
    """Get robot status"""
    return jsonify({
        "status": "online",
        "robot_type": "qnx_freenove_tank",
        "capabilities": ["forward", "backward", "left", "right", "stop"],
        "gpio_driver": "qnx_rpi_gpio"
    })

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "ok",
        "service": "qnx_robot_controller",
        "timestamp": time.time()
    })

if __name__ == '__main__':
    try:
        print("[QNX] Robot Controller - Command execution only")
        print("[QNX] Waiting for movement commands from laptop...")
        app.run(host='0.0.0.0', port=5001, debug=False)
    except KeyboardInterrupt:
        print("[QNX] Shutting down robot controller...")
        tank.close()