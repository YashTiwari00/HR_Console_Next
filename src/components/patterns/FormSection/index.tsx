import { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/src/lib/cn';
import Divider from '@/src/components/ui/Divider';

export interface FormSectionProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  divider?: boolean;
}

export default function FormSection({
  title,
  description,
  divider = false,
  className,
  children,
  ...props
}: FormSectionProps) {
  return (
    <div className={cn('flex flex-col gap-4', className)} {...props}>
      {divider && <Divider />}

      <div className="grid gap-4 md:grid-cols-[240px_1fr]">
        {/* Label column */}
        <div className="flex flex-col gap-1">
          <h3 className="heading-lg text-[var(--color-text)]">{title}</h3>
          {description && (
            <p className="caption">{description}</p>
          )}
        </div>

        {/* Content column */}
        <div className="flex flex-col gap-4">{children}</div>
      </div>
    </div>
  );
}
