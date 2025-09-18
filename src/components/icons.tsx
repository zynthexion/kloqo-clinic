import type { SVGProps } from "react";

export function PeterdrawLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgb(192, 38, 211)" />
          <stop offset="100%" stopColor="rgb(139, 92, 246)" />
        </linearGradient>
      </defs>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zM8.5 7H12c1.933 0 3.5 1.567 3.5 3.5S13.933 14 12 14h-1.5v3.5h-2V7h-2V5h4v2zM12 12H8.5V9H12c.552 0 1 .448 1 1s-.448 1-1 1z"
        fill="url(#grad1)"
      />
    </svg>
  );
}