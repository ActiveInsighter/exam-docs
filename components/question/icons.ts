'use client';

import {
  BookOpenIcon as BookOpen,
  CheckCheckIcon as CheckCheck,
  CheckIcon as Check,
  CircleAlertIcon as CircleAlert,
  CircleCheckIcon as CircleCheck,
  CircleXIcon as CircleX,
  GavelIcon as Gavel,
  NotebookPenIcon as NotebookPen,
  RotateCcwIcon as RotateCcw,
  StarIcon as Star,
  TagIcon as Tag,
  XIcon as X,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { BookOpenIcon as BookOpenMoving } from '@/components/animate-ui/icons/book-open';
import { CheckCheckIcon as CheckCheckMoving } from '@/components/animate-ui/icons/check-check';
import { CheckIcon as CheckMoving } from '@/components/animate-ui/icons/check';
import { CircleAlertIcon as CircleAlertMoving } from '@/components/animate-ui/icons/circle-alert';
import { CircleCheckIcon as CircleCheckMoving } from '@/components/animate-ui/icons/circle-check';
import { CircleXIcon as CircleXMoving } from '@/components/animate-ui/icons/circle-x';
import { GavelIcon as GavelMoving } from '@/components/animate-ui/icons/gavel';
import { NotebookPenIcon as NotebookPenMoving } from '@/components/animate-ui/icons/notebook-pen';
import { RotateCcwIcon as RotateCcwMoving } from '@/components/animate-ui/icons/rotate-ccw';
import { StarIcon as StarMoving } from '@/components/animate-ui/icons/star';
import { TagIcon as TagMoving } from '@/components/animate-ui/icons/tag';
import { XIcon as XMoving } from '@/components/animate-ui/icons/x';
import { liveIcon, type LiveIconProps } from './live';

/*
 * The icons of the question components: Animate UI's animated Lucide icons
 * (components/animate-ui/icons) where the card is live, the Lucide icons
 * they were drawn from elsewhere (live.tsx). Same drawing either way.
 */

const moving = (icon: unknown) => icon as ComponentType<LiveIconProps>;

export const BookOpenIcon = liveIcon(BookOpen, moving(BookOpenMoving));
export const CheckCheckIcon = liveIcon(CheckCheck, moving(CheckCheckMoving));
export const CheckIcon = liveIcon(Check, moving(CheckMoving));
export const CircleAlertIcon = liveIcon(CircleAlert, moving(CircleAlertMoving));
export const CircleCheckIcon = liveIcon(CircleCheck, moving(CircleCheckMoving));
export const CircleXIcon = liveIcon(CircleX, moving(CircleXMoving));
export const GavelIcon = liveIcon(Gavel, moving(GavelMoving));
export const NotebookPenIcon = liveIcon(NotebookPen, moving(NotebookPenMoving));
export const RotateCcwIcon = liveIcon(RotateCcw, moving(RotateCcwMoving));
export const StarIcon = liveIcon(Star, moving(StarMoving));
export const TagIcon = liveIcon(Tag, moving(TagMoving));
export const XIcon = liveIcon(X, moving(XMoving));
