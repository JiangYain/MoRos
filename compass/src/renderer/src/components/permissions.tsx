import type { PermissionMode } from "@shared/types";
import { Bot, Hand, ShieldAlert } from "lucide-react";

export interface PermissionOption {
  id: PermissionMode;
  icon: typeof Hand;
}

export const PERMISSION_OPTIONS: PermissionOption[] = [
  {
    id: "ask",
    icon: Hand,
  },
  {
    id: "approve",
    icon: Bot,
  },
  {
    id: "full",
    icon: ShieldAlert,
  },
];
