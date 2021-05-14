import * as c from '@aws-accelerator/config';
import { getTypeTree } from '@/types';

export const type = c.AcceleratorConfigType;
export const root = getTypeTree(type);
