// Standalone layout for /report/[token] — no nav, no app shell, light background
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Home Intelligence Report | HomeRates',
    description: 'Personalized property intelligence report prepared by your loan officer.',
    robots: 'noindex',
};

export default function ReportLayout({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ minHeight: '100vh', background: '#080c12' }}>
            {children}
        </div>
    );
}
