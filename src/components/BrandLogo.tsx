import type { ComponentPropsWithoutRef } from "react";
import logo from "@/assets/OCO-Stacked-Logo-White-300px.png";

export function BrandLogo(props: Omit<ComponentPropsWithoutRef<"img">, "src" | "alt"> & { alt?: string }) {
  const { alt = "Office & Co", ...imgProps } = props;
  return <img src={logo} alt={alt} {...imgProps} />;
}
