"use client";

import React from "react";
import "./CartoonSearchLoader.css";

export type CartoonVariant =
    | "generic"
    | "rates"
    | "refi"
    | "qualify"
    | "underwriting"
    | "dscr"
    | "dpa"
    | "jumbo"
    | "about";

type CartoonSearchLoaderProps = {
    variant?: CartoonVariant;
};

const variantText: Record<
    CartoonVariant,
    { title: string; subtitle: string }
> = {
    generic: {
        title: "HomeRates.ai is searching for the best answer…",
        subtitle: "Checking your question against live data and past context.",
    },
    rates: {
        title: "Scanning live rates and market signals…",
        subtitle: "Comparing today’s quotes against 10-year Treasury and spreads.",
    },
    refi: {
        title: "Running the refi math behind the scenes…",
        subtitle: "Checking payment change, breakeven and closing-cost trade-offs.",
    },
    qualify: {
        title: "Crunching your numbers to see what fits…",
        subtitle: "Income, debts, DTI and a realistic payment range.",
    },
    underwriting: {
        title: "Digging through the underwriting rulebook…",
        subtitle: "Fannie, Freddie, FHA, VA and real-world overlays.",
    },
    dscr: {
        title: "Checking your rental cash-flow story…",
        subtitle: "Rents, PITIA and DSCR targets for investors.",
    },
    dpa: {
        title: "Searching through down-payment help options…",
        subtitle: "Looking at structured programs like Access Zero first.",
    },
    jumbo: {
        title: "Looking up jumbo rules and pricing…",
        subtitle: "Loan limits, reserves, credit and high-balance structure.",
    },
    about: {
        title: "Loading the HomeRates.ai backstory…",
        subtitle: "Why it exists, how it works and what makes it different.",
    },
};

export default function CartoonSearchLoader({
    variant = "generic",
}: CartoonSearchLoaderProps) {
    const { title, subtitle } = variantText[variant] ?? variantText.generic;

    return (
        <div className="hr-cartoon-loader">
            <div className="hr-cartoon-stage">
                {/* Cartoon file/house */}
                <div className="hr-cartoon-doc">
                    <div className="hr-cartoon-doc-roof" />
                    <div className="hr-cartoon-doc-body">
                        <div className="hr-cartoon-doc-face">
                            <span className="hr-cartoon-eye left" />
                            <span className="hr-cartoon-eye right" />
                            <span className="hr-cartoon-mouth" />
                        </div>
                    </div>
                </div>

                {/* Magnifying glass sweeping */}
                <div className="hr-cartoon-magnifier">
                    <div className="hr-cartoon-glass" />
                    <div className="hr-cartoon-handle" />
                </div>

                {/* Little “search particles” */}
                <div className="hr-cartoon-spark spark-1" />
                <div className="hr-cartoon-spark spark-2" />
                <div className="hr-cartoon-spark spark-3" />
            </div>

            <div className="hr-cartoon-text">
                <div className="hr-cartoon-title">{title}</div>
                <div className="hr-cartoon-subtitle">{subtitle}</div>
            </div>
        </div>
    );
}
