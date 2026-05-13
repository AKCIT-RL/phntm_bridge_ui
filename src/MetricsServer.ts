import { Registry, collectDefaultMetrics, Counter, Gauge } from "prom-client";
import type express from "express";

const registry = new Registry();

collectDefaultMetrics({ register: registry });

export const httpRequestsTotal = new Counter({
	name: "phntm_http_requests_total",
	help: "Total number of HTTP requests received",
	labelNames: ["method", "status_code"],
	registers: [registry],
});

const webrtcRttSeconds = new Gauge({
	name: "phntm_webrtc_rtt_seconds",
	help: "WebRTC peer connection round-trip time in seconds",
	labelNames: ["robot_id", "session_id"],
	registers: [registry],
});

const webrtcFps = new Gauge({
	name: "phntm_webrtc_fps",
	help: "WebRTC inbound-rtp frames per second",
	labelNames: ["robot_id", "session_id", "mid"],
	registers: [registry],
});

const webrtcPacketsLost = new Gauge({
	name: "phntm_webrtc_packets_lost",
	help: "WebRTC cumulative packets lost",
	labelNames: ["robot_id", "session_id", "mid"],
	registers: [registry],
});

const webrtcFramesDropped = new Gauge({
	name: "phntm_webrtc_frames_dropped",
	help: "WebRTC cumulative frames dropped",
	labelNames: ["robot_id", "session_id", "mid"],
	registers: [registry],
});

const webrtcFreezeCount = new Gauge({
	name: "phntm_webrtc_freeze_count",
	help: "WebRTC cumulative video freeze count",
	labelNames: ["robot_id", "session_id", "mid"],
	registers: [registry],
});

// Tracks which label combos exist per session so we can remove them on deletion.
const sessionIndex = new Map<string, { rttRobots: Set<string>; streams: Set<string> }>();

function getSessionEntry(sessionId: string) {
	if (!sessionIndex.has(sessionId)) {
		sessionIndex.set(sessionId, { rttRobots: new Set(), streams: new Set() });
	}
	return sessionIndex.get(sessionId)!;
}

export function pushWebRTCStats(robotId: string, sessionId: string, stats: Record<string, unknown>[]) {
	const entry = getSessionEntry(sessionId);
	for (const report of stats) {
		if (report.type === "inbound-rtp") {
			const mid = String(report.mid ?? "unknown");
			entry.streams.add(`${robotId}\x00${mid}`);
			if (typeof report.framesPerSecond === "number") webrtcFps.set({ robot_id: robotId, session_id: sessionId, mid }, report.framesPerSecond);
			if (typeof report.packetsLost === "number") webrtcPacketsLost.set({ robot_id: robotId, session_id: sessionId, mid }, report.packetsLost);
			if (typeof report.framesDropped === "number") webrtcFramesDropped.set({ robot_id: robotId, session_id: sessionId, mid }, report.framesDropped);
			if (typeof report.freezeCount === "number") webrtcFreezeCount.set({ robot_id: robotId, session_id: sessionId, mid }, report.freezeCount);
		} else if (report.type === "candidate-pair" && report.nominated === true) {
			entry.rttRobots.add(robotId);
			if (typeof report.currentRoundTripTime === "number") {
				webrtcRttSeconds.set({ robot_id: robotId, session_id: sessionId }, report.currentRoundTripTime);
			}
		}
	}
}

export function deleteSession(sessionId: string): boolean {
	const entry = sessionIndex.get(sessionId);
	if (!entry) return false;

	for (const robotId of entry.rttRobots) {
		webrtcRttSeconds.remove({ robot_id: robotId, session_id: sessionId });
	}
	for (const key of entry.streams) {
		const [robotId, mid] = key.split("\x00");
		webrtcFps.remove({ robot_id: robotId, session_id: sessionId, mid });
		webrtcPacketsLost.remove({ robot_id: robotId, session_id: sessionId, mid });
		webrtcFramesDropped.remove({ robot_id: robotId, session_id: sessionId, mid });
		webrtcFreezeCount.remove({ robot_id: robotId, session_id: sessionId, mid });
	}

	sessionIndex.delete(sessionId);
	return true;
}

export function listSessions(): string[] {
	return Array.from(sessionIndex.keys());
}

export function registerMetricsEndpoint(app: express.Express, metricsPath: string) {
	app.get(metricsPath, async (_req: express.Request, res: express.Response) => {
		try {
			res.set("Content-Type", registry.contentType);
			res.end(await registry.metrics());
		} catch (err) {
			res.status(500).end(String(err));
		}
	});
}
