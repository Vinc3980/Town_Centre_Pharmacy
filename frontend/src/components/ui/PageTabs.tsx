import React from "react";

interface Tab {
  label: string;
  value: string;
}

interface PageTabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (value: string) => void;
}

export default function PageTabs({ tabs, activeTab, onChange }: PageTabsProps) {
  return (
    <div className="flex gap-0 border-b border-line">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={`px-4 py-3 text-[12.5px] font-semibold border-b-2 transition ${
            activeTab === tab.value
              ? "text-blue-600 border-blue-600"
              : "text-gray-soft border-transparent hover:text-navy"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
