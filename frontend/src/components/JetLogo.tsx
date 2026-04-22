import React from "react";

interface JetLogoProps {
  className?: string;
}

export const JetLogo: React.FC<JetLogoProps> = ({ className = "w-8 h-8" }) => (
  <svg
    viewBox="0 0 120 120"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* The energetic wrap-around swoop trail */}
    <path
      d="M26.2 88.3C18.1 76.5 24.3 54.4 39.7 44.8C55.1 35.2 68.6 42.4 68.6 42.4"
      stroke="#F97316"
      strokeWidth="6"
      strokeLinecap="round"
      className="drop-shadow-sm"
    />
    <path
      d="M34.8 95.7C48.6 103.8 82.2 96.3 95.8 82.5"
      stroke="#EA580C"
      strokeWidth="5"
      strokeLinecap="round"
    />
    
    {/* The Jet Body */}
    <path
      d="M36 68L78 28C84 22 92 18 96 16C94 20 88 28 82 34L42 74C38 78 32 72 36 68Z"
      fill="#F97316"
    />
    
    {/* Inner cockpit / highlight */}
    <path
      d="M78 28C83 23 88 20 92 18L76 34C74 36 78 28 78 28Z"
      fill="#FFEDD5"
    />

    {/* Left Wings */}
    <path
      d="M36 68L18 64L32 54Z"
      fill="#F97316"
    />
    <path
      d="M45 59L26 50L44 43Z"
      fill="#F97316"
    />

    {/* Right Wings */}
    <path
      d="M42 74L54 86L62 66Z"
      fill="#EA580C"
    />
    <path
      d="M58 58L72 68L76 50Z"
      fill="#EA580C"
    />
  </svg>
);

export default JetLogo;
