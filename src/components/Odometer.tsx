import React from 'react';

export type AnimStyle = 'default' | 'bounce' | 'machine';

interface OdometerDigitProps {
  value: number;
  fontSize: number;
  duration: number;
  color: string;
  bgColor: string;
  fontFamily: string;
  animStyle: AnimStyle;
  spinCycles?: number;
  noTransition?: boolean;
}

export function OdometerDigit({
  value,
  fontSize,
  duration,
  color,
  fontFamily,
  animStyle,
  spinCycles = 0,
  noTransition = false,
}: OdometerDigitProps) {
  const digitHeight = fontSize * 1.35;
  const digitWidth = fontSize * 0.7;
  const totalSlots = 10 * (spinCycles + 1);
  const targetPos = spinCycles * 10 + value;

  return (
    <div
      className="odometer-digit"
      style={
        {
          height: digitHeight,
          width: digitWidth,
        } as React.CSSProperties
      }
    >
      <div
        className={`odometer-strip style-${animStyle}`}
        style={{
          transform: `translateY(${-targetPos * digitHeight}px)`,
          transitionDuration: noTransition ? '0ms' : `${duration}ms`,
          transitionProperty: noTransition ? 'none' : 'transform',
        }}
      >
        {Array.from({ length: totalSlots }, (_, i) => (
          <div
            key={i}
            className="flex items-center justify-center font-bold select-none"
            style={{
              height: digitHeight,
              fontSize,
              color,
              fontFamily,
              textShadow: '0 2px 12px rgba(0,0,0,0.5)',
            }}
          >
            {i % 10}
          </div>
        ))}
      </div>
    </div>
  );
}

interface OdometerGroupProps {
  value: string;
  fontSize: number;
  duration: number;
  color: string;
  bgColor: string;
  fontFamily: string;
  animStyle: AnimStyle;
  staggerDelay: number;
  spinCycles?: number;
  noTransition?: boolean;
}

export function OdometerGroup({
  value,
  fontSize,
  duration,
  color,
  bgColor,
  fontFamily,
  animStyle,
  staggerDelay,
  spinCycles = 0,
  noTransition = false,
}: OdometerGroupProps) {
  const digitHeight = fontSize * 1.35;

  return (
    <div className="flex items-center" style={{ gap: fontSize * 0.06 }}>
      {value.split('').map((char, i) => {
        if (char === ':' || char === '.' || char === '\'' || char === '"') {
          return (
            <span
              key={`sep-${i}`}
              className="font-bold"
              style={{
                fontSize: fontSize * 0.9,
                color,
                fontFamily,
                lineHeight: `${digitHeight}px`,
                margin: `0 ${fontSize * 0.02}px`,
                textShadow: '0 2px 12px rgba(0,0,0,0.5)',
              }}
            >
              {char}
            </span>
          );
        }
        const digit = parseInt(char);
        if (isNaN(digit)) return null;
        return (
          <OdometerDigit
            key={`d-${i}`}
            value={digit}
            fontSize={fontSize}
            duration={duration + i * staggerDelay}
            color={color}
            bgColor={bgColor}
            fontFamily={fontFamily}
            animStyle={animStyle}
            spinCycles={spinCycles}
            noTransition={noTransition}
          />
        );
      })}
    </div>
  );
}
