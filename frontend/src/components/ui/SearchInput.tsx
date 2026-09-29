import React from "react";
import { Search } from "lucide-react";

interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onSearch?: (value: string) => void;
}

export default function SearchInput({ className = "", ...props }: SearchInputProps) {
  return (
    <div className="relative">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-soft pointer-events-none" />
      <input
        type="search"
        className={`w-full pl-9 pr-3 py-2 rounded-lg border border-line bg-white text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition placeholder:text-gray-soft ${className}`}
        {...props}
      />
    </div>
  );
}
