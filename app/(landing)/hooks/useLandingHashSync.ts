import { useEffect, type RefObject } from 'react';

/**
 * useLandingHashSync
 * Keep the URL hash in sync with landing sections. Adds '#how-it-works'
 * when the corresponding section is visible and removes it when the hero
 * is visible. Uses IntersectionObserver and history.replaceState.
 */
export function useLandingHashSync(
	heroRef: RefObject<HTMLDivElement | null>,
	howItWorksRef: RefObject<HTMLElement | null>
) {
	useEffect(() => {
		const hero = heroRef.current;
		const howItWorks = howItWorksRef.current;
		if (!hero || !howItWorks) return;

		let heroVisible = false;
		let howItWorksVisible = false;

		const syncHash = () => {
			const cleanUrl = `${window.location.pathname}${window.location.search}`;
			if (howItWorksVisible) {
				if (window.location.hash !== '#how-it-works') {
					window.history.replaceState(null, '', `${cleanUrl}#how-it-works`);
				}
				return;
			}

			if (heroVisible && window.location.hash === '#how-it-works') {
				window.history.replaceState(null, '', cleanUrl);
			}
		};

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.target === hero) {
						heroVisible = entry.isIntersecting && entry.intersectionRatio >= 0.55;
					}
					if (entry.target === howItWorks) {
						howItWorksVisible = entry.isIntersecting && entry.intersectionRatio >= 0.45;
					}
				}
				syncHash();
			},
			{ threshold: [0, 0.45, 0.55, 1] }
		);

		observer.observe(hero);
		observer.observe(howItWorks);

		return () => observer.disconnect();
	}, [heroRef, howItWorksRef]);
}
