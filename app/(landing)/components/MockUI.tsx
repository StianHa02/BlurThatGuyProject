'use client';

import { EyeOff, Eye, Upload, Download, Save } from 'lucide-react';
import { motion } from 'framer-motion';

const FACES = [1, 2];
const GALLERY_FACES = FACES.slice(0, 2);

export function MockUI() {
	return (
		<motion.div
			initial={{ opacity: 0, y: 24 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.6, delay: 0.25, ease: 'easeOut' }}
			className="relative"
		>
			{/* Ambient glow */}
			<div className="absolute -inset-6 bg-blue-500/10 rounded-[3rem] blur-3xl pointer-events-none" />

			<div className="relative rounded-2xl border border-white/8 bg-(--bg) overflow-hidden shadow-2xl shadow-black/70">

				{/* ── Header — logo left · steps center · spacer right ── */}
				<div className="flex items-center justify-between gap-4 px-4 py-2.5 border-b border-white/8">
					{/* Left: logo */}
					<div className="flex items-center gap-2 shrink-0">
						<div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center">
							<EyeOff className="w-3 h-3 text-white" />
						</div>
						<span className="text-xs font-semibold text-white">BlurThatGuy</span>
					</div>

					{/* Center: step pills */}
					<div className="flex flex-1 items-center justify-center gap-1">
						<div className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-semibold bg-emerald-600 border border-emerald-400/50 text-white">
							<svg className="w-2 h-2 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
								<path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
							</svg>
							Upload
						</div>
						<div className="w-4 h-px bg-slate-600" />
						<div className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-semibold bg-emerald-600 border border-emerald-400/50 text-white">
							<svg className="w-2 h-2 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
								<path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
							</svg>
							Detect
						</div>
						<div className="w-4 h-px bg-slate-600" />
						<div className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-semibold bg-blue-600 border border-blue-400/50 text-white">
							Select
						</div>
					</div>

					{/* Right: spacer to balance logo width */}
					<div className="shrink-0 w-[88px]" />
				</div>

				{/* ── Toolbar ── */}
				<div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-white/6">
					<div className="flex items-stretch rounded-xl overflow-hidden border border-white/10 text-[9px] font-semibold divide-x divide-white/10">
						<div className="flex items-center gap-1 px-2 py-1 bg-slate-700 text-slate-200">
							<svg className="w-2.5 h-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
								<circle cx="17" cy="7" r="3"/><path d="M13.5 21v-7a1 1 0 00-1-1H8a1 1 0 00-1 1v7"/><circle cx="7" cy="7" r="3"/>
							</svg>
							{FACES.length} detected
						</div>
						<div className="flex items-center gap-1 px-2 py-1 bg-red-600 text-white">
							<EyeOff className="w-2.5 h-2.5 shrink-0" />
							{FACES.length} blurred
						</div>
						<div className="flex items-center gap-1 px-2 py-1 bg-emerald-600 text-white">
							<Eye className="w-2.5 h-2.5 shrink-0" />
							0 visible
						</div>
					</div>
					<div className="flex items-center gap-1.5">
						<div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-700 border border-slate-500/40 text-[9px] text-white font-semibold">
							<Upload className="w-2.5 h-2.5" /> New file
						</div>
						<div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-600 text-[9px] text-white font-semibold">
							<Download className="w-2.5 h-2.5" /> Download
						</div>
						<div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-600 text-[9px] text-white font-semibold">
							<Save className="w-2.5 h-2.5" /> Save
						</div>
					</div>
				</div>

				{/* ── Video player ── */}
				<div className="px-3 pt-3 pb-2">
					<div
						className="relative rounded-xl overflow-hidden"
						style={{
							aspectRatio: '16/9',
							backgroundImage: "url('/avatar.jpg')",
							backgroundSize: 'cover',
							backgroundPosition: 'top center',
						}}
					>
						</div>
				</div>

				{/* ── Face gallery ── */}
				<div className="px-3 pb-3">
					<div className="rounded-xl bg-white/3 border border-white/8 p-3">
						<div className="flex items-center justify-between mb-2.5">
							<span className="text-[10px] font-semibold text-white">All Detected Faces ({GALLERY_FACES.length})</span>
							<div className="flex items-center gap-1">
								<div className="text-[9px] px-1.5 py-0.5 rounded-lg bg-white/5 border border-white/10 text-slate-400">Blur All</div>
								<div className="text-[9px] px-1.5 py-0.5 rounded-lg bg-white/5 border border-white/10 text-slate-400">Clear</div>
								<div className="flex items-center rounded-lg border border-white/10 overflow-hidden text-[9px]">
									<div className="px-1.5 py-0.5 bg-blue-600 text-white font-medium">Pixelate</div>
									<div className="px-1.5 py-0.5 bg-white/5 text-slate-400">Blackout</div>
								</div>
							</div>
						</div>

						<div className="flex gap-2">
							{GALLERY_FACES.map((i) => (
								<div
									key={i}
									className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 border-2 border-blue-500 ring-1 ring-blue-500/30 bg-slate-800 flex items-center justify-center"
								>
									{/* Person silhouette */}
									<svg className="w-7 h-7 text-slate-500" viewBox="0 0 24 24" fill="currentColor">
										<circle cx="12" cy="8" r="3.5" />
										<path d="M5 20c0-3.866 3.134-7 7-7s7 3.134 7 7" strokeLinecap="round" />
									</svg>

									{/* Blue overlay + checkmark */}
									<div className="absolute inset-0 bg-blue-500/15 flex items-center justify-center">
										<div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center shadow">
											<svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
												<path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
											</svg>
										</div>
									</div>

									{/* Index badge */}
									<div className="absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-black/50 flex items-center justify-center text-[8px] font-bold text-white/80">
										{i}
									</div>
								</div>
							))}
						</div>
					</div>
				</div>

			</div>
		</motion.div>
	);
}
