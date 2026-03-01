'use client';

import Link from 'next/link';
import { Shield, Upload, Download, MousePointerClick, Lock, Gauge, Eye } from 'lucide-react';
import { Navbar, FeatureCard, Footer } from './components';
import { useEffect, useState } from 'react';

const FEATURES = [
	{
		icon: Upload,
		step: 1,
		title: 'Upload Video',
		description: 'Upload your video to get started. Supports MP4, MOV, and WebM.',
		color: 'indigo' as const,
	},
	{
		icon: MousePointerClick,
		step: 2,
		title: 'Select Faces',
		description: 'AI automatically detects all faces. Click on any face to toggle blur on or off.',
		color: 'purple' as const,
	},
	{
		icon: Download,
		step: 3,
		title: 'Export',
		description: 'Download your processed video with faces permanently blurred.',
		color: 'pink' as const,
	},
];

const BENEFITS = [
	{
		icon: Lock,
		title: 'Privacy First',
		description: 'We handle everything on AWS EC2 servers. No third parties ever see your footage.',
	},
	{
		icon: Gauge,
		title: 'Lightning Fast',
		description: 'Processed on AWS high-performance cloud servers for super fast results.',
	},
	{
		icon: Eye,
		title: 'Selective Blurring',
		description: 'Choose exactly which faces to blur. Full control over your content.',
	},
];

export default function Home() {
	const [scrolled, setScrolled] = useState(false);

	useEffect(() => {
		const handleScroll = () => setScrolled(window.scrollY > 50);
		window.addEventListener('scroll', handleScroll, { passive: true });
		return () => window.removeEventListener('scroll', handleScroll);
	}, []);

	return (
		<div className="bg-[#070f1c] text-white">

			{/* Global blobs — fixed so they span both sections with no seam */}
			<div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
				<div className="absolute -top-40 -left-40 w-[700px] h-[700px] rounded-full bg-blue-600/20 blur-[120px]" />
				<div className="absolute -top-20 right-0 w-[500px] h-[500px] rounded-full bg-indigo-600/15 blur-[100px]" />
				<div className="absolute top-[80vh] left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-blue-500/10 blur-[100px]" />
				<div className="absolute top-[130vh] right-0 w-[400px] h-[400px] rounded-full bg-indigo-600/10 blur-[100px]" />
				<div className="absolute top-[160vh] left-0 w-[400px] h-[400px] rounded-full bg-blue-600/10 blur-[100px]" />
			</div>

			{/* ================= HERO ================= */}
			<div className="relative min-h-[100svh] flex items-center justify-center overflow-hidden">

				{/* Navbar */}
				<div className="absolute top-0 left-0 w-full z-20">
					<Navbar />
				</div>

				{/* Hero Content */}
				<main className="relative z-10 w-full px-6">
					<div className="text-center max-w-4xl mx-auto">

						{/* Badge */}
						<div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-300 text-xs sm:text-sm font-medium mb-4 sm:mb-6 backdrop-blur-sm">
							<Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
							Privacy-First Video Processing
						</div>

						{/* Headline */}
						<h1 className="font-bold tracking-tight mb-4 leading-tight">
							<span className="text-6xl sm:text-7xl md:text-8xl block font-nippo bg-gradient-to-b from-white via-white to-blue-200 bg-clip-text text-transparent">
								BLUR THAT GUY
							</span>
						</h1>

						{/* Subheadline */}
						<p className="text-sm sm:text-lg text-slate-400 mb-8 max-w-2xl mx-auto leading-relaxed">
							AI-powered face detection and selective blurring built with OpenCV.
							<br />
							Processed securely with end-to-end encryption.
						</p>

						{/* CTA Buttons */}
						<div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
							<Link
								href="/upload"
								className="group inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-blue-600 hover:bg-blue-500 transition-all font-semibold text-white shadow-lg shadow-blue-600/30 hover:shadow-blue-500/40"
							>
								<Upload className="w-5 h-5 group-hover:scale-110 transition-transform" />
								Start Uploading
							</Link>

							<a
								href="/#how-it-works"
								className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all font-medium backdrop-blur-sm"
							>
								Learn More
							</a>
						</div>

						{/* Social Proof */}
						<div className="hidden sm:flex flex-wrap items-center justify-center gap-6 text-sm text-slate-500">
							<div className="flex items-center gap-2">
								<div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
								No installation required
							</div>
							<div className="flex items-center gap-2">
								<div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
								Works in your browser
							</div>
							<div className="flex items-center gap-2">
								<div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
								100% free &amp; open source
							</div>
						</div>
					</div>
				</main>

				{/* Scroll Indicator */}
				<div
					className={`absolute bottom-8 left-1/2 -translate-x-1/2 pb-[env(safe-area-inset-bottom)] z-10 transition-opacity duration-500 ${
						scrolled ? 'opacity-0 pointer-events-none' : 'opacity-100'
					}`}
				>
					<a
						href="/#how-it-works"
						className="flex flex-col items-center gap-2 text-slate-600 hover:text-slate-300 transition-colors"
					>
						<span className="text-xs font-medium tracking-widest uppercase">Scroll</span>
						<svg className="w-5 h-5 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
						</svg>
					</a>
				</div>
			</div>

			{/* ================= HOW IT WORKS ================= */}
			<div className="relative flex flex-col min-h-[100svh]">
				<section
					id="how-it-works"
					className="flex-1 flex flex-col items-center justify-center px-6 py-16 relative z-10"
				>
					<div className="max-w-7xl mx-auto w-full flex flex-col items-center">

						<div className="text-center mb-12">
							<h2 className="text-4xl font-bold mb-4 bg-gradient-to-b from-white to-slate-300 bg-clip-text text-transparent">
								How it works
							</h2>
							<p className="text-slate-400 text-lg max-w-2xl mx-auto">
								Three simple steps to anonymize faces in your videos
							</p>
						</div>

						<div className="grid md:grid-cols-3 gap-6 w-full mb-16">
							{FEATURES.map((feature) => (
								<FeatureCard key={feature.step} {...feature} />
							))}
						</div>

						{/* Divider */}
						<div className="w-full h-px bg-gradient-to-r from-transparent via-white/8 to-transparent mb-16" />

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