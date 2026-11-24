import React from 'react';

export function CoinIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#E8B34A" stroke="#0E1418" strokeWidth="2" />
      <circle cx="12" cy="12" r="7.4" fill="none" stroke="#B97F22" strokeWidth="1.2" />
      <rect x="9.3" y="9.3" width="5.4" height="5.4" fill="#0E1418" />
      <path d="M7.5 6.5 A7 7 0 0 1 15.5 5.6" fill="none" stroke="#FAF6EA" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function JadeGemIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <polygon
        points="12,2 20,12 12,22 4,12"
        fill="#57B96A"
        stroke="#0E1418"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <polygon points="12,4.5 16.5,11 12,13 7.5,11" fill="#8FD694" />
      <polygon points="12,13 16.5,11 12,19.5" fill="#3D8A4E" />
    </svg>
  );
}

export function LanternIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <line x1="12" y1="2" x2="12" y2="5" stroke="#0E1418" strokeWidth="2" strokeLinecap="round" />
      <rect x="8" y="4.5" width="8" height="2.4" rx="1" fill="#0E1418" />
      <rect x="6.5" y="6.8" width="11" height="11" rx="3" fill="#E8B34A" stroke="#0E1418" strokeWidth="1.8" />
      <ellipse cx="12" cy="12.3" rx="2.6" ry="3.8" fill="#FAF6EA" />
      <rect x="8.5" y="17.8" width="7" height="2.4" rx="1" fill="#0E1418" />
    </svg>
  );
}

export function OperaMaskIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M5 6 C5 3.5, 19 3.5, 19 6 L19 13 C19 18, 15.5 21, 12 21 C8.5 21, 5 18, 5 13 Z"
        fill="#EDE6D6"
        stroke="#0E1418"
        strokeWidth="2"
      />
      <path d="M12 4.5 L12 20.5" stroke="#5C6B6B" strokeWidth="1.2" />
      <path d="M7.5 10.5 Q9.2 9 10.8 10.5" fill="none" stroke="#0E1418" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M13.2 10.5 Q14.8 9 16.5 10.5" fill="none" stroke="#0E1418" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9.5 16 Q12 17.5 14.5 16" fill="none" stroke="#0E1418" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function VolumeIcon({ muted, className = 'w-4 h-4' }: { muted: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
      {muted ? (
        <>
          <line x1="22" y1="9" x2="16" y2="15" />
          <line x1="16" y1="9" x2="22" y2="15" />
        </>
      ) : (
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18.8 5.5a9.2 9.2 0 0 1 0 13" />
        </>
      )}
    </svg>
  );
}

export function PauseIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <rect x="6" y="4" width="4.5" height="16" rx="1" />
      <rect x="13.5" y="4" width="4.5" height="16" rx="1" />
    </svg>
  );
}

/** Bespoke Chinese Ink-Wash Title Emblem Lockup for the Title Screen */
export function InkNightTitleEmblem() {
  return (
    <svg
      viewBox="0 0 420 170"
      className="w-full max-w-[390px] h-auto overflow-visible"
      role="img"
      aria-label="墨夜提灯 Ink-Night"
    >
      {/* Subtle ink brush stroke wash behind title */}
      <path
        d="M14 96 C68 62, 188 54, 336 74 C372 79, 396 92, 408 104 C346 112, 168 122, 34 114 Z"
        fill="#0E1418"
        opacity="0.72"
      />
      {/* Traditional vermilion seal stamp (守夜) */}
      <g transform="translate(342, 30)">
        <rect
          x="0"
          y="0"
          width="38"
          height="38"
          rx="4"
          fill="#C8402A"
          stroke="#7C1E10"
          strokeWidth="2"
        />
        <rect
          x="3"
          y="3"
          width="32"
          height="32"
          rx="2"
          fill="none"
          stroke="#FAF6EA"
          strokeWidth="1"
          opacity="0.75"
        />
        <text
          x="19"
          y="17"
          textAnchor="middle"
          fill="#FAF6EA"
          fontSize="12"
          fontFamily='"Noto Serif SC", serif'
          fontWeight="700"
        >
          守
        </text>
        <text
          x="19"
          y="31"
          textAnchor="middle"
          fill="#FAF6EA"
          fontSize="12"
          fontFamily='"Noto Serif SC", serif'
          fontWeight="700"
        >
          夜
        </text>
      </g>

      {/* Hanging mini lantern glyph integrated on left */}
      <g transform="translate(18, 28)">
        <line x1="16" y1="0" x2="16" y2="14" stroke="#B9B09A" strokeWidth="2" />
        <rect x="9" y="13" width="14" height="3.5" rx="1" fill="#1C2A30" stroke="#06090B" strokeWidth="1" />
        <rect x="6" y="17" width="20" height="26" rx="6" fill="#E8B34A" stroke="#06090B" strokeWidth="2" />
        <ellipse cx="16" cy="30" rx="5" ry="8" fill="#FAF6EA" opacity="0.88" />
        <rect x="10" y="43" width="12" height="3.5" rx="1" fill="#1C2A30" stroke="#06090B" strokeWidth="1" />
        <line x1="16" y1="47" x2="16" y2="62" stroke="#E8B34A" strokeWidth="1.8" strokeDasharray="2 2" />
      </g>

      {/* Main Calligraphic Chinese Title */}
      <text
        x="52"
        y="94"
        fill="#FAF6EA"
        stroke="#06090B"
        strokeWidth="6"
        paintOrder="stroke fill"
        fontSize="68"
        fontFamily='"Ma Shan Zheng", "Noto Serif SC", serif'
        letterSpacing="8"
      >
        墨夜提灯
      </text>

      {/* Subtle warm horizontal brush hairline */}
      <line x1="54" y1="114" x2="332" y2="114" stroke="#E8B34A" strokeWidth="1.6" opacity="0.72" />

      {/* Subtitle English Lockup */}
      <text
        x="54"
        y="140"
        fill="#B9B09A"
        stroke="#06090B"
        strokeWidth="3"
        paintOrder="stroke fill"
        fontSize="16"
        fontFamily='"Cinzel", serif'
        fontWeight="600"
        letterSpacing="5.5"
      >
        INK-NIGHT · TWO REALMS
      </text>
    </svg>
  );
}
