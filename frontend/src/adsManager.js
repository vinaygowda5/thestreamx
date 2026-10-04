// Real Google video ads - the official Google IMA HTML5 SDK talking to
// Google Ad Manager. Nothing here is simulated: no fake timers, no fake
// "Advertisement" screens. See:
// https://developers.google.com/interactive-media-ads/docs/sdks/html5

const IMA_SDK_URL = "https://imasdk.googleapis.com/js/sdkloader/ima3.js";

// Google's own official public sample VAST tag - meant exactly for
// testing an IMA integration before a real Ad Manager account/line items
// exist. Used automatically whenever VITE_GOOGLE_IMA_AD_TAG isn't set, so
// the pipeline is always testable, and the real tag only comes from the
// env var - never hardcoded here, never mixed with AdSense.
export const TEST_AD_TAG_URL =
  "https://pubads.g.doubleclick.net/gampad/ads?iu=/21775744923/external/single_ad_samples&sz=640x480&cust_params=sample_ct%3Dlinear&ciu_szs=300x250%2C728x90&gdfp_req=1&output=vast&unviewed_position_start=1&env=vp&impl=s&correlator=";

const CONFIGURED_TAG = import.meta.env.VITE_GOOGLE_IMA_AD_TAG;
export const AD_TAG_URL = CONFIGURED_TAG && CONFIGURED_TAG.trim() ? CONFIGURED_TAG.trim() : TEST_AD_TAG_URL;
export const IS_TEST_AD_TAG = AD_TAG_URL === TEST_AD_TAG_URL;

let imaScriptPromise = null;
function loadImaSdk() {
  if (window.google?.ima) return Promise.resolve();
  if (imaScriptPromise) return imaScriptPromise;
  imaScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = IMA_SDK_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { imaScriptPromise = null; reject(new Error("Could not load Google IMA SDK")); };
    document.head.appendChild(script);
  });
  return imaScriptPromise;
}

// Turns real content metadata into IMA custom targeting key-values. The
// player never picks which ad plays - it only forwards these; the actual
// ad-selection rules live in Google Ad Manager's line-item targeting,
// configured on Google's side, not in this code. No per-language branches
// here on purpose.
function buildCustomParamsSuffix(content) {
  const params = {};
  if (content?.language) params.content_language = content.language;
  if (content?.genre)    params.content_genre    = content.genre;
  if (content?.type)     params.content_type     = content.type;
  if (content?.id)       params.content_id       = String(content.id);
  const entries = Object.entries(params);
  if (entries.length === 0) return "";
  return entries.map(([k, v]) => `${encodeURIComponent(k)}%3D${encodeURIComponent(v)}`).join("%26");
}

function withTargeting(url, content) {
  const cust = buildCustomParamsSuffix(content);
  if (!cust) return url;
  if (url.includes("cust_params=")) return `${url}%26${cust}`;
  return `${url}${url.includes("?") ? "&" : "?"}cust_params=${cust}`;
}

// One ImaAdController per player mount. Create it once (e.g. in a ref),
// call requestAds() per ad break, and always call destroy() when the
// content changes or the component unmounts - that's what prevents
// duplicate AdsLoader instances, duplicate listeners, and stale
// AdsManager objects across video changes/navigation.
export class ImaAdController {
  constructor({ videoEl, adContainerEl, onEvent }) {
    this.videoEl = videoEl;
    this.adContainerEl = adContainerEl;
    this.onEvent = onEvent || (() => {});
    this.adsLoader = null;
    this.adsManager = null;
    this.adDisplayContainer = null;
    this.destroyed = false;

    this._resizeHandler = () => {
      if (!this.adsManager || this.destroyed || !window.google?.ima) return;
      try {
        this.adsManager.resize(this.videoEl.clientWidth, this.videoEl.clientHeight, window.google.ima.ViewMode.NORMAL);
      } catch (e) {}
    };
    window.addEventListener("resize", this._resizeHandler);
  }

  // Call this synchronously from inside the user's Play tap wherever
  // possible - ad playback permissions follow the same browser autoplay-
  // gesture rules as a normal <video>. Never called automatically on page
  // load without a user action.
  async requestAds(content) {
    if (this.destroyed) return;
    let ima;
    try {
      await loadImaSdk();
      ima = window.google.ima;
    } catch (err) {
      this.onEvent("AD_ERROR", err);
      return;
    }
    if (this.destroyed) return;

    if (!this.adDisplayContainer) {
      this.adDisplayContainer = new ima.AdDisplayContainer(this.adContainerEl, this.videoEl);
    }
    this.adDisplayContainer.initialize();

    if (this.adsLoader) { try { this.adsLoader.destroy(); } catch (e) {} }
    this.adsLoader = new ima.AdsLoader(this.adDisplayContainer);

    this.adsLoader.addEventListener(ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, (e) => this._onAdsManagerLoaded(e, ima), false);
    this.adsLoader.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, (err) => {
      this.onEvent("AD_ERROR", err);
      this._cleanupManager();
    }, false);

    const adsRequest = new ima.AdsRequest();
    adsRequest.adTagUrl = withTargeting(AD_TAG_URL, content);
    const w = this.videoEl.clientWidth || 640, h = this.videoEl.clientHeight || 360;
    adsRequest.linearAdSlotWidth = w;
    adsRequest.linearAdSlotHeight = h;
    adsRequest.nonLinearAdSlotWidth = w;
    adsRequest.nonLinearAdSlotHeight = Math.round(h * 0.25);

    this.adsLoader.requestAds(adsRequest);
  }

  _onAdsManagerLoaded(adsManagerLoadedEvent, ima) {
    if (this.destroyed) return;
    this.adsManager = adsManagerLoadedEvent.getAdsManager(this.videoEl);

    const EventType = ima.AdEvent.Type;
    const events = [
      "CONTENT_PAUSE_REQUESTED", "CONTENT_RESUME_REQUESTED",
      "STARTED", "FIRST_QUARTILE", "MIDPOINT", "THIRD_QUARTILE", "COMPLETE",
      "SKIPPED", "PAUSED", "RESUMED", "CLICK", "ALL_ADS_COMPLETED",
    ];
    events.forEach((name) => {
      if (!EventType[name]) return;
      this.adsManager.addEventListener(EventType[name], (e) => {
        this.onEvent(name, e);
        if (name === "ALL_ADS_COMPLETED") this._cleanupManager();
      });
    });

    this.adsManager.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, (err) => {
      this.onEvent("AD_ERROR", err);
      this._cleanupManager();
    });

    try {
      const w = this.videoEl.clientWidth || 640, h = this.videoEl.clientHeight || 360;
      this.adsManager.init(w, h, ima.ViewMode.NORMAL);
      this.adsManager.start();
    } catch (err) {
      this.onEvent("AD_ERROR", err);
      this._cleanupManager();
    }
  }

  // Call when your own content finishes playing, so a post-roll (if one
  // is configured in Ad Manager) has the chance to run.
  notifyContentComplete() {
    if (this.adsLoader && !this.destroyed) {
      try { this.adsLoader.contentComplete(); } catch (e) {}
    }
  }

  _cleanupManager() {
    if (this.adsManager) {
      try { this.adsManager.destroy(); } catch (e) {}
      this.adsManager = null;
    }
  }

  // Full teardown. Call this on content change (new video id) and on
  // component unmount - not just on ad completion - so nothing stale
  // survives into the next video.
  destroy() {
    this.destroyed = true;
    window.removeEventListener("resize", this._resizeHandler);
    this._cleanupManager();
    if (this.adsLoader) { try { this.adsLoader.destroy(); } catch (e) {} this.adsLoader = null; }
    this.adDisplayContainer = null;
  }
}