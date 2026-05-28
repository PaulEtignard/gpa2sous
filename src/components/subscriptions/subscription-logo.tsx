"use client";

import { useState } from "react";

function nameToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 55%, 28%)`;
}

export function SubscriptionLogo({
  logoUrl,
  name,
  size = 40,
}: {
  logoUrl: string | null;
  name: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const initial = (name.trim().charAt(0) || "?").toUpperCase();
  const bg = nameToColor(name);

  if (logoUrl && !failed) {
    return (
      <img
        src={logoUrl}
        alt={name}
        width={size}
        height={size}
        className="shrink-0 rounded-lg object-contain"
        style={{ width: size, height: size, background: "rgba(255,255,255,0.04)" }}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
      style={{ width: size, height: size, background: bg }}
    >
      {initial}
    </div>
  );
}
