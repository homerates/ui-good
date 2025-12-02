"use client";

import React from "react";
import CartoonSearchLoader from "./CartoonSearchLoader";

type WaitingRoomProps = {
    onStart: () => void;
};

export default function WaitingRoom({ onStart }: WaitingRoomProps) {
    return (
        <div
            style={{
                minHeight: "100vh",
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "16px",
                background: "#020617", // matches your dark theme
            }}
        >
            <div
                style={{
                    maxWidth: 520,
                    width: "100%",
                    borderRadius: 18,
                    border: "1px solid rgba(148, 163, 184, 0.45)",
                    padding: "18px 16px",
                    background:
                        "radial-gradient(circle at top, #020617 0%, #020617 35%, #020617 100%)",
                    boxShadow: "0 18px 45px rgba(15,23,42,0.9)",
                }}
            >
                {/* Cartoon loader hero */}
                <div style={{ display: "flex", justifyContent: "center" }}>
                    <CartoonSearchLoader variant="about" />
                </div>

                {/* Main copy */}
                <div style={{ marginTop: 10, textAlign: "left" }}>
                    <div
                        style={{
                            color: "#e5e7eb",
                            fontSize: 18,
                            fontWeight: 600,
                            marginBottom: 4,
                        }}
                    >
                        Welcome to HomeRates.ai
                    </div>
                    <div
                        style={{
                            color: "#9ca3af",
                            fontSize: 13,
                            lineHeight: 1.5,
                            marginBottom: 10,
                        }}
                    >
                        I’m spinning up your personal mortgage brain. Behind the scenes,
                        HomeRates.ai routes your questions through live 2025–2026 rate
                        data, underwriting rules, and your past answers so you get
                        lender-level clarity without the sales pressure.
                    </div>

                    <div
                        style={{
                            color: "#cbd5f5",
                            fontSize: 12,
                            lineHeight: 1.5,
                            marginBottom: 12,
                        }}
                    >
                        When you start your session, you can ask about:
                        <ul style={{ marginTop: 4, paddingLeft: 18 }}>
                            <li>Today’s rates and what’s driving them.</li>
                            <li>Refi math, breakeven, and payment changes.</li>
                            <li>How much you can qualify for in 2025–2026.</li>
                            <li>Underwriting rules, jumbo, DSCR, and more.</li>
                        </ul>
                    </div>
                </div>

                {/* CTA */}
                <div
                    style={{
                        display: "flex",
                        justifyContent: "flex-start",
                        marginTop: 4,
                    }}
                >
                    <button
                        type="button"
                        className="btn primary"
                        onClick={onStart}
                        style={{
                            padding: "7px 14px",
                            fontSize: 13,
                        }}
                    >
                        Start my session
                    </button>
                </div>
            </div>
        </div>
    );
}
