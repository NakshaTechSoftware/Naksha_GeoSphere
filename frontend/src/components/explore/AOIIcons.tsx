import type { SVGProps } from "react";

// Simple custom icons for the "Draw AOI" dropdown, styled to match the lucide-react icons
// used elsewhere in the search bar (24x24 viewBox, stroke-based, rounded caps/joins).

export function FreeHandIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M4 14c1-3 2-5 4-6s3 1 4 3 2 4 4 3 2-4 3-6" />
      <path d="M4 14c0 2 1.5 4 4 4.5" />
      <circle cx="19" cy="8" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function PolygonIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M9 3.5 3.5 8l1.5 8 6 4.5 7-3 1.5-8-5-5.5Z" />
    </svg>
  );
}

export function RectangleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="3.5" y="6" width="17" height="12" rx="1" />
    </svg>
  );
}

// Default "Draw AOI" button icon (before a tool is picked): a plain rounded-corner square
// with a pencil laid diagonally across its top-right corner, tip pointing in toward the
// square's center. Uses currentColor throughout so it inherits whatever text color the
// button is styled with.
export function DrawAOIIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="3" y="3" width="14" height="14" rx="3.5" />
      <path
        d="M20.78 2.78 19.22 1.22 12.99 7.45 12 10 14.55 9.01Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinejoin="round"
      />
      <line x1="14.55" y1="9.01" x2="12.99" y2="7.45" strokeWidth={1} />
    </svg>
  );
}

// Mobile "Tools" menu button icon: a 2x2 grid of rounded squares with the
// top-right one rotated 45deg, matching the app's widgets/apps launcher glyph.
export function ToolsGridIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
      <rect x="13" y="13" width="8" height="8" rx="2" />
      <rect x="14.5" y="3.6" width="8" height="8" rx="2" transform="rotate(45 18.5 7.6)" />
    </svg>
  );
}
