import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export function SimpleAccordion({ 
  title, 
  summary, 
  children, 
  defaultOpen = false 
}: { 
  title: React.ReactNode, 
  summary?: React.ReactNode, 
  children: React.ReactNode, 
  defaultOpen?: boolean 
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-border/50 rounded-xl overflow-hidden mb-3 bg-card shadow-sm">
        <button 
            onClick={() => setIsOpen(!isOpen)}
            className="w-full flex items-center justify-between p-4 bg-accent/20 hover:bg-accent/40 transition-colors text-left"
        >
            <div className="flex items-center gap-3 w-full pr-4">
                {isOpen ? <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" /> : <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />}
                <div className="flex-1 w-full flex items-center justify-between min-w-0">
                    {title}
                    {summary && <div className="text-right shrink-0">{summary}</div>}
                </div>
            </div>
        </button>
        {isOpen && (
            <div className="border-t border-border/50 bg-card">
                {children}
            </div>
        )}
    </div>
  );
}
