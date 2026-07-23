import React from 'react';
import { X } from 'lucide-react';

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}

export default function Modal({ title, onClose, children, wide }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className={`w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} bg-darkCard border border-darkBorder rounded-2xl shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]`}>
        <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-accentCyan to-accentBlue" />
        <div className="flex items-center justify-between p-5 border-b border-darkBorder">
          <h3 className="text-base font-bold text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}
