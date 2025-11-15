import { useEffect } from 'react';

/**
 * Keeps the main hr-composer pinned to the *visual* viewport on mobile,
 * so it sits just above the keyboard instead of floating in the middle.
 */
export function useMobileComposerPin() {
    useEffect(() => {
        if (typeof window === 'undefined' || !(window as any).visualViewport) {
            return;
        }

        const composer = document.querySelector<HTMLElement>(
            '.hr-composer[data-composer="primary"]'
        );
        const vv = (window as any).visualViewport as any;

        if (!composer || !vv) return;

        const updatePosition = () => {
            const isMobile = window.innerWidth <= 768;

            // Desktop: clear overrides and exit
            if (!isMobile) {
                composer.style.bottom = '';
                composer.style.transform = '';
                return;
            }

            // CSS already makes it position: fixed; bottom: 0 on mobile.
            // Here we just adjust bottom so it tracks the *visible* viewport.
            const bottomGap = window.innerHeight - (vv.height + vv.offsetTop);
            const b = bottomGap > 0 ? bottomGap : 0;

            composer.style.bottom = `${b}px`;
            composer.style.transform = ''; // make sure no old transforms linger
        };

        vv.addEventListener('resize', updatePosition);
        vv.addEventListener('scroll', updatePosition);
        window.addEventListener('scroll', updatePosition);

        updatePosition(); // initial call

        return () => {
            vv.removeEventListener('resize', updatePosition);
            vv.removeEventListener('scroll', updatePosition);
            window.removeEventListener('scroll', updatePosition);
        };
    }, []);
}
