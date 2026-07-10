import type { CompassApi } from "@shared/types";
import { createWebApi } from "./web-api";

declare global {
  interface Window {
    compass?: CompassApi;
  }
}

export const isDesktop = Boolean(window.compass);
export const api: CompassApi = window.compass ?? createWebApi();
