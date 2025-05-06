import React from 'react';
import Image from "next/image";

export default function PinIcon() {
  return (
    <Image
      src="/icons/push-pin-green.png"
      width={20}
      height={20}
      alt="Push pin"
    />
  );
}