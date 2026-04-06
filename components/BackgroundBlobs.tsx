/* Fixed full-screen decorative blurred gradient blobs used as a background across pages. */
'use client';

export function BackgroundBlobs() {
	return (
		<div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
			<div className="absolute -top-40 -left-40 w-175 h-175 rounded-full bg-blue-600/20 blur-[120px]" />
			<div className="absolute -top-20 right-0 w-125 h-125 rounded-full bg-teal-500/15 blur-[100px]" />
			<div className="absolute top-[80vh] left-1/2 -translate-x-1/2 w-150 h-100 rounded-full bg-teal-400/10 blur-[100px]" />
			<div className="absolute top-[130vh] right-0 w-100 h-100 rounded-full bg-green-500/10 blur-[100px]" />
			<div className="absolute top-[160vh] left-0 w-100 h-100 rounded-full bg-blue-600/10 blur-[100px]" />
		</div>
	);
}
