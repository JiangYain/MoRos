import type { CompassApi } from "@shared/types";

declare global {
  interface Window {
    compass: CompassApi;
  }
}

export const api: CompassApi = window.compass;
