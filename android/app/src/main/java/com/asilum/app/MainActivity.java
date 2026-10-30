package com.asilum.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

/**
 * The shell: Capacitor's BridgeActivity loading the live site (capacitor.config.json server.url), plus the one
 * thing Capacitor leaves to a plugin — an APP LINK (a https link to the site's own host, the intent-filter in
 * AndroidManifest.xml) opens THAT page in the WebView, on a cold start or a warm one, instead of the Feed.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        openSiteLink(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        openSiteLink(intent);
    }

    /** Loads a VIEW intent's https URL when its host is the site's; any other link is left to Capacitor. */
    private void openSiteLink(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return;
        Uri url = intent.getData();
        if (url == null || !"https".equals(url.getScheme()) || url.getHost() == null) return;
        if (getBridge() == null || getBridge().getServerUrl() == null) return;
        Uri site = Uri.parse(getBridge().getServerUrl());
        if (site.getHost() == null || !site.getHost().equalsIgnoreCase(url.getHost())) return;
        getBridge().getWebView().loadUrl(url.toString());
    }
}
