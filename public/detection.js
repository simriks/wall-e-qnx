const YOLOV8_ONNX_URL = 'walle/yolov8n.onnx';  
let ortSession = null;

// COCO 80 class labels:
const COCO_CLASSES = [  "person","bicycle","car","motorbike","aeroplane","bus","train","truck","boat","traffic light",
  "fire hydrant","stop sign","parking meter","bench","bird","cat","dog","horse","sheep",
  "cow","elephant","bear","zebra","giraffe","backpack","umbrella","handbag","tie","suitcase",
  "frisbee","skis","snowboard","sports ball","kite","baseball bat","baseball glove","skateboard",
  "surfboard","tennis racket","bottle","wine glass","cup","fork","knife","spoon","bowl",
  "banana","apple","sandwich","orange","broccoli","carrot","hot dog","pizza","donut","cake",
  "chair","sofa","pottedplant","bed","diningtable","toilet","tvmonitor","laptop","mouse",
  "remote","keyboard","cell phone","microwave","oven","toaster","sink","refrigerator","book",
  "clock","vase","scissors","teddy bear","hair drier","toothbrush"
];

// Load YOLOv8 ONNX model (once)
async function loadYoloModel() {
  if (!ortSession) {
    ortSession = await ort.InferenceSession.create(YOLOV8_ONNX_URL, { executionProviders: ['wasm'] });
    console.log('[YOLO] Model loaded');
  }
}

// Get a video frame from an <img> or <video> element as a canvas ImageData
function getCameraFrame(elementId) {
  const el = document.getElementById(elementId);
  if (!el || (el.tagName === "IMG" && !el.complete)) return null;
  const w = el.naturalWidth || el.videoWidth || el.width;
  const h = el.naturalHeight || el.videoHeight || el.height;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(el, 0, 0, w, h);
  return { data: ctx.getImageData(0, 0, w, h), w, h };
}

// Preprocess frame for YOLO input (resize, normalize, NHWC->NCHW)
function preprocess(imageData, inputSize = 640) {
  let src = cv.matFromImageData(imageData);
  let dst = new cv.Mat();
  cv.resize(src, dst, new cv.Size(inputSize, inputSize));
  // [H, W, C] -> [C, H, W] + normalize
  let input = [];
  for (let c = 0; c < 3; ++c) {
    for (let y = 0; y < inputSize; ++y) {
      for (let x = 0; x < inputSize; ++x) {
        input.push(dst.ucharPtr(y, x)[c] / 255.0);
      }
    }
  }
  src.delete(); dst.delete();
  return new ort.Tensor('float32', Float32Array.from(input), [1, 3, inputSize, inputSize]);
}

// Main detection routine
async function runDetectionOnCameraFrame(elementId) {
  await loadYoloModel();
  const frame = getCameraFrame(elementId);
  if (!frame) return [];

  const tensor = preprocess(frame.data);
  const results = await ortSession.run({ images: tensor });
  // Find actual output key (often output0, output, etc)
  let outputKey = Object.keys(results).find(k => k.startsWith("output"));
  if (!outputKey) throw new Error("No output tensor in model!");
  let output = results[outputKey].data;
  // Typical shape: [1, num_predictions, 84] -> flatten: [num_predictions, 84]
  const numClasses = COCO_CLASSES.length;
  const numPred = output.length / (5 + numClasses);
  let boxes = [];
  for (let i = 0; i < numPred; ++i) {
    const offset = i * (5 + numClasses);
    const x = output[offset];
    const y = output[offset+1];
    const w = output[offset+2];
    const h = output[offset+3];
    const objConf = output[offset+4];
    let maxConf = 0, maxClass = -1;
    // Find highest class score
    for (let c = 0; c < numClasses; ++c) {
      const conf = output[offset+5+c];
      if (conf > maxConf) {
        maxConf = conf; maxClass = c;
      }
    }
    const totalConf = objConf * maxConf;
    if (totalConf < 0.3) continue; // Threshold
    // Convert xywh [center] (0-1) to xyxy (pixel)
    let bx = [      (x - w/2) * frame.w,
      (y - h/2) * frame.h,
      (x + w/2) * frame.w,
      (y + h/2) * frame.h
    ];
    // Clamp
    bx = bx.map((v,i)=> i%2==0 ? Math.max(0,Math.min(frame.w,v)) : Math.max(0,Math.min(frame.h,v)));
    boxes.push({
      class: COCO_CLASSES[maxClass] || `cls${maxClass}`,
      confidence: totalConf,
      box: bx
    });
  }
  // Apply NMS (Non-maximum Suppression)
  return nms(boxes, 0.4);
}

// Simple NMS implementation
function nms(detections, nmsThreshold) {
  detections.sort((a, b) => b.confidence - a.confidence);
  const keep = [];
  for (let i = 0; i < detections.length; ++i) {
    let keepIt = true;
    for (let j = 0; j < keep.length; ++j) {
      if (iou(detections[i].box, keep[j].box) > nmsThreshold) {
        keepIt = false; break;
      }
    }
    if (keepIt) keep.push(detections[i]);
  }
  return keep;
}
function iou(boxA, boxB) {
  const [xA1, yA1, xA2, yA2] = boxA, [xB1, yB1, xB2, yB2] = boxB;
  const intX1 = Math.max(xA1, xB1), intY1 = Math.max(yA1, yB1);
  const intX2 = Math.min(xA2, xB2), intY2 = Math.min(yA2, yB2);
  const intW = Math.max(0, intX2 - intX1), intH = Math.max(0, intY2 - intY1);
  const intersection = intW * intH;
  const areaA = (xA2-xA1) * (yA2-yA1);
  const areaB = (xB2-xB1) * (yB2-yB1);
  return intersection / (areaA + areaB - intersection + 1e-6);
}

// Visualize detections on a canvas overlay
function drawDetections(detections, canvasId = "detectionCanvas") {
  let canvas = document.getElementById(canvasId);
  if (!canvas) return;
  let ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  detections.forEach(det => {
    ctx.strokeStyle = "#FF0000";
    ctx.lineWidth = 2;
    const [x1, y1, x2, y2] = det.box;
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    ctx.font = "16px Arial";
    ctx.fillStyle = "#FF0000";
    ctx.fillText(`${det.class} (${Math.round(det.confidence * 100)}%)`, x1, y1 - 4);
  });
}

// Main loop: detect and update UI
async function detectionLoop() {
  while (true) {
    try {
      const detections = await runDetectionOnCameraFrame("cameraFeed"); // or your video/img tag id
      drawDetections(detections);
      window.lastDetections = detections; // Export for dashboard integration
    } catch (e) {
      // Optionally log
    }
    await new Promise(resolve => setTimeout(resolve, 150)); // adjust rate as needed
  }
}

document.addEventListener("DOMContentLoaded", () => {
  detectionLoop();
});

// Estimate "distance" for obstacle (optional)
function getObstacleDistance(box, frameHeight) {
  const h = box[3] - box[1];
  if (h === 0) return 999;
  return Math.max(1, Math.round(3200 / h));
}