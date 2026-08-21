import { cn } from '../../lib/utils.js';

function Card({ className, ...props }) {
  return <section className={cn('rounded-lg border border-[#e9e7ec] bg-white shadow-[0_3px_8px_rgba(31,25,41,0.08)]', className)} {...props} />;
}

function CardHeader({ className, ...props }) {
  return <div className={cn('p-4 pb-0', className)} {...props} />;
}

function CardContent({ className, ...props }) {
  return <div className={cn('p-4', className)} {...props} />;
}

export { Card, CardHeader, CardContent };
