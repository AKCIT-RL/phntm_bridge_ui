/**
 * MediaPublisherUI
 *
 * UI for publishing the local browser camera/microphone to the connected
 * peer (the bridge robot). Adds a floating "Publish Media" button to the
 * page; clicking it opens a modal where the user picks input devices,
 * sets the destination ROS topics and starts/stops streaming.
 *
 * Wires to BrowserClient methods:
 *   - listMediaInputDevices()
 *   - publishMedia({ video, audio })
 *   - stopPublishingMedia()
 */
export class MediaPublisherUI {
	constructor(client) {
		this.client = client;
		this.dialog_open = false;
		this.starting = false;
		this._injectStyles();
		this._buildButton();
		this._buildDialog();

		// reflect connection state on the button
		const updateBtn = () => this._updateButtonState();
		this.client.on("peer_connected", updateBtn);
		this.client.on("peer_disconnected", updateBtn);
		this.client.on("media_publish_started", updateBtn);
		this.client.on("media_publish_stopped", updateBtn);
		updateBtn();
	}

	_injectStyles() {
		if (document.getElementById("media-publisher-styles")) return;
		let s = document.createElement("style");
		s.id = "media-publisher-styles";
		s.textContent = `
#media-publisher-btn {
	position: fixed; right: 12px; bottom: 12px;
	z-index: 90;
	background: #222; color: #fff;
	border: 1px solid #555; border-radius: 6px;
	padding: 8px 14px; cursor: pointer;
	font: 13px/1.2 sans-serif;
	box-shadow: 0 2px 8px rgba(0,0,0,.4);
	user-select: none;
	opacity: .7;
	transition: opacity .15s;
}
#media-publisher-btn:hover { opacity: 1; }
#media-publisher-btn.active { background: #b22; border-color: #f55; opacity: 1; }
#media-publisher-btn.disabled { opacity: .35; cursor: not-allowed; }
#media-publisher-btn .dot {
	display: inline-block; width: 9px; height: 9px; border-radius: 50%;
	background: #888; margin-right: 8px; vertical-align: middle;
}
#media-publisher-btn.active .dot { background: #f55; animation: mp-pulse 1s infinite; }
@keyframes mp-pulse { 50% { opacity: .35; } }

#media-publisher-dialog {
	position: fixed; inset: 0;
	z-index: 230;
	display: none;
	align-items: center; justify-content: center;
	background: rgba(0,0,0,.55);
	font: 13px/1.4 sans-serif; color: #eee;
}
#media-publisher-dialog.open { display: flex; }
#media-publisher-dialog .mp-card {
	background: #222; border: 1px solid #444; border-radius: 8px;
	padding: 16px 18px; min-width: 340px; max-width: 480px;
	box-shadow: 0 4px 20px rgba(0,0,0,.6);
}
#media-publisher-dialog h2 {
	margin: 0 0 12px; font-size: 16px; font-weight: 600;
}
#media-publisher-dialog .mp-row {
	margin-bottom: 10px;
	border: 1px solid #3a3a3a; border-radius: 6px;
	padding: 10px;
}
#media-publisher-dialog .mp-row.disabled { opacity: .45; }
#media-publisher-dialog label.mp-toggle {
	display: flex; align-items: center; gap: 8px;
	font-weight: 600; margin-bottom: 8px; cursor: pointer;
}
#media-publisher-dialog label.mp-toggle input { transform: scale(1.1); }
#media-publisher-dialog .mp-field {
	display: flex; align-items: center; gap: 8px; margin-bottom: 6px;
}
#media-publisher-dialog .mp-field label {
	flex: 0 0 80px; color: #aaa; font-size: 12px;
}
#media-publisher-dialog .mp-field input,
#media-publisher-dialog .mp-field select {
	flex: 1; background: #111; color: #eee;
	border: 1px solid #444; border-radius: 4px;
	padding: 4px 6px; font: inherit;
}
#media-publisher-dialog .mp-field input.short { flex: 0 0 80px; }
#media-publisher-dialog .mp-buttons {
	display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px;
}
#media-publisher-dialog button.mp-btn {
	background: #333; color: #eee;
	border: 1px solid #555; border-radius: 4px;
	padding: 6px 14px; cursor: pointer;
	font: inherit;
}
#media-publisher-dialog button.mp-btn:hover { background: #444; }
#media-publisher-dialog button.mp-btn.primary { background: #2a6; border-color: #4c8; }
#media-publisher-dialog button.mp-btn.danger { background: #a33; border-color: #d55; }
#media-publisher-dialog button.mp-btn:disabled { opacity: .5; cursor: not-allowed; }
#media-publisher-dialog .mp-status {
	font-size: 12px; color: #f88; margin-top: 6px; min-height: 14px;
}
#media-publisher-dialog .mp-active-info {
	font-size: 12px; color: #8c8; margin-top: 6px;
}
`;
		document.head.appendChild(s);
	}

	_buildButton() {
		this.btn = document.createElement("button");
		this.btn.id = "media-publisher-btn";
		this.btn.innerHTML = '<span class="dot"></span><span class="label">Publish Media</span>';
		this.btn.addEventListener("click", () => {
			if (this.btn.classList.contains("disabled")) return;
			this.openDialog();
		});
		document.body.appendChild(this.btn);
	}

	_buildDialog() {
		const wrap = document.createElement("div");
		wrap.id = "media-publisher-dialog";
		wrap.innerHTML = `
			<div class="mp-card" role="dialog" aria-modal="true">
				<h2>Publish browser media to peer</h2>

				<div class="mp-row" data-row="video">
					<label class="mp-toggle">
						<input type="checkbox" id="mp-video-on" checked /> Video (camera)
					</label>
					<div class="mp-field">
						<label for="mp-video-device">Device</label>
						<select id="mp-video-device"></select>
					</div>
					<div class="mp-field">
						<label for="mp-video-topic">Topic</label>
						<input type="text" id="mp-video-topic" value="/browser/image/compressed" />
					</div>
					<div class="mp-field">
						<label for="mp-video-msgtype">Msg type</label>
						<input type="text" id="mp-video-msgtype" value="sensor_msgs/msg/CompressedImage" />
					</div>
					<div class="mp-field">
						<label>Resolution</label>
						<input type="number" id="mp-video-w" class="short" placeholder="width" min="0" />
						<span>x</span>
						<input type="number" id="mp-video-h" class="short" placeholder="height" min="0" />
						<span>@</span>
						<input type="number" id="mp-video-fps" class="short" placeholder="fps" min="0" value="15" />
					</div>
					<div class="mp-field">
						<label for="mp-video-q">JPEG quality</label>
						<input type="number" id="mp-video-q" class="short" min="0.1" max="1.0" step="0.05" value="0.7" />
					</div>
				</div>

				<div class="mp-row" data-row="audio">
					<label class="mp-toggle">
						<input type="checkbox" id="mp-audio-on" /> Audio (microphone)
					</label>
					<div class="mp-field">
						<label for="mp-audio-device">Device</label>
						<select id="mp-audio-device"></select>
					</div>
					<div class="mp-field">
						<label for="mp-audio-topic">Topic</label>
						<input type="text" id="mp-audio-topic" value="/browser/audio" />
					</div>
					<div class="mp-field">
						<label for="mp-audio-msgtype">Msg type</label>
						<input type="text" id="mp-audio-msgtype" value="audio_common_msgs/msg/AudioData" />
					</div>
					<div class="mp-field">
						<label for="mp-audio-rate">Sample rate</label>
						<input type="number" id="mp-audio-rate" class="short" min="8000" max="48000" step="1000" value="16000" />
					</div>
				</div>

				<div class="mp-status" id="mp-status"></div>
				<div class="mp-active-info" id="mp-active-info"></div>

				<div class="mp-buttons">
					<button class="mp-btn" id="mp-cancel">Close</button>
					<button class="mp-btn danger" id="mp-stop" style="display:none">Stop</button>
					<button class="mp-btn primary" id="mp-start">Start</button>
				</div>
			</div>`;
		document.body.appendChild(wrap);
		this.dialog = wrap;

		// element refs
		this.el = {
			videoOn: wrap.querySelector("#mp-video-on"),
			videoDev: wrap.querySelector("#mp-video-device"),
			videoTopic: wrap.querySelector("#mp-video-topic"),
			videoMsgType: wrap.querySelector("#mp-video-msgtype"),
			videoW: wrap.querySelector("#mp-video-w"),
			videoH: wrap.querySelector("#mp-video-h"),
			videoFps: wrap.querySelector("#mp-video-fps"),
			videoQ: wrap.querySelector("#mp-video-q"),
			audioOn: wrap.querySelector("#mp-audio-on"),
			audioDev: wrap.querySelector("#mp-audio-device"),
			audioTopic: wrap.querySelector("#mp-audio-topic"),
			audioMsgType: wrap.querySelector("#mp-audio-msgtype"),
			audioRate: wrap.querySelector("#mp-audio-rate"),
			status: wrap.querySelector("#mp-status"),
			activeInfo: wrap.querySelector("#mp-active-info"),
			start: wrap.querySelector("#mp-start"),
			stop: wrap.querySelector("#mp-stop"),
			cancel: wrap.querySelector("#mp-cancel"),
			rowVideo: wrap.querySelector('[data-row="video"]'),
			rowAudio: wrap.querySelector('[data-row="audio"]'),
		};

		const refreshRows = () => {
			this.el.rowVideo.classList.toggle("disabled", !this.el.videoOn.checked);
			this.el.rowAudio.classList.toggle("disabled", !this.el.audioOn.checked);
		};
		this.el.videoOn.addEventListener("change", refreshRows);
		this.el.audioOn.addEventListener("change", refreshRows);
		refreshRows();

		// click outside card closes
		wrap.addEventListener("click", (e) => {
			if (e.target === wrap) this.closeDialog();
		});
		this.el.cancel.addEventListener("click", () => this.closeDialog());
		this.el.start.addEventListener("click", () => this._handleStart());
		this.el.stop.addEventListener("click", () => this._handleStop());
	}

	async openDialog() {
		this.dialog.classList.add("open");
		this.dialog_open = true;
		this._setStatus("");
		await this._populateDevices();
		this._refreshActiveState();
	}

	closeDialog() {
		this.dialog.classList.remove("open");
		this.dialog_open = false;
	}

	async _populateDevices() {
		try {
			const devs = await this.client.listMediaInputDevices();
			this._fillSelect(this.el.videoDev, devs.video, "Camera");
			this._fillSelect(this.el.audioDev, devs.audio, "Microphone");
		} catch (e) {
			this._setStatus("Could not enumerate devices: " + e.message);
		}
	}

	_fillSelect(sel, devices, label) {
		const prev = sel.value;
		sel.innerHTML = "";
		if (!devices.length) {
			let opt = document.createElement("option");
			opt.value = "";
			opt.textContent = "(no " + label.toLowerCase() + " available)";
			sel.appendChild(opt);
			sel.disabled = true;
			return;
		}
		sel.disabled = false;
		let optDefault = document.createElement("option");
		optDefault.value = "";
		optDefault.textContent = "Default " + label.toLowerCase();
		sel.appendChild(optDefault);
		devices.forEach((d, i) => {
			let o = document.createElement("option");
			o.value = d.deviceId;
			o.textContent = d.label || `${label} ${i + 1}`;
			sel.appendChild(o);
		});
		if (prev) sel.value = prev;
	}

	_setStatus(msg, isError = true) {
		this.el.status.textContent = msg || "";
		this.el.status.style.color = isError ? "#f88" : "#8c8";
	}

	_refreshActiveState() {
		const info = this.client.getPublishedMediaInfo();
		const active = !!info;
		this.el.start.style.display = active ? "none" : "";
		this.el.stop.style.display = active ? "" : "none";
		// disable inputs while active
		[
			this.el.videoOn,
			this.el.videoDev,
			this.el.videoTopic,
			this.el.videoMsgType,
			this.el.videoW,
			this.el.videoH,
			this.el.videoFps,
			this.el.videoQ,
			this.el.audioOn,
			this.el.audioDev,
			this.el.audioTopic,
			this.el.audioMsgType,
			this.el.audioRate,
		].forEach((e) => (e.disabled = active));
		if (active) {
			this.el.activeInfo.innerHTML =
				"Publishing: " +
				info
					.map(
						(t) =>
							`<b>${t.kind}</b> &rarr; <code>${t.topic}</code> (${t.msg_type})`,
					)
					.join("<br>");
		} else {
			this.el.activeInfo.innerHTML = "";
		}
	}

	async _handleStart() {
		if (this.starting) return;
		this.starting = true;
		this._setStatus("");
		this.el.start.disabled = true;

		const opts = {};
		if (this.el.videoOn.checked) {
			opts.video = {
				topic: this.el.videoTopic.value,
				msg_type: this.el.videoMsgType.value || undefined,
				deviceId: this.el.videoDev.value || undefined,
				width: this.el.videoW.value || undefined,
				height: this.el.videoH.value || undefined,
				fps: this.el.videoFps.value || undefined,
				jpegQuality: this.el.videoQ.value
					? parseFloat(this.el.videoQ.value)
					: undefined,
			};
		}
		if (this.el.audioOn.checked) {
			opts.audio = {
				topic: this.el.audioTopic.value,
				msg_type: this.el.audioMsgType.value || undefined,
				deviceId: this.el.audioDev.value || undefined,
				sampleRate: this.el.audioRate.value || undefined,
			};
		}

		try {
			const res = await this.client.publishMedia(opts);
			if (!res.success) {
				this._setStatus(res.error || "Failed to start");
			} else {
				this._setStatus("Publishing.", false);
			}
		} catch (e) {
			this._setStatus("Error: " + (e.message || e));
		} finally {
			this.starting = false;
			this.el.start.disabled = false;
			this._refreshActiveState();
			this._updateButtonState();
		}
	}

	async _handleStop() {
		this.el.stop.disabled = true;
		try {
			await this.client.stopPublishingMedia();
			this._setStatus("Stopped.", false);
		} catch (e) {
			this._setStatus("Error stopping: " + (e.message || e));
		} finally {
			this.el.stop.disabled = false;
			this._refreshActiveState();
			this._updateButtonState();
		}
	}

	_updateButtonState() {
		const connected = this.client.pc && this.client.pc.connectionState === "connected";
		const active = this.client.isPublishingMedia();
		this.btn.classList.toggle("disabled", !connected && !active);
		this.btn.classList.toggle("active", active);
		this.btn.querySelector(".label").textContent = active
			? "Publishing… (click to manage)"
			: "Publish Media";
		if (this.dialog_open) this._refreshActiveState();
	}
}
