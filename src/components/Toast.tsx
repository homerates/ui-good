"use client";

import React, { useEffect } from "react";

export default function Toast({
  message,
  show,
  onClose,
  ms = 2800,
  variant = "error",
}: {
  message: string;
  show: boolean;
  onClose: () => void;
  ms?: number;
  variant?: "error" | "info" | "success";
}) {
  useEffect(() => {
    if (!show) return;
    const id = setTimeout(onClose, ms);
    return () => clearTimeout(id);
  }, [show, ms, onClose]);

  if (!show) return null;

  const color =
    variant === "success" ? "bg-emerald-600" : variant === "info" ? "bg-slate-700" : "bg-red-600";

  return (
    <div className="fixed top-4 right-4 z-50">
      <div className={`${color} text-white rounded-xl px-4 py-3 shadow-lg`}>
        {message}
      </div>
    </div>
  );
}

