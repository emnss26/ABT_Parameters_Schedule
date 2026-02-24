import React from "react";

const AbitatLogoLoader = ({ className = "" }) => (
  <div className={`flex flex-col items-center justify-center gap-4 ${className}`}>
    <div className="relative h-24 w-20">
      <svg
        viewBox="0 0 100 140"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full"
      >
        <style>{`
          .abitat-line {
            stroke-width: 9;
            stroke-linecap: square;
            stroke-linejoin: miter;
            fill: none;
            opacity: 0;
            stroke-dasharray: 200;
            stroke-dashoffset: 200;
            animation: drawLine 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
          }
          .line-red {
            stroke: #B93D49;
            animation-delay: 0s;
          }
          .line-gray {
            stroke: #4A4F54;
            animation-delay: 0.4s;
          }
          @keyframes drawLine {
            0% { stroke-dashoffset: 200; opacity: 0; }
            10% { opacity: 1; }
            50% { stroke-dashoffset: 0; opacity: 1; }
            90% { stroke-dashoffset: -200; opacity: 0; }
            100% { stroke-dashoffset: -200; opacity: 0; }
          }
        `}</style>

        <path className="abitat-line line-red" d="M50 25 L90 50 L50 75 L10 50 Z" />
        <path className="abitat-line line-gray" d="M50 55 L90 80 L50 105 L10 80 Z" />
      </svg>
    </div>

    <div className="flex flex-col items-center animate-pulse">
      <h1 className="text-3xl font-bold leading-none tracking-wider text-[#4A4F54]">
        AB<span className="text-[#B93D49]">I</span>TAT
      </h1>
      <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.25em] text-[#4A4F54]">
        Construction Solutions
      </span>
    </div>
  </div>
);

export default AbitatLogoLoader;
