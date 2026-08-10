import { cn } from "@/lib/utils";

/**
 * Logo vectorial fiel a la identidad Pamela Guerrero
 * (Pamela en verde, Guerrero en rosa, hojas + marco).
 */
export function BrandLogo({
  className,
  markOnly = false,
  inverted = false,
}: {
  className?: string;
  markOnly?: boolean;
  inverted?: boolean;
}) {
  const green = inverted ? "#F4F9EC" : "#879E46";
  const pink = inverted ? "#FFFFFF" : "#E57B87";

  if (markOnly) {
    return (
      <svg
        viewBox="0 0 48 48"
        className={cn("h-10 w-10", className)}
        aria-hidden
      >
        <path
          d="M18 28c0-8 4-14 10-16 1 6-1 12-6 16-2 1.5-3 2-4 2z"
          fill={green}
        />
        <path
          d="M28 14c4 2 7 7 7 13 0 2-1 3-2 3-4-3-6-8-5-16z"
          fill={green}
          opacity="0.85"
        />
        <path
          d="M24 28v10"
          stroke={green}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 420 90"
      className={cn("h-10 w-auto", className)}
      role="img"
      aria-label="Pamela Guerrero"
    >
      <path
        d="M28 22c-1-10 8-18 18-20 0 9-4 17-12 22-3 2-5 2-6-2z"
        fill={green}
      />
      <path
        d="M44 8c8 1 14 9 14 17 0 2-1 4-3 4-6-4-10-11-11-21z"
        fill={green}
        opacity="0.9"
      />
      <path
        d="M18 34h34M18 34v34h0M18 68h118"
        fill="none"
        stroke={green}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <text
        x="28"
        y="60"
        fontFamily="Poppins, system-ui, sans-serif"
        fontSize="34"
        fontWeight="700"
        fill={green}
      >
        Pamela
      </text>
      <text
        x="168"
        y="60"
        fontFamily="Poppins, system-ui, sans-serif"
        fontSize="34"
        fontWeight="700"
        fill={pink}
      >
        Guerrero
      </text>
    </svg>
  );
}

export function BrandMark({
  className,
  inverted = false,
}: {
  className?: string;
  inverted?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-11 w-11 items-center justify-center rounded-2xl",
        inverted ? "bg-white/20" : "bg-[var(--sage-soft)]",
        className
      )}
    >
      <BrandLogo markOnly inverted={inverted} className="h-7 w-7" />
    </div>
  );
}

export function BrandAvatar({
  className,
  size = 44,
}: {
  className?: string;
  size?: number;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/pamela-avatar.svg"
      alt="Pamela Guerrero"
      width={size}
      height={size}
      className={cn("rounded-full object-cover ring-2 ring-white/70", className)}
    />
  );
}
