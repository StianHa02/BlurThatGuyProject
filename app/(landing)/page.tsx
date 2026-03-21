'use client';

import Link from 'next/link';
import { Shield, Upload, Download, MousePointerClick, Lock, Gauge, Eye } from 'lucide-react';
import { Navbar, FeatureCard, Footer, MockUI } from './components';
import { BackgroundBlobs } from '@/components';
import { useEffect, useRef, useState } from 'react';
import { useLandingHashSync } from './hooks/useLandingHashSync';
import { motion } from 'framer-motion';

const FEATURES = [
	{
		icon: Upload,
		step: 1,
		title: 'Upload Video',
		description: 'Upload your video to get started. Supports MP4, MOV, and WebM.',
		color: 'blue' as const,
	},
	{
		icon: MousePointerClick,
		step: 2,
		title: 'Select Faces',
		description: 'AI automatically detects all faces. Click on any face to toggle blur on or off.',
		color: 'teal' as const,
	},
	{
		icon: Download,
		step: 3,
		title: 'Export',
		description: 'Save your project and download the processed video with faces permanently blurred.',
		color: 'green' as const,
	},
];

const BENEFITS = [
	{
		icon: Lock,
		title: 'Privacy First',
		description: 'Processed on AWS EC2 servers. No third parties ever see your footage.',
	},
	{
		icon: Gauge,
		title: 'Lightning Fast',
		description: 'High-performance cloud servers with parallel processing for quick results.',
	},
	{
		icon: Eye,
		title: 'Selective Blurring',
		description: 'Choose exactly which faces to blur. Full control over your content.',
	},
];

export default function Home() {
	const [scrolled, setScrolled] = useState(false);
	const heroRef = useRef<HTMLDivElement>(null);
	const howItWorksRef = useRef<HTMLElement>(null);
	useLandingHashSync(heroRef, howItWorksRef);

	useEffect(() => {
		if (window.location.hash === '#how-it-works') {
			const cleanUrl = `${window.location.pathname}${window.location.search}`;
			window.history.replaceState(null, '', cleanUrl);
			window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
		}
	}, []);

	useEffect(() => {
		const handleScroll = () => setScrolled(window.scrollY > 50);
		window.addEventListener('scroll', handleScroll, { passive: true });
		return () => window.removeEventListener('scroll', handleScroll);
	}, []);

	const scrollToHowItWorks = (event: React.MouseEvent<HTMLAnchorElement>) => {
		event.preventDefault();
		const target = howItWorksRef.current;
		if (!target) return;
		const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
		target.scrollIntoView({ behavior, block: 'start' });
		const cleanUrl = `${window.location.pathname}${window.location.search}`;
		window.history.replaceState(null, '', `${cleanUrl}#how-it-works`);
	};

	return (
		<div className="page-bg">

			<BackgroundBlobs />

			{/* ===== HERO ===== */}
			<div ref={heroRef} className="relative min-h-svh flex items-center overflow-hidden">

				<div className="absolute top-0 left-0 w-full z-20">
					<Navbar />
				</div>

				<main className="relative z-10 w-full px-6 pt-28 pb-16">
					<div className="max-w-7xl mx-auto">
						<div className="grid lg:grid-cols-2 gap-14 items-center">

							{/* Left — text */}
							<motion.div
								initial={{ opacity: 0, x: -16 }}
								animate={{ opacity: 1, x: 0 }}
								transition={{ duration: 0.5, ease: 'easeOut' }}
								className="text-center lg:text-left"
							>
								<div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-300 text-xs sm:text-sm font-medium mb-8 backdrop-blur-sm">
									<Shield className="w-3.5 h-3.5" />
									Privacy-First Video Processing
								</div>

								<h1 className="font-bold tracking-tight mb-6 leading-tight">
									<span className="text-5xl sm:text-6xl lg:text-7xl block font-nippo bg-linear-to-b from-white via-white to-blue-200 bg-clip-text text-transparent">
										BLUR THAT GUY
									</span>
								</h1>

								<p className="text-base sm:text-lg text-slate-400 mb-10 max-w-xl mx-auto lg:mx-0 leading-relaxed">
									AI-powered face detection and selective blurring. <br/>Protect identities in your videos.
								</p>

								<div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start mb-10">
									<Link
										href="/upload"
										className="group inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-blue-600 hover:bg-blue-500 transition-all font-semibold text-white shadow-lg shadow-blue-600/30 hover:shadow-blue-500/40"
									>
										<Upload className="w-4 h-4 group-hover:scale-110 transition-transform" />
										Start Blurring
									</Link>
									<Link
										href="/#how-it-works"
										onClick={scrollToHowItWorks}
										className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all font-medium backdrop-blur-sm"
									>
										See How It Works
									</Link>
								</div>

								<div className="flex flex-wrap items-center justify-center lg:justify-start gap-5 text-sm text-slate-500">
									<div className="flex items-center gap-2">
										<div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
										No sign-up required
									</div>
									<div className="flex items-center gap-2">
										<div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
										Works in browser
									</div>
									<div className="flex items-center gap-2">
										<div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
										Open source
									</div>
								</div>
							</motion.div>

							{/* Right — MockUI (desktop only) */}
							<div className="hidden lg:block">
								<MockUI />
							</div>

						</div>
					</div>
				</main>

				{/* Scroll indicator — hidden on mobile */}
				<div className={`hidden sm:block absolute bottom-8 left-1/2 -translate-x-1/2 pb-[env(safe-area-inset-bottom)] z-10 transition-opacity duration-500 ${scrolled ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
					<Link
						href="/#how-it-works"
						onClick={scrollToHowItWorks}
						className="flex flex-col items-center gap-2 text-slate-600 hover:text-slate-300 transition-colors"
					>
						<span className="text-xs font-medium tracking-widest uppercase">Scroll</span>
						<svg className="w-5 h-5 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
						</svg>
					</Link>
				</div>
			</div>

			{/* ===== HOW IT WORKS ===== */}
			<div className="relative flex flex-col min-h-svh">
				<section
					id="how-it-works"
					ref={howItWorksRef}
					className="flex-1 flex flex-col items-center justify-center px-6 py-20 relative z-10"
				>
					<div className="max-w-7xl mx-auto w-full flex flex-col items-center">

						{/* Section header */}
						<div className="text-center mb-16">
							<h2 className="text-4xl sm:text-5xl font-bold mb-4 bg-linear-to-b from-white to-slate-300 bg-clip-text text-transparent">
								How it works
							</h2>
							<p className="text-slate-400 text-lg max-w-xl mx-auto">
								Three steps from raw footage to anonymized video
							</p>
						</div>

						{/* Steps with connector line */}
						<div className="relative w-full mb-20">
							<div className="hidden md:block absolute top-[2.6rem] left-0 right-0 pointer-events-none px-[calc(100%/6)]">
								<div className="h-px w-full" style={{ background: 'linear-gradient(to right, rgba(59,130,246,0.25), rgba(20,184,166,0.25), rgba(34,197,94,0.25))' }} />
							</div>
							<div className="grid md:grid-cols-3 gap-6 w-full">
								{FEATURES.map((feature) => (
									<FeatureCard key={feature.step} {...feature} />
								))}
							</div>
						</div>

						{/* Divider */}
						<div className="w-full h-px bg-linear-to-r from-transparent via-white/8 to-transparent mb-20" />

						{/* Benefits */}
						<div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full">
							{BENEFITS.map((b) => {
								const Icon = b.icon;
								return (
									<div key={b.title} className="flex gap-4 items-start">
										<div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 shrink-0">
											<Icon className="w-5 h-5 text-blue-400" />
										</div>
										<div>
											<h3 className="font-semibold text-white mb-1">{b.title}</h3>
											<p className="text-slate-400 text-sm leading-relaxed">{b.description}</p>
										</div>
									</div>
								);
							})}
						</div>

					</div>
				</section>
				<Footer />
			</div>

		</div>
	);
}
