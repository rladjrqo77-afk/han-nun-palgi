(() => {
  "use strict";

  const TZ = "Asia/Seoul";
  const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const MEMO_KEY = "han-nun-palgi-memo";
  const MEMO_DEFAULT = "Dasom Jung, a graphic designer working across branding, typography, editorial design, and exhibition graphics. Some of my work is here. The rest is in a folder somewhere. I'm based in Seoul, but someday I'd like to live and work in my hometown...";

  const dateEl = document.getElementById("live-date");
  const timeEl = document.getElementById("live-time");
  const photosEl = document.getElementById("photos");
  const folderCat = document.getElementById("folder-cat");
  const folderDog = document.getElementById("folder-dog");
  const folders = [folderCat, folderDog];
  const dockMusic = document.getElementById("dock-music");
  const dockMemo = document.getElementById("dock-memo");
  const memoWindow = document.getElementById("memo-window");
  const memoBody = document.getElementById("memo-body");
  const memoClose = document.getElementById("memo-close");
  const memoTitlebar = document.getElementById("memo-titlebar");
  const memoSidebarList = document.getElementById("memo-sidebar-list");
  const memoNewBtn = document.getElementById("memo-new");
  const MEMO_TITLE_EMPTY = "새로운 메모";
  const MEMO_STORE_KEY = "han-nun-palgi-memo-notes-v18";
  const audio = document.getElementById("bg-music");
  const folderWindow = document.getElementById("folder-window");
  const folderWindowTitle = document.getElementById("folder-window-title");
  const folderWindowGrid = document.getElementById("folder-window-grid");
  const folderWindowClose = document.getElementById("folder-window-close");
  const photoViewer = document.getElementById("photo-viewer");
  const photoViewerClose = document.getElementById("photo-viewer-close");
  const photoViewerTitle = document.getElementById("photo-viewer-title");
  const photoViewerImg = document.getElementById("photo-viewer-img");
  const photoViewerPrev = document.getElementById("photo-viewer-prev");
  const photoViewerNext = document.getElementById("photo-viewer-next");
  let photoViewerIndex = -1;

  
  const desktopEl = document.getElementById("desktop");
  const foldersLayerEl = document.getElementById("folders-layer");
  const ARTBOARD_W = 1920;
  const ARTBOARD_H = 1080;

  function artboardScale() {
    // Contain: full 1920x1080 always visible; may upscale above 1 on large screens
    return Math.min(window.innerWidth / ARTBOARD_W, window.innerHeight / ARTBOARD_H);
  }

  function fitArtboard() {
    const s = artboardScale();
    // Absolute center on stage; contain scale (shrink or enlarge). Overflow hidden - no page scroll.
    const t = "translate(-50%, -50%) scale(" + s + ")";
    if (desktopEl) desktopEl.style.transform = t;
    if (foldersLayerEl) foldersLayerEl.style.transform = t;
    document.documentElement.style.setProperty("--stage-scale", String(s));
  }

  fitArtboard();
  window.addEventListener("resize", fitArtboard);

  /* Windows raise from 300+ inside .desktop (above --photos-z); photos raise only within #photos */
  const WINDOW_Z_BASE = 300;
  let windowZTop = WINDOW_Z_BASE;
  let photoZTop = 40;

  function raiseWindow(el) {
    if (!el || el.hidden) return;
    windowZTop += 1;
    el.style.zIndex = String(windowZTop);
  }
  let dragging = null;
  const collections = { cat: [], dog: [] };
  let openFolderId = null;
  let viewerFolderId = null;

  /* --- Clock (Asia/Seoul) --- */
  function partsInSeoul(date = new Date()) {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
    const map = {};
    for (const p of fmt.formatToParts(date)) {
      if (p.type !== "literal") map[p.type] = p.value;
    }
    return map;
  }

  function weekdayCode(shortName) {
    const key = String(shortName || "").slice(0, 3).toUpperCase();
    return DAY_NAMES.includes(key) ? key : key;
  }

  function tickClock() {
    const p = partsInSeoul();
    const yyyy = String(p.year);
    const mm = String(p.month).padStart(2, "0");
    const dd = String(p.day).padStart(2, "0");
    const weekday = weekdayCode(p.weekday);
    const dateText = yyyy + "/" + mm + "/" + dd + " " + weekday;
    const hour = String(p.hour);
    const minute = String(p.minute).padStart(2, "0");
    const second = String(p.second).padStart(2, "0");
    let ampm = String(p.dayPeriod || "").replace(/\./g, "").replace(/\s+/g, "").toUpperCase();
    if (ampm !== "AM" && ampm !== "PM") {
      ampm = /P|후/i.test(String(p.dayPeriod || "")) ? "PM" : "AM";
    }
    const timeText = hour + ":" + minute + ":" + second + " " + ampm;
    dateEl.textContent = dateText;
    timeEl.textContent = timeText;
    const isoGuess = new Date().toLocaleString("sv-SE", { timeZone: TZ }).replace(" ", "T");
    dateEl.setAttribute("datetime", isoGuess);
    timeEl.setAttribute("datetime", isoGuess);
  }

  tickClock();
  setInterval(tickClock, 250);

  /* --- Photo scatter --- */
  function encodeSrc(path) {
    return path
      .split("/")
      .map((seg, i, arr) => (i === arr.length - 1 ? encodeURIComponent(seg) : seg))
      .join("/");
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function seededShuffle(arr, seed) {
    const a = arr.slice();
    let s = seed;
    for (let i = a.length - 1; i > 0; i--) {
      s = (s * 16807) % 2147483647;
      const j = s % (i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* Fresh seed each page load so refresh reshuffles; stable within the session (resize reflow) */
  const SESSION_SEED =
    (Date.now() ^ Math.floor(Math.random() * 2147483647)) >>> 0 || 1;

  function layoutSeed() {
    return SESSION_SEED;
  }

  function makeRng(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return function rng() {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  function photoDisplayWidth(base) {
    const s = artboardScale() || 1;
    return Math.round(base * Math.min(1.2, Math.max(0.95, s)));
  }

  /** Dock soft nudge only */
  function softAvoidCenters() {
    const pts = [];
    const dockEl = document.getElementById("dock");
    if (dockEl) {
      const r = dockEl.getBoundingClientRect();
      pts.push({
        x: (r.left + r.right) / 2,
        y: (r.top + r.bottom) / 2,
        r: Math.max(r.width, r.height) * 0.3,
      });
    }
    return pts;
  }

  /** Minimal keep-out: hug icons/labels — almost no void under Dog/Cat */
  function folderKeepOut() {
    const s = artboardScale() || 1;
    const folderNodes = [folderCat, folderDog].filter(Boolean);
    if (!folderNodes.length) {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight * 0.48;
      return {
        left: cx - 56 * s,
        top: cy - 40 * s,
        right: cx + 56 * s,
        bottom: cy + 28 * s,
      };
    }
    let left = Infinity,
      top = Infinity,
      right = -Infinity,
      bottom = -Infinity;
    folderNodes.forEach((f) => {
      const r = f.getBoundingClientRect();
      left = Math.min(left, r.left);
      top = Math.min(top, r.top);
      right = Math.max(right, r.right);
      bottom = Math.max(bottom, r.bottom);
    });
    // Barely past bounds; bottom pad near-zero so photos tuck under labels
    const padX = Math.max(4, 5 * s);
    const padTop = Math.max(3, 4 * s);
    const padBottom = Math.max(0, 1 * s);
    return {
      left: left - padX,
      top: top - padTop,
      right: right + padX,
      bottom: bottom + padBottom,
    };
  }

  function centerInKeepOut(x, y, halfW, halfH, ko) {
    if (!ko) return false;
    const l = x - halfW;
    const r = x + halfW;
    const t = y - halfH;
    const b = y + halfH;
    return !(r < ko.left || l > ko.right || b < ko.top || t > ko.bottom);
  }

  function pushOutOfKeepOut(pos, halfW, halfH, ko) {
    if (!ko || !centerInKeepOut(pos.x, pos.y, halfW, halfH, ko)) return;
    const cx = (ko.left + ko.right) / 2;
    const cy = (ko.top + ko.bottom) / 2;
    const dx = pos.x - cx;
    const dy = pos.y - cy;
    // Push to nearest edge of keep-out
    const toL = Math.abs(pos.x - ko.left);
    const toR = Math.abs(ko.right - pos.x);
    const toT = Math.abs(pos.y - ko.top);
    const toB = Math.abs(ko.bottom - pos.y);
    const m = Math.min(toL, toR, toT, toB);
    if (m === toL) pos.x = ko.left - halfW - 2;
    else if (m === toR) pos.x = ko.right + halfW + 2;
    else if (m === toT) pos.y = ko.top - halfH - 2;
    else pos.y = ko.bottom + halfH + 2;
  }


  /**
   * Midway desk coverage: jittered grid + min-distance relax.
   * Hard Cat/Dog keep-out; optional soft dock nudge.
   */
  function layoutPhotos() {
    const nodeList = photosEl
      ? photosEl.querySelectorAll(".photo:not(.is-gone)")
      : [];
    const photos = Array.prototype.slice.call(nodeList);
    if (!photos.length) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 2;
    const rng = makeRng(layoutSeed());
    const n = photos.length;

    const items = photos.map((el) => {
      const base = parseFloat(el.dataset.baseWidth) || 85;
      const w = photoDisplayWidth(base);
      return { el: el, w: w, h: w * 0.72 };
    });

    // Midway coverage, nudged ~5% sparser so lime peeks through a bit more
    const aspect = vw / Math.max(1, vh);
    let cols = Math.max(1, Math.ceil(Math.sqrt(n * aspect) * 1.03));
    let rows = Math.max(1, Math.ceil(n / cols));
    while (cols * rows < n) cols += 1;

    const cellW = (vw - margin * 2) / cols;
    const cellH = (vh - margin * 2) / rows;

    const cellIdx = [];
    for (let i = 0; i < cols * rows; i++) cellIdx.push(i);
    // shuffle cells, assign first n
    for (let i = cellIdx.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = cellIdx[i];
      cellIdx[i] = cellIdx[j];
      cellIdx[j] = tmp;
    }

    const ko = folderKeepOut();
    const positions = [];
    let cellCursor = 0;
    for (let i = 0; i < n; i++) {
      let placed = false;
      for (let tries = 0; tries < cols * rows && !placed; tries++) {
        const id = cellIdx[(cellCursor + tries) % cellIdx.length];
        const c = id % cols;
        const r = (id / cols) | 0;
        const jx = (rng() - 0.5) * cellW * 0.5;
        const jy = (rng() - 0.5) * cellH * 0.5;
        let x = margin + (c + 0.5) * cellW + jx;
        let y = margin + (r + 0.5) * cellH + jy;
        const hw = items[i].w / 2;
        const hh = items[i].h / 2;
        if (!centerInKeepOut(x, y, hw, hh, ko)) {
          positions.push({ x: x, y: y });
          cellCursor = (cellCursor + tries + 1) % cellIdx.length;
          placed = true;
        }
      }
      if (!placed) {
        // fallback outside keep-out horizontally
        const hw = items[i].w / 2;
        const hh = items[i].h / 2;
        const side = i % 2 === 0 ? margin + hw + 8 : vw - margin - hw - 8;
        positions.push({ x: side, y: Math.max(hh + 8, Math.min(vh - hh - 8, vh * 0.35 + (i % 7) * 40)) });
      }
    }

    // Min-distance relax — slight bump vs prior 0.48 for a bit more lime gap
    const minDist = Math.max(36, Math.min(cellW, cellH) * 0.52);
    const soft = softAvoidCenters();
    for (let iter = 0; iter < 18; iter++) {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          let dx = positions[j].x - positions[i].x;
          let dy = positions[j].y - positions[i].y;
          let d = Math.hypot(dx, dy) || 0.01;
          const need = minDist;
          if (d < need) {
            const push = ((need - d) / d) * 0.5;
            const ox = dx * push;
            const oy = dy * push;
            positions[i].x -= ox;
            positions[i].y -= oy;
            positions[j].x += ox;
            positions[j].y += oy;
          }
        }
        // Soft nudge from dock / folder centers
        soft.forEach((p) => {
          let dx = positions[i].x - p.x;
          let dy = positions[i].y - p.y;
          let d = Math.hypot(dx, dy) || 0.01;
          const softR = p.r;
          if (d < softR) {
            const push = ((softR - d) / d) * 0.2;
            positions[i].x += dx * push;
            positions[i].y += dy * push;
          }
        });
        pushOutOfKeepOut(
          positions[i],
          items[i].w / 2,
          items[i].h / 2,
          ko
        );
      }
      // Clamp so thumbs stay mostly on-screen
      for (let i = 0; i < n; i++) {
        const hw = items[i].w / 2;
        const hh = items[i].w * 0.55; // clamp using taller estimate so bottoms stay on desk
        positions[i].x = Math.min(vw - 4 - hw, Math.max(4 + hw, positions[i].x));
        positions[i].y = Math.min(vh - 8 - hh, Math.max(4 + hh * 0.35, positions[i].y));
      }
    }

    items.forEach((it, i) => {
      if (it.el.classList.contains("is-dragging")) return;
      it.el.style.width = it.w + "px";
      const hw = it.w / 2;
      const hh = it.h / 2;
      it.el.style.transform =
        "translate(" +
        (positions[i].x - hw) +
        "px, " +
        (positions[i].y - hh) +
        "px)";
    });
  }

  function createPhotos() {
    const srcs = Array.isArray(window.PHOTO_SRCS) ? window.PHOTO_SRCS : [];
    const ordered = seededShuffle(srcs, layoutSeed());
    const frag = document.createDocumentFragment();
    const rng = makeRng(layoutSeed() + 99);

    ordered.forEach((src, i) => {
      // ~0.8× prior 70–135 ? ~56–108
      const base = Math.round(56 + rng() * 52);
      const width = photoDisplayWidth(base);

      const el = document.createElement("figure");
      el.className = "photo";
      el.dataset.src = src;
      el.dataset.rot = "0";
      el.dataset.baseWidth = String(base);
      el.style.width = width + "px";
      el.style.zIndex = String(2 + (i % 40));
      el.style.transform = "translate(-9999px, -9999px)";

      const img = document.createElement("img");
      img.src = encodeSrc(src);
      img.alt = "";
      img.loading = i < 24 ? "eager" : "lazy";
      img.decoding = "async";
      img.draggable = false;

      el.appendChild(img);
      frag.appendChild(el);
    });

    photosEl.appendChild(frag);
  }

  createPhotos();
  requestAnimationFrame(() => layoutPhotos());
  window.addEventListener("resize", layoutPhotos);

  /* --- Folder browser window --- */
  function photoFileName(src) {
    const part = String(src || "").split("/").pop() || "Photo";
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  }

  function viewerPhotoList() {
    const id = viewerFolderId || openFolderId;
    if (!id || !collections[id]) return [];
    return collections[id].slice();
  }

  function syncPhotoViewerNav() {
    const list = viewerPhotoList();
    const multi = list.length > 1;
    if (photoViewerPrev) photoViewerPrev.hidden = !multi;
    if (photoViewerNext) photoViewerNext.hidden = !multi;
  }

  function showPhotoViewerAt(index) {
    const list = viewerPhotoList();
    if (!list.length || !photoViewerImg) return;
    const i = ((index % list.length) + list.length) % list.length;
    photoViewerIndex = i;
    const src = list[i];
    photoViewerImg.src = encodeSrc(src);
    photoViewerImg.alt = photoFileName(src);
    if (photoViewerTitle) photoViewerTitle.textContent = photoFileName(src);
    syncPhotoViewerNav();
  }

  function openPhotoViewer(src) {
    if (!photoViewer || !photoViewerImg || !src) return;
    viewerFolderId = openFolderId || viewerFolderId;
    const list = viewerPhotoList();
    const idx = list.indexOf(src);
    photoViewerIndex = idx >= 0 ? idx : 0;
    if (idx >= 0) showPhotoViewerAt(idx);
    else {
      photoViewerImg.src = encodeSrc(src);
      photoViewerImg.alt = photoFileName(src);
      if (photoViewerTitle) photoViewerTitle.textContent = photoFileName(src);
      syncPhotoViewerNav();
    }
    photoViewer.hidden = false;
    photoViewer.removeAttribute("hidden");
    raiseWindow(photoViewer);
  }

  function stepPhotoViewer(delta) {
    if (photoViewer.hidden) return;
    const list = viewerPhotoList();
    if (list.length < 2) return;
    showPhotoViewerAt(photoViewerIndex + delta);
  }

  function closePhotoViewer() {
    if (!photoViewer) return;
    photoViewer.hidden = true;
    photoViewerIndex = -1;
    if (photoViewerImg) {
      photoViewerImg.removeAttribute("src");
      photoViewerImg.alt = "";
    }
  }

  function renderFolderGrid(folderId) {
    folderWindowGrid.innerHTML = "";
    const items = collections[folderId] || [];
    if (!items.length) return;
    const frag = document.createDocumentFragment();
    items.forEach((src) => {
      const fig = document.createElement("figure");
      fig.className = "folder-thumb";
      fig.tabIndex = 0;
      fig.setAttribute("role", "button");
      fig.setAttribute("aria-label", "Open " + photoFileName(src));
      fig.dataset.src = src;
      const img = document.createElement("img");
      img.src = encodeSrc(src);
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      fig.appendChild(img);
      fig.addEventListener("click", (e) => {
        e.stopPropagation();
        openPhotoViewer(src);
      });
      fig.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openPhotoViewer(src);
        }
      });
      frag.appendChild(fig);
    });
    folderWindowGrid.appendChild(frag);
  }

  function openFolderWindow(folderId) {
    if (!folderWindow || !folderId) return;
    openFolderId = folderId;
    if (folderWindowTitle) {
      folderWindowTitle.textContent = folderId === "dog" ? "Dog" : "Cat";
    }
    renderFolderGrid(folderId);
    folderWindow.hidden = false;
    folderWindow.removeAttribute("hidden");
    raiseWindow(folderWindow);
  }

  function closeFolderWindow() {
    folderWindow.hidden = true;
  }

  function addPhotoToFolder(folderId, src) {
    if (!collections[folderId]) return;
    if (collections[folderId].includes(src)) return;
    collections[folderId].push(src);
    if (openFolderId === folderId && !folderWindow.hidden) {
      renderFolderGrid(folderId);
    }
  }

  folderWindowClose.addEventListener("click", (e) => {
    e.stopPropagation();
    closeFolderWindow();
  });
  if (photoViewerClose) {
    photoViewerClose.addEventListener("click", (e) => {
      e.stopPropagation();
      closePhotoViewer();
    });
  }
  if (photoViewerPrev) {
    photoViewerPrev.addEventListener("click", (e) => {
      e.stopPropagation();
      stepPhotoViewer(-1);
    });
  }
  if (photoViewerNext) {
    photoViewerNext.addEventListener("click", (e) => {
      e.stopPropagation();
      stepPhotoViewer(1);
    });
  }
  if (photoViewer) {
    photoViewer.addEventListener("pointerdown", () => raiseWindow(photoViewer));
  }
  if (folderWindow) {
    folderWindow.addEventListener("pointerdown", () => raiseWindow(folderWindow));
  }
  window.addEventListener("keydown", (e) => {
    if (!photoViewer || photoViewer.hidden) return;
    if (e.target && (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT")) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      stepPhotoViewer(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      stepPhotoViewer(1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closePhotoViewer();
    }
  });

  folders.forEach((folder) => {
    if (!folder) return;
    let down = null;
    folder.addEventListener("pointerdown", (e) => {
      if (e.button != null && e.button !== 0) return;
      down = { x: e.clientX, y: e.clientY, id: e.pointerId };
    });
    folder.addEventListener("pointerup", (e) => {
      if (!down || down.id !== e.pointerId) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      down = null;
      if (Math.hypot(dx, dy) > 6) return;
      if (dragging) return;
      const id = folder.dataset.folder;
      if (id) openFolderWindow(id);
    });
    folder.addEventListener("click", (e) => {
      /* Backup open path if pointerup is swallowed */
      if (dragging) return;
      if (e.detail === 0) return;
      const id = folder.dataset.folder;
      if (id && folderWindow && folderWindow.hidden) openFolderWindow(id);
    });
    folder.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const id = folder.dataset.folder;
        if (id) openFolderWindow(id);
      }
    });
  });

  /* --- Drag photos --- */
  function parseTranslate(el) {
    const t = el.style.transform || "";
    const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(t);
    const rot = el.dataset.rot || "0";
    return {
      x: m ? parseFloat(m[1]) : 0,
      y: m ? parseFloat(m[2]) : 0,
      rot: parseFloat(rot),
    };
  }

  function applyTransform(el, x, y, rot) {
    // Photos stay upright — ignore rotation
    el.style.transform = "translate(" + x + "px, " + y + "px)";
    el.dataset.rot = "0";
  }

  function hitFolder(clientX, clientY) {
    for (const folder of folders) {
      const r = folder.getBoundingClientRect();
      const pad = 10;
      if (
        clientX >= r.left - pad &&
        clientX <= r.right + pad &&
        clientY >= r.top - pad &&
        clientY <= r.bottom + pad
      ) {
        return folder;
      }
    }
    return null;
  }

  function clearDropHighlight() {
    folders.forEach((f) => f.classList.remove("is-drop-target"));
  }

  function onPointerDown(e) {
    const photo = e.target.closest(".photo");
    if (!photo || photo.classList.contains("is-gone")) return;
    if (e.button != null && e.button !== 0) return;

    e.preventDefault();
    const { x, y, rot } = parseTranslate(photo);
    /* Raise only within .photos stacking context - never above open windows */
    photoZTop += 1;
    if (photoZTop > 90) photoZTop = 41;
    photo.style.zIndex = String(photoZTop);
    photo.classList.add("is-dragging");
    photo.setPointerCapture?.(e.pointerId);

    dragging = {
      el: photo,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: x,
      originY: y,
      rot,
      moved: false,
    };
  }

  function onPointerMove(e) {
    if (!dragging || dragging.pointerId !== e.pointerId) return;
    /* Photos live in viewport space (not scaled artboard) */
    const dx = e.clientX - dragging.startX;
    const dy = e.clientY - dragging.startY;
    if (Math.hypot(dx, dy) > 4) dragging.moved = true;
    applyTransform(
      dragging.el,
      dragging.originX + dx,
      dragging.originY + dy,
      dragging.rot
    );

    clearDropHighlight();
    const hit = hitFolder(e.clientX, e.clientY);
    if (hit) hit.classList.add("is-drop-target");
  }

  function onPointerUp(e) {
    if (!dragging || dragging.pointerId !== e.pointerId) return;
    const photo = dragging.el;
    const hit = hitFolder(e.clientX, e.clientY);
    photo.classList.remove("is-dragging");
    clearDropHighlight();

    if (hit) {
      const folderId = hit.dataset.folder;
      const src = photo.dataset.src;
      if (folderId && src) addPhotoToFolder(folderId, src);
      photo.classList.add("is-gone");
      photo.remove();
    }

    dragging = null;
  }

  photosEl.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

  /* --- Music --- */
  audio.loop = true;

  async function toggleMusic() {
    try {
      if (audio.paused) {
        await audio.play();
        dockMusic.classList.add("is-playing");
        dockMusic.setAttribute("aria-pressed", "true");
      } else {
        audio.pause();
        dockMusic.classList.remove("is-playing");
        dockMusic.setAttribute("aria-pressed", "false");
      }
    } catch (err) {
      console.warn("Music play blocked or failed:", err);
    }
  }

  dockMusic.addEventListener("click", toggleMusic);

  /* --- Memo (multi-note) --- */
  const MEMO_SEED = [
    {
      id: "note-1",
      titleFixed: false,
      title: "",
      body: MEMO_DEFAULT,
    },
    {
      id: "note-2",
      titleFixed: false,
      title: "",
      body: "웹사이트만들기 워크샵에서\n나를 소개하는 웹사이트 기획 15분 안에 해야하는데..\n하나의 키워드를 골라여\n\n한문장으로 만들어ㄹ바라",
    },
    {
      id: "note-3",
      titleFixed: false,
      title: "",
      body: "12300+4000+5800+6200+7800+12300+30320+3800+21500+52580+700+1100000+4500+17400+27000+28000+11000+4000+17000+3900+16000+34000+22000=452100",
    },
    {
      id: "note-4",
      titleFixed: true,
      title: "새로운 메모",
      body: "추가 텍스트 없음",
    },
    {
      id: "note-5",
      titleFixed: false,
      title: "",
      body: "Fixed Interior  →  Demolish → Rebuild\nModular System → Reconfigure → Reuse",
    },
    {
      id: "note-6",
      titleFixed: false,
      title: "",
      body: "커뮤니케이션팀 템플릿\n\n미팅을 좀 그만해 미친\n\n미팅을 조",
    },
    {
      id: "note-7",
      titleFixed: true,
      title: "Aㄴㅇ",
      body: "Aㄴㅇ",
    },
    {
      id: "note-8",
      titleFixed: false,
      title: "",
      body: "안녕하세요 도무송스티커 팩 상단의 경우 사양에는 없는데 좀 상단에 귀도리 있는 편이 예쁘기도 하고 모서리도 좀 덜 날카로워서 좋을 것 같은데 혹시 의견 어떠실까요?\n\n안녕하세요! 도무송 스티커팩 헤더 관련해 한가지 문의드립니다!\n현재 사양에는 없지만, 상단에 귀도리를 추가하면 예쁘기도 하고 모서리도 좀 덜 날카로울 것 같은데 혹시 의견 어더실까요?\n진행여부 확인해주시면 반영하겠습니다!\n\n안녕하세요! 도무송 스티커팩 헤더 관련해 한 가지 문의드립니다. 현재 사양에는 포함되어 있지 않은데, 상단에 귀도리를 추가하는 방향이 모서리가 좀 덜 날카로울 것 같아 좋을 것 같은데 혹시 어떻게 생각하실까요?\n진행 여부 확인 주시면 반영하겠습니다!",
    },
    {
      id: "note-9",
      titleFixed: false,
      title: "",
      body: "뿌리이자 근간은 70년대 후반 영국, 펑크 문화가 만연했던 켄싱턴 하이 스트릿 속 초라하기 짝이 없는 켄싱턴 마켓뿐이었죠.”라고 말했다. 일반 럭셔리 매장과 극명하게 다른 기로를 택한 도버 스트릿 마켓은 남성복과 여성복에 구분을 두지 않을 만큼 러프한 구성력을 보였고, 잇따라 ‘아름다운 혼돈(Beautiful Chaos)’이라는 별칭이 붙었다. 결코 사람들은 도버 스트릿 마켓의 의도를 곧장 이해하지 못했고, 상향선을 타기까지 장장 5년이란 긴 시간을 거쳐 보냈다. 그럼에도 레이 가와쿠보는 현실과 규범에 타협하려 들지 않으면서 창의성과 사업성 그 중심을 맞추는 데 집중해 세계 각국 매장 및 온라인 스토어(E-SHOP) 경영을 의연하게 다졌다.",
    },
    {
      id: "note-10",
      titleFixed: false,
      title: "",
      body: "Blandit tristique nisl leo non facilisi vivamus sapien posuere. Morbi purus nisl lobortis justo risus leo? Vitae ante duis habitasse mollis platea massa turpis nec mauris; pretium natoque nibh. Euismod eros diam senectus cras velit praesent dolor tellus. Semper fusce scelerisque; mollis est non enim orci faucibus massa. Dictumst feugiat integer lacus dictum pulvinar nibh. Duis magna vulputate blandit pretium malesuada congue purus felis. Ridiculus nisl enim non mollis interdum nibh cursus lacinia elementum pellentesque?\n\nHabitasse congue ipsum iaculis vehicula vehicula euismod fusce fusce sagittis eleifend. Mauris blandit ac ultrices mi netus phasellus proin tellus! Velit venenatis tortor laoreet lorem ipsum lacus curabitur donec aliquam. Integer elit enim imperdiet odio leo sit. Tristique leo tellus nam lacinia ac cras vestibulum etiam. Est donec blandit adipiscing habitant rhoncus suscipit.\n\nLibero maecenas imperdiet adipiscing pellentesque velit, sodales arcu lacus augue lacus fringilla. Platea imperdiet risus metus nunc et dictum lorem tempus habitant. Curabitur phasellus pulvinar consequat ac platea elit massa ullamcorper pharetra. Nibh eleifend porttitor nunc cursus nibh erat quam lacinia pretium in tempor.",
    },
    {
      id: "note-11",
      titleFixed: false,
      title: "",
      body: "안녕하세요, 연휴 중에 죄송합니다. 확인차 몇 가지 여쭙습니다.",
    },
  ];

  let memoNotes = [];
  let memoActiveId = null;

  function memoTitleFromBody(text) {
    const firstLine = String(text || "")
      .split(/\r?\n/, 1)[0]
      .replace(/^\s+|\s+$/g, "");
    return firstLine || MEMO_TITLE_EMPTY;
  }

  function noteDisplayTitle(note) {
    if (note.titleFixed && note.title) return note.title;
    return memoTitleFromBody(note.body);
  }

  function defaultMemoState() {
    return {
      notes: MEMO_SEED.map((n) => ({
        id: n.id,
        titleFixed: !!n.titleFixed,
        title: n.title || "",
        body: n.body,
      })),
      activeId: MEMO_SEED[0].id,
    };
  }

  function loadMemoStore() {
    try {
      const raw = localStorage.getItem(MEMO_STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.notes) && parsed.notes.length) {
          memoNotes = parsed.notes.map((n) => ({
            id: String(n.id),
            titleFixed: !!n.titleFixed,
            title: String(n.title || ""),
            body: String(n.body != null ? n.body : ""),
          }));
          memoActiveId =
            parsed.activeId && memoNotes.some((n) => n.id === parsed.activeId)
              ? parsed.activeId
              : memoNotes[0].id;
          return;
        }
      }
      const legacy = localStorage.getItem(MEMO_KEY);
      const state = defaultMemoState();
      if (legacy != null && legacy !== "") {
        state.notes[0].body = legacy;
      }
      memoNotes = state.notes;
      memoActiveId = state.activeId;
      persistMemoStore();
    } catch {
      const state = defaultMemoState();
      memoNotes = state.notes;
      memoActiveId = state.activeId;
    }
  }

  function persistMemoStore() {
    try {
      localStorage.setItem(
        MEMO_STORE_KEY,
        JSON.stringify({ notes: memoNotes, activeId: memoActiveId })
      );
    } catch {
      /* ignore */
    }
  }

  function getActiveNote() {
    return memoNotes.find((n) => n.id === memoActiveId) || memoNotes[0] || null;
  }

  function renderMemoSidebar() {
    const list = document.getElementById("memo-sidebar-list") || memoSidebarList;
    if (!list) return;
    list.innerHTML = "";
    const frag = document.createDocumentFragment();
    memoNotes.forEach((note) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "memo-sidebar-item" + (note.id === memoActiveId ? " is-active" : "");
      btn.setAttribute("data-note-id", note.id);
      const label = noteDisplayTitle(note);
      btn.textContent = label;
      btn.title = label;
      frag.appendChild(btn);
    });
    list.appendChild(frag);
  }

  function applyActiveNoteToEditor() {
    const note = getActiveNote();
    if (!note) {
      memoBody.value = "";
      return;
    }
    memoBody.value = note.body;
  }

  function commitEditorToActiveNote() {
    const note = getActiveNote();
    if (!note) return;
    note.body = memoBody.value;
    if (!note.titleFixed) {
      note.title = memoTitleFromBody(note.body);
    }
  }

  function selectMemoNote(id) {
    if (!id) return;
    if (id !== memoActiveId) {
      commitEditorToActiveNote();
      memoActiveId = id;
    }
    applyActiveNoteToEditor();
    renderMemoSidebar();
    persistMemoStore();
    memoBody.focus();
  }

  function loadMemo() {
    loadMemoStore();
    applyActiveNoteToEditor();
    renderMemoSidebar();
  }

  function saveMemo() {
    commitEditorToActiveNote();
    persistMemoStore();
    renderMemoSidebar();
  }

  function openMemo() {
    try {
      loadMemo();
    } catch (err) {
      console.warn("loadMemo failed:", err);
    }
    memoWindow.hidden = false;
    memoWindow.removeAttribute("hidden");
    raiseWindow(memoWindow);
    try {
      memoBody.focus();
    } catch (_) {}
  }

  function closeMemo() {
    saveMemo();
    memoWindow.hidden = true;
  }

  function createNewMemo() {
    commitEditorToActiveNote();
    const id = "note-" + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);
    const note = {
      id: id,
      titleFixed: true,
      title: "새로운 메모",
      body: "",
    };
    memoNotes.unshift(note);
    memoActiveId = id;
    applyActiveNoteToEditor();
    renderMemoSidebar();
    persistMemoStore();
    try {
      memoBody.focus();
    } catch (_) {}
  }

  if (dockMemo) {
    dockMemo.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (memoWindow.hidden || memoWindow.hasAttribute("hidden")) openMemo();
      else {
        raiseWindow(memoWindow);
        try { memoBody.focus(); } catch (_) {}
      }
    });
  }
  if (memoClose) memoClose.addEventListener("click", closeMemo);
  if (memoNewBtn) {
    memoNewBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (memoWindow.hidden) openMemo();
      createNewMemo();
      raiseWindow(memoWindow);
    });
  }
  if (memoWindow) {
    memoWindow.addEventListener("pointerdown", () => raiseWindow(memoWindow));
  }
  if (memoSidebarList) {
    memoSidebarList.addEventListener("click", (e) => {
      const btn = e.target.closest(".memo-sidebar-item");
      if (!btn || !memoSidebarList.contains(btn)) return;
      e.preventDefault();
      e.stopPropagation();
      const id = btn.getAttribute("data-note-id");
      if (id) selectMemoNote(id);
    });
  }
  if (memoBody) {
    memoBody.addEventListener("input", () => {
      saveMemo();
    });
  }

  let winDrag = null;
  function clientToArtboard(clientX, clientY) {
    const r = desktopEl.getBoundingClientRect();
    const s = artboardScale() || 1;
    return {
      x: (clientX - r.left) / s,
      y: (clientY - r.top) / s,
    };
  }

  function beginWindowDrag(winEl, handleEl, e, ignoreSel) {
    if (!winEl || winEl.hidden) return;
    if (ignoreSel && e.target.closest(ignoreSel)) return;
    if (e.button != null && e.button !== 0) return;
    raiseWindow(winEl);
    const rect = winEl.getBoundingClientRect();
    const tl = clientToArtboard(rect.left, rect.top);
    const pt = clientToArtboard(e.clientX, e.clientY);
    winEl.style.left = tl.x + "px";
    winEl.style.top = tl.y + "px";
    winEl.style.transform = "none";
    winEl.dataset.placed = "1";
    winEl.classList.add("is-dragging");
    winDrag = {
      el: winEl,
      pointerId: e.pointerId,
      ox: pt.x - tl.x,
      oy: pt.y - tl.y,
    };
    handleEl.setPointerCapture?.(e.pointerId);
  }

  if (memoTitlebar) {
    memoTitlebar.addEventListener("pointerdown", (e) => {
      beginWindowDrag(
        memoWindow,
        memoTitlebar,
        e,
        ".memo-close, .memo-new, .memo-sidebar-item, .memo-body"
      );
    });
  }
  const folderTitlebar = folderWindow && folderWindow.querySelector(".folder-window-titlebar");
  if (folderTitlebar) {
    folderTitlebar.addEventListener("pointerdown", (e) => {
      beginWindowDrag(folderWindow, folderTitlebar, e, ".folder-window-x");
    });
  }
  const viewerTitlebar = photoViewer && photoViewer.querySelector(".folder-window-titlebar");
  if (viewerTitlebar) {
    viewerTitlebar.addEventListener("pointerdown", (e) => {
      beginWindowDrag(photoViewer, viewerTitlebar, e, ".folder-window-x");
    });
  }
  window.addEventListener("pointermove", (e) => {
    if (!winDrag || winDrag.pointerId !== e.pointerId) return;
    const pt = clientToArtboard(e.clientX, e.clientY);
    winDrag.el.style.left = pt.x - winDrag.ox + "px";
    winDrag.el.style.top = pt.y - winDrag.oy + "px";
  });
  window.addEventListener("pointerup", (e) => {
    if (winDrag && winDrag.pointerId === e.pointerId) {
      winDrag.el.classList.remove("is-dragging");
      winDrag = null;
    }
  });

  loadMemo();
})();