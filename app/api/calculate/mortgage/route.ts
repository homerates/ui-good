// app/api/calculate/mortgage/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import {
    calculateMortgage,
    generateAmortizationSchedule,
    compareRates,
    runVerificationTests,
    type MortgageInput
} from "../../../../lib/mortgageCalculator";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        const { price, downPaymentPct, rate, termYears, includeAmortization, compareScenarios } = body;

        // Validate required fields
        if (!price || !downPaymentPct == null || !rate || !termYears) {
            return NextResponse.json(
                { error: "Missing required fields: price, downPaymentPct, rate, termYears" },
                { status: 400 }
            );
        }

        // Calculate base mortgage
        const input: MortgageInput = {
            price: Number(price),
            downPaymentPct: Number(downPaymentPct),
            rate: Number(rate),
            termYears: Number(termYears),
        };

        const result = calculateMortgage(input);

        // Optional: Include amortization schedule
        let amortization = null;
        if (includeAmortization) {
            amortization = generateAmortizationSchedule(result);
        }

        // Optional: Compare rate scenarios
        let scenarios = null;
        if (compareScenarios && Array.isArray(compareScenarios)) {
            scenarios = compareRates(
                input.price,
                input.downPaymentPct,
                input.termYears,
                compareScenarios
            );
        }

        return NextResponse.json({
            ok: true,
            result,
            amortization,
            scenarios,
        });

    } catch (err: any) {
        console.error("[Mortgage Calculator] Error:", err);
        return NextResponse.json(
            { error: err.message || "Calculation error" },
            { status: 400 }
        );
    }
}

/**
 * GET endpoint to run verification tests
 * Useful for confirming calculations are accurate
 */
export async function GET(req: NextRequest) {
    const verification = runVerificationTests();

    return NextResponse.json({
        verified: verification.passed,
        errors: verification.errors,
        message: verification.passed
            ? "All verification tests passed ✅"
            : "Some tests failed ❌",
    });
}
