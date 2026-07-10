import type { PermissionMode } from "@shared/types";
import { Bot, Hand, ShieldAlert } from "lucide-react";

export interface PermissionOption {
  id: PermissionMode;
  label: string;
  description: string;
  icon: typeof Hand;
}

export const PERMISSION_OPTIONS: PermissionOption[] = [
  {
    id: "ask",
    label: "Ask for approval",
    description: "Ask before shell commands, external edits, or dynamic tools",
    icon: Hand,
  },
  {
    id: "approve",
    label: "Approve for me",
    description: "Automatically allow actions that are provably read-only",
    icon: Bot,
  },
  {
    id: "full",
    label: "Full access",
    description: "Unrestricted access to the internet and files on your computer",
    icon: ShieldAlert,
  },
];
