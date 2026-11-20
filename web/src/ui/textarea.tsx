import * as React from 'react';
import { cn } from '@/lib/utils';
import { FIELD } from '@/shared/designTokens';

/** Standalone multiline field. Framed composers keep their own input surface. */
export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea data-slot="textarea" className={cn(
    FIELD.base,
    'w-full min-w-0 resize-y px-2.5 py-2 text-[13px] leading-[1.45] transition-[color,background-color,border-color] outline-none',
    className,
  )} {...props} />;
}
