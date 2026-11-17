// tells the Between the Lines page that this extension is installed (and which version), so it doesn't suggest adding it
document.documentElement.dataset.btlExt = chrome.runtime.getManifest().version;
