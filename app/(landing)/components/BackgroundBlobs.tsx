'use client';

import React from 'react';

export function BackgroundBlobs() {
	return (
		<div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
			<div className="absolute -top-40 -left-40 w-175 h-175 rounded-full bg-blue-600/20 blur-[120px]" />
			<div className="absolute -top-20 right-0 w-[500px] h-[500px] rounded-full bg-teal-500/15 blur-[100px]" />
			<div className="absolute top-[80vh] left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-teal-400/10 blur-[100px]" />
			<div className="absolute top-[130vh] right-0 w-[400px] h-[400px] rounded-full bg-green-500/10 blur-[100px]" />
			<div className="absolute top-[160vh] left-0 w-[400px] h-[400px] rounded-full bg-blue-600/10 blur-[100px]" />
		</div>
	);
}