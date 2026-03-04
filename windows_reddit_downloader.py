import hashlib
import json
import re
import shutil
import subprocess
import threading
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

import requests
import tkinter as tk
from tkinter import messagebox, ttk
from PIL import Image, ImageTk
import sys
import os

APP_NAME = "Reddit Downloader (Windows)"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) RedditDownloaderWin/3.1"
VALID_EXT = {".jpg", ".jpeg", ".png", ".gif", ".mp4", ".webm"}
VIDEO_EXT = {".mp4", ".webm"}
BG = "#0b1220"
CARD = "#111a2e"
CARD_ALT = "#0f172a"
TEXT = "#e5ecf7"
SUBTEXT = "#98a8c2"
ACCENT = "#4f8cff"
WARN = "#f59e0b"
SUCCESS = "#22c55e"
BORDER = "#223150"
LOG_BG = "#0a1020"
ERROR = "#ef4444"


def normalize_input(value: str) -> tuple[str, str]:
    text = value.strip()
    if not text:
        raise ValueError("Please enter a username, subreddit, or Reddit URL.")

    if text.startswith("http://") or text.startswith("https://"):
        parsed = urlparse(text)
        parts = [p for p in parsed.path.split("/") if p]
        if len(parts) >= 2 and parts[0].lower() in {"user", "u"}:
            return "user", parts[1]
        if len(parts) >= 2 and parts[0].lower() == "r":
            return "subreddit", parts[1]
        raise ValueError("Unsupported Reddit URL format.")

    if text.lower().startswith("u/"):
        return "user", text[2:]
    if text.lower().startswith("r/"):
        return "subreddit", text[2:]
    return "user", text


def sanitize_filename(name: str) -> str:
    name = re.sub(r"[^a-zA-Z0-9._-]+", "-", name)
    return name.strip("-._")[:80] or "file"


def build_listing_url(kind: str, value: str, after: str | None) -> str:
    if kind == "user":
        base = f"https://www.reddit.com/user/{value}/submitted/.json"
    else:
        base = f"https://www.reddit.com/r/{value}/new/.json"
    return f"{base}?limit=100" + (f"&after={after}" if after else "")


def detect_ext(url: str, default: str = ".bin") -> str:
    ext = Path(urlparse(url).path).suffix.lower()
    return ext if ext in VALID_EXT else default


def ffmpeg_path() -> str | None:
    return shutil.which("ffmpeg")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 256), b""):
            if chunk:
                h.update(chunk)
    return h.hexdigest()


def audio_candidate_from_video(video_url: str) -> str | None:
    parsed = urlparse(video_url)
    p = parsed.path
    if "DASH_" not in p:
        return None
    base = p.rsplit("/", 1)[0]
    return f"{parsed.scheme}://{parsed.netloc}{base}/DASH_AUDIO_128.mp4"


def get_media_entries(post_data: dict) -> list[dict]:
    entries = []
    seen = set()

    def add(url: str, kind: str, audio_url: str | None = None):
        if not url or url in seen:
            return
        seen.add(url)
        entries.append({"url": url, "kind": kind, "audio_url": audio_url})

    url = post_data.get("url_overridden_by_dest") or post_data.get("url")
    if isinstance(url, str):
        ext = detect_ext(url, "")
        if ext:
            add(url, "video" if ext in VIDEO_EXT else "photo")

    gallery = post_data.get("gallery_data")
    meta = post_data.get("media_metadata")
    if gallery and meta:
        for item in gallery.get("items", []):
            media = meta.get(item.get("media_id"), {})
            source = media.get("s", {})
            candidate = source.get("u")
            if candidate:
                cleaned = candidate.replace("&amp;", "&")
                ext = detect_ext(cleaned, ".jpg")
                add(cleaned, "video" if ext in VIDEO_EXT else "photo")

    secure_media = post_data.get("secure_media") or {}
    reddit_video = (secure_media.get("reddit_video") or {}).get("fallback_url")
    if reddit_video:
        add(reddit_video, "reddit_video", audio_candidate_from_video(reddit_video))

    return entries


class App:
    def __init__(self, root: tk.Tk):
        self.root = root
        root.title(APP_NAME)
        root.geometry("980x720")
        root.minsize(860, 620)
        root.configure(bg=BG)

        self.input_var = tk.StringVar()
        self.status_var = tk.StringVar(value="Ready")
        self.progress_var = tk.DoubleVar(value=0.0)
        self.count_var = tk.StringVar(value="Downloaded: 0 | Skipped: 0")
        self.summary_var = tk.StringVar(value="Ready to download")
        self.output_var = tk.StringVar(value="Output: -")
        self.downloaded_var = tk.StringVar(value="0")
        self.skipped_var = tk.StringVar(value="0")
        self.mode_var = tk.StringVar(value="Idle")
        self.ffmpeg_var = tk.StringVar(value="ffmpeg: Optional")

        self.skip_duplicates_var = tk.BooleanVar(value=True)
        self.batch_mode_var = tk.BooleanVar(value=False)
        self.batch_size_var = tk.IntVar(value=25)
        self.batch_pause_var = tk.IntVar(value=10)
        self.request_delay_var = tk.DoubleVar(value=0.5)

        self.running = False
        self.cancel_event = threading.Event()
        self.pause_event = threading.Event()
        self.pause_event.set()
        self.worker_thread = None
        self.pause_enable_at = 0.0

        self.downloaded_hashes = set()
        self.existing_names = set()
        self.last_output_folder: Path | None = None

        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT})

        self._setup_styles()
        self._build_ui()

    def _setup_styles(self):
        style = ttk.Style(self.root)
        if "clam" in style.theme_names():
            style.theme_use("clam")
        style.configure("Title.TLabel", font=("Segoe UI Semibold", 20), foreground=TEXT, background=CARD)
        style.configure("Sub.TLabel", font=("Segoe UI", 10), foreground=SUBTEXT, background=CARD)
        style.configure("Card.TFrame", background=CARD)
        style.configure("Panel.TLabelframe", background=CARD)
        style.configure("Panel.TLabelframe.Label", background=CARD, foreground=TEXT, font=("Segoe UI Semibold", 10))
        style.configure("TLabel", background=CARD, foreground=TEXT)
        style.configure("TEntry", fieldbackground=CARD_ALT, foreground=TEXT, bordercolor=BORDER, lightcolor=BORDER, darkcolor=BORDER)
        style.configure("TButton", background=CARD_ALT, foreground=TEXT, bordercolor=BORDER, focusthickness=1, focuscolor=BORDER, padding=6)
        style.map("TButton", background=[("active", "#1b2945")])
        style.configure("TSpinbox", fieldbackground=CARD_ALT, foreground=TEXT, bordercolor=BORDER, arrowsize=12)
        style.configure("Horizontal.TProgressbar", troughcolor=CARD_ALT, background=ACCENT, bordercolor=BORDER, lightcolor=ACCENT, darkcolor=ACCENT)

    def _build_ui(self):
        container = tk.Frame(self.root, bg=BG)
        container.pack(fill="both", expand=True, padx=18, pady=18)

        card = tk.Frame(container, bg=CARD, highlightthickness=1, highlightbackground=BORDER)
        card.pack(fill="both", expand=True)

        try:
            def resource_path(relative_path):
                try:
                    base_path = sys._MEIPASS
                except Exception:
                    base_path = os.path.abspath(".")
                return os.path.join(base_path, relative_path)
                
            img_path = resource_path("header_banner_1772103986106.png")
            if os.path.exists(img_path):
                img = Image.open(img_path)
                img = img.resize((980, 120), Image.Resampling.LANCZOS)
                self.header_img = ImageTk.PhotoImage(img)
                img_lbl = tk.Label(card, image=self.header_img, bg=CARD, bd=0)
                img_lbl.pack(fill="x", pady=(0, 10))
        except Exception as e:
            print("Could not load header image:", e)

        header = tk.Frame(card, bg=CARD)
        header.pack(fill="x", padx=18, pady=(14, 6))
        ttk.Label(header, text="Reddit Profile Downloader", style="Title.TLabel").pack(side="left")

        right = tk.Frame(header, bg=CARD)
        right.pack(side="right")
        ttk.Button(right, text="Open Output", command=self.open_output_folder).pack(side="left", padx=(0, 8))
        ttk.Button(right, text="Settings", command=self.open_settings_dialog).pack(side="left", padx=(0, 8))
        ttk.Button(right, text="About", command=self.open_about_dialog).pack(side="left")

        ttk.Label(card, text="Download photos and videos from public Reddit profiles and subreddits.", style="Sub.TLabel").pack(anchor="w", padx=20)

        top_controls = tk.Frame(card, bg=CARD)
        top_controls.pack(fill="x", padx=18, pady=(12, 8))
        ttk.Label(top_controls, text="Input").pack(anchor="w")

        input_row = tk.Frame(top_controls, bg=CARD)
        input_row.pack(fill="x", pady=(6, 0))
        self.input_entry = ttk.Entry(input_row, textvariable=self.input_var)
        self.input_entry.pack(side="left", fill="x", expand=True)
        self.start_btn = ttk.Button(input_row, text="Start Download", command=self.start_download)
        self.start_btn.pack(side="left", padx=(8, 0))
        self.pause_btn = ttk.Button(input_row, text="Pause", command=self.toggle_pause, state="disabled")
        self.pause_btn.pack(side="left", padx=(8, 0))
        self.cancel_btn = ttk.Button(input_row, text="Stop", command=self.cancel_download, state="disabled")
        self.cancel_btn.pack(side="left", padx=(8, 0))

        badge_row = tk.Frame(card, bg=CARD)
        badge_row.pack(fill="x", padx=18, pady=(8, 4))
        self.badge_downloaded = tk.Label(badge_row, text="Downloaded", bg=CARD_ALT, fg=SUBTEXT, padx=10, pady=6, relief="solid", bd=1, highlightbackground=BORDER, highlightcolor=BORDER, highlightthickness=1)
        self.badge_downloaded.pack(side="left")
        tk.Label(badge_row, textvariable=self.downloaded_var, bg=CARD_ALT, fg=SUCCESS, padx=8, pady=6, font=("Segoe UI Semibold", 10)).pack(side="left")
        tk.Label(badge_row, text="  ", bg=CARD).pack(side="left")
        tk.Label(badge_row, text="Skipped", bg=CARD_ALT, fg=SUBTEXT, padx=10, pady=6, relief="solid", bd=1, highlightbackground=BORDER, highlightcolor=BORDER, highlightthickness=1).pack(side="left")
        tk.Label(badge_row, textvariable=self.skipped_var, bg=CARD_ALT, fg=WARN, padx=8, pady=6, font=("Segoe UI Semibold", 10)).pack(side="left")
        tk.Label(badge_row, text="  ", bg=CARD).pack(side="left")
        tk.Label(badge_row, textvariable=self.mode_var, bg=CARD_ALT, fg=ACCENT, padx=10, pady=6, font=("Segoe UI Semibold", 9), relief="solid", bd=1, highlightbackground=BORDER, highlightcolor=BORDER, highlightthickness=1).pack(side="left")
        tk.Label(badge_row, text="  ", bg=CARD).pack(side="left")
        tk.Label(badge_row, textvariable=self.ffmpeg_var, bg=CARD_ALT, fg=SUBTEXT, padx=10, pady=6, font=("Segoe UI", 9), relief="solid", bd=1, highlightbackground=BORDER, highlightcolor=BORDER, highlightthickness=1).pack(side="left")

        info_row = tk.Frame(card, bg=CARD)
        info_row.pack(fill="x", padx=18, pady=(6, 4))
        ttk.Label(info_row, textvariable=self.summary_var, style="Sub.TLabel").pack(side="left")

        pframe = tk.Frame(card, bg=CARD)
        pframe.pack(fill="x", padx=18, pady=(4, 8))
        ttk.Progressbar(pframe, variable=self.progress_var, maximum=100).pack(fill="x")

        stats = tk.Frame(card, bg=CARD)
        stats.pack(fill="x", padx=18)
        self.status_lbl = tk.Label(stats, textvariable=self.status_var, fg=SUCCESS, bg=CARD, font=("Segoe UI Semibold", 10))
        self.status_lbl.pack(side="left")
        tk.Label(stats, text="   ", bg=CARD).pack(side="left")
        ttk.Label(stats, textvariable=self.count_var, style="Sub.TLabel").pack(side="left")

        ttk.Label(card, textvariable=self.output_var, style="Sub.TLabel").pack(anchor="w", padx=18, pady=(2, 6))

        logs_panel = ttk.LabelFrame(card, text="Activity Log", style="Panel.TLabelframe")
        logs_panel.pack(fill="both", expand=True, padx=18, pady=(4, 16))

        log_wrap = tk.Frame(logs_panel, bg=CARD)
        log_wrap.pack(fill="both", expand=True, padx=8, pady=8)
        self.log = tk.Text(log_wrap, height=22, state="disabled", bg=LOG_BG, fg=TEXT, insertbackground=TEXT, bd=1, relief="solid", font=("Consolas", 10))
        self.log.pack(side="left", fill="both", expand=True)
        yscroll = ttk.Scrollbar(log_wrap, orient="vertical", command=self.log.yview)
        yscroll.pack(side="right", fill="y")
        self.log.configure(yscrollcommand=yscroll.set)

    def ui(self, fn, *args, **kwargs):
        self.root.after(0, lambda: fn(*args, **kwargs))

    def append_log(self, text: str):
        def _append():
            timestamp = datetime.now().strftime("%H:%M:%S")
            self.log.configure(state="normal")
            self.log.insert("end", f"[{timestamp}] {text}\n")
            self.log.see("end")
            self.log.configure(state="disabled")

        self.ui(_append)

    def set_status(self, text: str, color: str = SUCCESS):
        self.ui(self.status_var.set, text)
        self.ui(self.status_lbl.configure, fg=color)

    def set_counts(self, downloaded: int, skipped: int):
        self.ui(self.count_var.set, f"Downloaded: {downloaded} | Skipped: {skipped}")
        self.ui(self.downloaded_var.set, str(downloaded))
        self.ui(self.skipped_var.set, str(skipped))

    def set_progress(self, percent: float):
        self.ui(self.progress_var.set, percent)

    def set_summary(self, text: str):
        self.ui(self.summary_var.set, text)

    def set_output(self, path: Path | None):
        self.last_output_folder = path
        text = f"Output: {path}" if path else "Output: -"
        self.ui(self.output_var.set, text)

    def open_output_folder(self):
        if not self.last_output_folder or not self.last_output_folder.exists():
            messagebox.showinfo("Output", "No output folder available yet.")
            return
        subprocess.run(["explorer", str(self.last_output_folder)], check=False)

    def open_settings_dialog(self):
        dlg = tk.Toplevel(self.root)
        dlg.title("Settings")
        dlg.geometry("420x260")
        dlg.resizable(False, False)
        dlg.configure(bg=BG)
        dlg.transient(self.root)
        dlg.grab_set()

        body = tk.Frame(dlg, bg=CARD, highlightthickness=1, highlightbackground=BORDER)
        body.pack(fill="both", expand=True, padx=12, pady=12)

        ttk.Checkbutton(body, text="Skip duplicates (SHA256)", variable=self.skip_duplicates_var).grid(row=0, column=0, sticky="w", padx=14, pady=(14, 8), columnspan=2)
        ttk.Checkbutton(body, text="Enable batch mode", variable=self.batch_mode_var).grid(row=1, column=0, sticky="w", padx=14, pady=8, columnspan=2)

        ttk.Label(body, text="Batch size:").grid(row=2, column=0, sticky="w", padx=14, pady=8)
        ttk.Spinbox(body, from_=1, to=200, textvariable=self.batch_size_var, width=10).grid(row=2, column=1, sticky="e", padx=14)

        ttk.Label(body, text="Batch pause (seconds):").grid(row=3, column=0, sticky="w", padx=14, pady=8)
        ttk.Spinbox(body, from_=1, to=300, textvariable=self.batch_pause_var, width=10).grid(row=3, column=1, sticky="e", padx=14)

        ttk.Label(body, text="Request delay (seconds):").grid(row=4, column=0, sticky="w", padx=14, pady=8)
        ttk.Spinbox(body, from_=0.1, to=5.0, increment=0.1, textvariable=self.request_delay_var, width=10).grid(row=4, column=1, sticky="e", padx=14)

        ttk.Button(body, text="Close", command=dlg.destroy).grid(row=5, column=1, sticky="e", padx=14, pady=14)

    def open_about_dialog(self):
        ff = "Found" if ffmpeg_path() else "Not found"
        messagebox.showinfo(
            "About",
            "Reddit Downloader (Windows)\n"
            "Version 3.0\n\n"
            "Features:\n"
            "- Pause / Resume / Cancel\n"
            "- SHA256 duplicate detection\n"
            "- Batch mode\n"
            "- Optional ffmpeg video muxing\n\n"
            f"ffmpeg: {ff}",
        )

    def wait_if_paused_or_cancelled(self) -> bool:
        while not self.cancel_event.is_set():
            if self.pause_event.is_set():
                return False
            time.sleep(0.15)
        return True

    def start_download(self):
        if self.running:
            return
        if not self.input_var.get().strip():
            messagebox.showerror("Missing input", "Enter a username, subreddit, or URL.")
            return

        self.running = True
        self.cancel_event.clear()
        self.pause_event.set()
        self.start_btn.configure(state="disabled")
        self.pause_enable_at = time.time() + 1.2
        self.pause_btn.configure(state="disabled", text="Pause")
        self.cancel_btn.configure(state="normal")
        self.progress_var.set(0)
        self.set_counts(0, 0)
        self.set_status("Starting...", ACCENT)
        self.set_summary("Collecting Reddit posts")
        self.ui(self.mode_var.set, "Initializing")
        self.root.after(1250, self.enable_pause_if_running)

        self.worker_thread = threading.Thread(target=self.download_worker, daemon=True)
        self.worker_thread.start()

    def toggle_pause(self):
        if not self.running:
            return
        if time.time() < self.pause_enable_at:
            return
        if self.pause_event.is_set():
            self.pause_event.clear()
            self.pause_btn.configure(text="Resume")
            self.append_log("Paused")
            self.set_status("Paused", WARN)
            self.set_summary("Paused by user")
            self.ui(self.mode_var.set, "Paused")
        else:
            self.pause_event.set()
            self.pause_btn.configure(text="Pause")
            self.append_log("Resumed")
            self.set_status("Resuming...", ACCENT)
            self.set_summary("Resuming downloads")
            self.ui(self.mode_var.set, "Running")

    def enable_pause_if_running(self):
        if self.running and not self.cancel_event.is_set():
            self.pause_btn.configure(state="normal")

    def cancel_download(self):
        if not self.running:
            return
        self.cancel_event.set()
        self.pause_event.set()
        self.append_log("Cancel requested")
        self.set_status("Cancelling...", WARN)
        self.set_summary("Stopping active downloads")
        self.ui(self.mode_var.set, "Stopping")

    def pre_scan_existing(self, target_root: Path):
        self.downloaded_hashes.clear()
        self.existing_names.clear()
        if not target_root.exists():
            return
        for p in target_root.rglob("*"):
            if p.is_file() and p.name.lower() != "index.json":
                self.existing_names.add(p.name)
                if self.skip_duplicates_var.get():
                    try:
                        self.downloaded_hashes.add(sha256_file(p))
                    except Exception:
                        pass

    def request_json(self, url: str) -> dict:
        resp = self.session.get(url, timeout=30)
        if resp.status_code != 200:
            raise RuntimeError(f"Reddit API returned {resp.status_code}")
        return resp.json()

    def stream_download(self, url: str, out_path: Path) -> bool:
        with self.session.get(url, timeout=45, stream=True) as r:
            if r.status_code != 200:
                return False
            with open(out_path, "wb") as f:
                for chunk in r.iter_content(chunk_size=128 * 1024):
                    if self.cancel_event.is_set():
                        return False
                    if self.wait_if_paused_or_cancelled():
                        return False
                    if chunk:
                        f.write(chunk)
        return True

    def try_mux_reddit_video(self, video_path: Path, audio_url: str | None) -> Path:
        ffmpeg = ffmpeg_path()
        if not ffmpeg or not audio_url:
            return video_path

        audio_tmp = video_path.with_suffix(".audio.mp4")
        merged_tmp = video_path.with_suffix(".merged.mp4")
        try:
            if not self.stream_download(audio_url, audio_tmp):
                return video_path

            cmd = [ffmpeg, "-y", "-i", str(video_path), "-i", str(audio_tmp), "-c", "copy", str(merged_tmp)]
            completed = subprocess.run(cmd, capture_output=True, text=True)
            if completed.returncode == 0 and merged_tmp.exists() and merged_tmp.stat().st_size > 0:
                video_path.unlink(missing_ok=True)
                merged_tmp.replace(video_path)
                self.append_log(f"Muxed audio+video: {video_path.name}")
        except Exception as ex:
            self.append_log(f"ffmpeg mux failed: {ex}")
        finally:
            audio_tmp.unlink(missing_ok=True)
            merged_tmp.unlink(missing_ok=True)
        return video_path

    def download_worker(self):
        downloaded = 0
        skipped = 0
        total = 0

        try:
            kind, value = normalize_input(self.input_var.get())
            stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            target_root = Path.home() / "Downloads" / "RedditDownloads" / f"{kind}_{value}_{stamp}"
            photos = target_root / "Photos"
            videos = target_root / "Videos"
            photos.mkdir(parents=True, exist_ok=True)
            videos.mkdir(parents=True, exist_ok=True)
            self.set_output(target_root)

            self.append_log(f"Fetching posts for {kind}/{value}")
            has_ffmpeg = ffmpeg_path() is not None
            self.ui(self.ffmpeg_var.set, "ffmpeg: Enabled" if has_ffmpeg else "ffmpeg: Optional")
            self.append_log("ffmpeg detected: reddit videos can be muxed with audio" if has_ffmpeg else "ffmpeg not installed (optional): videos still download normally")
            self.pre_scan_existing(target_root)

            all_media = []
            after = None
            for _ in range(12):
                if self.cancel_event.is_set() or self.wait_if_paused_or_cancelled():
                    break

                payload = self.request_json(build_listing_url(kind, value, after))
                children = payload.get("data", {}).get("children", [])
                if not children:
                    break

                for child in children:
                    post = child.get("data", {})
                    post_id = post.get("id", "post")
                    title = sanitize_filename(post.get("title", "untitled"))
                    created = datetime.fromtimestamp(post.get("created_utc", time.time())).strftime("%Y%m%d")
                    for idx, entry in enumerate(get_media_entries(post), start=1):
                        all_media.append((created, post_id, title, idx, entry))

                after = payload.get("data", {}).get("after")
                if not after:
                    break
                time.sleep(max(0.1, float(self.request_delay_var.get())))

            total = len(all_media)
            if total == 0:
                self.set_status("No media found", WARN)
                self.set_summary("No downloadable media in the selected source")
                self.append_log("No media found")
                return

            self.append_log(f"Found {total} media entries")
            self.set_summary(f"Downloading {total} media files")
            self.ui(self.mode_var.set, "Running")

            batch_mode = self.batch_mode_var.get()
            batch_size = max(1, int(self.batch_size_var.get()))
            batch_pause = max(1, int(self.batch_pause_var.get()))

            for i, (date_s, post_id, title, media_idx, entry) in enumerate(all_media, start=1):
                if self.cancel_event.is_set() or self.wait_if_paused_or_cancelled():
                    break

                url = entry["url"]
                ext = detect_ext(url)
                filename = f"{date_s}_{post_id}_{title}_{media_idx:03d}{ext}"
                out_dir = videos if ext in VIDEO_EXT else photos
                out_path = out_dir / filename

                self.set_status(f"Downloading {i}/{total}", ACCENT)
                self.set_summary(f"Processing {filename[:54]}")
                self.set_progress((i - 1) / total * 100)

                if filename in self.existing_names:
                    skipped += 1
                    self.append_log(f"Skipped existing: {filename}")
                    self.set_counts(downloaded, skipped)
                    continue

                try:
                    ok = self.stream_download(url, out_path)
                    if not ok:
                        out_path.unlink(missing_ok=True)
                        if self.cancel_event.is_set():
                            break
                        skipped += 1
                        self.append_log(f"Failed: {url}")
                        self.set_counts(downloaded, skipped)
                        continue

                    if entry["kind"] == "reddit_video":
                        out_path = self.try_mux_reddit_video(out_path, entry.get("audio_url"))

                    if self.skip_duplicates_var.get():
                        file_hash = sha256_file(out_path)
                        if file_hash in self.downloaded_hashes:
                            out_path.unlink(missing_ok=True)
                            skipped += 1
                            self.append_log(f"Skipped duplicate: {filename}")
                            self.set_counts(downloaded, skipped)
                            continue
                        self.downloaded_hashes.add(file_hash)

                    downloaded += 1
                    self.existing_names.add(filename)
                    self.append_log(f"Saved: {filename}")
                    self.set_counts(downloaded, skipped)
                except Exception as ex:
                    skipped += 1
                    out_path.unlink(missing_ok=True)
                    self.append_log(f"Error downloading {url}: {ex}")
                    self.set_counts(downloaded, skipped)

                if batch_mode and i % batch_size == 0 and i < total and not self.cancel_event.is_set():
                    self.append_log(f"Batch pause: {batch_pause}s")
                    self.set_status("Batch pause", WARN)
                    self.ui(self.mode_var.set, "Batch Pause")
                    for _ in range(batch_pause * 10):
                        if self.cancel_event.is_set() or self.wait_if_paused_or_cancelled():
                            break
                        time.sleep(0.1)
                    if not self.cancel_event.is_set():
                        self.ui(self.mode_var.set, "Running")

            result = {
                "source": f"{kind}/{value}",
                "downloaded": downloaded,
                "skipped": skipped,
                "total_found": total,
                "finished_at": datetime.now().isoformat(),
            }
            with open(target_root / "index.json", "w", encoding="utf-8") as f:
                json.dump(result, f, indent=2)

            if self.cancel_event.is_set():
                self.set_status("Cancelled", WARN)
                self.set_summary("Download cancelled")
                self.append_log("Cancelled")
                self.ui(self.mode_var.set, "Cancelled")
            else:
                self.set_progress(100)
                self.set_status("Completed", SUCCESS)
                self.set_summary("All downloads finished")
                self.append_log(f"Completed. Output: {target_root}")
                self.ui(self.mode_var.set, "Completed")

        except Exception as ex:
            self.set_status("Failed", ERROR)
            self.set_summary("An error occurred")
            self.append_log(f"Error: {ex}")
            self.ui(self.mode_var.set, "Failed")
            self.ui(messagebox.showerror, "Download error", str(ex))
        finally:
            self.running = False
            self.ui(self.start_btn.configure, state="normal")
            self.ui(self.pause_btn.configure, state="disabled", text="Pause")
            self.ui(self.cancel_btn.configure, state="disabled")


def main():
    root = tk.Tk()
    App(root)
    root.mainloop()


if __name__ == "__main__":
    main()
