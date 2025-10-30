import { Calendar } from "lucide-react";
import { Sparkles } from "lucide-react";

export default function Logo({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <div className="relative inline-flex items-center justify-center">
      <Calendar className={`${className} text-primary`} />
      <Sparkles 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-3 w-3 text-yellow-500" 
        fill="currentColor"
        strokeWidth={2}
      />
    </div>
  );
}
