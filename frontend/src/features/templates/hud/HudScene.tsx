import { useId } from "react";
import styles from "./HudPortfolio.module.css";

export function HudScene({ showGlobe }: { showGlobe: boolean }) {
  const id = useId();

  return (
    <svg
      className={styles.scene}
      viewBox="0 0 1100 560"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      focusable="false"
    >
      <defs>
        <radialGradient id={"hud-surface-" + id} cx="32%" cy="6%" r="86%">
          <stop stopColor="#386071" />
          <stop offset="0.14" stopColor="#183846" />
          <stop offset="0.44" stopColor="#0b202c" />
          <stop offset="1" stopColor="#030a10" />
        </radialGradient>
        <linearGradient id={"hud-horizon-" + id} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#b3e5f4" stopOpacity="0.9" />
          <stop offset="0.42" stopColor="#568294" stopOpacity="0.5" />
          <stop offset="1" stopColor="#223a47" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={"hud-shadow-" + id} cx="90%" cy="88%" r="80%">
          <stop stopColor="#02070c" />
          <stop offset="0.65" stopColor="#02070c" stopOpacity="0.86" />
          <stop offset="1" stopColor="#02070c" stopOpacity="0" />
        </radialGradient>
        <pattern id={"hud-lights-" + id} width="31" height="29" patternUnits="userSpaceOnUse">
          <circle cx="5" cy="8" r="0.8" fill="#b1ccd1" opacity="0.6" />
          <circle cx="21" cy="17" r="0.6" fill="#6e9faf" opacity="0.45" />
        </pattern>
        <clipPath id={"hud-globe-" + id}>
          <circle cx="942" cy="650" r="497" />
        </clipPath>
      </defs>
      {showGlobe && (
        <g>
          <circle
            cx="942"
            cy="650"
            r="505"
            fill="none"
            stroke="#41677c"
            opacity="0.16"
            strokeWidth="10"
          />
          <circle cx="942" cy="650" r="499" fill={"url(#hud-surface-" + id + ")"} />
          <g clipPath={"url(#hud-globe-" + id + ")"}>
            <path
              d="M494 335 530 294 579 271 611 288 637 327 676 332 689 360 739 368 773 417 742 446 694 439 650 475 598 462 583 416 544 396Z M789 211 854 195 911 222 933 269 973 285 992 339 966 374 938 359 905 390 877 377 867 322 824 298 813 257Z"
              fill={"url(#hud-lights-" + id + ")"}
            />
            <g stroke="#4b6d7c" fill="none" opacity="0.2">
              <ellipse cx="930" cy="655" rx="508" ry="340" transform="rotate(-25 930 655)" />
              <ellipse cx="930" cy="655" rx="508" ry="230" transform="rotate(-25 930 655)" />
              <ellipse cx="930" cy="655" rx="165" ry="502" transform="rotate(23 930 655)" />
              <ellipse cx="930" cy="655" rx="310" ry="502" transform="rotate(23 930 655)" />
            </g>
          </g>
          <circle
            cx="942"
            cy="650"
            r="499"
            fill="none"
            stroke={"url(#hud-horizon-" + id + ")"}
            strokeWidth="2"
          />
          <circle cx="942" cy="650" r="498" fill={"url(#hud-shadow-" + id + ")"} />
        </g>
      )}
      <g className={styles.orbitLines} fill="none" stroke="#689caf" strokeWidth="0.75">
        <ellipse cx="775" cy="301" rx="220" ry="230" transform="rotate(30 775 301)" opacity="0.3" />
        <ellipse
          cx="775"
          cy="301"
          rx="264"
          ry="248"
          transform="rotate(-23 775 301)"
          opacity="0.22"
        />
        <path
          d="M575 191A236 236 0 0 1 923 95M937 414A236 236 0 0 1 663 506"
          stroke="#94d8ec"
          opacity="0.65"
        />
        <path d="M630 108 922 496M504 339H1062M782 38V526" opacity="0.2" />
        <circle cx="775" cy="301" r="180" strokeDasharray="2 11" opacity="0.25" />
      </g>
      <g stroke="#91d5e6" strokeWidth="1" fill="none">
        <path d="M560 156h12m-6-6v12M993 455h14m-7-7v14M940 111h8m-4-4v8" opacity="0.75" />
        <path d="M1054 86h18v36M1054 86v8M1040 482h32v-20" opacity="0.38" />
        <circle cx="607" cy="144" r="2" fill="#94d8ec" stroke="none" />
        <circle cx="941" cy="455" r="2" fill="#94d8ec" stroke="none" />
      </g>
    </svg>
  );
}
