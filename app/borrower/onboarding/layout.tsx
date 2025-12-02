export const metadata = {
    title: "Borrower Onboarding • HomeRates.ai",
};

export default function BorrowerOnboardingLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body
                style={{
                    margin: 0,
                    padding: 0,
                    backgroundColor: "#020617",
                    minHeight: "100vh",
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                {children}
            </body>
        </html>
    );
}
