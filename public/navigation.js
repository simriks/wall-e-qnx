// ===== NAVIGATION VARIABLES =====
let currentStepIndex = 0;
let positionWatcher = null;
let lastInstruction = "";
let stepCompletionCooldown = false;
let lastStepCompletionTime = 0;
let stepLocked = false; // Prevent multiple step progressions

// ===== SIMULATED ROVER TRACKING SYSTEM =====
let simulatedRoverPosition = null; // Rover's simulated GPS position
let simulatedMovementScale = 10000; // 1km = 10cm (scale factor)
let roverStartPosition = null;
let roverBearing = 0; // Rover's current direction in degrees
// ===== OBSTACLE AVOIDANCE VARIABLES =====/
let originalNavigationStep = null;
let detourInProgress = false;
let lastObstacleCheck = 0;
let obstacleCheckInterval = 2000; // Check every 2 seconds during movement
let safeMovementDistance = 1.0; // Meters to move when avoiding obstacles
let retryAttempts = 0;
let maxRetryAttempts = 3;
let navigationSteps = [];
let navigationActive = false;
let navigationInProgress = false;
let stopOnlyMode = false;

const ROBOT_CONFIG = {
  IP: "10.37.117.213",
  PORT: 5001
};

// Obstacle detection configuration
const OBSTACLE_DETECTION = {
  PI_IP: "10.37.117.213",
  DETECTION_PORT: 5005,
  DANGER_DISTANCE_THRESHOLD: 2.0, // Consider obstacles dangerous if closer than 2m
  SAFE_DISTANCE_THRESHOLD: 1.0,   // Need 1m clearance to proceed
  CHECK_FREQUENCY: 1500            // Check obstacles every 1.5 seconds
};

// ===== ROVER SIMULATION CONFIGURATION =====
const ROVER_SIMULATION = {
  SCALE_FACTOR: 100,          // Default scale factor
  MIN_SCALE: 50,              
  MAX_SCALE: 500,             
  SHOW_MOVEMENT_TRAIL: true,
  AUTO_CENTER_MAP: false      // Set to false to prevent auto-centering
};

// Add this after your variable declarations (around line 40)
console.log("🔍 Checking available movement functions:");
console.log("moveForward:", typeof moveForward);
console.log("moveBackward:", typeof moveBackward);
console.log("turnLeft:", typeof turnLeft);
console.log("turnRight:", typeof turnRight);
console.log("stopRobot:", typeof stopRobot);
console.log("moveForwardWithObstacleDetection:", typeof moveForwardWithObstacleDetection);

// ✅ Debug function to track forward movements
function debugForwardMovement(command, distance, location) {
  if (command === "forward") {
    console.log(`🐛 FORWARD MOVEMENT CALLED: ${distance}m from ${location}`);
    console.trace('Forward movement call stack');
  }
}

// ===== ENHANCED GPS-BASED NAVIGATION SYSTEM =====
function startPositionTracking() {
  console.log("📍 Starting position tracking...");
  
  if (!navigator.geolocation) {
    console.log("⚠️ Geolocation not available");
    return;
  }
  
  // Start watching position for navigation updates
  positionWatcher = navigator.geolocation.watchPosition(
    (position) => {
      const coords = { 
        lat: position.coords.latitude, 
        lng: position.coords.longitude 
      };
      
      if (typeof window !== 'undefined') {
        window.currentPosition = coords;
      }
      
      // Update user marker if it exists
      if (typeof userMarker !== 'undefined' && userMarker) {
        userMarker.setPosition(coords);
      }
      
      console.log("📍 Position updated:", coords);
    },
    (error) => {
      console.warn("📍 Position tracking error:", error);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 5000
    }
  );
}  

function stopPositionTracking() {
  if (positionWatcher) {
    navigator.geolocation.clearWatch(positionWatcher);
    positionWatcher = null;
  }
  navigationActive = false;
  if (typeof addToSummary === 'function') {
    addToSummary("📍 GPS tracking stopped");
  }
}

// Step-by-step navigation progress checker
function checkStepByStepProgress() {
  if (!simulatedRoverPosition || currentStepIndex >= navigationSteps.length) {
    return;
  }
  
  const now = Date.now();
  if (stepCompletionCooldown && (now - lastStepCompletionTime) < 3000) {
    return; // Wait for cooldown
  }
  
  if (stepLocked) return;
  
  const currentStep = navigationSteps[currentStepIndex];
  const targetLocation = currentStep.endLocation;
  
  const distance = calculateDistance(
    simulatedRoverPosition.lat, simulatedRoverPosition.lng,
    targetLocation.lat(), targetLocation.lng()
  );
  
  const distanceMeters = (distance * 1000).toFixed(1);
  
  console.log(`\n📊 PROGRESS CHECK - Step ${currentStepIndex + 1}`);
  console.log(`Distance to target: ${distanceMeters}m`);
  
  // ✅ Generous completion threshold
  if (distance < 0.1) { // 100 meters
    console.log(`✅ STEP ${currentStepIndex + 1} COMPLETED!`);
    
    stepLocked = true;
    stepCompletionCooldown = true;
    lastStepCompletionTime = now;
    
    if (typeof addToSummary === 'function') {
      addToSummary(`✅ Step ${currentStepIndex + 1} completed`);
    }
    currentStepIndex++;
    
    setTimeout(() => {
      stepLocked = false;
      stepCompletionCooldown = false;
      
      if (currentStepIndex < navigationSteps.length) {
        giveStepByStepInstruction(currentStepIndex);
      }
    }, 2000);
    
  } else {
    console.log(`⏳ ${distanceMeters}m remaining`);
  }
  console.log(`==================\n`);
}

function startNavigation(directionsResult) {
  if (typeof parseDirectionsToSteps === 'function') {
    navigationSteps = parseDirectionsToSteps(directionsResult);
  } else {
    console.error("❌ parseDirectionsToSteps function not available");
    return;
  }
  
  currentStepIndex = 0;
  navigationActive = true;
  // Notify app that navigation has started
  if (typeof document !== 'undefined' && document.dispatchEvent) {
    document.dispatchEvent(new CustomEvent('navigation:start'));
  }
  
  if (typeof addToSummary === 'function') {
    addToSummary("🚀 Step-by-step navigation started");
    addToSummary(`📋 Total steps: ${navigationSteps.length}`);
  }
  
  if (navigationSteps.length > 0) {
    // ✅ Give ONLY the first instruction
    giveStepByStepInstruction(0);
    startPositionTracking();
  }
}

// Step-by-step instruction system
async function giveStepByStepInstruction(stepIndex = null) {
  // Use the provided stepIndex or current one
  const index = stepIndex !== null ? stepIndex : currentStepIndex;
  
  if (index >= navigationSteps.length) {
    navigationActive = false;
    navigationInProgress = false;
    console.log(`🏁 Navigation complete!`);
    
    if (typeof sayAndResume === 'function') {
      await sayAndResume("You have arrived at your destination!");
    }
    
    if (typeof addToSummary === 'function') {
      addToSummary("🎯 Destination reached successfully!");
    }
    
    return;
  }
  
  const step = navigationSteps[index];
  
  // STRIP HTML TAGS from instruction
  const cleanInstruction = step.instruction.replace(/<[^>]*>/g, '');
  
  // Parse distance correctly
  let distanceInMeters = 0;
  if (step.distance) {
    const distanceMatch = step.distance.match(/(\d+(?:\.\d+)?)\s*(m|km)/i);
    if (distanceMatch) {
      distanceInMeters = parseFloat(distanceMatch[1]);
      if (distanceMatch[2].toLowerCase() === 'km') {
        distanceInMeters *= 1000;
      }
    }
  }
  
  console.log(`\n🧭 STEP ${index + 1} of ${navigationSteps.length}`);
  console.log(`Instruction: ${cleanInstruction}`);
  console.log(`Distance: ${distanceInMeters}m`);
  
  let robotCommand = "forward";
  let instruction = `Step ${index + 1}: Move forward ${distanceInMeters}m`;
  
  // ✅ Simple command detection with cleaned instruction
  if (cleanInstruction.toLowerCase().includes('turn left')) {
    robotCommand = "left";
    instruction = `Step ${index + 1}: Turn left and continue ${distanceInMeters}m`;
  } else if (cleanInstruction.toLowerCase().includes('turn right')) {
    robotCommand = "right";
    instruction = `Step ${index + 1}: Turn right and continue ${distanceInMeters}m`;
  }
  
  console.log(`🤖 Will execute: ${robotCommand} ${distanceInMeters}m\n`);
  
  if (typeof addToSummary === 'function') {
    addToSummary(`🧭 ${instruction}`);
  }
  
  // Update current step index if we used a specific one
  if (stepIndex !== null) {
    currentStepIndex = index;
  }
  
  // Pass the clean values
  await executeRobotMovement(robotCommand, distanceInMeters);
}

// ===== OBSTACLE AVOIDANCE INTEGRATION =====
async function checkObstaclesBeforeMovement(command, distanceInMeters) {
  // Check if obstacle avoidance is available
  if (typeof window.handleNavigationObstacles === 'function') {
    console.log(`🛡️ Checking obstacles before ${command} movement`);
    
    const obstacleCheck = await window.handleNavigationObstacles(command, distanceInMeters);
    
    if (!obstacleCheck.safe) {
      console.log(`🚨 Obstacle avoidance triggered: ${obstacleCheck.message}`);
      
      // Add to summary
      if (typeof addToSummary === 'function') {
        addToSummary(`🛡️ ${obstacleCheck.message}`);
      }
      
      // Handle different actions
      switch(obstacleCheck.action) {
        case 'DETOUR':
          // Announce detour recommendation
          if (typeof sayAndResume === 'function') {
            await sayAndResume(`Obstacle detected. I recommend going ${obstacleCheck.recommendation} where there's ${obstacleCheck.distance} centimeters of clearance.`);
          }
          
          // For now, we'll pause navigation - in the future, could auto-detour
          return { proceed: false, reason: 'obstacle_detour_needed' };
          
        case 'STOP':
          // Emergency stop
          if (typeof sayAndResume === 'function') {
            await sayAndResume("Obstacle detected with no clear path. Stopping for safety.");
          }
          return { proceed: false, reason: 'obstacle_no_clear_path' };
      }
    }
  }
  
  return { proceed: true, reason: 'path_clear' };
}

// Enhanced robot movement with obstacle detection and realistic turns
async function executeRobotMovement(command, distanceInMeters) {
  console.log(`\n🎯 ENHANCED ROBOT STEP WITH OBSTACLE CHECK: ${command.toUpperCase()} ${distanceInMeters}m`);
  
  // Get current step data for turn calculations
  const currentStep = navigationSteps[currentStepIndex] || null;
  
  // ✅ NEW: Check for obstacles before movement
  const obstacleCheck = await checkObstaclesBeforeMovement(command, distanceInMeters);
  
  if (!obstacleCheck.proceed) {
    console.log(`🛑 Movement blocked: ${obstacleCheck.reason}`);
    
    // Stop robot if it's moving
    if (typeof stopRobot === 'function') {
      await stopRobot();
    }
    
    // Update navigation state
    navigationInProgress = false;
    stopOnlyMode = false;
    
    if (typeof window !== 'undefined') {
      window.navigationInProgress = false;
      window.stopOnlyMode = false;
    }
    
    // Reset voice status
    if (typeof setVoiceStatus === 'function') {
      setVoiceStatus("🛡️ Navigation paused due to obstacles");
    }
    
    return false; // Movement cancelled
  }
  
  console.log(`\n🎯 ENHANCED ROBOT STEP: ${command.toUpperCase()} ${distanceInMeters}m`);
  
  // ✅ Enable navigation mode - only STOP commands allowed
  navigationInProgress = true;
  stopOnlyMode = true;
  
  // Make these globally available for voice system
  if (typeof window !== 'undefined') {
    window.navigationInProgress = true;
    window.stopOnlyMode = true;
  }
  
  if (typeof setVoiceStatus === 'function') {
    setVoiceStatus("🛑 Navigation active - say STOP to halt");
  }
  
  try {
    // ✅ SHORT CONSISTENT DURATIONS
    let duration = 0.1;

    if (command === "forward" || command === "backward") {
      // ✅ SHORT BURST DURATIONS - all movements feel like quick bursts
      duration = 0.15;  // Always 0.15 seconds - short and snappy
      console.log(`📏 SHORT BURST Duration: ${distanceInMeters}m → ${duration}s (consistent burst)`);
    } else {
      // Turn duration - also short and consistent
      duration = 0.2;  // Always 0.2 seconds for turns
      console.log(`🔄 SHORT Turn duration: ${duration}s (consistent)`);
    }
    
    // ✅ SIMPLE ANNOUNCEMENTS - No degree numbers for voice
    let announcement = "";
    const step = navigationSteps[currentStepIndex];
    // Strip HTML from instructions
    const instruction = step ? (step.instructions || step.instruction || "").replace(/<[^>]*>/g, '') : "";

    if (command === "forward") {
      const streetMatch = instruction ? instruction.match(/(?:on|along|down)\s+([^,\s]+(?:\s+[^,\s]+)*)/i) : null;
      const streetName = streetMatch ? streetMatch[1] : "";
      
      if (streetName) {
        announcement = `Kibo will now continue forward on ${streetName} for ${distanceInMeters} meters, monitoring for obstacles`;
      } else {
        announcement = `Kibo will now move forward ${distanceInMeters} meters with obstacle detection active`;
      }
    } else if (command === "left") {
      const streetMatch = instruction ? instruction.match(/turn left (?:onto|into|on)\s+([^,\s]+(?:\s+[^,\s]+)*)/i) : null;
      const streetName = streetMatch ? streetMatch[1] : "";
      
      if (streetName && distanceInMeters > 0) {
        announcement = `Kibo will now turn left onto ${streetName} and continue for ${distanceInMeters} meters`;
      } else if (streetName) {
        announcement = `Kibo will now turn left onto ${streetName}`;
      } else {
        announcement = `Kibo will now turn left and continue ${distanceInMeters} meters`;
      }
    } else if (command === "right") {
      const streetMatch = instruction ? instruction.match(/turn right (?:onto|into|on)\s+([^,\s]+(?:\s+[^,\s]+)*)/i) : null;
      const streetName = streetMatch ? streetMatch[1] : "";
      
      if (streetName && distanceInMeters > 0) {
        announcement = `Kibo will now turn right onto ${streetName} and continue for ${distanceInMeters} meters`;
      } else if (streetName) {
        announcement = `Kibo will now turn right onto ${streetName}`;
      } else {
        announcement = `Kibo will now turn right and continue ${distanceInMeters} meters`;
      }
    }

    // Handle special cases like roundabouts
    if (instruction.toLowerCase().includes('roundabout')) {
      const exitMatch = instruction.match(/take the (\d+)(?:st|nd|rd|th) exit/i);
      const exitNum = exitMatch ? exitMatch[1] : "next";
      const streetMatch = instruction.match(/(?:onto|on)\s+([^,\s]+(?:\s+[^,\s]+)*)/i);
      const streetName = streetMatch ? streetMatch[1] : "";
      
      if (streetName) {
        announcement = `Wall-E will navigate the roundabout, taking the ${exitNum} exit onto ${streetName}, continuing for ${distanceInMeters} meters`;
      } else {
        announcement = `Wall-E will navigate the roundabout, taking the ${exitNum} exit, continuing for ${distanceInMeters} meters`;
      }
    }
    
    console.log(`🗣️ Voice announcement: "${announcement}"`);
    
    // ✅ Wait for speech completion
    await new Promise(async (resolve) => {
      speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(announcement);
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 1;
      
      utterance.onstart = () => {
        console.log(`🗣️ Speech started: "${announcement}"`);
      };
      
      utterance.onend = () => {
        console.log(`✅ Speech COMPLETELY finished - starting movement with obstacle detection`);
        resolve();
      };
      
      utterance.onerror = (event) => {
        console.log(`❌ Speech error: ${event.error} - proceeding with movement`);
        resolve();
      };
      
      setTimeout(() => {
        console.log(`⏰ Speech timeout - proceeding with movement`);
        resolve();
      }, (announcement.length * 80) + 2000);
      
      speechSynthesis.speak(utterance);
      if (typeof addToSummary === 'function') {
        addToSummary(`🤖 ${announcement}`);
      }
    });
    
    // ✅ NOW EXECUTE MOVEMENT WITH OBSTACLE DETECTION
    let result = false;
    console.log(`🤖 Starting Wall-E movement with obstacle monitoring...`);
    
    // Replace the switch statement (around line 440) with this debug version:
    switch(command) {
      case "forward":
        console.log(`🤖 Wall-E moving forward ${duration.toFixed(2)}s with obstacle detection`);
        
        // Check if functions exist
        if (typeof moveForwardWithObstacleDetection !== 'function') {
          console.warn("⚠️ moveForwardWithObstacleDetection is not defined");
        }
        if (typeof moveForward !== 'function') {
          console.warn("⚠️ moveForward is not defined");
        }
        
        if (typeof moveForwardWithObstacleDetection === 'function') {
          result = await moveForwardWithObstacleDetection(duration, distanceInMeters);
        } else if (typeof moveForward === 'function') {
          result = await moveForward(duration);
        } else {
          console.error("❌ No forward movement function available!");
          result = true; // TEMPORARY: Assume success to continue navigation
        } if (result === undefined) {
          console.log("⚠️ Movement function returned undefined, assuming success");
          result = true;
        }
        break;
        
      case "left":
      case "right":
        console.log(`🤖 Wall-E turning ${command} ${duration.toFixed(2)}s`);
        
        if (command === "left" && typeof turnLeft === 'function') {
          result = await turnLeft(duration);
        } else if (command === "right" && typeof turnRight === 'function') {
          result = await turnRight(duration);
        } else {
          console.error(`❌ Turn ${command} function not available!`);
          result = true; // TEMPORARY: Assume success to continue navigation
        }
        
        // Post-turn forward movement
        if (result && distanceInMeters > 0) {
          const forwardDuration = 0.15;
          console.log(`🤖 After turn: Wall-E moving forward ${forwardDuration}s`);
          await new Promise(resolve => setTimeout(resolve, 500));
          if (typeof moveForward === 'function') {
            await moveForward(forwardDuration);
          }
        }
        
        console.log(`✅ Turn completed`);
        break;
        
      case "backward":
        console.log(`🤖 Wall-E moving backward ${duration.toFixed(2)}s`);
        if (typeof moveBackward === 'function') {
          result = await moveBackward(duration);
        } else {
          console.error("❌ moveBackward function not available!");
          result = true; // TEMPORARY: Assume success
        }
        break;
    }

    // Add logging to see what result is
    console.log(`🔍 Movement result: ${result}`);
    // ✅ Update simulated rover position WITH step data
    simulateRoverMovement(command, distanceInMeters, currentStep);
    
    if (result) {
      console.log(`✅ Wall-E movement complete`);
      if (typeof addToSummary === 'function') {
        addToSummary(`🤖 ${command} ${distanceInMeters}m completed safely`);
      }

      // ✅ Live map animation if available
      if (routeCoordinates.length > 0) {
        animateWallEMovement(command, distanceInMeters);
      }
      
      // ✅ Brief pause before next step
      setTimeout(() => {
        advanceToNextStep();
      }, 1000);
    } else {
      console.log(`❌ Wall-E movement failed or was interrupted`);
      if (typeof addToSummary === 'function') {
        addToSummary(`❌ ${command} movement failed - navigation paused`);
      }
      
      // Reset navigation flags on failure
      navigationInProgress = false;
      stopOnlyMode = false;
      
      if (typeof window !== 'undefined') {
        window.navigationInProgress = false;
        window.stopOnlyMode = false;
      }
      
      if (typeof setVoiceStatus === 'function') {
        setVoiceStatus("⚠️ Navigation paused - manual assistance may be needed");
      }
    }
    
  } catch (error) {
    console.error(`❌ Robot movement error:`, error);
    
    // Reset navigation flags on error
    navigationInProgress = false;
    stopOnlyMode = false;
    
    if (typeof window !== 'undefined') {
      window.navigationInProgress = false;
      window.stopOnlyMode = false;
    }
    
    if (typeof addToSummary === 'function') {
      addToSummary(`❌ Movement error: ${error.message}`);
    }
    
    if (typeof setVoiceStatus === 'function') {
      setVoiceStatus("❌ Navigation error - ready for new commands");
    }
  }
}

// ✅ Initialize simulated rover position
function initializeSimulatedRover() {
  // Start rover at user's current location
  let startLocation;
  if (typeof userMarker !== 'undefined' && userMarker) {
    startLocation = userMarker.getPosition();
  } else if (typeof map !== 'undefined' && map) {
    startLocation = map.getCenter();
  } else {
    // Default location if nothing is available
    startLocation = { lat: () => 43.6532, lng: () => -79.3832 };
  }
  
  simulatedRoverPosition = {
    lat: startLocation.lat(),
    lng: startLocation.lng()
  };
  
  roverStartPosition = { ...simulatedRoverPosition };
  roverBearing = 0; // Start facing north
  
  console.log("🤖 Wall-E initialized at:", simulatedRoverPosition);
  if (typeof addToSummary === 'function') {
    addToSummary(`🤖 Wall-E position initialized: ${simulatedRoverPosition.lat.toFixed(6)}, ${simulatedRoverPosition.lng.toFixed(6)}`);
  }
  
  // Create rover marker on map
  createRoverMarker();
}

//SIMPLIFIED: Just advance to next step after movement
async function advanceToNextStep() {
  console.log(`✅ Step ${currentStepIndex + 1} completed - advancing`);
  
  if (typeof addToSummary === 'function') {
    addToSummary(`✅ Step ${currentStepIndex + 1} completed`);
  }
  
  currentStepIndex++;
  
  if (currentStepIndex < navigationSteps.length) {
    console.log(`🚀 Starting step ${currentStepIndex + 1}...`);
    // ✅ WAIT for the step to complete before continuing
    await new Promise(resolve => setTimeout(resolve, 1000));
    await giveStepByStepInstruction(currentStepIndex);
  } else {
    // ✅ Navigation complete - restore normal audio processing
    navigationActive = false;
    navigationInProgress = false;
    stopOnlyMode = false;
    
    // Update global state
    if (typeof window !== 'undefined') {
      window.navigationActive = false;
      window.navigationInProgress = false;
      window.stopOnlyMode = false;
    }
    // Notify app that navigation has ended
    if (typeof document !== 'undefined' && document.dispatchEvent) {
      document.dispatchEvent(new CustomEvent('navigation:end'));
    }
    
    console.log(`🏁 All ${navigationSteps.length} steps completed!`);
    const message = "You have reached your destination!";
    
    if (typeof addToSummary === 'function') {
      addToSummary(message);
    }
    if (typeof setVoiceStatus === 'function') {
      setVoiceStatus("👂 Ready - where would you like to go next?");
    }
    
    // Wait a moment then speak final message
    setTimeout(() => {
      if (typeof sayAndResume === 'function') {
        sayAndResume(message);
      }
    }, 1000);
  }
}

// ===== ENHANCED OBSTACLE DETECTION INTEGRATION =====

// Enhanced forward movement with obstacle detection
async function moveForwardWithObstacleDetection(duration, plannedDistance) {
  console.log(`🛡️ Moving forward with obstacle detection: ${duration}s, ${plannedDistance}m`);
  
  let totalMovementTime = duration * 1000; // Convert to milliseconds
  let checkInterval = 100; // Check every 100ms for ultrasonic
  let currentTime = 0;
  let movementActive = true;
  
  // Start the actual robot movement
  const movementPromise = moveForward(duration);
  
  // Parallel obstacle monitoring with ULTRASONIC priority
  const monitoringPromise = new Promise(async (resolve) => {
    while (currentTime < totalMovementTime && movementActive) {
      // ✅ PRIORITY 1: Check ultrasonic sensor
      try {
        const ultrasonicResponse = await fetch(`http://${OBSTACLE_DETECTION.PI_IP}:${OBSTACLE_DETECTION.DETECTION_PORT}/ultrasonic_distance`);
        
        if (ultrasonicResponse.ok) {
          const ultrasonicData = await ultrasonicResponse.json();
          const distance = ultrasonicData.distance_cm;
          
          // ✅ EMERGENCY STOP if too close
          if (distance < 15 && distance > 0) {
            console.log(`🚨 ULTRASONIC EMERGENCY: Object ${distance}cm ahead!`);
            movementActive = false;
            
            // Emergency stop
            if (typeof stopRobot === 'function') {
              await stopRobot();
            }
            
            // Announce
            if (typeof sayAndResume === 'function') {
              await sayAndResume(`Stop! Object ${distance} centimeters ahead!`);
            }
            
            resolve(false); // Movement failed
            return;
          }
        }
      } catch (error) {
        // Continue even if ultrasonic fails
      }
      
      // ✅ PRIORITY 2: Check camera obstacles
      const obstacles = await checkForObstacles();
      
      if (obstacles && obstacles.length > 0) {
        const dangerousObstacles = obstacles.filter(obs => 
          obs.danger_level === "HIGH" || 
          (obs.area && obs.area > 5000)
        );
        
        if (dangerousObstacles.length > 0) {
          console.log("🚨 CAMERA: Dangerous obstacles detected!");
          movementActive = false;
          
          if (typeof stopRobot === 'function') {
            await stopRobot();
          }
          
          //
          await handleObstacleAvoidance(dangerousObstacles, "forward");
                    resolve(false); // Movement failed
                    return;
                  }
                }
                
                // Wait before next check
                await new Promise(r => setTimeout(r, checkInterval));
                currentTime += checkInterval;
              }
              
              resolve(true); // Movement completed successfully
            });
            
            // Wait for both movement and monitoring to complete
            const [movementResult, monitoringResult] = await Promise.all([movementPromise, monitoringPromise]);
            
            console.log(`✅ Forward movement with obstacle detection completed: ${monitoringResult ? 'SUCCESS' : 'STOPPED'}`);
            return movementResult && monitoringResult;
          } 

// Check for obstacles using our detection API with ultrasonic priority
async function checkForObstacles() {
  try {
    const now = Date.now();
    if (now - lastObstacleCheck < obstacleCheckInterval) {
      return []; // Don't check too frequently
    }
    
    lastObstacleCheck = now;
    
    // ✅ First check ultrasonic for immediate danger
    try {
      const ultrasonicResponse = await fetch(`http://${OBSTACLE_DETECTION.PI_IP}:${OBSTACLE_DETECTION.DETECTION_PORT}/ultrasonic_distance`, {
        timeout: 500
      });
      
      if (ultrasonicResponse.ok) {
        const ultrasonicData = await ultrasonicResponse.json();
        
        if (ultrasonicData.distance_cm < 20 && ultrasonicData.distance_cm > 0) {
          // Create virtual obstacle for ultrasonic detection
          return [{
            type: "ultrasonic_obstacle",
            danger_level: "HIGH",
            distance: ultrasonicData.distance_cm,
            area: 10000, // Large area to trigger stop
            center: [160, 120], // Center of view
            distance_from_center: 0
          }];
        }
      }
    } catch (e) {
      // Continue even if ultrasonic fails
    }
    
    // ✅ Then check camera detection
    const response = await fetch(`http://${OBSTACLE_DETECTION.PI_IP}:${OBSTACLE_DETECTION.DETECTION_PORT}/detection_status`, {
      method: 'GET',
      timeout: 1000
    });
    
    if (!response.ok) {
      console.warn("⚠️ Detection API not responding");
      return [];
    }
    
    const data = await response.json();
    
    if (data.obstacles && data.obstacles.length > 0) {
      console.log(`👀 Detected ${data.obstacles.length} objects`);
      return data.obstacles;
    }
    
    return [];
    
  } catch (error) {
    console.warn("⚠️ Obstacle check failed:", error);
    return [];
  }
}

// Handle obstacle avoidance when obstacles are detected
async function handleObstacleAvoidance(obstacles, command) {
  console.log("🛡️ OBSTACLE AVOIDANCE ACTIVATED");
  
  if (typeof addToSummary === 'function') {
    addToSummary(`🚨 Obstacles detected: ${obstacles.map(obs => obs.type).join(', ')}`);
  }
  
  // Announce obstacle detection
  const obstacleTypes = [...new Set(obstacles.map(obs => obs.type))];
  const announcement = `Obstacles detected: ${obstacleTypes.join(', ')}. Finding safe path.`;
  
  await new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(announcement);
    utterance.rate = 1.0;
    utterance.onend = resolve;
    utterance.onerror = resolve;
    speechSynthesis.speak(utterance);
  });
  
  // Analyze obstacles to determine avoidance strategy
  let avoidanceStrategy = determineAvoidanceStrategy(obstacles);
  
  console.log(`🤖 Avoidance strategy: ${avoidanceStrategy}`);
  
  try {
    let success = false;
    
    switch(avoidanceStrategy) {
      case "stop_and_wait":
        success = await stopAndWaitStrategy(obstacles);
        break;
      case "detour_left":
        success = await detourStrategy("left");
        break;
      case "detour_right":
        success = await detourStrategy("right");
        break;
      case "reverse_and_retry":
        success = await reverseAndRetryStrategy();
        break;
      default:
        console.log("🛑 No safe avoidance strategy - stopping");
        success = await emergencyStopStrategy();
    }
    
    if (success) {
      console.log("✅ Obstacle avoidance successful - resuming navigation");
      if (typeof addToSummary === 'function') {
        addToSummary("✅ Obstacle avoided - resuming navigation");
      }
    } else {
      console.log("❌ Obstacle avoidance failed - stopping navigation");
      if (typeof addToSummary === 'function') {
        addToSummary("❌ Cannot safely avoid obstacles - navigation paused");
      }
    }
    
  } catch (error) {
    console.error("❌ Obstacle avoidance error:", error);
    await emergencyStopStrategy();
  }
}

// Determine the best avoidance strategy based on obstacles
function determineAvoidanceStrategy(obstacles) {
  // Analyze obstacle positions and types
  const leftSideObstacles = obstacles.filter(obs => obs.center && obs.center[0] < 160); // Left half of camera
  const rightSideObstacles = obstacles.filter(obs => obs.center && obs.center[0] > 160); // Right half
  const centerObstacles = obstacles.filter(obs => obs.center && obs.center[0] >= 120 && obs.center[0] <= 200); // Center
  
  console.log(`📊 Obstacle analysis: Left=${leftSideObstacles.length}, Right=${rightSideObstacles.length}, Center=${centerObstacles.length}`);
  
  // If obstacles are only on one side, detour to the other side
  if (centerObstacles.length === 0) {
    if (leftSideObstacles.length > 0 && rightSideObstacles.length === 0) {
      return "detour_right";
    } else if (rightSideObstacles.length > 0 && leftSideObstacles.length === 0) {
      return "detour_left";
    }
  }
  
  // If center is blocked, try the side with fewer obstacles
  if (centerObstacles.length > 0) {
    if (leftSideObstacles.length < rightSideObstacles.length) {
      return "detour_left";
    } else if (rightSideObstacles.length < leftSideObstacles.length) {
      return "detour_right";
    }
  }
  
  // If obstacles are everywhere or moving objects detected, wait
  const movingObjects = obstacles.filter(obs => obs.type === "person" || obs.type === "dog" || obs.type === "cat");
  if (movingObjects.length > 0) {
    return "stop_and_wait";
  }
  
  // Default strategy
  return "detour_right";
}

// Stop and wait for obstacles to clear
async function stopAndWaitStrategy(obstacles) {
  console.log("⏳ STOP AND WAIT: Waiting for obstacles to clear...");
  
  if (typeof stopRobot === 'function') {
    await stopRobot();
  }
  
  const waitAnnouncement = "Stopping to wait for obstacles to clear";
  const utterance = new SpeechSynthesisUtterance(waitAnnouncement);
  speechSynthesis.speak(utterance);
  
  // Wait and check periodically
  for (let attempt = 0; attempt < 10; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
    
    const currentObstacles = await checkForObstacles();
    const stillBlocked = currentObstacles.filter(obs => 
      obs.danger_level === "HIGH" || 
      (obs.center && obs.center[0] >= 120 && obs.center[0] <= 200) // Still in center
    );
    
    if (stillBlocked.length === 0) {
      console.log("✅ Path cleared - resuming movement");
      return true;
    }
    
    console.log(`⏳ Still waiting... ${stillBlocked.length} obstacles remaining`);
  }
  
  console.log("⏰ Wait timeout - trying detour strategy");
  return await detourStrategy("right");
}

// Reverse and retry strategy
async function reverseAndRetryStrategy() {
  console.log("🔄 REVERSE AND RETRY: Backing up and reassessing");
  
  try {
    // Move backward
    if (typeof moveBackward === 'function') {
      await moveBackward(0.5);
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check obstacles again
    const obstaclesAfterReverse = await checkForObstacles();
    if (obstaclesAfterReverse.length === 0) {
      console.log("✅ Obstacles cleared after reverse - resuming forward");
      return true;
    }
    
    // Try a detour strategy
    return await detourStrategy("right");
    
  } catch (error) {
    console.error("❌ Reverse and retry failed:", error);
    return false;
  }
}

// Emergency stop strategy
async function emergencyStopStrategy() {
  console.log("🚨 EMERGENCY STOP: Cannot safely proceed");
  
  if (typeof stopRobot === 'function') {
    await stopRobot();
  }
  
  const emergencyAnnouncement = "Cannot safely navigate around obstacles. Please assist or provide new directions.";
  const utterance = new SpeechSynthesisUtterance(emergencyAnnouncement);
  speechSynthesis.speak(utterance);
  
  // Reset navigation flags
  navigationInProgress = false;
  stopOnlyMode = false;
  if (typeof window !== 'undefined') {
    window.navigationInProgress = false;
    window.stopOnlyMode = false;
  }
  
  if (typeof setVoiceStatus === 'function') {
    setVoiceStatus("🚨 Navigation paused - manual assistance needed");
  }
  
  return false;
}

// ✅ Create visual rover marker
function createRoverMarker() {
  if (typeof window !== 'undefined' && window.roverMarker) {
    window.roverMarker.setMap(null);
  }
  
  if (typeof google !== 'undefined' && google.maps && typeof map !== 'undefined') {
    window.roverMarker = new google.maps.Marker({
      position: simulatedRoverPosition,
      map: map,
      title: "Wall-E Robot",
      icon: {
        path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
        scale: 6,
        fillColor: "#FF0000",
        fillOpacity: 0.8,
        strokeWeight: 2,
        strokeColor: "#FFFFFF",
        rotation: roverBearing
      }
    });
  }
}

// ✅ FIXED: Handle turn+forward combinations without double movement
function simulateRoverMovement(command, distanceInMeters, stepData) {
  // ADD THIS NULL CHECK AT THE START
  if (!simulatedRoverPosition) {
    console.log("⚠️ Rover position not initialized yet");
    // Initialize with a default position if needed
    if (typeof userMarker !== 'undefined' && userMarker && userMarker.getPosition()) {
      simulatedRoverPosition = {
        lat: userMarker.getPosition().lat(),
        lng: userMarker.getPosition().lng()
      };
    } else {
      // Use a default position
      simulatedRoverPosition = {
        lat: 43.6532,
        lng: -79.3832
      };
    }
    roverBearing = 0;
    console.log("✅ Initialized rover position:", simulatedRoverPosition);
  }
  
  console.log(`\n📍 === CONSISTENT POSITION UPDATE ===`);
  console.log(`Command: ${command}, Distance: ${distanceInMeters}m`);
  console.log(`Before - Lat: ${simulatedRoverPosition.lat.toFixed(8)}, Lng: ${simulatedRoverPosition.lng.toFixed(8)}, Bearing: ${roverBearing}°`);
  
  if (command === "forward") {
    // ✅ ALWAYS USE SAME FORWARD DISTANCE - NO EXCEPTIONS
    const FIXED_FORWARD_DISTANCE = 0.03; // Always 3cm - never changes
    
    simulatedRoverPosition = moveInDirection(simulatedRoverPosition, roverBearing, FIXED_FORWARD_DISTANCE);
    
    console.log(`✅ FIXED FORWARD: ${distanceInMeters}m real → 3.0cm GPS (always same)`);
    
    if (typeof addToSummary === 'function') {
      addToSummary(`🤖 Forward ${distanceInMeters}m → 3.0cm GPS (consistent)`);
    }
    
  } else if (command === "backward") {
    // ✅ ALWAYS USE SAME BACKWARD DISTANCE
    const FIXED_BACKWARD_DISTANCE = 0.02; // Always 2cm
    
    simulatedRoverPosition = moveInDirection(simulatedRoverPosition, (roverBearing + 180) % 360, FIXED_BACKWARD_DISTANCE);
    
    console.log(`✅ FIXED BACKWARD: ${distanceInMeters}m real → 2.0cm GPS (always same)`);
    
  } else if (command === "left" || command === "right") {
    // ✅ TURN LOGIC - change bearing AND handle forward if distance > 0
    if (stepData) {
      const turnData = calculateTurnAngle(stepData, command);
      const turnDirection = command === "left" ? -1 : 1;
      const oldBearing = roverBearing;
      
      // ✅ Apply the turn to bearing
      roverBearing = (roverBearing + (turnData.degrees * turnDirection) + 360) % 360;
      
      console.log(`✅ Turned ${command} ${turnData.degrees.toFixed(1)}° - from ${oldBearing.toFixed(1)}° to ${roverBearing.toFixed(1)}°`);
      
      // ✅ If this turn has distance, also move forward (turn+forward combination)
      if (distanceInMeters > 0) {
        const FIXED_FORWARD_DISTANCE = 0.03; // Same 3cm as regular forward
        simulatedRoverPosition = moveInDirection(simulatedRoverPosition, roverBearing, FIXED_FORWARD_DISTANCE);
        console.log(`✅ Post-turn forward: ${distanceInMeters}m real → 3.0cm GPS (combined with turn)`);
        
        if (typeof addToSummary === 'function') {
          addToSummary(`🔄 ${command} turn + forward: ${turnData.degrees.toFixed(1)}° + ${distanceInMeters}m → 3.0cm GPS`);
        }
      } else {
        if (typeof addToSummary === 'function') {
          addToSummary(`🔄 ${command} turn: ${turnData.degrees.toFixed(1)}° completed (turn only)`);
        }
      }
      
    } else {
      // Fallback turn without step data
      const turnDirection = command === "left" ? -1 : 1;
      roverBearing = (roverBearing + (90 * turnDirection) + 360) % 360;
      
      console.log(`✅ Simple ${command} turn: 90° to ${roverBearing.toFixed(1)}°`);
    }
  }
  
  console.log(`After  - Lat: ${simulatedRoverPosition.lat.toFixed(8)}, Lng: ${simulatedRoverPosition.lng.toFixed(8)}, Bearing: ${roverBearing}°`);
  console.log(`===========================\n`);
  
  // Update the marker
  if (typeof updateRoverMarkerPosition === 'function') {
    updateRoverMarkerPosition();
  }
}

// ✅ Calculate realistic turn angles from Google Maps data
function calculateTurnAngle(stepData, direction) {
  if (!stepData) {
    // Default angles if no step data
    return { degrees: 90, type: "default" };
  }
  
  let turnDegrees = 90; // Default
  let turnType = "normal";
  
  // ✅ Extract turn info from maneuver
  if (stepData.maneuver) {
    const maneuver = stepData.maneuver.toLowerCase();
    
    switch(maneuver) {
      case 'turn-slight-left':
      case 'turn-slight-right':
        turnDegrees = 30;
        turnType = "slight";
        break;
      case 'turn-left':
      case 'turn-right':
        turnDegrees = 90;
        turnType = "normal";
        break;
      case 'turn-sharp-left':
      case 'turn-sharp-right':
        turnDegrees = 120;
        turnType = "sharp";
        break;
      case 'ramp-left':
      case 'ramp-right':
        turnDegrees = 45;
        turnType = "ramp";
        break;
      case 'roundabout-left':
      case 'roundabout-right':
        turnDegrees = 270; // 3/4 circle for roundabouts
        turnType = "roundabout";
        break;
      default:
        turnDegrees = 90;
        turnType = "normal";
    }
  }
  
  // ✅ Calculate actual bearing change from step geometry
  if (stepData && stepData.startLocation && stepData.endLocation) {
    const startLat = typeof stepData.startLocation.lat === 'function' ? stepData.startLocation.lat() : stepData.startLocation.lat;
    const startLng = typeof stepData.startLocation.lng === 'function' ? stepData.startLocation.lng() : stepData.startLocation.lng;
    const endLat = typeof stepData.endLocation.lat === 'function' ? stepData.endLocation.lat() : stepData.endLocation.lat;
    const endLng = typeof stepData.endLocation.lng === 'function' ? stepData.endLocation.lng() : stepData.endLocation.lng;
    
    // Calculate the actual bearing change needed
    const targetBearing = calculateBearing(
      { lat: startLat, lng: startLng },
      { lat: endLat, lng: endLng }
    );
    
    let bearingChange = targetBearing - roverBearing;
    if (bearingChange > 180) bearingChange -= 360;
    if (bearingChange < -180) bearingChange += 360;
    
    // Use the calculated bearing change if it's significant
    if (Math.abs(bearingChange) > 10) {
      turnDegrees = Math.abs(bearingChange);
      turnType = "calculated";
      
      console.log(`🧭 Calculated bearing change: ${bearingChange.toFixed(1)}° (from ${roverBearing}° to ${targetBearing.toFixed(1)}°)`);
    }
  }
  
  console.log(`🔄 Turn analysis: ${direction} ${turnDegrees}° (${turnType})`);
  return { degrees: turnDegrees, type: turnType, maneuver: stepData?.maneuver };
}

// ✅ Simulate realistic turning with clean voice announcements
function simulateTurnMovement(direction, degrees, stepData) {
  const turnDirection = direction === "left" ? -1 : 1;
  const oldBearing = roverBearing;
  
  // Apply the turn
  roverBearing = (roverBearing + (degrees * turnDirection) + 360) % 360;
  
  console.log(`✅ Turned ${direction} ${degrees.toFixed(1)}° - from ${oldBearing.toFixed(1)}° to ${roverBearing.toFixed(1)}°`);
  
  if (typeof addToSummary === 'function') {
    const maneuverText = stepData?.maneuver || `${direction} turn`;
    // ✅ CLEAN summary without overwhelming degree precision
    addToSummary(`🔄 ${maneuverText}: ${degrees.toFixed(1)}° ${direction} turn completed`);
  }
  
  // ✅ Animate the turn based on degrees (but don't announce degrees)
  animateSimpleTurnMovement(direction, degrees);
}

// ✅ Simple turn animation without degrees in summary
function animateSimpleTurnMovement(direction, degrees) {
  console.log(`🔄 Animating ${direction} turn: ${degrees.toFixed(1)}°`);
  
  // Update marker immediately
  updateRoverMarkerPosition();
  
  // Simple feedback without overwhelming details
  if (typeof addToSummary === 'function') {
    addToSummary(`🔄 ${direction} turn completed`);
  }
}

// ✅ SIMPLIFIED rover marker updates
function updateRoverMarkerPosition() {
  if (typeof window !== 'undefined' && window.roverMarker && simulatedRoverPosition) {
    window.roverMarker.setPosition(simulatedRoverPosition);
    window.roverMarker.setIcon({
      path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
      scale: 10,              
      fillColor: "#FF0000", 
      fillOpacity: 1,
      strokeWeight: 3,        
      strokeColor: "#FFFFFF",
      rotation: roverBearing
    });
    
    // Only center if explicitly enabled
    if (ROVER_SIMULATION.AUTO_CENTER_MAP && typeof map !== 'undefined') {
      map.panTo(simulatedRoverPosition);
    }
    
    console.log(`📍 Rover marker updated at: ${simulatedRoverPosition.lat.toFixed(6)}, ${simulatedRoverPosition.lng.toFixed(6)}`);
  }
}

// ✅ Helper function to move in a specific direction
function moveInDirection(startPos, bearingDegrees, distanceMeters) {
  const earthRadius = 6378137; // Earth's radius in meters
  const bearingRadians = bearingDegrees * (Math.PI / 180);
  
  const lat1 = startPos.lat * (Math.PI / 180);
  const lng1 = startPos.lng * (Math.PI / 180);
  
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distanceMeters / earthRadius) +
    Math.cos(lat1) * Math.sin(distanceMeters / earthRadius) * Math.cos(bearingRadians)
  );
  
  const lng2 = lng1 + Math.atan2(
    Math.sin(bearingRadians) * Math.sin(distanceMeters / earthRadius) * Math.cos(lat1),
    Math.cos(distanceMeters / earthRadius) - Math.sin(lat1) * Math.sin(lat2)
  );
  
  return {
    lat: lat2 * (180 / Math.PI),
    lng: lng2 * (180 / Math.PI)
  };
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}


function startNavigationCleanly(routeResult) {
  console.log("🚀 Starting clean navigation...");
  
  try {
    if (typeof parseDirectionsToSteps === 'function') {
      navigationSteps = parseDirectionsToSteps(routeResult);
    } else {
      console.error("❌ parseDirectionsToSteps function not available");
      return;
    }
    
    currentStepIndex = 0;
    navigationActive = true;
    // Notify app that navigation has started
    if (typeof document !== 'undefined' && document.dispatchEvent) {
      document.dispatchEvent(new CustomEvent('navigation:start'));
    }
    
    // Initialize rover position
    initializeSimulatedRover();
    
    // ✅ START LIVE MAP ANIMATION
    startLiveMapAnimation(routeResult);
    
    if (typeof addToSummary === 'function') {
      addToSummary("🚀 Navigation started");
      addToSummary(`📋 Total steps: ${navigationSteps.length}`);
      addToSummary("🎬 Live map tracking active"); // ← New
    }
    
    console.log(`📋 Navigation plan - ${navigationSteps.length} steps total`);
    
    if (navigationSteps.length > 0) {
      giveStepByStepInstruction(0);
    }
    
    console.log("✅ Clean navigation with live animation started");
    
  } catch (error) {
    console.error("❌ Navigation start failed:", error);
  }
}

function executeRobotMovementForStep(stepIndex) {
  if (stepIndex >= navigationSteps.length) {
    console.log("❌ Step index out of range:", stepIndex);
    return;
  }
  
  const step = navigationSteps[stepIndex];
  const distanceInMeters = step.distanceValue;
  
  console.log(`🤖 Executing movement for step ${stepIndex + 1}: ${step.instruction}`);
  console.log(`🤖 Distance: ${step.distance} (${distanceInMeters}m)`);
  
  let robotCommand = "forward";
  
  if (step.maneuver === 'turn-left' || step.instruction.toLowerCase().includes('turn left')) {
    robotCommand = "left";
  } else if (step.maneuver === 'turn-right' || step.instruction.toLowerCase().includes('turn right')) {
    robotCommand = "right";
  } else {
    robotCommand = "forward";
  }
  
  // ✅ EXECUTE THE ACTUAL ROBOT MOVEMENT
  executeRobotMovement(robotCommand, distanceInMeters);
  
  if (typeof addToSummary === 'function') {
    addToSummary(`🤖 Executing step ${stepIndex + 1}: ${robotCommand} ${distanceInMeters}m`);
  }
}

// ✅ SUPPORTING FUNCTION: Silent navigation start (NO speech calls)
function startNavigationSilently(routeResult, startFromStep = 0) {
  console.log("🚀 Starting navigation silently from step", startFromStep);
  
  try {
    if (typeof parseDirectionsToSteps === 'function') {
      navigationSteps = parseDirectionsToSteps(routeResult);
    } else {
      console.error("❌ parseDirectionsToSteps function not available");
      return;
    }
    
    currentStepIndex = startFromStep; // ✅ Start from step 0, not step 1
    navigationActive = true;
    // Notify app that navigation has started
    if (typeof document !== 'undefined' && document.dispatchEvent) {
      document.dispatchEvent(new CustomEvent('navigation:start'));
    }
    
    // Initialize simulated rover position
    initializeSimulatedRover();
    
    if (typeof addToSummary === 'function') {
      addToSummary("🚀 Step-by-step navigation started");
      addToSummary(`📋 Total steps: ${navigationSteps.length}`);
    }
    
    if (currentStepIndex < navigationSteps.length) {
      const currentStep = navigationSteps[currentStepIndex];
      if (typeof addToSummary === 'function') {
        addToSummary(`🧭 Monitoring step ${currentStepIndex + 1}: ${currentStep.instruction}`);
      }
    }
    
    if (typeof startRobotNavigationSilently === 'function') {
      startRobotNavigationSilently();
    }
    startPositionTracking();
    
    if (typeof isCameraActive !== 'undefined' && isCameraActive && typeof startEnhancedDetectionLoop === 'function') {
      startEnhancedDetectionLoop();
    }
    
    console.log("✅ Silent navigation with rover simulation started");
    
  } catch (error) {
    console.error("❌ Silent navigation start failed:", error);
    if (typeof addToSummary === 'function') {
      addToSummary("⚠️ Navigation started with limited features");
    }
  }
}

function testDistanceFormula() {
  console.log("\n🧪 === TESTING DISTANCE FORMULA ===");
  console.log("Formula: distanceMeters/100 = cm, cm*0.1 = seconds");
  console.log("Examples:");
  
  const testDistances = [19, 50, 100, 214, 500, 1000, 1500];
  
  testDistances.forEach(distance => {
    const realDistanceCm = distance / 100;
    const duration = Math.max(0.05, Math.min(realDistanceCm * 0.1, 2.0));
    console.log(`   ${distance}m → ${realDistanceCm.toFixed(1)}cm → ${duration.toFixed(3)}s`);
  });
  
  console.log("=================================\n");
}
// ===== LIVE MAP ANIMATION SYSTEM =====
let routeCoordinates = []; // All route points
let currentRouteIndex = 0; // Current position along route
let animationInterval = null;
let routeProgress = 0; // 0 to 1 (0% to 100%)

// Extract route coordinates from Google Maps result
function extractRouteCoordinates(directionsResult) {
  routeCoordinates = [];
  
  const route = directionsResult.routes[0];
  if (!route) return;
  
  // Get all coordinate points from the route polyline
  route.legs.forEach(leg => {
    leg.steps.forEach(step => {
      const path = step.path || [];
      path.forEach(point => {
        routeCoordinates.push({
          lat: point.lat(),
          lng: point.lng()
        });
      });
    });
  });
  
  // If no detailed path, use step start/end points
  if (routeCoordinates.length === 0) {
    route.legs.forEach(leg => {
      leg.steps.forEach(step => {
        routeCoordinates.push({
          lat: step.start_location.lat(),
          lng: step.start_location.lng()
        });
        routeCoordinates.push({
          lat: step.end_location.lat(),
          lng: step.end_location.lng()
        });
      });
    });
  }
  
  console.log(`🗺️ Route extracted: ${routeCoordinates.length} coordinate points`);
  return routeCoordinates;
}

// Start animated movement along the route
function startLiveMapAnimation(directionsResult) {
  console.log("🎬 Starting live map animation...");
  
  // Extract route coordinates
  extractRouteCoordinates(directionsResult);
  
  if (routeCoordinates.length === 0) {
    console.log("❌ No route coordinates found");
    return;
  }
  
  // Start Wall-E at the beginning of the route
  currentRouteIndex = 0;
  routeProgress = 0;
  
  const startPosition = routeCoordinates[0];
  simulatedRoverPosition = { ...startPosition };
  
  // Create/update Wall-E's marker
  createAnimatedRoverMarker();
  
  // Center map on starting position
  if (typeof map !== 'undefined') {
    map.panTo(startPosition);
    map.setZoom(16); // Close zoom for detailed view
  }
  
  console.log("✅ Live animation initialized");
}

// Create enhanced rover marker for animation
function createAnimatedRoverMarker() {
  // Remove existing marker
  if (typeof window !== 'undefined' && window.roverMarker) {
    window.roverMarker.setMap(null);
  }
  
  if (typeof google !== 'undefined' && google.maps && typeof map !== 'undefined') {
    window.roverMarker = new google.maps.Marker({
      position: simulatedRoverPosition,
      map: map,
      title: "Wall-E Robot - Live Navigation",
      icon: {
        path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
        scale: 8,
        fillColor: "#00FF00", // Green for active navigation
        fillOpacity: 1,
        strokeWeight: 3,
        strokeColor: "#000000",
        rotation: roverBearing
      },
      zIndex: 1000 // Keep on top
    });
    
    // Add info window with progress
    const infoWindow = new google.maps.InfoWindow({
      content: `<div style="text-align:center">
        <strong>🤖 Wall-E Robot</strong><br>
        <span style="color:#666">Navigation Progress: ${Math.round(routeProgress * 100)}%</span>
      </div>`
    });
    
    window.roverMarker.addListener('click', () => {
      infoWindow.open(map, window.roverMarker);
    });
  }
}

// Animate Wall-E along the route (call this during movement)
function animateWallEMovement(command, distanceInMeters) {
  if (routeCoordinates.length === 0) {
    console.log("⚠️ No route coordinates for animation");
    return;
  }
  
  console.log(`🎬 Animating Wall-E ${command} movement: ${distanceInMeters}m`);
  
  // Calculate how many route points to advance based on distance
  const totalRouteDistance = calculateTotalRouteDistance();
  const distanceRatio = distanceInMeters / totalRouteDistance;
  const pointsToAdvance = Math.max(1, Math.floor(distanceRatio * routeCoordinates.length));
  
  const startIndex = currentRouteIndex;
  const endIndex = Math.min(currentRouteIndex + pointsToAdvance, routeCoordinates.length - 1);
  
  console.log(`📍 Moving from point ${startIndex} to ${endIndex} (${pointsToAdvance} points)`);
  
  // Smooth animation between points
  animateBetweenPoints(startIndex, endIndex, 2000); // 2 seconds animation
}

// Smooth animation between route points
function animateBetweenPoints(startIndex, endIndex, durationMs) {
  if (animationInterval) {
    clearInterval(animationInterval);
  }
  
  const startTime = Date.now();
  const startPos = routeCoordinates[startIndex];
  const endPos = routeCoordinates[endIndex];
  
  // Calculate bearing for arrow direction
  const bearing = calculateBearing(startPos, endPos);
  roverBearing = bearing;
  
  animationInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / durationMs, 1);
    
    // Smooth interpolation between start and end
    const currentPos = {
      lat: startPos.lat + (endPos.lat - startPos.lat) * progress,
      lng: startPos.lng + (endPos.lng - startPos.lng) * progress
    };
    
    // Update Wall-E's position
    simulatedRoverPosition = currentPos;
    
    if (window.roverMarker) {
      window.roverMarker.setPosition(currentPos);
      window.roverMarker.setIcon({
        path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
        scale: 8,
        fillColor: "#00FF00",
        fillOpacity: 1,
        strokeWeight: 3,
        strokeColor: "#000000",
        rotation: bearing
      });
    }
    
    // Keep map centered on Wall-E
    if (typeof map !== 'undefined') {
      map.panTo(currentPos);
    }
    
    // Update progress
    routeProgress = endIndex / (routeCoordinates.length - 1);
    
    // Animation complete
    if (progress >= 1) {
      clearInterval(animationInterval);
      currentRouteIndex = endIndex;
      
      console.log(`✅ Animation complete - now at point ${endIndex} (${Math.round(routeProgress * 100)}%)`);
      
      // Update summary with progress
      if (typeof addToSummary === 'function') {
        addToSummary(`📍 Progress: ${Math.round(routeProgress * 100)}% of route completed`);
      }
    }
  }, 50); // 20 FPS animation
}

// Calculate total route distance
function calculateTotalRouteDistance() {
  let total = 0;
  for (let i = 1; i < routeCoordinates.length; i++) {
    total += calculateDistance(
      routeCoordinates[i-1].lat, routeCoordinates[i-1].lng,
      routeCoordinates[i].lat, routeCoordinates[i].lng
    );
  }
  return total * 1000; // Convert to meters
}

// Calculate bearing between two points
function calculateBearing(start, end) {
  const dLng = (end.lng - start.lng) * Math.PI / 180;
  const lat1 = start.lat * Math.PI / 180;
  const lat2 = end.lat * Math.PI / 180;
  
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  
  const bearing = Math.atan2(y, x) * 180 / Math.PI;
  return (bearing + 360) % 360;
}

// ===== INTELLIGENT OBSTACLE AVOIDANCE SYSTEM =====
let obstacleAvoidanceState = {
  isAvoiding: false,
  originalStep: null,
  originalStepIndex: null,
  avoidanceAttempts: 0,
  maxAttempts: 3,
  lastDetectionDistance: null
};

// Main obstacle avoidance handler - SAFE VERSION
async function handleSmartObstacleAvoidance() {
  console.log("🛡️ === SAFE OBSTACLE AVOIDANCE INITIATED ===");
  
  // Save navigation state
  obstacleAvoidanceState.isAvoiding = true;
  obstacleAvoidanceState.originalStepIndex = currentStepIndex;
  
  // 1. ENSURE COMPLETE STOP
  if (typeof stopRobot === 'function') {
    await stopRobot();
  }
  
  // 2. PAUSE FOR 2 SECONDS
  console.log("⏸️ Pausing for safety...");
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // 3. SCAN LEFT AND RIGHT (ROTATION ONLY - NO FORWARD MOVEMENT!)
  const scanResult = await performSafeScan();
  
  if (scanResult.found) {
    console.log(`✅ Best path: ${scanResult.direction} with ${scanResult.distance}cm clearance`);
    
    // 4. TURN TO BEST DIRECTION
    await turnToDirection(scanResult.direction);
    
    // 5. SHORT FORWARD MOVEMENT
    console.log("➡️ Making short forward movement to avoid obstacle");
    if (typeof moveForward === 'function') {
      // SHORT movement - only 0.3 seconds (slightly longer than normal 0.15)
      await moveForward(0.3);
    }
    
    // 6. SMALL PAUSE
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 7. RESUME NAVIGATION FROM PREVIOUS STEP
    obstacleAvoidanceState.isAvoiding = false;
    console.log("✅ Obstacle avoided - resuming navigation");
    
    // Resume from the SAME step we were on
    if (navigationActive && currentStepIndex < navigationSteps.length) {
      setTimeout(() => {
        navigationInProgress = true;
        stopOnlyMode = true;
        giveStepByStepInstruction(currentStepIndex); // Resume current step
      }, 1000);
    }
    
    return true;
  } else {
    console.log("❌ No clear path found in any direction");
    await requestManualAssistance();
    obstacleAvoidanceState.isAvoiding = false;
    return false;
  }
}

// SAFE SCANNING - Just rotation, NO forward movement
async function performSafeScan() {
  console.log("🔍 Starting SAFE scan (rotation only)...");
  
  const scanResults = {
    left: 0,
    center: 0,
    right: 0,
    found: false,
    direction: null,
    distance: 0
  };
  
  // 1. CHECK CENTER (current position)
  console.log("📡 Checking CENTER...");
  scanResults.center = await checkUltrasonicDistance();
  await new Promise(r => setTimeout(r, 500));
  
  // 2. TURN LEFT AND CHECK (ROTATION ONLY!)
  console.log("📡 Turning LEFT to scan...");
  if (typeof turnLeft === 'function') {
    await turnLeft(0.2); // Short turn
  }
  await new Promise(r => setTimeout(r, 800)); // Wait for turn to settle
  scanResults.left = await checkUltrasonicDistance();
  await new Promise(r => setTimeout(r, 500));
  
  // 3. TURN BACK TO CENTER
  console.log("📡 Returning to CENTER...");
  if (typeof turnRight === 'function') {
    await turnRight(0.2); // Turn back
  }
  await new Promise(r => setTimeout(r, 800));
  
  // 4. TURN RIGHT AND CHECK (ROTATION ONLY!)
  console.log("📡 Turning RIGHT to scan...");
  if (typeof turnRight === 'function') {
    await turnRight(0.2); // Short turn
  }
  await new Promise(r => setTimeout(r, 800));
  scanResults.right = await checkUltrasonicDistance();
  await new Promise(r => setTimeout(r, 500));
  
  // 5. TURN BACK TO CENTER
  console.log("📡 Returning to CENTER...");
  if (typeof turnLeft === 'function') {
    await turnLeft(0.2); // Turn back
  }
  await new Promise(r => setTimeout(r, 800));
  
  // 6. FIND THE HIGHEST DISTANCE (most open path)
  console.log(`📊 Scan results - Left: ${scanResults.left}cm, Center: ${scanResults.center}cm, Right: ${scanResults.right}cm`);
  
  let bestDirection = null;
  let bestDistance = 0;
  
  // Find which direction has the HIGHEST clearance
  if (scanResults.left > 30 && scanResults.left > bestDistance) {
    bestDirection = 'left';
    bestDistance = scanResults.left;
  }
  if (scanResults.center > 30 && scanResults.center > bestDistance) {
    bestDirection = 'center';
    bestDistance = scanResults.center;
  }
  if (scanResults.right > 30 && scanResults.right > bestDistance) {
    bestDirection = 'right';
    bestDistance = scanResults.right;
  }
  
  if (bestDirection) {
    scanResults.found = true;
    scanResults.direction = bestDirection;
    scanResults.distance = bestDistance;
    
    // Announce the result
    if (typeof sayAndResume === 'function') {
      await sayAndResume(`Best path is ${bestDirection} with ${bestDistance} centimeters clearance.`);
    }
  }
  
  return scanResults;
}

// Turn to specific direction from center
async function turnToDirection(direction) {
  console.log(`🔄 Turning to ${direction} direction...`);
  
  switch(direction) {
    case 'left':
      if (typeof turnLeft === 'function') {
        await turnLeft(0.2); // Short turn
      }
      break;
      
    case 'right':
      if (typeof turnRight === 'function') {
        await turnRight(0.2); // Short turn
      }
      break;
      
    case 'center':
      // Already facing center, no turn needed
      console.log("✅ Already facing center");
      break;
  }
  
  // Wait for turn to complete
  await new Promise(r => setTimeout(r, 800));
}

// Determine preferred direction based on next navigation turn
function determinePreferredAvoidanceDirection() {
  // Look ahead at next few navigation steps
  let upcomingTurns = [];
  
  for (let i = currentStepIndex; i < Math.min(currentStepIndex + 3, navigationSteps.length); i++) {
    const step = navigationSteps[i];
    if (step.instruction.toLowerCase().includes('left')) {
      upcomingTurns.push('left');
    } else if (step.instruction.toLowerCase().includes('right')) {
      upcomingTurns.push('right');
    }
  }
  
  console.log(`📊 Upcoming turns: ${upcomingTurns.join(', ') || 'none'}`);
  
  // If next turn is left, try left first
  if (upcomingTurns.length > 0) {
    return upcomingTurns[0];
  }
  
  // Default to right if no upcoming turns
  return 'right';
}

// Keep only simple manual assistance request
async function requestManualAssistance() {
  console.log("🆘 Requesting manual assistance");
  
  if (typeof sayAndResume === 'function') {
    await sayAndResume("No clear path found. Please help me get around this obstacle.");
  }
  
  if (typeof addToSummary === 'function') {
    addToSummary("🆘 Manual assistance needed - obstacle blocking all paths");
  }
  
  // Pause navigation
  navigationInProgress = false;
  obstacleAvoidanceState.isAvoiding = false;
}


// Check ultrasonic distance
async function checkUltrasonicDistance() {
  try {
    const response = await fetch(`http://${DETECTION_CONFIG.PI_IP}:${DETECTION_CONFIG.DETECTION_PORT}/ultrasonic_distance`);
    if (response.ok) {
      const data = await response.json();
      return data.distance_cm || 999;
    }
  } catch (error) {
    console.warn("⚠️ Ultrasonic check failed:", error);
  }
  return 999;
}


// Resume navigation after avoiding obstacle
async function resumeNavigationAfterAvoidance() {
  console.log("🔄 Resuming navigation to destination...");
  
  if (typeof sayAndResume === 'function') {
    await sayAndResume("Obstacle avoided. Continuing journey to destination.");
  }
  
  if (typeof addToSummary === 'function') {
    addToSummary("✅ Obstacle avoided - resuming navigation");
  }
  
  // Reset avoidance state
  obstacleAvoidanceState.isAvoiding = false;
  obstacleAvoidanceState.avoidanceAttempts = 0;
  
  // Continue with current navigation step (redo the interrupted step)
  console.log(`📍 Resuming from step ${currentStepIndex + 1} of ${navigationSteps.length}`);
  
  // Small delay before resuming
  setTimeout(async () => {
    // Re-enable navigation flags
    navigationInProgress = true;
    stopOnlyMode = true;
    
    if (typeof window !== 'undefined') {
      window.navigationInProgress = true;
      window.stopOnlyMode = true;
    }
    
    // Re-execute the current step that was interrupted
    await giveStepByStepInstruction(currentStepIndex);
  }, 1000);
}

// Request manual assistance if no path found
async function requestManualAssistance() {
  console.log("🆘 Requesting manual assistance");
  
  if (typeof sayAndResume === 'function') {
    await sayAndResume("Unable to find clear path. Please assist me around the obstacle.");
  }
  
  if (typeof addToSummary === 'function') {
    addToSummary("🆘 Manual assistance needed - obstacle blocking all paths");
  }
  
  // Pause navigation
  navigationInProgress = false;
  obstacleAvoidanceState.isAvoiding = false;
  
  // Wait for manual intervention
  console.log("⏸️ Navigation paused - waiting for manual assistance");
}

// Modify the existing moveForwardWithObstacleDetection function
async function moveForwardWithObstacleDetection(duration, plannedDistance) {
  console.log(`🛡️ Moving forward with obstacle detection: ${duration}s, ${plannedDistance}m`);
  
  let totalMovementTime = duration * 1000;
  let checkInterval = 100;
  let currentTime = 0;
  let movementActive = true;
  
  // Make movement state globally accessible
  if (typeof window !== 'undefined') {
    window.movementActive = true;
  }
  
  // Start the actual robot movement
  const movementPromise = moveForward(duration);
  
  // Parallel obstacle monitoring
  const monitoringPromise = new Promise(async (resolve) => {
    while (currentTime < totalMovementTime && movementActive) {
      // Check global emergency stop flag
      if (typeof window.globalEmergencyStop !== 'undefined' && window.globalEmergencyStop) {
        console.log("🚨 Movement halted by emergency stop!");
        movementActive = false;
        resolve(false);
        return;
      }
      
      // Continue monitoring...
      await new Promise(r => setTimeout(r, checkInterval));
      currentTime += checkInterval;
    }
    
    resolve(true);
  });
  
  const [movementResult, monitoringResult] = await Promise.all([movementPromise, monitoringPromise]);
  
  // Clear movement flag
  if (typeof window !== 'undefined') {
    window.movementActive = false;
  }
  
  console.log(`✅ Movement completed: ${monitoringResult ? 'SUCCESS' : 'STOPPED BY OBSTACLE'}`);
  return movementResult && monitoringResult;
}

// Helper function for turning robot
async function turnRobot(direction, duration) {
  console.log(`🔄 Turning ${direction} for ${duration}s`);
  
  try {
    const response = await fetch(`http://${ROBOT_CONFIG.IP}:${ROBOT_CONFIG.PORT}/robot/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        direction: direction,
        duration: duration 
      })
    });
    
    if (response.ok) {
      console.log(`✅ Turn ${direction} completed`);
    }
  } catch (error) {
    console.error(`❌ Turn failed:`, error);
  }
}

// Helper function for moving backward
async function moveBackward(duration) {
  console.log(`⬅️ Moving backward for ${duration}s`);
  
  try {
    const response = await fetch(`http://${ROBOT_CONFIG.IP}:${ROBOT_CONFIG.PORT}/robot/backward`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration: duration })
    });
    
    if (response.ok) {
      console.log(`✅ Backward movement completed`);
    }
  } catch (error) {
    console.error(`❌ Backward movement failed:`, error);
  }
}

// Update the checkForObstaclesEnhanced function in detection_client.js
async function checkForObstaclesEnhanced() {
  if (!detectionActive) return;
  
  try {
    const ultrasonicResponse = await fetch(`http://${DETECTION_CONFIG.PI_IP}:${DETECTION_CONFIG.DETECTION_PORT}/ultrasonic_distance`);
    
    if (ultrasonicResponse.ok) {
      const ultrasonicData = await ultrasonicResponse.json();
      const distance = ultrasonicData.distance_cm;
      
      // Only trigger avoidance if navigation is active and not already avoiding
      if (distance < 15 && distance > 0 && navigationInProgress && !obstacleAvoidanceState.isAvoiding) {
        console.log("🚨 OBSTACLE DETECTED DURING NAVIGATION!");
        
        // Trigger smart avoidance
        await handleSmartObstacleAvoidance();
        return;
      }
    }
    
    // Continue with camera detection checks...
    const response = await fetch(`http://${DETECTION_CONFIG.PI_IP}:${DETECTION_CONFIG.DETECTION_PORT}/detection_status`);
    
    if (response.ok) {
      //
      const data = await response.json();
      
      // Update visual display
      if (data.obstacles) {
        displayDetectedObjects(data.obstacles);
      }
      
      // Process detection data
      if (data.obstacles && data.obstacles.length > 0) {
        const dangerousObstacles = data.obstacles.filter(obs => 
          obs.danger_level === "HIGH" || 
          (obs.area && obs.area > 5000) || 
          (obs.distance_from_center && obs.distance_from_center < 50)
        );
        
        if (dangerousObstacles.length > 0 && !obstacleAvoidanceState.isAvoiding) {
          console.log("🚨 CAMERA: Dangerous obstacles detected!");
          const objectNames = [...new Set(dangerousObstacles.map(obs => obs.type || obs.class))];
          updateDetectionPanel(`⚠️ Danger: ${objectNames.join(', ')}`, "danger");
        } else {
          const objectNames = [...new Set(data.obstacles.map(obs => obs.type || obs.class))];
          updateDetectionPanel(`👀 Monitoring: ${objectNames.join(', ')}`, "warning");
        }
      } else {
        updateDetectionPanel("✅ Path clear - all systems operational", "success");
      }
    }
  } catch (error) {
    console.warn("⚠️ Detection check failed:", error);
  }
}

// Update the startNavigationCleanly function to store steps
async function startNavigationCleanly(directionsResult) {
  console.log("🚀 Starting clean navigation...");
  
  try {
    if (typeof parseDirectionsToSteps === 'function') {
      navigationSteps = parseDirectionsToSteps(directionsResult);
    } else {
      console.error("❌ parseDirectionsToSteps function not available");
      return;
    }
    
    currentStepIndex = 0;
    navigationActive = true;
    navigationInProgress = true;
    
    // Store globally
    if (typeof window !== 'undefined') {
      window.navigationActive = true;
      window.navigationInProgress = true;
    }
    
    // Notify app that navigation has started
    if (typeof document !== 'undefined' && document.dispatchEvent) {
      document.dispatchEvent(new CustomEvent('navigation:start'));
    }
    
    // Initialize rover position
    initializeSimulatedRover();
    
    // ✅ START LIVE MAP ANIMATION
    if (typeof startLiveMapAnimation === 'function') {
      startLiveMapAnimation(directionsResult);
    }
    
    if (typeof addToSummary === 'function') {
      addToSummary("🚀 Navigation started");
      addToSummary(`📋 Total steps: ${navigationSteps.length}`);
      addToSummary("🎬 Live map tracking active");
    }
    
    console.log(`📋 Navigation plan - ${navigationSteps.length} steps total`);
    
    if (navigationSteps.length > 0) {
      await giveStepByStepInstruction(0);
    }
    
    console.log("✅ Clean navigation with live animation started");
    
  } catch (error) {
    console.error("❌ Navigation start failed:", error);
  }
}




// Integration test function
async function testObstacleAvoidance() {
  console.log("🧪 === TESTING OBSTACLE AVOIDANCE ===");
  
  // Simulate obstacle detection
  obstacleAvoidanceState.lastDetectionDistance = 10;
  
  // Test preferred direction logic
  const preferredDir = determinePreferredAvoidanceDirection();
  console.log(`📍 Preferred direction: ${preferredDir}`);
  
  // Test ultrasonic reading
  const distance = await checkUltrasonicDistance();
  console.log(`📏 Current distance: ${distance}cm`);
  
  // Test full avoidance
  if (distance < 15) {
    await handleSmartObstacleAvoidance();
  }
}

// Add this to initialize the system properly
function initializeObstacleAvoidance() {
  console.log("🚀 Initializing intelligent obstacle avoidance system...");
  
  // Reset state
  obstacleAvoidanceState = {
    isAvoiding: false,
    originalStep: null,
    originalStepIndex: null,
    avoidanceAttempts: 0,
    maxAttempts: 3,
    lastDetectionDistance: null
  };
  
  // Ensure detection is active
  if (typeof startObstacleDetectionAuto === 'function') {
    startObstacleDetectionAuto();
  }
  
  console.log("✅ Obstacle avoidance system ready!");
}

// Call initialization when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeObstacleAvoidance);
} else {
  initializeObstacleAvoidance();
}

// Export for debugging
window.obstacleAvoidanceDebug = {
  state: obstacleAvoidanceState,
  test: testObstacleAvoidance,
  checkDistance: checkUltrasonicDistance,
  findPath: findClearPath,
  manualAvoid: handleSmartObstacleAvoidance
};

console.log("✅ Intelligent obstacle avoidance system loaded!");
console.log("💡 Test with: obstacleAvoidanceDebug.test()");

// Make navigation functions globally available
window.startNavigationCleanly = startNavigationCleanly;
window.startNavigationSilently = startNavigationSilently;
window.giveStepByStepInstruction = giveStepByStepInstruction;
window.handleSmartObstacleAvoidance = handleSmartObstacleAvoidance;

console.log("✅ Navigation module loaded - functions available:", {
  startNavigationCleanly: typeof window.startNavigationCleanly,
  startNavigationSilently: typeof window.startNavigationSilently,
  giveStepByStepInstruction: typeof window.giveStepByStepInstruction,
});

