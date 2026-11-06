"use client";

import {
  FilesetResolver,
  PoseLandmarker,
  type PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";

const WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

let landmarkerPromise: Promise<PoseLandmarker> | null = null;

/** Lazy singleton — model + WASM load once per tab (from Google/jsDelivr CDN). */
export function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
      try {
        return await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
        });
      } catch {
        // Some devices reject GPU — fall back to CPU.
        return PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
        });
      }
    })().catch((err) => {
      landmarkerPromise = null;
      throw err;
    });
  }
  return landmarkerPromise;
}

export type { PoseLandmarkerResult };
