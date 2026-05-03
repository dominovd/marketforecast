import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          background: '#0f172a',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {/* Trend line as SVG path */}
        <svg width="22" height="22" viewBox="0 0 22 22">
          {/* Grid dots */}
          <circle cx="3" cy="16" r="1.5" fill="#334155" />
          <circle cx="8" cy="12" r="1.5" fill="#334155" />
          <circle cx="13" cy="8" r="1.5" fill="#334155" />
          <circle cx="19" cy="4" r="1.5" fill="#334155" />
          {/* Upward trend line */}
          <polyline
            points="3,16 8,12 13,8 19,4"
            fill="none"
            stroke="#22d3ee"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Arrow head */}
          <polyline
            points="15,3 19,4 18,8"
            fill="none"
            stroke="#22d3ee"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}
