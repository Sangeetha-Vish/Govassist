import { useState, useEffect } from 'react';
import './MatchRing.css';

/**
 * Reusable animated Circular Match Ring
 * @param {number} score - 0 to 100
 * @param {number} size - pixel diameter (default 64)
 * @param {number} strokeWidth - stroke thickness (default 6)
 * @param {boolean} showLabel - display "Match Meter" sublabel
 */
export default function MatchRing({ score = 0, size = 64, strokeWidth = 6, showLabel = true }) {
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    let start = 0;
    const target = Math.min(100, Math.max(0, Number(score) || 0));
    if (target === 0) {
      setAnimatedScore(0);
      return;
    }
    const duration = 800; // ms
    const startTime = performance.now();

    const step = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedScore(Math.round(eased * target));

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };

    requestAnimationFrame(step);
  }, [score]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (animatedScore / 100) * circumference;

  // Determine dynamic ring color based on match strength
  let strokeColor = 'var(--ga-emerald-base)'; // >= 80%
  if (animatedScore < 50) {
    strokeColor = 'var(--ga-crimson-base)';
  } else if (animatedScore < 80) {
    strokeColor = 'var(--ga-amber-base)';
  }

  return (
    <div className="match-ring-wrapper" style={{ width: size }}>
      <div className="match-ring-container" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="match-ring-svg">
          {/* Background Track */}
          <circle
            className="match-ring-track"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
          />
          {/* Animated Value Arc */}
          <circle
            className="match-ring-fill"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            stroke={strokeColor}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <div className="match-ring-center">
          <span className="match-ring-value" style={{ fontSize: `${Math.max(12, Math.round(size * 0.24))}px` }}>
            {animatedScore}%
          </span>
        </div>
      </div>
      {showLabel && <span className="match-ring-label">Match Meter</span>}
    </div>
  );
}
