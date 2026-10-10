"use client";

import { useState } from "react";
import {
  Briefcase,
  Cloud,
  Code,
  Database,
  Globe,
  Layers,
  Link,
  Mail,
  Network,
  Palette,
  Phone,
  Shield,
  Terminal,
  Users,
} from "lucide-react";
import type { IconRef } from "@/features/portfolio/model";
import { initials } from "@/features/portfolio/model";
import styles from "./IconAsset.module.css";

export const basicIcons = {
  code: { label: "코드", glyph: Code },
  terminal: { label: "터미널", glyph: Terminal },
  database: { label: "데이터베이스", glyph: Database },
  cloud: { label: "클라우드", glyph: Cloud },
  network: { label: "네트워크", glyph: Network },
  users: { label: "협업", glyph: Users },
  layers: { label: "구조", glyph: Layers },
  palette: { label: "디자인", glyph: Palette },
  shield: { label: "보안", glyph: Shield },
  briefcase: { label: "업무", glyph: Briefcase },
  link: { label: "링크", glyph: Link },
  mail: { label: "이메일", glyph: Mail },
  phone: { label: "전화", glyph: Phone },
  globe: { label: "웹", glyph: Globe },
};

function isBasicIcon(name: string): name is keyof typeof basicIcons {
  return Object.hasOwn(basicIcons, name);
}

export function BasicIcon({ name, className }: { name: string; className?: string }) {
  if (!isBasicIcon(name)) return null;

  const Glyph = basicIcons[name].glyph;

  return <Glyph className={className} aria-hidden size={18} strokeWidth={1.5} />;
}

export function IconAsset({
  icon,
  name,
  className,
}: {
  icon: IconRef;
  name: string;
  className: string;
}) {
  const [failedKey, setFailedKey] = useState("");
  const [loadedKey, setLoadedKey] = useState("");

  if (icon.provider === "simple-icons" && icon.key && failedKey !== icon.key) {
    return (
      <span className={className + " " + styles.asset} aria-hidden>
        <span className={styles.placeholder + (loadedKey === icon.key ? " " + styles.hidden : "")}>
          {initials(name)}
        </span>
        <img
          className={styles.image + (loadedKey === icon.key ? " " + styles.loaded : "")}
          src={"https://cdn.simpleicons.org/" + encodeURIComponent(icon.key)}
          alt=""
          loading="lazy"
          onLoad={() => setLoadedKey(icon.key)}
          onError={() => setFailedKey(icon.key)}
        />
      </span>
    );
  }

  if (icon.provider === "lucide" && isBasicIcon(icon.key))
    return <BasicIcon name={icon.key} className={className} />;

  return (
    <span className={className} aria-hidden>
      {initials(name)}
    </span>
  );
}
