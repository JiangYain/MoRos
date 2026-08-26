import {
  Folder,
  CircleDollarSign,
  Book,
  GraduationCap,
  Pencil,
  PenTool,
  Braces,
  SquareTerminal,
  Music,
  Cake,
  Paintbrush,
  Palette,
  Stethoscope,
  Asterisk,
  Flower2,
  Briefcase,
  BarChart3,
  Weight,
  Dumbbell,
  Notebook,
  Scale,
  Globe,
  Plane,
  Earth,
  Wrench,
  PawPrint,
  FlaskConical,
  Brain,
  Heart,
  Sprout,
  type LucideIcon,
} from "lucide-react";

export interface WorkspaceIconItem {
  id: string;
  icon: LucideIcon;
  name: string;
}

export interface WorkspaceColorItem {
  id: string;
  value: string;
  name: string;
}

export interface WorkspaceAppearance {
  iconId: string;
  colorId: string;
}

export const WORKSPACE_COLORS: WorkspaceColorItem[] = [
  { id: "black", value: "#1e1e1e", name: "Black" },
  { id: "red", value: "#ef4444", name: "Red" },
  { id: "orange", value: "#f97316", name: "Orange" },
  { id: "yellow", value: "#f59e0b", name: "Yellow" },
  { id: "green", value: "#10b981", name: "Green" },
  { id: "blue", value: "#0066ff", name: "Blue" },
  { id: "purple", value: "#8b5cf6", name: "Purple" },
  { id: "pink", value: "#ec4899", name: "Pink" },
];

export const WORKSPACE_ICONS: WorkspaceIconItem[] = [
  // Row 1
  { id: "folder", icon: Folder, name: "Folder" },
  { id: "dollar", icon: CircleDollarSign, name: "Dollar" },
  { id: "book", icon: Book, name: "Book" },
  { id: "education", icon: GraduationCap, name: "Graduation Cap" },
  { id: "pencil", icon: Pencil, name: "Pencil" },
  { id: "pen", icon: PenTool, name: "Pen Tool" },

  // Row 2
  { id: "braces", icon: Braces, name: "Code Braces" },
  { id: "terminal", icon: SquareTerminal, name: "Terminal" },
  { id: "music", icon: Music, name: "Music" },
  { id: "cake", icon: Cake, name: "Cake" },
  { id: "paintbrush", icon: Paintbrush, name: "Paintbrush" },
  { id: "palette", icon: Palette, name: "Palette" },

  // Row 3
  { id: "stethoscope", icon: Stethoscope, name: "Stethoscope" },
  { id: "asterisk", icon: Asterisk, name: "Asterisk" },
  { id: "flower", icon: Flower2, name: "Flower" },
  { id: "briefcase", icon: Briefcase, name: "Briefcase" },
  { id: "chart", icon: BarChart3, name: "Chart" },
  { id: "weight", icon: Weight, name: "Weight" },

  // Row 4
  { id: "dumbbell", icon: Dumbbell, name: "Dumbbell" },
  { id: "notebook", icon: Notebook, name: "Notebook" },
  { id: "scale", icon: Scale, name: "Scale" },
  { id: "globe", icon: Globe, name: "Globe" },
  { id: "plane", icon: Plane, name: "Plane" },
  { id: "earth", icon: Earth, name: "Earth" },

  // Row 5
  { id: "wrench", icon: Wrench, name: "Wrench" },
  { id: "paw", icon: PawPrint, name: "Paw Print" },
  { id: "flask", icon: FlaskConical, name: "Flask" },
  { id: "brain", icon: Brain, name: "Brain" },
  { id: "heart", icon: Heart, name: "Heart" },
  { id: "sprout", icon: Sprout, name: "Sprout" },
];

export const WORKSPACE_ICON_MAP = new Map<string, LucideIcon>(
  WORKSPACE_ICONS.map((item) => [item.id, item.icon]),
);

export const WORKSPACE_COLOR_MAP = new Map<string, string>(
  WORKSPACE_COLORS.map((item) => [item.id, item.value]),
);

export function isWorkspaceAppearance(value: unknown): value is WorkspaceAppearance {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as { iconId?: unknown; colorId?: unknown };
  return typeof candidate.iconId === "string"
    && WORKSPACE_ICON_MAP.has(candidate.iconId)
    && typeof candidate.colorId === "string"
    && WORKSPACE_COLOR_MAP.has(candidate.colorId);
}
