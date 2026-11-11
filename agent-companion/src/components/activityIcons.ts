import {
  BookOpen,
  CircleCheck,
  Code,
  FlaskConical,
  Globe,
  Hand,
  ListChecks,
  Moon,
  Search,
  Terminal,
  TriangleAlert,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { AgentActivity } from '../types';

/** ไอคอนประจำ activity (ใช้ใน HUD เหนือหัว, แผงรายละเอียด, ตาราง, simulator) */
export const ACTIVITY_ICON: Record<AgentActivity, LucideIcon> = {
  idle: Moon,
  planning: ListChecks,
  reading: BookOpen,
  searching: Search,
  web: Globe,
  writing: Code,
  running: Terminal,
  testing: FlaskConical,
  delegating: Users,
  waiting: Hand,
  done: CircleCheck,
  failed: TriangleAlert,
};
